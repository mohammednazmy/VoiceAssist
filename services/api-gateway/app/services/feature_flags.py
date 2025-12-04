"""Feature Flag Service (Phase 7 - P3.1, P3.2 + Phase 10 Enhancement).

Provides runtime feature flag management with multi-level caching for performance:
- L1 Cache: In-memory LRU cache (1-minute TTL) for super fast access
- L2 Cache: Redis distributed cache (5-minute TTL) for cross-instance consistency
- L3 Persistence: PostgreSQL for durability

This three-tier architecture provides:
- Sub-millisecond flag checks via L1 cache
- Cross-instance consistency via L2 (Redis)
- Durability and management via L3 (PostgreSQL)

Phase 3.2 enhancements:
- Multivariate flag support with variant selection
- Targeting rules for user segmentation
- Percentage rollout with consistent user assignment
- Schedule-based activation

Usage:
    from app.services.feature_flags import feature_flag_service
    from app.services.rule_engine import UserContext

    # Check if feature is enabled (uses L1 -> L2 -> L3 cascade)
    if await feature_flag_service.is_enabled("rbac_enforcement"):
        # RBAC logic
        pass

    # Get feature value
    rag_strategy = await feature_flag_service.get_value("rag_strategy", default="simple")

    # Get variant for multivariate flag (Phase 3.2)
    user_ctx = UserContext(user_id="user-123", user_role="admin")
    variant = await feature_flag_service.get_variant_for_user(
        "experiment.onboarding_v2",
        user_ctx
    )

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

            self.logger.info(f"Updated feature flag: {name}")
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update feature flag '{name}': {e}", exc_info=True)
            return None
        finally:
            if should_close_db:
                db.close()

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

    # =========================================================================
    # Phase 3.2: Multivariate and Targeting Support
    # =========================================================================

    async def get_variant_for_user(
        self,
        flag_name: str,
        user_context: Optional["UserContext"] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Get the variant for a user for a multivariate flag.

        Evaluates targeting rules and rollout percentage to determine
        which variant a user should see.

        Args:
            flag_name: Name of the feature flag
            user_context: User context for targeting (optional)
            db: Optional database session

        Returns:
            Dictionary with variant info:
            {
                "enabled": bool,
                "variant": str or None,
                "value": Any,
                "reason": str ("targeting_rule", "rollout", "default", "disabled")
            }
        """
        from app.services.rule_engine import UserContext, rule_engine

        # Get flag data
        flag_data = await self._get_flag_data(flag_name, db)

        if not flag_data:
            return {
                "enabled": False,
                "variant": None,
                "value": None,
                "reason": "flag_not_found",
            }

        # Check if flag is globally disabled
        if not flag_data.get("enabled", False):
            return {
                "enabled": False,
                "variant": None,
                "value": flag_data.get("default_value"),
                "reason": "disabled",
            }

        # Check schedule (Phase 3.2)
        schedule = flag_data.get("schedule")
        if schedule:
            if not self._is_schedule_active(schedule):
                return {
                    "enabled": False,
                    "variant": None,
                    "value": flag_data.get("default_value"),
                    "reason": "scheduled_inactive",
                }

        # Create user context if not provided
        if user_context is None:
            user_context = UserContext()

        # Check targeting rules first (Phase 3.2)
        targeting_rules = flag_data.get("targeting_rules")
        if targeting_rules:
            result = rule_engine.evaluate_targeting_rules(
                targeting_rules,
                user_context,
                flag_data.get("flag_type", "boolean"),
            )
            if result.matched:
                return {
                    "enabled": result.enabled if result.enabled is not None else True,
                    "variant": result.variant,
                    "value": (
                        result.value
                        if result.value is not None
                        else self._get_variant_value(
                            flag_data.get("variants", []),
                            result.variant,
                        )
                    ),
                    "reason": "targeting_rule",
                    "matched_rule": result.matched_rule_name,
                }

        # Check rollout percentage
        rollout_percentage = flag_data.get("rollout_percentage", 100)
        if rollout_percentage < 100 and user_context.user_id:
            if not rule_engine.is_in_rollout(
                user_context.user_id,
                flag_name,
                rollout_percentage,
                flag_data.get("rollout_salt"),
            ):
                return {
                    "enabled": False,
                    "variant": None,
                    "value": flag_data.get("default_value"),
                    "reason": "rollout_excluded",
                }

        # For multivariate flags, select a variant
        variants = flag_data.get("variants", [])
        if variants and user_context.user_id:
            selected_variant = rule_engine.select_variant(
                variants,
                user_context.user_id,
                flag_name,
                flag_data.get("rollout_salt"),
            )
            if selected_variant:
                return {
                    "enabled": True,
                    "variant": selected_variant.id,
                    "value": selected_variant.value,
                    "reason": "variant_selected",
                }

        # Return default
        return {
            "enabled": True,
            "variant": None,
            "value": flag_data.get("value", flag_data.get("default_value")),
            "reason": "default",
        }

    async def is_enabled_for_user(
        self,
        flag_name: str,
        user_context: Optional["UserContext"] = None,
        default: bool = False,
        db: Optional[Session] = None,
    ) -> bool:
        """Check if a feature flag is enabled for a specific user.

        Takes targeting rules and rollout percentage into account.

        Args:
            flag_name: Name of the feature flag
            user_context: User context for targeting
            default: Default value if flag not found
            db: Optional database session

        Returns:
            True if feature is enabled for this user
        """
        result = await self.get_variant_for_user(flag_name, user_context, db)
        return result.get("enabled", default)

    async def _get_flag_data(
        self,
        flag_name: str,
        db: Optional[Session] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get flag data from cache or database.

        Args:
            flag_name: Name of the feature flag
            db: Optional database session

        Returns:
            Flag data dictionary or None
        """
        # Try L1 cache
        cached = await self._get_from_local_cache(flag_name)
        if cached is not None:
            return cached

        # Try L2 cache
        cached = await self._get_from_cache(flag_name)
        if cached is not None:
            await self._set_local_cache(flag_name, cached)
            return cached

        # Query database
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            if flag:
                flag_data = flag.to_dict()
                await self._set_cache(flag_name, flag_data)
                return flag_data
            return None
        except Exception as e:
            self.logger.error(f"Failed to get flag data '{flag_name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    def _get_variant_value(
        self,
        variants: List[Dict[str, Any]],
        variant_id: Optional[str],
    ) -> Any:
        """Get the value for a specific variant.

        Args:
            variants: List of variant definitions
            variant_id: ID of the variant to find

        Returns:
            Variant value or None
        """
        if not variants or not variant_id:
            return None
        for variant in variants:
            if variant.get("id") == variant_id:
                return variant.get("value")
        return None

    def _is_schedule_active(self, schedule: Dict[str, Any]) -> bool:
        """Check if a schedule is currently active.

        Args:
            schedule: Schedule configuration

        Returns:
            True if schedule is currently active
        """
        if not schedule:
            return True

        now = datetime.now(timezone.utc)

        start_at = schedule.get("start_at")
        if start_at:
            try:
                start_dt = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
                if now < start_dt:
                    return False
            except (ValueError, TypeError):
                pass

        end_at = schedule.get("end_at")
        if end_at:
            try:
                end_dt = datetime.fromisoformat(end_at.replace("Z", "+00:00"))
                if now > end_dt:
                    return False
            except (ValueError, TypeError):
                pass

        return True

    async def update_flag_variants(
        self,
        flag_name: str,
        variants: List[Dict[str, Any]],
        db: Optional[Session] = None,
    ) -> Optional[FeatureFlag]:
        """Update variants for a multivariate flag.

        Args:
            flag_name: Name of the feature flag
            variants: List of variant definitions
            db: Database session

        Returns:
            Updated FeatureFlag or None
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            if not flag:
                return None

            flag.variants = variants
            flag.flag_type = FeatureFlagType.MULTIVARIATE.value
            flag.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(flag)

            await self._invalidate_cache(flag_name)
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update variants for '{flag_name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def update_flag_targeting_rules(
        self,
        flag_name: str,
        targeting_rules: Dict[str, Any],
        db: Optional[Session] = None,
    ) -> Optional[FeatureFlag]:
        """Update targeting rules for a flag.

        Args:
            flag_name: Name of the feature flag
            targeting_rules: Targeting rules configuration
            db: Database session

        Returns:
            Updated FeatureFlag or None
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            if not flag:
                return None

            flag.targeting_rules = targeting_rules
            flag.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(flag)

            await self._invalidate_cache(flag_name)
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update targeting rules for '{flag_name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def update_flag_schedule(
        self,
        flag_name: str,
        schedule: Dict[str, Any],
        db: Optional[Session] = None,
    ) -> Optional[FeatureFlag]:
        """Update schedule for a flag.

        Args:
            flag_name: Name of the feature flag
            schedule: Schedule configuration
            db: Database session

        Returns:
            Updated FeatureFlag or None
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            if not flag:
                return None

            flag.schedule = schedule
            flag.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(flag)

            await self._invalidate_cache(flag_name)
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update schedule for '{flag_name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def archive_flag(
        self,
        flag_name: str,
        db: Optional[Session] = None,
    ) -> Optional[FeatureFlag]:
        """Archive a feature flag (soft delete).

        Args:
            flag_name: Name of the feature flag
            db: Database session

        Returns:
            Archived FeatureFlag or None
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
            if not flag:
                return None

            flag.archived = True
            flag.archived_at = datetime.now(timezone.utc)
            flag.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(flag)

            await self._invalidate_cache(flag_name)
            self.logger.info(f"Archived feature flag: {flag_name}")
            return flag
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to archive flag '{flag_name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def list_flags_by_environment(
        self,
        environment: str = "production",
        include_archived: bool = False,
        db: Optional[Session] = None,
    ) -> List[FeatureFlag]:
        """List flags for a specific environment.

        Args:
            environment: Environment name (development, staging, production)
            include_archived: Whether to include archived flags
            db: Database session

        Returns:
            List of FeatureFlag objects
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            query = db.query(FeatureFlag).filter(FeatureFlag.environment == environment)
            if not include_archived:
                query = query.filter(FeatureFlag.archived == False)  # noqa: E712
            return query.order_by(FeatureFlag.name).all()
        except Exception as e:
            self.logger.error(f"Failed to list flags for environment '{environment}': {e}")
            return []
        finally:
            if should_close_db:
                db.close()


# Global singleton instance
feature_flag_service = FeatureFlagService()


# Type import for annotations
if False:  # TYPE_CHECKING
    from app.services.rule_engine import UserContext
