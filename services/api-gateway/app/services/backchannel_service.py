"""
Backchannel Service - Natural Verbal Acknowledgments

Provides natural verbal cues during user speech to show active listening.
Examples: "uh-huh", "mm-hmm", "I see", "right", "got it"

Features:
- Pre-cached backchannel audio clips per voice
- Intelligent timing based on speech patterns
- Multi-language support
- Integration with ElevenLabs TTS
- Emotion-aware phrase selection
- Event bus integration for context.emotion_alert events

Phase: Voice Mode Backchanneling Enhancement (Phase 3)
"""

import asyncio
import hashlib
import random
import tempfile
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

from app.core.config import settings
from app.core.logging import get_logger
from app.services.elevenlabs_service import ElevenLabsService

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class BackchannelType(str, Enum):
    """Types of backchannels based on conversational function."""

    ACKNOWLEDGMENT = "acknowledgment"  # "uh-huh", "mm-hmm"
    UNDERSTANDING = "understanding"  # "I see", "right", "got it"
    ENCOURAGEMENT = "encouragement"  # "go on", "yes"
    SURPRISE = "surprise"  # "oh", "wow", "really"
    EMPATHY = "empathy"  # "hmm", "I understand"


class UserIntent(str, Enum):
    """
    User intent classification for smart acknowledgment selection.
    Issue 2: Intent classification for contextually appropriate backchannels.
    """

    QUESTION = "question"  # User is asking a question
    STATEMENT = "statement"  # User is making a statement/sharing info
    INSTRUCTION = "instruction"  # User is giving instructions/commands
    CONCERN = "concern"  # User is expressing worry/concern
    STORY = "story"  # User is telling a story/narrative
    CLARIFICATION = "clarification"  # User is clarifying something
    ACKNOWLEDGMENT = "acknowledgment"  # User is acknowledging (don't backchannel)
    UNKNOWN = "unknown"  # Cannot determine intent


# Intent-to-backchannel type mappings (Issue 2)
INTENT_PHRASE_MAP: Dict[UserIntent, Dict[str, Any]] = {
    UserIntent.QUESTION: {
        "preferred_types": [BackchannelType.UNDERSTANDING],
        "weight_boost": 0.5,  # Reduce backchannels during questions
        "suppress": True,  # Often suppress backchannels during questions
    },
    UserIntent.STATEMENT: {
        "preferred_types": [BackchannelType.ACKNOWLEDGMENT, BackchannelType.UNDERSTANDING],
        "weight_boost": 1.2,
    },
    UserIntent.INSTRUCTION: {
        "preferred_types": [BackchannelType.UNDERSTANDING, BackchannelType.ACKNOWLEDGMENT],
        "weight_boost": 1.3,
        "extra_phrases": ["got it", "okay", "understood"],
    },
    UserIntent.CONCERN: {
        "preferred_types": [BackchannelType.EMPATHY, BackchannelType.UNDERSTANDING],
        "weight_boost": 1.4,
    },
    UserIntent.STORY: {
        "preferred_types": [BackchannelType.ENCOURAGEMENT, BackchannelType.ACKNOWLEDGMENT],
        "weight_boost": 1.1,
        "extra_phrases": ["and then?", "wow"],
    },
    UserIntent.CLARIFICATION: {
        "preferred_types": [BackchannelType.UNDERSTANDING],
        "weight_boost": 1.0,
    },
    UserIntent.ACKNOWLEDGMENT: {
        "preferred_types": [],
        "weight_boost": 0.0,
        "suppress": True,  # Don't backchannel when user is acknowledging
    },
    UserIntent.UNKNOWN: {
        "preferred_types": [BackchannelType.ACKNOWLEDGMENT],
        "weight_boost": 1.0,
    },
}


@dataclass
class BackchannelPhrase:
    """A backchannel phrase with metadata."""

    text: str
    type: BackchannelType
    language: str = "en"
    weight: float = 1.0  # Probability weight for selection
    min_gap_seconds: float = 5.0  # Minimum gap before this can be used again


# Language-specific backchannel phrases
BACKCHANNEL_PHRASES: Dict[str, List[BackchannelPhrase]] = {
    "en": [
        # Acknowledgments (most common)
        BackchannelPhrase("uh-huh", BackchannelType.ACKNOWLEDGMENT, weight=2.0),
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, weight=2.0),
        BackchannelPhrase("mhm", BackchannelType.ACKNOWLEDGMENT, weight=1.5),
        # Understanding
        BackchannelPhrase("I see", BackchannelType.UNDERSTANDING, weight=1.5),
        BackchannelPhrase("right", BackchannelType.UNDERSTANDING, weight=1.5),
        BackchannelPhrase("got it", BackchannelType.UNDERSTANDING, weight=1.0),
        BackchannelPhrase("okay", BackchannelType.UNDERSTANDING, weight=1.0),
        # Encouragement
        BackchannelPhrase("yes", BackchannelType.ENCOURAGEMENT, weight=1.0),
        BackchannelPhrase("go on", BackchannelType.ENCOURAGEMENT, weight=0.5),
        # Empathy
        BackchannelPhrase("hmm", BackchannelType.EMPATHY, weight=1.0),
        # Surprise
        BackchannelPhrase("oh", BackchannelType.SURPRISE, weight=0.8),
        BackchannelPhrase("really", BackchannelType.SURPRISE, weight=0.5),
    ],
    "ar": [
        # Arabic acknowledgments
        BackchannelPhrase("اها", BackchannelType.ACKNOWLEDGMENT, "ar", weight=2.0),
        BackchannelPhrase("نعم", BackchannelType.UNDERSTANDING, "ar", weight=1.5),
        BackchannelPhrase("صح", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
        BackchannelPhrase("طيب", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
        BackchannelPhrase("تمام", BackchannelType.UNDERSTANDING, "ar", weight=1.0),
        # Empathy
        BackchannelPhrase("آه", BackchannelType.EMPATHY, "ar", weight=1.0),
    ],
    "es": [
        BackchannelPhrase("ajá", BackchannelType.ACKNOWLEDGMENT, "es", weight=2.0),
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, "es", weight=1.5),
        BackchannelPhrase("ya", BackchannelType.UNDERSTANDING, "es", weight=1.5),
        BackchannelPhrase("entiendo", BackchannelType.UNDERSTANDING, "es", weight=1.0),
        BackchannelPhrase("claro", BackchannelType.UNDERSTANDING, "es", weight=1.0),
    ],
    "fr": [
        BackchannelPhrase("mm-hmm", BackchannelType.ACKNOWLEDGMENT, "fr", weight=2.0),
        BackchannelPhrase("oui", BackchannelType.UNDERSTANDING, "fr", weight=1.5),
        BackchannelPhrase("d'accord", BackchannelType.UNDERSTANDING, "fr", weight=1.0),
        BackchannelPhrase("je vois", BackchannelType.UNDERSTANDING, "fr", weight=1.0),
    ],
}


# Emotion-specific phrase mappings (English)
# Maps emotion states to preferred backchannel types
EMOTION_PHRASE_MAP: Dict[str, Dict[str, Any]] = {
    "neutral": {
        "preferred_types": [
            BackchannelType.ACKNOWLEDGMENT,
            BackchannelType.UNDERSTANDING,
        ],
        "weight_boost": 1.0,
    },
    "happy": {
        "preferred_types": [
            BackchannelType.ENCOURAGEMENT,
            BackchannelType.ACKNOWLEDGMENT,
        ],
        "weight_boost": 1.2,
    },
    "sad": {
        "preferred_types": [BackchannelType.EMPATHY, BackchannelType.UNDERSTANDING],
        "weight_boost": 1.3,
        "extra_phrases": [
            BackchannelPhrase("I hear you", BackchannelType.EMPATHY, weight=1.5),
            BackchannelPhrase("I understand", BackchannelType.EMPATHY, weight=1.5),
        ],
    },
    "frustrated": {
        "preferred_types": [BackchannelType.EMPATHY, BackchannelType.UNDERSTANDING],
        "weight_boost": 1.5,
        "extra_phrases": [
            BackchannelPhrase("I hear you", BackchannelType.EMPATHY, weight=2.0),
            BackchannelPhrase("I understand", BackchannelType.EMPATHY, weight=2.0),
            BackchannelPhrase("that makes sense", BackchannelType.UNDERSTANDING, weight=1.5),
        ],
        "reduce_frequency": True,  # Less frequent backchannels when frustrated
    },
    "anxious": {
        "preferred_types": [BackchannelType.EMPATHY, BackchannelType.ENCOURAGEMENT],
        "weight_boost": 1.2,
        "extra_phrases": [
            BackchannelPhrase("it's okay", BackchannelType.EMPATHY, weight=1.5),
            BackchannelPhrase("take your time", BackchannelType.ENCOURAGEMENT, weight=1.5),
        ],
    },
    "confused": {
        "preferred_types": [
            BackchannelType.UNDERSTANDING,
            BackchannelType.ENCOURAGEMENT,
        ],
        "weight_boost": 1.0,
        "extra_phrases": [
            BackchannelPhrase("go on", BackchannelType.ENCOURAGEMENT, weight=1.5),
        ],
    },
    "surprised": {
        "preferred_types": [BackchannelType.SURPRISE, BackchannelType.ACKNOWLEDGMENT],
        "weight_boost": 1.3,
    },
}


@dataclass
class BackchannelTrigger:
    """Result of backchannel timing analysis."""

    should_trigger: bool
    phrase: Optional[BackchannelPhrase] = None
    reason: str = ""
    confidence: float = 0.0


@dataclass
class BackchannelAudio:
    """Cached backchannel audio data."""

    phrase: str
    voice_id: str
    audio_data: bytes
    format: str = "pcm_24000"
    duration_ms: int = 0
    cached_at: float = field(default_factory=time.time)


@dataclass
class BackchannelState:
    """State tracking for backchannel timing in a session."""

    last_backchannel_time: float = 0.0
    last_phrase_used: Optional[str] = None
    recent_phrases: List[str] = field(default_factory=list)
    speech_start_time: float = 0.0
    continuous_speech_ms: int = 0
    pause_count: int = 0
    total_backchannels: int = 0


@dataclass
class UserBackchannelCalibration:
    """Per-user calibration for backchannel timing preferences."""

    user_id: str
    # Timing adjustments (multipliers)
    min_gap_multiplier: float = 1.0
    min_speech_multiplier: float = 1.0
    pause_window_start_ms: int = 150
    pause_window_end_ms: int = 400

    # Phrase preferences
    preferred_types: List[BackchannelType] = field(default_factory=list)
    disliked_phrases: List[str] = field(default_factory=list)

    # Feedback tracking
    total_backchannels: int = 0
    positive_feedback: int = 0
    negative_feedback: int = 0

    # Timestamps
    created_at: float = field(default_factory=time.time)
    last_updated: float = field(default_factory=time.time)

    def get_acceptance_rate(self) -> float:
        """Calculate backchannel acceptance rate"""
        total_feedback = self.positive_feedback + self.negative_feedback
        if total_feedback == 0:
            return 0.5  # Default to neutral
        return self.positive_feedback / total_feedback


class BackchannelCalibrationService:
    """
    Manages per-user backchannel timing calibration.

    Learns user preferences through:
    - Explicit feedback (thumbs up/down)
    - Implicit signals (interruptions, silence after backchannel)
    - Conversation outcomes
    """

    # Learning rates
    POSITIVE_LEARNING_RATE = 0.1
    NEGATIVE_LEARNING_RATE = 0.15  # Learn faster from negative feedback

    # Adjustment bounds
    MIN_MULTIPLIER = 0.5
    MAX_MULTIPLIER = 2.0

    def __init__(self):
        self._user_calibrations: Dict[str, UserBackchannelCalibration] = {}
        logger.info("BackchannelCalibrationService initialized")

    def get_calibration(self, user_id: str) -> UserBackchannelCalibration:
        """Get or create calibration for user"""
        if user_id not in self._user_calibrations:
            self._user_calibrations[user_id] = UserBackchannelCalibration(user_id=user_id)
        return self._user_calibrations[user_id]

    def record_backchannel(
        self,
        user_id: str,
        phrase: BackchannelPhrase,
        was_accepted: bool,
        was_interrupted: bool = False,
    ) -> None:
        """
        Record backchannel outcome for calibration learning.

        Args:
            user_id: User identifier
            phrase: The phrase that was used
            was_accepted: Whether user continued speaking normally
            was_interrupted: Whether user interrupted the backchannel
        """
        cal = self.get_calibration(user_id)
        cal.total_backchannels += 1
        cal.last_updated = time.time()

        if was_interrupted:
            # Strong negative signal - backchannels are too frequent
            cal.negative_feedback += 1
            cal.min_gap_multiplier = min(
                self.MAX_MULTIPLIER,
                cal.min_gap_multiplier * (1 + self.NEGATIVE_LEARNING_RATE),
            )
            logger.debug(f"User {user_id} interrupted backchannel - increasing gap")

        elif was_accepted:
            cal.positive_feedback += 1
            # Slight positive adjustment
            cal.min_gap_multiplier = max(
                self.MIN_MULTIPLIER,
                cal.min_gap_multiplier * (1 - self.POSITIVE_LEARNING_RATE * 0.5),
            )
        else:
            # Neutral or negative - don't adjust much
            cal.negative_feedback += 1

        # Track phrase preferences
        if not was_accepted and phrase.text not in cal.disliked_phrases:
            if cal.negative_feedback > 3:  # After some negative feedback
                cal.disliked_phrases.append(phrase.text)

    def record_explicit_feedback(
        self,
        user_id: str,
        is_positive: bool,
        feedback_type: str = "general",
    ) -> None:
        """
        Record explicit user feedback about backchannels.

        Args:
            user_id: User identifier
            is_positive: Whether feedback was positive
            feedback_type: Type of feedback (general, too_frequent, too_rare, etc.)
        """
        cal = self.get_calibration(user_id)
        cal.last_updated = time.time()

        if is_positive:
            cal.positive_feedback += 1
        else:
            cal.negative_feedback += 1

            # Adjust based on feedback type
            if feedback_type == "too_frequent":
                cal.min_gap_multiplier = min(
                    self.MAX_MULTIPLIER,
                    cal.min_gap_multiplier * 1.3,
                )
            elif feedback_type == "too_rare":
                cal.min_gap_multiplier = max(
                    self.MIN_MULTIPLIER,
                    cal.min_gap_multiplier * 0.7,
                )
            elif feedback_type == "too_early":
                cal.min_speech_multiplier = min(
                    self.MAX_MULTIPLIER,
                    cal.min_speech_multiplier * 1.2,
                )
            elif feedback_type == "wrong_timing":
                cal.pause_window_start_ms = min(300, cal.pause_window_start_ms + 30)
                cal.pause_window_end_ms = min(600, cal.pause_window_end_ms + 50)

        logger.info(f"Recorded explicit feedback for {user_id}: " f"positive={is_positive}, type={feedback_type}")

    def get_adjusted_thresholds(
        self,
        user_id: str,
        base_min_gap_ms: int,
        base_min_speech_ms: int,
    ) -> Tuple[int, int, int, int]:
        """
        Get user-adjusted timing thresholds.

        Returns:
            Tuple of (min_gap_ms, min_speech_ms, pause_start_ms, pause_end_ms)
        """
        cal = self.get_calibration(user_id)

        return (
            int(base_min_gap_ms * cal.min_gap_multiplier),
            int(base_min_speech_ms * cal.min_speech_multiplier),
            cal.pause_window_start_ms,
            cal.pause_window_end_ms,
        )

    def should_use_phrase(
        self,
        user_id: str,
        phrase: BackchannelPhrase,
    ) -> bool:
        """Check if a phrase should be used for this user"""
        cal = self.get_calibration(user_id)
        return phrase.text not in cal.disliked_phrases

    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get calibration statistics for a user"""
        cal = self.get_calibration(user_id)
        return {
            "user_id": user_id,
            "total_backchannels": cal.total_backchannels,
            "acceptance_rate": cal.get_acceptance_rate(),
            "min_gap_multiplier": cal.min_gap_multiplier,
            "min_speech_multiplier": cal.min_speech_multiplier,
            "pause_window": (cal.pause_window_start_ms, cal.pause_window_end_ms),
            "disliked_phrases": cal.disliked_phrases,
            "positive_feedback": cal.positive_feedback,
            "negative_feedback": cal.negative_feedback,
        }


# ==============================================================================
# Intent Classification (Issue 2)
# ==============================================================================


class IntentClassifier:
    """
    Classifies user intent from transcript text for smart acknowledgment selection.

    Issue 2: Intent classification for contextually appropriate backchannels.
    """

    QUESTION_WORDS = {
        "en": {
            "what",
            "where",
            "when",
            "why",
            "how",
            "who",
            "which",
            "can",
            "could",
            "would",
            "should",
            "is",
            "are",
            "do",
            "does",
            "did",
        },
        "ar": {"ما", "أين", "متى", "لماذا", "كيف", "من", "أي", "هل"},
    }

    INSTRUCTION_WORDS = {
        "en": {
            "please",
            "can you",
            "could you",
            "tell me",
            "show me",
            "explain",
            "help me",
            "make sure",
            "remember to",
        },
        "ar": {"من فضلك", "أخبرني", "اشرح", "ساعدني"},
    }

    CONCERN_WORDS = {
        "en": {
            "worried",
            "concerned",
            "anxious",
            "nervous",
            "afraid",
            "scared",
            "unsure",
            "confused",
            "frustrated",
            "upset",
            "stressed",
        },
        "ar": {"قلق", "خائف", "محبط", "متوتر"},
    }

    STORY_MARKERS = {
        "en": {
            "so",
            "then",
            "and then",
            "after that",
            "next",
            "suddenly",
            "eventually",
            "finally",
            "yesterday",
            "last week",
        },
        "ar": {"ثم", "بعد ذلك", "في يوم"},
    }

    ACKNOWLEDGMENT_WORDS = {
        "en": {"okay", "ok", "yes", "yeah", "uh-huh", "mm-hmm", "right", "got it", "understood", "i see", "thanks"},
        "ar": {"نعم", "حسنا", "طيب", "تمام", "شكرا"},
    }

    def __init__(self, language: str = "en"):
        self.language = language if language in self.QUESTION_WORDS else "en"

    def classify(self, transcript: str) -> UserIntent:
        """Classify user intent from transcript text."""
        if not transcript:
            return UserIntent.UNKNOWN

        text = transcript.lower().strip()

        if self._is_question(text):
            return UserIntent.QUESTION
        if self._is_acknowledgment(text):
            return UserIntent.ACKNOWLEDGMENT
        if self._is_instruction(text):
            return UserIntent.INSTRUCTION
        if self._is_concern(text):
            return UserIntent.CONCERN
        if self._is_story(text):
            return UserIntent.STORY
        if self._is_clarification(text):
            return UserIntent.CLARIFICATION

        return UserIntent.STATEMENT

    def _is_question(self, text: str) -> bool:
        if text.rstrip().endswith("?"):
            return True
        words = text.split()
        if words:
            question_words = self.QUESTION_WORDS.get(self.language, self.QUESTION_WORDS["en"])
            if words[0].lower() in question_words:
                return True
        return False

    def _is_instruction(self, text: str) -> bool:
        instruction_words = self.INSTRUCTION_WORDS.get(self.language, self.INSTRUCTION_WORDS["en"])
        return any(marker in text for marker in instruction_words)

    def _is_concern(self, text: str) -> bool:
        concern_words = self.CONCERN_WORDS.get(self.language, self.CONCERN_WORDS["en"])
        return any(word in text for word in concern_words)

    def _is_story(self, text: str) -> bool:
        story_markers = self.STORY_MARKERS.get(self.language, self.STORY_MARKERS["en"])
        return any(text.startswith(marker) or f" {marker} " in text for marker in story_markers)

    def _is_clarification(self, text: str) -> bool:
        markers = ["i mean", "what i meant", "to clarify", "in other words"]
        return any(marker in text for marker in markers)

    def _is_acknowledgment(self, text: str) -> bool:
        ack_words = self.ACKNOWLEDGMENT_WORDS.get(self.language, self.ACKNOWLEDGMENT_WORDS["en"])
        words = text.split()
        if len(words) <= 3:
            return any(word in text for word in ack_words)
        return False


# ==============================================================================
# Backchannel Timing Logic
# ==============================================================================


class BackchannelTimingEngine:
    """
    Determines when to trigger backchannels based on speech patterns.

    Timing rules:
    - Minimum 5 seconds between backchannels
    - Only during natural pauses (150-300ms silence)
    - After sustained speech (2-3 seconds minimum)
    - Never interrupt mid-sentence
    - Vary phrase selection to avoid repetition
    - Emotion-aware phrase selection for empathetic responses
    - Intent-aware phrase selection (Issue 2)
    """

    # Timing constants
    MIN_GAP_BETWEEN_BACKCHANNELS_MS = 5000  # 5 seconds
    MIN_SPEECH_BEFORE_BACKCHANNEL_MS = 2000  # 2 seconds
    OPTIMAL_PAUSE_MIN_MS = 150  # Short pause start
    OPTIMAL_PAUSE_MAX_MS = 400  # Short pause end (before it becomes long pause)
    MAX_PHRASE_REPEAT_COUNT = 3  # Max times to use same phrase before cycling

    # Reduced frequency multiplier for frustrated users
    FRUSTRATED_GAP_MULTIPLIER = 1.5

    def __init__(self, language: str = "en", use_emotion_aware: bool = True, use_intent_aware: bool = True):
        """
        Initialize backchannel timing engine.

        Args:
            language: Language code for phrase selection
            use_emotion_aware: Whether to use emotion-aware phrase selection.
                               Set to False for A/B testing control group.
            use_intent_aware: Whether to use intent-aware phrase selection (Issue 2).
        """
        self.language = language
        self._use_emotion_aware = use_emotion_aware
        self._use_intent_aware = use_intent_aware
        self._base_phrases = BACKCHANNEL_PHRASES.get(language, BACKCHANNEL_PHRASES["en"])
        self._phrases = self._base_phrases.copy()
        self._phrase_weights = [p.weight for p in self._phrases]
        self._current_emotion: str = "neutral"
        self._emotion_config: Dict[str, Any] = EMOTION_PHRASE_MAP.get("neutral", {})
        self._current_intent: UserIntent = UserIntent.UNKNOWN
        self._intent_classifier = IntentClassifier(language)

    def set_emotion_state(self, emotion: str) -> None:
        """
        Update the current emotion state for phrase selection.

        Args:
            emotion: Current dominant emotion (neutral, happy, sad, frustrated, etc.)

        Note:
            If use_emotion_aware is False (A/B test control group),
            this method will track the emotion but not adjust phrases.
        """
        if emotion == self._current_emotion:
            return

        self._current_emotion = emotion
        self._emotion_config = EMOTION_PHRASE_MAP.get(emotion, EMOTION_PHRASE_MAP["neutral"])

        # Skip emotion-aware adjustments if disabled (A/B test control group)
        if not self._use_emotion_aware:
            logger.debug(f"Backchannel emotion tracked (not applied): {emotion}")
            return

        # Rebuild phrase list with emotion-specific extras
        self._phrases = self._base_phrases.copy()
        extra_phrases = self._emotion_config.get("extra_phrases", [])
        if extra_phrases:
            self._phrases = self._phrases + extra_phrases

        # Recalculate weights with emotion boost
        preferred_types = self._emotion_config.get("preferred_types", [])
        weight_boost = self._emotion_config.get("weight_boost", 1.0)

        self._phrase_weights = []
        for p in self._phrases:
            weight = p.weight
            if p.type in preferred_types:
                weight *= weight_boost
            self._phrase_weights.append(weight)

        logger.debug(f"Backchannel emotion updated to: {emotion}")

    def get_min_gap_ms(self) -> int:
        """Get minimum gap between backchannels, adjusted for emotion"""
        base_gap = self.MIN_GAP_BETWEEN_BACKCHANNELS_MS
        # Only apply emotion-aware gap adjustment if enabled
        if self._use_emotion_aware and self._emotion_config.get("reduce_frequency", False):
            return int(base_gap * self.FRUSTRATED_GAP_MULTIPLIER)
        return base_gap

    def update_intent(self, transcript: str) -> UserIntent:
        """
        Update intent classification based on transcript.

        Issue 2: Intent-aware acknowledgment selection.

        Args:
            transcript: Current user transcript text

        Returns:
            Classified UserIntent
        """
        if not self._use_intent_aware or not transcript:
            return UserIntent.UNKNOWN

        self._current_intent = self._intent_classifier.classify(transcript)
        return self._current_intent

    def should_trigger(
        self,
        state: BackchannelState,
        current_time: float,
        pause_duration_ms: int,
        is_speaking: bool,
        emotion_state: Optional[str] = None,
        transcript: Optional[str] = None,
    ) -> BackchannelTrigger:
        """
        Determine if a backchannel should be triggered.

        Args:
            state: Current session backchannel state
            current_time: Current timestamp
            pause_duration_ms: Duration of current pause in speech
            is_speaking: Whether user is currently speaking
            emotion_state: Optional current emotion state for adaptive timing
            transcript: Optional current transcript for intent classification (Issue 2)

        Returns:
            BackchannelTrigger with decision and selected phrase
        """
        # Update emotion if provided
        if emotion_state:
            self.set_emotion_state(emotion_state)

        # Update intent if transcript provided (Issue 2)
        if transcript and self._use_intent_aware:
            self.update_intent(transcript)

        # Issue 2: Check intent-based suppression
        if self._use_intent_aware:
            intent_config = INTENT_PHRASE_MAP.get(self._current_intent, {})
            if intent_config.get("suppress", False):
                return BackchannelTrigger(
                    should_trigger=False,
                    reason=f"Suppressed for intent: {self._current_intent.value}",
                )

        # Rule 1: Minimum gap between backchannels (emotion-aware)
        min_gap = self.get_min_gap_ms()
        time_since_last = (current_time - state.last_backchannel_time) * 1000
        if time_since_last < min_gap:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Too soon (last: {time_since_last:.0f}ms ago, min: {min_gap}ms)",
            )

        # Rule 2: Need minimum speech before backchannel
        if state.continuous_speech_ms < self.MIN_SPEECH_BEFORE_BACKCHANNEL_MS:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Not enough speech ({state.continuous_speech_ms}ms)",
            )

        # Rule 3: Only trigger during optimal pause window
        if is_speaking:
            return BackchannelTrigger(
                should_trigger=False,
                reason="User still speaking",
            )

        if pause_duration_ms < self.OPTIMAL_PAUSE_MIN_MS:
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Pause too short ({pause_duration_ms}ms)",
            )

        if pause_duration_ms > self.OPTIMAL_PAUSE_MAX_MS:
            # Pause is too long - might be end of thought, don't backchannel
            return BackchannelTrigger(
                should_trigger=False,
                reason=f"Pause too long ({pause_duration_ms}ms) - likely end of thought",
            )

        # All conditions met - select phrase (with intent awareness)
        phrase = self._select_phrase(state)

        return BackchannelTrigger(
            should_trigger=True,
            phrase=phrase,
            reason=f"Optimal timing (intent: {self._current_intent.value})",
            confidence=0.8,
        )

    def _select_phrase(self, state: BackchannelState) -> BackchannelPhrase:
        """
        Select a backchannel phrase with intent and emotion awareness.

        Issue 2: Intent-aware phrase selection prioritizes phrases that
        match the user's current intent (e.g., empathy phrases for concerns,
        understanding phrases for instructions).
        """
        available_phrases = [
            p for p in self._phrases if p.text not in state.recent_phrases[-self.MAX_PHRASE_REPEAT_COUNT :]
        ]

        if not available_phrases:
            # All phrases used recently, reset and use any
            available_phrases = self._phrases

        # Issue 2: Apply intent-aware weight adjustments
        intent_config = INTENT_PHRASE_MAP.get(self._current_intent, {}) if self._use_intent_aware else {}
        intent_preferred_types = intent_config.get("preferred_types", [])
        intent_weight_boost = intent_config.get("weight_boost", 1.0)

        # Calculate weights with emotion and intent adjustments
        weights = []
        for p in available_phrases:
            weight = p.weight

            # Emotion-based boost (existing behavior)
            if self._use_emotion_aware:
                emotion_preferred = self._emotion_config.get("preferred_types", [])
                emotion_boost = self._emotion_config.get("weight_boost", 1.0)
                if p.type in emotion_preferred:
                    weight *= emotion_boost

            # Intent-based boost (Issue 2)
            if self._use_intent_aware and intent_preferred_types:
                if p.type in intent_preferred_types:
                    weight *= intent_weight_boost
                else:
                    # Reduce weight for non-preferred types when intent is clear
                    weight *= 0.7

            weights.append(weight)

        total_weight = sum(weights)
        if total_weight == 0:
            return available_phrases[0]

        # Weighted random selection (not security-sensitive, just for UI variety)
        r = random.random() * total_weight  # nosec B311

        cumulative = 0
        for phrase, weight in zip(available_phrases, weights):
            cumulative += weight
            if r <= cumulative:
                return phrase

        # Fallback
        return available_phrases[0]


# ==============================================================================
# Backchannel Audio Cache
# ==============================================================================


class BackchannelAudioCache:
    """
    Manages pre-generated backchannel audio clips.

    Caches audio per voice_id to avoid repeated TTS calls.
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        self._cache: Dict[str, BackchannelAudio] = {}
        self._cache_dir = cache_dir or Path(tempfile.gettempdir()) / "voiceassist_backchannel_cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._generating: Set[str] = set()  # Track in-progress generations

    def _cache_key(self, phrase: str, voice_id: str) -> str:
        """Generate cache key for phrase/voice combination."""
        return hashlib.md5(f"{phrase}:{voice_id}".encode(), usedforsecurity=False).hexdigest()

    def get(self, phrase: str, voice_id: str) -> Optional[BackchannelAudio]:
        """Get cached audio for phrase/voice."""
        key = self._cache_key(phrase, voice_id)
        return self._cache.get(key)

    def put(self, audio: BackchannelAudio) -> None:
        """Store audio in cache."""
        key = self._cache_key(audio.phrase, audio.voice_id)
        self._cache[key] = audio

    def is_generating(self, phrase: str, voice_id: str) -> bool:
        """Check if audio is currently being generated."""
        key = self._cache_key(phrase, voice_id)
        return key in self._generating

    def mark_generating(self, phrase: str, voice_id: str) -> None:
        """Mark phrase as being generated."""
        key = self._cache_key(phrase, voice_id)
        self._generating.add(key)

    def unmark_generating(self, phrase: str, voice_id: str) -> None:
        """Remove generating mark."""
        key = self._cache_key(phrase, voice_id)
        self._generating.discard(key)

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            "cached_phrases": len(self._cache),
            "generating": len(self._generating),
        }


# ==============================================================================
# Backchannel Session
# ==============================================================================


class BackchannelSession:
    """
    Manages backchanneling for a voice session.

    Tracks speech patterns and determines when to emit backchannels.
    Listens for context.emotion_alert events to update phrase selection.

    A/B Testing:
        Set use_emotion_aware=False for control group to disable
        emotion-aware phrase selection and timing adjustments.
    """

    def __init__(
        self,
        session_id: str,
        voice_id: str,
        language: str = "en",
        elevenlabs_service: Optional[ElevenLabsService] = None,
        audio_cache: Optional[BackchannelAudioCache] = None,
        on_backchannel: Optional[Callable[[BackchannelAudio], Awaitable[None]]] = None,
        event_bus: Optional[Any] = None,
        use_emotion_aware: bool = True,
    ):
        self.session_id = session_id
        self.voice_id = voice_id
        self.language = language
        self._elevenlabs = elevenlabs_service
        self._cache = audio_cache or BackchannelAudioCache()
        self._on_backchannel = on_backchannel
        self._event_bus = event_bus
        self._use_emotion_aware = use_emotion_aware

        # Timing engine with A/B test configuration
        self._timing = BackchannelTimingEngine(language, use_emotion_aware=use_emotion_aware)

        # State
        self._state = BackchannelState()
        self._active = False
        self._speech_active = False
        self._pause_start_time: Optional[float] = None
        self._current_emotion: str = "neutral"
        self._current_transcript: str = ""  # Issue 2: Track transcript for intent

    async def start(self) -> None:
        """Start the backchannel session."""
        self._active = True
        self._state = BackchannelState()
        logger.info(f"Backchannel session started: {self.session_id}")

        # Subscribe to emotion events if event bus is available
        if self._event_bus:
            self._subscribe_to_events()

        # Pre-warm cache with common phrases
        asyncio.create_task(self._prewarm_cache())

    def _subscribe_to_events(self) -> None:
        """Subscribe to relevant events from the event bus"""

        async def handle_emotion_updated(event):
            """Handle emotion.updated events to update phrase selection"""
            if event.session_id != self.session_id:
                return
            emotion_data = event.data.get("emotion", {})
            dominant_emotion = emotion_data.get("dominant_emotion", "neutral")
            await self.set_emotion_state(dominant_emotion)

        async def handle_emotion_alert(event):
            """Handle context.emotion_alert events for significant changes"""
            if event.session_id != self.session_id:
                return
            # Emotion alerts indicate significant changes - update immediately
            emotion = event.data.get("current_emotion", "neutral")
            deviation = event.data.get("deviation_score", 0)
            if deviation > 1.5:  # Significant deviation
                await self.set_emotion_state(emotion)
                logger.info(
                    f"Backchannel emotion alert: {emotion} "
                    f"(deviation: {deviation:.2f}) for session {self.session_id}"
                )

        # Subscribe to events
        self._event_bus.subscribe(
            "emotion.updated",
            handle_emotion_updated,
            priority=0,
            engine="backchannel",
        )
        self._event_bus.subscribe(
            "context.emotion_alert",
            handle_emotion_alert,
            priority=5,
            engine="backchannel",
        )

    async def set_emotion_state(self, emotion: str) -> None:
        """
        Update the current emotion state for phrase selection.

        Args:
            emotion: Current dominant emotion
        """
        if emotion == self._current_emotion:
            return

        self._current_emotion = emotion
        self._timing.set_emotion_state(emotion)
        logger.debug(f"Backchannel session {self.session_id} emotion: {emotion}")

    async def stop(self) -> None:
        """Stop the session."""
        self._active = False
        logger.info(
            f"Backchannel session stopped: {self.session_id}, " f"total backchannels: {self._state.total_backchannels}"
        )

    async def _prewarm_cache(self) -> None:
        """Pre-generate common backchannel audio clips."""
        phrases = BACKCHANNEL_PHRASES.get(self.language, BACKCHANNEL_PHRASES["en"])

        # Prioritize high-weight phrases
        sorted_phrases = sorted(phrases, key=lambda p: p.weight, reverse=True)

        for phrase in sorted_phrases[:5]:  # Pre-warm top 5
            if not self._cache.get(phrase.text, self.voice_id):
                await self._generate_audio(phrase.text)

    async def on_speech_start(self) -> None:
        """Called when user starts speaking."""
        if not self._active:
            return

        self._speech_active = True
        self._state.speech_start_time = time.time()
        self._pause_start_time = None

    async def on_speech_continue(self, duration_ms: int, transcript: str = "") -> None:
        """
        Called periodically while user is speaking.

        Args:
            duration_ms: Duration of continuous speech
            transcript: Current transcript text (Issue 2: for intent classification)
        """
        if not self._active or not self._speech_active:
            return

        self._state.continuous_speech_ms = duration_ms

        # Issue 2: Update transcript for intent classification
        if transcript:
            self._current_transcript = transcript

    async def on_pause_detected(self, pause_duration_ms: int, transcript: str = "") -> None:
        """
        Called when a pause is detected in user speech.

        This is the main trigger point for backchannels.

        Args:
            pause_duration_ms: Duration of the pause in milliseconds
            transcript: Current transcript text (Issue 2: for intent classification)
        """
        if not self._active:
            return

        if self._pause_start_time is None:
            self._pause_start_time = time.time()

        # Issue 2: Update transcript if provided
        if transcript:
            self._current_transcript = transcript

        current_time = time.time()

        # Check if we should backchannel (with emotion and intent context)
        trigger = self._timing.should_trigger(
            state=self._state,
            current_time=current_time,
            pause_duration_ms=pause_duration_ms,
            is_speaking=False,
            emotion_state=self._current_emotion,
            transcript=self._current_transcript,  # Issue 2: Pass transcript
        )

        if trigger.should_trigger and trigger.phrase:
            await self._emit_backchannel(trigger.phrase)

    async def on_speech_end(self) -> None:
        """Called when user finishes speaking (end of utterance)."""
        self._speech_active = False
        self._state.continuous_speech_ms = 0
        self._pause_start_time = None
        self._current_transcript = ""  # Issue 2: Reset transcript

    async def _emit_backchannel(self, phrase: BackchannelPhrase) -> None:
        """Emit a backchannel audio clip."""
        # Get or generate audio
        audio = self._cache.get(phrase.text, self.voice_id)

        if not audio:
            audio = await self._generate_audio(phrase.text)

        if not audio:
            logger.warning(f"Failed to get backchannel audio for: {phrase.text}")
            return

        # Update state
        self._state.last_backchannel_time = time.time()
        self._state.last_phrase_used = phrase.text
        self._state.recent_phrases.append(phrase.text)
        self._state.total_backchannels += 1

        # Keep recent phrases list bounded
        if len(self._state.recent_phrases) > 10:
            self._state.recent_phrases = self._state.recent_phrases[-10:]

        logger.info(f"Emitting backchannel: '{phrase.text}' (total: {self._state.total_backchannels})")

        # Emit to callback
        if self._on_backchannel:
            await self._on_backchannel(audio)

    async def _generate_audio(self, phrase: str) -> Optional[BackchannelAudio]:
        """Generate backchannel audio using TTS."""
        if not self._elevenlabs:
            logger.warning("No ElevenLabs service available for backchannel TTS")
            return None

        # Check if already generating
        if self._cache.is_generating(phrase, self.voice_id):
            # Wait for it to complete
            for _ in range(20):  # 2 second timeout
                await asyncio.sleep(0.1)
                cached = self._cache.get(phrase, self.voice_id)
                if cached:
                    return cached
            return None

        try:
            self._cache.mark_generating(phrase, self.voice_id)

            # Generate with ElevenLabs
            # Use specific settings for natural backchannel sound
            result = await self._elevenlabs.synthesize(
                text=phrase,
                voice_id=self.voice_id,
                stability=0.7,  # Natural but consistent
                similarity_boost=0.8,
                style=0.3,  # Slightly expressive
                output_format="pcm_24000",
            )

            if not result or not result.audio_data:
                return None

            audio_data = result.audio_data

            # Calculate duration (PCM 24kHz, 16-bit mono)
            duration_ms = int(len(audio_data) / 2 / 24000 * 1000)

            audio = BackchannelAudio(
                phrase=phrase,
                voice_id=self.voice_id,
                audio_data=audio_data,
                format="pcm_24000",
                duration_ms=duration_ms,
            )

            self._cache.put(audio)
            return audio

        except Exception as e:
            logger.error(f"Failed to generate backchannel audio: {e}")
            return None

        finally:
            self._cache.unmark_generating(phrase, self.voice_id)


# ==============================================================================
# Backchannel Service
# ==============================================================================


class BackchannelService:
    """
    Factory service for creating backchannel sessions.

    Manages shared audio cache and ElevenLabs integration.
    Supports emotion-aware phrase selection via event bus integration.

    A/B Testing:
        When policy_service is provided, the service checks the
        "emotion_aware_backchannels" A/B test to determine whether
        to enable emotion-aware phrase selection for each session.
    """

    def __init__(self, event_bus: Optional[Any] = None, policy_service: Optional[Any] = None):
        self._cache = BackchannelAudioCache()
        self._sessions: Dict[str, BackchannelSession] = {}
        self._elevenlabs: Optional[ElevenLabsService] = None
        self._event_bus = event_bus
        self._policy_service = policy_service
        self._has_api_key = bool(settings.ELEVENLABS_API_KEY)
        self._feature_flag_checked = False
        self._feature_flag_enabled = False

        if self._has_api_key:
            self._elevenlabs = ElevenLabsService()
            logger.info("Backchannel service initialized (pending feature flag check)")
        else:
            logger.info("Backchannel service disabled (no ELEVENLABS_API_KEY)")

    def set_event_bus(self, event_bus: Any) -> None:
        """Set or update the event bus for emotion event integration"""
        self._event_bus = event_bus
        logger.debug("Backchannel service event bus updated")

    async def is_enabled(self) -> bool:
        """
        Check if backchanneling is available.

        Requires both:
        1. ELEVENLABS_API_KEY to be configured
        2. backend.voice_backchanneling feature flag to be enabled
        """
        if not self._has_api_key:
            return False

        # Check feature flag (cached after first check)
        if not self._feature_flag_checked:
            try:
                from app.services.feature_flags import feature_flag_service

                self._feature_flag_enabled = await feature_flag_service.is_enabled(
                    "backend.voice_backchanneling", default=False
                )
                self._feature_flag_checked = True
                if self._feature_flag_enabled:
                    logger.info("Backchanneling feature flag is enabled")
                else:
                    logger.info("Backchanneling feature flag is disabled")
            except Exception as e:
                logger.warning(f"Failed to check backchanneling feature flag: {e}")
                self._feature_flag_enabled = False
                self._feature_flag_checked = True

        return self._feature_flag_enabled

    def set_policy_service(self, policy_service: Any) -> None:
        """Set or update the policy service for A/B testing"""
        self._policy_service = policy_service
        logger.debug("Backchannel service policy service updated")

    def _should_use_emotion_aware(self, user_id: Optional[str]) -> bool:
        """
        Determine if emotion-aware backchannels should be used.

        Checks A/B test variant via policy service if available.
        """
        if not self._policy_service or not user_id:
            # Default to enabled when no A/B testing
            return True

        # Check A/B test variant
        variant = self._policy_service.get_variant("emotion_aware_backchannels", user_id)
        if variant == "static":
            return False  # Control group: no emotion awareness
        elif variant == "emotion_aware":
            return True  # Treatment group: emotion aware

        # Check feature flag as fallback
        return self._policy_service.is_feature_enabled("emotion_aware_backchannels", user_id)

    async def create_session(
        self,
        session_id: str,
        voice_id: str,
        language: str = "en",
        on_backchannel: Optional[Callable[[BackchannelAudio], Awaitable[None]]] = None,
        user_id: Optional[str] = None,
    ) -> Optional[BackchannelSession]:
        """
        Create a new backchannel session.

        Args:
            session_id: Unique session identifier
            voice_id: ElevenLabs voice ID for TTS
            language: Language code (en, ar, es, fr)
            on_backchannel: Callback for backchannel triggers
            user_id: User ID for A/B test variant determination

        Returns:
            BackchannelSession or None if disabled
        """
        if not self._enabled:
            logger.debug("Backchanneling disabled")
            return None

        # Determine A/B test variant for emotion-aware backchannels
        use_emotion_aware = self._should_use_emotion_aware(user_id)

        session = BackchannelSession(
            session_id=session_id,
            voice_id=voice_id,
            language=language,
            elevenlabs_service=self._elevenlabs,
            audio_cache=self._cache,
            on_backchannel=on_backchannel,
            event_bus=self._event_bus,
            use_emotion_aware=use_emotion_aware,
        )

        self._sessions[session_id] = session
        await session.start()

        # Log A/B test assignment
        logger.info(f"Backchannel session created: {session_id}, " f"emotion_aware={use_emotion_aware}, user={user_id}")

        return session

    async def remove_session(self, session_id: str) -> None:
        """Remove and cleanup a backchannel session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()

    def get_session(self, session_id: str) -> Optional[BackchannelSession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    def get_available_phrases(self, language: str = "en") -> List[Dict]:
        """Get available backchannel phrases for a language."""
        phrases = BACKCHANNEL_PHRASES.get(language, BACKCHANNEL_PHRASES["en"])
        return [
            {
                "text": p.text,
                "type": p.type.value,
                "language": p.language,
            }
            for p in phrases
        ]

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        return self._cache.get_cache_stats()


# Global service instance
backchannel_service = BackchannelService()
