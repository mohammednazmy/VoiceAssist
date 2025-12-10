"""
Utterance Aggregation Service

Accumulates speech segments within a configurable time window and merges them
before sending to the Thinker. This enables handling of fragmented speech where
users pause mid-sentence and continue after a brief delay.

Example flow:
    T=0.0s:  User: "So, I'm thinking about maybe..."
    T=0.8s:  [Silence detected - start window timer]
    T=1.5s:  User: "...adding a new event"
    T=2.3s:  [Silence detected - extend window]
    T=5.3s:  [Window expires - no more speech]
             -> Merged: "So, I'm thinking about maybe adding a new event"
             -> Send to Thinker

Natural Conversation Flow: Phase 3 - Utterance Aggregation
Feature Flag: backend.voice_utterance_aggregation
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Data Classes
# ============================================================================


@dataclass
class SpeechSegment:
    """A single speech segment captured from STT."""

    text: str
    timestamp: float  # Unix timestamp when segment was captured
    confidence: float = 1.0
    is_partial: bool = False
    language: Optional[str] = None

    def __post_init__(self):
        self.text = self.text.strip()


@dataclass
class AggregatedUtterance:
    """Result of aggregating multiple speech segments."""

    # The merged transcript
    text: str

    # Individual segments that were merged
    segments: List[SpeechSegment]

    # Timing information
    start_time: float  # When first segment was captured
    end_time: float  # When last segment was captured
    total_duration_ms: int  # Total time span of utterance

    # Aggregation metadata
    segment_count: int
    was_merged: bool  # True if multiple segments were merged

    # Language (from first segment)
    language: Optional[str] = None


@dataclass
class AggregatorConfig:
    """Configuration for utterance aggregation."""

    # Maximum time to wait for additional segments (ms)
    window_duration_ms: int = 3000

    # Minimum gap between segments to consider them separate (ms)
    min_segment_gap_ms: int = 200

    # Maximum segments to aggregate in one window
    max_segments_per_window: int = 5

    # Words that suggest more speech is coming (extend the window)
    continuation_hints: List[str] = field(
        default_factory=lambda: [
            "and",
            "but",
            "so",
            "because",
            "or",
            "then",
            "also",
            "um",
            "uh",
            "like",
            "you know",
            "I mean",
        ]
    )

    # Extend window by this amount when continuation hint detected (ms)
    continuation_extension_ms: int = 1500

    # Minimum confidence threshold for including segments
    min_confidence: float = 0.3


# ============================================================================
# Utterance Aggregator
# ============================================================================


class UtteranceAggregator:
    """
    Aggregates speech segments into coherent utterances.

    Handles the case where users pause mid-sentence by:
    1. Buffering segments within a time window
    2. Extending the window when continuation signals are detected
    3. Merging segments when the window expires or is explicitly closed
    """

    def __init__(
        self,
        config: Optional[AggregatorConfig] = None,
        on_utterance_ready: Optional[Callable[[AggregatedUtterance], Awaitable[None]]] = None,
    ):
        self.config = config or AggregatorConfig()
        self._on_utterance_ready = on_utterance_ready

        # Segment buffer
        self._segments: List[SpeechSegment] = []
        self._window_start_time: Optional[float] = None

        # Window timer
        self._window_timer: Optional[asyncio.Task] = None
        self._timer_lock = asyncio.Lock()

        # State
        self._is_aggregating = False
        self._last_segment_time: float = 0.0

        logger.info(
            f"UtteranceAggregator initialized (window={self.config.window_duration_ms}ms, "
            f"max_segments={self.config.max_segments_per_window})"
        )

    @property
    def is_aggregating(self) -> bool:
        """Check if currently aggregating segments."""
        return self._is_aggregating

    @property
    def segment_count(self) -> int:
        """Get current number of buffered segments."""
        return len(self._segments)

    @property
    def current_text(self) -> str:
        """Get current aggregated text (without finalizing)."""
        return self._merge_segments(self._segments)

    async def add_segment(
        self,
        text: str,
        confidence: float = 1.0,
        is_partial: bool = False,
        language: Optional[str] = None,
    ) -> Optional[AggregatedUtterance]:
        """
        Add a speech segment to the aggregator.

        Args:
            text: The transcript text
            confidence: STT confidence score (0-1)
            is_partial: Whether this is a partial (non-final) transcript
            language: Detected language

        Returns:
            AggregatedUtterance if the window was closed, None otherwise
        """
        if not text or not text.strip():
            return None

        # Filter low-confidence segments
        if confidence < self.config.min_confidence:
            logger.debug(f"Skipping low-confidence segment: '{text}' (conf={confidence:.2f})")
            return None

        now = time.time()
        segment = SpeechSegment(
            text=text,
            timestamp=now,
            confidence=confidence,
            is_partial=is_partial,
            language=language,
        )

        async with self._timer_lock:
            # Start new window if not aggregating
            if not self._is_aggregating:
                self._start_window(segment)
                return None

            # Check if this segment is too far from the last one
            gap_ms = (now - self._last_segment_time) * 1000
            if gap_ms > self.config.window_duration_ms:
                # Window expired, finalize current and start new
                result = await self._finalize_window()
                self._start_window(segment)
                return result

            # Add to current window
            self._segments.append(segment)
            self._last_segment_time = now

            # Check if max segments reached
            if len(self._segments) >= self.config.max_segments_per_window:
                logger.info(f"Max segments reached ({self.config.max_segments_per_window}), finalizing")
                return await self._finalize_window()

            # Check for continuation hints and extend window
            if self._has_continuation_hint(segment.text):
                await self._extend_window()

            return None

    async def add_partial(self, text: str, language: Optional[str] = None) -> None:
        """Add a partial transcript (non-final, won't trigger window close)."""
        await self.add_segment(text, confidence=0.8, is_partial=True, language=language)

    async def add_final(
        self,
        text: str,
        confidence: float = 1.0,
        language: Optional[str] = None,
    ) -> Optional[AggregatedUtterance]:
        """Add a final transcript segment."""
        return await self.add_segment(text, confidence=confidence, is_partial=False, language=language)

    async def finalize(self) -> Optional[AggregatedUtterance]:
        """Force finalization of current window."""
        async with self._timer_lock:
            if not self._is_aggregating or not self._segments:
                return None
            return await self._finalize_window()

    async def cancel(self) -> None:
        """Cancel current aggregation and clear buffer."""
        async with self._timer_lock:
            await self._cancel_timer()
            self._segments.clear()
            self._is_aggregating = False
            self._window_start_time = None

    async def on_speech_start(self) -> None:
        """Called when user starts speaking again during aggregation window."""
        async with self._timer_lock:
            if self._is_aggregating:
                # User is continuing, cancel and restart the timeout with fresh window
                # This ensures the window will still finalize eventually when speech stops,
                # even if speech_started events keep firing (which would previously leave
                # the timer permanently cancelled, causing the window to never finalize)
                await self._cancel_timer()
                self._window_timer = asyncio.create_task(
                    self._window_timeout(self.config.window_duration_ms)
                )
                logger.debug("Speech started during aggregation window, reset timer")

    # -------------------------------------------------------------------------
    # Private Methods
    # -------------------------------------------------------------------------

    def _start_window(self, segment: SpeechSegment) -> None:
        """Start a new aggregation window."""
        self._segments = [segment]
        self._window_start_time = segment.timestamp
        self._last_segment_time = segment.timestamp
        self._is_aggregating = True

        # Start window timer
        asyncio.create_task(self._start_window_timer())

        logger.debug(f"Started aggregation window with: '{segment.text}'")

    async def _start_window_timer(self) -> None:
        """Start or restart the window timer."""
        await self._cancel_timer()
        self._window_timer = asyncio.create_task(self._window_timeout(self.config.window_duration_ms))

    async def _extend_window(self) -> None:
        """Extend the current window due to continuation hint."""
        await self._cancel_timer()
        self._window_timer = asyncio.create_task(self._window_timeout(self.config.continuation_extension_ms))
        logger.debug(f"Extended window by {self.config.continuation_extension_ms}ms")

    async def _cancel_timer(self) -> None:
        """Cancel the current window timer."""
        if self._window_timer and not self._window_timer.done():
            self._window_timer.cancel()
            try:
                await self._window_timer
            except asyncio.CancelledError:
                pass
        self._window_timer = None

    async def _window_timeout(self, duration_ms: int) -> None:
        """Handle window timeout."""
        try:
            await asyncio.sleep(duration_ms / 1000.0)
            async with self._timer_lock:
                if self._is_aggregating and self._segments:
                    logger.info(f"Window timeout after {duration_ms}ms, finalizing")
                    result = await self._finalize_window()
                    if result and self._on_utterance_ready:
                        await self._on_utterance_ready(result)
        except asyncio.CancelledError:
            pass

    async def _finalize_window(self) -> Optional[AggregatedUtterance]:
        """Finalize current window and return aggregated utterance."""
        await self._cancel_timer()

        if not self._segments:
            self._is_aggregating = False
            return None

        # Merge segments
        merged_text = self._merge_segments(self._segments)

        # Build result
        result = AggregatedUtterance(
            text=merged_text,
            segments=list(self._segments),
            start_time=self._segments[0].timestamp,
            end_time=self._segments[-1].timestamp,
            total_duration_ms=int((self._segments[-1].timestamp - self._segments[0].timestamp) * 1000),
            segment_count=len(self._segments),
            was_merged=len(self._segments) > 1,
            language=self._segments[0].language,
        )

        # Clear state
        self._segments.clear()
        self._is_aggregating = False
        self._window_start_time = None

        logger.info(
            f"Finalized utterance: segments={result.segment_count}, "
            f"duration={result.total_duration_ms}ms, merged={result.was_merged}"
        )

        return result

    def _merge_segments(self, segments: List[SpeechSegment]) -> str:
        """Merge multiple segments into a single text."""
        if not segments:
            return ""

        if len(segments) == 1:
            return segments[0].text

        # Collect all segment texts
        texts = [s.text for s in segments if s.text]

        # Simple merge with deduplication
        # Handle overlapping phrases (e.g., "I want to" + "to go home" -> "I want to go home")
        merged = texts[0]

        for i in range(1, len(texts)):
            current = texts[i]
            merged = self._merge_two_texts(merged, current)

        return merged.strip()

    def _merge_two_texts(self, text1: str, text2: str) -> str:
        """Merge two texts, handling overlapping portions."""
        if not text1:
            return text2
        if not text2:
            return text1

        # Check for exact overlap (text2 starts with end of text1)
        words1 = text1.split()
        words2 = text2.split()

        # Find overlap length (up to 5 words)
        max_overlap = min(5, len(words1), len(words2))

        for overlap_len in range(max_overlap, 0, -1):
            if words1[-overlap_len:] == words2[:overlap_len]:
                # Found overlap, merge by removing duplicate
                return text1 + " " + " ".join(words2[overlap_len:])

        # No overlap, just concatenate
        return text1 + " " + text2

    def _has_continuation_hint(self, text: str) -> bool:
        """Check if text ends with a continuation hint."""
        text_lower = text.lower().strip()

        # Check for trailing continuation words
        for hint in self.config.continuation_hints:
            if text_lower.endswith(hint) or text_lower.endswith(hint + " "):
                return True

        # Check for ellipsis
        if text.strip().endswith("..."):
            return True

        return False


# ============================================================================
# Singleton / Factory
# ============================================================================


_aggregator_instances: dict = {}


def get_utterance_aggregator(
    session_id: str,
    config: Optional[AggregatorConfig] = None,
    on_utterance_ready: Optional[Callable[[AggregatedUtterance], Awaitable[None]]] = None,
) -> UtteranceAggregator:
    """Get or create an utterance aggregator for a session."""
    if session_id not in _aggregator_instances:
        _aggregator_instances[session_id] = UtteranceAggregator(
            config=config,
            on_utterance_ready=on_utterance_ready,
        )
    return _aggregator_instances[session_id]


def remove_utterance_aggregator(session_id: str) -> None:
    """Remove an utterance aggregator for a session."""
    if session_id in _aggregator_instances:
        del _aggregator_instances[session_id]
