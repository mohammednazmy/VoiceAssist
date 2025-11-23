"""
Message model for conversation history
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class Message(Base):
    """Message model for conversation history"""

    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Message content
    role = Column(String(50), nullable=False)  # 'user', 'assistant', 'system', 'tool'
    content = Column(Text, nullable=False)

    # Conversation branching support
    parent_message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    branch_id = Column(
        String(100), nullable=True, index=True
    )  # Identifies which branch this message belongs to

    # Tool usage tracking
    tool_calls = Column(JSONB, nullable=True)  # Tool calls made in this message
    tool_results = Column(JSONB, nullable=True)  # Results from tool calls

    # Metadata
    tokens = Column(Integer, nullable=True)  # Token count for this message
    model = Column(String(100), nullable=True)  # Model used to generate response
    message_metadata = Column(JSONB, nullable=True)  # Additional metadata

    # PHI detection
    contains_phi = Column(
        Boolean, default=False, nullable=False
    )  # Whether message contains PHI

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    attachments = relationship(
        "MessageAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self):
        return (
            f"<Message(id={self.id}, session_id={self.session_id}, role={self.role})>"
        )
