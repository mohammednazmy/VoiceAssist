"""
Session model for conversation tracking
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class Session(Base):
    """Session model for tracking conversations"""

    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=True)

    # Organization
    folder_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversation_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    archived = Column(Integer, default=0, nullable=False)  # 0 = active, 1 = archived

    # Session metadata
    context = Column(JSONB, nullable=True)  # Additional context data
    message_count = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    ended_at = Column(DateTime, nullable=True)

    # Relationships
    folder = relationship("ConversationFolder", back_populates="sessions")

    def __repr__(self):
        return f"<Session(id={self.id}, user_id={self.user_id})>"
