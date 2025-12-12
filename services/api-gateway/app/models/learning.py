"""
Learning mode models for spaced repetition system.

Implements SM-2 algorithm for flashcard scheduling and tracks
user study progress.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship


class StudyDeck(Base):
    """
    A collection of flashcards for studying.

    Can be linked to a specific document or be user-created.
    """

    __tablename__ = "study_decks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_public = Column(Boolean, nullable=False, default=False)
    tags = Column(ARRAY(Text), nullable=True)

    # Statistics
    cards_count = Column(Integer, nullable=False, default=0)
    cards_mastered = Column(Integer, nullable=False, default=0)
    total_reviews = Column(Integer, nullable=False, default=0)

    # Settings
    new_cards_per_day = Column(Integer, nullable=False, default=20)
    review_cards_per_day = Column(Integer, nullable=False, default=100)
    settings = Column(JSONB, nullable=True)

    # Timestamps
    last_studied_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    document = relationship("Document", foreign_keys=[document_id])
    flashcards = relationship("Flashcard", back_populates="deck", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "description": self.description,
            "document_id": str(self.document_id) if self.document_id else None,
            "is_public": self.is_public,
            "tags": self.tags,
            "cards_count": self.cards_count,
            "cards_mastered": self.cards_mastered,
            "total_reviews": self.total_reviews,
            "new_cards_per_day": self.new_cards_per_day,
            "review_cards_per_day": self.review_cards_per_day,
            "settings": self.settings,
            "last_studied_at": self.last_studied_at.isoformat() if self.last_studied_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_brief(self) -> Dict[str, Any]:
        """Get brief representation."""
        return {
            "id": str(self.id),
            "name": self.name,
            "cards_count": self.cards_count,
            "cards_mastered": self.cards_mastered,
            "last_studied_at": self.last_studied_at.isoformat() if self.last_studied_at else None,
        }

    @property
    def mastery_percentage(self) -> float:
        """Calculate mastery percentage."""
        if self.cards_count == 0:
            return 0.0
        return (self.cards_mastered / self.cards_count) * 100


class Flashcard(Base):
    """
    Individual flashcard for studying.

    Uses SM-2 spaced repetition algorithm for scheduling.
    """

    __tablename__ = "flashcards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deck_id = Column(
        UUID(as_uuid=True),
        ForeignKey("study_decks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    page_number = Column(Integer, nullable=True)
    chunk_id = Column(String(255), nullable=True)

    # Card content
    card_type = Column(String(50), nullable=False)  # basic, cloze, multiple_choice, true_false
    front = Column(Text, nullable=False)  # Question/prompt
    back = Column(Text, nullable=False)  # Answer
    extra_info = Column(Text, nullable=True)  # Additional context
    tags = Column(ARRAY(Text), nullable=True)

    # For multiple choice
    choices = Column(JSONB, nullable=True)

    # Media
    front_image_path = Column(String(500), nullable=True)
    back_image_path = Column(String(500), nullable=True)
    audio_path = Column(String(500), nullable=True)

    # SM-2 spaced repetition data
    ease_factor = Column(Float, nullable=False, default=2.5)  # 1.3 to 4.0
    interval_days = Column(Integer, nullable=False, default=0)
    repetitions = Column(Integer, nullable=False, default=0)
    due_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), nullable=False, default="new")

    # Statistics
    review_count = Column(Integer, nullable=False, default=0)
    correct_count = Column(Integer, nullable=False, default=0)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Generation
    generation_method = Column(String(50), nullable=True)
    card_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    deck = relationship("StudyDeck", back_populates="flashcards")
    document = relationship("Document", foreign_keys=[document_id])
    reviews = relationship("FlashcardReview", back_populates="flashcard", cascade="all, delete-orphan")

    # Card type constants
    TYPE_BASIC = "basic"
    TYPE_CLOZE = "cloze"
    TYPE_MULTIPLE_CHOICE = "multiple_choice"
    TYPE_TRUE_FALSE = "true_false"

    VALID_CARD_TYPES = [TYPE_BASIC, TYPE_CLOZE, TYPE_MULTIPLE_CHOICE, TYPE_TRUE_FALSE]

    # Status constants
    STATUS_NEW = "new"
    STATUS_LEARNING = "learning"
    STATUS_REVIEW = "review"
    STATUS_RELEARNING = "relearning"
    STATUS_SUSPENDED = "suspended"

    VALID_STATUSES = [STATUS_NEW, STATUS_LEARNING, STATUS_REVIEW, STATUS_RELEARNING, STATUS_SUSPENDED]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "deck_id": str(self.deck_id),
            "document_id": str(self.document_id) if self.document_id else None,
            "page_number": self.page_number,
            "chunk_id": self.chunk_id,
            "card_type": self.card_type,
            "front": self.front,
            "back": self.back,
            "extra_info": self.extra_info,
            "tags": self.tags,
            "choices": self.choices,
            "front_image_path": self.front_image_path,
            "back_image_path": self.back_image_path,
            "audio_path": self.audio_path,
            "ease_factor": self.ease_factor,
            "interval_days": self.interval_days,
            "repetitions": self.repetitions,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "status": self.status,
            "review_count": self.review_count,
            "correct_count": self.correct_count,
            "last_reviewed_at": self.last_reviewed_at.isoformat() if self.last_reviewed_at else None,
            "generation_method": self.generation_method,
            "metadata": self.card_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_study(self) -> Dict[str, Any]:
        """Get card data for study session."""
        return {
            "id": str(self.id),
            "card_type": self.card_type,
            "front": self.front,
            "back": self.back,
            "extra_info": self.extra_info,
            "choices": self.choices,
            "front_image_path": self.front_image_path,
            "back_image_path": self.back_image_path,
            "audio_path": self.audio_path,
            "status": self.status,
        }

    @property
    def accuracy(self) -> float:
        """Calculate accuracy percentage."""
        if self.review_count == 0:
            return 0.0
        return (self.correct_count / self.review_count) * 100

    @property
    def is_due(self) -> bool:
        """Check if card is due for review."""
        if self.status == self.STATUS_NEW:
            return True
        if self.due_date is None:
            return True
        return datetime.utcnow() >= self.due_date

    def apply_sm2(self, rating: int) -> None:
        """
        Apply SM-2 algorithm based on rating.

        Rating scale:
        1 = Again (complete blackout)
        2 = Hard (remembered with difficulty)
        3 = Good (correct with some hesitation)
        4 = Easy (correct immediately)
        """
        self.review_count += 1
        self.last_reviewed_at = datetime.utcnow()

        if rating >= 3:
            self.correct_count += 1

        if rating == 1:  # Again
            self.repetitions = 0
            self.interval_days = 1
            self.status = self.STATUS_RELEARNING
        elif rating == 2:  # Hard
            self.interval_days = max(1, int(self.interval_days * 1.2))
            self.ease_factor = max(1.3, self.ease_factor - 0.15)
        elif rating == 3:  # Good
            if self.repetitions == 0:
                self.interval_days = 1
            elif self.repetitions == 1:
                self.interval_days = 6
            else:
                self.interval_days = int(self.interval_days * self.ease_factor)
            self.repetitions += 1
            self.status = self.STATUS_REVIEW
        elif rating == 4:  # Easy
            if self.repetitions == 0:
                self.interval_days = 4
            else:
                self.interval_days = int(self.interval_days * self.ease_factor * 1.3)
            self.ease_factor = min(4.0, self.ease_factor + 0.15)
            self.repetitions += 1
            self.status = self.STATUS_REVIEW

        # Set next due date
        self.due_date = datetime.utcnow() + timedelta(days=self.interval_days)
        self.updated_at = datetime.utcnow()


class FlashcardReview(Base):
    """
    Tracks individual card reviews.

    Stores history of each review for analytics.
    """

    __tablename__ = "flashcard_reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flashcard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("flashcards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Review data
    rating = Column(Integer, nullable=False)  # 1-4
    response_time_ms = Column(Integer, nullable=True)
    was_correct = Column(Boolean, nullable=True)

    # State before/after
    ease_before = Column(Float, nullable=True)
    ease_after = Column(Float, nullable=True)
    interval_before = Column(Integer, nullable=True)
    interval_after = Column(Integer, nullable=True)

    # Context
    study_mode = Column(String(50), nullable=True)
    session_id = Column(String(100), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    flashcard = relationship("Flashcard", back_populates="reviews")
    user = relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "flashcard_id": str(self.flashcard_id),
            "user_id": str(self.user_id),
            "rating": self.rating,
            "response_time_ms": self.response_time_ms,
            "was_correct": self.was_correct,
            "ease_before": self.ease_before,
            "ease_after": self.ease_after,
            "interval_before": self.interval_before,
            "interval_after": self.interval_after,
            "study_mode": self.study_mode,
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class StudySession(Base):
    """
    Tracks complete study sessions.

    Groups multiple reviews into a single session.
    """

    __tablename__ = "study_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    deck_id = Column(
        UUID(as_uuid=True),
        ForeignKey("study_decks.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Session metrics
    cards_studied = Column(Integer, nullable=False, default=0)
    cards_correct = Column(Integer, nullable=False, default=0)
    new_cards = Column(Integer, nullable=False, default=0)
    review_cards = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(Integer, nullable=True)

    # Timing
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    deck = relationship("StudyDeck", foreign_keys=[deck_id])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "deck_id": str(self.deck_id) if self.deck_id else None,
            "cards_studied": self.cards_studied,
            "cards_correct": self.cards_correct,
            "new_cards": self.new_cards,
            "review_cards": self.review_cards,
            "duration_seconds": self.duration_seconds,
            "accuracy": self.accuracy,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }

    @property
    def accuracy(self) -> float:
        """Calculate session accuracy."""
        if self.cards_studied == 0:
            return 0.0
        return (self.cards_correct / self.cards_studied) * 100

    def end_session(self) -> None:
        """End the study session."""
        self.ended_at = datetime.utcnow()
        if self.started_at:
            self.duration_seconds = int((self.ended_at - self.started_at).total_seconds())


class UserLearningStats(Base):
    """
    Aggregated learning statistics for a user.

    Tracks overall progress and streaks.
    """

    __tablename__ = "user_learning_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Overall stats
    total_cards_studied = Column(Integer, nullable=False, default=0)
    total_reviews = Column(Integer, nullable=False, default=0)
    total_study_time_seconds = Column(Integer, nullable=False, default=0)
    current_streak_days = Column(Integer, nullable=False, default=0)
    longest_streak_days = Column(Integer, nullable=False, default=0)
    last_study_date = Column(Date, nullable=True)

    # Daily stats
    daily_stats = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "total_cards_studied": self.total_cards_studied,
            "total_reviews": self.total_reviews,
            "total_study_time_seconds": self.total_study_time_seconds,
            "total_study_time_hours": round(self.total_study_time_seconds / 3600, 1),
            "current_streak_days": self.current_streak_days,
            "longest_streak_days": self.longest_streak_days,
            "last_study_date": self.last_study_date.isoformat() if self.last_study_date else None,
            "daily_stats": self.daily_stats,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def update_streak(self) -> None:
        """Update streak based on study activity."""
        today = date.today()

        if self.last_study_date is None:
            self.current_streak_days = 1
        elif self.last_study_date == today:
            # Already studied today
            pass
        elif self.last_study_date == today - timedelta(days=1):
            # Continued streak
            self.current_streak_days += 1
        else:
            # Streak broken
            self.current_streak_days = 1

        self.last_study_date = today
        self.longest_streak_days = max(self.longest_streak_days, self.current_streak_days)
        self.updated_at = datetime.utcnow()


class FlashcardSuggestion(Base):
    """
    AI-generated flashcard suggestions.

    Created when processing documents, waiting for user review.
    """

    __tablename__ = "flashcard_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number = Column(Integer, nullable=True)
    chunk_id = Column(String(255), nullable=True)

    # Suggested card
    card_type = Column(String(50), nullable=False)
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    choices = Column(JSONB, nullable=True)

    # Status
    status = Column(String(50), nullable=False, default="pending")
    deck_id = Column(
        UUID(as_uuid=True),
        ForeignKey("study_decks.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Metadata
    confidence = Column(Float, nullable=True)
    suggestion_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    document = relationship("Document", foreign_keys=[document_id])
    deck = relationship("StudyDeck", foreign_keys=[deck_id])

    # Status constants
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_MODIFIED = "modified"

    VALID_STATUSES = [STATUS_PENDING, STATUS_ACCEPTED, STATUS_REJECTED, STATUS_MODIFIED]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "document_id": str(self.document_id),
            "page_number": self.page_number,
            "chunk_id": self.chunk_id,
            "card_type": self.card_type,
            "front": self.front,
            "back": self.back,
            "choices": self.choices,
            "status": self.status,
            "deck_id": str(self.deck_id) if self.deck_id else None,
            "confidence": self.confidence,
            "metadata": self.suggestion_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
