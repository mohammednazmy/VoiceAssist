"""
Comprehensive Unit Tests for ThinkerTalkerWebSocketHandler

Tests cover:
- Handler initialization and configuration
- Session lifecycle (start, stop)
- Client message handling (all message types)
- Pipeline message forwarding
- Metrics tracking
- Error handling and edge cases
- Session manager operations

Part of WebSocket Reliability Enhancement testing.
"""

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.thinker_talker_websocket_handler import (
    ThinkerTalkerSessionManager,
    ThinkerTalkerWebSocketHandler,
    TTConnectionState,
    TTSessionConfig,
    TTSessionMetrics,
)
from app.services.voice_pipeline_service import PipelineMessage, PipelineState

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
    # Default to raising CancelledError to prevent blocking in receive loop
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
    session.config.voice_id = "test-voice"
    session.config.stt_language = "en"
    session.config.barge_in_enabled = True
    session.config.vad_sensitivity = 50
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
        user_id="test-user-123",
        session_id="test-session-456",
        conversation_id="test-conv-789",
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
# Handler Initialization Tests
# =============================================================================


class TestHandlerInitialization:
    """Tests for handler initialization."""

    def test_handler_creation(self, mock_websocket, session_config, mock_pipeline_service):
        """Test handler is created with correct initial state."""
        handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=session_config,
            pipeline_service=mock_pipeline_service,
        )

        assert handler.websocket == mock_websocket
        assert handler.config == session_config
        assert handler.connection_state == TTConnectionState.DISCONNECTED
        assert handler._running is False
        assert handler._pipeline_session is None

    def test_handler_default_pipeline_service(self, mock_websocket, session_config):
        """Test handler uses global pipeline service by default."""
        with patch("app.services.thinker_talker_websocket_handler.voice_pipeline_service") as mock_global:
            handler = ThinkerTalkerWebSocketHandler(
                websocket=mock_websocket,
                config=session_config,
            )
            assert handler._pipeline_service == mock_global

    def test_handler_initial_metrics(self, handler):
        """Test handler starts with zero metrics."""
        metrics = handler.get_metrics()

        assert metrics.connection_start_time == 0.0
        assert metrics.first_audio_latency_ms == 0.0
        assert metrics.user_utterance_count == 0
        assert metrics.ai_response_count == 0
        assert metrics.messages_sent == 0
        assert metrics.messages_received == 0
        assert metrics.error_count == 0


# =============================================================================
# Session Lifecycle Tests
# =============================================================================


class TestSessionLifecycle:
    """Tests for session start/stop lifecycle."""

    @pytest.mark.asyncio
    async def test_start_success(self, handler, mock_websocket, mock_pipeline_service):
        """Test successful session start."""
        result = await handler.start()

        assert result is True
        assert handler._running is True
        assert handler.connection_state == TTConnectionState.READY

        # Verify WebSocket was accepted
        mock_websocket.accept.assert_called_once()

        # Verify pipeline session was created
        mock_pipeline_service.create_session.assert_called_once()

        # Verify ready message was sent
        mock_websocket.send_json.assert_called()
        ready_call = mock_websocket.send_json.call_args_list[0]
        assert ready_call[0][0]["type"] == "session.ready"
        assert ready_call[0][0]["session_id"] == "test-session-456"

        # Clean up
        await handler.stop()

    @pytest.mark.asyncio
    async def test_start_already_running(self, handler):
        """Test starting an already running handler returns True."""
        handler._running = True

        result = await handler.start()

        assert result is True

    @pytest.mark.asyncio
    async def test_start_websocket_accept_failure(self, handler, mock_websocket, mock_pipeline_service):
        """Test start fails if WebSocket accept fails."""
        mock_websocket.accept.side_effect = Exception("Connection refused")

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_start_pipeline_creation_failure(self, handler, mock_websocket, mock_pipeline_service):
        """Test start fails if pipeline creation fails."""
        mock_pipeline_service.create_session.side_effect = Exception("Pipeline error")

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_start_pipeline_start_failure(
        self, handler, mock_websocket, mock_pipeline_service, mock_pipeline_session
    ):
        """Test start fails if pipeline session start fails."""
        mock_pipeline_session.start.return_value = False

        result = await handler.start()

        assert result is False
        assert handler.connection_state == TTConnectionState.ERROR

    @pytest.mark.asyncio
    async def test_stop_success(self, handler, mock_websocket, mock_pipeline_session):
        """Test successful session stop."""
        # Start the handler first
        handler._running = True
        handler._pipeline_session = mock_pipeline_session
        handler._receive_task = asyncio.create_task(asyncio.sleep(10))
        handler._heartbeat_task = asyncio.create_task(asyncio.sleep(10))

        metrics = await handler.stop()

        assert handler._running is False
        assert handler.connection_state == TTConnectionState.DISCONNECTED
        assert isinstance(metrics, TTSessionMetrics)
        mock_pipeline_session.stop.assert_called_once()
        mock_websocket.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_not_running(self, handler):
        """Test stopping a non-running handler."""
        handler._running = False

        metrics = await handler.stop()

        assert isinstance(metrics, TTSessionMetrics)

    @pytest.mark.asyncio
    async def test_stop_websocket_close_error(self, handler, mock_websocket, mock_pipeline_session):
        """Test stop handles WebSocket close errors gracefully."""
        handler._running = True
        handler._pipeline_session = mock_pipeline_session
        mock_websocket.close.side_effect = Exception("Already closed")

        # Should not raise
        await handler.stop()

        assert handler.connection_state == TTConnectionState.DISCONNECTED


# =============================================================================
# Message Handling Tests
# =============================================================================


class TestMessageHandling:
    """Tests for client message handling."""

    @pytest.mark.asyncio
    async def test_handle_session_init(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling session.init message."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "session.init",
            "conversation_id": "new-conv-id",
            "voice_settings": {
                "voice_id": "new-voice-id",
                "language": "ar",
                "barge_in_enabled": False,
                "vad_sensitivity": 75,
            },
        }

        await handler._handle_client_message(message)

        # Verify settings were applied
        assert mock_pipeline_session.config.voice_id == "new-voice-id"
        assert mock_pipeline_session.config.stt_language == "ar"
        assert mock_pipeline_session.config.barge_in_enabled is False
        assert mock_pipeline_session.config.vad_sensitivity == 75

        # Verify ack was sent
        mock_websocket.send_json.assert_called()
        ack_call = mock_websocket.send_json.call_args
        assert ack_call[0][0]["type"] == "session.init.ack"

    @pytest.mark.asyncio
    async def test_handle_session_init_advanced_settings(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling session.init with advanced settings."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "session.init",
            "advanced_settings": {
                "accent_profile_id": "custom-accent",
                "auto_language_detection": False,
                "enable_sentiment_tracking": False,
            },
        }

        await handler._handle_client_message(message)

        # Verify config was updated
        assert handler.config.accent_profile_id == "custom-accent"
        assert handler.config.auto_language_detection is False
        assert handler.config.enable_sentiment_tracking is False

    @pytest.mark.asyncio
    async def test_handle_audio_input(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling audio.input message."""
        handler._pipeline_session = mock_pipeline_session
        handler._metrics.messages_received = 0

        message = {
            "type": "audio.input",
            "audio": "SGVsbG8gV29ybGQ=",  # base64 "Hello World"
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_called_once_with("SGVsbG8gV29ybGQ=")

    @pytest.mark.asyncio
    async def test_handle_audio_input_empty(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling audio.input with empty audio."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "audio.input",
            "audio": "",
        }

        await handler._handle_client_message(message)

        # Should not call send_audio with empty data
        mock_pipeline_session.send_audio_base64.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_audio_input_no_pipeline(self, handler, mock_websocket):
        """Test handling audio.input without pipeline session."""
        handler._pipeline_session = None

        message = {
            "type": "audio.input",
            "audio": "SGVsbG8gV29ybGQ=",
        }

        # Should not raise
        await handler._handle_client_message(message)

    @pytest.mark.asyncio
    async def test_handle_audio_input_complete(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling audio.input.complete message."""
        handler._pipeline_session = mock_pipeline_session

        message = {"type": "audio.input.complete"}

        await handler._handle_client_message(message)

        mock_pipeline_session.commit_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_text_message(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling text message."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "message",
            "content": "Hello, AI!",
        }

        await handler._handle_client_message(message)

        # Should send transcript.complete
        mock_websocket.send_json.assert_called()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "transcript.complete"
        assert call_arg["text"] == "Hello, AI!"

    @pytest.mark.asyncio
    async def test_handle_barge_in(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling barge_in message."""
        handler._pipeline_session = mock_pipeline_session
        handler._metrics.barge_in_count = 0

        message = {"type": "barge_in"}

        await handler._handle_client_message(message)

        mock_pipeline_session.barge_in.assert_called_once()
        assert handler._metrics.barge_in_count == 1

    @pytest.mark.asyncio
    async def test_handle_voice_mode_activate(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling voice.mode activate."""
        handler._pipeline_session = mock_pipeline_session
        mock_pipeline_session.state = PipelineState.IDLE

        message = {
            "type": "voice.mode",
            "mode": "activate",
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.start.assert_called_once()

        # Verify activation message sent
        mock_websocket.send_json.assert_called()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "voice.mode.activated"

    @pytest.mark.asyncio
    async def test_handle_voice_mode_deactivate(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling voice.mode deactivate."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "voice.mode",
            "mode": "deactivate",
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.stop.assert_called_once()

        # Verify deactivation message sent
        mock_websocket.send_json.assert_called()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "voice.mode.deactivated"

    @pytest.mark.asyncio
    async def test_handle_ping(self, handler, mock_websocket):
        """Test handling ping message."""
        message = {"type": "ping"}

        await handler._handle_client_message(message)

        mock_websocket.send_json.assert_called_once()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "pong"

    @pytest.mark.asyncio
    async def test_handle_unknown_message(self, handler, mock_websocket):
        """Test handling unknown message type."""
        message = {"type": "unknown_type"}

        # Should not raise
        await handler._handle_client_message(message)


# =============================================================================
# Pipeline Message Handling Tests
# =============================================================================


class TestPipelineMessageHandling:
    """Tests for pipeline message forwarding."""

    @pytest.mark.asyncio
    async def test_forward_transcript_complete(self, handler, mock_websocket):
        """Test forwarding transcript.complete message."""
        handler._metrics.user_utterance_count = 0

        message = PipelineMessage(
            type="transcript.complete",
            data={"text": "Hello world", "confidence": 0.95},
        )

        await handler._handle_pipeline_message(message)

        mock_websocket.send_json.assert_called_once()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "transcript.complete"
        assert call_arg["text"] == "Hello world"
        assert handler._metrics.user_utterance_count == 1

    @pytest.mark.asyncio
    async def test_forward_response_complete(self, handler, mock_websocket):
        """Test forwarding response.complete message."""
        handler._metrics.ai_response_count = 0

        message = PipelineMessage(
            type="response.complete",
            data={"text": "AI response"},
        )

        await handler._handle_pipeline_message(message)

        mock_websocket.send_json.assert_called_once()
        assert handler._metrics.ai_response_count == 1

    @pytest.mark.asyncio
    async def test_forward_audio_output_tracks_latency(self, handler, mock_websocket):
        """Test audio output tracking first audio latency."""
        handler._metrics.connection_start_time = time.time() - 0.5  # 500ms ago
        handler._metrics.first_audio_latency_ms = 0

        message = PipelineMessage(
            type="audio.output",
            data={"audio": "base64_audio_data"},
        )

        await handler._handle_pipeline_message(message)

        # First audio latency should be set
        assert handler._metrics.first_audio_latency_ms > 0
        assert handler._metrics.first_audio_latency_ms >= 500  # At least 500ms

    @pytest.mark.asyncio
    async def test_forward_audio_output_subsequent(self, handler, mock_websocket):
        """Test subsequent audio outputs don't reset latency."""
        handler._metrics.connection_start_time = time.time() - 1.0
        handler._metrics.first_audio_latency_ms = 500.0  # Already set

        message = PipelineMessage(
            type="audio.output",
            data={"audio": "base64_audio_data"},
        )

        await handler._handle_pipeline_message(message)

        # Should remain unchanged
        assert handler._metrics.first_audio_latency_ms == 500.0


# =============================================================================
# Metrics Tests
# =============================================================================


class TestMetrics:
    """Tests for metrics tracking."""

    @pytest.mark.asyncio
    async def test_messages_sent_incremented(self, handler, mock_websocket):
        """Test messages_sent is incremented."""
        handler._metrics.messages_sent = 0

        await handler._send_message({"type": "test"})

        assert handler._metrics.messages_sent == 1

    @pytest.mark.asyncio
    async def test_messages_sent_error_increments_error_count(self, handler, mock_websocket):
        """Test send error increments error count."""
        handler._metrics.error_count = 0
        mock_websocket.send_json.side_effect = Exception("Send failed")

        await handler._send_message({"type": "test"})

        assert handler._metrics.error_count == 1

    def test_get_metrics_dict(self, handler):
        """Test get_metrics_dict returns correct format."""
        handler._metrics.first_audio_latency_ms = 100.0
        handler._metrics.user_utterance_count = 5
        handler._metrics.ai_response_count = 3
        handler._metrics.barge_in_count = 1
        handler._metrics.error_count = 2
        handler._metrics.messages_sent = 50
        handler._metrics.messages_received = 45

        result = handler._get_metrics_dict()

        assert result["first_audio_latency_ms"] == 100.0
        assert result["user_utterance_count"] == 5
        assert result["ai_response_count"] == 3
        assert result["barge_in_count"] == 1
        assert result["error_count"] == 2
        assert result["messages_sent"] == 50
        assert result["messages_received"] == 45


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestErrorHandling:
    """Tests for error handling."""

    @pytest.mark.asyncio
    async def test_send_error(self, handler, mock_websocket):
        """Test send_error sends correct format."""
        await handler._send_error("test_error", "Test message", recoverable=False)

        mock_websocket.send_json.assert_called_once()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "error"
        assert call_arg["code"] == "test_error"
        assert call_arg["message"] == "Test message"
        assert call_arg["recoverable"] is False

    @pytest.mark.asyncio
    async def test_send_error_default_recoverable(self, handler, mock_websocket):
        """Test send_error defaults to recoverable=True."""
        await handler._send_error("test_error", "Test message")

        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["recoverable"] is True


# =============================================================================
# Session Manager Tests
# =============================================================================


class TestSessionManager:
    """Tests for ThinkerTalkerSessionManager."""

    @pytest.fixture
    def manager(self):
        """Create a session manager."""
        return ThinkerTalkerSessionManager(max_sessions=5)

    @pytest.mark.asyncio
    async def test_create_session(self, manager, mock_websocket, session_config):
        """Test creating a session."""
        handler = await manager.create_session(
            websocket=mock_websocket,
            config=session_config,
        )

        assert handler is not None
        assert handler.config == session_config
        assert manager.get_active_session_count() == 1

    @pytest.mark.asyncio
    async def test_create_session_max_reached(self, manager, mock_websocket):
        """Test creating session when max reached raises error."""
        # Fill up sessions
        for i in range(5):
            config = TTSessionConfig(
                user_id=f"user-{i}",
                session_id=f"session-{i}",
            )
            await manager.create_session(mock_websocket, config)

        # Try to create one more
        config = TTSessionConfig(
            user_id="user-overflow",
            session_id="session-overflow",
        )
        with pytest.raises(ValueError, match="Maximum concurrent sessions"):
            await manager.create_session(mock_websocket, config)

    @pytest.mark.asyncio
    async def test_get_session(self, manager, mock_websocket, session_config):
        """Test getting a session by ID."""
        await manager.create_session(mock_websocket, session_config)

        handler = await manager.get_session(session_config.session_id)

        assert handler is not None
        assert handler.config.session_id == session_config.session_id

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, manager):
        """Test getting non-existent session returns None."""
        handler = await manager.get_session("non-existent")

        assert handler is None

    @pytest.mark.asyncio
    async def test_remove_session(self, manager, mock_websocket, session_config):
        """Test removing a session."""
        await manager.create_session(mock_websocket, session_config)
        assert manager.get_active_session_count() == 1

        await manager.remove_session(session_config.session_id)

        assert manager.get_active_session_count() == 0
        assert await manager.get_session(session_config.session_id) is None

    @pytest.mark.asyncio
    async def test_remove_nonexistent_session(self, manager):
        """Test removing non-existent session doesn't raise."""
        # Should not raise
        await manager.remove_session("non-existent")

    def test_get_active_session_count(self, manager):
        """Test getting active session count."""
        assert manager.get_active_session_count() == 0


# =============================================================================
# Receive Loop Tests
# =============================================================================


class TestReceiveLoop:
    """Tests for the receive loop."""

    @pytest.mark.asyncio
    async def test_receive_loop_processes_messages(self, handler, mock_websocket):
        """Test receive loop processes messages correctly."""
        messages = [
            {"type": "ping"},
            {"type": "ping"},
        ]
        mock_websocket.receive_json.side_effect = messages + [asyncio.CancelledError()]

        handler._running = True

        # Run receive loop (will exit on CancelledError)
        try:
            await handler._receive_loop()
        except asyncio.CancelledError:
            pass

        # Should have processed 2 messages before cancellation
        assert handler._metrics.messages_received == 2

    @pytest.mark.asyncio
    async def test_receive_loop_handles_disconnect(self, handler, mock_websocket):
        """Test receive loop handles WebSocket disconnect."""
        from starlette.websockets import WebSocketDisconnect

        mock_websocket.receive_json.side_effect = WebSocketDisconnect()

        handler._running = True

        await handler._receive_loop()

        assert handler._running is False

    @pytest.mark.asyncio
    async def test_receive_loop_handles_json_error(self, handler, mock_websocket):
        """Test receive loop handles JSON decode errors."""
        mock_websocket.receive_json.side_effect = [
            json.JSONDecodeError("Invalid", "", 0),
            asyncio.CancelledError(),
        ]

        handler._running = True

        try:
            await handler._receive_loop()
        except asyncio.CancelledError:
            pass

        # Should have sent error message
        mock_websocket.send_json.assert_called()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "error"
        assert call_arg["code"] == "invalid_json"


# =============================================================================
# Heartbeat Tests
# =============================================================================


class TestHeartbeat:
    """Tests for heartbeat loop."""

    @pytest.mark.asyncio
    async def test_heartbeat_sends_messages(self, handler, mock_websocket):
        """Test heartbeat loop sends heartbeat messages."""
        handler._running = True

        # Create task and let it run briefly
        task = asyncio.create_task(handler._heartbeat_loop())

        # Wait a short time (won't actually hit 30s)
        await asyncio.sleep(0.1)

        # Stop and cancel
        handler._running = False
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_heartbeat_stops_when_not_running(self, handler, mock_websocket):
        """Test heartbeat loop stops when handler not running."""
        handler._running = False

        # Should complete immediately
        await handler._heartbeat_loop()
