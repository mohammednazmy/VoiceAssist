"""TTS-related services and configurations."""

from app.services.tts.quality_presets import PRESET_CONFIGS, QualityPreset, get_preset_config

__all__ = ["QualityPreset", "get_preset_config", "PRESET_CONFIGS"]
