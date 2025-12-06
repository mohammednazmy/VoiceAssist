---
title: WebSocket Protocol Efficiency Implementation Plan
status: planning
owner: mixed
slug: websocket-protocol-efficiency-plan
lastUpdated: "2025-12-06"
priority: high
category: planning
ai_summary: >-
  Implementation plan for 3 WebSocket efficiency improvements:
  1) Binary audio frames to eliminate JSON envelope overhead,
  2) Message batching for high-frequency events,
  3) Sequence numbers for message ordering guarantees.
  Extends the existing WEBSOCKET_RELIABILITY_PLAN.md with concrete implementation steps.
---

# WebSocket Protocol Efficiency Implementation Plan

**Version:** 1.0
**Created:** 2025-12-06
**Status:** Approved - Ready for Implementation
**Related:** [WEBSOCKET_RELIABILITY_PLAN.md](./WEBSOCKET_RELIABILITY_PLAN.md)

---

## Executive Summary

This plan addresses three specific WebSocket protocol inefficiencies in VoiceAssist's voice mode:

| #   | Issue                                         | Current Impact                                         | Solution                                   | Expected Improvement                    |
| --- | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ | --------------------------------------- |
| 1   | JSON envelope overhead on every audio chunk   | +33% bandwidth, +2-3ms latency/frame, CPU parsing cost | Binary WebSocket frames with 5-byte header | -25% bandwidth, ~0ms added latency      |
| 2   | No message batching for high-frequency events | Multiple WS frames where one would suffice             | Configurable batch window (50ms default)   | Fewer frames, lower processing overhead |
| 3   | No sequence numbers for message ordering      | No ordering guarantee, no dropped message detection    | 4-byte sequence number in all messages     | Guaranteed ordering, dropout detection  |

**Feature Flags:**

- `backend.ws_binary_protocol` - Binary audio frames (Issue 1 & 3)
- `backend.ws_message_batching` - Event batching (Issue 2)

---

## Part 1: Binary Audio Protocol (Issues 1 & 3)

### 1.1 Binary Frame Format

```
┌──────────────────────────────────────────────────────────────┐
│ Byte 0    │ Bytes 1-4       │ Bytes 5-N                     │
│ Type Flag │ Sequence Number │ Raw Audio Data (PCM16/PCM24)  │
│ (0x01=in) │ (uint32 BE)     │                               │
│ (0x02=out)│                 │                               │
└──────────────────────────────────────────────────────────────┘
```

- **Type Flag (1 byte):** `0x01` = audio input, `0x02` = audio output
- **Sequence Number (4 bytes):** Big-endian uint32 for ordering/dedup
- **Audio Data:** Raw PCM16 (16kHz) for input, PCM24 (24kHz) for output

### 1.2 Backend Implementation

#### File: `services/api-gateway/app/services/thinker_talker_websocket_handler.py`

**Step 1: Add binary protocol constants and config**

```python
# Add near top of file
BINARY_FRAME_TYPE_AUDIO_INPUT = 0x01
BINARY_FRAME_TYPE_AUDIO_OUTPUT = 0x02
BINARY_HEADER_SIZE = 5  # 1 byte type + 4 bytes sequence

@dataclass
class TTSessionConfig:
    # ... existing fields ...

    # Binary protocol (feature flag controlled)
    binary_protocol_enabled: bool = False  # Set via feature flag

    # Sequence tracking
    _audio_sequence_in: int = field(default=0, init=False)
    _audio_sequence_out: int = field(default=0, init=False)
```

**Step 2: Update receive loop to handle binary frames**

```python
async def _receive_loop(self) -> None:
    """Receive and process messages from client."""
    logger.debug(f"[WS] Starting receive loop for {self.config.session_id}")
    try:
        while self._running:
            try:
                # Use low-level receive to distinguish text vs binary
                message = await self.websocket.receive()

                if message["type"] == "websocket.receive":
                    if "bytes" in message and message["bytes"]:
                        # Binary frame - direct audio
                        await self._handle_binary_frame(message["bytes"])
                    elif "text" in message and message["text"]:
                        # JSON frame - control message
                        data = json.loads(message["text"])
                        self._metrics.messages_received += 1
                        await self._handle_client_message(data)
                elif message["type"] == "websocket.disconnect":
                    logger.info(f"WebSocket disconnected: {self.config.session_id}")
                    break

            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected: {self.config.session_id}")
                break
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON in message: {e}")
                await self._send_error("invalid_json", "Invalid JSON message")
            except Exception as e:
                logger.error(f"Error receiving message: {e}", exc_info=True)
                self._metrics.error_count += 1

    except asyncio.CancelledError:
        logger.debug(f"[WS] Receive loop cancelled for {self.config.session_id}")
    finally:
        self._running = False
```

**Step 3: Add binary frame handler**

```python
async def _handle_binary_frame(self, data: bytes) -> None:
    """Handle binary WebSocket frame (audio data).

    Binary frame format:
    - Byte 0: Frame type (0x01 = audio input, 0x02 = audio output)
    - Bytes 1-4: Sequence number (uint32 big-endian)
    - Bytes 5+: Audio data (PCM16 for input, PCM24 for output)
    """
    if len(data) < BINARY_HEADER_SIZE:
        logger.warning(f"Binary frame too short: {len(data)} bytes")
        return

    frame_type = data[0]
    sequence = int.from_bytes(data[1:5], 'big')
    audio_data = data[5:]

    if frame_type == BINARY_FRAME_TYPE_AUDIO_INPUT:
        # Validate sequence (detect out-of-order/dropped)
        expected_seq = self.config._audio_sequence_in
        if sequence != expected_seq and expected_seq > 0:
            gap = sequence - expected_seq
            if gap > 0:
                logger.warning(f"[WS] Audio sequence gap: expected {expected_seq}, got {sequence} (gap={gap})")
                self._metrics.error_count += 1
            elif gap < 0:
                logger.debug(f"[WS] Out-of-order audio frame: {sequence} < {expected_seq}")
                return  # Drop out-of-order frames

        self.config._audio_sequence_in = sequence + 1

        # Send to pipeline (no base64 decode needed!)
        if self._pipeline_session:
            await self._pipeline_session.send_audio(audio_data)
            self._metrics.messages_received += 1
    else:
        logger.warning(f"Unknown binary frame type: {frame_type}")

async def _send_audio_binary(self, audio_data: bytes) -> None:
    """Send audio output as binary WebSocket frame."""
    sequence = self.config._audio_sequence_out
    self.config._audio_sequence_out += 1

    header = bytes([BINARY_FRAME_TYPE_AUDIO_OUTPUT]) + sequence.to_bytes(4, 'big')
    frame = header + audio_data

    try:
        await self.websocket.send_bytes(frame)
        self._metrics.messages_sent += 1
    except Exception as e:
        logger.error(f"Error sending binary audio: {e}")
        self._metrics.error_count += 1
```

**Step 4: Update pipeline message handler for audio output**

```python
async def _handle_pipeline_message(self, message: PipelineMessage) -> None:
    """Handle a message from the voice pipeline."""

    # For audio output, use binary protocol if enabled
    if message.type == "audio.output" and self.config.binary_protocol_enabled:
        audio_b64 = message.data.get("audio", "")
        if audio_b64:
            import base64
            audio_bytes = base64.b64decode(audio_b64)
            await self._send_audio_binary(audio_bytes)

            # Still send metadata as JSON
            await self._send_message({
                "type": "audio.output.meta",
                "format": message.data.get("format"),
                "is_final": message.data.get("is_final"),
                "sequence": self.config._audio_sequence_out - 1,
            })
        return

    # Forward other messages as JSON
    await self._send_message({
        "type": message.type,
        **message.data,
    })
```

**Step 5: Protocol negotiation in session.init**

```python
async def _handle_client_message(self, message: Dict[str, Any]) -> None:
    """Handle a message from the client."""
    msg_type = message.get("type", "")

    if msg_type == "session.init":
        # Check for binary protocol support
        features = message.get("features", [])
        protocol_version = message.get("protocol_version", "1.0")

        if "binary_audio" in features:
            # Check feature flag
            from app.services.feature_flags import feature_flag_service
            binary_enabled = await feature_flag_service.is_enabled("backend.ws_binary_protocol")

            if binary_enabled:
                self.config.binary_protocol_enabled = True
                logger.info(f"[WS] Binary audio protocol enabled for session {self.config.session_id}")

        # Acknowledge with negotiated features
        await self._send_message({
            "type": "session.init.ack",
            "protocol_version": "2.0" if self.config.binary_protocol_enabled else "1.0",
            "features": ["binary_audio"] if self.config.binary_protocol_enabled else [],
        })

        # ... rest of init handling ...
```

### 1.3 Frontend Implementation

#### File: `apps/web-app/src/hooks/useThinkerTalkerSession.ts`

**Step 1: Add binary protocol state**

```typescript
// Add to hook state
const [binaryProtocolEnabled, setBinaryProtocolEnabled] = useState(false);
const audioSequenceRef = useRef(0);
```

**Step 2: Update session.init to request binary protocol**

```typescript
// In initializeWebSocket function, after connection:
ws.send(
  JSON.stringify({
    type: "session.init",
    protocol_version: "2.0",
    features: ["binary_audio"],
    conversation_id: conversationId,
    voice_settings: voiceSettings,
  }),
);
```

**Step 3: Update message handler for binary frames**

```typescript
ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Binary frame - audio output
    const data = new Uint8Array(event.data);
    if (data.length < 5) return; // Invalid frame

    const frameType = data[0];
    const sequence = new DataView(data.buffer).getUint32(1, false); // big-endian
    const audioData = data.slice(5);

    if (frameType === 0x02) {
      // AUDIO_OUTPUT
      // Convert Uint8Array to base64 for existing playback hooks
      // (or update useTTAudioPlayback to accept Uint8Array directly)
      const base64 = btoa(String.fromCharCode(...audioData));
      options.onAudioChunk?.(base64);
    }
  } else {
    // Text frame - JSON control message
    const message = JSON.parse(event.data);
    handleMessageRef.current(message);
  }
};
```

**Step 4: Update audio streaming to send binary**

```typescript
scriptProcessor.onaudioprocess = (event) => {
  if (ws.readyState !== WebSocket.OPEN) return;

  const inputData = event.inputBuffer.getChannelData(0);
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    const s = Math.max(-1, Math.min(1, inputData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  if (binaryProtocolEnabled) {
    // Binary frame: [type:1][seq:4][audio:N]
    const sequence = audioSequenceRef.current++;
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, 0x01); // AUDIO_INPUT
    headerView.setUint32(1, sequence, false); // big-endian

    // Combine header + audio
    const frame = new Uint8Array(5 + pcm16.byteLength);
    frame.set(new Uint8Array(header), 0);
    frame.set(new Uint8Array(pcm16.buffer), 5);

    ws.send(frame.buffer);
  } else {
    // Fallback: JSON + base64
    const uint8 = new Uint8Array(pcm16.buffer);
    const base64 = btoa(String.fromCharCode(...uint8));
    ws.send(JSON.stringify({ type: "audio.input", audio: base64 }));
  }
};
```

**Step 5: Handle session.init.ack**

```typescript
case "session.init.ack": {
  const features = message.features as string[] || [];
  if (features.includes("binary_audio")) {
    setBinaryProtocolEnabled(true);
    voiceLog.info("[ThinkerTalker] Binary audio protocol negotiated");
  }
  break;
}
```

---

## Part 2: Message Batching (Issue 2)

### 2.1 Batch Message Format

```json
{
  "type": "batch",
  "count": 5,
  "messages": [
    { "type": "response.delta", "text": "Hello" },
    { "type": "response.delta", "text": " world" },
    { "type": "response.delta", "text": "!" },
    { "type": "audio.output.meta", "sequence": 42 },
    { "type": "audio.output.meta", "sequence": 43 }
  ]
}
```

### 2.2 Backend Implementation

#### File: `services/api-gateway/app/services/websocket_message_batcher.py` (NEW)

```python
"""
WebSocket Message Batcher

Batches high-frequency WebSocket messages to reduce frame overhead.
Configurable batch window (default 50ms) and message types to batch.

Feature flag: backend.ws_message_batching
"""

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Set, Awaitable

from app.core.logging import get_logger

logger = get_logger(__name__)

# Message types eligible for batching
BATCHABLE_MESSAGE_TYPES: Set[str] = {
    "response.delta",
    "transcript.delta",
    "audio.output.meta",  # Metadata for binary audio frames
}


@dataclass
class BatcherConfig:
    """Configuration for message batcher."""
    enabled: bool = False
    batch_window_ms: float = 50.0  # Collect messages for 50ms
    max_batch_size: int = 20  # Max messages per batch
    flush_on_types: Set[str] = field(default_factory=lambda: {
        "response.complete",
        "transcript.complete",
        "voice.state",
        "error",
    })


class WebSocketMessageBatcher:
    """
    Batches high-frequency WebSocket messages.

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

    def __init__(
        self,
        send_fn: Callable[[Dict[str, Any]], Awaitable[None]],
        config: BatcherConfig = None,
    ):
        self._send_fn = send_fn
        self._config = config or BatcherConfig()
        self._queue: deque = deque()
        self._task: asyncio.Task | None = None
        self._running = False
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Start the batcher loop."""
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

        # Flush remaining
        await self._flush_batch()
        logger.debug("[Batcher] Stopped")

    async def queue_message(self, message: Dict[str, Any]) -> None:
        """Queue a message for batching or send immediately."""
        msg_type = message.get("type", "")

        if not self._config.enabled:
            # Batching disabled - send immediately
            await self._send_fn(message)
            return

        # Check if this type triggers immediate flush
        if msg_type in self._config.flush_on_types:
            await self._flush_batch()
            await self._send_fn(message)
            return

        # Check if batchable
        if msg_type in BATCHABLE_MESSAGE_TYPES:
            async with self._lock:
                self._queue.append(message)

                # Flush if batch full
                if len(self._queue) >= self._config.max_batch_size:
                    await self._flush_batch()
        else:
            # Non-batchable - send immediately
            await self._send_fn(message)

    async def _batch_loop(self) -> None:
        """Background loop to flush batches on timer."""
        try:
            while self._running:
                await asyncio.sleep(self._config.batch_window_ms / 1000.0)
                await self._flush_batch()
        except asyncio.CancelledError:
            pass

    async def _flush_batch(self) -> None:
        """Flush queued messages as a batch."""
        async with self._lock:
            if not self._queue:
                return

            messages = list(self._queue)
            self._queue.clear()

        if len(messages) == 1:
            # Single message - send directly
            await self._send_fn(messages[0])
        else:
            # Multiple messages - send as batch
            batch = {
                "type": "batch",
                "count": len(messages),
                "messages": messages,
            }
            await self._send_fn(batch)
            logger.debug(f"[Batcher] Flushed batch of {len(messages)} messages")
```

#### Update `thinker_talker_websocket_handler.py`

```python
from app.services.websocket_message_batcher import (
    WebSocketMessageBatcher,
    BatcherConfig,
)

class ThinkerTalkerWebSocketHandler:
    def __init__(self, ...):
        # ... existing init ...

        # Message batcher (initialized in start())
        self._batcher: WebSocketMessageBatcher | None = None

    async def start(self) -> bool:
        # ... existing start logic ...

        # Initialize batcher (feature flag controlled)
        from app.services.feature_flags import feature_flag_service
        batching_enabled = await feature_flag_service.is_enabled("backend.ws_message_batching")

        if batching_enabled:
            self._batcher = WebSocketMessageBatcher(
                send_fn=self.websocket.send_json,
                config=BatcherConfig(enabled=True, batch_window_ms=50),
            )
            await self._batcher.start()
            logger.info(f"[WS] Message batching enabled for session {self.config.session_id}")

        # ... rest of start logic ...

    async def stop(self) -> TTSessionMetrics:
        # ... existing stop logic ...

        # Stop batcher
        if self._batcher:
            await self._batcher.stop()

        # ... rest of stop logic ...

    async def _send_message(self, message: Dict[str, Any]) -> None:
        """Send a message to the client (batched if enabled)."""
        try:
            if self._batcher:
                await self._batcher.queue_message(message)
            else:
                await self.websocket.send_json(message)
            self._metrics.messages_sent += 1
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            self._metrics.error_count += 1
```

### 2.3 Frontend Implementation

#### Update `useThinkerTalkerSession.ts`

```typescript
// Update message handler to unwrap batches
const handleMessage = useCallback(
  (message: any) => {
    // Check for batch message
    if (message.type === "batch" && Array.isArray(message.messages)) {
      voiceLog.debug(`[ThinkerTalker] Received batch of ${message.count} messages`);
      for (const batchedMessage of message.messages) {
        handleSingleMessage(batchedMessage);
      }
      return;
    }

    // Single message
    handleSingleMessage(message);
  },
  [handleSingleMessage],
);

const handleSingleMessage = useCallback(
  (message: any) => {
    // ... existing switch statement for message types ...
  },
  [
    /* deps */
  ],
);
```

---

## Part 3: Sequence Number Validation (Issue 3)

### 3.1 Add Sequence to All Messages

For **non-audio messages**, add sequence tracking via the batcher or directly:

#### Backend: Add sequence to JSON messages

```python
# In ThinkerTalkerWebSocketHandler

def __init__(self, ...):
    # ... existing init ...
    self._message_sequence = 0

async def _send_message(self, message: Dict[str, Any]) -> None:
    """Send a message with sequence number."""
    # Add sequence to all messages
    message["seq"] = self._message_sequence
    self._message_sequence += 1

    try:
        if self._batcher:
            await self._batcher.queue_message(message)
        else:
            await self.websocket.send_json(message)
        self._metrics.messages_sent += 1
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        self._metrics.error_count += 1
```

### 3.2 Frontend Sequence Validation

```typescript
// Add sequence tracking
const expectedSequenceRef = useRef(0);
const reorderBufferRef = useRef<Map<number, any>>(new Map());
const MAX_REORDER_BUFFER = 50;

const handleMessageWithSequence = useCallback(
  (message: any) => {
    const seq = message.seq as number | undefined;

    if (seq === undefined) {
      // No sequence - process immediately (legacy)
      handleMessage(message);
      return;
    }

    const expected = expectedSequenceRef.current;

    if (seq === expected) {
      // In order - process and drain buffer
      handleMessage(message);
      expectedSequenceRef.current = seq + 1;
      drainReorderBuffer();
    } else if (seq > expected) {
      // Out of order - buffer for later
      if (reorderBufferRef.current.size < MAX_REORDER_BUFFER) {
        reorderBufferRef.current.set(seq, message);
        voiceLog.debug(`[ThinkerTalker] Buffered out-of-order message seq=${seq}, expected=${expected}`);
      } else {
        voiceLog.warn(`[ThinkerTalker] Reorder buffer full, dropping message seq=${seq}`);
      }
    } else {
      // Old message - ignore
      voiceLog.debug(`[ThinkerTalker] Ignoring old message seq=${seq}, expected=${expected}`);
    }
  },
  [handleMessage],
);

const drainReorderBuffer = useCallback(() => {
  const buffer = reorderBufferRef.current;
  while (buffer.has(expectedSequenceRef.current)) {
    const msg = buffer.get(expectedSequenceRef.current)!;
    buffer.delete(expectedSequenceRef.current);
    handleMessage(msg);
    expectedSequenceRef.current++;
  }
}, [handleMessage]);
```

---

## Part 4: Feature Flags

### 4.1 Create Feature Flags

Via Admin Panel at admin.asimo.io or API:

```bash
# Binary audio protocol
curl -X POST https://admin.asimo.io/api/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "backend.ws_binary_protocol",
    "description": "Enable binary WebSocket frames for audio to reduce overhead",
    "value": false,
    "flag_type": "boolean",
    "category": "backend",
    "rollout_percentage": 0
  }'

# Message batching
curl -X POST https://admin.asimo.io/api/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "backend.ws_message_batching",
    "description": "Enable batching of high-frequency WebSocket messages",
    "value": false,
    "flag_type": "boolean",
    "category": "backend",
    "rollout_percentage": 0
  }'
```

### 4.2 Rollout Strategy

1. **Internal testing** (0%): Enable manually for dev team
2. **Alpha** (5%): Small subset of users
3. **Beta** (25%): Broader testing
4. **General availability** (100%): Full rollout

---

## Part 5: Testing

### 5.1 Unit Tests

#### File: `services/api-gateway/tests/unit/services/test_websocket_binary_protocol.py`

```python
"""Tests for binary WebSocket protocol."""

import pytest
from app.services.thinker_talker_websocket_handler import (
    BINARY_FRAME_TYPE_AUDIO_INPUT,
    BINARY_FRAME_TYPE_AUDIO_OUTPUT,
    BINARY_HEADER_SIZE,
)


class TestBinaryFrameFormat:
    def test_audio_input_frame_creation(self):
        """Test creating binary audio input frame."""
        audio_data = b'\x00\x01\x02\x03'
        sequence = 42

        header = bytes([BINARY_FRAME_TYPE_AUDIO_INPUT]) + sequence.to_bytes(4, 'big')
        frame = header + audio_data

        assert len(frame) == BINARY_HEADER_SIZE + len(audio_data)
        assert frame[0] == BINARY_FRAME_TYPE_AUDIO_INPUT
        assert int.from_bytes(frame[1:5], 'big') == 42
        assert frame[5:] == audio_data

    def test_audio_output_frame_creation(self):
        """Test creating binary audio output frame."""
        audio_data = b'\x00\x01\x02\x03'
        sequence = 100

        header = bytes([BINARY_FRAME_TYPE_AUDIO_OUTPUT]) + sequence.to_bytes(4, 'big')
        frame = header + audio_data

        assert frame[0] == BINARY_FRAME_TYPE_AUDIO_OUTPUT
        assert int.from_bytes(frame[1:5], 'big') == 100
```

#### File: `services/api-gateway/tests/unit/services/test_websocket_message_batcher.py`

```python
"""Tests for WebSocket message batcher."""

import asyncio
import pytest
from app.services.websocket_message_batcher import (
    WebSocketMessageBatcher,
    BatcherConfig,
    BATCHABLE_MESSAGE_TYPES,
)


@pytest.fixture
def mock_send():
    sent = []
    async def send(msg):
        sent.append(msg)
    send.messages = sent
    return send


@pytest.mark.asyncio
async def test_batcher_batches_eligible_messages(mock_send):
    """Test that eligible messages are batched."""
    batcher = WebSocketMessageBatcher(
        send_fn=mock_send,
        config=BatcherConfig(enabled=True, batch_window_ms=10),
    )
    await batcher.start()

    # Queue multiple messages quickly
    await batcher.queue_message({"type": "response.delta", "text": "a"})
    await batcher.queue_message({"type": "response.delta", "text": "b"})
    await batcher.queue_message({"type": "response.delta", "text": "c"})

    # Wait for batch window
    await asyncio.sleep(0.02)
    await batcher.stop()

    # Should have one batch message
    assert len(mock_send.messages) == 1
    batch = mock_send.messages[0]
    assert batch["type"] == "batch"
    assert batch["count"] == 3


@pytest.mark.asyncio
async def test_batcher_immediate_flush_on_trigger_types(mock_send):
    """Test that certain message types trigger immediate flush."""
    batcher = WebSocketMessageBatcher(
        send_fn=mock_send,
        config=BatcherConfig(enabled=True, batch_window_ms=1000),
    )
    await batcher.start()

    await batcher.queue_message({"type": "response.delta", "text": "a"})
    await batcher.queue_message({"type": "response.complete", "text": "done"})

    await batcher.stop()

    # Should have: 1 delta (batched), 1 complete (immediate)
    assert len(mock_send.messages) >= 2
    types = [m.get("type") for m in mock_send.messages]
    assert "response.delta" in types or "batch" in types
    assert "response.complete" in types
```

### 5.2 Integration Tests

#### File: `services/api-gateway/tests/integration/test_websocket_binary_protocol.py`

```python
"""Integration tests for binary WebSocket protocol."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocket


@pytest.mark.integration
async def test_binary_protocol_negotiation():
    """Test binary protocol negotiation during session init."""
    # This test requires running server with feature flag enabled
    pass  # Implementation depends on test infrastructure


@pytest.mark.integration
async def test_binary_audio_round_trip():
    """Test sending/receiving binary audio frames."""
    pass  # Implementation depends on test infrastructure
```

### 5.3 Frontend Tests

Add to `apps/web-app/src/hooks/__tests__/useThinkerTalkerSession.test.ts`:

```typescript
describe("Binary Protocol", () => {
  it("should negotiate binary protocol on init", async () => {
    // Mock WebSocket and session init
  });

  it("should send audio as binary when enabled", async () => {
    // Test binary frame creation
  });

  it("should handle binary audio output", async () => {
    // Test receiving binary frames
  });
});

describe("Message Batching", () => {
  it("should unwrap batch messages", async () => {
    // Test batch handling
  });
});

describe("Sequence Validation", () => {
  it("should process in-order messages immediately", async () => {
    // Test sequence handling
  });

  it("should buffer out-of-order messages", async () => {
    // Test reorder buffer
  });
});
```

---

## Part 6: Documentation Updates

### 6.1 Update assistdocs.asimo.io

**Files to update:**

1. `apps/docs-site/docs/reference/api/voice-pipeline-ws.md` - Add binary protocol documentation
2. `apps/docs-site/docs/voice/websocket-binary-audio.md` - Create detailed binary protocol guide
3. `apps/docs-site/docs/admin-guide/feature-flags/README.md` - Add new flags

### 6.2 Update Existing Docs

- `docs/planning/WEBSOCKET_RELIABILITY_PLAN.md` - Mark Issue 1 as implemented
- `docs/voice/websocket-latency-optimization.md` - Reference new optimizations

---

## Part 7: Implementation Checklist

### Phase 1: Binary Audio Protocol (3-4 days)

- [ ] Create feature flag `backend.ws_binary_protocol`
- [ ] Backend: Add binary frame constants and types
- [ ] Backend: Update receive loop for binary/text frame detection
- [ ] Backend: Add `_handle_binary_frame()` method
- [ ] Backend: Add `_send_audio_binary()` method
- [ ] Backend: Add protocol negotiation in session.init
- [ ] Frontend: Add binary protocol state
- [ ] Frontend: Update session.init to request binary_audio
- [ ] Frontend: Update audio streaming to send binary frames
- [ ] Frontend: Handle binary audio output
- [ ] Write unit tests for binary frame format
- [ ] Write integration test for negotiation

### Phase 2: Message Batching (2-3 days)

- [ ] Create feature flag `backend.ws_message_batching`
- [ ] Backend: Create `websocket_message_batcher.py`
- [ ] Backend: Integrate batcher with WebSocket handler
- [ ] Frontend: Handle batch message type
- [ ] Write unit tests for batcher
- [ ] Write integration tests

### Phase 3: Sequence Validation (1-2 days)

- [ ] Backend: Add sequence numbers to all messages
- [ ] Frontend: Add sequence validation logic
- [ ] Frontend: Implement reorder buffer
- [ ] Write tests for sequence handling

### Phase 4: Testing & Documentation (2-3 days)

- [ ] Run all unit tests
- [ ] Run integration tests on GitHub CI
- [ ] Update assistdocs.asimo.io
- [ ] Update existing planning docs
- [ ] Create PR and resolve any issues
- [ ] Gradual rollout via feature flags

---

## Success Metrics

| Metric                       | Current      | Target       | Measurement         |
| ---------------------------- | ------------ | ------------ | ------------------- |
| Audio bandwidth overhead     | 33% (base64) | <5% (binary) | Compare frame sizes |
| Messages per second capacity | ~1000        | ~5000        | Load test           |
| Out-of-order message rate    | Unknown      | <0.1%        | Prometheus metrics  |
| Dropped message rate         | Unknown      | <0.01%       | Prometheus metrics  |

---

**Document Version:** 1.0
**Maintainer:** VoiceAssist Development Team
**Created By:** Claude (AI Assistant)
