"""
Voice API endpoints
Handles audio transcription, speech synthesis, and Realtime API sessions

Providers:
- OpenAI Whisper/TTS (default)
- OpenAI Realtime API (WebSocket-based voice mode)
- Stubs for future providers (Azure/GCP/ElevenLabs) using config
"""

import time
import uuid

import httpx
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
from app.services.rag_service import QueryOrchestrator, QueryRequest
from app.services.realtime_voice_service import realtime_voice_service
from app.services.voice_authentication import voice_auth_service
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

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
    audio_enhancements: dict | None = None


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
            external_api_requests_total.labels(service="openai", endpoint="audio/speech", status_code="pending").inc()
            tts_start = time.monotonic()
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
                external_api_requests_total.labels(
                    service="openai", endpoint="audio/speech", status_code=str(response.status_code)
                ).inc()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Speech synthesis failed",
                )

            latency = time.monotonic() - tts_start
            external_api_requests_total.labels(
                service="openai", endpoint="audio/speech", status_code=str(response.status_code)
            ).inc()
            external_api_duration_seconds.labels(service="openai", endpoint="audio/speech").observe(latency)

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
        message_metadata={"source": "voice_relay", "clinical_context_id": payload.clinical_context_id},
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
                message_metadata={"source": "voice_ws_relay", "clinical_context_id": clinical_context_id},
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
