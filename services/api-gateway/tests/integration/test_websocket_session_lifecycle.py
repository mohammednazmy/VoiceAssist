"""
Integration Tests for WebSocket Session Lifecycle

Tests cover:
- Full session lifecycle (connect → ready → message exchange → disconnect)
- Multiple concurrent sessions
- Session manager operations with real handlers
- Message flow between client and pipeline
- Graceful shutdown scenarios

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

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_websocket_factory():
    """Factory for creating mock WebSockets that don't block."""

    def create():
        ws = AsyncMock()
        ws.accept = AsyncMock()
        ws.close = AsyncMock()
        ws.send_json = AsyncMock()
        # Use CancelledError to prevent receive loop from blocking
        ws.receive_json = AsyncMock(side_effect=asyncio.CancelledError())
        return ws

    return create


@pytest.fixture
def mock_pipeline_session_factory():
    """Factory for creating mock pipeline sessions."""

    def create():
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

    return create


@pytest.fixture
def mock_pipeline_service(mock_pipeline_session_factory):
    """Create a mock pipeline service that creates new sessions."""
    service = AsyncMock()
    service.create_session = AsyncMock(side_effect=lambda **kwargs: mock_pipeline_session_factory())
    return service


# =============================================================================
# Full Session Lifecycle Tests
# =============================================================================


class TestFullSessionLifecycle:
    """Tests for complete session lifecycle."""

    @pytest.mark.asyncio
    async def test_complete_session_lifecycle(self, mock_websocket_factory, mock_pipeline_service):
        """Test complete session from connect to disconnect."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        # Start session
        result = await handler.start()
        assert result is True
        assert handler.connection_state == TTConnectionState.READY

        # Verify session.ready was sent
        ready_msg = ws.send_json.call_args_list[0][0][0]
        assert ready_msg["type"] == "session.ready"
        assert ready_msg["session_id"] == "session-456"

        # Stop session
        metrics = await handler.stop()

        assert handler.connection_state == TTConnectionState.DISCONNECTED
        assert metrics.messages_sent >= 1  # At least the ready message

    @pytest.mark.asyncio
    async def test_session_with_message_exchange(self, mock_websocket_factory, mock_pipeline_service):
        """Test session with message exchange."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        # Start session
        await handler.start()

        # Simulate session init
        await handler._handle_client_message(
            {
                "type": "session.init",
                "conversation_id": "conv-789",
            }
        )

        # Simulate audio input
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": "base64_audio_data",
            }
        )

        # Simulate audio complete
        await handler._handle_client_message(
            {
                "type": "audio.input.complete",
            }
        )

        # Simulate pipeline response
        await handler._handle_pipeline_message(
            PipelineMessage(
                type="transcript.complete",
                data={"text": "Hello world", "confidence": 0.95},
            )
        )

        await handler._handle_pipeline_message(
            PipelineMessage(
                type="response.delta",
                data={"text": "Hi"},
            )
        )

        await handler._handle_pipeline_message(
            PipelineMessage(
                type="response.complete",
                data={"text": "Hi there!"},
            )
        )

        # Stop session
        metrics = await handler.stop()

        # Verify metrics
        assert metrics.user_utterance_count == 1
        assert metrics.ai_response_count == 1
        assert handler._pipeline_session.send_audio_base64.called
        assert handler._pipeline_session.commit_audio.called

    @pytest.mark.asyncio
    async def test_session_with_barge_in(self, mock_websocket_factory, mock_pipeline_service):
        """Test session with barge-in interrupt."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        await handler.start()

        # Simulate audio output (AI speaking)
        await handler._handle_pipeline_message(
            PipelineMessage(
                type="audio.output",
                data={"audio": "audio_data"},
            )
        )

        # Simulate barge-in
        await handler._handle_client_message({"type": "barge_in"})

        metrics = await handler.stop()

        assert metrics.barge_in_count == 1
        assert handler._pipeline_session.barge_in.called


# =============================================================================
# Concurrent Sessions Tests
# =============================================================================


class TestConcurrentSessions:
    """Tests for multiple concurrent sessions."""

    @pytest.mark.asyncio
    async def test_multiple_concurrent_sessions(self, mock_websocket_factory, mock_pipeline_service):
        """Test managing multiple concurrent sessions."""
        manager = ThinkerTalkerSessionManager(max_sessions=10)

        sessions = []
        for i in range(5):
            ws = mock_websocket_factory()
            config = TTSessionConfig(
                user_id=f"user-{i}",
                session_id=f"session-{i}",
            )
            handler = await manager.create_session(ws, config)
            sessions.append(handler)

        assert manager.get_active_session_count() == 5

        # Start all sessions concurrently
        results = await asyncio.gather(*[s.start() for s in sessions])
        assert all(results)

        # All should be ready
        for session in sessions:
            assert session.connection_state == TTConnectionState.READY

        # Stop all sessions
        for i, session in enumerate(sessions):
            await manager.remove_session(f"session-{i}")

        assert manager.get_active_session_count() == 0

    @pytest.mark.asyncio
    async def test_session_isolation(self, mock_websocket_factory, mock_pipeline_service):
        """Test that sessions are isolated from each other."""
        ws1 = mock_websocket_factory()
        ws2 = mock_websocket_factory()

        config1 = TTSessionConfig(
            user_id="user-1",
            session_id="session-1",
        )
        config2 = TTSessionConfig(
            user_id="user-2",
            session_id="session-2",
        )

        handler1 = ThinkerTalkerWebSocketHandler(
            websocket=ws1,
            config=config1,
            pipeline_service=mock_pipeline_service,
        )
        handler2 = ThinkerTalkerWebSocketHandler(
            websocket=ws2,
            config=config2,
            pipeline_service=mock_pipeline_service,
        )

        await handler1.start()
        await handler2.start()

        # Send message to handler1 only
        await handler1._handle_client_message({"type": "ping"})

        # Only ws1 should have received the pong
        ws1.send_json.assert_called()
        pong_calls = [c for c in ws1.send_json.call_args_list if c[0][0].get("type") == "pong"]
        assert len(pong_calls) == 1

        # ws2 should not have pong (only session.ready)
        pong_calls_ws2 = [c for c in ws2.send_json.call_args_list if c[0][0].get("type") == "pong"]
        assert len(pong_calls_ws2) == 0

        await handler1.stop()
        await handler2.stop()


# =============================================================================
# Session Manager Integration Tests
# =============================================================================


class TestSessionManagerIntegration:
    """Integration tests for session manager."""

    @pytest.mark.asyncio
    async def test_session_manager_lifecycle(self, mock_websocket_factory, mock_pipeline_service):
        """Test session manager with full lifecycle."""
        manager = ThinkerTalkerSessionManager(max_sessions=5)

        # Create sessions
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = await manager.create_session(ws, config)
        assert manager.get_active_session_count() == 1

        # Start session
        await handler.start()
        assert handler.connection_state == TTConnectionState.READY

        # Get session
        retrieved = await manager.get_session("session-456")
        assert retrieved == handler

        # Remove session
        await manager.remove_session("session-456")
        assert manager.get_active_session_count() == 0
        assert handler.connection_state == TTConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_session_manager_max_sessions_enforced(self, mock_websocket_factory):
        """Test that max sessions limit is enforced."""
        manager = ThinkerTalkerSessionManager(max_sessions=2)

        # Create max sessions
        for i in range(2):
            ws = mock_websocket_factory()
            config = TTSessionConfig(
                user_id=f"user-{i}",
                session_id=f"session-{i}",
            )
            await manager.create_session(ws, config)

        # Try to create one more
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-overflow",
            session_id="session-overflow",
        )

        with pytest.raises(ValueError, match="Maximum concurrent sessions"):
            await manager.create_session(ws, config)

    @pytest.mark.asyncio
    async def test_session_manager_concurrent_operations(self, mock_websocket_factory):
        """Test concurrent session operations are thread-safe."""
        manager = ThinkerTalkerSessionManager(max_sessions=100)

        async def create_and_remove(index):
            ws = mock_websocket_factory()
            config = TTSessionConfig(
                user_id=f"user-{index}",
                session_id=f"session-{index}",
            )
            await manager.create_session(ws, config)
            await asyncio.sleep(0.01)  # Small delay
            await manager.remove_session(f"session-{index}")
            return index

        # Run many concurrent create/remove operations
        results = await asyncio.gather(*[create_and_remove(i) for i in range(50)])

        assert len(results) == 50
        assert manager.get_active_session_count() == 0


# =============================================================================
# Message Flow Integration Tests
# =============================================================================


class TestMessageFlowIntegration:
    """Tests for message flow between components."""

    @pytest.mark.asyncio
    async def test_audio_to_response_flow(self, mock_websocket_factory, mock_pipeline_service):
        """Test complete flow from audio input to response."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        await handler.start()

        # Simulate audio input
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": "chunk1",
            }
        )
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": "chunk2",
            }
        )
        await handler._handle_client_message(
            {
                "type": "audio.input.complete",
            }
        )

        # Simulate pipeline responses
        pipeline_messages = [
            PipelineMessage(type="transcript.delta", data={"text": "Hel", "is_final": False}),
            PipelineMessage(type="transcript.delta", data={"text": "Hello", "is_final": False}),
            PipelineMessage(type="transcript.complete", data={"text": "Hello world"}),
            PipelineMessage(type="response.delta", data={"text": "Hi"}),
            PipelineMessage(type="response.complete", data={"text": "Hi there!"}),
            PipelineMessage(type="audio.output", data={"audio": "audio_chunk_1"}),
            PipelineMessage(type="audio.output", data={"audio": "audio_chunk_2", "is_final": True}),
        ]

        for msg in pipeline_messages:
            await handler._handle_pipeline_message(msg)

        metrics = await handler.stop()

        # Verify message flow
        assert handler._pipeline_session.send_audio_base64.call_count == 2
        assert handler._pipeline_session.commit_audio.called
        assert metrics.user_utterance_count == 1
        assert metrics.ai_response_count == 1

        # Verify all messages were forwarded to client
        sent_types = [c[0][0]["type"] for c in ws.send_json.call_args_list]
        assert "session.ready" in sent_types
        assert "transcript.delta" in sent_types
        assert "transcript.complete" in sent_types
        assert "response.delta" in sent_types
        assert "response.complete" in sent_types
        assert "audio.output" in sent_types

    @pytest.mark.asyncio
    async def test_voice_mode_toggle_flow(self, mock_websocket_factory, mock_pipeline_service):
        """Test voice mode activation and deactivation flow."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        await handler.start()

        # Deactivate voice mode
        await handler._handle_client_message(
            {
                "type": "voice.mode",
                "mode": "deactivate",
            }
        )

        # Verify deactivation message sent
        sent_types = [c[0][0]["type"] for c in ws.send_json.call_args_list]
        assert "voice.mode.deactivated" in sent_types

        # Reactivate voice mode
        handler._pipeline_session.state = PipelineState.IDLE
        await handler._handle_client_message(
            {
                "type": "voice.mode",
                "mode": "activate",
            }
        )

        sent_types = [c[0][0]["type"] for c in ws.send_json.call_args_list]
        assert "voice.mode.activated" in sent_types

        await handler.stop()


# =============================================================================
# Graceful Shutdown Tests
# =============================================================================


class TestGracefulShutdown:
    """Tests for graceful shutdown scenarios."""

    @pytest.mark.asyncio
    async def test_shutdown_with_pending_messages(self, mock_websocket_factory, mock_pipeline_service):
        """Test shutdown while messages are being processed."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        await handler.start()

        # Queue some messages
        for i in range(5):
            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": f"chunk_{i}",
                }
            )

        # Stop immediately
        await handler.stop()

        assert handler.connection_state == TTConnectionState.DISCONNECTED
        assert handler._pipeline_session.stop.called

    @pytest.mark.asyncio
    async def test_shutdown_cleanup_tasks(self, mock_websocket_factory, mock_pipeline_service):
        """Test that all tasks are cleaned up on shutdown."""
        ws = mock_websocket_factory()
        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )

        handler = ThinkerTalkerWebSocketHandler(
            websocket=ws,
            config=config,
            pipeline_service=mock_pipeline_service,
        )

        await handler.start()

        # Tasks should be created
        assert handler._receive_task is not None
        assert handler._heartbeat_task is not None

        await handler.stop()

        # Verify tasks are cancelled
        assert handler._receive_task.cancelled() or handler._receive_task.done()
        assert handler._heartbeat_task.cancelled() or handler._heartbeat_task.done()
