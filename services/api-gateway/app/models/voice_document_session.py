"""
Voice Document Session model for tracking document navigation state in voice mode
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship


class VoiceDocumentSession(Base):
    """
    Tracks the active document and current position during voice mode sessions.

    Allows users to navigate through documents using voice commands like
    "read me page 40", "go to the next section", etc.
    """

    __tablename__ = "voice_document_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Session identifiers
    conversation_id = Column(String(255), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    document_id = Column(String(255), ForeignKey("kb_documents.document_id"), nullable=False, index=True)

    # Current position in document
    current_page = Column(Integer, default=1, nullable=False)
    current_section_id = Column(String(100), nullable=True)
    last_read_position = Column(Integer, default=0, nullable=False)  # Character position

    # Session state
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    document = relationship("Document", foreign_keys=[document_id], primaryjoin="VoiceDocumentSession.document_id == Document.document_id")

    def __repr__(self):
        return f"<VoiceDocumentSession(id={self.id}, conversation_id={self.conversation_id}, document_id={self.document_id}, page={self.current_page})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "conversation_id": self.conversation_id,
            "user_id": str(self.user_id),
            "document_id": self.document_id,
            "current_page": self.current_page,
            "current_section_id": self.current_section_id,
            "last_read_position": self.last_read_position,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
