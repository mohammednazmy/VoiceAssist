"""Tests for LearningService and learning models."""

from datetime import date, datetime, timedelta
from uuid import uuid4
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.models.learning import (
    Flashcard,
    StudyDeck,
    StudySession,
    UserLearningStats,
)
from app.services.learning_service import LearningService


@pytest.fixture
def mock_db() -> Session:
    """Mock database session."""
    return MagicMock(spec=Session)


@pytest.fixture
def service(mock_db: Session) -> LearningService:
    """LearningService bound to mock session."""
    return LearningService(mock_db)


class TestLearningService:
    """Behavioral tests for LearningService."""

    def test_create_deck_persists_and_returns_deck(
        self,
        service: LearningService,
        mock_db: Session,
    ) -> None:
        """create_deck adds a StudyDeck and commits."""
        user_id = str(uuid4())

        deck = service.create_deck(
            user_id=user_id,
            name="Cardiology",
            description="Heart-related flashcards",
        )

        assert isinstance(deck, StudyDeck)
        assert deck.name == "Cardiology"
        mock_db.add.assert_called()
        mock_db.commit.assert_called()

    def test_update_deck_returns_none_when_missing(
        self,
        service: LearningService,
        mock_db: Session,
    ) -> None:
        """update_deck returns None if deck does not exist."""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        result = service.update_deck(
            deck_id=str(uuid4()),
            user_id=str(uuid4()),
            name="New Name",
        )

        assert result is None

    def test_create_flashcard_invalid_type_raises(
        self,
        service: LearningService,
    ) -> None:
        """create_flashcard rejects unknown card types."""
        with pytest.raises(ValueError):
            service.create_flashcard(
                deck_id=str(uuid4()),
                card_type="invalid",
                front="Q",
                back="A",
            )


class TestFlashcardModel:
    """Model-level tests for Flashcard SM-2 behavior."""

    def test_apply_sm2_again_resets_interval_and_repetitions(self) -> None:
        card = Flashcard(
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_BASIC,
            front="Q",
            back="A",
            ease_factor=2.5,
            interval_days=10,
            repetitions=3,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(1)

        assert card.interval_days == 1
        assert card.repetitions == 0
        assert card.status == Flashcard.STATUS_RELEARNING

    def test_apply_sm2_easy_increases_interval_and_ease(self) -> None:
        card = Flashcard(
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_BASIC,
            front="Q",
            back="A",
            ease_factor=2.5,
            interval_days=6,
            repetitions=2,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(4)

        assert card.interval_days > 6
        assert card.ease_factor > 2.5
        assert card.status == Flashcard.STATUS_REVIEW

    def test_ease_factor_has_minimum(self) -> None:
        card = Flashcard(
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_BASIC,
            front="Q",
            back="A",
            ease_factor=1.4,
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        for _ in range(5):
            card.apply_sm2(1)

        assert card.ease_factor >= 1.3


class TestStudyDeckModel:
    """Model-level tests for StudyDeck."""

    def test_deck_to_dict_includes_counts(self) -> None:
        deck = StudyDeck(
            user_id=uuid4(),
            name="Cardiology",
            description="Heart flashcards",
            cards_count=50,
            cards_mastered=10,
            total_reviews=100,
        )

        data = deck.to_dict()

        assert data["name"] == "Cardiology"
        assert data["cards_count"] == 50
        assert data["cards_mastered"] == 10
        assert data["total_reviews"] == 100


class TestStudySessionModel:
    """Model-level tests for StudySession."""

    def test_session_to_dict_includes_accuracy(self) -> None:
        session = StudySession(
            user_id=uuid4(),
            deck_id=uuid4(),
            cards_studied=20,
            cards_correct=16,
            new_cards=5,
            review_cards=15,
            started_at=datetime.utcnow(),
        )

        data = session.to_dict()

        assert data["cards_studied"] == 20
        assert data["cards_correct"] == 16
        assert data["accuracy"] == pytest.approx(80.0)


class TestUserLearningStatsModel:
    """Model-level tests for UserLearningStats."""

    def test_stats_to_dict_and_update_streak(self) -> None:
        stats = UserLearningStats(
            user_id=uuid4(),
            total_cards_studied=100,
            total_reviews=400,
            total_study_time_seconds=3600,
            current_streak_days=0,
            longest_streak_days=0,
        )

        # Initial dict
        data = stats.to_dict()
        assert data["total_cards_studied"] == 100
        assert data["total_study_time_hours"] == 1.0

        # Update streak and verify it increments
        stats.update_streak()
        assert stats.current_streak_days == 1
        assert stats.longest_streak_days == 1
