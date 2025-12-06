---
title: WebSocket Session Persistence
status: implemented
category: voice
tags: [websocket, redis, session, reliability]
lastUpdated: "2025-12-05"
ai_summary: >-
  WebSocket Reliability Phase 2 - Redis-based session state persistence that
  enables session recovery after disconnects and supports horizontal scaling.
  Controlled via feature flag backend.voice_ws_session_persistence.
---

# WebSocket Session Persistence

**Phase:** WebSocket Reliability Enhancement Phase 2
**Status:** Implemented (Feature Flag Controlled)
**Feature Flag:** `backend.voice_ws_session_persistence`

## Overview

This feature adds Redis-based session state persistence for WebSocket voice sessions. When enabled, session state is saved to Redis and can be recovered after unexpected disconnects, enabling a seamless reconnection experience.

## Benefits

| Benefit               | Description                                                         |
| --------------------- | ------------------------------------------------------------------- |
| Session Recovery      | Users can resume voice sessions after network disconnects           |
| Horizontal Scaling    | Sessions can be recovered on different server instances             |
| Graceful Reconnection | Metrics, config, and audio sequence are preserved across reconnects |
| Configurable TTL      | Sessions expire after 10 minutes of inactivity (configurable)       |

## Session State Schema

Sessions are stored in Redis as hashes with the following fields:

```
voice_session:{session_id}
├── session_id           # Unique session identifier
├── user_id              # User who owns the session
├── conversation_id      # Associated conversation (nullable)
├── created_at           # Session creation timestamp (ISO 8601)
├── last_activity_at     # Last activity timestamp (ISO 8601)
├── connection_state     # Current state: disconnected, connecting, connected, ready, reconnecting
├── config               # JSON-serialized session configuration
├── metrics              # JSON-serialized session metrics
├── binary_audio_enabled # Whether binary audio is negotiated (1/0)
├── audio_output_sequence# Last audio output sequence number
└── protocol_version     # Negotiated protocol version
```

### Redis Key Structure

- `voice_session:{session_id}` - Session state hash (TTL: 10 minutes)
- `voice_session_user:{user_id}` - Set of active session IDs for user
- `voice_session_lock:{session_id}` - Lock for preventing concurrent recovery (TTL: 30 seconds)

## Protocol

### Session Recovery Flow

```
1. Client disconnects unexpectedly
   └── Backend marks session as "disconnected" in Redis (recoverable)

2. Client reconnects with recover_session_id parameter
   └── /api/voice/pipeline-ws?token=...&recover_session_id={session_id}

3. Backend attempts recovery:
   a. Verify session exists in Redis
   b. Verify user owns the session
   c. Verify session is in recoverable state (disconnected/reconnecting)
   d. Acquire recovery lock (prevents concurrent recovery)
   e. Restore session state to new handler
   f. Release recovery lock

4. session.ready includes recovery status:
   {
     "type": "session.ready",
     "session_id": "...",
     "session_recovery_enabled": true,
     "is_recovered_session": true
   }
```

### Clean Session End

When a user intentionally disconnects, the client sends `session.end` to delete the session from Redis:

```json
// Client → Server
{ "type": "session.end" }

// Server → Client
{ "type": "session.end.ack", "session_id": "..." }
```

This prevents stale sessions from persisting and frees Redis resources.

## Implementation Details

### Backend Components

**New Files:**

- `services/api-gateway/app/services/redis_voice_session_store.py`

**Modified Files:**

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`
- `services/api-gateway/app/api/voice.py`
- `services/api-gateway/app/core/flag_definitions.py`

**Key Classes:**

- `VoiceSessionState` - Data class representing session state
- `RedisVoiceSessionStore` - Redis operations for session persistence
- `ThinkerTalkerSessionManager.recover_session()` - Session recovery logic

### Frontend Components

**Modified Files:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`

**Key Changes:**

- Store session ID on `session.ready`
- Pass `recover_session_id` on reconnection attempts
- Send `session.end` on intentional disconnect
- Handle `session.end.ack` message

## Usage

### Enabling the Feature

1. **Via Admin Panel:**
   - Navigate to admin.asimo.io → Feature Flags
   - Find `backend.voice_ws_session_persistence`
   - Toggle to enabled

2. **Via Redis:**
   ```bash
   redis-cli SET "feature_flag:backend.voice_ws_session_persistence" "true"
   ```

### Monitoring

Check Redis for active sessions:

```bash
# List all voice sessions
redis-cli KEYS "voice_session:*"

# Get session details
redis-cli HGETALL "voice_session:{session_id}"

# Check user's active sessions
redis-cli SMEMBERS "voice_session_user:{user_id}"
```

Check logs for session persistence activity:

```bash
journalctl -u voiceassist-srv -f | grep -E "(session state|Recovered session|session disconnected)"
```

Expected log messages:

- `"Saved initial session state: {session_id}"` - on session start
- `"Marked session disconnected (recoverable): {session_id}"` - on unexpected disconnect
- `"Recovered session: {session_id}"` - on successful recovery
- `"Deleted session state (clean close): {session_id}"` - on intentional disconnect

## Backward Compatibility

- Sessions are only persisted when the feature flag is enabled
- Clients without session recovery support continue to work normally
- Recovery is only attempted when `recover_session_id` parameter is provided
- Failed recovery falls back to creating a new session

## Testing

### Unit Tests

```bash
cd services/api-gateway
pytest tests/unit/services/test_redis_voice_session_store.py -v
```

### Integration Testing

1. Enable feature flag
2. Connect to voice mode at dev.asimo.io
3. Disconnect network briefly
4. Verify reconnection recovers session state
5. Check logs for recovery messages

### Manual Testing

```python
# Test session recovery via Python
import asyncio
from app.services.redis_voice_session_store import (
    redis_voice_session_store,
    VoiceSessionState,
)

async def test_recovery():
    await redis_voice_session_store.connect()

    # Create session state
    state = VoiceSessionState(
        session_id="test-123",
        user_id="user-456",
        connection_state="disconnected",
    )
    await redis_voice_session_store.save_session(state)

    # Attempt recovery
    recovered = await redis_voice_session_store.get_recoverable_session(
        "test-123", "user-456"
    )
    print(f"Recovered: {recovered}")

    await redis_voice_session_store.disconnect()

asyncio.run(test_recovery())
```

## Related Documentation

- [WebSocket Binary Audio](./websocket-binary-audio.md) - Phase 1
- [WebSocket Protocol Specification](../WEBSOCKET_PROTOCOL.md)
- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
- [Feature Flags Reference](../admin/feature-flags.md)

## Future Phases

- **Phase 3:** Graceful degradation with client notifications when services fail

---

**Version:** 1.0
**Maintainer:** VoiceAssist Development Team
