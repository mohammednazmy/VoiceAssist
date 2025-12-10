# WebSocket Binary Protocol & Message Batching

## Overview

This document describes the WebSocket protocol efficiency improvements implemented in the VoiceAssist backend. These features significantly reduce bandwidth usage and latency for voice communications.

## Features

### 1. Binary Audio Protocol

**Feature Flag:** `backend.ws_binary_protocol`

Replaces base64-encoded JSON audio messages with raw binary WebSocket frames, reducing bandwidth by ~25% and eliminating JSON parsing overhead.

#### Binary Frame Format

```
+--------+------------------+-------------------+
| Type   | Sequence Number  | Audio Data        |
| 1 byte | 4 bytes (BE)     | N bytes           |
+--------+------------------+-------------------+
```

- **Type (1 byte):**
  - `0x01` - Audio input (client → server)
  - `0x02` - Audio output (server → client)

- **Sequence Number (4 bytes, big-endian):**
  - Monotonically increasing counter
  - Enables dropout detection and ordering

- **Audio Data (N bytes):**
  - PCM16 format for input (16kHz, mono)
  - PCM24 format for output (24kHz, mono)

#### Protocol Negotiation

1. Client sends `session.init` with `features: ["binary_audio", "message_batching"]`
2. Server checks feature flags and responds with negotiated features
3. If binary_audio is enabled, both sides use binary frames for audio

```typescript
// Client session.init
{
  type: "session.init",
  protocol_version: "2.0",
  features: ["binary_audio", "message_batching"],
  conversation_id: "...",
  voice_settings: {...}
}

// Server session.init.ack
{
  type: "session.init.ack",
  protocol_version: "2.0",
  features: ["binary_audio", "message_batching"],
  seq: 0
}
```

### 2. Message Batching

**Feature Flag:** `backend.ws_message_batching`

Groups high-frequency JSON messages into batches, reducing WebSocket frame overhead.

#### Batchable Message Types

- `response.delta` - Streaming LLM response tokens
- `transcript.delta` - Partial transcripts
- `audio.output.meta` - Metadata for binary audio frames

#### Batch Configuration

- **Batch Window:** 50ms (configurable)
- **Max Batch Size:** 20 messages
- **Flush Triggers:** `response.complete`, `transcript.complete`, `error`, etc.

#### Batch Message Format

```json
{
  "type": "batch",
  "count": 5,
  "seq": 42,
  "messages": [
    {"type": "response.delta", "text": "Hello", "seq": 42},
    {"type": "response.delta", "text": " world", "seq": 43},
    ...
  ]
}
```

### 3. Sequence Numbers

All JSON messages now include a `seq` field for:

- Guaranteed message ordering
- Dropped message detection
- Out-of-order message buffering

```json
{
  "type": "transcript.complete",
  "text": "Hello world",
  "seq": 15
}
```

## Backend Implementation

### Files Modified

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`
  - Added binary frame constants and handling
  - Updated `_receive_loop` for binary frame detection
  - Added `_handle_binary_frame` method
  - Added `_send_audio_binary` method
  - Updated protocol negotiation in `session.init`
  - Added sequence numbers to all messages

- `services/api-gateway/app/services/websocket_message_batcher.py` (new)
  - `WebSocketMessageBatcher` class
  - `BatcherConfig` configuration
  - Automatic batch flushing

### Feature Flag Integration

```python
# Check binary protocol flag
from app.services.feature_flags import feature_flag_service

binary_enabled = await feature_flag_service.is_enabled(
    "backend.ws_binary_protocol", default=False
)
```

## Frontend Implementation

### Files Modified

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
  - Added binary protocol state tracking
  - Updated `onmessage` to handle binary frames
  - Updated audio streaming to send binary frames
  - Added batch message handling
  - Added `session.init.ack` handling for negotiated features
  - Added sequence validation with reorder buffer

### Binary Frame Sending

```typescript
if (binaryProtocolEnabledRef.current) {
  const sequence = audioSequenceRef.current++;
  const header = new Uint8Array(5);
  header[0] = 0x01; // AUDIO_INPUT
  new DataView(header.buffer).setUint32(1, sequence, false);

  const frame = new Uint8Array(5 + pcmBytes.length);
  frame.set(header, 0);
  frame.set(pcmBytes, 5);

  ws.send(frame.buffer);
}
```

### Binary Frame Receiving

```typescript
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    event.data.arrayBuffer().then((buffer) => {
      const data = new Uint8Array(buffer);
      const frameType = data[0];
      const sequence = new DataView(data.buffer).getUint32(1, false);
      const audioData = data.slice(5);

      if (frameType === 0x02) {
        // AUDIO_OUTPUT
        // Process audio...
      }
    });
  }
};
```

### Sequence Validation

The frontend implements sequence validation to ensure messages are processed in order:

```typescript
// State tracking
const expectedSequenceRef = useRef(0);
const reorderBufferRef = useRef<Map<number, Record<string, unknown>>>(new Map());
const MAX_REORDER_BUFFER = 50;

// Sequence validation logic
const handleMessageWithSequence = useCallback((message) => {
  const seq = message.seq;

  // No sequence number = legacy message, process immediately
  if (seq === undefined) {
    handleMessage(message);
    return;
  }

  if (seq === expectedSequenceRef.current) {
    // In order - process immediately
    handleMessage(message);
    expectedSequenceRef.current = seq + 1;
    drainReorderBuffer(); // Process any buffered messages
  } else if (seq > expectedSequenceRef.current) {
    // Out of order - buffer for later
    reorderBufferRef.current.set(seq, message);
  }
  // seq < expected = old/duplicate, ignore
}, []);
```

**Key behaviors:**

- In-order messages are processed immediately
- Out-of-order messages are buffered (up to 50 messages)
- When gaps are filled, buffered messages are drained in order
- Duplicate/old messages are ignored
- Batch messages update expected sequence based on last message in batch

## Admin Panel Integration

Feature flags can be managed at `admin.asimo.io` under Feature Flags:

- `backend.ws_binary_protocol` - Enable/disable binary audio protocol
- `backend.ws_message_batching` - Enable/disable message batching

## Performance Benefits

| Metric        | JSON (Base64) | Binary Protocol | Improvement          |
| ------------- | ------------- | --------------- | -------------------- |
| Bandwidth     | 4.0 KB/sec    | 3.0 KB/sec      | 25% reduction        |
| Parse Time    | ~1ms          | ~0ms            | ~1ms saved per frame |
| Frame Count\* | 100/sec       | 20/sec          | 5x reduction         |

\*With message batching enabled

## Testing

### Backend Tests

Unit tests are located in:

- `services/api-gateway/tests/unit/test_websocket_binary_protocol.py`
- `services/api-gateway/tests/unit/test_websocket_message_batcher.py`

Run tests with:

```bash
cd services/api-gateway
pytest tests/unit/test_websocket_binary_protocol.py tests/unit/test_websocket_message_batcher.py -v
```

### Frontend Tests

Sequence validation tests are in:

- `apps/web-app/src/hooks/__tests__/useThinkerTalkerSession-messages.test.ts`

Tests cover:

- In-order message processing
- Out-of-order message buffering and reordering
- Duplicate/old message rejection
- Legacy messages (no sequence number)
- Batch message sequence handling

Run tests with:

```bash
cd apps/web-app
pnpm exec vitest run src/hooks/__tests__/useThinkerTalkerSession-messages.test.ts
```

## Rollout Strategy

1. **Phase 1:** Deploy with feature flags disabled (default)
2. **Phase 2:** Enable for internal testing users
3. **Phase 3:** Gradual rollout (10% → 50% → 100%)
4. **Phase 4:** Make default enabled, deprecate JSON audio

## Fallback Behavior

- If client doesn't request features, server uses legacy JSON protocol
- If feature flag is disabled, server responds without those features
- Client gracefully falls back to JSON if binary not negotiated
