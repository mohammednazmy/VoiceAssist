"""
WebRTC Signaling Service

Provides WebRTC signaling for voice pipeline connections.
Enables lower-latency voice streaming via WebRTC data channels
as a fallback/enhancement to WebSocket transport.

Phase: WebSocket Advanced Features

Features:
- SDP offer/answer exchange
- ICE candidate exchange
- Session management
- STUN/TURN configuration

Architecture:
- Client initiates WebRTC connection via REST API
- Signaling happens over HTTP (not WebSocket) for simplicity
- Data channel carries audio frames with same binary protocol as WS
- Audio I/O goes through data channel for lower latency
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.core.config import settings
from app.core.feature_flags import feature_flags
from app.core.logging import get_logger

logger = get_logger(__name__)


class WebRTCSessionState(str, Enum):
    """WebRTC session states"""

    CREATED = "created"
    OFFER_RECEIVED = "offer_received"
    ANSWER_SENT = "answer_sent"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    FAILED = "failed"


@dataclass
class ICECandidate:
    """ICE candidate"""

    candidate: str
    sdpMid: str | None = None
    sdpMLineIndex: int | None = None
    usernameFragment: str | None = None


@dataclass
class WebRTCSession:
    """WebRTC session state"""

    session_id: str
    user_id: str
    voice_session_id: str | None = None
    state: WebRTCSessionState = WebRTCSessionState.CREATED
    offer_sdp: str | None = None
    answer_sdp: str | None = None
    local_candidates: list[ICECandidate] = field(default_factory=list)
    remote_candidates: list[ICECandidate] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    data_channel_label: str = "voice"


class WebRTCSignalingService:
    """
    WebRTC Signaling Service

    Manages WebRTC session signaling for voice connections.
    This is a server-side component that coordinates SDP and ICE
    exchange between clients and the voice pipeline.

    Note: This service handles signaling only. The actual WebRTC
    connection is peer-to-peer between the client and the voice
    pipeline (or a media server if deployed).
    """

    def __init__(self):
        self.sessions: dict[str, WebRTCSession] = {}
        self._cleanup_interval = 300  # 5 minutes
        self._session_timeout = 3600  # 1 hour

    def is_enabled(self) -> bool:
        """Check if WebRTC transport is enabled via feature flag"""
        try:
            return feature_flags.is_enabled("backend.ws_webrtc_fallback")
        except Exception:
            return False

    def get_ice_servers(self) -> list[dict[str, Any]]:
        """
        Get ICE server configuration.

        Returns STUN/TURN server configurations for WebRTC.
        Uses settings or defaults to Google's public STUN server.
        """
        ice_servers = []

        # Add STUN server
        stun_url = getattr(settings, "WEBRTC_STUN_URL", None)
        if stun_url:
            ice_servers.append({"urls": stun_url})
        else:
            # Default to Google's public STUN server
            ice_servers.append({"urls": "stun:stun.l.google.com:19302"})

        # Add TURN server if configured
        turn_url = getattr(settings, "WEBRTC_TURN_URL", None)
        turn_username = getattr(settings, "WEBRTC_TURN_USERNAME", None)
        turn_credential = getattr(settings, "WEBRTC_TURN_CREDENTIAL", None)

        if turn_url and turn_username and turn_credential:
            ice_servers.append(
                {
                    "urls": turn_url,
                    "username": turn_username,
                    "credential": turn_credential,
                }
            )

        return ice_servers

    def create_session(
        self,
        user_id: str,
        voice_session_id: str | None = None,
    ) -> WebRTCSession:
        """
        Create a new WebRTC signaling session.

        Args:
            user_id: User ID for authentication
            voice_session_id: Optional voice session ID to link

        Returns:
            New WebRTC session
        """
        session_id = str(uuid.uuid4())
        session = WebRTCSession(
            session_id=session_id,
            user_id=user_id,
            voice_session_id=voice_session_id,
        )

        self.sessions[session_id] = session

        logger.info(
            f"Created WebRTC session {session_id} for user {user_id}",
            extra={
                "session_id": session_id,
                "user_id": user_id,
                "voice_session_id": voice_session_id,
            },
        )

        return session

    def get_session(self, session_id: str) -> WebRTCSession | None:
        """Get session by ID"""
        return self.sessions.get(session_id)

    def set_offer(self, session_id: str, offer_sdp: str) -> bool:
        """
        Set the client's SDP offer.

        Args:
            session_id: Session ID
            offer_sdp: SDP offer from client

        Returns:
            True if successful
        """
        session = self.sessions.get(session_id)
        if not session:
            return False

        session.offer_sdp = offer_sdp
        session.state = WebRTCSessionState.OFFER_RECEIVED
        session.updated_at = time.time()

        logger.debug(
            f"Received offer for session {session_id}",
            extra={"session_id": session_id},
        )

        return True

    def create_answer(self, session_id: str) -> str | None:
        """
        Create SDP answer for the client's offer.

        Note: In a full implementation, this would involve
        actually creating a WebRTC peer connection. For now,
        we're returning a placeholder that clients will use
        for signaling coordination.

        Args:
            session_id: Session ID

        Returns:
            SDP answer string or None if failed
        """
        session = self.sessions.get(session_id)
        if not session or not session.offer_sdp:
            return None

        # In a real implementation, we would:
        # 1. Parse the offer SDP
        # 2. Create a peer connection on the server side
        # 3. Add ICE candidates
        # 4. Generate an answer SDP

        # For this phase, we're implementing signaling coordination
        # The actual WebRTC connection will be handled by:
        # - A dedicated media server (Janus, Jitsi, etc.)
        # - Or client-to-pipeline direct connection

        # Placeholder answer - indicates signaling is ready
        # Real answer would come from media server integration
        answer_sdp = self._generate_placeholder_answer(session.offer_sdp)

        session.answer_sdp = answer_sdp
        session.state = WebRTCSessionState.ANSWER_SENT
        session.updated_at = time.time()

        logger.debug(
            f"Created answer for session {session_id}",
            extra={"session_id": session_id},
        )

        return answer_sdp

    def _generate_placeholder_answer(self, offer_sdp: str) -> str:
        """
        Generate a placeholder SDP answer.

        This is a simplified answer that indicates the server
        acknowledges the offer. In production, this would be
        replaced with actual SDP negotiation.
        """
        # Extract basic info from offer for answer generation
        # This is a minimal SDP that indicates data channel support

        # For now, return the offer back as the answer
        # In a real implementation, this would be properly negotiated
        return offer_sdp.replace("a=setup:actpass", "a=setup:active")

    def add_ice_candidate(
        self,
        session_id: str,
        candidate: ICECandidate,
        from_remote: bool = True,
    ) -> bool:
        """
        Add an ICE candidate to the session.

        Args:
            session_id: Session ID
            candidate: ICE candidate
            from_remote: True if from client, False if from server

        Returns:
            True if successful
        """
        session = self.sessions.get(session_id)
        if not session:
            return False

        if from_remote:
            session.remote_candidates.append(candidate)
        else:
            session.local_candidates.append(candidate)

        session.updated_at = time.time()

        logger.debug(
            f"Added ICE candidate to session {session_id}",
            extra={
                "session_id": session_id,
                "from_remote": from_remote,
                "candidate_count": len(session.remote_candidates) + len(session.local_candidates),
            },
        )

        return True

    def get_pending_candidates(
        self,
        session_id: str,
        local: bool = True,
    ) -> list[ICECandidate]:
        """
        Get pending ICE candidates for exchange.

        Args:
            session_id: Session ID
            local: True to get local candidates, False for remote

        Returns:
            List of ICE candidates
        """
        session = self.sessions.get(session_id)
        if not session:
            return []

        return session.local_candidates if local else session.remote_candidates

    def update_state(
        self,
        session_id: str,
        state: WebRTCSessionState,
    ) -> bool:
        """Update session state"""
        session = self.sessions.get(session_id)
        if not session:
            return False

        session.state = state
        session.updated_at = time.time()

        logger.info(
            f"WebRTC session {session_id} state -> {state}",
            extra={"session_id": session_id, "state": state.value},
        )

        return True

    def close_session(self, session_id: str) -> bool:
        """Close and remove a session"""
        session = self.sessions.pop(session_id, None)
        if not session:
            return False

        logger.info(
            f"Closed WebRTC session {session_id}",
            extra={
                "session_id": session_id,
                "duration": time.time() - session.created_at,
            },
        )

        return True

    def cleanup_stale_sessions(self) -> int:
        """
        Remove stale sessions.

        Returns:
            Number of sessions removed
        """
        now = time.time()
        stale_sessions = [
            sid for sid, session in self.sessions.items() if now - session.updated_at > self._session_timeout
        ]

        for sid in stale_sessions:
            self.close_session(sid)

        if stale_sessions:
            logger.info(f"Cleaned up {len(stale_sessions)} stale WebRTC sessions")

        return len(stale_sessions)

    def get_session_info(self, session_id: str) -> dict[str, Any] | None:
        """Get session info for API response"""
        session = self.sessions.get(session_id)
        if not session:
            return None

        return {
            "session_id": session.session_id,
            "state": session.state.value,
            "voice_session_id": session.voice_session_id,
            "data_channel_label": session.data_channel_label,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "has_offer": session.offer_sdp is not None,
            "has_answer": session.answer_sdp is not None,
            "local_candidates_count": len(session.local_candidates),
            "remote_candidates_count": len(session.remote_candidates),
        }


# Singleton instance
webrtc_signaling_service = WebRTCSignalingService()
