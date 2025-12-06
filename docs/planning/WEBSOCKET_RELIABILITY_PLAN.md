---
title: WebSocket Connection Reliability Enhancement Plan
slug: websocket-reliability-plan
status: draft
owner: mixed
lastUpdated: "2025-12-05"
priority: high
category: planning
ai_summary: >-
  Comprehensive plan to address three WebSocket reliability deficiencies:
  binary frame support, connection pooling/load balancing, and graceful
  degradation. Includes architecture changes, implementation steps, and
  testing strategy.
---

# WebSocket Connection Reliability Enhancement Plan

**Version:** 1.0
**Created:** 2025-12-05
**Status:** Draft - Pending Review

---

## Executive Summary

This document outlines a comprehensive plan to address three key WebSocket reliability deficiencies in VoiceAssist's voice mode:

1. **Binary Frame Support** - Eliminate base64 encoding overhead for audio
2. **Connection Pooling & Load Balancing** - Enable horizontal scaling
3. **Graceful Degradation** - Improve resilience during failures

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│   Frontend      │ ◄──────────────────► │  API Gateway     │
│ (web-app)       │   JSON + Base64     │  (FastAPI)       │
│                 │   audio frames      │                  │
└─────────────────┘                     └────────┬─────────┘
                                                 │
                         ┌───────────────────────┼───────────────┐
                         ▼                       ▼               ▼
                  ┌──────────┐           ┌───────────┐    ┌───────────┐
                  │ Deepgram │           │  GPT-4o   │    │ElevenLabs │
                  │   STT    │           │ (Thinker) │    │   TTS     │
                  └──────────┘           └───────────┘    └───────────┘
```

### Identified Issues

| Issue                 | Current Behavior                            | Impact                       |
| --------------------- | ------------------------------------------- | ---------------------------- |
| No Binary Frames      | All audio base64-encoded in JSON            | +33% bandwidth, CPU overhead |
| No Connection Pooling | Single WS per session, in-memory state      | No horizontal scaling        |
| Limited Degradation   | Service fallback exists, but no WS recovery | Session loss on failure      |

---

## Issue 1: Binary Frame Support

### Goal

Replace base64-encoded JSON audio frames with native WebSocket binary frames to reduce bandwidth and latency.

### Current Implementation

**Frontend (`useThinkerTalkerSession.ts:1707-1729`):**

```typescript
scriptProcessor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0);
  const pcm16 = new Int16Array(inputData.length);
  // ... convert to PCM16 ...
  const uint8 = new Uint8Array(pcm16.buffer);
  const base64 = btoa(String.fromCharCode(...uint8)); // ← Base64 overhead
  ws.send(JSON.stringify({ type: "audio.input", audio: base64 }));
};
```

**Backend (`voice_pipeline_service.py:706-715`):**

```python
async def send_audio_base64(self, audio_b64: str) -> None:
    audio_data = base64.b64decode(audio_b64)  # ← Decoding overhead
    await self.send_audio(audio_data)
```

### Proposed Solution

#### 1.1 Protocol Enhancement

Implement a **hybrid protocol** that supports both JSON text frames and binary frames:

| Frame Type  | Content                                  | Direction       |
| ----------- | ---------------------------------------- | --------------- |
| Text (JSON) | Control messages, transcripts, responses | Bidirectional   |
| Binary      | Raw PCM16 audio data                     | Client → Server |
| Binary      | Raw PCM audio (TTS output)               | Server → Client |

#### 1.2 Binary Frame Format

```
┌──────────────────────────────────────────────────────────────┐
│ Byte 0    │ Bytes 1-4       │ Bytes 5-N                     │
│ Type Flag │ Sequence Number │ Raw Audio Data (PCM16/PCM24)  │
│ (0x01=in) │ (uint32 BE)     │                               │
│ (0x02=out)│                 │                               │
└──────────────────────────────────────────────────────────────┘
```

- **Type Flag (1 byte):** `0x01` = audio input, `0x02` = audio output
- **Sequence Number (4 bytes):** For ordering/dedup (big-endian uint32)
- **Audio Data:** Raw PCM16 (16kHz, mono) for input; PCM24 (24kHz, mono) for output

#### 1.3 Implementation Steps

**Backend Changes:**

1. **Update WebSocket handler** (`thinker_talker_websocket_handler.py`):

   ```python
   async def _receive_loop(self) -> None:
       while self._running:
           message = await self.websocket.receive()
           if message["type"] == "websocket.receive":
               if "bytes" in message:
                   # Binary frame - direct audio
                   await self._handle_binary_audio(message["bytes"])
               elif "text" in message:
                   # JSON frame - control message
                   await self._handle_json_message(json.loads(message["text"]))
   ```

2. **Add binary audio handler**:

   ```python
   async def _handle_binary_audio(self, data: bytes) -> None:
       if len(data) < 5:
           return  # Invalid frame
       frame_type = data[0]
       sequence = int.from_bytes(data[1:5], 'big')
       audio_data = data[5:]

       if frame_type == 0x01:  # Audio input
           await self._pipeline_session.send_audio(audio_data)
           self._metrics.messages_received += 1
   ```

3. **Update audio output to send binary**:
   ```python
   async def _send_audio_binary(self, audio_data: bytes, sequence: int) -> None:
       header = bytes([0x02]) + sequence.to_bytes(4, 'big')
       await self.websocket.send_bytes(header + audio_data)
   ```

**Frontend Changes:**

1. **Update audio streaming** (`useThinkerTalkerSession.ts`):

   ```typescript
   // Replace base64 encoding with binary send
   scriptProcessor.onaudioprocess = (event) => {
     if (ws.readyState !== WebSocket.OPEN) return;

     const inputData = event.inputBuffer.getChannelData(0);
     const pcm16 = new Int16Array(inputData.length);
     for (let i = 0; i < inputData.length; i++) {
       const s = Math.max(-1, Math.min(1, inputData[i]));
       pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
     }

     // Create binary frame with header
     const header = new Uint8Array(5);
     header[0] = 0x01; // Audio input type
     const view = new DataView(header.buffer);
     view.setUint32(1, audioSequence++, false); // Big-endian

     // Combine header + audio
     const frame = new Uint8Array(5 + pcm16.byteLength);
     frame.set(header);
     frame.set(new Uint8Array(pcm16.buffer), 5);

     ws.send(frame.buffer); // Send as binary
   };
   ```

2. **Handle binary audio output**:

   ```typescript
   ws.onmessage = (event) => {
     if (event.data instanceof ArrayBuffer) {
       // Binary frame - audio output
       const data = new Uint8Array(event.data);
       const frameType = data[0];
       const sequence = new DataView(data.buffer).getUint32(1, false);
       const audioData = data.slice(5);

       if (frameType === 0x02) {
         options.onAudioChunk?.(audioData); // Pass raw bytes
       }
     } else {
       // Text frame - JSON control message
       const message = JSON.parse(event.data);
       handleMessageRef.current(message);
     }
   };
   ```

3. **Update audio playback hook** to accept `Uint8Array` instead of base64 string.

#### 1.4 Backward Compatibility

- Maintain base64 fallback for older clients via feature flag
- Version negotiation in `session.init` message:
  ```json
  {
    "type": "session.init",
    "protocol_version": "2.0",
    "features": ["binary_audio"]
  }
  ```

#### 1.5 Expected Benefits

| Metric              | Before         | After         | Improvement |
| ------------------- | -------------- | ------------- | ----------- |
| Audio bandwidth     | 1.33x raw size | 1.0x raw size | -25%        |
| CPU (encode/decode) | ~5ms/chunk     | ~0.1ms/chunk  | -98%        |
| Latency per frame   | +2-3ms         | ~0ms          | -100%       |

---

## Issue 2: Connection Pooling & Load Balancing

### Goal

Enable horizontal scaling of WebSocket servers with session state preservation across instances.

### Current Limitations

- `ThinkerTalkerSessionManager` stores sessions in local memory
- No session state sharing between API Gateway instances
- No sticky session support

### Proposed Solution

#### 2.1 Architecture Enhancement

```
                    ┌─────────────────────────────────────────────┐
                    │              Load Balancer                  │
                    │   (with WebSocket sticky sessions)          │
                    └──────────────┬───────────────┬──────────────┘
                                   │               │
                    ┌──────────────▼──────┐ ┌──────▼──────────────┐
                    │   API Gateway 1     │ │   API Gateway 2     │
                    │   (voiceassist-srv) │ │   (voiceassist-srv) │
                    └──────────┬──────────┘ └──────────┬──────────┘
                               │                       │
                    ┌──────────▼───────────────────────▼──────────┐
                    │              Redis Cluster                   │
                    │   • Session state (voice_session:{id})      │
                    │   • Connection registry                      │
                    │   • Pub/Sub for cross-instance messaging     │
                    └─────────────────────────────────────────────┘
```

#### 2.2 Redis Session State

**Session State Keys:**

```
voice_session:{session_id}:state     → JSON state object
voice_session:{session_id}:instance  → Server instance ID
voice_session:{session_id}:ttl       → TTL with heartbeat refresh
```

**State Object:**

```json
{
  "session_id": "uuid",
  "user_id": "uuid",
  "conversation_id": "uuid",
  "pipeline_state": "listening",
  "voice_settings": { ... },
  "created_at": "2025-12-05T...",
  "last_activity": "2025-12-05T...",
  "metrics": { ... },
  "instance_id": "api-gateway-1"
}
```

#### 2.3 Implementation Steps

1. **Create RedisSessionStore** (`services/redis_session_store.py`):

   ```python
   class RedisVoiceSessionStore:
       def __init__(self, redis_client: Redis):
           self._redis = redis_client
           self._instance_id = os.environ.get("INSTANCE_ID", str(uuid.uuid4())[:8])

       async def register_session(self, session_id: str, state: dict) -> None:
           key = f"voice_session:{session_id}:state"
           await self._redis.set(key, json.dumps(state), ex=3600)
           await self._redis.set(
               f"voice_session:{session_id}:instance",
               self._instance_id,
               ex=3600
           )

       async def get_session(self, session_id: str) -> Optional[dict]:
           key = f"voice_session:{session_id}:state"
           data = await self._redis.get(key)
           return json.loads(data) if data else None

       async def update_activity(self, session_id: str) -> None:
           await self._redis.expire(f"voice_session:{session_id}:state", 3600)
           await self._redis.hset(
               f"voice_session:{session_id}:state",
               "last_activity",
               datetime.utcnow().isoformat()
           )
   ```

2. **Add session recovery endpoint** (`voice.py`):

   ```python
   @router.post("/voice/session/recover")
   async def recover_session(
       session_id: str,
       current_user: User = Depends(get_current_user)
   ):
       """Recover a disconnected voice session on a different instance."""
       state = await redis_session_store.get_session(session_id)
       if not state or state["user_id"] != str(current_user.id):
           raise HTTPException(404, "Session not found or not owned")

       return {
           "session_id": session_id,
           "can_recover": True,
           "pipeline_state": state["pipeline_state"],
           "reconnect_token": create_reconnect_token(session_id)
       }
   ```

3. **Update ThinkerTalkerSessionManager** to use Redis:

   ```python
   class ThinkerTalkerSessionManager:
       def __init__(self, redis_store: RedisVoiceSessionStore):
           self._redis_store = redis_store
           self._local_sessions: Dict[str, ThinkerTalkerWebSocketHandler] = {}

       async def create_session(self, ...):
           handler = ThinkerTalkerWebSocketHandler(...)
           self._local_sessions[config.session_id] = handler

           # Register in Redis for cross-instance discovery
           await self._redis_store.register_session(
               config.session_id,
               {
                   "session_id": config.session_id,
                   "user_id": config.user_id,
                   "conversation_id": config.conversation_id,
                   "pipeline_state": "idle",
                   "voice_settings": asdict(config),
               }
           )
           return handler
   ```

4. **Frontend reconnection logic** (`useThinkerTalkerSession.ts`):

   ```typescript
   const attemptRecovery = async (sessionId: string): Promise<boolean> => {
     try {
       const response = await fetch(`/api/voice/session/recover`, {
         method: "POST",
         headers: { Authorization: `Bearer ${tokens.accessToken}` },
         body: JSON.stringify({ session_id: sessionId }),
       });

       if (response.ok) {
         const data = await response.json();
         if (data.can_recover) {
           // Reconnect to WebSocket with recovery token
           const ws = await initializeWebSocket(data.reconnect_token);
           ws.send(
             JSON.stringify({
               type: "session.recover",
               session_id: sessionId,
               token: data.reconnect_token,
             }),
           );
           return true;
         }
       }
     } catch (err) {
       voiceLog.warn("Session recovery failed:", err);
     }
     return false;
   };
   ```

#### 2.4 Load Balancer Configuration

For NGINX or Traefik:

```nginx
upstream voiceassist_ws {
    ip_hash;  # Sticky sessions by client IP
    server api-gateway-1:8000;
    server api-gateway-2:8000;
}

location /api/voice/pipeline-ws {
    proxy_pass http://voiceassist_ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;  # 24h for long-lived connections
}
```

---

## Issue 3: Graceful Degradation

### Goal

Ensure voice mode remains functional (possibly with reduced capabilities) during partial failures.

### Current State

- `VoiceFallbackOrchestrator` handles service-level fallback (STT, TTS, LLM)
- No WebSocket-level recovery
- No client-side degradation strategy

### Proposed Solution

#### 3.1 Degradation Levels

| Level                  | Condition            | User Experience                                |
| ---------------------- | -------------------- | ---------------------------------------------- |
| **Full Voice**         | All services healthy | Normal operation                               |
| **Reduced Latency**    | TTS degraded         | OpenAI TTS fallback (slightly different voice) |
| **Text + Voice Input** | TTS failed           | User speaks, AI responds with text only        |
| **Text Mode**          | STT failed           | Full text chat with TTS read-aloud             |
| **Offline**            | All services down    | Cached responses, local whisper                |

#### 3.2 Implementation Components

**3.2.1 WebSocket Health Monitor**

```python
# services/websocket_health_monitor.py
class WebSocketHealthMonitor:
    """Monitors WebSocket connection health and triggers degradation."""

    def __init__(self, session: VoicePipelineSession):
        self._session = session
        self._last_pong = time.time()
        self._ping_interval = 15.0  # seconds
        self._pong_timeout = 5.0
        self._degradation_level = DegradationLevel.FULL

    async def check_health(self) -> DegradationLevel:
        # Check upstream services
        stt_health = await self._check_stt_health()
        tts_health = await self._check_tts_health()
        llm_health = await self._check_llm_health()

        if all([stt_health, tts_health, llm_health]):
            return DegradationLevel.FULL
        elif stt_health and llm_health and not tts_health:
            return DegradationLevel.TEXT_RESPONSE
        elif not stt_health and llm_health:
            return DegradationLevel.TEXT_MODE
        else:
            return DegradationLevel.OFFLINE
```

**3.2.2 Frontend Degradation UI**

```typescript
// components/VoiceModeStatus.tsx
export function VoiceModeStatus({ degradationLevel }: Props) {
  const statusConfig = {
    full: { icon: '🎤', text: 'Voice Mode Active', color: 'green' },
    reduced: { icon: '⚡', text: 'Reduced Quality', color: 'yellow' },
    text_response: { icon: '💬', text: 'Text Responses Only', color: 'orange' },
    text_mode: { icon: '⌨️', text: 'Text Mode (Voice Unavailable)', color: 'red' },
    offline: { icon: '📴', text: 'Offline Mode', color: 'gray' }
  };

  return (
    <Badge variant={statusConfig[degradationLevel].color}>
      {statusConfig[degradationLevel].icon} {statusConfig[degradationLevel].text}
    </Badge>
  );
}
```

**3.2.3 Partial Response Recovery**
When a stream fails mid-response:

```python
async def _handle_stream_failure(self, error: Exception, partial_response: str):
    """Recover from mid-stream failure."""
    # Save partial response
    await self._on_message(PipelineMessage(
        type="response.partial_saved",
        data={
            "content": partial_response,
            "recoverable": True,
            "error": str(error)
        }
    ))

    # Attempt retry with fallback service
    if self._fallback_orchestrator.has_fallback(ServiceType.LLM):
        self._thinker_session = await self._fallback_orchestrator.get_fallback(
            ServiceType.LLM
        )
        # Resume from last checkpoint
        await self._thinker_session.continue_from(partial_response)
```

**3.2.4 Client-Side Offline Cache**

```typescript
// lib/voiceOfflineCache.ts
class VoiceOfflineCache {
  private db: IDBDatabase;

  async cacheResponse(query: string, response: TTSAudio): Promise<void> {
    // Cache common responses for offline playback
    const tx = this.db.transaction("responses", "readwrite");
    await tx.objectStore("responses").put({
      query: normalizeQuery(query),
      audio: response.audioData,
      text: response.text,
      cachedAt: Date.now(),
    });
  }

  async getOfflineResponse(query: string): Promise<CachedResponse | null> {
    const normalized = normalizeQuery(query);
    const tx = this.db.transaction("responses", "readonly");
    return tx.objectStore("responses").get(normalized);
  }
}
```

#### 3.3 Integration with Existing Fallback Orchestrator

Update `VoiceFallbackOrchestrator` to emit degradation events:

```python
# Add to voice_fallback_orchestrator.py
async def handle_service_failure(
    self,
    service_type: ServiceType,
    error: Exception
) -> FallbackResult:
    """Handle service failure with graceful degradation."""
    result = await self.execute_with_fallback(service_type, ...)

    if result.fallback_activated:
        # Notify clients of degradation
        await self._broadcast_degradation_event(
            service_type=service_type,
            new_provider=result.provider_used,
            degradation_level=self._calculate_degradation_level()
        )

    return result

async def _broadcast_degradation_event(self, **kwargs):
    """Broadcast to all active voice sessions via Redis pub/sub."""
    await self._redis.publish(
        "voice:degradation",
        json.dumps({
            "event": "degradation_change",
            **kwargs
        })
    )
```

---

## Testing Strategy

### Unit Tests

- Binary frame encoding/decoding
- Session state serialization
- Fallback logic

### Integration Tests

- WebSocket connection with binary frames
- Session recovery after disconnect
- Service failover scenarios

### Load Tests

- Multiple concurrent voice sessions
- Horizontal scaling simulation
- Degradation under load

### Chaos Testing

- Random service failures
- Network partitions
- Instance crashes

---

## Implementation Timeline

| Phase       | Scope                                     | Estimated Effort |
| ----------- | ----------------------------------------- | ---------------- |
| **Phase 1** | Binary frame support (backend + frontend) | 3-4 days         |
| **Phase 2** | Redis session state                       | 2-3 days         |
| **Phase 3** | Session recovery endpoint                 | 1-2 days         |
| **Phase 4** | Graceful degradation events               | 2-3 days         |
| **Phase 5** | Frontend degradation UI                   | 1-2 days         |
| **Phase 6** | Testing & documentation                   | 2-3 days         |

**Total:** ~12-17 days

---

## Success Metrics

| Metric                           | Current | Target |
| -------------------------------- | ------- | ------ |
| Audio bandwidth overhead         | 33%     | <5%    |
| Session recovery rate            | 0%      | >95%   |
| Degradation notification latency | N/A     | <500ms |
| Voice mode availability          | ~99%    | >99.9% |

---

## Related Documentation

- [WebSocket Protocol Specification](../WEBSOCKET_PROTOCOL.md)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md)
- [Thinker-Talker Pipeline](../THINKER_TALKER_PIPELINE.md)
- [Voice Fallback Orchestrator](../services/voice-fallback-orchestrator.md)

---

**Document Version:** 1.0
**Maintainer:** VoiceAssist Development Team
