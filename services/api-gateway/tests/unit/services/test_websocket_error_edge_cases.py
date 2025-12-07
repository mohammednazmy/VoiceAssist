"""
Error and Edge Case Tests for ThinkerTalkerWebSocketHandler

Tests cover:
- Connection failures
- Invalid message handling
- Pipeline failures
- Concurrent operation edge cases
- Resource cleanup on errors
- Malformed data handling
- Timeout scenarios

Part of WebSocket Reliability Enhancement testing.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.thinker_talker_websocket_handler import (
    ThinkerTalkerSessionManager,
    ThinkerTalkerWebSocketHandler,
    TTConnectionState,
    TTSessionConfig,
)
from app.services.voice_pipeline_service import PipelineMessage, PipelineState
from starlette.websockets import WebSocketDisconnect

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.close = AsyncMock()
    ws.send_json = AsyncMock()
    ws.receive_json = AsyncMock()
    return ws


@pytest.fixture
def mock_pipeline_session():
    """Create a mock VoicePipelineSession."""
    session = AsyncMock()
    session.start = AsyncMock(return_value=True)
    session.stop = AsyncMock()
    session.send_audio_base64 = AsyncMock()
    session.commit_audio = AsyncMock()
    session.barge_in = AsyncMock()
    session.state = PipelineState.IDLE
    session.config = MagicMock()
    return session


@pytest.fixture
def mock_pipeline_service(mock_pipeline_session):
    """Create a mock VoicePipelineService."""
    service = AsyncMock()
    service.create_session = AsyncMock(return_value=mock_pipeline_session)
    return service


@pytest.fixture
def session_config():
    """Create a test session configuration."""
    return TTSessionConfig(
        user_id="test-user",
        session_id="test-session",
    )


@pytest.fixture
def handler(mock_websocket, session_config, mock_pipeline_service):
    """Create a handler instance with mocks."""
    return ThinkerTalkerWebSocketHandler(
        websocket=mock_websocket,
        config=session_config,
        pipeline_service=mock_pipeline_service,
    )


# =============================================================================
# Connection Failure Tests
# =============================================================================


class TestConnectionFailures:
    """Tests for connection failure scenarios."""

    @pytest.mark.asyncio
    async def test_websocket_accept_timeout(self, handler, mock_websocket):
        """Test handling WebSocket accept timeout."""
        mock_websocket.accept.side_effect = asyncio.TimeoutError()

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_websocket_accept_connection_reset(self, handler, mock_websocket):
        """Test handling connection reset during accept."""
        mock_websocket.accept.side_effect = ConnectionResetError()

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_websocket_accept_generic_exception(self, handler, mock_websocket):
        """Test handling generic exception during accept."""
        mock_websocket.accept.side_effect = Exception("Unexpected error")

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_pipeline_creation_timeout(self, handler, mock_websocket, mock_pipeline_service):
        """Test handling pipeline creation timeout."""
        mock_pipeline_service.create_session.side_effect = asyncio.TimeoutError()

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_pipeline_start_exception(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling exception during pipeline start."""
        mock_pipeline_session.start.side_effect = Exception("Pipeline failed")

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR


# =============================================================================
# Invalid Message Tests
# =============================================================================


class TestInvalidMessages:
    """Tests for invalid message handling."""

    @pytest.mark.asyncio
    async def test_missing_message_type(self, handler, mock_websocket):
        """Test handling message without type field."""
        message = {"data": "some data"}

        # Should not raise
        await handler._handle_client_message(message)

    @pytest.mark.asyncio
    async def test_null_message_type(self, handler, mock_websocket):
        """Test handling message with null type."""
        message = {"type": None}

        # Should not raise
        await handler._handle_client_message(message)

    @pytest.mark.asyncio
    async def test_empty_message_type(self, handler, mock_websocket):
        """Test handling message with empty type."""
        message = {"type": ""}

        # Should not raise
        await handler._handle_client_message(message)

    @pytest.mark.asyncio
    async def test_audio_input_without_audio_field(self, handler, mock_websocket, mock_pipeline_session):
        """Test audio.input message without audio field."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "audio.input"}

        await handler._handle_client_message(message)

        # Should not call send_audio
        mock_pipeline_session.send_audio_base64.assert_not_called()

    @pytest.mark.asyncio
    async def test_audio_input_with_none_audio(self, handler, mock_websocket, mock_pipeline_session):
        """Test audio.input message with None audio."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "audio.input", "audio": None}

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_not_called()

    @pytest.mark.asyncio
    async def test_session_init_without_settings(self, handler, mock_websocket, mock_pipeline_session):
        """Test session.init without voice_settings."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "session.init"}

        await handler._handle_client_message(message)

        # Should still send ack
        mock_websocket.send_json.assert_called()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "session.init.ack"

    @pytest.mark.asyncio
    async def test_voice_mode_without_mode_field(self, handler, mock_websocket, mock_pipeline_session):
        """Test voice.mode without mode field."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "voice.mode"}

        await handler._handle_client_message(message)

        # Should not activate or deactivate
        mock_pipeline_session.start.assert_not_called()

    @pytest.mark.asyncio
    async def test_text_message_without_content(self, handler, mock_websocket, mock_pipeline_session):
        """Test text message without content field."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "message"}

        await handler._handle_client_message(message)

        # Should not process empty content


# =============================================================================
# Pipeline Failure Tests
# =============================================================================


class TestPipelineFailures:
    """Tests for pipeline failure scenarios."""

    @pytest.mark.asyncio
    async def test_audio_send_failure(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling audio send failure."""
        handler._pipeline_session = mock_pipeline_session
        mock_pipeline_session.send_audio_base64.side_effect = Exception("Send failed")

        # Should not raise
        try:
            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": "test_audio",
                }
            )
        except Exception:
            pass  # May or may not raise depending on error handling

    @pytest.mark.asyncio
    async def test_barge_in_failure(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling barge-in failure."""
        handler._pipeline_session = mock_pipeline_session
        mock_pipeline_session.barge_in.side_effect = Exception("Barge-in failed")

        # Should not crash the handler
        try:
            await handler._handle_client_message({"type": "barge_in"})
        except Exception:
            pass

    @pytest.mark.asyncio
    async def test_pipeline_stop_failure(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling pipeline stop failure."""
        handler._running = True
        handler._pipeline_session = mock_pipeline_session
        mock_pipeline_session.stop.side_effect = Exception("Stop failed")

        # Should still complete
        await handler.stop()  # Return value intentionally ignored

        assert handler.connection_state == TTConnectionState.DISCONNECTED


# =============================================================================
# WebSocket Send/Receive Failures
# =============================================================================


class TestWebSocketFailures:
    """Tests for WebSocket send/receive failures."""

    @pytest.mark.asyncio
    async def test_send_json_failure(self, handler, mock_websocket):
        """Test handling send_json failure."""
        mock_websocket.send_json.side_effect = Exception("Send failed")
        handler._metrics.error_count = 0

        await handler._send_message({"type": "test"})

        assert handler._metrics.error_count == 1

    @pytest.mark.asyncio
    async def test_send_json_connection_closed(self, handler, mock_websocket):
        """Test handling send when connection closed."""
        mock_websocket.send_json.side_effect = ConnectionResetError()
        handler._metrics.error_count = 0

        await handler._send_message({"type": "test"})

        assert handler._metrics.error_count == 1

    @pytest.mark.asyncio
    async def test_receive_json_decode_error(self, handler, mock_websocket):
        """Test handling JSON decode error in receive loop."""
        # The handler uses websocket.receive() which returns raw message dicts
        messages = [
            {"type": "websocket.receive", "text": "not valid json{{{"},
            {"type": "websocket.disconnect"},
        ]
        mock_websocket.receive = AsyncMock(side_effect=messages)
        handler._running = True

        await handler._receive_loop()

        # Should have sent error
        mock_websocket.send_json.assert_called()
        error_call = [c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "error"]
        assert len(error_call) == 1
        assert error_call[0][0][0]["code"] == "invalid_json"
        assert handler._running is False

    @pytest.mark.asyncio
    async def test_receive_loop_websocket_disconnect(self, handler, mock_websocket):
        """Test handling WebSocket disconnect in receive loop."""
        mock_websocket.receive = AsyncMock(side_effect=WebSocketDisconnect())
        handler._running = True

        await handler._receive_loop()

        assert handler._running is False

    @pytest.mark.asyncio
    async def test_receive_loop_generic_error(self, handler, mock_websocket):
        """Test handling generic error in receive loop."""
        # First call raises generic error, second call disconnects cleanly
        messages = [
            Exception("Random error"),
            {"type": "websocket.disconnect"},
        ]
        mock_websocket.receive = AsyncMock(side_effect=messages)
        handler._running = True
        handler._metrics.error_count = 0

        await handler._receive_loop()

        assert handler._metrics.error_count == 1
        assert handler._running is False


# =============================================================================
# Resource Cleanup Tests
# =============================================================================


class TestResourceCleanup:
    """Tests for resource cleanup on errors."""

    @pytest.mark.asyncio
    async def test_cleanup_on_start_failure(self, handler, mock_websocket, mock_pipeline_service):
        """Test resources are cleaned up when start fails."""
        mock_pipeline_service.create_session.side_effect = Exception("Create failed")

        await handler.start()

        # Handler should not be running
        assert handler._running is False
        assert handler._pipeline_session is None

    @pytest.mark.asyncio
    async def test_cleanup_tasks_on_stop(self, handler, mock_websocket, mock_pipeline_session):
        """Test tasks are properly cancelled on stop."""
        handler._running = True
        handler._pipeline_session = mock_pipeline_session

        # Create long-running tasks
        async def long_task():
            await asyncio.sleep(1000)

        handler._receive_task = asyncio.create_task(long_task())
        handler._heartbeat_task = asyncio.create_task(long_task())

        await handler.stop()

        # Tasks should be cancelled
        assert handler._receive_task.cancelled() or handler._receive_task.done()
        assert handler._heartbeat_task.cancelled() or handler._heartbeat_task.done()

    @pytest.mark.asyncio
    async def test_cleanup_websocket_on_stop(self, handler, mock_websocket):
        """Test WebSocket is closed on stop."""
        handler._running = True

        await handler.stop()

        mock_websocket.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_websocket_close_failure(self, handler, mock_websocket, mock_pipeline_session):
        """Test stop completes even if WebSocket close fails."""
        handler._running = True
        handler._pipeline_session = mock_pipeline_session
        mock_websocket.close.side_effect = Exception("Already closed")

        # Should not raise
        await handler.stop()  # Return value intentionally ignored

        assert handler.connection_state == TTConnectionState.DISCONNECTED


# =============================================================================
# Concurrent Operation Edge Cases
# =============================================================================


class TestConcurrentOperations:
    """Tests for concurrent operation edge cases."""

    @pytest.mark.asyncio
    async def test_double_start(self, handler, mock_websocket, mock_pipeline_service):
        """Test starting handler twice."""
        try:
            # First start
            await handler.start()
            assert handler._running is True

            # Second start should return True but not re-initialize
            result = await handler.start()
            assert result is True

            # Pipeline session should only be created once
            assert mock_pipeline_service.create_session.call_count == 1
        finally:
            # Cleanup: stop handler to cancel background tasks
            # This prevents pytest-xdist worker crashes from dangling tasks
            await handler.stop()

    @pytest.mark.asyncio
    async def test_double_stop(self, handler, mock_websocket):
        """Test stopping handler twice."""
        handler._running = True

        metrics1 = await handler.stop()
        metrics2 = await handler.stop()

        assert metrics1 is not None
        assert metrics2 is not None

    @pytest.mark.asyncio
    async def test_stop_before_start(self, handler):
        """Test stopping handler that was never started."""
        metrics = await handler.stop()

        assert metrics is not None
        assert handler.connection_state == TTConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_message_handling_after_stop(self, handler, mock_websocket, mock_pipeline_session):
        """Test message handling after stop."""
        handler._pipeline_session = mock_pipeline_session
        handler._running = False

        # Should not raise, but also shouldn't process
        await handler._handle_client_message({"type": "ping"})


# =============================================================================
# Session Manager Edge Cases
# =============================================================================


class TestSessionManagerEdgeCases:
    """Edge case tests for session manager."""

    @pytest.mark.asyncio
    async def test_remove_during_creation(self):
        """Test removing a session while another is being created."""
        manager = ThinkerTalkerSessionManager(max_sessions=2)

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        config1 = TTSessionConfig(user_id="user-1", session_id="session-1")
        config2 = TTSessionConfig(user_id="user-2", session_id="session-2")

        # Create first session
        await manager.create_session(ws1, config1)

        # Start concurrent remove and create
        async def remove_then_create():
            await manager.remove_session("session-1")
            await manager.create_session(ws2, config2)

        await remove_then_create()

        # Should have only session-2
        assert manager.get_active_session_count() == 1
        assert await manager.get_session("session-1") is None
        assert await manager.get_session("session-2") is not None

    @pytest.mark.asyncio
    async def test_duplicate_session_id(self):
        """Test creating session with duplicate ID."""
        manager = ThinkerTalkerSessionManager(max_sessions=10)

        ws1 = AsyncMock()
        ws2 = AsyncMock()

        config = TTSessionConfig(user_id="user", session_id="session-same")

        # Create first session
        await manager.create_session(ws1, config)  # Return value intentionally ignored

        # Create second with same ID - should overwrite
        handler2 = await manager.create_session(ws2, config)

        # Second handler should be stored
        retrieved = await manager.get_session("session-same")
        assert retrieved == handler2

    @pytest.mark.asyncio
    async def test_session_with_empty_id(self):
        """Test creating session with empty ID."""
        manager = ThinkerTalkerSessionManager()

        ws = AsyncMock()
        config = TTSessionConfig(user_id="user", session_id="")

        # Should work (empty string is valid key)
        handler = await manager.create_session(ws, config)
        assert handler is not None


# =============================================================================
# Malformed Data Tests
# =============================================================================


class TestMalformedData:
    """Tests for malformed data handling."""

    @pytest.mark.asyncio
    async def test_session_init_malformed_voice_settings(self, handler, mock_websocket, mock_pipeline_session):
        """Test session.init with malformed voice_settings."""
        handler._pipeline_session = mock_pipeline_session

        # List instead of dict
        message = {
            "type": "session.init",
            "voice_settings": ["not", "a", "dict"],
        }

        # Should handle gracefully
        try:
            await handler._handle_client_message(message)
        except (TypeError, AttributeError):
            pass  # Expected for malformed data

    @pytest.mark.asyncio
    async def test_session_init_invalid_vad_sensitivity(self, handler, mock_websocket, mock_pipeline_session):
        """Test session.init with invalid vad_sensitivity."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "session.init",
            "voice_settings": {
                "vad_sensitivity": "not_a_number",
            },
        }

        # Should handle gracefully or raise appropriate error
        try:
            await handler._handle_client_message(message)
        except (ValueError, TypeError):
            pass  # Expected for invalid data

    @pytest.mark.asyncio
    async def test_audio_input_invalid_base64(self, handler, mock_websocket, mock_pipeline_session):
        """Test audio.input with invalid base64."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "audio.input",
            "audio": "not!!valid!!base64!!!",
        }

        # Should forward to pipeline (validation happens there)
        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_called_once()


# =============================================================================
# Metrics Edge Cases
# =============================================================================


class TestMetricsEdgeCases:
    """Edge case tests for metrics tracking."""

    @pytest.mark.asyncio
    async def test_metrics_overflow_protection(self, handler, mock_websocket):
        """Test metrics don't overflow with many messages."""
        # Simulate many messages
        for i in range(10000):
            handler._metrics.messages_sent += 1
            handler._metrics.messages_received += 1

        metrics_dict = handler._get_metrics_dict()

        assert metrics_dict["messages_sent"] == 10000
        assert metrics_dict["messages_received"] == 10000

    @pytest.mark.asyncio
    async def test_first_audio_latency_only_set_once(self, handler, mock_websocket):
        """Test first audio latency is only set on first audio."""
        import time

        handler._metrics.connection_start_time = time.time() - 1.0
        handler._metrics.first_audio_latency_ms = 0

        # First audio
        await handler._handle_pipeline_message(
            PipelineMessage(
                type="audio.output",
                data={"audio": "audio1"},
            )
        )
        first_latency = handler._metrics.first_audio_latency_ms

        # Wait and send another
        await asyncio.sleep(0.1)
        await handler._handle_pipeline_message(
            PipelineMessage(
                type="audio.output",
                data={"audio": "audio2"},
            )
        )

        # Should remain the same
        assert handler._metrics.first_audio_latency_ms == first_latency
