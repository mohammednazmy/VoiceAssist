"""
Graceful Truncation Service

Handles intelligent truncation of AI responses during barge-in events.
Instead of cutting audio mid-word, finds the best truncation point
and generates context for coherent continuation.

Phase 5: Turn Overlap Handling
Feature Flag: backend.voice_graceful_truncation
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Types
# ==============================================================================


class TruncationType(str, Enum):
    """Type of truncation applied."""

    NONE = "none"  # No truncation (completed naturally)
    SENTENCE_BOUNDARY = "sentence"  # Clean sentence break
    PHRASE_BOUNDARY = "phrase"  # Comma or clause break
    WORD_BOUNDARY = "word"  # Space between words
    MID_WORD = "mid_word"  # Had to cut mid-word
    IMMEDIATE = "immediate"  # Cut immediately (hard barge-in)


@dataclass
class TruncationResult:
    """Result of truncation analysis."""

    truncation_type: TruncationType
    spoken_text: str
    unspoken_text: str
    truncation_position: int
    was_graceful: bool
    context_for_next_response: str


@dataclass
class TruncationConfig:
    """Configuration for graceful truncation."""

    # Look back from truncation point to find clean break
    max_lookback_chars: int = 100

    # Prefer sentence boundary if within this many chars
    sentence_lookback_preference: int = 50

    # Minimum spoken text to preserve
    min_spoken_length: int = 10

    # Whether to generate context for next response
    generate_context: bool = True

    # Characters per second for speech rate estimation
    chars_per_second: float = 15.0


@dataclass
class TruncationMetrics:
    """Metrics for truncation performance."""

    total_truncations: int = 0
    sentence_truncations: int = 0
    phrase_truncations: int = 0
    word_truncations: int = 0
    mid_word_truncations: int = 0
    immediate_truncations: int = 0
    avg_lookback_chars: float = 0

    @property
    def graceful_rate(self) -> float:
        """Return the rate of graceful truncations."""
        if self.total_truncations == 0:
            return 0.0
        graceful = self.sentence_truncations + self.phrase_truncations
        return graceful / self.total_truncations


# ==============================================================================
# Graceful Truncation Service
# ==============================================================================


class GracefulTruncationService:
    """
    Handles graceful truncation of AI responses during barge-in.

    Instead of cutting audio mid-word, this service finds the best
    truncation point and generates context for the next response.

    Usage:
        from app.services.graceful_truncation_service import (
            graceful_truncation_service,
            TruncationConfig,
        )

        # When barge-in occurs
        result = graceful_truncation_service.find_truncation_point(
            full_response="I can help you with that. First, let me explain...",
            characters_spoken=45,
            audio_duration_ms=3000,
        )

        if result.was_graceful:
            print(f"Clean break at: '{result.spoken_text}'")
        else:
            print(f"Mid-word cut: '{result.spoken_text}'")

        # Generate acknowledgment for next response
        ack = graceful_truncation_service.generate_acknowledgment_prefix(
            result, user_utterance="actually, can you..."
        )
    """

    def __init__(self, config: Optional[TruncationConfig] = None):
        self.config = config or TruncationConfig()
        self._metrics = TruncationMetrics()
        self._lookback_totals: List[int] = []

    # ==========================================================================
    # Main API
    # ==========================================================================

    def find_truncation_point(
        self,
        full_response: str,
        characters_spoken: int,
        audio_duration_ms: int = 0,
    ) -> TruncationResult:
        """
        Find the best truncation point for a barge-in.

        Args:
            full_response: The complete AI response text
            characters_spoken: Approximate characters spoken before barge-in
            audio_duration_ms: Duration of audio played (used for estimation if chars unknown)

        Returns:
            TruncationResult with truncation details
        """
        # If characters_spoken is 0 but we have audio duration, estimate
        if characters_spoken <= 0 and audio_duration_ms > 0:
            characters_spoken = self.estimate_characters_spoken(audio_duration_ms)

        if characters_spoken <= 0:
            self._metrics.total_truncations += 1
            self._metrics.immediate_truncations += 1
            return TruncationResult(
                truncation_type=TruncationType.IMMEDIATE,
                spoken_text="",
                unspoken_text=full_response,
                truncation_position=0,
                was_graceful=False,
                context_for_next_response="",
            )

        # Clamp to actual text length
        characters_spoken = min(characters_spoken, len(full_response))

        # Look for sentence boundary
        sentence_point = self._find_sentence_boundary(
            full_response,
            characters_spoken,
            self.config.sentence_lookback_preference,
        )

        if sentence_point is not None:
            self._metrics.sentence_truncations += 1
            return self._create_result(
                full_response,
                sentence_point,
                TruncationType.SENTENCE_BOUNDARY,
            )

        # Look for phrase boundary (comma, semicolon)
        phrase_point = self._find_phrase_boundary(
            full_response,
            characters_spoken,
            self.config.max_lookback_chars,
        )

        if phrase_point is not None:
            self._metrics.phrase_truncations += 1
            return self._create_result(
                full_response,
                phrase_point,
                TruncationType.PHRASE_BOUNDARY,
            )

        # Look for word boundary
        word_point = self._find_word_boundary(
            full_response,
            characters_spoken,
            min(30, self.config.max_lookback_chars),
        )

        if word_point is not None:
            self._metrics.word_truncations += 1
            return self._create_result(
                full_response,
                word_point,
                TruncationType.WORD_BOUNDARY,
            )

        # Last resort: mid-word truncation
        self._metrics.mid_word_truncations += 1
        return self._create_result(
            full_response,
            characters_spoken,
            TruncationType.MID_WORD,
        )

    def estimate_characters_spoken(self, audio_duration_ms: int) -> int:
        """
        Estimate characters spoken based on audio duration.

        Args:
            audio_duration_ms: Duration of audio in milliseconds

        Returns:
            Estimated number of characters spoken
        """
        return int((audio_duration_ms / 1000) * self.config.chars_per_second)

    def generate_acknowledgment_prefix(
        self,
        truncation_result: TruncationResult,
        user_utterance: str,
    ) -> str:
        """
        Generate a natural acknowledgment for the interruption.

        Returns a phrase like "Sure, " or "Of course - " that acknowledges
        the user interrupted and transitions naturally.

        Args:
            truncation_result: Result from find_truncation_point
            user_utterance: What the user said when interrupting

        Returns:
            Acknowledgment prefix string
        """
        user_lower = user_utterance.lower().strip()

        # User asked us to stop
        stop_words = ["stop", "wait", "hold on", "pause", "hang on", "one sec", "one moment"]
        if any(word in user_lower for word in stop_words):
            return "Okay, I'll stop. "

        # User asked a new question
        if "?" in user_utterance:
            return "Sure, "

        # User wants to add something
        if user_lower.startswith(("actually", "also", "and", "but", "however")):
            return "Right, "

        # User is correcting something
        if user_lower.startswith(("no", "not", "wrong", "incorrect")):
            return "I see, "

        # User wants to continue
        if any(word in user_lower for word in ["continue", "go on", "keep going", "finish"]):
            return "Of course, "

        # Generic acknowledgment based on truncation type
        if truncation_result.was_graceful:
            return ""  # Clean break, no acknowledgment needed
        else:
            return "Got it. "

    # ==========================================================================
    # Continuation Support
    # ==========================================================================

    def get_continuation_prompt(self, truncation_result: TruncationResult) -> str:
        """
        Generate a prompt for continuing from where we left off.

        Args:
            truncation_result: The truncation result from the interrupted response

        Returns:
            A prompt that can be used to continue the response
        """
        if not truncation_result.unspoken_text:
            return ""

        unspoken_preview = truncation_result.unspoken_text[:200]
        if len(truncation_result.unspoken_text) > 200:
            unspoken_preview += "..."

        return (
            f"Continue from where you were interrupted. "
            f"You had said: \"{truncation_result.spoken_text[-100:]}\" "
            f"and were about to say: \"{unspoken_preview}\""
        )

    def should_offer_continuation(self, truncation_result: TruncationResult) -> bool:
        """
        Determine if we should offer to continue the interrupted response.

        Args:
            truncation_result: The truncation result

        Returns:
            True if continuation should be offered
        """
        # Don't offer for very short unspoken portions
        if len(truncation_result.unspoken_text) < 20:
            return False

        # Don't offer if truncation was clean
        if truncation_result.truncation_type == TruncationType.SENTENCE_BOUNDARY:
            # Check if there's substantial content remaining
            return len(truncation_result.unspoken_text) > 100

        return True

    # ==========================================================================
    # Internal Methods
    # ==========================================================================

    def _find_sentence_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest sentence boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        # Look for sentence endings
        for i in range(len(search_text) - 1, -1, -1):
            char = search_text[i]
            if char in ".!?":
                # Make sure it's not an abbreviation (simple check)
                actual_pos = search_start + i + 1
                if actual_pos >= self.config.min_spoken_length:
                    # Check it's not followed by lowercase (abbreviation)
                    if actual_pos < len(text) and text[actual_pos:actual_pos + 1].islower():
                        continue
                    self._track_lookback(position - actual_pos)
                    return actual_pos

        return None

    def _find_phrase_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest phrase boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        for i in range(len(search_text) - 1, -1, -1):
            char = search_text[i]
            if char in ",;:":
                actual_pos = search_start + i + 1
                if actual_pos >= self.config.min_spoken_length:
                    self._track_lookback(position - actual_pos)
                    return actual_pos

        return None

    def _find_word_boundary(
        self,
        text: str,
        position: int,
        lookback: int,
    ) -> Optional[int]:
        """Find nearest word boundary before position."""
        search_start = max(0, position - lookback)
        search_text = text[search_start:position]

        for i in range(len(search_text) - 1, -1, -1):
            if search_text[i] == " ":
                actual_pos = search_start + i
                if actual_pos >= self.config.min_spoken_length:
                    self._track_lookback(position - actual_pos)
                    return actual_pos

        return None

    def _create_result(
        self,
        full_response: str,
        truncation_position: int,
        truncation_type: TruncationType,
    ) -> TruncationResult:
        """Create a TruncationResult from the truncation position."""
        self._metrics.total_truncations += 1

        spoken_text = full_response[:truncation_position].strip()
        unspoken_text = full_response[truncation_position:].strip()

        # Generate context for next response
        context = ""
        if self.config.generate_context and unspoken_text:
            context = self._generate_context(spoken_text, unspoken_text, truncation_type)

        was_graceful = truncation_type in [
            TruncationType.SENTENCE_BOUNDARY,
            TruncationType.PHRASE_BOUNDARY,
        ]

        logger.info(
            f"[Truncation] Type: {truncation_type.value}, "
            f"Graceful: {was_graceful}, "
            f"Spoken: {len(spoken_text)} chars, "
            f"Unspoken: {len(unspoken_text)} chars"
        )

        return TruncationResult(
            truncation_type=truncation_type,
            spoken_text=spoken_text,
            unspoken_text=unspoken_text,
            truncation_position=truncation_position,
            was_graceful=was_graceful,
            context_for_next_response=context,
        )

    def _generate_context(
        self,
        spoken: str,
        unspoken: str,
        truncation_type: TruncationType,
    ) -> str:
        """Generate context message for the next AI response."""
        if truncation_type == TruncationType.SENTENCE_BOUNDARY:
            spoken_suffix = spoken[-100:] if len(spoken) > 100 else spoken
            unspoken_prefix = unspoken[:100] if len(unspoken) > 100 else unspoken
            ellipsis = "..." if len(unspoken) > 100 else ""
            return (
                f'[Previous response was interrupted after: "{spoken_suffix}" - '
                f'The unspoken portion was: "{unspoken_prefix}{ellipsis}"]'
            )

        elif truncation_type == TruncationType.PHRASE_BOUNDARY:
            spoken_suffix = spoken[-50:] if len(spoken) > 50 else spoken
            unspoken_prefix = unspoken[:50] if len(unspoken) > 50 else unspoken
            ellipsis = "..." if len(unspoken) > 50 else ""
            return (
                f'[Interrupted mid-thought. Said: "{spoken_suffix}" - '
                f'Was going to say: "{unspoken_prefix}{ellipsis}"]'
            )

        else:
            spoken_suffix = spoken[-30:] if len(spoken) > 30 else spoken
            return f'[Interrupted. Partial: "{spoken_suffix}..."]'

    def _track_lookback(self, lookback_chars: int) -> None:
        """Track lookback distance for metrics."""
        self._lookback_totals.append(lookback_chars)
        if self._lookback_totals:
            self._metrics.avg_lookback_chars = sum(self._lookback_totals) / len(
                self._lookback_totals
            )

    # ==========================================================================
    # Metrics
    # ==========================================================================

    def get_metrics(self) -> TruncationMetrics:
        """Get truncation metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset metrics."""
        self._metrics = TruncationMetrics()
        self._lookback_totals = []


# ==============================================================================
# Factory and Singleton
# ==============================================================================


def create_graceful_truncation_service(
    config: Optional[TruncationConfig] = None,
) -> GracefulTruncationService:
    """Create a new graceful truncation service instance."""
    return GracefulTruncationService(config)


# Global singleton (created on first import)
graceful_truncation_service = GracefulTruncationService()


def get_graceful_truncation_service() -> GracefulTruncationService:
    """Get the global graceful truncation service instance."""
    return graceful_truncation_service
