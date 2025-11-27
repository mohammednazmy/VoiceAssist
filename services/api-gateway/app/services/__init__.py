"""
Service layer for external integrations

This module provides services for:
- Voice processing (VAD, echo cancellation, noise suppression)
- Voice authentication (speaker verification)
- OpenAI Realtime API integration
- RAG pipeline orchestration
- External API integrations (Nextcloud, CalDAV, etc.)
"""

from app.services.audio_processor import (
    AudioProcessor,
    AudioProcessorConfig,
    EchoCanceller,
    NoiseSuppressor,
    StreamingAudioProcessor,
)
from app.services.realtime_voice_service import RealtimeVoiceService, realtime_voice_service
from app.services.voice_activity_detector import SpeechState, StreamingVAD, VADConfig, VoiceActivityDetector
from app.services.voice_authentication import (
    VoiceAuthenticationService,
    VoiceAuthStatus,
    VoicePrint,
    voice_auth_service,
)
from app.services.voice_websocket_handler import (
    ConnectionState,
    ConversationState,
    VoiceSessionConfig,
    VoiceSessionManager,
    VoiceWebSocketHandler,
    voice_session_manager,
)

__all__ = [
    # Audio Processing
    "AudioProcessor",
    "AudioProcessorConfig",
    "EchoCanceller",
    "NoiseSuppressor",
    "StreamingAudioProcessor",
    # Voice Activity Detection
    "VoiceActivityDetector",
    "VADConfig",
    "SpeechState",
    "StreamingVAD",
    # Voice Authentication
    "VoiceAuthenticationService",
    "VoiceAuthStatus",
    "VoicePrint",
    "voice_auth_service",
    # Voice WebSocket Handler
    "VoiceWebSocketHandler",
    "VoiceSessionConfig",
    "VoiceSessionManager",
    "ConnectionState",
    "ConversationState",
    "voice_session_manager",
    # Realtime Voice Service
    "RealtimeVoiceService",
    "realtime_voice_service",
]
