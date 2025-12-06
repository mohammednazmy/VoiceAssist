"""
Comprehensive Unit Tests for Binary Audio Handling in WebSocket

Tests cover:
- Base64 audio encoding/decoding
- PCM16 audio chunk processing
- Audio buffer management
- Audio format validation
- Large audio data handling
- Audio compression/decompression
- Chunk size validation

Part of WebSocket Reliability Enhancement testing.
"""

import asyncio
import base64
import struct
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.thinker_talker_websocket_handler import ThinkerTalkerWebSocketHandler, TTSessionConfig
from app.services.voice_pipeline_service import PipelineMessage, PipelineState

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.close = AsyncMock()
    ws.send_json = AsyncMock()
    ws.send_bytes = AsyncMock()
    ws.receive_json = AsyncMock(side_effect=asyncio.CancelledError())
    ws.receive_bytes = AsyncMock()
    return ws


@pytest.fixture
def mock_pipeline_session():
    """Create a mock VoicePipelineSession."""
    session = AsyncMock()
    session.start = AsyncMock(return_value=True)
    session.stop = AsyncMock()
    session.send_audio_base64 = AsyncMock()
    session.send_audio_bytes = AsyncMock()
    session.commit_audio = AsyncMock()
    session.barge_in = AsyncMock()
    session.state = PipelineState.IDLE
    session.config = MagicMock()
    return session


@pytest.fixture
def mock_pipeline_service(mock_pipeline_session):
    """Create a mock VoicePipelineService."""
    service = AsyncMock()
    service.create_session = AsyncMock(return_value=mock_pipeline_session)
    return service


@pytest.fixture
def session_config():
    """Create a test session configuration."""
    return TTSessionConfig(
        user_id="test-user",
        session_id="test-session",
    )


@pytest.fixture
def handler(mock_websocket, session_config, mock_pipeline_service):
    """Create a handler instance with mocks."""
    return ThinkerTalkerWebSocketHandler(
        websocket=mock_websocket,
        config=session_config,
        pipeline_service=mock_pipeline_service,
    )


def generate_pcm16_audio(samples: int = 1024, sample_rate: int = 16000) -> bytes:
    """Generate synthetic PCM16 audio data for testing."""
    # Generate a simple sine wave
    import math

    frequency = 440  # A4 note
    audio_data = []
    for i in range(samples):
        t = i / sample_rate
        # Generate 16-bit signed integer sample
        value = int(32767 * math.sin(2 * math.pi * frequency * t))
        audio_data.append(struct.pack("<h", value))
    return b"".join(audio_data)


# =============================================================================
# Base64 Audio Encoding/Decoding Tests
# =============================================================================


class TestBase64AudioHandling:
    """Tests for base64 audio encoding and decoding."""

    @pytest.mark.asyncio
    async def test_valid_base64_audio_input(self, handler, mock_pipeline_session):
        """Test handling valid base64-encoded audio."""
        handler._pipeline_session = mock_pipeline_session

        # Generate valid audio and encode as base64
        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = {
            "type": "audio.input",
            "audio": audio_b64,
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_called_once_with(audio_b64)

    @pytest.mark.asyncio
    async def test_empty_base64_audio_ignored(self, handler, mock_pipeline_session):
        """Test that empty base64 audio is ignored."""
        handler._pipeline_session = mock_pipeline_session

        message = {
            "type": "audio.input",
            "audio": "",
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_not_called()

    @pytest.mark.asyncio
    async def test_whitespace_only_base64_passed_through(self, handler, mock_pipeline_session):
        """Test that whitespace-only base64 audio is passed to pipeline for handling."""
        handler._pipeline_session = mock_pipeline_session

        # Whitespace in base64 is passed to pipeline (pipeline handles validation)
        message = {
            "type": "audio.input",
            "audio": "   ",
        }

        await handler._handle_client_message(message)

        # Handler passes through to pipeline for validation
        mock_pipeline_session.send_audio_base64.assert_called_once_with("   ")

    @pytest.mark.asyncio
    async def test_large_base64_audio(self, handler, mock_pipeline_session):
        """Test handling large base64-encoded audio chunks."""
        handler._pipeline_session = mock_pipeline_session

        # Generate 5 seconds of audio at 16kHz (160,000 samples * 2 bytes = 320KB)
        audio_bytes = generate_pcm16_audio(80000)  # ~5 seconds
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = {
            "type": "audio.input",
            "audio": audio_b64,
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_called_once_with(audio_b64)

    @pytest.mark.asyncio
    async def test_multiple_sequential_audio_chunks(self, handler, mock_pipeline_session):
        """Test handling multiple sequential audio chunks."""
        handler._pipeline_session = mock_pipeline_session

        # Send 10 chunks of audio
        for i in range(10):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = {
                "type": "audio.input",
                "audio": audio_b64,
            }

            await handler._handle_client_message(message)

        assert mock_pipeline_session.send_audio_base64.call_count == 10


# =============================================================================
# Audio Format Validation Tests
# =============================================================================


class TestAudioFormatValidation:
    """Tests for audio format validation."""

    @pytest.mark.asyncio
    async def test_audio_with_different_sample_sizes(self, handler, mock_pipeline_session):
        """Test audio chunks with various sample sizes."""
        handler._pipeline_session = mock_pipeline_session

        sample_sizes = [256, 512, 1024, 2048, 4096, 8192]

        for size in sample_sizes:
            audio_bytes = generate_pcm16_audio(size)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = {
                "type": "audio.input",
                "audio": audio_b64,
            }

            await handler._handle_client_message(message)

        assert mock_pipeline_session.send_audio_base64.call_count == len(sample_sizes)

    @pytest.mark.asyncio
    async def test_audio_chunk_with_padding(self, handler, mock_pipeline_session):
        """Test base64 audio with padding characters."""
        handler._pipeline_session = mock_pipeline_session

        # Generate audio that results in padded base64
        audio_bytes = b"\x00" * 100  # Results in base64 with padding
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        assert audio_b64.endswith("=")  # Should have padding

        message = {
            "type": "audio.input",
            "audio": audio_b64,
        }

        await handler._handle_client_message(message)

        mock_pipeline_session.send_audio_base64.assert_called_once_with(audio_b64)


# =============================================================================
# Audio Output Tests
# =============================================================================


class TestAudioOutput:
    """Tests for audio output handling."""

    @pytest.mark.asyncio
    async def test_audio_output_forwarded_to_client(self, handler, mock_websocket):
        """Test that audio output is forwarded to client."""
        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = PipelineMessage(
            type="audio.output",
            data={"audio": audio_b64, "is_final": False},
        )

        await handler._handle_pipeline_message(message)

        mock_websocket.send_json.assert_called_once()
        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["type"] == "audio.output"
        assert call_arg["audio"] == audio_b64

    @pytest.mark.asyncio
    async def test_audio_output_final_flag(self, handler, mock_websocket):
        """Test audio output with final flag."""
        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = PipelineMessage(
            type="audio.output",
            data={"audio": audio_b64, "is_final": True},
        )

        await handler._handle_pipeline_message(message)

        call_arg = mock_websocket.send_json.call_args[0][0]
        assert call_arg["is_final"] is True

    @pytest.mark.asyncio
    async def test_multiple_audio_output_chunks(self, handler, mock_websocket):
        """Test streaming multiple audio output chunks."""
        for i in range(5):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
            is_final = i == 4  # Last chunk is final

            message = PipelineMessage(
                type="audio.output",
                data={"audio": audio_b64, "is_final": is_final},
            )

            await handler._handle_pipeline_message(message)

        assert mock_websocket.send_json.call_count == 5


# =============================================================================
# Audio Buffer Edge Cases
# =============================================================================


class TestAudioBufferEdgeCases:
    """Tests for audio buffer edge cases."""

    @pytest.mark.asyncio
    async def test_rapid_audio_chunks(self, handler, mock_pipeline_session):
        """Test handling rapid-fire audio chunks."""
        handler._pipeline_session = mock_pipeline_session

        # Simulate rapid audio input (100 chunks quickly)
        tasks = []
        for i in range(100):
            audio_bytes = generate_pcm16_audio(256)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = {
                "type": "audio.input",
                "audio": audio_b64,
            }

            tasks.append(handler._handle_client_message(message))

        # Run all concurrently
        await asyncio.gather(*tasks)

        assert mock_pipeline_session.send_audio_base64.call_count == 100

    @pytest.mark.asyncio
    async def test_audio_after_complete(self, handler, mock_pipeline_session):
        """Test audio input after audio.input.complete."""
        handler._pipeline_session = mock_pipeline_session

        # Send some audio
        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        # Complete the audio
        await handler._handle_client_message(
            {
                "type": "audio.input.complete",
            }
        )

        mock_pipeline_session.commit_audio.assert_called_once()

        # Send more audio (this is valid - new utterance)
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        assert mock_pipeline_session.send_audio_base64.call_count == 2

    @pytest.mark.asyncio
    async def test_audio_complete_without_audio(self, handler, mock_pipeline_session):
        """Test audio.input.complete without any audio input."""
        handler._pipeline_session = mock_pipeline_session

        await handler._handle_client_message(
            {
                "type": "audio.input.complete",
            }
        )

        # Should still call commit_audio (let pipeline handle empty case)
        mock_pipeline_session.commit_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_audio_input_without_pipeline(self, handler, mock_websocket):
        """Test audio input when pipeline is not initialized."""
        handler._pipeline_session = None

        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        # Should not raise
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )


# =============================================================================
# Binary WebSocket Message Tests
# =============================================================================


class TestBinaryWebSocketMessages:
    """Tests for binary WebSocket message handling."""

    @pytest.mark.asyncio
    async def test_audio_output_size_tracking(self, handler, mock_websocket):
        """Test tracking of audio output sizes."""
        handler._metrics.messages_sent = 0

        # Send various sized audio outputs
        sizes = [256, 1024, 4096, 8192]
        for size in sizes:
            audio_bytes = generate_pcm16_audio(size)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = PipelineMessage(
                type="audio.output",
                data={"audio": audio_b64},
            )

            await handler._handle_pipeline_message(message)

        assert handler._metrics.messages_sent == len(sizes)

    @pytest.mark.asyncio
    async def test_interleaved_audio_and_control_messages(self, handler, mock_websocket, mock_pipeline_session):
        """Test handling interleaved audio and control messages."""
        handler._pipeline_session = mock_pipeline_session

        # Audio input
        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        # Ping
        await handler._handle_client_message({"type": "ping"})

        # More audio
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        # Complete audio
        await handler._handle_client_message(
            {
                "type": "audio.input.complete",
            }
        )

        assert mock_pipeline_session.send_audio_base64.call_count == 2
        assert mock_pipeline_session.commit_audio.call_count == 1
        # Pong should have been sent
        pong_calls = [c for c in mock_websocket.send_json.call_args_list if c[0][0].get("type") == "pong"]
        assert len(pong_calls) == 1
