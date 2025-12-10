"""
Voice Activity Detection (VAD) Service

Provides both server-side and client-side VAD support for voice sessions.
Uses WebRTC VAD algorithm for reliable speech detection.

Features:
- Energy-based speech detection
- Frame-by-frame processing
- Configurable sensitivity thresholds
- Speech state tracking with debouncing
"""

import struct
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class SpeechState(Enum):
    """Current speech detection state"""

    SILENCE = "silence"
    SPEECH_START = "speech_start"
    SPEAKING = "speaking"
    SPEECH_END = "speech_end"


@dataclass
class VADConfig:
    """Configuration for Voice Activity Detection"""

    # Sensitivity threshold (0.0-1.0)
    # Lower = more sensitive (picks up quieter sounds)
    # Higher = less sensitive (requires louder sounds)
    threshold: float = 0.5

    # Sample rate in Hz (default: 16000 for WebRTC VAD)
    sample_rate: int = 16000

    # Frame duration in milliseconds (WebRTC VAD supports 10, 20, 30ms)
    frame_duration_ms: int = 30

    # Number of consecutive speech frames to trigger speech start
    speech_start_frames: int = 3

    # Number of consecutive silence frames to trigger speech end
    silence_end_frames: int = 10

    # Prefix padding in milliseconds (audio to keep before speech start)
    prefix_padding_ms: int = 300

    # Suffix padding in milliseconds (audio to keep after speech end)
    suffix_padding_ms: int = 500

    # Minimum speech duration in milliseconds
    min_speech_duration_ms: int = 200

    # Maximum speech duration in milliseconds (0 = unlimited)
    max_speech_duration_ms: int = 60000


@dataclass
class VADState:
    """Internal state for VAD processing"""

    current_state: SpeechState = SpeechState.SILENCE
    speech_frame_count: int = 0
    silence_frame_count: int = 0
    speech_start_time_ms: int = 0
    speech_duration_ms: int = 0
    total_frames_processed: int = 0
    # Buffer for prefix padding
    prefix_buffer: List[bytes] = field(default_factory=list)
    # Maximum prefix buffer frames
    max_prefix_frames: int = 10


class VoiceActivityDetector:
    """
    Voice Activity Detector using energy-based detection.

    This implementation uses signal energy analysis to detect speech.
    It provides a simpler, dependency-free alternative to WebRTC VAD
    while maintaining good accuracy for typical voice applications.
    """

    def __init__(self, config: Optional[VADConfig] = None):
        self.config = config or VADConfig()
        self.state = VADState()

        # Calculate frame size in samples
        self.frame_size = int(self.config.sample_rate * self.config.frame_duration_ms / 1000)

        # Calculate max prefix frames based on prefix padding
        self.state.max_prefix_frames = int(self.config.prefix_padding_ms / self.config.frame_duration_ms)

        # Energy threshold calibration
        # These values are tuned for typical speech characteristics
        self._energy_floor = 1e-10  # Minimum energy to avoid log(0)
        self._speech_energy_ratio = 3.0  # Speech should be 3x silence energy

        # Running noise estimate for adaptive thresholding
        self._noise_energy = 0.0
        self._noise_alpha = 0.1  # Noise estimation smoothing factor

        logger.debug(
            "VAD initialized",
            extra={
                "sample_rate": self.config.sample_rate,
                "frame_duration_ms": self.config.frame_duration_ms,
                "frame_size": self.frame_size,
                "threshold": self.config.threshold,
            },
        )

    def reset(self) -> None:
        """Reset VAD state for new session"""
        self.state = VADState()
        self.state.max_prefix_frames = int(self.config.prefix_padding_ms / self.config.frame_duration_ms)
        self._noise_energy = 0.0
        logger.debug("VAD state reset")

    def set_threshold(self, threshold: float) -> None:
        """Update sensitivity threshold (0.0-1.0)"""
        self.config.threshold = max(0.0, min(1.0, threshold))
        logger.debug(f"VAD threshold updated to {self.config.threshold}")

    def _calculate_frame_energy(self, frame: bytes) -> float:
        """Calculate normalized energy of an audio frame"""
        try:
            # Convert bytes to 16-bit PCM samples
            n_samples = len(frame) // 2
            if n_samples == 0:
                return 0.0

            samples = struct.unpack(f"<{n_samples}h", frame)

            # Calculate RMS energy
            sum_squares = sum(s * s for s in samples)
            rms = (sum_squares / n_samples) ** 0.5

            # Normalize to 0-1 range (16-bit audio max is 32767)
            normalized_energy = rms / 32767.0

            return max(normalized_energy, self._energy_floor)

        except Exception as e:
            logger.warning(f"Error calculating frame energy: {e}")
            return 0.0

    def _is_speech_frame(self, energy: float) -> bool:
        """
        Determine if frame contains speech based on energy.

        Uses adaptive thresholding with noise estimation.
        """
        # Update noise estimate during silence
        if self.state.current_state == SpeechState.SILENCE:
            self._noise_energy = self._noise_alpha * energy + (1 - self._noise_alpha) * self._noise_energy

        # Calculate speech threshold based on noise floor
        # Higher config threshold = requires more energy above noise
        speech_threshold = self._noise_energy * (1 + self._speech_energy_ratio * (1 - self.config.threshold))

        # Minimum absolute threshold to avoid false positives
        min_threshold = 0.01 * (1 - self.config.threshold)
        speech_threshold = max(speech_threshold, min_threshold)

        return energy > speech_threshold

    def process_frame(
        self,
        frame: bytes,
        on_speech_start: Optional[Callable[[], None]] = None,
        on_speech_end: Optional[Callable[[int], None]] = None,
    ) -> SpeechState:
        """
        Process a single audio frame and update VAD state.

        Args:
            frame: Raw PCM audio frame (16-bit, mono)
            on_speech_start: Callback when speech starts
            on_speech_end: Callback when speech ends (receives duration in ms)

        Returns:
            Current SpeechState after processing
        """
        self.state.total_frames_processed += 1
        frame_time_ms = self.state.total_frames_processed * self.config.frame_duration_ms

        # Calculate frame energy
        energy = self._calculate_frame_energy(frame)
        is_speech = self._is_speech_frame(energy)

        # State machine for speech detection
        # previous_state preserved for potential future logging/debugging

        if is_speech:
            self.state.silence_frame_count = 0
            self.state.speech_frame_count += 1

            if self.state.current_state == SpeechState.SILENCE:
                # Potential speech start
                if self.state.speech_frame_count >= self.config.speech_start_frames:
                    self.state.current_state = SpeechState.SPEECH_START
                    self.state.speech_start_time_ms = frame_time_ms - self.config.prefix_padding_ms
                    if on_speech_start:
                        on_speech_start()

            elif self.state.current_state == SpeechState.SPEECH_START:
                self.state.current_state = SpeechState.SPEAKING

            elif self.state.current_state == SpeechState.SPEECH_END:
                # Speech resumed before timeout
                self.state.current_state = SpeechState.SPEAKING

        else:
            self.state.speech_frame_count = 0
            self.state.silence_frame_count += 1

            if self.state.current_state in (
                SpeechState.SPEAKING,
                SpeechState.SPEECH_START,
            ):
                if self.state.silence_frame_count >= self.config.silence_end_frames:
                    self.state.current_state = SpeechState.SPEECH_END
                    self.state.speech_duration_ms = frame_time_ms - self.state.speech_start_time_ms

                    if on_speech_end:
                        on_speech_end(self.state.speech_duration_ms)

                    # Reset to silence after emitting speech_end
                    self.state.current_state = SpeechState.SILENCE
                    self.state.speech_start_time_ms = 0

        # Manage prefix buffer
        if self.state.current_state == SpeechState.SILENCE:
            self.state.prefix_buffer.append(frame)
            if len(self.state.prefix_buffer) > self.state.max_prefix_frames:
                self.state.prefix_buffer.pop(0)

        return self.state.current_state

    def process_audio(
        self,
        audio_data: bytes,
        on_speech_start: Optional[Callable[[], None]] = None,
        on_speech_end: Optional[Callable[[int], None]] = None,
    ) -> List[SpeechState]:
        """
        Process a chunk of audio data (multiple frames).

        Args:
            audio_data: Raw PCM audio data (16-bit, mono)
            on_speech_start: Callback when speech starts
            on_speech_end: Callback when speech ends

        Returns:
            List of SpeechState for each frame
        """
        states = []
        frame_bytes = self.frame_size * 2  # 16-bit = 2 bytes per sample

        for i in range(0, len(audio_data), frame_bytes):
            frame = audio_data[i : i + frame_bytes]
            if len(frame) == frame_bytes:
                state = self.process_frame(frame, on_speech_start, on_speech_end)
                states.append(state)

        return states

    def get_prefix_audio(self) -> bytes:
        """Get buffered prefix audio for speech segment"""
        return b"".join(self.state.prefix_buffer)

    def is_speaking(self) -> bool:
        """Check if currently detecting speech"""
        return self.state.current_state in (
            SpeechState.SPEECH_START,
            SpeechState.SPEAKING,
        )

    def get_stats(self) -> dict:
        """Get VAD statistics"""
        return {
            "current_state": self.state.current_state.value,
            "total_frames": self.state.total_frames_processed,
            "speech_duration_ms": self.state.speech_duration_ms,
            "noise_energy": self._noise_energy,
            "threshold": self.config.threshold,
        }


class StreamingVAD:
    """
    Streaming VAD wrapper for WebSocket voice sessions.

    Provides async-friendly interface for real-time audio processing
    with speech event callbacks.
    """

    def __init__(self, config: Optional[VADConfig] = None):
        self.vad = VoiceActivityDetector(config)
        self._speech_callbacks: List[Callable[[], None]] = []
        self._end_callbacks: List[Callable[[int], None]] = []
        self._audio_buffer: bytes = b""

    def on_speech_start(self, callback: Callable[[], None]) -> None:
        """Register callback for speech start events"""
        self._speech_callbacks.append(callback)

    def on_speech_end(self, callback: Callable[[int], None]) -> None:
        """Register callback for speech end events"""
        self._end_callbacks.append(callback)

    def _emit_speech_start(self) -> None:
        """Emit speech start event to all listeners"""
        for callback in self._speech_callbacks:
            try:
                callback()
            except Exception as e:
                logger.error(f"Speech start callback error: {e}")

    def _emit_speech_end(self, duration_ms: int) -> None:
        """Emit speech end event to all listeners"""
        for callback in self._end_callbacks:
            try:
                callback(duration_ms)
            except Exception as e:
                logger.error(f"Speech end callback error: {e}")

    async def process_chunk(self, audio_chunk: bytes) -> SpeechState:
        """
        Process an audio chunk asynchronously.

        Args:
            audio_chunk: Raw PCM audio data

        Returns:
            Current SpeechState
        """
        # Append to buffer
        self._audio_buffer += audio_chunk

        # Process complete frames
        frame_bytes = self.vad.frame_size * 2
        current_state = self.vad.state.current_state

        while len(self._audio_buffer) >= frame_bytes:
            frame = self._audio_buffer[:frame_bytes]
            self._audio_buffer = self._audio_buffer[frame_bytes:]

            current_state = self.vad.process_frame(
                frame,
                on_speech_start=self._emit_speech_start,
                on_speech_end=self._emit_speech_end,
            )

        return current_state

    def reset(self) -> None:
        """Reset VAD state"""
        self.vad.reset()
        self._audio_buffer = b""

    def get_prefix_audio(self) -> bytes:
        """Get prefix audio buffer"""
        return self.vad.get_prefix_audio()

    def is_speaking(self) -> bool:
        """Check if currently speaking"""
        return self.vad.is_speaking()
