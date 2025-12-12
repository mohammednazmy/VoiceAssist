"""Add document structure fields and voice document sessions table

Revision ID: 037
Revises: 036
Create Date: 2025-12-11

This migration adds:
1. New columns to kb_documents for document structure (pages, TOC, figures, sections)
2. Owner and visibility fields for document access control
3. New voice_document_sessions table for tracking navigation state in voice mode
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade():
    """Add document structure columns and voice_document_sessions table"""

    # Add new columns to kb_documents table
    op.add_column(
        "kb_documents",
        sa.Column("total_pages", sa.Integer, nullable=True, comment="Total number of pages in document"),
    )
    op.add_column(
        "kb_documents",
        sa.Column(
            "has_toc",
            sa.Boolean,
            server_default=sa.text("false"),
            nullable=False,
            comment="Whether document has table of contents",
        ),
    )
    op.add_column(
        "kb_documents",
        sa.Column(
            "has_figures",
            sa.Boolean,
            server_default=sa.text("false"),
            nullable=False,
            comment="Whether document has figures/diagrams",
        ),
    )
    op.add_column(
        "kb_documents",
        sa.Column(
            "document_structure",
            JSONB,
            nullable=True,
            comment="Document structure: pages, toc, sections, figures",
        ),
    )
    op.add_column(
        "kb_documents",
        sa.Column(
            "owner_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
            comment="User who uploaded the document",
        ),
    )
    op.add_column(
        "kb_documents",
        sa.Column(
            "is_public",
            sa.Boolean,
            server_default=sa.text("false"),
            nullable=False,
            comment="Whether document is visible to all users",
        ),
    )

    # Create index on owner_id for efficient user document queries
    op.create_index(
        "ix_kb_documents_owner_id",
        "kb_documents",
        ["owner_id"],
    )

    # Create voice_document_sessions table
    op.create_table(
        "voice_document_sessions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "conversation_id",
            sa.String(255),
            nullable=False,
            comment="Conversation ID for the voice session",
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
            comment="User ID of the session owner",
        ),
        sa.Column(
            "document_id",
            sa.String(255),
            sa.ForeignKey("kb_documents.document_id"),
            nullable=False,
            comment="Active document ID",
        ),
        sa.Column(
            "current_page",
            sa.Integer,
            server_default=sa.text("1"),
            nullable=False,
            comment="Current page number in document",
        ),
        sa.Column(
            "current_section_id",
            sa.String(100),
            nullable=True,
            comment="Current section ID if within a section",
        ),
        sa.Column(
            "last_read_position",
            sa.Integer,
            server_default=sa.text("0"),
            nullable=False,
            comment="Last read character position",
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            server_default=sa.text("true"),
            nullable=False,
            comment="Whether session is currently active",
        ),
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

    # Indexes for voice_document_sessions
    op.create_index(
        "ix_voice_document_sessions_conversation_id",
        "voice_document_sessions",
        ["conversation_id"],
    )
    op.create_index(
        "ix_voice_document_sessions_user_id",
        "voice_document_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_voice_document_sessions_document_id",
        "voice_document_sessions",
        ["document_id"],
    )
    # Composite index for finding active session by conversation
    op.create_index(
        "ix_voice_document_sessions_active_conversation",
        "voice_document_sessions",
        ["conversation_id", "is_active"],
    )


def downgrade():
    """Remove document structure columns and voice_document_sessions table"""

    # Drop voice_document_sessions table
    op.drop_index("ix_voice_document_sessions_active_conversation", table_name="voice_document_sessions")
    op.drop_index("ix_voice_document_sessions_document_id", table_name="voice_document_sessions")
    op.drop_index("ix_voice_document_sessions_user_id", table_name="voice_document_sessions")
    op.drop_index("ix_voice_document_sessions_conversation_id", table_name="voice_document_sessions")
    op.drop_table("voice_document_sessions")

    # Drop new columns from kb_documents
    op.drop_index("ix_kb_documents_owner_id", table_name="kb_documents")
    op.drop_column("kb_documents", "is_public")
    op.drop_column("kb_documents", "owner_id")
    op.drop_column("kb_documents", "document_structure")
    op.drop_column("kb_documents", "has_figures")
    op.drop_column("kb_documents", "has_toc")
    op.drop_column("kb_documents", "total_pages")
