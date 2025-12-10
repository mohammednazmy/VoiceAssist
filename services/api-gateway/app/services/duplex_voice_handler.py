"""
Duplex Voice Handler

Handles full-duplex voice communication where the AI can speak
while simultaneously listening for user interruptions.

Phase 4: Duplex Audio Architecture
Feature Flag: backend.voice_duplex_mode
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Types
# ==============================================================================


class DuplexState(str, Enum):
    """State of the duplex voice session."""

    IDLE = "idle"
    LISTENING = "listening"
    SPEAKING = "speaking"
    DUPLEX = "duplex"  # Both listening and speaking simultaneously


@dataclass
class DuplexConfig:
    """Configuration for duplex voice handling."""

    # Barge-in settings
    barge_in_enabled: bool = True
    barge_in_fade_ms: int = 50  # Fade duration when interrupted

    # Echo handling
    echo_suppression_window_ms: int = 200  # Ignore VAD for this long after playback

    # Response interruption
    allow_mid_sentence_interrupt: bool = True
    graceful_truncation: bool = True

    # Confidence thresholds
    min_barge_in_confidence: float = 0.7
    min_barge_in_duration_ms: int = 150


@dataclass
class BargeInResult:
    """Result of barge-in decision."""

    trigger_barge_in: bool
    fade_duration_ms: int = 0
    preserve_context: bool = False
    reason: str = ""


@dataclass
class TruncationResult:
    """Result of truncation analysis."""

    truncated_text: str
    remaining_text: str
    truncation_type: str  # 'sentence' | 'phrase' | 'word' | 'mid_word' | 'beginning'


@dataclass
class DuplexMetrics:
    """Metrics for duplex voice handling."""

    total_barge_ins: int = 0
    suppressed_barge_ins: int = 0
    echo_rejections: int = 0
    graceful_truncations: int = 0
    mid_word_truncations: int = 0
    avg_barge_in_latency_ms: float = 0

    @property
    def echo_rejection_rate(self) -> float:
        """Return the echo rejection rate."""
        total = self.total_barge_ins + self.echo_rejections
        if total == 0:
            return 0.0
        return self.echo_rejections / total


# ==============================================================================
# Duplex Voice Handler
# ==============================================================================


class DuplexVoiceHandler:
    """
    Handles full-duplex voice communication.

    Unlike half-duplex where we switch between listening and speaking,
    this handler allows simultaneous bidirectional audio:
    - AI can speak while listening for interruptions
    - User can interrupt at any moment
    - Echo cancellation prevents feedback loops

    Usage:
        from app.services.duplex_voice_handler import (
            duplex_voice_handler,
            DuplexConfig,
        )

        # When TTS starts
        duplex_voice_handler.start_speaking()

        # When user speech detected during playback
        result = duplex_voice_handler.handle_user_speech_detected(
            confidence=0.85,
            duration_ms=200,
        )
        if result.trigger_barge_in:
            # Stop TTS and process user input
            stop_tts(fade_ms=result.fade_duration_ms)

        # When TTS stops
        duplex_voice_handler.stop_speaking(was_interrupted=result.trigger_barge_in)
    """

    def __init__(self, config: Optional[DuplexConfig] = None):
        self.config = config or DuplexConfig()
        self._state = DuplexState.IDLE
        self._is_tts_active = False
        self._last_playback_end_time: float = 0
        self._pending_barge_in = False

        # Response tracking
        self._current_response_text: str = ""
        self._spoken_text: str = ""
        self._speech_start_time: float = 0

        # Metrics
        self._metrics = DuplexMetrics()
        self._barge_in_latencies: list[float] = []

    # ==========================================================================
    # State Properties
    # ==========================================================================

    @property
    def state(self) -> DuplexState:
        """Get current duplex state."""
        return self._state

    @property
    def is_speaking(self) -> bool:
        """Check if TTS is currently active."""
        return self._is_tts_active

    @property
    def is_listening(self) -> bool:
        """Check if we're in a listening state."""
        return self._state in (DuplexState.LISTENING, DuplexState.DUPLEX)

    @property
    def is_duplex(self) -> bool:
        """Check if in full duplex mode (both speaking and listening)."""
        return self._state == DuplexState.DUPLEX

    # ==========================================================================
    # Speaking Control
    # ==========================================================================

    def start_speaking(self, response_text: str = "") -> None:
        """
        Signal that TTS playback is starting.

        Args:
            response_text: The full response text being spoken
        """
        self._is_tts_active = True
        self._current_response_text = response_text
        self._spoken_text = ""
        self._speech_start_time = time.time()

        if self._state == DuplexState.LISTENING:
            self._state = DuplexState.DUPLEX
        else:
            self._state = DuplexState.SPEAKING

        logger.debug(f"[Duplex] Started speaking, state: {self._state}")

    def update_spoken_text(self, spoken_portion: str) -> None:
        """
        Update the portion of text that has been spoken.

        Args:
            spoken_portion: Text that has been spoken so far
        """
        self._spoken_text = spoken_portion

    def stop_speaking(self, was_interrupted: bool = False) -> None:
        """
        Signal that TTS playback has stopped.

        Args:
            was_interrupted: True if stopped due to user interruption
        """
        self._is_tts_active = False
        self._last_playback_end_time = time.time()

        if was_interrupted:
            logger.info(
                f"[Duplex] Speech interrupted after: '{self._spoken_text[:50]}...'"
            )
        else:
            logger.debug("[Duplex] Speech completed naturally")

        self._state = DuplexState.LISTENING

    # ==========================================================================
    # Listening Control
    # ==========================================================================

    def start_listening(self) -> None:
        """Signal that we're actively listening for user speech."""
        if self._is_tts_active:
            self._state = DuplexState.DUPLEX
        else:
            self._state = DuplexState.LISTENING

        logger.debug(f"[Duplex] Started listening, state: {self._state}")

    def stop_listening(self) -> None:
        """Signal that we've stopped listening."""
        if self._is_tts_active:
            self._state = DuplexState.SPEAKING
        else:
            self._state = DuplexState.IDLE

    # ==========================================================================
    # VAD Suppression
    # ==========================================================================

    def should_suppress_vad(self) -> bool:
        """
        Check if VAD should be suppressed due to recent playback.

        This prevents echo from triggering false barge-ins immediately
        after TTS stops.
        """
        if self._is_tts_active:
            return False  # During playback, VAD should work (with elevated threshold)

        # Suppress for a short window after playback ends
        time_since_playback = (time.time() - self._last_playback_end_time) * 1000
        return time_since_playback < self.config.echo_suppression_window_ms

    def get_vad_threshold(self) -> float:
        """
        Get the appropriate VAD threshold based on current state.

        Returns higher threshold during TTS playback to avoid echo triggering.
        """
        if self._is_tts_active:
            return self.config.min_barge_in_confidence
        return 0.5  # Normal threshold

    # ==========================================================================
    # Barge-In Handling
    # ==========================================================================

    def handle_user_speech_detected(
        self,
        confidence: float,
        duration_ms: int,
    ) -> BargeInResult:
        """
        Handle user speech detection during duplex mode.

        Args:
            confidence: VAD confidence (0-1)
            duration_ms: Duration of detected speech in ms

        Returns:
            BargeInResult with action details
        """
        # Check if we should suppress
        if self.should_suppress_vad():
            self._metrics.echo_rejections += 1
            logger.debug("[Duplex] VAD suppressed (echo window)")
            return BargeInResult(
                trigger_barge_in=False,
                reason="echo_suppression",
            )

        # During TTS playback - potential barge-in
        if self._is_tts_active and self.config.barge_in_enabled:
            # Require higher confidence during playback
            if (
                confidence >= self.config.min_barge_in_confidence
                and duration_ms >= self.config.min_barge_in_duration_ms
            ):
                # Calculate barge-in latency
                barge_in_latency = (time.time() - self._speech_start_time) * 1000
                self._barge_in_latencies.append(barge_in_latency)
                self._metrics.total_barge_ins += 1

                # Update average latency
                self._metrics.avg_barge_in_latency_ms = sum(
                    self._barge_in_latencies
                ) / len(self._barge_in_latencies)

                logger.info(
                    f"[Duplex] Barge-in triggered: conf={confidence:.2f}, "
                    f"dur={duration_ms}ms, latency={barge_in_latency:.0f}ms"
                )

                return BargeInResult(
                    trigger_barge_in=True,
                    fade_duration_ms=self.config.barge_in_fade_ms,
                    preserve_context=self.config.graceful_truncation,
                    reason="user_speech_during_playback",
                )
            else:
                self._metrics.suppressed_barge_ins += 1
                logger.debug(
                    f"[Duplex] Potential barge-in suppressed: "
                    f"conf={confidence:.2f}, dur={duration_ms}ms"
                )

        return BargeInResult(
            trigger_barge_in=False,
            reason="no_action_needed",
        )

    # ==========================================================================
    # Truncation Handling
    # ==========================================================================

    def get_truncation_point(
        self,
        full_response: str,
        spoken_portion: str,
    ) -> TruncationResult:
        """
        Calculate where to truncate response for graceful barge-in.

        Args:
            full_response: The full response text
            spoken_portion: What was spoken before interruption

        Returns:
            TruncationResult with truncation details
        """
        if not spoken_portion:
            return TruncationResult(
                truncated_text="",
                remaining_text=full_response,
                truncation_type="beginning",
            )

        spoken_len = len(spoken_portion)

        # Try to truncate at sentence boundary
        sentence_ends = [".", "!", "?"]
        for i in range(spoken_len - 1, max(0, spoken_len - 50), -1):
            if i < len(full_response) and full_response[i] in sentence_ends:
                self._metrics.graceful_truncations += 1
                return TruncationResult(
                    truncated_text=full_response[: i + 1],
                    remaining_text=full_response[i + 1 :],
                    truncation_type="sentence",
                )

        # Try phrase boundary (comma)
        for i in range(spoken_len - 1, max(0, spoken_len - 30), -1):
            if i < len(full_response) and full_response[i] == ",":
                self._metrics.graceful_truncations += 1
                return TruncationResult(
                    truncated_text=full_response[: i + 1],
                    remaining_text=full_response[i + 1 :],
                    truncation_type="phrase",
                )

        # Try word boundary
        for i in range(spoken_len - 1, max(0, spoken_len - 15), -1):
            if i < len(full_response) and full_response[i] == " ":
                self._metrics.graceful_truncations += 1
                return TruncationResult(
                    truncated_text=full_response[:i],
                    remaining_text=full_response[i:],
                    truncation_type="word",
                )

        # Last resort: mid-word truncation
        self._metrics.mid_word_truncations += 1
        return TruncationResult(
            truncated_text=full_response[:spoken_len],
            remaining_text=full_response[spoken_len:],
            truncation_type="mid_word",
        )

    # ==========================================================================
    # Context Management
    # ==========================================================================

    def get_interruption_context(self) -> dict:
        """
        Get context about the interrupted response for the next turn.

        Returns dict with:
        - was_interrupted: bool
        - spoken_portion: str
        - unspoken_portion: str
        - truncation_type: str
        """
        if not self._current_response_text:
            return {"was_interrupted": False}

        truncation = self.get_truncation_point(
            self._current_response_text,
            self._spoken_text,
        )

        return {
            "was_interrupted": True,
            "spoken_portion": truncation.truncated_text,
            "unspoken_portion": truncation.remaining_text,
            "truncation_type": truncation.truncation_type,
        }

    def generate_acknowledgment(self, truncation_type: str) -> str:
        """
        Generate an acknowledgment phrase based on how the response was truncated.

        Args:
            truncation_type: How the response was truncated

        Returns:
            Acknowledgment phrase to use
        """
        acknowledgments = {
            "sentence": "",  # Clean break, no acknowledgment needed
            "phrase": "Anyway, ",
            "word": "—",
            "mid_word": "—",
            "beginning": "",
        }
        return acknowledgments.get(truncation_type, "")

    # ==========================================================================
    # Metrics
    # ==========================================================================

    def get_metrics(self) -> DuplexMetrics:
        """Get duplex voice handling metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset metrics."""
        self._metrics = DuplexMetrics()
        self._barge_in_latencies = []

    # ==========================================================================
    # Reset
    # ==========================================================================

    def reset(self) -> None:
        """Reset handler state for a new session."""
        self._state = DuplexState.IDLE
        self._is_tts_active = False
        self._last_playback_end_time = 0
        self._pending_barge_in = False
        self._current_response_text = ""
        self._spoken_text = ""
        self._speech_start_time = 0


# ==============================================================================
# Factory and Singleton
# ==============================================================================


def create_duplex_voice_handler(
    config: Optional[DuplexConfig] = None,
) -> DuplexVoiceHandler:
    """Create a new duplex voice handler instance."""
    return DuplexVoiceHandler(config)


# Global singleton (created on first import)
duplex_voice_handler = DuplexVoiceHandler()


def get_duplex_voice_handler() -> DuplexVoiceHandler:
    """Get the global duplex voice handler instance."""
    return duplex_voice_handler
