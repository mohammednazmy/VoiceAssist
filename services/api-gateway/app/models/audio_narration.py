"""
Audio Narration model for voice narration caching.

Stores pre-generated TTS audio for page narrations, enabling instant
playback without real-time synthesis latency.
"""

import hashlib
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.database import Base
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class AudioNarration(Base):
    """Audio narration cache model."""

    __tablename__ = "audio_narrations"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Document reference
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number = Column(Integer, nullable=False)

    # Audio metadata
    audio_format = Column(String(20), nullable=False, default="mp3")
    duration_seconds = Column(Float, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    sample_rate = Column(Integer, nullable=True, default=24000)

    # Storage
    storage_path = Column(String(500), nullable=True)
    storage_type = Column(String(50), nullable=False, default="local")
    cdn_url = Column(String(500), nullable=True)

    # Source content
    narration_text = Column(Text, nullable=False)
    narration_hash = Column(String(64), nullable=False)

    # TTS configuration
    voice_id = Column(String(100), nullable=True)
    voice_provider = Column(String(50), nullable=False, default="openai")
    voice_settings = Column(JSONB, nullable=True)

    # Status
    status = Column(String(50), nullable=False, default="pending", index=True)
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    document = relationship("Document", backref="audio_narrations", foreign_keys=[document_id])

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "audio_format IN ('mp3', 'wav', 'opus', 'aac')",
            name="valid_audio_format",
        ),
        CheckConstraint(
            "status IN ('pending', 'generating', 'ready', 'failed')",
            name="valid_narration_status",
        ),
        UniqueConstraint(
            "document_id", "page_number",
            name="uq_audio_document_page",
        ),
    )

    @staticmethod
    def hash_text(text: str) -> str:
        """Generate SHA256 hash of narration text for cache key."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "page_number": self.page_number,
            "audio_format": self.audio_format,
            "duration_seconds": self.duration_seconds,
            "file_size_bytes": self.file_size_bytes,
            "voice_id": self.voice_id,
            "voice_provider": self.voice_provider,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "stream_url": self.get_stream_url(),
        }

    def to_brief_dict(self) -> Dict[str, Any]:
        """Convert to brief dictionary for list views."""
        return {
            "id": str(self.id),
            "page_number": self.page_number,
            "duration_seconds": self.duration_seconds,
            "status": self.status,
            "stream_url": self.get_stream_url() if self.status == "ready" else None,
        }

    def get_stream_url(self) -> Optional[str]:
        """Get URL for streaming this audio."""
        if self.status != "ready":
            return None
        if self.cdn_url:
            return self.cdn_url
        return f"/api/audio/narrations/{self.id}/stream"

    def mark_generating(self) -> None:
        """Mark narration as currently being generated."""
        self.status = "generating"

    def mark_ready(
        self,
        storage_path: str,
        duration_seconds: float,
        file_size_bytes: int,
    ) -> None:
        """Mark narration as ready after successful generation."""
        self.status = "ready"
        self.storage_path = storage_path
        self.duration_seconds = duration_seconds
        self.file_size_bytes = file_size_bytes
        self.generated_at = datetime.utcnow()

    def mark_failed(self, error: str) -> None:
        """Mark narration as failed."""
        self.status = "failed"
        self.error_message = error

    def record_access(self) -> None:
        """Record that this narration was accessed."""
        self.last_accessed_at = datetime.utcnow()

    def needs_regeneration(self, new_text: str) -> bool:
        """Check if narration needs regeneration due to text change."""
        return self.narration_hash != self.hash_text(new_text)

    @property
    def is_ready(self) -> bool:
        """Check if audio is ready for streaming."""
        return self.status == "ready" and self.storage_path is not None

    def __repr__(self) -> str:
        return f"<AudioNarration {self.id} doc={self.document_id} page={self.page_number} status={self.status}>"
