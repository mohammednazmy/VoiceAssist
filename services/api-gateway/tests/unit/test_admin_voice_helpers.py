"""
Unit tests for Admin Voice API helper functions

Tests the helper functions in admin_voice.py without requiring the full app.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

import json
from unittest.mock import patch


class TestVoiceSessionTracking:
    """Tests for voice session tracking helpers."""

    @patch("app.api.admin_voice.redis_client")
    def test_register_voice_session(self, mock_redis):
        """Test registering a voice session."""
        from app.api.admin_voice import register_voice_session

        register_voice_session(
            session_id="test-session-123",
            user_id="user-456",
            user_email="user@test.com",
            session_type="voice",
            conversation_id="conv-789",
            voice="alloy",
            language="en",
        )

        # Should call hset with session data
        mock_redis.hset.assert_called_once()
        call_args = mock_redis.hset.call_args
        assert call_args[0][0] == "voiceassist:voice:sessions"
        assert call_args[0][1] == "test-session-123"

        # Verify session data
        session_data = json.loads(call_args[0][2])
        assert session_data["user_id"] == "user-456"
        assert session_data["user_email"] == "user@test.com"
        assert session_data["type"] == "voice"
        assert session_data["voice"] == "alloy"

    @patch("app.api.admin_voice.redis_client")
    def test_unregister_voice_session(self, mock_redis):
        """Test unregistering a voice session."""
        from app.api.admin_voice import unregister_voice_session

        unregister_voice_session("test-session-123")

        mock_redis.hdel.assert_called_once_with("voiceassist:voice:sessions", "test-session-123")

    @patch("app.api.admin_voice.redis_client")
    def test_get_all_voice_sessions(self, mock_redis):
        """Test getting all voice sessions."""
        from app.api.admin_voice import get_all_voice_sessions

        mock_redis.hgetall.return_value = {
            b"session-1": b'{"user_id": "user-1", "type": "voice"}',
            b"session-2": b'{"user_id": "user-2", "type": "realtime"}',
        }

        sessions = get_all_voice_sessions()

        assert len(sessions) == 2
        assert "session-1" in sessions
        assert sessions["session-1"]["user_id"] == "user-1"
        assert sessions["session-2"]["type"] == "realtime"

    @patch("app.api.admin_voice.redis_client")
    def test_get_all_voice_sessions_empty(self, mock_redis):
        """Test getting sessions when none exist."""
        from app.api.admin_voice import get_all_voice_sessions

        mock_redis.hgetall.return_value = {}

        sessions = get_all_voice_sessions()

        assert sessions == {}

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_session(self, mock_redis):
        """Test getting a specific session."""
        from app.api.admin_voice import get_voice_session

        mock_redis.hget.return_value = b'{"user_id": "user-1", "type": "voice"}'

        session = get_voice_session("test-session")

        assert session is not None
        assert session["user_id"] == "user-1"
        assert session["type"] == "voice"

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_session_not_found(self, mock_redis):
        """Test getting non-existent session."""
        from app.api.admin_voice import get_voice_session

        mock_redis.hget.return_value = None

        session = get_voice_session("nonexistent")

        assert session is None

    @patch("app.api.admin_voice.redis_client")
    @patch("app.api.admin_voice.get_voice_session")
    def test_update_voice_session_activity(self, mock_get_session, mock_redis):
        """Test updating session activity."""
        from app.api.admin_voice import update_voice_session_activity

        mock_get_session.return_value = {
            "user_id": "user-1",
            "messages_count": 5,
        }

        update_voice_session_activity("test-session")

        # Should update the session
        mock_redis.hset.assert_called_once()
        call_args = mock_redis.hset.call_args
        session_data = json.loads(call_args[0][2])
        assert session_data["messages_count"] == 6
        assert "last_activity" in session_data


class TestVoiceConfigHelpers:
    """Tests for voice config helpers."""

    @patch("app.api.admin_voice.redis_client")
    def test_get_voice_config_from_cache(self, mock_redis):
        """Test getting config from Redis cache."""
        from app.api.admin_voice import get_voice_config

        mock_redis.get.return_value = json.dumps(
            {
                "default_voice": "echo",
                "default_language": "es",
                "vad_enabled": False,
                "vad_threshold": 0.7,
                "max_session_duration_sec": 1800,
                "stt_provider": "openai",
                "tts_provider": "elevenlabs",
                "realtime_enabled": True,
            }
        )

        config = get_voice_config()

        assert config.default_voice == "echo"
        assert config.default_language == "es"
        assert config.vad_enabled is False
        assert config.tts_provider == "elevenlabs"

    @patch("app.api.admin_voice.redis_client")
    @patch("app.api.admin_voice.settings")
    def test_get_voice_config_defaults(self, mock_settings, mock_redis):
        """Test getting default config when no cache."""
        from app.api.admin_voice import get_voice_config

        mock_redis.get.return_value = None
        mock_settings.TTS_VOICE = "nova"
        mock_settings.STT_PROVIDER = "openai"
        mock_settings.TTS_PROVIDER = "openai"
        mock_settings.REALTIME_ENABLED = True

        config = get_voice_config()

        assert config.default_voice == "nova"
        assert config.vad_enabled is True  # Default

    @patch("app.api.admin_voice.redis_client")
    def test_save_voice_config(self, mock_redis):
        """Test saving voice config."""
        from app.api.admin_voice import VoiceConfig, save_voice_config

        config = VoiceConfig(
            default_voice="shimmer",
            default_language="fr",
            vad_enabled=True,
            vad_threshold=0.6,
            max_session_duration_sec=7200,
            stt_provider="openai",
            tts_provider="openai",
            realtime_enabled=False,
        )

        save_voice_config(config)

        mock_redis.set.assert_called_once()
        call_args = mock_redis.set.call_args
        saved_data = json.loads(call_args[0][1])
        assert saved_data["default_voice"] == "shimmer"
        assert saved_data["default_language"] == "fr"


class TestVoiceFeatureFlagDefinitions:
    """Tests for voice feature flag definitions."""

    def test_voice_feature_flags_defined(self):
        """Test that all voice feature flags are defined."""
        from app.api.admin_voice import VOICE_FEATURE_FLAG_DEFINITIONS, VOICE_FEATURE_FLAGS

        expected_flags = [
            "voice.echo_detection_enabled",
            "voice.adaptive_vad_enabled",
            "voice.elevenlabs_enabled",
            "voice.streaming_tts_enabled",
            "voice.barge_in_enabled",
            "voice.realtime_api_enabled",
        ]

        for flag in expected_flags:
            assert flag in VOICE_FEATURE_FLAGS
            assert flag in VOICE_FEATURE_FLAG_DEFINITIONS
            assert "description" in VOICE_FEATURE_FLAG_DEFINITIONS[flag]
            assert "default" in VOICE_FEATURE_FLAG_DEFINITIONS[flag]

    def test_feature_flag_definitions_have_defaults(self):
        """Test that all feature flag definitions have boolean defaults."""
        from app.api.admin_voice import VOICE_FEATURE_FLAG_DEFINITIONS

        for flag_name, definition in VOICE_FEATURE_FLAG_DEFINITIONS.items():
            assert isinstance(definition["default"], bool), f"Flag {flag_name} should have boolean default"


class TestPydanticModels:
    """Tests for Pydantic models."""

    def test_voice_session_info(self):
        """Test VoiceSessionInfo model."""
        from app.api.admin_voice import VoiceSessionInfo

        session = VoiceSessionInfo(
            session_id="test-123",
            user_id="user-456",
            user_email="user@test.com",
            connected_at="2024-01-01T00:00:00Z",
            session_type="voice",
            messages_count=10,
        )

        assert session.session_id == "test-123"
        assert session.user_id == "user-456"
        assert session.session_type == "voice"
        assert session.messages_count == 10

    def test_voice_config_model(self):
        """Test VoiceConfig model."""
        from app.api.admin_voice import VoiceConfig

        config = VoiceConfig()

        # Check defaults
        assert config.default_voice == "alloy"
        assert config.default_language == "en"
        assert config.vad_enabled is True
        assert config.vad_threshold == 0.5
        assert config.max_session_duration_sec == 3600

    def test_voice_config_update_model(self):
        """Test VoiceConfigUpdate model."""
        from app.api.admin_voice import VoiceConfigUpdate

        # Test with partial update
        update = VoiceConfigUpdate(
            default_voice="echo",
            vad_threshold=0.8,
        )

        assert update.default_voice == "echo"
        assert update.vad_threshold == 0.8
        assert update.default_language is None  # Not set

    def test_voice_analytics_model(self):
        """Test VoiceAnalytics model."""
        from app.api.admin_voice import VoiceAnalytics

        analytics = VoiceAnalytics(
            period="24h",
            total_sessions=100,
            unique_users=50,
            error_rate=0.02,
        )

        assert analytics.period == "24h"
        assert analytics.total_sessions == 100
        assert analytics.error_rate == 0.02

    def test_latency_histogram_model(self):
        """Test LatencyHistogram model."""
        from app.api.admin_voice import LatencyHistogram

        histogram = LatencyHistogram(
            metric="stt",
            period="24h",
            p50_ms=150.0,
            p95_ms=350.0,
            p99_ms=500.0,
        )

        assert histogram.metric == "stt"
        assert histogram.p50_ms == 150.0
        assert histogram.p95_ms == 350.0

    def test_provider_test_request_model(self):
        """Test ProviderTestRequest model."""
        from app.api.admin_voice import ProviderTestRequest

        request = ProviderTestRequest(
            provider="elevenlabs",
            voice_id="voice-123",
            test_text="Custom test text",
        )

        assert request.provider == "elevenlabs"
        assert request.voice_id == "voice-123"
        assert request.test_text == "Custom test text"

    def test_voice_feature_flag_model(self):
        """Test VoiceFeatureFlag model."""
        from app.api.admin_voice import VoiceFeatureFlag

        flag = VoiceFeatureFlag(
            name="voice.echo_detection_enabled",
            description="Enable echo detection",
            enabled=True,
            rollout_percentage=100,
        )

        assert flag.name == "voice.echo_detection_enabled"
        assert flag.enabled is True
        assert flag.rollout_percentage == 100

    def test_voice_feature_flag_update_model(self):
        """Test VoiceFeatureFlagUpdate model."""
        from app.api.admin_voice import VoiceFeatureFlagUpdate

        update = VoiceFeatureFlagUpdate(enabled=False)

        assert update.enabled is False
        assert update.rollout_percentage is None
