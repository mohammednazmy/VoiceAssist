"""Add settings column to sessions table

Revision ID: 017
Revises: 016
Create Date: 2025-11-26

This migration adds per-conversation settings support:
- LLM mode configuration
- System prompt customization
- Voice style preferences
- Other per-conversation options
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add settings column to sessions table."""
    op.add_column(
        "sessions",
        sa.Column("settings", JSONB, nullable=True, server_default="{}"),
    )


def downgrade() -> None:
    """Remove settings column from sessions table."""
    op.drop_column("sessions", "settings")
