"""
Thinking Feedback Service - Audio cues during LLM processing

Voice Mode v4 - Phase 2 Integration

Provides configurable audio feedback during AI processing:
- Thinking tones (beeps, chimes) while LLM generates
- Progress indicators for long operations
- Completion sounds
- User-configurable tone styles and volumes

Integrates with VoiceEventBus to publish:
- thinking.started: When thinking feedback begins
- thinking.stopped: When thinking feedback ends
"""

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional

import numpy as np

if TYPE_CHECKING:
    from app.core.event_bus import VoiceEventBus

logger = logging.getLogger(__name__)


class ToneStyle(Enum):
    """Available thinking tone styles."""

    SUBTLE = "subtle"  # Soft, unobtrusive beeps
    MODERN = "modern"  # Contemporary digital tones
    CLASSIC = "classic"  # Traditional notification sounds
    MINIMAL = "minimal"  # Single subtle tone
    AMBIENT = "ambient"  # Gentle ambient sound
    SILENT = "silent"  # No audio feedback


class ToneType(Enum):
    """Types of feedback tones."""

    THINKING_START = "thinking_start"  # Processing started
    THINKING_LOOP = "thinking_loop"  # Ongoing processing
    THINKING_END = "thinking_end"  # Processing complete
    PROGRESS = "progress"  # Progress milestone
    ERROR = "error"  # Error occurred
    READY = "ready"  # Ready for input


@dataclass
class ToneConfig:
    """Configuration for a specific tone type."""

    frequency_hz: float = 440.0  # Base frequency
    duration_ms: int = 100  # Tone duration
    volume: float = 0.3  # 0.0 to 1.0
    fade_in_ms: int = 10  # Fade in duration
    fade_out_ms: int = 20  # Fade out duration
    harmonics: List[float] = field(default_factory=lambda: [1.0, 0.5, 0.25])
    waveform: str = "sine"  # sine, triangle, square


@dataclass
class ThinkingFeedbackConfig:
    """Configuration for thinking feedback service."""

    enabled: bool = True
    style: ToneStyle = ToneStyle.SUBTLE
    volume: float = 0.3  # Master volume 0.0 to 1.0

    # Timing
    loop_interval_ms: int = 1500  # Interval between thinking tones
    min_thinking_duration_ms: int = 500  # Min duration before playing tones

    # Sample rate
    sample_rate: int = 24000  # Match TTS output rate

    # Per-tone overrides (optional)
    tone_configs: Dict[ToneType, ToneConfig] = field(default_factory=dict)


# Predefined tone presets
TONE_PRESETS = {
    ToneStyle.SUBTLE: {
        ToneType.THINKING_START: ToneConfig(
            frequency_hz=880, duration_ms=80, volume=0.2, harmonics=[1.0, 0.3], fade_out_ms=30
        ),
        ToneType.THINKING_LOOP: ToneConfig(
            frequency_hz=660, duration_ms=60, volume=0.15, harmonics=[1.0, 0.2], fade_out_ms=25
        ),
        ToneType.THINKING_END: ToneConfig(
            frequency_hz=1046, duration_ms=120, volume=0.25, harmonics=[1.0, 0.4, 0.2], fade_out_ms=40
        ),
        ToneType.ERROR: ToneConfig(
            frequency_hz=220, duration_ms=200, volume=0.3, harmonics=[1.0, 0.5], waveform="triangle"
        ),
        ToneType.READY: ToneConfig(frequency_hz=523, duration_ms=100, volume=0.2, harmonics=[1.0, 0.3, 0.1]),
    },
    ToneStyle.MODERN: {
        ToneType.THINKING_START: ToneConfig(frequency_hz=1200, duration_ms=50, volume=0.25, harmonics=[1.0, 0.2]),
        ToneType.THINKING_LOOP: ToneConfig(frequency_hz=800, duration_ms=40, volume=0.18, harmonics=[1.0]),
        ToneType.THINKING_END: ToneConfig(frequency_hz=1400, duration_ms=80, volume=0.28, harmonics=[1.0, 0.3]),
        ToneType.ERROR: ToneConfig(frequency_hz=300, duration_ms=150, volume=0.35, waveform="square"),
        ToneType.READY: ToneConfig(frequency_hz=1000, duration_ms=60, volume=0.22),
    },
    ToneStyle.CLASSIC: {
        ToneType.THINKING_START: ToneConfig(frequency_hz=440, duration_ms=150, volume=0.3, harmonics=[1.0, 0.5, 0.25]),
        ToneType.THINKING_LOOP: ToneConfig(frequency_hz=392, duration_ms=100, volume=0.2, harmonics=[1.0, 0.4]),
        ToneType.THINKING_END: ToneConfig(frequency_hz=523, duration_ms=200, volume=0.35, harmonics=[1.0, 0.5, 0.3]),
        ToneType.ERROR: ToneConfig(frequency_hz=196, duration_ms=300, volume=0.4, harmonics=[1.0, 0.6]),
        ToneType.READY: ToneConfig(frequency_hz=440, duration_ms=120, volume=0.28),
    },
    ToneStyle.MINIMAL: {
        ToneType.THINKING_START: ToneConfig(frequency_hz=600, duration_ms=50, volume=0.15, harmonics=[1.0]),
        ToneType.THINKING_LOOP: ToneConfig(frequency_hz=600, duration_ms=30, volume=0.1, harmonics=[1.0]),
        ToneType.THINKING_END: ToneConfig(frequency_hz=700, duration_ms=60, volume=0.18, harmonics=[1.0]),
        ToneType.ERROR: ToneConfig(frequency_hz=250, duration_ms=100, volume=0.25, harmonics=[1.0]),
        ToneType.READY: ToneConfig(frequency_hz=550, duration_ms=40, volume=0.12),
    },
    ToneStyle.AMBIENT: {
        ToneType.THINKING_START: ToneConfig(
            frequency_hz=350,
            duration_ms=300,
            volume=0.12,
            harmonics=[1.0, 0.8, 0.6, 0.4],
            fade_in_ms=50,
            fade_out_ms=100,
        ),
        ToneType.THINKING_LOOP: ToneConfig(
            frequency_hz=280, duration_ms=400, volume=0.08, harmonics=[1.0, 0.7, 0.5], fade_in_ms=80, fade_out_ms=150
        ),
        ToneType.THINKING_END: ToneConfig(
            frequency_hz=420,
            duration_ms=350,
            volume=0.15,
            harmonics=[1.0, 0.6, 0.4, 0.2],
            fade_in_ms=50,
            fade_out_ms=120,
        ),
        ToneType.ERROR: ToneConfig(
            frequency_hz=180, duration_ms=400, volume=0.2, harmonics=[1.0, 0.8], fade_out_ms=150
        ),
        ToneType.READY: ToneConfig(frequency_hz=380, duration_ms=250, volume=0.1, fade_in_ms=40, fade_out_ms=80),
    },
}


class ThinkingFeedbackService:
    """
    Service for providing audio feedback during AI processing.

    Generates and manages thinking tones, progress indicators,
    and completion sounds.

    Publishes events via VoiceEventBus:
    - thinking.started: When a thinking loop begins for a session
    - thinking.stopped: When a thinking loop ends for a session
    """

    def __init__(
        self,
        config: Optional[ThinkingFeedbackConfig] = None,
        event_bus: Optional["VoiceEventBus"] = None,
    ):
        self.config = config or ThinkingFeedbackConfig()
        self._event_bus = event_bus
        self._tone_cache: Dict[str, bytes] = {}
        self._active_sessions: Dict[str, asyncio.Task] = {}
        self._initialized = False

        # Callbacks
        self._on_tone_generated: Optional[Callable[[ToneType, bytes], None]] = None

    def set_event_bus(self, event_bus: "VoiceEventBus") -> None:
        """Set the event bus for publishing thinking events."""
        self._event_bus = event_bus

    async def initialize(self) -> None:
        """Initialize the service and pre-generate common tones."""
        if self._initialized:
            return

        logger.info(
            "Initializing ThinkingFeedbackService",
            extra={
                "style": self.config.style.value,
                "enabled": self.config.enabled,
                "volume": self.config.volume,
            },
        )

        # Pre-generate tones for current style
        if self.config.enabled and self.config.style != ToneStyle.SILENT:
            await self._pregenerate_tones()

        self._initialized = True

    async def _pregenerate_tones(self) -> None:
        """Pre-generate all tones for the current style."""
        for tone_type in ToneType:
            cache_key = f"{self.config.style.value}:{tone_type.value}"
            if cache_key not in self._tone_cache:
                audio = await self.generate_tone(tone_type)
                self._tone_cache[cache_key] = audio

    def _get_tone_config(self, tone_type: ToneType) -> ToneConfig:
        """Get configuration for a specific tone type."""
        # Check for user override
        if tone_type in self.config.tone_configs:
            return self.config.tone_configs[tone_type]

        # Get from preset
        if self.config.style in TONE_PRESETS:
            preset = TONE_PRESETS[self.config.style]
            if tone_type in preset:
                return preset[tone_type]

        # Default fallback
        return ToneConfig()

    async def generate_tone(self, tone_type: ToneType) -> bytes:
        """
        Generate audio bytes for a specific tone type.

        Args:
            tone_type: Type of tone to generate

        Returns:
            PCM16 audio bytes
        """
        if self.config.style == ToneStyle.SILENT:
            return b""

        tone_config = self._get_tone_config(tone_type)

        # Apply master volume
        volume = tone_config.volume * self.config.volume

        # Generate samples
        num_samples = int(self.config.sample_rate * tone_config.duration_ms / 1000)
        t = np.linspace(0, tone_config.duration_ms / 1000, num_samples)

        # Generate waveform with harmonics
        signal = np.zeros(num_samples)
        for i, harmonic_vol in enumerate(tone_config.harmonics):
            freq = tone_config.frequency_hz * (i + 1)

            if tone_config.waveform == "sine":
                signal += harmonic_vol * np.sin(2 * np.pi * freq * t)
            elif tone_config.waveform == "triangle":
                signal += harmonic_vol * 2 * np.abs(2 * (freq * t % 1) - 1) - 1
            elif tone_config.waveform == "square":
                signal += harmonic_vol * np.sign(np.sin(2 * np.pi * freq * t))

        # Apply envelope (fade in/out)
        envelope = np.ones(num_samples)

        # Fade in
        fade_in_samples = int(self.config.sample_rate * tone_config.fade_in_ms / 1000)
        if fade_in_samples > 0:
            envelope[:fade_in_samples] = np.linspace(0, 1, fade_in_samples)

        # Fade out
        fade_out_samples = int(self.config.sample_rate * tone_config.fade_out_ms / 1000)
        if fade_out_samples > 0:
            envelope[-fade_out_samples:] = np.linspace(1, 0, fade_out_samples)

        signal *= envelope

        # Apply volume and convert to PCM16
        signal = signal * volume * 32767
        signal = np.clip(signal, -32768, 32767).astype(np.int16)

        return signal.tobytes()

    async def get_tone(self, tone_type: ToneType) -> bytes:
        """
        Get tone audio, using cache if available.

        Args:
            tone_type: Type of tone

        Returns:
            PCM16 audio bytes
        """
        if not self.config.enabled or self.config.style == ToneStyle.SILENT:
            return b""

        cache_key = f"{self.config.style.value}:{tone_type.value}"

        if cache_key not in self._tone_cache:
            audio = await self.generate_tone(tone_type)
            self._tone_cache[cache_key] = audio

        return self._tone_cache[cache_key]

    async def start_thinking_loop(self, session_id: str, on_tone: Callable[[bytes], None]) -> None:
        """
        Start a thinking tone loop for a session.

        Args:
            session_id: Unique session identifier
            on_tone: Callback to receive tone audio

        Publishes:
            thinking.started event via VoiceEventBus
        """
        if not self.config.enabled or self.config.style == ToneStyle.SILENT:
            return

        # Cancel existing loop for this session
        await self.stop_thinking_loop(session_id)

        # Publish thinking.started event
        if self._event_bus:
            await self._event_bus.publish_event(
                event_type="thinking.started",
                data={
                    "style": self.config.style.value,
                    "volume": self.config.volume,
                    "source": "backend",
                },
                session_id=session_id,
                source_engine="thinking_feedback",
                priority=5,
            )

        async def loop():
            # Play start tone
            start_tone = await self.get_tone(ToneType.THINKING_START)
            if start_tone:
                on_tone(start_tone)

            # Wait minimum duration
            await asyncio.sleep(self.config.min_thinking_duration_ms / 1000)

            # Loop with interval
            while True:
                loop_tone = await self.get_tone(ToneType.THINKING_LOOP)
                if loop_tone:
                    on_tone(loop_tone)
                await asyncio.sleep(self.config.loop_interval_ms / 1000)

        task = asyncio.create_task(loop())
        self._active_sessions[session_id] = task
        logger.debug(f"Started thinking loop for session {session_id}")

    async def stop_thinking_loop(
        self, session_id: str, play_end_tone: bool = True, on_tone: Optional[Callable[[bytes], None]] = None
    ) -> None:
        """
        Stop thinking tone loop for a session.

        Args:
            session_id: Session identifier
            play_end_tone: Whether to play completion tone
            on_tone: Callback for end tone

        Publishes:
            thinking.stopped event via VoiceEventBus
        """
        was_active = session_id in self._active_sessions

        if was_active:
            task = self._active_sessions[session_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            del self._active_sessions[session_id]
            logger.debug(f"Stopped thinking loop for session {session_id}")

        # Publish thinking.stopped event (only if loop was active)
        if was_active and self._event_bus:
            await self._event_bus.publish_event(
                event_type="thinking.stopped",
                data={
                    "source": "backend",
                    "play_end_tone": play_end_tone,
                },
                session_id=session_id,
                source_engine="thinking_feedback",
                priority=5,
            )

        # Play end tone
        if play_end_tone and on_tone and self.config.enabled:
            end_tone = await self.get_tone(ToneType.THINKING_END)
            if end_tone:
                on_tone(end_tone)

    async def play_error_tone(self, on_tone: Callable[[bytes], None]) -> None:
        """Play error feedback tone."""
        if not self.config.enabled:
            return

        error_tone = await self.get_tone(ToneType.ERROR)
        if error_tone:
            on_tone(error_tone)

    async def play_ready_tone(self, on_tone: Callable[[bytes], None]) -> None:
        """Play ready/listening feedback tone."""
        if not self.config.enabled:
            return

        ready_tone = await self.get_tone(ToneType.READY)
        if ready_tone:
            on_tone(ready_tone)

    def update_style(self, style: ToneStyle) -> None:
        """Update tone style (clears cache)."""
        self.config.style = style
        self._tone_cache.clear()

    def update_volume(self, volume: float) -> None:
        """Update master volume (clears cache)."""
        self.config.volume = max(0.0, min(1.0, volume))
        self._tone_cache.clear()

    def set_enabled(self, enabled: bool) -> None:
        """Enable or disable feedback tones."""
        self.config.enabled = enabled

    def get_available_styles(self) -> List[Dict[str, Any]]:
        """Get list of available tone styles with descriptions."""
        return [
            {"id": ToneStyle.SUBTLE.value, "name": "Subtle", "description": "Soft, unobtrusive beeps"},
            {"id": ToneStyle.MODERN.value, "name": "Modern", "description": "Contemporary digital tones"},
            {"id": ToneStyle.CLASSIC.value, "name": "Classic", "description": "Traditional notification sounds"},
            {"id": ToneStyle.MINIMAL.value, "name": "Minimal", "description": "Single subtle tone"},
            {"id": ToneStyle.AMBIENT.value, "name": "Ambient", "description": "Gentle ambient sounds"},
            {"id": ToneStyle.SILENT.value, "name": "Silent", "description": "No audio feedback"},
        ]

    async def cleanup(self) -> None:
        """Clean up all active sessions."""
        for session_id in list(self._active_sessions.keys()):
            await self.stop_thinking_loop(session_id, play_end_tone=False)


# Singleton instance
_thinking_feedback_service: Optional[ThinkingFeedbackService] = None


def get_thinking_feedback_service() -> ThinkingFeedbackService:
    """Get or create the singleton ThinkingFeedbackService instance."""
    global _thinking_feedback_service
    if _thinking_feedback_service is None:
        _thinking_feedback_service = ThinkingFeedbackService()
    return _thinking_feedback_service
