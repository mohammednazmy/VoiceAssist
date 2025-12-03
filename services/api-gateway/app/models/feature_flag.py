"""Feature Flag Model (Phase 7 - P3.1).

Provides runtime feature toggles for controlled rollouts and A/B testing.
Supports boolean, string, number, and JSON feature values.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from app.core.database import Base
from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text


class FeatureFlagType(str, Enum):
    """Feature flag value types."""

    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    JSON = "json"


class FeatureFlag(Base):
    """Feature flag model for runtime configuration.

    Attributes:
        name: Unique feature flag identifier (e.g., 'rbac_enforcement')
        description: Human-readable description of the feature
        flag_type: Type of value (boolean, string, number, json)
        enabled: Whether the feature is currently enabled (for boolean flags)
        value: JSON-encoded value for non-boolean flags
        default_value: Default value if flag is not found
        created_at: Timestamp when flag was created
        updated_at: Timestamp when flag was last updated
        metadata: Additional metadata (tags, owner, etc.)
    """

    __tablename__ = "feature_flags"

    name = Column(String(255), primary_key=True, index=True)
    description = Column(Text, nullable=False)
    flag_type = Column(String(50), nullable=False, default=FeatureFlagType.BOOLEAN.value)
    enabled = Column(Boolean, nullable=False, default=False)
    value = Column(JSON, nullable=True)
    default_value = Column(JSON, nullable=True)
    rollout_percentage = Column(Integer, nullable=True, default=100)  # For A/B testing (0-100)
    rollout_salt = Column(String(50), nullable=True)  # Salt for consistent user assignment
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    flag_metadata = Column("metadata", JSON, nullable=True)  # Renamed to avoid SQLAlchemy reserved keyword

    def __repr__(self):
        return f"<FeatureFlag(name='{self.name}', enabled={self.enabled}, type={self.flag_type})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "flag_type": self.flag_type,
            "enabled": self.enabled,
            "value": self.value,
            "default_value": self.default_value,
            "rollout_percentage": self.rollout_percentage,
            "rollout_salt": self.rollout_salt,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "metadata": self.flag_metadata,
        }
