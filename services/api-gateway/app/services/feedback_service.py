"""
Feedback Service - User Feedback Collection for Voice Sessions

Phase 10: Frontend Integration - Feedback collection and analysis.

Features:
- Collect user ratings for voice sessions
- Track specific feedback on naturalness, accuracy, latency
- Generate feedback summaries for improvement insights
- Support for in-session thumbs up/down feedback
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums and Types
# ==============================================================================


class FeedbackType(str, Enum):
    """Type of feedback."""

    SESSION_RATING = "session_rating"  # Overall session rating
    RESPONSE_RATING = "response_rating"  # Rating for specific response
    NATURALNESS = "naturalness"  # How natural the conversation felt
    ACCURACY = "accuracy"  # STT/response accuracy
    LATENCY = "latency"  # Perceived speed
    DICTATION_QUALITY = "dictation_quality"  # Dictation-specific
    BUG_REPORT = "bug_report"  # Problem report
    SUGGESTION = "suggestion"  # Feature suggestion


class FeedbackRating(str, Enum):
    """Rating values."""

    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"
    STAR_1 = "1"
    STAR_2 = "2"
    STAR_3 = "3"
    STAR_4 = "4"
    STAR_5 = "5"


class FeedbackCategory(str, Enum):
    """Feedback categories for analysis."""

    VOICE_QUALITY = "voice_quality"
    RESPONSE_QUALITY = "response_quality"
    SPEED = "speed"
    UNDERSTANDING = "understanding"
    MEDICAL_ACCURACY = "medical_accuracy"
    UI_UX = "ui_ux"
    OTHER = "other"


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class FeedbackItem:
    """A single feedback item."""

    id: str
    session_id: str
    user_id: Optional[str]
    feedback_type: FeedbackType
    rating: Optional[FeedbackRating]
    category: Optional[FeedbackCategory]
    comment: Optional[str]
    context: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "feedback_type": self.feedback_type.value,
            "rating": self.rating.value if self.rating else None,
            "category": self.category.value if self.category else None,
            "comment": self.comment,
            "context": self.context,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class SessionFeedbackSummary:
    """Summary of feedback for a session."""

    session_id: str
    overall_rating: Optional[float]  # Average star rating
    thumbs_up_count: int = 0
    thumbs_down_count: int = 0
    feedback_items: List[FeedbackItem] = field(default_factory=list)
    categories: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "overall_rating": self.overall_rating,
            "thumbs_up_count": self.thumbs_up_count,
            "thumbs_down_count": self.thumbs_down_count,
            "feedback_count": len(self.feedback_items),
            "categories": self.categories,
        }


@dataclass
class FeedbackPrompt:
    """A prompt to collect feedback from user."""

    prompt_type: str  # "rating", "thumbs", "comment"
    message: str
    options: Optional[List[str]] = None
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "prompt_type": self.prompt_type,
            "message": self.message,
            "options": self.options,
            "context": self.context,
        }


# ==============================================================================
# Feedback Service
# ==============================================================================


class FeedbackService:
    """
    Service for collecting and managing user feedback.

    Collects various types of feedback during and after voice sessions,
    aggregates feedback for analysis, and generates prompts for
    collecting feedback at appropriate moments.

    Usage:
        feedback_service = FeedbackService()

        # Record thumbs up/down during session
        feedback_service.record_quick_feedback(
            session_id="session_123",
            user_id="user_456",
            thumbs_up=True,
            message_id="msg_789"
        )

        # Record detailed session feedback
        feedback_service.record_session_rating(
            session_id="session_123",
            user_id="user_456",
            rating=4,
            categories={
                "naturalness": 5,
                "accuracy": 4,
                "speed": 3
            },
            comment="Great conversation, but slightly slow responses"
        )

        # Get feedback prompts
        prompts = feedback_service.get_feedback_prompts(session_id="session_123")
    """

    def __init__(self):
        self._feedback_items: Dict[str, List[FeedbackItem]] = {}
        self._session_summaries: Dict[str, SessionFeedbackSummary] = {}

    def record_quick_feedback(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        thumbs_up: bool = True,
        message_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> FeedbackItem:
        """
        Record quick thumbs up/down feedback.

        Args:
            session_id: Session identifier
            user_id: User ID
            thumbs_up: True for thumbs up, False for thumbs down
            message_id: Optional message ID this feedback relates to
            context: Additional context

        Returns:
            Created FeedbackItem
        """
        rating = FeedbackRating.THUMBS_UP if thumbs_up else FeedbackRating.THUMBS_DOWN
        feedback_type = FeedbackType.RESPONSE_RATING if message_id else FeedbackType.SESSION_RATING

        item = FeedbackItem(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=user_id,
            feedback_type=feedback_type,
            rating=rating,
            category=None,
            comment=None,
            context={
                **(context or {}),
                "message_id": message_id,
            },
        )

        self._store_feedback(item)

        # Update summary
        self._update_summary(session_id, item)

        logger.info(
            f"Quick feedback recorded: session={session_id}, " f"thumbs_up={thumbs_up}, message_id={message_id}"
        )

        return item

    def record_session_rating(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        rating: int = 5,
        categories: Optional[Dict[str, int]] = None,
        comment: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[FeedbackItem]:
        """
        Record detailed session rating.

        Args:
            session_id: Session identifier
            user_id: User ID
            rating: Overall rating (1-5)
            categories: Category-specific ratings
            comment: Optional text comment
            context: Additional context

        Returns:
            List of created FeedbackItems
        """
        items = []
        rating_enum = FeedbackRating(str(rating))

        # Overall rating
        overall_item = FeedbackItem(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=user_id,
            feedback_type=FeedbackType.SESSION_RATING,
            rating=rating_enum,
            category=None,
            comment=comment,
            context=context or {},
        )
        self._store_feedback(overall_item)
        self._update_summary(session_id, overall_item)
        items.append(overall_item)

        # Category ratings
        category_map = {
            "naturalness": (FeedbackType.NATURALNESS, FeedbackCategory.VOICE_QUALITY),
            "accuracy": (FeedbackType.ACCURACY, FeedbackCategory.UNDERSTANDING),
            "speed": (FeedbackType.LATENCY, FeedbackCategory.SPEED),
            "voice_quality": (FeedbackType.NATURALNESS, FeedbackCategory.VOICE_QUALITY),
            "response_quality": (FeedbackType.ACCURACY, FeedbackCategory.RESPONSE_QUALITY),
            "medical_accuracy": (FeedbackType.DICTATION_QUALITY, FeedbackCategory.MEDICAL_ACCURACY),
        }

        if categories:
            for cat_name, cat_rating in categories.items():
                if cat_name in category_map:
                    feedback_type, feedback_category = category_map[cat_name]
                    cat_item = FeedbackItem(
                        id=str(uuid.uuid4()),
                        session_id=session_id,
                        user_id=user_id,
                        feedback_type=feedback_type,
                        rating=FeedbackRating(str(cat_rating)),
                        category=feedback_category,
                        comment=None,
                        context={"category_name": cat_name},
                    )
                    self._store_feedback(cat_item)
                    self._update_summary(session_id, cat_item)
                    items.append(cat_item)

        logger.info(
            f"Session rating recorded: session={session_id}, " f"rating={rating}, categories={len(categories or {})}"
        )

        return items

    def record_bug_report(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        description: str = "",
        category: FeedbackCategory = FeedbackCategory.OTHER,
        context: Optional[Dict[str, Any]] = None,
    ) -> FeedbackItem:
        """
        Record a bug report.

        Args:
            session_id: Session identifier
            user_id: User ID
            description: Bug description
            category: Bug category
            context: Additional context (error details, etc.)

        Returns:
            Created FeedbackItem
        """
        item = FeedbackItem(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=user_id,
            feedback_type=FeedbackType.BUG_REPORT,
            rating=None,
            category=category,
            comment=description,
            context=context or {},
        )

        self._store_feedback(item)
        self._update_summary(session_id, item)

        logger.info(f"Bug report recorded: session={session_id}, category={category.value}")

        return item

    def record_suggestion(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        suggestion: str = "",
        category: FeedbackCategory = FeedbackCategory.OTHER,
        context: Optional[Dict[str, Any]] = None,
    ) -> FeedbackItem:
        """
        Record a feature suggestion.

        Args:
            session_id: Session identifier
            user_id: User ID
            suggestion: Suggestion text
            category: Suggestion category
            context: Additional context

        Returns:
            Created FeedbackItem
        """
        item = FeedbackItem(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=user_id,
            feedback_type=FeedbackType.SUGGESTION,
            rating=None,
            category=category,
            comment=suggestion,
            context=context or {},
        )

        self._store_feedback(item)
        self._update_summary(session_id, item)

        logger.info(f"Suggestion recorded: session={session_id}, category={category.value}")

        return item

    def _store_feedback(self, item: FeedbackItem) -> None:
        """Store feedback item."""
        if item.session_id not in self._feedback_items:
            self._feedback_items[item.session_id] = []
        self._feedback_items[item.session_id].append(item)

    def _update_summary(self, session_id: str, item: FeedbackItem) -> None:
        """Update session feedback summary."""
        if session_id not in self._session_summaries:
            self._session_summaries[session_id] = SessionFeedbackSummary(session_id=session_id)

        summary = self._session_summaries[session_id]
        summary.feedback_items.append(item)

        # Update thumbs count
        if item.rating == FeedbackRating.THUMBS_UP:
            summary.thumbs_up_count += 1
        elif item.rating == FeedbackRating.THUMBS_DOWN:
            summary.thumbs_down_count += 1

        # Update overall rating
        star_ratings = []
        for fb in summary.feedback_items:
            if fb.rating and fb.rating.value.isdigit():
                star_ratings.append(int(fb.rating.value))
        if star_ratings:
            summary.overall_rating = sum(star_ratings) / len(star_ratings)

        # Update category counts
        if item.category:
            cat = item.category.value
            if cat not in summary.categories:
                summary.categories[cat] = 0
            summary.categories[cat] += 1

    def get_session_feedback(
        self,
        session_id: str,
    ) -> List[FeedbackItem]:
        """Get all feedback for a session."""
        return self._feedback_items.get(session_id, [])

    def get_session_summary(
        self,
        session_id: str,
    ) -> Optional[SessionFeedbackSummary]:
        """Get feedback summary for a session."""
        return self._session_summaries.get(session_id)

    def get_feedback_prompts(
        self,
        session_id: str,
        session_duration_ms: float = 0,
        interaction_count: int = 0,
        has_errors: bool = False,
    ) -> List[FeedbackPrompt]:
        """
        Get appropriate feedback prompts for a session.

        Returns prompts based on session characteristics.

        Args:
            session_id: Session identifier
            session_duration_ms: Session duration in ms
            interaction_count: Number of interactions
            has_errors: Whether session had errors

        Returns:
            List of FeedbackPrompt objects
        """
        prompts = []

        # Short session - quick thumbs
        if session_duration_ms < 60000 or interaction_count < 3:
            prompts.append(
                FeedbackPrompt(
                    prompt_type="thumbs",
                    message="How was this conversation?",
                    options=["thumbs_up", "thumbs_down"],
                )
            )
            return prompts

        # Session with errors - bug report option
        if has_errors:
            prompts.append(
                FeedbackPrompt(
                    prompt_type="thumbs",
                    message="We noticed some issues. Was the conversation still helpful?",
                    options=["thumbs_up", "thumbs_down"],
                )
            )
            prompts.append(
                FeedbackPrompt(
                    prompt_type="comment",
                    message="Would you like to tell us what went wrong?",
                    context={"type": "bug_report"},
                )
            )
            return prompts

        # Normal session - full rating
        prompts.append(
            FeedbackPrompt(
                prompt_type="rating",
                message="How would you rate this conversation?",
                options=["1", "2", "3", "4", "5"],
            )
        )

        # Add category prompts for longer sessions
        if session_duration_ms > 120000 or interaction_count > 5:
            prompts.append(
                FeedbackPrompt(
                    prompt_type="categories",
                    message="Help us improve with specific feedback:",
                    options=["naturalness", "accuracy", "speed"],
                )
            )

        # Always offer comment option
        prompts.append(
            FeedbackPrompt(
                prompt_type="comment",
                message="Any other feedback? (optional)",
            )
        )

        return prompts

    def generate_analytics_report(
        self,
        session_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Generate an analytics report from feedback data.

        Args:
            session_ids: Optional list of session IDs to include

        Returns:
            Analytics report dictionary
        """
        if session_ids:
            summaries = [self._session_summaries[sid] for sid in session_ids if sid in self._session_summaries]
        else:
            summaries = list(self._session_summaries.values())

        if not summaries:
            return {
                "total_sessions": 0,
                "avg_rating": None,
                "satisfaction_rate": None,
            }

        # Calculate metrics
        total_sessions = len(summaries)
        ratings = [s.overall_rating for s in summaries if s.overall_rating]
        avg_rating = sum(ratings) / len(ratings) if ratings else None

        total_thumbs_up = sum(s.thumbs_up_count for s in summaries)
        total_thumbs_down = sum(s.thumbs_down_count for s in summaries)
        total_thumbs = total_thumbs_up + total_thumbs_down
        satisfaction_rate = total_thumbs_up / total_thumbs if total_thumbs > 0 else None

        # Aggregate categories
        all_categories: Dict[str, int] = {}
        for s in summaries:
            for cat, count in s.categories.items():
                if cat not in all_categories:
                    all_categories[cat] = 0
                all_categories[cat] += count

        return {
            "total_sessions": total_sessions,
            "avg_rating": round(avg_rating, 2) if avg_rating else None,
            "satisfaction_rate": round(satisfaction_rate, 3) if satisfaction_rate else None,
            "thumbs_up": total_thumbs_up,
            "thumbs_down": total_thumbs_down,
            "categories": all_categories,
        }

    def cleanup_session(self, session_id: str) -> None:
        """Remove feedback data for a session."""
        if session_id in self._feedback_items:
            del self._feedback_items[session_id]
        if session_id in self._session_summaries:
            del self._session_summaries[session_id]


# Global service instance
feedback_service = FeedbackService()
