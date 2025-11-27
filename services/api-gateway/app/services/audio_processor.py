"""
Audio Processing Service

Provides audio enhancement features for voice sessions:
- Echo cancellation
- Noise suppression
- Audio normalization
- Gain control

Uses DSP algorithms for real-time audio processing without external dependencies.
"""

import struct
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Deque, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class AudioFormat(Enum):
    """Supported audio formats"""

    PCM_16 = "pcm16"  # 16-bit PCM (default for WebRTC)
    PCM_32 = "pcm32"  # 32-bit PCM
    FLOAT_32 = "float32"  # 32-bit float


@dataclass
class AudioProcessorConfig:
    """Configuration for audio processing"""

    # Sample rate in Hz
    sample_rate: int = 16000

    # Number of channels (1 = mono, 2 = stereo)
    channels: int = 1

    # Audio format
    format: AudioFormat = AudioFormat.PCM_16

    # Echo cancellation settings
    echo_enabled: bool = True
    echo_filter_length: int = 256  # NLMS filter length in samples
    echo_step_size: float = 0.1  # NLMS adaptation step size
    echo_delay_samples: int = 160  # Expected echo delay (10ms at 16kHz)

    # Noise suppression settings
    noise_enabled: bool = True
    noise_threshold: float = 0.02  # Noise floor threshold (0-1)
    noise_reduction_db: float = 12.0  # Noise reduction in dB
    noise_smoothing: float = 0.95  # Smoothing factor for noise estimation

    # Automatic gain control settings
    agc_enabled: bool = True
    agc_target_level: float = 0.5  # Target RMS level (0-1)
    agc_max_gain_db: float = 20.0  # Maximum gain in dB
    agc_attack_time: float = 0.01  # Attack time in seconds
    agc_release_time: float = 0.1  # Release time in seconds

    # High-pass filter settings (removes DC offset and low-frequency noise)
    highpass_enabled: bool = True
    highpass_cutoff_hz: float = 80.0  # Cutoff frequency in Hz


@dataclass
class ProcessingState:
    """Internal state for audio processing"""

    # Echo cancellation state
    echo_filter: List[float] = field(default_factory=list)
    echo_buffer: Deque[float] = field(default_factory=deque)

    # Noise estimation state
    noise_estimate: float = 0.0
    noise_power_history: Deque[float] = field(default_factory=deque)

    # AGC state
    current_gain: float = 1.0
    rms_history: Deque[float] = field(default_factory=deque)

    # High-pass filter state
    highpass_z1: float = 0.0
    highpass_z2: float = 0.0

    # Statistics
    frames_processed: int = 0
    total_samples_processed: int = 0


class AudioProcessor:
    """
    Real-time audio processor with echo cancellation, noise suppression,
    and automatic gain control.

    This implementation uses lightweight DSP algorithms suitable for
    real-time processing on typical hardware.
    """

    def __init__(self, config: Optional[AudioProcessorConfig] = None):
        self.config = config or AudioProcessorConfig()
        self.state = ProcessingState()
        self._init_filters()

        logger.debug(
            "AudioProcessor initialized",
            extra={
                "sample_rate": self.config.sample_rate,
                "echo_enabled": self.config.echo_enabled,
                "noise_enabled": self.config.noise_enabled,
                "agc_enabled": self.config.agc_enabled,
            },
        )

    def _init_filters(self) -> None:
        """Initialize filter coefficients and state"""
        # Initialize echo cancellation filter (NLMS adaptive filter)
        self.state.echo_filter = [0.0] * self.config.echo_filter_length
        self.state.echo_buffer = deque(
            [0.0] * (self.config.echo_filter_length + self.config.echo_delay_samples),
            maxlen=self.config.echo_filter_length + self.config.echo_delay_samples,
        )

        # Initialize noise estimation buffer
        self.state.noise_power_history = deque(maxlen=50)

        # Initialize AGC history buffer
        self.state.rms_history = deque(maxlen=20)

        # Calculate high-pass filter coefficients (2nd order Butterworth)
        if self.config.highpass_enabled:
            self._calc_highpass_coeffs()

    def _calc_highpass_coeffs(self) -> None:
        """Calculate high-pass filter coefficients"""
        import math

        fc = self.config.highpass_cutoff_hz / self.config.sample_rate
        w0 = 2 * math.pi * fc
        alpha = math.sin(w0) / (2 * 0.707)  # Q = 0.707 for Butterworth

        b0 = (1 + math.cos(w0)) / 2
        b1 = -(1 + math.cos(w0))
        b2 = (1 + math.cos(w0)) / 2
        a0 = 1 + alpha
        a1 = -2 * math.cos(w0)
        a2 = 1 - alpha

        # Normalize coefficients
        self._hp_b = [b0 / a0, b1 / a0, b2 / a0]
        self._hp_a = [1.0, a1 / a0, a2 / a0]

    def reset(self) -> None:
        """Reset processing state for new session"""
        self.state = ProcessingState()
        self._init_filters()
        logger.debug("AudioProcessor state reset")

    def process_frame(
        self,
        input_audio: bytes,
        reference_audio: Optional[bytes] = None,
    ) -> bytes:
        """
        Process a single audio frame.

        Args:
            input_audio: Microphone input audio (PCM16)
            reference_audio: Speaker output audio for echo cancellation (PCM16)

        Returns:
            Processed audio frame (PCM16)
        """
        self.state.frames_processed += 1

        # Convert bytes to samples
        samples = self._bytes_to_samples(input_audio)
        self.state.total_samples_processed += len(samples)

        # Apply high-pass filter to remove DC offset
        if self.config.highpass_enabled:
            samples = self._apply_highpass(samples)

        # Apply echo cancellation if reference audio is provided
        if self.config.echo_enabled and reference_audio:
            reference_samples = self._bytes_to_samples(reference_audio)
            samples = self._apply_echo_cancellation(samples, reference_samples)

        # Apply noise suppression
        if self.config.noise_enabled:
            samples = self._apply_noise_suppression(samples)

        # Apply automatic gain control
        if self.config.agc_enabled:
            samples = self._apply_agc(samples)

        # Convert samples back to bytes
        return self._samples_to_bytes(samples)

    def _bytes_to_samples(self, audio_bytes: bytes) -> List[float]:
        """Convert PCM16 bytes to normalized float samples (-1.0 to 1.0)"""
        n_samples = len(audio_bytes) // 2
        samples = struct.unpack(f"<{n_samples}h", audio_bytes)
        return [s / 32768.0 for s in samples]

    def _samples_to_bytes(self, samples: List[float]) -> bytes:
        """Convert normalized float samples to PCM16 bytes"""
        # Clip to valid range
        clipped = [max(-1.0, min(1.0, s)) for s in samples]
        # Convert to 16-bit integers
        int_samples = [int(s * 32767) for s in clipped]
        return struct.pack(f"<{len(int_samples)}h", *int_samples)

    def _apply_highpass(self, samples: List[float]) -> List[float]:
        """Apply high-pass filter to remove DC offset and low frequencies"""
        output = []
        z1, z2 = self.state.highpass_z1, self.state.highpass_z2

        for sample in samples:
            # Direct Form II transposed
            y = self._hp_b[0] * sample + z1
            z1 = self._hp_b[1] * sample - self._hp_a[1] * y + z2
            z2 = self._hp_b[2] * sample - self._hp_a[2] * y
            output.append(y)

        self.state.highpass_z1 = z1
        self.state.highpass_z2 = z2
        return output

    def _apply_echo_cancellation(self, input_samples: List[float], reference_samples: List[float]) -> List[float]:
        """
        Apply NLMS (Normalized Least Mean Squares) echo cancellation.

        This removes the acoustic echo of the speaker output from the
        microphone input.
        """
        output = []

        for i, (inp, ref) in enumerate(zip(input_samples, reference_samples)):
            # Add reference sample to buffer (with delay)
            self.state.echo_buffer.append(ref)

            # Get reference buffer as list for filter convolution
            ref_buffer = list(self.state.echo_buffer)[-self.config.echo_filter_length :]

            # Compute estimated echo (convolution with filter)
            estimated_echo = sum(f * r for f, r in zip(self.state.echo_filter, ref_buffer))

            # Error signal (echo-cancelled output)
            error = inp - estimated_echo
            output.append(error)

            # Compute normalization factor to prevent divergence
            ref_power = sum(r * r for r in ref_buffer) + 1e-8

            # Update filter coefficients (NLMS adaptation)
            step = self.config.echo_step_size / ref_power
            for j in range(len(self.state.echo_filter)):
                self.state.echo_filter[j] += step * error * ref_buffer[j]

        return output

    def _apply_noise_suppression(self, samples: List[float]) -> List[float]:
        """
        Apply spectral subtraction-based noise suppression.

        Uses a simple time-domain approach suitable for real-time processing.
        """
        # Calculate frame power
        frame_power = sum(s * s for s in samples) / len(samples) if samples else 0.0
        self.state.noise_power_history.append(frame_power)

        # Estimate noise floor (minimum power over recent history)
        if len(self.state.noise_power_history) > 0:
            min_power = min(self.state.noise_power_history)
            # Smooth the noise estimate
            self.state.noise_estimate = (
                self.config.noise_smoothing * self.state.noise_estimate + (1 - self.config.noise_smoothing) * min_power
            )

        # Calculate noise reduction gain
        # If signal power is close to noise floor, reduce gain
        if frame_power > 0:
            snr = (frame_power - self.state.noise_estimate) / (frame_power + 1e-10)
            snr = max(0.0, min(1.0, snr))

            # Apply soft knee compression for smooth transition
            noise_db = self.config.noise_reduction_db
            gain = snr + (1 - snr) * (10 ** (-noise_db / 20))
        else:
            gain = 1.0

        # Apply gain to samples
        return [s * gain for s in samples]

    def _apply_agc(self, samples: List[float]) -> List[float]:
        """
        Apply automatic gain control to normalize audio level.

        Uses a simple envelope follower with attack/release dynamics.
        """
        if not samples:
            return samples

        # Calculate RMS level of frame
        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
        self.state.rms_history.append(rms)

        # Get average RMS over recent history
        avg_rms = sum(self.state.rms_history) / len(self.state.rms_history)

        if avg_rms > 1e-6:  # Avoid division by zero
            # Calculate desired gain
            desired_gain = self.config.agc_target_level / avg_rms

            # Limit maximum gain
            max_gain = 10 ** (self.config.agc_max_gain_db / 20)
            desired_gain = min(desired_gain, max_gain)

            # Apply attack/release dynamics
            if desired_gain < self.state.current_gain:
                # Attack (gain decreasing - fast response to prevent clipping)
                alpha = 1.0 - (0.5 ** (len(samples) / (self.config.sample_rate * self.config.agc_attack_time)))
            else:
                # Release (gain increasing - slow response)
                alpha = 1.0 - (0.5 ** (len(samples) / (self.config.sample_rate * self.config.agc_release_time)))

            self.state.current_gain = alpha * desired_gain + (1 - alpha) * self.state.current_gain

        # Apply gain
        return [s * self.state.current_gain for s in samples]

    def get_stats(self) -> dict:
        """Get processing statistics"""
        return {
            "frames_processed": self.state.frames_processed,
            "total_samples_processed": self.state.total_samples_processed,
            "current_gain_db": (
                20 * (self.state.current_gain + 1e-10).__log10__() if hasattr(float, "__log10__") else 0
            ),
            "noise_estimate": self.state.noise_estimate,
            "echo_filter_energy": sum(f * f for f in self.state.echo_filter),
        }


class EchoCanceller:
    """
    Standalone echo cancellation processor.

    For use when only echo cancellation is needed without full audio processing.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        filter_length: int = 256,
        delay_samples: int = 160,
    ):
        config = AudioProcessorConfig(
            sample_rate=sample_rate,
            echo_enabled=True,
            echo_filter_length=filter_length,
            echo_delay_samples=delay_samples,
            noise_enabled=False,
            agc_enabled=False,
            highpass_enabled=True,
        )
        self._processor = AudioProcessor(config)

    def process(self, mic_audio: bytes, speaker_audio: bytes) -> bytes:
        """
        Process microphone audio to remove speaker echo.

        Args:
            mic_audio: Microphone input (PCM16)
            speaker_audio: Speaker output playing at same time (PCM16)

        Returns:
            Echo-cancelled audio (PCM16)
        """
        return self._processor.process_frame(mic_audio, speaker_audio)

    def reset(self) -> None:
        """Reset echo canceller state"""
        self._processor.reset()


class NoiseSuppressor:
    """
    Standalone noise suppression processor.

    For use when only noise suppression is needed.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        noise_reduction_db: float = 12.0,
        threshold: float = 0.02,
    ):
        config = AudioProcessorConfig(
            sample_rate=sample_rate,
            echo_enabled=False,
            noise_enabled=True,
            noise_reduction_db=noise_reduction_db,
            noise_threshold=threshold,
            agc_enabled=False,
            highpass_enabled=True,
        )
        self._processor = AudioProcessor(config)

    def process(self, audio: bytes) -> bytes:
        """
        Process audio to suppress background noise.

        Args:
            audio: Input audio (PCM16)

        Returns:
            Noise-suppressed audio (PCM16)
        """
        return self._processor.process_frame(audio)

    def reset(self) -> None:
        """Reset noise suppressor state"""
        self._processor.reset()


class StreamingAudioProcessor:
    """
    Streaming audio processor for WebSocket voice sessions.

    Provides an async-friendly interface for real-time audio processing
    with automatic buffering and frame alignment.
    """

    def __init__(self, config: Optional[AudioProcessorConfig] = None):
        self.processor = AudioProcessor(config)
        self._input_buffer: bytes = b""
        self._reference_buffer: bytes = b""
        self._frame_size = 320  # 20ms at 16kHz (320 samples * 2 bytes)

    async def process_chunk(
        self,
        input_chunk: bytes,
        reference_chunk: Optional[bytes] = None,
    ) -> bytes:
        """
        Process an audio chunk asynchronously.

        Handles buffering and frame alignment for streaming audio.

        Args:
            input_chunk: Microphone input chunk
            reference_chunk: Speaker reference chunk (for echo cancellation)

        Returns:
            Processed audio chunk
        """
        self._input_buffer += input_chunk
        if reference_chunk:
            self._reference_buffer += reference_chunk

        output = b""

        # Process complete frames
        while len(self._input_buffer) >= self._frame_size:
            input_frame = self._input_buffer[: self._frame_size]
            self._input_buffer = self._input_buffer[self._frame_size :]

            # Get corresponding reference frame if available
            reference_frame = None
            if len(self._reference_buffer) >= self._frame_size:
                reference_frame = self._reference_buffer[: self._frame_size]
                self._reference_buffer = self._reference_buffer[self._frame_size :]

            # Process frame
            processed = self.processor.process_frame(input_frame, reference_frame)
            output += processed

        return output

    def reset(self) -> None:
        """Reset processor state"""
        self.processor.reset()
        self._input_buffer = b""
        self._reference_buffer = b""

    def get_stats(self) -> dict:
        """Get processing statistics"""
        stats = self.processor.get_stats()
        stats["input_buffer_size"] = len(self._input_buffer)
        stats["reference_buffer_size"] = len(self._reference_buffer)
        return stats
