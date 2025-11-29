"""
Integration tests for Voice API endpoints

Tests the public voice API endpoints for TTS synthesis and voice listing.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.main import app
from fastapi.testclient import TestClient


class TestVoiceSynthesizeAPI:
    """Tests for voice synthesize endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    @pytest.fixture
    def mock_user(self):
        """Create mock authenticated user."""
        user = MagicMock()
        user.id = "user-id"
        user.email = "user@test.com"
        return user

    def test_synthesize_requires_auth(self, client):
        """Test synthesize requires authentication."""
        response = client.post("/api/voice/synthesize", json={"text": "Hello world"})
        assert response.status_code == 401

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.openai_client")
    def test_synthesize_with_openai(self, mock_openai, mock_auth, client, mock_user):
        """Test synthesis with OpenAI provider."""
        mock_auth.return_value = mock_user

        # Mock OpenAI TTS response
        mock_response = MagicMock()
        mock_response.content = b"fake_audio_data"
        mock_openai.audio.speech.create.return_value = mock_response

        response = client.post(
            "/api/voice/synthesize", json={"text": "Hello world", "provider": "openai", "voiceId": "alloy"}
        )

        assert response.status_code == 200
        assert response.headers.get("content-type") == "audio/mpeg"
        assert response.headers.get("x-tts-provider") == "openai"

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.elevenlabs_service")
    def test_synthesize_with_elevenlabs(self, mock_elevenlabs, mock_auth, client, mock_user):
        """Test synthesis with ElevenLabs provider."""
        mock_auth.return_value = mock_user
        mock_elevenlabs.is_enabled.return_value = True

        # Mock ElevenLabs synthesis
        mock_result = MagicMock()
        mock_result.audio_data = b"elevenlabs_audio"
        mock_result.content_type = "audio/mpeg"
        mock_elevenlabs.synthesize = AsyncMock(return_value=mock_result)

        response = client.post("/api/voice/synthesize", json={"text": "Hello world", "provider": "elevenlabs"})

        assert response.status_code == 200
        assert response.headers.get("x-tts-provider") == "elevenlabs"

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.elevenlabs_service")
    @patch("app.api.voice.openai_client")
    def test_synthesize_fallback_to_openai(self, mock_openai, mock_elevenlabs, mock_auth, client, mock_user):
        """Test fallback to OpenAI when ElevenLabs fails."""
        mock_auth.return_value = mock_user
        mock_elevenlabs.is_enabled.return_value = True
        mock_elevenlabs.synthesize = AsyncMock(side_effect=Exception("ElevenLabs error"))

        # Mock OpenAI fallback
        mock_response = MagicMock()
        mock_response.content = b"openai_fallback_audio"
        mock_openai.audio.speech.create.return_value = mock_response

        response = client.post("/api/voice/synthesize", json={"text": "Hello world", "provider": "elevenlabs"})

        # Should succeed with OpenAI fallback
        assert response.status_code == 200
        assert response.headers.get("x-tts-fallback") == "true"

    @patch("app.api.voice.get_current_user")
    def test_synthesize_empty_text(self, mock_auth, client, mock_user):
        """Test synthesize with empty text."""
        mock_auth.return_value = mock_user

        response = client.post("/api/voice/synthesize", json={"text": ""})

        assert response.status_code == 422  # Validation error


class TestVoiceVoicesAPI:
    """Tests for voice listing endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    @pytest.fixture
    def mock_user(self):
        """Create mock authenticated user."""
        user = MagicMock()
        user.id = "user-id"
        user.email = "user@test.com"
        return user

    def test_get_voices_requires_auth(self, client):
        """Test get voices requires authentication."""
        response = client.get("/api/voice/voices")
        assert response.status_code == 401

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.elevenlabs_service")
    def test_get_voices_all_providers(self, mock_elevenlabs, mock_auth, client, mock_user):
        """Test getting voices from all providers."""
        mock_auth.return_value = mock_user
        mock_elevenlabs.is_enabled.return_value = True

        # Mock ElevenLabs voices
        mock_voice = MagicMock()
        mock_voice.voice_id = "el_voice_1"
        mock_voice.name = "ElevenLabs Voice"
        mock_voice.category = "premade"
        mock_voice.preview_url = None
        mock_voice.description = None
        mock_voice.labels = {}
        mock_elevenlabs.get_voices = AsyncMock(return_value=[mock_voice])

        response = client.get("/api/voice/voices")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "voices" in data["data"]

        voices = data["data"]["voices"]
        providers = set(v["provider"] for v in voices)
        assert "openai" in providers

    @patch("app.api.voice.get_current_user")
    def test_get_voices_openai_only(self, mock_auth, client, mock_user):
        """Test getting only OpenAI voices."""
        mock_auth.return_value = mock_user

        response = client.get("/api/voice/voices?provider=openai")

        assert response.status_code == 200
        data = response.json()
        voices = data["data"]["voices"]

        # All should be OpenAI
        assert all(v["provider"] == "openai" for v in voices)

        # Should have all 6 OpenAI voices
        voice_ids = [v["voice_id"] for v in voices]
        assert "alloy" in voice_ids
        assert "echo" in voice_ids
        assert "fable" in voice_ids
        assert "onyx" in voice_ids
        assert "nova" in voice_ids
        assert "shimmer" in voice_ids

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.elevenlabs_service")
    def test_get_voices_elevenlabs_disabled(self, mock_elevenlabs, mock_auth, client, mock_user):
        """Test getting voices when ElevenLabs is disabled."""
        mock_auth.return_value = mock_user
        mock_elevenlabs.is_enabled.return_value = False

        response = client.get("/api/voice/voices")

        assert response.status_code == 200
        data = response.json()
        voices = data["data"]["voices"]

        # Should only have OpenAI voices
        assert all(v["provider"] == "openai" for v in voices)


class TestVoiceRealtimeSessionAPI:
    """Tests for voice realtime session endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    @pytest.fixture
    def mock_user(self):
        """Create mock authenticated user."""
        user = MagicMock()
        user.id = "user-id"
        user.email = "user@test.com"
        return user

    def test_create_session_requires_auth(self, client):
        """Test create session requires authentication."""
        response = client.post("/api/voice/realtime/session")
        assert response.status_code == 401

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.realtime_voice_service")
    def test_create_session_disabled(self, mock_realtime, mock_auth, client, mock_user):
        """Test create session when realtime is disabled."""
        mock_auth.return_value = mock_user
        mock_realtime.is_enabled.return_value = False

        response = client.post("/api/voice/realtime/session")

        assert response.status_code == 503

    @patch("app.api.voice.get_current_user")
    @patch("app.api.voice.realtime_voice_service")
    def test_create_session_success(self, mock_realtime, mock_auth, client, mock_user):
        """Test successful session creation."""
        mock_auth.return_value = mock_user
        mock_realtime.is_enabled.return_value = True

        # Mock session creation
        mock_realtime.create_session = AsyncMock(
            return_value={
                "client_secret": {
                    "value": "test_secret",
                    "expires_at": 1234567890,
                }
            }
        )

        response = client.post("/api/voice/realtime/session", json={"voice": "alloy"})

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "client_secret" in data["data"]


class TestVoiceHealthAPI:
    """Tests for voice health endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_voice_health_public(self, client):
        """Test voice health is publicly accessible."""
        response = client.get("/api/voice/health")

        # Should return some response (success or error)
        assert response.status_code in [200, 500, 503]

    @patch("app.api.voice.realtime_voice_service")
    @patch("app.api.voice.elevenlabs_service")
    def test_voice_health_all_services(self, mock_elevenlabs, mock_realtime, client):
        """Test voice health checks all services."""
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        response = client.get("/api/voice/health")

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "realtime_enabled" in data["data"]
        assert "elevenlabs_enabled" in data["data"]
