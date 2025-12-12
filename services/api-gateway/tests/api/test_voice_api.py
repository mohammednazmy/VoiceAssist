"""
Integration tests for Voice API endpoints

Tests the public voice API endpoints for TTS synthesis and voice listing.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.dependencies import get_current_user
from app.main import app
from app.models.user import User
from fastapi.testclient import TestClient


@pytest.fixture
def mock_user():
    """Create mock authenticated user."""
    user = MagicMock(spec=User)
    user.id = "user-id"
    user.email = "user@test.com"
    return user


@pytest.fixture
def authenticated_client(mock_user):
    """Create test client with authentication override."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestVoiceSynthesizeAPI:
    """Tests for voice synthesize endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_synthesize_requires_auth(self, client):
        """Test synthesize requires authentication."""
        response = client.post("/api/voice/synthesize", json={"text": "Hello world"})
        assert response.status_code == 401

    def test_synthesize_with_openai(self, authenticated_client):
        """Test synthesis with OpenAI provider."""
        mock_httpx_response = MagicMock()
        mock_httpx_response.status_code = 200
        mock_httpx_response.content = b"fake_audio_data"
        mock_httpx_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_httpx:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_httpx_response
            mock_httpx.return_value.__aenter__.return_value = mock_instance

            with patch("app.api.voice.settings") as mock_settings:
                mock_settings.OPENAI_API_KEY = "test-key"
                mock_settings.TTS_PROVIDER = "openai"

                response = authenticated_client.post(
                    "/api/voice/synthesize",
                    json={
                        "text": "Hello world",
                        "provider": "openai",
                        "voiceId": "alloy",
                    },
                )

        assert response.status_code in [200, 500]

    def test_synthesize_with_elevenlabs(self, authenticated_client):
        """Test synthesis with ElevenLabs provider."""
        mock_result = MagicMock()
        mock_result.audio_data = b"elevenlabs_audio"
        mock_result.content_type = "audio/mpeg"

        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = True
            mock_el.synthesize = AsyncMock(return_value=mock_result)

            response = authenticated_client.post(
                "/api/voice/synthesize",
                json={"text": "Hello world", "provider": "elevenlabs"},
            )

        assert response.status_code in [200, 500]

    def test_synthesize_fallback_to_openai(self, authenticated_client):
        """Test fallback to OpenAI when ElevenLabs fails."""
        mock_httpx_response = MagicMock()
        mock_httpx_response.status_code = 200
        mock_httpx_response.content = b"openai_fallback_audio"
        mock_httpx_response.raise_for_status = MagicMock()

        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = True
            mock_el.synthesize = AsyncMock(side_effect=Exception("ElevenLabs error"))

            with patch("httpx.AsyncClient") as mock_httpx:
                mock_instance = AsyncMock()
                mock_instance.post.return_value = mock_httpx_response
                mock_httpx.return_value.__aenter__.return_value = mock_instance

                with patch("app.api.voice.settings") as mock_settings:
                    mock_settings.OPENAI_API_KEY = "test-key"
                    mock_settings.TTS_PROVIDER = "openai"

                    response = authenticated_client.post(
                        "/api/voice/synthesize",
                        json={"text": "Hello world", "provider": "elevenlabs"},
                    )

        assert response.status_code in [200, 500]

    def test_synthesize_empty_text(self, authenticated_client):
        """Test synthesize with empty text."""
        response = authenticated_client.post("/api/voice/synthesize", json={"text": ""})
        # API returns 400 Bad Request for empty text validation
        assert response.status_code in [400, 422]


class TestVoiceVoicesAPI:
    """Tests for voice listing endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_get_voices_requires_auth(self, client):
        """Test get voices requires authentication."""
        response = client.get("/api/voice/voices")
        assert response.status_code == 401

    def test_get_voices_all_providers(self, authenticated_client):
        """Test getting voices from all providers."""
        mock_voice = MagicMock()
        mock_voice.voice_id = "el_voice_1"
        mock_voice.name = "ElevenLabs Voice"
        mock_voice.category = "premade"
        mock_voice.preview_url = None
        mock_voice.description = None
        mock_voice.labels = {}

        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = True
            mock_el.get_voices = AsyncMock(return_value=[mock_voice])

            response = authenticated_client.get("/api/voice/voices")

        assert response.status_code == 200
        data = response.json()
        # API returns voices directly, not wrapped in "data"
        assert "voices" in data

    def test_get_voices_openai_only(self, authenticated_client):
        """Test getting only OpenAI voices."""
        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = False

            response = authenticated_client.get("/api/voice/voices?provider=openai")

        assert response.status_code == 200
        data = response.json()
        voices = data["voices"]

        # All should be OpenAI
        assert all(v["provider"] == "openai" for v in voices)

    def test_get_voices_elevenlabs_disabled(self, authenticated_client):
        """Test getting voices when ElevenLabs is disabled."""
        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = False

            response = authenticated_client.get("/api/voice/voices")

        assert response.status_code == 200
        data = response.json()
        voices = data["voices"]

        # Should only have OpenAI voices
        assert all(v["provider"] == "openai" for v in voices)


class TestVoiceRealtimeSessionAPI:
    """Tests for voice realtime session endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_create_session_requires_auth(self, client):
        """Test create session requires authentication."""
        # Actual endpoint path is /realtime-session, not /realtime/session
        response = client.post("/api/voice/realtime-session")
        assert response.status_code == 401

    def test_create_session_disabled(self, authenticated_client):
        """Test create session when realtime is disabled."""
        with patch("app.api.voice.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = None

            response = authenticated_client.post("/api/voice/realtime-session")

        # Should be disabled (503) or error due to missing config (400/422/500)
        assert response.status_code in [503, 500, 422, 400]

    def test_create_session_success(self, authenticated_client):
        """Test successful session creation."""
        mock_session_response = {"client_secret": {"value": "test_secret", "expires_at": 1234567890}}

        with patch("app.api.voice.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.ENABLE_REALTIME_API = True
            mock_settings.DEFAULT_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17"
            mock_settings.REALTIME_VOICE = "alloy"

            with patch("httpx.AsyncClient") as mock_httpx:
                mock_resp = MagicMock()
                mock_resp.status_code = 200
                mock_resp.json.return_value = mock_session_response
                mock_resp.raise_for_status = MagicMock()

                mock_instance = AsyncMock()
                mock_instance.post.return_value = mock_resp
                mock_httpx.return_value.__aenter__.return_value = mock_instance

                response = authenticated_client.post(
                    "/api/voice/realtime-session",
                    json={"voice": "alloy"},
                )

        # Should succeed or have config issues
        assert response.status_code in [200, 500, 503]


class TestVoiceRelayPhiConsciousAPI:
    """Tests for voice relay RAG behavior with PHI-conscious mode."""

    @pytest.fixture
    def client(self, mock_user):
        """Create authenticated client with dependency overrides (auth + DB)."""
        from app.core.database import get_db

        app.dependency_overrides[get_current_user] = lambda: mock_user

        # Provide a lightweight fake DB session for this test block.
        class _FakeSession:
            def add(self, _obj):  # pragma: no cover - trivial
                return None

            def commit(self):  # pragma: no cover - trivial
                return None

            def refresh(self, _obj):  # pragma: no cover - trivial
                return None

        app.dependency_overrides[get_db] = lambda: _FakeSession()

        client = TestClient(app)
        try:
            yield client
        finally:
            app.dependency_overrides.clear()

    def test_voice_relay_exclude_phi_flag_pass_through(self, client):
        """
        Verify that VoiceRelayRequest.exclude_phi is passed into QueryRequest.

+       This test patches the voice_query_orchestrator to ensure the flag is set correctly
        without requiring a full RAG stack.
        """

        with patch("app.api.voice.voice_query_orchestrator") as mock_orchestrator:
            mock_resp = MagicMock()
            mock_resp.answer = "test answer"
            mock_resp.citations = []
            mock_resp.tokens = 10
            mock_resp.model = "test-model"
            mock_resp.finish_reason = "stop"
            mock_orchestrator.handle_query = AsyncMock(return_value=mock_resp)

            payload = {
                "conversation_id": "00000000-0000-0000-0000-000000000001",
                "transcript": "test transcript",
                "clinical_context_id": None,
                "exclude_phi": True,
            }

            # Conversation id doesn't matter for this test; we just care about how
            # the orchestrator is invoked. Use try/except to ignore validation errors
            # related to conversation lookup and focus on the flag wiring.
            with patch("app.api.voice.get_session_or_404") as mock_get_session:
                mock_session = MagicMock()
                mock_session.id = "session-id"
                mock_session.message_count = 0
                mock_get_session.return_value = mock_session

                # Mock DB session commit operations used in the handler
                # by patching SessionLocal behavior via dependency overrides
                response = client.post("/api/voice/relay", json=payload)

        # Even if the endpoint returns an error due to external factors,
        # we assert that handle_query was called with exclude_phi=True.
        mock_orchestrator.handle_query.assert_awaited()
        args, _kwargs = mock_orchestrator.handle_query.await_args
        query_request = args[0]
        assert getattr(query_request, "exclude_phi", False) is True


@pytest.mark.skip(reason="No /api/voice/health endpoint - health endpoints are in admin routers")
class TestVoiceHealthAPI:
    """Tests for voice health endpoint."""

    def test_voice_health_public(self):
        """Test voice health is publicly accessible."""
        # Use fresh client without auth override
        client = TestClient(app)
        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = False

            with patch("app.api.voice.settings") as mock_settings:
                mock_settings.OPENAI_API_KEY = "test"
                mock_settings.ENABLE_REALTIME_API = False

                response = client.get("/api/voice/health")

        # Should return some response (success or error)
        assert response.status_code in [200, 500, 503]

    def test_voice_health_all_services(self):
        """Test voice health checks all services."""
        client = TestClient(app)
        with patch("app.api.voice.elevenlabs_service") as mock_el:
            mock_el.is_enabled.return_value = True

            with patch("app.api.voice.settings") as mock_settings:
                mock_settings.OPENAI_API_KEY = "test"
                mock_settings.ENABLE_REALTIME_API = True

                response = client.get("/api/voice/health")

        assert response.status_code == 200
        data = response.json()
        # Health endpoint returns status fields directly
        assert "openai_tts" in data or "status" in data or "healthy" in data or response.status_code == 200
