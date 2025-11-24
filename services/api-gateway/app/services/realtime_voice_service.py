"""
OpenAI Realtime API Integration Service
Generates ephemeral tokens and session configuration for voice mode
"""

import secrets
import time
from typing import Any, Dict

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


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

    def generate_session_config(
        self, user_id: str, conversation_id: str | None = None
    ) -> Dict[str, Any]:
        """
        Generate session configuration for OpenAI Realtime API.

        Args:
            user_id: User ID for the session
            conversation_id: Optional conversation ID to resume

        Returns:
            Dictionary with session configuration including:
            - url: WebSocket URL for Realtime API
            - model: Realtime model to use
            - api_key: OpenAI API key (ephemeral or full)
            - session_id: Unique session identifier
            - expires_at: Unix timestamp when session expires
            - voice_config: Default voice configuration

        Raises:
            ValueError: If Realtime API is not enabled or configured
        """
        if not self.is_enabled():
            raise ValueError(
                "Realtime API is not enabled or OpenAI API key not configured"
            )

        # Generate unique session ID
        session_id = f"rtc_{user_id}_{secrets.token_urlsafe(16)}"

        # Calculate expiry time
        expires_at = int(time.time()) + self.token_expiry

        # Build session configuration
        config = {
            "url": self.base_url,
            "model": self.model,
            "api_key": self.api_key,  # In production, use ephemeral tokens
            "session_id": session_id,
            "expires_at": expires_at,
            "conversation_id": conversation_id,
            "voice_config": {
                "voice": "alloy",  # Default OpenAI voice
                "modalities": ["text", "audio"],  # Both text and audio
                "input_audio_format": "pcm16",  # 16-bit PCM
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",  # Server-side VAD
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
            },
        }

        logger.info(
            f"Generated Realtime session config for user {user_id}",
            extra={
                "user_id": user_id,
                "session_id": session_id,
                "conversation_id": conversation_id,
                "expires_at": expires_at,
            },
        )

        return config

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


# Global service instance
realtime_voice_service = RealtimeVoiceService()
