"""
Turn-Taking - Predictive Turn Completion Detection

Predicts when user has finished speaking using:
- Syntactic completion indicators
- Prosody signals (pitch, pauses, speech rate)
- Content analysis (terminal phrases)
- User-specific calibration

Emits prosody.turn_signal events for cross-engine coordination.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class TurnSignalType(Enum):
    """Types of turn signals"""

    WAIT = "wait"  # User is likely still speaking
    READY = "ready"  # User appears done, safe to respond
    UNCERTAIN = "uncertain"  # Low confidence, wait a bit more


@dataclass
class TurnSignals:
    """Signals indicating turn state"""

    completion_score: float = 0.0
    continuation_score: float = 0.0
    signals: List[str] = field(default_factory=list)


@dataclass
class TurnSignalResult:
    """Result of turn signal analysis for event publishing"""

    signal_type: TurnSignalType
    confidence: float
    should_respond: bool
    wait_ms: int  # Suggested wait time if uncertain
    signals: List[str] = field(default_factory=list)
    prosody_features: Dict[str, Any] = field(default_factory=dict)


@dataclass
class UserTurnCalibration:
    """Per-user turn-taking calibration"""

    user_id: str
    pause_threshold_ms: int = 700
    speech_rate_baseline: float = 150.0  # Words per minute
    pitch_drop_threshold: float = -20.0  # Hz
    total_turns: int = 0
    correct_predictions: int = 0
    last_updated: datetime = field(default_factory=datetime.utcnow)


class PredictiveTurnTakingEngine:
    """
    Predictive turn-taking engine with event publishing.

    Combines multiple signals to predict turn completion:
    - Syntactic: Terminal punctuation, complete sentences
    - Lexical: Completion phrases ("so", "anyway"), continuation ("and", "but")
    - Prosodic: Pitch fall, pause duration, speech rate changes
    - User calibration: Learned thresholds per user

    Publishes prosody.turn_signal events for cross-engine coordination.
    """

    # Syntactic completion indicators
    COMPLETION_PHRASES = [
        "so",
        "anyway",
        "that's it",
        "that's all",
        "you know",
        "right",
        "okay",
        "alright",
        "done",
        "finished",
    ]

    # Continuation indicators
    CONTINUATION_PHRASES = [
        "and",
        "but",
        "or",
        "also",
        "actually",
        "although",
        "however",
        "because",
        "since",
        "if",
        "when",
    ]

    # Hesitation markers (may indicate more coming)
    HESITATION_MARKERS = [
        "um",
        "uh",
        "er",
        "hmm",
        "like",
        "well",
    ]

    # Default prosody thresholds
    DEFAULT_PITCH_FALL_THRESHOLD = -20  # Hz change indicating finality
    DEFAULT_TURN_END_PAUSE_MS = 700  # Silence duration suggesting turn end
    DEFAULT_CONTINUATION_PAUSE_MS = 300  # Short pause, likely continuing
    UNCERTAIN_ZONE_MS = 200  # Wait time for uncertain signals

    # Confidence thresholds for signal types
    HIGH_CONFIDENCE_THRESHOLD = 0.75
    LOW_CONFIDENCE_THRESHOLD = 0.35

    def __init__(self, policy_config=None, event_bus=None):
        self.policy_config = policy_config
        self.event_bus = event_bus
        self._user_calibrations: Dict[str, UserTurnCalibration] = {}
        self._session_history: Dict[str, List[TurnSignalResult]] = {}
        logger.info("PredictiveTurnTakingEngine initialized")

    def _get_thresholds(self, user_id: Optional[str] = None) -> tuple:
        """Get thresholds, using user calibration if available"""
        if user_id and user_id in self._user_calibrations:
            cal = self._user_calibrations[user_id]
            return (
                cal.pause_threshold_ms,
                cal.pitch_drop_threshold,
                int(cal.pause_threshold_ms * 0.4),  # continuation threshold
            )
        # Use policy config if available
        if self.policy_config:
            turn_end = getattr(self.policy_config, "turn_end_pause_ms", self.DEFAULT_TURN_END_PAUSE_MS)
            return (turn_end, self.DEFAULT_PITCH_FALL_THRESHOLD, int(turn_end * 0.4))
        return (
            self.DEFAULT_TURN_END_PAUSE_MS,
            self.DEFAULT_PITCH_FALL_THRESHOLD,
            self.DEFAULT_CONTINUATION_PAUSE_MS,
        )

    async def check_completion(
        self,
        transcript: str,
        prosody_features: Optional[Dict] = None,
        silence_duration_ms: int = 0,
        user_id: Optional[str] = None,
    ) -> "TurnState":
        """
        Check if user has completed their turn.

        Returns TurnState with completion probability.
        """
        from . import TurnState

        turn_end_ms, pitch_threshold, continuation_ms = self._get_thresholds(user_id)
        signals = TurnSignals()

        # Analyze syntactic signals
        syntactic_signals = self._analyze_syntactic(transcript)
        signals.completion_score += syntactic_signals.completion_score * 0.3
        signals.continuation_score += syntactic_signals.continuation_score * 0.3
        signals.signals.extend(syntactic_signals.signals)

        # Analyze prosodic signals
        if prosody_features:
            prosodic_signals = self._analyze_prosodic(prosody_features, pitch_threshold)
            signals.completion_score += prosodic_signals.completion_score * 0.4
            signals.continuation_score += prosodic_signals.continuation_score * 0.4
            signals.signals.extend(prosodic_signals.signals)

        # Factor in silence duration
        silence_signals = self._analyze_silence(silence_duration_ms, turn_end_ms, continuation_ms)
        signals.completion_score += silence_signals.completion_score * 0.3
        signals.continuation_score += silence_signals.continuation_score * 0.3
        signals.signals.extend(silence_signals.signals)

        # Calculate final probability
        # Higher completion + lower continuation = more likely done
        turn_probability = signals.completion_score - (signals.continuation_score * 0.5)
        turn_probability = max(0.0, min(1.0, turn_probability))

        is_speaking = silence_duration_ms < continuation_ms

        return TurnState(
            is_user_speaking=is_speaking,
            turn_probability=turn_probability,
            completion_signals=[s for s in signals.signals if "complete" in s.lower()],
            continuation_signals=[s for s in signals.signals if "continue" in s.lower()],
            last_update=datetime.utcnow(),
        )

    async def analyze_turn_signal(
        self,
        transcript: str,
        prosody_features: Optional[Dict] = None,
        silence_duration_ms: int = 0,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> TurnSignalResult:
        """
        Analyze turn signals and publish prosody.turn_signal event.

        Enhanced version that returns TurnSignalResult and publishes events.
        """
        turn_end_ms, pitch_threshold, continuation_ms = self._get_thresholds(user_id)
        signals = TurnSignals()

        # Analyze syntactic signals
        syntactic_signals = self._analyze_syntactic(transcript)
        signals.completion_score += syntactic_signals.completion_score * 0.3
        signals.continuation_score += syntactic_signals.continuation_score * 0.3
        signals.signals.extend(syntactic_signals.signals)

        # Analyze prosodic signals
        prosody_data = {}
        if prosody_features:
            prosodic_signals = self._analyze_prosodic(prosody_features, pitch_threshold)
            signals.completion_score += prosodic_signals.completion_score * 0.4
            signals.continuation_score += prosodic_signals.continuation_score * 0.4
            signals.signals.extend(prosodic_signals.signals)
            prosody_data = prosody_features.copy()

        # Factor in silence duration
        silence_signals = self._analyze_silence(silence_duration_ms, turn_end_ms, continuation_ms)
        signals.completion_score += silence_signals.completion_score * 0.3
        signals.continuation_score += silence_signals.continuation_score * 0.3
        signals.signals.extend(silence_signals.signals)

        # Calculate confidence and determine signal type
        confidence = signals.completion_score - (signals.continuation_score * 0.5)
        confidence = max(0.0, min(1.0, confidence))

        if confidence >= self.HIGH_CONFIDENCE_THRESHOLD:
            signal_type = TurnSignalType.READY
            should_respond = True
            wait_ms = 0
        elif confidence <= self.LOW_CONFIDENCE_THRESHOLD:
            signal_type = TurnSignalType.WAIT
            should_respond = False
            wait_ms = 0
        else:
            signal_type = TurnSignalType.UNCERTAIN
            should_respond = False
            wait_ms = self.UNCERTAIN_ZONE_MS

        result = TurnSignalResult(
            signal_type=signal_type,
            confidence=confidence,
            should_respond=should_respond,
            wait_ms=wait_ms,
            signals=signals.signals,
            prosody_features=prosody_data,
        )

        # Store in session history
        if session_id:
            if session_id not in self._session_history:
                self._session_history[session_id] = []
            self._session_history[session_id].append(result)
            # Keep last 20 signals per session
            if len(self._session_history[session_id]) > 20:
                self._session_history[session_id].pop(0)

        # Publish prosody.turn_signal event
        if self.event_bus and session_id:
            await self.event_bus.publish_event(
                event_type="prosody.turn_signal",
                data={
                    "signal_type": signal_type.value,
                    "confidence": confidence,
                    "should_respond": should_respond,
                    "wait_ms": wait_ms,
                    "signals": signals.signals,
                    "prosody_features": prosody_data,
                    "silence_duration_ms": silence_duration_ms,
                },
                session_id=session_id,
                source_engine="conversation",
            )

        return result

    async def record_turn_outcome(
        self,
        session_id: str,
        user_id: str,
        was_correct: bool,
        actual_wait_ms: int,
    ) -> None:
        """
        Record outcome of turn prediction for calibration learning.

        Args:
            session_id: Session identifier
            user_id: User identifier
            was_correct: Whether the prediction was correct
            actual_wait_ms: How long user actually waited before speaking again
        """
        # Get or create user calibration
        if user_id not in self._user_calibrations:
            self._user_calibrations[user_id] = UserTurnCalibration(user_id=user_id)

        cal = self._user_calibrations[user_id]
        cal.total_turns += 1

        if was_correct:
            cal.correct_predictions += 1
        else:
            # Adjust pause threshold based on actual wait time
            # If user spoke again quickly, decrease threshold
            # If user waited longer, increase threshold
            learning_rate = 0.1
            cal.pause_threshold_ms = int(cal.pause_threshold_ms * (1 - learning_rate) + actual_wait_ms * learning_rate)
            # Clamp to reasonable bounds
            cal.pause_threshold_ms = max(400, min(1500, cal.pause_threshold_ms))

        cal.last_updated = datetime.utcnow()
        logger.debug(
            f"Updated turn calibration for {user_id}: "
            f"accuracy={cal.correct_predictions}/{cal.total_turns}, "
            f"pause_threshold={cal.pause_threshold_ms}ms"
        )

    def get_user_calibration(self, user_id: str) -> Optional[UserTurnCalibration]:
        """Get calibration data for a user"""
        return self._user_calibrations.get(user_id)

    def clear_session(self, session_id: str) -> None:
        """Clear session history"""
        self._session_history.pop(session_id, None)

    def _analyze_syntactic(self, transcript: str) -> TurnSignals:
        """Analyze syntactic completion signals"""
        signals = TurnSignals()
        text_lower = transcript.lower().strip()
        words = text_lower.split()

        if not words:
            return signals

        # Check for terminal punctuation
        if transcript.rstrip().endswith((".", "!", "?")):
            signals.completion_score += 0.4
            signals.signals.append("terminal_punctuation_complete")

        # Check for completion phrases at end
        last_words = " ".join(words[-3:]) if len(words) >= 3 else text_lower
        for phrase in self.COMPLETION_PHRASES:
            if last_words.endswith(phrase):
                signals.completion_score += 0.3
                signals.signals.append(f"completion_phrase_{phrase}")
                break

        # Check for continuation indicators
        if words[-1] in ["and", "but", "or"]:
            signals.continuation_score += 0.5
            signals.signals.append("trailing_conjunction_continue")

        if words[-1] == ",":
            signals.continuation_score += 0.3
            signals.signals.append("trailing_comma_continue")

        # Check for hesitation markers (could go either way)
        if words[-1] in self.HESITATION_MARKERS:
            signals.continuation_score += 0.2
            signals.signals.append("hesitation_marker")

        # Check for question (usually expects response, but turn is complete)
        if "?" in transcript:
            signals.completion_score += 0.5
            signals.signals.append("question_complete")

        return signals

    def _analyze_prosodic(
        self,
        prosody_features: Dict,
        pitch_threshold: float = -20,  # DEFAULT_PITCH_FALL_THRESHOLD
    ) -> TurnSignals:
        """Analyze prosodic completion signals"""
        signals = TurnSignals()

        # Check pitch contour (falling pitch = finality)
        pitch_change = prosody_features.get("final_pitch_change", 0)
        if pitch_change < pitch_threshold:
            signals.completion_score += 0.5
            signals.signals.append("falling_pitch_complete")
        elif pitch_change > 10:  # Rising pitch
            signals.continuation_score += 0.3
            signals.signals.append("rising_pitch_continue")

        # Check speech rate (slowing down = finishing)
        rate_change = prosody_features.get("speech_rate_change", 0)
        if rate_change < -0.2:  # Slowing down
            signals.completion_score += 0.3
            signals.signals.append("slowing_speech_complete")
        elif rate_change > 0.2:  # Speeding up
            signals.continuation_score += 0.2
            signals.signals.append("accelerating_speech_continue")

        # Check intensity/volume
        volume_change = prosody_features.get("volume_change", 0)
        if volume_change < -0.3:  # Getting quieter
            signals.completion_score += 0.2
            signals.signals.append("fading_volume_complete")

        return signals

    def _analyze_silence(
        self,
        silence_ms: int,
        turn_end_ms: int = 700,  # DEFAULT_TURN_END_PAUSE_MS
        continuation_ms: int = 300,  # DEFAULT_CONTINUATION_PAUSE_MS
    ) -> TurnSignals:
        """Analyze silence duration for turn signals"""
        signals = TurnSignals()

        if silence_ms >= turn_end_ms:
            signals.completion_score += 0.8
            signals.signals.append("long_pause_complete")
        elif silence_ms >= continuation_ms:
            signals.completion_score += 0.3
            signals.signals.append("medium_pause")
        else:
            signals.continuation_score += 0.4
            signals.signals.append("short_pause_continue")

        return signals


# Backwards compatibility alias
TurnTaking = PredictiveTurnTakingEngine


__all__ = [
    "PredictiveTurnTakingEngine",
    "TurnTaking",  # Alias for backwards compatibility
    "TurnSignals",
    "TurnSignalResult",
    "TurnSignalType",
    "UserTurnCalibration",
]
