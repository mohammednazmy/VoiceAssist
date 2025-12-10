"""add source_mode to messages for voice pipeline

Revision ID: 031
Revises: 030
Create Date: 2025-11-30 12:00:00.000000

Adds source_mode column to messages table to track whether a message
originated from text chat or voice mode. This supports the unified
Thinker/Talker voice pipeline where voice and chat share conversation context.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade():
    # Add source_mode column to messages table
    # Values: 'chat' (default), 'voice'
    op.add_column(
        "messages",
        sa.Column(
            "source_mode",
            sa.String(20),
            nullable=False,
            server_default="chat",
        ),
    )

    # Add index for filtering by source mode (useful for analytics)
    op.create_index(
        "ix_messages_source_mode",
        "messages",
        ["source_mode"],
    )

    # Add voice_pipeline_mode column to sessions for tracking which pipeline mode was used
    op.add_column(
        "sessions",
        sa.Column(
            "voice_pipeline_mode",
            sa.String(50),
            nullable=True,
        ),
    )

    # Add last_voice_activity timestamp to sessions
    op.add_column(
        "sessions",
        sa.Column(
            "last_voice_activity",
            sa.DateTime,
            nullable=True,
        ),
    )


def downgrade():
    # Drop index
    op.drop_index("ix_messages_source_mode", table_name="messages")

    # Drop columns
    op.drop_column("messages", "source_mode")
    op.drop_column("sessions", "voice_pipeline_mode")
    op.drop_column("sessions", "last_voice_activity")
