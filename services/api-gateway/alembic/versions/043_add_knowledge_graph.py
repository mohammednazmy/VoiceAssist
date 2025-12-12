"""Add knowledge graph tables for entity extraction and relationships

Revision ID: 043
Revises: 042
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# revision identifiers, used by Alembic.
revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Entity types enum for validation
    entity_type_enum = sa.Enum(
        "drug", "condition", "procedure", "anatomy", "symptom", "test", "device", "organism", "other",
        name="entity_type_enum"
    )
    entity_type_enum.create(op.get_bind(), checkfirst=True)

    # Entities table - stores unique medical entities
    op.create_table(
        "entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("neo4j_id", sa.String(100), unique=True, nullable=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("canonical_name", sa.String(500), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("aliases", ARRAY(sa.Text), nullable=True),
        # External identifiers (UMLS CUI, RxNorm, SNOMED, etc.)
        sa.Column("external_ids", JSONB, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        # Statistics
        sa.Column("mention_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("document_count", sa.Integer, nullable=False, server_default="0"),
        # Metadata
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Entity mentions - tracks where entities appear
    op.create_table(
        "entity_mentions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_id", sa.String(255), nullable=True),
        sa.Column("page_number", sa.Integer, nullable=True),
        # Location in text
        sa.Column("start_char", sa.Integer, nullable=True),
        sa.Column("end_char", sa.Integer, nullable=True),
        sa.Column("context_text", sa.Text, nullable=True),  # Surrounding text
        # Extraction metadata
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("extraction_method", sa.String(50), nullable=True),  # llm, scispacy, regex
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Entity relationships - connections between entities
    op.create_table(
        "entity_relationships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship_type", sa.String(100), nullable=False),  # treats, causes, contraindicated_with, etc.
        # Evidence
        sa.Column("evidence_text", sa.Text, nullable=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("page_number", sa.Integer, nullable=True),
        # Confidence and metadata
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("extraction_method", sa.String(50), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        # Unique constraint to prevent duplicates
        sa.UniqueConstraint("source_entity_id", "target_entity_id", "relationship_type", name="uq_entity_relationship"),
    )

    # Document entity extraction status
    op.create_table(
        "document_entity_extractions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),  # pending, processing, complete, failed
        sa.Column("entities_count", sa.Integer, nullable=True),
        sa.Column("relationships_count", sa.Integer, nullable=True),
        sa.Column("extraction_method", sa.String(50), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes for efficient queries
    op.create_index("ix_entities_name", "entities", ["name"])
    op.create_index("ix_entities_canonical", "entities", ["canonical_name"])
    op.create_index("ix_entities_type", "entities", ["entity_type"])
    op.create_index("ix_entities_mention_count", "entities", ["mention_count"])

    op.create_index("ix_mentions_entity", "entity_mentions", ["entity_id"])
    op.create_index("ix_mentions_document", "entity_mentions", ["document_id"])
    op.create_index("ix_mentions_page", "entity_mentions", ["document_id", "page_number"])

    op.create_index("ix_relationships_source", "entity_relationships", ["source_entity_id"])
    op.create_index("ix_relationships_target", "entity_relationships", ["target_entity_id"])
    op.create_index("ix_relationships_type", "entity_relationships", ["relationship_type"])
    op.create_index("ix_relationships_document", "entity_relationships", ["document_id"])

    op.create_index("ix_extractions_status", "document_entity_extractions", ["status"])


def downgrade() -> None:
    op.drop_table("document_entity_extractions")
    op.drop_table("entity_relationships")
    op.drop_table("entity_mentions")
    op.drop_table("entities")

    # Drop enum
    op.execute("DROP TYPE IF EXISTS entity_type_enum")
