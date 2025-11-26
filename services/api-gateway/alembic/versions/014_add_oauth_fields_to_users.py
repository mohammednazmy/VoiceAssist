"""Add OAuth fields to users table

Revision ID: 014_add_oauth_fields
Revises: 013_add_message_metadata
Create Date: 2025-11-26

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "014_add_oauth_fields"
down_revision = "013_add_message_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add OAuth provider columns to users table
    op.add_column("users", sa.Column("oauth_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("oauth_provider_id", sa.String(255), nullable=True))

    # Create indexes for faster lookups
    op.create_index("ix_users_oauth_provider", "users", ["oauth_provider"])
    op.create_index("ix_users_oauth_provider_id", "users", ["oauth_provider_id"])


def downgrade() -> None:
    # Remove indexes
    op.drop_index("ix_users_oauth_provider_id", table_name="users")
    op.drop_index("ix_users_oauth_provider", table_name="users")

    # Remove columns
    op.drop_column("users", "oauth_provider_id")
    op.drop_column("users", "oauth_provider")
