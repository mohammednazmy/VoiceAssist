"""
Voice Constants - Single Source of Truth

All default voice configurations should be defined here.
Other services should import from this file to prevent inconsistencies.

When changing the default voice, only this file needs to be updated.
"""

from enum import Enum
from typing import Dict


class VoiceProvider(str, Enum):
    """Supported TTS providers."""
    ELEVENLABS = "elevenlabs"
    OPENAI = "openai"


# =============================================================================
# ElevenLabs Voice IDs
# =============================================================================

class ElevenLabsVoice(str, Enum):
    """
    ElevenLabs voice IDs.

    Add new voices here as they become available.
    The 'value' is the ElevenLabs voice ID.
    """
    # Premium voices
    BRIAN = "nPczCjzI2devNBz1zQrb"      # Male, natural, warm
    JOSH = "TxGEqnHWrfWFTfGW9XjX"       # Male, deep, authoritative
    RACHEL = "21m00Tcm4TlvDq8ikWAM"     # Female, clear, professional
    ADAM = "pNInz6obpgDQGcFmaJgB"       # Male, deep, narrator
    BELLA = "EXAVITQu4vr4xnSDxMaL"      # Female, soft, storytelling
    ELLI = "MF3mGyEYCl7XYWbV9V6O"       # Female, young, friendly
    SAM = "yoZ06aMxZJJ28mfd3POQ"        # Male, young, casual

    # Arabic voices
    LAYLA = "XB0fDUnXU5powFXDhCwa"      # Female, Arabic

    @classmethod
    def get_voice_info(cls) -> Dict[str, dict]:
        """Get metadata about all available voices."""
        return {
            cls.BRIAN.value: {"name": "Brian", "gender": "male", "style": "warm"},
            cls.JOSH.value: {"name": "Josh", "gender": "male", "style": "authoritative"},
            cls.RACHEL.value: {"name": "Rachel", "gender": "female", "style": "professional"},
            cls.ADAM.value: {"name": "Adam", "gender": "male", "style": "narrator"},
            cls.BELLA.value: {"name": "Bella", "gender": "female", "style": "soft"},
            cls.ELLI.value: {"name": "Elli", "gender": "female", "style": "friendly"},
            cls.SAM.value: {"name": "Sam", "gender": "male", "style": "casual"},
            cls.LAYLA.value: {"name": "Layla", "gender": "female", "style": "arabic"},
        }


# =============================================================================
# Default Voice Configuration
# =============================================================================

# THE SINGLE SOURCE OF TRUTH FOR DEFAULT VOICE
# Change this ONE value to update the default voice across the entire system
DEFAULT_VOICE_ID: str = ElevenLabsVoice.BRIAN.value
DEFAULT_VOICE_NAME: str = "Brian"

# TTS model defaults
DEFAULT_TTS_MODEL: str = "eleven_flash_v2_5"  # Low latency, good quality
DEFAULT_TTS_OUTPUT_FORMAT: str = "pcm_24000"  # Raw PCM for streaming

# Voice quality defaults
DEFAULT_STABILITY: float = 0.65
DEFAULT_SIMILARITY_BOOST: float = 0.80
DEFAULT_STYLE: float = 0.15


# =============================================================================
# OpenAI Voice Mapping (for fallback)
# =============================================================================

ELEVENLABS_TO_OPENAI_VOICE_MAP: Dict[str, str] = {
    ElevenLabsVoice.BRIAN.value: "onyx",     # Male, deep
    ElevenLabsVoice.JOSH.value: "onyx",      # Male, deep
    ElevenLabsVoice.RACHEL.value: "nova",    # Female, warm
    ElevenLabsVoice.ADAM.value: "echo",      # Male, neutral
    ElevenLabsVoice.BELLA.value: "shimmer",  # Female, soft
    ElevenLabsVoice.ELLI.value: "alloy",     # Female, neutral
    ElevenLabsVoice.SAM.value: "fable",      # Male, casual
}

# Default OpenAI voice when no mapping exists
DEFAULT_OPENAI_VOICE: str = "onyx"


def get_openai_voice_for_elevenlabs(elevenlabs_voice_id: str) -> str:
    """
    Get the equivalent OpenAI voice for an ElevenLabs voice ID.

    Used when falling back to OpenAI TTS.
    """
    return ELEVENLABS_TO_OPENAI_VOICE_MAP.get(elevenlabs_voice_id, DEFAULT_OPENAI_VOICE)
