"""
Response Validation model for tracking answer validation against sources.

Stores validation results including claim extraction, source attribution,
and confidence scoring for RAG responses.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class ResponseValidation(Base):
    """
    Stores validation results for RAG responses.

    Tracks how well an AI response is supported by source documents.
    """

    __tablename__ = "response_validations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Original content
    query_text = Column(Text, nullable=False)
    response_text = Column(Text, nullable=False)

    # Validation results
    overall_confidence = Column(Float, nullable=True)
    claims_total = Column(Integer, nullable=False, default=0)
    claims_validated = Column(Integer, nullable=False, default=0)
    claims_partial = Column(Integer, nullable=False, default=0)
    claims_unsupported = Column(Integer, nullable=False, default=0)

    # Detailed breakdown
    validation_details = Column(JSONB, nullable=True)
    annotated_response = Column(Text, nullable=True)

    # Timing
    validation_time_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    citations = relationship(
        "ResponseValidationCitation",
        back_populates="validation",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "query_id": str(self.query_id) if self.query_id else None,
            "message_id": str(self.message_id) if self.message_id else None,
            "session_id": str(self.session_id) if self.session_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "query_text": self.query_text,
            "response_text": self.response_text,
            "overall_confidence": self.overall_confidence,
            "claims_total": self.claims_total,
            "claims_validated": self.claims_validated,
            "claims_partial": self.claims_partial,
            "claims_unsupported": self.claims_unsupported,
            "validation_details": self.validation_details,
            "annotated_response": self.annotated_response,
            "validation_time_ms": self.validation_time_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_summary(self) -> Dict[str, Any]:
        """Get summary for display."""
        return {
            "id": str(self.id),
            "overall_confidence": self.overall_confidence,
            "claims_total": self.claims_total,
            "claims_validated": self.claims_validated,
            "claims_unsupported": self.claims_unsupported,
            "support_ratio": self.claims_validated / self.claims_total if self.claims_total > 0 else 0,
            "validation_time_ms": self.validation_time_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @property
    def support_ratio(self) -> float:
        """Calculate the ratio of supported claims."""
        if self.claims_total == 0:
            return 0.0
        return (self.claims_validated + 0.5 * self.claims_partial) / self.claims_total

    @property
    def has_hallucinations(self) -> bool:
        """Check if response has potential hallucinations."""
        return self.claims_unsupported > 0


class ResponseValidationCitation(Base):
    """
    Individual citation linking a claim to its source.

    Each claim in a response is tracked with its supporting evidence.
    """

    __tablename__ = "response_validation_citations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    validation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("response_validations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Claim info
    claim_text = Column(Text, nullable=False)
    claim_index = Column(Integer, nullable=False)
    claim_type = Column(String(50), nullable=True)  # factual, opinion, procedural
    claim_start_char = Column(Integer, nullable=True)
    claim_end_char = Column(Integer, nullable=True)

    # Source info
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    document_title = Column(String(500), nullable=True)
    page_number = Column(Integer, nullable=True)
    chunk_id = Column(String(255), nullable=True)
    chunk_text = Column(Text, nullable=True)

    # Match quality
    similarity_score = Column(Float, nullable=True)
    exact_match = Column(Boolean, nullable=False, default=False)
    relevant_excerpt = Column(Text, nullable=True)

    # Status
    status = Column(String(50), nullable=False)  # supported, partial, unsupported
    confidence = Column(Float, nullable=True)
    explanation = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    validation = relationship("ResponseValidation", back_populates="citations")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "validation_id": str(self.validation_id),
            "claim_text": self.claim_text,
            "claim_index": self.claim_index,
            "claim_type": self.claim_type,
            "claim_start_char": self.claim_start_char,
            "claim_end_char": self.claim_end_char,
            "document_id": str(self.document_id) if self.document_id else None,
            "document_title": self.document_title,
            "page_number": self.page_number,
            "chunk_id": self.chunk_id,
            "chunk_text": self.chunk_text,
            "similarity_score": self.similarity_score,
            "exact_match": self.exact_match,
            "relevant_excerpt": self.relevant_excerpt,
            "status": self.status,
            "confidence": self.confidence,
            "explanation": self.explanation,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_inline_citation(self) -> str:
        """Format as inline citation for annotated response."""
        if self.status == "unsupported":
            return f"[⚠️ Unverified]"
        elif self.status == "partial":
            return f"[{self.document_title or 'Source'}, p.{self.page_number or '?'}*]"
        else:
            return f"[{self.document_title or 'Source'}, p.{self.page_number or '?'}]"

    @property
    def is_supported(self) -> bool:
        """Check if claim is supported."""
        return self.status == "supported"

    @property
    def is_partial(self) -> bool:
        """Check if claim is partially supported."""
        return self.status == "partial"

    @property
    def is_unsupported(self) -> bool:
        """Check if claim is unsupported."""
        return self.status == "unsupported"
