"""
Progressive Response - Domain-Specific Fillers and Timing

Provides appropriate "thinking" responses for complex queries.
Manages response timing for natural conversation flow.

Issue 4: Wire progressive response to WebSocket via VoiceEventBus.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from app.core.event_bus import VoiceEventBus
    from app.engines.conversation_engine import QueryClassification

logger = logging.getLogger(__name__)


@dataclass
class FillerConfig:
    """Configuration for filler responses"""

    text: str
    audio_duration_ms: int = 1000
    tts_priority: str = "high"  # Prioritize generating this quickly


class ProgressiveResponse:
    """
    Progressive response manager.

    Provides domain-specific "thinking" fillers for complex queries
    to maintain natural conversation flow while processing.

    Fillers are:
    - Domain-aware (medical, calendar, general)
    - Emotion-appropriate (calm for anxious users)
    - Brief (1-2 seconds TTS)
    """

    # Domain-specific thinking fillers
    DOMAIN_FILLERS = {
        "medical": [
            "Let me review the clinical information...",
            "Checking the patient data...",
            "Looking at the medical records...",
            "One moment while I check that...",
        ],
        "calendar": [
            "Checking your schedule...",
            "Looking at your calendar...",
            "Let me find an available time...",
            "One moment...",
        ],
        "technical": [
            "Analyzing that...",
            "Processing your request...",
            "Let me look into that...",
        ],
        "general": [
            "Let me think about that...",
            "One moment...",
            "Looking into that...",
            "Let me check...",
        ],
    }

    # Emotion-adjusted fillers
    EMOTION_FILLERS = {
        "frustration": [
            "I'm on it.",
            "Working on that now.",
            "Just a moment.",
        ],
        "anxiety": [
            "I'm checking that for you now.",
            "One moment, I'll have an answer shortly.",
            "Just confirming that information.",
        ],
        "confusion": [
            "Let me explain...",
            "I'll break that down...",
        ],
    }

    # Urgency overrides (no filler for urgent)
    SKIP_FILLER_TYPES = ["urgent", "command"]

    def __init__(self, event_bus: Optional["VoiceEventBus"] = None):
        self._filler_history: Dict[str, List[str]] = {}
        self._event_bus: Optional["VoiceEventBus"] = event_bus
        self._current_session_id: Optional[str] = None
        logger.info("ProgressiveResponse initialized")

    def set_event_bus(self, event_bus: "VoiceEventBus") -> None:
        """Set the event bus for publishing filler events (Issue 4)."""
        self._event_bus = event_bus

    def set_session_id(self, session_id: str) -> None:
        """Set the current session ID for event context."""
        self._current_session_id = session_id

    async def _publish_filler_triggered(
        self,
        filler_text: str,
        domain: str,
        query_type: str,
    ) -> None:
        """
        Issue 4: Publish filler.triggered event when a filler is selected.

        This allows the frontend to show progressive feedback during processing.
        """
        if not self._event_bus:
            return

        await self._event_bus.publish_event(
            event_type="filler.triggered",
            data={
                "text": filler_text,
                "domain": domain,
                "query_type": query_type,
                "timestamp": time.time(),
            },
            session_id=self._current_session_id,
            source_engine="progressive_response",
            priority=5,
        )
        logger.debug(f"[ProgressiveResponse] Published filler.triggered: {filler_text}")

    async def _publish_filler_played(
        self,
        filler_text: str,
        duration_ms: int,
    ) -> None:
        """
        Issue 4: Publish filler.played event when a filler finishes playing.
        """
        if not self._event_bus:
            return

        await self._event_bus.publish_event(
            event_type="filler.played",
            data={
                "text": filler_text,
                "duration_ms": duration_ms,
                "timestamp": time.time(),
            },
            session_id=self._current_session_id,
            source_engine="progressive_response",
            priority=5,
        )
        logger.debug(f"[ProgressiveResponse] Published filler.played: {filler_text}")

    async def report_filler_played(
        self,
        filler_text: str,
        duration_ms: int = 1000,
    ) -> None:
        """
        Issue 4: Report that a filler phrase has finished playing.

        Call this after the TTS audio for the filler has finished.
        """
        await self._publish_filler_played(filler_text, duration_ms)

    async def get_filler(
        self,
        query_classification: "QueryClassification",
        emotion_state: Optional[Dict] = None,
    ) -> Optional[str]:
        """
        Get appropriate filler response.

        Returns None if no filler should be used.

        Issue 4: Now publishes filler.triggered event when a filler is selected.
        """
        # Skip filler for urgent/command queries
        if query_classification.query_type in self.SKIP_FILLER_TYPES:
            return None

        if not query_classification.use_filler:
            return None

        domain = query_classification.domain or "general"
        query_type = query_classification.query_type or "general"
        filler_text: Optional[str] = None

        # Check for emotion-specific filler
        if emotion_state:
            emotion = emotion_state.get("dominant_emotion", "neutral")
            if emotion in self.EMOTION_FILLERS:
                filler_text = self._select_filler(
                    self.EMOTION_FILLERS[emotion],
                    domain,
                )

        # Use domain-specific filler if no emotion filler
        if not filler_text:
            fillers = self.DOMAIN_FILLERS.get(domain, self.DOMAIN_FILLERS["general"])
            filler_text = self._select_filler(fillers, domain)

        # Issue 4: Publish event when filler is selected
        if filler_text:
            await self._publish_filler_triggered(filler_text, domain, query_type)

        return filler_text

    def _select_filler(self, fillers: List[str], domain: str) -> str:
        """Select filler avoiding recent repetition"""
        recent = self._filler_history.get(domain, [])

        # Prefer fillers not recently used
        available = [f for f in fillers if f not in recent]
        if not available:
            available = fillers
            self._filler_history[domain] = []

        selected = random.choice(available)  # nosec B311 - non-cryptographic UI variety

        # Track usage
        if domain not in self._filler_history:
            self._filler_history[domain] = []
        self._filler_history[domain].append(selected)

        # Keep only last 3
        self._filler_history[domain] = self._filler_history[domain][-3:]

        return selected

    def get_progressive_segments(
        self,
        query_classification: "QueryClassification",
        estimated_wait_ms: int,
    ) -> List[Dict[str, Any]]:
        """
        Get progressive response segments for long waits.

        For very long processing (>3s), provide multiple progress updates.
        """
        segments = []

        if estimated_wait_ms < 2000:
            # Short wait, single filler is enough
            return segments

        # Add progress segments for longer waits
        if estimated_wait_ms > 3000:
            segments.append(
                {
                    "delay_ms": 2000,
                    "text": "Still working on that...",
                    "type": "progress",
                }
            )

        if estimated_wait_ms > 5000:
            segments.append(
                {
                    "delay_ms": 4000,
                    "text": "Almost there...",
                    "type": "progress",
                }
            )

        if estimated_wait_ms > 8000:
            segments.append(
                {
                    "delay_ms": 7000,
                    "text": "This is taking longer than usual. Would you like to wait or try something else?",
                    "type": "option",
                }
            )

        return segments


__all__ = ["ProgressiveResponse", "FillerConfig"]
