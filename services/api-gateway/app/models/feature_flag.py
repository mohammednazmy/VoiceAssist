"""Feature Flag Model (Phase 7 - P3.1).

Provides runtime feature toggles for controlled rollouts and A/B testing.
Supports boolean, string, number, JSON, and multivariate feature values.

Enhanced with:
- Multivariate variants with weights
- Targeting rules for conditional rollouts
- Scheduled variant changes for gradual ramp-up
- Environment-specific configurations
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from app.core.database import Base
from sqlalchemy import JSON, Boolean, Column, DateTime, Index, Integer, String, Text


class FeatureFlagType(str, Enum):
    """Feature flag value types."""

    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    JSON = "json"
    MULTIVARIATE = "multivariate"  # For A/B/n testing with variants


class FeatureFlag(Base):
    """Feature flag model for runtime configuration.

    Attributes:
        name: Unique feature flag identifier (e.g., 'rbac_enforcement')
        description: Human-readable description of the feature
        flag_type: Type of value (boolean, string, number, json, multivariate)
        enabled: Whether the feature is currently enabled (for boolean flags)
        value: JSON-encoded value for non-boolean flags
        default_value: Default value if flag is not found
        variants: List of variants for multivariate flags (JSON array)
        targeting_rules: Targeting rules for conditional rollouts (JSON array)
        scheduled_changes: Scheduled weight changes for gradual rollout (JSON array)
        default_variant: Default variant ID for multivariate flags
        rollout_percentage: Percentage of users to include (0-100)
        rollout_salt: Salt for consistent user assignment
        environment: Target environment (production, staging, development)
        archived: Whether the flag is archived (soft delete)
        created_at: Timestamp when flag was created
        updated_at: Timestamp when flag was last updated
        metadata: Additional metadata (tags, owner, etc.)
    """

    __tablename__ = "feature_flags"

    # Add composite indexes for common queries
    __table_args__ = (
        Index("ix_feature_flags_archived_env", "archived", "environment"),
        Index("ix_feature_flags_type", "flag_type"),
    )

    name = Column(String(255), primary_key=True, index=True)
    description = Column(Text, nullable=False)
    flag_type = Column(String(50), nullable=False, default=FeatureFlagType.BOOLEAN.value)
    enabled = Column(Boolean, nullable=False, default=False)
    value = Column(JSON, nullable=True)
    default_value = Column(JSON, nullable=True)

    # Multivariate variant support
    variants = Column(JSON, nullable=True)  # Array of {id, name, value, weight, description}
    targeting_rules = Column(JSON, nullable=True)  # Array of targeting rules
    scheduled_changes = Column(JSON, nullable=True)  # Array of scheduled weight changes
    default_variant = Column(String(100), nullable=True)  # Default variant ID

    # Rollout configuration
    rollout_percentage = Column(Integer, nullable=True, default=100)  # For A/B testing (0-100)
    rollout_salt = Column(String(50), nullable=True)  # Salt for consistent user assignment

    # Organization
    environment = Column(String(50), nullable=True, default="production")
    archived = Column(Boolean, nullable=False, default=False)  # Soft delete

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    flag_metadata = Column("metadata", JSON, nullable=True)

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
            "variants": self.variants,
            "targeting_rules": self.targeting_rules,
            "scheduled_changes": self.scheduled_changes,
            "default_variant": self.default_variant,
            "rollout_percentage": self.rollout_percentage,
            "rollout_salt": self.rollout_salt,
            "environment": self.environment,
            "archived": self.archived,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "metadata": self.flag_metadata,
        }
