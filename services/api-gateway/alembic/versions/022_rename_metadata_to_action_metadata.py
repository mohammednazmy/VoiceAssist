"""Rename metadata column to action_metadata in admin_audit_logs

Revision ID: 022
Revises: 021
Create Date: 2025-11-28

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename column from metadata to action_metadata
    op.alter_column(
        "admin_audit_logs",
        "metadata",
        new_column_name="action_metadata",
    )


def downgrade() -> None:
    op.alter_column(
        "admin_audit_logs",
        "action_metadata",
        new_column_name="metadata",
    )
