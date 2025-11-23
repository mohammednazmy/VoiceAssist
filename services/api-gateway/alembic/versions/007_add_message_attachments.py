"""add message attachments

Revision ID: 007_add_message_attachments
Revises: 006_add_branching_support
Create Date: 2025-11-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    """Create message_attachments table"""
    op.create_table(
        "message_attachments",
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
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column(
            "file_type",
            sa.String(50),
            nullable=False,
            comment="pdf, image, text, markdown",
        ),
        sa.Column(
            "file_size", sa.Integer, nullable=False, comment="File size in bytes"
        ),
        sa.Column("file_url", sa.Text, nullable=False, comment="S3/storage URL"),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("file_metadata", JSONB, nullable=True, comment="Additional file metadata"),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Create indexes
    op.create_index(
        "idx_message_attachments_message_id", "message_attachments", ["message_id"]
    )
    op.create_index(
        "idx_message_attachments_file_type", "message_attachments", ["file_type"]
    )


def downgrade():
    """Drop message_attachments table"""
    op.drop_index("idx_message_attachments_file_type", table_name="message_attachments")
    op.drop_index(
        "idx_message_attachments_message_id", table_name="message_attachments"
    )
    op.drop_table("message_attachments")
