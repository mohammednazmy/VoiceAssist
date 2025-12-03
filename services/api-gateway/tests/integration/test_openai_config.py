"""Tests for OpenAI API key configuration and connectivity.

These tests verify that the OpenAI integration is properly configured.

Test Categories:
1. Unit tests (no external calls) - run always
2. Live integration tests - only run when LIVE_OPENAI_TESTS=1 or LIVE_REALTIME_TESTS=1

Usage:
    # Run unit tests only (default, CI-safe)
    pytest tests/integration/test_openai_config.py -v

    # Run live OpenAI tests (requires valid API key)
    LIVE_OPENAI_TESTS=1 pytest tests/integration/test_openai_config.py -v -m live_openai

    # Run live Realtime tests (requires valid API key)
    LIVE_REALTIME_TESTS=1 pytest tests/integration/test_openai_config.py -v

    # Run all tests including live
    LIVE_OPENAI_TESTS=1 LIVE_REALTIME_TESTS=1 pytest tests/integration/test_openai_config.py -v
"""

import os
import time
from unittest.mock import patch

import pytest

# Markers for test categorization
pytestmark = [pytest.mark.integration]

# Check if live tests should run
LIVE_OPENAI_TESTS = os.getenv("LIVE_OPENAI_TESTS", "").lower() in ("1", "true", "yes")
LIVE_REALTIME_TESTS = os.getenv("LIVE_REALTIME_TESTS", "").lower() in (
    "1",
    "true",
    "yes",
)


class TestOpenAIConfiguration:
    """Test OpenAI configuration loading."""

    def test_settings_loads_openai_api_key(self):
        """Test that settings loads OPENAI_API_KEY from environment."""
        from app.core.config import settings

        # Key should be present (set in .env)
        assert hasattr(settings, "OPENAI_API_KEY")
        # We don't assert the actual value to avoid leaking secrets

    def test_settings_loads_openai_timeout(self):
        """Test that settings loads OPENAI_TIMEOUT_SEC."""
        from app.core.config import settings

        assert hasattr(settings, "OPENAI_TIMEOUT_SEC")
        assert isinstance(settings.OPENAI_TIMEOUT_SEC, int)
        assert settings.OPENAI_TIMEOUT_SEC > 0

    def test_settings_loads_realtime_config(self):
        """Test that settings loads Realtime API config."""
        from app.core.config import settings

        assert hasattr(settings, "REALTIME_ENABLED")
        assert hasattr(settings, "REALTIME_MODEL")
        assert hasattr(settings, "REALTIME_BASE_URL")
        assert hasattr(settings, "REALTIME_TOKEN_EXPIRY_SEC")

        # Validate types and sensible defaults
        assert isinstance(settings.REALTIME_ENABLED, bool)
        assert settings.REALTIME_MODEL.startswith("gpt-")
        assert settings.REALTIME_BASE_URL.startswith("wss://")
        assert settings.REALTIME_TOKEN_EXPIRY_SEC > 0

    def test_openai_key_format_validation(self):
        """Test that the OpenAI key has valid format (if set)."""
        from app.core.config import settings

        key = settings.OPENAI_API_KEY
        if key:
            # Should start with sk-
            assert key.startswith("sk-"), "OpenAI key should start with 'sk-'"
            # Should be reasonably long
            assert len(key) >= 40, "OpenAI key seems too short"


class TestLLMClientConfiguration:
    """Test LLM client initialization with settings."""

    def test_llm_client_accepts_api_key(self):
        """Test LLMClient initializes with API key."""
        from app.services.llm_client import LLMClient

        client = LLMClient(openai_api_key="sk-test-key-for-testing")

        assert client.openai_client is not None
        assert client.cloud_model == "gpt-4o"

    def test_llm_client_warns_without_key(self):
        """Test LLMClient logs warning when key is missing."""
        from app.services.llm_client import LLMClient

        with patch("app.services.llm_client.logger") as mock_logger:
            client = LLMClient(openai_api_key=None)

            # Should have logged a warning
            mock_logger.warning.assert_called()
            assert client.openai_client is None

    def test_llm_client_raises_on_call_without_key(self):
        """Test LLMClient raises RuntimeError when calling without key."""
        from app.services.llm_client import LLMClient, LLMRequest

        client = LLMClient(openai_api_key=None)
        request = LLMRequest(prompt="Test prompt")

        # Should raise RuntimeError when trying to generate
        with pytest.raises(RuntimeError, match="API key not configured"):
            import asyncio

            asyncio.get_event_loop().run_until_complete(client._call_cloud(request))


class TestRAGServiceConfiguration:
    """Test RAG service uses settings correctly."""

    def test_query_orchestrator_uses_settings(self):
        """Test QueryOrchestrator initializes with settings."""
        from app.core.config import settings
        from app.services.rag_service import QueryOrchestrator

        with patch("app.services.rag_service.LLMClient") as mock_llm:
            with patch("app.services.rag_service.SearchAggregator"):
                QueryOrchestrator(enable_rag=True)  # noqa: F841

                # Verify LLMClient was initialized with settings
                mock_llm.assert_called_once()
                call_kwargs = mock_llm.call_args[1]
                assert call_kwargs["openai_api_key"] == settings.OPENAI_API_KEY
                assert call_kwargs["openai_timeout_sec"] == settings.OPENAI_TIMEOUT_SEC


class TestRealtimeVoiceServiceConfiguration:
    """Test Realtime Voice service configuration."""

    def test_realtime_service_uses_settings(self):
        """Test RealtimeVoiceService uses settings."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        assert service.enabled == settings.REALTIME_ENABLED
        assert service.model == settings.REALTIME_MODEL
        assert service.base_url == settings.REALTIME_BASE_URL
        assert service.api_key == settings.OPENAI_API_KEY
        assert service.token_expiry == settings.REALTIME_TOKEN_EXPIRY_SEC

    def test_realtime_service_is_enabled_check(self):
        """Test is_enabled returns True when key and flag are set."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Should be enabled only if both flag and key are present
        expected = settings.REALTIME_ENABLED and bool(settings.OPENAI_API_KEY)
        assert service.is_enabled() == expected

    @pytest.mark.asyncio
    async def test_realtime_service_generates_session_config_mocked(self):
        """Test session config generation with mocked OpenAI call (CI-safe)."""
        from unittest.mock import AsyncMock, patch

        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Mock the OpenAI session creation to avoid hitting the real API
        mock_openai_session = {
            "client_secret": "ek_test_mock_ephemeral_token_abc123",
            "expires_at": int(time.time()) + 300,  # 5 minutes from now
        }

        with patch.object(
            service,
            "create_openai_ephemeral_session",
            new=AsyncMock(return_value=mock_openai_session),
        ):
            config = await service.generate_session_config(user_id="test-user-123", conversation_id="conv-456")

        assert config["url"] == settings.REALTIME_BASE_URL
        assert config["model"] == settings.REALTIME_MODEL
        assert config["session_id"].startswith("rtc_test-user-123_")
        assert config["conversation_id"] == "conv-456"
        assert "voice_config" in config

        # SECURITY: Raw API key should NOT be in response
        assert "api_key" not in config, "Raw API key must not be exposed to client"

        # Auth structure with ephemeral token SHOULD be present
        assert "auth" in config
        assert config["auth"]["type"] == "ephemeral_token"
        assert "token" in config["auth"]
        assert config["auth"]["token"] == "ek_test_mock_ephemeral_token_abc123"
        assert "expires_at" in config["auth"]

        # Token should be non-empty string (OpenAI ephemeral client secret)
        token = config["auth"]["token"]
        assert isinstance(token, str)
        assert len(token) > 0

    def test_ephemeral_token_generation_and_validation(self):
        """Test HMAC ephemeral token generation and validation.

        NOTE: This tests the legacy HMAC token functionality which is kept
        for potential future proxy implementations. The current implementation
        uses OpenAI's native ephemeral sessions instead.
        """
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Generate token
        user_id = "test-user-456"
        session_id = "rtc_test_session_789"
        expires_at = int(time.time()) + 300  # 5 minutes from now

        token = service.generate_ephemeral_token(user_id, session_id, expires_at)

        # Token should have proper format
        assert isinstance(token, str)
        parts = token.split(".")
        assert len(parts) == 2, "Token should have format: payload.signature"

        # Validate token
        payload = service.validate_ephemeral_token(token)

        # Payload should contain expected data
        assert payload["user_id"] == user_id
        assert payload["session_id"] == session_id
        assert payload["expires_at"] == expires_at
        assert "model" in payload
        assert "issued_at" in payload

    def test_ephemeral_token_rejects_tampered_token(self):
        """Test that tampered HMAC tokens are rejected.

        NOTE: Tests legacy HMAC functionality kept for future proxy use.
        """
        import time

        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Generate valid token
        token = service.generate_ephemeral_token("user-123", "session-456", int(time.time()) + 300)

        # Tamper with token by modifying payload
        parts = token.split(".")
        tampered_payload = parts[0][:-4] + "XXXX"  # Corrupt last 4 chars
        tampered_token = f"{tampered_payload}.{parts[1]}"

        # Validation should fail
        with pytest.raises(ValueError, match="Invalid token"):
            service.validate_ephemeral_token(tampered_token)

    def test_ephemeral_token_rejects_expired_token(self):
        """Test that expired HMAC tokens are rejected.

        NOTE: Tests legacy HMAC functionality kept for future proxy use.
        """
        import time

        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Generate token that's already expired
        expires_at = int(time.time()) - 10  # 10 seconds ago
        token = service.generate_ephemeral_token("user-123", "session-456", expires_at)

        # Validation should fail due to expiry
        with pytest.raises(ValueError, match="expired"):
            service.validate_ephemeral_token(token)


class TestVoiceAPIConfiguration:
    """Test Voice API endpoints use settings correctly."""

    def test_voice_router_has_transcribe_endpoint(self):
        """Test voice router has transcribe endpoint."""
        from app.api import voice

        # The route includes the prefix from the router
        routes = [r.path for r in voice.router.routes]
        assert any("transcribe" in r for r in routes), f"Routes: {routes}"

    def test_voice_router_has_synthesize_endpoint(self):
        """Test voice router has synthesize endpoint."""
        from app.api import voice

        routes = [r.path for r in voice.router.routes]
        assert any("synthesize" in r for r in routes), f"Routes: {routes}"

    def test_voice_router_has_realtime_session_endpoint(self):
        """Test voice router has realtime-session endpoint."""
        from app.api import voice

        routes = [r.path for r in voice.router.routes]
        assert any("realtime-session" in r for r in routes), f"Routes: {routes}"


# ============================================================================
# LIVE INTEGRATION TESTS
# These tests make real API calls and require LIVE_OPENAI_TESTS=1
# ============================================================================


@pytest.mark.skipif(
    not LIVE_OPENAI_TESTS,
    reason="Live OpenAI tests disabled. Set LIVE_OPENAI_TESTS=1 to enable.",
)
@pytest.mark.live_openai
class TestOpenAILiveIntegration:
    """Live integration tests that call OpenAI API.

    These tests verify actual API connectivity.
    They are skipped by default to avoid API costs and rate limits.

    Run with: LIVE_OPENAI_TESTS=1 pytest -m live_openai
    """

    @pytest.mark.asyncio
    async def test_live_api_models_list(self):
        """Test live API call to list models."""
        from app.core.config import settings
        from openai import AsyncOpenAI

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=15.0)

        models = await client.models.list()

        assert models.data is not None
        assert len(models.data) > 0

        # Verify required models are accessible
        model_ids = {m.id for m in models.data}
        required = ["gpt-4o", "gpt-4o-mini"]
        for model in required:
            assert model in model_ids, f"Model {model} not accessible"

    @pytest.mark.asyncio
    async def test_live_llm_client_generate(self):
        """Test live LLM client generation."""
        from app.core.config import settings
        from app.services.llm_client import LLMClient, LLMRequest

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        client = LLMClient(
            openai_api_key=settings.OPENAI_API_KEY,
            openai_timeout_sec=30,
            cloud_model="gpt-4o-mini",  # Use cheaper model for tests
        )

        request = LLMRequest(
            prompt="Say 'test successful' and nothing else.",
            max_tokens=10,
            temperature=0.0,
            trace_id="test-live-001",
        )

        response = await client.generate(request)

        assert response.text is not None
        assert len(response.text) > 0
        assert response.model_family == "cloud"
        assert response.used_tokens > 0
        assert response.latency_ms > 0

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not LIVE_REALTIME_TESTS,
        reason="Live Realtime tests disabled. Set LIVE_REALTIME_TESTS=1 to enable.",
    )
    async def test_live_realtime_session_creation(self):
        """Test live OpenAI Realtime session creation.

        This test makes a real API call to OpenAI's ephemeral session endpoint.
        Only runs when LIVE_REALTIME_TESTS=1.
        """
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        service = RealtimeVoiceService()

        # With a valid key and REALTIME_ENABLED=true, should be enabled
        assert service.is_enabled() is True

        # Should generate valid session config with real OpenAI ephemeral token
        config = await service.generate_session_config(user_id="live-test-user", conversation_id=None)

        assert config["url"].startswith("wss://")
        assert config["model"].startswith("gpt-")

        # SECURITY: Raw API key should NOT be in response
        assert "api_key" not in config, "Raw API key must not be exposed to client"

        # Auth structure with real ephemeral token SHOULD be present
        assert "auth" in config
        assert config["auth"]["type"] == "ephemeral_token"
        assert "token" in config["auth"]
        assert "expires_at" in config["auth"]

        # Real OpenAI ephemeral tokens should start with "ek_"
        token = config["auth"]["token"]
        assert token.startswith("ek_"), "OpenAI ephemeral token should start with 'ek_'"
        assert len(token) > 20, "Token should be reasonably long"
