"""add voice_session_metrics table

Revision ID: 029
Revises: 028
Create Date: 2025-11-29 16:00:00.000000

Creates the voice_session_metrics table for voice pipeline analytics.
Stores session-level metrics including latency, costs, and provider usage.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade():
    # Create voice_session_metrics table
    op.create_table(
        "voice_session_metrics",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(255), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Numeric(10, 2), nullable=True),
        # Latency metrics (in milliseconds)
        sa.Column("stt_latency_avg_ms", sa.Numeric(10, 2), nullable=True),
        sa.Column("stt_latency_p95_ms", sa.Numeric(10, 2), nullable=True),
        sa.Column("tts_latency_avg_ms", sa.Numeric(10, 2), nullable=True),
        sa.Column("tts_latency_p95_ms", sa.Numeric(10, 2), nullable=True),
        sa.Column("response_latency_avg_ms", sa.Numeric(10, 2), nullable=True),
        sa.Column("response_latency_p95_ms", sa.Numeric(10, 2), nullable=True),
        # Provider and voice info
        sa.Column("stt_provider", sa.String(50), nullable=True),
        sa.Column("tts_provider", sa.String(50), nullable=True),
        sa.Column("voice_id", sa.String(100), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        # Usage metrics
        sa.Column("message_count", sa.Integer, nullable=True, default=0),
        sa.Column("audio_seconds_processed", sa.Numeric(10, 2), nullable=True),
        sa.Column("characters_synthesized", sa.Integer, nullable=True, default=0),
        # Cost tracking
        sa.Column("estimated_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("stt_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("tts_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("llm_cost_usd", sa.Numeric(10, 6), nullable=True),
        # Quality metrics
        sa.Column("error_count", sa.Integer, nullable=True, default=0),
        sa.Column("echo_detection_count", sa.Integer, nullable=True, default=0),
        sa.Column("vad_trigger_count", sa.Integer, nullable=True, default=0),
        # Session metadata
        sa.Column("session_type", sa.String(50), nullable=True),  # 'voice', 'realtime'
        sa.Column("client_info", sa.JSON, nullable=True),  # User agent, platform, etc.
        sa.Column("session_metadata", sa.JSON, nullable=True),  # Additional session data (avoiding reserved 'metadata')
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Indexes for common queries
    op.create_index(
        "ix_voice_session_metrics_user_started",
        "voice_session_metrics",
        ["user_id", "started_at"],
    )
    op.create_index("ix_voice_session_metrics_started_at", "voice_session_metrics", ["started_at"])
    op.create_index(
        "ix_voice_session_metrics_tts_provider",
        "voice_session_metrics",
        ["tts_provider", "started_at"],
    )

    # Add foreign key constraint to users table
    op.create_foreign_key(
        "fk_voice_session_metrics_user_id",
        "voice_session_metrics",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade():
    op.drop_constraint("fk_voice_session_metrics_user_id", "voice_session_metrics", type_="foreignkey")
    op.drop_index("ix_voice_session_metrics_tts_provider", table_name="voice_session_metrics")
    op.drop_index("ix_voice_session_metrics_started_at", table_name="voice_session_metrics")
    op.drop_index("ix_voice_session_metrics_user_started", table_name="voice_session_metrics")
    op.drop_table("voice_session_metrics")
