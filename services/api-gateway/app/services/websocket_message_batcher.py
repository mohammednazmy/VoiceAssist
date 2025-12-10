"""
WebSocket Message Batcher

Batches high-frequency WebSocket messages to reduce frame overhead.
Configurable batch window (default 50ms) and message types to batch.

Feature flag: backend.ws_message_batching

Benefits:
- Reduces WebSocket frame overhead for high-frequency messages
- Lower processing overhead on both client and server
- Configurable batch window for latency/efficiency tradeoff

Usage:
    batcher = WebSocketMessageBatcher(
        send_fn=websocket.send_json,
        config=BatcherConfig(enabled=True)
    )
    await batcher.start()

    # Queue messages (batched automatically)
    await batcher.queue_message({"type": "response.delta", "text": "Hi"})

    # Stop and flush remaining
    await batcher.stop()
"""

import asyncio
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Set

from app.core.logging import get_logger

logger = get_logger(__name__)

# Message types eligible for batching (high-frequency, non-critical)
BATCHABLE_MESSAGE_TYPES: Set[str] = {
    "response.delta",  # Streaming LLM response tokens
    "transcript.delta",  # Partial transcripts
    "audio.output.meta",  # Metadata for binary audio frames
}


@dataclass
class BatcherConfig:
    """Configuration for message batcher."""

    enabled: bool = False
    batch_window_ms: float = 50.0  # Collect messages for 50ms before sending
    max_batch_size: int = 20  # Max messages per batch before forced flush
    flush_on_types: Set[str] = field(
        default_factory=lambda: {
            # These message types trigger immediate flush of pending batch
            "response.complete",
            "transcript.complete",
            "voice.state",
            "error",
            "session.ready",
            "session.init.ack",
        }
    )


class WebSocketMessageBatcher:
    """
    Batches high-frequency WebSocket messages.

    Architecture:
    - Messages are queued for batching based on type
    - Background task flushes queue every batch_window_ms
    - Certain message types trigger immediate flush
    - Single message batches are sent unwrapped

    Batch Message Format:
    {
        "type": "batch",
        "count": 5,
        "seq": 42,  # Sequence of first message in batch
        "messages": [
            {"type": "response.delta", "text": "Hello"},
            {"type": "response.delta", "text": " world"},
            ...
        ]
    }
    """

    def __init__(
        self,
        send_fn: Callable[[Dict[str, Any]], Awaitable[None]],
        config: BatcherConfig | None = None,
    ):
        """Initialize the message batcher.

        Args:
            send_fn: Async function to send messages (e.g., websocket.send_json)
            config: Batcher configuration
        """
        self._send_fn = send_fn
        self._config = config or BatcherConfig()
        self._queue: deque = deque()
        self._task: asyncio.Task | None = None
        self._running = False
        self._lock = asyncio.Lock()

        # Metrics
        self._batches_sent = 0
        self._messages_batched = 0
        self._messages_immediate = 0

    async def start(self) -> None:
        """Start the batcher background loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._batch_loop())
        logger.debug("[Batcher] Started")

    async def stop(self) -> None:
        """Stop the batcher and flush remaining messages."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Flush remaining messages
        await self._flush_batch()
        logger.debug(
            f"[Batcher] Stopped (batches={self._batches_sent}, "
            f"batched={self._messages_batched}, immediate={self._messages_immediate})"
        )

    async def queue_message(self, message: Dict[str, Any]) -> None:
        """Queue a message for batching or send immediately.

        Args:
            message: Message to send (must include 'type' and 'seq')
        """
        msg_type = message.get("type", "")

        if not self._config.enabled:
            # Batching disabled - send immediately
            await self._send_fn(message)
            return

        # Check if this type triggers immediate flush
        if msg_type in self._config.flush_on_types:
            await self._flush_batch()
            await self._send_fn(message)
            self._messages_immediate += 1
            return

        # Check if batchable
        if msg_type in BATCHABLE_MESSAGE_TYPES:
            async with self._lock:
                self._queue.append(message)

                # Flush if batch is full
                if len(self._queue) >= self._config.max_batch_size:
                    await self._flush_batch_unlocked()
        else:
            # Non-batchable message - send immediately
            await self._send_fn(message)
            self._messages_immediate += 1

    async def _batch_loop(self) -> None:
        """Background loop to flush batches on timer."""
        try:
            while self._running:
                await asyncio.sleep(self._config.batch_window_ms / 1000.0)
                await self._flush_batch()
        except asyncio.CancelledError:
            pass

    async def _flush_batch(self) -> None:
        """Flush queued messages as a batch (with lock)."""
        async with self._lock:
            await self._flush_batch_unlocked()

    async def _flush_batch_unlocked(self) -> None:
        """Flush queued messages as a batch (must hold lock)."""
        if not self._queue:
            return

        messages = list(self._queue)
        self._queue.clear()

        if len(messages) == 1:
            # Single message - send directly (no batch wrapper)
            await self._send_fn(messages[0])
            self._messages_batched += 1
        else:
            # Multiple messages - wrap in batch
            # Use sequence of first message as batch sequence
            first_seq = messages[0].get("seq", 0)
            batch = {
                "type": "batch",
                "count": len(messages),
                "seq": first_seq,
                "messages": messages,
            }
            await self._send_fn(batch)
            self._batches_sent += 1
            self._messages_batched += len(messages)
            logger.debug(f"[Batcher] Flushed batch of {len(messages)} messages")

    def get_stats(self) -> Dict[str, Any]:
        """Get batcher statistics.

        Returns:
            Dictionary with batching statistics
        """
        return {
            "enabled": self._config.enabled,
            "batch_window_ms": self._config.batch_window_ms,
            "max_batch_size": self._config.max_batch_size,
            "batches_sent": self._batches_sent,
            "messages_batched": self._messages_batched,
            "messages_immediate": self._messages_immediate,
            "queue_size": len(self._queue),
        }
