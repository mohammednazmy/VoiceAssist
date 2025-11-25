# Voice Mode End-to-End Checklist

> Last updated: 2025-11-25
> Session: claude/voice-pipeline-unified-20251125072935

This document describes how to validate the Voice Mode pipeline from end to end.

## Quick Test Commands

### 1. Backend Tests (CI-safe)

```bash
cd /home/asimo/VoiceAssist/services/api-gateway
export PYTHONPATH=.
python -m pytest tests/integration/test_openai_config.py -v
```

### 2. Frontend Unit Tests (Voice)

```bash
cd /home/asimo/VoiceAssist/apps/web-app
export NODE_OPTIONS="--max-old-space-size=512"  # Prevent OOM

# Hook tests
npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts --reporter=dot

# Voice settings tests
npx vitest run src/stores/__tests__/voiceSettingsStore.test.ts \
              src/components/voice/__tests__/VoiceModeSettings.test.tsx \
              src/components/chat/__tests__/MessageInput-voice-settings.test.tsx \
              --reporter=dot

# Voice→chat integration tests
npx vitest run src/hooks/__tests__/useChatSession-voice-integration.test.ts --reporter=dot
```

### 3. E2E Voice Tests (Chromium only)

```bash
cd /home/asimo/VoiceAssist
pnpm test:e2e --project=chromium \
  e2e/voice-mode-navigation.spec.ts \
  e2e/voice-mode-session-smoke.spec.ts \
  e2e/voice-mode-voice-chat-integration.spec.ts
```

### 4. Full Voice E2E Suite

```bash
cd /home/asimo/VoiceAssist
pnpm test:e2e --project=chromium --grep "Voice Mode"
```

## Expected Behaviors

### Navigation Flow

1. User lands on Home page → sees "Voice Mode" tile with "NEW" badge
2. User clicks Voice Mode tile → navigates to `/chat?mode=voice` or `/chat` with state
3. Voice Mode panel auto-opens (or user clicks voice button to open)
4. "Start Voice Session" button is visible and enabled

### Settings Propagation

1. User opens Voice Settings modal (gear icon in Voice Mode panel)
2. User selects voice (alloy/echo/fable/onyx/nova/shimmer)
3. User selects language (en/es/fr/de/it/pt)
4. User adjusts VAD sensitivity (0-100)
5. Settings are saved to localStorage (voiceSettings key)
6. On next session, settings are sent to `/api/voice/realtime-session`

### Connection Status States

- `disconnected` - Initial state, "Start Voice Session" button enabled
- `connecting` - After clicking Start, button shows loading state
- `connected` - Session active, user can speak
- `reconnecting` - Automatic reconnect on temporary disconnect
- `failed` - Connection failed, error message shown
- `expired` - Session token expired, prompt to restart
- `error` - General error state

### Voice→Chat Integration

- User speaks → transcript appears in chat with `metadata.source: "voice"`
- AI responds → response appears in chat with `metadata.source: "voice"`
- Both user and AI messages show correctly in chat timeline

## Live Backend Testing

Set environment variable to run tests against real OpenAI:

```bash
export LIVE_REALTIME_E2E=1
pnpm test:e2e --project=chromium e2e/voice-mode-session-smoke.spec.ts
```

**Note:** Requires valid `OPENAI_API_KEY` in environment.

## Test Coverage Summary

| Test File                                 | Tests | Coverage                          |
| ----------------------------------------- | ----- | --------------------------------- |
| useRealtimeVoiceSession.test.ts           | 22    | Hook lifecycle, states, metrics   |
| voiceSettingsStore.test.ts                | 17    | Store actions, persistence        |
| VoiceModeSettings.test.tsx                | 25    | Component rendering, interactions |
| MessageInput-voice-settings.test.tsx      | 12    | Integration with chat input       |
| useChatSession-voice-integration.test.ts  | 8     | Message structure validation      |
| test_voice_metrics.py (backend)           | 11    | Metrics endpoint validation       |
| voice-mode-navigation.spec.ts             | 4     | E2E navigation flow               |
| voice-mode-session-smoke.spec.ts          | 3     | E2E session smoke tests           |
| voice-mode-voice-chat-integration.spec.ts | 4     | E2E panel integration             |

**Total: 106 tests across 9 files**

## Observability

### Backend Logs

- Session requests logged with `user_id`, `conversation_id`, `voice`, `language`, `vad_sensitivity`
- Session creation success/failure logged with `duration_ms`
- Errors logged with full context

### Frontend Console Metrics

When a voice session runs, the following metrics are logged to console:

- `voice_session_connect_ms` - Time from Start click to WebSocket open
- `voice_stt_latency_ms` - Time from speech stop to final transcript
- `voice_first_reply_ms` - Time from speech stop to first AI audio
- `voice_session_duration_ms` - Total session duration

### Metrics API

The `useRealtimeVoiceSession` hook exposes a `metrics` object:

```typescript
interface VoiceMetrics {
  connectionTimeMs: number | null;
  timeToFirstTranscriptMs: number | null;
  lastSttLatencyMs: number | null;
  lastResponseLatencyMs: number | null;
  sessionDurationMs: number | null;
  userTranscriptCount: number;
  aiResponseCount: number;
  reconnectCount: number;
  sessionStartedAt: number | null;
}
```

### Metrics Export to Backend

Metrics are automatically sent to `POST /api/voice/metrics` in production.

- **Privacy**: No PHI or transcripts sent, only timing/counts
- **Enable in dev**: Set `VITE_ENABLE_VOICE_METRICS=true`
- **Backend logs**: Metrics logged for aggregation/alerting

## Troubleshooting

### OOM during tests

- Use `NODE_OPTIONS="--max-old-space-size=512"` to limit memory
- Run tests in smaller batches instead of full suite

### E2E tests flaky

- Ensure dev server is running on correct port
- Use `await page.waitForLoadState("networkidle")` after navigation
- Check for correct `data-testid` attributes

### WebSocket not connecting

- Check OPENAI_API_KEY is valid
- Check backend `/api/voice/realtime-session` endpoint returns valid config
- Check browser console for connection errors

## Architecture Reference

```
Frontend                              Backend
┌─────────────────┐                  ┌─────────────────┐
│ VoiceModePanel  │                  │ voice.py        │
│ (UI component)  │                  │ (FastAPI route) │
└────────┬────────┘                  └────────┬────────┘
         │                                    │
         v                                    v
┌─────────────────┐    POST /api/    ┌─────────────────┐
│useRealtime-     │ ──────────────>  │generate_session │
│VoiceSession     │ /voice/realtime  │_config()        │
│(React hook)     │    -session      │(service)        │
└────────┬────────┘                  └────────┬────────┘
         │                                    │
         │ WebSocket                          │ OpenAI API
         v                                    v
┌─────────────────┐                  ┌─────────────────┐
│ OpenAI Realtime │ <───────────────>│ OpenAI Realtime │
│ WebSocket       │   Ephemeral      │ Sessions API    │
│ (client)        │   Token          │ (server)        │
└─────────────────┘                  └─────────────────┘
```

## Files Reference

### Frontend

- `apps/web-app/src/hooks/useRealtimeVoiceSession.ts` - Core hook
- `apps/web-app/src/components/voice/VoiceModePanel.tsx` - UI panel
- `apps/web-app/src/components/voice/VoiceModeSettings.tsx` - Settings modal
- `apps/web-app/src/stores/voiceSettingsStore.ts` - Settings store

### Backend

- `services/api-gateway/app/api/voice.py` - API routes
- `services/api-gateway/app/services/realtime_voice_service.py` - Service layer

### Tests

- `apps/web-app/src/hooks/__tests__/` - Unit tests
- `e2e/voice-mode-*.spec.ts` - E2E tests
