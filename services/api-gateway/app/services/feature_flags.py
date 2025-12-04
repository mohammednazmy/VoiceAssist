"""Feature Flag Service (Phase 7 - P3.1 + Phase 10 Enhancement).

Provides runtime feature flag management with multi-level caching for performance:
- L1 Cache: In-memory LRU cache (1-minute TTL) for super fast access
- L2 Cache: Redis distributed cache (5-minute TTL) for cross-instance consistency
- L3 Persistence: PostgreSQL for durability

This three-tier architecture provides:
- Sub-millisecond flag checks via L1 cache
- Cross-instance consistency via L2 (Redis)
- Durability and management via L3 (PostgreSQL)

Usage:
    from app.services.feature_flags import feature_flag_service

    # Check if feature is enabled (uses L1 -> L2 -> L3 cascade)
    if await feature_flag_service.is_enabled("rbac_enforcement"):
        # RBAC logic
        pass

    # Get feature value
    rag_strategy = await feature_flag_service.get_value("rag_strategy", default="simple")

    # Warm cache on startup
    await feature_flag_service.warm_cache()
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import SessionLocal, redis_client
from app.core.logging import get_logger
from app.models.feature_flag import FeatureFlag, FeatureFlagType
from cachetools import TTLCache
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = get_logger(__name__)

# Redis key prefix for feature flags (L2 cache)
FEATURE_FLAG_CACHE_PREFIX = "feature_flag:"
FEATURE_FLAG_CACHE_TTL = 300  # 5 minutes (L2 TTL)

# Local in-memory cache settings (L1 cache)
LOCAL_CACHE_TTL = 60  # 1 minute (L1 TTL - much shorter for quick updates)
LOCAL_CACHE_MAX_SIZE = 1000  # Maximum number of flags to cache in memory


class FeatureFlagService:
    """Service for managing and checking feature flags with multi-level caching.

    Three-tier caching architecture:
    - L1: In-memory TTL cache (1-minute TTL) - fastest, process-local
    - L2: Redis distributed cache (5-minute TTL) - shared across instances
    - L3: PostgreSQL persistence - source of truth

    Features:
    - Sub-millisecond flag checks via L1 cache
    - Cross-instance consistency via L2 (Redis)
    - PostgreSQL persistence for durability
    - Automatic cache invalidation on updates (all levels)
    - Cache warming on startup
    - Graceful degradation if caches unavailable
    - Support for boolean, string, number, and JSON values
    - Prometheus metrics for cache performance
    """

    def __init__(self):
        """Initialize feature flag service with multi-level caching."""
        self.logger = get_logger(__name__)

        # L1 Cache: Local in-memory cache with TTL
        # Uses cachetools.TTLCache for automatic expiration
        self._local_cache: TTLCache = TTLCache(maxsize=LOCAL_CACHE_MAX_SIZE, ttl=LOCAL_CACHE_TTL)
        self._cache_stats = {
            "l1_hits": 0,
            "l1_misses": 0,
            "l2_hits": 0,
            "l2_misses": 0,
            "l3_hits": 0,
            "l3_misses": 0,
        }

    def _get_cache_key(self, flag_name: str) -> str:
        """Get Redis cache key for feature flag."""
        return f"{FEATURE_FLAG_CACHE_PREFIX}{flag_name}"

    async def _get_from_local_cache(self, flag_name: str) -> Optional[Dict[str, Any]]:
        """Get feature flag from L1 (local in-memory) cache.

        Args:
            flag_name: Name of the feature flag

        Returns:
            Flag data dictionary or None if not in L1 cache
        """
        try:
            if flag_name in self._local_cache:
                self._cache_stats["l1_hits"] += 1
                self.logger.debug(f"L1 cache hit for flag: {flag_name}")
                return self._local_cache[flag_name]
            else:
                self._cache_stats["l1_misses"] += 1
                return None
        except Exception as e:
            self.logger.warning(f"Failed to get from L1 cache: {e}")
            return None

    async def _set_local_cache(self, flag_name: str, flag_data: Dict[str, Any]) -> None:
        """Set feature flag in L1 (local in-memory) cache.

        Args:
            flag_name: Name of the feature flag
            flag_data: Flag data to cache
        """
        try:
            self._local_cache[flag_name] = flag_data
            self.logger.debug(f"Set L1 cache for flag: {flag_name}")
        except Exception as e:
            self.logger.warning(f"Failed to set L1 cache: {e}")

    async def _invalidate_local_cache(self, flag_name: str) -> None:
        """Invalidate feature flag from L1 cache.

        Args:
            flag_name: Name of the feature flag
        """
        try:
            if flag_name in self._local_cache:
                del self._local_cache[flag_name]
                self.logger.debug(f"Invalidated L1 cache for flag: {flag_name}")
        except Exception as e:
            self.logger.warning(f"Failed to invalidate L1 cache: {e}")

    async def _get_from_cache(self, flag_name: str) -> Optional[Dict[str, Any]]:
        """Get feature flag from L2 (Redis) cache.

        Args:
            flag_name: Name of the feature flag

        Returns:
            Flag data dictionary or None if not in L2 cache
        """
        try:
            cache_key = self._get_cache_key(flag_name)
            cached_value = redis_client.get(cache_key)
            if cached_value:
                self._cache_stats["l2_hits"] += 1
                self.logger.debug(f"L2 cache hit for flag: {flag_name}")
                return json.loads(cached_value)
            else:
                self._cache_stats["l2_misses"] += 1
                return None
        except Exception as e:
            self.logger.warning(f"Failed to get feature flag from L2 cache: {e}")
            return None

    async def _set_cache(self, flag_name: str, flag_data: Dict[str, Any]) -> None:
        """Set feature flag in both L1 and L2 caches.

        Args:
            flag_name: Name of the feature flag
            flag_data: Flag data to cache
        """
        # Set in L1 (local cache)
        await self._set_local_cache(flag_name, flag_data)

        # Set in L2 (Redis cache)
        try:
            cache_key = self._get_cache_key(flag_name)
            redis_client.setex(cache_key, FEATURE_FLAG_CACHE_TTL, json.dumps(flag_data))
            self.logger.debug(f"Set L2 cache for flag: {flag_name}")
        except Exception as e:
            self.logger.warning(f"Failed to set L2 cache: {e}")

    async def _invalidate_cache(self, flag_name: str) -> None:
        """Invalidate feature flag from both L1 and L2 caches.

        Args:
            flag_name: Name of the feature flag
        """
        # Invalidate L1 (local cache)
        await self._invalidate_local_cache(flag_name)

        # Invalidate L2 (Redis cache)
        try:
            cache_key = self._get_cache_key(flag_name)
            redis_client.delete(cache_key)
            self.logger.debug(f"Invalidated L2 cache for flag: {flag_name}")
        except Exception as e:
            self.logger.warning(f"Failed to invalidate L2 cache: {e}")

    async def is_enabled(self, flag_name: str, default: bool = False, db: Optional[Session] = None) -> bool:
        """Check if a boolean feature flag is enabled.

        Uses three-tier cache lookup: L1 (local) -> L2 (Redis) -> L3 (PostgreSQL)

        Args:
            flag_name: Name of the feature flag
            default: Default value if flag not found
            db: Optional database session (creates new if not provided)

        Returns:
            True if flag is enabled, False otherwise
        """
        # Try L1 cache first (local in-memory)
        cached = await self._get_from_local_cache(flag_name)
        if cached is not None:
            return cached.get("enabled", default)

        # Try L2 cache (Redis)
        cached = await self._get_from_cache(flag_name)
        if cached is not None:
            # Promote to L1 cache
            await self._set_local_cache(flag_name, cached)
            return cached.get("enabled", default)

        # L1 and L2 miss - query L3 (database)
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()

            if flag:
                # Cache the result in both L1 and L2
                self._cache_stats["l3_hits"] += 1
                await self._set_cache(flag_name, flag.to_dict())
                return flag.enabled
            else:
                self._cache_stats["l3_misses"] += 1
                return default
        except Exception as e:
            self.logger.error(f"Failed to query feature flag '{flag_name}': {e}", exc_info=True)
            return default
        finally:
            if should_close_db:
                db.close()

    async def get_value(self, flag_name: str, default: Any = None, db: Optional[Session] = None) -> Any:
        """Get feature flag value (for non-boolean flags).

        Uses three-tier cache lookup: L1 (local) -> L2 (Redis) -> L3 (PostgreSQL)

        Args:
            flag_name: Name of the feature flag
            default: Default value if flag not found
            db: Optional database session

        Returns:
            Feature flag value or default
        """
        # Try L1 cache first (local in-memory)
        cached = await self._get_from_local_cache(flag_name)
        if cached is not None:
            return cached.get("value", default)

        # Try L2 cache (Redis)
        cached = await self._get_from_cache(flag_name)
        if cached is not None:
            # Promote to L1 cache
            await self._set_local_cache(flag_name, cached)
            return cached.get("value", default)

        # L1 and L2 miss - query L3 (database)
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()

            if flag:
                # Cache the result
                await self._set_cache(flag_name, flag.to_dict())
                return flag.value if flag.value is not None else default
            else:
                return default
        except Exception as e:
            self.logger.error(f"Failed to query feature flag '{flag_name}': {e}", exc_info=True)
            return default
        finally:
            if should_close_db:
                db.close()

    async def get_flag(self, flag_name: str, db: Optional[Session] = None) -> Optional[FeatureFlag]:
        """Get complete feature flag object.

        Args:
            flag_name: Name of the feature flag
            db: Optional database session

        Returns:
            FeatureFlag object or None if not found
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            return flag
        except Exception as e:
            self.logger.error(f"Failed to get feature flag '{flag_name}': {e}", exc_info=True)
            return None
        finally:
            if should_close_db:
                db.close()

    async def list_flags(self, db: Session) -> List[FeatureFlag]:
        """List all feature flags.

        Args:
            db: Database session

        Returns:
            List of all feature flags
        """
        try:
            return db.query(FeatureFlag).order_by(FeatureFlag.name).all()
        except Exception as e:
            self.logger.error(f"Failed to list feature flags: {e}", exc_info=True)
            return []

    async def create_flag(
        self,
        name: str,
        description: str,
        flag_type: FeatureFlagType = FeatureFlagType.BOOLEAN,
        enabled: bool = False,
        value: Any = None,
        default_value: Any = None,
        metadata: Optional[Dict] = None,
        db: Session = None,
    ) -> Optional[FeatureFlag]:
        """Create a new feature flag.

        Args:
            name: Unique flag identifier
            description: Human-readable description
            flag_type: Type of flag (boolean, string, number, json)
            enabled: Initial enabled state (for boolean flags)
            value: Initial value (for non-boolean flags)
            default_value: Default value when flag is not found
            metadata: Additional metadata (owner, tags, etc.)
            db: Database session

        Returns:
            Created FeatureFlag object or None on error
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = FeatureFlag(
                name=name,
                description=description,
                flag_type=flag_type.value,
                enabled=enabled,
                value=value,
                default_value=default_value,
                metadata=metadata or {},
            )
            db.add(flag)
            db.commit()
            db.refresh(flag)

            # Cache the new flag
            await self._set_cache(name, flag.to_dict())

            # Publish real-time update to connected clients
            await self._publish_flag_update(name, flag.to_dict())

            self.logger.info(f"Created feature flag: {name}")
            return flag
        except IntegrityError:
            db.rollback()
            self.logger.warning(f"Feature flag already exists: {name}")
            return None
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to create feature flag '{name}': {e}", exc_info=True)
            return None
        finally:
            if should_close_db:
                db.close()

    async def update_flag(
        self,
        name: str,
        enabled: Optional[bool] = None,
        value: Any = None,
        description: Optional[str] = None,
        metadata: Optional[Dict] = None,
        db: Session = None,
    ) -> Optional[FeatureFlag]:
        """Update an existing feature flag.

        Args:
            name: Flag identifier
            enabled: New enabled state (optional)
            value: New value (optional)
            description: New description (optional)
            metadata: New metadata (optional)
            db: Database session

        Returns:
            Updated FeatureFlag object or None on error
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == name).first()

            if not flag:
                self.logger.warning(f"Feature flag not found: {name}")
                return None

            # Update fields
            if enabled is not None:
                flag.enabled = enabled
            if value is not None:
                flag.value = value
            if description is not None:
                flag.description = description
            if metadata is not None:
                flag.flag_metadata = metadata

            flag.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(flag)

            # Invalidate cache to force refresh
            await self._invalidate_cache(name)

            # Publish real-time update to connected clients
            await self._publish_flag_update(name, flag.to_dict())

            self.logger.info(f"Updated feature flag: {name}")
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update feature flag '{name}': {e}", exc_info=True)
            return None
        finally:
            if should_close_db:
                db.close()

    async def _publish_flag_update(self, flag_name: str, flag_data: Dict[str, Any]) -> None:
        """Publish a flag update to real-time subscribers.

        Imports the publish function lazily to avoid circular imports.

        Args:
            flag_name: Name of the updated flag
            flag_data: Complete flag data dictionary
        """
        try:
            from app.api.feature_flags_realtime import publish_flag_update

            await publish_flag_update(flag_name, flag_data)
        except ImportError:
            # Real-time module not available (e.g., in tests)
            self.logger.debug("Real-time publish not available")
        except Exception as e:
            # Don't fail the update if publish fails
            self.logger.warning(f"Failed to publish flag update: {e}")

    async def delete_flag(self, name: str, db: Session = None) -> bool:
        """Delete a feature flag.

        Args:
            name: Flag identifier
            db: Database session

        Returns:
            True if deleted, False on error
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == name).first()

            if not flag:
                self.logger.warning(f"Feature flag not found: {name}")
                return False

            db.delete(flag)
            db.commit()

            # Invalidate cache
            await self._invalidate_cache(name)

            self.logger.info(f"Deleted feature flag: {name}")
            return True
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to delete feature flag '{name}': {e}", exc_info=True)
            return False
        finally:
            if should_close_db:
                db.close()

    async def warm_cache(self, db: Optional[Session] = None) -> int:
        """Warm both L1 and L2 caches with all feature flags on startup.

        This preloads all feature flags into cache to ensure fast access
        on first use. Should be called during application startup.

        Args:
            db: Optional database session

        Returns:
            Number of flags cached
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            # Query all feature flags
            flags = db.query(FeatureFlag).all()

            # Cache each flag in both L1 and L2
            for flag in flags:
                await self._set_cache(flag.name, flag.to_dict())

            self.logger.info(f"Cache warmed: {len(flags)} feature flags cached")
            return len(flags)

        except Exception as e:
            self.logger.error(f"Failed to warm cache: {e}", exc_info=True)
            return 0
        finally:
            if should_close_db:
                db.close()

    async def get_variant_for_user(
        self,
        flag_name: str,
        user_id: str,
        context: Optional[Dict[str, Any]] = None,
        db: Optional[Session] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get the assigned variant for a user in a multivariate flag.

        Uses the VariantAssignmentService for consistent hash-based assignment
        with Redis caching to avoid repeated computations.

        Args:
            flag_name: Name of the feature flag
            user_id: Unique user identifier
            context: Optional context for targeting rules
            db: Optional database session

        Returns:
            Assigned variant dictionary or None if flag not found/not multivariate
        """
        from app.services.variant_assignment import (
            FlagVariant,
            ScheduledChange,
            TargetingRule,
            variant_assignment_service,
        )

        # Get the flag
        flag = await self.get_flag(flag_name, db)
        if not flag:
            self.logger.warning(f"Flag not found for variant assignment: {flag_name}")
            return None

        # Check if it's a multivariate flag with variants
        if not flag.variants:
            # For non-multivariate flags, check if user is in rollout
            if flag.rollout_percentage is not None and flag.rollout_percentage < 100:
                in_rollout = await variant_assignment_service.is_user_in_rollout(
                    flag_name, user_id, flag.rollout_percentage, flag.rollout_salt
                )
                if not in_rollout:
                    return None
            return {"enabled": flag.enabled, "value": flag.value}

        # Parse variants
        variants = [FlagVariant.from_dict(v) for v in flag.variants]

        # Parse targeting rules if present
        targeting_rules = None
        if flag.targeting_rules:
            targeting_rules = [TargetingRule.from_dict(r) for r in flag.targeting_rules]

        # Parse scheduled changes if present
        scheduled_changes = None
        if flag.scheduled_changes:
            scheduled_changes = [ScheduledChange.from_dict(s) for s in flag.scheduled_changes]

        # Get variant assignment
        variant, metadata = await variant_assignment_service.get_variant(
            flag_name=flag_name,
            user_id=user_id,
            variants=variants,
            targeting_rules=targeting_rules,
            scheduled_changes=scheduled_changes,
            context=context or {},
            salt=flag.rollout_salt,
            default_variant=flag.default_variant,
        )

        if variant:
            return {
                "variant_id": variant.id,
                "variant_name": variant.name,
                "value": variant.value,
                "assignment_method": metadata.get("assignment_method"),
                "bucket": metadata.get("bucket"),
            }

        return None

    async def is_enabled_for_user(
        self,
        flag_name: str,
        user_id: str,
        default: bool = False,
        db: Optional[Session] = None,
    ) -> bool:
        """Check if a feature is enabled for a specific user.

        Considers rollout_percentage for gradual rollouts.

        Args:
            flag_name: Name of the feature flag
            user_id: Unique user identifier
            default: Default value if flag not found
            db: Optional database session

        Returns:
            True if feature is enabled for this user
        """
        from app.services.variant_assignment import variant_assignment_service

        # Get the flag
        flag = await self.get_flag(flag_name, db)
        if not flag:
            return default

        # If flag is disabled, return false
        if not flag.enabled:
            return False

        # Check rollout percentage
        if flag.rollout_percentage is not None and flag.rollout_percentage < 100:
            return await variant_assignment_service.is_user_in_rollout(
                flag_name, user_id, flag.rollout_percentage, flag.rollout_salt
            )

        return True

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring.

        Returns:
            Dictionary with cache hit/miss statistics for all cache levels
        """
        total_l1_requests = self._cache_stats["l1_hits"] + self._cache_stats["l1_misses"]
        total_l2_requests = self._cache_stats["l2_hits"] + self._cache_stats["l2_misses"]
        total_l3_requests = self._cache_stats["l3_hits"] + self._cache_stats["l3_misses"]

        stats = {
            "l1_cache": {
                "hits": self._cache_stats["l1_hits"],
                "misses": self._cache_stats["l1_misses"],
                "hit_rate": ((self._cache_stats["l1_hits"] / total_l1_requests * 100) if total_l1_requests > 0 else 0),
                "size": len(self._local_cache),
                "max_size": LOCAL_CACHE_MAX_SIZE,
                "ttl_seconds": LOCAL_CACHE_TTL,
            },
            "l2_cache": {
                "hits": self._cache_stats["l2_hits"],
                "misses": self._cache_stats["l2_misses"],
                "hit_rate": ((self._cache_stats["l2_hits"] / total_l2_requests * 100) if total_l2_requests > 0 else 0),
                "ttl_seconds": FEATURE_FLAG_CACHE_TTL,
            },
            "l3_database": {
                "hits": self._cache_stats["l3_hits"],
                "misses": self._cache_stats["l3_misses"],
                "hit_rate": ((self._cache_stats["l3_hits"] / total_l3_requests * 100) if total_l3_requests > 0 else 0),
            },
            "overall": {
                "total_requests": total_l1_requests,
                "cache_hit_rate": (
                    ((self._cache_stats["l1_hits"] + self._cache_stats["l2_hits"]) / total_l1_requests * 100)
                    if total_l1_requests > 0
                    else 0
                ),
            },
        }

        return stats


# Global singleton instance
feature_flag_service = FeatureFlagService()
