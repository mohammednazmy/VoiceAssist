"""
Repair Strategy Service - Conversational Repair Handling

Phase 7: Graceful handling of misunderstandings in voice conversations.

This service manages conversational repair strategies when:
- AI is uncertain about user intent
- User corrects the AI
- Transcription quality is low
- User shows signs of frustration

Repair Strategies:
- ECHO_CHECK: "So you're asking about X?" - Confirms understanding
- CLARIFY_SPECIFIC: "Did you mean X or Y?" - Offers specific options
- REQUEST_REPHRASE: "Could you say that differently?" - Asks for rewording
- PARTIAL_ANSWER: "I'm not sure, but..." - Provides best-effort response
"""

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums and Data Classes
# ==============================================================================


class RepairStrategy(str, Enum):
    """Types of conversational repair strategies."""

    ECHO_CHECK = "echo_check"  # "So you're asking about X?"
    CLARIFY_SPECIFIC = "clarify_specific"  # "Did you mean X or Y?"
    REQUEST_REPHRASE = "request_rephrase"  # "Could you say that differently?"
    PARTIAL_ANSWER = "partial_answer"  # "I'm not sure, but..."
    NO_REPAIR = "no_repair"  # No repair needed, proceed normally


class CorrectionType(str, Enum):
    """Types of user corrections detected."""

    EXPLICIT = "explicit"  # "No, I said..." or "I meant..."
    IMPLICIT = "implicit"  # Rephrasing without explicit correction marker
    FRUSTRATION = "frustration"  # Repeated corrections with frustration signals
    NONE = "none"


@dataclass
class RepairContext:
    """Context for determining appropriate repair strategy."""

    # Transcript information
    transcript: str
    transcript_confidence: float  # 0-1, from STT

    # Response confidence
    response_confidence: float  # 0-1, how confident AI is in understanding

    # Correction history
    correction_count: int = 0
    last_correction_time: Optional[float] = None
    correction_types: List[CorrectionType] = field(default_factory=list)

    # User state
    frustration_score: float = 0.0  # 0-1
    repeat_count: int = 0  # How many times user repeated similar content

    # Ambiguity
    ambiguous_terms: List[str] = field(default_factory=list)
    possible_interpretations: List[str] = field(default_factory=list)


@dataclass
class RepairRecommendation:
    """Recommendation from repair strategy analysis."""

    strategy: RepairStrategy
    confidence: float  # 0-1
    suggested_prefix: Optional[str] = None  # Prefix to add to response
    suggested_suffix: Optional[str] = None  # Suffix to add to response
    clarification_options: List[str] = field(default_factory=list)
    escalate_to_human: bool = False  # If true, offer to connect to human support


# ==============================================================================
# Correction Detection
# ==============================================================================


class CorrectionDetector:
    """Detects user corrections and frustration patterns."""

    # Explicit correction markers
    EXPLICIT_CORRECTION_PATTERNS = [
        r"\bno\s*,?\s*i\s+(said|meant|was\s+asking|asked)\b",
        r"\bthat'?s?\s+not\s+what\s+i\b",
        r"\bi\s+didn'?t\s+(say|mean|ask)\b",
        r"\bactually\s*,?\s*i\b",
        r"\blet\s+me\s+clarify\b",
        r"\bto\s+clarify\b",
        r"\bwhat\s+i\s+meant\s+(was|is)\b",
        r"\bsorry\s*,?\s*i\s+meant\b",
        r"\bnot\s+that\s*,?\s*i\b",
    ]

    # Frustration indicators
    FRUSTRATION_PATTERNS = [
        r"\bi\s+already\s+(said|told|asked)\b",
        r"\bfor\s+the\s+(second|third|fourth|fifth)\s+time\b",
        r"\bagain\s*,?\s*i\b",
        r"\bhow\s+many\s+times\b",
        r"\bare\s+you\s+(listening|hearing)\b",
        r"\bcome\s+on\b",
        r"\bugh\b",
        r"\bseriously\b",
        r"\bwhy\s+(can'?t|don'?t|won'?t)\s+you\b",
    ]

    # Rephrase indicators (user trying different words)
    REPHRASE_INDICATORS = [
        r"\bin\s+other\s+words\b",
        r"\bbasically\b",
        r"\bwhat\s+i'?m\s+(trying\s+to\s+)?(say|ask)\b",
        r"\bput\s+(it\s+)?differently\b",
        r"\blet\s+me\s+(re)?phrase\b",
    ]

    def __init__(self):
        self._explicit_patterns = [re.compile(p, re.IGNORECASE) for p in self.EXPLICIT_CORRECTION_PATTERNS]
        self._frustration_patterns = [re.compile(p, re.IGNORECASE) for p in self.FRUSTRATION_PATTERNS]
        self._rephrase_patterns = [re.compile(p, re.IGNORECASE) for p in self.REPHRASE_INDICATORS]

    def detect_correction(self, transcript: str) -> Tuple[CorrectionType, float]:
        """
        Detect if user is making a correction.

        Returns:
            Tuple of (CorrectionType, confidence)
        """
        text = transcript.lower().strip()

        # Check for frustration (highest priority)
        frustration_matches = sum(1 for p in self._frustration_patterns if p.search(text))
        if frustration_matches > 0:
            confidence = min(1.0, 0.5 + frustration_matches * 0.2)
            return CorrectionType.FRUSTRATION, confidence

        # Check for explicit correction
        explicit_matches = sum(1 for p in self._explicit_patterns if p.search(text))
        if explicit_matches > 0:
            confidence = min(1.0, 0.6 + explicit_matches * 0.15)
            return CorrectionType.EXPLICIT, confidence

        # Check for implicit rephrase
        rephrase_matches = sum(1 for p in self._rephrase_patterns if p.search(text))
        if rephrase_matches > 0:
            confidence = min(1.0, 0.4 + rephrase_matches * 0.2)
            return CorrectionType.IMPLICIT, confidence

        return CorrectionType.NONE, 0.0

    def calculate_frustration_score(
        self,
        transcript: str,
        correction_count: int,
        time_since_last_correction: Optional[float],
    ) -> float:
        """
        Calculate overall frustration score.

        Args:
            transcript: Current user transcript
            correction_count: Number of corrections in session
            time_since_last_correction: Seconds since last correction

        Returns:
            Frustration score 0-1
        """
        score = 0.0

        # Base score from correction count
        if correction_count >= 3:
            score += 0.4
        elif correction_count >= 2:
            score += 0.2
        elif correction_count >= 1:
            score += 0.1

        # Bonus for rapid corrections (within 30 seconds)
        if time_since_last_correction is not None and time_since_last_correction < 30:
            score += 0.2

        # Bonus for frustration patterns in transcript
        text = transcript.lower()
        frustration_matches = sum(1 for p in self._frustration_patterns if p.search(text))
        score += frustration_matches * 0.15

        # Cap at 1.0
        return min(1.0, score)


# ==============================================================================
# Repair Strategy Selection
# ==============================================================================


class RepairStrategySelector:
    """Selects appropriate repair strategy based on context."""

    # Thresholds
    LOW_CONFIDENCE_THRESHOLD = 0.7
    VERY_LOW_CONFIDENCE_THRESHOLD = 0.5
    HIGH_FRUSTRATION_THRESHOLD = 0.6
    ESCALATION_THRESHOLD = 0.8

    def __init__(self):
        self._correction_detector = CorrectionDetector()

    def select_strategy(self, context: RepairContext) -> RepairRecommendation:
        """
        Select the best repair strategy based on context.

        Args:
            context: RepairContext with all relevant information

        Returns:
            RepairRecommendation with strategy and suggested responses
        """
        # Detect if this is a correction
        correction_type, correction_confidence = self._correction_detector.detect_correction(context.transcript)

        # Calculate frustration
        time_since_correction = None
        if context.last_correction_time:
            time_since_correction = time.time() - context.last_correction_time

        frustration = self._correction_detector.calculate_frustration_score(
            context.transcript,
            context.correction_count,
            time_since_correction,
        )

        # High frustration: consider escalation
        if frustration > self.ESCALATION_THRESHOLD:
            return RepairRecommendation(
                strategy=RepairStrategy.REQUEST_REPHRASE,
                confidence=0.9,
                suggested_prefix="I apologize for the confusion. ",
                suggested_suffix=" Would you like me to connect you with someone who can help?",
                escalate_to_human=True,
            )

        # Frustration correction: apologize and ask for rephrase
        if correction_type == CorrectionType.FRUSTRATION:
            return RepairRecommendation(
                strategy=RepairStrategy.REQUEST_REPHRASE,
                confidence=0.85,
                suggested_prefix="I'm sorry for the misunderstanding. ",
                suggested_suffix=" Could you tell me again what you need?",
            )

        # Explicit correction: echo check to confirm understanding
        if correction_type == CorrectionType.EXPLICIT:
            return RepairRecommendation(
                strategy=RepairStrategy.ECHO_CHECK,
                confidence=0.8,
                suggested_prefix="I understand. So you're asking about ",
                suggested_suffix="?",
            )

        # Very low confidence: request rephrase
        if context.response_confidence < self.VERY_LOW_CONFIDENCE_THRESHOLD:
            return RepairRecommendation(
                strategy=RepairStrategy.REQUEST_REPHRASE,
                confidence=0.75,
                suggested_prefix="I want to make sure I understand correctly. ",
                suggested_suffix=" Could you rephrase that for me?",
            )

        # Low confidence with ambiguous terms: offer specific options
        if context.response_confidence < self.LOW_CONFIDENCE_THRESHOLD and len(context.possible_interpretations) >= 2:
            return RepairRecommendation(
                strategy=RepairStrategy.CLARIFY_SPECIFIC,
                confidence=0.7,
                suggested_prefix="Just to clarify, ",
                clarification_options=context.possible_interpretations[:3],
            )

        # Low confidence: partial answer with hedging
        if context.response_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            return RepairRecommendation(
                strategy=RepairStrategy.PARTIAL_ANSWER,
                confidence=0.65,
                suggested_prefix="I'm not entirely certain, but ",
                suggested_suffix=" Does that help, or would you like me to clarify?",
            )

        # Low transcript confidence: echo check
        if context.transcript_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            return RepairRecommendation(
                strategy=RepairStrategy.ECHO_CHECK,
                confidence=0.6,
                suggested_prefix="I heard you say ",
                suggested_suffix=". Is that correct?",
            )

        # No repair needed
        return RepairRecommendation(
            strategy=RepairStrategy.NO_REPAIR,
            confidence=1.0,
        )


# ==============================================================================
# Repair Service
# ==============================================================================


class RepairStrategyService:
    """
    Main service for conversational repair management.

    Usage:
        service = RepairStrategyService()

        # Analyze context and get repair recommendation
        recommendation = service.get_repair_recommendation(
            transcript="No, I said I need help with billing",
            transcript_confidence=0.85,
            response_confidence=0.6,
            correction_count=1,
        )

        if recommendation.strategy != RepairStrategy.NO_REPAIR:
            # Apply repair strategy to response
            response = service.apply_repair(recommendation, original_response)
    """

    def __init__(self):
        self._selector = RepairStrategySelector()
        self._session_contexts: Dict[str, RepairContext] = {}

    def get_repair_recommendation(
        self,
        transcript: str,
        transcript_confidence: float,
        response_confidence: float,
        session_id: Optional[str] = None,
        possible_interpretations: Optional[List[str]] = None,
    ) -> RepairRecommendation:
        """
        Get repair recommendation for the current interaction.

        Args:
            transcript: User's spoken text
            transcript_confidence: STT confidence (0-1)
            response_confidence: AI's confidence in understanding (0-1)
            session_id: Optional session ID for tracking history
            possible_interpretations: List of possible meanings if ambiguous

        Returns:
            RepairRecommendation with strategy and suggestions
        """
        # Get or create session context
        if session_id and session_id in self._session_contexts:
            context = self._session_contexts[session_id]
            # Update with new information
            context.transcript = transcript
            context.transcript_confidence = transcript_confidence
            context.response_confidence = response_confidence
            if possible_interpretations:
                context.possible_interpretations = possible_interpretations
        else:
            context = RepairContext(
                transcript=transcript,
                transcript_confidence=transcript_confidence,
                response_confidence=response_confidence,
                possible_interpretations=possible_interpretations or [],
            )

        # Detect corrections and update context
        correction_type, _ = self._selector._correction_detector.detect_correction(transcript)
        if correction_type != CorrectionType.NONE:
            context.correction_count += 1
            context.correction_types.append(correction_type)
            context.last_correction_time = time.time()

        # Get recommendation
        recommendation = self._selector.select_strategy(context)

        # Store updated context
        if session_id:
            self._session_contexts[session_id] = context

        logger.debug(
            f"Repair recommendation: strategy={recommendation.strategy.value}, "
            f"confidence={recommendation.confidence:.2f}, "
            f"correction_count={context.correction_count}"
        )

        return recommendation

    def apply_repair(
        self,
        recommendation: RepairRecommendation,
        original_response: str,
    ) -> str:
        """
        Apply repair strategy to response.

        Args:
            recommendation: RepairRecommendation from get_repair_recommendation
            original_response: The AI's original response

        Returns:
            Modified response with repair applied
        """
        if recommendation.strategy == RepairStrategy.NO_REPAIR:
            return original_response

        modified = original_response

        # Apply prefix
        if recommendation.suggested_prefix:
            modified = recommendation.suggested_prefix + modified

        # Apply suffix
        if recommendation.suggested_suffix:
            modified = modified.rstrip(".!?") + recommendation.suggested_suffix

        # Handle clarification options
        if recommendation.strategy == RepairStrategy.CLARIFY_SPECIFIC and recommendation.clarification_options:
            options = recommendation.clarification_options
            if len(options) == 2:
                options_text = f"did you mean {options[0]} or {options[1]}?"
            else:
                options_text = "did you mean " + ", ".join(options[:-1]) + f", or {options[-1]}?"
            modified = recommendation.suggested_prefix + options_text

        return modified

    def clear_session(self, session_id: str) -> None:
        """Clear repair context for a session."""
        if session_id in self._session_contexts:
            del self._session_contexts[session_id]
            logger.debug(f"Cleared repair context for session: {session_id}")

    def get_session_stats(self, session_id: str) -> Optional[Dict]:
        """Get repair statistics for a session."""
        if session_id not in self._session_contexts:
            return None

        context = self._session_contexts[session_id]
        return {
            "correction_count": context.correction_count,
            "frustration_score": context.frustration_score,
            "correction_types": [ct.value for ct in context.correction_types],
        }


# Global service instance
repair_strategy_service = RepairStrategyService()
