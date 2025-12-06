"""
Tests for Redis Voice Session Store (WebSocket Reliability Phase 2)
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.redis_voice_session_store import VOICE_SESSION_PREFIX, RedisVoiceSessionStore, VoiceSessionState


class TestVoiceSessionState:
    """Tests for VoiceSessionState data class."""

    def test_create_state(self):
        """Test creating a session state object."""
        state = VoiceSessionState(
            session_id="test-session-123",
            user_id="user-456",
            conversation_id="conv-789",
        )

        assert state.session_id == "test-session-123"
        assert state.user_id == "user-456"
        assert state.conversation_id == "conv-789"
        assert state.connection_state == "disconnected"
        assert state.binary_audio_enabled is False
        assert state.audio_output_sequence == 0
        assert state.protocol_version == "1.0"

    def test_to_dict(self):
        """Test converting state to Redis hash dict."""
        state = VoiceSessionState(
            session_id="test-session",
            user_id="user-123",
            conversation_id="conv-456",
            connection_state="ready",
            config={"voice_id": "test-voice"},
            metrics={"utterance_count": 5},
            binary_audio_enabled=True,
            audio_output_sequence=42,
            protocol_version="2.0",
        )

        data = state.to_dict()

        assert data["session_id"] == "test-session"
        assert data["user_id"] == "user-123"
        assert data["conversation_id"] == "conv-456"
        assert data["connection_state"] == "ready"
        assert data["binary_audio_enabled"] == "1"
        assert data["audio_output_sequence"] == "42"
        assert data["protocol_version"] == "2.0"
        assert json.loads(data["config"]) == {"voice_id": "test-voice"}
        assert json.loads(data["metrics"]) == {"utterance_count": 5}

    def test_from_dict(self):
        """Test creating state from Redis hash dict."""
        data = {
            "session_id": "test-session",
            "user_id": "user-123",
            "conversation_id": "conv-456",
            "created_at": "2025-12-05T10:00:00+00:00",
            "last_activity_at": "2025-12-05T10:05:00+00:00",
            "connection_state": "ready",
            "config": '{"voice_id": "test-voice"}',
            "metrics": '{"utterance_count": 5}',
            "binary_audio_enabled": "1",
            "audio_output_sequence": "42",
            "protocol_version": "2.0",
        }

        state = VoiceSessionState.from_dict(data)

        assert state.session_id == "test-session"
        assert state.user_id == "user-123"
        assert state.conversation_id == "conv-456"
        assert state.connection_state == "ready"
        assert state.config == {"voice_id": "test-voice"}
        assert state.metrics == {"utterance_count": 5}
        assert state.binary_audio_enabled is True
        assert state.audio_output_sequence == 42
        assert state.protocol_version == "2.0"

    def test_from_dict_defaults(self):
        """Test creating state from minimal dict uses defaults."""
        data = {
            "session_id": "test-session",
            "user_id": "user-123",
        }

        state = VoiceSessionState.from_dict(data)

        assert state.session_id == "test-session"
        assert state.user_id == "user-123"
        assert state.conversation_id is None
        assert state.connection_state == "disconnected"
        assert state.config == {}
        assert state.metrics == {}
        assert state.binary_audio_enabled is False
        assert state.audio_output_sequence == 0


class TestRedisVoiceSessionStore:
    """Tests for RedisVoiceSessionStore."""

    @pytest.fixture
    def mock_redis(self):
        """Create a mock Redis client."""
        redis = AsyncMock()
        redis.ping = AsyncMock()
        redis.close = AsyncMock()
        redis.hset = AsyncMock()
        redis.hgetall = AsyncMock(return_value={})
        redis.delete = AsyncMock()
        redis.sadd = AsyncMock()
        redis.srem = AsyncMock()
        redis.smembers = AsyncMock(return_value=set())
        redis.expire = AsyncMock()
        redis.exists = AsyncMock(return_value=0)
        redis.set = AsyncMock(return_value=True)
        return redis

    @pytest.fixture
    def store(self):
        """Create a session store instance."""
        return RedisVoiceSessionStore()

    @pytest.mark.asyncio
    async def test_connect_success(self, store, mock_redis):
        """Test successful Redis connection."""
        with patch(
            "app.services.redis_voice_session_store.redis.from_url",
            AsyncMock(return_value=mock_redis),
        ):
            result = await store.connect()

            assert result is True
            assert store.is_connected is True
            mock_redis.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_connect_failure(self, store):
        """Test Redis connection failure."""
        with patch(
            "app.services.redis_voice_session_store.redis.from_url",
            AsyncMock(side_effect=Exception("Connection failed")),
        ):
            result = await store.connect()

            assert result is False
            assert store.is_connected is False

    @pytest.mark.asyncio
    async def test_disconnect(self, store, mock_redis):
        """Test Redis disconnection."""
        store.redis_client = mock_redis
        store._connected = True

        await store.disconnect()

        mock_redis.close.assert_called_once()
        assert store.is_connected is False

    @pytest.mark.asyncio
    async def test_save_session(self, store, mock_redis):
        """Test saving a session to Redis."""
        store.redis_client = mock_redis
        store._connected = True

        # Create mock pipeline
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock()
        mock_pipeline.hset = AsyncMock()
        mock_pipeline.expire = AsyncMock()
        mock_pipeline.sadd = AsyncMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        state = VoiceSessionState(
            session_id="test-session",
            user_id="user-123",
            conversation_id="conv-456",
        )

        result = await store.save_session(state)

        assert result is True
        mock_pipeline.hset.assert_called()
        mock_pipeline.expire.assert_called()
        mock_pipeline.sadd.assert_called()
        mock_pipeline.execute.assert_called()

    @pytest.mark.asyncio
    async def test_save_session_not_connected(self, store):
        """Test saving session when not connected returns False."""
        store._connected = False

        state = VoiceSessionState(
            session_id="test-session",
            user_id="user-123",
        )

        result = await store.save_session(state)

        assert result is False

    @pytest.mark.asyncio
    async def test_get_session(self, store, mock_redis):
        """Test retrieving a session from Redis."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.hgetall.return_value = {
            "session_id": "test-session",
            "user_id": "user-123",
            "conversation_id": "conv-456",
            "connection_state": "ready",
            "config": "{}",
            "metrics": "{}",
            "binary_audio_enabled": "0",
            "audio_output_sequence": "0",
            "protocol_version": "2.0",
        }

        state = await store.get_session("test-session")

        assert state is not None
        assert state.session_id == "test-session"
        assert state.user_id == "user-123"
        assert state.conversation_id == "conv-456"
        mock_redis.hgetall.assert_called_with(f"{VOICE_SESSION_PREFIX}test-session")

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, store, mock_redis):
        """Test getting non-existent session returns None."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.hgetall.return_value = {}

        state = await store.get_session("nonexistent")

        assert state is None

    @pytest.mark.asyncio
    async def test_delete_session(self, store, mock_redis):
        """Test deleting a session from Redis."""
        store.redis_client = mock_redis
        store._connected = True

        # Create mock pipeline
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock()
        mock_pipeline.delete = AsyncMock()
        mock_pipeline.srem = AsyncMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        result = await store.delete_session("test-session", "user-123")

        assert result is True
        mock_pipeline.delete.assert_called()
        mock_pipeline.srem.assert_called()
        mock_pipeline.execute.assert_called()

    @pytest.mark.asyncio
    async def test_acquire_recovery_lock_success(self, store, mock_redis):
        """Test acquiring recovery lock successfully."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.set.return_value = True

        result = await store.acquire_recovery_lock("test-session")

        assert result is True
        mock_redis.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_acquire_recovery_lock_already_locked(self, store, mock_redis):
        """Test acquiring lock when already locked returns False."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.set.return_value = None  # SET NX returns None if key exists

        result = await store.acquire_recovery_lock("test-session")

        assert result is False

    @pytest.mark.asyncio
    async def test_get_recoverable_session(self, store, mock_redis):
        """Test getting a recoverable session."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.hgetall.return_value = {
            "session_id": "test-session",
            "user_id": "user-123",
            "conversation_id": "conv-456",
            "connection_state": "disconnected",
            "config": "{}",
            "metrics": "{}",
            "binary_audio_enabled": "0",
            "audio_output_sequence": "0",
            "protocol_version": "2.0",
        }
        mock_redis.set.return_value = True  # Lock acquired

        state = await store.get_recoverable_session("test-session", "user-123")

        assert state is not None
        assert state.session_id == "test-session"

    @pytest.mark.asyncio
    async def test_get_recoverable_session_wrong_user(self, store, mock_redis):
        """Test recovery fails for wrong user."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.hgetall.return_value = {
            "session_id": "test-session",
            "user_id": "user-123",  # Different user
            "connection_state": "disconnected",
            "config": "{}",
            "metrics": "{}",
            "binary_audio_enabled": "0",
            "audio_output_sequence": "0",
            "protocol_version": "2.0",
        }

        state = await store.get_recoverable_session("test-session", "different-user")

        assert state is None  # Should fail ownership check

    @pytest.mark.asyncio
    async def test_get_recoverable_session_not_disconnected(self, store, mock_redis):
        """Test recovery fails for connected session."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.hgetall.return_value = {
            "session_id": "test-session",
            "user_id": "user-123",
            "connection_state": "ready",  # Still connected
            "config": "{}",
            "metrics": "{}",
            "binary_audio_enabled": "0",
            "audio_output_sequence": "0",
            "protocol_version": "2.0",
        }

        state = await store.get_recoverable_session("test-session", "user-123")

        assert state is None  # Should fail state check

    @pytest.mark.asyncio
    async def test_update_activity(self, store, mock_redis):
        """Test updating session activity timestamp."""
        store.redis_client = mock_redis
        store._connected = True

        # Create mock pipeline
        mock_pipeline = AsyncMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock()
        mock_pipeline.hset = AsyncMock()
        mock_pipeline.expire = AsyncMock()
        mock_pipeline.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        result = await store.update_activity("test-session")

        assert result is True
        mock_pipeline.hset.assert_called()
        mock_pipeline.expire.assert_called()

    @pytest.mark.asyncio
    async def test_set_connection_state(self, store, mock_redis):
        """Test updating connection state."""
        store.redis_client = mock_redis
        store._connected = True

        result = await store.set_connection_state("test-session", "ready")

        assert result is True
        mock_redis.hset.assert_called_with(
            f"{VOICE_SESSION_PREFIX}test-session",
            "connection_state",
            "ready",
        )

    @pytest.mark.asyncio
    async def test_session_exists(self, store, mock_redis):
        """Test checking if session exists."""
        store.redis_client = mock_redis
        store._connected = True

        mock_redis.exists.return_value = 1

        result = await store.session_exists("test-session")

        assert result is True
        mock_redis.exists.assert_called_with(f"{VOICE_SESSION_PREFIX}test-session")
