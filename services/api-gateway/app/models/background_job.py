"""
Background Job model for task queue tracking and progress monitoring.

This model provides persistent tracking for async tasks processed by ARQ,
enabling progress monitoring, job history, and retry management.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.database import Base
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class BackgroundJob(Base):
    """Background job tracking model."""

    __tablename__ = "background_jobs"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # ARQ job reference
    arq_job_id = Column(String(255), unique=True, nullable=True, index=True)

    # Job type classification
    job_type = Column(String(100), nullable=False, index=True)
    # Types: document_processing, enhanced_extraction, tts_generation,
    #        embedding_generation, phi_scan, document_reindex, maintenance

    # Status tracking
    status = Column(String(50), nullable=False, default="pending", index=True)
    # Statuses: pending, running, completed, failed, cancelled

    # Priority (1=highest, 10=lowest)
    priority = Column(Integer, nullable=False, default=5)

    # Context references
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tenant_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Payload and results
    input_payload = Column(JSONB, nullable=True)
    result_payload = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    error_traceback = Column(Text, nullable=True)

    # Progress tracking
    progress = Column(Integer, nullable=False, default=0)
    progress_message = Column(String(500), nullable=True)
    progress_details = Column(JSONB, nullable=True)

    # Timing
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Retry tracking
    retry_count = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=3)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    document = relationship("Document", backref="jobs", foreign_keys=[document_id])
    user = relationship("User", backref="background_jobs", foreign_keys=[user_id])

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="valid_job_status",
        ),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "arq_job_id": self.arq_job_id,
            "job_type": self.job_type,
            "status": self.status,
            "priority": self.priority,
            "document_id": str(self.document_id) if self.document_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "progress_details": self.progress_details,
            "result": self.result_payload,
            "error": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
        }

    def to_brief_dict(self) -> Dict[str, Any]:
        """Convert to brief dictionary for list views."""
        return {
            "id": str(self.id),
            "job_type": self.job_type,
            "status": self.status,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def mark_started(self) -> None:
        """Mark job as started."""
        self.status = "running"
        self.started_at = datetime.utcnow()

    def mark_completed(self, result: Optional[Dict[str, Any]] = None) -> None:
        """Mark job as successfully completed."""
        self.status = "completed"
        self.progress = 100
        self.completed_at = datetime.utcnow()
        if result:
            self.result_payload = result

    def mark_failed(self, error: str, traceback: Optional[str] = None) -> None:
        """Mark job as failed."""
        self.status = "failed"
        self.error_message = error
        self.error_traceback = traceback
        self.completed_at = datetime.utcnow()

    def mark_cancelled(self) -> None:
        """Mark job as cancelled."""
        self.status = "cancelled"
        self.completed_at = datetime.utcnow()

    def update_progress(
        self,
        progress: int,
        message: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Update job progress."""
        self.progress = min(100, max(0, progress))
        if message:
            self.progress_message = message
        if details:
            self.progress_details = details

    def should_retry(self) -> bool:
        """Check if job should be retried."""
        return self.status == "failed" and self.retry_count < self.max_retries

    def schedule_retry(self, delay_seconds: int = 60) -> None:
        """Schedule job for retry."""
        from datetime import timedelta

        self.retry_count += 1
        self.next_retry_at = datetime.utcnow() + timedelta(seconds=delay_seconds)
        self.status = "pending"  # Reset to pending for retry

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get job duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        elif self.started_at:
            return (datetime.utcnow() - self.started_at).total_seconds()
        return None

    def __repr__(self) -> str:
        return f"<BackgroundJob {self.id} type={self.job_type} status={self.status}>"
