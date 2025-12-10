"""
Comprehensive Unit Tests for Redis Session Store

Tests cover:
- Session activity recording
- Session timeout checking (inactivity and absolute)
- Session invalidation
- Redis connection handling
- Session info retrieval
- Error handling for Redis failures
- Concurrent session operations

Part of WebSocket Reliability Enhancement testing.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# Mock redis before importing the service
@pytest.fixture(scope="module", autouse=True)
def mock_redis_module():
    """Mock redis module to prevent actual connections."""
    mock_redis = MagicMock()
    mock_redis.asyncio = MagicMock()
    mock_redis.asyncio.from_url = AsyncMock()
    with patch.dict("sys.modules", {"redis": mock_redis, "redis.asyncio": mock_redis.asyncio}):
        yield mock_redis


# Now we can import the service
from app.services.session_activity import SessionActivityService  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_redis_client():
    """Create a mock Redis client."""
    client = AsyncMock()
    client.ping = AsyncMock(return_value=True)
    client.setex = AsyncMock()
    client.get = AsyncMock()
    client.delete = AsyncMock()
    client.close = AsyncMock()
    return client


@pytest.fixture
def session_service(mock_redis_client):
    """Create a session activity service with mock Redis."""
    service = SessionActivityService()
    service.redis_client = mock_redis_client
    return service


@pytest.fixture
def test_user_id():
    return "test-user-123"


@pytest.fixture
def test_token_iat():
    # Token issued 1 hour ago
    return int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())


# =============================================================================
# Connection Tests
# =============================================================================


class TestRedisConnection:
    """Tests for Redis connection management."""

    @pytest.mark.asyncio
    async def test_connect_success(self, mock_redis_client):
        """Test successful Redis connection."""
        service = SessionActivityService()
        service.redis_client = None  # Ensure clean state

        # redis.from_url is awaited, so we need to return an awaitable
        async def mock_from_url(*args, **kwargs):
            return mock_redis_client

        with patch("app.services.session_activity.redis.from_url", mock_from_url):
            await service.connect()

        assert service.redis_client is not None

    @pytest.mark.asyncio
    async def test_connect_failure(self):
        """Test Redis connection failure handling."""
        service = SessionActivityService()
        service.redis_client = None  # Ensure clean state

        # redis.from_url is awaited, so we need an async function that raises
        async def mock_from_url_fail(*args, **kwargs):
            raise Exception("Connection refused")

        with patch("app.services.session_activity.redis.from_url", mock_from_url_fail):
            await service.connect()

        # Service should not crash, just log error
        assert service.redis_client is None

    @pytest.mark.asyncio
    async def test_disconnect(self, session_service, mock_redis_client):
        """Test Redis disconnection."""
        await session_service.disconnect()

        mock_redis_client.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_without_connection(self):
        """Test disconnect when not connected."""
        service = SessionActivityService()
        service.redis_client = None

        # Should not raise
        await service.disconnect()


# =============================================================================
# Activity Recording Tests
# =============================================================================


class TestActivityRecording:
    """Tests for session activity recording."""

    @pytest.mark.asyncio
    async def test_record_activity_success(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test successful activity recording."""
        result = await session_service.record_activity(test_user_id, test_token_iat)

        assert result is True
        mock_redis_client.setex.assert_called_once()

        # Verify the key format
        call_args = mock_redis_client.setex.call_args
        key = call_args.kwargs.get("name")
        assert f"session_activity:{test_user_id}:{test_token_iat}" == key

    @pytest.mark.asyncio
    async def test_record_activity_no_connection(self, test_user_id, test_token_iat):
        """Test activity recording without Redis connection."""
        service = SessionActivityService()
        service.redis_client = None

        result = await service.record_activity(test_user_id, test_token_iat)

        assert result is False

    @pytest.mark.asyncio
    async def test_record_activity_redis_error(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test activity recording with Redis error."""
        mock_redis_client.setex.side_effect = Exception("Redis error")

        result = await session_service.record_activity(test_user_id, test_token_iat)

        assert result is False

    @pytest.mark.asyncio
    async def test_record_activity_multiple_sessions(self, session_service, mock_redis_client):
        """Test recording activity for multiple sessions."""
        sessions = [
            ("user1", 1000000),
            ("user2", 1000001),
            ("user3", 1000002),
        ]

        for user_id, token_iat in sessions:
            result = await session_service.record_activity(user_id, token_iat)
            assert result is True

        assert mock_redis_client.setex.call_count == len(sessions)


# =============================================================================
# Last Activity Retrieval Tests
# =============================================================================


class TestLastActivityRetrieval:
    """Tests for retrieving last activity timestamp."""

    @pytest.mark.asyncio
    async def test_get_last_activity_exists(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test getting last activity when it exists."""
        stored_time = datetime.now(timezone.utc).isoformat()
        mock_redis_client.get.return_value = stored_time

        result = await session_service.get_last_activity(test_user_id, test_token_iat)

        assert result is not None
        assert isinstance(result, datetime)

    @pytest.mark.asyncio
    async def test_get_last_activity_not_exists(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test getting last activity when it doesn't exist."""
        mock_redis_client.get.return_value = None

        result = await session_service.get_last_activity(test_user_id, test_token_iat)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_last_activity_no_connection(self, test_user_id, test_token_iat):
        """Test getting last activity without Redis connection."""
        service = SessionActivityService()
        service.redis_client = None

        result = await service.get_last_activity(test_user_id, test_token_iat)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_last_activity_redis_error(
        self, session_service, mock_redis_client, test_user_id, test_token_iat
    ):
        """Test getting last activity with Redis error."""
        mock_redis_client.get.side_effect = Exception("Redis error")

        result = await session_service.get_last_activity(test_user_id, test_token_iat)

        assert result is None


# =============================================================================
# Session Timeout Tests
# =============================================================================


class TestSessionTimeouts:
    """Tests for session timeout checking."""

    @pytest.mark.asyncio
    async def test_session_valid(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test valid session (no timeout)."""
        # Recent activity
        recent_activity = datetime.now(timezone.utc).isoformat()
        mock_redis_client.get.return_value = recent_activity

        is_valid, error = await session_service.check_session_timeouts(test_user_id, test_token_iat)

        assert is_valid is True
        assert error is None

    @pytest.mark.asyncio
    async def test_session_inactivity_timeout(self, session_service, mock_redis_client):
        """Test session with inactivity timeout."""
        user_id = "test-user"
        # Token issued 1 hour ago (within absolute timeout)
        token_iat = int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())

        # Activity from 2 hours ago (exceeds inactivity timeout)
        old_activity = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        mock_redis_client.get.return_value = old_activity

        with patch.object(session_service, "record_activity", return_value=True):
            is_valid, error = await session_service.check_session_timeouts(user_id, token_iat)

        assert is_valid is False
        assert "inactivity" in error.lower()

    @pytest.mark.asyncio
    async def test_session_absolute_timeout(self, session_service, mock_redis_client):
        """Test session with absolute timeout."""
        user_id = "test-user"
        # Token issued 25 hours ago (exceeds 24h absolute timeout)
        token_iat = int((datetime.now(timezone.utc) - timedelta(hours=25)).timestamp())

        is_valid, error = await session_service.check_session_timeouts(user_id, token_iat)

        assert is_valid is False
        assert "expired" in error.lower() or "log in" in error.lower()

    @pytest.mark.asyncio
    async def test_session_no_previous_activity(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test session with no previous activity recorded."""
        mock_redis_client.get.return_value = None

        is_valid, error = await session_service.check_session_timeouts(test_user_id, test_token_iat)

        # Should be valid if within absolute timeout
        assert is_valid is True
        assert error is None


# =============================================================================
# Session Info Tests
# =============================================================================


class TestSessionInfo:
    """Tests for session info retrieval."""

    @pytest.mark.asyncio
    async def test_get_session_info_with_activity(
        self, session_service, mock_redis_client, test_user_id, test_token_iat
    ):
        """Test getting session info with existing activity."""
        recent_activity = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        mock_redis_client.get.return_value = recent_activity

        info = await session_service.get_session_info(test_user_id, test_token_iat)

        assert "absolute_timeout_hours" in info
        assert "inactivity_timeout_minutes" in info
        assert "absolute_remaining_seconds" in info
        assert "inactivity_remaining_seconds" in info
        assert "session_started_at" in info
        assert "last_activity_at" in info
        assert info["absolute_remaining_seconds"] > 0
        assert info["inactivity_remaining_seconds"] > 0

    @pytest.mark.asyncio
    async def test_get_session_info_no_activity(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test getting session info without previous activity."""
        mock_redis_client.get.return_value = None

        info = await session_service.get_session_info(test_user_id, test_token_iat)

        assert info["last_activity_at"] is None
        # Should still have remaining time based on token issue
        assert info["inactivity_remaining_seconds"] > 0


# =============================================================================
# Session Invalidation Tests
# =============================================================================


class TestSessionInvalidation:
    """Tests for session invalidation."""

    @pytest.mark.asyncio
    async def test_invalidate_session_success(self, session_service, mock_redis_client, test_user_id, test_token_iat):
        """Test successful session invalidation."""
        result = await session_service.invalidate_session(test_user_id, test_token_iat)

        assert result is True
        mock_redis_client.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalidate_session_no_connection(self, test_user_id, test_token_iat):
        """Test invalidation without Redis connection."""
        service = SessionActivityService()
        service.redis_client = None

        result = await service.invalidate_session(test_user_id, test_token_iat)

        assert result is False

    @pytest.mark.asyncio
    async def test_invalidate_session_redis_error(
        self, session_service, mock_redis_client, test_user_id, test_token_iat
    ):
        """Test invalidation with Redis error."""
        mock_redis_client.delete.side_effect = Exception("Redis error")

        result = await session_service.invalidate_session(test_user_id, test_token_iat)

        assert result is False


# =============================================================================
# Concurrent Operations Tests
# =============================================================================


class TestConcurrentOperations:
    """Tests for concurrent session operations."""

    @pytest.mark.asyncio
    async def test_concurrent_activity_recording(self, session_service, mock_redis_client):
        """Test concurrent activity recording from multiple sessions."""
        tasks = []
        for i in range(50):
            user_id = f"user-{i}"
            token_iat = 1000000 + i
            tasks.append(session_service.record_activity(user_id, token_iat))

        results = await asyncio.gather(*tasks)

        assert all(results)
        assert mock_redis_client.setex.call_count == 50

    @pytest.mark.asyncio
    async def test_concurrent_timeout_checks(self, session_service, mock_redis_client):
        """Test concurrent timeout checking."""
        recent_activity = datetime.now(timezone.utc).isoformat()
        mock_redis_client.get.return_value = recent_activity

        tasks = []
        for i in range(20):
            user_id = f"user-{i}"
            token_iat = int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())
            tasks.append(session_service.check_session_timeouts(user_id, token_iat))

        results = await asyncio.gather(*tasks)

        # All should be valid
        assert all(r[0] for r in results)


# =============================================================================
# Key Generation Tests
# =============================================================================


class TestKeyGeneration:
    """Tests for Redis key generation."""

    def test_session_key_format(self, session_service):
        """Test that session keys have correct format."""
        user_id = "test-user"
        token_iat = 1234567890

        key = session_service._get_session_key(user_id, token_iat)

        assert key == f"session_activity:{user_id}:{token_iat}"

    def test_session_key_with_special_chars(self, session_service):
        """Test session key with special characters in user_id."""
        user_id = "user@example.com"
        token_iat = 1234567890

        key = session_service._get_session_key(user_id, token_iat)

        # Should handle special characters
        assert "user@example.com" in key

    def test_unique_keys_for_different_sessions(self, session_service):
        """Test that different sessions have unique keys."""
        user_id = "same-user"
        token_iat_1 = 1000000
        token_iat_2 = 1000001

        key1 = session_service._get_session_key(user_id, token_iat_1)
        key2 = session_service._get_session_key(user_id, token_iat_2)

        assert key1 != key2
