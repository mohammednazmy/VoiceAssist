"""
Audio Processing Service - AEC, AGC, and Noise Suppression

Voice Mode v4 - Phase 1 Foundation

Provides unified audio preprocessing for the voice pipeline:
- Acoustic Echo Cancellation (AEC)
- Automatic Gain Control (AGC)
- Noise Suppression (NS)

Uses WebRTC Audio Processing or RNNoise for noise suppression,
with browser-side processing where available.
"""

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


class ProcessingMode(Enum):
    """Audio processing mode selection."""

    BROWSER = "browser"  # Client-side WebRTC processing
    SERVER = "server"  # Server-side processing
    ADAPTIVE = "adaptive"  # Choose based on client capabilities
    DISABLED = "disabled"  # No processing


class NoiseSuppressionModel(Enum):
    """Noise suppression model options."""

    WEBRTC = "webrtc"  # WebRTC noise suppression
    RNNOISE = "rnnoise"  # RNNoise deep learning model
    SPECTRAL = "spectral"  # Simple spectral subtraction
    NONE = "none"


@dataclass
class AudioProcessingConfig:
    """Configuration for audio processing pipeline."""

    # Noise suppression
    noise_suppression_enabled: bool = True
    noise_suppression_model: NoiseSuppressionModel = NoiseSuppressionModel.SPECTRAL
    ns_aggressiveness: int = 2  # 0-3, higher = more aggressive
    ns_threshold_db: float = -40.0  # SNR threshold for activation

    # Echo cancellation
    echo_cancellation_enabled: bool = True
    aec_tail_length_ms: int = 128  # Echo tail length
    aec_nlp_enabled: bool = True  # Non-linear processing

    # Automatic gain control
    automatic_gain_control_enabled: bool = True
    agc_target_level_dbfs: float = -18.0  # Target output level
    agc_compression_gain_db: float = 9.0  # Max compression
    agc_limiter_enabled: bool = True

    # Processing mode
    processing_mode: ProcessingMode = ProcessingMode.ADAPTIVE

    # Sample rates
    input_sample_rate: int = 16000
    output_sample_rate: int = 16000

    # Frame configuration
    frame_duration_ms: int = 20  # 20ms frames

    # Quality settings
    enable_high_pass_filter: bool = True
    high_pass_cutoff_hz: float = 80.0  # Remove sub-bass rumble


@dataclass
class AudioContext:
    """Context for audio processing (playback state, etc.)."""

    playback_buffer: Optional[bytes] = None
    playback_active: bool = False
    noise_profile: Optional[np.ndarray] = None
    gain_history: List[float] = field(default_factory=list)
    last_speech_time: Optional[datetime] = None


@dataclass
class ProcessingMetrics:
    """Metrics for audio processing performance."""

    frames_processed: int = 0
    noise_frames_detected: int = 0
    echo_cancelled_frames: int = 0
    gain_adjusted_frames: int = 0
    processing_time_ms_avg: float = 0.0
    snr_estimate_db: float = 0.0


class AudioProcessingService:
    """
    Unified audio preprocessing service for voice pipeline.

    Handles AEC, AGC, and noise suppression with configurable modes.
    """

    def __init__(self, config: Optional[AudioProcessingConfig] = None):
        self.config = config or AudioProcessingConfig()
        self._initialized = False
        self._metrics = ProcessingMetrics()

        # Processing components (lazy-loaded)
        self._noise_profile: Optional[np.ndarray] = None
        self._noise_floor_db: float = -60.0
        self._gain_smoothing: float = 0.95
        self._current_gain: float = 1.0

        # High-pass filter state
        self._hp_state: float = 0.0

        # Callbacks
        self._on_metrics_update: Optional[Callable[[ProcessingMetrics], None]] = None

    async def initialize(self) -> None:
        """Initialize audio processing components."""
        if self._initialized:
            return

        logger.info(
            "Initializing AudioProcessingService",
            extra={
                "mode": self.config.processing_mode.value,
                "ns_enabled": self.config.noise_suppression_enabled,
                "aec_enabled": self.config.echo_cancellation_enabled,
                "agc_enabled": self.config.automatic_gain_control_enabled,
            },
        )

        # Pre-compute filter coefficients
        self._compute_filter_coefficients()

        self._initialized = True

    def _compute_filter_coefficients(self) -> None:
        """Pre-compute filter coefficients for efficiency."""
        # High-pass filter coefficient (simple first-order)
        rc = 1.0 / (2.0 * math.pi * self.config.high_pass_cutoff_hz)
        dt = 1.0 / self.config.input_sample_rate
        self._hp_alpha = rc / (rc + dt)

    async def process_frame(self, audio_frame: bytes, context: Optional[AudioContext] = None) -> bytes:
        """
        Process a single audio frame through the pipeline.

        Order: High-pass -> AEC -> AGC -> NS

        Args:
            audio_frame: Raw PCM16 audio bytes
            context: Optional context with playback state

        Returns:
            Processed PCM16 audio bytes
        """
        if not self._initialized:
            await self.initialize()

        start_time = datetime.now(timezone.utc)
        context = context or AudioContext()

        # Convert to numpy array
        samples = self._bytes_to_samples(audio_frame)

        # 1. High-pass filter (remove DC offset and rumble)
        if self.config.enable_high_pass_filter:
            samples = self._apply_high_pass_filter(samples)

        # 2. Echo cancellation
        if self.config.echo_cancellation_enabled and context.playback_active:
            samples = await self._apply_echo_cancellation(samples, context)

        # 3. Automatic gain control
        if self.config.automatic_gain_control_enabled:
            samples = self._apply_agc(samples)

        # 4. Noise suppression
        if self.config.noise_suppression_enabled:
            snr = self._estimate_snr(samples)
            if snr < self.config.ns_threshold_db:
                samples = self._apply_noise_suppression(samples)
                self._metrics.noise_frames_detected += 1

        # Update metrics
        self._metrics.frames_processed += 1
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        self._metrics.processing_time_ms_avg = self._metrics.processing_time_ms_avg * 0.95 + elapsed_ms * 0.05

        return self._samples_to_bytes(samples)

    def _bytes_to_samples(self, audio_bytes: bytes) -> np.ndarray:
        """Convert PCM16 bytes to float samples."""
        samples = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        return samples / 32768.0  # Normalize to [-1, 1]

    def _samples_to_bytes(self, samples: np.ndarray) -> bytes:
        """Convert float samples back to PCM16 bytes."""
        # Clip and convert
        clipped = np.clip(samples * 32768.0, -32768, 32767)
        return clipped.astype(np.int16).tobytes()

    def _apply_high_pass_filter(self, samples: np.ndarray) -> np.ndarray:
        """Apply first-order high-pass filter."""
        filtered = np.zeros_like(samples)
        prev_input = 0.0
        prev_output = self._hp_state

        for i, sample in enumerate(samples):
            filtered[i] = self._hp_alpha * (prev_output + sample - prev_input)
            prev_input = sample
            prev_output = filtered[i]

        self._hp_state = prev_output
        return filtered

    async def _apply_echo_cancellation(self, samples: np.ndarray, context: AudioContext) -> np.ndarray:
        """
        Apply acoustic echo cancellation.

        Simple cross-correlation based AEC for speaker playback removal.
        """
        if not context.playback_buffer:
            return samples

        # Convert playback to samples
        playback = self._bytes_to_samples(context.playback_buffer)

        if len(playback) < len(samples):
            return samples

        # Compute cross-correlation to find echo delay
        correlation = np.correlate(samples, playback[: len(samples)], mode="same")
        delay_idx = np.argmax(np.abs(correlation))

        # Estimate echo coefficient
        echo_coef = correlation[delay_idx] / (np.sum(playback[: len(samples)] ** 2) + 1e-10)
        echo_coef = np.clip(echo_coef, -1.0, 1.0)

        # Subtract estimated echo
        if abs(echo_coef) > 0.1:  # Only if significant echo detected
            echo_estimate = echo_coef * playback[: len(samples)]
            samples = samples - echo_estimate
            self._metrics.echo_cancelled_frames += 1

        return samples

    def _apply_agc(self, samples: np.ndarray) -> np.ndarray:
        """
        Apply automatic gain control.

        Maintains consistent output level with smooth gain transitions.
        """
        # Compute RMS energy
        rms = np.sqrt(np.mean(samples**2) + 1e-10)
        # rms_db useful for debugging: 20 * math.log10(rms + 1e-10)

        # Target level
        target_rms = 10 ** (self.config.agc_target_level_dbfs / 20)

        # Compute desired gain
        desired_gain = target_rms / (rms + 1e-10)

        # Apply compression limit
        max_gain = 10 ** (self.config.agc_compression_gain_db / 20)
        desired_gain = min(desired_gain, max_gain)

        # Smooth gain transition
        self._current_gain = self._gain_smoothing * self._current_gain + (1 - self._gain_smoothing) * desired_gain

        # Apply gain
        output = samples * self._current_gain

        # Apply limiter
        if self.config.agc_limiter_enabled:
            output = np.tanh(output)  # Soft limiting

        self._metrics.gain_adjusted_frames += 1
        return output

    def _apply_noise_suppression(self, samples: np.ndarray) -> np.ndarray:
        """
        Apply noise suppression using spectral subtraction.

        For production, consider using RNNoise or WebRTC NS.
        """
        # FFT-based spectral subtraction
        n_fft = 512
        hop = n_fft // 4

        # Pad if needed
        if len(samples) < n_fft:
            samples = np.pad(samples, (0, n_fft - len(samples)))

        # STFT
        window = np.hanning(n_fft)
        n_frames = (len(samples) - n_fft) // hop + 1

        output = np.zeros_like(samples)

        for i in range(n_frames):
            start = i * hop
            frame = samples[start : start + n_fft] * window
            spectrum = np.fft.rfft(frame)
            magnitude = np.abs(spectrum)
            phase = np.angle(spectrum)

            # Estimate noise floor from quiet regions
            if self._noise_profile is None:
                self._noise_profile = magnitude * 0.1
            else:
                # Update noise profile during quiet periods
                frame_energy = np.mean(magnitude**2)
                if frame_energy < 0.01:  # Quiet frame
                    self._noise_profile = 0.9 * self._noise_profile + 0.1 * magnitude

            # Spectral subtraction
            alpha = 2.0  # Over-subtraction factor
            beta = 0.01  # Spectral floor
            subtracted = magnitude - alpha * self._noise_profile
            subtracted = np.maximum(subtracted, beta * magnitude)

            # Reconstruct
            clean_spectrum = subtracted * np.exp(1j * phase)
            clean_frame = np.fft.irfft(clean_spectrum)

            # Overlap-add
            output[start : start + n_fft] += clean_frame * window

        # Normalize overlap-add
        output = output / 1.5  # Approximate normalization

        return output[: len(samples)]

    def _estimate_snr(self, samples: np.ndarray) -> float:
        """Estimate signal-to-noise ratio in dB."""
        rms = np.sqrt(np.mean(samples**2) + 1e-10)
        rms_db = 20 * math.log10(rms)

        # SNR estimate relative to noise floor
        snr = rms_db - self._noise_floor_db
        self._metrics.snr_estimate_db = snr

        return snr

    async def calibrate_noise_floor(self, audio_samples: List[bytes], duration_ms: int = 3000) -> float:
        """
        Calibrate noise floor from ambient audio samples.

        Args:
            audio_samples: List of audio frames to analyze
            duration_ms: Total duration of samples

        Returns:
            Estimated noise floor in dB
        """
        all_samples = np.concatenate([self._bytes_to_samples(frame) for frame in audio_samples])

        # Use lower percentile as noise floor estimate
        frame_energies = []
        frame_size = int(self.config.input_sample_rate * 0.02)  # 20ms frames

        for i in range(0, len(all_samples) - frame_size, frame_size):
            frame = all_samples[i : i + frame_size]
            energy = np.mean(frame**2)
            frame_energies.append(energy)

        # 10th percentile as noise floor
        noise_energy = np.percentile(frame_energies, 10)
        self._noise_floor_db = 10 * math.log10(noise_energy + 1e-10)

        logger.info(f"Calibrated noise floor: {self._noise_floor_db:.1f} dB")
        return self._noise_floor_db

    def get_metrics(self) -> ProcessingMetrics:
        """Get current processing metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset processing metrics."""
        self._metrics = ProcessingMetrics()

    def on_metrics_update(self, callback: Callable[[ProcessingMetrics], None]) -> None:
        """Register callback for metrics updates."""
        self._on_metrics_update = callback

    def update_config(self, **kwargs) -> None:
        """Update configuration parameters."""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        # Recompute filter coefficients if needed
        if "high_pass_cutoff_hz" in kwargs or "input_sample_rate" in kwargs:
            self._compute_filter_coefficients()


# Singleton instance
_audio_processing_service: Optional[AudioProcessingService] = None


def get_audio_processing_service() -> AudioProcessingService:
    """Get or create the singleton AudioProcessingService instance."""
    global _audio_processing_service
    if _audio_processing_service is None:
        _audio_processing_service = AudioProcessingService()
    return _audio_processing_service


async def process_audio_frame(audio_frame: bytes, context: Optional[AudioContext] = None) -> bytes:
    """
    Convenience function to process a single audio frame.

    Args:
        audio_frame: Raw PCM16 audio bytes
        context: Optional context with playback state

    Returns:
        Processed PCM16 audio bytes
    """
    service = get_audio_processing_service()
    return await service.process_frame(audio_frame, context)
