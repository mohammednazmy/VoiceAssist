"""
Unit tests for ElevenLabs TTS Service

Tests the ElevenLabs service for TTS synthesis, voice listing, and usage stats.
Phase 11.1: VoiceAssist Voice Pipeline Sprint
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.elevenlabs_service import ElevenLabsService, ElevenLabsUsageStats, ElevenLabsVoice, TTSSynthesisResult


class TestElevenLabsService:
    """Tests for ElevenLabsService class."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create service with mocked API key
        with patch.object(ElevenLabsService, "__init__", lambda self: None):
            self.service = ElevenLabsService()
            self.service.api_key = "test_api_key"
            self.service.enabled = True
            self.service.default_model = "eleven_multilingual_v2"
            self.service.default_voice_id = "21m00Tcm4TlvDq8ikWAM"
            self.service._voice_cache = []
            self.service._voice_cache_expiry = 0
            self.service._voice_cache_ttl = 300
            self.service._http_client = None

    def test_is_enabled(self):
        """Test is_enabled returns correct value."""
        assert self.service.is_enabled() is True

        self.service.enabled = False
        assert self.service.is_enabled() is False

    def test_is_enabled_without_api_key(self):
        """Test service is disabled without API key."""
        self.service.api_key = None
        self.service.enabled = False
        assert self.service.is_enabled() is False

    def test_get_headers(self):
        """Test API headers are correctly formatted."""
        headers = self.service._get_headers()

        assert "xi-api-key" in headers
        assert headers["xi-api-key"] == "test_api_key"
        assert headers["Content-Type"] == "application/json"
        assert headers["Accept"] == "audio/mpeg"

    def test_get_default_voice_id(self):
        """Test getting default voice ID."""
        voice_id = self.service.get_default_voice_id()
        assert voice_id == "21m00Tcm4TlvDq8ikWAM"

    def test_get_available_models(self):
        """Test listing available models."""
        models = self.service.get_available_models()

        assert len(models) >= 3  # At least 3 models, may grow as ElevenLabs adds more
        model_ids = [m["id"] for m in models]
        # Core models that should always be present
        assert "eleven_multilingual_v2" in model_ids
        assert "eleven_monolingual_v1" in model_ids


class TestElevenLabsSynthesize:
    """Tests for synthesize method."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch.object(ElevenLabsService, "__init__", lambda self: None):
            self.service = ElevenLabsService()
            self.service.api_key = "test_api_key"
            self.service.enabled = True
            self.service.default_model = "eleven_multilingual_v2"
            self.service.default_voice_id = "21m00Tcm4TlvDq8ikWAM"
            self.service._http_client = None

    @pytest.mark.asyncio
    async def test_synthesize_disabled_service(self):
        """Test synthesize raises error when service is disabled."""
        self.service.enabled = False

        with pytest.raises(ValueError, match="ElevenLabs TTS is not enabled"):
            await self.service.synthesize("Hello world")

    @pytest.mark.asyncio
    async def test_synthesize_text_too_long(self):
        """Test synthesize raises error for text exceeding limit."""
        self.service.enabled = True
        long_text = "a" * 5001  # Exceeds 5000 char limit

        with pytest.raises(ValueError, match="Text exceeds maximum length"):
            await self.service.synthesize(long_text)

    @pytest.mark.asyncio
    async def test_synthesize_success(self):
        """Test successful synthesis."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake_audio_data"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.synthesize("Hello world")

        assert isinstance(result, TTSSynthesisResult)
        assert result.audio_data == b"fake_audio_data"
        assert result.content_type == "audio/mpeg"
        assert result.characters_used == 11  # len("Hello world")
        assert result.voice_id == "21m00Tcm4TlvDq8ikWAM"

    @pytest.mark.asyncio
    async def test_synthesize_with_custom_voice(self):
        """Test synthesis with custom voice ID."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"audio"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.synthesize(
            "Test",
            voice_id="custom_voice_id",
        )

        assert result.voice_id == "custom_voice_id"

    @pytest.mark.asyncio
    async def test_synthesize_pcm_format(self):
        """Test synthesis with PCM output format."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"pcm_audio"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.synthesize(
            "Test",
            output_format="pcm_24000",
        )

        assert result.content_type == "audio/pcm"


class TestElevenLabsGetVoices:
    """Tests for get_voices method."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch.object(ElevenLabsService, "__init__", lambda self: None):
            self.service = ElevenLabsService()
            self.service.api_key = "test_api_key"
            self.service.enabled = True
            self.service._voice_cache = []
            self.service._voice_cache_expiry = 0
            self.service._voice_cache_ttl = 300
            self.service._http_client = None

    @pytest.mark.asyncio
    async def test_get_voices_disabled_service(self):
        """Test get_voices returns empty list when disabled."""
        self.service.enabled = False

        result = await self.service.get_voices()

        assert result == []

    @pytest.mark.asyncio
    async def test_get_voices_from_cache(self):
        """Test get_voices returns cached voices."""
        import time

        cached_voice = ElevenLabsVoice(
            voice_id="cached_id",
            name="Cached Voice",
            category="premade",
        )
        self.service._voice_cache = [cached_voice]
        self.service._voice_cache_expiry = time.time() + 100  # Not expired

        result = await self.service.get_voices()

        assert len(result) == 1
        assert result[0].voice_id == "cached_id"

    @pytest.mark.asyncio
    async def test_get_voices_fetch_from_api(self):
        """Test get_voices fetches from API when cache expired."""
        import time

        self.service._voice_cache_expiry = time.time() - 100  # Expired

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "voices": [
                {
                    "voice_id": "voice1",
                    "name": "Voice One",
                    "category": "premade",
                    "labels": {"accent": "american"},
                    "preview_url": "https://example.com/preview.mp3",
                    "description": "A test voice",
                },
                {
                    "voice_id": "voice2",
                    "name": "Voice Two",
                    "category": "cloned",
                    "labels": {},
                },
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.get_voices()

        assert len(result) == 2
        assert result[0].voice_id == "voice1"
        assert result[0].name == "Voice One"
        assert result[0].labels == {"accent": "american"}
        assert result[1].voice_id == "voice2"

    @pytest.mark.asyncio
    async def test_get_voices_force_refresh(self):
        """Test get_voices with force_refresh bypasses cache."""
        import time

        # Set valid cache
        cached_voice = ElevenLabsVoice(
            voice_id="old_id",
            name="Old Voice",
            category="premade",
        )
        self.service._voice_cache = [cached_voice]
        self.service._voice_cache_expiry = time.time() + 100

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "voices": [
                {
                    "voice_id": "new_id",
                    "name": "New Voice",
                    "category": "premade",
                }
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.get_voices(force_refresh=True)

        assert len(result) == 1
        assert result[0].voice_id == "new_id"


class TestElevenLabsUsageStats:
    """Tests for get_usage_stats method."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch.object(ElevenLabsService, "__init__", lambda self: None):
            self.service = ElevenLabsService()
            self.service.api_key = "test_api_key"
            self.service.enabled = True
            self.service._http_client = None

    @pytest.mark.asyncio
    async def test_get_usage_stats_disabled(self):
        """Test get_usage_stats returns None when disabled."""
        self.service.enabled = False

        result = await self.service.get_usage_stats()

        assert result is None

    @pytest.mark.asyncio
    async def test_get_usage_stats_success(self):
        """Test successful usage stats retrieval."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "character_count": 50000,
            "character_limit": 100000,
            "voice_limit": 10,
            "professional_voice_limit": 1,
            "next_character_count_reset_unix": "2024-02-01T00:00:00Z",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.is_closed = False

        self.service._http_client = mock_client

        result = await self.service.get_usage_stats()

        assert isinstance(result, ElevenLabsUsageStats)
        assert result.character_count == 50000
        assert result.character_limit == 100000
        assert result.voice_limit == 10
        assert result.professional_voice_limit == 1


class TestElevenLabsDataClasses:
    """Tests for data classes."""

    def test_elevenlabs_voice(self):
        """Test ElevenLabsVoice dataclass."""
        voice = ElevenLabsVoice(
            voice_id="test_id",
            name="Test Voice",
            category="premade",
            labels={"accent": "british", "gender": "female"},
            preview_url="https://example.com/preview.mp3",
            description="A test voice",
        )

        assert voice.voice_id == "test_id"
        assert voice.name == "Test Voice"
        assert voice.category == "premade"
        assert voice.labels["accent"] == "british"
        assert voice.preview_url == "https://example.com/preview.mp3"

    def test_tts_synthesis_result(self):
        """Test TTSSynthesisResult dataclass."""
        result = TTSSynthesisResult(
            audio_data=b"audio_bytes",
            content_type="audio/mpeg",
            duration_ms=1500,
            characters_used=100,
            latency_ms=250,
            voice_id="voice123",
        )

        assert result.audio_data == b"audio_bytes"
        assert result.content_type == "audio/mpeg"
        assert result.duration_ms == 1500
        assert result.characters_used == 100
        assert result.latency_ms == 250
        assert result.voice_id == "voice123"

    def test_elevenlabs_usage_stats(self):
        """Test ElevenLabsUsageStats dataclass."""
        stats = ElevenLabsUsageStats(
            character_count=50000,
            character_limit=100000,
            voice_limit=10,
            professional_voice_limit=1,
            next_reset_at="2024-02-01T00:00:00Z",
        )

        assert stats.character_count == 50000
        assert stats.character_limit == 100000
        assert stats.voice_limit == 10
        assert stats.professional_voice_limit == 1
        assert stats.next_reset_at == "2024-02-01T00:00:00Z"
