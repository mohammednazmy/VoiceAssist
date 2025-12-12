"""Add enhanced PDF structure columns for GPT-4 Vision processing

Revision ID: 038
Revises: 037
Create Date: 2025-12-11

This migration adds columns for enhanced PDF extraction:
1. enhanced_structure - JSONB for detailed content blocks (text, tables, figures)
2. processing_stage - Track document processing pipeline stage
3. processing_progress - Percentage progress of processing
4. page_images_path - Storage path for rendered page images
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade():
    """Add enhanced PDF structure columns"""

    # Add enhanced_structure JSONB column for detailed content blocks
    op.add_column(
        "kb_documents",
        sa.Column(
            "enhanced_structure",
            JSONB,
            nullable=True,
            comment="Enhanced content blocks from GPT-4 Vision analysis",
        ),
    )

    # Add processing_stage column to track pipeline progress
    op.add_column(
        "kb_documents",
        sa.Column(
            "processing_stage",
            sa.String(50),
            server_default="pending",
            nullable=False,
            comment="Processing stage: pending, extracting, analyzing, complete, failed",
        ),
    )

    # Add processing_progress column for percentage tracking
    op.add_column(
        "kb_documents",
        sa.Column(
            "processing_progress",
            sa.Integer,
            server_default=sa.text("0"),
            nullable=False,
            comment="Processing progress percentage (0-100)",
        ),
    )

    # Add page_images_path column for storing rendered page images location
    op.add_column(
        "kb_documents",
        sa.Column(
            "page_images_path",
            sa.String(500),
            nullable=True,
            comment="Storage path for rendered PDF page images",
        ),
    )

    # Create index on processing_stage for efficient querying
    op.create_index(
        "ix_kb_documents_processing_stage",
        "kb_documents",
        ["processing_stage"],
    )


def downgrade():
    """Remove enhanced PDF structure columns"""

    op.drop_index("ix_kb_documents_processing_stage", table_name="kb_documents")
    op.drop_column("kb_documents", "page_images_path")
    op.drop_column("kb_documents", "processing_progress")
    op.drop_column("kb_documents", "processing_stage")
    op.drop_column("kb_documents", "enhanced_structure")
