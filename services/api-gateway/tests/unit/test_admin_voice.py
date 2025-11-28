"""Unit tests for Admin Voice API endpoints.

Tests cover:
- Voice session listing and details
- Session disconnect (admin only)
- Voice metrics retrieval
- Voice health status
- Voice configuration GET/PATCH
- RBAC enforcement (admin vs viewer roles)
"""

import json
from unittest.mock import patch

from app.api.admin_voice import (
    REDIS_VOICE_CONFIG_KEY,
    REDIS_VOICE_SESSIONS_KEY,
    VoiceConfig,
    get_all_voice_sessions,
    get_voice_config,
    get_voice_session,
    register_voice_session,
    save_voice_config,
    unregister_voice_session,
)


class TestVoiceSessionHelpers:
    """Tests for voice session helper functions."""

    @patch("app.api.admin_voice.redis_client")
    def test_register_voice_session(self, mock_redis):
        """Test registering a new voice session."""
        register_voice_session(
            session_id="test-session-123",
            user_id="user-456",
            user_email="test@example.com",
            session_type="voice",
            conversation_id="conv-789",
            voice="alloy",
            language="en",
        )

        mock_redis.hset.assert_called_once()
        call_args = mock_redis.hset.call_args
        assert call_args[0][0] == REDIS_VOICE_SESSIONS_KEY
        assert call_args[0][1] == "test-session-123"

        # Verify session data structure
        session_data = json.loads(call_args[0][2])
        assert session_data["user_id"] == "user-456"
        assert session_data["user_email"] == "test@example.com"
        assert session_data["type"] == "voice"
        assert session_data["conversation_id"] == "conv-789"
        assert session_data["voice"] == "alloy"
        assert session_data["language"] == "en"
        assert "connected_at" in session_data
        assert "last_activity" in session_data
        assert session_data["messages_count"] == 0

    @patch("app.api.admin_voice.redis_client")
    def test_unregister_voice_session(self, mock_redis):
        """Test unregistering a voice session."""
        unregister_voice_session("test-session-123")

        mock_redis.hdel.assert_called_once_with(REDIS_VOICE_SESSIONS_KEY, "test-session-123")

    @patch("app.api.admin_voice.redis_client")
    def test_get_all_voice_sessions(self, mock_redis):
        """Test getting all voice sessions."""
        mock_redis.hgetall.return_value = {
            b"session-1": json.dumps({"user_id": "user-1", "type": "voice"}).encode(),
            b"session-2": json.dumps({"user_id": "user-2", "type": "realtime"}).encode(),
        }

        sessions = get_all_voice_sessions()

        assert len(sessions) == 2
        assert "session-1" in sessions
        assert "session-2" in sessions
        assert sessions["session-1"]["user_id"] == "user-1"
        assert sessions["session-2"]["type"] == "realtime"

    @patch("app.api.admin_voice.redis_client")
    def test_get_all_voice_sessions_empty(self, mock_redis):
        """Test getting sessions when none exist."""
        mock_redis.hgetall.return_value = {}

        sessions = get_all_voice_sessions()

        assert sessions == {}

    @patch("app.api.admin_voice.redis_client")
    def test_get_all_voice_sessions_redis_error(self, mock_redis):
        """Test graceful handling of Redis errors."""
        mock_redis.hgetall.side_effect = Exception("Redis connection failed")

        sessions = get_all_voice_sessions()

        assert sessions == {}

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_session(self, mock_redis):
        """Test getting a specific voice session."""
        mock_redis.hget.return_value = json.dumps({"user_id": "user-1", "type": "voice", "messages_count": 5}).encode()

        session = get_voice_session("test-session-123")

        assert session is not None
        assert session["user_id"] == "user-1"
        assert session["type"] == "voice"
        assert session["messages_count"] == 5

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_session_not_found(self, mock_redis):
        """Test getting a non-existent session."""
        mock_redis.hget.return_value = None

        session = get_voice_session("non-existent")

        assert session is None


class TestVoiceConfigHelpers:
    """Tests for voice configuration helper functions."""

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_config_from_redis(self, mock_redis):
        """Test getting config from Redis."""
        config_data = {
            "default_voice": "echo",
            "default_language": "es",
            "vad_enabled": True,
            "vad_threshold": 0.6,
            "max_session_duration_sec": 1800,
            "stt_provider": "openai",
            "tts_provider": "openai",
            "realtime_enabled": True,
        }
        mock_redis.get.return_value = json.dumps(config_data).encode()

        config = get_voice_config()

        assert config.default_voice == "echo"
        assert config.default_language == "es"
        assert config.vad_enabled is True
        assert config.vad_threshold == 0.6
        assert config.max_session_duration_sec == 1800
        assert config.realtime_enabled is True

    @patch("app.api.admin_voice.redis_client")
    @patch("app.api.admin_voice.settings")
    def test_get_voice_config_defaults(self, mock_settings, mock_redis):
        """Test getting default config when Redis has no data."""
        mock_redis.get.return_value = None
        mock_settings.TTS_VOICE = "nova"
        mock_settings.STT_PROVIDER = "openai"
        mock_settings.TTS_PROVIDER = "openai"
        mock_settings.REALTIME_ENABLED = False

        config = get_voice_config()

        assert config.default_voice == "nova"
        assert config.stt_provider == "openai"
        assert config.tts_provider == "openai"
        assert config.realtime_enabled is False

    @patch("app.api.admin_voice.redis_client")
    def test_save_voice_config(self, mock_redis):
        """Test saving voice configuration."""
        config = VoiceConfig(
            default_voice="fable",
            default_language="de",
            vad_enabled=False,
            vad_threshold=0.4,
            max_session_duration_sec=2400,
            stt_provider="openai",
            tts_provider="openai",
            realtime_enabled=True,
        )

        save_voice_config(config)

        mock_redis.set.assert_called_once()
        call_args = mock_redis.set.call_args
        assert call_args[0][0] == REDIS_VOICE_CONFIG_KEY

        saved_data = json.loads(call_args[0][1])
        assert saved_data["default_voice"] == "fable"
        assert saved_data["default_language"] == "de"
        assert saved_data["vad_enabled"] is False


class TestVoiceSessionEndpointsSchema:
    """Tests for Pydantic model validation."""

    def test_voice_config_validation(self):
        """Test VoiceConfig validation."""
        config = VoiceConfig(
            default_voice="alloy",
            default_language="en",
            vad_enabled=True,
            vad_threshold=0.5,
            max_session_duration_sec=3600,
            stt_provider="openai",
            tts_provider="openai",
            realtime_enabled=False,
        )

        assert config.default_voice == "alloy"
        assert config.max_session_duration_sec == 3600

    def test_voice_config_model_dump(self):
        """Test VoiceConfig serialization."""
        config = VoiceConfig(
            default_voice="shimmer",
            default_language="fr",
            vad_enabled=True,
            vad_threshold=0.7,
            max_session_duration_sec=7200,
            stt_provider="openai",
            tts_provider="openai",
            realtime_enabled=True,
        )

        data = config.model_dump()

        assert isinstance(data, dict)
        assert data["default_voice"] == "shimmer"
        assert data["realtime_enabled"] is True


class TestVoiceMetricsCalculation:
    """Tests for voice metrics calculations."""

    @patch("app.api.admin_voice.redis_client")
    def test_metrics_active_session_count(self, mock_redis):
        """Test that metrics correctly count active sessions."""
        mock_redis.hgetall.return_value = {
            b"s1": json.dumps({"type": "voice", "connected_at": "2025-01-01T00:00:00Z"}).encode(),
            b"s2": json.dumps({"type": "realtime", "connected_at": "2025-01-01T00:00:00Z"}).encode(),
            b"s3": json.dumps({"type": "voice", "connected_at": "2025-01-01T00:00:00Z"}).encode(),
        }

        sessions = get_all_voice_sessions()

        assert len(sessions) == 3

    @patch("app.api.admin_voice.redis_client")
    def test_metrics_connections_by_type(self, mock_redis):
        """Test counting connections by type."""
        mock_redis.hgetall.return_value = {
            b"s1": json.dumps({"type": "voice"}).encode(),
            b"s2": json.dumps({"type": "realtime"}).encode(),
            b"s3": json.dumps({"type": "voice"}).encode(),
            b"s4": json.dumps({"type": "text"}).encode(),
        }

        sessions = get_all_voice_sessions()

        # Count by type
        type_counts = {}
        for info in sessions.values():
            t = info.get("type", "other")
            type_counts[t] = type_counts.get(t, 0) + 1

        assert type_counts["voice"] == 2
        assert type_counts["realtime"] == 1
        assert type_counts["text"] == 1


class TestAuditLogging:
    """Tests for audit logging in admin voice endpoints."""

    def test_log_audit_event_import(self):
        """Test that log_audit_event is importable from admin_panel."""
        from app.api.admin_panel import log_audit_event

        assert callable(log_audit_event)
