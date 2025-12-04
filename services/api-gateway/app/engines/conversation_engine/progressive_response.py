"""
Progressive Response - Domain-Specific Fillers and Timing

Provides appropriate "thinking" responses for complex queries.
Manages response timing for natural conversation flow.
"""

import logging
import random
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

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

    def __init__(self):
        self._filler_history: Dict[str, List[str]] = {}
        logger.info("ProgressiveResponse initialized")

    async def get_filler(
        self,
        query_classification: "QueryClassification",
        emotion_state: Optional[Dict] = None,
    ) -> Optional[str]:
        """
        Get appropriate filler response.

        Returns None if no filler should be used.
        """
        # Skip filler for urgent/command queries
        if query_classification.query_type in self.SKIP_FILLER_TYPES:
            return None

        if not query_classification.use_filler:
            return None

        # Check for emotion-specific filler
        if emotion_state:
            emotion = emotion_state.get("dominant_emotion", "neutral")
            if emotion in self.EMOTION_FILLERS:
                return self._select_filler(
                    self.EMOTION_FILLERS[emotion],
                    query_classification.domain or "general",
                )

        # Use domain-specific filler
        domain = query_classification.domain or "general"
        fillers = self.DOMAIN_FILLERS.get(domain, self.DOMAIN_FILLERS["general"])
        return self._select_filler(fillers, domain)

    def _select_filler(self, fillers: List[str], domain: str) -> str:
        """Select filler avoiding recent repetition"""
        recent = self._filler_history.get(domain, [])

        # Prefer fillers not recently used
        available = [f for f in fillers if f not in recent]
        if not available:
            available = fillers
            self._filler_history[domain] = []

        selected = random.choice(available)

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
