"""
Text-to-Speech Service with provider abstraction.

Supports multiple TTS providers:
- OpenAI TTS (tts-1, tts-1-hd)
- ElevenLabs (for higher quality voices)
- Azure Cognitive Services (optional)

Provides both batch synthesis and streaming capabilities.
"""

import hashlib
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class TTSConfig:
    """Configuration for TTS synthesis."""

    voice_id: str = "alloy"
    speed: float = 1.0
    pitch: float = 1.0
    format: str = "mp3"
    model: str = "tts-1-hd"
    provider: str = "openai"


@dataclass
class AudioChunk:
    """Chunk of audio data for streaming."""

    data: bytes
    duration_ms: int = 0
    is_final: bool = False


@dataclass
class SynthesisResult:
    """Result of TTS synthesis."""

    audio_bytes: bytes
    duration_seconds: float
    format: str
    sample_rate: int
    metadata: Dict[str, Any] = field(default_factory=dict)


class TTSProvider(ABC):
    """Abstract base class for TTS providers."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> SynthesisResult:
        """Synthesize text to audio bytes."""
        pass

    @abstractmethod
    async def stream_synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> AsyncGenerator[AudioChunk, None]:
        """Stream synthesized audio chunks."""
        pass

    @abstractmethod
    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Get list of available voices for this provider."""
        pass


class OpenAITTSProvider(TTSProvider):
    """OpenAI TTS provider using tts-1 or tts-1-hd models."""

    AVAILABLE_VOICES = [
        {"id": "alloy", "name": "Alloy", "description": "Neutral, balanced voice"},
        {"id": "echo", "name": "Echo", "description": "Warm, conversational voice"},
        {"id": "fable", "name": "Fable", "description": "Expressive, British accent"},
        {"id": "onyx", "name": "Onyx", "description": "Deep, authoritative voice"},
        {"id": "nova", "name": "Nova", "description": "Friendly, energetic voice"},
        {"id": "shimmer", "name": "Shimmer", "description": "Clear, professional voice"},
    ]

    def __init__(self, api_key: str):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(api_key=api_key)
        self.provider_name = "openai"

    async def synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> SynthesisResult:
        """Synthesize text using OpenAI TTS."""
        try:
            response = await self.client.audio.speech.create(
                model=config.model or "tts-1-hd",
                voice=config.voice_id,
                input=text,
                response_format=config.format,
                speed=config.speed,
            )

            audio_bytes = response.content

            # Estimate duration (rough estimate based on text length and speed)
            # More accurate duration can be calculated from audio metadata
            words = len(text.split())
            estimated_duration = (words / 150) * 60 / config.speed  # ~150 wpm

            return SynthesisResult(
                audio_bytes=audio_bytes,
                duration_seconds=estimated_duration,
                format=config.format,
                sample_rate=24000,
                metadata={
                    "provider": self.provider_name,
                    "model": config.model,
                    "voice": config.voice_id,
                },
            )

        except Exception as e:
            logger.error(f"OpenAI TTS synthesis failed: {e}")
            raise

    async def stream_synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> AsyncGenerator[AudioChunk, None]:
        """Stream synthesized audio (OpenAI returns full audio, we chunk it)."""
        try:
            response = await self.client.audio.speech.create(
                model=config.model or "tts-1-hd",
                voice=config.voice_id,
                input=text,
                response_format=config.format,
                speed=config.speed,
            )

            content = response.content
            chunk_size = 8192  # 8KB chunks

            for i in range(0, len(content), chunk_size):
                is_final = i + chunk_size >= len(content)
                yield AudioChunk(
                    data=content[i : i + chunk_size],
                    duration_ms=0,
                    is_final=is_final,
                )

        except Exception as e:
            logger.error(f"OpenAI TTS streaming failed: {e}")
            raise

    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Get available OpenAI TTS voices."""
        return self.AVAILABLE_VOICES


class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs provider for higher quality, more natural voices."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.elevenlabs.io/v1"
        self.provider_name = "elevenlabs"
        self._voices_cache: Optional[List[Dict[str, Any]]] = None

    async def synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> SynthesisResult:
        """Synthesize text using ElevenLabs."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                # Get voice settings from config or use defaults
                voice_settings = {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.0,
                    "use_speaker_boost": True,
                }

                async with session.post(
                    f"{self.base_url}/text-to-speech/{config.voice_id}",
                    headers={
                        "xi-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2",
                        "voice_settings": voice_settings,
                    },
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"ElevenLabs API error: {error_text}")

                    audio_bytes = await response.read()

                    # Estimate duration
                    words = len(text.split())
                    estimated_duration = (words / 150) * 60 / config.speed

                    return SynthesisResult(
                        audio_bytes=audio_bytes,
                        duration_seconds=estimated_duration,
                        format="mp3",
                        sample_rate=44100,
                        metadata={
                            "provider": self.provider_name,
                            "model": "eleven_turbo_v2",
                            "voice": config.voice_id,
                        },
                    )

        except Exception as e:
            logger.error(f"ElevenLabs TTS synthesis failed: {e}")
            raise

    async def stream_synthesize(
        self,
        text: str,
        config: TTSConfig,
    ) -> AsyncGenerator[AudioChunk, None]:
        """Stream synthesized audio from ElevenLabs."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                voice_settings = {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                }

                async with session.post(
                    f"{self.base_url}/text-to-speech/{config.voice_id}/stream",
                    headers={
                        "xi-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2",
                        "voice_settings": voice_settings,
                    },
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"ElevenLabs API error: {error_text}")

                    async for chunk in response.content.iter_chunked(8192):
                        yield AudioChunk(
                            data=chunk,
                            duration_ms=0,
                            is_final=False,
                        )

                    yield AudioChunk(data=b"", duration_ms=0, is_final=True)

        except Exception as e:
            logger.error(f"ElevenLabs TTS streaming failed: {e}")
            raise

    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Get available ElevenLabs voices."""
        # Return cached list or default voices
        if self._voices_cache:
            return self._voices_cache

        # Default pre-made voices
        return [
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "description": "American female, calm"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "description": "American female, strong"},
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "description": "American female, soft"},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "description": "American male, well-rounded"},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "description": "American female, emotional"},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "description": "American male, deep"},
        ]


class TTSService:
    """
    Main TTS service with provider abstraction.

    Manages multiple TTS providers and provides unified interface
    for text-to-speech synthesis.
    """

    def __init__(self):
        self.providers: Dict[str, TTSProvider] = {}
        self._init_providers()

    def _init_providers(self) -> None:
        """Initialize available TTS providers based on environment configuration."""
        # OpenAI TTS
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            try:
                self.providers["openai"] = OpenAITTSProvider(openai_key)
                logger.info("OpenAI TTS provider initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize OpenAI TTS: {e}")

        # ElevenLabs
        elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
        if elevenlabs_key:
            try:
                self.providers["elevenlabs"] = ElevenLabsTTSProvider(elevenlabs_key)
                logger.info("ElevenLabs TTS provider initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize ElevenLabs TTS: {e}")

        if not self.providers:
            logger.warning("No TTS providers configured")

    def get_provider(self, name: str = "openai") -> TTSProvider:
        """Get a specific TTS provider."""
        if name not in self.providers:
            raise ValueError(
                f"TTS provider '{name}' not configured. "
                f"Available: {list(self.providers.keys())}"
            )
        return self.providers[name]

    def get_default_provider(self) -> TTSProvider:
        """Get the default (first available) TTS provider."""
        if not self.providers:
            raise RuntimeError("No TTS providers available")

        # Prefer OpenAI, then ElevenLabs
        for provider_name in ["openai", "elevenlabs"]:
            if provider_name in self.providers:
                return self.providers[provider_name]

        # Return first available
        return next(iter(self.providers.values()))

    async def synthesize(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ) -> SynthesisResult:
        """
        Synthesize text to audio using configured provider.

        Args:
            text: Text to synthesize
            config: TTS configuration (uses defaults if not provided)

        Returns:
            SynthesisResult with audio bytes and metadata
        """
        if config is None:
            config = TTSConfig()

        provider = self.get_provider(config.provider)
        return await provider.synthesize(text, config)

    async def stream_synthesize(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ) -> AsyncGenerator[AudioChunk, None]:
        """
        Stream synthesized audio chunks.

        Args:
            text: Text to synthesize
            config: TTS configuration

        Yields:
            AudioChunk instances
        """
        if config is None:
            config = TTSConfig()

        provider = self.get_provider(config.provider)
        async for chunk in provider.stream_synthesize(text, config):
            yield chunk

    def get_all_voices(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get all available voices from all providers."""
        voices = {}
        for provider_name, provider in self.providers.items():
            voices[provider_name] = provider.get_available_voices()
        return voices

    def is_available(self) -> bool:
        """Check if any TTS provider is available."""
        return len(self.providers) > 0

    @staticmethod
    def hash_text(text: str) -> str:
        """Generate hash for cache key."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()


# Singleton instance
_tts_service: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """Get or create TTS service singleton."""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
