"""Feature Flag Analytics Model (Phase 7 - P3.1+).

Tracks feature flag usage for analytics and monitoring.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID


class FeatureFlagAnalytics(Base):
    """Feature flag usage analytics.

    Tracks when feature flags are checked and their outcomes.
    Used for understanding feature adoption and debugging.

    Attributes:
        id: Unique identifier
        flag_name: Feature flag name
        user_id: User who checked the flag (nullable for anonymous)
        checked_at: When flag was checked
        result: Result of the check (true/false)
        source: Source of the check (api, decorator, service, etc.)
        endpoint: API endpoint where check occurred (if applicable)
        trace_id: Distributed trace ID for correlation
    """

    __tablename__ = "feature_flag_analytics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_name = Column(String(255), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    checked_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    result = Column(Boolean, nullable=False)
    source = Column(String(50), nullable=True)  # 'api', 'decorator', 'service'
    endpoint = Column(String(255), nullable=True)
    trace_id = Column(String(100), nullable=True, index=True)

    __table_args__ = (
        # Composite indexes for common queries
        Index("ix_feature_flag_analytics_flag_date", "flag_name", "checked_at"),
        Index("ix_feature_flag_analytics_user_date", "user_id", "checked_at"),
    )

    def __repr__(self):
        return f"<FeatureFlagAnalytics(flag='{self.flag_name}', user='{self.user_id}', result={self.result})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "id": str(self.id),
            "flag_name": self.flag_name,
            "user_id": str(self.user_id) if self.user_id else None,
            "checked_at": self.checked_at.isoformat() if self.checked_at else None,
            "result": self.result,
            "source": self.source,
            "endpoint": self.endpoint,
            "trace_id": self.trace_id,
        }
