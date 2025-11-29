"""Voice API Module.

This module provides voice-related API endpoints, split into logical submodules:
- schemas: Pydantic request/response models
- (Future) transcribe: Audio transcription endpoints
- (Future) synthesize: Speech synthesis endpoints
- (Future) realtime: Realtime session management
- (Future) metrics: Voice metrics collection
- (Future) auth: Voice biometric authentication

For backward compatibility, the main router is still in voice.py (parent directory).
This module structure prepares for gradual migration.
"""

from app.api.voice.schemas import (
    RealtimeAuthInfo,
    RealtimeSessionRequest,
    RealtimeSessionResponse,
    SynthesizeRequest,
    TranscribeResponse,
    VADProfileResponse,
    VADSessionMetrics,
    VoiceAuthCompleteResponse,
    VoiceAuthSampleResponse,
    VoiceAuthStartResponse,
    VoiceAuthStatusResponse,
    VoiceAuthVerifyResponse,
    VoiceInfo,
    VoiceListResponse,
    VoiceMetricsPayload,
    VoiceMetricsResponse,
    VoiceRelayRequest,
    VoiceRelayResponse,
)

__all__ = [
    # Transcription & Synthesis
    "SynthesizeRequest",
    "TranscribeResponse",
    # Realtime Session
    "RealtimeSessionRequest",
    "RealtimeAuthInfo",
    "RealtimeSessionResponse",
    # Voice Relay
    "VoiceRelayRequest",
    "VoiceRelayResponse",
    # Voice Info
    "VoiceInfo",
    "VoiceListResponse",
    # Voice Metrics
    "VoiceMetricsPayload",
    "VoiceMetricsResponse",
    # VAD
    "VADSessionMetrics",
    "VADProfileResponse",
    # Voice Auth
    "VoiceAuthStartResponse",
    "VoiceAuthSampleResponse",
    "VoiceAuthCompleteResponse",
    "VoiceAuthVerifyResponse",
    "VoiceAuthStatusResponse",
]
