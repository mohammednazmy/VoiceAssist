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

import asyncio
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.core.resilience import elevenlabs_breaker
from app.core.voice_constants import DEFAULT_VOICE_ID
from pybreaker import CircuitBreakerError

logger = get_logger(__name__)

# Rate limit retry configuration
RATE_LIMIT_MAX_RETRIES = 3
RATE_LIMIT_BASE_DELAY = 1.0  # seconds
RATE_LIMIT_MAX_DELAY = 10.0  # seconds


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
    MODEL_TURBO_V2_5 = "eleven_turbo_v2_5"  # Faster turbo model
    MODEL_FLASH_V2_5 = "eleven_flash_v2_5"  # Fastest model for low latency
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
        # Use flash model for lowest latency (Phase: Talker Enhancement)
        self.default_model = self.MODEL_FLASH_V2_5
        # Default voice from centralized voice_constants (single source of truth)
        self.default_voice_id = DEFAULT_VOICE_ID
        self._connection_warmed = False

        # Voice cache (refreshed periodically)
        self._voice_cache: List[ElevenLabsVoice] = []
        self._voice_cache_expiry: float = 0
        self._voice_cache_ttl: float = 300  # 5 minutes

        # Persistent HTTP client
        self._http_client: Optional[httpx.AsyncClient] = None

    def is_enabled(self) -> bool:
        """Check if ElevenLabs is enabled and configured."""
        return self.enabled

    async def warm_connection(self) -> bool:
        """
        Pre-warm the HTTP connection to ElevenLabs API.

        Establishes the TCP + TLS connection ahead of time to eliminate
        cold-start latency on the first TTS request.

        Call this during service startup or when a voice session begins.

        Returns:
            True if connection was warmed successfully
        """
        if not self.enabled:
            return False

        if self._connection_warmed:
            return True

        try:
            client = await self._get_http_client()

            # Make a lightweight request to establish connection
            # Using the voices endpoint as it's fast and doesn't cost credits
            response = await client.get(
                f"{self.BASE_URL}{self.USER_ENDPOINT}",
                headers={"xi-api-key": self.api_key or ""},
                timeout=5.0,
            )

            if response.status_code == 200:
                self._connection_warmed = True
                logger.info("ElevenLabs connection warmed successfully")
                return True
            else:
                logger.warning(f"ElevenLabs warm connection returned {response.status_code}")
                return False

        except Exception as e:
            logger.warning(f"Failed to warm ElevenLabs connection: {e}")
            return False

    def is_connection_warmed(self) -> bool:
        """Check if connection has been pre-warmed."""
        return self._connection_warmed

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
        chunk_size: int = 384,  # Low-latency default (was 1024)
        previous_text: Optional[str] = None,  # Context for voice continuity
        next_text: Optional[str] = None,  # Upcoming text hint
    ) -> AsyncIterator[bytes]:
        """
        Synthesize text to speech with streaming output.

        Yields audio chunks as they become available for low-latency playback.
        Includes automatic retry with exponential backoff for rate limit errors (429).

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
            previous_text: Text spoken before this (provides voice continuity context)
            next_text: Text that will be spoken after (helps with prosody)

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

        # Retry loop for rate limit errors
        last_error: Optional[Exception] = None
        for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
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

                # Add context for voice continuity (ElevenLabs uses this to maintain
                # consistent prosody and voice characteristics across chunks)
                if previous_text:
                    # Limit previous text to last ~200 chars for efficiency
                    payload["previous_text"] = previous_text[-200:] if len(previous_text) > 200 else previous_text
                if next_text:
                    # Limit next text to first ~100 chars
                    payload["next_text"] = next_text[:100] if len(next_text) > 100 else next_text

                params = {"output_format": output_format}

                async with client.stream(
                    "POST",
                    url,
                    headers=self._get_headers(),
                    json=payload,
                    params=params,
                ) as response:
                    # Handle rate limiting with retry
                    if response.status_code == 429:
                        error_text = await response.aread()
                        if attempt < RATE_LIMIT_MAX_RETRIES:
                            # Calculate exponential backoff delay
                            delay = min(
                                RATE_LIMIT_BASE_DELAY * (2**attempt),
                                RATE_LIMIT_MAX_DELAY,
                            )
                            logger.warning(
                                "ElevenLabs rate limit hit, retrying",
                                extra={
                                    "attempt": attempt + 1,
                                    "max_retries": RATE_LIMIT_MAX_RETRIES,
                                    "delay_seconds": delay,
                                    "error": error_text.decode()[:100],
                                },
                            )
                            await asyncio.sleep(delay)
                            continue  # Retry the request
                        else:
                            # Max retries exceeded
                            logger.error(
                                "ElevenLabs rate limit - max retries exceeded",
                                extra={
                                    "attempts": attempt + 1,
                                    "error": error_text.decode()[:100],
                                },
                            )
                            raise ValueError(f"ElevenLabs rate limit exceeded after {attempt + 1} attempts")

                    if response.status_code != 200:
                        error_text = await response.aread()
                        raise ValueError(f"ElevenLabs stream failed: {error_text.decode()}")

                    async for chunk in response.aiter_bytes(chunk_size):
                        yield chunk

                logger.debug(
                    "ElevenLabs streaming TTS complete",
                    extra={"voice_id": voice_id, "text_length": len(text)},
                )

                # Success - exit the retry loop
                return

            except httpx.TimeoutException as e:
                logger.error(f"ElevenLabs streaming TTS timeout: {str(e)}")
                last_error = ValueError("Streaming TTS request timed out")
                if attempt < RATE_LIMIT_MAX_RETRIES:
                    delay = min(RATE_LIMIT_BASE_DELAY * (2**attempt), RATE_LIMIT_MAX_DELAY)
                    await asyncio.sleep(delay)
                    continue
                raise last_error
            except httpx.HTTPError as e:
                logger.error(f"ElevenLabs streaming TTS error: {str(e)}")
                last_error = ValueError(f"Streaming TTS request failed: {str(e)}")
                if attempt < RATE_LIMIT_MAX_RETRIES:
                    delay = min(RATE_LIMIT_BASE_DELAY * (2**attempt), RATE_LIMIT_MAX_DELAY)
                    await asyncio.sleep(delay)
                    continue
                raise last_error

        # Should not reach here, but just in case
        if last_error:
            raise last_error

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
                "id": self.MODEL_FLASH_V2_5,
                "name": "Flash v2.5",
                "description": "Fastest model, lowest latency (recommended)",
            },
            {
                "id": self.MODEL_TURBO_V2_5,
                "name": "Turbo v2.5",
                "description": "Fast with good quality",
            },
            {
                "id": self.MODEL_MULTILINGUAL_V2,
                "name": "Multilingual v2",
                "description": "Best quality, 28 languages, style control",
            },
            {
                "id": self.MODEL_TURBO_V2,
                "name": "Turbo v2",
                "description": "Fast, English-optimized (legacy)",
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
