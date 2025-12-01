"""add user_voice_preferences table

Revision ID: 029
Revises: 028
Create Date: 2025-11-29 16:00:00.000000

Creates the user_voice_preferences table for storing per-user TTS settings.
Supports OpenAI and ElevenLabs providers with full parameter control.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade():
    # Create user_voice_preferences table
    op.create_table(
        "user_voice_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        # Provider selection
        sa.Column("tts_provider", sa.String(50), nullable=False, default="openai"),
        # Voice selection per provider
        sa.Column("openai_voice_id", sa.String(50), nullable=False, default="alloy"),
        sa.Column("elevenlabs_voice_id", sa.String(100), nullable=True),
        # Speech control
        sa.Column("speech_rate", sa.Float, nullable=False, default=1.0),
        # ElevenLabs-specific parameters
        sa.Column("stability", sa.Float, nullable=False, default=0.5),
        sa.Column("similarity_boost", sa.Float, nullable=False, default=0.75),
        sa.Column("style", sa.Float, nullable=False, default=0.0),
        sa.Column("speaker_boost", sa.Boolean, nullable=False, default=True),
        # Behavior preferences
        sa.Column("auto_play", sa.Boolean, nullable=False, default=True),
        sa.Column("context_aware_style", sa.Boolean, nullable=False, default=True),
        sa.Column("preferred_language", sa.String(10), nullable=False, default="en"),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Create index on user_id for fast lookups
    op.create_index(
        "ix_user_voice_preferences_user_id",
        "user_voice_preferences",
        ["user_id"],
    )

    # Add trigger for automatic updated_at
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_user_voice_preferences_timestamp()
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
        CREATE TRIGGER user_voice_preferences_updated_at
        BEFORE UPDATE ON user_voice_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_user_voice_preferences_timestamp();
    """
    )


def downgrade():
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS user_voice_preferences_updated_at ON user_voice_preferences;")
    op.execute("DROP FUNCTION IF EXISTS update_user_voice_preferences_timestamp();")

    # Drop index
    op.drop_index("ix_user_voice_preferences_user_id", table_name="user_voice_preferences")

    # Drop table
    op.drop_table("user_voice_preferences")
