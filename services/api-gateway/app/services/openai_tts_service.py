"""
OpenAI TTS Service

Fallback TTS provider using OpenAI's text-to-speech API.
Provides streaming audio synthesis as a resilient alternative to ElevenLabs.

Phase: Voice Feature Hardening
- TTS Provider Failover implementation
- Automatic fallback when ElevenLabs is unavailable
- Circuit breaker protection

Voices:
- alloy: Balanced, versatile
- echo: Warm, natural
- fable: British, expressive
- onyx: Deep, authoritative (male)
- nova: Friendly, conversational (female)
- shimmer: Clear, warm (female)
"""

import time
from dataclasses import dataclass
from typing import AsyncIterator, List, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.core.resilience import openai_tts_breaker, retry_openai_tts_operation
from pybreaker import CircuitBreakerError

logger = get_logger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class OpenAIVoice:
    """Metadata for an OpenAI TTS voice."""

    voice_id: str
    name: str
    description: str
    gender: str  # "male", "female", "neutral"


@dataclass
class OpenAITTSResult:
    """Result of OpenAI TTS synthesis."""

    audio_data: bytes
    content_type: str  # "audio/mpeg", "audio/opus", "audio/aac", "audio/flac", "audio/pcm"
    latency_ms: int
    voice_id: str
    model: str


# ==============================================================================
# Voice Catalog
# ==============================================================================

OPENAI_VOICES: List[OpenAIVoice] = [
    OpenAIVoice(
        voice_id="alloy",
        name="Alloy",
        description="Balanced and versatile voice",
        gender="neutral",
    ),
    OpenAIVoice(
        voice_id="echo",
        name="Echo",
        description="Warm and natural voice",
        gender="male",
    ),
    OpenAIVoice(
        voice_id="fable",
        name="Fable",
        description="British, expressive voice",
        gender="neutral",
    ),
    OpenAIVoice(
        voice_id="onyx",
        name="Onyx",
        description="Deep, authoritative voice",
        gender="male",
    ),
    OpenAIVoice(
        voice_id="nova",
        name="Nova",
        description="Friendly, conversational voice",
        gender="female",
    ),
    OpenAIVoice(
        voice_id="shimmer",
        name="Shimmer",
        description="Clear, warm voice",
        gender="female",
    ),
]

# Voice ID mapping: ElevenLabs voice ID -> OpenAI voice
ELEVENLABS_TO_OPENAI_VOICE_MAP = {
    # Premium male voices -> onyx or echo
    "pNInz6obpgDQGcFmaJgB": "onyx",  # Adam -> onyx
    "TxGEqnHWrfWFTfGW9XjX": "echo",  # Josh -> echo
    "ErXwobaYiN019PkySvjV": "echo",  # Antoni -> echo
    "VR6AewLTigWG4xSOukaG": "onyx",  # Arnold -> onyx
    "yoZ06aMxZJJ28mfd3POQ": "echo",  # Sam -> echo
    # Premium female voices -> nova or shimmer
    "EXAVITQu4vr4xnSDxMaL": "nova",  # Bella -> nova
    "21m00Tcm4TlvDq8ikWAM": "shimmer",  # Rachel -> shimmer
    "AZnzlk1XvdvUeBnXmlld": "nova",  # Domi -> nova
    "MF3mGyEYCl7XYWbV9V6O": "shimmer",  # Elli -> shimmer
}


def map_elevenlabs_voice_to_openai(elevenlabs_voice_id: str) -> str:
    """
    Map an ElevenLabs voice ID to the closest OpenAI voice.

    Args:
        elevenlabs_voice_id: ElevenLabs voice ID

    Returns:
        OpenAI voice ID (defaults to "alloy" if not mapped)
    """
    return ELEVENLABS_TO_OPENAI_VOICE_MAP.get(elevenlabs_voice_id, "alloy")


# ==============================================================================
# Service Implementation
# ==============================================================================


class OpenAITTSService:
    """
    OpenAI Text-to-Speech service for fallback TTS.

    Features:
    - Streaming audio for low latency playback
    - Multiple voice options
    - HD quality model option
    - Circuit breaker protection
    - Connection warming for reduced latency

    Models:
    - tts-1: Optimized for speed (lower latency)
    - tts-1-hd: Optimized for quality (higher latency)
    """

    # API endpoints
    BASE_URL = "https://api.openai.com/v1"
    TTS_ENDPOINT = "/audio/speech"

    # Models
    MODEL_STANDARD = "tts-1"  # Fast, optimized for real-time
    MODEL_HD = "tts-1-hd"  # Higher quality, more latency

    # Output formats
    FORMAT_MP3 = "mp3"  # Default, widely supported
    FORMAT_OPUS = "opus"  # Efficient for web/streaming
    FORMAT_AAC = "aac"  # Good for mobile
    FORMAT_FLAC = "flac"  # Lossless
    FORMAT_PCM = "pcm"  # Raw audio (16-bit little-endian)

    # Limits
    MAX_TEXT_LENGTH = 4096

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.enabled = bool(self.api_key)
        self.default_model = self.MODEL_STANDARD  # Prioritize speed for voice
        self.default_voice = "alloy"
        self._connection_warmed = False
        self._http_client: Optional[httpx.AsyncClient] = None

    def is_enabled(self) -> bool:
        """Check if OpenAI TTS is enabled and configured."""
        return self.enabled

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create the persistent HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=60.0,
                limits=httpx.Limits(
                    max_keepalive_connections=5,
                    max_connections=10,
                ),
            )
        return self._http_client

    async def warm_connection(self) -> bool:
        """
        Pre-warm the HTTP connection to OpenAI API.

        Establishes TCP + TLS connection to reduce first-request latency.

        Returns:
            True if connection was warmed successfully
        """
        if not self.enabled:
            return False

        if self._connection_warmed:
            return True

        try:
            client = await self._get_http_client()
            # Simple HEAD request to establish connection
            response = await client.head(
                f"{self.BASE_URL}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            self._connection_warmed = response.status_code in (200, 401, 403)
            logger.debug(
                "OpenAI TTS connection warmed",
                extra={"status_code": response.status_code},
            )
            return self._connection_warmed
        except Exception as e:
            logger.warning(f"Failed to warm OpenAI TTS connection: {e}")
            return False

    def get_voices(self) -> List[OpenAIVoice]:
        """Get available OpenAI TTS voices."""
        return OPENAI_VOICES.copy()

    @retry_openai_tts_operation(max_attempts=2)
    async def synthesize(
        self,
        text: str,
        voice: str = "alloy",
        model: str = "tts-1",
        speed: float = 1.0,
        response_format: str = "mp3",
    ) -> OpenAITTSResult:
        """
        Synthesize speech from text (non-streaming).

        Args:
            text: Text to synthesize (max 4096 chars)
            voice: Voice ID (alloy, echo, fable, onyx, nova, shimmer)
            model: Model to use (tts-1, tts-1-hd)
            speed: Speech speed (0.25 to 4.0)
            response_format: Output format (mp3, opus, aac, flac, pcm)

        Returns:
            OpenAITTSResult with audio data

        Raises:
            ValueError: If service is disabled or request fails
            CircuitBreakerError: If circuit breaker is open
        """
        if not self.enabled:
            raise ValueError("OpenAI TTS is not configured")

        if len(text) > self.MAX_TEXT_LENGTH:
            raise ValueError(f"Text exceeds maximum length of {self.MAX_TEXT_LENGTH}")

        # Check circuit breaker
        try:
            openai_tts_breaker.call(lambda: None)
        except CircuitBreakerError:
            logger.error("OpenAI TTS circuit breaker is OPEN - failing fast")
            raise

        start_time = time.time()

        try:
            client = await self._get_http_client()
            response = await client.post(
                f"{self.BASE_URL}{self.TTS_ENDPOINT}",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": text,
                    "voice": voice,
                    "response_format": response_format,
                    "speed": max(0.25, min(4.0, speed)),
                },
            )

            if response.status_code != 200:
                error_text = response.text
                logger.error(
                    "OpenAI TTS synthesis failed",
                    extra={
                        "status_code": response.status_code,
                        "error": error_text[:200],
                    },
                )
                raise ValueError(f"OpenAI TTS failed: {response.status_code}")

            audio_data = response.content
            latency_ms = int((time.time() - start_time) * 1000)

            # Content type mapping
            content_type_map = {
                "mp3": "audio/mpeg",
                "opus": "audio/opus",
                "aac": "audio/aac",
                "flac": "audio/flac",
                "pcm": "audio/pcm",
            }

            logger.info(
                "OpenAI TTS synthesis complete",
                extra={
                    "voice": voice,
                    "model": model,
                    "text_length": len(text),
                    "audio_size": len(audio_data),
                    "latency_ms": latency_ms,
                },
            )

            return OpenAITTSResult(
                audio_data=audio_data,
                content_type=content_type_map.get(response_format, "audio/mpeg"),
                latency_ms=latency_ms,
                voice_id=voice,
                model=model,
            )

        except httpx.TimeoutException as e:
            logger.error(f"OpenAI TTS timeout: {e}")
            raise ValueError("OpenAI TTS request timed out")
        except httpx.HTTPError as e:
            logger.error(f"OpenAI TTS HTTP error: {e}")
            raise ValueError(f"OpenAI TTS request failed: {e}")

    @retry_openai_tts_operation(max_attempts=2)
    async def synthesize_stream(
        self,
        text: str,
        voice: str = "alloy",
        model: str = "tts-1",
        speed: float = 1.0,
        response_format: str = "pcm",
        chunk_size: int = 4096,
    ) -> AsyncIterator[bytes]:
        """
        Stream synthesized speech from text.

        Args:
            text: Text to synthesize (max 4096 chars)
            voice: Voice ID (alloy, echo, fable, onyx, nova, shimmer)
            model: Model to use (tts-1, tts-1-hd)
            speed: Speech speed (0.25 to 4.0)
            response_format: Output format (pcm recommended for streaming)
            chunk_size: Size of audio chunks to yield

        Yields:
            Audio data chunks

        Raises:
            ValueError: If service is disabled or request fails
            CircuitBreakerError: If circuit breaker is open
        """
        if not self.enabled:
            raise ValueError("OpenAI TTS is not configured")

        if len(text) > self.MAX_TEXT_LENGTH:
            raise ValueError(f"Text exceeds maximum length of {self.MAX_TEXT_LENGTH}")

        # Check circuit breaker
        try:
            openai_tts_breaker.call(lambda: None)
        except CircuitBreakerError:
            logger.error("OpenAI TTS circuit breaker is OPEN - failing fast")
            raise

        start_time = time.time()
        first_chunk_time: Optional[float] = None
        total_bytes = 0

        try:
            client = await self._get_http_client()

            async with client.stream(
                "POST",
                f"{self.BASE_URL}{self.TTS_ENDPOINT}",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": text,
                    "voice": voice,
                    "response_format": response_format,
                    "speed": max(0.25, min(4.0, speed)),
                },
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(
                        "OpenAI TTS streaming failed",
                        extra={
                            "status_code": response.status_code,
                            "error": error_text.decode()[:200],
                        },
                    )
                    raise ValueError(f"OpenAI TTS failed: {response.status_code}")

                async for chunk in response.aiter_bytes(chunk_size):
                    if chunk:
                        if first_chunk_time is None:
                            first_chunk_time = time.time()
                            ttfb_ms = int((first_chunk_time - start_time) * 1000)
                            logger.debug(
                                "OpenAI TTS first chunk",
                                extra={
                                    "voice": voice,
                                    "ttfb_ms": ttfb_ms,
                                },
                            )
                        total_bytes += len(chunk)
                        yield chunk

            total_latency_ms = int((time.time() - start_time) * 1000)
            logger.info(
                "OpenAI TTS streaming complete",
                extra={
                    "voice": voice,
                    "model": model,
                    "text_length": len(text),
                    "total_bytes": total_bytes,
                    "total_latency_ms": total_latency_ms,
                    "ttfb_ms": (int((first_chunk_time - start_time) * 1000) if first_chunk_time else None),
                },
            )

        except httpx.TimeoutException as e:
            logger.error(f"OpenAI TTS stream timeout: {e}")
            raise ValueError("OpenAI TTS stream timed out")
        except httpx.HTTPError as e:
            logger.error(f"OpenAI TTS stream HTTP error: {e}")
            raise ValueError(f"OpenAI TTS stream failed: {e}")

    async def close(self):
        """Close the HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None
            self._connection_warmed = False


# Singleton instance
openai_tts_service = OpenAITTSService()
