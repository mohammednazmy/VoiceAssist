"""
Message attachment model for file uploads in chat
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class MessageAttachment(Base):
    """Message attachment model for file uploads"""

    __tablename__ = "message_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # File information
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)  # 'pdf', 'image', 'text', 'markdown'
    file_size = Column(Integer, nullable=False)  # Size in bytes
    file_url = Column(Text, nullable=False)  # S3/storage URL
    mime_type = Column(String(100), nullable=True)
    file_metadata = Column(JSONB, nullable=True)  # Additional metadata (renamed to avoid SQLAlchemy conflict)

    # Timestamps
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationship
    message = relationship("Message", back_populates="attachments")

    def __repr__(self):
        return f"<MessageAttachment(id={self.id}, file_name={self.file_name}, file_type={self.file_type})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "message_id": str(self.message_id),
            "file_name": self.file_name,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "file_url": self.file_url,
            "mime_type": self.mime_type,
            "file_metadata": self.file_metadata,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
