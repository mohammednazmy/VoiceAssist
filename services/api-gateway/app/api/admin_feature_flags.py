"""Admin Feature Flags API (Phase 7 - P3.1).

Provides admin-only endpoints for managing feature flags.
Requires admin authentication (RBAC).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer
from app.core.logging import get_logger
from app.models.feature_flag import FeatureFlagType
from app.models.user import User
from app.services.feature_flags import feature_flag_service
from fastapi import APIRouter, Depends, status
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
