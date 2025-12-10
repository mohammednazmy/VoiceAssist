"""
Pre-emptive STT Service

Implements pre-emptive speech-to-text that keeps listening even while
the AI is speaking, enabling instant barge-in with zero connection latency.

Key features:
- Continuous STT session (no restart on barge-in)
- Echo cancellation to filter TTS playback
- Energy-based noise gate during AI speech
- Latency tracking for barge-in events

Phase: v4.2.0 Barge-in Improvements
"""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Awaitable, Callable, List, Optional

from app.core.logging import get_logger
from app.services.streaming_stt_service import (
    DeepgramStreamingSession,
    StreamingSTTService,
    STTSessionConfig,
    streaming_stt_service,
)

logger = get_logger(__name__)


# ==============================================================================
# Types and Configuration
# ==============================================================================


class PreemptiveMode(str, Enum):
    """Mode of the pre-emptive STT session."""

    ACTIVE = "active"  # Normal listening (user's turn)
    PREEMPTIVE = "preemptive"  # Listening during AI speech
    PAUSED = "paused"  # Temporarily paused
    STOPPED = "stopped"  # Session stopped


@dataclass
class PreemptiveConfig:
    """Configuration for pre-emptive STT."""

    # Energy threshold for detecting speech during AI playback
    # Higher = more aggressive filtering (fewer false positives)
    # Lower = more sensitive (might pick up TTS echo)
    energy_threshold_db: float = -35.0

    # Minimum duration (ms) of speech to trigger barge-in during AI speech
    # Helps filter brief noise bursts
    min_speech_duration_ms: int = 150

    # Cool-down after AI stops speaking before switching to active mode
    # Allows TTS echo to settle
    echo_settle_ms: int = 300

    # Maximum latency target for barge-in detection (ms)
    target_barge_in_latency_ms: int = 200

    # Whether to use energy-based noise gate during preemptive mode
    use_noise_gate: bool = True

    # Confidence threshold for preemptive barge-in
    preemptive_confidence_threshold: float = 0.70


@dataclass
class BargeInMetrics:
    """Metrics for barge-in performance."""

    # Latency from speech start to barge-in trigger
    detection_latency_ms: float = 0.0

    # Time from barge-in trigger to TTS stop
    cancel_latency_ms: float = 0.0

    # Total end-to-end latency
    total_latency_ms: float = 0.0

    # Whether this was a true barge-in (during AI speech)
    was_preemptive: bool = False

    # Transcript that triggered the barge-in
    trigger_transcript: str = ""

    # Confidence of the transcript
    confidence: float = 0.0

    # Timestamp
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class PreemptiveState:
    """State of the pre-emptive STT session."""

    mode: PreemptiveMode = PreemptiveMode.STOPPED

    # When AI started speaking (for echo cancellation timing)
    ai_speech_started_at: Optional[float] = None

    # When AI stopped speaking
    ai_speech_stopped_at: Optional[float] = None

    # Accumulated transcript during preemptive mode
    preemptive_transcript: str = ""

    # Speech detection state
    speech_detected_at: Optional[float] = None
    speech_duration_ms: float = 0.0

    # Energy tracking for noise gate
    recent_energy_db: List[float] = field(default_factory=list)

    # Barge-in metrics history
    barge_in_history: List[BargeInMetrics] = field(default_factory=list)


# ==============================================================================
# Pre-emptive STT Session
# ==============================================================================


class PreemptiveSTTSession:
    """
    Pre-emptive STT session that maintains continuous listening.

    Unlike standard STT which restarts on barge-in, this session:
    1. Stays connected to Deepgram continuously
    2. Applies noise gating during AI speech to filter echo
    3. Triggers barge-in without connection delay
    4. Tracks detailed latency metrics
    """

    def __init__(
        self,
        session_id: str,
        stt_service: StreamingSTTService,
        config: PreemptiveConfig,
        stt_config: STTSessionConfig,
        on_partial: Callable[[str, float], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
        on_endpoint: Callable[[], Awaitable[None]],
        on_barge_in: Callable[[BargeInMetrics], Awaitable[None]],
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_words: Optional[Callable[[list], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self._stt_service = stt_service
        self.config = config
        self.stt_config = stt_config

        # External callbacks
        self._on_partial = on_partial
        self._on_final = on_final
        self._on_endpoint = on_endpoint
        self._on_barge_in = on_barge_in
        self._on_speech_start = on_speech_start
        self._on_words = on_words

        # Internal session
        self._deepgram_session: Optional[DeepgramStreamingSession] = None

        # State
        self._state = PreemptiveState()
        self._lock = asyncio.Lock()

        # For latency tracking
        self._barge_in_pending_metrics: Optional[BargeInMetrics] = None

        logger.info(
            f"PreemptiveSTTSession created: {session_id}",
            extra={
                "energy_threshold_db": config.energy_threshold_db,
                "min_speech_duration_ms": config.min_speech_duration_ms,
            },
        )

    @property
    def mode(self) -> PreemptiveMode:
        """Get current mode."""
        return self._state.mode

    @property
    def state(self) -> PreemptiveState:
        """Get current state (read-only copy)."""
        return PreemptiveState(
            mode=self._state.mode,
            ai_speech_started_at=self._state.ai_speech_started_at,
            ai_speech_stopped_at=self._state.ai_speech_stopped_at,
            preemptive_transcript=self._state.preemptive_transcript,
            speech_detected_at=self._state.speech_detected_at,
            speech_duration_ms=self._state.speech_duration_ms,
            recent_energy_db=list(self._state.recent_energy_db),
            barge_in_history=list(self._state.barge_in_history),
        )

    async def start(self) -> bool:
        """Start the pre-emptive STT session."""
        async with self._lock:
            if self._state.mode != PreemptiveMode.STOPPED:
                logger.warning(f"Session already started: {self.session_id}")
                return False

            # Create and start Deepgram session
            self._deepgram_session = await self._stt_service.create_session(
                on_partial=self._handle_partial,
                on_final=self._handle_final,
                on_endpoint=self._handle_endpoint,
                on_speech_start=self._handle_speech_start,
                on_words=self._on_words,
                config=self.stt_config,
            )

            if not await self._deepgram_session.start():
                logger.error(f"Failed to start Deepgram session: {self.session_id}")
                return False

            self._state.mode = PreemptiveMode.ACTIVE
            logger.info(f"PreemptiveSTTSession started: {self.session_id}")
            return True

    async def stop(self) -> str:
        """Stop the session and return final transcript."""
        async with self._lock:
            self._state.mode = PreemptiveMode.STOPPED

            if self._deepgram_session:
                transcript = await self._deepgram_session.stop()
                self._deepgram_session = None
                return transcript

            return ""

    async def send_audio(self, audio_data: bytes) -> None:
        """
        Send audio data to the STT session.

        In preemptive mode, applies noise gating to filter TTS echo.
        """
        if self._state.mode in (PreemptiveMode.STOPPED, PreemptiveMode.PAUSED):
            return

        if not self._deepgram_session:
            return

        # In preemptive mode, apply noise gate
        if self._state.mode == PreemptiveMode.PREEMPTIVE and self.config.use_noise_gate:
            # Calculate audio energy
            energy_db = self._calculate_energy_db(audio_data)
            self._track_energy(energy_db)

            # Only send if above threshold
            if energy_db < self.config.energy_threshold_db:
                return

        await self._deepgram_session.send_audio(audio_data)

    def notify_ai_speaking_started(self) -> None:
        """Notify that AI has started speaking. Switch to preemptive mode."""
        self._state.mode = PreemptiveMode.PREEMPTIVE
        self._state.ai_speech_started_at = time.time()
        self._state.ai_speech_stopped_at = None
        self._state.preemptive_transcript = ""
        self._state.speech_detected_at = None
        self._state.speech_duration_ms = 0.0

        logger.debug("[PreemptiveSTT] AI speaking started, mode=PREEMPTIVE")

    def notify_ai_speaking_stopped(self) -> None:
        """Notify that AI has stopped speaking."""
        self._state.ai_speech_stopped_at = time.time()

        # Schedule transition to active mode after echo settle time
        asyncio.create_task(self._transition_to_active_after_settle())

        logger.debug("[PreemptiveSTT] AI speaking stopped, waiting for echo settle")

    async def _transition_to_active_after_settle(self) -> None:
        """Transition to active mode after echo settle time."""
        await asyncio.sleep(self.config.echo_settle_ms / 1000.0)

        # Only transition if still in preemptive mode
        if self._state.mode == PreemptiveMode.PREEMPTIVE:
            self._state.mode = PreemptiveMode.ACTIVE
            logger.debug("[PreemptiveSTT] Transitioned to ACTIVE mode")

    def complete_barge_in(self) -> Optional[BargeInMetrics]:
        """
        Complete a pending barge-in and return metrics.

        Called when TTS has been cancelled.
        """
        if self._barge_in_pending_metrics:
            metrics = self._barge_in_pending_metrics
            metrics.cancel_latency_ms = (time.time() * 1000) - (
                metrics.timestamp.timestamp() * 1000 + metrics.detection_latency_ms
            )
            metrics.total_latency_ms = metrics.detection_latency_ms + metrics.cancel_latency_ms

            self._state.barge_in_history.append(metrics)
            self._barge_in_pending_metrics = None

            logger.info(
                f"[PreemptiveSTT] Barge-in completed: "
                f"detection={metrics.detection_latency_ms:.0f}ms, "
                f"cancel={metrics.cancel_latency_ms:.0f}ms, "
                f"total={metrics.total_latency_ms:.0f}ms"
            )

            return metrics

        return None

    def get_barge_in_statistics(self) -> dict:
        """Get barge-in statistics."""
        history = self._state.barge_in_history

        if not history:
            return {
                "count": 0,
                "avg_detection_latency_ms": 0.0,
                "avg_total_latency_ms": 0.0,
                "preemptive_count": 0,
                "target_met_count": 0,
            }

        preemptive = [m for m in history if m.was_preemptive]
        target_met = [m for m in history if m.total_latency_ms <= self.config.target_barge_in_latency_ms]

        return {
            "count": len(history),
            "avg_detection_latency_ms": sum(m.detection_latency_ms for m in history) / len(history),
            "avg_total_latency_ms": sum(m.total_latency_ms for m in history) / len(history),
            "preemptive_count": len(preemptive),
            "target_met_count": len(target_met),
            "target_met_percentage": (len(target_met) / len(history)) * 100 if history else 0,
        }

    # ==========================================================================
    # Internal Handlers
    # ==========================================================================

    async def _handle_partial(self, text: str, confidence: float) -> None:
        """Handle partial transcript from Deepgram."""
        if self._state.mode == PreemptiveMode.PREEMPTIVE:
            # Track transcript accumulation
            self._state.preemptive_transcript = text

            # Check if this should trigger barge-in
            if self._should_trigger_barge_in(text, confidence):
                await self._trigger_barge_in(text, confidence)
            else:
                # Still emit partial for UI feedback (optional)
                await self._on_partial(text, confidence)
        else:
            # Active mode - forward directly
            await self._on_partial(text, confidence)

    async def _handle_final(self, text: str) -> None:
        """Handle final transcript from Deepgram."""
        await self._on_final(text)

    async def _handle_endpoint(self) -> None:
        """Handle speech endpoint from Deepgram."""
        await self._on_endpoint()

    async def _handle_speech_start(self) -> None:
        """Handle speech start detection from Deepgram."""
        now = time.time()

        if self._state.mode == PreemptiveMode.PREEMPTIVE:
            # Track when speech was first detected during AI playback
            if self._state.speech_detected_at is None:
                self._state.speech_detected_at = now
                logger.debug("[PreemptiveSTT] Speech detected during AI playback")

        if self._on_speech_start:
            await self._on_speech_start()

    def _should_trigger_barge_in(self, text: str, confidence: float) -> bool:
        """Determine if the transcript should trigger barge-in."""
        # Must be in preemptive mode
        if self._state.mode != PreemptiveMode.PREEMPTIVE:
            return False

        # Check confidence threshold
        if confidence < self.config.preemptive_confidence_threshold:
            return False

        # Check if we have enough speech duration
        if self._state.speech_detected_at:
            duration_ms = (time.time() - self._state.speech_detected_at) * 1000
            if duration_ms < self.config.min_speech_duration_ms:
                return False
            self._state.speech_duration_ms = duration_ms

        # Check if transcript is substantial (not just noise)
        text_stripped = text.strip().lower()

        # Filter noise patterns
        noise_patterns = {"um", "uh", "hmm", "mm", "ah", "oh", "er", "huh"}
        if text_stripped in noise_patterns:
            return False

        # Need at least 2 characters
        if len(text_stripped) < 2:
            return False

        return True

    async def _trigger_barge_in(self, text: str, confidence: float) -> None:
        """Trigger barge-in and record metrics."""
        now = time.time()

        # Calculate detection latency
        detection_latency_ms = 0.0
        if self._state.speech_detected_at:
            detection_latency_ms = (now - self._state.speech_detected_at) * 1000

        # Create metrics
        metrics = BargeInMetrics(
            detection_latency_ms=detection_latency_ms,
            was_preemptive=True,
            trigger_transcript=text,
            confidence=confidence,
            timestamp=datetime.now(timezone.utc),
        )

        self._barge_in_pending_metrics = metrics

        logger.info(
            f"[PreemptiveSTT] Barge-in triggered: '{text}' "
            f"(conf={confidence:.2f}, latency={detection_latency_ms:.0f}ms)"
        )

        # Notify callback
        await self._on_barge_in(metrics)

    def _calculate_energy_db(self, audio_data: bytes) -> float:
        """Calculate energy level of audio in dB."""
        import math
        import struct

        # Parse as 16-bit PCM
        try:
            samples = struct.unpack(f"<{len(audio_data) // 2}h", audio_data)
            if not samples:
                return -100.0

            # Calculate RMS
            rms = (sum(s * s for s in samples) / len(samples)) ** 0.5

            # Convert to dB (reference: max 16-bit value)
            if rms < 1:
                return -100.0

            db = 20 * math.log10(rms / 32768.0) if rms > 0 else -100.0
            return max(-100.0, min(0.0, db))
        except Exception:
            return -100.0

    def _track_energy(self, energy_db: float) -> None:
        """Track recent energy levels for adaptive thresholding."""
        self._state.recent_energy_db.append(energy_db)

        # Keep last 50 samples (~1 second at 20ms chunks)
        if len(self._state.recent_energy_db) > 50:
            self._state.recent_energy_db.pop(0)


# ==============================================================================
# Pre-emptive STT Service
# ==============================================================================


class PreemptiveSTTService:
    """
    Factory service for creating pre-emptive STT sessions.

    Usage:
        service = PreemptiveSTTService()

        session = await service.create_session(
            session_id="voice-123",
            on_partial=handle_partial,
            on_final=handle_final,
            on_endpoint=handle_endpoint,
            on_barge_in=handle_barge_in,
        )

        await session.start()

        # During AI speech:
        session.notify_ai_speaking_started()
        await session.send_audio(audio_chunk)

        # User interrupts -> on_barge_in is called with metrics

        session.notify_ai_speaking_stopped()
    """

    def __init__(self, stt_service: Optional[StreamingSTTService] = None):
        self._stt_service = stt_service or streaming_stt_service
        self._sessions: dict[str, PreemptiveSTTSession] = {}

        logger.info("PreemptiveSTTService initialized")

    def is_available(self) -> bool:
        """Check if pre-emptive STT is available."""
        return self._stt_service.is_streaming_available()

    async def create_session(
        self,
        session_id: str,
        on_partial: Callable[[str, float], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
        on_endpoint: Callable[[], Awaitable[None]],
        on_barge_in: Callable[[BargeInMetrics], Awaitable[None]],
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_words: Optional[Callable[[list], Awaitable[None]]] = None,
        config: Optional[PreemptiveConfig] = None,
        stt_config: Optional[STTSessionConfig] = None,
    ) -> PreemptiveSTTSession:
        """
        Create a new pre-emptive STT session.

        Args:
            session_id: Unique session identifier
            on_partial: Callback for partial transcripts
            on_final: Callback for final transcripts
            on_endpoint: Callback for speech endpoints
            on_barge_in: Callback when barge-in is detected
            on_speech_start: Optional callback for speech start
            on_words: Optional callback for word-level data
            config: Pre-emptive configuration
            stt_config: STT configuration

        Returns:
            PreemptiveSTTSession instance
        """
        session = PreemptiveSTTSession(
            session_id=session_id,
            stt_service=self._stt_service,
            config=config or PreemptiveConfig(),
            stt_config=stt_config or STTSessionConfig(),
            on_partial=on_partial,
            on_final=on_final,
            on_endpoint=on_endpoint,
            on_barge_in=on_barge_in,
            on_speech_start=on_speech_start,
            on_words=on_words,
        )

        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[PreemptiveSTTSession]:
        """Get an existing session by ID."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Remove and stop a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()

    def get_all_statistics(self) -> dict:
        """Get statistics for all sessions."""
        return {session_id: session.get_barge_in_statistics() for session_id, session in self._sessions.items()}


# Global service instance
preemptive_stt_service = PreemptiveSTTService()
