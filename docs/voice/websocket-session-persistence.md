---
title: WebSocket Session Persistence
slug: websocket-session-persistence
status: active
owner: backend
lastUpdated: "2024-12-06"
priority: high
category: voice
ai_summary: >-
  Phase 2 WebSocket Reliability feature enabling Redis-backed session
  persistence for voice WebSocket sessions, allowing recovery from brief
  disconnections.
---

# WebSocket Session Persistence

**Status:** Feature Flag Controlled
**Feature Flag:** `backend.voice_ws_session_persistence`
**Phase:** WebSocket Reliability Phase 2
**Last Updated:** 2024-12-06

---

## Overview

The WebSocket Session Persistence feature enables Redis-backed storage of voice session state, allowing:

1. **Brief Disconnection Recovery** - Sessions survive network hiccups
2. **Tab Visibility Changes** - Session continues when user switches tabs
3. **State Preservation** - Conversation context, audio buffers, and settings are preserved
4. **Cross-Instance Recovery** - Sessions can be recovered on different backend instances

---

## What Gets Persisted

| Data             | TTL    | Purpose                                            |
| ---------------- | ------ | -------------------------------------------------- |
| Session metadata | 5 min  | Session ID, user ID, start time                    |
| Conversation ID  | 5 min  | Link to conversation history                       |
| Voice settings   | 5 min  | Voice ID, language, VAD sensitivity                |
| Pipeline state   | 30 sec | Current pipeline state (listening, speaking, etc.) |
| Audio sequence   | 30 sec | Last sent/received sequence numbers                |
| Last activity    | 30 sec | Timestamp of last client activity                  |

---

## Redis Key Structure

```
voice_session:{session_id} -> Hash
  - user_id: string
  - conversation_id: string
  - started_at: timestamp
  - voice_settings: JSON
  - pipeline_state: string
  - audio_seq_in: int
  - audio_seq_out: int
  - last_activity: timestamp
```

---

## Session Recovery Flow

### 1. Disconnection Detection

```
Client                  Server
  │                        │
  │ ─── connection lost ───│
  │                        │
  │                        │── Save state to Redis
  │                        │
  │ ─── reconnect ─────────│
  │                        │
  │                        │── Check Redis for session
  │                        │
  │ ← session.restored ────│
  │                        │
```

### 2. Client Recovery Request

```javascript
{
  "type": "session.init",
  "protocol_version": "2.0",
  "session_id": "previous_session_id",
  "features": ["session_persistence", ...],
  "resume": true
}
```

### 3. Server Recovery Response

```javascript
{
  "type": "session.restored",
  "session_id": "previous_session_id",
  "resumed_at": "2024-12-06T12:00:00Z",
  "state": {
    "pipeline_state": "listening",
    "audio_seq_in": 1234,
    "audio_seq_out": 567
  }
}
```

---

## Implementation

### Backend Session Store

```python
class RedisSessionStore:
    """Redis-backed session state storage."""

    async def save_session(self, session_id: str, state: dict) -> None:
        """Save session state to Redis."""
        key = f"voice_session:{session_id}"
        await self.redis.hset(key, mapping={
            "user_id": state["user_id"],
            "conversation_id": state["conversation_id"],
            "voice_settings": json.dumps(state["voice_settings"]),
            "pipeline_state": state["pipeline_state"],
            "audio_seq_in": state["audio_seq_in"],
            "audio_seq_out": state["audio_seq_out"],
            "last_activity": time.time(),
        })
        await self.redis.expire(key, 300)  # 5 minutes TTL

    async def restore_session(self, session_id: str) -> Optional[dict]:
        """Restore session state from Redis."""
        key = f"voice_session:{session_id}"
        data = await self.redis.hgetall(key)
        if not data:
            return None
        return {
            "user_id": data["user_id"],
            "conversation_id": data["conversation_id"],
            "voice_settings": json.loads(data["voice_settings"]),
            "pipeline_state": data["pipeline_state"],
            "audio_seq_in": int(data["audio_seq_in"]),
            "audio_seq_out": int(data["audio_seq_out"]),
        }
```

### Frontend Recovery Logic

```typescript
// In useThinkerTalkerSession.ts
const reconnectWithResume = useCallback(async () => {
  if (!previousSessionIdRef.current) {
    return connect();  // Normal connect
  }

  const ws = await initializeWebSocket(options.conversation_id);

  // Request session resume
  ws.send(JSON.stringify({
    type: "session.init",
    session_id: previousSessionIdRef.current,
    resume: true,
    features: ["session_persistence", ...],
  }));
}, []);
```

---

## Configuration

### Environment Variables

```bash
# Redis connection for session storage
VOICE_SESSION_REDIS_URL=redis://localhost:6380/1

# Session TTL in seconds
VOICE_SESSION_TTL=300

# Enable session persistence
VOICE_SESSION_PERSISTENCE_ENABLED=true
```

---

## Enabling the Feature

### Via Admin Panel

1. Navigate to **Admin Panel → Feature Flags**
2. Find `backend.voice_ws_session_persistence`
3. Toggle to **Enabled**
4. Ensure Redis is properly configured

### Via API

```bash
curl -X PATCH https://api.localhost:5173/api/admin/feature-flags/backend.voice_ws_session_persistence \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true}'
```

---

## Monitoring

### Key Metrics

| Metric                        | Target | Alert Threshold |
| ----------------------------- | ------ | --------------- |
| Session recovery success rate | >95%   | <80%            |
| Redis latency                 | <5ms   | >20ms           |
| Session TTL expires           | <5%    | >15%            |

### Logging

```
[WS] Session persistence enabled for {session_id}
[WS] Saving session state to Redis
[WS] Session restored from Redis: {session_id}
[WS] Session recovery failed: {reason}
```

---

## Troubleshooting

### Issue: Session not recovered

1. Check Redis connectivity
2. Verify session TTL hasn't expired (default 5 min)
3. Check feature flag is enabled
4. Verify session_id is being passed on reconnect

### Issue: Redis latency too high

1. Check Redis server load
2. Consider using Redis Cluster for high availability
3. Reduce session data size

---

## Related Documentation

- [WebSocket Binary Audio](./websocket-binary-audio.md) (Phase 1)
- [WebSocket Graceful Degradation](./websocket-graceful-degradation.md) (Phase 3)
- [WebSocket Latency Optimization](./websocket-latency-optimization.md)
