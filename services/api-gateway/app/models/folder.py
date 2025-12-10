"""
Conversation folder model for organizing conversations
"""

import uuid
from datetime import datetime
from typing import Optional

from app.core.database import Base
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship


class ConversationFolder(Base):
    """Conversation folder model for organizing conversations"""

    __tablename__ = "conversation_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Folder information
    name = Column(String(255), nullable=False)
    color = Column(String(50), nullable=True)  # Hex color for UI
    icon = Column(String(50), nullable=True)  # Icon name
    parent_folder_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversation_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    sessions = relationship("Session", back_populates="folder")
    parent = relationship("ConversationFolder", remote_side=[id], backref="children")

    def __repr__(self):
        return f"<ConversationFolder(id={self.id}, name={self.name}, user_id={self.user_id})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "color": self.color,
            "icon": self.icon,
            "parent_folder_id": (str(self.parent_folder_id) if self.parent_folder_id else None),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Pydantic models for API


class FolderCreate(BaseModel):
    """Create folder"""

    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_folder_id: Optional[str] = None


class FolderUpdate(BaseModel):
    """Update folder"""

    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_folder_id: Optional[str] = None


class FolderResponse(BaseModel):
    """Folder response"""

    id: str
    user_id: str
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_folder_id: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True
