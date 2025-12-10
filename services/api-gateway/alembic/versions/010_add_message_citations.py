"""Add message citations table

Revision ID: 010
Revises: 009
Create Date: 2025-11-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    """Create message_citations table for structured citation tracking"""
    op.create_table(
        "message_citations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Source identification
        sa.Column("source_id", sa.String(255), nullable=False),
        sa.Column(
            "source_type",
            sa.String(50),
            nullable=False,
            comment="textbook|journal|guideline|note",
        ),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=True),
        # Source metadata
        sa.Column("authors", JSONB, nullable=True, comment="Array of author names"),
        sa.Column("publication_date", sa.String(50), nullable=True, comment="Publication date"),
        sa.Column("journal", sa.String(255), nullable=True, comment="Journal name"),
        sa.Column("volume", sa.String(50), nullable=True),
        sa.Column("issue", sa.String(50), nullable=True),
        sa.Column("pages", sa.String(50), nullable=True, comment="Page range"),
        sa.Column("doi", sa.String(255), nullable=True, comment="Digital Object Identifier"),
        sa.Column("pmid", sa.String(50), nullable=True, comment="PubMed ID"),
        # Citation context
        sa.Column(
            "relevance_score",
            sa.Integer,
            nullable=True,
            comment="0-100 score from semantic search",
        ),
        sa.Column("quoted_text", sa.Text, nullable=True, comment="Excerpt from source"),
        sa.Column(
            "context",
            JSONB,
            nullable=True,
            comment="Additional context (section, chapter, etc.)",
        ),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Indexes for performance
    op.create_index(
        "ix_message_citations_message_id",
        "message_citations",
        ["message_id"],
    )
    op.create_index(
        "ix_message_citations_source_type",
        "message_citations",
        ["source_type"],
    )
    op.create_index(
        "ix_message_citations_source_id",
        "message_citations",
        ["source_id"],
    )


def downgrade():
    """Drop message_citations table"""
    op.drop_index("ix_message_citations_source_id", table_name="message_citations")
    op.drop_index("ix_message_citations_source_type", table_name="message_citations")
    op.drop_index("ix_message_citations_message_id", table_name="message_citations")
    op.drop_table("message_citations")
