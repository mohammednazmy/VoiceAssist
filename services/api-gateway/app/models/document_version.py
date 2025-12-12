"""
Document Version and Freshness Alert models for document versioning.

Tracks document versions, content changes, and freshness alerts
for knowledge base documents.
"""

import uuid
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, BigInteger
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class DocumentVersion(Base):
    """
    Stores version history for knowledge base documents.

    Tracks content changes, source updates, and maintains
    historical snapshots of document structure.
    """

    __tablename__ = "document_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False)

    # Version metadata
    change_type = Column(String(50), nullable=True)  # initial, update, correction, superseded
    change_summary = Column(Text, nullable=True)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Content snapshot
    content_hash = Column(String(64), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    enhanced_structure = Column(JSONB, nullable=True)

    # Source tracking
    source_url = Column(String(1000), nullable=True)
    source_published_date = Column(Date, nullable=True)
    source_accessed_date = Column(Date, nullable=True)

    # Diff tracking
    pages_added = Column(Integer, nullable=True)
    pages_removed = Column(Integer, nullable=True)
    pages_modified = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", foreign_keys=[document_id])
    changed_by_user = relationship("User", foreign_keys=[changed_by])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "version_number": self.version_number,
            "change_type": self.change_type,
            "change_summary": self.change_summary,
            "changed_by": str(self.changed_by) if self.changed_by else None,
            "content_hash": self.content_hash,
            "file_path": self.file_path,
            "file_size_bytes": self.file_size_bytes,
            "source_url": self.source_url,
            "source_published_date": self.source_published_date.isoformat() if self.source_published_date else None,
            "source_accessed_date": self.source_accessed_date.isoformat() if self.source_accessed_date else None,
            "pages_added": self.pages_added,
            "pages_removed": self.pages_removed,
            "pages_modified": self.pages_modified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_summary(self) -> Dict[str, Any]:
        """Get brief summary for listing."""
        return {
            "id": str(self.id),
            "version_number": self.version_number,
            "change_type": self.change_type,
            "change_summary": self.change_summary[:100] if self.change_summary else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @property
    def has_structure(self) -> bool:
        """Check if version has enhanced structure."""
        return self.enhanced_structure is not None

    @property
    def total_changes(self) -> int:
        """Total page changes in this version."""
        return (self.pages_added or 0) + (self.pages_removed or 0) + (self.pages_modified or 0)


class FreshnessAlert(Base):
    """
    Tracks freshness alerts for documents.

    Alerts admins when documents become stale, sources change,
    or documents are superseded.
    """

    __tablename__ = "freshness_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Alert info
    alert_type = Column(String(50), nullable=False)  # stale, source_changed, superseded, aging
    severity = Column(String(20), nullable=False)  # info, warning, critical
    message = Column(Text, nullable=True)
    source_check_result = Column(JSONB, nullable=True)

    # Acknowledgment
    acknowledged = Column(Boolean, nullable=False, default=False)
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", foreign_keys=[document_id])
    acknowledged_by_user = relationship("User", foreign_keys=[acknowledged_by])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "source_check_result": self.source_check_result,
            "acknowledged": self.acknowledged,
            "acknowledged_by": str(self.acknowledged_by) if self.acknowledged_by else None,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def acknowledge(self, user_id: uuid.UUID) -> None:
        """Mark alert as acknowledged."""
        self.acknowledged = True
        self.acknowledged_by = user_id
        self.acknowledged_at = datetime.utcnow()

    @property
    def is_critical(self) -> bool:
        """Check if alert is critical severity."""
        return self.severity == "critical"

    @property
    def is_warning(self) -> bool:
        """Check if alert is warning severity."""
        return self.severity == "warning"

    @property
    def age_hours(self) -> float:
        """Get alert age in hours."""
        if not self.created_at:
            return 0
        delta = datetime.utcnow() - self.created_at.replace(tzinfo=None)
        return delta.total_seconds() / 3600
