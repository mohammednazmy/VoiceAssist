"""
Tests for Voice Service Health Notifier (WebSocket Reliability Phase 3)
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.voice_fallback_orchestrator import ServiceHealth, ServiceType
from app.services.voice_service_health_notifier import VoiceServiceHealthNotifier, VoiceServiceMode


class TestVoiceServiceMode:
    """Tests for VoiceServiceMode enum."""

    def test_mode_values(self):
        """Test mode enum values."""
        assert VoiceServiceMode.FULL_VOICE.value == "full_voice"
        assert VoiceServiceMode.DEGRADED_VOICE.value == "degraded_voice"
        assert VoiceServiceMode.TEXT_ONLY.value == "text_only"
        assert VoiceServiceMode.UNKNOWN.value == "unknown"


class TestVoiceServiceHealthNotifier:
    """Tests for VoiceServiceHealthNotifier."""

    @pytest.fixture
    def notifier(self):
        """Create a health notifier instance."""
        return VoiceServiceHealthNotifier(check_interval_seconds=1.0)

    @pytest.fixture
    def mock_orchestrator(self):
        """Create a mock VoiceFallbackOrchestrator."""
        orchestrator = MagicMock()
        orchestrator._providers = {}
        return orchestrator

    def test_initial_state(self, notifier):
        """Test notifier starts with unknown mode."""
        assert notifier.current_mode == VoiceServiceMode.UNKNOWN
        assert notifier.service_health == {}

    def test_set_orchestrator(self, notifier, mock_orchestrator):
        """Test setting the fallback orchestrator."""
        notifier.set_orchestrator(mock_orchestrator)
        assert notifier._orchestrator == mock_orchestrator

    @pytest.mark.asyncio
    async def test_register_session(self, notifier):
        """Test registering a session for notifications."""
        callback = AsyncMock()
        notifier.register_session("test-session", callback)

        assert "test-session" in notifier._sessions
        assert notifier._sessions["test-session"] == callback

    @pytest.mark.asyncio
    async def test_unregister_session(self, notifier):
        """Test unregistering a session."""
        callback = AsyncMock()
        notifier.register_session("test-session", callback)
        notifier.unregister_session("test-session")

        assert "test-session" not in notifier._sessions

    def test_unregister_nonexistent_session(self, notifier):
        """Test unregistering a session that doesn't exist."""
        # Should not raise
        notifier.unregister_session("nonexistent")

    @pytest.mark.asyncio
    async def test_start_stop(self, notifier):
        """Test starting and stopping the notifier."""
        assert not notifier._running

        await notifier.start()
        assert notifier._running
        assert notifier._check_task is not None

        await notifier.stop()
        assert not notifier._running
        assert notifier._check_task is None

    @pytest.mark.asyncio
    async def test_start_already_running(self, notifier):
        """Test starting when already running does nothing."""
        await notifier.start()
        task1 = notifier._check_task

        await notifier.start()
        task2 = notifier._check_task

        # Should be the same task
        assert task1 == task2

        await notifier.stop()

    @pytest.mark.asyncio
    async def test_calculate_mode_all_healthy(self, notifier):
        """Test mode calculation when all services healthy."""
        health = {
            ServiceType.STT: ServiceHealth.HEALTHY,
            ServiceType.TTS: ServiceHealth.HEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        mode = notifier._calculate_mode(health)
        assert mode == VoiceServiceMode.FULL_VOICE

    @pytest.mark.asyncio
    async def test_calculate_mode_degraded(self, notifier):
        """Test mode calculation when some services degraded."""
        health = {
            ServiceType.STT: ServiceHealth.DEGRADED,
            ServiceType.TTS: ServiceHealth.HEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        mode = notifier._calculate_mode(health)
        assert mode == VoiceServiceMode.DEGRADED_VOICE

    @pytest.mark.asyncio
    async def test_calculate_mode_text_only_stt_down(self, notifier):
        """Test mode calculation when STT is unhealthy."""
        health = {
            ServiceType.STT: ServiceHealth.UNHEALTHY,
            ServiceType.TTS: ServiceHealth.HEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        mode = notifier._calculate_mode(health)
        assert mode == VoiceServiceMode.TEXT_ONLY

    @pytest.mark.asyncio
    async def test_calculate_mode_text_only_tts_down(self, notifier):
        """Test mode calculation when TTS is unhealthy."""
        health = {
            ServiceType.STT: ServiceHealth.HEALTHY,
            ServiceType.TTS: ServiceHealth.UNHEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        mode = notifier._calculate_mode(health)
        assert mode == VoiceServiceMode.TEXT_ONLY

    def test_is_health_improvement(self, notifier):
        """Test health improvement detection."""
        # Improvement
        assert notifier._is_health_improvement(ServiceHealth.UNHEALTHY, ServiceHealth.HEALTHY)
        assert notifier._is_health_improvement(ServiceHealth.DEGRADED, ServiceHealth.HEALTHY)
        assert notifier._is_health_improvement(ServiceHealth.UNHEALTHY, ServiceHealth.DEGRADED)

        # Not improvement
        assert not notifier._is_health_improvement(ServiceHealth.HEALTHY, ServiceHealth.DEGRADED)
        assert not notifier._is_health_improvement(ServiceHealth.HEALTHY, ServiceHealth.UNHEALTHY)
        assert not notifier._is_health_improvement(ServiceHealth.HEALTHY, ServiceHealth.HEALTHY)

    def test_get_health_message(self, notifier):
        """Test generating health change messages."""
        msg = notifier._get_health_message(ServiceType.STT, ServiceHealth.HEALTHY, ServiceHealth.UNHEALTHY)
        assert "Speech recognition" in msg
        assert "unavailable" in msg

        msg = notifier._get_health_message(ServiceType.TTS, ServiceHealth.UNHEALTHY, ServiceHealth.HEALTHY)
        assert "Text-to-speech" in msg
        assert "recovered" in msg

        msg = notifier._get_health_message(ServiceType.LLM, ServiceHealth.HEALTHY, ServiceHealth.DEGRADED)
        assert "AI assistant" in msg
        assert "reduced capacity" in msg

    def test_get_mode_change_reason(self, notifier):
        """Test generating mode change reason."""
        health = {
            ServiceType.STT: ServiceHealth.HEALTHY,
            ServiceType.TTS: ServiceHealth.HEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        reason = notifier._get_mode_change_reason(
            VoiceServiceMode.DEGRADED_VOICE,
            VoiceServiceMode.FULL_VOICE,
            health,
        )
        assert "recovered" in reason

    def test_get_mode_capabilities(self, notifier):
        """Test mode capabilities."""
        caps = notifier._get_mode_capabilities(VoiceServiceMode.FULL_VOICE)
        assert caps["voice_input"] is True
        assert caps["voice_output"] is True
        assert caps["full_quality"] is True

        caps = notifier._get_mode_capabilities(VoiceServiceMode.TEXT_ONLY)
        assert caps["voice_input"] is False
        assert caps["voice_output"] is False
        assert caps["text_input"] is True
        assert caps["text_output"] is True

    def test_get_status_summary(self, notifier):
        """Test getting status summary."""
        summary = notifier.get_status_summary()

        assert "mode" in summary
        assert "services" in summary
        assert "registered_sessions" in summary
        assert "capabilities" in summary

    @pytest.mark.asyncio
    async def test_send_to_session_async_callback(self, notifier):
        """Test sending message to session with async callback."""
        callback = AsyncMock()
        notifier.register_session("test-session", callback)

        message = {"type": "test", "data": "value"}
        await notifier._send_to_session("test-session", message)

        callback.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_to_session_removes_failed(self, notifier):
        """Test that failed sessions are removed."""
        callback = AsyncMock(side_effect=Exception("Send failed"))
        notifier.register_session("test-session", callback)

        await notifier._send_to_session("test-session", {"type": "test"})

        # Session should be removed after failure
        assert "test-session" not in notifier._sessions

    @pytest.mark.asyncio
    async def test_broadcast_to_all_sessions(self, notifier):
        """Test broadcasting to all registered sessions."""
        callback1 = AsyncMock()
        callback2 = AsyncMock()

        notifier.register_session("session1", callback1)
        notifier.register_session("session2", callback2)

        message = {"type": "test.broadcast"}
        await notifier._broadcast(message)

        callback1.assert_called_once_with(message)
        callback2.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_initial_status(self, notifier):
        """Test sending initial status to new session."""
        callback = AsyncMock()
        notifier._current_mode = VoiceServiceMode.FULL_VOICE
        notifier._service_health = {
            ServiceType.STT: ServiceHealth.HEALTHY,
            ServiceType.TTS: ServiceHealth.HEALTHY,
            ServiceType.LLM: ServiceHealth.HEALTHY,
        }

        notifier.register_session("test-session", callback)

        # Wait for async task to complete
        import asyncio

        await asyncio.sleep(0.1)

        # Should have received initial status
        assert callback.called
        call_args = callback.call_args[0][0]
        assert call_args["type"] == "service.status"
        assert call_args["mode"] == "full_voice"
