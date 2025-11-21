"""
Token revocation service using Redis for blacklisting JWT tokens.

Allows immediate invalidation of tokens (e.g., on logout or security breach).
"""
from typing import Optional
from datetime import timedelta
import redis.asyncio as redis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class TokenRevocationService:
    """
    Service for revoking JWT tokens using Redis as a blacklist.

    Revoked tokens are stored in Redis with TTL equal to token expiry time.
    """

    def __init__(self):
        """Initialize Redis connection for token revocation."""
        self.redis_client: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis (call during app startup)."""
        try:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            # Test connection
            await self.redis_client.ping()
            logger.info("Token revocation service connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis for token revocation: {e}")
            # Don't raise - allow app to start even if Redis is unavailable
            # Token revocation just won't work until Redis is available

    async def disconnect(self):
        """Disconnect from Redis (call during app shutdown)."""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Token revocation service disconnected from Redis")

    async def revoke_token(self, token: str, ttl_seconds: int = 900) -> bool:
        """
        Revoke a token by adding it to the blacklist.

        Args:
            token: JWT token to revoke
            ttl_seconds: How long to keep token in blacklist (should match token expiry)

        Returns:
            True if token was revoked, False if Redis unavailable
        """
        if not self.redis_client:
            logger.warning("Cannot revoke token - Redis not connected")
            return False

        try:
            # Store token in Redis with TTL
            key = f"revoked_token:{token}"
            await self.redis_client.setex(
                name=key,
                time=timedelta(seconds=ttl_seconds),
                value="1"
            )
            logger.info(f"Token revoked (TTL: {ttl_seconds}s)")
            return True

        except Exception as e:
            logger.error(f"Failed to revoke token: {e}")
            return False

    async def is_token_revoked(self, token: str) -> bool:
        """
        Check if a token has been revoked.

        Args:
            token: JWT token to check

        Returns:
            True if token is revoked, False if valid or Redis unavailable
        """
        if not self.redis_client:
            # If Redis is down, assume token is valid (fail open)
            # This prevents Redis downtime from blocking all authenticated requests
            logger.warning("Cannot check token revocation - Redis not connected, assuming valid")
            return False

        try:
            key = f"revoked_token:{token}"
            result = await self.redis_client.exists(key)
            return result > 0

        except Exception as e:
            logger.error(f"Failed to check token revocation: {e}")
            # Fail open - assume token is valid if we can't check
            return False

    async def revoke_all_user_tokens(self, user_id: str, ttl_seconds: int = 900) -> bool:
        """
        Revoke all tokens for a specific user.

        This is useful when:
        - User changes password (invalidate all sessions)
        - Security breach detected
        - Admin forcibly logs out a user

        Note: This requires tracking active tokens per user, which is more complex.
        For simplicity, we'll just add a user-level revocation flag.

        Args:
            user_id: User ID to revoke all tokens for
            ttl_seconds: How long to keep user revocation flag

        Returns:
            True if revocation was recorded, False if Redis unavailable
        """
        if not self.redis_client:
            logger.warning("Cannot revoke user tokens - Redis not connected")
            return False

        try:
            # Store user-level revocation timestamp
            key = f"revoked_user:{user_id}"
            await self.redis_client.setex(
                name=key,
                time=timedelta(seconds=ttl_seconds),
                value="1"
            )
            logger.info(f"All tokens revoked for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to revoke user tokens: {e}")
            return False

    async def is_user_revoked(self, user_id: str) -> bool:
        """
        Check if all tokens for a user have been revoked.

        Args:
            user_id: User ID to check

        Returns:
            True if user's tokens are revoked, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = f"revoked_user:{user_id}"
            result = await self.redis_client.exists(key)
            return result > 0

        except Exception as e:
            logger.error(f"Failed to check user revocation: {e}")
            return False

    async def get_revoked_token_count(self) -> int:
        """
        Get count of currently revoked tokens (for monitoring).

        Returns:
            Number of revoked tokens, or -1 if Redis unavailable
        """
        if not self.redis_client:
            return -1

        try:
            # Count keys matching pattern
            cursor = 0
            count = 0
            while True:
                cursor, keys = await self.redis_client.scan(
                    cursor=cursor,
                    match="revoked_token:*",
                    count=100
                )
                count += len(keys)
                if cursor == 0:
                    break

            return count

        except Exception as e:
            logger.error(f"Failed to count revoked tokens: {e}")
            return -1


# Global instance
token_revocation_service = TokenRevocationService()
