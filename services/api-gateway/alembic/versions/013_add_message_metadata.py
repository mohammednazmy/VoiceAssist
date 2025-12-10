"""add message_metadata column

Revision ID: 013
Revises: 012
Create Date: 2025-11-24 07:25:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add message_metadata column to messages table"""
    op.add_column(
        "messages",
        sa.Column("message_metadata", JSONB, nullable=True),
    )


def downgrade() -> None:
    """Remove message_metadata column from messages table"""
    op.drop_column("messages", "message_metadata")
