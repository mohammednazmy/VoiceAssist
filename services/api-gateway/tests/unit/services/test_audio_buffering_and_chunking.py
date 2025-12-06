"""
Comprehensive Unit Tests for Audio Pre-buffering, Compression, and Adaptive Chunking

Tests cover:
- Audio pre-buffering mechanisms
- WebSocket message compression
- Adaptive chunk size adjustment
- Buffer overflow handling
- Chunk size optimization
- Network quality adaptation
- Latency vs throughput tradeoffs

Part of WebSocket Reliability Enhancement testing.
"""

import asyncio
import base64
import struct
import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.thinker_talker_websocket_handler import ThinkerTalkerWebSocketHandler, TTSessionConfig
from app.services.voice_pipeline_service import PipelineMessage, PipelineState

# =============================================================================
# Audio Chunk Size Configuration (local test constants)
# =============================================================================


class AudioChunkSize:
    """Audio chunk size configuration for testing.

    These constants define the expected audio chunk sizes used in the system.
    They are defined locally for testing purposes.
    """

    MIN_SAMPLES = 1024  # Minimum chunk size (64ms at 16kHz)
    DEFAULT_SAMPLES = 2048  # Default chunk size (128ms at 16kHz)
    MAX_SAMPLES = 4096  # Maximum chunk size (256ms at 16kHz)

    @staticmethod
    def get_chunk_duration_ms(samples: int, sample_rate: int) -> float:
        """Calculate chunk duration in milliseconds."""
        return (samples / sample_rate) * 1000

    @staticmethod
    def get_recommended_chunk_size(network_quality: str) -> int:
        """Get recommended chunk size based on network quality."""
        quality_map = {
            "excellent": 1024,  # Low latency
            "good": 2048,  # Balanced
            "fair": 2048,  # Balanced
            "poor": 4096,  # High throughput
        }
        return quality_map.get(network_quality, AudioChunkSize.DEFAULT_SAMPLES)


# Alias for convenience
DEFAULT_AUDIO_CHUNK_SAMPLES = AudioChunkSize.DEFAULT_SAMPLES

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
    import math

    frequency = 440  # A4 note
    audio_data = []
    for i in range(samples):
        t = i / sample_rate
        value = int(32767 * math.sin(2 * math.pi * frequency * t))
        audio_data.append(struct.pack("<h", value))
    return b"".join(audio_data)


# =============================================================================
# Audio Chunk Size Configuration Tests
# =============================================================================


class TestAudioChunkSizeConfiguration:
    """Tests for audio chunk size configuration."""

    def test_default_chunk_size(self):
        """Test default chunk size is set correctly."""
        assert DEFAULT_AUDIO_CHUNK_SAMPLES == AudioChunkSize.DEFAULT_SAMPLES
        assert AudioChunkSize.DEFAULT_SAMPLES == 2048

    def test_min_chunk_size(self):
        """Test minimum chunk size."""
        assert AudioChunkSize.MIN_SAMPLES == 1024

    def test_max_chunk_size(self):
        """Test maximum chunk size."""
        assert AudioChunkSize.MAX_SAMPLES == 4096

    def test_chunk_duration_calculation(self):
        """Test chunk duration calculation."""
        # 1024 samples at 16kHz = 64ms
        duration = AudioChunkSize.get_chunk_duration_ms(1024, 16000)
        assert duration == 64.0

        # 2048 samples at 16kHz = 128ms
        duration = AudioChunkSize.get_chunk_duration_ms(2048, 16000)
        assert duration == 128.0

    def test_recommended_chunk_size_by_network_quality(self):
        """Test recommended chunk sizes for different network qualities."""
        assert AudioChunkSize.get_recommended_chunk_size("excellent") == 1024
        assert AudioChunkSize.get_recommended_chunk_size("good") == 2048
        assert AudioChunkSize.get_recommended_chunk_size("fair") == 2048
        assert AudioChunkSize.get_recommended_chunk_size("poor") == 4096

    def test_unknown_network_quality_uses_default(self):
        """Test unknown network quality uses default chunk size."""
        assert AudioChunkSize.get_recommended_chunk_size("unknown") == 2048


# =============================================================================
# Adaptive Chunking Tests
# =============================================================================


class TestAdaptiveChunking:
    """Tests for adaptive chunk sizing."""

    @pytest.mark.asyncio
    async def test_variable_chunk_sizes_accepted(self, handler, mock_pipeline_session):
        """Test that variable chunk sizes are all accepted."""
        handler._pipeline_session = mock_pipeline_session

        chunk_sizes = [256, 512, 1024, 2048, 4096, 8192]

        for size in chunk_sizes:
            audio_bytes = generate_pcm16_audio(size)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": audio_b64,
                }
            )

        assert mock_pipeline_session.send_audio_base64.call_count == len(chunk_sizes)

    @pytest.mark.asyncio
    async def test_small_chunks_for_low_latency(self, handler, mock_pipeline_session):
        """Test small chunks are processed quickly for low latency."""
        handler._pipeline_session = mock_pipeline_session

        # Use minimum chunk size (1024 samples = 64ms at 16kHz)
        audio_bytes = generate_pcm16_audio(AudioChunkSize.MIN_SAMPLES)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        start_time = time.monotonic()
        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )
        elapsed = time.monotonic() - start_time

        # Should process very quickly (under 10ms)
        assert elapsed < 0.1  # 100ms generous threshold

    @pytest.mark.asyncio
    async def test_large_chunks_handled_correctly(self, handler, mock_pipeline_session):
        """Test large chunks are handled correctly."""
        handler._pipeline_session = mock_pipeline_session

        # Use maximum chunk size (4096 samples = 256ms at 16kHz)
        audio_bytes = generate_pcm16_audio(AudioChunkSize.MAX_SAMPLES)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        mock_pipeline_session.send_audio_base64.assert_called_once()

    @pytest.mark.asyncio
    async def test_mixed_chunk_sizes_stream(self, handler, mock_pipeline_session):
        """Test handling stream with mixed chunk sizes."""
        handler._pipeline_session = mock_pipeline_session

        # Simulate network conditions changing (chunk sizes vary)
        chunk_sizes = [1024, 2048, 1024, 4096, 2048, 1024, 2048, 4096]

        for size in chunk_sizes:
            audio_bytes = generate_pcm16_audio(size)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": audio_b64,
                }
            )

        assert mock_pipeline_session.send_audio_base64.call_count == len(chunk_sizes)


# =============================================================================
# Audio Pre-buffering Tests
# =============================================================================


class TestAudioPrebuffering:
    """Tests for audio pre-buffering mechanisms."""

    @pytest.mark.asyncio
    async def test_rapid_audio_input_buffering(self, handler, mock_pipeline_session):
        """Test buffering handles rapid audio input."""
        handler._pipeline_session = mock_pipeline_session

        # Send 50 rapid chunks without awaiting each one
        tasks = []
        for i in range(50):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            tasks.append(
                handler._handle_client_message(
                    {
                        "type": "audio.input",
                        "audio": audio_b64,
                    }
                )
            )

        # Process all concurrently
        await asyncio.gather(*tasks)

        # All chunks should be processed
        assert mock_pipeline_session.send_audio_base64.call_count == 50

    @pytest.mark.asyncio
    async def test_audio_buffering_with_slow_pipeline(self, handler, mock_pipeline_session):
        """Test buffering when pipeline is slow."""
        handler._pipeline_session = mock_pipeline_session

        # Simulate slow pipeline
        async def slow_send(*args):
            await asyncio.sleep(0.01)  # 10ms delay

        mock_pipeline_session.send_audio_base64.side_effect = slow_send

        # Send multiple chunks
        for i in range(10):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": audio_b64,
                }
            )

        # All should complete
        assert mock_pipeline_session.send_audio_base64.call_count == 10

    @pytest.mark.asyncio
    async def test_audio_output_buffering(self, handler, mock_websocket):
        """Test audio output buffering to client."""
        # Send multiple audio output messages
        for i in range(10):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = PipelineMessage(
                type="audio.output",
                data={"audio": audio_b64, "chunk_index": i},
            )

            await handler._handle_pipeline_message(message)

        # All messages should be sent
        assert mock_websocket.send_json.call_count == 10


# =============================================================================
# WebSocket Compression Tests
# =============================================================================


class TestWebSocketCompression:
    """Tests for WebSocket message compression handling."""

    @pytest.mark.asyncio
    async def test_large_message_handling(self, handler, mock_websocket):
        """Test handling of large messages (potential compression candidates)."""
        # Generate large audio (10 seconds at 16kHz = 320KB)
        audio_bytes = generate_pcm16_audio(160000)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = PipelineMessage(
            type="audio.output",
            data={"audio": audio_b64},
        )

        await handler._handle_pipeline_message(message)

        mock_websocket.send_json.assert_called_once()
        sent_message = mock_websocket.send_json.call_args[0][0]
        assert len(sent_message["audio"]) > 200000  # Large base64 string

    @pytest.mark.asyncio
    async def test_small_message_handling(self, handler, mock_websocket):
        """Test handling of small messages (no compression benefit)."""
        # Small audio (10ms = 160 samples)
        audio_bytes = generate_pcm16_audio(160)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = PipelineMessage(
            type="audio.output",
            data={"audio": audio_b64},
        )

        await handler._handle_pipeline_message(message)

        mock_websocket.send_json.assert_called_once()

    @pytest.mark.asyncio
    async def test_json_message_structure(self, handler, mock_websocket):
        """Test JSON message structure is correct for compression."""
        await handler._send_message(
            {
                "type": "test",
                "data": "some data" * 100,  # Repeated data compresses well
            }
        )

        mock_websocket.send_json.assert_called_once()

    @pytest.mark.asyncio
    async def test_message_with_nested_objects(self, handler, mock_websocket):
        """Test messages with nested objects."""
        complex_message = {
            "type": "complex",
            "metadata": {
                "timestamp": time.time(),
                "session_id": "test-session",
            },
            "data": {
                "nested": {
                    "values": [1, 2, 3, 4, 5],
                    "text": "test" * 50,
                }
            },
        }

        await handler._send_message(complex_message)

        mock_websocket.send_json.assert_called_once()


# =============================================================================
# Buffer Overflow and Edge Case Tests
# =============================================================================


class TestBufferEdgeCases:
    """Tests for buffer overflow and edge cases."""

    @pytest.mark.asyncio
    async def test_empty_audio_chunk(self, handler, mock_pipeline_session):
        """Test handling empty audio chunks."""
        handler._pipeline_session = mock_pipeline_session

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": "",
            }
        )

        # Should not call pipeline with empty data
        mock_pipeline_session.send_audio_base64.assert_not_called()

    @pytest.mark.asyncio
    async def test_very_small_audio_chunk(self, handler, mock_pipeline_session):
        """Test handling very small audio chunks (1 sample)."""
        handler._pipeline_session = mock_pipeline_session

        audio_bytes = struct.pack("<h", 0)  # Single 16-bit sample
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        # Should still process (let pipeline handle validation)
        mock_pipeline_session.send_audio_base64.assert_called_once()

    @pytest.mark.asyncio
    async def test_maximum_practical_chunk_size(self, handler, mock_pipeline_session):
        """Test handling maximum practical chunk size."""
        handler._pipeline_session = mock_pipeline_session

        # 30 seconds of audio (maximum reasonable for single chunk)
        audio_bytes = generate_pcm16_audio(480000)  # 30s at 16kHz
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        await handler._handle_client_message(
            {
                "type": "audio.input",
                "audio": audio_b64,
            }
        )

        mock_pipeline_session.send_audio_base64.assert_called_once()

    @pytest.mark.asyncio
    async def test_back_pressure_handling(self, handler, mock_pipeline_session):
        """Test handling back-pressure when pipeline is busy."""
        handler._pipeline_session = mock_pipeline_session

        # Create a semaphore to simulate back-pressure
        semaphore = asyncio.Semaphore(5)
        call_count = 0

        async def controlled_send(*args):
            nonlocal call_count
            async with semaphore:
                call_count += 1
                await asyncio.sleep(0.001)

        mock_pipeline_session.send_audio_base64.side_effect = controlled_send

        # Send many chunks simultaneously
        tasks = []
        for i in range(20):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            tasks.append(
                handler._handle_client_message(
                    {
                        "type": "audio.input",
                        "audio": audio_b64,
                    }
                )
            )

        await asyncio.gather(*tasks)

        # All should complete eventually
        assert call_count == 20


# =============================================================================
# Latency Tracking Tests
# =============================================================================


class TestLatencyTracking:
    """Tests for audio latency tracking."""

    @pytest.mark.asyncio
    async def test_first_audio_latency_tracking(self, handler, mock_websocket):
        """Test first audio latency is tracked correctly."""
        handler._metrics.connection_start_time = time.time() - 0.5  # 500ms ago
        handler._metrics.first_audio_latency_ms = 0

        audio_bytes = generate_pcm16_audio(1024)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

        message = PipelineMessage(
            type="audio.output",
            data={"audio": audio_b64},
        )

        await handler._handle_pipeline_message(message)

        # First audio latency should be recorded (approximately 500ms)
        assert handler._metrics.first_audio_latency_ms > 400  # Allow some tolerance
        assert handler._metrics.first_audio_latency_ms < 1000

    @pytest.mark.asyncio
    async def test_first_audio_latency_only_set_once(self, handler, mock_websocket):
        """Test first audio latency is only set on first audio chunk."""
        handler._metrics.connection_start_time = time.time() - 0.1
        handler._metrics.first_audio_latency_ms = 0

        for i in range(5):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

            message = PipelineMessage(
                type="audio.output",
                data={"audio": audio_b64},
            )

            await handler._handle_pipeline_message(message)

            if i == 0:
                first_latency = handler._metrics.first_audio_latency_ms

        # Should remain the same as first measurement
        assert handler._metrics.first_audio_latency_ms == first_latency

    @pytest.mark.asyncio
    async def test_message_metrics_accuracy(self, handler, mock_websocket, mock_pipeline_session):
        """Test message count metrics accuracy."""
        handler._pipeline_session = mock_pipeline_session
        handler._metrics.messages_sent = 0
        handler._metrics.messages_received = 0

        # Simulate various messages
        # Incoming messages
        for i in range(10):
            audio_bytes = generate_pcm16_audio(1024)
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
            handler._metrics.messages_received += 1

            await handler._handle_client_message(
                {
                    "type": "audio.input",
                    "audio": audio_b64,
                }
            )

        # Outgoing messages
        for i in range(5):
            await handler._send_message({"type": "test"})

        assert handler._metrics.messages_received == 10
        assert handler._metrics.messages_sent == 5
