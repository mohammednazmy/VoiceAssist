"""
Comprehensive Unit Tests for WebSocket Session State Service

Tests cover:
- Session state persistence (save, get, update, delete)
- Message buffering for recovery
- Audio checkpoint tracking
- Session recovery flow
- Partial message tracking
- Tool call tracking
- Error handling for Redis failures
- Concurrent operations

Part of WebSocket Error Recovery Enhancement.
"""

import asyncio
import json
import time
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


# Now import the service
from app.services.websocket_session_state import (  # noqa: E402
    ActiveToolCall,
    AudioCheckpoint,
    SessionRecoveryState,
    WebSocketSessionState,
    WebSocketSessionStateService,
)

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
    client.rpush = AsyncMock()
    client.ltrim = AsyncMock()
    client.lrange = AsyncMock(return_value=[])
    client.expire = AsyncMock()
    return client


@pytest.fixture
def session_state_service(mock_redis_client):
    """Create a session state service with mock Redis."""
    service = WebSocketSessionStateService()
    service.redis_client = mock_redis_client
    service._connected = True
    return service


@pytest.fixture
def sample_session_state():
    """Create a sample session state for testing."""
    return WebSocketSessionState(
        session_id="test-session-123",
        user_id="test-user-456",
        conversation_id="conv-789",
        pipeline_state="idle",
        connection_state="connected",
        created_at=time.time(),
        updated_at=time.time(),
    )


@pytest.fixture
def sample_audio_checkpoint():
    """Create a sample audio checkpoint for testing."""
    return AudioCheckpoint(
        last_confirmed_seq=10,
        pending_chunks=[{"seq": 11, "data": "chunk1"}, {"seq": 12, "data": "chunk2"}],
        total_chunks_sent=12,
        playback_position_ms=5000,
    )


# =============================================================================
# Connection Tests
# =============================================================================


class TestConnection:
    """Tests for Redis connection management."""

    @pytest.mark.asyncio
    async def test_connect_success(self, mock_redis_client):
        """Test successful Redis connection."""
        service = WebSocketSessionStateService()

        async def mock_from_url(*args, **kwargs):
            return mock_redis_client

        with patch("app.services.websocket_session_state.redis.from_url", mock_from_url):
            result = await service.connect()

        assert result is True
        assert service._connected is True

    @pytest.mark.asyncio
    async def test_connect_failure(self):
        """Test Redis connection failure handling."""
        service = WebSocketSessionStateService()

        async def mock_from_url_fail(*args, **kwargs):
            raise Exception("Connection refused")

        with patch("app.services.websocket_session_state.redis.from_url", mock_from_url_fail):
            result = await service.connect()

        assert result is False
        assert service._connected is False

    @pytest.mark.asyncio
    async def test_disconnect(self, session_state_service, mock_redis_client):
        """Test Redis disconnection."""
        await session_state_service.disconnect()

        mock_redis_client.close.assert_called_once()
        assert session_state_service._connected is False

    @pytest.mark.asyncio
    async def test_already_connected(self, session_state_service):
        """Test that connect returns True if already connected."""
        result = await session_state_service.connect()
        assert result is True


# =============================================================================
# Session State Persistence Tests
# =============================================================================


class TestSessionStatePersistence:
    """Tests for session state persistence operations."""

    @pytest.mark.asyncio
    async def test_save_session_state(self, session_state_service, mock_redis_client, sample_session_state):
        """Test saving session state to Redis."""
        result = await session_state_service.save_session_state(sample_session_state)

        assert result is True
        mock_redis_client.setex.assert_called_once()

        # Verify the key format
        call_args = mock_redis_client.setex.call_args
        assert "ws_session:test-session-123" in str(call_args)

    @pytest.mark.asyncio
    async def test_save_session_state_no_connection(self, sample_session_state):
        """Test save fails gracefully without connection."""
        service = WebSocketSessionStateService()
        service._connected = False

        result = await service.save_session_state(sample_session_state)

        assert result is False

    @pytest.mark.asyncio
    async def test_get_session_state(self, session_state_service, mock_redis_client):
        """Test retrieving session state from Redis."""
        stored_state = {
            "session_id": "test-session-123",
            "user_id": "test-user-456",
            "conversation_id": "conv-789",
            "pipeline_state": "listening",
            "connection_state": "connected",
            "last_message_seq": 5,
            "last_audio_seq_in": 10,
            "last_audio_seq_out": 8,
            "partial_transcript": "Hello, how",
            "partial_response": "",
            "partial_message_id": "msg-1",
            "active_tool_calls": [],
            "audio_checkpoint": None,
            "created_at": 1000.0,
            "updated_at": 1000.0,
            "disconnected_at": None,
            "voice_id": "voice-1",
            "language": "en",
            "vad_sensitivity": 0.5,
            "recovery_attempts": 0,
            "last_recovery_at": None,
        }
        mock_redis_client.get.return_value = json.dumps(stored_state)

        result = await session_state_service.get_session_state("test-session-123")

        assert result is not None
        assert result.session_id == "test-session-123"
        assert result.user_id == "test-user-456"
        assert result.pipeline_state == "listening"
        assert result.partial_transcript == "Hello, how"

    @pytest.mark.asyncio
    async def test_get_session_state_not_found(self, session_state_service, mock_redis_client):
        """Test get returns None for non-existent session."""
        mock_redis_client.get.return_value = None

        result = await session_state_service.get_session_state("non-existent")

        assert result is None

    @pytest.mark.asyncio
    async def test_update_session_state(self, session_state_service, mock_redis_client, sample_session_state):
        """Test updating specific fields in session state."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.update_session_state(
            "test-session-123",
            {"pipeline_state": "speaking", "last_message_seq": 10},
        )

        assert result is True
        mock_redis_client.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_session_state(self, session_state_service, mock_redis_client):
        """Test deleting session state from Redis."""
        result = await session_state_service.delete_session_state("test-session-123")

        assert result is True
        mock_redis_client.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_mark_disconnected(self, session_state_service, mock_redis_client, sample_session_state):
        """Test marking session as disconnected."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.mark_disconnected("test-session-123")

        assert result is True


# =============================================================================
# Message Buffer Tests
# =============================================================================


class TestMessageBuffer:
    """Tests for message buffering operations."""

    @pytest.mark.asyncio
    async def test_buffer_message(self, session_state_service, mock_redis_client):
        """Test adding message to buffer."""
        message = {"type": "transcript.delta", "seq": 5, "text": "Hello"}

        result = await session_state_service.buffer_message("test-session-123", message)

        assert result is True
        mock_redis_client.rpush.assert_called_once()
        mock_redis_client.ltrim.assert_called_once()
        mock_redis_client.expire.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_buffered_messages(self, session_state_service, mock_redis_client):
        """Test retrieving buffered messages."""
        messages = [
            json.dumps({"type": "transcript.delta", "seq": 3, "text": "Hello"}),
            json.dumps({"type": "transcript.delta", "seq": 5, "text": "World"}),
            json.dumps({"type": "response.delta", "seq": 7, "text": "Hi there"}),
        ]
        mock_redis_client.lrange.return_value = messages

        result = await session_state_service.get_buffered_messages("test-session-123", from_seq=4)

        assert len(result) == 2  # Only seq 5 and 7
        assert result[0]["seq"] == 5
        assert result[1]["seq"] == 7

    @pytest.mark.asyncio
    async def test_get_buffered_messages_all(self, session_state_service, mock_redis_client):
        """Test retrieving all buffered messages."""
        messages = [
            json.dumps({"type": "transcript.delta", "seq": 3, "text": "Hello"}),
            json.dumps({"type": "transcript.delta", "seq": 5, "text": "World"}),
        ]
        mock_redis_client.lrange.return_value = messages

        result = await session_state_service.get_buffered_messages("test-session-123", from_seq=0)

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_clear_message_buffer(self, session_state_service, mock_redis_client):
        """Test clearing message buffer."""
        result = await session_state_service.clear_message_buffer("test-session-123")

        assert result is True
        mock_redis_client.delete.assert_called_once()


# =============================================================================
# Audio Checkpoint Tests
# =============================================================================


class TestAudioCheckpoint:
    """Tests for audio checkpoint operations."""

    @pytest.mark.asyncio
    async def test_save_audio_checkpoint(self, session_state_service, mock_redis_client, sample_audio_checkpoint):
        """Test saving audio checkpoint."""
        result = await session_state_service.save_audio_checkpoint("test-session-123", sample_audio_checkpoint)

        assert result is True
        mock_redis_client.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_audio_checkpoint(self, session_state_service, mock_redis_client):
        """Test retrieving audio checkpoint."""
        checkpoint_data = {
            "last_confirmed_seq": 10,
            "pending_chunks": [{"seq": 11, "data": "chunk1"}],
            "total_chunks_sent": 11,
            "playback_position_ms": 5000,
        }
        mock_redis_client.get.return_value = json.dumps(checkpoint_data)

        result = await session_state_service.get_audio_checkpoint("test-session-123")

        assert result is not None
        assert result.last_confirmed_seq == 10
        assert len(result.pending_chunks) == 1

    @pytest.mark.asyncio
    async def test_update_audio_confirmed(self, session_state_service, mock_redis_client):
        """Test updating confirmed audio sequence."""
        checkpoint_data = {
            "last_confirmed_seq": 5,
            "pending_chunks": [
                {"seq": 6, "data": "chunk1"},
                {"seq": 7, "data": "chunk2"},
                {"seq": 8, "data": "chunk3"},
            ],
            "total_chunks_sent": 8,
            "playback_position_ms": 3000,
        }
        mock_redis_client.get.return_value = json.dumps(checkpoint_data)

        result = await session_state_service.update_audio_confirmed("test-session-123", 7)

        assert result is True
        # Verify that setex was called with updated data
        mock_redis_client.setex.assert_called()

    @pytest.mark.asyncio
    async def test_add_pending_audio_chunk(self, session_state_service, mock_redis_client):
        """Test adding pending audio chunk."""
        mock_redis_client.get.return_value = None  # No existing checkpoint

        chunk = {"seq": 1, "data": "audio_data_base64"}
        result = await session_state_service.add_pending_audio_chunk("test-session-123", chunk)

        assert result is True
        mock_redis_client.setex.assert_called()


# =============================================================================
# Session Recovery Tests
# =============================================================================


class TestSessionRecovery:
    """Tests for session recovery flow."""

    @pytest.mark.asyncio
    async def test_attempt_recovery_success(self, session_state_service, mock_redis_client, sample_session_state):
        """Test successful session recovery."""
        sample_session_state.disconnected_at = time.time() - 60  # 1 minute ago
        mock_redis_client.get.side_effect = [
            json.dumps(sample_session_state.to_dict()),  # Session state
            None,  # Audio checkpoint (not found)
        ]
        mock_redis_client.lrange.return_value = [json.dumps({"type": "response.delta", "seq": 5, "text": "Hi"})]

        result = await session_state_service.attempt_recovery("test-session-123", "test-user-456", last_known_seq=3)

        assert result.success is True
        assert result.state == SessionRecoveryState.FULL
        assert result.session_state is not None
        assert len(result.missed_messages) == 1

    @pytest.mark.asyncio
    async def test_attempt_recovery_no_session(self, session_state_service, mock_redis_client):
        """Test recovery fails when no session exists."""
        mock_redis_client.get.return_value = None

        result = await session_state_service.attempt_recovery("non-existent", "test-user", last_known_seq=0)

        assert result.success is False
        assert result.state == SessionRecoveryState.NONE
        assert "No session state found" in result.error

    @pytest.mark.asyncio
    async def test_attempt_recovery_user_mismatch(self, session_state_service, mock_redis_client, sample_session_state):
        """Test recovery fails on user ID mismatch."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.attempt_recovery("test-session-123", "wrong-user", last_known_seq=0)

        assert result.success is False
        assert "User ID mismatch" in result.error

    @pytest.mark.asyncio
    async def test_attempt_recovery_expired(self, session_state_service, mock_redis_client, sample_session_state):
        """Test recovery fails for expired session."""
        sample_session_state.disconnected_at = time.time() - 3600  # 1 hour ago
        session_state_service.session_ttl = 600  # 10 minutes
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.attempt_recovery("test-session-123", "test-user-456", last_known_seq=0)

        assert result.success is False
        assert "Session expired" in result.error

    @pytest.mark.asyncio
    async def test_create_session(self, session_state_service, mock_redis_client):
        """Test creating a new session."""
        result = await session_state_service.create_session(
            session_id="new-session",
            user_id="user-123",
            conversation_id="conv-456",
            voice_id="voice-1",
            language="en",
        )

        assert result.session_id == "new-session"
        assert result.user_id == "user-123"
        assert result.conversation_id == "conv-456"
        assert result.voice_id == "voice-1"
        mock_redis_client.setex.assert_called_once()


# =============================================================================
# Partial Message Tracking Tests
# =============================================================================


class TestPartialMessageTracking:
    """Tests for partial message tracking."""

    @pytest.mark.asyncio
    async def test_update_partial_transcript(self, session_state_service, mock_redis_client, sample_session_state):
        """Test updating partial transcript."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.update_partial_transcript("test-session-123", "Hello, how are", "msg-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_update_partial_response(self, session_state_service, mock_redis_client, sample_session_state):
        """Test updating partial response."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.update_partial_response("test-session-123", "I am doing well", "msg-2")

        assert result is True

    @pytest.mark.asyncio
    async def test_clear_partial_messages(self, session_state_service, mock_redis_client, sample_session_state):
        """Test clearing partial messages."""
        sample_session_state.partial_transcript = "Hello"
        sample_session_state.partial_response = "Hi"
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.clear_partial_messages("test-session-123")

        assert result is True


# =============================================================================
# Tool Call Tracking Tests
# =============================================================================


class TestToolCallTracking:
    """Tests for tool call tracking."""

    @pytest.mark.asyncio
    async def test_add_tool_call(self, session_state_service, mock_redis_client, sample_session_state):
        """Test adding a tool call."""
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        tool_call = ActiveToolCall(
            tool_id="tool-1",
            tool_name="search",
            arguments={"query": "test"},
            status="pending",
        )

        result = await session_state_service.add_tool_call("test-session-123", tool_call)

        assert result is True

    @pytest.mark.asyncio
    async def test_update_tool_call(self, session_state_service, mock_redis_client, sample_session_state):
        """Test updating a tool call status."""
        sample_session_state.active_tool_calls = [
            {"tool_id": "tool-1", "tool_name": "search", "arguments": {}, "status": "running"}
        ]
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.update_tool_call(
            "test-session-123", "tool-1", "completed", {"data": "result"}
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_clear_completed_tool_calls(self, session_state_service, mock_redis_client, sample_session_state):
        """Test clearing completed tool calls."""
        sample_session_state.active_tool_calls = [
            {"tool_id": "tool-1", "status": "completed"},
            {"tool_id": "tool-2", "status": "running"},
            {"tool_id": "tool-3", "status": "failed"},
        ]
        mock_redis_client.get.return_value = json.dumps(sample_session_state.to_dict())

        result = await session_state_service.clear_completed_tool_calls("test-session-123")

        assert result is True


# =============================================================================
# Data Class Tests
# =============================================================================


class TestDataClasses:
    """Tests for data class serialization."""

    def test_session_state_to_dict(self, sample_session_state):
        """Test session state serialization."""
        result = sample_session_state.to_dict()

        assert result["session_id"] == "test-session-123"
        assert result["user_id"] == "test-user-456"
        assert "pipeline_state" in result
        assert "active_tool_calls" in result

    def test_session_state_from_dict(self):
        """Test session state deserialization."""
        data = {
            "session_id": "sess-1",
            "user_id": "user-1",
            "conversation_id": "conv-1",
            "pipeline_state": "speaking",
            "connection_state": "connected",
            "last_message_seq": 10,
            "partial_transcript": "Hello",
            "voice_id": "voice-1",
        }

        result = WebSocketSessionState.from_dict(data)

        assert result.session_id == "sess-1"
        assert result.pipeline_state == "speaking"
        assert result.last_message_seq == 10
        assert result.partial_transcript == "Hello"

    def test_session_state_from_dict_defaults(self):
        """Test session state deserialization with missing fields."""
        data = {"session_id": "sess-1", "user_id": "user-1"}

        result = WebSocketSessionState.from_dict(data)

        assert result.pipeline_state == "idle"
        assert result.last_message_seq == 0
        assert result.partial_transcript == ""
        assert result.active_tool_calls == []


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestErrorHandling:
    """Tests for error handling."""

    @pytest.mark.asyncio
    async def test_save_redis_error(self, session_state_service, mock_redis_client, sample_session_state):
        """Test save handles Redis errors gracefully."""
        mock_redis_client.setex.side_effect = Exception("Redis error")

        result = await session_state_service.save_session_state(sample_session_state)

        assert result is False

    @pytest.mark.asyncio
    async def test_get_redis_error(self, session_state_service, mock_redis_client):
        """Test get handles Redis errors gracefully."""
        mock_redis_client.get.side_effect = Exception("Redis error")

        result = await session_state_service.get_session_state("test-session")

        assert result is None

    @pytest.mark.asyncio
    async def test_buffer_message_no_connection(self):
        """Test buffer message without connection."""
        service = WebSocketSessionStateService()
        service._connected = False

        result = await service.buffer_message("session", {"type": "test"})

        assert result is False


# =============================================================================
# Concurrent Operations Tests
# =============================================================================


class TestConcurrentOperations:
    """Tests for concurrent session operations."""

    @pytest.mark.asyncio
    async def test_concurrent_saves(self, session_state_service, mock_redis_client):
        """Test concurrent session saves."""
        states = [
            WebSocketSessionState(
                session_id=f"session-{i}",
                user_id=f"user-{i}",
                created_at=time.time(),
                updated_at=time.time(),
            )
            for i in range(10)
        ]

        tasks = [session_state_service.save_session_state(state) for state in states]
        results = await asyncio.gather(*tasks)

        assert all(results)
        assert mock_redis_client.setex.call_count == 10

    @pytest.mark.asyncio
    async def test_concurrent_buffer_operations(self, session_state_service, mock_redis_client):
        """Test concurrent message buffering."""
        messages = [{"type": "transcript.delta", "seq": i, "text": f"msg-{i}"} for i in range(20)]

        tasks = [session_state_service.buffer_message("test-session", msg) for msg in messages]
        results = await asyncio.gather(*tasks)

        assert all(results)
        assert mock_redis_client.rpush.call_count == 20
