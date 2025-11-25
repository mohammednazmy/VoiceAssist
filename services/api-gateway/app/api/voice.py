"""
Voice API endpoints
Handles audio transcription, speech synthesis, and Realtime API sessions

Providers:
- OpenAI Whisper/TTS (default)
- OpenAI Realtime API (WebSocket-based voice mode)
- Stubs for future providers (Azure/GCP/ElevenLabs) using config
"""

import time

import httpx
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.core.metrics import (
    voice_connection_time_seconds,
    voice_reconnects_total,
    voice_response_latency_seconds,
    voice_session_duration_seconds,
    voice_sessions_total,
    voice_slo_violations_total,
    voice_stt_latency_seconds,
    voice_transcripts_total,
)
from app.core.sentry import capture_slo_violation
from app.core.slo import check_slo_violations, log_slo_violations
from app.models.user import User
from app.services.realtime_voice_service import realtime_voice_service
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

logger = get_logger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


class SynthesizeRequest(BaseModel):
    """Request model for speech synthesis"""

    text: str
    voiceId: str | None = None


class TranscribeResponse(BaseModel):
    """Response model for audio transcription"""

    text: str


class RealtimeSessionRequest(BaseModel):
    """Request model for Realtime session configuration"""

    conversation_id: str | None = None
    # Optional Voice Mode settings from frontend
    voice: str | None = None  # "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    language: str | None = None  # "en" | "es" | "fr" | "de" | "it" | "pt"
    vad_sensitivity: int | None = None  # 0-100 (maps to VAD threshold)


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
    description="Convert text to speech using OpenAI TTS API",
    response_class=Response,  # Return raw audio
)
async def synthesize_speech(
    request: SynthesizeRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Synthesize speech from text using OpenAI TTS.

    Args:
        request: SynthesizeRequest with text and optional voiceId
        current_user: Authenticated user

    Returns:
        Audio file (mp3 format)
    """
    logger.info(
        f"Synthesizing speech for user {current_user.id}",
        extra={
            "user_id": current_user.id,
            "text_length": len(request.text),
            "voice_id": request.voiceId,
        },
    )

    # Validate text length
    if len(request.text) > 4096:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text too long (max 4096 characters)",
        )

    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty",
        )

    try:
        # For now only OpenAI provider is wired;
        # config placeholders allow future providers
        provider = settings.TTS_PROVIDER or "openai"

        if provider != "openai":
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail=f"TTS provider '{provider}' not implemented",
            )

        openai_api_key = settings.OPENAI_API_KEY
        if not openai_api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OpenAI API key not configured",
            )

        # Use OpenAI TTS API
        # Available voices: alloy, echo, fable, onyx, nova, shimmer
        voice = request.voiceId or settings.TTS_VOICE or "alloy"

        async with httpx.AsyncClient(timeout=settings.OPENAI_TIMEOUT_SEC) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",  # or tts-1-hd for higher quality
                    "input": request.text,
                    "voice": voice,
                    "response_format": "mp3",
                },
            )

            if response.status_code != 200:
                logger.error(
                    f"OpenAI TTS failed: {response.text}",
                    extra={
                        "status_code": response.status_code,
                        "user_id": current_user.id,
                    },
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Speech synthesis failed",
                )

            audio_content = response.content

            logger.info(
                f"Speech synthesis successful for user {current_user.id}",
                extra={
                    "user_id": current_user.id,
                    "audio_size": len(audio_content),
                    "voice": voice,
                },
            )

            # Return raw audio with proper content type
            return Response(
                content=audio_content,
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": "attachment; filename=speech.mp3",
                },
            )

    except httpx.TimeoutException:
        logger.error(
            "Speech synthesis timeout",
            extra={"user_id": current_user.id},
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Speech synthesis request timed out",
        )
    except Exception as e:
        logger.error(
            f"Speech synthesis error: {str(e)}",
            extra={"user_id": current_user.id, "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {str(e)}",
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


@router.post(
    "/metrics",
    response_model=VoiceMetricsResponse,
    summary="Submit voice session metrics",
    description="Submit timing and count metrics from a voice session",
)
async def post_voice_metrics(
    payload: VoiceMetricsPayload,
    current_user: User = Depends(get_current_user),
) -> VoiceMetricsResponse:
    """
    Submit voice session metrics for observability.

    This endpoint receives timing and count metrics from frontend voice sessions.
    No transcript content or PHI is sent - only timing and counts.

    Metrics flow:
    1. Logged with structured logging
    2. Recorded to Prometheus histograms/counters
    3. Checked against SLO thresholds
    4. SLO violations logged and sent to Sentry

    Args:
        payload: VoiceMetricsPayload with timing and count metrics
        current_user: Authenticated user

    Returns:
        VoiceMetricsResponse with status "ok"
    """
    user_id = str(current_user.id)

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
        voice_response_latency_seconds.observe(
            payload.last_response_latency_ms / 1000.0
        )

    if payload.session_duration_ms is not None:
        voice_session_duration_seconds.observe(payload.session_duration_ms / 1000.0)
        # Mark session as completed (we only receive metrics for completed sessions)
        voice_sessions_total.labels(status="completed").inc()

    if payload.user_transcript_count > 0:
        voice_transcripts_total.labels(direction="user").inc(
            payload.user_transcript_count
        )

    if payload.ai_response_count > 0:
        voice_transcripts_total.labels(direction="ai").inc(payload.ai_response_count)

    if payload.reconnect_count > 0:
        voice_reconnects_total.inc(payload.reconnect_count)

    # 3. Check SLO thresholds
    violations = check_slo_violations(
        connection_time_ms=(
            float(payload.connection_time_ms) if payload.connection_time_ms else None
        ),
        stt_latency_ms=(
            float(payload.last_stt_latency_ms) if payload.last_stt_latency_ms else None
        ),
        response_latency_ms=(
            float(payload.last_response_latency_ms)
            if payload.last_response_latency_ms
            else None
        ),
        time_to_first_transcript_ms=(
            float(payload.time_to_first_transcript_ms)
            if payload.time_to_first_transcript_ms
            else None
        ),
    )

    # 4. Handle SLO violations
    if violations:
        # Log violations
        log_slo_violations(
            violations, user_id=user_id, conversation_id=payload.conversation_id
        )

        # Record to Prometheus
        for violation in violations:
            voice_slo_violations_total.labels(
                metric=violation.metric.value, severity=violation.severity
            ).inc()

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
