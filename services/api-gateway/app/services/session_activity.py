"""
Session activity tracking service using Redis.

Tracks user activity for session timeout enforcement:
- Inactivity timeout: Logout after N minutes of no activity
- Absolute timeout: Force re-login after N hours regardless of activity
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import redis.asyncio as redis
from app.core.config import settings

logger = logging.getLogger(__name__)


class SessionActivityService:
    """
    Service for tracking session activity and enforcing timeouts.

    Uses Redis to store:
    - Last activity timestamp per user session
    - Session creation timestamp for absolute timeout
    """

    def __init__(self):
        """Initialize Redis connection for session tracking."""
        self.redis_client: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis (call during app startup)."""
        try:
            self.redis_client = await redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
            await self.redis_client.ping()
            logger.info("Session activity service connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis for session tracking: {e}")

    async def disconnect(self):
        """Disconnect from Redis (call during app shutdown)."""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Session activity service disconnected from Redis")

    def _get_session_key(self, user_id: str, token_iat: int) -> str:
        """Generate Redis key for session activity tracking."""
        # Use token issued-at time to distinguish between sessions
        return f"session_activity:{user_id}:{token_iat}"

    async def record_activity(self, user_id: str, token_iat: int) -> bool:
        """
        Record user activity for session timeout tracking.

        Args:
            user_id: User ID
            token_iat: Token issued-at timestamp (identifies the session)

        Returns:
            True if activity was recorded, False if Redis unavailable
        """
        if not self.redis_client:
            logger.warning("Cannot record activity - Redis not connected")
            return False

        try:
            key = self._get_session_key(user_id, token_iat)
            now = datetime.now(timezone.utc).isoformat()

            # Store with TTL slightly longer than absolute timeout
            ttl_seconds = (settings.SESSION_ABSOLUTE_TIMEOUT_HOURS * 3600) + 3600

            await self.redis_client.setex(name=key, time=timedelta(seconds=ttl_seconds), value=now)
            return True

        except Exception as e:
            logger.error(f"Failed to record activity: {e}")
            return False

    async def get_last_activity(self, user_id: str, token_iat: int) -> Optional[datetime]:
        """
        Get the last activity timestamp for a session.

        Args:
            user_id: User ID
            token_iat: Token issued-at timestamp

        Returns:
            Last activity datetime or None if not found
        """
        if not self.redis_client:
            return None

        try:
            key = self._get_session_key(user_id, token_iat)
            value = await self.redis_client.get(key)

            if value:
                return datetime.fromisoformat(value)
            return None

        except Exception as e:
            logger.error(f"Failed to get last activity: {e}")
            return None

    async def check_session_timeouts(self, user_id: str, token_iat: int) -> Tuple[bool, Optional[str]]:
        """
        Check if a session has timed out.

        Args:
            user_id: User ID
            token_iat: Token issued-at timestamp (seconds since epoch)

        Returns:
            Tuple of (is_valid, error_reason)
            - (True, None) if session is valid
            - (False, "reason") if session has timed out
        """
        now = datetime.now(timezone.utc)

        # Check absolute timeout (based on token issue time)
        token_issued = datetime.fromtimestamp(token_iat, tz=timezone.utc)
        absolute_limit = timedelta(hours=settings.SESSION_ABSOLUTE_TIMEOUT_HOURS)

        if now - token_issued > absolute_limit:
            logger.info(f"Session absolute timeout for user {user_id}")
            return (False, "Session expired. Please log in again.")

        # Check inactivity timeout
        last_activity = await self.get_last_activity(user_id, token_iat)

        if last_activity:
            inactivity_limit = timedelta(minutes=settings.SESSION_INACTIVITY_TIMEOUT_MINUTES)

            if now - last_activity > inactivity_limit:
                logger.info(f"Session inactivity timeout for user {user_id}")
                return (
                    False,
                    "Session timed out due to inactivity. Please log in again.",
                )

        # Session is valid - record new activity
        await self.record_activity(user_id, token_iat)

        return (True, None)

    async def get_session_info(self, user_id: str, token_iat: int) -> dict:
        """
        Get session timeout information for the frontend.

        Returns timing info that the frontend can use to show warnings.

        Args:
            user_id: User ID
            token_iat: Token issued-at timestamp

        Returns:
            Dict with session timing info
        """
        now = datetime.now(timezone.utc)
        token_issued = datetime.fromtimestamp(token_iat, tz=timezone.utc)

        # Calculate time remaining until absolute timeout
        absolute_limit = timedelta(hours=settings.SESSION_ABSOLUTE_TIMEOUT_HOURS)
        absolute_expires_at = token_issued + absolute_limit
        absolute_remaining = (absolute_expires_at - now).total_seconds()

        # Calculate time remaining until inactivity timeout
        last_activity = await self.get_last_activity(user_id, token_iat)
        if last_activity:
            inactivity_limit = timedelta(minutes=settings.SESSION_INACTIVITY_TIMEOUT_MINUTES)
            inactivity_expires_at = last_activity + inactivity_limit
            inactivity_remaining = (inactivity_expires_at - now).total_seconds()
        else:
            # No activity recorded yet, assume now is the start
            inactivity_remaining = settings.SESSION_INACTIVITY_TIMEOUT_MINUTES * 60

        return {
            "absolute_timeout_hours": settings.SESSION_ABSOLUTE_TIMEOUT_HOURS,
            "inactivity_timeout_minutes": settings.SESSION_INACTIVITY_TIMEOUT_MINUTES,
            "absolute_remaining_seconds": max(0, int(absolute_remaining)),
            "inactivity_remaining_seconds": max(0, int(inactivity_remaining)),
            "session_started_at": token_issued.isoformat(),
            "last_activity_at": last_activity.isoformat() if last_activity else None,
        }

    async def invalidate_session(self, user_id: str, token_iat: int) -> bool:
        """
        Invalidate a session (e.g., on logout).

        Args:
            user_id: User ID
            token_iat: Token issued-at timestamp

        Returns:
            True if session was invalidated
        """
        if not self.redis_client:
            return False

        try:
            key = self._get_session_key(user_id, token_iat)
            await self.redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Failed to invalidate session: {e}")
            return False


# Global instance
session_activity_service = SessionActivityService()
