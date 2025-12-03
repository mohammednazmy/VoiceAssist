"""User Feature Flag Override Model (Phase 7 - P3.1+).

Provides per-user feature flag overrides for A/B testing and gradual rollouts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSON, UUID


class UserFeatureFlag(Base):
    """User-specific feature flag override.

    Allows per-user feature flag values to override global settings.
    Used for A/B testing, gradual rollouts, and user-specific configurations.

    Attributes:
        id: Unique identifier for this override
        user_id: User this override applies to
        flag_name: Feature flag name (references feature_flags table)
        enabled: Override enabled state (for boolean flags)
        value: Override value (for non-boolean flags)
        created_at: When override was created
        updated_at: When override was last updated
        expires_at: Optional expiration datetime
        override_metadata: Additional metadata (A/B test group, reason, etc.)
    """

    __tablename__ = "user_feature_flags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    flag_name = Column(String(255), ForeignKey("feature_flags.name"), nullable=False, index=True)
    enabled = Column(Boolean, nullable=True)  # Null means use global default
    value = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    override_metadata = Column("metadata", JSON, nullable=True)

    # Composite unique constraint: one override per user per flag
    __table_args__ = (Index("ix_user_feature_flags_user_flag", "user_id", "flag_name", unique=True),)

    def __repr__(self):
        return f"<UserFeatureFlag(user_id='{self.user_id}', flag='{self.flag_name}', enabled={self.enabled})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "flag_name": self.flag_name,
            "enabled": self.enabled,
            "value": self.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "metadata": self.override_metadata,
        }

    def is_expired(self) -> bool:
        """Check if override has expired."""
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at
