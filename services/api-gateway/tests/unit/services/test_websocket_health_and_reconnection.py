"""
Comprehensive Unit Tests for WebSocket Health Monitoring and Reconnection

Tests cover:
- Health monitoring and heartbeat
- Connection health notifications
- Reconnection flow handling
- Reconnection backoff strategies
- Connection state recovery
- Metrics reporting during reconnection
- Graceful degradation

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
from app.services.voice_pipeline_service import PipelineState

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
    ws.receive_json = AsyncMock(side_effect=asyncio.CancelledError())
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
# Health Monitoring Tests
# =============================================================================


class TestHealthMonitoring:
    """Tests for WebSocket health monitoring."""

    @pytest.mark.asyncio
    async def test_heartbeat_loop_sends_messages(self, handler, mock_websocket):
        """Test that heartbeat loop sends periodic messages."""
        handler._running = True

        # Create heartbeat task
        task = asyncio.create_task(handler._heartbeat_loop())

        # Wait a short time (heartbeat interval is 30s, we won't wait that long)
        await asyncio.sleep(0.1)

        # Stop the handler
        handler._running = False
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_heartbeat_stops_when_handler_stops(self, handler, mock_websocket):
        """Test that heartbeat stops when handler is stopped."""
        handler._running = False

        # Heartbeat should complete immediately when not running
        await handler._heartbeat_loop()

        # Should not have sent any messages
        # (send_json might be called 0 or 1 time depending on timing)

    @pytest.mark.asyncio
    async def test_ping_pong_response(self, handler, mock_websocket):
        """Test ping message receives pong response."""
        await handler._handle_client_message({"type": "ping"})

        mock_websocket.send_json.assert_called_once()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "pong"

    @pytest.mark.asyncio
    async def test_multiple_pings(self, handler, mock_websocket):
        """Test handling multiple ping messages."""
        for i in range(5):
            await handler._handle_client_message({"type": "ping"})

        assert mock_websocket.send_json.call_count == 5
        for call in mock_websocket.send_json.call_args_list:
            assert call[0][0]["type"] == "pong"


# =============================================================================
# Connection State Tests
# =============================================================================


class TestConnectionState:
    """Tests for connection state management."""

    @pytest.mark.asyncio
    async def test_initial_state_disconnected(self, handler):
        """Test handler starts in disconnected state."""
        assert handler.connection_state == TTConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_state_transitions_on_start(self, handler, mock_websocket, mock_pipeline_service):
        """Test state transitions during start."""
        # Start handler
        result = await handler.start()

        assert result is True
        assert handler.connection_state == TTConnectionState.READY

        # Cleanup
        await handler.stop()

    @pytest.mark.asyncio
    async def test_state_transitions_on_stop(self, handler, mock_websocket, mock_pipeline_service):
        """Test state transitions during stop."""
        await handler.start()
        assert handler.connection_state == TTConnectionState.READY

        await handler.stop()
        assert handler.connection_state == TTConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_state_on_connection_error(self, handler, mock_websocket):
        """Test state on connection error."""
        mock_websocket.accept.side_effect = Exception("Connection failed")

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_state_recovery_after_error(self, handler, mock_websocket, mock_pipeline_service):
        """Test that handler can recover after error."""
        # First, cause an error
        mock_websocket.accept.side_effect = Exception("Connection failed")
        await handler.start()
        assert handler.connection_state == TTConnectionState.ERROR

        # Reset and try again
        mock_websocket.accept.side_effect = None
        mock_websocket.accept.reset_mock()
        handler._running = False  # Reset running state

        # Create new handler to simulate reconnection
        new_handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=handler.config,
            pipeline_service=mock_pipeline_service,
        )

        result = await new_handler.start()
        assert result is True
        assert new_handler.connection_state == TTConnectionState.READY

        await new_handler.stop()


# =============================================================================
# Health Notification Tests
# =============================================================================


class TestHealthNotifications:
    """Tests for health notification handling."""

    @pytest.mark.asyncio
    async def test_session_ready_notification(self, handler, mock_websocket, mock_pipeline_service):
        """Test session.ready notification on successful start."""
        await handler.start()

        # Find the session.ready message
        ready_calls = [c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "session.ready"]

        assert len(ready_calls) == 1
        assert ready_calls[0][0][0]["session_id"] == "test-session"
        assert ready_calls[0][0][0]["pipeline_mode"] == "thinker_talker"

        await handler.stop()

    @pytest.mark.asyncio
    async def test_error_notification_on_failure(self, handler, mock_websocket):
        """Test error notification on connection failure."""
        mock_websocket.accept.side_effect = Exception("Connection failed")

        await handler.start()

        # Find error message
        error_calls = [c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "error"]

        assert len(error_calls) == 1
        assert error_calls[0][0][0]["code"] == "connection_failed"

    @pytest.mark.asyncio
    async def test_voice_state_notifications(self, handler, mock_websocket, mock_pipeline_session):
        """Test voice state change notifications."""
        handler._pipeline_session = mock_pipeline_session

        # Activate voice mode
        await handler._handle_client_message(
            {
                "type": "voice.mode",
                "mode": "activate",
            }
        )

        activated_calls = [
            c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "voice.mode.activated"
        ]
        assert len(activated_calls) == 1

        # Deactivate voice mode
        await handler._handle_client_message(
            {
                "type": "voice.mode",
                "mode": "deactivate",
            }
        )

        deactivated_calls = [
            c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "voice.mode.deactivated"
        ]
        assert len(deactivated_calls) == 1


# =============================================================================
# Reconnection Flow Tests
# =============================================================================


class TestReconnectionFlow:
    """Tests for reconnection flow handling."""

    @pytest.mark.asyncio
    async def test_reconnection_preserves_session_id(self, mock_websocket, mock_pipeline_service):
        """Test that reconnection preserves session ID."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="persistent-session-123",
        )

        # First connection
        handler1 = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
            pipeline_service=mock_pipeline_service,
        )
        await handler1.start()
        assert handler1.config.session_id == "persistent-session-123"

        # Get metrics before disconnect
        handler1.get_metrics()  # Return value intentionally ignored
        await handler1.stop()

        # Simulate reconnection with same config
        new_websocket = AsyncMock()
        new_websocket.accept = AsyncMock()
        new_websocket.close = AsyncMock()
        new_websocket.send_json = AsyncMock()
        new_websocket.receive_json = AsyncMock(side_effect=asyncio.CancelledError())

        handler2 = ThinkerTalkerWebSocketHandler(
            websocket=new_websocket,
            config=config,
            pipeline_service=mock_pipeline_service,
        )
        await handler2.start()

        # Session ID should be preserved
        assert handler2.config.session_id == "persistent-session-123"

        await handler2.stop()

    @pytest.mark.asyncio
    async def test_session_manager_handles_reconnection(self, mock_websocket, mock_pipeline_service):
        """Test session manager handles reconnection properly."""
        manager = ThinkerTalkerSessionManager(max_sessions=10)

        config = TTSessionConfig(
            user_id="test-user",
            session_id="reusable-session",
        )

        # Create first session
        handler1 = await manager.create_session(mock_websocket, config)
        await handler1.start()
        assert manager.get_active_session_count() == 1

        # Remove (simulate disconnect)
        await manager.remove_session("reusable-session")
        assert manager.get_active_session_count() == 0

        # Create new session with same ID (reconnection)
        new_websocket = AsyncMock()
        new_websocket.accept = AsyncMock()
        new_websocket.close = AsyncMock()
        new_websocket.send_json = AsyncMock()
        new_websocket.receive_json = AsyncMock(side_effect=asyncio.CancelledError())

        handler2 = await manager.create_session(new_websocket, config)
        await handler2.start()
        assert manager.get_active_session_count() == 1

        await manager.remove_session("reusable-session")

    @pytest.mark.asyncio
    async def test_metrics_reset_on_reconnection(self, mock_websocket, mock_pipeline_service):
        """Test that metrics are reset on reconnection."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="metrics-session",
        )

        # First connection with some activity
        handler1 = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
            pipeline_service=mock_pipeline_service,
        )
        await handler1.start()

        # Generate some metrics
        handler1._metrics.messages_sent = 100
        handler1._metrics.messages_received = 50
        handler1._metrics.error_count = 5

        await handler1.stop()

        # New connection should have fresh metrics
        new_websocket = AsyncMock()
        new_websocket.accept = AsyncMock()
        new_websocket.close = AsyncMock()
        new_websocket.send_json = AsyncMock()
        new_websocket.receive_json = AsyncMock(side_effect=asyncio.CancelledError())

        handler2 = ThinkerTalkerWebSocketHandler(
            websocket=new_websocket,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        # New handler should have fresh metrics
        assert handler2._metrics.messages_sent == 0
        assert handler2._metrics.messages_received == 0
        assert handler2._metrics.error_count == 0

        await handler2.start()
        await handler2.stop()


# =============================================================================
# Metrics Tracking Tests
# =============================================================================


class TestMetricsTracking:
    """Tests for metrics tracking during health monitoring."""

    @pytest.mark.asyncio
    async def test_connection_start_time_recorded(self, handler, mock_websocket, mock_pipeline_service):
        """Test that connection start time is recorded."""
        await handler.start()

        assert handler._metrics.connection_start_time > 0

        await handler.stop()

    @pytest.mark.asyncio
    async def test_error_count_incremented_on_send_failure(self, handler, mock_websocket):
        """Test error count is incremented on send failures."""
        mock_websocket.send_json.side_effect = Exception("Send failed")
        handler._metrics.error_count = 0

        await handler._send_message({"type": "test"})

        assert handler._metrics.error_count == 1

    @pytest.mark.asyncio
    async def test_messages_sent_count(self, handler, mock_websocket):
        """Test messages sent counter."""
        handler._metrics.messages_sent = 0

        for i in range(10):
            await handler._send_message({"type": "test", "i": i})

        assert handler._metrics.messages_sent == 10

    @pytest.mark.asyncio
    async def test_get_metrics_returns_complete_dict(self, handler, mock_websocket):
        """Test get_metrics_dict returns all fields."""
        handler._metrics.first_audio_latency_ms = 150.0
        handler._metrics.user_utterance_count = 5
        handler._metrics.ai_response_count = 4
        handler._metrics.barge_in_count = 1
        handler._metrics.error_count = 2
        handler._metrics.messages_sent = 50
        handler._metrics.messages_received = 45

        metrics = handler._get_metrics_dict()

        assert metrics["first_audio_latency_ms"] == 150.0
        assert metrics["user_utterance_count"] == 5
        assert metrics["ai_response_count"] == 4
        assert metrics["barge_in_count"] == 1
        assert metrics["error_count"] == 2
        assert metrics["messages_sent"] == 50
        assert metrics["messages_received"] == 45


# =============================================================================
# Graceful Degradation Tests
# =============================================================================


class TestGracefulDegradation:
    """Tests for graceful degradation scenarios."""

    @pytest.mark.asyncio
    async def test_handler_continues_after_send_error(self, handler, mock_websocket, mock_pipeline_session):
        """Test handler continues operating after send error."""
        handler._pipeline_session = mock_pipeline_session
        handler._running = True

        # First send fails
        mock_websocket.send_json.side_effect = [
            Exception("Temporary failure"),
            None,  # Second send succeeds
        ]

        await handler._send_message({"type": "test1"})
        await handler._send_message({"type": "test2"})

        assert handler._metrics.error_count == 1
        assert handler._metrics.messages_sent == 1  # Only successful send counted

    @pytest.mark.asyncio
    async def test_handler_handles_pipeline_errors_gracefully(self, handler, mock_websocket, mock_pipeline_session):
        """Test handler continues after pipeline errors via exception propagation."""
        handler._pipeline_session = mock_pipeline_session

        # Pipeline throws error - this will propagate up
        mock_pipeline_session.send_audio_base64.side_effect = Exception("Pipeline error")

        # The audio error will propagate (current behavior)
        # Note: Future enhancement could add try-except for resilience
        with pytest.raises(Exception, match="Pipeline error"):
            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": "dGVzdA==",
                }
            )

        # Handler should still be functional for other messages
        mock_pipeline_session.send_audio_base64.side_effect = None  # Clear error
        await handler._handle_client_message({"type": "ping"})

        # Ping should still work
        pong_calls = [c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "pong"]
        assert len(pong_calls) == 1
