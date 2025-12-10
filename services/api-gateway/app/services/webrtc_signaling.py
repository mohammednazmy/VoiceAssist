"""In-memory WebRTC signaling helper.

This module tracks SDP offers/answers and ICE candidates so the
frontend can establish a peer connection for low-latency media
delivery. The goal is to keep signaling stateless for now while
still surfacing VAD and noise suppression preferences coming from
server-side audio utilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.core.logging import get_logger
from app.services.audio_processor import AudioProcessor, AudioProcessorConfig
from app.services.voice_activity_detector import VoiceActivityDetector

logger = get_logger(__name__)


@dataclass
class WebRTCSession:
    """Cached signaling payloads for a single session."""

    session_id: str
    user_id: str
    offer_sdp: Optional[str] = None
    answer_sdp: Optional[str] = None
    ice_candidates: List[dict] = field(default_factory=list)
    vad_threshold: float = 0.5
    noise_suppression: bool = True


class WebRTCSignalingService:
    """Simple in-memory signaling store."""

    def __init__(self) -> None:
        self._sessions: Dict[str, WebRTCSession] = {}
        vad = VoiceActivityDetector()
        self._default_vad_threshold = vad.config.threshold
        self._audio_processor = AudioProcessor(AudioProcessorConfig())

    def _get_or_create(self, session_id: str, user_id: str) -> WebRTCSession:
        if session_id not in self._sessions:
            self._sessions[session_id] = WebRTCSession(
                session_id=session_id,
                user_id=user_id,
                vad_threshold=self._default_vad_threshold,
                noise_suppression=self._audio_processor.config.noise_enabled,
            )
        return self._sessions[session_id]

    def register_offer(self, *, session_id: str, user_id: str, sdp: str) -> WebRTCSession:
        session = self._get_or_create(session_id, user_id)
        session.offer_sdp = sdp
        logger.info(
            "webrtc_offer_registered",
            extra={"session_id": session_id, "user_id": user_id},
        )
        return session

    def register_answer(self, *, session_id: str, user_id: str, sdp: str) -> Optional[WebRTCSession]:
        session = self._sessions.get(session_id)
        if not session:
            logger.warning(
                "webrtc_answer_missing_session",
                extra={"session_id": session_id, "user_id": user_id},
            )
            return None

        session.answer_sdp = sdp
        logger.info(
            "webrtc_answer_registered",
            extra={"session_id": session_id, "user_id": user_id},
        )
        return session

    def add_ice_candidate(self, *, session_id: str, user_id: str, candidate: dict) -> Optional[WebRTCSession]:
        session = self._sessions.get(session_id)
        if not session:
            logger.warning(
                "webrtc_candidate_missing_session",
                extra={"session_id": session_id, "user_id": user_id},
            )
            return None

        session.ice_candidates.append(candidate)
        logger.debug(
            "webrtc_candidate_added",
            extra={"session_id": session_id, "count": len(session.ice_candidates)},
        )
        return session

    def get_session(self, session_id: str) -> Optional[WebRTCSession]:
        return self._sessions.get(session_id)

    def clear_session(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info("webrtc_session_cleared", extra={"session_id": session_id})


signaling_service = WebRTCSignalingService()
