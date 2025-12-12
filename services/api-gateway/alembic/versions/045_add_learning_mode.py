"""Add learning mode tables for spaced repetition

Revision ID: 045
Revises: 044
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# revision identifiers, used by Alembic.
revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Study decks - collections of flashcards
    op.create_table(
        "study_decks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("tags", ARRAY(sa.Text), nullable=True),
        # Statistics
        sa.Column("cards_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cards_mastered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_reviews", sa.Integer, nullable=False, server_default="0"),
        # Settings
        sa.Column("new_cards_per_day", sa.Integer, nullable=False, server_default="20"),
        sa.Column("review_cards_per_day", sa.Integer, nullable=False, server_default="100"),
        sa.Column("settings", JSONB, nullable=True),
        # Timestamps
        sa.Column("last_studied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Flashcards - individual study items
    op.create_table(
        "flashcards",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("deck_id", UUID(as_uuid=True), sa.ForeignKey("study_decks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("page_number", sa.Integer, nullable=True),
        sa.Column("chunk_id", sa.String(255), nullable=True),
        # Card content
        sa.Column("card_type", sa.String(50), nullable=False),  # basic, cloze, multiple_choice, true_false
        sa.Column("front", sa.Text, nullable=False),  # Question/prompt
        sa.Column("back", sa.Text, nullable=False),  # Answer
        sa.Column("extra_info", sa.Text, nullable=True),  # Additional context
        sa.Column("tags", ARRAY(sa.Text), nullable=True),
        # For multiple choice
        sa.Column("choices", JSONB, nullable=True),  # List of choices with correct answer
        # Media
        sa.Column("front_image_path", sa.String(500), nullable=True),
        sa.Column("back_image_path", sa.String(500), nullable=True),
        sa.Column("audio_path", sa.String(500), nullable=True),  # TTS pronunciation
        # Spaced repetition data (SM-2 algorithm)
        sa.Column("ease_factor", sa.Float, nullable=False, server_default="2.5"),  # 1.3 to 4.0
        sa.Column("interval_days", sa.Integer, nullable=False, server_default="0"),
        sa.Column("repetitions", sa.Integer, nullable=False, server_default="0"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="'new'"),  # new, learning, review, relearning, suspended
        # Statistics
        sa.Column("review_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("correct_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        # Generation
        sa.Column("generation_method", sa.String(50), nullable=True),  # manual, ai_generated, imported
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Review history - tracks each review session
    op.create_table(
        "flashcard_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("flashcard_id", UUID(as_uuid=True), sa.ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        # Review data
        sa.Column("rating", sa.Integer, nullable=False),  # 1=Again, 2=Hard, 3=Good, 4=Easy
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("was_correct", sa.Boolean, nullable=True),  # For quiz-style cards
        # State before/after
        sa.Column("ease_before", sa.Float, nullable=True),
        sa.Column("ease_after", sa.Float, nullable=True),
        sa.Column("interval_before", sa.Integer, nullable=True),
        sa.Column("interval_after", sa.Integer, nullable=True),
        # Context
        sa.Column("study_mode", sa.String(50), nullable=True),  # review, learn, cram
        sa.Column("session_id", sa.String(100), nullable=True),  # Group reviews into sessions
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Study sessions - tracks complete study sessions
    op.create_table(
        "study_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("deck_id", UUID(as_uuid=True), sa.ForeignKey("study_decks.id", ondelete="CASCADE"), nullable=True),
        # Session metrics
        sa.Column("cards_studied", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cards_correct", sa.Integer, nullable=False, server_default="0"),
        sa.Column("new_cards", sa.Integer, nullable=False, server_default="0"),
        sa.Column("review_cards", sa.Integer, nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        # Timing
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # User learning statistics
    op.create_table(
        "user_learning_stats",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False),
        # Overall stats
        sa.Column("total_cards_studied", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_reviews", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_study_time_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("current_streak_days", sa.Integer, nullable=False, server_default="0"),
        sa.Column("longest_streak_days", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_study_date", sa.Date, nullable=True),
        # Daily stats (rolling 30-day history)
        sa.Column("daily_stats", JSONB, nullable=True),  # {date: {cards, correct, time}}
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # AI-generated flashcard suggestions
    op.create_table(
        "flashcard_suggestions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer, nullable=True),
        sa.Column("chunk_id", sa.String(255), nullable=True),
        # Suggested card
        sa.Column("card_type", sa.String(50), nullable=False),
        sa.Column("front", sa.Text, nullable=False),
        sa.Column("back", sa.Text, nullable=False),
        sa.Column("choices", JSONB, nullable=True),
        # Status
        sa.Column("status", sa.String(50), nullable=False, server_default="'pending'"),  # pending, accepted, rejected, modified
        sa.Column("deck_id", UUID(as_uuid=True), sa.ForeignKey("study_decks.id", ondelete="SET NULL"), nullable=True),  # If accepted
        # Metadata
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes
    op.create_index("ix_decks_user", "study_decks", ["user_id"])
    op.create_index("ix_decks_document", "study_decks", ["document_id"])
    op.create_index("ix_decks_public", "study_decks", ["is_public"])

    op.create_index("ix_cards_deck", "flashcards", ["deck_id"])
    op.create_index("ix_cards_document", "flashcards", ["document_id"])
    op.create_index("ix_cards_due", "flashcards", ["due_date"])
    op.create_index("ix_cards_status", "flashcards", ["status"])

    op.create_index("ix_reviews_card", "flashcard_reviews", ["flashcard_id"])
    op.create_index("ix_reviews_user", "flashcard_reviews", ["user_id"])
    op.create_index("ix_reviews_session", "flashcard_reviews", ["session_id"])

    op.create_index("ix_sessions_user", "study_sessions", ["user_id"])
    op.create_index("ix_sessions_deck", "study_sessions", ["deck_id"])
    op.create_index("ix_sessions_started", "study_sessions", ["started_at"])

    op.create_index("ix_suggestions_user", "flashcard_suggestions", ["user_id"])
    op.create_index("ix_suggestions_document", "flashcard_suggestions", ["document_id"])
    op.create_index("ix_suggestions_status", "flashcard_suggestions", ["status"])


def downgrade() -> None:
    op.drop_table("flashcard_suggestions")
    op.drop_table("user_learning_stats")
    op.drop_table("study_sessions")
    op.drop_table("flashcard_reviews")
    op.drop_table("flashcards")
    op.drop_table("study_decks")
