"""
Multi-modal search models for CLIP-based image and text search.

Stores document images, CLIP embeddings, and search analytics.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship


class DocumentImage(Base):
    """
    Represents an extracted image from a document.

    Stores the image file, CLIP embedding, and associated metadata.
    """

    __tablename__ = "document_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number = Column(Integer, nullable=True)
    image_index = Column(Integer, nullable=False)  # Index within page

    # Image storage
    storage_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=True)
    image_format = Column(String(20), nullable=True)  # png, jpg
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes

    # Content analysis
    caption = Column(Text, nullable=True)
    alt_text = Column(Text, nullable=True)
    image_type = Column(String(50), nullable=True)  # figure, chart, diagram, photo
    ocr_text = Column(Text, nullable=True)

    # CLIP embedding (512 dimensions)
    clip_embedding = Column(ARRAY(Float), nullable=True)
    embedding_model = Column(String(100), nullable=True)

    # Context
    surrounding_text = Column(Text, nullable=True)
    image_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", foreign_keys=[document_id])

    # Image type constants
    TYPE_FIGURE = "figure"
    TYPE_CHART = "chart"
    TYPE_DIAGRAM = "diagram"
    TYPE_PHOTO = "photo"
    TYPE_TABLE_IMAGE = "table_image"
    TYPE_SCREENSHOT = "screenshot"
    TYPE_OTHER = "other"

    VALID_IMAGE_TYPES = [
        TYPE_FIGURE, TYPE_CHART, TYPE_DIAGRAM, TYPE_PHOTO,
        TYPE_TABLE_IMAGE, TYPE_SCREENSHOT, TYPE_OTHER
    ]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "page_number": self.page_number,
            "image_index": self.image_index,
            "storage_path": self.storage_path,
            "thumbnail_path": self.thumbnail_path,
            "image_format": self.image_format,
            "width": self.width,
            "height": self.height,
            "file_size": self.file_size,
            "caption": self.caption,
            "alt_text": self.alt_text,
            "image_type": self.image_type,
            "ocr_text": self.ocr_text,
            "has_embedding": self.clip_embedding is not None,
            "embedding_model": self.embedding_model,
            "surrounding_text": self.surrounding_text,
            "metadata": self.image_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_search_result(self, score: float = None) -> Dict[str, Any]:
        """Format as search result."""
        return {
            "id": str(self.id),
            "type": "image",
            "document_id": str(self.document_id),
            "page_number": self.page_number,
            "image_type": self.image_type,
            "caption": self.caption,
            "thumbnail_path": self.thumbnail_path,
            "score": score,
        }


class MultimodalTextChunk(Base):
    """
    Text chunk with CLIP embedding for multi-modal search.

    Allows searching for text using image queries and vice versa.
    """

    __tablename__ = "multimodal_text_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_id = Column(String(255), nullable=True)  # Reference to original chunk
    page_number = Column(Integer, nullable=True)

    # Text content
    text_content = Column(Text, nullable=False)
    text_type = Column(String(50), nullable=True)  # paragraph, header, caption, list

    # CLIP embedding
    clip_embedding = Column(ARRAY(Float), nullable=True)
    embedding_model = Column(String(100), nullable=True)

    # Metadata
    chunk_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", foreign_keys=[document_id])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "chunk_id": self.chunk_id,
            "page_number": self.page_number,
            "text_content": self.text_content,
            "text_type": self.text_type,
            "has_embedding": self.clip_embedding is not None,
            "embedding_model": self.embedding_model,
            "metadata": self.chunk_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_search_result(self, score: float = None) -> Dict[str, Any]:
        """Format as search result."""
        return {
            "id": str(self.id),
            "type": "text",
            "document_id": str(self.document_id),
            "page_number": self.page_number,
            "text_content": self.text_content[:500] if self.text_content else None,
            "text_type": self.text_type,
            "score": score,
        }


class MultimodalSearchLog(Base):
    """
    Logs multi-modal search queries for analytics.

    Tracks search patterns and performance metrics.
    """

    __tablename__ = "multimodal_search_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    query_text = Column(Text, nullable=True)
    query_image_path = Column(String(500), nullable=True)
    search_type = Column(String(50), nullable=False)
    results_count = Column(Integer, nullable=True)
    top_result_score = Column(Float, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    filters_applied = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    # Search type constants
    TEXT_TO_IMAGE = "text_to_image"
    IMAGE_TO_TEXT = "image_to_text"
    IMAGE_TO_IMAGE = "image_to_image"
    TEXT_TO_ALL = "text_to_all"

    VALID_SEARCH_TYPES = [TEXT_TO_IMAGE, IMAGE_TO_TEXT, IMAGE_TO_IMAGE, TEXT_TO_ALL]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "query_text": self.query_text,
            "query_image_path": self.query_image_path,
            "search_type": self.search_type,
            "results_count": self.results_count,
            "top_result_score": self.top_result_score,
            "response_time_ms": self.response_time_ms,
            "filters_applied": self.filters_applied,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DocumentImageExtraction(Base):
    """
    Tracks image extraction status for documents.

    Ensures we don't re-extract images unnecessarily.
    """

    __tablename__ = "document_image_extractions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    status = Column(String(50), nullable=False, default="pending")
    images_count = Column(Integer, nullable=True)
    pages_processed = Column(Integer, nullable=True)
    total_pages = Column(Integer, nullable=True)
    extraction_method = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", foreign_keys=[document_id])

    def mark_processing(self) -> None:
        """Mark extraction as processing."""
        self.status = "processing"
        self.started_at = datetime.utcnow()

    def mark_complete(self, images_count: int, pages_processed: int) -> None:
        """Mark extraction as complete."""
        self.status = "complete"
        self.images_count = images_count
        self.pages_processed = pages_processed
        self.completed_at = datetime.utcnow()

    def mark_failed(self, error: str) -> None:
        """Mark extraction as failed."""
        self.status = "failed"
        self.error_message = error
        self.completed_at = datetime.utcnow()

    def update_progress(self, pages_processed: int, total_pages: int) -> None:
        """Update processing progress."""
        self.pages_processed = pages_processed
        self.total_pages = total_pages

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "status": self.status,
            "images_count": self.images_count,
            "pages_processed": self.pages_processed,
            "total_pages": self.total_pages,
            "extraction_method": self.extraction_method,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @property
    def progress_percentage(self) -> Optional[int]:
        """Get progress as percentage."""
        if self.status == "complete":
            return 100
        if self.total_pages and self.pages_processed:
            return int((self.pages_processed / self.total_pages) * 100)
        return 0
