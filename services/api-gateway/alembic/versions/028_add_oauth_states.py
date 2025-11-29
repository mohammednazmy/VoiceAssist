"""add oauth_states table

Revision ID: 028
Revises: 027
Create Date: 2025-11-29 14:00:00.000000

Creates the oauth_states table for CSRF protection during OAuth flows.
Stores temporary state tokens that are validated during callback.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade():
    # Create oauth_states table
    op.create_table(
        "oauth_states",
        sa.Column("state", sa.String(64), primary_key=True),  # CSRF token
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),  # 'google', 'microsoft'
        sa.Column("redirect_uri", sa.String(500), nullable=True),  # Where to redirect after auth
        sa.Column("connection_name", sa.String(100), nullable=True),  # Optional user-friendly name for the connection
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now() + interval '10 minutes'"),
        ),
    )

    # Index for cleanup queries (expired states)
    op.create_index("ix_oauth_states_expires_at", "oauth_states", ["expires_at"])

    # Add cleanup function and scheduled cleanup (can be triggered by cron or pg_cron)
    op.execute(
        """
        CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
        RETURNS void AS $$
        BEGIN
            DELETE FROM oauth_states WHERE expires_at < now();
        END;
        $$ language 'plpgsql';
    """
    )


def downgrade():
    # Drop function
    op.execute("DROP FUNCTION IF EXISTS cleanup_expired_oauth_states();")

    # Drop indexes
    op.drop_index("ix_oauth_states_expires_at", table_name="oauth_states")

    # Drop table
    op.drop_table("oauth_states")
