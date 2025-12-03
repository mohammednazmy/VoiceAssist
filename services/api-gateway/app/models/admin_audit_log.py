"""
Admin audit log model for privileged actions.

Tracks sensitive administrator actions separately from general audit logs to
provide a focused trail for role changes and knowledge base maintenance.
"""

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID


class AdminAuditLog(Base):
    """Record of admin or viewer actions within the admin surface."""

    __tablename__ = "admin_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    actor_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    actor_role = Column(String(50), nullable=True)

    action = Column(String(150), nullable=False, index=True)
    target_type = Column(String(150), nullable=True)
    target_id = Column(String(255), nullable=True)

    success = Column(Boolean, nullable=False, default=True)
    action_metadata = Column(JSONB, nullable=True)

    request_id = Column(String(100), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - repr utility
        return (
            f"<AdminAuditLog(action={self.action}, actor={self.actor_email}, "
            f"target={self.target_type}:{self.target_id}, success={self.success})>"
        )
