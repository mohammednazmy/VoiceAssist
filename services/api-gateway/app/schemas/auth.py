"""
Authentication request and response schemas
"""
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer
from typing import Optional, Any
from uuid import UUID
from datetime import datetime


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


class TokenRefresh(BaseModel):
    """Refresh token request"""
    refresh_token: str


class PasswordChange(BaseModel):
    """Password change request"""
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class UserResponse(BaseModel):
    """User information response"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    nextcloud_user_id: Optional[str] = None
    created_at: str
    last_login: Optional[str] = None

    @field_serializer('id')
    def serialize_id(self, value: Any) -> str:
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return str(value)

    @field_serializer('created_at', 'last_login')
    def serialize_datetime(self, value: Any) -> Optional[str]:
        """Convert datetime to ISO format string"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)
