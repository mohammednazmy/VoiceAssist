"""Multi-level caching service (Phase 7 Integration Improvements - P2.1).

Implements a two-tier caching strategy:
- L1: In-memory LRU cache (cachetools) - for hot-path, low-latency access
- L2: Redis cache - for distributed caching across instances

Architecture:
- Cache keys use prefixes for namespacing (e.g., "rag_query:", "user:", "doc_meta:")
- L1 cache checked first, then L2 on miss
- Writes go to both L1 and L2
- TTLs configured per data type based on volatility
- Prometheus metrics track hit/miss rates, latency, size

Usage:
    cache = CacheService()

    # Get with automatic L1 -> L2 fallback
    value = await cache.get("rag_query:what_is_diabetes")

    # Set in both L1 and L2
    await cache.set("rag_query:what_is_diabetes", result, ttl=300)

    # Invalidate across all layers
    await cache.delete("user:123")
"""
from typing import Any, Optional, Dict, List
import json
import time
import hashlib
import pickle
from datetime import timedelta

from cachetools import LRUCache
import redis.asyncio as redis
from app.core.config import settings
from app.core.logging import get_logger
from app.core.metrics import (
    cache_hits_total,
    cache_misses_total,
    cache_latency_seconds,
    cache_entries_total,
    cache_evictions_total,
)

logger = get_logger(__name__)


class CacheConfig:
    """Cache configuration for different data types."""

    # L1 (in-memory) configuration
    L1_MAX_SIZE = 1000  # Max entries in L1 cache

    # TTL configurations (in seconds)
    TTL_CONFIG = {
        "rag_query": 3600,  # 1 hour - RAG queries are relatively stable
        "rag_embedding": 86400,  # 24 hours - Embeddings rarely change
        "user": 900,  # 15 minutes - User data changes moderately
        "doc_meta": 7200,  # 2 hours - Document metadata is stable
        "search_results": 1800,  # 30 minutes - Search results moderately stable
        "session": 900,  # 15 minutes - Session data changes frequently
        "default": 600,  # 10 minutes - Default fallback
    }

    @classmethod
    def get_ttl(cls, key_prefix: str) -> int:
        """Get TTL for a given key prefix."""
        return cls.TTL_CONFIG.get(key_prefix, cls.TTL_CONFIG["default"])


class CacheService:
    """Multi-level cache service with L1 (in-memory) and L2 (Redis) tiers."""

    def __init__(self):
        """Initialize cache service with L1 (LRU) and L2 (Redis) backends."""
        # L1: In-memory LRU cache
        self.l1_cache: LRUCache = LRUCache(maxsize=CacheConfig.L1_MAX_SIZE)

        # L2: Redis connection pool (will be initialized lazily)
        self._redis_client: Optional[redis.Redis] = None

        logger.info(
            "cache_service_initialized",
            extra={
                "l1_max_size": CacheConfig.L1_MAX_SIZE,
                "redis_host": settings.REDIS_HOST,
            }
        )

    async def get_redis_client(self) -> redis.Redis:
        """Get or create Redis client connection."""
        if self._redis_client is None:
            self._redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                password=settings.REDIS_PASSWORD,
                db=2,  # Use database 2 for caching (0=general, 1=ARQ)
                decode_responses=False,  # Handle bytes ourselves
                socket_connect_timeout=5,
                socket_timeout=5,
            )
        return self._redis_client

    def _extract_prefix(self, key: str) -> str:
        """Extract prefix from cache key (e.g., 'rag_query:foo' -> 'rag_query')."""
        return key.split(":", 1)[0] if ":" in key else "default"

    def _serialize(self, value: Any) -> bytes:
        """Serialize value for caching using pickle."""
        try:
            return pickle.dumps(value)
        except Exception as e:
            logger.error(f"cache_serialization_error: {e}", exc_info=True)
            raise

    def _deserialize(self, data: bytes) -> Any:
        """Deserialize cached value from bytes."""
        try:
            return pickle.loads(data)
        except Exception as e:
            logger.error(f"cache_deserialization_error: {e}", exc_info=True)
            raise

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache, checking L1 first, then L2.

        Args:
            key: Cache key with prefix (e.g., "rag_query:what_is_diabetes")

        Returns:
            Cached value if found, None otherwise
        """
        key_prefix = self._extract_prefix(key)
        start_time = time.time()

        # Try L1 (in-memory) first
        try:
            if key in self.l1_cache:
                value = self.l1_cache[key]

                # Metrics
                cache_hits_total.labels(cache_layer="l1", cache_key_prefix=key_prefix).inc()
                cache_latency_seconds.labels(cache_layer="l1", operation="get").observe(
                    time.time() - start_time
                )

                logger.debug(f"cache_hit_l1: key={key}")
                return value

            # L1 miss
            cache_misses_total.labels(cache_layer="l1", cache_key_prefix=key_prefix).inc()

        except Exception as e:
            logger.warning(f"l1_cache_error: {e}")

        # Try L2 (Redis)
        try:
            redis_client = await self.get_redis_client()
            l2_start = time.time()

            data = await redis_client.get(key)

            if data:
                value = self._deserialize(data)

                # Promote to L1 for future quick access
                try:
                    self.l1_cache[key] = value
                except Exception as e:
                    logger.warning(f"l1_promotion_error: {e}")

                # Metrics
                cache_hits_total.labels(cache_layer="l2", cache_key_prefix=key_prefix).inc()
                cache_latency_seconds.labels(cache_layer="l2", operation="get").observe(
                    time.time() - l2_start
                )

                logger.debug(f"cache_hit_l2: key={key}")
                return value

            # L2 miss
            cache_misses_total.labels(cache_layer="l2", cache_key_prefix=key_prefix).inc()
            cache_latency_seconds.labels(cache_layer="l2", operation="get").observe(
                time.time() - l2_start
            )

        except Exception as e:
            logger.error(f"l2_cache_error: {e}", exc_info=True)

        logger.debug(f"cache_miss: key={key}")
        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Set value in both L1 and L2 caches.

        Args:
            key: Cache key with prefix
            value: Value to cache
            ttl: Time-to-live in seconds (auto-determined from prefix if not provided)

        Returns:
            True if successfully cached, False otherwise
        """
        key_prefix = self._extract_prefix(key)

        # Determine TTL
        if ttl is None:
            ttl = CacheConfig.get_ttl(key_prefix)

        success = True

        # Set in L1 (in-memory)
        try:
            start_time = time.time()
            self.l1_cache[key] = value

            cache_latency_seconds.labels(cache_layer="l1", operation="set").observe(
                time.time() - start_time
            )
            cache_entries_total.labels(cache_layer="l1").set(len(self.l1_cache))

        except Exception as e:
            logger.warning(f"l1_cache_set_error: {e}")
            success = False

        # Set in L2 (Redis)
        try:
            redis_client = await self.get_redis_client()
            start_time = time.time()

            serialized = self._serialize(value)
            await redis_client.setex(key, ttl, serialized)

            cache_latency_seconds.labels(cache_layer="l2", operation="set").observe(
                time.time() - start_time
            )

        except Exception as e:
            logger.error(f"l2_cache_set_error: {e}", exc_info=True)
            success = False

        if success:
            logger.debug(f"cache_set: key={key}, ttl={ttl}")

        return success

    async def delete(self, key: str) -> bool:
        """
        Delete key from both L1 and L2 caches.

        Args:
            key: Cache key to delete

        Returns:
            True if successfully deleted, False otherwise
        """
        key_prefix = self._extract_prefix(key)
        success = True

        # Delete from L1
        try:
            if key in self.l1_cache:
                del self.l1_cache[key]
                cache_evictions_total.labels(cache_layer="l1", reason="manual").inc()
                cache_entries_total.labels(cache_layer="l1").set(len(self.l1_cache))
        except Exception as e:
            logger.warning(f"l1_cache_delete_error: {e}")
            success = False

        # Delete from L2
        try:
            redis_client = await self.get_redis_client()
            await redis_client.delete(key)
            cache_evictions_total.labels(cache_layer="l2", reason="manual").inc()
        except Exception as e:
            logger.error(f"l2_cache_delete_error: {e}", exc_info=True)
            success = False

        logger.debug(f"cache_delete: key={key}")
        return success

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a pattern (L2 only - L1 cleared entirely).

        Args:
            pattern: Redis key pattern (e.g., "rag_query:*")

        Returns:
            Number of keys deleted
        """
        try:
            redis_client = await self.get_redis_client()

            # Find matching keys
            keys = []
            async for key in redis_client.scan_iter(match=pattern):
                keys.append(key)

            # Delete in batch
            if keys:
                deleted = await redis_client.delete(*keys)
                cache_evictions_total.labels(cache_layer="l2", reason="pattern").inc(deleted)
            else:
                deleted = 0

            # Clear L1 cache entirely (can't do pattern matching on LRU)
            self.l1_cache.clear()
            cache_evictions_total.labels(cache_layer="l1", reason="pattern").inc()
            cache_entries_total.labels(cache_layer="l1").set(0)

            logger.info(f"cache_delete_pattern: pattern={pattern}, deleted={deleted}")
            return deleted

        except Exception as e:
            logger.error(f"cache_delete_pattern_error: {e}", exc_info=True)
            return 0

    async def clear(self) -> bool:
        """Clear all caches (L1 and L2)."""
        try:
            # Clear L1
            self.l1_cache.clear()
            cache_entries_total.labels(cache_layer="l1").set(0)

            # Clear L2 (only our database)
            redis_client = await self.get_redis_client()
            await redis_client.flushdb()

            logger.info("cache_cleared: all layers")
            return True

        except Exception as e:
            logger.error(f"cache_clear_error: {e}", exc_info=True)
            return False

    async def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring."""
        try:
            redis_client = await self.get_redis_client()
            redis_info = await redis_client.info("memory")

            return {
                "l1": {
                    "size": len(self.l1_cache),
                    "max_size": self.l1_cache.maxsize,
                    "utilization": len(self.l1_cache) / self.l1_cache.maxsize,
                },
                "l2": {
                    "used_memory": redis_info.get("used_memory", 0),
                    "used_memory_human": redis_info.get("used_memory_human", "0B"),
                    "connected_clients": redis_info.get("connected_clients", 0),
                }
            }
        except Exception as e:
            logger.error(f"cache_stats_error: {e}", exc_info=True)
            return {}


# Global cache instance
cache_service = CacheService()


def generate_cache_key(prefix: str, *args, **kwargs) -> str:
    """
    Generate a stable cache key from prefix and arguments.

    Args:
        prefix: Cache key prefix (e.g., "rag_query", "user")
        *args: Positional arguments to include in key
        **kwargs: Keyword arguments to include in key

    Returns:
        Cache key string

    Example:
        generate_cache_key("rag_query", "what is diabetes", top_k=5)
        # Returns: "rag_query:hash_abc123"
    """
    # Create deterministic hash from args and kwargs
    key_parts = [str(arg) for arg in args]
    key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
    key_string = "|".join(key_parts)

    key_hash = hashlib.md5(key_string.encode()).hexdigest()[:12]

    return f"{prefix}:{key_hash}"
