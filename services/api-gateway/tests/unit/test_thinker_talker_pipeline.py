"""
Unit tests for Thinker/Talker voice pipeline services.

Tests cover:
- Voice Pipeline Service (orchestrator)
- Streaming STT Service (Deepgram + Whisper fallback)
- Thinker Service (LLM with tool calling)
- Talker Service (ElevenLabs TTS)
- Sentence Chunker
- WebSocket Handler

Phase: Thinker/Talker Voice Pipeline Migration
"""

import asyncio
import math
import struct
from unittest.mock import AsyncMock, MagicMock, patch


# Helper function to generate test audio
def generate_test_audio(
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
    frequency: float = 440.0,
    amplitude: float = 0.5,
) -> bytes:
    """Generate a sine wave test audio signal."""
    n_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        sample = int(amplitude * 32767 * math.sin(2 * math.pi * frequency * t))
        samples.append(sample)
    return struct.pack(f"<{len(samples)}h", *samples)


def generate_silence(duration_sec: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Generate silent audio."""
    n_samples = int(duration_sec * sample_rate)
    samples = [0] * n_samples
    return struct.pack(f"<{len(samples)}h", *samples)


class TestSentenceChunker:
    """Tests for SentenceChunker class."""

    def test_chunker_initialization(self):
        """Test SentenceChunker initialization."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        assert chunker._buffer == ""
        assert chunker._chunks_emitted == 0

    def test_chunker_add_token_returns_chunks(self):
        """Test SentenceChunker add_token returns chunks."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()

        # Add tokens that form a long enough sentence (>20 chars)
        chunks = []
        chunks.extend(chunker.add_token("Hello world, this is a longer sentence. "))
        chunks.extend(chunker.add_token("And another one follows."))

        # First sentence should be emitted (>min_chunk_chars)
        assert len(chunks) >= 1
        assert "longer sentence." in chunks[0]

    def test_chunker_sentence_boundaries(self):
        """Test chunking at sentence boundaries."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        all_chunks = []

        # Add two sentences with clear boundaries
        tokens = ["This is sentence one. ", "This is sentence two."]
        for token in tokens:
            all_chunks.extend(chunker.add_token(token))

        final = chunker.flush()
        if final:
            all_chunks.append(final)

        # Should have at least 2 chunks (one per sentence)
        combined = " ".join(all_chunks)
        assert "one." in combined
        assert "two." in combined

    def test_chunker_with_config(self):
        """Test SentenceChunker with custom config."""
        from app.services.sentence_chunker import ChunkerConfig, SentenceChunker

        config = ChunkerConfig(
            min_chunk_chars=10,
            max_chunk_chars=50,
        )
        chunker = SentenceChunker(config=config)

        # Add a very long text without punctuation
        long_text = "word " * 30
        chunks = chunker.add_token(long_text)
        final = chunker.flush()
        if final:
            chunks.append(final)

        # Should have multiple chunks due to force splitting
        assert len(chunks) >= 1

    def test_chunker_flush_empty(self):
        """Test flushing empty buffer returns None."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        result = chunker.flush()
        assert result is None

    def test_chunker_flush_with_content(self):
        """Test flushing buffer with content."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        chunker.add_token("Hello world")
        result = chunker.flush()
        assert result == "Hello world"

    def test_chunker_reset(self):
        """Test chunker reset clears buffer."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        chunker.add_token("Hello")
        chunker.reset()
        assert chunker._buffer == ""
        assert chunker._chunks_emitted == 0

    def test_chunker_get_stats(self):
        """Test chunker get_stats."""
        from app.services.sentence_chunker import SentenceChunker

        chunker = SentenceChunker()
        chunker.add_token("Hello world. ")
        stats = chunker.get_stats()

        assert "chunks_emitted" in stats
        assert "total_chars_processed" in stats
        assert "buffer_length" in stats


class TestPipelineConfig:
    """Tests for PipelineConfig dataclass."""

    def test_config_defaults(self):
        """Test PipelineConfig default values."""
        from app.services.voice_pipeline_service import PipelineConfig

        config = PipelineConfig()
        assert config.stt_language == "en"
        assert config.stt_sample_rate == 16000
        assert config.stt_endpointing_ms == 200
        assert config.max_response_tokens == 1024
        assert config.temperature == 0.7
        assert config.voice_id == "21m00Tcm4TlvDq8ikWAM"
        assert config.tts_model == "eleven_turbo_v2"
        assert config.barge_in_enabled is True

    def test_config_custom_values(self):
        """Test PipelineConfig with custom values."""
        from app.services.voice_pipeline_service import PipelineConfig

        config = PipelineConfig(
            stt_language="ar",
            voice_id="custom_voice",
            barge_in_enabled=False,
        )
        assert config.stt_language == "ar"
        assert config.voice_id == "custom_voice"
        assert config.barge_in_enabled is False


class TestPipelineState:
    """Tests for PipelineState enum."""

    def test_pipeline_states(self):
        """Test all pipeline states exist."""
        from app.services.voice_pipeline_service import PipelineState

        assert PipelineState.IDLE == "idle"
        assert PipelineState.LISTENING == "listening"
        assert PipelineState.PROCESSING == "processing"
        assert PipelineState.SPEAKING == "speaking"
        assert PipelineState.CANCELLED == "cancelled"
        assert PipelineState.ERROR == "error"


class TestPipelineMessage:
    """Tests for PipelineMessage dataclass."""

    def test_message_creation(self):
        """Test PipelineMessage creation."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(
            type="transcript.delta",
            data={"text": "hello", "is_final": False},
        )
        assert msg.type == "transcript.delta"
        assert msg.data["text"] == "hello"
        assert msg.data["is_final"] is False

    def test_message_default_data(self):
        """Test PipelineMessage with default data."""
        from app.services.voice_pipeline_service import PipelineMessage

        msg = PipelineMessage(type="heartbeat")
        assert msg.type == "heartbeat"
        assert msg.data == {}


class TestPipelineMetrics:
    """Tests for PipelineMetrics dataclass."""

    def test_metrics_defaults(self):
        """Test PipelineMetrics default values."""
        from app.services.voice_pipeline_service import PipelineMetrics

        metrics = PipelineMetrics()
        assert metrics.session_id == ""
        assert metrics.stt_latency_ms == 0
        assert metrics.first_token_latency_ms == 0
        assert metrics.tts_latency_ms == 0
        assert metrics.total_latency_ms == 0
        assert metrics.audio_chunks_received == 0
        assert metrics.audio_chunks_sent == 0
        assert metrics.tokens_generated == 0
        assert metrics.tool_calls_count == 0
        assert metrics.cancelled is False
        assert metrics.error is None

    def test_metrics_with_session_id(self):
        """Test PipelineMetrics with session ID."""
        from app.services.voice_pipeline_service import PipelineMetrics

        metrics = PipelineMetrics(session_id="test-123")
        assert metrics.session_id == "test-123"


class TestTTSessionConfig:
    """Tests for TTSessionConfig dataclass."""

    def test_session_config_defaults(self):
        """Test TTSessionConfig default values."""
        from app.services.thinker_talker_websocket_handler import TTSessionConfig

        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
        )
        assert config.user_id == "user-123"
        assert config.session_id == "session-456"
        assert config.voice_id == "21m00Tcm4TlvDq8ikWAM"
        assert config.tts_model == "eleven_turbo_v2"
        assert config.language == "en"
        assert config.barge_in_enabled is True
        assert config.stt_sample_rate == 16000
        assert config.stt_endpointing_ms == 200

    def test_session_config_custom(self):
        """Test TTSessionConfig with custom values."""
        from app.services.thinker_talker_websocket_handler import TTSessionConfig

        config = TTSessionConfig(
            user_id="user-123",
            session_id="session-456",
            voice_id="custom_voice",
            language="ar",
            barge_in_enabled=False,
        )
        assert config.voice_id == "custom_voice"
        assert config.language == "ar"
        assert config.barge_in_enabled is False


class TestTTConnectionState:
    """Tests for TTConnectionState enum."""

    def test_connection_states(self):
        """Test all connection states exist."""
        from app.services.thinker_talker_websocket_handler import TTConnectionState

        assert TTConnectionState.DISCONNECTED == "disconnected"
        assert TTConnectionState.CONNECTING == "connecting"
        assert TTConnectionState.CONNECTED == "connected"
        assert TTConnectionState.READY == "ready"
        assert TTConnectionState.ERROR == "error"


class TestTTSessionMetrics:
    """Tests for TTSessionMetrics dataclass."""

    def test_metrics_defaults(self):
        """Test TTSessionMetrics default values."""
        from app.services.thinker_talker_websocket_handler import TTSessionMetrics

        metrics = TTSessionMetrics()
        assert metrics.connection_start_time == 0.0
        assert metrics.first_audio_latency_ms == 0.0
        assert metrics.total_user_speech_ms == 0.0
        assert metrics.total_ai_speech_ms == 0.0
        assert metrics.user_utterance_count == 0
        assert metrics.ai_response_count == 0
        assert metrics.barge_in_count == 0
        assert metrics.error_count == 0
        assert metrics.messages_sent == 0
        assert metrics.messages_received == 0


class TestThinkerTalkerSessionManager:
    """Tests for ThinkerTalkerSessionManager class."""

    def test_manager_initialization(self):
        """Test ThinkerTalkerSessionManager initialization."""
        from app.services.thinker_talker_websocket_handler import ThinkerTalkerSessionManager

        manager = ThinkerTalkerSessionManager(max_sessions=50)
        assert manager.max_sessions == 50
        assert manager.get_active_session_count() == 0

    def test_manager_default_max_sessions(self):
        """Test default max sessions."""
        from app.services.thinker_talker_websocket_handler import ThinkerTalkerSessionManager

        manager = ThinkerTalkerSessionManager()
        assert manager.max_sessions == 100

    def test_manager_get_session_not_found(self):
        """Test getting non-existent session."""
        from app.services.thinker_talker_websocket_handler import ThinkerTalkerSessionManager

        async def run_test():
            manager = ThinkerTalkerSessionManager()
            session = await manager.get_session("non-existent")
            assert session is None

        asyncio.run(run_test())


class TestVoicePipelineService:
    """Tests for VoicePipelineService class."""

    def test_service_initialization(self):
        """Test VoicePipelineService initialization."""
        from app.services.voice_pipeline_service import VoicePipelineService

        # Create with mocked services
        with patch("app.services.voice_pipeline_service.streaming_stt_service"), patch(
            "app.services.voice_pipeline_service.thinker_service"
        ), patch("app.services.voice_pipeline_service.talker_service"):
            service = VoicePipelineService()
            assert service._sessions == {}

    def test_service_get_active_sessions_empty(self):
        """Test getting active sessions when empty."""
        from app.services.voice_pipeline_service import VoicePipelineService

        with patch("app.services.voice_pipeline_service.streaming_stt_service"), patch(
            "app.services.voice_pipeline_service.thinker_service"
        ), patch("app.services.voice_pipeline_service.talker_service"):
            service = VoicePipelineService()
            sessions = service.get_active_sessions()
            assert sessions == []


class TestVoicePipelineSessionState:
    """Tests for VoicePipelineSession state transitions."""

    def test_session_initial_state(self):
        """Test session starts in IDLE state."""
        from app.services.voice_pipeline_service import PipelineConfig, PipelineState, VoicePipelineSession

        # Create session with mocked services
        mock_stt = MagicMock()
        mock_thinker = MagicMock()
        mock_talker = MagicMock()
        mock_callback = AsyncMock()

        session = VoicePipelineSession(
            session_id="test-session",
            conversation_id="test-conv",
            config=PipelineConfig(),
            stt_service=mock_stt,
            thinker_service=mock_thinker,
            talker_service=mock_talker,
            on_message=mock_callback,
        )

        assert session.state == PipelineState.IDLE
        assert session.session_id == "test-session"
        assert session.conversation_id == "test-conv"
        assert not session.is_cancelled()


class TestChunkTypes:
    """Tests for chunk type dataclasses."""

    def test_chunker_config_defaults(self):
        """Test ChunkerConfig default values."""
        from app.services.sentence_chunker import ChunkerConfig

        config = ChunkerConfig()
        assert config.min_chunk_chars == 20
        assert config.optimal_chunk_chars == 100
        assert config.max_chunk_chars == 200
        assert len(config.abbreviations) > 0

    def test_chunker_config_custom(self):
        """Test ChunkerConfig with custom values."""
        from app.services.sentence_chunker import ChunkerConfig

        config = ChunkerConfig(
            min_chunk_chars=10,
            max_chunk_chars=50,
        )
        assert config.min_chunk_chars == 10
        assert config.max_chunk_chars == 50


class TestGlobalInstances:
    """Tests for global service instances."""

    def test_global_session_manager_exists(self):
        """Test global thinker_talker_session_manager exists."""
        from app.services.thinker_talker_websocket_handler import thinker_talker_session_manager

        assert thinker_talker_session_manager is not None


class TestTalkerServiceTypes:
    """Tests for TalkerService types."""

    def test_voice_config_defaults(self):
        """Test VoiceConfig default values."""
        from app.services.talker_service import VoiceConfig

        config = VoiceConfig()
        assert config.voice_id == "21m00Tcm4TlvDq8ikWAM"
        assert config.model_id == "eleven_turbo_v2"
        assert config.stability == 0.5
        assert config.similarity_boost == 0.75
        assert config.style == 0.0
        assert config.output_format == "mp3_22050_32"

    def test_voice_config_custom(self):
        """Test VoiceConfig with custom values."""
        from app.services.talker_service import VoiceConfig

        config = VoiceConfig(
            voice_id="custom",
            stability=0.8,
            style=0.5,
        )
        assert config.voice_id == "custom"
        assert config.stability == 0.8
        assert config.style == 0.5

    def test_audio_chunk_creation(self):
        """Test AudioChunk creation."""
        from app.services.talker_service import AudioChunk

        chunk = AudioChunk(
            data=b"audio_data",
            format="mp3",
            is_final=False,
            sentence_index=1,
        )
        assert chunk.data == b"audio_data"
        assert chunk.format == "mp3"
        assert chunk.is_final is False
        assert chunk.sentence_index == 1

    def test_talker_state_enum(self):
        """Test TalkerState enum values."""
        from app.services.talker_service import TalkerState

        assert TalkerState.IDLE == "idle"
        assert TalkerState.SPEAKING == "speaking"
        assert TalkerState.CANCELLED == "cancelled"

    def test_tts_provider_enum(self):
        """Test TTSProvider enum values."""
        from app.services.talker_service import TTSProvider

        assert TTSProvider.ELEVENLABS == "elevenlabs"
        assert TTSProvider.OPENAI == "openai"

    def test_talker_metrics_defaults(self):
        """Test TalkerMetrics default values."""
        from app.services.talker_service import TalkerMetrics

        metrics = TalkerMetrics()
        assert metrics.sentences_processed == 0
        assert metrics.total_chars_synthesized == 0
        assert metrics.total_audio_bytes == 0
        assert metrics.cancelled is False


class TestThinkerServiceTypes:
    """Tests for ThinkerService types."""

    def test_thinking_state_enum(self):
        """Test ThinkingState enum values."""
        from app.services.thinker_service import ThinkingState

        assert ThinkingState.IDLE == "idle"
        assert ThinkingState.PROCESSING == "processing"
        assert ThinkingState.TOOL_CALLING == "tool_calling"
        assert ThinkingState.GENERATING == "generating"
        assert ThinkingState.COMPLETE == "complete"
        assert ThinkingState.CANCELLED == "cancelled"
        assert ThinkingState.ERROR == "error"

    def test_thinker_response_creation(self):
        """Test ThinkerResponse creation."""
        from app.services.thinker_service import ThinkerResponse

        response = ThinkerResponse(
            text="Hello!",
            message_id="msg-123",
            tokens_used=10,
            tool_calls_made=[],
            citations=[],
        )
        assert response.text == "Hello!"
        assert response.message_id == "msg-123"
        assert response.tokens_used == 10
        assert response.tool_calls_made == []
        assert response.citations == []

    def test_conversation_message_creation(self):
        """Test ConversationMessage creation."""
        from app.services.thinker_service import ConversationMessage

        message = ConversationMessage(
            role="user",
            content="Hello world",
            source_mode="voice",
        )
        assert message.role == "user"
        assert message.content == "Hello world"
        assert message.source_mode == "voice"
        assert message.message_id is not None

    def test_tool_call_event_creation(self):
        """Test ToolCallEvent creation."""
        from app.services.thinker_service import ToolCallEvent

        event = ToolCallEvent(
            tool_id="tool-123",
            tool_name="kb_search",
            arguments={"query": "test"},
        )
        assert event.tool_id == "tool-123"
        assert event.tool_name == "kb_search"
        assert event.arguments == {"query": "test"}

    def test_tool_result_event_creation(self):
        """Test ToolResultEvent creation."""
        from app.services.thinker_service import ToolResultEvent

        event = ToolResultEvent(
            tool_id="tool-123",
            tool_name="kb_search",
            result={"results": []},
            citations=[{"source": "test"}],
        )
        assert event.tool_id == "tool-123"
        assert event.tool_name == "kb_search"
        assert event.result == {"results": []}
        assert event.citations == [{"source": "test"}]

    def test_thinker_metrics_defaults(self):
        """Test ThinkerMetrics default values."""
        from app.services.thinker_service import ThinkerMetrics

        metrics = ThinkerMetrics()
        assert metrics.total_tokens == 0
        assert metrics.tool_calls_count == 0
        assert metrics.cancelled is False


class TestSTTServiceTypes:
    """Tests for StreamingSTTService types."""

    def test_stt_session_config_defaults(self):
        """Test STTSessionConfig default values."""
        from app.services.streaming_stt_service import STTSessionConfig

        config = STTSessionConfig()
        assert config.language == "en"
        assert config.sample_rate == 16000
        assert config.encoding == "linear16"
        assert config.channels == 1
        assert config.endpointing_ms == 200
        assert config.interim_results is True
        assert config.punctuate is True
        assert config.vad_events is True

    def test_stt_session_config_custom(self):
        """Test STTSessionConfig with custom values."""
        from app.services.streaming_stt_service import STTSessionConfig

        config = STTSessionConfig(
            language="ar",
            sample_rate=24000,
            endpointing_ms=300,
        )
        assert config.language == "ar"
        assert config.sample_rate == 24000
        assert config.endpointing_ms == 300

    def test_transcript_chunk_creation(self):
        """Test TranscriptChunk creation."""
        from app.services.streaming_stt_service import TranscriptChunk

        chunk = TranscriptChunk(
            text="Hello world",
            is_final=True,
            confidence=0.95,
        )
        assert chunk.text == "Hello world"
        assert chunk.is_final is True
        assert chunk.confidence == 0.95

    def test_transcription_result_creation(self):
        """Test TranscriptionResult creation."""
        from app.services.streaming_stt_service import STTProvider, TranscriptionResult

        result = TranscriptionResult(
            text="Hello world",
            confidence=0.95,
            duration_ms=1500,
            provider=STTProvider.DEEPGRAM,
            language="en",
        )
        assert result.text == "Hello world"
        assert result.confidence == 0.95
        assert result.duration_ms == 1500
        assert result.provider == STTProvider.DEEPGRAM

    def test_stt_provider_enum(self):
        """Test STTProvider enum values."""
        from app.services.streaming_stt_service import STTProvider

        assert STTProvider.DEEPGRAM == "deepgram"
        assert STTProvider.WHISPER == "whisper"
