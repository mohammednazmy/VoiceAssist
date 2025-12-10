"""
Unit Tests for WebSocket Message Batcher

Tests the message batching service for high-frequency WebSocket messages.

Features tested:
- Message queuing
- Batch flushing on timer
- Batch flushing on max size
- Immediate flush for critical message types
- Single message passthrough (no batch wrapper)
- Batcher lifecycle (start/stop)
"""

from unittest.mock import AsyncMock

import pytest
from app.services.websocket_message_batcher import BATCHABLE_MESSAGE_TYPES, BatcherConfig, WebSocketMessageBatcher


class TestBatcherConfig:
    """Test BatcherConfig defaults and customization."""

    def test_default_disabled(self):
        """Batcher should be disabled by default."""
        config = BatcherConfig()
        assert config.enabled is False

    def test_default_batch_window(self):
        """Default batch window should be 50ms."""
        config = BatcherConfig()
        assert config.batch_window_ms == 50.0

    def test_default_max_batch_size(self):
        """Default max batch size should be 20."""
        config = BatcherConfig()
        assert config.max_batch_size == 20

    def test_custom_config(self):
        """Config should accept custom values."""
        config = BatcherConfig(
            enabled=True,
            batch_window_ms=100.0,
            max_batch_size=50,
        )
        assert config.enabled is True
        assert config.batch_window_ms == 100.0
        assert config.max_batch_size == 50


class TestBatchableMessageTypes:
    """Test the set of batchable message types."""

    def test_response_delta_is_batchable(self):
        """response.delta should be batchable."""
        assert "response.delta" in BATCHABLE_MESSAGE_TYPES

    def test_transcript_delta_is_batchable(self):
        """transcript.delta should be batchable."""
        assert "transcript.delta" in BATCHABLE_MESSAGE_TYPES

    def test_audio_output_meta_is_batchable(self):
        """audio.output.meta should be batchable."""
        assert "audio.output.meta" in BATCHABLE_MESSAGE_TYPES


class TestBatcherDisabled:
    """Test batcher when disabled."""

    @pytest.fixture
    def mock_send_fn(self):
        """Create a mock send function."""
        return AsyncMock()

    @pytest.fixture
    def disabled_batcher(self, mock_send_fn):
        """Create a disabled batcher."""
        return WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=False),
        )

    @pytest.mark.asyncio
    async def test_disabled_sends_immediately(self, disabled_batcher, mock_send_fn):
        """Disabled batcher should send messages immediately."""
        msg = {"type": "response.delta", "text": "Hello", "seq": 0}

        await disabled_batcher.queue_message(msg)

        mock_send_fn.assert_called_once_with(msg)


class TestBatcherEnabled:
    """Test batcher when enabled."""

    @pytest.fixture
    def mock_send_fn(self):
        """Create a mock send function."""
        return AsyncMock()

    @pytest.fixture
    async def enabled_batcher(self, mock_send_fn):
        """Create an enabled batcher."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True, batch_window_ms=100),
        )
        await batcher.start()
        yield batcher
        await batcher.stop()

    @pytest.mark.asyncio
    async def test_batchable_message_queued(self, enabled_batcher, mock_send_fn):
        """Batchable messages should be queued, not sent immediately."""
        msg = {"type": "response.delta", "text": "Hello", "seq": 0}

        await enabled_batcher.queue_message(msg)

        # Message should be queued, not sent yet
        # (Note: single message will be sent immediately when flushed)
        # We need to check it's in the queue
        assert len(enabled_batcher._queue) == 1

    @pytest.mark.asyncio
    async def test_critical_message_flushes_and_sends(self, enabled_batcher, mock_send_fn):
        """Critical messages should flush queue and send immediately."""
        # Queue a batchable message first
        await enabled_batcher.queue_message({"type": "response.delta", "text": "Hello", "seq": 0})

        # Send a critical message
        await enabled_batcher.queue_message({"type": "response.complete", "text": "World", "seq": 1})

        # Both messages should be sent (flush + immediate)
        assert mock_send_fn.call_count == 2

    @pytest.mark.asyncio
    async def test_non_batchable_message_sent_immediately(self, enabled_batcher, mock_send_fn):
        """Non-batchable messages should be sent immediately."""
        msg = {"type": "some.other.type", "data": "test", "seq": 0}

        await enabled_batcher.queue_message(msg)

        mock_send_fn.assert_called_once_with(msg)

    @pytest.mark.asyncio
    async def test_batch_flushed_on_max_size(self, mock_send_fn):
        """Batch should flush when max size is reached."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True, max_batch_size=3),
        )
        await batcher.start()

        try:
            # Queue 3 messages (max batch size)
            for i in range(3):
                await batcher.queue_message({"type": "response.delta", "text": f"msg{i}", "seq": i})

            # Batch should have been flushed
            mock_send_fn.assert_called_once()

            # Verify it was sent as a batch
            sent_msg = mock_send_fn.call_args[0][0]
            assert sent_msg["type"] == "batch"
            assert sent_msg["count"] == 3
            assert len(sent_msg["messages"]) == 3

        finally:
            await batcher.stop()


class TestBatchFormat:
    """Test the format of batched messages."""

    @pytest.fixture
    def mock_send_fn(self):
        """Create a mock send function."""
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_single_message_not_wrapped(self, mock_send_fn):
        """Single message batch should be sent without wrapper."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )
        await batcher.start()

        try:
            await batcher.queue_message({"type": "response.delta", "text": "Hello", "seq": 0})
            await batcher._flush_batch()

            # Should be sent without batch wrapper
            sent_msg = mock_send_fn.call_args[0][0]
            assert sent_msg["type"] == "response.delta"
            assert "messages" not in sent_msg

        finally:
            await batcher.stop()

    @pytest.mark.asyncio
    async def test_multiple_messages_wrapped_in_batch(self, mock_send_fn):
        """Multiple messages should be wrapped in batch."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )
        await batcher.start()

        try:
            # Queue multiple messages
            await batcher.queue_message({"type": "response.delta", "text": "Hello", "seq": 0})
            await batcher.queue_message({"type": "response.delta", "text": "World", "seq": 1})
            await batcher._flush_batch()

            # Should be sent as batch
            sent_msg = mock_send_fn.call_args[0][0]
            assert sent_msg["type"] == "batch"
            assert sent_msg["count"] == 2
            assert sent_msg["seq"] == 0  # First message's sequence
            assert len(sent_msg["messages"]) == 2

        finally:
            await batcher.stop()


class TestBatcherLifecycle:
    """Test batcher start/stop lifecycle."""

    @pytest.fixture
    def mock_send_fn(self):
        """Create a mock send function."""
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_start_sets_running(self, mock_send_fn):
        """Start should set running flag."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )

        assert batcher._running is False
        await batcher.start()
        assert batcher._running is True

        await batcher.stop()

    @pytest.mark.asyncio
    async def test_stop_flushes_remaining(self, mock_send_fn):
        """Stop should flush remaining messages."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )
        await batcher.start()

        # Queue some messages
        await batcher.queue_message({"type": "response.delta", "text": "Hello", "seq": 0})
        await batcher.queue_message({"type": "response.delta", "text": "World", "seq": 1})

        # Stop should flush
        await batcher.stop()

        mock_send_fn.assert_called_once()

    @pytest.mark.asyncio
    async def test_double_start_is_safe(self, mock_send_fn):
        """Calling start twice should be safe."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )

        await batcher.start()
        await batcher.start()  # Should not raise

        assert batcher._running is True

        await batcher.stop()


class TestBatcherStats:
    """Test batcher statistics."""

    @pytest.fixture
    def mock_send_fn(self):
        """Create a mock send function."""
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_stats_tracking(self, mock_send_fn):
        """Stats should track batches and messages."""
        batcher = WebSocketMessageBatcher(
            send_fn=mock_send_fn,
            config=BatcherConfig(enabled=True),
        )
        await batcher.start()

        try:
            # Queue and flush some messages
            await batcher.queue_message({"type": "response.delta", "text": "Hello", "seq": 0})
            await batcher.queue_message({"type": "response.delta", "text": "World", "seq": 1})
            await batcher._flush_batch()

            # Send an immediate message
            await batcher.queue_message({"type": "response.complete", "text": "Done", "seq": 2})

            stats = batcher.get_stats()

            assert stats["enabled"] is True
            assert stats["batches_sent"] == 1
            assert stats["messages_batched"] == 2
            assert stats["messages_immediate"] >= 1

        finally:
            await batcher.stop()
