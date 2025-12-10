"""
Prosody Analysis Service - Speech Rhythm and Dynamics

Analyzes speech patterns from Deepgram word-level data to extract:
- Speech rate (words per minute)
- Pause patterns (duration and frequency)
- Emphasis detection (from word confidence)
- Turn-taking signals

These features enhance conversational naturalness by:
1. Adapting response timing to user's speech pace
2. Detecting when user is thinking vs finished speaking
3. Identifying emphasis for better understanding

Phase: Voice Mode Intelligence Enhancement - Phase 3
"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Data Classes and Enums
# ==============================================================================


class SpeechPace(str, Enum):
    """User's speech pace category."""

    SLOW = "slow"  # < 120 WPM
    NORMAL = "normal"  # 120-160 WPM
    FAST = "fast"  # > 160 WPM


class PauseType(str, Enum):
    """Classification of pause types in speech."""

    BREATH = "breath"  # < 200ms - normal breathing pause
    WORD_BOUNDARY = "word_boundary"  # 200-500ms - between phrases
    THINKING = "thinking"  # 500-1500ms - user is formulating thought
    TURN_YIELD = "turn_yield"  # > 1500ms - user may be yielding turn


class TurnTakingState(str, Enum):
    """
    Phase 5: User's turn-taking intent classification.

    Used for adaptive endpointing - determining when the AI should respond.
    """

    CONTINUING = "continuing"  # User is actively speaking, don't interrupt
    PAUSING = "pausing"  # User is thinking, may continue - wait longer
    YIELDING = "yielding"  # User has finished, AI should respond
    UNCERTAIN = "uncertain"  # Not enough data to determine


@dataclass
class WordTiming:
    """Timing information for a single word."""

    word: str
    start: float  # Start time in seconds
    end: float  # End time in seconds
    confidence: float  # Word-level confidence

    @property
    def duration_ms(self) -> int:
        """Word duration in milliseconds."""
        return int((self.end - self.start) * 1000)


@dataclass
class PauseInfo:
    """Information about a pause between words."""

    start: float  # Pause start time
    end: float  # Pause end time
    duration_ms: int  # Duration in milliseconds
    pause_type: PauseType
    before_word: str  # Word before pause
    after_word: str  # Word after pause


@dataclass
class TurnTakingPrediction:
    """
    Phase 5: Prediction of user's turn-taking intent.

    Provides confidence-weighted prediction to guide adaptive endpointing.
    """

    state: TurnTakingState = TurnTakingState.UNCERTAIN
    confidence: float = 0.0  # 0.0 to 1.0
    recommended_wait_ms: int = 500  # How long to wait before responding

    # Signals that contributed to prediction
    has_falling_intonation: bool = False  # End-of-sentence signal
    has_trailing_off: bool = False  # Decreasing confidence/volume
    is_thinking_aloud: bool = False  # User seems to be processing, not asking
    has_continuation_cue: bool = False  # "and", "but", "so" at end

    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            "state": self.state.value,
            "confidence": round(self.confidence, 2),
            "recommended_wait_ms": self.recommended_wait_ms,
            "signals": {
                "falling_intonation": self.has_falling_intonation,
                "trailing_off": self.has_trailing_off,
                "thinking_aloud": self.is_thinking_aloud,
                "continuation_cue": self.has_continuation_cue,
            },
        }


@dataclass
class ProsodySnapshot:
    """Current prosody state for a speech segment."""

    # Speech rate
    words_per_minute: float = 0.0
    pace: SpeechPace = SpeechPace.NORMAL

    # Pause analysis
    pause_count: int = 0
    avg_pause_ms: float = 0.0
    max_pause_ms: int = 0
    thinking_pause_count: int = 0

    # Word analysis
    word_count: int = 0
    avg_word_duration_ms: float = 0.0
    avg_confidence: float = 0.0

    # Turn-taking signals
    likely_finished: bool = False  # User probably done speaking
    hesitation_detected: bool = False  # User seems uncertain

    # Phase 5: Advanced turn-taking prediction
    turn_prediction: Optional[TurnTakingPrediction] = None

    # Timestamps
    segment_start: float = 0.0
    segment_end: float = 0.0
    analysis_time: float = field(default_factory=time.time)

    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        result = {
            "words_per_minute": round(self.words_per_minute, 1),
            "pace": self.pace.value,
            "pause_count": self.pause_count,
            "avg_pause_ms": round(self.avg_pause_ms, 1),
            "max_pause_ms": self.max_pause_ms,
            "thinking_pause_count": self.thinking_pause_count,
            "word_count": self.word_count,
            "avg_confidence": round(self.avg_confidence, 2),
            "likely_finished": self.likely_finished,
            "hesitation_detected": self.hesitation_detected,
        }
        if self.turn_prediction:
            result["turn_prediction"] = self.turn_prediction.to_dict()
        return result


@dataclass
class UserSpeechProfile:
    """Long-term speech profile for a user."""

    user_id: str
    avg_wpm: float = 140.0  # Default average
    wpm_std_dev: float = 20.0  # Standard deviation
    avg_pause_ms: float = 300.0  # Average pause duration
    typical_thinking_pause_ms: float = 800.0  # When user is thinking
    samples_count: int = 0

    def update(self, snapshot: ProsodySnapshot) -> None:
        """Update profile with new speech sample."""
        if snapshot.word_count < 5:
            return  # Need minimum words for reliable stats

        # Exponential moving average
        alpha = 0.1 if self.samples_count > 10 else 0.3

        self.avg_wpm = (1 - alpha) * self.avg_wpm + alpha * snapshot.words_per_minute
        if snapshot.avg_pause_ms > 0:
            self.avg_pause_ms = (1 - alpha) * self.avg_pause_ms + alpha * snapshot.avg_pause_ms
        if snapshot.max_pause_ms > 500 and snapshot.thinking_pause_count > 0:
            self.typical_thinking_pause_ms = (
                1 - alpha
            ) * self.typical_thinking_pause_ms + alpha * snapshot.max_pause_ms

        self.samples_count += 1
        logger.debug(
            f"Updated speech profile for {self.user_id}: " f"WPM={self.avg_wpm:.0f}, pause={self.avg_pause_ms:.0f}ms"
        )


# ==============================================================================
# Prosody Analysis Engine
# ==============================================================================


class ProsodyAnalyzer:
    """
    Analyzes speech prosody from Deepgram word-level data.

    Usage:
        analyzer = ProsodyAnalyzer()

        # Feed word data from Deepgram
        for word_data in deepgram_words:
            analyzer.add_word(word_data)

        # Get analysis
        snapshot = analyzer.get_snapshot()
        print(f"Speech rate: {snapshot.words_per_minute} WPM")

        # Reset for next utterance
        analyzer.reset()
    """

    # Pause classification thresholds (ms)
    BREATH_PAUSE_MAX = 200
    WORD_BOUNDARY_MAX = 500
    THINKING_PAUSE_MAX = 1500

    # Speech rate thresholds (WPM)
    SLOW_WPM = 120
    FAST_WPM = 160

    def __init__(self, user_profile: Optional[UserSpeechProfile] = None):
        self._words: List[WordTiming] = []
        self._pauses: List[PauseInfo] = []
        self._user_profile = user_profile
        self._segment_start: Optional[float] = None
        self._segment_end: Optional[float] = None

    def add_word(self, word_data: Dict) -> None:
        """
        Add a word from Deepgram results.

        Args:
            word_data: Dict with 'word', 'start', 'end', 'confidence'
        """
        word = WordTiming(
            word=word_data.get("word", ""),
            start=word_data.get("start", 0.0),
            end=word_data.get("end", 0.0),
            confidence=word_data.get("confidence", 0.0),
        )

        # Track segment boundaries
        if self._segment_start is None:
            self._segment_start = word.start
        self._segment_end = word.end

        # Detect pause before this word
        if self._words:
            prev_word = self._words[-1]
            gap_ms = int((word.start - prev_word.end) * 1000)

            if gap_ms > 50:  # Ignore tiny gaps (< 50ms)
                pause_type = self._classify_pause(gap_ms)
                pause = PauseInfo(
                    start=prev_word.end,
                    end=word.start,
                    duration_ms=gap_ms,
                    pause_type=pause_type,
                    before_word=prev_word.word,
                    after_word=word.word,
                )
                self._pauses.append(pause)

        self._words.append(word)

    def _classify_pause(self, duration_ms: int) -> PauseType:
        """Classify pause type based on duration."""
        if duration_ms <= self.BREATH_PAUSE_MAX:
            return PauseType.BREATH
        elif duration_ms <= self.WORD_BOUNDARY_MAX:
            return PauseType.WORD_BOUNDARY
        elif duration_ms <= self.THINKING_PAUSE_MAX:
            return PauseType.THINKING
        else:
            return PauseType.TURN_YIELD

    def get_snapshot(self) -> ProsodySnapshot:
        """Get current prosody analysis snapshot."""
        if not self._words:
            return ProsodySnapshot()

        # Calculate speech rate
        duration_sec = (self._segment_end or 0) - (self._segment_start or 0)
        wpm = (len(self._words) / duration_sec * 60) if duration_sec > 0 else 0

        # Classify pace
        if wpm < self.SLOW_WPM:
            pace = SpeechPace.SLOW
        elif wpm > self.FAST_WPM:
            pace = SpeechPace.FAST
        else:
            pace = SpeechPace.NORMAL

        # Pause analysis
        pause_durations = [p.duration_ms for p in self._pauses]
        avg_pause = sum(pause_durations) / len(pause_durations) if pause_durations else 0
        max_pause = max(pause_durations) if pause_durations else 0
        thinking_pauses = sum(1 for p in self._pauses if p.pause_type == PauseType.THINKING)

        # Word analysis
        word_durations = [w.duration_ms for w in self._words]
        avg_word_duration = sum(word_durations) / len(word_durations) if word_durations else 0
        avg_confidence = sum(w.confidence for w in self._words) / len(self._words)

        # Turn-taking signals
        likely_finished = self._detect_turn_yield()
        hesitation_detected = self._detect_hesitation()

        # Phase 5: Advanced turn-taking prediction
        turn_prediction = self.predict_turn_taking()

        return ProsodySnapshot(
            words_per_minute=wpm,
            pace=pace,
            pause_count=len(self._pauses),
            avg_pause_ms=avg_pause,
            max_pause_ms=max_pause,
            thinking_pause_count=thinking_pauses,
            word_count=len(self._words),
            avg_word_duration_ms=avg_word_duration,
            avg_confidence=avg_confidence,
            likely_finished=likely_finished,
            hesitation_detected=hesitation_detected,
            turn_prediction=turn_prediction,
            segment_start=self._segment_start or 0,
            segment_end=self._segment_end or 0,
        )

    def _detect_turn_yield(self) -> bool:
        """Detect if user is likely finished speaking."""
        if not self._pauses:
            return False

        # Check if last pause is long (> 1.5s)
        last_pause = self._pauses[-1]
        if last_pause.pause_type == PauseType.TURN_YIELD:
            return True

        # Check for falling confidence at end (trailing off)
        if len(self._words) >= 3:
            last_three = self._words[-3:]
            if all(w.confidence < 0.8 for w in last_three):
                return True

        return False

    def _detect_hesitation(self) -> bool:
        """Detect if user seems hesitant or uncertain."""
        if len(self._words) < 3:
            return False

        # Multiple thinking pauses in short utterance
        if self._pauses:
            thinking_ratio = sum(1 for p in self._pauses if p.pause_type == PauseType.THINKING) / len(self._pauses)
            if thinking_ratio > 0.3:
                return True

        # Low average confidence
        avg_confidence = sum(w.confidence for w in self._words) / len(self._words)
        if avg_confidence < 0.7:
            return True

        return False

    # Phase 5: Continuation cue words that suggest user will continue
    CONTINUATION_CUES = {
        "and",
        "but",
        "so",
        "because",
        "however",
        "although",
        "if",
        "when",
        "or",
        "also",
        "then",
        "well",
        "like",
        "um",
        "uh",
        "hmm",
    }

    # Thinking aloud indicators
    THINKING_ALOUD_CUES = {
        "let me think",
        "i wonder",
        "maybe",
        "perhaps",
        "i guess",
        "i think",
        "hmm",
        "um",
        "uh",
        "wait",
        "hold on",
    }

    def predict_turn_taking(self) -> TurnTakingPrediction:
        """
        Phase 5: Predict user's turn-taking intent.

        Analyzes prosodic features to determine if user is:
        - CONTINUING: Actively speaking, don't interrupt
        - PAUSING: Thinking, may continue speaking
        - YIELDING: Finished, AI should respond
        - UNCERTAIN: Not enough data

        Returns:
            TurnTakingPrediction with state, confidence, and signals
        """
        if len(self._words) < 3:
            return TurnTakingPrediction(
                state=TurnTakingState.UNCERTAIN,
                confidence=0.0,
                recommended_wait_ms=500,
            )

        signals = {
            "falling_intonation": False,
            "trailing_off": False,
            "thinking_aloud": False,
            "continuation_cue": False,
        }
        confidence_factors = []

        # Check for continuation cues at end
        last_word = self._words[-1].word.lower().strip(".,!?")
        if last_word in self.CONTINUATION_CUES:
            signals["continuation_cue"] = True
            confidence_factors.append(("continuation_cue", 0.8))

        # Check for "thinking aloud" patterns
        recent_text = " ".join(w.word.lower() for w in self._words[-5:])
        for cue in self.THINKING_ALOUD_CUES:
            if cue in recent_text:
                signals["thinking_aloud"] = True
                confidence_factors.append(("thinking_aloud", 0.7))
                break

        # Check for trailing off (decreasing confidence)
        if len(self._words) >= 3:
            last_three = self._words[-3:]
            confidences = [w.confidence for w in last_three]
            if confidences[0] > confidences[1] > confidences[2] and confidences[2] < 0.7:
                signals["trailing_off"] = True
                confidence_factors.append(("trailing_off", 0.6))

        # Check for falling intonation (approximated by final word confidence)
        if self._words[-1].confidence > 0.85:
            signals["falling_intonation"] = True
            confidence_factors.append(("falling_intonation", 0.5))

        # Check pause patterns
        has_long_pause = any(p.pause_type == PauseType.TURN_YIELD for p in self._pauses)
        has_thinking_pause = (
            any(p.pause_type == PauseType.THINKING for p in self._pauses[-2:]) if self._pauses else False
        )

        # Determine state based on signals
        if signals["continuation_cue"]:
            state = TurnTakingState.CONTINUING
            base_confidence = 0.8
            wait_ms = 1500  # Wait longer, user likely to continue
        elif signals["thinking_aloud"]:
            state = TurnTakingState.PAUSING
            base_confidence = 0.7
            wait_ms = 2000  # User is processing, give them time
        elif has_long_pause:
            state = TurnTakingState.YIELDING
            base_confidence = 0.85
            wait_ms = 200  # User has paused long, likely done
        elif signals["trailing_off"] and not has_thinking_pause:
            state = TurnTakingState.YIELDING
            base_confidence = 0.6
            wait_ms = 400
        elif has_thinking_pause:
            state = TurnTakingState.PAUSING
            base_confidence = 0.6
            wait_ms = 1000  # User is thinking
        elif signals["falling_intonation"]:
            state = TurnTakingState.YIELDING
            base_confidence = 0.5
            wait_ms = 300
        else:
            state = TurnTakingState.UNCERTAIN
            base_confidence = 0.3
            wait_ms = 500

        # Adjust confidence based on accumulated signals
        final_confidence = min(1.0, base_confidence + 0.1 * len(confidence_factors))

        return TurnTakingPrediction(
            state=state,
            confidence=final_confidence,
            recommended_wait_ms=wait_ms,
            has_falling_intonation=signals["falling_intonation"],
            has_trailing_off=signals["trailing_off"],
            is_thinking_aloud=signals["thinking_aloud"],
            has_continuation_cue=signals["continuation_cue"],
        )

    def reset(self) -> None:
        """Reset analyzer for new utterance."""
        self._words.clear()
        self._pauses.clear()
        self._segment_start = None
        self._segment_end = None


# ==============================================================================
# Prosody Session Manager
# ==============================================================================


class ProsodySession:
    """
    Manages prosody analysis for a voice session.

    Tracks speech patterns over time and provides recommendations
    for response timing and turn-taking.
    """

    def __init__(
        self,
        session_id: str,
        user_profile: Optional[UserSpeechProfile] = None,
    ):
        self.session_id = session_id
        self._user_profile = user_profile or UserSpeechProfile(user_id="default")
        self._analyzer = ProsodyAnalyzer(user_profile)
        self._snapshots: List[ProsodySnapshot] = []
        self._active = False

    async def start(self) -> None:
        """Start the prosody session."""
        self._active = True
        logger.info(f"Prosody session started: {self.session_id}")

    async def stop(self) -> None:
        """Stop the session and finalize profile."""
        self._active = False

        # Update user profile with session data
        for snapshot in self._snapshots:
            self._user_profile.update(snapshot)

        logger.info(
            f"Prosody session stopped: {self.session_id}, "
            f"utterances={len(self._snapshots)}, "
            f"profile_wpm={self._user_profile.avg_wpm:.0f}"
        )

    def add_words(self, words: List[Dict]) -> None:
        """Add words from Deepgram transcript."""
        if not self._active:
            return

        for word in words:
            self._analyzer.add_word(word)

    def finalize_utterance(self) -> ProsodySnapshot:
        """
        Finalize current utterance and get analysis.

        Call this when speech ends (utterance complete).
        """
        snapshot = self._analyzer.get_snapshot()
        if snapshot.word_count > 0:
            self._snapshots.append(snapshot)

        self._analyzer.reset()
        return snapshot

    def get_current_analysis(self) -> ProsodySnapshot:
        """Get analysis of current (in-progress) utterance."""
        return self._analyzer.get_snapshot()

    def get_recommended_response_delay_ms(self) -> int:
        """
        Get recommended delay before starting AI response.

        Phase 5: Uses turn-taking prediction for adaptive timing.
        Based on user's speech profile, current analysis, and turn-taking signals.
        """
        current = self._analyzer.get_snapshot()

        # Phase 5: Use turn prediction if available
        if current.turn_prediction and current.word_count > 3:
            prediction = current.turn_prediction

            # High confidence prediction - use its recommended wait
            if prediction.confidence > 0.6:
                logger.debug(
                    f"Using turn prediction: state={prediction.state.value}, "
                    f"conf={prediction.confidence:.2f}, wait={prediction.recommended_wait_ms}ms"
                )
                return prediction.recommended_wait_ms

        # Fallback to pace-based delay
        base_delay = 200  # Minimum delay (ms)

        # Adjust based on user's typical pace
        pace_adjustment = {
            SpeechPace.SLOW: 400,  # Slow speakers appreciate more time
            SpeechPace.NORMAL: 200,
            SpeechPace.FAST: 100,  # Fast speakers expect quick responses
        }

        pace = current.pace if current.word_count > 5 else SpeechPace.NORMAL

        # If hesitation detected, add more delay
        hesitation_adjustment = 300 if current.hesitation_detected else 0

        return base_delay + pace_adjustment.get(pace, 200) + hesitation_adjustment

    def get_turn_prediction(self) -> TurnTakingPrediction:
        """
        Phase 5: Get current turn-taking prediction.

        Returns prediction of whether user is continuing, pausing, or yielding turn.
        """
        return self._analyzer.predict_turn_taking()

    def should_wait_for_continuation(self) -> bool:
        """
        Phase 5: Check if AI should wait for user to continue.

        Returns True if prediction indicates user is likely to continue speaking.
        """
        prediction = self.get_turn_prediction()
        return prediction.state in (TurnTakingState.CONTINUING, TurnTakingState.PAUSING) and prediction.confidence > 0.5

    def should_backchannel(self) -> bool:
        """
        Check if this is a good moment for a backchannel.

        Based on pause patterns and speech duration.
        """
        current = self._analyzer.get_snapshot()

        # Need minimum speech before backchanneling
        if current.word_count < 10:
            return False

        # Check for thinking pauses
        if current.thinking_pause_count > 0:
            return True

        # Long utterance without backchannel
        if current.word_count > 30:
            return True

        return False


# ==============================================================================
# Prosody Service
# ==============================================================================


class ProsodyService:
    """
    Factory service for creating prosody analysis sessions.

    Manages user profiles and session lifecycle.
    """

    def __init__(self):
        self._sessions: Dict[str, ProsodySession] = {}
        self._user_profiles: Dict[str, UserSpeechProfile] = {}

    async def create_session(
        self,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> ProsodySession:
        """
        Create a new prosody session.

        Args:
            session_id: Unique session identifier
            user_id: Optional user ID for profile loading

        Returns:
            ProsodySession instance
        """
        # Get or create user profile
        profile = None
        if user_id:
            if user_id not in self._user_profiles:
                self._user_profiles[user_id] = UserSpeechProfile(user_id=user_id)
            profile = self._user_profiles[user_id]

        session = ProsodySession(
            session_id=session_id,
            user_profile=profile,
        )

        self._sessions[session_id] = session
        await session.start()

        return session

    async def remove_session(self, session_id: str) -> None:
        """Remove and cleanup a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()

    def get_session(self, session_id: str) -> Optional[ProsodySession]:
        """Get an active session by ID."""
        return self._sessions.get(session_id)

    def get_user_profile(self, user_id: str) -> Optional[UserSpeechProfile]:
        """Get user's speech profile."""
        return self._user_profiles.get(user_id)


# Global service instance
prosody_service = ProsodyService()
