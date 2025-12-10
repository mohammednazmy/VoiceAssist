"""Experiments API - Public feature flag access.

Provides read-only access to feature flags for the frontend.
No authentication required for basic flag checks.
"""

from __future__ import annotations

from typing import Optional

from app.core.api_envelope import success_response
from app.core.database import get_db
from app.core.logging import get_logger
from app.services.feature_flags import feature_flag_service
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/experiments", tags=["experiments"])
logger = get_logger(__name__)


# UI Feature Flag defaults (matching frontend featureFlags.ts)
# NOTE: unified_chat_voice_ui defaults to True so the unified
# chat+voice experience is the primary path. Operators can still
# disable it explicitly via the feature flag database / admin panel.
UI_FLAG_DEFAULTS = {
    "unified_chat_voice_ui": True,
    "new_navigation": False,
    "enhanced_documents": False,
    "clinical_wizard": False,
    "new_profile_ui": False,
    "context_pane": False,
}


class FeatureFlagPublicResponse(BaseModel):
    """Public response model for feature flag."""

    name: str
    enabled: bool
    description: Optional[str] = None


@router.get("/flags/{flag_name}")
async def get_feature_flag(
    flag_name: str,
    db: Session = Depends(get_db),
):
    """Get a feature flag's enabled state.

    Returns the flag's enabled state for frontend feature gating.
    Returns default value if flag doesn't exist.

    No authentication required.
    """
    try:
        # Check if flag exists in database
        flag = await feature_flag_service.get_flag(flag_name, db)

        if flag:
            return success_response(
                data={
                    "name": flag.name,
                    "enabled": flag.enabled,
                    "description": flag.description,
                },
                version="2.0.0",
            )

        # Return default value for known UI flags
        if flag_name in UI_FLAG_DEFAULTS:
            return success_response(
                data={
                    "name": flag_name,
                    "enabled": UI_FLAG_DEFAULTS[flag_name],
                    "description": f"Default value for {flag_name}",
                },
                version="2.0.0",
            )

        # Unknown flag - return disabled by default
        return success_response(
            data={
                "name": flag_name,
                "enabled": False,
                "description": "Unknown flag - disabled by default",
            },
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to get feature flag {flag_name}: {e}")
        # Return safe default on error
        return success_response(
            data={
                "name": flag_name,
                "enabled": UI_FLAG_DEFAULTS.get(flag_name, False),
                "description": "Error fetching flag - using default",
            },
            version="2.0.0",
        )


@router.get("/flags")
async def list_public_flags(
    db: Session = Depends(get_db),
):
    """List all public feature flags.

    Returns all flags with their current enabled state.
    No authentication required.
    """
    try:
        # Get all flags from database
        flags = await feature_flag_service.list_flags(db)

        # Build response with database flags
        flags_data = {flag.name: flag.enabled for flag in flags}

        # Add defaults for any missing UI flags
        for flag_name, default_value in UI_FLAG_DEFAULTS.items():
            if flag_name not in flags_data:
                flags_data[flag_name] = default_value

        return success_response(
            data={"flags": flags_data},
            version="2.0.0",
        )

    except Exception as e:
        logger.error(f"Failed to list feature flags: {e}")
        # Return defaults on error
        return success_response(
            data={"flags": UI_FLAG_DEFAULTS},
            version="2.0.0",
        )
