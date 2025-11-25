"""
OpenAI Realtime API Integration Service
Generates ephemeral tokens and session configuration for voice mode

This service provides:
1. OpenAI Realtime API session configuration
2. Provider abstraction for future STT/TTS integrations
3. Safe provider config (never exposes raw API keys)
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class TTSProviderConfig:
    """Configuration for Text-to-Speech providers.

    This data class provides metadata about TTS providers without exposing
    sensitive API keys. Used for frontend feature detection and backend routing.
    """

    provider: str  # e.g., "openai", "elevenlabs", "azure", "gcp"
    enabled: bool  # Whether this provider is configured and available
    api_key_present: bool  # Whether API key is configured (but not the key itself)
    default_voice: Optional[str] = None  # Default voice ID for this provider
    available_voices: Optional[list[str]] = None  # List of available voice IDs
    supports_streaming: bool = True  # Whether provider supports streaming audio
    max_text_length: Optional[int] = None  # Max characters per request


@dataclass
class STTProviderConfig:
    """Configuration for Speech-to-Text providers.

    This data class provides metadata about STT providers without exposing
    sensitive API keys. Used for frontend feature detection and backend routing.
    """

    provider: str  # e.g., "openai", "deepgram", "azure", "gcp"
    enabled: bool  # Whether this provider is configured and available
    api_key_present: bool  # Whether API key is configured (but not the key itself)
    supports_streaming: bool = True  # Whether provider supports streaming audio
    supports_interim_results: bool = (
        True  # Whether provider supports partial transcripts
    )
    supported_languages: Optional[list[str]] = None  # Supported language codes
    max_audio_duration_sec: Optional[int] = None  # Max audio duration in seconds


class RealtimeVoiceService:
    """
    Service for managing OpenAI Realtime API voice sessions.

    The Realtime API uses WebSocket connections for bidirectional streaming
    of audio and text. This service generates ephemeral session configuration
    that the frontend uses to establish WebSocket connections.
    """

    def __init__(self):
        self.enabled = settings.REALTIME_ENABLED
        self.model = settings.REALTIME_MODEL
        self.base_url = settings.REALTIME_BASE_URL
        self.api_key = settings.OPENAI_API_KEY
        self.token_expiry = settings.REALTIME_TOKEN_EXPIRY_SEC

    def is_enabled(self) -> bool:
        """Check if Realtime API is enabled and configured"""
        return self.enabled and bool(self.api_key)

    async def create_openai_ephemeral_session(
        self, model: str, voice: str = "alloy"
    ) -> Dict[str, Any]:
        """
        Create an ephemeral session with OpenAI's Realtime API.

        This calls OpenAI's session creation endpoint to get a real ephemeral
        client secret that can be used to connect to the Realtime WebSocket.

        Args:
            model: The Realtime model to use (e.g., "gpt-4o-realtime-preview-2024-12-17")
            voice: The voice to use (default: "alloy")

        Returns:
            Dict containing:
            - client_secret: Ephemeral token for client use
            - expires_at: Unix timestamp when token expires

        Raises:
            ValueError: If session creation fails
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/realtime/sessions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "voice": voice,
                    },
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(
                        f"OpenAI session creation failed: {error_detail}",
                        extra={
                            "status_code": response.status_code,
                            "response": error_detail,
                        },
                    )
                    raise ValueError(
                        f"Failed to create OpenAI session: {response.status_code}"
                    )

                data = response.json()

                # OpenAI returns: { "client_secret": { "value": "ek_...", "expires_at": timestamp } }
                client_secret_data = data.get("client_secret", {})
                client_secret = client_secret_data.get("value")
                expires_at = client_secret_data.get("expires_at")

                if not client_secret:
                    raise ValueError("OpenAI did not return a client_secret")

                logger.info(
                    "Created OpenAI ephemeral session",
                    extra={
                        "model": model,
                        "expires_at": expires_at,
                    },
                )

                return {
                    "client_secret": client_secret,
                    "expires_at": expires_at,
                }

        except httpx.TimeoutException as e:
            logger.error(f"OpenAI session creation timeout: {str(e)}")
            raise ValueError("OpenAI session creation timed out")
        except httpx.HTTPError as e:
            logger.error(f"OpenAI session creation HTTP error: {str(e)}")
            raise ValueError(f"OpenAI session creation failed: {str(e)}")
        except Exception as e:
            logger.error(f"OpenAI session creation error: {str(e)}")
            raise ValueError(f"Failed to create OpenAI session: {str(e)}")

    def generate_ephemeral_token(
        self, user_id: str, session_id: str, expires_at: int
    ) -> str:
        """
        Generate an HMAC-signed ephemeral token for voice session.

        This token is sent to the client instead of the raw OpenAI API key.
        It encodes the user_id, session_id, model, and expiry time, and is
        signed with the JWT_SECRET to prevent tampering.

        Args:
            user_id: User ID for this session
            session_id: Unique session identifier
            expires_at: Unix timestamp when token expires

        Returns:
            Base64-encoded token string containing payload + signature
        """
        # Build token payload
        payload = {
            "user_id": user_id,
            "session_id": session_id,
            "model": self.model,
            "expires_at": expires_at,
            "issued_at": int(time.time()),
        }

        # Serialize payload to JSON
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()

        # Generate HMAC signature using JWT_SECRET
        signature = hmac.new(
            settings.JWT_SECRET.encode(),
            payload_b64.encode(),
            hashlib.sha256,
        ).digest()
        signature_b64 = base64.urlsafe_b64encode(signature).decode()

        # Combine payload and signature
        token = f"{payload_b64}.{signature_b64}"

        logger.debug(
            f"Generated ephemeral token for user {user_id}",
            extra={
                "user_id": user_id,
                "session_id": session_id,
                "expires_at": expires_at,
            },
        )

        return token

    def validate_ephemeral_token(self, token: str) -> Dict[str, Any]:
        """
        Validate and decode an ephemeral token.

        Args:
            token: Token string to validate

        Returns:
            Decoded payload dict

        Raises:
            ValueError: If token is invalid, expired, or tampered with
        """
        try:
            # Split token into payload and signature
            parts = token.split(".")
            if len(parts) != 2:
                raise ValueError("Invalid token format")

            payload_b64, signature_b64 = parts

            # Verify signature
            expected_signature = hmac.new(
                settings.JWT_SECRET.encode(),
                payload_b64.encode(),
                hashlib.sha256,
            ).digest()
            expected_signature_b64 = base64.urlsafe_b64encode(
                expected_signature
            ).decode()

            if not hmac.compare_digest(signature_b64, expected_signature_b64):
                raise ValueError("Invalid token signature")

            # Decode payload
            payload_json = base64.urlsafe_b64decode(payload_b64).decode()
            payload = json.loads(payload_json)

            # Check expiry
            if payload["expires_at"] < int(time.time()):
                raise ValueError("Token expired")

            return payload

        except Exception as e:
            logger.warning(
                f"Token validation failed: {str(e)}",
                extra={"error": str(e)},
            )
            raise ValueError(f"Invalid token: {str(e)}")

    async def generate_session_config(
        self,
        user_id: str,
        conversation_id: str | None = None,
        voice: str | None = None,
        language: str | None = None,
        vad_sensitivity: int | None = None,
    ) -> Dict[str, Any]:
        """
        Generate session configuration for OpenAI Realtime API.

        This method creates a real ephemeral session with OpenAI and returns
        the configuration needed for the client to connect via WebSocket.

        Args:
            user_id: User ID for the session
            conversation_id: Optional conversation ID to resume
            voice: Optional voice selection (alloy, echo, fable, onyx, nova, shimmer)
            language: Optional language code (en, es, fr, de, it, pt)
            vad_sensitivity: Optional VAD sensitivity 0-100 (maps to threshold)

        Returns:
            Dictionary with session configuration including:
            - url: WebSocket URL for Realtime API
            - model: Realtime model to use
            - auth: Authentication structure with OpenAI ephemeral token
            - session_id: Unique session identifier
            - expires_at: Unix timestamp when session expires
            - voice_config: Voice configuration with user preferences

        Raises:
            ValueError: If Realtime API is not enabled or configured
        """
        if not self.is_enabled():
            raise ValueError(
                "Realtime API is not enabled or OpenAI API key not configured"
            )

        # Validate and select voice
        valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
        selected_voice = voice if voice in valid_voices else "alloy"

        # Map VAD sensitivity (0-100) to threshold (0.1-0.9)
        # High sensitivity (100) => low threshold (0.1) - picks up more
        # Low sensitivity (0) => high threshold (0.9) - needs louder sound
        if vad_sensitivity is not None:
            vad_sensitivity = max(0, min(100, vad_sensitivity))
            vad_threshold = 0.9 - (vad_sensitivity / 100.0 * 0.8)
        else:
            vad_threshold = 0.5  # Default threshold

        # Generate unique session ID for tracking
        session_id = f"rtc_{user_id}_{secrets.token_urlsafe(16)}"

        # Create ephemeral session with OpenAI
        # This gets us a real client_secret that works with the Realtime API
        openai_session = await self.create_openai_ephemeral_session(
            model=self.model,
            voice=selected_voice,
        )

        client_secret = openai_session["client_secret"]
        expires_at = openai_session["expires_at"]

        # Build session configuration
        # NOTE: We use the real OpenAI ephemeral token, NOT the raw API key
        config = {
            "url": self.base_url,
            "model": self.model,
            "session_id": session_id,
            "expires_at": expires_at,
            "conversation_id": conversation_id,
            "auth": {
                "type": "ephemeral_token",
                "token": client_secret,  # Real OpenAI ephemeral client secret
                "expires_at": expires_at,
            },
            "voice_config": {
                "voice": selected_voice,
                "language": language,  # Kept as metadata for now
                "modalities": ["text", "audio"],  # Both text and audio
                "input_audio_format": "pcm16",  # 16-bit PCM
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",  # Server-side VAD
                    "threshold": round(vad_threshold, 2),
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
            },
        }

        logger.info(
            "Generated Realtime session config",
            extra={
                "user_id": user_id,
                "session_id": session_id,
                "conversation_id": conversation_id,
                "expires_at": expires_at,
                "voice": selected_voice,
                "language": language,
                "vad_threshold": round(vad_threshold, 2),
            },
        )

        return config

    def get_api_key_for_token(self, token: str) -> str:
        """
        Validate an ephemeral token and return the real OpenAI API key.

        This method is used server-side (e.g., in a WebSocket proxy) to validate
        the client's token and retrieve the actual API key for making OpenAI calls.

        Args:
            token: Ephemeral token to validate

        Returns:
            The real OpenAI API key

        Raises:
            ValueError: If token is invalid or expired
        """
        # Validate token (will raise ValueError if invalid/expired)
        _payload = self.validate_ephemeral_token(token)  # noqa: F841

        # Token is valid, return the real API key
        # In a future proxy implementation, this would be used to authenticate
        # backend-to-OpenAI requests
        return self.api_key

    def validate_session(self, session_id: str) -> bool:
        """
        Validate a session ID (basic check).

        Args:
            session_id: Session ID to validate

        Returns:
            True if session format is valid, False otherwise
        """
        if not session_id or not isinstance(session_id, str):
            return False

        # Basic format check: should start with "rtc_"
        if not session_id.startswith("rtc_"):
            return False

        # Check length (should be: rtc_ + user_id + _ + token)
        parts = session_id.split("_")
        if len(parts) < 3:
            return False

        return True

    def get_session_instructions(self, conversation_id: str | None = None) -> str:
        """
        Get system instructions for the Realtime session.

        Args:
            conversation_id: Optional conversation ID for context

        Returns:
            System instructions string
        """
        instructions = """You are a helpful medical AI assistant in voice mode.

Guidelines:
- Keep responses concise and conversational
- Use natural spoken language, not written text
- Ask clarifying questions when needed
- Be empathetic and professional
- Cite sources when providing medical information
- Maintain HIPAA compliance at all times

When speaking:
- Use short sentences
- Avoid complex medical jargon unless requested
- Confirm understanding before proceeding
- Offer to provide more details if needed
"""

        if conversation_id:
            instructions += f"\nResuming conversation: {conversation_id}"

        return instructions

    def get_tts_config(self) -> TTSProviderConfig:
        """
        Get TTS provider configuration.

        Returns metadata about the configured TTS provider without exposing
        sensitive API keys. Used for feature detection and routing.

        Returns:
            TTSProviderConfig with provider metadata
        """
        provider = settings.TTS_PROVIDER or "openai"  # Default to OpenAI

        if provider == "openai":
            # OpenAI TTS (using main OpenAI key)
            return TTSProviderConfig(
                provider="openai",
                enabled=bool(settings.OPENAI_API_KEY),
                api_key_present=bool(settings.OPENAI_API_KEY),
                default_voice=settings.TTS_VOICE or "alloy",
                available_voices=["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
                supports_streaming=True,
                max_text_length=4096,
            )

        elif provider == "elevenlabs":
            # ElevenLabs TTS
            return TTSProviderConfig(
                provider="elevenlabs",
                enabled=bool(settings.ELEVENLABS_API_KEY),
                api_key_present=bool(settings.ELEVENLABS_API_KEY),
                default_voice=settings.TTS_VOICE,
                available_voices=None,  # Would query API for available voices
                supports_streaming=True,
                max_text_length=5000,
            )

        else:
            # Unknown/unsupported provider
            logger.warning(f"Unsupported TTS provider: {provider}")
            return TTSProviderConfig(
                provider=provider,
                enabled=False,
                api_key_present=False,
                supports_streaming=False,
            )

    def get_stt_config(self) -> STTProviderConfig:
        """
        Get STT provider configuration.

        Returns metadata about the configured STT provider without exposing
        sensitive API keys. Used for feature detection and routing.

        Returns:
            STTProviderConfig with provider metadata
        """
        provider = settings.STT_PROVIDER or "openai"  # Default to OpenAI

        if provider == "openai":
            # OpenAI Whisper (using main OpenAI key)
            return STTProviderConfig(
                provider="openai",
                enabled=bool(settings.OPENAI_API_KEY),
                api_key_present=bool(settings.OPENAI_API_KEY),
                supports_streaming=False,  # Whisper API is batch-only
                supports_interim_results=False,
                supported_languages=[
                    "en",
                    "es",
                    "fr",
                    "de",
                    "it",
                    "pt",
                    "nl",
                    "pl",
                    "ru",
                    "ja",
                    "ko",
                    "zh",
                ],  # Whisper supports 99+ languages
                max_audio_duration_sec=None,  # No hard limit
            )

        elif provider == "deepgram":
            # Deepgram STT
            return STTProviderConfig(
                provider="deepgram",
                enabled=bool(settings.DEEPGRAM_API_KEY),
                api_key_present=bool(settings.DEEPGRAM_API_KEY),
                supports_streaming=True,  # Deepgram supports streaming
                supports_interim_results=True,
                supported_languages=["en", "es", "fr", "de", "it", "pt", "nl", "ja"],
                max_audio_duration_sec=None,  # No hard limit
            )

        else:
            # Unknown/unsupported provider
            logger.warning(f"Unsupported STT provider: {provider}")
            return STTProviderConfig(
                provider=provider,
                enabled=False,
                api_key_present=False,
                supports_streaming=False,
                supports_interim_results=False,
            )

    def get_available_providers(self) -> Dict[str, Any]:
        """
        Get summary of all available voice providers.

        Returns:
            Dictionary with provider availability status
        """
        return {
            "tts": {
                "current": settings.TTS_PROVIDER or "openai",
                "config": {
                    "provider": self.get_tts_config().provider,
                    "enabled": self.get_tts_config().enabled,
                },
            },
            "stt": {
                "current": settings.STT_PROVIDER or "openai",
                "config": {
                    "provider": self.get_stt_config().provider,
                    "enabled": self.get_stt_config().enabled,
                },
            },
            "realtime": {
                "enabled": self.is_enabled(),
                "model": self.model if self.is_enabled() else None,
            },
        }


# Global service instance
realtime_voice_service = RealtimeVoiceService()
