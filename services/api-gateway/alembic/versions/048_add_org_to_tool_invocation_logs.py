"""Add organization_id to tool_invocation_logs

Revision ID: 048
Revises: 047
Create Date: 2025-12-12

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add organization_id column and index to tool_invocation_logs."""
    op.add_column(
        "tool_invocation_logs",
        sa.Column("organization_id", sa.String(255), nullable=True),
    )
    op.create_index("ix_tool_logs_org", "tool_invocation_logs", ["organization_id"])


def downgrade() -> None:
    """Drop organization_id column and index from tool_invocation_logs."""
    op.drop_index("ix_tool_logs_org", table_name="tool_invocation_logs")
    op.drop_column("tool_invocation_logs", "organization_id")

