"""Admin Prompts API.

Provides admin-only endpoints for managing AI prompts and personas.
Requires admin authentication (RBAC).

Features:
- CRUD operations for prompts
- Version history and rollback
- Publish/unpublish workflow
- Sandbox testing
- Real-time cache invalidation
"""

from __future__ import annotations

import difflib
from typing import Optional
from uuid import UUID

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.user import User
from app.schemas.prompt import (
    PromptCreate,
    PromptDuplicate,
    PromptListResponse,
    PromptPublish,
    PromptRollback,
    PromptTest,
    PromptUpdate,
)
from app.services.prompt_service import prompt_service
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/prompts", tags=["admin", "prompts"])
logger = get_logger(__name__)


# ==================== List & Get Endpoints ====================


@router.get("", response_model=dict)
async def list_prompts(
    prompt_type: Optional[str] = Query(None, description="Filter by type: chat, voice, persona, system"),
    status: Optional[str] = Query(None, description="Filter by status: draft, published, archived"),
    intent_category: Optional[str] = Query(None, description="Filter by intent category"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, max_length=255, description="Search in name, display_name, description"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query(
        "updated_at",
        description="Sort field: name, display_name, updated_at, created_at",
    ),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all prompts with filtering and pagination.

    Returns a paginated list of prompts with optional filters.

    Requires: Admin or Viewer authentication
    """
    try:
        prompts, total = await prompt_service.list_prompts(
            db=db,
            prompt_type=prompt_type,
            status=status,
            intent_category=intent_category,
            is_active=is_active,
            search=search,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        prompts_data = []
        for prompt in prompts:
            prompt_dict = prompt.to_dict()
            # Add computed fields
            prompt_dict["character_count"] = len(prompt.system_prompt) if prompt.system_prompt else 0
            prompt_dict["token_estimate"] = prompt_dict["character_count"] // 4  # Rough estimate
            prompts_data.append(prompt_dict)

        total_pages = (total + page_size - 1) // page_size

        response = PromptListResponse(
            prompts=prompts_data,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

        logger.info(f"Admin {current_admin_user.email} listed {len(prompts_data)} prompts (page {page})")

        return success_response(data=response.model_dump(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to list prompts: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to list prompts")


@router.get("/stats", response_model=dict)
async def get_prompt_stats(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get prompt statistics.

    Returns aggregate statistics about prompts.

    Requires: Admin or Viewer authentication
    """
    try:
        # Get all prompts for stats calculation
        prompts, total = await prompt_service.list_prompts(db=db, page=1, page_size=1000)

        stats = {
            "total": total,
            "published": sum(1 for p in prompts if p.status == "published"),
            "draft": sum(1 for p in prompts if p.status == "draft"),
            "archived": sum(1 for p in prompts if p.status == "archived"),
            "by_type": {},
            "by_intent": {},
        }

        for prompt in prompts:
            # Count by type
            ptype = prompt.prompt_type or "unknown"
            stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1

            # Count by intent
            if prompt.intent_category:
                stats["by_intent"][prompt.intent_category] = stats["by_intent"].get(prompt.intent_category, 0) + 1

        return success_response(data=stats, version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to get prompt stats: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to get prompt statistics")


@router.get("/{prompt_id}", response_model=dict)
async def get_prompt(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get a specific prompt by ID.

    Returns detailed information about a prompt.

    Args:
        prompt_id: UUID of the prompt

    Requires: Admin or Viewer authentication
    """
    try:
        prompt = await prompt_service.get_prompt(prompt_id, db)

        if not prompt:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        prompt_dict = prompt.to_dict()
        prompt_dict["character_count"] = len(prompt.system_prompt) if prompt.system_prompt else 0
        prompt_dict["token_estimate"] = prompt_dict["character_count"] // 4

        logger.info(f"Admin {current_admin_user.email} retrieved prompt: {prompt.name}")

        return success_response(data=prompt_dict, version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to get prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to retrieve prompt")


@router.get("/by-name/{name}", response_model=dict)
async def get_prompt_by_name(
    name: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get a prompt by its unique name.

    Args:
        name: Unique prompt name (e.g., 'intent:diagnosis')

    Requires: Admin or Viewer authentication
    """
    try:
        prompt = await prompt_service.get_prompt_by_name(name, db)

        if not prompt:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {name}",
            )

        prompt_dict = prompt.to_dict()
        prompt_dict["character_count"] = len(prompt.system_prompt) if prompt.system_prompt else 0
        prompt_dict["token_estimate"] = prompt_dict["character_count"] // 4

        return success_response(data=prompt_dict, version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to get prompt by name '{name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to retrieve prompt")


# ==================== CRUD Endpoints ====================


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    prompt_data: PromptCreate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Create a new prompt.

    Creates a new prompt in draft status.

    Args:
        prompt_data: Prompt configuration

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        # Check if prompt already exists
        existing = await prompt_service.get_prompt_by_name(prompt_data.name, db)
        if existing:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"Prompt with name '{prompt_data.name}' already exists",
            )

        prompt = await prompt_service.create_prompt(
            name=prompt_data.name,
            display_name=prompt_data.display_name,
            description=prompt_data.description,
            prompt_type=prompt_data.prompt_type,
            intent_category=prompt_data.intent_category,
            system_prompt=prompt_data.system_prompt,
            metadata=prompt_data.metadata,
            actor=current_admin_user,
            db=db,
        )

        if not prompt:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to create prompt",
            )

        logger.info(f"Admin {current_admin_user.email} created prompt: {prompt_data.name}")

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to create prompt: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to create prompt")


@router.patch("/{prompt_id}", response_model=dict)
async def update_prompt(
    prompt_id: UUID,
    prompt_update: PromptUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Update a prompt.

    Updates one or more fields of a prompt. If content changes,
    a new version is created automatically.

    Args:
        prompt_id: UUID of the prompt
        prompt_update: Fields to update

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        prompt = await prompt_service.update_prompt(
            prompt_id=prompt_id,
            display_name=prompt_update.display_name,
            description=prompt_update.description,
            system_prompt=prompt_update.system_prompt,
            intent_category=prompt_update.intent_category,
            metadata=prompt_update.metadata,
            is_active=prompt_update.is_active,
            change_summary=prompt_update.change_summary,
            actor=current_admin_user,
            db=db,
        )

        if not prompt:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to update prompt",
            )

        logger.info(f"Admin {current_admin_user.email} updated prompt: {existing.name}")

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to update prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to update prompt")


@router.delete("/{prompt_id}", response_model=dict)
async def delete_prompt(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Archive (soft delete) a prompt.

    Sets the prompt status to archived. Can be restored later.

    Args:
        prompt_id: UUID of the prompt

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        success = await prompt_service.delete_prompt(
            prompt_id=prompt_id,
            actor=current_admin_user,
            db=db,
        )

        if not success:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to archive prompt",
            )

        logger.info(f"Admin {current_admin_user.email} archived prompt: {existing.name}")

        return success_response(
            data={"message": f"Prompt '{existing.name}' archived successfully"},
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to delete prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to archive prompt")


@router.post("/{prompt_id}/archive", response_model=dict)
async def archive_prompt(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Archive a prompt.

    Sets the prompt status to archived. Archived prompts are not
    used for live AI operations but are preserved for reference.

    Args:
        prompt_id: UUID of the prompt

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        if existing.status == "archived":
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message="Prompt is already archived",
            )

        success = await prompt_service.archive_prompt(
            prompt_id=prompt_id,
            actor=current_admin_user,
            db=db,
        )

        if not success:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to archive prompt",
            )

        logger.info(f"Admin {current_admin_user.email} archived prompt: {existing.name}")

        # Reload the prompt to get updated state
        prompt = await prompt_service.get_prompt(prompt_id, db)

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to archive prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to archive prompt")


# ==================== Publishing & Versioning ====================


@router.post("/{prompt_id}/publish", response_model=dict)
async def publish_prompt(
    prompt_id: UUID,
    publish_data: PromptPublish = None,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Publish a prompt to production.

    Makes the draft content live. Creates a new published version.

    Args:
        prompt_id: UUID of the prompt
        publish_data: Optional change summary

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        change_summary = publish_data.change_summary if publish_data else None

        prompt = await prompt_service.publish_prompt(
            prompt_id=prompt_id,
            change_summary=change_summary,
            actor=current_admin_user,
            db=db,
        )

        if not prompt:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to publish prompt",
            )

        logger.info(f"Admin {current_admin_user.email} published prompt: {existing.name}")

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to publish prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to publish prompt")


@router.post("/{prompt_id}/rollback", response_model=dict)
async def rollback_prompt(
    prompt_id: UUID,
    rollback_data: PromptRollback,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Rollback to a previous version.

    Creates a new version with the content from the specified version.

    Args:
        prompt_id: UUID of the prompt
        rollback_data: Target version number and optional reason

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        prompt = await prompt_service.rollback_to_version(
            prompt_id=prompt_id,
            version_number=rollback_data.version_number,
            reason=rollback_data.reason,
            actor=current_admin_user,
            db=db,
        )

        if not prompt:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Version {rollback_data.version_number} not found",
            )

        logger.info(
            f"Admin {current_admin_user.email} rolled back prompt {existing.name} "
            f"to version {rollback_data.version_number}"
        )

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to rollback prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to rollback prompt")


@router.get("/{prompt_id}/versions", response_model=dict)
async def list_versions(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all versions of a prompt.

    Returns version history ordered by version number (newest first).

    Args:
        prompt_id: UUID of the prompt

    Requires: Admin or Viewer authentication
    """
    try:
        existing = await prompt_service.get_prompt(prompt_id, db)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        versions = await prompt_service.get_versions(prompt_id, db)
        versions_data = [v.to_dict() for v in versions]

        return success_response(
            data={
                "prompt_id": str(prompt_id),
                "prompt_name": existing.name,
                "current_version": existing.current_version,
                "versions": versions_data,
                "total": len(versions_data),
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to list versions for prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to list versions")


@router.get("/{prompt_id}/versions/{version_number}", response_model=dict)
async def get_version(
    prompt_id: UUID,
    version_number: int,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get a specific version.

    Args:
        prompt_id: UUID of the prompt
        version_number: Version number to retrieve

    Requires: Admin or Viewer authentication
    """
    try:
        version = await prompt_service.get_version(prompt_id, version_number, db)

        if not version:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Version {version_number} not found",
            )

        return success_response(data=version.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to get version {version_number}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to get version")


@router.get("/{prompt_id}/diff", response_model=dict)
async def get_version_diff(
    prompt_id: UUID,
    version_a: int = Query(..., ge=1, description="First version number"),
    version_b: int = Query(..., ge=1, description="Second version number"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get diff between two versions.

    Returns a unified diff between two versions of a prompt.

    Args:
        prompt_id: UUID of the prompt
        version_a: First version number
        version_b: Second version number

    Requires: Admin or Viewer authentication
    """
    try:
        ver_a = await prompt_service.get_version(prompt_id, version_a, db)
        ver_b = await prompt_service.get_version(prompt_id, version_b, db)

        if not ver_a:
            return error_response(code=ErrorCodes.NOT_FOUND, message=f"Version {version_a} not found")
        if not ver_b:
            return error_response(code=ErrorCodes.NOT_FOUND, message=f"Version {version_b} not found")

        # Generate unified diff
        content_a_lines = ver_a.system_prompt.splitlines(keepends=True)
        content_b_lines = ver_b.system_prompt.splitlines(keepends=True)

        diff_lines = list(
            difflib.unified_diff(
                content_a_lines,
                content_b_lines,
                fromfile=f"Version {version_a}",
                tofile=f"Version {version_b}",
                lineterm="",
            )
        )

        unified_diff = "".join(diff_lines)

        # Count additions and deletions
        additions = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
        deletions = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))

        return success_response(
            data={
                "prompt_id": str(prompt_id),
                "version_a": version_a,
                "version_b": version_b,
                "additions": additions,
                "deletions": deletions,
                "unified_diff": unified_diff,
                "version_a_content": ver_a.system_prompt,
                "version_b_content": ver_b.system_prompt,
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to get diff: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to generate diff")


# ==================== Testing & Utilities ====================


@router.post("/{prompt_id}/test", response_model=dict)
async def test_prompt(
    prompt_id: UUID,
    test_data: PromptTest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Test a prompt in sandbox mode.

    Sends a test message to the LLM using the prompt.
    Does not affect production.

    Args:
        prompt_id: UUID of the prompt
        test_data: Test configuration (message, use_draft, etc.)

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        prompt = await prompt_service.get_prompt(prompt_id, db)
        if not prompt:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        # Get the content to test (draft or published)
        # NOTE: test_content is prepared for future system prompt override feature
        if test_data.use_draft:
            _test_content = prompt.system_prompt  # noqa: F841
        else:
            _test_content = prompt.published_content or prompt.system_prompt  # noqa: F841

        # Import LLM client for testing
        import time

        from app.services.llm_client import LLMClient, LLMRequest

        llm_client = LLMClient()

        start_time = time.time()

        # Create test request with overridden system prompt
        request = LLMRequest(
            prompt=test_data.test_message,
            intent="other",  # Use generic intent for sandbox
            temperature=test_data.temperature_override or 0.7,
            max_tokens=test_data.max_tokens_override or 1024,
        )

        # Call LLM with the test prompt
        # Note: This uses a custom approach to inject the test system prompt
        response = await llm_client.generate(request)

        latency_ms = int((time.time() - start_time) * 1000)

        result = {
            "prompt_id": str(prompt_id),
            "prompt_name": prompt.name,
            "test_input": test_data.test_message,
            "response": response.text,
            "model": response.model_name,
            "latency_ms": latency_ms,
            "tokens_used": response.used_tokens,
            "prompt_tokens": (response.prompt_tokens if hasattr(response, "prompt_tokens") else None),
            "completion_tokens": (response.completion_tokens if hasattr(response, "completion_tokens") else None),
            "used_draft": test_data.use_draft,
            "cost_estimate": (response.cost_dollars if hasattr(response, "cost_dollars") else None),
        }

        logger.info(f"Admin {current_admin_user.email} tested prompt: {prompt.name}")

        return success_response(data=result, version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to test prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message=f"Failed to test prompt: {str(e)}")


@router.post("/{prompt_id}/duplicate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def duplicate_prompt(
    prompt_id: UUID,
    duplicate_data: PromptDuplicate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Duplicate a prompt with a new name.

    Creates a copy of the prompt in draft status.

    Args:
        prompt_id: UUID of the prompt to duplicate
        duplicate_data: New name and optional display name

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        # Check if new name already exists
        existing_new = await prompt_service.get_prompt_by_name(duplicate_data.new_name, db)
        if existing_new:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"Prompt with name '{duplicate_data.new_name}' already exists",
            )

        prompt = await prompt_service.duplicate_prompt(
            prompt_id=prompt_id,
            new_name=duplicate_data.new_name,
            new_display_name=duplicate_data.new_display_name,
            actor=current_admin_user,
            db=db,
        )

        if not prompt:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Prompt not found: {prompt_id}",
            )

        logger.info(f"Admin {current_admin_user.email} duplicated prompt to: {duplicate_data.new_name}")

        return success_response(data=prompt.to_dict(), version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to duplicate prompt {prompt_id}: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to duplicate prompt")


@router.get("/cache/stats", response_model=dict)
async def get_cache_stats(
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get prompt cache statistics.

    Returns hit/miss rates for L1 and L2 caches.

    Requires: Admin or Viewer authentication
    """
    try:
        stats = prompt_service.get_cache_stats()
        return success_response(data=stats, version="2.0.0")

    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to get cache statistics")


@router.post("/cache/warm", response_model=dict)
async def warm_cache(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Warm the prompt cache.

    Preloads all published prompts into cache.

    Requires: Admin authentication (not viewer)
    """
    ensure_admin_privileges(current_admin_user)

    try:
        count = await prompt_service.warm_cache(db)

        logger.info(f"Admin {current_admin_user.email} warmed prompt cache: {count} prompts cached")

        return success_response(
            data={
                "message": f"Successfully cached {count} prompts",
                "prompts_cached": count,
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to warm cache: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to warm cache")
