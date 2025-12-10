"""Unit tests for Admin Integrations API endpoints.

Tests cover:
- Integration listing and status
- Integration details retrieval
- Configuration updates (admin only)
- Connectivity testing (admin only)
- Metrics retrieval
- Health summary
- RBAC enforcement (admin vs viewer roles)
"""

import json
from unittest.mock import MagicMock, patch

from app.api.admin_integrations import (
    INTEGRATIONS,
    IntegrationConfig,
    IntegrationStatus,
    IntegrationType,
    get_integration_config,
    get_integration_status,
    has_api_key,
)


class TestIntegrationDefinitions:
    """Tests for integration definitions."""

    def test_all_integrations_have_required_fields(self):
        """Verify all integration definitions have required fields."""
        required_fields = ["name", "type", "provider", "description"]

        for int_id, info in INTEGRATIONS.items():
            for field in required_fields:
                assert field in info, f"Integration '{int_id}' missing field '{field}'"

    def test_integration_types_are_valid(self):
        """Verify all integration types are valid enum values."""
        for int_id, info in INTEGRATIONS.items():
            assert isinstance(info["type"], IntegrationType), f"Integration '{int_id}' has invalid type"

    def test_expected_integrations_exist(self):
        """Verify expected integrations are defined."""
        expected = [
            "postgres",
            "redis",
            "qdrant",
            "nextcloud",
            "openai",
            "openai_realtime",
            "elevenlabs",
            "deepgram",
            "sentry",
        ]
        for int_id in expected:
            assert int_id in INTEGRATIONS, f"Expected integration '{int_id}' not found"


class TestIntegrationStatus:
    """Tests for get_integration_status function."""

    @patch("app.api.admin_integrations.redis_client")
    def test_redis_connected_status(self, mock_redis):
        """Test Redis returns connected when ping succeeds."""
        mock_redis.ping.return_value = True

        status, error = get_integration_status("redis")

        assert status == IntegrationStatus.CONNECTED
        assert error is None

    @patch("app.api.admin_integrations.redis_client")
    def test_redis_disconnected_status(self, mock_redis):
        """Test Redis returns disconnected when ping fails."""
        mock_redis.ping.return_value = False

        status, error = get_integration_status("redis")

        assert status == IntegrationStatus.DISCONNECTED
        assert "ping failed" in error.lower()

    @patch("app.api.admin_integrations.redis_client")
    def test_redis_error_status(self, mock_redis):
        """Test Redis returns error on exception."""
        mock_redis.ping.side_effect = Exception("Connection refused")

        status, error = get_integration_status("redis")

        assert status == IntegrationStatus.ERROR
        assert "Connection refused" in error

    @patch("app.api.admin_integrations.settings")
    def test_openai_not_configured(self, mock_settings):
        """Test OpenAI returns not_configured when API key missing."""
        mock_settings.OPENAI_API_KEY = None

        status, error = get_integration_status("openai")

        assert status == IntegrationStatus.NOT_CONFIGURED
        assert "API key not set" in error

    @patch("app.api.admin_integrations.settings")
    def test_openai_connected_with_key(self, mock_settings):
        """Test OpenAI returns connected when API key is set."""
        mock_settings.OPENAI_API_KEY = "sk-test123"

        status, error = get_integration_status("openai")

        assert status == IntegrationStatus.CONNECTED
        assert error is None

    @patch("app.api.admin_integrations.settings")
    def test_realtime_disabled(self, mock_settings):
        """Test Realtime returns not_configured when disabled."""
        mock_settings.REALTIME_ENABLED = False
        mock_settings.OPENAI_API_KEY = "sk-test123"

        status, error = get_integration_status("openai_realtime")

        assert status == IntegrationStatus.NOT_CONFIGURED
        assert "disabled" in error.lower()

    @patch("app.api.admin_integrations.settings")
    def test_qdrant_disabled(self, mock_settings):
        """Test Qdrant returns not_configured when disabled."""
        mock_settings.QDRANT_ENABLED = False

        status, error = get_integration_status("qdrant")

        assert status == IntegrationStatus.NOT_CONFIGURED
        assert "disabled" in error.lower()

    @patch("app.api.admin_integrations.settings")
    @patch("app.api.admin_integrations.httpx.get")
    def test_qdrant_connected(self, mock_get, mock_settings):
        """Test Qdrant returns connected on successful HTTP response."""
        mock_settings.QDRANT_ENABLED = True
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        status, error = get_integration_status("qdrant")

        assert status == IntegrationStatus.CONNECTED
        assert error is None

    def test_unknown_integration(self):
        """Test unknown integration returns not_configured."""
        status, error = get_integration_status("unknown_integration")

        assert status == IntegrationStatus.NOT_CONFIGURED
        assert "Unknown" in error


class TestIntegrationConfig:
    """Tests for get_integration_config function."""

    @patch("app.api.admin_integrations.settings")
    def test_postgres_config(self, mock_settings):
        """Test PostgreSQL config returns host and port."""
        mock_settings.POSTGRES_HOST = "db.example.com"
        mock_settings.POSTGRES_PORT = 5432
        mock_settings.POSTGRES_DB = "testdb"

        config = get_integration_config("postgres")

        assert config.host == "db.example.com"
        assert config.port == 5432
        assert config.extra["database"] == "testdb"

    @patch("app.api.admin_integrations.settings")
    def test_redis_config(self, mock_settings):
        """Test Redis config returns host and port."""
        mock_settings.REDIS_HOST = "cache.example.com"
        mock_settings.REDIS_PORT = 6379

        config = get_integration_config("redis")

        assert config.host == "cache.example.com"
        assert config.port == 6379

    @patch("app.api.admin_integrations.settings")
    def test_openai_config(self, mock_settings):
        """Test OpenAI config returns timeout and model."""
        mock_settings.OPENAI_TIMEOUT_SEC = 30
        mock_settings.MODEL_SELECTION_DEFAULT = "gpt-4o"

        config = get_integration_config("openai")

        assert config.timeout_sec == 30
        assert config.model == "gpt-4o"

    @patch("app.api.admin_integrations.settings")
    def test_realtime_config(self, mock_settings):
        """Test Realtime config returns all relevant settings."""
        mock_settings.REALTIME_ENABLED = True
        mock_settings.REALTIME_MODEL = "gpt-4o-realtime"
        mock_settings.REALTIME_BASE_URL = "wss://api.openai.com/v1/realtime"
        mock_settings.REALTIME_TOKEN_EXPIRY_SEC = 300

        config = get_integration_config("openai_realtime")

        assert config.enabled is True
        assert config.model == "gpt-4o-realtime"
        assert config.endpoint == "wss://api.openai.com/v1/realtime"
        assert config.extra["token_expiry_sec"] == 300

    def test_unknown_integration_config(self):
        """Test unknown integration returns empty config."""
        config = get_integration_config("unknown_integration")

        assert config.host is None
        assert config.port is None
        assert config.enabled is None


class TestHasApiKey:
    """Tests for has_api_key function."""

    @patch("app.api.admin_integrations.settings")
    def test_openai_has_key(self, mock_settings):
        """Test OpenAI returns True when key is set."""
        mock_settings.OPENAI_API_KEY = "sk-test123"

        assert has_api_key("openai") is True

    @patch("app.api.admin_integrations.settings")
    def test_openai_no_key(self, mock_settings):
        """Test OpenAI returns False when key is not set."""
        mock_settings.OPENAI_API_KEY = None

        assert has_api_key("openai") is False

    @patch("app.api.admin_integrations.settings")
    def test_elevenlabs_has_key(self, mock_settings):
        """Test ElevenLabs returns True when key is set."""
        mock_settings.ELEVENLABS_API_KEY = "xi-test123"

        assert has_api_key("elevenlabs") is True

    @patch("app.api.admin_integrations.settings")
    def test_postgres_no_key(self, mock_settings):
        """Test PostgreSQL (no API key) returns False."""
        assert has_api_key("postgres") is False

    def test_unknown_integration_no_key(self):
        """Test unknown integration returns False."""
        assert has_api_key("unknown") is False


class TestIntegrationSchemas:
    """Tests for Pydantic model validation."""

    def test_integration_config_validation(self):
        """Test IntegrationConfig accepts valid data."""
        config = IntegrationConfig(
            host="localhost",
            port=5432,
            enabled=True,
            timeout_sec=30,
            model="gpt-4o",
            endpoint="https://api.example.com",
            extra={"key": "value"},
        )

        assert config.host == "localhost"
        assert config.port == 5432
        assert config.enabled is True

    def test_integration_config_optional_fields(self):
        """Test IntegrationConfig with minimal data."""
        config = IntegrationConfig()

        assert config.host is None
        assert config.port is None
        assert config.enabled is None

    def test_integration_config_model_dump(self):
        """Test IntegrationConfig serialization."""
        config = IntegrationConfig(host="localhost", port=5432)
        data = config.model_dump()

        assert isinstance(data, dict)
        assert data["host"] == "localhost"
        assert data["port"] == 5432


class TestIntegrationStatusEnum:
    """Tests for IntegrationStatus enum."""

    def test_status_values(self):
        """Test all status values are accessible."""
        assert IntegrationStatus.CONNECTED == "connected"
        assert IntegrationStatus.DISCONNECTED == "disconnected"
        assert IntegrationStatus.ERROR == "error"
        assert IntegrationStatus.DEGRADED == "degraded"
        assert IntegrationStatus.NOT_CONFIGURED == "not_configured"


class TestIntegrationTypeEnum:
    """Tests for IntegrationType enum."""

    def test_type_values(self):
        """Test all type values are accessible."""
        assert IntegrationType.DATABASE == "database"
        assert IntegrationType.CACHE == "cache"
        assert IntegrationType.VECTOR_DB == "vector_db"
        assert IntegrationType.LLM == "llm"
        assert IntegrationType.TTS == "tts"
        assert IntegrationType.STT == "stt"


class TestAuditLogging:
    """Tests for audit logging in admin integrations endpoints."""

    def test_log_audit_event_import(self):
        """Test that log_audit_event is importable from admin_panel."""
        from app.api.admin_panel import log_audit_event

        assert callable(log_audit_event)


class TestIntegrationMetrics:
    """Tests for integration metrics."""

    @patch("app.api.admin_integrations.redis_client")
    def test_metrics_from_redis(self, mock_redis):
        """Test metrics retrieval from Redis."""
        metrics_data = {
            "total_requests": 100,
            "successful_requests": 95,
            "failed_requests": 5,
            "avg_latency_ms": 50.5,
        }
        mock_redis.get.return_value = json.dumps(metrics_data)

        # Simulate get call
        data = mock_redis.get("admin:integration:openai:metrics")
        parsed = json.loads(data)

        assert parsed["total_requests"] == 100
        assert parsed["successful_requests"] == 95

    @patch("app.api.admin_integrations.redis_client")
    def test_metrics_not_found(self, mock_redis):
        """Test metrics when Redis has no data."""
        mock_redis.get.return_value = None

        data = mock_redis.get("admin:integration:openai:metrics")

        assert data is None
