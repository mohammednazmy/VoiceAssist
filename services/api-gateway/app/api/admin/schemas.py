"""Admin Panel Pydantic Schemas.

Defines request and response models for admin panel endpoints.
"""

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    """Request model for creating a user."""

    email: EmailStr
    full_name: str
    is_admin: bool = False
    admin_role: str = "user"
    is_active: bool = True


class UserUpdate(BaseModel):
    """Request model for updating a user."""

    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_admin: Optional[bool] = None
    admin_role: Optional[str] = None
    is_active: Optional[bool] = None
    action_reason: Optional[str] = None


class PasswordResetRequest(BaseModel):
    """Request model for password reset."""

    method: Literal["temporary", "email"]
    notify_user: bool = True


class UserInviteRequest(BaseModel):
    """Request model for inviting a new user."""

    email: EmailStr
    full_name: Optional[str] = None
    admin_role: Literal["user", "admin", "viewer"] = "user"
    send_email: bool = True


class UserResponse(BaseModel):
    """Response model for user data."""

    id: str
    email: str
    full_name: Optional[str]
    is_admin: bool
    admin_role: str
    is_active: bool
    created_at: str
    last_login: Optional[str]

    class Config:
        from_attributes = True


class AuditLogEntryResponse(BaseModel):
    """Response model for audit log entry."""

    timestamp: str
    level: str
    action: str
    user_id: Optional[str]
    user_email: Optional[str]
    resource_type: Optional[str]
    resource_id: Optional[str]
    success: bool
    details: Optional[str]


class BulkOperationRequest(BaseModel):
    """Request model for bulk user operations."""

    user_ids: list[str]
    action: Literal["activate", "deactivate", "delete", "promote", "demote"]
    reason: Optional[str] = None


class PermanentDeleteRequest(BaseModel):
    """Request model for permanent user deletion."""

    confirmation: str
    reason: Optional[str] = None


# Constants
ALLOWED_ADMIN_ROLES = {"admin", "viewer", "user"}
