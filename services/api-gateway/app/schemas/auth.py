"""
Authentication request and response schemas
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer


class UserRegister(BaseModel):
    """User registration request"""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)


class UserLogin(BaseModel):
    """User login request"""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until expiration
    refresh_expires_in: Optional[int] = None
    role: Optional[str] = None


class TokenRefresh(BaseModel):
    """Refresh token request"""

    refresh_token: str


class TwoFactorRequiredResponse(BaseModel):
    """Response when 2FA verification is needed to complete login"""

    requires_2fa: bool = True
    user_id: str
    message: str = "Two-factor authentication required"


class PasswordChange(BaseModel):
    """Password change request"""

    old_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class AcceptInvitationRequest(BaseModel):
    """Accept invitation and set password request"""

    token: str
    password: str = Field(..., min_length=8, max_length=100)
    full_name: Optional[str] = Field(None, max_length=255)


class AcceptInvitationResponse(BaseModel):
    """Response after successfully accepting invitation"""

    success: bool
    message: str
    user: Optional["UserResponse"] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    refresh_expires_in: Optional[int] = None


class SessionInfoResponse(BaseModel):
    """Session timeout information for frontend"""

    absolute_timeout_hours: int
    inactivity_timeout_minutes: int
    absolute_remaining_seconds: int
    inactivity_remaining_seconds: int
    session_started_at: str
    last_activity_at: Optional[str] = None


class UserResponse(BaseModel):
    """User information response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    admin_role: Optional[str] = None
    nextcloud_user_id: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None

    @field_serializer("id")
    def serialize_id(self, value: UUID) -> str:
        """Convert UUID to string for JSON response"""
        return str(value)

    @field_serializer("created_at", "last_login")
    def serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        """Convert datetime to ISO format string for JSON response"""
        if value is None:
            return None
        return value.isoformat()
