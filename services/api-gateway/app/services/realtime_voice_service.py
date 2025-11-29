"""
OpenAI Realtime API Integration Service
Generates ephemeral tokens and session configuration for voice mode

This service provides:
1. OpenAI Realtime API session configuration
2. Provider abstraction for future STT/TTS integrations
3. Safe provider config (never exposes raw API keys)
"""

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Adaptive VAD System
# ==============================================================================


@dataclass
class UserVADProfile:
    """Tracks user's speech patterns for adaptive VAD tuning."""

    user_id: str
    # Speech pattern metrics (rolling averages)
    avg_pause_duration_ms: float = 500.0  # Average pause between utterances
    avg_utterance_duration_ms: float = 3000.0  # Average utterance length
    speech_rate_wpm: float = 150.0  # Words per minute estimate
    # Adaptive parameters
    optimal_silence_duration_ms: int = 500  # Calculated optimal silence threshold
    # Statistics
    total_sessions: int = 0
    total_utterances: int = 0
    last_updated: float = field(default_factory=time.time)

    def update_from_session(
        self,
        pause_durations: list[float],
        utterance_durations: list[float],
    ) -> None:
        """Update profile from session metrics using exponential moving average."""
        if pause_durations:
            # Use EMA with alpha=0.3 for smooth adaptation
            alpha = 0.3
            avg_pause = sum(pause_durations) / len(pause_durations)
            self.avg_pause_duration_ms = alpha * avg_pause + (1 - alpha) * self.avg_pause_duration_ms

        if utterance_durations:
            alpha = 0.3
            avg_utt = sum(utterance_durations) / len(utterance_durations)
            self.avg_utterance_duration_ms = alpha * avg_utt + (1 - alpha) * self.avg_utterance_duration_ms

        # Calculate optimal silence duration based on user patterns
        # Users with shorter pauses get more aggressive detection
        # Clamp between 200ms (very fast speakers) and 800ms (thoughtful speakers)
        self.optimal_silence_duration_ms = int(max(200, min(800, self.avg_pause_duration_ms * 0.6)))

        self.total_sessions += 1
        self.total_utterances += len(utterance_durations)
        self.last_updated = time.time()


class AdaptiveVADManager:
    """
    Manages user VAD profiles for adaptive turn detection.

    Starts with conservative settings (500ms silence) and learns user patterns
    over time to optimize for faster turn detection without cutting users off.
    """

    def __init__(self):
        self._profiles: Dict[str, UserVADProfile] = {}
        self._lock = asyncio.Lock()
        self._default_silence_ms = 500  # Conservative default
        self._min_silence_ms = 200  # Minimum for fast speakers
        self._max_silence_ms = 800  # Maximum for thoughtful speakers

    async def get_optimal_silence_duration(
        self,
        user_id: str,
        requested_silence_ms: Optional[int] = None,
        adaptive_enabled: bool = True,
    ) -> int:
        """
        Get optimal silence duration for a user.

        Args:
            user_id: User identifier
            requested_silence_ms: Explicit user preference (overrides adaptive)
            adaptive_enabled: Whether to use adaptive learning

        Returns:
            Optimal silence duration in milliseconds
        """
        # If user explicitly requested a value, respect it
        if requested_silence_ms is not None:
            return max(self._min_silence_ms, min(self._max_silence_ms, requested_silence_ms))

        # If adaptive is disabled, use default
        if not adaptive_enabled:
            return self._default_silence_ms

        # Get or create user profile
        async with self._lock:
            profile = self._profiles.get(user_id)

            if profile is None:
                # New user - start conservative
                profile = UserVADProfile(user_id=user_id)
                self._profiles[user_id] = profile
                logger.debug(f"Created new VAD profile for user {user_id}")
                return self._default_silence_ms

            # Return learned optimal value
            return profile.optimal_silence_duration_ms

    async def update_user_profile(
        self,
        user_id: str,
        pause_durations_ms: list[float],
        utterance_durations_ms: list[float],
    ) -> None:
        """
        Update user's VAD profile from session metrics.

        Called at end of voice session with collected timing data.
        """
        async with self._lock:
            if user_id not in self._profiles:
                self._profiles[user_id] = UserVADProfile(user_id=user_id)

            profile = self._profiles[user_id]
            profile.update_from_session(pause_durations_ms, utterance_durations_ms)

            logger.info(
                f"Updated VAD profile for user {user_id}",
                extra={
                    "user_id": user_id,
                    "optimal_silence_ms": profile.optimal_silence_duration_ms,
                    "avg_pause_ms": profile.avg_pause_duration_ms,
                    "total_sessions": profile.total_sessions,
                },
            )

    async def get_user_profile(self, user_id: str) -> Optional[UserVADProfile]:
        """Get user's VAD profile if it exists."""
        async with self._lock:
            return self._profiles.get(user_id)

    def get_stats(self) -> Dict[str, Any]:
        """Get manager statistics."""
        return {
            "total_profiles": len(self._profiles),
            "profiles": {
                uid: {
                    "optimal_silence_ms": p.optimal_silence_duration_ms,
                    "total_sessions": p.total_sessions,
                    "avg_pause_ms": p.avg_pause_duration_ms,
                }
                for uid, p in self._profiles.items()
            },
        }


# Global adaptive VAD manager
adaptive_vad_manager = AdaptiveVADManager()


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
    supports_interim_results: bool = True  # Whether provider supports partial transcripts
    supported_languages: Optional[list[str]] = None  # Supported language codes
    max_audio_duration_sec: Optional[int] = None  # Max audio duration in seconds


@dataclass
class CachedSession:
    """Cached OpenAI ephemeral session for reuse."""

    client_secret: str
    expires_at: int
    voice: str
    created_at: float = field(default_factory=time.time)


class RealtimeVoiceService:
    """
    Service for managing OpenAI Realtime API voice sessions.

    The Realtime API uses WebSocket connections for bidirectional streaming
    of audio and text. This service generates ephemeral session configuration
    that the frontend uses to establish WebSocket connections.

    Phase 11 Optimizations:
    - Session caching: Reuse ephemeral tokens if not expiring within 60s
    - Connection pooling: Persistent HTTP client with keep-alive
    - HTTP/2: Multiplexed connections for faster token generation
    """

    def __init__(self):
        self.enabled = settings.REALTIME_ENABLED
        self.model = settings.REALTIME_MODEL
        self.base_url = settings.REALTIME_BASE_URL
        self.api_key = settings.OPENAI_API_KEY
        self.token_expiry = settings.REALTIME_TOKEN_EXPIRY_SEC

        # Phase 11: Session caching for latency reduction
        self._session_cache: Dict[str, CachedSession] = {}
        self._cache_lock = asyncio.Lock()
        self._cache_expiry_buffer_sec = 60  # Don't reuse if expiring within 60s

        # Phase 11: Persistent HTTP client with connection pooling
        # HTTP/2 enabled for multiplexed connections to OpenAI
        self._http_client: Optional[httpx.AsyncClient] = None

    def is_enabled(self) -> bool:
        """Check if Realtime API is enabled and configured"""
        return self.enabled and bool(self.api_key)

    async def _get_http_client(self) -> httpx.AsyncClient:
        """
        Get or create persistent HTTP client with connection pooling.

        Phase 11: Uses HTTP/2 for multiplexed connections, reducing
        connection establishment overhead for repeated requests.

        Returns:
            Persistent AsyncClient instance
        """
        if self._http_client is None or self._http_client.is_closed:
            # Create client with HTTP/2 support and connection pooling
            self._http_client = httpx.AsyncClient(
                timeout=30.0,
                http2=True,  # Enable HTTP/2 for multiplexing
                limits=httpx.Limits(
                    max_keepalive_connections=10,
                    max_connections=20,
                    keepalive_expiry=30.0,  # Keep connections alive for 30s
                ),
            )
            logger.debug("Created persistent HTTP client with HTTP/2 and connection pooling")
        return self._http_client

    def _get_cache_key(self, voice: str) -> str:
        """Generate cache key for session lookup."""
        return f"{self.model}:{voice}"

    async def _get_cached_session(self, voice: str) -> Optional[CachedSession]:
        """
        Get a cached session if available and not expiring soon.

        Phase 11: Reuses ephemeral tokens if they have more than 60s remaining.
        This avoids redundant OpenAI API calls for rapid pre-warm scenarios.

        Returns:
            Cached session if valid, None otherwise
        """
        cache_key = self._get_cache_key(voice)
        current_time = int(time.time())

        async with self._cache_lock:
            cached = self._session_cache.get(cache_key)
            if cached is None:
                return None

            # Check if session is expiring within buffer period
            time_remaining = cached.expires_at - current_time
            if time_remaining < self._cache_expiry_buffer_sec:
                # Session expiring soon, remove from cache
                del self._session_cache[cache_key]
                logger.debug(
                    f"Cache miss: session expiring in {time_remaining}s",
                    extra={"voice": voice, "time_remaining": time_remaining},
                )
                return None

            logger.info(
                f"Cache hit: reusing session (expires in {time_remaining}s)",
                extra={"voice": voice, "time_remaining": time_remaining},
            )
            return cached

    async def _cache_session(self, voice: str, session: CachedSession) -> None:
        """Store a session in the cache."""
        cache_key = self._get_cache_key(voice)
        async with self._cache_lock:
            self._session_cache[cache_key] = session
            logger.debug(
                f"Cached session for voice {voice}",
                extra={"voice": voice, "expires_at": session.expires_at},
            )

    async def create_openai_ephemeral_session(self, model: str, voice: str = "alloy") -> Dict[str, Any]:
        """
        Create an ephemeral session with OpenAI's Realtime API.

        This calls OpenAI's session creation endpoint to get a real ephemeral
        client secret that can be used to connect to the Realtime WebSocket.

        Phase 11 Optimizations:
        - Checks cache for valid session before making API call
        - Uses persistent HTTP client with connection pooling
        - HTTP/2 for multiplexed connections

        Args:
            model: The Realtime model to use (e.g., "gpt-4o-realtime-preview-2024-12-17")
            voice: The voice to use (default: "alloy")

        Returns:
            Dict containing:
            - client_secret: Ephemeral token for client use
            - expires_at: Unix timestamp when token expires
            - cached: Whether this was served from cache (Phase 11)

        Raises:
            ValueError: If session creation fails
        """
        # Phase 11: Check cache first
        cached_session = await self._get_cached_session(voice)
        if cached_session:
            return {
                "client_secret": cached_session.client_secret,
                "expires_at": cached_session.expires_at,
                "cached": True,
            }

        try:
            # Phase 11: Use persistent HTTP client instead of creating new one
            client = await self._get_http_client()
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
                raise ValueError(f"Failed to create OpenAI session: {response.status_code}")

            data = response.json()

            # OpenAI returns: { "client_secret": { "value": "ek_...", "expires_at": timestamp } }
            client_secret_data = data.get("client_secret", {})
            client_secret = client_secret_data.get("value")
            expires_at = client_secret_data.get("expires_at")

            if not client_secret:
                raise ValueError("OpenAI did not return a client_secret")

            # Phase 11: Cache the session for future requests
            await self._cache_session(
                voice,
                CachedSession(
                    client_secret=client_secret,
                    expires_at=expires_at,
                    voice=voice,
                ),
            )

            logger.info(
                "Created OpenAI ephemeral session",
                extra={
                    "model": model,
                    "expires_at": expires_at,
                    "cached": False,
                },
            )

            return {
                "client_secret": client_secret,
                "expires_at": expires_at,
                "cached": False,
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

    def generate_ephemeral_token(self, user_id: str, session_id: str, expires_at: int) -> str:
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
            expected_signature_b64 = base64.urlsafe_b64encode(expected_signature).decode()

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
        enable_noise_suppression: bool | None = None,
        silence_duration_ms: int | None = None,
        adaptive_vad: bool = True,
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
            silence_duration_ms: Optional explicit silence duration (200-800ms)
            adaptive_vad: Whether to use adaptive VAD based on user patterns

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
            raise ValueError("Realtime API is not enabled or OpenAI API key not configured")

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

        # Get optimal silence duration from adaptive VAD manager
        optimal_silence_ms = await adaptive_vad_manager.get_optimal_silence_duration(
            user_id=user_id,
            requested_silence_ms=silence_duration_ms,
            adaptive_enabled=adaptive_vad,
        )

        # Adaptive prefix padding (faster speakers get less padding)
        # Range: 200ms (fast) to 400ms (slow)
        prefix_padding_ms = 200 if optimal_silence_ms < 400 else 300

        # Determine noise suppression preference (defaults to settings or True)
        if enable_noise_suppression is None:
            enable_noise_suppression = True

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
                    "prefix_padding_ms": prefix_padding_ms,
                    "silence_duration_ms": optimal_silence_ms,
                },
            },
            "audio_enhancements": {
                "noise_suppression": enable_noise_suppression,
                "vad_threshold": round(vad_threshold, 2),
            },
            "adaptive_vad": {
                "enabled": adaptive_vad,
                "silence_duration_ms": optimal_silence_ms,
                "prefix_padding_ms": prefix_padding_ms,
                "is_learned": silence_duration_ms is None and adaptive_vad,
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
                "silence_duration_ms": optimal_silence_ms,
                "adaptive_vad": adaptive_vad,
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

    # Default voice instructions for fallback
    _DEFAULT_VOICE_INSTRUCTIONS = """You are a helpful medical AI assistant in voice mode.

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

    async def get_session_instructions_async(
        self, conversation_id: str | None = None, persona: str | None = None
    ) -> str:
        """
        Get system instructions for the Realtime session with dynamic lookup.

        Uses the PromptService for dynamic prompt management with fallback
        to default instructions if the dynamic lookup fails.

        Args:
            conversation_id: Optional conversation ID for context
            persona: Optional persona name to use

        Returns:
            System instructions string
        """
        try:
            # Import here to avoid circular imports
            from app.services.prompt_service import prompt_service

            # Try dynamic prompt lookup
            instructions = await prompt_service.get_voice_instructions(persona=persona, conversation_id=conversation_id)
            if instructions:
                return instructions
        except Exception as e:
            logger.warning(f"Failed to get dynamic voice instructions: {e}")

        # Fallback to default
        instructions = self._DEFAULT_VOICE_INSTRUCTIONS
        if conversation_id:
            instructions += f"\nResuming conversation: {conversation_id}"
        return instructions

    def get_session_instructions(self, conversation_id: str | None = None) -> str:
        """
        Get system instructions for the Realtime session (synchronous fallback).

        Note: Prefer using get_session_instructions_async() for async contexts.
        This method exists for backward compatibility.

        Args:
            conversation_id: Optional conversation ID for context

        Returns:
            System instructions string
        """
        instructions = self._DEFAULT_VOICE_INSTRUCTIONS

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
