"""Voice API Pydantic Schemas.

Defines request and response models for voice-related endpoints:
- Transcription
- Speech synthesis
- Realtime sessions
- Voice metrics
- VAD profiles
- Voice authentication
"""

from pydantic import BaseModel

# =============================================================================
# Transcription & Synthesis Schemas
# =============================================================================


class SynthesizeRequest(BaseModel):
    """Request model for speech synthesis"""

    text: str
    voiceId: str | None = None
    # Phase 11: Provider selection (defaults to admin-configured default)
    provider: str | None = None  # "openai" | "elevenlabs" | None (use default)
    # ElevenLabs-specific options
    model_id: str | None = None  # "eleven_multilingual_v2" | "eleven_turbo_v2"
    stability: float | None = None  # 0-1, lower = more expressive
    similarity_boost: float | None = None  # 0-1
    style: float | None = None  # 0-1, emotion/style exaggeration


class TranscribeResponse(BaseModel):
    """Response model for audio transcription"""

    text: str


# =============================================================================
# Realtime Session Schemas
# =============================================================================


class RealtimeSessionRequest(BaseModel):
    """Request model for Realtime session configuration"""

    conversation_id: str | None = None
    # Optional Voice Mode settings from frontend
    voice: str | None = None  # "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    language: str | None = None  # "en" | "es" | "fr" | "de" | "it" | "pt"
    vad_sensitivity: int | None = None  # 0-100 (maps to VAD threshold)
    # Adaptive VAD settings
    silence_duration_ms: int | None = None  # 200-800ms (default 500, adaptive mode auto-adjusts)
    adaptive_vad: bool = True  # Enable adaptive VAD based on user speech patterns


class RealtimeAuthInfo(BaseModel):
    """Authentication information for Realtime API"""

    type: str  # "ephemeral_token"
    token: str  # HMAC-signed ephemeral token (NOT the raw OpenAI key)
    expires_at: int  # Unix timestamp


class RealtimeSessionResponse(BaseModel):
    """Response model for Realtime session configuration"""

    url: str
    model: str
    session_id: str
    expires_at: int
    conversation_id: str | None
    auth: RealtimeAuthInfo  # Ephemeral token auth (secure, no raw API key)
    voice_config: dict
    audio_enhancements: dict | None = None


# =============================================================================
# Voice Relay Schemas
# =============================================================================


class VoiceRelayRequest(BaseModel):
    """Request model for relaying a final voice transcript into RAG + persistence."""

    conversation_id: str
    transcript: str
    clinical_context_id: str | None = None


class VoiceRelayResponse(BaseModel):
    """Response model for relayed assistant answer and persisted message IDs."""

    user_message_id: str
    assistant_message_id: str
    answer: str
    citations: list[dict] = []


# =============================================================================
# Voice Info Schemas
# =============================================================================


class VoiceInfo(BaseModel):
    """Voice information for frontend display."""

    voice_id: str
    name: str
    provider: str  # "openai" | "elevenlabs"
    category: str | None = None
    preview_url: str | None = None
    description: str | None = None
    labels: dict | None = None


class VoiceListResponse(BaseModel):
    """Response model for voice listing."""

    voices: list[VoiceInfo]
    default_voice_id: str | None = None
    default_provider: str


# =============================================================================
# Voice Metrics Schemas
# =============================================================================


class VoiceMetricsPayload(BaseModel):
    """Request model for voice session metrics (privacy-safe, no transcripts)"""

    conversation_id: str | None = None
    connection_time_ms: int | None = None
    time_to_first_transcript_ms: int | None = None
    last_stt_latency_ms: int | None = None
    last_response_latency_ms: int | None = None
    session_duration_ms: int | None = None
    user_transcript_count: int = 0
    ai_response_count: int = 0
    reconnect_count: int = 0
    session_started_at: int | None = None


class VoiceMetricsResponse(BaseModel):
    """Response model for voice metrics submission"""

    status: str


# =============================================================================
# VAD (Voice Activity Detection) Schemas
# =============================================================================


class VADSessionMetrics(BaseModel):
    """Metrics from a voice session for adaptive VAD learning."""

    pause_durations_ms: list[float] = []  # Duration of pauses between utterances
    utterance_durations_ms: list[float] = []  # Duration of each utterance


class VADProfileResponse(BaseModel):
    """Response with updated VAD profile info."""

    status: str
    optimal_silence_ms: int
    is_adaptive: bool


# =============================================================================
# Voice Authentication Schemas
# =============================================================================


class VoiceAuthStartResponse(BaseModel):
    """Response for starting voice enrollment"""

    status: str
    message: str
    min_samples: int
    max_samples: int


class VoiceAuthSampleResponse(BaseModel):
    """Response for adding enrollment sample"""

    success: bool
    message: str
    samples_collected: int
    samples_needed: int


class VoiceAuthCompleteResponse(BaseModel):
    """Response for completing enrollment"""

    success: bool
    message: str


class VoiceAuthVerifyResponse(BaseModel):
    """Response for voice verification"""

    verified: bool
    confidence: float
    status: str
    details: dict | None = None


class VoiceAuthStatusResponse(BaseModel):
    """Response for enrollment status"""

    enrolled: bool
    status: str
    sample_count: int | None = None
    created_at: float | None = None


# =============================================================================
# Voice Preferences Schemas
# =============================================================================


class VoicePreferencesRequest(BaseModel):
    """Request model for updating voice preferences."""

    tts_provider: str | None = None  # "openai" | "elevenlabs"
    openai_voice_id: str | None = None  # "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    elevenlabs_voice_id: str | None = None  # Custom ElevenLabs voice ID
    speech_rate: float | None = None  # 0.5-2.0
    stability: float | None = None  # 0-1 (ElevenLabs)
    similarity_boost: float | None = None  # 0-1 (ElevenLabs)
    style: float | None = None  # 0-1 (ElevenLabs)
    speaker_boost: bool | None = None  # ElevenLabs clarity enhancement
    auto_play: bool | None = None  # Auto-play TTS responses
    context_aware_style: bool | None = None  # Auto-adjust based on content
    preferred_language: str | None = None  # "en", "ar", etc.


class VoicePreferencesResponse(BaseModel):
    """Response model for voice preferences."""

    id: str
    user_id: str
    tts_provider: str
    openai_voice_id: str
    elevenlabs_voice_id: str | None
    speech_rate: float
    stability: float
    similarity_boost: float
    style: float
    speaker_boost: bool
    auto_play: bool
    context_aware_style: bool
    preferred_language: str
    created_at: str | None
    updated_at: str | None


class VoiceStylePresetResponse(BaseModel):
    """Response model for a voice style preset."""

    context: str  # "calm" | "urgent" | "empathetic" | "instructional" | "conversational"
    stability: float
    similarity_boost: float
    style: float
    speech_rate: float


class VoiceStylePresetsListResponse(BaseModel):
    """Response model for listing all voice style presets."""

    presets: dict[str, VoiceStylePresetResponse]
