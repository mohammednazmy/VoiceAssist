"""User Flag Override Service (Phase 4).

Manages per-user feature flag overrides for:
- Beta testing with select users
- Debugging with forced flag states
- Personalized feature experiences

Override Resolution Priority:
1. User-specific override (if enabled and not expired)
2. User targeting rules (from Phase 2)
3. Scheduled variant changes (from Phase 3)
4. Default flag value
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.database import SessionLocal
from app.core.metrics import (
    flag_override_resolutions_total,
    flag_user_overrides_active_total,
    flag_user_overrides_bulk_total,
    flag_user_overrides_expired_total,
    flag_user_overrides_total,
)
from app.models.user_feature_flag import UserFeatureFlag
from sqlalchemy import and_, delete, select, update
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class UserFlagOverrideService:
    """Service for managing user-specific feature flag overrides.

    Provides CRUD operations and resolution logic for user overrides.
    Integrates with the existing FeatureFlagService for flag evaluation.
    """

    def __init__(self, redis_client=None):
        """Initialize the service.

        Args:
            redis_client: Optional Redis client for caching overrides
        """
        self.redis_client = redis_client
        self._cache_prefix = "user_flag_override:"
        self._cache_ttl = 300  # 5 minutes

    async def get_user_overrides(
        self,
        user_id: UUID,
        db: Optional[Session] = None,
        include_expired: bool = False,
    ) -> Dict[str, Any]:
        """Get all flag overrides for a user.

        Args:
            user_id: The user's UUID
            db: Optional database session
            include_expired: Whether to include expired overrides

        Returns:
            Dictionary mapping flag_name to override details
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            query = select(UserFeatureFlag).where(UserFeatureFlag.user_id == user_id)

            if not include_expired:
                query = query.where(
                    (UserFeatureFlag.expires_at.is_(None)) | (UserFeatureFlag.expires_at > datetime.now(timezone.utc))
                )

            result = db.execute(query)
            overrides = result.scalars().all()

            return {override.flag_name: override.to_dict() for override in overrides if override.enabled}

        except Exception as e:
            logger.error(f"Failed to get user overrides for {user_id}: {e}")
            return {}
        finally:
            if should_close_db:
                db.close()

    async def get_override(
        self,
        user_id: UUID,
        flag_name: str,
        db: Optional[Session] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get a specific override for a user and flag.

        Args:
            user_id: The user's UUID
            flag_name: Name of the feature flag
            db: Optional database session

        Returns:
            Override details or None if not found
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            result = db.execute(
                select(UserFeatureFlag).where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                    )
                )
            )
            override = result.scalar_one_or_none()

            if override:
                return override.to_dict()
            return None

        except Exception as e:
            logger.error(f"Failed to get override {flag_name} for user {user_id}: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def set_override(
        self,
        user_id: UUID,
        flag_name: str,
        value: Any,
        created_by: str,
        enabled: bool = True,
        reason: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
        updated_by: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Create or update an override for a user.

        Args:
            user_id: The user's UUID
            flag_name: Name of the feature flag
            value: The override value (JSON-serializable)
            created_by: Admin email/ID creating the override
            enabled: Whether the override is active
            reason: Audit reason for the override
            expires_at: Optional expiration datetime
            metadata: Additional metadata (ticket number, experiment ID, etc.)
            updated_by: Admin email/ID updating the override (for updates)
            db: Optional database session

        Returns:
            The created/updated override details
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            # Check if override already exists
            result = db.execute(
                select(UserFeatureFlag).where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing override
                existing.value = value
                existing.enabled = enabled
                existing.reason = reason
                existing.expires_at = expires_at
                existing.override_metadata = metadata
                existing.updated_at = datetime.utcnow()
                existing.updated_by = updated_by or created_by  # Track who modified
                # Keep original created_by for audit trail
                db.commit()
                db.refresh(existing)
                override = existing
                logger.info(f"Updated override for user {user_id}, flag {flag_name} by {updated_by or created_by}")
                # Emit update metric
                flag_user_overrides_total.labels(flag_name=flag_name, action="update").inc()
            else:
                # Create new override
                override = UserFeatureFlag(
                    user_id=user_id,
                    flag_name=flag_name,
                    value=value,
                    enabled=enabled,
                    reason=reason,
                    created_by=created_by,
                    expires_at=expires_at,
                    override_metadata=metadata,
                )
                db.add(override)
                db.commit()
                db.refresh(override)
                logger.info(f"Created override for user {user_id}, flag {flag_name} by {created_by}")
                # Emit create metric
                flag_user_overrides_total.labels(flag_name=flag_name, action="create").inc()

            # Invalidate cache
            await self._invalidate_cache(user_id, flag_name)

            return override.to_dict()

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to set override {flag_name} for user {user_id}: {e}")
            raise
        finally:
            if should_close_db:
                db.close()

    async def remove_override(
        self,
        user_id: UUID,
        flag_name: str,
        db: Optional[Session] = None,
    ) -> bool:
        """Remove an override for a user.

        Args:
            user_id: The user's UUID
            flag_name: Name of the feature flag
            db: Optional database session

        Returns:
            True if override was removed, False if not found
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            result = db.execute(
                delete(UserFeatureFlag).where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                    )
                )
            )
            db.commit()

            if result.rowcount > 0:
                logger.info(f"Removed override for user {user_id}, flag {flag_name}")
                await self._invalidate_cache(user_id, flag_name)
                # Emit delete metric
                flag_user_overrides_total.labels(flag_name=flag_name, action="delete").inc()
                return True

            return False

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to remove override {flag_name} for user {user_id}: {e}")
            raise
        finally:
            if should_close_db:
                db.close()

    async def get_flag_value_for_user(
        self,
        flag_name: str,
        user_id: UUID,
        default: Any = None,
        db: Optional[Session] = None,
    ) -> Any:
        """Get the effective flag value for a user, considering overrides.

        This method checks for user overrides first, returning the override
        value if one exists and is active/not expired.

        Args:
            flag_name: Name of the feature flag
            user_id: The user's UUID
            default: Default value if no override found
            db: Optional database session

        Returns:
            The override value or default
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            # Check cache first
            cached = await self._get_from_cache(user_id, flag_name)
            if cached is not None:
                return cached

            # Query database
            result = db.execute(
                select(UserFeatureFlag).where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                        UserFeatureFlag.enabled.is_(True),
                        (UserFeatureFlag.expires_at.is_(None))
                        | (UserFeatureFlag.expires_at > datetime.now(timezone.utc)),
                    )
                )
            )
            override = result.scalar_one_or_none()

            if override:
                value = override.value
                await self._set_cache(user_id, flag_name, value)
                return value

            return default

        except Exception as e:
            logger.error(f"Failed to get flag value {flag_name} for user {user_id}: {e}")
            return default
        finally:
            if should_close_db:
                db.close()

    async def cleanup_expired_overrides(
        self,
        db: Optional[Session] = None,
    ) -> int:
        """Remove expired overrides from the database.

        Should be called periodically by a background task.

        Args:
            db: Optional database session

        Returns:
            Number of expired overrides removed
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            # First get the flag names of expired overrides for metrics
            expired_flags = (
                db.execute(
                    select(UserFeatureFlag.flag_name).where(
                        and_(
                            UserFeatureFlag.expires_at.isnot(None),
                            UserFeatureFlag.expires_at < datetime.now(timezone.utc),
                        )
                    )
                )
                .scalars()
                .all()
            )

            # Now delete them
            result = db.execute(
                delete(UserFeatureFlag).where(
                    and_(
                        UserFeatureFlag.expires_at.isnot(None),
                        UserFeatureFlag.expires_at < datetime.now(timezone.utc),
                    )
                )
            )
            db.commit()

            count = result.rowcount
            if count > 0:
                logger.info(f"Cleaned up {count} expired user flag overrides")
                # Emit expired metrics per flag
                for flag_name in expired_flags:
                    flag_user_overrides_expired_total.labels(flag_name=flag_name).inc()

            return count

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cleanup expired overrides: {e}")
            return 0
        finally:
            if should_close_db:
                db.close()

    async def list_overrides_for_flag(
        self,
        flag_name: str,
        db: Optional[Session] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List all user overrides for a specific flag.

        Args:
            flag_name: Name of the feature flag
            db: Optional database session
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of override details
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            result = db.execute(
                select(UserFeatureFlag)
                .where(UserFeatureFlag.flag_name == flag_name)
                .order_by(UserFeatureFlag.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            overrides = result.scalars().all()

            return [override.to_dict() for override in overrides]

        except Exception as e:
            logger.error(f"Failed to list overrides for flag {flag_name}: {e}")
            return []
        finally:
            if should_close_db:
                db.close()

    async def count_overrides_for_flag(
        self,
        flag_name: str,
        db: Optional[Session] = None,
    ) -> int:
        """Count total user overrides for a flag.

        Args:
            flag_name: Name of the feature flag
            db: Optional database session

        Returns:
            Total count of overrides
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            from sqlalchemy import func

            result = db.execute(select(func.count(UserFeatureFlag.id)).where(UserFeatureFlag.flag_name == flag_name))
            return result.scalar() or 0

        except Exception as e:
            logger.error(f"Failed to count overrides for flag {flag_name}: {e}")
            return 0
        finally:
            if should_close_db:
                db.close()

    async def toggle_override(
        self,
        user_id: UUID,
        flag_name: str,
        enabled: bool,
        updated_by: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> bool:
        """Toggle an override's enabled state.

        Args:
            user_id: The user's UUID
            flag_name: Name of the feature flag
            enabled: New enabled state
            updated_by: Admin who toggled the override
            db: Optional database session

        Returns:
            True if successful, False if override not found
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            values = {"enabled": enabled, "updated_at": datetime.utcnow()}
            if updated_by:
                values["updated_by"] = updated_by

            result = db.execute(
                update(UserFeatureFlag)
                .where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                    )
                )
                .values(**values)
            )
            db.commit()

            if result.rowcount > 0:
                await self._invalidate_cache(user_id, flag_name)
                return True

            return False

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to toggle override {flag_name} for user {user_id}: {e}")
            raise
        finally:
            if should_close_db:
                db.close()

    async def get_all_flags_for_user(
        self,
        user_id: UUID,
        db: Optional[Session] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Get all feature flags for a user with resolution source.

        Returns all flags with their effective values and the source
        of the value (override, segmentation, scheduled, or default).

        Args:
            user_id: The user's UUID
            db: Optional database session

        Returns:
            Dictionary mapping flag_name to:
            {
                "value": effective value,
                "enabled": bool,
                "source": "override" | "segmentation" | "scheduled" | "default",
                "override_details": {...} | None
            }
        """
        from app.services.feature_flags import feature_flag_service

        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            # Get all flags
            flags = await feature_flag_service.list_flags(db)

            # Get user overrides
            overrides = await self.get_user_overrides(user_id, db, include_expired=False)

            result = {}
            for flag in flags:
                flag_name = flag.name
                flag_dict = flag.to_dict()

                # Check if user has an active override
                if flag_name in overrides:
                    override = overrides[flag_name]
                    source = "override"
                    result[flag_name] = {
                        "value": override.get("value"),
                        "enabled": override.get("enabled", True),
                        "source": source,
                        "override_details": override,
                        "flag_type": flag_dict.get("flag_type"),
                    }
                # TODO: Check segmentation rules (Phase 2)
                # TODO: Check scheduled changes (Phase 3)
                else:
                    # Default flag value
                    source = "default"
                    result[flag_name] = {
                        "value": flag_dict.get("value") or flag_dict.get("default_value"),
                        "enabled": flag_dict.get("enabled", False),
                        "source": source,
                        "override_details": None,
                        "flag_type": flag_dict.get("flag_type"),
                    }

                # Emit resolution metric
                flag_override_resolutions_total.labels(flag_name=flag_name, source=source).inc()

            return result

        except Exception as e:
            logger.error(f"Failed to get all flags for user {user_id}: {e}")
            return {}
        finally:
            if should_close_db:
                db.close()

    async def bulk_set_overrides(
        self,
        overrides: List[Dict[str, Any]],
        created_by: str,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Create or update multiple overrides in a single transaction.

        Args:
            overrides: List of override specs, each containing:
                - user_id: UUID
                - flag_name: str
                - value: Any
                - enabled: bool (optional, default True)
                - reason: str (optional)
                - expires_at: datetime (optional)
                - metadata: dict (optional)
            created_by: Admin creating the overrides
            db: Optional database session

        Returns:
            {
                "created": int,
                "updated": int,
                "failed": int,
                "errors": [...]
            }
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        results = {"created": 0, "updated": 0, "failed": 0, "errors": []}

        try:
            for override_spec in overrides:
                try:
                    user_id = override_spec.get("user_id")
                    flag_name = override_spec.get("flag_name")

                    if not user_id or not flag_name:
                        results["failed"] += 1
                        results["errors"].append("Missing user_id or flag_name in override spec")
                        continue

                    # Check if exists
                    existing = db.execute(
                        select(UserFeatureFlag).where(
                            and_(
                                UserFeatureFlag.user_id == user_id,
                                UserFeatureFlag.flag_name == flag_name,
                            )
                        )
                    ).scalar_one_or_none()

                    if existing:
                        # Update
                        existing.value = override_spec.get("value")
                        existing.enabled = override_spec.get("enabled", True)
                        existing.reason = override_spec.get("reason")
                        existing.expires_at = override_spec.get("expires_at")
                        existing.override_metadata = override_spec.get("metadata")
                        existing.updated_at = datetime.utcnow()
                        existing.updated_by = created_by
                        results["updated"] += 1
                    else:
                        # Create
                        new_override = UserFeatureFlag(
                            user_id=user_id,
                            flag_name=flag_name,
                            value=override_spec.get("value"),
                            enabled=override_spec.get("enabled", True),
                            reason=override_spec.get("reason"),
                            created_by=created_by,
                            expires_at=override_spec.get("expires_at"),
                            override_metadata=override_spec.get("metadata"),
                        )
                        db.add(new_override)
                        results["created"] += 1

                    # Invalidate cache
                    await self._invalidate_cache(user_id, flag_name)

                except Exception as e:
                    results["failed"] += 1
                    results["errors"].append(str(e))

            db.commit()
            logger.info(
                f"Bulk override: {results['created']} created, "
                f"{results['updated']} updated, {results['failed']} failed "
                f"by {created_by}"
            )

            # Emit bulk operation metric
            if results["created"] > 0 or results["updated"] > 0:
                flag_user_overrides_bulk_total.labels(action="create").inc()

            return results

        except Exception as e:
            db.rollback()
            logger.error(f"Failed bulk override operation: {e}")
            raise
        finally:
            if should_close_db:
                db.close()

    async def bulk_delete_overrides(
        self,
        user_ids: List[UUID],
        flag_name: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> int:
        """Delete overrides for multiple users.

        Args:
            user_ids: List of user UUIDs
            flag_name: Optional flag name filter (delete only for this flag)
            db: Optional database session

        Returns:
            Number of overrides deleted
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            query = delete(UserFeatureFlag).where(UserFeatureFlag.user_id.in_(user_ids))

            if flag_name:
                query = query.where(UserFeatureFlag.flag_name == flag_name)

            result = db.execute(query)
            db.commit()

            # Invalidate caches
            for user_id in user_ids:
                if flag_name:
                    await self._invalidate_cache(user_id, flag_name)
                # Note: If no flag_name, we'd need to invalidate all flags for user
                # This is simplified - in production, consider a user-level cache key

            count = result.rowcount
            logger.info(f"Bulk deleted {count} overrides for {len(user_ids)} users")

            # Emit bulk delete metric
            if count > 0:
                flag_user_overrides_bulk_total.labels(action="delete").inc()

            return count

        except Exception as e:
            db.rollback()
            logger.error(f"Failed bulk delete operation: {e}")
            raise
        finally:
            if should_close_db:
                db.close()

    async def get_override_stats(
        self,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Get statistics about user flag overrides.

        Returns:
            {
                "total_overrides": int,
                "active_overrides": int,
                "expired_overrides": int,
                "overrides_by_flag": {flag_name: count},
                "users_with_overrides": int
            }
        """
        from sqlalchemy import func

        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            now = datetime.now(timezone.utc)

            # Total overrides
            total = db.execute(select(func.count(UserFeatureFlag.id))).scalar() or 0

            # Active overrides (enabled and not expired)
            active = (
                db.execute(
                    select(func.count(UserFeatureFlag.id)).where(
                        and_(
                            UserFeatureFlag.enabled.is_(True),
                            (UserFeatureFlag.expires_at.is_(None)) | (UserFeatureFlag.expires_at > now),
                        )
                    )
                ).scalar()
                or 0
            )

            # Expired overrides
            expired = (
                db.execute(
                    select(func.count(UserFeatureFlag.id)).where(
                        and_(
                            UserFeatureFlag.expires_at.isnot(None),
                            UserFeatureFlag.expires_at <= now,
                        )
                    )
                ).scalar()
                or 0
            )

            # Overrides by flag (total)
            by_flag_result = db.execute(
                select(
                    UserFeatureFlag.flag_name,
                    func.count(UserFeatureFlag.id).label("count"),
                ).group_by(UserFeatureFlag.flag_name)
            ).all()
            overrides_by_flag = {row.flag_name: row.count for row in by_flag_result}

            # Active overrides by flag (for gauge metrics)
            active_by_flag_result = db.execute(
                select(
                    UserFeatureFlag.flag_name,
                    func.count(UserFeatureFlag.id).label("count"),
                )
                .where(
                    and_(
                        UserFeatureFlag.enabled.is_(True),
                        (UserFeatureFlag.expires_at.is_(None)) | (UserFeatureFlag.expires_at > now),
                    )
                )
                .group_by(UserFeatureFlag.flag_name)
            ).all()

            # Update active overrides gauge per flag
            for row in active_by_flag_result:
                flag_user_overrides_active_total.labels(flag_name=row.flag_name).set(row.count)

            # Unique users with overrides
            users_count = db.execute(select(func.count(func.distinct(UserFeatureFlag.user_id)))).scalar() or 0

            return {
                "total_overrides": total,
                "active_overrides": active,
                "expired_overrides": expired,
                "overrides_by_flag": overrides_by_flag,
                "users_with_overrides": users_count,
            }

        except Exception as e:
            logger.error(f"Failed to get override stats: {e}")
            return {}
        finally:
            if should_close_db:
                db.close()

    # Cache helpers
    async def _get_from_cache(self, user_id: UUID, flag_name: str) -> Optional[Any]:
        """Get override value from Redis cache."""
        if not self.redis_client:
            return None

        try:
            import json

            key = f"{self._cache_prefix}{user_id}:{flag_name}"
            data = self.redis_client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception:
            return None

    async def _set_cache(self, user_id: UUID, flag_name: str, value: Any) -> None:
        """Set override value in Redis cache."""
        if not self.redis_client:
            return

        try:
            import json

            key = f"{self._cache_prefix}{user_id}:{flag_name}"
            self.redis_client.setex(key, self._cache_ttl, json.dumps(value))
        except Exception:
            pass

    async def _invalidate_cache(self, user_id: UUID, flag_name: str) -> None:
        """Invalidate cached override value."""
        if not self.redis_client:
            return

        try:
            key = f"{self._cache_prefix}{user_id}:{flag_name}"
            self.redis_client.delete(key)
        except Exception:
            pass


# Singleton instance
user_flag_override_service = UserFlagOverrideService()
