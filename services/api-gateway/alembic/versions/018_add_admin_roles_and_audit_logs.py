"""
Add admin roles, password change tracking, and admin audit logs table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "018_add_admin_roles_and_audit_logs"
down_revision: Union[str, None] = "017_add_conversation_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Admin roles + password change tracking
    op.add_column(
        "users",
        sa.Column(
            "admin_role",
            sa.String(length=50),
            nullable=False,
            server_default="user",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "password_changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Backfill admin_role based on legacy is_admin flag
    op.execute("UPDATE users SET admin_role = CASE WHEN is_admin THEN 'admin' ELSE 'user' END")

    # Remove server default after backfill
    op.alter_column("users", "admin_role", server_default=None)

    # Admin audit log table
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("actor_role", sa.String(length=50), nullable=True),
        sa.Column("action", sa.String(length=150), nullable=False),
        sa.Column("target_type", sa.String(length=150), nullable=True),
        sa.Column("target_id", sa.String(length=255), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
    )
    op.create_index(
        "ix_admin_audit_logs_created_at",
        "admin_audit_logs",
        ["created_at"],
    )
    op.create_index(
        "ix_admin_audit_logs_action",
        "admin_audit_logs",
        ["action"],
    )
    op.create_index(
        "ix_admin_audit_logs_actor_id",
        "admin_audit_logs",
        ["actor_id"],
    )
    op.create_index(
        "ix_admin_audit_logs_request_id",
        "admin_audit_logs",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_audit_logs_request_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_actor_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_created_at", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")

    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "admin_role")
