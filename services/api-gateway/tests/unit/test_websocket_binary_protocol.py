"""
Unit Tests for WebSocket Binary Protocol (Phase 1 Efficiency)

Tests the binary audio protocol and sequence number handling in the
Thinker/Talker WebSocket handler.

Features tested:
- Binary frame parsing (5-byte header + audio data)
- Sequence number validation
- Out-of-order frame detection
- Binary audio output
- Protocol negotiation
"""

from unittest.mock import AsyncMock, patch

import pytest
from app.services.thinker_talker_websocket_handler import (
    BINARY_FRAME_TYPE_AUDIO_INPUT,
    BINARY_FRAME_TYPE_AUDIO_OUTPUT,
    BINARY_HEADER_SIZE,
    ThinkerTalkerWebSocketHandler,
    TTSessionConfig,
)


class TestBinaryFrameConstants:
    """Test binary frame constants are correctly defined."""

    def test_audio_input_frame_type(self):
        """Audio input frame type should be 0x01."""
        assert BINARY_FRAME_TYPE_AUDIO_INPUT == 0x01

    def test_audio_output_frame_type(self):
        """Audio output frame type should be 0x02."""
        assert BINARY_FRAME_TYPE_AUDIO_OUTPUT == 0x02

    def test_header_size(self):
        """Header size should be 5 bytes (1 type + 4 sequence)."""
        assert BINARY_HEADER_SIZE == 5


class TestTTSessionConfigBinaryProtocol:
    """Test TTSessionConfig binary protocol fields."""

    def test_default_binary_protocol_disabled(self):
        """Binary protocol should be disabled by default."""
        config = TTSessionConfig(user_id="test", session_id="test")
        assert config.binary_protocol_enabled is False

    def test_default_message_batching_disabled(self):
        """Message batching should be disabled by default."""
        config = TTSessionConfig(user_id="test", session_id="test")
        assert config.message_batching_enabled is False

    def test_sequence_counters_initialized(self):
        """Sequence counters should start at 0."""
        config = TTSessionConfig(user_id="test", session_id="test")
        assert config._audio_sequence_in == 0
        assert config._audio_sequence_out == 0
        assert config._message_sequence == 0


class TestBinaryFrameHandling:
    """Test binary frame parsing and handling."""

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock()
        ws.receive = AsyncMock()
        ws.send_bytes = AsyncMock()
        ws.send_json = AsyncMock()
        return ws

    @pytest.fixture
    def handler(self, mock_websocket):
        """Create a handler with binary protocol enabled."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="test-session",
            binary_protocol_enabled=True,
        )
        handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
        )
        # Mock the pipeline session
        handler._pipeline_session = AsyncMock()
        handler._pipeline_session.send_audio = AsyncMock()
        return handler

    @pytest.mark.asyncio
    async def test_parse_valid_binary_frame(self, handler):
        """Valid binary frame should be parsed correctly."""
        # Create a valid binary frame: [type:1][sequence:4][audio:N]
        sequence = 42
        audio_data = b"\x00\x01\x02\x03\x04\x05\x06\x07"  # 8 bytes of audio

        frame = bytes([BINARY_FRAME_TYPE_AUDIO_INPUT])
        frame += sequence.to_bytes(4, "big")
        frame += audio_data

        await handler._handle_binary_frame(frame)

        # Verify audio was sent to pipeline
        handler._pipeline_session.send_audio.assert_called_once_with(audio_data)

    @pytest.mark.asyncio
    async def test_reject_short_binary_frame(self, handler):
        """Binary frame shorter than header should be rejected."""
        short_frame = b"\x01\x00\x00"  # Only 3 bytes, need 5

        await handler._handle_binary_frame(short_frame)

        # Verify audio was NOT sent to pipeline
        handler._pipeline_session.send_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_sequence_number_tracking(self, handler):
        """Sequence numbers should be tracked and incremented."""
        initial_seq = handler.config._audio_sequence_in

        # Send first frame
        frame1 = bytes([BINARY_FRAME_TYPE_AUDIO_INPUT])
        frame1 += (0).to_bytes(4, "big")
        frame1 += b"\x00\x01"

        await handler._handle_binary_frame(frame1)

        # Sequence should be incremented
        assert handler.config._audio_sequence_in == initial_seq + 1

    @pytest.mark.asyncio
    async def test_out_of_order_frame_dropped(self, handler):
        """Out-of-order frames (sequence < expected) should be dropped."""
        # First, advance the sequence
        handler.config._audio_sequence_in = 10

        # Send an old frame (sequence = 5, expected = 10)
        old_frame = bytes([BINARY_FRAME_TYPE_AUDIO_INPUT])
        old_frame += (5).to_bytes(4, "big")
        old_frame += b"\x00\x01"

        await handler._handle_binary_frame(old_frame)

        # Verify audio was NOT sent (frame was dropped)
        handler._pipeline_session.send_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_sequence_gap_detected(self, handler):
        """Gaps in sequence numbers should be logged but processed."""
        # Set expected sequence to 10
        handler.config._audio_sequence_in = 10

        # Send frame with sequence 12 (gap of 2)
        frame = bytes([BINARY_FRAME_TYPE_AUDIO_INPUT])
        frame += (12).to_bytes(4, "big")
        frame += b"\x00\x01"

        await handler._handle_binary_frame(frame)

        # Audio should still be processed
        handler._pipeline_session.send_audio.assert_called_once()
        # Sequence should advance to 13
        assert handler.config._audio_sequence_in == 13


class TestBinaryAudioOutput:
    """Test binary audio output sending."""

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock()
        ws.send_bytes = AsyncMock()
        return ws

    @pytest.fixture
    def handler(self, mock_websocket):
        """Create a handler with binary protocol enabled."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="test-session",
            binary_protocol_enabled=True,
        )
        handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
        )
        return handler

    @pytest.mark.asyncio
    async def test_send_audio_binary(self, handler):
        """Audio output should be sent as binary frame."""
        audio_data = b"\x00\x01\x02\x03\x04\x05\x06\x07"

        await handler._send_audio_binary(audio_data)

        # Verify send_bytes was called
        handler.websocket.send_bytes.assert_called_once()

        # Verify frame format
        sent_frame = handler.websocket.send_bytes.call_args[0][0]
        assert sent_frame[0] == BINARY_FRAME_TYPE_AUDIO_OUTPUT
        assert len(sent_frame) == BINARY_HEADER_SIZE + len(audio_data)

    @pytest.mark.asyncio
    async def test_audio_sequence_incremented(self, handler):
        """Audio output sequence should be incremented."""
        initial_seq = handler.config._audio_sequence_out

        await handler._send_audio_binary(b"\x00\x01")
        assert handler.config._audio_sequence_out == initial_seq + 1

        await handler._send_audio_binary(b"\x00\x01")
        assert handler.config._audio_sequence_out == initial_seq + 2

    @pytest.mark.asyncio
    async def test_sequence_number_in_frame(self, handler):
        """Sequence number should be correctly encoded in frame."""
        handler.config._audio_sequence_out = 256  # 0x100

        await handler._send_audio_binary(b"\x00")

        sent_frame = handler.websocket.send_bytes.call_args[0][0]
        # Extract sequence from bytes 1-4 (big-endian)
        sequence = int.from_bytes(sent_frame[1:5], "big")
        assert sequence == 256


class TestMessageSequenceNumbers:
    """Test that all JSON messages include sequence numbers."""

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock()
        ws.send_json = AsyncMock()
        return ws

    @pytest.fixture
    def handler(self, mock_websocket):
        """Create a handler."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="test-session",
        )
        handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
        )
        return handler

    @pytest.mark.asyncio
    async def test_message_includes_sequence(self, handler):
        """All JSON messages should include seq field."""
        await handler._send_message({"type": "test"})

        sent_msg = handler.websocket.send_json.call_args[0][0]
        assert "seq" in sent_msg
        assert sent_msg["seq"] == 0

    @pytest.mark.asyncio
    async def test_sequence_incremented(self, handler):
        """Message sequence should increment with each message."""
        await handler._send_message({"type": "test1"})
        await handler._send_message({"type": "test2"})

        calls = handler.websocket.send_json.call_args_list
        assert calls[0][0][0]["seq"] == 0
        assert calls[1][0][0]["seq"] == 1


class TestProtocolNegotiation:
    """Test protocol negotiation in session.init."""

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock()
        ws.send_json = AsyncMock()
        ws.accept = AsyncMock()
        return ws

    @pytest.fixture
    def handler(self, mock_websocket):
        """Create a handler."""
        config = TTSessionConfig(
            user_id="test-user",
            session_id="test-session",
        )
        handler = ThinkerTalkerWebSocketHandler(
            websocket=mock_websocket,
            config=config,
        )
        return handler

    @pytest.mark.asyncio
    async def test_protocol_negotiation_with_binary_audio(self, handler):
        """When client requests binary_audio and flag is enabled, enable it."""
        with patch(
            "app.services.feature_flags.feature_flag_service.is_enabled",
            new_callable=AsyncMock,
        ) as mock_flag:
            mock_flag.return_value = True

            session_init_msg = {
                "type": "session.init",
                "features": ["binary_audio"],
                "protocol_version": "2.0",
            }

            await handler._handle_client_message(session_init_msg)

            assert handler.config.binary_protocol_enabled is True

            # Check ack message
            sent_msg = handler.websocket.send_json.call_args[0][0]
            assert sent_msg["type"] == "session.init.ack"
            assert "binary_audio" in sent_msg["features"]
            assert sent_msg["protocol_version"] == "2.0"

    @pytest.mark.asyncio
    async def test_protocol_negotiation_without_features(self, handler):
        """When client doesn't request features, use legacy protocol."""
        session_init_msg = {
            "type": "session.init",
        }

        await handler._handle_client_message(session_init_msg)

        assert handler.config.binary_protocol_enabled is False

        # Check ack message
        sent_msg = handler.websocket.send_json.call_args[0][0]
        assert sent_msg["type"] == "session.init.ack"
        assert sent_msg["features"] == []
        assert sent_msg["protocol_version"] == "1.0"
