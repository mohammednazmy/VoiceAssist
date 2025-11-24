"""Add archived column to sessions

Revision ID: 011
Revises: 010
Create Date: 2025-11-23
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add archived column to sessions"""
    op.add_column(
        "sessions",
        sa.Column("archived", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("idx_sessions_archived", "sessions", ["archived"])


def downgrade() -> None:
    """Remove archived column from sessions"""
    op.drop_index("idx_sessions_archived", table_name="sessions")
    op.drop_column("sessions", "archived")
