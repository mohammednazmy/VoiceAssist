"""
Voice API endpoints
Handles audio transcription, speech synthesis, and Realtime API sessions

Providers:
- OpenAI Whisper/TTS (default)
- OpenAI Realtime API (WebSocket-based voice mode)
- Stubs for future providers (Azure/GCP/ElevenLabs) using config
"""

import httpx
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
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


class RealtimeSessionResponse(BaseModel):
    """Response model for Realtime session configuration"""

    url: str
    model: str
    api_key: str
    session_id: str
    expires_at: int
    conversation_id: str | None
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
        # For now only OpenAI provider is wired; config placeholders allow future providers
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
    description="Generate session configuration for OpenAI Realtime API (WebSocket-based voice mode)",
)
async def create_realtime_session(
    request: RealtimeSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a Realtime API session for voice mode.

    This endpoint generates ephemeral session configuration that the frontend
    uses to establish a WebSocket connection to OpenAI's Realtime API.

    Args:
        request: RealtimeSessionRequest with optional conversation_id
        current_user: Authenticated user

    Returns:
        RealtimeSessionResponse with session configuration including:
        - WebSocket URL
        - Model name
        - API key (ephemeral or full)
        - Session ID
        - Expiry timestamp
        - Voice configuration (voice, modalities, VAD settings)

    Raises:
        HTTPException: If Realtime API is not enabled or configured
    """
    logger.info(
        f"Creating Realtime session for user {current_user.id}",
        extra={
            "user_id": current_user.id,
            "conversation_id": request.conversation_id,
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
        config = realtime_voice_service.generate_session_config(
            user_id=str(current_user.id),
            conversation_id=request.conversation_id,
        )

        logger.info(
            f"Realtime session created for user {current_user.id}",
            extra={
                "user_id": current_user.id,
                "session_id": config["session_id"],
                "expires_at": config["expires_at"],
            },
        )

        return RealtimeSessionResponse(**config)

    except ValueError as e:
        logger.error(
            f"Failed to create Realtime session: {str(e)}",
            extra={"user_id": current_user.id, "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.error(
            f"Realtime session error: {str(e)}",
            extra={"user_id": current_user.id, "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Realtime session: {str(e)}",
        )
