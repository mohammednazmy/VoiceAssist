"""Add idempotency support for messages

Revision ID: 015
Revises: 014_add_oauth_fields_to_users
Create Date: 2025-11-26

This migration adds:
1. client_message_id column to messages table for idempotent message creation
2. Unique constraint on (session_id, branch_id, client_message_id) for deduplication
3. Partial index for efficient idempotency lookups
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add idempotency support to messages table."""
    # Add client_message_id column
    op.add_column(
        "messages",
        sa.Column("client_message_id", sa.String(100), nullable=True),
    )

    # Add index for client_message_id
    op.create_index(
        "ix_messages_client_message_id",
        "messages",
        ["client_message_id"],
    )

    # Add unique constraint for idempotent message creation
    # Note: This constraint will only enforce uniqueness when client_message_id is NOT NULL
    # PostgreSQL allows multiple NULL values in unique constraints by default
    op.create_unique_constraint(
        "uq_message_idempotency",
        "messages",
        ["session_id", "branch_id", "client_message_id"],
    )

    # Add partial index for faster idempotency lookups
    # Only indexes rows where client_message_id is not null
    op.execute(
        """
        CREATE INDEX ix_message_idempotency_lookup
        ON messages (session_id, branch_id, client_message_id)
        WHERE client_message_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Remove idempotency support from messages table."""
    # Drop partial index
    op.execute("DROP INDEX IF EXISTS ix_message_idempotency_lookup")

    # Drop unique constraint
    op.drop_constraint("uq_message_idempotency", "messages", type_="unique")

    # Drop client_message_id index
    op.drop_index("ix_messages_client_message_id", table_name="messages")

    # Drop client_message_id column
    op.drop_column("messages", "client_message_id")
