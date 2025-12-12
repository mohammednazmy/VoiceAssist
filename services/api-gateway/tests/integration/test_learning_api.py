"""Integration tests for Learning Mode API (Spaced Repetition)"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from app.main import app
from app.models.learning import (
    Flashcard,
    FlashcardReview,
    StudyDeck,
    StudySession,
    UserLearningStats,
)
from fastapi.testclient import TestClient


class TestLearningAPISmoke:
    """Smoke tests to verify learning routes are registered"""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.mark.smoke
    def test_decks_list_route_exists(self, client):
        """Verify GET /api/learning/decks route is registered"""
        resp = client.get("/api/learning/decks")
        # Should return 401/403 for unauthenticated, not 404
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_decks_create_route_exists(self, client):
        """Verify POST /api/learning/decks route is registered"""
        resp = client.post("/api/learning/decks", json={})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.smoke
    def test_deck_detail_route_exists(self, client):
        """Verify GET /api/learning/decks/{deck_id} route is registered"""
        resp = client.get(f"/api/learning/decks/{uuid4()}")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_deck_cards_route_exists(self, client):
        """Verify GET /api/learning/decks/{deck_id}/cards route is registered"""
        resp = client.get(f"/api/learning/decks/{uuid4()}/cards")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_card_create_route_exists(self, client):
        """Verify POST /api/learning/cards route is registered"""
        resp = client.post("/api/learning/cards", json={})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.smoke
    def test_card_detail_route_exists(self, client):
        """Verify GET /api/learning/cards/{card_id} route is registered"""
        resp = client.get(f"/api/learning/cards/{uuid4()}")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_study_queue_route_exists(self, client):
        """Verify GET /api/learning/decks/{deck_id}/study-queue route is registered"""
        resp = client.get(f"/api/learning/decks/{uuid4()}/study-queue")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_due_cards_route_exists(self, client):
        """Verify GET /api/learning/due-cards route is registered"""
        resp = client.get("/api/learning/due-cards")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_start_session_route_exists(self, client):
        """Verify POST /api/learning/sessions/start route is registered"""
        resp = client.post("/api/learning/sessions/start", json={})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.smoke
    def test_review_card_route_exists(self, client):
        """Verify POST /api/learning/cards/{card_id}/review route is registered"""
        resp = client.post(f"/api/learning/cards/{uuid4()}/review", json={})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.smoke
    def test_stats_route_exists(self, client):
        """Verify GET /api/learning/stats route is registered"""
        resp = client.get("/api/learning/stats")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_generate_flashcards_route_exists(self, client):
        """Verify POST /api/learning/generate route is registered"""
        resp = client.post("/api/learning/generate", json={})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.smoke
    def test_suggestions_route_exists(self, client):
        """Verify GET /api/learning/suggestions route is registered"""
        resp = client.get("/api/learning/suggestions")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_history_route_exists(self, client):
        """Verify GET /api/learning/history route is registered"""
        resp = client.get("/api/learning/history")
        assert resp.status_code in (401, 403)


class TestSM2AlgorithmIntegration:
    """Tests for SM-2 spaced repetition algorithm"""

    def test_sm2_rating_1_resets_card(self):
        """Test rating 1 (again) resets interval and sets relearning status"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=10,
            repetitions=5,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=1)

        assert card.interval_days == 1  # Reset to 1 day
        assert card.repetitions == 0  # Reset repetitions
        assert card.status == Flashcard.STATUS_RELEARNING
        assert card.review_count == 1  # Review count incremented
        assert card.correct_count == 0  # Not correct for rating 1

    def test_sm2_rating_2_increases_interval_slightly(self):
        """Test rating 2 (hard) slightly increases interval"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=10,
            repetitions=5,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=2)

        # Interval = max(1, 10 * 1.2) = 12
        assert card.interval_days == 12
        assert card.ease_factor == 2.35  # 2.5 - 0.15 = 2.35
        assert card.review_count == 1  # Review count incremented

    def test_sm2_rating_3_increases_interval(self):
        """Test rating 3 (good) increases interval normally"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=3)

        assert card.interval_days == 1  # First review (rep=0) stays at 1
        assert card.repetitions == 1
        assert card.status == Flashcard.STATUS_REVIEW
        assert card.correct_count == 1  # Correct for rating >= 3

        # Second review (rep=1)
        card.apply_sm2(rating=3)
        assert card.interval_days == 6  # Second review goes to 6
        assert card.repetitions == 2
        assert card.correct_count == 2

    def test_sm2_rating_4_increases_interval_with_bonus(self):
        """Test rating 4 (easy) increases interval with ease bonus"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=6,
            repetitions=2,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=4)

        # Interval should increase: 6 * 2.5 * 1.3 = 19.5 -> 19
        assert card.interval_days == 19
        assert card.repetitions == 3
        # Ease should increase for rating 4: 2.5 + 0.15 = 2.65
        assert card.ease_factor == 2.65
        assert card.correct_count == 1

    def test_sm2_rating_4_first_review(self):
        """Test rating 4 (easy) on first review sets interval to 4"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=0,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=4)

        assert card.interval_days == 4  # First easy review = 4 days
        assert card.repetitions == 1
        assert card.ease_factor == 2.65

    def test_sm2_ease_factor_minimum(self):
        """Test ease factor doesn't go below minimum (1.3)"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=1.4,  # Close to minimum
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        # Multiple hard ratings - each reduces ease by 0.15
        for _ in range(10):
            card.apply_sm2(rating=2)

        assert card.ease_factor >= 1.3  # Should not go below 1.3

    def test_sm2_ease_factor_maximum(self):
        """Test ease factor doesn't go above maximum (4.0)"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=3.8,
            interval_days=1,
            repetitions=2,
            review_count=0,
            correct_count=0,
        )

        # Apply easy rating - should increase ease by 0.15
        card.apply_sm2(rating=4)
        assert pytest.approx(card.ease_factor, abs=0.01) == 3.95

        # Apply another easy rating - should cap at 4.0
        card.apply_sm2(rating=4)
        assert card.ease_factor == 4.0

        # Apply more easy ratings - should stay at 4.0 (capped)
        card.apply_sm2(rating=4)
        assert card.ease_factor == 4.0

    def test_sm2_due_date_calculation(self):
        """Test due date is calculated correctly"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        before_review = datetime.utcnow()
        card.apply_sm2(rating=3)
        after_review = datetime.utcnow()

        # Due date should be approximately interval_days from now
        expected_due = after_review + timedelta(days=card.interval_days)
        assert card.due_date is not None
        # Allow 1 minute tolerance for test execution time
        assert abs((card.due_date - expected_due).total_seconds()) < 60

    def test_sm2_last_reviewed_at_updated(self):
        """Test last_reviewed_at is updated on review"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        before = datetime.utcnow()
        card.apply_sm2(rating=3)
        after = datetime.utcnow()

        assert card.last_reviewed_at is not None
        assert before <= card.last_reviewed_at <= after

    def test_sm2_correct_count_incremented(self):
        """Test correct_count is incremented for good/easy ratings (>= 3)"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Question",
            back="Answer",
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            review_count=0,
            correct_count=0,
        )

        card.apply_sm2(rating=3)  # Good
        assert card.correct_count == 1
        assert card.review_count == 1

        card.apply_sm2(rating=4)  # Easy
        assert card.correct_count == 2
        assert card.review_count == 2

        card.apply_sm2(rating=2)  # Hard - not correct (rating < 3)
        assert card.correct_count == 2
        assert card.review_count == 3

        card.apply_sm2(rating=1)  # Again - not correct
        assert card.correct_count == 2
        assert card.review_count == 4


class TestLearningModelsIntegration:
    """Tests for Learning model operations"""

    def test_study_deck_to_dict_structure(self):
        """Test StudyDeck to_dict has correct structure"""
        deck = StudyDeck(
            id=uuid4(),
            user_id=uuid4(),
            name="Medical Terms",
            description="Common medical terminology",
            tags=["medical", "terminology"],
            is_public=False,
            cards_count=50,
            cards_mastered=15,
            total_reviews=200,
        )
        result = deck.to_dict()

        assert result["name"] == "Medical Terms"
        assert result["description"] == "Common medical terminology"
        assert result["tags"] == ["medical", "terminology"]
        assert result["cards_count"] == 50
        assert result["cards_mastered"] == 15

    def test_study_deck_mastery_percentage(self):
        """Test StudyDeck mastery percentage calculation"""
        deck = StudyDeck(
            id=uuid4(),
            user_id=uuid4(),
            name="Test Deck",
            cards_count=100,
            cards_mastered=75,
        )

        assert deck.mastery_percentage == 75.0

    def test_study_deck_zero_cards_mastery(self):
        """Test StudyDeck mastery with zero cards"""
        deck = StudyDeck(
            id=uuid4(),
            user_id=uuid4(),
            name="Empty Deck",
            cards_count=0,
            cards_mastered=0,
        )

        assert deck.mastery_percentage == 0.0

    def test_flashcard_to_dict_structure(self):
        """Test Flashcard to_dict has correct structure"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="What is tachycardia?",
            back="Heart rate > 100 bpm",
            tags=["cardiology", "definitions"],
            ease_factor=2.5,
            interval_days=10,
            repetitions=5,
        )
        result = card.to_dict()

        assert result["front"] == "What is tachycardia?"
        assert result["back"] == "Heart rate > 100 bpm"
        assert result["ease_factor"] == 2.5
        assert result["interval_days"] == 10
        assert result["repetitions"] == 5

    def test_flashcard_accuracy_calculation(self):
        """Test Flashcard accuracy calculation"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Q",
            back="A",
            review_count=10,
            correct_count=8,
        )

        assert card.accuracy == 80.0

    def test_flashcard_is_due_new_card(self):
        """Test new card is due immediately"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Q",
            back="A",
            status=Flashcard.STATUS_NEW,
        )

        assert card.is_due is True

    def test_flashcard_is_due_past_date(self):
        """Test card is due when due_date has passed"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Q",
            back="A",
            status=Flashcard.STATUS_REVIEW,
            due_date=datetime.utcnow() - timedelta(hours=1),
        )

        assert card.is_due is True

    def test_flashcard_not_due_future_date(self):
        """Test card is not due when due_date is in future"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type="basic",
            front="Q",
            back="A",
            status=Flashcard.STATUS_REVIEW,
            due_date=datetime.utcnow() + timedelta(days=5),
        )

        assert card.is_due is False

    def test_flashcard_review_to_dict_structure(self):
        """Test FlashcardReview to_dict structure"""
        review = FlashcardReview(
            id=uuid4(),
            flashcard_id=uuid4(),
            user_id=uuid4(),
            rating=3,
            response_time_ms=1500,
            was_correct=True,
            ease_before=2.5,
            ease_after=2.36,
            interval_before=6,
            interval_after=15,
        )
        result = review.to_dict()

        assert result["rating"] == 3
        assert result["response_time_ms"] == 1500
        assert result["was_correct"] is True
        assert result["ease_before"] == 2.5
        assert result["ease_after"] == 2.36

    def test_study_session_to_dict_structure(self):
        """Test StudySession to_dict structure"""
        session = StudySession(
            id=uuid4(),
            user_id=uuid4(),
            deck_id=uuid4(),
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow() + timedelta(minutes=15),
            cards_studied=20,
            cards_correct=18,
            new_cards=5,
            review_cards=15,
            duration_seconds=900,
        )
        result = session.to_dict()

        assert result["cards_studied"] == 20
        assert result["cards_correct"] == 18
        assert result["accuracy"] == 90.0  # 18/20 * 100

    def test_study_session_accuracy_calculation(self):
        """Test StudySession accuracy is calculated correctly"""
        session = StudySession(
            id=uuid4(),
            user_id=uuid4(),
            started_at=datetime.utcnow(),
            cards_studied=10,
            cards_correct=7,
        )

        assert session.accuracy == 70.0

    def test_study_session_zero_cards_accuracy(self):
        """Test StudySession with zero cards doesn't cause division error"""
        session = StudySession(
            id=uuid4(),
            user_id=uuid4(),
            started_at=datetime.utcnow(),
            cards_studied=0,
            cards_correct=0,
        )

        assert session.accuracy == 0.0

    def test_study_session_end_session(self):
        """Test ending a study session"""
        started = datetime.utcnow()
        session = StudySession(
            id=uuid4(),
            user_id=uuid4(),
            started_at=started,
        )

        session.end_session()

        assert session.ended_at is not None
        assert session.duration_seconds is not None
        assert session.duration_seconds >= 0

    def test_user_learning_stats_to_dict(self):
        """Test UserLearningStats to_dict structure"""
        stats = UserLearningStats(
            id=uuid4(),
            user_id=uuid4(),
            total_cards_studied=500,
            total_reviews=1500,
            total_study_time_seconds=36000,  # 10 hours
            current_streak_days=7,
            longest_streak_days=14,
        )
        result = stats.to_dict()

        assert result["total_cards_studied"] == 500
        assert result["total_reviews"] == 1500
        assert result["total_study_time_hours"] == 10.0
        assert result["current_streak_days"] == 7
        assert result["longest_streak_days"] == 14

    def test_user_learning_stats_update_streak_new_user(self):
        """Test streak update for new user"""
        stats = UserLearningStats(
            id=uuid4(),
            user_id=uuid4(),
            last_study_date=None,
            current_streak_days=0,
            longest_streak_days=0,
        )

        stats.update_streak()

        assert stats.current_streak_days == 1
        assert stats.longest_streak_days == 1

    def test_user_learning_stats_update_streak_continued(self):
        """Test streak continues when studying consecutive days"""
        from datetime import date

        yesterday = date.today() - timedelta(days=1)
        stats = UserLearningStats(
            id=uuid4(),
            user_id=uuid4(),
            last_study_date=yesterday,
            current_streak_days=5,
            longest_streak_days=10,
        )

        stats.update_streak()

        assert stats.current_streak_days == 6
        assert stats.longest_streak_days == 10

    def test_user_learning_stats_update_streak_broken(self):
        """Test streak resets when missing a day"""
        from datetime import date

        two_days_ago = date.today() - timedelta(days=2)
        stats = UserLearningStats(
            id=uuid4(),
            user_id=uuid4(),
            last_study_date=two_days_ago,
            current_streak_days=5,
            longest_streak_days=10,
        )

        stats.update_streak()

        assert stats.current_streak_days == 1  # Reset
        assert stats.longest_streak_days == 10  # Preserved


class TestFlashcardTypes:
    """Tests for different flashcard types"""

    def test_basic_card_type(self):
        """Test basic flashcard type"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_BASIC,
            front="What is the capital of France?",
            back="Paris",
        )

        assert card.card_type == "basic"
        result = card.to_study()
        assert result["card_type"] == "basic"

    def test_multiple_choice_card_type(self):
        """Test multiple choice flashcard"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_MULTIPLE_CHOICE,
            front="Which is the largest organ?",
            back="Skin",
            choices=["Heart", "Liver", "Skin", "Brain"],
        )

        assert card.card_type == "multiple_choice"
        result = card.to_dict()
        assert result["choices"] == ["Heart", "Liver", "Skin", "Brain"]

    def test_cloze_card_type(self):
        """Test cloze deletion flashcard"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_CLOZE,
            front="The heart has {{c1::four}} chambers",
            back="four",
        )

        assert card.card_type == "cloze"

    def test_true_false_card_type(self):
        """Test true/false flashcard"""
        card = Flashcard(
            id=uuid4(),
            deck_id=uuid4(),
            card_type=Flashcard.TYPE_TRUE_FALSE,
            front="The heart is located on the left side of the chest",
            back="True",
        )

        assert card.card_type == "true_false"


# Database integration tests (require db fixture)
@pytest.mark.skip(reason="Requires database fixture")
class TestLearningDBIntegration:
    """Database integration tests for learning features"""

    @pytest.mark.asyncio
    async def test_create_deck_and_flashcards(self, db):
        """Test creating deck with flashcards"""
        from app.services.learning_service import LearningService

        service = LearningService()
        user_id = uuid4()

        # Create deck
        deck = service.create_deck(
            db=db,
            user_id=user_id,
            name="Test Deck",
            description="Test description",
        )
        assert deck is not None

        # Add flashcards
        cards = []
        for i in range(5):
            card = service.create_flashcard(
                db=db,
                deck_id=deck.id,
                front=f"Question {i}",
                back=f"Answer {i}",
            )
            cards.append(card)

        assert len(cards) == 5

    @pytest.mark.asyncio
    async def test_study_session_workflow(self, db):
        """Test complete study session workflow"""
        from app.services.learning_service import LearningService

        service = LearningService()
        user_id = uuid4()

        # Create deck with cards
        deck = service.create_deck(db=db, user_id=user_id, name="Study Test")
        for i in range(3):
            service.create_flashcard(
                db=db, deck_id=deck.id, front=f"Q{i}", back=f"A{i}"
            )

        # Get due cards
        due_cards = service.get_due_cards(db=db, deck_id=deck.id, limit=10)
        assert len(due_cards) == 3
