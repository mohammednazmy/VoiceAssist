"""
Authentication request and response schemas
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, model_validator


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

    id: str
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    admin_role: Optional[str] = None
    nextcloud_user_id: Optional[str] = None
    created_at: str
    last_login: Optional[str] = None

    @model_validator(mode='before')
    @classmethod
    def convert_types(cls, data):
        """Convert UUID and datetime types to strings before validation"""
        # Handle ORM objects (from_attributes=True)
        if hasattr(data, '__dict__'):
            # It's an ORM object, extract attributes
            result = {}
            for field in ['id', 'email', 'full_name', 'is_active', 'is_admin',
                          'admin_role', 'nextcloud_user_id', 'created_at', 'last_login']:
                val = getattr(data, field, None)
                if field == 'id' and isinstance(val, UUID):
                    result[field] = str(val)
                elif field in ('created_at', 'last_login') and isinstance(val, datetime):
                    result[field] = val.isoformat()
                else:
                    result[field] = val
            return result
        # Handle dict input
        if isinstance(data, dict):
            if 'id' in data and isinstance(data['id'], UUID):
                data['id'] = str(data['id'])
            if 'created_at' in data and isinstance(data['created_at'], datetime):
                data['created_at'] = data['created_at'].isoformat()
            if 'last_login' in data and isinstance(data['last_login'], datetime):
                data['last_login'] = data['last_login'].isoformat()
        return data

    @classmethod
    def from_user(cls, user):
        """Create UserResponse from User model"""
        return cls(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            admin_role=getattr(user, 'admin_role', None),
            nextcloud_user_id=user.nextcloud_user_id,
            created_at=user.created_at.isoformat() if user.created_at else None,
            last_login=user.last_login.isoformat() if user.last_login else None
        )
