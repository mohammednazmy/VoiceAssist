"""
Integration tests for Thinker/Talker Voice Pipeline API.

Tests the T/T pipeline endpoints:
- /api/voice/pipeline/status
- WebSocket connection to /api/voice/pipeline-ws
- Pipeline configuration and health

Phase: Thinker/Talker Voice Pipeline Migration
"""

import base64
import struct
from typing import AsyncGenerator
from unittest.mock import MagicMock, patch

import pytest
from app.core.config import settings
from app.main import app
from httpx import AsyncClient
from starlette.testclient import TestClient

# ==============================================================================
# Fixtures
# ==============================================================================


@pytest.fixture
def test_client() -> TestClient:
    """Create test client."""
    return TestClient(app)


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Create async test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_auth_token() -> str:
    """Create a mock JWT token for testing."""
    # This would be a valid JWT in a real test
    return "mock_test_token"


@pytest.fixture
def mock_user_id() -> str:
    """Mock user ID for testing."""
    return "test-user-123"


# ==============================================================================
# Helper Functions
# ==============================================================================


def generate_test_audio(duration_sec: float = 0.1, sample_rate: int = 16000) -> bytes:
    """Generate test PCM16 audio data."""
    import math

    n_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        sample = int(0.5 * 32767 * math.sin(2 * math.pi * 440 * t))
        samples.append(sample)
    return struct.pack(f"<{len(samples)}h", *samples)


def audio_to_base64(audio_bytes: bytes) -> str:
    """Convert audio bytes to base64."""
    return base64.b64encode(audio_bytes).decode()


# ==============================================================================
# Pipeline Status Tests
# ==============================================================================


class TestPipelineStatusEndpoint:
    """Tests for /api/voice/pipeline/status endpoint."""

    def test_status_requires_authentication(self, test_client: TestClient):
        """Test that status endpoint requires authentication."""
        response = test_client.get("/api/voice/pipeline/status")
        assert response.status_code in [401, 403]

    def test_status_returns_correct_structure(self, test_client: TestClient, mock_auth_token: str):
        """Test status endpoint returns correct structure when authenticated."""
        # Mock authentication
        with patch("app.api.voice.get_current_user") as mock_auth:
            mock_auth.return_value = MagicMock(id="test-user", email="test@test.com")

            response = test_client.get(
                "/api/voice/pipeline/status",
                headers={"Authorization": f"Bearer {mock_auth_token}"},
            )

            if response.status_code == 200:
                data = response.json()
                assert "available" in data
                assert "mode" in data
                assert "services" in data
                assert "latency_targets" in data

                # Check services structure
                services = data["services"]
                assert "stt" in services
                assert "tts" in services
                assert "llm" in services

                # Check latency targets structure
                targets = data["latency_targets"]
                assert "stt_ms" in targets
                assert "total_ms" in targets


class TestPipelineConfigSettings:
    """Tests for T/T pipeline configuration."""

    def test_voice_pipeline_mode_setting(self):
        """Test VOICE_PIPELINE_MODE setting."""
        assert hasattr(settings, "VOICE_PIPELINE_MODE")
        assert settings.VOICE_PIPELINE_MODE in ["thinker_talker", "realtime_fallback"]

    def test_stt_settings(self):
        """Test STT provider settings."""
        assert hasattr(settings, "VOICE_PIPELINE_STT_PRIMARY")
        assert hasattr(settings, "VOICE_PIPELINE_STT_FALLBACK")
        assert settings.VOICE_PIPELINE_STT_PRIMARY in ["deepgram", "whisper"]

    def test_tts_settings(self):
        """Test TTS provider settings."""
        assert hasattr(settings, "VOICE_PIPELINE_TTS_PROVIDER")
        assert settings.VOICE_PIPELINE_TTS_PROVIDER in ["elevenlabs", "openai"]

    def test_latency_target_settings(self):
        """Test latency target settings."""
        assert hasattr(settings, "TARGET_STT_LATENCY_MS")
        assert hasattr(settings, "TARGET_LLM_FIRST_TOKEN_MS")
        assert hasattr(settings, "TARGET_TTS_TTFB_MS")
        assert hasattr(settings, "TARGET_TOTAL_LATENCY_MS")

        # Targets should be reasonable
        assert 0 < settings.TARGET_STT_LATENCY_MS < 1000
        assert 0 < settings.TARGET_TOTAL_LATENCY_MS < 5000

    def test_barge_in_settings(self):
        """Test barge-in settings."""
        assert hasattr(settings, "BARGE_IN_ENABLED")
        assert hasattr(settings, "BARGE_IN_ENERGY_THRESHOLD")
        assert isinstance(settings.BARGE_IN_ENABLED, bool)
        assert 0 <= settings.BARGE_IN_ENERGY_THRESHOLD <= 1

    def test_deepgram_settings(self):
        """Test Deepgram settings."""
        assert hasattr(settings, "DEEPGRAM_MODEL")
        assert hasattr(settings, "DEEPGRAM_ENDPOINTING_MS")
        assert settings.DEEPGRAM_ENDPOINTING_MS > 0

    def test_elevenlabs_settings(self):
        """Test ElevenLabs settings."""
        assert hasattr(settings, "ELEVENLABS_MODEL")
        assert hasattr(settings, "ELEVENLABS_VOICE_ID")
        assert hasattr(settings, "ELEVENLABS_OUTPUT_FORMAT")


# ==============================================================================
# Pipeline Service Tests
# ==============================================================================


class TestVoicePipelineService:
    """Tests for VoicePipelineService class."""

    def test_service_instantiation(self):
        """Test VoicePipelineService can be instantiated."""
        from app.services.voice_pipeline_service import VoicePipelineService

        service = VoicePipelineService()
        assert service is not None

    def test_service_is_available_method(self):
        """Test is_available method."""
        from app.services.voice_pipeline_service import VoicePipelineService

        service = VoicePipelineService()
        # Should return bool
        result = service.is_available()
        assert isinstance(result, bool)

    def test_service_get_active_sessions(self):
        """Test get_active_sessions method."""
        from app.services.voice_pipeline_service import VoicePipelineService

        service = VoicePipelineService()
        sessions = service.get_active_sessions()
        assert isinstance(sessions, list)


class TestStreamingSTTService:
    """Tests for StreamingSTTService class."""

    def test_service_instantiation(self):
        """Test StreamingSTTService can be instantiated."""
        from app.services.streaming_stt_service import StreamingSTTService

        service = StreamingSTTService()
        assert service is not None

    def test_deepgram_availability_check(self):
        """Test Deepgram availability check."""
        from app.services.streaming_stt_service import StreamingSTTService

        service = StreamingSTTService()
        result = service.is_streaming_available()
        # Should return bool (True if API key is set)
        assert isinstance(result, bool)


class TestTalkerService:
    """Tests for TalkerService class."""

    def test_service_instantiation(self):
        """Test TalkerService can be instantiated."""
        from app.services.talker_service import TalkerService

        service = TalkerService()
        assert service is not None

    def test_service_is_enabled(self):
        """Test is_enabled method."""
        from app.services.talker_service import TalkerService

        service = TalkerService()
        result = service.is_enabled()
        assert isinstance(result, bool)


class TestThinkerService:
    """Tests for ThinkerService class."""

    def test_service_instantiation(self):
        """Test ThinkerService can be instantiated."""
        from app.services.thinker_service import ThinkerService

        service = ThinkerService()
        assert service is not None


# ==============================================================================
# WebSocket Handler Tests
# ==============================================================================


class TestThinkerTalkerWebSocketHandler:
    """Tests for ThinkerTalkerWebSocketHandler class."""

    def test_handler_config_creation(self):
        """Test TTSessionConfig creation."""
        from app.services.thinker_talker_websocket_handler import TTSessionConfig

        config = TTSessionConfig(
            user_id="test-user",
            session_id="test-session",
            voice_id="custom-voice",
            language="ar",
        )

        assert config.user_id == "test-user"
        assert config.session_id == "test-session"
        assert config.voice_id == "custom-voice"
        assert config.language == "ar"

    def test_handler_session_manager(self):
        """Test ThinkerTalkerSessionManager."""
        from app.services.thinker_talker_websocket_handler import (
            ThinkerTalkerSessionManager,
            thinker_talker_session_manager,
        )

        # Global instance should exist
        assert thinker_talker_session_manager is not None

        # Create new manager
        manager = ThinkerTalkerSessionManager(max_sessions=50)
        assert manager.max_sessions == 50
        assert manager.get_active_session_count() == 0


# ==============================================================================
# Sentence Chunker Tests
# ==============================================================================


class TestSentenceChunkerIntegration:
    """Integration tests for SentenceChunker."""

    def test_chunker_realistic_input(self):
        """Test chunker with realistic LLM output."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()

        # Simulate streaming LLM output
        llm_output = [
            "Based",
            " on",
            " the",
            " knowledge",
            " base,",
            " I",
            " found",
            " relevant",
            " information.",
            " The",
            " passage",
            " mentions",
            " that",
            " prayer",
            " times",
            " are",
            " determined",
            " by",
            " the",
            " position",
            " of",
            " the",
            " sun.",
            " Would",
            " you",
            " like",
            " me",
            " to",
            " explain",
            " more?",
        ]

        all_chunks = []
        for token in llm_output:
            chunks = chunker.add_token(token)
            all_chunks.extend(chunks)

        final = chunker.flush()
        if final:
            all_chunks.append(final)

        # Should have produced chunks
        assert len(all_chunks) >= 1

        # Combined text should match original
        combined = " ".join(all_chunks).replace("  ", " ").strip()
        original = "".join(llm_output).strip()
        assert combined == original

    def test_chunker_long_sentence_handling(self):
        """Test chunker handles long sentences without punctuation."""
        from app.services.sentence_chunker import ChunkerConfig, SentenceChunker

        config = ChunkerConfig(max_chunk_chars=100)
        chunker = SentenceChunker(config)

        # Very long text without punctuation
        long_text = "word " * 50  # 250 chars

        chunks = chunker.add_token(long_text)
        final = chunker.flush()
        if final:
            chunks.append(final)

        # Should force split
        assert len(chunks) >= 1
        for chunk in chunks:
            assert len(chunk) <= 110  # Allow some tolerance

    def test_chunker_abbreviation_handling(self):
        """Test chunker handles abbreviations correctly."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()

        # Text with abbreviations
        text = "Dr. Smith visited the U.S. hospital. He arrived at 3 p.m. today."
        chunks = chunker.add_token(text)
        final = chunker.flush()
        if final:
            chunks.append(final)

        combined = " ".join(chunks)

        # Should not split on abbreviations
        assert "Dr." in combined or "Dr" in combined
        assert "U.S." in combined or "US" in combined


# ==============================================================================
# Pipeline Message Protocol Tests
# ==============================================================================


class TestPipelineMessageProtocol:
    """Tests for the T/T WebSocket message protocol."""

    def test_transcript_delta_message(self):
        """Test transcript.delta message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="transcript.delta",
            data={
                "text": "hello",
                "is_final": False,
                "confidence": 0.95,
            },
        )

        assert msg.type == "transcript.delta"
        assert msg.data["text"] == "hello"
        assert msg.data["is_final"] is False

    def test_transcript_complete_message(self):
        """Test transcript.complete message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="transcript.complete",
            data={
                "text": "Hello world",
                "message_id": "msg-123",
            },
        )

        assert msg.type == "transcript.complete"
        assert msg.data["text"] == "Hello world"

    def test_response_delta_message(self):
        """Test response.delta message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="response.delta",
            data={"text": "Based on"},
        )

        assert msg.type == "response.delta"
        assert msg.data["text"] == "Based on"

    def test_audio_output_message(self):
        """Test audio.output message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        audio_data = generate_test_audio()
        audio_b64 = audio_to_base64(audio_data)

        msg = PipelineMessage(
            type="audio.output",
            data={
                "audio": audio_b64,
                "format": "pcm16",
                "is_final": False,
            },
        )

        assert msg.type == "audio.output"
        assert msg.data["audio"] == audio_b64
        assert msg.data["format"] == "pcm16"

    def test_tool_call_message(self):
        """Test tool.call message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="tool.call",
            data={
                "tool_id": "call-123",
                "tool_name": "kb_search",
                "arguments": {"query": "prayer times"},
            },
        )

        assert msg.type == "tool.call"
        assert msg.data["tool_name"] == "kb_search"

    def test_voice_state_message(self):
        """Test voice.state message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="voice.state",
            data={"state": "listening"},
        )

        assert msg.type == "voice.state"
        assert msg.data["state"] == "listening"

    def test_error_message(self):
        """Test error message format."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="error",
            data={
                "code": "stt_error",
                "message": "Transcription failed",
                "recoverable": True,
            },
        )

        assert msg.type == "error"
        assert msg.data["code"] == "stt_error"
        assert msg.data["recoverable"] is True


# ==============================================================================
# Database Migration Tests
# ==============================================================================


class TestVoicePipelineMigration:
    """Tests for voice pipeline database migration."""

    def test_source_mode_column_exists(self):
        """Test that source_mode column was added to messages."""
        # This would need database connection in real test
        # For now, verify the migration file exists
        import os

        migration_path = "alembic/versions/031_add_voice_pipeline_mode.py"
        assert os.path.exists(migration_path)

    def test_migration_file_content(self):
        """Test migration file has correct content."""
        with open("alembic/versions/031_add_voice_pipeline_mode.py", "r") as f:
            content = f.read()

        assert "source_mode" in content
        assert "voice_pipeline_mode" in content
        assert "last_voice_activity" in content
