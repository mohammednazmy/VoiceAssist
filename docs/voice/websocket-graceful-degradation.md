# WebSocket Graceful Degradation (Phase 3)

## Overview

Phase 3 of WebSocket Reliability Enhancement adds graceful degradation support to voice sessions. When voice services (STT, TTS, LLM) experience issues, clients are notified in real-time and can adapt their UI to provide a smooth user experience.

## Feature Flag

```
backend.voice_ws_graceful_degradation
```

Manage at admin.asimo.io → Feature Flags

## Architecture

### Voice Service Modes

The system operates in three modes based on service health:

| Mode             | Description                | Available Features                  |
| ---------------- | -------------------------- | ----------------------------------- |
| `full_voice`     | All services healthy       | Full voice input/output, tools      |
| `degraded_voice` | Using fallback providers   | Voice available but reduced quality |
| `text_only`      | Voice services unavailable | Text chat only                      |

### Service Health States

Each service (STT, TTS, LLM) can be in one of these states:

- **healthy**: Primary provider operating normally
- **degraded**: Using fallback provider (reduced quality/latency)
- **unhealthy**: Service completely unavailable
- **unknown**: Health status being determined

### Health Check Flow

```
VoiceFallbackOrchestrator    VoiceServiceHealthNotifier    WebSocket Clients
         |                            |                          |
         |--- Health Check (5s) ----->|                          |
         |                            |--- service.status ------>|
         |                            |--- service.degraded ---->|
         |                            |--- service.mode_change ->|
         |                            |                          |
```

## Message Types

### Server → Client

#### service.status

Initial status snapshot sent when session is ready.

```json
{
  "type": "service.status",
  "mode": "full_voice",
  "services": {
    "stt": { "health": "healthy", "fallback_provider": null },
    "tts": { "health": "healthy", "fallback_provider": null },
    "llm": { "health": "healthy", "fallback_provider": null }
  },
  "timestamp": "2025-12-05T10:00:00Z"
}
```

#### service.degraded

Sent when a service degrades (primary → fallback).

```json
{
  "type": "service.degraded",
  "service": "stt",
  "provider": "whisper_fallback",
  "health": "degraded",
  "previous_health": "healthy",
  "message": "Speech recognition is running with reduced capacity",
  "timestamp": "2025-12-05T10:05:00Z"
}
```

#### service.recovered

Sent when a service recovers.

```json
{
  "type": "service.recovered",
  "service": "stt",
  "provider": "primary",
  "health": "healthy",
  "previous_health": "degraded",
  "message": "Speech recognition has recovered to full capacity",
  "timestamp": "2025-12-05T10:10:00Z"
}
```

#### service.mode_change

Sent when overall voice mode changes.

```json
{
  "type": "service.mode_change",
  "mode": "text_only",
  "previous_mode": "full_voice",
  "reason": "Voice unavailable - stt, tts services down",
  "affected_services": ["stt", "tts"],
  "fallback_info": {},
  "capabilities": {
    "voice_input": false,
    "voice_output": false,
    "text_input": true,
    "text_output": true,
    "tools": false,
    "full_quality": false
  },
  "timestamp": "2025-12-05T10:15:00Z"
}
```

## Frontend Integration

### React Hook Usage

```typescript
import { useThinkerTalkerSession } from '@/hooks/useThinkerTalkerSession';

function VoiceMode() {
  const session = useThinkerTalkerSession({
    // Service health callbacks
    onServiceStatus: (status) => {
      console.log('Initial status:', status.mode);
    },
    onServiceDegradation: (event) => {
      if (event.health === 'degraded') {
        showNotification(`${event.service} using fallback`);
      }
    },
    onServiceModeChange: (event) => {
      if (event.mode === 'text_only') {
        showTextFallbackUI();
      }
    },
  });

  // Access service health state
  const { serviceHealth } = session;

  return (
    <div>
      {serviceHealth.isTextOnly && <TextFallbackBanner />}
      {serviceHealth.isDegraded && <DegradedModeBadge />}
      {/* ... */}
    </div>
  );
}
```

### Available State

```typescript
session.serviceHealth = {
  mode: VoiceServiceMode, // Current voice mode
  status: TTServiceStatus, // Full service status
  isFullVoice: boolean, // All services healthy
  isDegraded: boolean, // Using fallbacks
  isTextOnly: boolean, // Voice unavailable
  gracefulDegradationEnabled: boolean, // Feature flag status
};
```

## Backend Implementation

### VoiceServiceHealthNotifier

Singleton service that monitors `VoiceFallbackOrchestrator` and broadcasts health events.

```python
from app.services.voice_service_health_notifier import voice_service_health_notifier

# Register session for notifications
voice_service_health_notifier.register_session(
    session_id,
    send_callback,  # async function to send messages
)

# Unregister on disconnect
voice_service_health_notifier.unregister_session(session_id)
```

### WebSocket Handler Integration

The `ThinkerTalkerWebSocketHandler` automatically:

1. Checks feature flag on session start
2. Registers for health notifications if enabled
3. Includes `graceful_degradation_enabled` in session.ready message
4. Unregisters on session stop

## Fallback Chains

Default fallback chains (configurable via VoiceFallbackOrchestrator):

| Service | Primary    | Fallback 1 | Fallback 2     |
| ------- | ---------- | ---------- | -------------- |
| STT     | Deepgram   | Whisper    | Browser API    |
| TTS     | ElevenLabs | OpenAI TTS | Browser Speech |
| LLM     | GPT-4o     | GPT-3.5    | -              |

## Testing

Run Phase 3 tests:

```bash
cd services/api-gateway
pytest tests/unit/services/test_voice_service_health_notifier.py -v
```

## Monitoring

Check service health via status endpoint:

```bash
curl https://api.asimo.io/api/voice/health | jq
```

Response includes:

```json
{
  "status": "healthy",
  "services": {
    "stt": { "status": "healthy", "provider": "deepgram" },
    "tts": { "status": "healthy", "provider": "elevenlabs" },
    "llm": { "status": "healthy", "provider": "openai" }
  },
  "mode": "full_voice"
}
```

## Related Documentation

- [WebSocket Binary Audio (Phase 1)](./websocket-binary-audio.md)
- [WebSocket Session Persistence (Phase 2)](./websocket-session-persistence.md)
- [Voice Pipeline Architecture](./voice-pipeline-architecture.md)
