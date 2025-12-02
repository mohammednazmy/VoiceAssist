"""
Quality Presets for TTS Voice Mode

Provides user-selectable quality presets that trade off between:
- SPEED: Fastest response, may sound slightly choppy
- BALANCED: Good balance of speed and naturalness (default)
- NATURAL: Most natural sounding, slightly higher latency

Each preset configures:
- Adaptive chunking limits (for TTFA optimization)
- SSML processing (enabled/disabled)
- TTS stability parameter (affects consistency vs expressiveness)
- Voice style (affects pause durations)

Phase: Voice Mode Latency Optimization
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

from app.services.sentence_chunker import AdaptiveChunkerConfig
from app.services.ssml_processor import VoiceStyle


class QualityPreset(str, Enum):
    """
    User-selectable quality presets for voice mode.

    These presets let users choose their preferred balance between
    response speed and audio naturalness.
    """

    SPEED = "speed"  # ~100-150ms TTFA, may sound slightly choppy
    BALANCED = "balanced"  # ~200-250ms TTFA, natural after first chunk (DEFAULT)
    NATURAL = "natural"  # ~300-400ms TTFA, full sentences always


@dataclass
class PresetConfig:
    """
    Complete configuration for a quality preset.

    Contains all settings needed to configure the TTS pipeline
    for a particular quality/speed trade-off.
    """

    # Adaptive chunking configuration
    adaptive_chunking: AdaptiveChunkerConfig

    # SSML processing
    enable_ssml: bool
    voice_style: VoiceStyle

    # TTS voice parameters
    stability: float  # 0.0-1.0, higher = more consistent voice
    similarity_boost: float  # 0.0-1.0, higher = clearer voice
    style_exaggeration: float  # 0.0-1.0, lower = more natural

    # Audio chunk size for streaming (bytes)
    audio_chunk_size: int

    # Description for UI
    label: str
    description: str


# Preset configurations
PRESET_CONFIGS: Dict[QualityPreset, PresetConfig] = {
    QualityPreset.SPEED: PresetConfig(
        adaptive_chunking=AdaptiveChunkerConfig(
            # Very small first chunk for fastest TTFA
            first_chunk_min=15,
            first_chunk_optimal=25,
            first_chunk_max=40,
            # Smaller subsequent chunks too
            subsequent_min=30,
            subsequent_optimal=60,
            subsequent_max=100,
            chunks_before_natural=1,
            enabled=True,
        ),
        enable_ssml=False,  # Disable SSML to reduce processing overhead
        voice_style=VoiceStyle.QUICK,
        stability=0.5,  # Lower stability = faster processing
        similarity_boost=0.8,
        style_exaggeration=0.05,
        audio_chunk_size=4096,  # Smaller chunks for faster streaming
        label="Speed",
        description="Fastest response time. Best for quick interactions.",
    ),
    QualityPreset.BALANCED: PresetConfig(
        adaptive_chunking=AdaptiveChunkerConfig(
            # Small first chunk for fast TTFA
            first_chunk_min=20,
            first_chunk_optimal=30,
            first_chunk_max=50,
            # Larger subsequent chunks for naturalness
            subsequent_min=40,
            subsequent_optimal=120,
            subsequent_max=200,
            chunks_before_natural=1,
            enabled=True,
        ),
        enable_ssml=True,
        voice_style=VoiceStyle.CONVERSATIONAL,
        stability=0.65,
        similarity_boost=0.85,
        style_exaggeration=0.08,
        audio_chunk_size=8192,  # Standard chunk size
        label="Balanced",
        description="Good balance of speed and natural speech. Recommended.",
    ),
    QualityPreset.NATURAL: PresetConfig(
        adaptive_chunking=AdaptiveChunkerConfig(
            # Larger first chunk for more natural opening
            first_chunk_min=40,
            first_chunk_optimal=80,
            first_chunk_max=120,
            # Full sentences for natural prosody
            subsequent_min=60,
            subsequent_optimal=150,
            subsequent_max=250,
            chunks_before_natural=1,
            enabled=True,
        ),
        enable_ssml=True,
        voice_style=VoiceStyle.CONVERSATIONAL,
        stability=0.78,  # Higher stability for consistent voice
        similarity_boost=0.85,
        style_exaggeration=0.08,
        audio_chunk_size=8192,
        label="Natural",
        description="Most natural sounding speech. Slightly slower response.",
    ),
}


def get_preset_config(preset: QualityPreset) -> PresetConfig:
    """
    Get the configuration for a quality preset.

    Args:
        preset: The quality preset to get config for

    Returns:
        PresetConfig with all settings for the preset
    """
    return PRESET_CONFIGS.get(preset, PRESET_CONFIGS[QualityPreset.BALANCED])


def get_preset_by_name(name: str) -> Optional[QualityPreset]:
    """
    Get a QualityPreset by its string name.

    Args:
        name: Preset name (e.g., "speed", "balanced", "natural")

    Returns:
        QualityPreset enum value, or None if not found
    """
    try:
        return QualityPreset(name.lower())
    except ValueError:
        return None


def list_presets() -> list:
    """
    List all available presets with their labels and descriptions.

    Returns:
        List of dicts with preset info for UI display
    """
    return [
        {
            "id": preset.value,
            "label": config.label,
            "description": config.description,
        }
        for preset, config in PRESET_CONFIGS.items()
    ]
