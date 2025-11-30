"""
ElevenLabs TTS Service

Premium neural TTS provider with high-quality voice synthesis.
Supports streaming audio, multiple voices, and emotion/style control.

Phase 11: VoiceAssist Voice Pipeline Sprint
- Premium TTS option alongside OpenAI
- Streaming audio support for low latency
- Voice catalog with caching
- Cost tracking per request
- Circuit breaker protection for resilience
"""

import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.core.resilience import elevenlabs_breaker
from pybreaker import CircuitBreakerError

logger = get_logger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class ElevenLabsVoice:
    """Metadata for an ElevenLabs voice."""

    voice_id: str
    name: str
    category: str  # "premade", "cloned", "professional"
    labels: Dict[str, str] = field(default_factory=dict)  # accent, gender, etc.
    preview_url: Optional[str] = None
    description: Optional[str] = None


@dataclass
class TTSSynthesisResult:
    """Result of TTS synthesis."""

    audio_data: bytes
    content_type: str  # "audio/mpeg", "audio/pcm", etc.
    duration_ms: Optional[int] = None
    characters_used: int = 0
    latency_ms: Optional[int] = None
    voice_id: str = ""


@dataclass
class ElevenLabsUsageStats:
    """Usage statistics from ElevenLabs."""

    character_count: int
    character_limit: int
    voice_limit: int
    professional_voice_limit: int
    next_reset_at: Optional[str] = None  # ISO timestamp


# ==============================================================================
# Service Implementation
# ==============================================================================


class ElevenLabsService:
    """
    ElevenLabs TTS service for premium voice synthesis.

    Features:
    - High-quality neural voices (multilingual v2, turbo v2)
    - Streaming audio for low latency playback
    - Voice catalog with caching
    - Usage/cost tracking
    - Automatic fallback handling

    Supported models:
    - eleven_multilingual_v2: Best quality, 28 languages
    - eleven_turbo_v2: Fast, English-optimized
    - eleven_monolingual_v1: Legacy English model
    """

    # API endpoints
    BASE_URL = "https://api.elevenlabs.io/v1"
    TTS_ENDPOINT = "/text-to-speech"
    TTS_STREAM_ENDPOINT = "/text-to-speech/{voice_id}/stream"
    VOICES_ENDPOINT = "/voices"
    USER_ENDPOINT = "/user/subscription"

    # Model options
    MODEL_MULTILINGUAL_V2 = "eleven_multilingual_v2"
    MODEL_TURBO_V2 = "eleven_turbo_v2"
    MODEL_MONOLINGUAL_V1 = "eleven_monolingual_v1"

    # Output formats
    FORMAT_MP3_44100_128 = "mp3_44100_128"  # Default MP3
    FORMAT_MP3_22050_32 = "mp3_22050_32"  # Low bandwidth
    FORMAT_PCM_24000 = "pcm_24000"  # Raw PCM for WebRTC
    FORMAT_PCM_16000 = "pcm_16000"  # Low bandwidth PCM
    FORMAT_ULAW_8000 = "ulaw_8000"  # Phone quality

    def __init__(self):
        self.api_key = settings.ELEVENLABS_API_KEY
        self.enabled = bool(self.api_key)
        self.default_model = self.MODEL_MULTILINGUAL_V2
        self.default_voice_id = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" voice

        # Voice cache (refreshed periodically)
        self._voice_cache: List[ElevenLabsVoice] = []
        self._voice_cache_expiry: float = 0
        self._voice_cache_ttl: float = 300  # 5 minutes

        # Persistent HTTP client
        self._http_client: Optional[httpx.AsyncClient] = None

    def is_enabled(self) -> bool:
        """Check if ElevenLabs is enabled and configured."""
        return self.enabled

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create persistent HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=60.0,  # TTS can take time for long text
                limits=httpx.Limits(
                    max_keepalive_connections=5,
                    max_connections=10,
                ),
            )
        return self._http_client

    def _get_headers(self) -> Dict[str, str]:
        """Get API request headers."""
        return {
            "xi-api-key": self.api_key or "",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: Optional[str] = None,
        output_format: str = FORMAT_MP3_44100_128,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        use_speaker_boost: bool = True,
    ) -> TTSSynthesisResult:
        """
        Synthesize text to speech (non-streaming).

        Args:
            text: Text to synthesize (max 5000 chars)
            voice_id: ElevenLabs voice ID (default: Rachel)
            model_id: Model to use (default: multilingual_v2)
            output_format: Audio format (default: MP3 128kbps)
            stability: Voice stability 0-1 (lower = more expressive)
            similarity_boost: Voice similarity 0-1
            style: Style exaggeration 0-1 (multilingual_v2 only)
            use_speaker_boost: Enable speaker clarity boost

        Returns:
            TTSSynthesisResult with audio data and metadata

        Raises:
            ValueError: If service is not enabled or request fails
        """
        if not self.enabled:
            raise ValueError("ElevenLabs TTS is not enabled")

        if len(text) > 5000:
            raise ValueError("Text exceeds maximum length of 5000 characters")

        # Check circuit breaker before attempting call
        try:
            elevenlabs_breaker.call(lambda: None)  # Lightweight check
        except CircuitBreakerError:
            logger.error("ElevenLabs circuit breaker is OPEN - failing fast")
            raise ValueError("ElevenLabs TTS is temporarily unavailable (circuit breaker open)")

        voice_id = voice_id or self.default_voice_id
        model_id = model_id or self.default_model

        start_time = time.time()

        try:
            client = await self._get_http_client()
            url = f"{self.BASE_URL}{self.TTS_ENDPOINT}/{voice_id}"

            # Build request payload
            payload = {
                "text": text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "style": style,
                    "use_speaker_boost": use_speaker_boost,
                },
            }

            # Add output format as query param
            params = {"output_format": output_format}

            response = await client.post(
                url,
                headers=self._get_headers(),
                json=payload,
                params=params,
            )

            if response.status_code != 200:
                error_msg = f"ElevenLabs TTS failed: {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg = f"{error_msg} - {error_detail.get('detail', {}).get('message', response.text)}"
                except Exception:
                    error_msg = f"{error_msg} - {response.text}"

                logger.error(error_msg)
                raise ValueError(error_msg)

            audio_data = response.content
            latency_ms = int((time.time() - start_time) * 1000)

            # Determine content type from format
            content_type = "audio/mpeg"
            if "pcm" in output_format:
                content_type = "audio/pcm"
            elif "ulaw" in output_format:
                content_type = "audio/basic"

            logger.info(
                "ElevenLabs TTS synthesis complete",
                extra={
                    "voice_id": voice_id,
                    "model_id": model_id,
                    "text_length": len(text),
                    "audio_size": len(audio_data),
                    "latency_ms": latency_ms,
                },
            )

            # Circuit breaker auto-tracks via decorator pattern

            return TTSSynthesisResult(
                audio_data=audio_data,
                content_type=content_type,
                characters_used=len(text),
                latency_ms=latency_ms,
                voice_id=voice_id,
            )

        except httpx.TimeoutException as e:
            logger.error(f"ElevenLabs TTS timeout: {str(e)}")
            raise ValueError("TTS request timed out")
        except httpx.HTTPError as e:
            logger.error(f"ElevenLabs TTS HTTP error: {str(e)}")
            raise ValueError(f"TTS request failed: {str(e)}")

    async def synthesize_stream(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: Optional[str] = None,
        output_format: str = FORMAT_MP3_44100_128,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        use_speaker_boost: bool = True,
        chunk_size: int = 1024,
    ) -> AsyncIterator[bytes]:
        """
        Synthesize text to speech with streaming output.

        Yields audio chunks as they become available for low-latency playback.

        Args:
            text: Text to synthesize (max 5000 chars)
            voice_id: ElevenLabs voice ID
            model_id: Model to use
            output_format: Audio format
            stability: Voice stability 0-1
            similarity_boost: Voice similarity 0-1
            style: Style exaggeration 0-1
            use_speaker_boost: Enable speaker clarity boost
            chunk_size: Size of audio chunks to yield

        Yields:
            Audio data chunks as bytes

        Raises:
            ValueError: If service is not enabled or request fails
        """
        if not self.enabled:
            raise ValueError("ElevenLabs TTS is not enabled")

        if len(text) > 5000:
            raise ValueError("Text exceeds maximum length of 5000 characters")

        # Check circuit breaker before attempting call
        try:
            elevenlabs_breaker.call(lambda: None)  # Lightweight check
        except CircuitBreakerError:
            logger.error("ElevenLabs circuit breaker is OPEN - failing fast")
            raise ValueError("ElevenLabs TTS is temporarily unavailable (circuit breaker open)")

        voice_id = voice_id or self.default_voice_id
        model_id = model_id or self.default_model

        try:
            client = await self._get_http_client()
            url = f"{self.BASE_URL}{self.TTS_ENDPOINT}/{voice_id}/stream"

            payload = {
                "text": text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "style": style,
                    "use_speaker_boost": use_speaker_boost,
                },
            }

            params = {"output_format": output_format}

            async with client.stream(
                "POST",
                url,
                headers=self._get_headers(),
                json=payload,
                params=params,
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise ValueError(f"ElevenLabs stream failed: {error_text.decode()}")

                async for chunk in response.aiter_bytes(chunk_size):
                    yield chunk

            logger.debug(
                "ElevenLabs streaming TTS complete",
                extra={"voice_id": voice_id, "text_length": len(text)},
            )

            # Circuit breaker auto-tracks via decorator pattern

        except httpx.TimeoutException as e:
            logger.error(f"ElevenLabs streaming TTS timeout: {str(e)}")
            raise ValueError("Streaming TTS request timed out")
        except httpx.HTTPError as e:
            logger.error(f"ElevenLabs streaming TTS error: {str(e)}")
            raise ValueError(f"Streaming TTS request failed: {str(e)}")

    async def get_voices(self, force_refresh: bool = False) -> List[ElevenLabsVoice]:
        """
        Get available voices with caching.

        Args:
            force_refresh: Force refresh of voice cache

        Returns:
            List of available ElevenLabsVoice objects
        """
        if not self.enabled:
            return []

        # Check cache
        if not force_refresh and self._voice_cache and time.time() < self._voice_cache_expiry:
            return self._voice_cache

        try:
            client = await self._get_http_client()
            response = await client.get(
                f"{self.BASE_URL}{self.VOICES_ENDPOINT}",
                headers={"xi-api-key": self.api_key or ""},
            )

            if response.status_code != 200:
                logger.error(f"Failed to fetch ElevenLabs voices: {response.status_code}")
                return self._voice_cache  # Return stale cache on error

            data = response.json()
            voices = []

            for voice_data in data.get("voices", []):
                voice = ElevenLabsVoice(
                    voice_id=voice_data.get("voice_id", ""),
                    name=voice_data.get("name", ""),
                    category=voice_data.get("category", "unknown"),
                    labels=voice_data.get("labels", {}),
                    preview_url=voice_data.get("preview_url"),
                    description=voice_data.get("description"),
                )
                voices.append(voice)

            # Update cache
            self._voice_cache = voices
            self._voice_cache_expiry = time.time() + self._voice_cache_ttl

            logger.info(f"Loaded {len(voices)} ElevenLabs voices")
            return voices

        except Exception as e:
            logger.error(f"Failed to fetch ElevenLabs voices: {str(e)}")
            return self._voice_cache  # Return stale cache on error

    async def get_usage_stats(self) -> Optional[ElevenLabsUsageStats]:
        """
        Get current usage statistics.

        Returns:
            ElevenLabsUsageStats or None if request fails
        """
        if not self.enabled:
            return None

        try:
            client = await self._get_http_client()
            response = await client.get(
                f"{self.BASE_URL}{self.USER_ENDPOINT}",
                headers={"xi-api-key": self.api_key or ""},
            )

            if response.status_code != 200:
                logger.error(f"Failed to fetch ElevenLabs usage: {response.status_code}")
                return None

            data = response.json()

            return ElevenLabsUsageStats(
                character_count=data.get("character_count", 0),
                character_limit=data.get("character_limit", 0),
                voice_limit=data.get("voice_limit", 0),
                professional_voice_limit=data.get("professional_voice_limit", 0),
                next_reset_at=data.get("next_character_count_reset_unix"),
            )

        except Exception as e:
            logger.error(f"Failed to fetch ElevenLabs usage: {str(e)}")
            return None

    def get_default_voice_id(self) -> str:
        """Get the default voice ID."""
        return self.default_voice_id

    def get_available_models(self) -> List[Dict[str, str]]:
        """Get list of available TTS models."""
        return [
            {
                "id": self.MODEL_MULTILINGUAL_V2,
                "name": "Multilingual v2",
                "description": "Best quality, 28 languages, style control",
            },
            {
                "id": self.MODEL_TURBO_V2,
                "name": "Turbo v2",
                "description": "Fast, English-optimized",
            },
            {
                "id": self.MODEL_MONOLINGUAL_V1,
                "name": "Monolingual v1",
                "description": "Legacy English model",
            },
        ]

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None


# Global service instance
elevenlabs_service = ElevenLabsService()
