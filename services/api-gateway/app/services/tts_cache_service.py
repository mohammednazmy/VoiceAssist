"""
TTS Cache Service - Efficient caching for text-to-speech synthesis

Voice Mode v4 - Phase 1 Foundation

Provides multi-level caching for TTS outputs:
- L1: In-memory LRU cache for hot phrases
- L2: Redis cache for persistent storage
- Supports both raw and SSML-enriched outputs
- Pronunciation-enhanced caching with lexicon integration
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class CacheLevel(Enum):
    """Cache storage levels."""

    L1_MEMORY = "l1_memory"  # In-memory LRU
    L2_REDIS = "l2_redis"  # Redis persistent
    MISS = "miss"  # Cache miss


@dataclass
class TTSCacheConfig:
    """Configuration for TTS caching."""

    # L1 Memory cache
    l1_enabled: bool = True
    l1_max_size: int = 500  # Max entries in memory
    l1_max_audio_size_bytes: int = 1_000_000  # 1MB max per entry

    # L2 Redis cache
    l2_enabled: bool = True
    l2_ttl_seconds: int = 86400  # 24 hours
    l2_prefix: str = "tts_cache"

    # Cache key settings
    include_voice_id: bool = True
    include_speed: bool = True
    include_pitch: bool = False

    # SSML handling
    cache_ssml_separately: bool = True

    # Metrics
    enable_metrics: bool = True


@dataclass
class CacheEntry:
    """A cached TTS audio entry."""

    audio_data: bytes
    voice_id: str
    text_hash: str
    ssml: bool
    created_at: datetime
    hit_count: int = 0
    size_bytes: int = 0

    def __post_init__(self):
        self.size_bytes = len(self.audio_data)


@dataclass
class CacheMetrics:
    """Metrics for TTS cache performance."""

    l1_hits: int = 0
    l1_misses: int = 0
    l2_hits: int = 0
    l2_misses: int = 0
    total_requests: int = 0
    bytes_served_from_cache: int = 0
    cache_fills: int = 0

    @property
    def l1_hit_rate(self) -> float:
        total = self.l1_hits + self.l1_misses
        return self.l1_hits / total if total > 0 else 0.0

    @property
    def l2_hit_rate(self) -> float:
        total = self.l2_hits + self.l2_misses
        return self.l2_hits / total if total > 0 else 0.0

    @property
    def overall_hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.l1_hits + self.l2_hits) / self.total_requests


class TTSCacheService:
    """
    Multi-level TTS caching service.

    Provides efficient caching for text-to-speech synthesis with:
    - Fast in-memory L1 cache for frequently used phrases
    - Persistent L2 Redis cache for longer-term storage
    - Support for both raw text and SSML-enriched inputs
    """

    def __init__(self, config: Optional[TTSCacheConfig] = None, redis_client: Optional[Any] = None):
        self.config = config or TTSCacheConfig()
        self._redis = redis_client
        self._l1_cache: Dict[str, CacheEntry] = {}
        self._l1_access_order: List[str] = []  # For LRU eviction
        self._metrics = CacheMetrics()
        self._initialized = False

    async def initialize(self, redis_client: Optional[Any] = None) -> None:
        """Initialize the cache service."""
        if self._initialized:
            return

        if redis_client:
            self._redis = redis_client

        logger.info(
            "Initializing TTSCacheService",
            extra={
                "l1_enabled": self.config.l1_enabled,
                "l1_max_size": self.config.l1_max_size,
                "l2_enabled": self.config.l2_enabled,
                "l2_ttl": self.config.l2_ttl_seconds,
            },
        )

        self._initialized = True

    def cache_key(self, text: str, voice_id: str, ssml: bool = False, speed: float = 1.0, pitch: float = 1.0) -> str:
        """
        Generate a unique cache key for TTS request.

        Args:
            text: Text to synthesize
            voice_id: Voice identifier
            ssml: Whether text contains SSML
            speed: Speech speed multiplier
            pitch: Pitch adjustment

        Returns:
            Unique cache key string
        """
        # Create hash of text content
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

        # Build key components
        parts = [self.config.l2_prefix, text_hash]

        if self.config.include_voice_id:
            parts.append(voice_id)

        if self.config.cache_ssml_separately:
            parts.append("ssml" if ssml else "raw")

        if self.config.include_speed and speed != 1.0:
            parts.append(f"s{speed:.2f}")

        if self.config.include_pitch and pitch != 1.0:
            parts.append(f"p{pitch:.2f}")

        return ":".join(parts)

    async def get(
        self, text: str, voice_id: str, ssml: bool = False, speed: float = 1.0, pitch: float = 1.0
    ) -> Tuple[Optional[bytes], CacheLevel]:
        """
        Get cached TTS audio if available.

        Args:
            text: Text to synthesize
            voice_id: Voice identifier
            ssml: Whether text contains SSML
            speed: Speech speed multiplier
            pitch: Pitch adjustment

        Returns:
            Tuple of (audio_bytes or None, cache_level)
        """
        self._metrics.total_requests += 1
        key = self.cache_key(text, voice_id, ssml, speed, pitch)

        # Try L1 (memory) first
        if self.config.l1_enabled and key in self._l1_cache:
            entry = self._l1_cache[key]
            entry.hit_count += 1
            self._update_lru(key)
            self._metrics.l1_hits += 1
            self._metrics.bytes_served_from_cache += entry.size_bytes
            logger.debug(f"TTS cache L1 hit: {key[:32]}...")
            return entry.audio_data, CacheLevel.L1_MEMORY

        self._metrics.l1_misses += 1

        # Try L2 (Redis) if available
        if self.config.l2_enabled and self._redis:
            try:
                cached = await self._redis.get(key)
                if cached:
                    self._metrics.l2_hits += 1
                    self._metrics.bytes_served_from_cache += len(cached)

                    # Promote to L1
                    if self.config.l1_enabled:
                        await self._store_l1(key, cached, voice_id, ssml)

                    logger.debug(f"TTS cache L2 hit: {key[:32]}...")
                    return cached, CacheLevel.L2_REDIS
            except Exception as e:
                logger.warning(f"Redis cache get error: {e}")

        self._metrics.l2_misses += 1
        return None, CacheLevel.MISS

    async def set(
        self, text: str, voice_id: str, audio_data: bytes, ssml: bool = False, speed: float = 1.0, pitch: float = 1.0
    ) -> str:
        """
        Cache TTS audio output.

        Args:
            text: Original text
            voice_id: Voice identifier
            audio_data: Generated audio bytes
            ssml: Whether text contains SSML
            speed: Speech speed multiplier
            pitch: Pitch adjustment

        Returns:
            Cache key used
        """
        key = self.cache_key(text, voice_id, ssml, speed, pitch)

        # Store in L1
        if self.config.l1_enabled:
            await self._store_l1(key, audio_data, voice_id, ssml)

        # Store in L2
        if self.config.l2_enabled and self._redis:
            try:
                await self._redis.setex(key, self.config.l2_ttl_seconds, audio_data)
            except Exception as e:
                logger.warning(f"Redis cache set error: {e}")

        self._metrics.cache_fills += 1
        logger.debug(f"TTS cached: {key[:32]}... ({len(audio_data)} bytes)")

        return key

    async def _store_l1(self, key: str, audio_data: bytes, voice_id: str, ssml: bool) -> None:
        """Store entry in L1 cache with LRU eviction."""
        # Check size limit
        if len(audio_data) > self.config.l1_max_audio_size_bytes:
            return  # Too large for L1

        # Evict if at capacity
        while len(self._l1_cache) >= self.config.l1_max_size:
            self._evict_lru()

        # Create and store entry
        entry = CacheEntry(
            audio_data=audio_data,
            voice_id=voice_id,
            text_hash=key.split(":")[1],
            ssml=ssml,
            created_at=datetime.now(timezone.utc),
        )

        self._l1_cache[key] = entry
        self._l1_access_order.append(key)

    def _update_lru(self, key: str) -> None:
        """Update LRU order for a key."""
        if key in self._l1_access_order:
            self._l1_access_order.remove(key)
        self._l1_access_order.append(key)

    def _evict_lru(self) -> None:
        """Evict least recently used entry from L1."""
        if not self._l1_access_order:
            return

        lru_key = self._l1_access_order.pop(0)
        if lru_key in self._l1_cache:
            del self._l1_cache[lru_key]

    async def get_or_generate(
        self,
        text: str,
        voice_id: str,
        generator_func,
        ssml: bool = False,
        speed: float = 1.0,
        pitch: float = 1.0,
        pronunciation_enriched: bool = False,
    ) -> bytes:
        """
        Get cached audio or generate and cache.

        Args:
            text: Text to synthesize
            voice_id: Voice identifier
            generator_func: Async function to generate TTS if cache miss
            ssml: Whether text contains SSML
            speed: Speech speed multiplier
            pitch: Pitch adjustment
            pronunciation_enriched: Whether text has pronunciation markup

        Returns:
            Audio bytes (from cache or newly generated)
        """
        # Check cache first
        cached, level = await self.get(text, voice_id, ssml, speed, pitch)
        if cached:
            return cached

        # Generate new audio
        audio_data = await generator_func(text, voice_id, speed=speed)

        # Cache the result
        await self.set(text, voice_id, audio_data, ssml, speed, pitch)

        return audio_data

    async def invalidate(
        self, text: Optional[str] = None, voice_id: Optional[str] = None, pattern: Optional[str] = None
    ) -> int:
        """
        Invalidate cache entries.

        Args:
            text: Specific text to invalidate
            voice_id: Invalidate all entries for a voice
            pattern: Redis key pattern for bulk invalidation

        Returns:
            Number of entries invalidated
        """
        count = 0

        # Invalidate L1
        if text and voice_id:
            key = self.cache_key(text, voice_id)
            if key in self._l1_cache:
                del self._l1_cache[key]
                if key in self._l1_access_order:
                    self._l1_access_order.remove(key)
                count += 1

        elif voice_id:
            # Remove all entries for this voice
            keys_to_remove = [k for k, v in self._l1_cache.items() if v.voice_id == voice_id]
            for key in keys_to_remove:
                del self._l1_cache[key]
                if key in self._l1_access_order:
                    self._l1_access_order.remove(key)
                count += 1

        # Invalidate L2
        if self.config.l2_enabled and self._redis and pattern:
            try:
                keys = await self._redis.keys(pattern)
                if keys:
                    await self._redis.delete(*keys)
                    count += len(keys)
            except Exception as e:
                logger.warning(f"Redis invalidation error: {e}")

        logger.info(f"Invalidated {count} TTS cache entries")
        return count

    def get_metrics(self) -> CacheMetrics:
        """Get current cache metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset cache metrics."""
        self._metrics = CacheMetrics()

    def get_l1_stats(self) -> Dict[str, Any]:
        """Get L1 cache statistics."""
        total_size = sum(e.size_bytes for e in self._l1_cache.values())
        return {
            "entries": len(self._l1_cache),
            "max_entries": self.config.l1_max_size,
            "total_size_bytes": total_size,
            "avg_entry_size": total_size / len(self._l1_cache) if self._l1_cache else 0,
            "voices_cached": len(set(e.voice_id for e in self._l1_cache.values())),
        }

    async def warm_cache(self, phrases: List[str], voice_id: str, generator_func) -> int:
        """
        Pre-warm cache with common phrases.

        Args:
            phrases: List of common phrases to cache
            voice_id: Voice to use
            generator_func: TTS generator function

        Returns:
            Number of phrases cached
        """
        count = 0
        for phrase in phrases:
            try:
                cached, _ = await self.get(phrase, voice_id)
                if not cached:
                    audio = await generator_func(phrase, voice_id)
                    await self.set(phrase, voice_id, audio)
                    count += 1
            except Exception as e:
                logger.warning(f"Cache warm error for '{phrase[:30]}...': {e}")

        logger.info(f"Warmed TTS cache with {count} phrases")
        return count


# Singleton instance
_tts_cache_service: Optional[TTSCacheService] = None


def get_tts_cache_service() -> TTSCacheService:
    """Get or create the singleton TTSCacheService instance."""
    global _tts_cache_service
    if _tts_cache_service is None:
        _tts_cache_service = TTSCacheService()
    return _tts_cache_service


# Common phrases to pre-warm (medical context)
COMMON_PHRASES = [
    "I understand.",
    "Let me check that for you.",
    "Based on the information provided,",
    "According to the clinical guidelines,",
    "Is there anything else you'd like to know?",
    "Could you please clarify?",
    "One moment please.",
    "I'm searching for that information.",
    "Here's what I found:",
    "The recommended dosage is",
    "Please consult your physician.",
    "That's an important question.",
    "Let me explain further.",
]
