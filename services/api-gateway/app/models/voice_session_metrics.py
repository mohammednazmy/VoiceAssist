"""Voice Session Metrics Model (Phase 11.1).

Stores analytics data for voice sessions including latency metrics,
provider usage, costs, and quality indicators.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict
from uuid import UUID

from app.core.database import Base
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID


class VoiceSessionMetrics(Base):
    """Voice session metrics model for analytics.

    Attributes:
        id: Unique identifier
        session_id: Voice session identifier
        user_id: User who initiated the session
        started_at: When the session started
        ended_at: When the session ended
        duration_seconds: Total session duration
        stt_latency_avg_ms: Average STT latency
        tts_latency_avg_ms: Average TTS latency
        response_latency_avg_ms: Average response latency
        tts_provider: TTS provider used (openai, elevenlabs)
        voice_id: Voice ID used
        estimated_cost_usd: Total estimated cost
        error_count: Number of errors during session
    """

    __tablename__ = "voice_session_metrics"

    id = Column(PGUUID(as_uuid=True), primary_key=True)
    session_id = Column(String(255), nullable=False, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Timing
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Numeric(10, 2), nullable=True)

    # Latency metrics (milliseconds)
    stt_latency_avg_ms = Column(Numeric(10, 2), nullable=True)
    stt_latency_p95_ms = Column(Numeric(10, 2), nullable=True)
    tts_latency_avg_ms = Column(Numeric(10, 2), nullable=True)
    tts_latency_p95_ms = Column(Numeric(10, 2), nullable=True)
    response_latency_avg_ms = Column(Numeric(10, 2), nullable=True)
    response_latency_p95_ms = Column(Numeric(10, 2), nullable=True)

    # Provider info
    stt_provider = Column(String(50), nullable=True)
    tts_provider = Column(String(50), nullable=True)
    voice_id = Column(String(100), nullable=True)
    language = Column(String(10), nullable=True)

    # Usage metrics
    message_count = Column(Integer, nullable=True, default=0)
    audio_seconds_processed = Column(Numeric(10, 2), nullable=True)
    characters_synthesized = Column(Integer, nullable=True, default=0)

    # Cost tracking
    estimated_cost_usd = Column(Numeric(10, 6), nullable=True)
    stt_cost_usd = Column(Numeric(10, 6), nullable=True)
    tts_cost_usd = Column(Numeric(10, 6), nullable=True)
    llm_cost_usd = Column(Numeric(10, 6), nullable=True)

    # Quality metrics
    error_count = Column(Integer, nullable=True, default=0)
    echo_detection_count = Column(Integer, nullable=True, default=0)
    vad_trigger_count = Column(Integer, nullable=True, default=0)

    # Session metadata
    session_type = Column(String(50), nullable=True)
    client_info = Column(JSON, nullable=True)
    session_metadata = Column(JSON, nullable=True)  # Named to avoid SQLAlchemy reserved 'metadata'

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<VoiceSessionMetrics(session_id='{self.session_id}', user_id='{self.user_id}')>"

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            "id": str(self.id) if self.id else None,
            "session_id": self.session_id,
            "user_id": str(self.user_id) if self.user_id else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": float(self.duration_seconds) if self.duration_seconds else None,
            "stt_latency_avg_ms": float(self.stt_latency_avg_ms) if self.stt_latency_avg_ms else None,
            "stt_latency_p95_ms": float(self.stt_latency_p95_ms) if self.stt_latency_p95_ms else None,
            "tts_latency_avg_ms": float(self.tts_latency_avg_ms) if self.tts_latency_avg_ms else None,
            "tts_latency_p95_ms": float(self.tts_latency_p95_ms) if self.tts_latency_p95_ms else None,
            "response_latency_avg_ms": float(self.response_latency_avg_ms) if self.response_latency_avg_ms else None,
            "response_latency_p95_ms": float(self.response_latency_p95_ms) if self.response_latency_p95_ms else None,
            "stt_provider": self.stt_provider,
            "tts_provider": self.tts_provider,
            "voice_id": self.voice_id,
            "language": self.language,
            "message_count": self.message_count,
            "audio_seconds_processed": float(self.audio_seconds_processed) if self.audio_seconds_processed else None,
            "characters_synthesized": self.characters_synthesized,
            "estimated_cost_usd": float(self.estimated_cost_usd) if self.estimated_cost_usd else None,
            "stt_cost_usd": float(self.stt_cost_usd) if self.stt_cost_usd else None,
            "tts_cost_usd": float(self.tts_cost_usd) if self.tts_cost_usd else None,
            "llm_cost_usd": float(self.llm_cost_usd) if self.llm_cost_usd else None,
            "error_count": self.error_count,
            "echo_detection_count": self.echo_detection_count,
            "vad_trigger_count": self.vad_trigger_count,
            "session_type": self.session_type,
            "client_info": self.client_info,
            "session_metadata": self.session_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @classmethod
    def from_session_data(
        cls, session_id: str, user_id: UUID, started_at: datetime, session_type: str = "voice", **kwargs
    ) -> "VoiceSessionMetrics":
        """Create a new metrics record from session data."""
        return cls(session_id=session_id, user_id=user_id, started_at=started_at, session_type=session_type, **kwargs)
