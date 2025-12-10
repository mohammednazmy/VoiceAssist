"""
User model
"""

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship


class User(Base):
    """User model for authentication and user management"""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=True)  # Null for SSO users
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    admin_role = Column(String(50), default="user", nullable=False)
    password_changed_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Nextcloud integration
    nextcloud_user_id = Column(String(255), unique=True, nullable=True, index=True)

    # OAuth provider info (for SSO users)
    oauth_provider = Column(String(50), nullable=True, index=True)  # "google" or "microsoft"
    oauth_provider_id = Column(String(255), nullable=True, index=True)  # Provider's user ID

    # Two-Factor Authentication (2FA)
    totp_secret = Column(String(255), nullable=True)  # Encrypted TOTP secret
    totp_enabled = Column(Boolean, default=False, nullable=False)
    totp_backup_codes = Column(String(1024), nullable=True)  # Encrypted comma-separated backup codes
    totp_verified_at = Column(DateTime(timezone=True), nullable=True)

    # Invitation tokens (for new user invitations)
    invitation_token = Column(String(255), unique=True, nullable=True, index=True)
    invitation_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    invitation_sent_at = Column(DateTime(timezone=True), nullable=True)
    invited_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Password reset tokens
    password_reset_token = Column(String(255), unique=True, nullable=True, index=True)
    password_reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    api_keys = relationship("UserAPIKey", back_populates="user", cascade="all, delete-orphan")
    invited_by = relationship("User", remote_side=[id], foreign_keys=[invited_by_id])

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"
