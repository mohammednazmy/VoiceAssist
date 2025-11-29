"""
Integration tests for Admin Voice API endpoints

Tests the admin voice API endpoints for session management, analytics,
provider configuration, and feature flags.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from app.core.dependencies import get_current_admin_or_viewer, get_current_admin_user
from app.main import app
from app.models.user import User
from fastapi.testclient import TestClient


def get_mock_admin_user():
    """Return a mock admin user for testing."""
    user = MagicMock(spec=User)
    user.id = "00000000-0000-0000-0000-000000000001"  # Valid UUID format
    user.email = "admin@test.com"
    user.role = "admin"
    user.admin_role = "admin"  # Used by ensure_admin_privileges
    return user


@pytest.fixture
def auth_client():
    """Create test client with mocked admin auth."""
    # Override both admin dependencies
    app.dependency_overrides[get_current_admin_or_viewer] = get_mock_admin_user
    app.dependency_overrides[get_current_admin_user] = get_mock_admin_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    """Create test client without auth overrides."""
    return TestClient(app)


class TestAdminVoiceSessionsAPI:
    """Tests for admin voice session endpoints."""

    def test_list_sessions_requires_auth(self, client):
        """Test list sessions requires authentication."""
        response = client.get("/api/admin/voice/sessions")
        assert response.status_code == 401

    @patch("app.api.admin_voice.get_all_voice_sessions")
    def test_list_sessions_success(self, mock_get_sessions, auth_client):
        """Test listing voice sessions."""
        mock_get_sessions.return_value = {
            "session-1": {
                "user_id": "user-1",
                "user_email": "user1@test.com",
                "type": "voice",
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "messages_count": 5,
            },
            "session-2": {
                "user_id": "user-2",
                "user_email": "user2@test.com",
                "type": "realtime",
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "messages_count": 10,
            },
        }

        response = auth_client.get("/api/admin/voice/sessions")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "sessions" in data["data"]
        assert len(data["data"]["sessions"]) == 2

    @patch("app.api.admin_voice.get_all_voice_sessions")
    def test_list_sessions_filter_by_type(self, mock_get_sessions, auth_client):
        """Test filtering sessions by type."""
        mock_get_sessions.return_value = {
            "session-1": {
                "user_id": "user-1",
                "type": "voice",
            },
        }

        response = auth_client.get("/api/admin/voice/sessions?session_type=voice")

        assert response.status_code == 200


class TestAdminVoiceMetricsAPI:
    """Tests for admin voice metrics endpoints."""

    def test_get_metrics_requires_auth(self, client):
        """Test get metrics requires authentication."""
        response = client.get("/api/admin/voice/metrics")
        assert response.status_code == 401

    @patch("app.api.admin_voice.redis_client")
    def test_get_metrics(self, mock_redis, auth_client):
        """Test getting voice metrics."""
        mock_redis.hgetall.return_value = {}

        response = auth_client.get("/api/admin/voice/metrics")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    @patch("app.api.admin_voice.redis_client")
    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    def test_get_health(self, mock_elevenlabs, mock_realtime, mock_redis, auth_client):
        """Test getting voice health status."""
        mock_redis.ping.return_value = True
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        response = auth_client.get("/api/admin/voice/health")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data


class TestAdminVoiceAnalyticsAPI:
    """Tests for admin voice analytics endpoints."""

    def test_get_analytics_requires_auth(self, client):
        """Test get analytics requires authentication."""
        response = client.get("/api/admin/voice/analytics")
        assert response.status_code == 401

    @patch("app.api.admin_voice.redis_client")
    def test_get_analytics(self, mock_redis, auth_client):
        """Test getting voice analytics."""
        mock_redis.get.return_value = None

        response = auth_client.get("/api/admin/voice/analytics")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    @patch("app.api.admin_voice.redis_client")
    def test_get_analytics_with_period(self, mock_redis, auth_client):
        """Test getting analytics with specific period."""
        mock_redis.get.return_value = None

        response = auth_client.get("/api/admin/voice/analytics?period=7d")

        assert response.status_code == 200

    def test_get_analytics_invalid_period(self, auth_client):
        """Test getting analytics with invalid period."""
        response = auth_client.get("/api/admin/voice/analytics?period=invalid")

        # Should return 400 or 422 for invalid period
        assert response.status_code in [400, 422]

    @patch("app.api.admin_voice.redis_client")
    def test_get_latency_histogram(self, mock_redis, auth_client):
        """Test getting latency histogram."""
        mock_redis.get.return_value = None

        response = auth_client.get("/api/admin/voice/analytics/latency?metric=stt")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    def test_get_latency_invalid_metric(self, auth_client):
        """Test getting latency with invalid metric."""
        response = auth_client.get("/api/admin/voice/analytics/latency?metric=invalid")

        assert response.status_code in [400, 422]

    @patch("app.api.admin_voice.redis_client")
    def test_get_cost_breakdown(self, mock_redis, auth_client):
        """Test getting cost breakdown."""
        mock_redis.get.return_value = None

        response = auth_client.get("/api/admin/voice/analytics/costs")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data


class TestAdminVoiceProvidersAPI:
    """Tests for admin voice provider endpoints."""

    def test_get_providers_requires_auth(self, client):
        """Test get providers requires authentication."""
        response = client.get("/api/admin/voice/providers")
        assert response.status_code == 401

    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    def test_get_providers(self, mock_elevenlabs, mock_realtime, auth_client):
        """Test getting available providers."""
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        response = auth_client.get("/api/admin/voice/providers")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "providers" in data["data"]

    @patch("app.api.admin_voice.elevenlabs_service")
    def test_get_voices(self, mock_elevenlabs, auth_client):
        """Test getting available voices."""
        mock_elevenlabs.is_enabled.return_value = True
        mock_elevenlabs.get_voices.return_value = []

        response = auth_client.get("/api/admin/voice/voices")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "voices" in data["data"]

    def test_get_voices_filter_by_provider(self, auth_client):
        """Test filtering voices by provider."""
        response = auth_client.get("/api/admin/voice/voices?provider=openai")

        assert response.status_code == 200
        data = response.json()
        voices = data["data"]["voices"]
        # All should be OpenAI
        assert all(v["provider"] == "openai" for v in voices)


class TestAdminVoiceConfigAPI:
    """Tests for admin voice config endpoints."""

    def test_get_config_requires_auth(self, client):
        """Test get config requires authentication."""
        response = client.get("/api/admin/voice/config")
        assert response.status_code == 401

    @patch("app.api.admin_voice.get_voice_config")
    def test_get_config(self, mock_get_config, auth_client):
        """Test getting voice config."""
        from app.api.admin_voice import VoiceConfig

        mock_get_config.return_value = VoiceConfig()

        response = auth_client.get("/api/admin/voice/config")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data


class TestAdminVoiceFeatureFlagsAPI:
    """Tests for admin voice feature flags endpoints."""

    def test_get_feature_flags_requires_auth(self, client):
        """Test get feature flags requires authentication."""
        response = client.get("/api/admin/voice/feature-flags")
        assert response.status_code == 401

    @patch("app.api.admin_voice.get_db")
    def test_get_feature_flags(self, mock_get_db, auth_client):
        """Test getting feature flags."""
        # Mock the database session
        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.all.return_value = []
        mock_get_db.return_value = iter([mock_session])

        response = auth_client.get("/api/admin/voice/feature-flags")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "flags" in data["data"]

    @patch("app.api.admin_voice.get_db")
    def test_update_feature_flag(self, mock_get_db, auth_client):
        """Test updating a feature flag."""
        mock_session = MagicMock()
        mock_flag = MagicMock()
        mock_flag.name = "voice.echo_detection_enabled"
        mock_flag.enabled = True
        mock_session.query.return_value.filter.return_value.first.return_value = mock_flag
        mock_get_db.return_value = iter([mock_session])

        response = auth_client.patch(
            "/api/admin/voice/feature-flags/voice.echo_detection_enabled", json={"enabled": False}
        )

        assert response.status_code == 200

    @patch("app.api.admin_voice.get_db")
    def test_update_feature_flag_not_found(self, mock_get_db, auth_client):
        """Test updating a non-existent feature flag."""
        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_get_db.return_value = iter([mock_session])

        response = auth_client.patch("/api/admin/voice/feature-flags/nonexistent.flag", json={"enabled": False})

        assert response.status_code == 404
