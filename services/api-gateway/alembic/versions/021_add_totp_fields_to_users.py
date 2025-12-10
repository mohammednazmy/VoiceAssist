"""Add TOTP fields to users table for 2FA support

Revision ID: 021
Revises: 020
Create Date: 2025-11-28

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add TOTP columns for 2FA support
    op.add_column(
        "users",
        sa.Column("totp_secret", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "users",
        sa.Column("totp_backup_codes", sa.String(1024), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("totp_verified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_verified_at")
    op.drop_column("users", "totp_backup_codes")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
