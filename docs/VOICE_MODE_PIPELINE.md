---
title: Voice Mode Pipeline
slug: voice/pipeline
summary: Unified Voice Mode pipeline architecture, data flow, metrics, and testing strategy.
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience: ["human", "agent", "backend", "frontend"]
tags: ["voice", "realtime", "websocket", "openai", "api"]
relatedServices: ["api-gateway", "web-app"]
---

# Voice Mode Pipeline

> **Status**: Production-ready
> **Last Updated**: 2025-11-27

This document describes the unified Voice Mode pipeline architecture, data flow, metrics, and testing strategy. It serves as the canonical reference for developers working on real-time voice features.

## Implementation Status

| Component                  | Status      | Location                                               |
| -------------------------- | ----------- | ------------------------------------------------------ |
| Backend session endpoint   | **Live**    | `services/api-gateway/app/api/voice.py`                |
| Ephemeral token generation | **Live**    | `app/services/realtime_voice_service.py`               |
| Voice metrics endpoint     | **Live**    | `POST /api/voice/metrics`                              |
| Frontend voice hook        | **Live**    | `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`    |
| Voice settings store       | **Live**    | `apps/web-app/src/stores/voiceSettingsStore.ts`        |
| Voice UI panel             | **Live**    | `apps/web-app/src/components/voice/VoiceModePanel.tsx` |
| Chat timeline integration  | **Live**    | Voice messages appear in chat                          |
| E2E test suite             | **Passing** | 95 tests across unit/integration/E2E                   |

> **Full status:** See [Implementation Status](overview/IMPLEMENTATION_STATUS.md) for all components.

## Overview

Voice Mode enables real-time voice conversations with the AI assistant using OpenAI's Realtime API. The pipeline handles:

- **Ephemeral session authentication** (no raw API keys in browser)
- **WebSocket-based bidirectional voice streaming**
- **Voice activity detection (VAD)** with user-configurable sensitivity
- **User settings propagation** (voice, language, VAD threshold)
- **Chat timeline integration** (voice messages appear in chat)
- **Connection state management** with automatic reconnection
- **Metrics tracking** for observability

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐     ┌───────────────┐  │
│  │  VoiceModePanel     │────▶│useRealtimeVoice     │────▶│ voiceSettings │  │
│  │  (UI Component)     │     │Session (Hook)       │     │ Store         │  │
│  │  - Start/Stop       │     │- connect()          │     │ - voice       │  │
│  │  - Status display   │     │- disconnect()       │     │ - language    │  │
│  │  - Metrics logging  │     │- sendMessage()      │     │ - vadSens     │  │
│  └─────────┬───────────┘     └──────────┬──────────┘     └───────────────┘  │
│            │                            │                                    │
│            │                            │ onUserMessage()/onAssistantMessage()
│            │                            ▼                                    │
│  ┌─────────▼───────────┐     ┌─────────────────────┐                        │
│  │  MessageInput       │     │  ChatPage           │                        │
│  │  - Voice toggle     │────▶│  - useChatSession   │                        │
│  │  - Panel container  │     │  - addMessage()     │                        │
│  └─────────────────────┘     └─────────────────────┘                        │
│                                                                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ POST /api/voice/realtime-session
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │  voice.py           │────▶│  realtime_voice_    │                        │
│  │  (FastAPI Router)   │     │  service.py         │                        │
│  │  - /realtime-session│     │  - generate_session │                        │
│  │  - Timing logs      │     │  - ephemeral token  │                        │
│  └─────────────────────┘     └──────────┬──────────┘                        │
│                                         │                                    │
│                                         │ POST /v1/realtime/sessions         │
│                                         ▼                                    │
│                              ┌─────────────────────┐                        │
│                              │  OpenAI API         │                        │
│                              │  - Ephemeral token  │                        │
│                              │  - Voice config     │                        │
│                              └─────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ WebSocket wss://api.openai.com/v1/realtime
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OPENAI REALTIME API                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Server-side VAD (voice activity detection)                                │
│  - Bidirectional audio streaming (PCM16)                                     │
│  - Real-time transcription (Whisper)                                         │
│  - GPT-4o responses with audio synthesis                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Backend: `/api/voice/realtime-session`

**Location**: `services/api-gateway/app/api/voice.py`

### Request

```typescript
interface RealtimeSessionRequest {
  conversation_id?: string; // Optional conversation context
  voice?: string; // "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
  language?: string; // "en" | "es" | "fr" | "de" | "it" | "pt"
  vad_sensitivity?: number; // 0-100 (maps to threshold: 0→0.9, 100→0.1)
}
```

### Response

```typescript
interface RealtimeSessionResponse {
  url: string; // WebSocket URL: "wss://api.openai.com/v1/realtime"
  model: string; // "gpt-4o-realtime-preview"
  session_id: string; // Unique session identifier
  expires_at: number; // Unix timestamp (epoch seconds)
  conversation_id: string | null;
  auth: {
    type: "ephemeral_token";
    token: string; // Ephemeral token (ek_...), NOT raw API key
    expires_at: number; // Token expiry (5 minutes)
  };
  voice_config: {
    voice: string; // Selected voice
    modalities: ["text", "audio"];
    input_audio_format: "pcm16";
    output_audio_format: "pcm16";
    input_audio_transcription: { model: "whisper-1" };
    turn_detection: {
      type: "server_vad";
      threshold: number; // 0.1 (sensitive) to 0.9 (insensitive)
      prefix_padding_ms: number;
      silence_duration_ms: number;
    };
  };
}
```

### VAD Sensitivity Mapping

The frontend uses a 0-100 scale for user-friendly VAD sensitivity:

| User Setting | VAD Threshold | Behavior                             |
| ------------ | ------------- | ------------------------------------ |
| 0 (Low)      | 0.9           | Requires loud/clear speech           |
| 50 (Medium)  | 0.5           | Balanced detection                   |
| 100 (High)   | 0.1           | Very sensitive, picks up soft speech |

**Formula**: `threshold = 0.9 - (vad_sensitivity / 100 * 0.8)`

### Observability

Backend logs timing and context for each session request:

```python
# Request logging
logger.info(
    f"Creating Realtime session for user {current_user.id}",
    extra={
        "user_id": current_user.id,
        "conversation_id": request.conversation_id,
        "voice": request.voice,
        "language": request.language,
        "vad_sensitivity": request.vad_sensitivity,
    },
)

# Success logging with duration
duration_ms = int((time.monotonic() - start_time) * 1000)
logger.info(
    f"Realtime session created for user {current_user.id}",
    extra={
        "user_id": current_user.id,
        "session_id": config["session_id"],
        "voice": config.get("voice_config", {}).get("voice"),
        "duration_ms": duration_ms,
    },
)
```

## Frontend Hook: `useRealtimeVoiceSession`

**Location**: `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`

### Usage

```typescript
const {
  status, // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'expired' | 'error'
  transcript, // Current transcript text
  isSpeaking, // Is the AI currently speaking?
  isConnected, // Derived: status === 'connected'
  isConnecting, // Derived: status === 'connecting' || 'reconnecting'
  canSend, // Can send messages?
  error, // Error message if any
  metrics, // VoiceMetrics object
  connect, // () => Promise<void> - start session
  disconnect, // () => void - end session
  sendMessage, // (text: string) => void - send text message
} = useRealtimeVoiceSession({
  conversationId,
  voice, // From voiceSettingsStore
  language, // From voiceSettingsStore
  vadSensitivity, // From voiceSettingsStore (0-100)
  onConnected, // Callback when connected
  onDisconnected, // Callback when disconnected
  onError, // Callback on error
  onUserMessage, // Callback with user transcript
  onAssistantMessage, // Callback with AI response
  onMetricsUpdate, // Callback when metrics change
});
```

### Connection States

```
disconnected ──▶ connecting ──▶ connected
                      │              │
                      ▼              ▼
                   failed ◀──── reconnecting
                      │              │
                      ▼              ▼
                  expired ◀────── error
```

| State          | Description                                      |
| -------------- | ------------------------------------------------ |
| `disconnected` | Initial/idle state                               |
| `connecting`   | Fetching session config, establishing WebSocket  |
| `connected`    | Active voice session                             |
| `reconnecting` | Auto-reconnect after temporary disconnect        |
| `failed`       | Connection failed (backend error, network issue) |
| `expired`      | Session token expired (needs manual restart)     |
| `error`        | General error state                              |

### WebSocket Connection

The hook connects using three protocols for authentication:

```typescript
const ws = new WebSocket(url, ["realtime", "openai-beta.realtime-v1", `openai-insecure-api-key.${ephemeralToken}`]);
```

## Voice Settings Store

**Location**: `apps/web-app/src/stores/voiceSettingsStore.ts`

### Schema

```typescript
interface VoiceSettings {
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  language: "en" | "es" | "fr" | "de" | "it" | "pt";
  vadSensitivity: number; // 0-100
  autoStartOnOpen: boolean; // Auto-start voice when panel opens
  showStatusHints: boolean; // Show helper text in UI
}
```

### Persistence

Settings are persisted to `localStorage` under key `voiceassist-voice-settings` using Zustand's persist middleware.

### Defaults

| Setting         | Default |
| --------------- | ------- |
| voice           | "alloy" |
| language        | "en"    |
| vadSensitivity  | 50      |
| autoStartOnOpen | false   |
| showStatusHints | true    |

## Chat Integration

**Location**: `apps/web-app/src/pages/ChatPage.tsx`

### Message Flow

1. **User speaks** → VoiceModePanel receives final transcript
2. VoiceModePanel calls `onUserMessage(transcript)`
3. ChatPage receives callback, calls `useChatSession.addMessage()`
4. Message added to timeline with `metadata: { source: "voice" }`

```typescript
// ChatPage.tsx
const handleVoiceUserMessage = (content: string) => {
  addMessage({
    role: "user",
    content,
    metadata: { source: "voice" },
  });
};

const handleVoiceAssistantMessage = (content: string) => {
  addMessage({
    role: "assistant",
    content,
    metadata: { source: "voice" },
  });
};
```

### Message Structure

```typescript
interface VoiceMessage {
  id: string; // "voice-{timestamp}-{random}"
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata: {
    source: "voice"; // Distinguishes from text messages
  };
}
```

## Metrics

**Location**: `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`

### VoiceMetrics Interface

```typescript
interface VoiceMetrics {
  connectionTimeMs: number | null; // Time to establish connection
  timeToFirstTranscriptMs: number | null; // Time to first user transcript
  lastSttLatencyMs: number | null; // Speech-to-text latency
  lastResponseLatencyMs: number | null; // AI response latency
  sessionDurationMs: number | null; // Total session duration
  userTranscriptCount: number; // Number of user turns
  aiResponseCount: number; // Number of AI turns
  reconnectCount: number; // Number of reconnections
  sessionStartedAt: number | null; // Session start timestamp
}
```

### Frontend Logging

VoiceModePanel logs key metrics to console:

```typescript
// Connection time
console.log(`[VoiceModePanel] voice_session_connect_ms=${metrics.connectionTimeMs}`);

// STT latency
console.log(`[VoiceModePanel] voice_stt_latency_ms=${metrics.lastSttLatencyMs}`);

// Response latency
console.log(`[VoiceModePanel] voice_first_reply_ms=${metrics.lastResponseLatencyMs}`);

// Session duration
console.log(`[VoiceModePanel] voice_session_duration_ms=${metrics.sessionDurationMs}`);
```

### Consuming Metrics

Developers can plug into metrics via the `onMetricsUpdate` callback:

```typescript
useRealtimeVoiceSession({
  onMetricsUpdate: (metrics) => {
    // Send to telemetry service
    analytics.track("voice_session_metrics", {
      connection_ms: metrics.connectionTimeMs,
      stt_latency_ms: metrics.lastSttLatencyMs,
      response_latency_ms: metrics.lastResponseLatencyMs,
      duration_ms: metrics.sessionDurationMs,
    });
  },
});
```

### Metrics Export to Backend

Metrics can be automatically exported to the backend for aggregation and alerting.

**Backend Endpoint**: `POST /api/voice/metrics`

**Location**: `services/api-gateway/app/api/voice.py`

#### Request Schema

```typescript
interface VoiceMetricsPayload {
  conversation_id?: string;
  connection_time_ms?: number;
  time_to_first_transcript_ms?: number;
  last_stt_latency_ms?: number;
  last_response_latency_ms?: number;
  session_duration_ms?: number;
  user_transcript_count: number;
  ai_response_count: number;
  reconnect_count: number;
  session_started_at?: number;
}
```

#### Response

```typescript
interface VoiceMetricsResponse {
  status: "ok";
}
```

#### Privacy

**No PHI or transcript content is sent.** Only timing metrics and counts.

#### Frontend Configuration

Metrics export is controlled by environment variables:

- **Production** (`import.meta.env.PROD`): Metrics sent automatically
- **Development**: Set `VITE_ENABLE_VOICE_METRICS=true` to enable

The export uses `navigator.sendBeacon()` for reliability (survives page navigation).

#### Backend Logging

Metrics are logged with user context:

```python
logger.info(
    "VoiceMetrics received",
    extra={
        "user_id": current_user.id,
        "conversation_id": payload.conversation_id,
        "connection_time_ms": payload.connection_time_ms,
        "session_duration_ms": payload.session_duration_ms,
        ...
    },
)
```

#### Testing

```bash
# Backend
cd /home/asimo/VoiceAssist/services/api-gateway
source venv/bin/activate && export PYTHONPATH=.
python -m pytest tests/integration/test_voice_metrics.py -v
```

## Security

### Ephemeral Token Architecture

**CRITICAL**: The browser NEVER receives the raw OpenAI API key.

1. Backend holds `OPENAI_API_KEY` securely
2. Frontend requests session via `/api/voice/realtime-session`
3. Backend creates ephemeral token via OpenAI `/v1/realtime/sessions`
4. Ephemeral token returned to frontend (valid ~5 minutes)
5. Frontend connects WebSocket using ephemeral token

### Token Refresh

The hook monitors `session.expires_at` and can trigger refresh before expiry. If the token expires mid-session, status transitions to `expired`.

## Testing

### Voice Pipeline Smoke Suite

Run these commands to validate the voice pipeline:

```bash
# 1. Backend tests (CI-safe, mocked)
cd /home/asimo/VoiceAssist/services/api-gateway
source venv/bin/activate
export PYTHONPATH=.
python -m pytest tests/integration/test_openai_config.py -v

# 2. Frontend unit tests (run individually to avoid OOM)
cd /home/asimo/VoiceAssist/apps/web-app
export NODE_OPTIONS="--max-old-space-size=768"

npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts --reporter=dot
npx vitest run src/hooks/__tests__/useChatSession-voice-integration.test.ts --reporter=dot
npx vitest run src/stores/__tests__/voiceSettingsStore.test.ts --reporter=dot
npx vitest run src/components/voice/__tests__/VoiceModeSettings.test.tsx --reporter=dot
npx vitest run src/components/chat/__tests__/MessageInput-voice-settings.test.tsx --reporter=dot

# 3. E2E tests (Chromium, mocked backend)
cd /home/asimo/VoiceAssist
npx playwright test \
  e2e/voice-mode-navigation.spec.ts \
  e2e/voice-mode-session-smoke.spec.ts \
  e2e/voice-mode-voice-chat-integration.spec.ts \
  --project=chromium --reporter=list
```

### Test Coverage Summary

| Test File                                 | Tests | Coverage                          |
| ----------------------------------------- | ----- | --------------------------------- |
| useRealtimeVoiceSession.test.ts           | 22    | Hook lifecycle, states, metrics   |
| useChatSession-voice-integration.test.ts  | 8     | Message structure validation      |
| voiceSettingsStore.test.ts                | 17    | Store actions, persistence        |
| VoiceModeSettings.test.tsx                | 25    | Component rendering, interactions |
| MessageInput-voice-settings.test.tsx      | 12    | Integration with chat input       |
| voice-mode-navigation.spec.ts             | 4     | E2E navigation flow               |
| voice-mode-session-smoke.spec.ts          | 3     | E2E session smoke (1 live gated)  |
| voice-mode-voice-chat-integration.spec.ts | 4     | E2E panel integration             |

**Total: 95 tests**

### Live Testing

To test with real OpenAI backend:

```bash
# Backend (requires OPENAI_API_KEY in .env)
LIVE_REALTIME_TESTS=1 python -m pytest tests/integration/test_openai_config.py -v

# E2E (requires running backend + valid API key)
LIVE_REALTIME_E2E=1 npx playwright test e2e/voice-mode-session-smoke.spec.ts
```

## File Reference

### Backend

| File                                                           | Purpose                            |
| -------------------------------------------------------------- | ---------------------------------- |
| `services/api-gateway/app/api/voice.py`                        | API routes, metrics, timing logs   |
| `services/api-gateway/app/services/realtime_voice_service.py`  | Session creation, token generation |
| `services/api-gateway/tests/integration/test_openai_config.py` | Integration tests                  |
| `services/api-gateway/tests/integration/test_voice_metrics.py` | Metrics endpoint tests             |

### Frontend

| File                                                      | Purpose                   |
| --------------------------------------------------------- | ------------------------- |
| `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`       | Core hook                 |
| `apps/web-app/src/components/voice/VoiceModePanel.tsx`    | UI panel                  |
| `apps/web-app/src/components/voice/VoiceModeSettings.tsx` | Settings modal            |
| `apps/web-app/src/stores/voiceSettingsStore.ts`           | Settings store            |
| `apps/web-app/src/components/chat/MessageInput.tsx`       | Voice button integration  |
| `apps/web-app/src/pages/ChatPage.tsx`                     | Chat timeline integration |
| `apps/web-app/src/hooks/useChatSession.ts`                | addMessage() helper       |

### Tests

| File                                                                              | Purpose               |
| --------------------------------------------------------------------------------- | --------------------- |
| `apps/web-app/src/hooks/__tests__/useRealtimeVoiceSession.test.ts`                | Hook tests            |
| `apps/web-app/src/hooks/__tests__/useChatSession-voice-integration.test.ts`       | Chat integration      |
| `apps/web-app/src/stores/__tests__/voiceSettingsStore.test.ts`                    | Store tests           |
| `apps/web-app/src/components/voice/__tests__/VoiceModeSettings.test.tsx`          | Component tests       |
| `apps/web-app/src/components/chat/__tests__/MessageInput-voice-settings.test.tsx` | Integration tests     |
| `e2e/voice-mode-navigation.spec.ts`                                               | E2E navigation        |
| `e2e/voice-mode-session-smoke.spec.ts`                                            | E2E smoke test        |
| `e2e/voice-mode-voice-chat-integration.spec.ts`                                   | E2E panel integration |

## Related Documentation

- [VOICE_MODE_SETTINGS_GUIDE.md](./VOICE_MODE_SETTINGS_GUIDE.md) - User settings configuration
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - E2E testing strategy
- [.ai/VOICE_MODE_END_TO_END_CHECKLIST.md](../.ai/VOICE_MODE_END_TO_END_CHECKLIST.md) - Quick validation checklist

## Future Work

- ~~**Metrics export to backend**: Send metrics to backend for aggregation/alerting~~ ✓ Implemented
- **Voice→chat transcript content E2E**: Test actual transcript content in chat timeline
- **Performance baseline**: Establish latency targets (connection <2s, STT <500ms)
- **Error tracking integration**: Send errors to Sentry/similar
- **Session analytics**: Track voice session patterns for UX improvements
