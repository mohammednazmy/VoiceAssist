"""Voice authentication middleware.

Validates optional voice session tokens so WebRTC and realtime
traffic can assert the caller has completed enrollment without
requiring every endpoint to duplicate the checks.
"""

from __future__ import annotations

from typing import Callable

from app.core.logging import get_logger
from app.services.voice_authentication import voice_auth_service
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = get_logger(__name__)


class VoiceAuthMiddleware(BaseHTTPMiddleware):
    """Attach voice authentication context to incoming requests."""

    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        # Only guard voice-specific APIs
        if request.url.path.startswith("/api/voice") or request.url.path.startswith("/api/realtime/webrtc"):
            token = request.headers.get("X-Voice-Session-Token")
            if token:
                try:
                    claims = voice_auth_service.validate_session_token(token)
                    request.state.voice_auth = claims
                except ValueError as exc:  # noqa: BLE001
                    logger.warning("voice_auth_failed", extra={"error": str(exc)})
                    return Response("Invalid voice session", status_code=401)
            else:
                logger.debug("voice_auth_token_missing", extra={"path": request.url.path})

        return await call_next(request)
