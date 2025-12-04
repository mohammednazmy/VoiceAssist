"""Feature Flag Model (Phase 7 - P3.1, P3.2).

Provides runtime feature toggles for controlled rollouts and A/B testing.
Supports boolean, string, number, JSON, and multivariate feature values.

Phase 3.2 enhancements:
- Multivariate flags with variants for A/B testing
- Targeting/segmentation rules for user-based evaluation
- Schedule support for time-based activation
- Multi-environment support
- Soft-delete (archival) support
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text


class FeatureFlagType(str, Enum):
    """Feature flag value types."""

    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    JSON = "json"
    MULTIVARIATE = "multivariate"  # Phase 3.2: Multiple variants for A/B testing


class FeatureFlag(Base):
    """Feature flag model for runtime configuration.

    Attributes:
        name: Unique feature flag identifier (e.g., 'backend.rbac_enforcement')
        description: Human-readable description of the feature
        flag_type: Type of value (boolean, string, number, json, multivariate)
        enabled: Whether the feature is currently enabled (for boolean flags)
        value: JSON-encoded value for non-boolean flags
        default_value: Default value if flag is not found
        rollout_percentage: Percentage of users to enable (0-100)
        rollout_salt: Salt for consistent user assignment
        variants: List of variant definitions for multivariate flags (Phase 3.2)
        targeting_rules: Segmentation rules for user targeting (Phase 3.2)
        schedule: Scheduled activation/deactivation config (Phase 3.2)
        environment: Environment this flag applies to (Phase 3.2)
        archived: Whether flag is archived/soft-deleted (Phase 3.2)
        archived_at: Timestamp when flag was archived (Phase 3.2)
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

    # Phase 3.2: Advanced flag features
    variants = Column(JSON, nullable=True)  # List of variant definitions
    targeting_rules = Column(JSON, nullable=True)  # Segmentation rules
    schedule = Column(JSON, nullable=True)  # Scheduled activation config
    environment = Column(String(50), nullable=False, default="production")
    archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)

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
            "variants": self.variants,
            "targeting_rules": self.targeting_rules,
            "schedule": self.schedule,
            "environment": self.environment,
            "archived": self.archived,
            "archived_at": self.archived_at.isoformat() if self.archived_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "metadata": self.flag_metadata,
        }

    def get_variant_ids(self) -> List[str]:
        """Get list of variant IDs for multivariate flags."""
        if not self.variants:
            return []
        return [v.get("id") for v in self.variants if v.get("id")]

    def get_variant_by_id(self, variant_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific variant by ID."""
        if not self.variants:
            return None
        for variant in self.variants:
            if variant.get("id") == variant_id:
                return variant
        return None

    def is_scheduled_active(self, now: Optional[datetime] = None) -> bool:
        """Check if the flag is currently active based on schedule.

        Args:
            now: Current time (defaults to utcnow)

        Returns:
            True if no schedule or currently within scheduled window
        """
        if not self.schedule:
            return True

        if now is None:
            now = datetime.utcnow()

        start_at = self.schedule.get("start_at")
        end_at = self.schedule.get("end_at")

        if start_at:
            start_dt = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
            if now < start_dt.replace(tzinfo=None):
                return False

        if end_at:
            end_dt = datetime.fromisoformat(end_at.replace("Z", "+00:00"))
            if now > end_dt.replace(tzinfo=None):
                return False

        return True
