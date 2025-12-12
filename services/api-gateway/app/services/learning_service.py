"""
Learning service for spaced repetition and flashcard management.

Implements SM-2 algorithm for card scheduling and provides
AI-powered flashcard generation from documents.
"""

import json
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import get_logger
from app.models.document import Document
from app.models.learning import (
    Flashcard,
    FlashcardReview,
    FlashcardSuggestion,
    StudyDeck,
    StudySession,
    UserLearningStats,
)
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class LearningService:
    """
    Service for managing flashcards and spaced repetition learning.

    Features:
    - Deck and flashcard management
    - SM-2 spaced repetition scheduling
    - AI-powered flashcard generation
    - Study session tracking
    - Learning analytics
    """

    # Flashcard generation prompt
    FLASHCARD_GENERATION_PROMPT = """Generate flashcards from this educational content. Create diverse question types that test understanding.

For each key concept, create one of these card types:
1. BASIC: Simple question and answer
2. CLOZE: Fill-in-the-blank (use {{c1::text}} for blanks)
3. MULTIPLE_CHOICE: Question with 4 options (mark correct with *)
4. TRUE_FALSE: Statement to evaluate

Content:
{content}

Generate 5-10 flashcards in JSON format:
{{
  "flashcards": [
    {{
      "card_type": "basic|cloze|multiple_choice|true_false",
      "front": "Question or prompt",
      "back": "Answer",
      "choices": ["*Correct answer", "Wrong 1", "Wrong 2", "Wrong 3"],  // only for multiple_choice
      "confidence": 0.0-1.0
    }}
  ]
}}

Focus on:
- Key facts and definitions
- Important relationships
- Clinical/practical applications (for medical content)
- Common misconceptions"""

    def __init__(self, db: Session):
        self.db = db

    # ============ Deck Management ============

    def create_deck(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        document_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_public: bool = False,
    ) -> StudyDeck:
        """Create a new study deck."""
        deck = StudyDeck(
            user_id=user_id,
            name=name,
            description=description,
            document_id=document_id,
            tags=tags,
            is_public=is_public,
        )
        self.db.add(deck)
        self.db.commit()
        self.db.refresh(deck)

        logger.info("deck_created", deck_id=str(deck.id), user_id=user_id, name=name)
        return deck

    def get_user_decks(
        self,
        user_id: str,
        include_public: bool = False,
    ) -> List[StudyDeck]:
        """Get all decks for a user."""
        query = self.db.query(StudyDeck)

        if include_public:
            query = query.filter(
                or_(StudyDeck.user_id == user_id, StudyDeck.is_public == True)  # noqa: E712
            )
        else:
            query = query.filter(StudyDeck.user_id == user_id)

        return query.order_by(StudyDeck.updated_at.desc()).all()

    def get_deck(self, deck_id: str, user_id: Optional[str] = None) -> Optional[StudyDeck]:
        """Get a specific deck."""
        query = self.db.query(StudyDeck).filter(StudyDeck.id == deck_id)

        if user_id:
            query = query.filter(
                or_(StudyDeck.user_id == user_id, StudyDeck.is_public == True)  # noqa: E712
            )

        return query.first()

    def update_deck(
        self,
        deck_id: str,
        user_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_public: Optional[bool] = None,
        new_cards_per_day: Optional[int] = None,
        review_cards_per_day: Optional[int] = None,
    ) -> Optional[StudyDeck]:
        """Update a deck."""
        deck = self.db.query(StudyDeck).filter(
            StudyDeck.id == deck_id,
            StudyDeck.user_id == user_id,
        ).first()

        if not deck:
            return None

        if name is not None:
            deck.name = name
        if description is not None:
            deck.description = description
        if tags is not None:
            deck.tags = tags
        if is_public is not None:
            deck.is_public = is_public
        if new_cards_per_day is not None:
            deck.new_cards_per_day = new_cards_per_day
        if review_cards_per_day is not None:
            deck.review_cards_per_day = review_cards_per_day

        deck.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(deck)

        return deck

    def delete_deck(self, deck_id: str, user_id: str) -> bool:
        """Delete a deck."""
        deck = self.db.query(StudyDeck).filter(
            StudyDeck.id == deck_id,
            StudyDeck.user_id == user_id,
        ).first()

        if not deck:
            return False

        self.db.delete(deck)
        self.db.commit()

        logger.info("deck_deleted", deck_id=deck_id, user_id=user_id)
        return True

    # ============ Flashcard Management ============

    def create_flashcard(
        self,
        deck_id: str,
        card_type: str,
        front: str,
        back: str,
        extra_info: Optional[str] = None,
        choices: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        document_id: Optional[str] = None,
        page_number: Optional[int] = None,
        generation_method: str = "manual",
    ) -> Flashcard:
        """Create a new flashcard."""
        if card_type not in Flashcard.VALID_CARD_TYPES:
            raise ValueError(f"Invalid card type. Valid types: {Flashcard.VALID_CARD_TYPES}")

        card = Flashcard(
            deck_id=deck_id,
            card_type=card_type,
            front=front,
            back=back,
            extra_info=extra_info,
            choices=choices,
            tags=tags,
            document_id=document_id,
            page_number=page_number,
            generation_method=generation_method,
            status=Flashcard.STATUS_NEW,
        )
        self.db.add(card)

        # Update deck card count
        deck = self.db.query(StudyDeck).filter(StudyDeck.id == deck_id).first()
        if deck:
            deck.cards_count = (deck.cards_count or 0) + 1
            deck.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(card)

        return card

    def get_flashcard(self, card_id: str) -> Optional[Flashcard]:
        """Get a specific flashcard."""
        return self.db.query(Flashcard).filter(Flashcard.id == card_id).first()

    def get_deck_cards(
        self,
        deck_id: str,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """Get flashcards in a deck."""
        query = self.db.query(Flashcard).filter(Flashcard.deck_id == deck_id)

        if status:
            query = query.filter(Flashcard.status == status)

        total = query.count()
        offset = (page - 1) * page_size
        cards = query.order_by(Flashcard.created_at.desc()).offset(offset).limit(page_size).all()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "cards": [c.to_dict() for c in cards],
        }

    def update_flashcard(
        self,
        card_id: str,
        front: Optional[str] = None,
        back: Optional[str] = None,
        extra_info: Optional[str] = None,
        choices: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[Flashcard]:
        """Update a flashcard."""
        card = self.db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            return None

        if front is not None:
            card.front = front
        if back is not None:
            card.back = back
        if extra_info is not None:
            card.extra_info = extra_info
        if choices is not None:
            card.choices = choices
        if tags is not None:
            card.tags = tags

        card.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(card)

        return card

    def delete_flashcard(self, card_id: str) -> bool:
        """Delete a flashcard."""
        card = self.db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            return False

        deck_id = card.deck_id
        self.db.delete(card)

        # Update deck card count
        deck = self.db.query(StudyDeck).filter(StudyDeck.id == deck_id).first()
        if deck:
            deck.cards_count = max(0, (deck.cards_count or 0) - 1)
            deck.updated_at = datetime.utcnow()

        self.db.commit()
        return True

    def suspend_flashcard(self, card_id: str) -> Optional[Flashcard]:
        """Suspend a flashcard from review."""
        card = self.db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            return None

        card.status = Flashcard.STATUS_SUSPENDED
        card.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(card)

        return card

    def unsuspend_flashcard(self, card_id: str) -> Optional[Flashcard]:
        """Unsuspend a flashcard."""
        card = self.db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            return None

        card.status = Flashcard.STATUS_REVIEW if card.repetitions > 0 else Flashcard.STATUS_NEW
        card.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(card)

        return card

    # ============ Study Session ============

    def get_due_cards(
        self,
        user_id: str,
        deck_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Flashcard]:
        """Get cards due for review."""
        query = self.db.query(Flashcard).join(StudyDeck)

        if deck_id:
            query = query.filter(Flashcard.deck_id == deck_id)
        else:
            query = query.filter(StudyDeck.user_id == user_id)

        # Exclude suspended cards
        query = query.filter(Flashcard.status != Flashcard.STATUS_SUSPENDED)

        # Get new cards and due cards
        now = datetime.utcnow()
        query = query.filter(
            or_(
                Flashcard.status == Flashcard.STATUS_NEW,
                and_(
                    Flashcard.due_date.isnot(None),
                    Flashcard.due_date <= now,
                ),
            )
        )

        # Order: new cards first, then by due date
        return query.order_by(
            Flashcard.status.desc(),  # 'new' comes after 'learning'/'review'
            Flashcard.due_date.asc().nullsfirst(),
        ).limit(limit).all()

    def get_study_queue(
        self,
        user_id: str,
        deck_id: str,
    ) -> Dict[str, Any]:
        """Get study queue with card counts."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            raise ValueError("Deck not found")

        now = datetime.utcnow()

        # Count new cards
        new_count = self.db.query(func.count(Flashcard.id)).filter(
            Flashcard.deck_id == deck_id,
            Flashcard.status == Flashcard.STATUS_NEW,
        ).scalar() or 0

        # Count due cards
        due_count = self.db.query(func.count(Flashcard.id)).filter(
            Flashcard.deck_id == deck_id,
            Flashcard.status != Flashcard.STATUS_SUSPENDED,
            Flashcard.status != Flashcard.STATUS_NEW,
            Flashcard.due_date <= now,
        ).scalar() or 0

        # Count learning cards
        learning_count = self.db.query(func.count(Flashcard.id)).filter(
            Flashcard.deck_id == deck_id,
            Flashcard.status.in_([Flashcard.STATUS_LEARNING, Flashcard.STATUS_RELEARNING]),
        ).scalar() or 0

        return {
            "deck_id": deck_id,
            "deck_name": deck.name,
            "new_count": min(new_count, deck.new_cards_per_day),
            "due_count": min(due_count, deck.review_cards_per_day),
            "learning_count": learning_count,
            "total_available": new_count + due_count,
        }

    def start_study_session(
        self,
        user_id: str,
        deck_id: Optional[str] = None,
    ) -> StudySession:
        """Start a new study session."""
        session = StudySession(
            user_id=user_id,
            deck_id=deck_id,
            started_at=datetime.utcnow(),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

        return session

    def submit_review(
        self,
        card_id: str,
        user_id: str,
        rating: int,
        response_time_ms: Optional[int] = None,
        session_id: Optional[str] = None,
        study_mode: str = "review",
    ) -> Dict[str, Any]:
        """Submit a card review."""
        if rating < 1 or rating > 4:
            raise ValueError("Rating must be between 1 and 4")

        card = self.db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        # Record state before
        ease_before = card.ease_factor
        interval_before = card.interval_days

        # Apply SM-2 algorithm
        card.apply_sm2(rating)

        # Create review record
        review = FlashcardReview(
            flashcard_id=card_id,
            user_id=user_id,
            rating=rating,
            response_time_ms=response_time_ms,
            was_correct=rating >= 3,
            ease_before=ease_before,
            ease_after=card.ease_factor,
            interval_before=interval_before,
            interval_after=card.interval_days,
            study_mode=study_mode,
            session_id=session_id,
        )
        self.db.add(review)

        # Update deck stats
        deck = self.db.query(StudyDeck).filter(StudyDeck.id == card.deck_id).first()
        if deck:
            deck.total_reviews = (deck.total_reviews or 0) + 1
            deck.last_studied_at = datetime.utcnow()

            # Check if card is now mastered (interval > 21 days)
            if card.interval_days >= 21 and interval_before < 21:
                deck.cards_mastered = (deck.cards_mastered or 0) + 1

        # Update user stats
        self._update_user_stats(user_id, rating >= 3, response_time_ms or 0)

        # Update session if provided
        if session_id:
            session = self.db.query(StudySession).filter(StudySession.id == session_id).first()
            if session:
                session.cards_studied = (session.cards_studied or 0) + 1
                if rating >= 3:
                    session.cards_correct = (session.cards_correct or 0) + 1
                if card.status == Flashcard.STATUS_NEW:
                    session.new_cards = (session.new_cards or 0) + 1
                else:
                    session.review_cards = (session.review_cards or 0) + 1

        self.db.commit()

        return {
            "card_id": str(card.id),
            "rating": rating,
            "new_interval_days": card.interval_days,
            "new_ease_factor": card.ease_factor,
            "next_due": card.due_date.isoformat() if card.due_date else None,
            "status": card.status,
        }

    def end_study_session(self, session_id: str) -> Optional[StudySession]:
        """End a study session."""
        session = self.db.query(StudySession).filter(StudySession.id == session_id).first()
        if not session:
            return None

        session.end_session()
        self.db.commit()
        self.db.refresh(session)

        return session

    def _update_user_stats(
        self,
        user_id: str,
        was_correct: bool,
        response_time_ms: int,
    ) -> None:
        """Update user learning statistics."""
        stats = self.db.query(UserLearningStats).filter(
            UserLearningStats.user_id == user_id
        ).first()

        if not stats:
            stats = UserLearningStats(user_id=user_id)
            self.db.add(stats)

        stats.total_reviews = (stats.total_reviews or 0) + 1
        stats.total_cards_studied = (stats.total_cards_studied or 0) + 1
        stats.total_study_time_seconds = (stats.total_study_time_seconds or 0) + (response_time_ms // 1000)
        stats.update_streak()

        # Update daily stats
        today = date.today().isoformat()
        if stats.daily_stats is None:
            stats.daily_stats = {}

        if today not in stats.daily_stats:
            stats.daily_stats[today] = {"cards": 0, "correct": 0, "time_ms": 0}

        stats.daily_stats[today]["cards"] += 1
        if was_correct:
            stats.daily_stats[today]["correct"] += 1
        stats.daily_stats[today]["time_ms"] += response_time_ms

        # Keep only last 30 days
        cutoff = (date.today() - timedelta(days=30)).isoformat()
        stats.daily_stats = {k: v for k, v in stats.daily_stats.items() if k >= cutoff}

    # ============ AI Flashcard Generation ============

    async def generate_flashcards_from_document(
        self,
        document_id: str,
        user_id: str,
        page_numbers: Optional[List[int]] = None,
        max_cards: int = 20,
    ) -> List[FlashcardSuggestion]:
        """Generate flashcard suggestions from a document using AI."""
        from app.services.openai_service import openai_service

        # Get document
        document = self.db.query(Document).filter(Document.document_id == document_id).first()
        if not document:
            raise ValueError(f"Document not found: {document_id}")

        # Get document content (from chunks if available)
        content = await self._get_document_content(document, page_numbers)
        if not content:
            raise ValueError("Could not extract content from document")

        # Generate flashcards using LLM
        prompt = self.FLASHCARD_GENERATION_PROMPT.format(content=content[:8000])

        try:
            response = await openai_service.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="gpt-4o-mini",
                temperature=0.7,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)
            flashcards_data = result.get("flashcards", [])

        except Exception as e:
            logger.error("flashcard_generation_failed", document_id=document_id, error=str(e))
            raise

        # Create suggestions
        suggestions = []
        for card_data in flashcards_data[:max_cards]:
            card_type = card_data.get("card_type", "basic")
            if card_type not in Flashcard.VALID_CARD_TYPES:
                card_type = "basic"

            suggestion = FlashcardSuggestion(
                user_id=user_id,
                document_id=document_id,
                card_type=card_type,
                front=card_data.get("front", ""),
                back=card_data.get("back", ""),
                choices=card_data.get("choices"),
                confidence=card_data.get("confidence"),
                status=FlashcardSuggestion.STATUS_PENDING,
            )
            self.db.add(suggestion)
            suggestions.append(suggestion)

        self.db.commit()

        logger.info(
            "flashcards_generated",
            document_id=document_id,
            user_id=user_id,
            count=len(suggestions),
        )

        return suggestions

    async def _get_document_content(
        self,
        document: Document,
        page_numbers: Optional[List[int]] = None,
    ) -> str:
        """
        Get document content for flashcard generation.

        Prefer enhanced_structure or structure when available so that we reuse
        the same high-quality extraction used for RAG and voice narration.
        """
        pages_source = None
        if isinstance(document.enhanced_structure, dict):
            pages_source = document.enhanced_structure.get("pages") or []
        elif isinstance(document.structure, dict):
            pages_source = document.structure.get("pages") or []

        text_parts: List[str] = []

        if pages_source:
            pages = pages_source
            if page_numbers:
                pages = [p for p in pages if p.get("page_number") in page_numbers]

            for page in pages:
                # Prefer voice narration if present
                voice = page.get("voice_narration")
                if voice:
                    text_parts.append(str(voice))

                # Structured content blocks
                for block in page.get("content_blocks", []) or []:
                    b_type = block.get("type")
                    if b_type in ("text", "heading"):
                        content = block.get("content") or ""
                        if content:
                            text_parts.append(str(content))
                    elif b_type == "table":
                        headers = block.get("headers") or []
                        rows = block.get("rows") or []
                        table_lines: List[str] = []
                        if headers:
                            table_lines.append(" | ".join(str(h) for h in headers))
                        for row in rows:
                            table_lines.append(" | ".join(str(cell) for cell in row))
                        if table_lines:
                            text_parts.append("\n".join(table_lines))
                    elif b_type == "figure":
                        desc = block.get("description") or block.get("caption") or ""
                        if desc:
                            text_parts.append(str(desc))

                # Fallback to raw text if present
                raw_text = page.get("raw_text") or page.get("text")
                if raw_text:
                    text_parts.append(str(raw_text))

        # Fallback to any direct content field on the document
        if not text_parts and getattr(document, "content", None):
            text_parts.append(str(document.content))

        return "\n\n".join(text_parts)

    def accept_suggestion(
        self,
        suggestion_id: str,
        user_id: str,
        deck_id: str,
        modifications: Optional[Dict[str, Any]] = None,
    ) -> Flashcard:
        """Accept a flashcard suggestion and create the flashcard."""
        suggestion = self.db.query(FlashcardSuggestion).filter(
            FlashcardSuggestion.id == suggestion_id,
            FlashcardSuggestion.user_id == user_id,
        ).first()

        if not suggestion:
            raise ValueError("Suggestion not found")

        if suggestion.status != FlashcardSuggestion.STATUS_PENDING:
            raise ValueError("Suggestion already processed")

        # Apply modifications if provided
        front = modifications.get("front", suggestion.front) if modifications else suggestion.front
        back = modifications.get("back", suggestion.back) if modifications else suggestion.back
        choices = modifications.get("choices", suggestion.choices) if modifications else suggestion.choices

        # Create flashcard
        card = self.create_flashcard(
            deck_id=deck_id,
            card_type=suggestion.card_type,
            front=front,
            back=back,
            choices=choices,
            document_id=str(suggestion.document_id),
            page_number=suggestion.page_number,
            generation_method="ai_generated",
        )

        # Update suggestion status
        suggestion.status = FlashcardSuggestion.STATUS_MODIFIED if modifications else FlashcardSuggestion.STATUS_ACCEPTED
        suggestion.deck_id = deck_id
        self.db.commit()

        return card

    def reject_suggestion(self, suggestion_id: str, user_id: str) -> bool:
        """Reject a flashcard suggestion."""
        suggestion = self.db.query(FlashcardSuggestion).filter(
            FlashcardSuggestion.id == suggestion_id,
            FlashcardSuggestion.user_id == user_id,
        ).first()

        if not suggestion:
            return False

        suggestion.status = FlashcardSuggestion.STATUS_REJECTED
        self.db.commit()

        return True

    def get_pending_suggestions(
        self,
        user_id: str,
        document_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """Get pending flashcard suggestions for a user."""
        query = self.db.query(FlashcardSuggestion).filter(
            FlashcardSuggestion.user_id == user_id,
            FlashcardSuggestion.status == FlashcardSuggestion.STATUS_PENDING,
        )

        if document_id:
            query = query.filter(FlashcardSuggestion.document_id == document_id)

        total = query.count()
        offset = (page - 1) * page_size
        suggestions = query.order_by(
            FlashcardSuggestion.created_at.desc()
        ).offset(offset).limit(page_size).all()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "suggestions": [s.to_dict() for s in suggestions],
        }

    # ============ Analytics ============

    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get comprehensive learning statistics for a user."""
        stats = self.db.query(UserLearningStats).filter(
            UserLearningStats.user_id == user_id
        ).first()

        if not stats:
            return {
                "total_cards_studied": 0,
                "total_reviews": 0,
                "total_study_time_hours": 0,
                "current_streak_days": 0,
                "longest_streak_days": 0,
                "daily_stats": {},
            }

        # Get deck stats
        decks = self.db.query(StudyDeck).filter(StudyDeck.user_id == user_id).all()
        total_cards = sum(d.cards_count for d in decks)
        mastered_cards = sum(d.cards_mastered for d in decks)

        return {
            **stats.to_dict(),
            "total_decks": len(decks),
            "total_cards": total_cards,
            "mastered_cards": mastered_cards,
            "mastery_percentage": (mastered_cards / total_cards * 100) if total_cards > 0 else 0,
        }

    def get_deck_stats(self, deck_id: str) -> Dict[str, Any]:
        """Get detailed statistics for a deck."""
        deck = self.db.query(StudyDeck).filter(StudyDeck.id == deck_id).first()
        if not deck:
            raise ValueError("Deck not found")

        # Card status distribution
        status_counts = (
            self.db.query(Flashcard.status, func.count(Flashcard.id))
            .filter(Flashcard.deck_id == deck_id)
            .group_by(Flashcard.status)
            .all()
        )

        # Average ease factor
        avg_ease = self.db.query(func.avg(Flashcard.ease_factor)).filter(
            Flashcard.deck_id == deck_id
        ).scalar() or 2.5

        # Review history (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        reviews = (
            self.db.query(
                func.date(FlashcardReview.created_at),
                func.count(FlashcardReview.id),
                func.avg(func.cast(FlashcardReview.was_correct, Integer)),
            )
            .join(Flashcard)
            .filter(
                Flashcard.deck_id == deck_id,
                FlashcardReview.created_at >= week_ago,
            )
            .group_by(func.date(FlashcardReview.created_at))
            .all()
        )

        return {
            "deck_id": str(deck.id),
            "name": deck.name,
            "cards_count": deck.cards_count,
            "cards_mastered": deck.cards_mastered,
            "mastery_percentage": deck.mastery_percentage,
            "total_reviews": deck.total_reviews,
            "status_distribution": {row[0]: row[1] for row in status_counts},
            "average_ease_factor": round(avg_ease, 2),
            "recent_reviews": [
                {
                    "date": row[0].isoformat(),
                    "count": row[1],
                    "accuracy": round(row[2] * 100, 1) if row[2] else 0,
                }
                for row in reviews
            ],
        }

    def get_study_history(
        self,
        user_id: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get study session history."""
        cutoff = datetime.utcnow() - timedelta(days=days)

        sessions = (
            self.db.query(StudySession)
            .filter(
                StudySession.user_id == user_id,
                StudySession.started_at >= cutoff,
            )
            .order_by(StudySession.started_at.desc())
            .all()
        )

        return [s.to_dict() for s in sessions]
