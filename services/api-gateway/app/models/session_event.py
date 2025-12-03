"""
Session Event model for structured event logging.

This model captures key events during conversation/voice sessions for:
- Debugging voice + chat behavior
- Performance analysis
- Audit trails
- Session replay/inspection
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID


class EventType(str, Enum):
    """Types of session events that can be logged."""

    # Connection events
    WEBSOCKET_CONNECT = "websocket.connect"
    WEBSOCKET_DISCONNECT = "websocket.disconnect"
    VOICE_CONNECT = "voice.connect"
    VOICE_DISCONNECT = "voice.disconnect"
    VOICE_RECONNECT = "voice.reconnect"

    # Transcript events
    TRANSCRIPT_PARTIAL = "transcript.partial"
    TRANSCRIPT_FINAL = "transcript.final"

    # Message events
    MESSAGE_CREATED = "message.created"
    MESSAGE_UPDATED = "message.updated"
    MESSAGE_DELETED = "message.deleted"
    MESSAGE_STREAMING_START = "message.streaming.start"
    MESSAGE_STREAMING_CHUNK = "message.streaming.chunk"
    MESSAGE_STREAMING_DONE = "message.streaming.done"

    # Branch events
    BRANCH_CREATED = "branch.created"
    BRANCH_SWITCHED = "branch.switched"

    # Voice events
    VOICE_SPEAKING_START = "voice.speaking.start"
    VOICE_SPEAKING_END = "voice.speaking.end"
    VOICE_VAD_START = "voice.vad.start"
    VOICE_VAD_END = "voice.vad.end"

    # Error events
    ERROR_WEBSOCKET = "error.websocket"
    ERROR_VOICE = "error.voice"
    ERROR_API = "error.api"
    ERROR_BACKEND = "error.backend"

    # Session events
    SESSION_CREATED = "session.created"
    SESSION_RESUMED = "session.resumed"
    SESSION_EXPIRED = "session.expired"

    # Custom events
    CUSTOM = "custom"


class SessionEvent(Base):
    """
    Model for storing structured session events.

    Events are keyed by:
    - conversation_id: The conversation these events belong to
    - session_id: The specific session (e.g., WebSocket session, voice session)
    - branch_id: Optional branch context

    Events include:
    - event_type: Categorized event type from EventType enum
    - payload: JSON payload with event-specific data
    - timestamp: When the event occurred
    """

    __tablename__ = "session_events"

    # Table indexes for efficient querying
    __table_args__ = (
        Index("ix_session_events_conversation_time", "conversation_id", "created_at"),
        Index("ix_session_events_session_time", "session_id", "created_at"),
        Index("ix_session_events_type_time", "event_type", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys / context
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(String(100), nullable=True, index=True)  # WS session ID, voice session ID, etc.
    branch_id = Column(String(100), nullable=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Event data
    event_type = Column(String(100), nullable=False, index=True)
    payload = Column(JSONB, nullable=True)  # Event-specific data

    # Metadata
    source = Column(String(50), nullable=True)  # 'frontend', 'backend', 'voice-service'
    trace_id = Column(String(100), nullable=True, index=True)  # For request tracing

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<SessionEvent(id={self.id}, type={self.event_type}, " f"conversation={self.conversation_id})>"

    @classmethod
    def create(
        cls,
        conversation_id: uuid.UUID,
        event_type: str | EventType,
        payload: Optional[dict] = None,
        session_id: Optional[str] = None,
        branch_id: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
        source: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> "SessionEvent":
        """
        Factory method to create a new session event.

        Args:
            conversation_id: ID of the conversation
            event_type: Type of event (from EventType enum or string)
            payload: JSON-serializable event data
            session_id: Optional session identifier
            branch_id: Optional branch identifier
            user_id: Optional user identifier
            source: Source of the event (frontend, backend, etc.)
            trace_id: Optional trace ID for request correlation

        Returns:
            SessionEvent instance
        """
        return cls(
            conversation_id=conversation_id,
            event_type=(event_type.value if isinstance(event_type, EventType) else event_type),
            payload=payload,
            session_id=session_id,
            branch_id=branch_id,
            user_id=user_id,
            source=source,
            trace_id=trace_id,
        )
