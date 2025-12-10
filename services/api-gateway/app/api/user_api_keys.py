"""User API Keys API endpoints.

Provides endpoints for users to manage their personal API keys for
programmatic access to the VoiceAssist API.

These keys can be used as an alternative to JWT tokens for authentication.
"""

from typing import List, Optional
from uuid import UUID

from app.api.admin_panel import log_audit_event
from app.core.api_envelope import success_response
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.models.user import User
from app.services.user_api_key_service import user_api_key_service
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth/api-keys", tags=["api-keys"])


# =============================================================================
# Request/Response Models
# =============================================================================


class APIKeyCreate(BaseModel):
    """Request to create a new API key."""

    name: str = Field(..., min_length=1, max_length=255, description="Name for the API key")
    expires_in_days: Optional[int] = Field(
        None,
        ge=1,
        le=365,
        description="Days until expiration (null = never expires)",
    )


class APIKeyResponse(BaseModel):
    """API key information (without the actual key value)."""

    id: str
    name: str
    key_prefix: str
    created_at: str
    last_used_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_revoked: bool


class APIKeyCreatedResponse(APIKeyResponse):
    """Response when a new API key is created (includes the full key)."""

    key: str  # Full key - ONLY shown once at creation


class APIKeyListResponse(BaseModel):
    """List of API keys."""

    keys: List[APIKeyResponse]
    total: int


# =============================================================================
# Helper Functions
# =============================================================================


def format_api_key(api_key) -> APIKeyResponse:
    """Convert a UserAPIKey model to APIKeyResponse."""
    return APIKeyResponse(
        id=str(api_key.id),
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at.isoformat() if api_key.created_at else None,
        last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
        is_revoked=api_key.is_revoked,
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=dict)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    include_revoked: bool = False,
):
    """
    List all API keys for the current user.

    Returns keys without their actual values (only prefixes).
    """
    keys = user_api_key_service.list_user_keys(
        db=db,
        user_id=current_user.id,
        include_revoked=include_revoked,
    )

    return success_response(
        APIKeyListResponse(
            keys=[format_api_key(k) for k in keys],
            total=len(keys),
        ).model_dump()
    )


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    request: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new API key.

    IMPORTANT: The full key value is only returned once in this response.
    Store it securely - it cannot be retrieved again.
    """
    try:
        api_key, full_key = user_api_key_service.create_key(
            db=db,
            user_id=current_user.id,
            name=request.name,
            expires_in_days=request.expires_in_days,
        )

        # Log audit event
        log_audit_event(
            db,
            action="api_key_created",
            user_id=str(current_user.id),
            user_email=current_user.email,
            resource_type="user_api_key",
            resource_id=str(api_key.id),
            success=True,
            details=f"Key name: {request.name}",
        )

        response = APIKeyCreatedResponse(
            id=str(api_key.id),
            name=api_key.name,
            key_prefix=api_key.key_prefix,
            key=full_key,  # Only time the full key is exposed!
            created_at=api_key.created_at.isoformat() if api_key.created_at else None,
            last_used_at=None,
            expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
            is_revoked=False,
        )

        return success_response(response.model_dump())

    except Exception as e:
        logger.error(f"Failed to create API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create API key",
        )


@router.delete("/{key_id}", response_model=dict)
async def revoke_api_key(
    key_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revoke an API key.

    The key will no longer be usable for authentication.
    """
    # Check if key exists and belongs to user
    api_key = user_api_key_service.get_key_by_id(
        db=db,
        key_id=key_id,
        user_id=current_user.id,
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    if api_key.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key is already revoked",
        )

    success = user_api_key_service.revoke_key(
        db=db,
        key_id=key_id,
        user_id=current_user.id,
    )

    if success:
        # Log audit event
        log_audit_event(
            db,
            action="api_key_revoked",
            user_id=str(current_user.id),
            user_email=current_user.email,
            resource_type="user_api_key",
            resource_id=str(key_id),
            success=True,
            details=f"Key name: {api_key.name}",
        )

        return success_response(
            {
                "message": "API key revoked successfully",
                "key_id": str(key_id),
            }
        )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to revoke API key",
    )


@router.get("/{key_id}", response_model=dict)
async def get_api_key(
    key_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get details of a specific API key.

    Returns key information without the actual key value.
    """
    api_key = user_api_key_service.get_key_by_id(
        db=db,
        key_id=key_id,
        user_id=current_user.id,
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    return success_response(format_api_key(api_key).model_dump())
