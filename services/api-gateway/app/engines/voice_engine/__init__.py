"""
Voice Engine - Unified Voice Mode v4 Orchestration

Provides centralized orchestration for all voice mode components:
- STT (Deepgram, Whisper local, parallel providers)
- TTS (ElevenLabs, OpenAI, caching)
- LLM (Thinker service with RAG)
- Audio processing (AEC, AGC, NS)
- Privacy routing (PHI detection)
- Fallback orchestration
- Language detection and translation
"""

from app.engines.voice_engine.unified_voice_service import (
    UnifiedVoiceService,
    VoicePipelineConfig,
    VoicePipelineState,
    get_unified_voice_service,
)

__all__ = [
    "UnifiedVoiceService",
    "VoicePipelineConfig",
    "VoicePipelineState",
    "get_unified_voice_service",
]
