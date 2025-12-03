---
title: Voice Pipeline WebSocket API
slug: api-reference/voice-pipeline-ws
summary: WebSocket API reference for the Thinker-Talker voice pipeline with audio streaming and TTS playback.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-02"
audience: ["developers", "backend", "frontend", "agent"]
tags: ["api", "websocket", "voice", "streaming"]
category: reference
---

# Voice Pipeline WebSocket API

> **Endpoint:** `wss://{host}/api/voice/pipeline-ws`
> **Protocol:** JSON over WebSocket
> **Status:** Production Ready
> **Last Updated:** 2025-12-02

## Overview

The Voice Pipeline WebSocket provides bidirectional communication for the Thinker-Talker voice mode. It handles audio streaming, transcription, LLM responses, and TTS playback.

## Connection

### Authentication

Include JWT token in connection URL or headers:

```javascript
const ws = new WebSocket(`wss://assist.asimo.io/api/voice/pipeline-ws?token=${accessToken}`);
```

### Connection Lifecycle

```
1. Client connects with auth token
   │
2. Server accepts, creates pipeline session
   │
3. Server sends: session.ready
   │
4. Client sends: session.init (optional config)
   │
5. Server acknowledges: session.init.ack
   │
6. Voice mode active - bidirectional streaming
   │
7. Client or server closes connection
```

## Message Format

All messages are JSON objects with a `type` field:

```json
{
  "type": "message_type",
  "field1": "value1",
  "field2": "value2"
}
```

## Client → Server Messages

### session.init

Initialize or reconfigure the session.

```json
{
  "type": "session.init",
  "conversation_id": "conv-123",
  "voice_settings": {
    "voice_id": "TxGEqnHWrfWFTfGW9XjX",
    "language": "en",
    "barge_in_enabled": true
  }
}
```

| Field                             | Type    | Required | Description                             |
| --------------------------------- | ------- | -------- | --------------------------------------- |
| `conversation_id`                 | string  | No       | Link to existing chat conversation      |
| `voice_settings.voice_id`         | string  | No       | ElevenLabs voice ID                     |
| `voice_settings.language`         | string  | No       | STT language code (default: "en")       |
| `voice_settings.barge_in_enabled` | boolean | No       | Allow user interruption (default: true) |

### audio.input

Stream audio from microphone.

```json
{
  "type": "audio.input",
  "audio": "base64_encoded_pcm16_audio"
}
```

| Field   | Type   | Required | Description                              |
| ------- | ------ | -------- | ---------------------------------------- |
| `audio` | string | Yes      | Base64-encoded PCM16 audio (16kHz, mono) |

**Audio Format Requirements:**

- Sample rate: 16000 Hz
- Channels: 1 (mono)
- Bit depth: 16-bit signed PCM
- Encoding: Little-endian
- Chunk size: ~100ms recommended (1600 samples)

### audio.input.complete

Signal end of user speech (manual commit).

```json
{
  "type": "audio.input.complete"
}
```

Normally, VAD auto-detects speech end. Use this for push-to-talk implementations.

### barge_in

Interrupt AI response.

```json
{
  "type": "barge_in"
}
```

When received:

- Cancels TTS synthesis
- Clears audio queue
- Resets pipeline to listening state

### message

Send text input (fallback when mic unavailable).

```json
{
  "type": "message",
  "content": "What's the weather like?"
}
```

### ping

Keep-alive heartbeat.

```json
{
  "type": "ping"
}
```

Server responds with `pong`.

## Server → Client Messages

### session.ready

Session initialized successfully.

```json
{
  "type": "session.ready",
  "session_id": "sess-abc123",
  "pipeline_mode": "thinker_talker"
}
```

### session.init.ack

Acknowledges session.init message.

```json
{
  "type": "session.init.ack"
}
```

### transcript.delta

Partial STT transcript (streaming).

```json
{
  "type": "transcript.delta",
  "text": "What is the",
  "is_final": false
}
```

| Field      | Type    | Description             |
| ---------- | ------- | ----------------------- |
| `text`     | string  | Partial transcript text |
| `is_final` | boolean | Always false for delta  |

### transcript.complete

Final STT transcript.

```json
{
  "type": "transcript.complete",
  "text": "What is the weather today?",
  "message_id": "msg-xyz789"
}
```

| Field        | Type   | Description               |
| ------------ | ------ | ------------------------- |
| `text`       | string | Complete transcript       |
| `message_id` | string | Unique message identifier |

### response.delta

Streaming LLM response token.

```json
{
  "type": "response.delta",
  "delta": "The",
  "message_id": "resp-123"
}
```

| Field        | Type   | Description          |
| ------------ | ------ | -------------------- |
| `delta`      | string | Response token/chunk |
| `message_id` | string | Response message ID  |

### response.complete

Complete LLM response.

```json
{
  "type": "response.complete",
  "text": "The weather today is sunny with a high of 72 degrees.",
  "message_id": "resp-123"
}
```

### audio.output

TTS audio chunk.

```json
{
  "type": "audio.output",
  "audio": "base64_encoded_pcm_audio",
  "is_final": false,
  "sentence_index": 0
}
```

| Field            | Type    | Description                            |
| ---------------- | ------- | -------------------------------------- |
| `audio`          | string  | Base64-encoded PCM audio (24kHz, mono) |
| `is_final`       | boolean | True for last chunk                    |
| `sentence_index` | number  | Which sentence this is from            |

**Output Audio Format:**

- Sample rate: 24000 Hz
- Channels: 1 (mono)
- Bit depth: 16-bit signed PCM
- Encoding: Little-endian

### tool.call

Tool invocation started.

```json
{
  "type": "tool.call",
  "id": "call-abc",
  "name": "calendar_list_events",
  "arguments": {
    "start_date": "2025-12-01",
    "end_date": "2025-12-07"
  }
}
```

| Field       | Type   | Description        |
| ----------- | ------ | ------------------ |
| `id`        | string | Tool call ID       |
| `name`      | string | Tool function name |
| `arguments` | object | Tool arguments     |

### tool.result

Tool execution completed.

```json
{
  "type": "tool.result",
  "id": "call-abc",
  "name": "calendar_list_events",
  "result": {
    "events": [{ "title": "Team Meeting", "start": "2025-12-02T10:00:00" }]
  }
}
```

| Field    | Type   | Description           |
| -------- | ------ | --------------------- |
| `id`     | string | Tool call ID          |
| `name`   | string | Tool function name    |
| `result` | any    | Tool execution result |

### voice.state

Pipeline state change.

```json
{
  "type": "voice.state",
  "state": "speaking"
}
```

| State        | Description                 |
| ------------ | --------------------------- |
| `idle`       | Waiting for user input      |
| `listening`  | Receiving audio, STT active |
| `processing` | LLM thinking                |
| `speaking`   | TTS playing                 |
| `cancelled`  | Barge-in occurred           |

### heartbeat

Server heartbeat (every 30s).

```json
{
  "type": "heartbeat"
}
```

### pong

Response to client ping.

```json
{
  "type": "pong"
}
```

### error

Error occurred.

```json
{
  "type": "error",
  "code": "stt_failed",
  "message": "Speech-to-text service unavailable",
  "recoverable": true
}
```

| Field         | Type    | Description              |
| ------------- | ------- | ------------------------ |
| `code`        | string  | Error code               |
| `message`     | string  | Human-readable message   |
| `recoverable` | boolean | True if client can retry |

**Error Codes:**

| Code                | Description            | Recoverable |
| ------------------- | ---------------------- | ----------- |
| `invalid_json`      | Malformed JSON message | Yes         |
| `connection_failed` | Pipeline init failed   | No          |
| `stt_failed`        | STT service error      | Yes         |
| `llm_failed`        | LLM service error      | Yes         |
| `tts_failed`        | TTS service error      | Yes         |
| `auth_failed`       | Authentication error   | No          |
| `rate_limited`      | Too many requests      | Yes         |

## Example: Complete Session

```javascript
// 1. Connect
const ws = new WebSocket(`wss://assist.asimo.io/api/voice/pipeline-ws?token=${token}`);

ws.onopen = () => {
  console.log("Connected");
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "session.ready":
      // 2. Initialize with settings
      ws.send(
        JSON.stringify({
          type: "session.init",
          conversation_id: currentConversationId,
          voice_settings: {
            voice_id: "TxGEqnHWrfWFTfGW9XjX",
            language: "en",
          },
        }),
      );
      break;

    case "session.init.ack":
      // 3. Start sending audio
      startMicrophoneCapture();
      break;

    case "transcript.delta":
      // Show partial transcript
      updatePartialTranscript(msg.text);
      break;

    case "transcript.complete":
      // Show final transcript
      setTranscript(msg.text);
      break;

    case "response.delta":
      // Append LLM response
      appendResponse(msg.delta);
      break;

    case "audio.output":
      // Play TTS audio
      if (msg.audio) {
        const pcm = base64ToArrayBuffer(msg.audio);
        audioPlayer.queueChunk(pcm);
      }
      if (msg.is_final) {
        audioPlayer.finish();
      }
      break;

    case "tool.call":
      // Show tool being called
      showToolCall(msg.name, msg.arguments);
      break;

    case "tool.result":
      // Show tool result
      showToolResult(msg.name, msg.result);
      break;

    case "error":
      console.error(`Error [${msg.code}]: ${msg.message}`);
      if (!msg.recoverable) {
        ws.close();
      }
      break;
  }
};

// Send audio chunks from microphone
function sendAudioChunk(pcmData) {
  ws.send(
    JSON.stringify({
      type: "audio.input",
      audio: arrayBufferToBase64(pcmData),
    }),
  );
}

// Handle barge-in (user speaks while AI is talking)
function handleBargeIn() {
  ws.send(JSON.stringify({ type: "barge_in" }));
  audioPlayer.stop();
}
```

## Configuration Reference

### TTSessionConfig (Backend)

```python
@dataclass
class TTSessionConfig:
    user_id: str
    session_id: str
    conversation_id: Optional[str] = None

    # Voice settings
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"
    tts_model: str = "eleven_flash_v2_5"
    language: str = "en"

    # STT settings
    stt_sample_rate: int = 16000
    stt_endpointing_ms: int = 800
    stt_utterance_end_ms: int = 1500

    # Barge-in
    barge_in_enabled: bool = True

    # Timeouts
    connection_timeout_sec: float = 10.0
    idle_timeout_sec: float = 300.0
```

## Rate Limiting

| Limit                            | Value                  |
| -------------------------------- | ---------------------- |
| Max concurrent sessions per user | 2                      |
| Max concurrent sessions total    | 100                    |
| Audio chunk rate                 | ~10/second recommended |
| Idle timeout                     | 300 seconds            |

## Related Documentation

- [Thinker-Talker Pipeline Overview](../THINKER_TALKER_PIPELINE.md)
- [Frontend Voice Hooks](../frontend/thinker-talker-hooks.md)
- [Voice Mode Settings Guide](../VOICE_MODE_SETTINGS_GUIDE.md)
