"""Add audio_narrations table for voice narration caching

Revision ID: 040
Revises: 039
Create Date: 2025-12-11

This migration adds the audio_narrations table for:
1. Caching pre-generated TTS audio for page narrations
2. Supporting multiple TTS providers (OpenAI, ElevenLabs)
3. Tracking audio metadata and storage locations
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade():
    """Create audio_narrations table"""

    op.create_table(
        "audio_narrations",
        # Primary key
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # Document reference
        sa.Column(
            "document_id",
            UUID(as_uuid=True),
            sa.ForeignKey("kb_documents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "page_number",
            sa.Integer,
            nullable=False,
        ),
        # Audio metadata
        sa.Column(
            "audio_format",
            sa.String(20),
            nullable=False,
            server_default="mp3",
            comment="Audio format: mp3, wav, opus, aac",
        ),
        sa.Column(
            "duration_seconds",
            sa.Float,
            nullable=True,
            comment="Audio duration in seconds",
        ),
        sa.Column(
            "file_size_bytes",
            sa.Integer,
            nullable=True,
            comment="Audio file size in bytes",
        ),
        sa.Column(
            "sample_rate",
            sa.Integer,
            nullable=True,
            server_default=sa.text("24000"),
            comment="Audio sample rate (Hz)",
        ),
        # Storage
        sa.Column(
            "storage_path",
            sa.String(500),
            nullable=True,
            comment="Path to audio file (local or S3 key)",
        ),
        sa.Column(
            "storage_type",
            sa.String(50),
            nullable=False,
            server_default="local",
            comment="Storage type: local, s3",
        ),
        sa.Column(
            "cdn_url",
            sa.String(500),
            nullable=True,
            comment="CDN URL for streaming (if applicable)",
        ),
        # Source content
        sa.Column(
            "narration_text",
            sa.Text,
            nullable=False,
            comment="Original text that was synthesized",
        ),
        sa.Column(
            "narration_hash",
            sa.String(64),
            nullable=False,
            comment="SHA256 hash of narration text for cache invalidation",
        ),
        # TTS configuration
        sa.Column(
            "voice_id",
            sa.String(100),
            nullable=True,
            comment="Voice ID used for synthesis",
        ),
        sa.Column(
            "voice_provider",
            sa.String(50),
            nullable=False,
            server_default="openai",
            comment="TTS provider: openai, elevenlabs, azure",
        ),
        sa.Column(
            "voice_settings",
            JSONB,
            nullable=True,
            comment="Additional voice settings (speed, pitch, etc.)",
        ),
        # Status
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="pending",
            index=True,
            comment="Status: pending, generating, ready, failed",
        ),
        sa.Column(
            "error_message",
            sa.Text,
            nullable=True,
            comment="Error details if generation failed",
        ),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="When audio was successfully generated",
        ),
        sa.Column(
            "last_accessed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Last time audio was accessed/streamed",
        ),
        # Constraints
        sa.CheckConstraint(
            "audio_format IN ('mp3', 'wav', 'opus', 'aac')",
            name="valid_audio_format",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'generating', 'ready', 'failed')",
            name="valid_narration_status",
        ),
        sa.UniqueConstraint(
            "document_id", "page_number",
            name="uq_audio_document_page",
        ),
    )

    # Create indexes for common queries
    op.create_index(
        "ix_audio_narrations_access",
        "audio_narrations",
        ["last_accessed_at"],
        postgresql_where=sa.text("status = 'ready'"),
    )

    op.create_index(
        "ix_audio_narrations_hash",
        "audio_narrations",
        ["narration_hash"],
    )


def downgrade():
    """Remove audio_narrations table"""

    op.drop_index("ix_audio_narrations_hash", table_name="audio_narrations")
    op.drop_index("ix_audio_narrations_access", table_name="audio_narrations")
    op.drop_table("audio_narrations")
