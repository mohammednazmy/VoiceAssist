"""Integration tests for Realtime Voice Pipeline.

These tests verify the backend voice pipeline including:
1. Session configuration generation
2. Provider config abstraction (TTS/STT)
3. Voice API endpoint responses

Test Categories:
1. Unit tests (no external calls) - run always
2. Live integration tests - only run when LIVE_REALTIME_TESTS=1

Usage:
    # Run unit tests only (default)
    pytest tests/integration/test_realtime_voice_pipeline.py -v

    # Run live tests (requires valid API key)
    LIVE_REALTIME_TESTS=1 pytest tests/integration/test_realtime_voice_pipeline.py -v -m live_realtime

    # Run all tests
    LIVE_REALTIME_TESTS=1 pytest tests/integration/test_realtime_voice_pipeline.py -v
"""

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Markers for test categorization
pytestmark = [pytest.mark.integration]

# Check if live tests should run
LIVE_REALTIME_TESTS = os.getenv("LIVE_REALTIME_TESTS", "").lower() in (
    "1",
    "true",
    "yes",
)


class TestRealtimeVoiceServiceConfiguration:
    """Test RealtimeVoiceService configuration and provider abstraction."""

    def test_service_initialization(self):
        """Test service initializes with settings."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        assert service.enabled == settings.REALTIME_ENABLED
        assert service.model == settings.REALTIME_MODEL
        assert service.base_url == settings.REALTIME_BASE_URL
        assert service.api_key == settings.OPENAI_API_KEY
        assert service.token_expiry == settings.REALTIME_TOKEN_EXPIRY_SEC

    def test_service_is_enabled_requires_key_and_flag(self):
        """Test is_enabled returns True only when both flag and key are present."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Should be enabled only if both flag and key are present
        expected = settings.REALTIME_ENABLED and bool(settings.OPENAI_API_KEY)
        assert service.is_enabled() == expected

    @pytest.mark.asyncio
    async def test_service_generates_valid_session_config(self):
        """Test session config has required fields (mocked OpenAI call)."""
        from unittest.mock import AsyncMock
        from unittest.mock import patch as async_patch

        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Mock the OpenAI ephemeral session call
        mock_openai_response = {
            "client_secret": "ek_test_mock_token_12345",
            "expires_at": 1700000000,
        }

        with async_patch.object(service, "create_openai_ephemeral_session", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_openai_response

            config = await service.generate_session_config(user_id="test-user-123", conversation_id="conv-456")

            # Verify required fields
            assert "url" in config
            assert "model" in config
            assert "auth" in config  # Now uses auth instead of api_key
            assert "session_id" in config
            assert "expires_at" in config
            assert "conversation_id" in config
            assert "voice_config" in config

            # Verify field values
            assert config["url"] == settings.REALTIME_BASE_URL
            assert config["model"] == settings.REALTIME_MODEL
            assert config["session_id"].startswith("rtc_test-user-123_")
            assert config["conversation_id"] == "conv-456"
            assert isinstance(config["expires_at"], int)

            # Verify auth structure (ephemeral token)
            assert config["auth"]["type"] == "ephemeral_token"
            assert config["auth"]["token"] == "ek_test_mock_token_12345"

            # Verify voice_config structure
            voice_config = config["voice_config"]
            assert "voice" in voice_config
            assert "modalities" in voice_config
            assert "input_audio_format" in voice_config
            assert "output_audio_format" in voice_config
            assert "turn_detection" in voice_config

    @pytest.mark.asyncio
    async def test_service_generates_config_with_voice_settings(self):
        """Test session config respects voice settings from frontend."""
        from unittest.mock import AsyncMock
        from unittest.mock import patch as async_patch

        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        # Mock the OpenAI ephemeral session call
        mock_openai_response = {
            "client_secret": "ek_test_mock_token_12345",
            "expires_at": 1700000000,
        }

        with async_patch.object(service, "create_openai_ephemeral_session", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_openai_response

            config = await service.generate_session_config(
                user_id="test-user-123",
                conversation_id="test-conv",
                voice="nova",
                language="es",
                vad_sensitivity=80,
            )

            # Verify voice settings are applied
            voice_config = config["voice_config"]
            assert voice_config["voice"] == "nova"
            assert voice_config["language"] == "es"

            # VAD sensitivity 80 should map to low threshold (high sensitivity)
            # 80 -> threshold = 0.9 - (80/100 * 0.8) = 0.9 - 0.64 = 0.26
            vad_threshold = voice_config["turn_detection"]["threshold"]
            assert 0.2 <= vad_threshold <= 0.3, f"Expected ~0.26, got {vad_threshold}"

            # Verify OpenAI was called with selected voice
            mock_create.assert_called_once()
            call_kwargs = mock_create.call_args.kwargs
            assert call_kwargs.get("voice") == "nova"

    @pytest.mark.asyncio
    async def test_service_validates_voice_selection(self):
        """Test service validates voice against allowed values."""
        from unittest.mock import AsyncMock
        from unittest.mock import patch as async_patch

        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        mock_openai_response = {
            "client_secret": "ek_test_mock_token",
            "expires_at": 1700000000,
        }

        with async_patch.object(service, "create_openai_ephemeral_session", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_openai_response

            # Invalid voice should fall back to "alloy"
            config = await service.generate_session_config(
                user_id="test-user",
                voice="invalid_voice",
            )

            assert config["voice_config"]["voice"] == "alloy"

    @pytest.mark.asyncio
    async def test_service_maps_vad_sensitivity_correctly(self):
        """Test VAD sensitivity mapping to threshold."""
        from unittest.mock import AsyncMock
        from unittest.mock import patch as async_patch

        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        if not service.is_enabled():
            pytest.skip("Realtime service not enabled or key not set")

        mock_openai_response = {
            "client_secret": "ek_test",
            "expires_at": 1700000000,
        }

        with async_patch.object(service, "create_openai_ephemeral_session", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_openai_response

            # Low sensitivity (0) should give high threshold (0.9)
            config_low = await service.generate_session_config(user_id="test", vad_sensitivity=0)
            assert config_low["voice_config"]["turn_detection"]["threshold"] == 0.9

            # High sensitivity (100) should give low threshold (0.1)
            config_high = await service.generate_session_config(user_id="test", vad_sensitivity=100)
            assert config_high["voice_config"]["turn_detection"]["threshold"] == 0.1

            # Mid sensitivity (50) should give mid threshold (0.5)
            config_mid = await service.generate_session_config(user_id="test", vad_sensitivity=50)
            assert config_mid["voice_config"]["turn_detection"]["threshold"] == 0.5

            # Default (None) should give 0.5
            config_default = await service.generate_session_config(user_id="test")
            assert config_default["voice_config"]["turn_detection"]["threshold"] == 0.5

    def test_service_validates_session_id_format(self):
        """Test session ID validation."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Valid session IDs
        assert service.validate_session("rtc_user123_abc123") is True
        assert service.validate_session("rtc_u_token") is True

        # Invalid session IDs
        assert service.validate_session("") is False
        assert service.validate_session("invalid") is False
        assert service.validate_session("rtc_") is False
        assert service.validate_session("rtc") is False
        assert service.validate_session(None) is False

    def test_service_generates_system_instructions(self):
        """Test system instructions generation."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Without conversation ID
        instructions = service.get_session_instructions()
        assert isinstance(instructions, str)
        assert len(instructions) > 0
        assert "medical ai assistant" in instructions.lower()
        assert "voice mode" in instructions.lower()

        # With conversation ID
        instructions_with_conv = service.get_session_instructions(conversation_id="conv-123")
        assert "conv-123" in instructions_with_conv


class TestProviderConfiguration:
    """Test provider configuration abstraction (TTS/STT)."""

    def test_tts_config_openai_provider(self):
        """Test TTS config for OpenAI provider."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Default should be OpenAI
        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.TTS_PROVIDER = None  # Should default to openai
            mock_settings.OPENAI_API_KEY = "sk-test-key"
            mock_settings.TTS_VOICE = "alloy"

            tts_config = service.get_tts_config()

            assert tts_config.provider == "openai"
            assert tts_config.enabled is True
            assert tts_config.api_key_present is True
            assert tts_config.default_voice == "alloy"
            assert tts_config.supports_streaming is True
            assert tts_config.max_text_length == 4096
            assert "alloy" in tts_config.available_voices

    def test_tts_config_elevenlabs_provider(self):
        """Test TTS config for ElevenLabs provider."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.TTS_PROVIDER = "elevenlabs"
            mock_settings.ELEVENLABS_API_KEY = "test-key"
            mock_settings.TTS_VOICE = "voice-id-123"

            tts_config = service.get_tts_config()

            assert tts_config.provider == "elevenlabs"
            assert tts_config.enabled is True
            assert tts_config.api_key_present is True
            assert tts_config.default_voice == "voice-id-123"
            assert tts_config.supports_streaming is True

    def test_tts_config_disabled_when_no_key(self):
        """Test TTS config is disabled when API key is missing."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.TTS_PROVIDER = "elevenlabs"
            mock_settings.ELEVENLABS_API_KEY = None

            tts_config = service.get_tts_config()

            assert tts_config.provider == "elevenlabs"
            assert tts_config.enabled is False
            assert tts_config.api_key_present is False

    def test_stt_config_openai_provider(self):
        """Test STT config for OpenAI provider."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        # Default should be OpenAI
        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.STT_PROVIDER = None  # Should default to openai
            mock_settings.OPENAI_API_KEY = "sk-test-key"

            stt_config = service.get_stt_config()

            assert stt_config.provider == "openai"
            assert stt_config.enabled is True
            assert stt_config.api_key_present is True
            assert stt_config.supports_streaming is False  # Whisper is batch-only
            assert stt_config.supports_interim_results is False
            assert len(stt_config.supported_languages) > 0
            assert "en" in stt_config.supported_languages

    def test_stt_config_deepgram_provider(self):
        """Test STT config for Deepgram provider."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.STT_PROVIDER = "deepgram"
            mock_settings.DEEPGRAM_API_KEY = "test-key"

            stt_config = service.get_stt_config()

            assert stt_config.provider == "deepgram"
            assert stt_config.enabled is True
            assert stt_config.api_key_present is True
            assert stt_config.supports_streaming is True  # Deepgram supports streaming
            assert stt_config.supports_interim_results is True

    def test_stt_config_disabled_when_no_key(self):
        """Test STT config is disabled when API key is missing."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        with patch("app.services.realtime_voice_service.settings") as mock_settings:
            mock_settings.STT_PROVIDER = "deepgram"
            mock_settings.DEEPGRAM_API_KEY = None

            stt_config = service.get_stt_config()

            assert stt_config.provider == "deepgram"
            assert stt_config.enabled is False
            assert stt_config.api_key_present is False

    def test_get_available_providers(self):
        """Test get_available_providers returns summary of all providers."""
        from app.services.realtime_voice_service import RealtimeVoiceService

        service = RealtimeVoiceService()

        providers = service.get_available_providers()

        assert "tts" in providers
        assert "stt" in providers
        assert "realtime" in providers

        assert "current" in providers["tts"]
        assert "config" in providers["tts"]
        assert "provider" in providers["tts"]["config"]
        assert "enabled" in providers["tts"]["config"]

        assert "current" in providers["stt"]
        assert "config" in providers["stt"]
        assert "provider" in providers["stt"]["config"]
        assert "enabled" in providers["stt"]["config"]

        assert "enabled" in providers["realtime"]


class TestVoiceAPIEndpoints:
    """Test Voice API endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        from app.main import app

        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        # In real tests, you'd create a test user and generate a real token
        # For now, we'll mock the auth dependency
        return {"Authorization": "Bearer test-token"}

    def test_realtime_session_endpoint_exists(self, client):
        """Test /api/voice/realtime-session endpoint exists."""
        # Test without auth (should fail with 401 or 403)
        response = client.post("/api/voice/realtime-session", json={})
        assert response.status_code in [
            401,
            403,
        ], f"Expected 401/403, got {response.status_code}"

    @pytest.mark.skip(reason="Requires test user and auth setup. Enable when auth fixtures are available.")
    def test_realtime_session_response_structure(self, client, auth_headers):
        """Test /voice/realtime-session returns correct structure."""
        response = client.post(
            "/voice/realtime-session",
            json={"conversation_id": "test-conv-123"},
            headers=auth_headers,
        )

        assert response.status_code == 200

        data = response.json()
        assert "url" in data
        assert "model" in data
        assert "api_key" in data
        assert "session_id" in data
        assert "expires_at" in data
        assert "voice_config" in data

        # Verify types
        assert isinstance(data["url"], str)
        assert isinstance(data["model"], str)
        assert isinstance(data["session_id"], str)
        assert isinstance(data["expires_at"], int)
        assert isinstance(data["voice_config"], dict)


# ============================================================================
# LIVE INTEGRATION TESTS
# These tests make real API calls and require LIVE_REALTIME_TESTS=1
# ============================================================================


@pytest.mark.skipif(
    not LIVE_REALTIME_TESTS,
    reason="Live Realtime tests disabled. Set LIVE_REALTIME_TESTS=1 to enable.",
)
@pytest.mark.live_realtime
class TestRealtimeVoiceLiveIntegration:
    """Live integration tests for Realtime voice pipeline.

    These tests verify actual connectivity and configuration.
    They are skipped by default to avoid API costs and rate limits.

    Run with: LIVE_REALTIME_TESTS=1 pytest -m live_realtime
    """

    @pytest.mark.asyncio
    async def test_live_realtime_service_generates_valid_config(self):
        """Test Realtime service generates valid config with live key."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        service = RealtimeVoiceService()

        assert service.is_enabled() is True

        config = await service.generate_session_config(user_id="live-test-user", conversation_id=None)

        # Verify config structure
        assert config["url"].startswith("wss://")
        assert config["model"].startswith("gpt-")
        assert config["session_id"].startswith("rtc_live-test-user_")
        assert config["expires_at"] > 0
        assert "voice_config" in config
        assert "auth" in config

        # Verify auth structure (should have ephemeral token, NOT raw API key)
        assert config["auth"]["type"] == "ephemeral_token"
        assert config["auth"]["token"].startswith("ek_")  # OpenAI ephemeral tokens start with ek_

        # Verify voice config
        voice_config = config["voice_config"]
        assert voice_config["voice"] in [
            "alloy",
            "echo",
            "fable",
            "onyx",
            "nova",
            "shimmer",
        ]
        assert "text" in voice_config["modalities"]
        assert "audio" in voice_config["modalities"]

    @pytest.mark.asyncio
    async def test_live_tts_provider_config(self):
        """Test TTS provider config with live settings."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        service = RealtimeVoiceService()
        tts_config = service.get_tts_config()

        # Should be enabled with OpenAI key
        assert tts_config.enabled is True
        assert tts_config.api_key_present is True
        assert tts_config.provider == "openai"

    @pytest.mark.asyncio
    async def test_live_stt_provider_config(self):
        """Test STT provider config with live settings."""
        from app.core.config import settings
        from app.services.realtime_voice_service import RealtimeVoiceService

        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")

        service = RealtimeVoiceService()
        stt_config = service.get_stt_config()

        # Should be enabled with OpenAI key
        assert stt_config.enabled is True
        assert stt_config.api_key_present is True
        assert stt_config.provider == "openai"
