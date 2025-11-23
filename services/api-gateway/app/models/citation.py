"""
Citation model for tracking source citations in responses
"""

import uuid
from datetime import datetime
from typing import Optional

from app.core.database import Base
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID


class MessageCitation(Base):
    """Citation model linking messages to their sources"""

    __tablename__ = "message_citations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Source identification
    source_id = Column(String(255), nullable=False)  # KB document/chunk ID
    source_type = Column(
        String(50), nullable=False
    )  # textbook|journal|guideline|note
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=True)

    # Source metadata
    authors = Column(JSONB, nullable=True)  # Array of author names
    publication_date = Column(String(50), nullable=True)  # e.g., "2023", "2023-01-15"
    journal = Column(String(255), nullable=True)  # Journal name for articles
    volume = Column(String(50), nullable=True)  # Volume number
    issue = Column(String(50), nullable=True)  # Issue number
    pages = Column(String(50), nullable=True)  # Page range (e.g., "123-145")
    doi = Column(String(255), nullable=True)  # Digital Object Identifier
    pmid = Column(String(50), nullable=True)  # PubMed ID

    # Citation context
    relevance_score = Column(
        Integer, nullable=True
    )  # 0-100 score from semantic search
    quoted_text = Column(Text, nullable=True)  # Excerpt from source used in response
    context = Column(
        JSONB, nullable=True
    )  # Additional context (section, chapter, etc.)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    def __repr__(self):
        return f"<MessageCitation(id={self.id}, source_type={self.source_type}, title={self.title})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "message_id": str(self.message_id),
            "source_id": self.source_id,
            "source_type": self.source_type,
            "title": self.title,
            "url": self.url,
            "authors": self.authors or [],
            "publication_date": self.publication_date,
            "journal": self.journal,
            "volume": self.volume,
            "issue": self.issue,
            "pages": self.pages,
            "doi": self.doi,
            "pmid": self.pmid,
            "relevance_score": self.relevance_score,
            "quoted_text": self.quoted_text,
            "context": self.context or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Pydantic models for API


class CitationCreate(BaseModel):
    """Create citation"""

    source_id: str
    source_type: str
    title: str
    url: Optional[str] = None
    authors: Optional[list] = None
    publication_date: Optional[str] = None
    journal: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    relevance_score: Optional[int] = None
    quoted_text: Optional[str] = None
    context: Optional[dict] = None


class CitationResponse(BaseModel):
    """Citation response"""

    id: str
    message_id: str
    source_id: str
    source_type: str
    title: str
    url: Optional[str] = None
    authors: list = []
    publication_date: Optional[str] = None
    journal: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    relevance_score: Optional[int] = None
    quoted_text: Optional[str] = None
    context: dict = {}
    created_at: str

    class Config:
        from_attributes = True
