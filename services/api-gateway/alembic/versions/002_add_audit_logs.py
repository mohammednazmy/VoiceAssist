"""add audit_logs table

Revision ID: 002
Revises: 001
Create Date: 2025-11-21 00:30:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    # Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            index=True,
            server_default=sa.text("now()"),
        ),
        # Who performed the action
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("user_email", sa.String(255), nullable=True),
        sa.Column("user_role", sa.String(50), nullable=True),
        # What action was performed
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource_type", sa.String(100), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        # Request context
        sa.Column("request_id", sa.String(100), nullable=True, index=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        # Service context
        sa.Column("service_name", sa.String(100), nullable=False, server_default="api-gateway"),
        sa.Column("endpoint", sa.String(255), nullable=True),
        # Result
        sa.Column("success", sa.Boolean, nullable=False),
        sa.Column("status_code", sa.String(10), nullable=True),
        sa.Column("error_message", sa.String(1000), nullable=True),
        # Additional context
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        # Integrity verification
        sa.Column("hash", sa.String(64), nullable=False),
    )

    # Create indexes for common queries
    op.create_index("ix_audit_logs_user_timestamp", "audit_logs", ["user_id", "timestamp"])
    op.create_index("ix_audit_logs_action_timestamp", "audit_logs", ["action", "timestamp"])
    op.create_index("ix_audit_logs_success_timestamp", "audit_logs", ["success", "timestamp"])


def downgrade():
    # Drop indexes
    op.drop_index("ix_audit_logs_success_timestamp", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action_timestamp", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_timestamp", table_name="audit_logs")

    # Drop table
    op.drop_table("audit_logs")
