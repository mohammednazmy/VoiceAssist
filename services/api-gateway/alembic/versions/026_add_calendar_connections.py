"""add user_calendar_connections table

Revision ID: 026
Revises: 025
Create Date: 2025-11-29 14:00:00.000000

Creates the user_calendar_connections table for storing multi-provider
calendar integrations (Google, Microsoft, Apple/iCloud, Nextcloud, CalDAV).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    # Create user_calendar_connections table
    op.create_table(
        "user_calendar_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(255), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),  # 'google', 'microsoft', 'apple', 'nextcloud', 'caldav'
        sa.Column("provider_display_name", sa.String(100), nullable=True),  # User-friendly name: "Work Google Calendar"
        # OAuth tokens (encrypted at rest)
        sa.Column("access_token_encrypted", sa.Text, nullable=True),
        sa.Column("refresh_token_encrypted", sa.Text, nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        # CalDAV credentials (for Apple/Nextcloud)
        sa.Column("caldav_url", sa.String(500), nullable=True),
        sa.Column("caldav_username", sa.String(255), nullable=True),
        sa.Column("caldav_password_encrypted", sa.Text, nullable=True),
        # Connection metadata
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="pending"
        ),  # 'pending', 'connected', 'expired', 'error'
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("scopes", postgresql.ARRAY(sa.Text), nullable=True),  # Granted OAuth scopes
        # Sync settings
        sa.Column("sync_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_interval_minutes", sa.Integer, nullable=True, server_default="15"),
        # Timestamps
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        # Unique constraint: one connection per provider per user (caldav_url differentiates multiple CalDAV servers)
        sa.UniqueConstraint("user_id", "provider", "caldav_url", name="uq_user_calendar_connection"),
    )

    # Create indexes for common queries
    op.create_index("ix_calendar_connections_user_id", "user_calendar_connections", ["user_id"])
    op.create_index("ix_calendar_connections_status", "user_calendar_connections", ["status"])
    op.create_index("ix_calendar_connections_provider", "user_calendar_connections", ["provider"])
    op.create_index("ix_calendar_connections_user_provider", "user_calendar_connections", ["user_id", "provider"])

    # Add updated_at trigger
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_calendar_connection_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    """
    )

    op.execute(
        """
        CREATE TRIGGER trigger_update_calendar_connection_updated_at
        BEFORE UPDATE ON user_calendar_connections
        FOR EACH ROW EXECUTE FUNCTION update_calendar_connection_updated_at();
    """
    )


def downgrade():
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trigger_update_calendar_connection_updated_at ON user_calendar_connections;")
    op.execute("DROP FUNCTION IF EXISTS update_calendar_connection_updated_at();")

    # Drop indexes
    op.drop_index("ix_calendar_connections_user_provider", table_name="user_calendar_connections")
    op.drop_index("ix_calendar_connections_provider", table_name="user_calendar_connections")
    op.drop_index("ix_calendar_connections_status", table_name="user_calendar_connections")
    op.drop_index("ix_calendar_connections_user_id", table_name="user_calendar_connections")

    # Drop table
    op.drop_table("user_calendar_connections")
