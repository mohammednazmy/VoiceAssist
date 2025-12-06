"""
Redis Voice Session Store (WebSocket Reliability Phase 2)

Provides Redis-based session state persistence for WebSocket voice sessions.
Enables:
- Session recovery after disconnects
- Horizontal scaling across multiple server instances
- Graceful reconnection with state restoration

Feature Flag: backend.voice_ws_session_persistence

Session State Schema (Redis Hash):
- session_id: Unique session identifier
- user_id: User who owns the session
- conversation_id: Associated conversation
- created_at: Session creation timestamp
- last_activity_at: Last activity timestamp
- connection_state: Current connection state
- config: JSON-serialized session configuration
- metrics: JSON-serialized session metrics
- binary_audio_enabled: Whether binary audio is negotiated
- audio_output_sequence: Last audio output sequence number
- protocol_version: Negotiated protocol version

Redis Key Structure:
- voice_session:{session_id} - Session state hash
- voice_session_user:{user_id} - Set of active session IDs for user
- voice_session_lock:{session_id} - Lock for session recovery
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import redis.asyncio as redis
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Redis key prefixes
VOICE_SESSION_PREFIX = "voice_session:"
VOICE_SESSION_USER_PREFIX = "voice_session_user:"
VOICE_SESSION_LOCK_PREFIX = "voice_session_lock:"

# TTL for session data (matches idle timeout + buffer)
VOICE_SESSION_TTL_SECONDS = 600  # 10 minutes
VOICE_SESSION_LOCK_TTL_SECONDS = 30  # 30 seconds for recovery lock


class VoiceSessionState:
    """Represents the persisted state of a voice session."""

    def __init__(
        self,
        session_id: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        created_at: Optional[str] = None,
        last_activity_at: Optional[str] = None,
        connection_state: str = "disconnected",
        config: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None,
        binary_audio_enabled: bool = False,
        audio_output_sequence: int = 0,
        protocol_version: str = "1.0",
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.last_activity_at = last_activity_at or self.created_at
        self.connection_state = connection_state
        self.config = config or {}
        self.metrics = metrics or {}
        self.binary_audio_enabled = binary_audio_enabled
        self.audio_output_sequence = audio_output_sequence
        self.protocol_version = protocol_version

    def to_dict(self) -> Dict[str, str]:
        """Convert to Redis hash-compatible dict (all values as strings)."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "conversation_id": self.conversation_id or "",
            "created_at": self.created_at,
            "last_activity_at": self.last_activity_at,
            "connection_state": self.connection_state,
            "config": json.dumps(self.config),
            "metrics": json.dumps(self.metrics),
            "binary_audio_enabled": "1" if self.binary_audio_enabled else "0",
            "audio_output_sequence": str(self.audio_output_sequence),
            "protocol_version": self.protocol_version,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, str]) -> "VoiceSessionState":
        """Create from Redis hash data."""
        return cls(
            session_id=data.get("session_id", ""),
            user_id=data.get("user_id", ""),
            conversation_id=data.get("conversation_id") or None,
            created_at=data.get("created_at"),
            last_activity_at=data.get("last_activity_at"),
            connection_state=data.get("connection_state", "disconnected"),
            config=json.loads(data.get("config", "{}")),
            metrics=json.loads(data.get("metrics", "{}")),
            binary_audio_enabled=data.get("binary_audio_enabled") == "1",
            audio_output_sequence=int(data.get("audio_output_sequence", "0")),
            protocol_version=data.get("protocol_version", "1.0"),
        )


class RedisVoiceSessionStore:
    """
    Redis-based store for voice session state persistence.

    Provides session persistence for WebSocket voice sessions to enable:
    - Recovery after network disconnects
    - Horizontal scaling across server instances
    - Graceful reconnection with state restoration

    Thread-safe and supports concurrent operations.
    """

    def __init__(self):
        """Initialize the Redis connection pool."""
        self.redis_client: Optional[redis.Redis] = None
        self._connected = False

    async def connect(self) -> bool:
        """
        Connect to Redis.

        Should be called during application startup.

        Returns:
            True if connected successfully
        """
        try:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            await self.redis_client.ping()
            self._connected = True
            logger.info("Redis Voice Session Store connected")
            return True
        except Exception as e:
            logger.error(f"Failed to connect Redis Voice Session Store: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """
        Disconnect from Redis.

        Should be called during application shutdown.
        """
        if self.redis_client:
            await self.redis_client.close()
            self._connected = False
            logger.info("Redis Voice Session Store disconnected")

    @property
    def is_connected(self) -> bool:
        """Check if Redis is connected."""
        return self._connected and self.redis_client is not None

    def _session_key(self, session_id: str) -> str:
        """Get Redis key for session state."""
        return f"{VOICE_SESSION_PREFIX}{session_id}"

    def _user_sessions_key(self, user_id: str) -> str:
        """Get Redis key for user's active sessions."""
        return f"{VOICE_SESSION_USER_PREFIX}{user_id}"

    def _lock_key(self, session_id: str) -> str:
        """Get Redis key for session recovery lock."""
        return f"{VOICE_SESSION_LOCK_PREFIX}{session_id}"

    async def save_session(self, state: VoiceSessionState) -> bool:
        """
        Save or update session state in Redis.

        Args:
            state: Voice session state to persist

        Returns:
            True if saved successfully
        """
        if not self.is_connected:
            logger.warning("Cannot save session - Redis not connected")
            return False

        try:
            session_key = self._session_key(state.session_id)
            user_key = self._user_sessions_key(state.user_id)

            # Update last activity timestamp
            state.last_activity_at = datetime.now(timezone.utc).isoformat()

            # Use pipeline for atomic operations
            async with self.redis_client.pipeline() as pipe:
                # Save session state as hash
                await pipe.hset(session_key, mapping=state.to_dict())
                # Set TTL
                await pipe.expire(session_key, VOICE_SESSION_TTL_SECONDS)
                # Add to user's active sessions
                await pipe.sadd(user_key, state.session_id)
                await pipe.expire(user_key, VOICE_SESSION_TTL_SECONDS)
                await pipe.execute()

            logger.debug(f"Saved voice session: {state.session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to save voice session: {e}")
            return False

    async def get_session(self, session_id: str) -> Optional[VoiceSessionState]:
        """
        Get session state from Redis.

        Args:
            session_id: Session identifier

        Returns:
            VoiceSessionState if found, None otherwise
        """
        if not self.is_connected:
            return None

        try:
            session_key = self._session_key(session_id)
            data = await self.redis_client.hgetall(session_key)

            if not data:
                return None

            return VoiceSessionState.from_dict(data)

        except Exception as e:
            logger.error(f"Failed to get voice session: {e}")
            return None

    async def delete_session(self, session_id: str, user_id: str) -> bool:
        """
        Delete session state from Redis.

        Args:
            session_id: Session identifier
            user_id: User who owns the session

        Returns:
            True if deleted successfully
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            user_key = self._user_sessions_key(user_id)
            lock_key = self._lock_key(session_id)

            async with self.redis_client.pipeline() as pipe:
                await pipe.delete(session_key)
                await pipe.srem(user_key, session_id)
                await pipe.delete(lock_key)
                await pipe.execute()

            logger.debug(f"Deleted voice session: {session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete voice session: {e}")
            return False

    async def get_user_sessions(self, user_id: str) -> list[str]:
        """
        Get all active session IDs for a user.

        Args:
            user_id: User identifier

        Returns:
            List of session IDs
        """
        if not self.is_connected:
            return []

        try:
            user_key = self._user_sessions_key(user_id)
            return list(await self.redis_client.smembers(user_key))
        except Exception as e:
            logger.error(f"Failed to get user sessions: {e}")
            return []

    async def acquire_recovery_lock(self, session_id: str) -> bool:
        """
        Acquire a lock for session recovery.

        Prevents multiple clients from recovering the same session simultaneously.

        Args:
            session_id: Session identifier

        Returns:
            True if lock acquired, False if already locked
        """
        if not self.is_connected:
            return False

        try:
            lock_key = self._lock_key(session_id)
            # Use SET NX (set if not exists) with expiry
            acquired = await self.redis_client.set(
                lock_key,
                "locked",
                nx=True,
                ex=VOICE_SESSION_LOCK_TTL_SECONDS,
            )
            if acquired:
                logger.debug(f"Acquired recovery lock for session: {session_id}")
            return bool(acquired)
        except Exception as e:
            logger.error(f"Failed to acquire recovery lock: {e}")
            return False

    async def release_recovery_lock(self, session_id: str) -> bool:
        """
        Release the recovery lock for a session.

        Args:
            session_id: Session identifier

        Returns:
            True if released successfully
        """
        if not self.is_connected:
            return False

        try:
            lock_key = self._lock_key(session_id)
            await self.redis_client.delete(lock_key)
            logger.debug(f"Released recovery lock for session: {session_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to release recovery lock: {e}")
            return False

    async def update_activity(self, session_id: str) -> bool:
        """
        Update the last activity timestamp for a session.

        Also refreshes the TTL.

        Args:
            session_id: Session identifier

        Returns:
            True if updated successfully
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            now = datetime.now(timezone.utc).isoformat()

            async with self.redis_client.pipeline() as pipe:
                await pipe.hset(session_key, "last_activity_at", now)
                await pipe.expire(session_key, VOICE_SESSION_TTL_SECONDS)
                await pipe.execute()

            return True
        except Exception as e:
            logger.error(f"Failed to update session activity: {e}")
            return False

    async def update_metrics(
        self,
        session_id: str,
        metrics: Dict[str, Any],
    ) -> bool:
        """
        Update session metrics.

        Args:
            session_id: Session identifier
            metrics: Metrics dictionary to store

        Returns:
            True if updated successfully
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            await self.redis_client.hset(
                session_key,
                "metrics",
                json.dumps(metrics),
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update session metrics: {e}")
            return False

    async def update_audio_sequence(
        self,
        session_id: str,
        sequence: int,
    ) -> bool:
        """
        Update the audio output sequence number.

        Args:
            session_id: Session identifier
            sequence: Current sequence number

        Returns:
            True if updated successfully
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            await self.redis_client.hset(
                session_key,
                "audio_output_sequence",
                str(sequence),
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update audio sequence: {e}")
            return False

    async def set_connection_state(
        self,
        session_id: str,
        state: str,
    ) -> bool:
        """
        Update the connection state.

        Args:
            session_id: Session identifier
            state: Connection state string

        Returns:
            True if updated successfully
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            await self.redis_client.hset(session_key, "connection_state", state)
            return True
        except Exception as e:
            logger.error(f"Failed to set connection state: {e}")
            return False

    async def session_exists(self, session_id: str) -> bool:
        """
        Check if a session exists in Redis.

        Args:
            session_id: Session identifier

        Returns:
            True if session exists
        """
        if not self.is_connected:
            return False

        try:
            session_key = self._session_key(session_id)
            return await self.redis_client.exists(session_key) > 0
        except Exception as e:
            logger.error(f"Failed to check session existence: {e}")
            return False

    async def get_recoverable_session(
        self,
        session_id: str,
        user_id: str,
    ) -> Optional[VoiceSessionState]:
        """
        Get a session for recovery if it exists and belongs to the user.

        Validates ownership and acquires recovery lock.

        Args:
            session_id: Session identifier
            user_id: User attempting to recover

        Returns:
            VoiceSessionState if recoverable, None otherwise
        """
        # Get the session
        state = await self.get_session(session_id)
        if not state:
            logger.debug(f"No session found for recovery: {session_id}")
            return None

        # Verify ownership
        if state.user_id != user_id:
            logger.warning(f"Session ownership mismatch: {session_id} " f"(owner={state.user_id}, requester={user_id})")
            return None

        # Check if session is in a recoverable state
        if state.connection_state not in ("disconnected", "reconnecting"):
            logger.debug(f"Session not in recoverable state: {session_id} " f"(state={state.connection_state})")
            return None

        # Try to acquire recovery lock
        if not await self.acquire_recovery_lock(session_id):
            logger.info(f"Session recovery already in progress: {session_id}")
            return None

        return state

    async def cleanup_expired_sessions(self) -> int:
        """
        Cleanup expired sessions from user session sets.

        Redis handles TTL expiration for session data, but user session sets
        may contain references to expired sessions. This cleans those up.

        Returns:
            Number of expired references cleaned
        """
        # Note: This is a maintenance operation that could be run periodically
        # For now, we rely on Redis TTL for automatic cleanup
        # The user session sets will also expire via TTL
        return 0


# Global singleton instance
redis_voice_session_store = RedisVoiceSessionStore()
