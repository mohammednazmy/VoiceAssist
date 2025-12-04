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
                    (UserFeatureFlag.expires_at.is_(None))
                    | (UserFeatureFlag.expires_at > datetime.now(timezone.utc))
                )

            result = db.execute(query)
            overrides = result.scalars().all()

            return {
                override.flag_name: override.to_dict()
                for override in overrides
                if override.enabled
            }

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
            metadata: Additional metadata
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
                # Keep original created_by for audit trail
                db.commit()
                db.refresh(existing)
                override = existing
                logger.info(
                    f"Updated override for user {user_id}, flag {flag_name} by {created_by}"
                )
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
                logger.info(
                    f"Created override for user {user_id}, flag {flag_name} by {created_by}"
                )

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
                        UserFeatureFlag.enabled == True,
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
            logger.error(
                f"Failed to get flag value {flag_name} for user {user_id}: {e}"
            )
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

            result = db.execute(
                select(func.count(UserFeatureFlag.id)).where(
                    UserFeatureFlag.flag_name == flag_name
                )
            )
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
        db: Optional[Session] = None,
    ) -> bool:
        """Toggle an override's enabled state.

        Args:
            user_id: The user's UUID
            flag_name: Name of the feature flag
            enabled: New enabled state
            db: Optional database session

        Returns:
            True if successful, False if override not found
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            result = db.execute(
                update(UserFeatureFlag)
                .where(
                    and_(
                        UserFeatureFlag.user_id == user_id,
                        UserFeatureFlag.flag_name == flag_name,
                    )
                )
                .values(enabled=enabled, updated_at=datetime.utcnow())
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
