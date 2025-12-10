"""Add invitation and password reset token fields to users table

Revision ID: 023
Revises: 022
Create Date: 2025-11-29

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Invitation tokens for new user invitations
    op.add_column(
        "users",
        sa.Column("invitation_token", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("invitation_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("invitation_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "invited_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )

    # Password reset tokens
    op.add_column(
        "users",
        sa.Column("password_reset_token", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("password_reset_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Create indexes for token lookups
    op.create_index(
        "ix_users_invitation_token",
        "users",
        ["invitation_token"],
        unique=True,
    )
    op.create_index(
        "ix_users_password_reset_token",
        "users",
        ["password_reset_token"],
        unique=True,
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_users_password_reset_token", table_name="users")
    op.drop_index("ix_users_invitation_token", table_name="users")

    # Drop columns
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "password_reset_token_expires_at")
    op.drop_column("users", "password_reset_token")
    op.drop_column("users", "invited_by_id")
    op.drop_column("users", "invitation_sent_at")
    op.drop_column("users", "invitation_token_expires_at")
    op.drop_column("users", "invitation_token")
