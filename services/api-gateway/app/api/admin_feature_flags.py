"""Admin Feature Flags API (Phase 7 - P3.1).

Provides admin-only endpoints for managing feature flags.
Requires admin authentication (RBAC).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.flag_definitions import sync_definitions_to_database
from app.core.logging import get_logger
from app.models.feature_flag import FeatureFlagType
from app.models.user import User
from app.services.feature_flags import feature_flag_service
from app.services.variant_assignment import ScheduledChange, variant_assignment_service
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/feature-flags", tags=["admin", "feature-flags"])
logger = get_logger(__name__)


# Request/Response Models


class FeatureFlagCreate(BaseModel):
    """Request model for creating a feature flag."""

    name: str = Field(..., description="Unique feature flag identifier", max_length=255)
    description: str = Field(..., description="Human-readable description")
    flag_type: FeatureFlagType = Field(default=FeatureFlagType.BOOLEAN, description="Type of flag value")
    enabled: bool = Field(default=False, description="Initial enabled state (for boolean flags)")
    value: Optional[Any] = Field(default=None, description="Initial value (for non-boolean flags)")
    default_value: Optional[Any] = Field(default=None, description="Default value when flag not found")
    metadata: Optional[Dict] = Field(default=None, description="Additional metadata (tags, owner, etc.)")


class FeatureFlagUpdate(BaseModel):
    """Request model for updating a feature flag."""

    enabled: Optional[bool] = Field(default=None, description="New enabled state")
    value: Optional[Any] = Field(default=None, description="New value")
    description: Optional[str] = Field(default=None, description="New description")
    metadata: Optional[Dict] = Field(default=None, description="New metadata")


class FeatureFlagResponse(BaseModel):
    """Response model for feature flag."""

    name: str
    description: str
    flag_type: str
    enabled: bool
    value: Optional[Any]
    default_value: Optional[Any]
    created_at: str
    updated_at: str
    metadata: Optional[Dict]


class FeatureFlagListResponse(BaseModel):
    """Response model for listing feature flags."""

    flags: List[FeatureFlagResponse]
    total: int


# API Endpoints


@router.get("", response_model=dict)
async def list_feature_flags(
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all feature flags.

    Returns all feature flags with their current state.

    Requires: Admin authentication
    """
    try:
        # Ensure all flags defined in code are present in the database so that
        # newly added flags automatically show up in the admin UI even if the
        # initial sync on startup failed or has not run yet.
        try:
            sync_result = sync_definitions_to_database(db)
            logger.debug(
                "feature_flags_synced_on_list",
                extra={"created": sync_result["created"], "skipped": sync_result["skipped"]},
            )
        except Exception as sync_err:  # pragma: no cover - defensive logging
            logger.warning("Failed to sync flag definitions before listing", exc_info=True, extra={"error": str(sync_err)})

        flags = await feature_flag_service.list_flags(db)

        flags_data = [flag.to_dict() for flag in flags]

        response = FeatureFlagListResponse(flags=flags_data, total=len(flags_data))

        logger.info(f"Admin {current_admin_user.email} listed {len(flags_data)} feature flags")

        return success_response(data=response.model_dump(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to list feature flags: {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to list feature flags")


@router.get("/{flag_name}", response_model=dict)
async def get_feature_flag(
    flag_name: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Get a specific feature flag.

    Returns detailed information about a feature flag.

    Args:
        flag_name: Unique feature flag identifier

    Requires: Admin authentication
    """
    try:
        flag = await feature_flag_service.get_flag(flag_name, db)

        if not flag:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Feature flag '{flag_name}' not found",
            )

        logger.info(f"Admin {current_admin_user.email} retrieved feature flag: {flag_name}")

        return success_response(data=flag.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to get feature flag '{flag_name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to retrieve feature flag")


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_feature_flag(
    flag_data: FeatureFlagCreate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Create a new feature flag.

    Creates a new feature flag with the specified configuration.

    Args:
        flag_data: Feature flag configuration

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Check if flag already exists
        existing_flag = await feature_flag_service.get_flag(flag_data.name, db)
        if existing_flag:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"Feature flag '{flag_data.name}' already exists",
            )

        # Create flag
        flag = await feature_flag_service.create_flag(
            name=flag_data.name,
            description=flag_data.description,
            flag_type=flag_data.flag_type,
            enabled=flag_data.enabled,
            value=flag_data.value,
            default_value=flag_data.default_value,
            metadata=flag_data.metadata or {"created_by": current_admin_user.email},
            db=db,
        )

        if not flag:
            return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to create feature flag")

        logger.info(f"Admin {current_admin_user.email} created feature flag: {flag_data.name}")

        return success_response(data=flag.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to create feature flag '{flag_data.name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to create feature flag")


@router.patch("/{flag_name}", response_model=dict)
async def update_feature_flag(
    flag_name: str,
    flag_update: FeatureFlagUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Update an existing feature flag.

    Updates one or more fields of a feature flag.

    Args:
        flag_name: Unique feature flag identifier
        flag_update: Fields to update

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Check if flag exists
        existing_flag = await feature_flag_service.get_flag(flag_name, db)
        if not existing_flag:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Feature flag '{flag_name}' not found",
            )

        # Add update metadata
        metadata = flag_update.metadata or existing_flag.flag_metadata or {}
        metadata["updated_by"] = current_admin_user.email

        # Update flag
        flag = await feature_flag_service.update_flag(
            name=flag_name,
            enabled=flag_update.enabled,
            value=flag_update.value,
            description=flag_update.description,
            metadata=metadata,
            db=db,
        )

        if not flag:
            return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to update feature flag")

        logger.info(f"Admin {current_admin_user.email} updated feature flag: {flag_name}")

        return success_response(data=flag.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to update feature flag '{flag_name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to update feature flag")


@router.delete("/{flag_name}", response_model=dict)
async def delete_feature_flag(
    flag_name: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Delete a feature flag.

    Permanently deletes a feature flag.

    Args:
        flag_name: Unique feature flag identifier

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Check if flag exists
        existing_flag = await feature_flag_service.get_flag(flag_name, db)
        if not existing_flag:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Feature flag '{flag_name}' not found",
            )

        # Delete flag
        success = await feature_flag_service.delete_flag(flag_name, db)

        if not success:
            return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to delete feature flag")

        logger.info(f"Admin {current_admin_user.email} deleted feature flag: {flag_name}")

        return success_response(
            data={"message": f"Feature flag '{flag_name}' deleted successfully"},
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to delete feature flag '{flag_name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to delete feature flag")


@router.post("/{flag_name}/toggle", response_model=dict)
async def toggle_feature_flag(
    flag_name: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Toggle a boolean feature flag.

    Quickly toggle a boolean feature flag between enabled and disabled.

    Args:
        flag_name: Unique feature flag identifier

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Get current flag
        existing_flag = await feature_flag_service.get_flag(flag_name, db)
        if not existing_flag:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Feature flag '{flag_name}' not found",
            )

        # Toggle enabled state
        new_enabled_state = not existing_flag.enabled
        flag = await feature_flag_service.update_flag(
            name=flag_name,
            enabled=new_enabled_state,
            metadata={
                **(existing_flag.flag_metadata or {}),
                "toggled_by": current_admin_user.email,
            },
            db=db,
        )

        if not flag:
            return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to toggle feature flag")

        logger.info(f"Admin {current_admin_user.email} toggled feature flag '{flag_name}' " f"to {new_enabled_state}")

        return success_response(data=flag.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to toggle feature flag '{flag_name}': {e}", exc_info=True)
        return error_response(code=ErrorCodes.INTERNAL_ERROR, message="Failed to toggle feature flag")


# ============================================================================
# Scheduled Variant Changes API
# ============================================================================


class ScheduledChangeCreate(BaseModel):
    """Request model for creating a scheduled variant change."""

    scheduled_at: datetime = Field(..., description="When to apply the change (ISO 8601 format)")
    changes: Dict[str, int] = Field(..., description="Variant weight changes: {variant_id: new_weight}")
    description: Optional[str] = Field(None, description="Description of the change")
    timezone_id: str = Field(default="UTC", description="IANA timezone identifier")


class ScheduledChangeUpdate(BaseModel):
    """Request model for updating a scheduled change."""

    scheduled_at: Optional[datetime] = Field(None, description="New scheduled time")
    changes: Optional[Dict[str, int]] = Field(None, description="Updated variant weight changes")
    description: Optional[str] = Field(None, description="Updated description")
    timezone_id: Optional[str] = Field(None, description="Updated timezone")


class ScheduledChangeResponse(BaseModel):
    """Response model for a scheduled change."""

    id: str
    flag_name: Optional[str]
    scheduled_at: Optional[str]
    changes: Dict[str, int]
    description: Optional[str]
    timezone_id: str
    applied: bool
    cancelled: bool
    created_at: Optional[str]
    created_by: Optional[str]
    modified_at: Optional[str]
    modified_by: Optional[str]
    cancelled_at: Optional[str]
    cancelled_by: Optional[str]


@router.get("/{flag_name}/scheduled-changes", response_model=dict)
async def list_scheduled_changes(
    flag_name: str,
    include_applied: bool = Query(False, description="Include already-applied changes"),
    include_cancelled: bool = Query(False, description="Include cancelled changes"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List scheduled variant changes for a flag.

    Returns all scheduled changes for a flag, optionally including
    applied or cancelled changes.

    Args:
        flag_name: Unique feature flag identifier
        include_applied: Include changes that have already been applied
        include_cancelled: Include cancelled changes

    Requires: Admin authentication
    """
    try:
        changes = await variant_assignment_service.get_scheduled_changes(
            flag_name,
            include_applied=include_applied,
            include_cancelled=include_cancelled,
        )

        changes_data = [change.to_dict() for change in changes]

        logger.info(
            f"Admin {current_admin_user.email} listed {len(changes_data)} scheduled changes " f"for flag {flag_name}"
        )

        return success_response(
            data={
                "flag_name": flag_name,
                "scheduled_changes": changes_data,
                "total": len(changes_data),
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to list scheduled changes for '{flag_name}': {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list scheduled changes",
        )


@router.post(
    "/{flag_name}/scheduled-changes",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
async def create_scheduled_change(
    flag_name: str,
    change_data: ScheduledChangeCreate,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Create a scheduled variant change for a flag.

    Schedules a change to variant weights to be applied at a specific time.
    Useful for gradual rollouts or timed feature releases.

    Args:
        flag_name: Unique feature flag identifier
        change_data: Scheduled change configuration

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Validate scheduled_at is in the future
        now = datetime.now(timezone.utc)
        scheduled_at = change_data.scheduled_at
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

        if scheduled_at <= now:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message="Scheduled time must be in the future",
            )

        # Create the scheduled change
        change = ScheduledChange(
            id=str(uuid.uuid4()),
            scheduled_at=scheduled_at,
            changes=change_data.changes,
            flag_name=flag_name,
            description=change_data.description,
            created_by=current_admin_user.email,
            timezone_id=change_data.timezone_id,
        )

        success = await variant_assignment_service.save_scheduled_change(flag_name, change)

        if not success:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to save scheduled change",
            )

        logger.info(
            f"Admin {current_admin_user.email} created scheduled change {change.id} "
            f"for flag {flag_name} at {scheduled_at.isoformat()}"
        )

        return success_response(data=change.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(f"Failed to create scheduled change for '{flag_name}': {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to create scheduled change",
        )


@router.get("/{flag_name}/scheduled-changes/{change_id}/preview", response_model=dict)
async def preview_scheduled_change(
    flag_name: str,
    change_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Preview what a scheduled change would do.

    Shows the before/after state of variants when the change is applied.

    Args:
        flag_name: Unique feature flag identifier
        change_id: Scheduled change ID

    Requires: Admin authentication
    """
    try:
        # Get the scheduled change
        changes = await variant_assignment_service.get_scheduled_changes(
            flag_name, include_applied=True, include_cancelled=True
        )

        change = next((c for c in changes if c.id == change_id), None)
        if not change:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Scheduled change '{change_id}' not found",
            )

        # Get current flag state to show preview
        flag = await feature_flag_service.get_flag(flag_name, db)
        if not flag:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Feature flag '{flag_name}' not found",
            )

        # Get variants from flag metadata
        from app.services.variant_assignment import FlagVariant

        variants_data = flag.flag_metadata.get("variants", []) if flag.flag_metadata else []
        variants = [FlagVariant.from_dict(v) for v in variants_data]

        # Generate preview
        preview = change.preview(variants)
        preview["flag_name"] = flag_name
        preview["flag_enabled"] = flag.enabled
        preview["status"] = "cancelled" if change.cancelled else ("applied" if change.applied else "pending")

        logger.info(f"Admin {current_admin_user.email} previewed scheduled change {change_id} " f"for flag {flag_name}")

        return success_response(data=preview, version="2.0.0")
    except Exception as e:
        logger.error(
            f"Failed to preview scheduled change '{change_id}' for '{flag_name}': {e}",
            exc_info=True,
        )
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to preview scheduled change",
        )


@router.patch("/{flag_name}/scheduled-changes/{change_id}", response_model=dict)
async def update_scheduled_change(
    flag_name: str,
    change_id: str,
    update_data: ScheduledChangeUpdate,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Update a pending scheduled change.

    Only pending (not applied, not cancelled) changes can be updated.

    Args:
        flag_name: Unique feature flag identifier
        change_id: Scheduled change ID
        update_data: Fields to update

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        # Get the scheduled change
        changes = await variant_assignment_service.get_scheduled_changes(flag_name)
        change = next((c for c in changes if c.id == change_id), None)

        if not change:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Scheduled change '{change_id}' not found or already applied/cancelled",
            )

        # Update fields
        if update_data.scheduled_at is not None:
            scheduled_at = update_data.scheduled_at
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

            now = datetime.now(timezone.utc)
            if scheduled_at <= now:
                return error_response(
                    code=ErrorCodes.VALIDATION_ERROR,
                    message="Scheduled time must be in the future",
                )
            change.scheduled_at = scheduled_at

        if update_data.changes is not None:
            change.changes = update_data.changes

        if update_data.description is not None:
            change.description = update_data.description

        if update_data.timezone_id is not None:
            change.timezone_id = update_data.timezone_id

        # Update modification metadata
        change.modified_at = datetime.now(timezone.utc)
        change.modified_by = current_admin_user.email

        # Delete old entry and save updated one
        await variant_assignment_service.delete_scheduled_change(flag_name, change_id)
        success = await variant_assignment_service.save_scheduled_change(flag_name, change)

        if not success:
            return error_response(
                code=ErrorCodes.INTERNAL_ERROR,
                message="Failed to update scheduled change",
            )

        logger.info(f"Admin {current_admin_user.email} updated scheduled change {change_id} " f"for flag {flag_name}")

        return success_response(data=change.to_dict(), version="2.0.0")
    except Exception as e:
        logger.error(
            f"Failed to update scheduled change '{change_id}' for '{flag_name}': {e}",
            exc_info=True,
        )
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update scheduled change",
        )


@router.post("/{flag_name}/scheduled-changes/{change_id}/cancel", response_model=dict)
async def cancel_scheduled_change(
    flag_name: str,
    change_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Cancel a scheduled change.

    Marks a scheduled change as cancelled. The change will not be applied.
    Cancelled changes are kept for audit purposes.

    Args:
        flag_name: Unique feature flag identifier
        change_id: Scheduled change ID

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        success = await variant_assignment_service.cancel_scheduled_change(
            flag_name,
            change_id,
            cancelled_by=current_admin_user.email,
        )

        if not success:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Scheduled change '{change_id}' not found",
            )

        logger.info(f"Admin {current_admin_user.email} cancelled scheduled change {change_id} " f"for flag {flag_name}")

        return success_response(
            data={"message": f"Scheduled change '{change_id}' cancelled successfully"},
            version="2.0.0",
        )
    except Exception as e:
        logger.error(
            f"Failed to cancel scheduled change '{change_id}' for '{flag_name}': {e}",
            exc_info=True,
        )
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to cancel scheduled change",
        )


@router.delete("/{flag_name}/scheduled-changes/{change_id}", response_model=dict)
async def delete_scheduled_change(
    flag_name: str,
    change_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Delete a scheduled change permanently.

    Permanently removes a scheduled change. Use cancel instead if you
    want to keep the change for audit purposes.

    Args:
        flag_name: Unique feature flag identifier
        change_id: Scheduled change ID

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        success = await variant_assignment_service.delete_scheduled_change(
            flag_name,
            change_id,
        )

        if not success:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Scheduled change '{change_id}' not found",
            )

        logger.info(f"Admin {current_admin_user.email} deleted scheduled change {change_id} " f"for flag {flag_name}")

        return success_response(
            data={"message": f"Scheduled change '{change_id}' deleted successfully"},
            version="2.0.0",
        )
    except Exception as e:
        logger.error(
            f"Failed to delete scheduled change '{change_id}' for '{flag_name}': {e}",
            exc_info=True,
        )
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete scheduled change",
        )


@router.get("/scheduled-changes/all", response_model=dict)
async def list_all_scheduled_changes(
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """List all pending scheduled changes across all flags.

    Returns a summary of all pending scheduled changes grouped by flag.
    Useful for viewing upcoming changes in the admin dashboard.

    Requires: Admin authentication
    """
    try:
        all_changes = await variant_assignment_service.get_all_pending_scheduled_changes()

        # Format response
        changes_summary = []
        total_pending = 0
        for flag_name, changes in all_changes.items():
            for change in changes:
                total_pending += 1
                changes_summary.append(
                    {
                        "flag_name": flag_name,
                        **change.to_dict(),
                    }
                )

        # Sort by scheduled_at
        changes_summary.sort(
            key=lambda c: c.get("scheduled_at") or "",
        )

        logger.info(f"Admin {current_admin_user.email} listed {total_pending} pending scheduled changes")

        return success_response(
            data={
                "scheduled_changes": changes_summary,
                "total": total_pending,
                "flags_with_changes": len(all_changes),
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to list all scheduled changes: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list scheduled changes",
        )


@router.post("/{flag_name}/invalidate-cache", response_model=dict)
async def invalidate_flag_cache(
    flag_name: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
):
    """Invalidate cached variant assignments for a flag.

    Forces all users to be re-evaluated against current variant configuration.
    Use this after making manual changes to variant weights.

    Args:
        flag_name: Unique feature flag identifier

    Requires: Admin authentication
    """
    ensure_admin_privileges(current_admin_user)
    try:
        invalidated = await variant_assignment_service.invalidate_bucket_cache_for_flag(flag_name)

        logger.info(
            f"Admin {current_admin_user.email} invalidated {invalidated} cache entries " f"for flag {flag_name}"
        )

        return success_response(
            data={
                "flag_name": flag_name,
                "cache_entries_invalidated": invalidated,
            },
            version="2.0.0",
        )
    except Exception as e:
        logger.error(f"Failed to invalidate cache for '{flag_name}': {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to invalidate cache",
        )
