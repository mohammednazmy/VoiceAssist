---
title: WebSocket Binary Audio
slug: websocket-binary-audio
status: active
owner: backend
lastUpdated: "2024-12-06"
priority: high
category: voice
ai_summary: >-
  Phase 1 WebSocket Reliability feature enabling binary WebSocket frames for
  audio transmission, reducing bandwidth by ~33% and eliminating base64
  encoding overhead.
---

# WebSocket Binary Audio

**Status:** Feature Flag Controlled
**Feature Flag:** `backend.voice_ws_binary_audio`
**Phase:** WebSocket Reliability Phase 1
**Last Updated:** 2024-12-06

---

## Overview

The WebSocket Binary Audio feature enables sending audio data as raw binary WebSocket frames instead of base64-encoded JSON messages. This optimization provides:

1. **~33% Bandwidth Reduction** - Binary audio doesn't need base64 encoding (which adds 33% overhead)
2. **Lower CPU Usage** - No encoding/decoding overhead on client and server
3. **Lower Latency** - Less data to transmit and process
4. **Sequence Numbering** - Built-in frame ordering and loss detection

---

## Protocol Specification

### Binary Frame Format

Each binary frame has a 5-byte header followed by audio data:

```
┌─────────┬────────────────────┬──────────────────┐
│ Byte 0  │ Bytes 1-4          │ Bytes 5+         │
│ Type    │ Sequence (uint32)  │ Audio Data       │
└─────────┴────────────────────┴──────────────────┘
```

### Frame Types

| Type         | Value  | Direction       | Description                             |
| ------------ | ------ | --------------- | --------------------------------------- |
| AUDIO_INPUT  | `0x01` | Client → Server | User's microphone audio (PCM16 @ 16kHz) |
| AUDIO_OUTPUT | `0x02` | Server → Client | TTS audio output (PCM24 @ 24kHz)        |

### Sequence Numbers

- **32-bit unsigned integer** in big-endian format
- Starts at 0 for each session
- Increments per audio frame
- Used for:
  - Detecting dropped frames
  - Reordering out-of-order frames
  - Gap detection and recovery

---

## Feature Negotiation

Binary audio is negotiated during session initialization:

### Client Request

```javascript
{
  "type": "session.init",
  "protocol_version": "2.0",
  "features": ["binary_audio", ...],
  ...
}
```

### Server Response

```javascript
{
  "type": "session.init.ack",
  "protocol_version": "2.0",
  "features": ["binary_audio"],  // Only if feature flag enabled
  ...
}
```

---

## Implementation

### Frontend (useThinkerTalkerSession.ts)

```typescript
// Send audio as binary frame
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

// Receive binary audio
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    event.data.arrayBuffer().then((buffer) => {
      const data = new Uint8Array(buffer);
      const frameType = data[0];
      const sequence = new DataView(data.buffer).getUint32(1, false);
      const audioData = data.slice(5);

      if (frameType === 0x02) {
        // Process audio output
      }
    });
  }
};
```

### Backend (thinker_talker_websocket_handler.py)

```python
async def _handle_binary_frame(self, data: bytes) -> None:
    """Handle binary WebSocket frame (audio data)."""
    if len(data) < BINARY_HEADER_SIZE:
        return

    frame_type = data[0]
    sequence = int.from_bytes(data[1:5], "big")
    audio_data = data[5:]

    if frame_type == BINARY_FRAME_TYPE_AUDIO_INPUT:
        # Validate sequence
        # Send to pipeline
        await self._pipeline_session.send_audio(audio_data)
```

---

## Performance Metrics

| Metric              | JSON (base64) | Binary  | Improvement |
| ------------------- | ------------- | ------- | ----------- |
| Bandwidth per chunk | ~2.7 KB       | ~2.0 KB | -33%        |
| Encoding time       | ~0.5 ms       | 0 ms    | -100%       |
| CPU overhead        | Medium        | Low     | -50%        |

---

## Enabling the Feature

### Via Admin Panel

1. Navigate to **Admin Panel → Feature Flags**
2. Find `backend.voice_ws_binary_audio`
3. Toggle to **Enabled**
4. Set rollout percentage (recommended: start at 10%)

### Via API

```bash
curl -X PATCH https://api.dev.asimo.io/api/admin/feature-flags/backend.voice_ws_binary_audio \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true, "rollout_percentage": 100}'
```

---

## Monitoring

### Key Metrics

| Metric             | Target | Alert Threshold |
| ------------------ | ------ | --------------- |
| Binary frame rate  | >95%   | <80%            |
| Sequence gaps      | 0      | >5 per session  |
| Frame parse errors | 0      | >1 per session  |

### Logging

Look for these log messages:

```
[WS] Binary audio enabled for {session_id}
[WS] Binary audio #{count}, seq={sequence}
[WS] Audio sequence gap: expected {n}, got {m}
```

---

## Troubleshooting

### Issue: Binary frames not being used

1. Verify feature flag is enabled
2. Check client is requesting `binary_audio` feature
3. Check server response includes `binary_audio` in negotiated features

### Issue: Sequence gaps detected

1. Check network stability
2. Increase buffer size on poor networks
3. Enable graceful degradation for automatic fallback

---

## Related Documentation

- [WebSocket Latency Optimization](./websocket-latency-optimization.md)
- [WebSocket Session Persistence](./websocket-session-persistence.md) (Phase 2)
- [WebSocket Graceful Degradation](./websocket-graceful-degradation.md) (Phase 3)
