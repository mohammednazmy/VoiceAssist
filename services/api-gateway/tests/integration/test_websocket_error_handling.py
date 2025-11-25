"""
Tests for WebSocket error handling and graceful disconnection.

These tests verify that the WebSocket endpoint handles:
- Abrupt client disconnections
- Errors during message processing
- Safe message sending when connection is closing

This test file uses unit tests with mocks to verify error handling logic
without requiring the full application stack (Qdrant, Redis, Postgres).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.websockets import WebSocketState


# Mock external dependencies BEFORE importing app code
@pytest.fixture(scope="module")
def mock_dependencies():
    """Mock all external dependencies to prevent connection attempts."""
    mock_engine = MagicMock()
    mock_engine.pool.size.return_value = 20
    mock_engine.pool.checkedout.return_value = 0

    mock_redis = MagicMock()
    mock_redis.info.return_value = {"used_memory": 1024 * 1024}

    # Mock Qdrant client
    mock_qdrant = MagicMock()
    mock_qdrant.get_collections.return_value = MagicMock(collections=[])

    with patch.dict(
        "sys.modules",
        {
            "app.core.database": MagicMock(
                check_postgres_connection=MagicMock(return_value=True),
                check_redis_connection=MagicMock(return_value=True),
                check_qdrant_connection=AsyncMock(return_value=True),
                engine=mock_engine,
                redis_client=mock_redis,
                get_db=MagicMock(),
            ),
            "app.services.nextcloud": MagicMock(
                check_nextcloud_connection=AsyncMock(return_value=True),
            ),
        },
    ):
        yield


class TestSafeSendJson:
    """Tests for the safe_send_json helper function."""

    @pytest.mark.asyncio
    async def test_safe_send_json_on_connected_socket(self, mock_dependencies):
        """Test safe_send_json sends message when socket is connected."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = AsyncMock()

        result = await safe_send_json(mock_websocket, {"type": "test"})

        assert result is True
        mock_websocket.send_json.assert_called_once_with({"type": "test"})

    @pytest.mark.asyncio
    async def test_safe_send_json_on_disconnected_socket(self, mock_dependencies):
        """Test safe_send_json returns False when socket is disconnected."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.DISCONNECTED
        mock_websocket.send_json = AsyncMock()

        result = await safe_send_json(mock_websocket, {"type": "test"})

        assert result is False
        mock_websocket.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_safe_send_json_handles_runtime_error(self, mock_dependencies):
        """Test safe_send_json catches RuntimeError when connection closes."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = AsyncMock(
            side_effect=RuntimeError(
                "Cannot call 'send' once a close message has been sent"
            )
        )

        result = await safe_send_json(mock_websocket, {"type": "test"})

        assert result is False

    @pytest.mark.asyncio
    async def test_safe_send_json_reraises_other_runtime_errors(
        self, mock_dependencies
    ):
        """Test safe_send_json re-raises RuntimeError not related to close."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = AsyncMock(
            side_effect=RuntimeError("Some other runtime error")
        )

        with pytest.raises(RuntimeError, match="Some other runtime error"):
            await safe_send_json(mock_websocket, {"type": "test"})

    @pytest.mark.asyncio
    async def test_safe_send_json_handles_generic_exception(self, mock_dependencies):
        """Test safe_send_json handles generic exceptions gracefully."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = AsyncMock(side_effect=Exception("Network error"))

        result = await safe_send_json(mock_websocket, {"type": "test"})

        assert result is False


class TestConnectionManagerErrorHandling:
    """Tests for ConnectionManager error handling."""

    @pytest.mark.asyncio
    async def test_send_personal_message_handles_closed_connection(
        self, mock_dependencies
    ):
        """Test that send_personal_message doesn't crash on closed connection."""
        from app.api.realtime import ConnectionManager

        manager = ConnectionManager()

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.DISCONNECTED
        mock_websocket.send_json = AsyncMock()

        # Register the connection
        manager.active_connections["test-client"] = mock_websocket

        # Should not raise, should just skip sending
        await manager.send_personal_message({"type": "test"}, "test-client")

        # send_json should not have been called
        mock_websocket.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_send_personal_message_handles_runtime_error(self, mock_dependencies):
        """Test that send_personal_message catches RuntimeError gracefully."""
        from app.api.realtime import ConnectionManager

        manager = ConnectionManager()

        mock_websocket = MagicMock()
        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = AsyncMock(
            side_effect=RuntimeError("Cannot send after close")
        )

        manager.active_connections["test-client"] = mock_websocket

        # Should not raise
        await manager.send_personal_message({"type": "test"}, "test-client")

    @pytest.mark.asyncio
    async def test_send_personal_message_to_nonexistent_client(self, mock_dependencies):
        """Test that send_personal_message handles missing client gracefully."""
        from app.api.realtime import ConnectionManager

        manager = ConnectionManager()

        # Should not raise when sending to non-existent client
        await manager.send_personal_message({"type": "test"}, "nonexistent-client")


class TestStreamingInterruption:
    """Tests for handling streaming interruption."""

    @pytest.mark.asyncio
    async def test_streaming_stops_on_disconnect(self, mock_dependencies):
        """Test that streaming stops early when client disconnects mid-stream."""
        from app.api.realtime import safe_send_json

        mock_websocket = MagicMock()
        call_count = 0

        async def send_json_with_disconnect(message):
            nonlocal call_count
            call_count += 1
            # Simulate disconnect after 3rd chunk
            if call_count >= 3:
                mock_websocket.client_state = WebSocketState.DISCONNECTED
                raise RuntimeError(
                    "Cannot call 'send' once a close message has been sent"
                )

        mock_websocket.client_state = WebSocketState.CONNECTED
        mock_websocket.send_json = send_json_with_disconnect

        # Simulate streaming multiple chunks
        response_text = "This is a test response that would be streamed in chunks"
        chunk_size = 10
        chunks_sent = 0

        for i in range(0, len(response_text), chunk_size):
            chunk = response_text[i : i + chunk_size]
            result = await safe_send_json(
                mock_websocket, {"type": "chunk", "content": chunk}
            )
            if not result:
                break  # Stop streaming on disconnect
            chunks_sent += 1

        # Should have stopped after detecting disconnect
        assert chunks_sent == 2  # First 2 succeeded, 3rd failed
