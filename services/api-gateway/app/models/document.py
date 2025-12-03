"""
Document model for knowledge base document metadata
"""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID


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

    # Indexing information
    chunks_indexed = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=True)  # Total tokens in document
    indexing_status = Column(String(50), default="indexed", nullable=False)  # 'indexed', 'processing', 'failed'
    indexing_error = Column(Text, nullable=True)  # Error message if indexing failed

    # Additional metadata (flexible JSON field)
    doc_metadata = Column("metadata", JSONB, nullable=True)  # Arbitrary metadata (renamed to avoid SQLAlchemy conflict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Document(id={self.id}, document_id={self.document_id}, title={self.title})>"
