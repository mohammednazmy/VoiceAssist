"""
TTS Pre-warm Service

Pre-warms TTS for common response starters to reduce time-to-first-audio.
When the LLM generates text that matches a pre-warmed starter, we can
immediately stream the cached audio while generating the rest.

Phase 3: Latency Optimizations
Feature Flag: backend.voice_tts_prewarm
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Types
# ==============================================================================


class PrewarmState(str, Enum):
    """State of pre-warm cache entry."""

    PENDING = "pending"
    GENERATING = "generating"
    CACHED = "cached"
    FAILED = "failed"


@dataclass
class CachedAudio:
    """Cached audio for a pre-warmed phrase."""

    phrase: str
    audio_bytes: bytes
    duration_ms: float
    voice_id: str
    created_at: float
    state: PrewarmState = PrewarmState.CACHED
    hit_count: int = 0

    @property
    def cache_key(self) -> str:
        """Generate cache key for this phrase + voice combo."""
        return f"{self.voice_id}:{hashlib.md5(self.phrase.lower().encode()).hexdigest()}"


@dataclass
class PrewarmConfig:
    """Configuration for TTS pre-warming."""

    # Maximum number of phrases to keep in cache
    max_cache_size: int = 50

    # TTL for cached audio (seconds)
    cache_ttl_seconds: int = 3600  # 1 hour

    # Minimum phrase length to cache
    min_phrase_length: int = 2

    # Maximum phrase length to cache
    max_phrase_length: int = 50

    # Pre-warm concurrency limit
    max_concurrent_prewarm: int = 3


@dataclass
class PrewarmMetrics:
    """Metrics for pre-warm performance tracking."""

    total_cache_hits: int = 0
    total_cache_misses: int = 0
    total_prewarms: int = 0
    failed_prewarms: int = 0
    total_latency_saved_ms: float = 0
    avg_audio_duration_ms: float = 0

    @property
    def hit_rate(self) -> float:
        """Return the cache hit rate."""
        total = self.total_cache_hits + self.total_cache_misses
        if total == 0:
            return 0.0
        return self.total_cache_hits / total


# ==============================================================================
# Common Response Starters
# ==============================================================================

# Phrases that commonly start AI responses
# Categorized by type for potential prioritization
COMMON_STARTERS: Dict[str, List[str]] = {
    "affirmative": [
        "Sure,",
        "Of course,",
        "Absolutely,",
        "Yes,",
        "Certainly,",
        "Definitely,",
        "Right,",
        "Okay,",
        "OK,",
        "Got it,",
    ],
    "transitional": [
        "Let me",
        "I'll",
        "I can",
        "I'd be happy to",
        "I would",
        "That's a great question,",
        "Good question,",
        "Great question,",
        "Interesting,",
        "Well,",
    ],
    "informational": [
        "The",
        "This",
        "That",
        "It",
        "There",
        "Here's",
        "Here is",
        "Based on",
        "According to",
        "In",
    ],
    "acknowledgment": [
        "I understand,",
        "I see,",
        "Got it,",
        "Understood,",
        "Thanks for",
        "Thank you for",
    ],
    "medical": [
        "Based on",
        "The symptoms",
        "For this condition,",
        "I recommend",
        "You should",
        "It's important to",
        "Please note that",
        "In this case,",
    ],
}


def get_all_starters() -> List[str]:
    """Get all common starters as a flat list."""
    all_starters = []
    for category_starters in COMMON_STARTERS.values():
        all_starters.extend(category_starters)
    return all_starters


def get_starters_by_category(category: str) -> List[str]:
    """Get starters for a specific category."""
    return COMMON_STARTERS.get(category, [])


# ==============================================================================
# TTS Pre-warm Service
# ==============================================================================


class TTSPrewarmService:
    """
    Pre-warms TTS for common response starters.

    Generates and caches audio for phrases that commonly start AI responses.
    When the LLM output starts with a cached phrase, we can immediately
    stream the cached audio while continuing to generate the rest.

    Usage:
        from app.services.tts_prewarm_service import (
            tts_prewarm_service,
            PrewarmConfig,
        )

        # Pre-warm common starters on app startup
        await tts_prewarm_service.prewarm_common_starters(voice_id="default")

        # Check for cached audio when LLM generates text
        text = "Sure, I can help with that."
        cached = tts_prewarm_service.get_cached_audio(text, voice_id="default")
        if cached:
            # Stream cached audio immediately
            stream_audio(cached.audio_bytes)
            # Continue with rest of text
            remaining = text[len(cached.phrase):]
            generate_and_stream_tts(remaining)
    """

    def __init__(self, config: Optional[PrewarmConfig] = None):
        self.config = config or PrewarmConfig()
        self._cache: Dict[str, CachedAudio] = {}
        self._prewarm_tasks: Dict[str, asyncio.Task] = {}
        self._metrics = PrewarmMetrics()
        self._prewarm_semaphore = asyncio.Semaphore(self.config.max_concurrent_prewarm)

    # ==========================================================================
    # Public API
    # ==========================================================================

    async def prewarm_common_starters(
        self,
        voice_id: str,
        categories: Optional[List[str]] = None,
    ) -> int:
        """
        Pre-warm TTS for common response starters.

        Args:
            voice_id: Voice ID to use for TTS
            categories: Specific categories to pre-warm (default: all)

        Returns:
            Number of phrases successfully pre-warmed
        """
        if categories:
            starters = []
            for cat in categories:
                starters.extend(get_starters_by_category(cat))
        else:
            starters = get_all_starters()

        logger.info(f"[TTSPrewarm] Starting pre-warm for {len(starters)} phrases")

        # Pre-warm all starters concurrently (with semaphore limit)
        tasks = [
            self._prewarm_phrase(phrase, voice_id)
            for phrase in starters
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        success_count = sum(1 for r in results if r is True)
        logger.info(
            f"[TTSPrewarm] Pre-warm complete: {success_count}/{len(starters)} phrases cached"
        )

        return success_count

    async def prewarm_phrase(self, phrase: str, voice_id: str) -> bool:
        """
        Pre-warm TTS for a specific phrase.

        Args:
            phrase: The phrase to pre-warm
            voice_id: Voice ID to use for TTS

        Returns:
            True if successful, False otherwise
        """
        return await self._prewarm_phrase(phrase, voice_id)

    def get_cached_audio(
        self,
        text: str,
        voice_id: str,
    ) -> Optional[CachedAudio]:
        """
        Get cached audio if the text starts with a pre-warmed phrase.

        Args:
            text: The text to check for cached starters
            voice_id: Voice ID to match

        Returns:
            CachedAudio if found, None otherwise
        """
        # Normalize text for matching
        normalized_text = text.strip()

        # Check all cached phrases, preferring longer matches
        best_match: Optional[CachedAudio] = None
        best_match_len = 0

        for cache_key, cached in self._cache.items():
            if not cache_key.startswith(f"{voice_id}:"):
                continue

            if self._is_cache_expired(cached):
                continue

            # Check if text starts with cached phrase
            if normalized_text.lower().startswith(cached.phrase.lower()):
                if len(cached.phrase) > best_match_len:
                    best_match = cached
                    best_match_len = len(cached.phrase)

        if best_match:
            best_match.hit_count += 1
            self._metrics.total_cache_hits += 1
            logger.debug(
                f"[TTSPrewarm] Cache hit: '{best_match.phrase}' "
                f"(hits: {best_match.hit_count})"
            )
            return best_match

        self._metrics.total_cache_misses += 1
        return None

    def get_remaining_text(self, text: str, cached: CachedAudio) -> str:
        """
        Get the remaining text after the cached phrase.

        Args:
            text: The full text
            cached: The cached audio that was matched

        Returns:
            The remaining text after the cached phrase
        """
        # Find where the cached phrase ends in the original text
        normalized_text = text.strip()
        phrase_len = len(cached.phrase)

        # Handle case sensitivity by finding actual position
        lower_text = normalized_text.lower()
        lower_phrase = cached.phrase.lower()

        idx = lower_text.find(lower_phrase)
        if idx == 0:
            return normalized_text[phrase_len:].lstrip()

        return normalized_text

    def invalidate_cache(self, voice_id: Optional[str] = None) -> int:
        """
        Invalidate cached audio.

        Args:
            voice_id: If provided, only invalidate for this voice

        Returns:
            Number of entries invalidated
        """
        if voice_id:
            keys_to_remove = [
                k for k in self._cache.keys()
                if k.startswith(f"{voice_id}:")
            ]
        else:
            keys_to_remove = list(self._cache.keys())

        for key in keys_to_remove:
            del self._cache[key]

        logger.info(f"[TTSPrewarm] Invalidated {len(keys_to_remove)} cache entries")
        return len(keys_to_remove)

    def get_metrics(self) -> PrewarmMetrics:
        """Get pre-warm metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset pre-warm metrics."""
        self._metrics = PrewarmMetrics()

    def get_cache_stats(self) -> Dict[str, any]:
        """Get cache statistics."""
        total_entries = len(self._cache)
        expired_entries = sum(
            1 for c in self._cache.values() if self._is_cache_expired(c)
        )
        total_size_bytes = sum(len(c.audio_bytes) for c in self._cache.values())

        return {
            "total_entries": total_entries,
            "active_entries": total_entries - expired_entries,
            "expired_entries": expired_entries,
            "total_size_bytes": total_size_bytes,
            "total_size_mb": total_size_bytes / (1024 * 1024),
            "hit_rate": self._metrics.hit_rate,
        }

    # ==========================================================================
    # Internal
    # ==========================================================================

    async def _prewarm_phrase(self, phrase: str, voice_id: str) -> bool:
        """Pre-warm a single phrase."""
        # Validate phrase
        if len(phrase) < self.config.min_phrase_length:
            return False
        if len(phrase) > self.config.max_phrase_length:
            return False

        # Generate cache key
        cache_key = f"{voice_id}:{hashlib.md5(phrase.lower().encode()).hexdigest()}"

        # Check if already cached and valid
        if cache_key in self._cache and not self._is_cache_expired(self._cache[cache_key]):
            return True

        async with self._prewarm_semaphore:
            try:
                self._metrics.total_prewarms += 1
                logger.debug(f"[TTSPrewarm] Pre-warming: '{phrase}'")

                # Generate TTS audio
                start_time = time.time()
                audio_bytes, duration_ms = await self._generate_tts(phrase, voice_id)
                elapsed_ms = (time.time() - start_time) * 1000

                if not audio_bytes:
                    self._metrics.failed_prewarms += 1
                    return False

                # Cache the audio
                cached = CachedAudio(
                    phrase=phrase,
                    audio_bytes=audio_bytes,
                    duration_ms=duration_ms,
                    voice_id=voice_id,
                    created_at=time.time(),
                    state=PrewarmState.CACHED,
                )
                self._cache[cache_key] = cached

                # Update metrics
                total_duration = sum(c.duration_ms for c in self._cache.values())
                self._metrics.avg_audio_duration_ms = total_duration / len(self._cache)

                logger.debug(
                    f"[TTSPrewarm] Cached '{phrase}' "
                    f"(duration: {duration_ms:.0f}ms, generated in {elapsed_ms:.0f}ms)"
                )

                # Enforce cache size limit
                self._enforce_cache_limit()

                return True

            except Exception as e:
                logger.error(f"[TTSPrewarm] Failed to pre-warm '{phrase}': {e}")
                self._metrics.failed_prewarms += 1
                return False

    async def _generate_tts(
        self,
        text: str,
        voice_id: str,
    ) -> Tuple[bytes, float]:
        """
        Generate TTS audio for text.

        Returns:
            Tuple of (audio_bytes, duration_ms)
        """
        try:
            # Import here to avoid circular imports
            from app.services.talker_service import TalkerService

            talker = TalkerService()

            # Generate audio
            audio_bytes = await talker.synthesize(
                text=text,
                voice_id=voice_id,
            )

            if not audio_bytes:
                return b"", 0.0

            # Estimate duration based on text length
            # Typical speech is ~150 words per minute, ~5 chars per word
            # So ~750 chars per minute, ~12.5 chars per second
            estimated_duration_ms = len(text) / 12.5 * 1000

            return audio_bytes, estimated_duration_ms

        except Exception as e:
            logger.error(f"[TTSPrewarm] TTS generation failed: {e}")
            return b"", 0.0

    def _is_cache_expired(self, cached: CachedAudio) -> bool:
        """Check if a cache entry has expired."""
        age = time.time() - cached.created_at
        return age > self.config.cache_ttl_seconds

    def _enforce_cache_limit(self) -> None:
        """Remove oldest entries if cache exceeds size limit."""
        if len(self._cache) <= self.config.max_cache_size:
            return

        # Sort by created_at and hit_count (prefer keeping high-hit items)
        sorted_entries = sorted(
            self._cache.items(),
            key=lambda x: (x[1].hit_count, x[1].created_at),
        )

        # Remove oldest/least-used entries
        entries_to_remove = len(self._cache) - self.config.max_cache_size
        for i in range(entries_to_remove):
            key = sorted_entries[i][0]
            del self._cache[key]

        logger.debug(f"[TTSPrewarm] Evicted {entries_to_remove} cache entries")


# ==============================================================================
# Factory and Singleton
# ==============================================================================


def create_tts_prewarm_service(
    config: Optional[PrewarmConfig] = None,
) -> TTSPrewarmService:
    """Create a new TTS pre-warm service instance."""
    return TTSPrewarmService(config)


# Global singleton (created on first import)
tts_prewarm_service = TTSPrewarmService()


def get_tts_prewarm_service() -> TTSPrewarmService:
    """Get the global TTS pre-warm service instance."""
    return tts_prewarm_service
