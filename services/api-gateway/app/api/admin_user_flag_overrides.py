"""Admin User Flag Overrides API (Phase 4).

Provides admin endpoints for managing per-user feature flag overrides.
Enables:
- Beta testing with select users
- Debugging with forced flag states
- Personalized feature experiences

Requires admin authentication (RBAC).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.user import User
from app.services.user_flag_override_service import user_flag_override_service
from fastapi import APIRouter, Depends, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "feature-flags", "user-overrides"])
logger = get_logger(__name__)


# Request/Response Models


class UserOverrideCreate(BaseModel):
    """Request model for creating a user flag override."""

    flag_name: str = Field(..., description="Feature flag name to override", max_length=255)
    value: Any = Field(..., description="Override value (JSON-serializable)")
    enabled: bool = Field(default=True, description="Whether override is active")
    reason: Optional[str] = Field(default=None, description="Audit reason for override", max_length=500)
    expires_at: Optional[datetime] = Field(default=None, description="Optional expiration datetime")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class UserOverrideUpdate(BaseModel):
    """Request model for updating a user flag override."""

    value: Optional[Any] = Field(default=None, description="New override value")
    enabled: Optional[bool] = Field(default=None, description="New enabled state")
    reason: Optional[str] = Field(default=None, description="Updated reason", max_length=500)
    expires_at: Optional[datetime] = Field(default=None, description="New expiration datetime")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Updated metadata")


class UserOverrideResponse(BaseModel):
    """Response model for a user flag override."""

    id: str
    user_id: str
    flag_name: str
    value: Any
    enabled: bool
    reason: Optional[str]
    created_by: Optional[str]
    created_at: str
    updated_at: str
    expires_at: Optional[str]
    metadata: Optional[Dict[str, Any]]


class UserOverrideListResponse(BaseModel):
    """Response model for listing user overrides."""

    overrides: List[UserOverrideResponse]
    total: int


# User-centric endpoints


@router.get("/users/{user_id}/flag-overrides", response_model=None)
async def list_user_overrides(
    user_id: UUID = Path(..., description="User ID"),
    include_expired: bool = Query(False, description="Include expired overrides"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all flag overrides for a specific user.

    Returns all feature flag overrides for the given user,
    optionally including expired ones.

    Requires: Admin or Viewer authentication
    """
    try:
        overrides = await user_flag_override_service.get_user_overrides(
            user_id=user_id,
            db=db,
            include_expired=include_expired,
        )

        # Convert to list format
        override_list = list(overrides.values())

        logger.info(f"Admin {current_admin_user.email} listed {len(override_list)} overrides for user {user_id}")

        return success_response(
            data={
                "overrides": override_list,
                "total": len(override_list),
                "user_id": str(user_id),
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to list user overrides: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list user overrides",
        )


@router.post("/users/{user_id}/flag-overrides", status_code=status.HTTP_201_CREATED, response_model=None)
async def create_user_override(
    user_id: UUID = Path(..., description="User ID"),
    override: UserOverrideCreate = ...,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Create a new flag override for a user.

    Creates a per-user override for a specific feature flag.
    If an override already exists, it will be updated.

    Requires: Admin authentication (not Viewer)
    """
    ensure_admin_privileges(current_admin_user)
    try:
        result = await user_flag_override_service.set_override(
            user_id=user_id,
            flag_name=override.flag_name,
            value=override.value,
            created_by=current_admin_user.email,
            enabled=override.enabled,
            reason=override.reason,
            expires_at=override.expires_at,
            metadata=override.metadata,
            db=db,
        )

        logger.info(
            f"Admin {current_admin_user.email} created override for user {user_id}, " f"flag {override.flag_name}"
        )

        return success_response(data=result, version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to create user override: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to create user override",
        )


@router.get("/users/{user_id}/flag-overrides/{flag_name}", response_model=None)
async def get_user_override(
    user_id: UUID = Path(..., description="User ID"),
    flag_name: str = Path(..., description="Feature flag name"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get a specific override for a user and flag.

    Returns the override details if it exists.

    Requires: Admin or Viewer authentication
    """
    try:
        override = await user_flag_override_service.get_override(
            user_id=user_id,
            flag_name=flag_name,
            db=db,
        )

        if not override:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"No override found for user {user_id} and flag {flag_name}",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        logger.info(f"Admin {current_admin_user.email} retrieved override for user {user_id}, " f"flag {flag_name}")

        return success_response(data=override, version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to get user override: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get user override",
        )


@router.patch("/users/{user_id}/flag-overrides/{flag_name}", response_model=None)
async def update_user_override(
    user_id: UUID = Path(..., description="User ID"),
    flag_name: str = Path(..., description="Feature flag name"),
    update: UserOverrideUpdate = ...,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Update an existing user flag override.

    Only the provided fields will be updated.

    Requires: Admin authentication (not Viewer)
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Get existing override
        existing = await user_flag_override_service.get_override(
            user_id=user_id,
            flag_name=flag_name,
            db=db,
        )

        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"No override found for user {user_id} and flag {flag_name}",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        # Merge existing with updates
        new_value = update.value if update.value is not None else existing.get("value")
        new_enabled = update.enabled if update.enabled is not None else existing.get("enabled", True)
        new_reason = update.reason if update.reason is not None else existing.get("reason")
        new_expires = update.expires_at if update.expires_at is not None else existing.get("expires_at")
        new_metadata = update.metadata if update.metadata is not None else existing.get("metadata")

        result = await user_flag_override_service.set_override(
            user_id=user_id,
            flag_name=flag_name,
            value=new_value,
            created_by=existing.get("created_by") or current_admin_user.email,
            enabled=new_enabled,
            reason=new_reason,
            expires_at=new_expires,
            metadata=new_metadata,
            updated_by=current_admin_user.email,  # Track who made this update
            db=db,
        )

        logger.info(f"Admin {current_admin_user.email} updated override for user {user_id}, " f"flag {flag_name}")

        return success_response(data=result, version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to update user override: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update user override",
        )


@router.delete("/users/{user_id}/flag-overrides/{flag_name}", response_model=None)
async def delete_user_override(
    user_id: UUID = Path(..., description="User ID"),
    flag_name: str = Path(..., description="Feature flag name"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Delete a user flag override.

    Permanently removes the override.

    Requires: Admin authentication (not Viewer)
    """
    ensure_admin_privileges(current_admin_user)
    try:
        deleted = await user_flag_override_service.remove_override(
            user_id=user_id,
            flag_name=flag_name,
            db=db,
        )

        if not deleted:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"No override found for user {user_id} and flag {flag_name}",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        logger.info(f"Admin {current_admin_user.email} deleted override for user {user_id}, " f"flag {flag_name}")

        return success_response(
            data={"message": "Override deleted successfully"},
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to delete user override: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete user override",
        )


# Flag-centric endpoints


@router.get("/feature-flags/{flag_name}/user-overrides", response_model=None)
async def list_flag_user_overrides(
    flag_name: str = Path(..., description="Feature flag name"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all user overrides for a specific flag.

    Returns all users who have overrides for this flag.

    Requires: Admin or Viewer authentication
    """
    try:
        overrides = await user_flag_override_service.list_overrides_for_flag(
            flag_name=flag_name,
            db=db,
            limit=limit,
            offset=offset,
        )

        total = await user_flag_override_service.count_overrides_for_flag(
            flag_name=flag_name,
            db=db,
        )

        logger.info(f"Admin {current_admin_user.email} listed {len(overrides)} user overrides " f"for flag {flag_name}")

        return success_response(
            data={
                "overrides": overrides,
                "total": total,
                "flag_name": flag_name,
                "limit": limit,
                "offset": offset,
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to list flag user overrides: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list flag user overrides",
        )


# Current user endpoint


@router.get("/flags/me", response_model=None)
async def get_current_user_flags(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get current user's flag values including overrides.

    Returns all feature flag values for the authenticated user,
    with any active overrides applied.

    Requires: Admin or Viewer authentication
    """
    try:
        # Get user's overrides
        overrides = await user_flag_override_service.get_user_overrides(
            user_id=current_admin_user.id,
            db=db,
            include_expired=False,
        )

        logger.info(f"User {current_admin_user.email} retrieved their flag overrides " f"({len(overrides)} active)")

        return success_response(
            data={
                "user_id": str(current_admin_user.id),
                "overrides": overrides,
                "override_count": len(overrides),
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to get current user flags: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get current user flags",
        )


# Resolution endpoint - get all flags with source


@router.get("/users/{user_id}/flags/resolved", response_model=None)
async def get_resolved_flags_for_user(
    user_id: UUID = Path(..., description="User ID"),
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get all feature flags for a user with resolution source.

    Returns all flags with their effective values and the source
    of the value (override, segmentation, scheduled, or default).
    Useful for debugging and user support.

    Requires: Admin or Viewer authentication
    """
    try:
        flags = await user_flag_override_service.get_all_flags_for_user(
            user_id=user_id,
            db=db,
        )

        logger.info(f"Admin {current_admin_user.email} retrieved resolved flags for user {user_id}")

        return success_response(
            data={
                "user_id": str(user_id),
                "flags": flags,
                "flag_count": len(flags),
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to get resolved flags: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get resolved flags",
        )


# Bulk operations


class BulkOverrideCreate(BaseModel):
    """Request model for bulk override creation."""

    overrides: List[Dict[str, Any]] = Field(
        ...,
        description="List of override specs",
        min_length=1,
        max_length=100,
    )


@router.post("/flag-overrides/bulk", status_code=status.HTTP_201_CREATED, response_model=None)
async def bulk_create_overrides(
    bulk_request: BulkOverrideCreate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Create or update multiple flag overrides in a single request.

    Each override spec should contain:
    - user_id: UUID
    - flag_name: str
    - value: Any
    - enabled: bool (optional, default True)
    - reason: str (optional)
    - expires_at: datetime (optional)
    - metadata: dict (optional)

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        result = await user_flag_override_service.bulk_set_overrides(
            overrides=bulk_request.overrides,
            created_by=current_admin_user.email,
            db=db,
        )

        logger.info(
            f"Admin {current_admin_user.email} bulk created/updated overrides: "
            f"{result['created']} created, {result['updated']} updated"
        )

        return success_response(data=result, version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to bulk create overrides: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to bulk create overrides",
        )


class BulkOverrideDelete(BaseModel):
    """Request model for bulk override deletion."""

    user_ids: List[UUID] = Field(
        ...,
        description="List of user IDs",
        min_length=1,
        max_length=100,
    )
    flag_name: Optional[str] = Field(
        default=None,
        description="Optional flag name filter",
    )


@router.delete("/flag-overrides/bulk", response_model=None)
async def bulk_delete_overrides(
    bulk_request: BulkOverrideDelete,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Delete flag overrides for multiple users.

    Optionally filter by flag name.

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        count = await user_flag_override_service.bulk_delete_overrides(
            user_ids=bulk_request.user_ids,
            flag_name=bulk_request.flag_name,
            db=db,
        )

        logger.info(f"Admin {current_admin_user.email} bulk deleted {count} overrides")

        return success_response(
            data={
                "message": f"Deleted {count} overrides",
                "deleted_count": count,
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to bulk delete overrides: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to bulk delete overrides",
        )


# Statistics endpoint


@router.get("/flag-overrides/stats", response_model=None)
async def get_override_statistics(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get statistics about user flag overrides.

    Returns counts and breakdowns useful for monitoring.

    Requires: Admin or Viewer authentication
    """
    try:
        stats = await user_flag_override_service.get_override_stats(db=db)

        logger.info(f"Admin {current_admin_user.email} retrieved override statistics")

        return success_response(data=stats, version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to get override statistics: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get override statistics",
        )


# Cleanup endpoint


@router.post("/flag-overrides/cleanup", response_model=None)
async def cleanup_expired_overrides(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Clean up expired user flag overrides.

    Removes all overrides that have passed their expiration time.
    Should be called periodically by a background task.

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        count = await user_flag_override_service.cleanup_expired_overrides(db=db)

        logger.info(f"Admin {current_admin_user.email} triggered cleanup, " f"removed {count} expired overrides")

        return success_response(
            data={
                "message": f"Cleaned up {count} expired overrides",
                "removed_count": count,
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to cleanup expired overrides: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to cleanup expired overrides",
        )
