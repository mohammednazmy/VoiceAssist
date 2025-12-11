---
title: Real-time Architecture
slug: architecture/realtime
summary: >-
  WebSocket communication, voice processing, and streaming response
  architecture.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-04"
audience:
  - human
  - agent
  - ai-agents
  - backend
  - frontend
tags:
  - architecture
  - websocket
  - realtime
  - voice
  - streaming
relatedServices:
  - api-gateway
  - web-app
category: architecture
component: "backend/websocket"
relatedPaths:
  - "services/api-gateway/app/api/websocket.py"
  - "services/api-gateway/app/api/voice.py"
  - "apps/web-app/src/hooks/useRealtimeVoiceSession.ts"
  - "apps/web-app/src/hooks/useWebSocket.ts"
source_of_truth: true
version: 1.0.0
ai_summary: >-
  Last Updated: 2025-11-27 Status: Production Ready Related Documentation: -
  WebSocket Protocol - Wire protocol specification - Voice Mode Pipeline -
  Voice-specific implementation - Implementation Status - Component status ---
  VoiceAssist uses WebSocket connections for real-time bidirectional commu...
---

# VoiceAssist Real-time Architecture

**Last Updated**: 2025-12-04
**Status**: Production Ready

**Related Documentation:**

- [WebSocket Protocol](WEBSOCKET_PROTOCOL.md) - Wire protocol specification
- [Voice Mode Pipeline](VOICE_MODE_PIPELINE.md) - Voice-specific implementation
- [Implementation Status](overview/IMPLEMENTATION_STATUS.md) - Component status

---

## Overview

VoiceAssist uses WebSocket connections for real-time bidirectional communication, enabling:

- **Streaming chat responses** - Token-by-token LLM output
- **Voice interactions** - Speech-to-text and text-to-speech
- **Live updates** - Typing indicators, connection status

For voice WebSocket flows, runtime state is expressed using the canonical `VoicePipelineState` union described in the [Voice Mode Pipeline](VOICE_MODE_PIPELINE.md#canonical-voice-pipeline-state-model), shared across frontend `voiceState`, backend `PipelineState`, and `voice.state` / `session.resume.ack.pipeline_state` messages.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │   Chat UI       │  │   Voice Input   │  │   Connection Manager    │ │
│  │                 │  │   (Web Audio)   │  │   - Reconnection        │ │
│  │   - Messages    │  │   - Mic capture │  │   - Heartbeat           │ │
│  │   - Streaming   │  │   - STT stream  │  │   - Token refresh       │ │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘ │
│           │                    │                        │               │
│           └────────────────────┼────────────────────────┘               │
│                                │                                        │
│                         ┌──────▼──────┐                                │
│                         │  WebSocket  │                                │
│                         │   Client    │                                │
│                         └──────┬──────┘                                │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                          WSS/WS │
                                 │
┌────────────────────────────────┼────────────────────────────────────────┐
│                                │                                        │
│                         ┌──────▼──────┐                                │
│                         │  WebSocket  │                                │
│                         │   Handler   │                                │
│                         │  (FastAPI)  │                                │
│                         └──────┬──────┘                                │
│                                │                                        │
│           ┌────────────────────┼────────────────────┐                  │
│           │                    │                    │                   │
│    ┌──────▼──────┐      ┌──────▼──────┐     ┌──────▼──────┐           │
│    │   Chat      │      │   Voice     │     │ Connection  │           │
│    │   Service   │      │   Service   │     │   Manager   │           │
│    │             │      │             │     │             │           │
│    │ - RAG Query │      │ - STT       │     │ - Sessions  │           │
│    │ - LLM Call  │      │ - TTS       │     │ - Heartbeat │           │
│    │ - Streaming │      │ - VAD       │     │ - Auth      │           │
│    └──────┬──────┘      └──────┬──────┘     └─────────────┘           │
│           │                    │                                        │
│           └────────────────────┼────────────────────────────────────────┤
│                                │                                        │
│                         ┌──────▼──────┐                                │
│                         │   OpenAI    │                                │
│                         │   API       │                                │
│                         │             │                                │
│                         │ - GPT-4     │                                │
│                         │ - Whisper   │                                │
│                         │ - TTS       │                                │
│                         └─────────────┘                                │
│                                                                         │
│                              Backend                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Connection Lifecycle

### 1. Connection Establishment

```
Client                                    Server
  │                                         │
  ├──── WebSocket Connect ─────────────────►│
  │     (with token & conversationId)       │
  │                                         │
  │◄──── connection_established ────────────┤
  │      { connectionId, serverTime }       │
  │                                         │
```

### 2. Message Exchange

```
Client                                    Server
  │                                         │
  ├──── message ───────────────────────────►│
  │     { content: "Hello" }                │
  │                                         │
  │◄──── thinking ──────────────────────────┤
  │                                         │
  │◄──── assistant_chunk ───────────────────┤
  │      { content: "Hi" }                  │
  │◄──── assistant_chunk ───────────────────┤
  │      { content: " there" }              │
  │◄──── assistant_chunk ───────────────────┤
  │      { content: "!" }                   │
  │                                         │
  │◄──── message_complete ──────────────────┤
  │      { messageId, totalTokens }         │
  │                                         │
```

### 3. Heartbeat

```
Client                                    Server
  │                                         │
  ├──── ping ──────────────────────────────►│
  │                                         │
  │◄──── pong ──────────────────────────────┤
  │                                         │
```

---

## WebSocket Endpoints

| Endpoint           | Purpose                           |
| ------------------ | --------------------------------- |
| `/api/realtime/ws` | Main chat WebSocket               |
| `/api/voice/ws`    | Voice-specific WebSocket (future) |

### Query Parameters

| Parameter        | Required | Description                      |
| ---------------- | -------- | -------------------------------- |
| `conversationId` | Yes      | UUID of the conversation session |
| `token`          | Yes      | JWT access token                 |

### Connection URL Example

```typescript
// Development
ws://localhost:8000/api/realtime/ws?conversationId=uuid&token=jwt

// Production
wss://localhost:8000/api/realtime/ws?conversationId=uuid&token=jwt
```

---

## Message Types

### Client → Server

| Type          | Description                |
| ------------- | -------------------------- |
| `message`     | Send user message          |
| `ping`        | Heartbeat ping             |
| `stop`        | Cancel current response    |
| `voice_start` | Begin voice input (future) |
| `voice_chunk` | Audio data chunk (future)  |
| `voice_end`   | End voice input (future)   |

### Server → Client

| Type                     | Description                    |
| ------------------------ | ------------------------------ |
| `connection_established` | Connection successful          |
| `thinking`               | AI is processing               |
| `assistant_chunk`        | Streaming response chunk       |
| `message_complete`       | Response finished              |
| `error`                  | Error occurred                 |
| `pong`                   | Heartbeat response             |
| `voice_transcript`       | Speech-to-text result (future) |
| `voice_audio`            | TTS audio chunk (future)       |

---

## Streaming Response Flow

### RAG + LLM Pipeline

```
User Message → WebSocket Handler
                    │
                    ▼
            ┌───────────────┐
            │  RAG Service  │ ← Retrieves relevant context
            │               │   from Qdrant vector store
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  LLM Client   │ ← Calls OpenAI with streaming
            │               │
            └───────┬───────┘
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
       chunk_1   chunk_2   chunk_n
          │         │         │
          └─────────┼─────────┘
                    │
                    ▼
            WebSocket Send
            (per chunk)
```

### Streaming Implementation

```python
# Backend (FastAPI WebSocket handler)
async def handle_message(websocket, message):
    # Send thinking indicator
    await websocket.send_json({"type": "thinking"})

    # Get RAG context
    context = await rag_service.retrieve(message.content)

    # Stream LLM response
    async for chunk in llm_client.stream_chat(message.content, context):
        await websocket.send_json({
            "type": "assistant_chunk",
            "content": chunk.content
        })

    # Send completion
    await websocket.send_json({
        "type": "message_complete",
        "messageId": str(uuid.uuid4()),
        "totalTokens": chunk.usage.total_tokens
    })
```

---

## Voice Architecture (Future Enhancement)

### Voice Input Flow

```
Microphone → Web Audio API → VAD (Voice Activity Detection)
                                      │
                                      ▼
                              Audio Chunks (PCM)
                                      │
                                      ▼
                              WebSocket Send
                                      │
                                      ▼
                              Server VAD + STT
                                      │
                                      ▼
                              Transcript Event
```

### Voice Output Flow

```
LLM Response Text → TTS Service (OpenAI/ElevenLabs)
                           │
                           ▼
                    Audio Stream (MP3/PCM)
                           │
                           ▼
                    WebSocket Send (chunks)
                           │
                           ▼
                    Web Audio API Playback
```

---

## Error Handling

### Reconnection Strategy

```typescript
class WebSocketClient {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseDelay = 1000; // 1 second

  async reconnect() {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      30000, // max 30 seconds
    );

    await sleep(delay);
    this.reconnectAttempts++;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.connect();
    } else {
      this.emit("connection_failed");
    }
  }
}
```

### Error Types

| Error Code          | Description             | Client Action               |
| ------------------- | ----------------------- | --------------------------- |
| `auth_failed`       | Invalid/expired token   | Refresh token and reconnect |
| `session_not_found` | Invalid conversation ID | Create new session          |
| `rate_limited`      | Too many requests       | Backoff and retry           |
| `server_error`      | Internal server error   | Retry with backoff          |

---

## Performance Considerations

### Client-side

1. **Buffer chunks** - Don't update DOM on every chunk
2. **Throttle renders** - Use requestAnimationFrame
3. **Heartbeat interval** - 30 seconds recommended

### Server-side

1. **Connection pooling** - Reuse OpenAI connections
2. **Chunk size** - Optimize for network vs. latency
3. **Memory management** - Clean up closed connections

---

## Security

1. **Authentication** - JWT token required in query params
2. **Rate limiting** - Per-user connection limits
3. **Message validation** - Schema validation on all messages
4. **TLS** - WSS required in production

---

## Related Documentation

- **Protocol Specification:** [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md)
- **Voice Pipeline:** [VOICE_MODE_PIPELINE.md](VOICE_MODE_PIPELINE.md)
- **Backend Handler:** `services/api-gateway/app/api/realtime.py`
- **Client Hook:** `apps/web-app/src/hooks/useWebSocket.ts`

---

## Version History

| Version | Date       | Changes                       |
| ------- | ---------- | ----------------------------- |
| 1.0.0   | 2025-11-27 | Initial architecture document |
