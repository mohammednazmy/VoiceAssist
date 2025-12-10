"""
OpenAI Realtime API client

DEPRECATED: This module is LEGACY and maintained for backwards compatibility only.
The Thinker/Talker pipeline (Deepgram STT + GPT-4o + ElevenLabs TTS) is now the
primary voice implementation. See voice_pipeline_service.py for the current approach.

This client was a lightweight helper for creating realtime sessions and exchanging
signaling metadata without exposing the primary API key to callers.

The client intentionally mirrors the semantics used by
`RealtimeVoiceService` so higher level services can request
session configuration from a single place.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OpenAIRealtimeClient:
    """Minimal async client for the OpenAI Realtime API."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.base_url = base_url or settings.REALTIME_BASE_URL
        self.model = model or settings.REALTIME_MODEL

    def is_enabled(self) -> bool:
        """Return True when realtime access is configured."""

        return bool(self.api_key) and bool(self.base_url) and bool(self.model)

    async def create_session(self, *, voice: str = "alloy", modalities: Optional[list[str]] = None) -> Dict[str, Any]:
        """Create an ephemeral realtime session.

        Args:
            voice: Preferred TTS voice id
            modalities: Optional list of enabled modalities

        Returns:
            Parsed JSON payload from the OpenAI Realtime session endpoint
        """

        if not self.is_enabled():
            raise ValueError("Realtime API not configured")

        payload: Dict[str, Any] = {"model": self.model, "voice": voice}
        if modalities:
            payload["modalities"] = modalities

        async with httpx.AsyncClient(timeout=settings.OPENAI_TIMEOUT_SEC) as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code != 200:
            logger.error(
                "realtime_session_create_failed",
                extra={
                    "status_code": response.status_code,
                    "response": response.text,
                },
            )
            raise ValueError(f"Failed to create realtime session: {response.status_code}")

        data = response.json()
        logger.info(
            "realtime_session_created",
            extra={"voice": voice, "modalities": modalities or ["text", "audio"]},
        )
        return data
