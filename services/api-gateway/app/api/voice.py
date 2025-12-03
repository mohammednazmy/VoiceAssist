"""
Voice API endpoints
Handles audio transcription, speech synthesis, and Realtime API sessions

Providers:
- OpenAI Whisper/TTS (default)
- OpenAI Realtime API (WebSocket-based voice mode)
- Thinker/Talker Pipeline (Deepgram + GPT-4o + ElevenLabs)
- Stubs for future providers (Azure/GCP) using config

Note: Pydantic schemas are now defined in app/api/voice/schemas.py
"""

import asyncio
import time
import uuid

import httpx
from app.api.voice_schemas.schemas import (
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
    VoicePreferencesRequest,
    VoicePreferencesResponse,
    VoiceRelayRequest,
    VoiceRelayResponse,
    VoiceStylePresetsListResponse,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.core.metrics import (
    external_api_duration_seconds,
    external_api_requests_total,
    voice_connection_time_seconds,
    voice_first_audio_latency_seconds,
    voice_proxy_ttfb_seconds,
    voice_reconnects_total,
    voice_relay_latency_seconds,
    voice_response_latency_seconds,
    voice_session_duration_seconds,
    voice_sessions_total,
    voice_slo_violations_total,
    voice_stt_latency_seconds,
    voice_transcripts_total,
)
from app.core.middleware import rate_limit
from app.core.security import verify_token
from app.core.security import verify_token as verify_token_func
from app.core.sentry import capture_slo_violation
from app.core.slo import check_slo_violations, log_slo_violations
from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.user import User
from app.models.user_voice_preferences import UserVoicePreferences
from app.services.elevenlabs_service import elevenlabs_service
from app.services.rag_service import QueryOrchestrator, QueryRequest
from app.services.realtime_voice_service import adaptive_vad_manager, realtime_voice_service
from app.services.thinker_talker_websocket_handler import TTSessionConfig, thinker_talker_session_manager
from app.services.voice_authentication import voice_auth_service
from app.services.voice_pipeline_service import voice_pipeline_service
from app.services.voice_style_detector import voice_style_detector
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])

# Shared orchestrator instance for voice relay
voice_query_orchestrator = QueryOrchestrator()


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe audio to text",
    description="Convert audio file to text using OpenAI Whisper API",
)
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio file to transcribe"),
    current_user: User = Depends(get_current_user),
):
    """
    Transcribe audio to text using OpenAI Whisper.

    Args:
        audio: Audio file (supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm)
        current_user: Authenticated user

    Returns:
        TranscribeResponse with transcribed text
    """
    logger.info(
        f"Transcribing audio for user {current_user.id}",
        extra={"user_id": current_user.id, "filename": audio.filename},
    )

    # Validate file
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an audio file",
        )

    # Check file size (max 25MB for Whisper API)
    contents = await audio.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large (max 25MB)",
        )

    try:
        # Use OpenAI Whisper API for transcription
        openai_api_key = settings.OPENAI_API_KEY
        if not openai_api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OpenAI API key not configured",
            )

        # Prepare file for OpenAI API
        files = {
            "file": (audio.filename or "audio.webm", contents, audio.content_type),
            "model": (None, "whisper-1"),
        }

        async with httpx.AsyncClient(timeout=settings.OPENAI_TIMEOUT_SEC) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {openai_api_key}"},
                files=files,
            )

            if response.status_code != 200:
                logger.error(
                    f"OpenAI transcription failed: {response.text}",
                    extra={
                        "status_code": response.status_code,
                        "user_id": current_user.id,
                    },
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Transcription failed",
                )

            result = response.json()
            transcribed_text = result.get("text", "")

            logger.info(
                f"Transcription successful for user {current_user.id}",
                extra={
                    "user_id": current_user.id,
                    "text_length": len(transcribed_text),
                },
            )

            return TranscribeResponse(text=transcribed_text)

    except httpx.TimeoutException:
        logger.error(
            "Transcription timeout",
            extra={"user_id": current_user.id},
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Transcription request timed out",
        )
    except Exception as e:
        logger.error(
            f"Transcription error: {str(e)}",
            extra={"user_id": current_user.id, "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(e)}",
        )


@router.post(
    "/synthesize",
    summary="Synthesize speech from text",
    description="Convert text to speech using OpenAI or ElevenLabs TTS API",
    response_class=Response,  # Return raw audio
)
async def synthesize_speech(
    request: SynthesizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Synthesize speech from text using OpenAI or ElevenLabs TTS.

    Phase 11: Added provider selection with automatic fallback.
    Voice Mode Overhaul: Added user preferences and context-aware style detection.
    - provider: "openai" | "elevenlabs" | None (uses user preference or admin default)
    - Automatic fallback to OpenAI if ElevenLabs fails
    - Context-aware style detection adjusts TTS parameters based on content
    - X-TTS-Provider response header indicates which provider was used
    - X-TTS-Style response header indicates detected style (if context-aware enabled)

    Args:
        request: SynthesizeRequest with text, voiceId, and optional provider settings
        current_user: Authenticated user
        db: Database session

    Returns:
        Audio file (mp3 format) with X-TTS-Provider and X-TTS-Style headers
    """
    # Load user's voice preferences
    user_prefs = db.query(UserVoicePreferences).filter(UserVoicePreferences.user_id == current_user.id).first()

    # Use defaults if no preferences exist
    if not user_prefs:
        user_prefs = UserVoicePreferences.get_default_preferences(current_user.id)

    # Determine effective settings: request > user_prefs > system defaults
    effective_provider = request.provider or user_prefs.tts_provider or settings.TTS_PROVIDER or "openai"
    effective_voice = (
        request.voiceId
        or (user_prefs.elevenlabs_voice_id if effective_provider == "elevenlabs" else user_prefs.openai_voice_id)
        or settings.TTS_VOICE
        or "alloy"
    )
    effective_stability = request.stability if request.stability is not None else user_prefs.stability
    effective_similarity = (
        request.similarity_boost if request.similarity_boost is not None else user_prefs.similarity_boost
    )
    effective_style = request.style if request.style is not None else user_prefs.style
    effective_speech_rate = user_prefs.speech_rate

    # Apply context-aware style detection if enabled
    detected_style = None
    if user_prefs.context_aware_style:
        style_params = voice_style_detector.apply_style_to_synthesis(
            text=request.text,
            base_stability=effective_stability,
            base_similarity_boost=effective_similarity,
            base_style=effective_style,
            base_speech_rate=effective_speech_rate,
            auto_detect=True,
        )
        effective_stability = style_params["stability"]
        effective_similarity = style_params["similarity_boost"]
        effective_style = style_params["style"]
        effective_speech_rate = style_params["speech_rate"]
        detected_style = style_params["detected_style"]

        logger.debug(
            f"Applied context-aware style: {detected_style}",
            extra={
                "user_id": current_user.id,
                "detected_style": detected_style,
                "stability": effective_stability,
                "speech_rate": effective_speech_rate,
            },
        )

    logger.info(
        f"Synthesizing speech for user {current_user.id}",
        extra={
            "user_id": current_user.id,
            "text_length": len(request.text),
            "voice_id": effective_voice,
            "provider": effective_provider,
            "detected_style": detected_style,
        },
    )

    # Validate text length
    max_length = 5000 if effective_provider == "elevenlabs" else 4096
    if len(request.text) > max_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Text too long (max {max_length} characters)",
        )

    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty",
        )

    used_provider = effective_provider
    fallback_used = False

    async def synthesize_with_openai() -> tuple[bytes, str]:
        """Synthesize with OpenAI TTS."""
        openai_api_key = settings.OPENAI_API_KEY
        if not openai_api_key:
            raise ValueError("OpenAI API key not configured")

        async with httpx.AsyncClient(timeout=settings.OPENAI_TIMEOUT_SEC) as client:
            external_api_requests_total.labels(service="openai", endpoint="audio/speech", status_code="pending").inc()
            tts_start = time.monotonic()
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1-hd",  # HD model for higher quality voice
                    "input": request.text,
                    "voice": effective_voice,
                    "response_format": "mp3",
                    "speed": effective_speech_rate,
                },
            )

            latency = time.monotonic() - tts_start
            external_api_requests_total.labels(
                service="openai",
                endpoint="audio/speech",
                status_code=str(response.status_code),
            ).inc()
            external_api_duration_seconds.labels(service="openai", endpoint="audio/speech").observe(latency)

            if response.status_code != 200:
                logger.error(f"OpenAI TTS failed: {response.text}")
                raise ValueError(f"OpenAI TTS failed: {response.status_code}")

            return response.content, "audio/mpeg"

    async def synthesize_with_elevenlabs() -> tuple[bytes, str]:
        """Synthesize with ElevenLabs TTS."""
        if not elevenlabs_service.is_enabled():
            raise ValueError("ElevenLabs TTS is not enabled")

        external_api_requests_total.labels(service="elevenlabs", endpoint="text-to-speech", status_code="pending").inc()
        tts_start = time.monotonic()

        result = await elevenlabs_service.synthesize(
            text=request.text,
            voice_id=effective_voice,
            model_id=request.model_id,
            stability=effective_stability,
            similarity_boost=effective_similarity,
            style=effective_style,
        )

        latency = time.monotonic() - tts_start
        external_api_requests_total.labels(service="elevenlabs", endpoint="text-to-speech", status_code="200").inc()
        external_api_duration_seconds.labels(service="elevenlabs", endpoint="text-to-speech").observe(latency)

        return result.audio_data, result.content_type

    try:
        audio_content: bytes
        content_type: str

        if effective_provider == "elevenlabs":
            try:
                audio_content, content_type = await synthesize_with_elevenlabs()
                used_provider = "elevenlabs"
            except Exception as e:
                # Fallback to OpenAI on ElevenLabs failure
                logger.warning(
                    f"ElevenLabs TTS failed, falling back to OpenAI: {str(e)}",
                    extra={"user_id": current_user.id, "error": str(e)},
                )
                audio_content, content_type = await synthesize_with_openai()
                used_provider = "openai"
                fallback_used = True
        else:
            # Default: OpenAI
            audio_content, content_type = await synthesize_with_openai()
            used_provider = "openai"

        logger.info(
            f"Speech synthesis successful for user {current_user.id}",
            extra={
                "user_id": current_user.id,
                "audio_size": len(audio_content),
                "voice": effective_voice,
                "provider": used_provider,
                "fallback_used": fallback_used,
                "detected_style": detected_style,
            },
        )

        # Build response headers
        headers = {
            "Content-Disposition": "attachment; filename=speech.mp3",
            "X-TTS-Provider": used_provider,
            "X-TTS-Fallback": "true" if fallback_used else "false",
        }
        if detected_style:
            headers["X-TTS-Style"] = detected_style

        return Response(
            content=audio_content,
            media_type=content_type,
            headers=headers,
        )

    except httpx.TimeoutException:
        logger.error(
            "Speech synthesis timeout",
            extra={"user_id": current_user.id, "provider": effective_provider},
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Speech synthesis request timed out",
        )
    except ValueError as e:
        logger.error(
            f"Speech synthesis error: {str(e)}",
            extra={
                "user_id": current_user.id,
                "provider": effective_provider,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {str(e)}",
        )
    except Exception as e:
        logger.error(
            f"Speech synthesis error: {str(e)}",
            extra={
                "user_id": current_user.id,
                "provider": effective_provider,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {str(e)}",
        )


# ==============================================================================
# Streaming TTS Endpoint (Low-Latency Audio)
# ==============================================================================


@router.post(
    "/synthesize/stream",
    summary="Stream TTS audio (low latency)",
    description=(
        "Stream TTS audio chunks as they're generated for immediate playback. " "Uses ElevenLabs for true streaming."
    ),
)
async def synthesize_speech_stream(
    request: SynthesizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream TTS audio for low-latency playback.

    Audio chunks are streamed as they become available, allowing playback
    to start before the full synthesis completes. This can reduce time-to-first-audio
    from ~500ms to ~100-200ms.

    Note: True streaming is only available with ElevenLabs. OpenAI requests
    will fall back to buffered response.
    """
    import time

    start_time = time.monotonic()

    # Load user preferences
    user_prefs = db.query(UserVoicePreferences).filter(UserVoicePreferences.user_id == current_user.id).first()

    # Determine effective settings
    effective_provider = request.provider or (user_prefs.tts_provider if user_prefs else "openai")
    effective_voice = request.voice_id or (user_prefs.elevenlabs_voice_id if user_prefs else None)
    effective_stability = (
        request.stability if request.stability is not None else (user_prefs.stability if user_prefs else 0.7)
    )
    effective_similarity = (
        request.similarity_boost
        if request.similarity_boost is not None
        else (user_prefs.similarity_boost if user_prefs else 0.8)
    )
    effective_style = request.style if request.style is not None else (user_prefs.style if user_prefs else 0.15)

    # Apply context-aware style if enabled
    detected_style = None
    if user_prefs and user_prefs.context_aware_style:
        style_params = voice_style_detector.apply_style_to_synthesis(
            text=request.text,
            base_stability=effective_stability,
            base_similarity_boost=effective_similarity,
            base_style=effective_style,
            base_speech_rate=1.0,
            auto_detect=True,
        )
        effective_stability = style_params["stability"]
        effective_similarity = style_params["similarity_boost"]
        effective_style = style_params["style"]
        detected_style = style_params.get("detected_style")

    # Only ElevenLabs supports true streaming
    if effective_provider == "elevenlabs" and elevenlabs_service.is_enabled():
        try:

            async def audio_generator():
                """Generate audio chunks from ElevenLabs streaming API."""
                ttfb_logged = False
                async for chunk in elevenlabs_service.synthesize_stream(
                    text=request.text,
                    voice_id=effective_voice,
                    model_id="eleven_turbo_v2",  # Use turbo model for lowest latency
                    stability=effective_stability,
                    similarity_boost=effective_similarity,
                    style=effective_style,
                    use_speaker_boost=True,
                    chunk_size=1024,  # 1KB chunks for smooth streaming
                ):
                    if not ttfb_logged:
                        ttfb_ms = (time.monotonic() - start_time) * 1000
                        logger.info(
                            f"Streaming TTS TTFB: {ttfb_ms:.0f}ms",
                            extra={
                                "user_id": str(current_user.id),
                                "ttfb_ms": ttfb_ms,
                                "provider": "elevenlabs",
                                "streaming": True,
                            },
                        )
                        ttfb_logged = True
                    yield chunk

            headers = {
                "X-TTS-Provider": "elevenlabs",
                "X-TTS-Streaming": "true",
                "X-TTS-Model": "eleven_turbo_v2",
                "Cache-Control": "no-cache",
            }
            if detected_style:
                headers["X-TTS-Style"] = detected_style

            return StreamingResponse(
                audio_generator(),
                media_type="audio/mpeg",
                headers=headers,
            )

        except Exception as e:
            logger.error(
                f"Streaming TTS error: {str(e)}",
                extra={"user_id": str(current_user.id)},
            )
            # Fall through to non-streaming fallback

    # Fallback: Use non-streaming synthesize (OpenAI or ElevenLabs fallback)
    logger.info(
        "Streaming not available, using buffered synthesis",
        extra={"user_id": str(current_user.id), "provider": effective_provider},
    )

    # Call the regular synthesize endpoint
    return await synthesize_speech(request, current_user, db)


# ==============================================================================
# Phase 11: Voice Listing Endpoint
# ==============================================================================


@router.get(
    "/voices",
    response_model=VoiceListResponse,
    summary="Get available TTS voices",
    description="List all available TTS voices from configured providers",
)
async def get_available_voices(
    provider: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """
    Get available TTS voices from all configured providers.

    Phase 11: Combined voice listing for OpenAI and ElevenLabs.

    Args:
        provider: Optional filter by provider ("openai" | "elevenlabs")
        current_user: Authenticated user

    Returns:
        VoiceListResponse with available voices and defaults
    """
    voices: list[VoiceInfo] = []

    # OpenAI voices (always available if API key configured)
    if provider is None or provider == "openai":
        openai_voices = [
            VoiceInfo(
                voice_id="alloy",
                name="Alloy",
                provider="openai",
                category="neural",
                description="Neutral and balanced voice",
            ),
            VoiceInfo(
                voice_id="echo",
                name="Echo",
                provider="openai",
                category="neural",
                description="Warm and smooth voice",
            ),
            VoiceInfo(
                voice_id="fable",
                name="Fable",
                provider="openai",
                category="neural",
                description="Expressive and dynamic voice",
            ),
            VoiceInfo(
                voice_id="onyx",
                name="Onyx",
                provider="openai",
                category="neural",
                description="Deep and authoritative voice",
            ),
            VoiceInfo(
                voice_id="nova",
                name="Nova",
                provider="openai",
                category="neural",
                description="Bright and energetic voice",
            ),
            VoiceInfo(
                voice_id="shimmer",
                name="Shimmer",
                provider="openai",
                category="neural",
                description="Soft and gentle voice",
            ),
        ]
        voices.extend(openai_voices)

    # ElevenLabs voices (if enabled)
    if (provider is None or provider == "elevenlabs") and elevenlabs_service.is_enabled():
        try:
            elevenlabs_voices = await elevenlabs_service.get_voices()
            for ev in elevenlabs_voices:
                voices.append(
                    VoiceInfo(
                        voice_id=ev.voice_id,
                        name=ev.name,
                        provider="elevenlabs",
                        category=ev.category,
                        preview_url=ev.preview_url,
                        description=ev.description,
                        labels=ev.labels,
                    )
                )
        except Exception as e:
            logger.warning(f"Failed to fetch ElevenLabs voices: {str(e)}")
            # Continue without ElevenLabs voices

    # Determine defaults
    default_provider = settings.TTS_PROVIDER or "openai"
    default_voice_id = settings.TTS_VOICE or "alloy"

    logger.info(
        f"Listed {len(voices)} TTS voices for user {current_user.id}",
        extra={
            "user_id": current_user.id,
            "voice_count": len(voices),
            "providers": list(set(v.provider for v in voices)),
        },
    )

    return VoiceListResponse(
        voices=voices,
        default_voice_id=default_voice_id,
        default_provider=default_provider,
    )


@router.post(
    "/realtime-session",
    response_model=RealtimeSessionResponse,
    summary="Create Realtime API session",
    description="Generate session config for OpenAI Realtime API voice mode",
)
async def create_realtime_session(
    request: RealtimeSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a Realtime API session for voice mode.

    This endpoint generates ephemeral session configuration that the frontend
    uses to establish a WebSocket connection to OpenAI's Realtime API.

    SECURITY: This endpoint returns an HMAC-signed ephemeral token instead of
    the raw OpenAI API key. The token is valid for 5 minutes and is tied to
    a specific user and session.

    Args:
        request: RealtimeSessionRequest with optional conversation_id
        current_user: Authenticated user

    Returns:
        RealtimeSessionResponse with session configuration including:
        - WebSocket URL
        - Model name
        - Session ID
        - Expiry timestamp
        - Auth: Ephemeral token (NOT the raw API key)
        - Voice configuration (voice, modalities, VAD settings)

    Raises:
        HTTPException: If Realtime API is not enabled or configured
    """
    start_time = time.monotonic()
    logger.info(
        f"Creating Realtime session for user {current_user.id}",
        extra={
            "user_id": current_user.id,
            "conversation_id": request.conversation_id,
            "voice": request.voice,
            "language": request.language,
            "vad_sensitivity": request.vad_sensitivity,
        },
    )

    try:
        # Check if Realtime API is enabled
        if not realtime_voice_service.is_enabled():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Realtime API is not enabled or not configured",
            )

        # Generate session configuration
        # This creates a real ephemeral session with OpenAI
        config = await realtime_voice_service.generate_session_config(
            user_id=str(current_user.id),
            conversation_id=request.conversation_id,
            voice=request.voice,
            language=request.language,
            vad_sensitivity=request.vad_sensitivity,
            silence_duration_ms=request.silence_duration_ms,
            adaptive_vad=request.adaptive_vad,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)
        logger.info(
            f"Realtime session created for user {current_user.id}",
            extra={
                "user_id": current_user.id,
                "session_id": config["session_id"],
                "expires_at": config["expires_at"],
                "voice": config.get("voice_config", {}).get("voice"),
                "duration_ms": duration_ms,
            },
        )

        return RealtimeSessionResponse(**config)

    except ValueError as e:
        duration_ms = int((time.monotonic() - start_time) * 1000)
        logger.error(
            f"Failed to create Realtime session: {str(e)}",
            extra={
                "user_id": current_user.id,
                "error": str(e),
                "duration_ms": duration_ms,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        duration_ms = int((time.monotonic() - start_time) * 1000)
        logger.error(
            f"Realtime session error: {str(e)}",
            extra={
                "user_id": current_user.id,
                "error": str(e),
                "duration_ms": duration_ms,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Realtime session: {str(e)}",
        )


@router.post(
    "/metrics",
    response_model=VoiceMetricsResponse,
    summary="Submit voice session metrics",
    description="Submit timing and count metrics from a voice session",
)
async def post_voice_metrics(
    payload: VoiceMetricsPayload,
    request: Request,
    db: Session = Depends(get_db),
) -> VoiceMetricsResponse:
    """
    Submit voice session metrics for observability.

    This endpoint receives timing and count metrics from frontend voice sessions.
    No transcript content or PHI is sent - only timing and counts.

    Authentication is optional to support sendBeacon (which cannot send headers).
    If authenticated, user_id is included in metrics. Otherwise, metrics are
    recorded anonymously.

    Metrics flow:
    1. Logged with structured logging
    2. Recorded to Prometheus histograms/counters
    3. Checked against SLO thresholds
    4. SLO violations logged and sent to Sentry

    Args:
        payload: VoiceMetricsPayload with timing and count metrics
        request: HTTP request (for optional auth header extraction)
        db: Database session

    Returns:
        VoiceMetricsResponse with status "ok"
    """
    # Optional authentication - supports sendBeacon which cannot send headers
    user_id: str | None = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload_data = verify_token_func(token, token_type="access")
            if payload_data:
                user_id = payload_data.get("sub")
        except Exception:
            pass  # Auth is optional, continue without user_id

    # Use anonymous if no auth
    if not user_id:
        user_id = "anonymous"

    # 1. Log metrics
    logger.info(
        "VoiceMetrics received",
        extra={
            "user_id": user_id,
            "conversation_id": payload.conversation_id,
            "connection_time_ms": payload.connection_time_ms,
            "time_to_first_transcript_ms": payload.time_to_first_transcript_ms,
            "last_stt_latency_ms": payload.last_stt_latency_ms,
            "last_response_latency_ms": payload.last_response_latency_ms,
            "session_duration_ms": payload.session_duration_ms,
            "user_transcript_count": payload.user_transcript_count,
            "ai_response_count": payload.ai_response_count,
            "reconnect_count": payload.reconnect_count,
            "session_started_at": payload.session_started_at,
        },
    )

    # 2. Record Prometheus metrics
    if payload.connection_time_ms is not None:
        voice_connection_time_seconds.observe(payload.connection_time_ms / 1000.0)

    if payload.last_stt_latency_ms is not None:
        voice_stt_latency_seconds.observe(payload.last_stt_latency_ms / 1000.0)

    if payload.last_response_latency_ms is not None:
        voice_response_latency_seconds.observe(payload.last_response_latency_ms / 1000.0)

    if payload.session_duration_ms is not None:
        voice_session_duration_seconds.observe(payload.session_duration_ms / 1000.0)
        # Mark session as completed (we only receive metrics for completed sessions)
        voice_sessions_total.labels(status="completed").inc()

    if payload.user_transcript_count > 0:
        voice_transcripts_total.labels(direction="user").inc(payload.user_transcript_count)

    if payload.ai_response_count > 0:
        voice_transcripts_total.labels(direction="ai").inc(payload.ai_response_count)

    if payload.reconnect_count > 0:
        voice_reconnects_total.inc(payload.reconnect_count)

    # 3. Check SLO thresholds
    violations = check_slo_violations(
        connection_time_ms=(float(payload.connection_time_ms) if payload.connection_time_ms else None),
        stt_latency_ms=(float(payload.last_stt_latency_ms) if payload.last_stt_latency_ms else None),
        response_latency_ms=(float(payload.last_response_latency_ms) if payload.last_response_latency_ms else None),
        time_to_first_transcript_ms=(
            float(payload.time_to_first_transcript_ms) if payload.time_to_first_transcript_ms else None
        ),
    )

    # 4. Handle SLO violations
    if violations:
        # Log violations
        log_slo_violations(violations, user_id=user_id, conversation_id=payload.conversation_id)

        # Record to Prometheus
        for violation in violations:
            voice_slo_violations_total.labels(metric=violation.metric.value, severity=violation.severity).inc()

            # Report critical violations to Sentry
            if violation.severity == "critical":
                capture_slo_violation(
                    metric_name=violation.metric.value,
                    actual_value=violation.actual_ms,
                    threshold=violation.threshold_ms,
                    user_id=user_id,
                    conversation_id=payload.conversation_id,
                )

    return VoiceMetricsResponse(status="ok")


@router.post(
    "/vad-profile/update",
    response_model=VADProfileResponse,
    summary="Update adaptive VAD profile",
    description="Submit session timing metrics to update user's adaptive VAD profile",
)
async def update_vad_profile(
    payload: VADSessionMetrics,
    current_user: User = Depends(get_current_user),
) -> VADProfileResponse:
    """
    Update the user's adaptive VAD profile with session metrics.

    Called at end of voice session to learn user's speech patterns
    and optimize future turn detection timing.
    """
    user_id = str(current_user.id)

    # Update the adaptive VAD profile
    await adaptive_vad_manager.update_user_profile(
        user_id=user_id,
        pause_durations_ms=payload.pause_durations_ms,
        utterance_durations_ms=payload.utterance_durations_ms,
    )

    # Get updated profile
    profile = await adaptive_vad_manager.get_user_profile(user_id)
    optimal_silence = profile.optimal_silence_duration_ms if profile else 500

    logger.info(
        f"Updated VAD profile for user {user_id}",
        extra={
            "user_id": user_id,
            "optimal_silence_ms": optimal_silence,
            "pause_count": len(payload.pause_durations_ms),
            "utterance_count": len(payload.utterance_durations_ms),
        },
    )

    return VADProfileResponse(
        status="ok",
        optimal_silence_ms=optimal_silence,
        is_adaptive=True,
    )


@router.get(
    "/vad-profile",
    response_model=VADProfileResponse,
    summary="Get adaptive VAD profile",
    description="Get user's current adaptive VAD settings",
)
async def get_vad_profile(
    current_user: User = Depends(get_current_user),
) -> VADProfileResponse:
    """
    Get the user's current adaptive VAD profile.

    Returns the optimal silence duration learned from previous sessions.
    """
    user_id = str(current_user.id)
    profile = await adaptive_vad_manager.get_user_profile(user_id)

    if profile:
        return VADProfileResponse(
            status="ok",
            optimal_silence_ms=profile.optimal_silence_duration_ms,
            is_adaptive=True,
        )
    else:
        return VADProfileResponse(
            status="ok",
            optimal_silence_ms=500,  # Default
            is_adaptive=False,
        )


@router.post(
    "/relay",
    response_model=VoiceRelayResponse,
    summary="Relay final voice transcript to RAG",
    description="Persists the user transcript, runs RAG, persists assistant reply, and returns the answer.",
)
@rate_limit(calls=30, period=60, key_prefix="voice_relay")  # 30 calls per minute per user
async def relay_voice_transcript(
    request: Request,  # Required for rate limiting
    payload: VoiceRelayRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Take a final voice transcript, run the medical RAG pipeline, and persist both sides of the exchange.

    This is intended to be called after the frontend receives a final transcription event from the Realtime
    voice session. It provides a low-latency path to get a clinical answer while keeping conversation history
    consistent between voice and text modes.
    """
    start_time = time.monotonic()

    # Persist user message first (idempotency handled at DB level if needed)
    try:
        session_uuid = uuid.UUID(payload.conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid conversation_id",
        )

    from app.api.conversations import get_session_or_404  # lazy import to avoid cycles

    session = get_session_or_404(db, session_uuid, current_user)

    user_message = Message(
        session_id=session.id,
        role="user",
        content=payload.transcript,
        message_metadata={
            "source": "voice_relay",
            "clinical_context_id": payload.clinical_context_id,
        },
    )
    db.add(user_message)
    session.message_count = (session.message_count or 0) + 1
    db.commit()
    db.refresh(user_message)

    # Run RAG pipeline with streaming disabled here (latency-focused)
    query_request = QueryRequest(
        session_id=str(session.id),
        query=payload.transcript,
        clinical_context_id=payload.clinical_context_id,
    )

    query_response = await voice_query_orchestrator.handle_query(query_request, trace_id=str(user_message.id))

    # Persist assistant message
    assistant_message = Message(
        session_id=session.id,
        role="assistant",
        content=query_response.answer,
        tokens=query_response.tokens,
        model=query_response.model,
        message_metadata={
            "source": "voice_relay",
            "citations": [c.dict() for c in query_response.citations],
            "finish_reason": query_response.finish_reason,
            "clinical_context_id": payload.clinical_context_id,
            "reply_time_ms": int((time.monotonic() - start_time) * 1000),
        },
    )
    db.add(assistant_message)
    session.message_count = (session.message_count or 0) + 1
    db.commit()
    db.refresh(assistant_message)

    duration_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        "Voice relay completed",
        extra={
            "user_id": current_user.id,
            "conversation_id": payload.conversation_id,
            "user_message_id": str(user_message.id),
            "assistant_message_id": str(assistant_message.id),
            "duration_ms": duration_ms,
        },
    )

    return VoiceRelayResponse(
        user_message_id=str(user_message.id),
        assistant_message_id=str(assistant_message.id),
        answer=query_response.answer,
        citations=[c.dict() for c in query_response.citations],
    )


@router.websocket("/relay-ws")
async def voice_relay_websocket(websocket: WebSocket, db: Session = Depends(get_db)):
    """
    Lightweight voice relay WebSocket.

    Protocol:
    Client -> Server:
    {
        "type": "transcript.final",
        "conversation_id": "<uuid>",
        "transcript": "<final user transcript>",
        "clinical_context_id": "<optional>"
    }

    Server -> Client:
    - chunk events:
      {"type": "chunk", "content": "<partial answer>"}
    - final:
      {"type": "done", "answer": "<full answer>", "citations": [...]}
    - error:
      {"type": "error", "message": "<reason>"}
    """
    await websocket.accept()
    connection_start = time.monotonic()
    try:
        # Basic token auth via query param `token`
        token = websocket.query_params.get("token")
        if not token:
            await websocket.send_json({"type": "error", "message": "Unauthorized: missing token"})
            await websocket.close(code=1008)
            return

        payload = verify_token(token)
        if not payload or payload.get("type") != "access":
            await websocket.send_json({"type": "error", "message": "Unauthorized: invalid token"})
            await websocket.close(code=1008)
            return

        user_id = payload.get("sub")

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type != "transcript.final":
                await websocket.send_json({"type": "error", "message": "Unknown message type"})
                continue

            transcript = data.get("transcript") or ""
            conversation_id = data.get("conversation_id")
            clinical_context_id = data.get("clinical_context_id")

            ttfb_start = time.monotonic()

            try:
                session_uuid = uuid.UUID(conversation_id)
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid conversation_id"})
                continue

            session: ChatSession | None = db.query(ChatSession).filter(ChatSession.id == session_uuid).first()
            if not session or str(session.user_id) != str(user_id):
                await websocket.send_json({"type": "error", "message": "Conversation not found"})
                continue

            # Persist user message
            user_message = Message(
                session_id=session.id,
                role="user",
                content=transcript,
                message_metadata={
                    "source": "voice_ws_relay",
                    "clinical_context_id": clinical_context_id,
                },
            )
            db.add(user_message)
            session.message_count = (session.message_count or 0) + 1
            db.commit()
            db.refresh(user_message)

            query_request = QueryRequest(
                session_id=str(session.id),
                query=transcript,
                clinical_context_id=clinical_context_id,
            )

            full_answer_parts: list[str] = []

            async def emit_chunk(chunk: str):
                full_answer_parts.append(chunk)
                await websocket.send_json({"type": "chunk", "content": chunk})

            query_response = await voice_query_orchestrator.stream_query(
                query_request, trace_id=str(user_message.id), on_chunk=emit_chunk
            )
            voice_first_audio_latency_seconds.observe(time.monotonic() - ttfb_start)

            # Persist assistant message
            assistant_message = Message(
                session_id=session.id,
                role="assistant",
                content=query_response.answer,
                tokens=query_response.tokens,
                model=query_response.model,
                message_metadata={
                    "source": "voice_ws_relay",
                    "citations": [c.dict() for c in query_response.citations],
                    "finish_reason": query_response.finish_reason,
                    "clinical_context_id": clinical_context_id,
                },
            )
            db.add(assistant_message)
            session.message_count = (session.message_count or 0) + 1
            db.commit()

            await websocket.send_json(
                {
                    "type": "done",
                    "answer": query_response.answer,
                    "citations": [c.dict() for c in query_response.citations],
                    "user_message_id": str(user_message.id),
                    "assistant_message_id": str(assistant_message.id),
                }
            )

            # Metrics
            ttfb = time.monotonic() - ttfb_start
            voice_proxy_ttfb_seconds.observe(ttfb)
            relay_duration = time.monotonic() - connection_start
            voice_relay_latency_seconds.labels(path="ws").observe(relay_duration)

    except WebSocketDisconnect:
        logger.info("Voice relay websocket disconnected")
    except Exception as exc:  # noqa: BLE001
        logger.error("Voice relay websocket error: %s", exc, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
        await websocket.close(code=1011)


# ==============================================================================
# Voice Authentication Endpoints
# ==============================================================================


@router.post(
    "/auth/enroll/start",
    response_model=VoiceAuthStartResponse,
    summary="Start voice enrollment",
    description="Begin voice biometric enrollment process",
)
async def start_voice_enrollment(
    current_user: User = Depends(get_current_user),
):
    """
    Start voice enrollment for the authenticated user.

    The enrollment process requires multiple voice samples (typically 3-10)
    to create a reliable voice print for speaker verification.
    """
    user_id = str(current_user.id)

    # Check if already enrolled
    if voice_auth_service.is_enrolled(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already enrolled. Delete existing voice print first.",
        )

    # Start enrollment session
    voice_auth_service.start_enrollment(user_id)

    logger.info(
        f"Started voice enrollment for user {user_id}",
        extra={"user_id": user_id},
    )

    return VoiceAuthStartResponse(
        status="in_progress",
        message="Enrollment started. Please provide voice samples.",
        min_samples=voice_auth_service.config.min_enrollment_samples,
        max_samples=voice_auth_service.config.max_enrollment_samples,
    )


@router.post(
    "/auth/enroll/sample",
    response_model=VoiceAuthSampleResponse,
    summary="Add enrollment sample",
    description="Add a voice sample to the enrollment process",
)
async def add_enrollment_sample(
    audio: UploadFile = File(..., description="Voice sample (WAV/PCM16)"),
    current_user: User = Depends(get_current_user),
):
    """
    Add a voice sample to the enrollment process.

    The audio should be clear speech (2-10 seconds) with minimal background noise.
    """
    user_id = str(current_user.id)

    # Read audio data
    audio_data = await audio.read()

    # Validate size (max 5MB)
    if len(audio_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large (max 5MB)",
        )

    # Add sample
    success, message = voice_auth_service.add_enrollment_sample(user_id, audio_data)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    # Get current status
    status_info = voice_auth_service.get_enrollment_status(user_id)
    samples_collected = status_info.get("sample_count", 0)
    samples_needed = max(0, voice_auth_service.config.min_enrollment_samples - samples_collected)

    return VoiceAuthSampleResponse(
        success=True,
        message=message,
        samples_collected=samples_collected,
        samples_needed=samples_needed,
    )


@router.post(
    "/auth/enroll/complete",
    response_model=VoiceAuthCompleteResponse,
    summary="Complete voice enrollment",
    description="Finalize voice enrollment and create voice print",
)
async def complete_voice_enrollment(
    current_user: User = Depends(get_current_user),
):
    """
    Complete the voice enrollment process and create the voice print.

    Must have collected minimum required samples before calling.
    """
    user_id = str(current_user.id)

    success, message = voice_auth_service.complete_enrollment(user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    logger.info(
        f"Completed voice enrollment for user {user_id}",
        extra={"user_id": user_id},
    )

    return VoiceAuthCompleteResponse(
        success=True,
        message=message,
    )


@router.post(
    "/auth/verify",
    response_model=VoiceAuthVerifyResponse,
    summary="Verify voice",
    description="Verify speaker identity using voice biometrics",
)
async def verify_voice(
    audio: UploadFile = File(..., description="Voice sample for verification"),
    current_user: User = Depends(get_current_user),
):
    """
    Verify the speaker's identity using their voice.

    Compares the provided audio against the enrolled voice print.
    """
    user_id = str(current_user.id)

    # Check if enrolled
    if not voice_auth_service.is_enrolled(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not enrolled. Complete enrollment first.",
        )

    # Read audio data
    audio_data = await audio.read()

    # Validate size
    if len(audio_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large (max 5MB)",
        )

    # Verify
    result = voice_auth_service.verify(user_id, audio_data)

    logger.info(
        f"Voice verification for user {user_id}: {result.status.value}",
        extra={
            "user_id": user_id,
            "verified": result.verified,
            "confidence": result.confidence,
        },
    )

    return VoiceAuthVerifyResponse(
        verified=result.verified,
        confidence=result.confidence,
        status=result.status.value,
        details=result.details,
    )


@router.get(
    "/auth/status",
    response_model=VoiceAuthStatusResponse,
    summary="Get enrollment status",
    description="Get voice biometric enrollment status for current user",
)
async def get_voice_auth_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get the voice biometric enrollment status for the authenticated user.
    """
    user_id = str(current_user.id)
    status_info = voice_auth_service.get_enrollment_status(user_id)

    return VoiceAuthStatusResponse(
        enrolled=status_info["status"] == "enrolled",
        status=status_info["status"],
        sample_count=status_info.get("sample_count"),
        created_at=status_info.get("created_at"),
    )


@router.delete(
    "/auth/voiceprint",
    summary="Delete voice print",
    description="Delete enrolled voice print for current user",
)
async def delete_voice_print(
    current_user: User = Depends(get_current_user),
):
    """
    Delete the enrolled voice print for the authenticated user.

    This allows re-enrollment with fresh samples.
    """
    user_id = str(current_user.id)

    if not voice_auth_service.is_enrolled(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No voice print found for user",
        )

    voice_auth_service.delete_voice_print(user_id)

    logger.info(
        f"Deleted voice print for user {user_id}",
        extra={"user_id": user_id},
    )

    return {"status": "deleted", "message": "Voice print deleted successfully"}


# ==============================================================================
# Voice Preferences Endpoints
# ==============================================================================


@router.get(
    "/preferences",
    response_model=VoicePreferencesResponse,
    summary="Get user voice preferences",
    description="Get the authenticated user's voice/TTS preferences",
)
async def get_voice_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the user's voice preferences.

    Returns current TTS provider, voice selection, and audio parameters.
    Creates default preferences if none exist.
    """
    user_id = current_user.id

    # Get or create preferences
    prefs = db.query(UserVoicePreferences).filter(UserVoicePreferences.user_id == user_id).first()

    if not prefs:
        # Create default preferences
        prefs = UserVoicePreferences.get_default_preferences(user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

        logger.info(
            f"Created default voice preferences for user {user_id}",
            extra={"user_id": str(user_id)},
        )

    return VoicePreferencesResponse(
        id=str(prefs.id),
        user_id=str(prefs.user_id),
        tts_provider=prefs.tts_provider,
        openai_voice_id=prefs.openai_voice_id,
        elevenlabs_voice_id=prefs.elevenlabs_voice_id,
        speech_rate=prefs.speech_rate,
        stability=prefs.stability,
        similarity_boost=prefs.similarity_boost,
        style=prefs.style,
        speaker_boost=prefs.speaker_boost,
        auto_play=prefs.auto_play,
        context_aware_style=prefs.context_aware_style,
        preferred_language=prefs.preferred_language,
        created_at=prefs.created_at.isoformat() if prefs.created_at else None,
        updated_at=prefs.updated_at.isoformat() if prefs.updated_at else None,
    )


@router.put(
    "/preferences",
    response_model=VoicePreferencesResponse,
    summary="Update user voice preferences",
    description="Update the authenticated user's voice/TTS preferences",
)
async def update_voice_preferences(
    request: VoicePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the user's voice preferences.

    Only provided fields are updated; others retain current values.
    Creates preferences if none exist.
    """
    user_id = current_user.id

    # Get or create preferences
    prefs = db.query(UserVoicePreferences).filter(UserVoicePreferences.user_id == user_id).first()

    if not prefs:
        prefs = UserVoicePreferences.get_default_preferences(user_id)
        db.add(prefs)
        db.flush()

    # Update only provided fields
    update_fields = request.model_dump(exclude_unset=True, exclude_none=True)

    # Validate speech_rate range
    if "speech_rate" in update_fields:
        update_fields["speech_rate"] = max(0.5, min(2.0, update_fields["speech_rate"]))

    # Validate 0-1 ranges
    for field in ["stability", "similarity_boost", "style"]:
        if field in update_fields:
            update_fields[field] = max(0.0, min(1.0, update_fields[field]))

    # Validate tts_provider
    if "tts_provider" in update_fields:
        if update_fields["tts_provider"] not in ["openai", "elevenlabs"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tts_provider must be 'openai' or 'elevenlabs'",
            )

    # Validate openai_voice_id
    valid_openai_voices = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
    if "openai_voice_id" in update_fields:
        if update_fields["openai_voice_id"] not in valid_openai_voices:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"openai_voice_id must be one of: {', '.join(valid_openai_voices)}",
            )

    # Apply updates
    for field, value in update_fields.items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)

    logger.info(
        f"Updated voice preferences for user {user_id}",
        extra={
            "user_id": str(user_id),
            "updated_fields": list(update_fields.keys()),
        },
    )

    return VoicePreferencesResponse(
        id=str(prefs.id),
        user_id=str(prefs.user_id),
        tts_provider=prefs.tts_provider,
        openai_voice_id=prefs.openai_voice_id,
        elevenlabs_voice_id=prefs.elevenlabs_voice_id,
        speech_rate=prefs.speech_rate,
        stability=prefs.stability,
        similarity_boost=prefs.similarity_boost,
        style=prefs.style,
        speaker_boost=prefs.speaker_boost,
        auto_play=prefs.auto_play,
        context_aware_style=prefs.context_aware_style,
        preferred_language=prefs.preferred_language,
        created_at=prefs.created_at.isoformat() if prefs.created_at else None,
        updated_at=prefs.updated_at.isoformat() if prefs.updated_at else None,
    )


@router.post(
    "/preferences/reset",
    response_model=VoicePreferencesResponse,
    summary="Reset voice preferences to defaults",
    description="Reset the authenticated user's voice preferences to default values",
)
async def reset_voice_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reset the user's voice preferences to default values.

    This deletes existing preferences and creates new ones with defaults.
    """
    user_id = current_user.id

    # Delete existing preferences
    db.query(UserVoicePreferences).filter(UserVoicePreferences.user_id == user_id).delete()

    # Create new default preferences
    prefs = UserVoicePreferences.get_default_preferences(user_id)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)

    logger.info(
        f"Reset voice preferences for user {user_id}",
        extra={"user_id": str(user_id)},
    )

    return VoicePreferencesResponse(
        id=str(prefs.id),
        user_id=str(prefs.user_id),
        tts_provider=prefs.tts_provider,
        openai_voice_id=prefs.openai_voice_id,
        elevenlabs_voice_id=prefs.elevenlabs_voice_id,
        speech_rate=prefs.speech_rate,
        stability=prefs.stability,
        similarity_boost=prefs.similarity_boost,
        style=prefs.style,
        speaker_boost=prefs.speaker_boost,
        auto_play=prefs.auto_play,
        context_aware_style=prefs.context_aware_style,
        preferred_language=prefs.preferred_language,
        created_at=prefs.created_at.isoformat() if prefs.created_at else None,
        updated_at=prefs.updated_at.isoformat() if prefs.updated_at else None,
    )


@router.get(
    "/style-presets",
    response_model=VoiceStylePresetsListResponse,
    summary="Get voice style presets",
    description="Get all available voice style presets for context-aware TTS",
)
async def get_voice_style_presets(
    current_user: User = Depends(get_current_user),
):
    """
    Get all available voice style presets.

    These presets define TTS parameters for different content contexts:
    - CALM: Default medical explanations
    - URGENT: Medical warnings/emergencies
    - EMPATHETIC: Sensitive health topics
    - INSTRUCTIONAL: Step-by-step guidance
    - CONVERSATIONAL: General chat
    """
    presets = voice_style_detector.get_all_presets()

    logger.debug(
        f"Retrieved voice style presets for user {current_user.id}",
        extra={"user_id": str(current_user.id), "preset_count": len(presets)},
    )

    return VoiceStylePresetsListResponse(presets=presets)


# ==============================================================================
# Thinker/Talker Voice Pipeline WebSocket
# ==============================================================================


@router.websocket("/pipeline-ws")
async def voice_pipeline_websocket(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """
    Thinker/Talker voice pipeline WebSocket.

    This endpoint provides a unified voice experience using:
    - Deepgram for streaming STT
    - GPT-4o for reasoning (with full tool/RAG support)
    - ElevenLabs for streaming TTS

    Benefits over /relay-ws:
    - Unified conversation context with chat mode
    - Full tool calling support in voice
    - Better TTS quality with ElevenLabs
    - Lower latency through streaming at all stages

    Protocol (Client -> Server):
    - audio.input: {"type": "audio.input", "audio": "<base64 PCM16>"}
    - audio.input.complete: {"type": "audio.input.complete"}
    - message: {"type": "message", "content": "<text>"}
    - barge_in: {"type": "barge_in"}
    - voice.mode: {"type": "voice.mode", "mode": "activate|deactivate"}

    Protocol (Server -> Client):
    - session.ready: Pipeline is ready
    - transcript.delta: Partial/final transcript
    - transcript.complete: Complete user transcript
    - response.delta: LLM response token
    - response.complete: Complete AI response
    - audio.output: TTS audio chunk
    - tool.call: Tool being called
    - tool.result: Tool result
    - voice.state: Pipeline state
    - error: Error message

    Query Parameters:
    - token: JWT auth token
    - conversation_id: Optional conversation ID
    - voice_id: Optional ElevenLabs voice ID
    - language: Optional language code (default: en)
    """
    # Get query parameters
    token = websocket.query_params.get("token")
    conversation_id = websocket.query_params.get("conversation_id")
    voice_id = websocket.query_params.get("voice_id", settings.ELEVENLABS_VOICE_ID)
    language = websocket.query_params.get("language", "en")

    # Validate token
    if not token:
        await websocket.accept()
        await websocket.send_json({"type": "error", "code": "auth_required", "message": "Missing token"})
        await websocket.close(code=1008)
        return

    try:
        payload = verify_token_func(token, token_type="access")
        if not payload:
            raise ValueError("Invalid or expired token")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Invalid token: missing user ID")
    except Exception as e:
        await websocket.accept()
        await websocket.send_json({"type": "error", "code": "auth_failed", "message": str(e)})
        await websocket.close(code=1008)
        return

    # Check if pipeline is available
    if not voice_pipeline_service.is_available():
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "code": "pipeline_unavailable",
                "message": "Voice pipeline not available. Check DEEPGRAM_API_KEY and ELEVENLABS_API_KEY.",
            }
        )
        await websocket.close(code=1011)
        return

    # Create session config
    session_id = str(uuid.uuid4())
    config = TTSessionConfig(
        user_id=user_id,
        session_id=session_id,
        conversation_id=conversation_id,
        voice_id=voice_id,
        language=language,
        barge_in_enabled=settings.BARGE_IN_ENABLED,
    )

    # Create handler
    try:
        handler = await thinker_talker_session_manager.create_session(
            websocket=websocket,
            config=config,
        )
    except ValueError as e:
        await websocket.accept()
        await websocket.send_json({"type": "error", "code": "session_limit", "message": str(e)})
        await websocket.close(code=1013)
        return

    # Track metrics
    voice_sessions_total.labels(status="started").inc()

    connection_start = time.monotonic()

    try:
        # Start handler
        if not await handler.start():
            logger.error(f"Failed to start T/T handler: {session_id}")
            return

        # Wait for handler to complete (runs until disconnect or error)
        while handler._running:
            await asyncio.sleep(1)

    except WebSocketDisconnect:
        logger.info(f"T/T WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"T/T WebSocket error: {e}")
    finally:
        # Cleanup
        metrics = await handler.stop()
        await thinker_talker_session_manager.remove_session(session_id)

        # Record session duration
        duration = time.monotonic() - connection_start
        voice_session_duration_seconds.observe(duration)

        logger.info(
            f"T/T session ended: {session_id}",
            extra={
                "duration_sec": duration,
                "utterances": metrics.user_utterance_count,
                "responses": metrics.ai_response_count,
            },
        )


@router.get(
    "/pipeline/status",
    summary="Get voice pipeline status",
    description="Check if the Thinker/Talker voice pipeline is available",
)
async def get_pipeline_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get the status of the Thinker/Talker voice pipeline.

    Returns availability of each component:
    - STT (Deepgram)
    - LLM (OpenAI)
    - TTS (ElevenLabs)
    """
    from app.services.streaming_stt_service import streaming_stt_service
    from app.services.talker_service import talker_service

    return {
        "pipeline_available": voice_pipeline_service.is_available(),
        "mode": settings.VOICE_PIPELINE_MODE,
        "components": {
            "stt": {
                "streaming_available": streaming_stt_service.is_streaming_available(),
                "fallback_available": streaming_stt_service.is_fallback_available(),
                "primary_provider": settings.VOICE_PIPELINE_STT_PRIMARY,
                "fallback_provider": settings.VOICE_PIPELINE_STT_FALLBACK,
            },
            "tts": {
                "available": talker_service.is_enabled(),
                "provider": settings.VOICE_PIPELINE_TTS_PROVIDER,
                "default_voice": settings.ELEVENLABS_VOICE_ID,
            },
            "llm": {
                "model": settings.VOICE_PIPELINE_LLM_MODEL,
            },
        },
        "settings": {
            "barge_in_enabled": settings.BARGE_IN_ENABLED,
            "target_latency_ms": settings.TARGET_TOTAL_LATENCY_MS,
        },
        "active_sessions": thinker_talker_session_manager.get_active_session_count(),
    }
