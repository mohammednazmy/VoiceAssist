"""Add voice intelligence memory tables

Revision ID: 032
Revises: 031
Create Date: 2025-12-03

Phase 4: Voice Mode Intelligence Enhancement - Memory & Context

This migration adds multi-tier memory support for natural voice conversations:
1. conversation_memory - Short-term session memory (topics, entities, emotions)
2. user_context - Medium-term user preferences and interests
3. user_speech_profiles - Long-term speech patterns for turn-taking optimization
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create voice intelligence memory tables."""

    # 1. Conversation Memory - Short-term session context
    op.create_table(
        "conversation_memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Memory type: "topic", "entity", "emotion", "reference", "context"
        sa.Column("memory_type", sa.String(50), nullable=False, index=True),
        # Memory content
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("metadata", JSONB, server_default="{}"),
        # Relevance tracking
        sa.Column("relevance_score", sa.Float, server_default="1.0"),
        sa.Column("access_count", sa.Integer, server_default="1"),
        sa.Column("last_accessed", sa.DateTime(timezone=True), server_default=sa.func.now()),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Index for efficient memory retrieval
    op.create_index(
        "ix_conversation_memory_session_type",
        "conversation_memory",
        ["session_id", "memory_type"],
    )

    # 2. User Context - Medium-term user preferences
    op.create_table(
        "user_context",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Context category: "interest", "knowledge", "preference", "concern", "history"
        sa.Column("category", sa.String(50), nullable=False, index=True),
        # Context content
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("confidence", sa.Float, server_default="0.5"),
        sa.Column("metadata", JSONB, server_default="{}"),
        # Learning tracking
        sa.Column("observation_count", sa.Integer, server_default="1"),
        sa.Column("last_confirmed", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contradicted", sa.Boolean, server_default="false"),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    # Unique constraint on user + category + key
    op.create_index(
        "ix_user_context_user_category_key",
        "user_context",
        ["user_id", "category", "key"],
        unique=True,
    )

    # 3. User Speech Profiles - Long-term speech patterns
    op.create_table(
        "user_speech_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        # Speech rate metrics
        sa.Column("avg_words_per_minute", sa.Float, server_default="140.0"),
        sa.Column("wpm_std_deviation", sa.Float, server_default="20.0"),
        sa.Column("min_observed_wpm", sa.Float, nullable=True),
        sa.Column("max_observed_wpm", sa.Float, nullable=True),
        # Pause patterns
        sa.Column("avg_pause_duration_ms", sa.Integer, server_default="300"),
        sa.Column("typical_thinking_pause_ms", sa.Integer, server_default="800"),
        sa.Column("turn_yield_threshold_ms", sa.Integer, server_default="1500"),
        # Response timing preferences (learned)
        sa.Column("preferred_response_delay_ms", sa.Integer, server_default="200"),
        sa.Column("backchannel_frequency", sa.Float, server_default="0.3"),
        sa.Column("barge_in_sensitivity", sa.Float, server_default="0.5"),
        # Voice characteristics (for voice auth if enabled)
        sa.Column("voice_embedding", JSONB, nullable=True),
        sa.Column("speaker_confidence", sa.Float, nullable=True),
        # Learning metadata
        sa.Column("total_voice_sessions", sa.Integer, server_default="0"),
        sa.Column("total_utterances", sa.Integer, server_default="0"),
        sa.Column("total_voice_minutes", sa.Float, server_default="0.0"),
        sa.Column("last_voice_session", sa.DateTime(timezone=True), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop voice intelligence memory tables."""
    op.drop_table("user_speech_profiles")
    op.drop_index("ix_user_context_user_category_key", table_name="user_context")
    op.drop_table("user_context")
    op.drop_index("ix_conversation_memory_session_type", table_name="conversation_memory")
    op.drop_table("conversation_memory")
