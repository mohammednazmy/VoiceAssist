"""
Adaptive VAD Service with User-Tunable Presets
Extends base VAD with environment-aware presets and accessibility options.

Part of Voice Mode Enhancement Plan v4.1 - Workstream 4
Reference: docs/voice/adaptive-vad-presets.md

Features:
- Three preset modes: Sensitive, Balanced, Relaxed
- Custom preset support for power users
- Auto-calibration based on ambient noise
- Accessibility optimizations for speech impairments
- User preference persistence
"""

import logging
import struct
import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Dict, List, Optional

from app.services.voice_activity_detector import VADConfig, VoiceActivityDetector

logger = logging.getLogger(__name__)


class VADPresetType(str, Enum):
    """Available VAD preset types."""

    SENSITIVE = "sensitive"  # Quiet environment
    BALANCED = "balanced"  # Default
    RELAXED = "relaxed"  # Noisy environment
    ACCESSIBILITY = "accessibility"  # Speech impairments
    CUSTOM = "custom"  # User-defined


@dataclass
class VADPreset:
    """VAD preset configuration."""

    name: str
    energy_threshold_db: float  # Energy threshold in dB
    silence_duration_ms: int  # Silence before end-of-speech
    min_speech_duration_ms: int  # Minimum speech duration
    pre_speech_buffer_ms: int  # Buffer before speech start
    post_speech_buffer_ms: int = 100  # Buffer after speech end
    description: str = ""

    def to_vad_config(self) -> VADConfig:
        """Convert preset to VADConfig."""
        # Convert dB threshold to normalized threshold (0-1)
        # -50 dB -> 0.1, -25 dB -> 0.9
        normalized_threshold = (self.energy_threshold_db + 50) / 30
        normalized_threshold = max(0.1, min(0.9, normalized_threshold))

        return VADConfig(
            threshold=normalized_threshold,
            silence_end_frames=int(self.silence_duration_ms / 30),  # 30ms frames
            min_speech_duration_ms=self.min_speech_duration_ms,
            prefix_padding_ms=self.pre_speech_buffer_ms,
            suffix_padding_ms=self.post_speech_buffer_ms,
        )


# Predefined presets
PRESETS: Dict[VADPresetType, VADPreset] = {
    VADPresetType.SENSITIVE: VADPreset(
        name="sensitive",
        energy_threshold_db=-45,
        silence_duration_ms=300,
        min_speech_duration_ms=100,
        pre_speech_buffer_ms=200,
        post_speech_buffer_ms=100,
        description="Optimized for quiet environments with soft speech",
    ),
    VADPresetType.BALANCED: VADPreset(
        name="balanced",
        energy_threshold_db=-35,
        silence_duration_ms=500,
        min_speech_duration_ms=150,
        pre_speech_buffer_ms=250,
        post_speech_buffer_ms=150,
        description="General-purpose preset for typical environments",
    ),
    VADPresetType.RELAXED: VADPreset(
        name="relaxed",
        energy_threshold_db=-25,
        silence_duration_ms=800,
        min_speech_duration_ms=200,
        pre_speech_buffer_ms=300,
        post_speech_buffer_ms=200,
        description="Optimized for noisy environments or distant microphones",
    ),
    VADPresetType.ACCESSIBILITY: VADPreset(
        name="accessibility",
        energy_threshold_db=-42,
        silence_duration_ms=1000,
        min_speech_duration_ms=80,
        pre_speech_buffer_ms=400,
        post_speech_buffer_ms=300,
        description="Optimized for users with speech impairments",
    ),
}


@dataclass
class CalibrationResult:
    """Result of ambient noise calibration."""

    noise_floor_db: float
    recommended_preset: VADPresetType
    suggested_threshold_db: float
    calibration_duration_ms: float
    sample_count: int


@dataclass
class VADMetrics:
    """Metrics for VAD performance."""

    false_positive_rate: float = 0.0
    false_negative_rate: float = 0.0
    avg_detection_latency_ms: float = 0.0
    total_speech_segments: int = 0
    total_silence_segments: int = 0


class AdaptiveVADService:
    """
    Adaptive Voice Activity Detection with user-tunable presets.

    Provides:
    - Preset-based configuration (Sensitive, Balanced, Relaxed)
    - Auto-calibration based on ambient noise
    - Accessibility optimizations
    - Session-level preset management
    - Performance metrics tracking
    """

    def __init__(self, default_preset: VADPresetType = VADPresetType.BALANCED):
        self.default_preset = default_preset
        self._session_presets: Dict[str, VADPreset] = {}
        self._session_vads: Dict[str, VoiceActivityDetector] = {}
        self._session_metrics: Dict[str, VADMetrics] = {}
        self._custom_presets: Dict[str, VADPreset] = {}

    def get_preset(self, preset_type: VADPresetType) -> VADPreset:
        """Get a predefined preset by type."""
        return PRESETS.get(preset_type, PRESETS[VADPresetType.BALANCED])

    def create_custom_preset(
        self,
        name: str,
        energy_threshold_db: float,
        silence_duration_ms: int,
        min_speech_duration_ms: int = 150,
        pre_speech_buffer_ms: int = 250,
    ) -> VADPreset:
        """Create a custom VAD preset."""
        # Validate ranges
        energy_threshold_db = max(-50, min(-20, energy_threshold_db))
        silence_duration_ms = max(200, min(1500, silence_duration_ms))
        min_speech_duration_ms = max(50, min(500, min_speech_duration_ms))
        pre_speech_buffer_ms = max(100, min(500, pre_speech_buffer_ms))

        preset = VADPreset(
            name=name,
            energy_threshold_db=energy_threshold_db,
            silence_duration_ms=silence_duration_ms,
            min_speech_duration_ms=min_speech_duration_ms,
            pre_speech_buffer_ms=pre_speech_buffer_ms,
            description=f"Custom preset: {name}",
        )

        self._custom_presets[name] = preset
        return preset

    async def set_preset(
        self,
        session_id: str,
        preset: VADPresetType | str,
    ) -> VADPreset:
        """
        Set VAD preset for a session.

        Args:
            session_id: Session identifier
            preset: Preset type or custom preset name

        Returns:
            The active VADPreset
        """
        if isinstance(preset, VADPresetType):
            active_preset = self.get_preset(preset)
        elif preset in self._custom_presets:
            active_preset = self._custom_presets[preset]
        else:
            # Try to parse as preset type
            try:
                preset_type = VADPresetType(preset)
                active_preset = self.get_preset(preset_type)
            except ValueError:
                logger.warning(f"Unknown preset '{preset}', using balanced")
                active_preset = self.get_preset(VADPresetType.BALANCED)

        # Store and create VAD instance
        self._session_presets[session_id] = active_preset
        self._session_vads[session_id] = VoiceActivityDetector(config=active_preset.to_vad_config())
        self._session_metrics[session_id] = VADMetrics()

        logger.info(
            "VAD preset set",
            extra={
                "session_id": session_id,
                "preset": active_preset.name,
                "energy_threshold_db": active_preset.energy_threshold_db,
                "silence_duration_ms": active_preset.silence_duration_ms,
            },
        )

        return active_preset

    async def get_config(self, session_id: str) -> VADPreset:
        """Get current VAD configuration for a session."""
        if session_id not in self._session_presets:
            await self.set_preset(session_id, self.default_preset)
        return self._session_presets[session_id]

    def get_vad(self, session_id: str) -> VoiceActivityDetector:
        """Get VAD instance for a session."""
        if session_id not in self._session_vads:
            preset = self.get_preset(self.default_preset)
            self._session_presets[session_id] = preset
            self._session_vads[session_id] = VoiceActivityDetector(config=preset.to_vad_config())
            self._session_metrics[session_id] = VADMetrics()
        return self._session_vads[session_id]

    async def calibrate(
        self,
        audio_sample: bytes,
        duration_ms: int = 3000,
    ) -> CalibrationResult:
        """
        Calibrate VAD based on ambient noise sample.

        Args:
            audio_sample: Raw PCM audio bytes (16-bit, 16kHz)
            duration_ms: Duration of the calibration sample

        Returns:
            CalibrationResult with recommended settings
        """
        start_time = time.monotonic()

        # Calculate RMS energy of the sample
        n_samples = len(audio_sample) // 2
        if n_samples == 0:
            return CalibrationResult(
                noise_floor_db=-40,
                recommended_preset=VADPresetType.BALANCED,
                suggested_threshold_db=-35,
                calibration_duration_ms=0,
                sample_count=0,
            )

        samples = struct.unpack(f"<{n_samples}h", audio_sample)
        sum_squares = sum(s * s for s in samples)
        rms = (sum_squares / n_samples) ** 0.5

        # Convert RMS to dB (relative to max 16-bit value)
        import math

        if rms > 0:
            noise_floor_db = 20 * math.log10(rms / 32767)
        else:
            noise_floor_db = -60

        # Recommend preset based on noise floor
        if noise_floor_db < -50:
            recommended = VADPresetType.SENSITIVE
            suggested_threshold_db = -45
        elif noise_floor_db < -35:
            recommended = VADPresetType.BALANCED
            suggested_threshold_db = noise_floor_db + 10
        else:
            recommended = VADPresetType.RELAXED
            suggested_threshold_db = noise_floor_db + 15

        calibration_duration_ms = (time.monotonic() - start_time) * 1000

        logger.info(
            "VAD calibration complete",
            extra={
                "noise_floor_db": noise_floor_db,
                "recommended_preset": recommended.value,
                "suggested_threshold_db": suggested_threshold_db,
            },
        )

        return CalibrationResult(
            noise_floor_db=noise_floor_db,
            recommended_preset=recommended,
            suggested_threshold_db=suggested_threshold_db,
            calibration_duration_ms=calibration_duration_ms,
            sample_count=n_samples,
        )

    async def set_calibrated_config(
        self,
        session_id: str,
        base_preset: VADPresetType,
        noise_floor_db: float,
    ) -> VADPreset:
        """
        Set calibrated VAD config based on measured noise floor.

        Args:
            session_id: Session identifier
            base_preset: Base preset to modify
            noise_floor_db: Measured noise floor in dB

        Returns:
            Calibrated VADPreset
        """
        base = self.get_preset(base_preset)

        # Adjust threshold based on noise floor
        # Keep threshold at least 10dB above noise floor
        adjusted_threshold = max(
            base.energy_threshold_db,
            noise_floor_db + 10,
        )

        calibrated = VADPreset(
            name=f"{base.name}_calibrated",
            energy_threshold_db=adjusted_threshold,
            silence_duration_ms=base.silence_duration_ms,
            min_speech_duration_ms=base.min_speech_duration_ms,
            pre_speech_buffer_ms=base.pre_speech_buffer_ms,
            post_speech_buffer_ms=base.post_speech_buffer_ms,
            description=f"Calibrated from {base.name} (noise floor: {noise_floor_db:.1f}dB)",
        )

        self._session_presets[session_id] = calibrated
        self._session_vads[session_id] = VoiceActivityDetector(config=calibrated.to_vad_config())

        return calibrated

    async def process(
        self,
        audio_data: bytes,
        session_id: Optional[str] = None,
        on_speech_start: Optional[Callable[[], None]] = None,
        on_speech_end: Optional[Callable[[int], None]] = None,
    ) -> Dict:
        """
        Process audio through VAD.

        Args:
            audio_data: Raw PCM audio bytes
            session_id: Optional session ID for preset lookup
            on_speech_start: Callback for speech start
            on_speech_end: Callback for speech end

        Returns:
            Dict with detection results
        """
        vad = self.get_vad(session_id or "default")

        speech_detected = False
        segments = []
        current_segment_start = None

        def track_speech_start():
            nonlocal current_segment_start
            current_segment_start = vad.state.total_frames_processed * vad.config.frame_duration_ms
            if on_speech_start:
                on_speech_start()

        def track_speech_end(duration_ms: int):
            nonlocal speech_detected, current_segment_start
            speech_detected = True
            segments.append(
                {
                    "start_ms": current_segment_start,
                    "duration_ms": duration_ms,
                }
            )
            current_segment_start = None
            if on_speech_end:
                on_speech_end(duration_ms)

        states = vad.process_audio(
            audio_data,
            on_speech_start=track_speech_start,
            on_speech_end=track_speech_end,
        )

        return {
            "speech_detected": speech_detected,
            "segments": segments,
            "final_state": states[-1].value if states else "silence",
            "is_speaking": vad.is_speaking(),
            "stats": vad.get_stats(),
        }

    def get_metrics(self, session_id: str) -> VADMetrics:
        """Get VAD metrics for a session."""
        return self._session_metrics.get(session_id, VADMetrics())

    def clear_session(self, session_id: str) -> None:
        """Clear session data."""
        self._session_presets.pop(session_id, None)
        self._session_vads.pop(session_id, None)
        self._session_metrics.pop(session_id, None)

    def get_available_presets(self) -> List[Dict]:
        """Get list of available presets with descriptions."""
        presets = []
        for preset_type, preset in PRESETS.items():
            presets.append(
                {
                    "type": preset_type.value,
                    "name": preset.name,
                    "description": preset.description,
                    "energy_threshold_db": preset.energy_threshold_db,
                    "silence_duration_ms": preset.silence_duration_ms,
                }
            )

        # Add custom presets
        for name, preset in self._custom_presets.items():
            presets.append(
                {
                    "type": "custom",
                    "name": name,
                    "description": preset.description,
                    "energy_threshold_db": preset.energy_threshold_db,
                    "silence_duration_ms": preset.silence_duration_ms,
                }
            )

        return presets


# Singleton instance
_adaptive_vad_service: Optional[AdaptiveVADService] = None


async def get_adaptive_vad_service() -> AdaptiveVADService:
    """Get or create adaptive VAD service instance."""
    global _adaptive_vad_service
    if _adaptive_vad_service is None:
        _adaptive_vad_service = AdaptiveVADService()
    return _adaptive_vad_service
