"""add tool_invocation_logs table

Revision ID: 027
Revises: 026
Create Date: 2025-11-29 14:00:00.000000

Creates the tool_invocation_logs table for tracking all function call
executions across voice and chat modes. Enables analytics, debugging,
and monitoring of tool usage.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    # Create tool_invocation_logs table
    op.create_table(
        "tool_invocation_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("session_id", sa.String(255), nullable=True),
        # Tool info
        sa.Column("tool_name", sa.String(100), nullable=False),  # 'calendar_create_event', 'web_search', etc.
        sa.Column("tool_category", sa.String(50), nullable=True),  # 'calendar', 'search', 'medical'
        # Invocation details
        sa.Column("arguments", postgresql.JSONB, nullable=True),  # Function arguments (sanitized)
        sa.Column("result", postgresql.JSONB, nullable=True),  # Tool result (sanitized)
        sa.Column("status", sa.String(20), nullable=False),  # 'success', 'error', 'timeout', 'cancelled'
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("error_type", sa.String(100), nullable=True),  # Exception type for categorization
        # Performance
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=True, server_default="0"),
        # Context
        sa.Column("mode", sa.String(20), nullable=True),  # 'voice', 'chat'
        sa.Column("calendar_provider", sa.String(50), nullable=True),  # Which calendar was used (if applicable)
        sa.Column("model_used", sa.String(100), nullable=True),  # LLM model that triggered the call
        # Request context
        sa.Column("trace_id", sa.String(100), nullable=True),  # For distributed tracing
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        # Partitioning helper (generated column for date-based queries)
        sa.Column("created_date", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
    )

    # Create indexes for common queries
    op.create_index("ix_tool_logs_user_id", "tool_invocation_logs", ["user_id"])
    op.create_index("ix_tool_logs_tool_name", "tool_invocation_logs", ["tool_name"])
    op.create_index("ix_tool_logs_status", "tool_invocation_logs", ["status"])
    op.create_index("ix_tool_logs_created_date", "tool_invocation_logs", ["created_date"])
    op.create_index("ix_tool_logs_tool_status", "tool_invocation_logs", ["tool_name", "status"])
    op.create_index("ix_tool_logs_mode", "tool_invocation_logs", ["mode"])
    op.create_index("ix_tool_logs_created_at", "tool_invocation_logs", ["created_at"])
    op.create_index("ix_tool_logs_trace_id", "tool_invocation_logs", ["trace_id"])

    # Composite index for analytics queries
    op.create_index("ix_tool_logs_analytics", "tool_invocation_logs", ["created_date", "tool_name", "status"])


def downgrade():
    # Drop indexes
    op.drop_index("ix_tool_logs_analytics", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_trace_id", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_created_at", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_mode", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_tool_status", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_created_date", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_status", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_tool_name", table_name="tool_invocation_logs")
    op.drop_index("ix_tool_logs_user_id", table_name="tool_invocation_logs")

    # Drop table
    op.drop_table("tool_invocation_logs")
