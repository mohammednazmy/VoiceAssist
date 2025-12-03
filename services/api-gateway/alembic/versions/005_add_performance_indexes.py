"""Add performance indexes for database optimization

Revision ID: 005
Revises: 004
Create Date: 2025-11-21

This migration adds database indexes to optimize common query patterns:
- User authentication queries (email lookup, login tracking)
- Session and message retrieval (user_id, created_at)
- Audit log queries (user_id, timestamp)
- Feature flag lookups (key, is_enabled)
- Document queries (created_at for recent documents)
- Composite indexes for multi-column queries

These indexes significantly improve query performance for:
- Login operations (email lookup)
- DAU/MAU calculations (last_login filtering)
- Message history retrieval (session_id + timestamp)
- Audit trail queries (user_id + timestamp)
- Feature flag checks (key + enabled status)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add performance indexes"""

    # Helper function to check if index exists
    def create_index_if_not_exists(index_name, table_name, columns, **kwargs):
        conn = op.get_bind()
        result = conn.execute(
            sa.text(
                """
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = :index_name
            )
        """
            ),
            {"index_name": index_name},
        )
        exists = result.scalar()

        if not exists:
            op.create_index(index_name, table_name, columns, **kwargs)

    # Users table indexes (email already indexed, add last_login)
    # Index for DAU/MAU calculations and login tracking
    create_index_if_not_exists("ix_users_last_login", "users", ["last_login"], postgresql_using="btree")

    # Composite index for filtering active users by last login
    create_index_if_not_exists(
        "ix_users_active_last_login",
        "users",
        ["is_active", "last_login"],
        postgresql_using="btree",
    )

    # Sessions table indexes
    # Composite index for retrieving user sessions ordered by creation time
    create_index_if_not_exists(
        "ix_sessions_user_created",
        "sessions",
        ["user_id", "created_at"],
        postgresql_using="btree",
    )

    # Index for finding active/recent sessions
    create_index_if_not_exists("ix_sessions_created_at", "sessions", ["created_at"], postgresql_using="btree")

    # Messages table indexes
    # Composite index for retrieving messages by session with timestamp ordering
    # This is critical for chat history queries
    create_index_if_not_exists(
        "ix_messages_session_timestamp",
        "messages",
        ["session_id", "created_at"],
        postgresql_using="btree",
    )

    # Index for timestamp-based message queries
    create_index_if_not_exists("ix_messages_timestamp", "messages", ["created_at"], postgresql_using="btree")

    # Audit logs table indexes
    # Composite index for user audit trail queries
    create_index_if_not_exists(
        "ix_audit_logs_user_timestamp",
        "audit_logs",
        ["user_id", "timestamp"],
        postgresql_using="btree",
    )

    # Index for action-based audit queries
    create_index_if_not_exists("ix_audit_logs_action", "audit_logs", ["action"], postgresql_using="btree")

    # Composite index for filtering audit logs by action and timestamp
    create_index_if_not_exists(
        "ix_audit_logs_action_timestamp",
        "audit_logs",
        ["action", "timestamp"],
        postgresql_using="btree",
    )

    # Feature flags table indexes
    # Composite index for feature flag lookups (name + enabled status)
    # This is critical for fast feature flag checks
    create_index_if_not_exists(
        "ix_feature_flags_name_enabled",
        "feature_flags",
        ["name", "enabled"],
        postgresql_using="btree",
    )

    # Index for listing enabled flags
    create_index_if_not_exists(
        "ix_feature_flags_enabled",
        "feature_flags",
        ["enabled"],
        postgresql_using="btree",
    )

    # Documents table indexes (if it exists - for future use)
    # Note: We don't have a documents table yet, but we're preparing for it
    # When the documents table is created, these indexes should be applied

    # Additional performance indexes for common query patterns

    # Index for filtering sessions by ended_at (active vs completed sessions)
    create_index_if_not_exists("ix_sessions_ended_at", "sessions", ["ended_at"], postgresql_using="btree")

    # Index for PHI-containing messages
    create_index_if_not_exists(
        "ix_messages_contains_phi",
        "messages",
        ["contains_phi"],
        postgresql_using="btree",
        postgresql_where=sa.text("contains_phi = true"),  # Partial index for PHI messages only
    )

    # Index for request_id lookups in audit logs (correlation)
    create_index_if_not_exists(
        "ix_audit_logs_request_id",
        "audit_logs",
        ["request_id"],
        postgresql_using="btree",
    )


def downgrade() -> None:
    """Remove performance indexes"""

    # Drop indexes in reverse order
    op.drop_index("ix_audit_logs_request_id", table_name="audit_logs")
    op.drop_index("ix_messages_contains_phi", table_name="messages")
    op.drop_index("ix_sessions_ended_at", table_name="sessions")

    op.drop_index("ix_feature_flags_enabled", table_name="feature_flags")
    op.drop_index("ix_feature_flags_name_enabled", table_name="feature_flags")

    op.drop_index("ix_audit_logs_action_timestamp", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_timestamp", table_name="audit_logs")

    op.drop_index("ix_messages_timestamp", table_name="messages")
    op.drop_index("ix_messages_session_timestamp", table_name="messages")

    op.drop_index("ix_sessions_created_at", table_name="sessions")
    op.drop_index("ix_sessions_user_created", table_name="sessions")

    op.drop_index("ix_users_active_last_login", table_name="users")
    op.drop_index("ix_users_last_login", table_name="users")
