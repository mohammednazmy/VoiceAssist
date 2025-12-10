"""Add session_events table for structured event logging

Revision ID: 016
Revises: 015_add_idempotency_support
Create Date: 2025-11-26

This migration adds the session_events table for:
- Capturing key events during conversation/voice sessions
- Debugging and performance analysis
- Session replay and inspection
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create session_events table with indexes."""
    op.create_table(
        "session_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(100), nullable=True),
        sa.Column("branch_id", sa.String(100), nullable=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("trace_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # Create indexes
    op.create_index(
        "ix_session_events_conversation_id",
        "session_events",
        ["conversation_id"],
    )
    op.create_index(
        "ix_session_events_session_id",
        "session_events",
        ["session_id"],
    )
    op.create_index(
        "ix_session_events_branch_id",
        "session_events",
        ["branch_id"],
    )
    op.create_index(
        "ix_session_events_user_id",
        "session_events",
        ["user_id"],
    )
    op.create_index(
        "ix_session_events_event_type",
        "session_events",
        ["event_type"],
    )
    op.create_index(
        "ix_session_events_trace_id",
        "session_events",
        ["trace_id"],
    )
    op.create_index(
        "ix_session_events_created_at",
        "session_events",
        ["created_at"],
    )
    op.create_index(
        "ix_session_events_conversation_time",
        "session_events",
        ["conversation_id", "created_at"],
    )
    op.create_index(
        "ix_session_events_session_time",
        "session_events",
        ["session_id", "created_at"],
    )
    op.create_index(
        "ix_session_events_type_time",
        "session_events",
        ["event_type", "created_at"],
    )


def downgrade() -> None:
    """Drop session_events table and indexes."""
    op.drop_index("ix_session_events_type_time", table_name="session_events")
    op.drop_index("ix_session_events_session_time", table_name="session_events")
    op.drop_index("ix_session_events_conversation_time", table_name="session_events")
    op.drop_index("ix_session_events_created_at", table_name="session_events")
    op.drop_index("ix_session_events_trace_id", table_name="session_events")
    op.drop_index("ix_session_events_event_type", table_name="session_events")
    op.drop_index("ix_session_events_user_id", table_name="session_events")
    op.drop_index("ix_session_events_branch_id", table_name="session_events")
    op.drop_index("ix_session_events_session_id", table_name="session_events")
    op.drop_index("ix_session_events_conversation_id", table_name="session_events")
    op.drop_table("session_events")
