"""Add kb_documents table for knowledge base document metadata

Revision ID: 012
Revises: 011
Create Date: 2025-11-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    """Create kb_documents table for knowledge base document metadata"""
    op.create_table(
        "kb_documents",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "document_id",
            sa.String(255),
            nullable=False,
            unique=True,
            comment="External document identifier (UUID string)",
        ),
        # Document metadata
        sa.Column("title", sa.String(500), nullable=False, comment="Document title"),
        sa.Column(
            "source_type",
            sa.String(100),
            nullable=False,
            comment="Source type: uploaded, guideline, journal, etc.",
        ),
        sa.Column("filename", sa.String(500), nullable=True, comment="Original filename"),
        sa.Column(
            "file_type",
            sa.String(50),
            nullable=True,
            comment="File type: pdf, txt, md, docx, etc.",
        ),
        # Indexing information
        sa.Column(
            "chunks_indexed",
            sa.Integer,
            default=0,
            nullable=False,
            comment="Number of chunks indexed in vector database",
        ),
        sa.Column(
            "total_tokens",
            sa.Integer,
            nullable=True,
            comment="Total tokens in document",
        ),
        sa.Column(
            "indexing_status",
            sa.String(50),
            default="indexed",
            nullable=False,
            comment="Indexing status: indexed, processing, failed",
        ),
        sa.Column(
            "indexing_error",
            sa.Text,
            nullable=True,
            comment="Error message if indexing failed",
        ),
        # Additional metadata (flexible JSON field)
        sa.Column(
            "metadata",
            JSONB,
            nullable=True,
            comment="Additional metadata as JSON",
        ),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    # Indexes for performance
    op.create_index(
        "ix_kb_documents_document_id",
        "kb_documents",
        ["document_id"],
        unique=True,
    )
    op.create_index(
        "ix_kb_documents_source_type",
        "kb_documents",
        ["source_type"],
    )
    op.create_index(
        "ix_kb_documents_created_at",
        "kb_documents",
        ["created_at"],
    )


def downgrade():
    """Drop kb_documents table"""
    op.drop_index("ix_kb_documents_created_at", table_name="kb_documents")
    op.drop_index("ix_kb_documents_source_type", table_name="kb_documents")
    op.drop_index("ix_kb_documents_document_id", table_name="kb_documents")
    op.drop_table("kb_documents")
