"""
Entity models for Knowledge Graph.

Stores medical entities, their mentions in documents,
and relationships between entities.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship


class Entity(Base):
    """
    Represents a unique medical entity (drug, condition, procedure, etc.).

    Stores canonical form and links to external databases like UMLS.
    """

    __tablename__ = "entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    neo4j_id = Column(String(100), unique=True, nullable=True)  # Optional Neo4j integration
    name = Column(String(500), nullable=False, index=True)
    canonical_name = Column(String(500), nullable=True, index=True)
    entity_type = Column(String(50), nullable=False, index=True)  # drug, condition, procedure, anatomy, symptom, etc.
    aliases = Column(ARRAY(Text), nullable=True)

    # External identifiers
    external_ids = Column(JSONB, nullable=True)  # {umls_cui, rxnorm, snomed, icd10, etc.}
    description = Column(Text, nullable=True)

    # Statistics
    mention_count = Column(Integer, nullable=False, default=0)
    document_count = Column(Integer, nullable=False, default=0)

    # Metadata (column name 'metadata', attribute name avoids SQLAlchemy reserved word)
    entity_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    mentions = relationship("EntityMention", back_populates="entity", cascade="all, delete-orphan")
    outgoing_relationships = relationship(
        "EntityRelationship",
        foreign_keys="EntityRelationship.source_entity_id",
        back_populates="source_entity",
        cascade="all, delete-orphan",
    )
    incoming_relationships = relationship(
        "EntityRelationship",
        foreign_keys="EntityRelationship.target_entity_id",
        back_populates="target_entity",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "name": self.name,
            "canonical_name": self.canonical_name,
            "entity_type": self.entity_type,
            "aliases": self.aliases,
            "external_ids": self.external_ids,
            "description": self.description,
            "mention_count": self.mention_count,
            "document_count": self.document_count,
            "metadata": self.entity_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_brief(self) -> Dict[str, Any]:
        """Get brief representation for listings."""
        return {
            "id": str(self.id),
            "name": self.canonical_name or self.name,
            "entity_type": self.entity_type,
            "mention_count": self.mention_count,
        }

    def increment_mention_count(self) -> None:
        """Increment mention count."""
        self.mention_count = (self.mention_count or 0) + 1
        self.updated_at = datetime.utcnow()

    @property
    def display_name(self) -> str:
        """Get display name (canonical or original)."""
        return self.canonical_name or self.name

    @property
    def umls_cui(self) -> Optional[str]:
        """Get UMLS Concept Unique Identifier."""
        if self.external_ids:
            return self.external_ids.get("umls_cui")
        return None


class EntityMention(Base):
    """
    Tracks where an entity is mentioned in a document.

    Links entities to specific locations in documents for citation.
    """

    __tablename__ = "entity_mentions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_id = Column(String(255), nullable=True)
    page_number = Column(Integer, nullable=True)

    # Location in text
    start_char = Column(Integer, nullable=True)
    end_char = Column(Integer, nullable=True)
    context_text = Column(Text, nullable=True)

    # Extraction metadata
    confidence = Column(Float, nullable=True)
    extraction_method = Column(String(50), nullable=True)  # llm, scispacy, regex

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    entity = relationship("Entity", back_populates="mentions")
    document = relationship("Document", foreign_keys=[document_id])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "entity_id": str(self.entity_id),
            "document_id": str(self.document_id),
            "chunk_id": self.chunk_id,
            "page_number": self.page_number,
            "start_char": self.start_char,
            "end_char": self.end_char,
            "context_text": self.context_text,
            "confidence": self.confidence,
            "extraction_method": self.extraction_method,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class EntityRelationship(Base):
    """
    Represents a relationship between two entities.

    Captures medical relationships like drug-treats-condition,
    drug-interacts-with-drug, etc.
    """

    __tablename__ = "entity_relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relationship_type = Column(String(100), nullable=False, index=True)

    # Evidence
    evidence_text = Column(Text, nullable=True)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    page_number = Column(Integer, nullable=True)

    # Confidence and metadata
    confidence = Column(Float, nullable=True)
    extraction_method = Column(String(50), nullable=True)
    relationship_metadata = Column("metadata", JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    source_entity = relationship("Entity", foreign_keys=[source_entity_id], back_populates="outgoing_relationships")
    target_entity = relationship("Entity", foreign_keys=[target_entity_id], back_populates="incoming_relationships")
    document = relationship("Document", foreign_keys=[document_id])

    __table_args__ = (
        UniqueConstraint("source_entity_id", "target_entity_id", "relationship_type", name="uq_entity_relationship"),
    )

    # Relationship type constants
    TREATS = "treats"
    CAUSES = "causes"
    CONTRAINDICATED_WITH = "contraindicated_with"
    INTERACTS_WITH = "interacts_with"
    SYMPTOM_OF = "symptom_of"
    SIDE_EFFECT_OF = "side_effect_of"
    LOCATED_IN = "located_in"
    DIAGNOSED_BY = "diagnosed_by"
    PART_OF = "part_of"

    VALID_RELATIONSHIP_TYPES = [
        TREATS, CAUSES, CONTRAINDICATED_WITH, INTERACTS_WITH,
        SYMPTOM_OF, SIDE_EFFECT_OF, LOCATED_IN, DIAGNOSED_BY, PART_OF
    ]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "source_entity_id": str(self.source_entity_id),
            "target_entity_id": str(self.target_entity_id),
            "relationship_type": self.relationship_type,
            "evidence_text": self.evidence_text,
            "document_id": str(self.document_id) if self.document_id else None,
            "page_number": self.page_number,
            "confidence": self.confidence,
            "extraction_method": self.extraction_method,
            "metadata": self.relationship_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_graph_edge(self) -> Dict[str, Any]:
        """Format as graph edge for visualization."""
        return {
            "source": str(self.source_entity_id),
            "target": str(self.target_entity_id),
            "type": self.relationship_type,
            "weight": self.confidence or 1.0,
        }


class DocumentEntityExtraction(Base):
    """
    Tracks entity extraction status for documents.

    Ensures we don't re-extract entities unnecessarily.
    """

    __tablename__ = "document_entity_extractions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    status = Column(String(50), nullable=False, default="pending")  # pending, processing, complete, failed
    entities_count = Column(Integer, nullable=True)
    relationships_count = Column(Integer, nullable=True)
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

    def mark_complete(self, entities_count: int, relationships_count: int) -> None:
        """Mark extraction as complete."""
        self.status = "complete"
        self.entities_count = entities_count
        self.relationships_count = relationships_count
        self.completed_at = datetime.utcnow()

    def mark_failed(self, error: str) -> None:
        """Mark extraction as failed."""
        self.status = "failed"
        self.error_message = error
        self.completed_at = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "status": self.status,
            "entities_count": self.entities_count,
            "relationships_count": self.relationships_count,
            "extraction_method": self.extraction_method,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
