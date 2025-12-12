"""
Document model for knowledge base document metadata
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class Document(Base):
    """Document model for knowledge base document metadata"""

    __tablename__ = "kb_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(String(255), unique=True, nullable=False, index=True)

    # Document metadata
    title = Column(String(500), nullable=False)
    source_type = Column(String(100), nullable=False, index=True)  # 'uploaded', 'guideline', 'journal', etc.
    filename = Column(String(500), nullable=True)
    file_type = Column(String(50), nullable=True)  # 'pdf', 'txt', 'md', 'docx', etc.

    # Document structure (for voice navigation)
    total_pages = Column(Integer, nullable=True)
    has_toc = Column(Boolean, default=False, nullable=False)
    has_figures = Column(Boolean, default=False, nullable=False)
    structure = Column("document_structure", JSONB, nullable=True)
    # Structure schema:
    # {
    #   "pages": [{"page_number": 1, "text": "...", "start_char": 0, "end_char": 2500, "word_count": 450, "figures": []}],
    #   "toc": [{"title": "Chapter 1", "level": 1, "page_number": 5, "section_id": "sec_1"}],
    #   "sections": [{"section_id": "sec_1", "title": "Chapter 1", "level": 1, "start_page": 5, "end_page": 25}],
    #   "figures": [{"figure_id": "fig_1", "page_number": 12, "caption": "...", "description": "..."}]
    # }

    # Enhanced structure from GPT-4 Vision analysis
    enhanced_structure = Column(JSONB, nullable=True)
    # Enhanced structure schema:
    # {
    #   "pages": [{
    #     "page_number": 1,
    #     "content_blocks": [
    #       {"type": "text", "content": "...", "bbox": [...], "style": {...}},
    #       {"type": "table", "headers": [...], "rows": [...], "caption": "..."},
    #       {"type": "figure", "figure_id": "...", "caption": "...", "description": "..."}
    #     ],
    #     "voice_narration": "AI-generated voice summary",
    #     "raw_text": "Original extracted text"
    #   }],
    #   "metadata": {"total_pages": 47, "processing_cost": 0.60, "processed_at": "..."}
    # }

    # Processing pipeline tracking
    processing_stage = Column(String(50), default="pending", nullable=False)  # pending, extracting, analyzing, complete, failed
    processing_progress = Column(Integer, default=0, nullable=False)  # 0-100 percentage
    page_images_path = Column(String(500), nullable=True)  # Storage path for rendered page images

    # Ownership and visibility
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    is_public = Column(Boolean, default=False, nullable=False)

    # Indexing information
    chunks_indexed = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=True)  # Total tokens in document
    indexing_status = Column(String(50), default="processing", nullable=False)  # 'indexed', 'processing', 'failed'
    indexing_error = Column(Text, nullable=True)  # Error message if indexing failed

    # Additional metadata (flexible JSON field)
    doc_metadata = Column("metadata", JSONB, nullable=True)  # Arbitrary metadata (renamed to avoid SQLAlchemy conflict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="documents", foreign_keys=[owner_id])
    organization = relationship("Organization", foreign_keys=[organization_id])

    def __repr__(self):
        return f"<Document(id={self.id}, document_id={self.document_id}, title={self.title})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "document_id": self.document_id,
            "title": self.title,
            "source_type": self.source_type,
            "filename": self.filename,
            "file_type": self.file_type,
            "total_pages": self.total_pages,
            "has_toc": self.has_toc,
            "has_figures": self.has_figures,
            "is_public": self.is_public,
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "owner_id": str(self.owner_id) if self.owner_id else None,
            "chunks_indexed": self.chunks_indexed,
            "indexing_status": self.indexing_status,
            "indexing_error": self.indexing_error,
            "processing_stage": self.processing_stage,
            "processing_progress": self.processing_progress,
            "has_enhanced_structure": self.enhanced_structure is not None,
            "page_images_path": self.page_images_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
