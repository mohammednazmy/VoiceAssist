---
title: "Voice State 2025-11-29"
slug: "voice-state-2025-11-29"
summary: "Voice mode now includes barge-in support, audio overlap prevention, user preferences persistence, context-aware styles, and aggressive latency optimizations."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-29"
audience: ["human", "agent"]
tags: ["voice", "barge-in", "audio", "state", "2025"]
category: reference
---

# VoiceAssist Voice State - November 28, 2025

## Summary

Voice mode has been significantly improved with barge-in support, audio overlap prevention, and graceful error handling. The system now properly handles user interruptions during AI responses.

**Voice Mode Overhaul (2025-11-29)**: Added per-user voice preferences persistence, context-aware voice style detection, advanced TTS controls, and aggressive latency optimizations (200ms VAD, 256-sample chunks, 300ms reconnect).

## Changes Since Last Update (2025-11-25)

### New Features

| Feature                  | Status   | Description                                        |
| ------------------------ | -------- | -------------------------------------------------- |
| Barge-in support         | **Live** | User can interrupt AI while speaking               |
| Audio overlap prevention | **Live** | Prevents multiple responses playing simultaneously |
| Benign error handling    | **Live** | Gracefully handles cancellation failures           |
| Audio playback tracking  | **Live** | Tracks current audio element for cleanup           |

### Voice Mode Overhaul (2025-11-29)

| Feature                          | Status   | Description                                             |
| -------------------------------- | -------- | ------------------------------------------------------- |
| User voice preferences (backend) | **Live** | Per-user TTS settings stored in database                |
| Context-aware voice styles       | **Live** | Auto-detects CALM/URGENT/EMPATHETIC/INSTRUCTIONAL tones |
| Advanced TTS controls            | **Live** | Stability, clarity, expressiveness sliders in UI        |
| Aggressive VAD tuning            | **Live** | 200ms silence, 150ms prefix, 256-sample chunks          |
| Faster reconnection              | **Live** | 300ms base delay (was 1000ms)                           |
| Backend preferences sync         | **Live** | Cross-device settings via `/api/voice/preferences`      |

### Technical Implementation

#### 1. Barge-in Flow

When the user starts speaking while the AI is responding:

```
input_audio_buffer.speech_started
         ↓
Check activeResponseIdRef
         ↓
Send response.cancel to OpenAI
         ↓
Call onSpeechStarted() callback
         ↓
VoiceModePanel.stopCurrentAudio()
         ↓
Audio stops, queue cleared, response ID incremented
```

#### 2. Audio Playback Management

New refs added to `VoiceModePanel.tsx`:

```typescript
// Track currently playing Audio element for stopping on barge-in
const currentAudioRef = useRef<HTMLAudioElement | null>(null);

// Prevent overlapping response processing
const isProcessingResponseRef = useRef(false);

// Response ID to invalidate stale responses
const currentResponseIdRef = useRef<number>(0);
```

#### 3. Response Tracking

New refs added to `useRealtimeVoiceSession.ts`:

```typescript
// Track active response ID for cancellation
const activeResponseIdRef = useRef<string | null>(null);
```

Handled message types:

- `response.created` - Track new response ID
- `response.done` - Clear response ID
- `response.cancelled` - Clear response ID

#### 4. Benign Error Handling

Errors like "Cancellation failed: no active response found" are now handled gracefully:

```typescript
case "error": {
  const errorMessage = message.error?.message || "Realtime API error";

  if (
    errorMessage.includes("Cancellation failed") ||
    errorMessage.includes("no active response") ||
    errorCode === "cancellation_failed"
  ) {
    voiceLog.debug(`Ignoring benign error: ${errorMessage}`);
    break;
  }

  handleError(new Error(errorMessage));
  break;
}
```

### Files Modified

| File                                                   | Changes                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`    | Added `activeResponseIdRef`, `onSpeechStarted` callback, response tracking, barge-in logic, benign error handling |
| `apps/web-app/src/components/voice/VoiceModePanel.tsx` | Added audio tracking refs, `stopCurrentAudio()`, overlap prevention in `onRelayResult`                            |

## Current Test Status

| Test Suite                                 | Tests                       | Status |
| ------------------------------------------ | --------------------------- | ------ |
| Backend: test_openai_config.py             | 17 passed, 3 skipped (live) | ✅     |
| Backend: test_voice_metrics.py             | 11 passed                   | ✅     |
| Frontend: useRealtimeVoiceSession          | 22 passed                   | ✅     |
| Frontend: voiceSettingsStore               | 17 passed                   | ✅     |
| Frontend: VoiceModeSettings                | 25 passed                   | ✅     |
| Frontend: useChatSession-voice-integration | 8 passed                    | ✅     |

## Known Issues

1. **First audio chunk silent**: First audio chunk may show `-Infinity dB` - this is expected before mic produces audio
2. **WebSocket errors on page navigation**: Expected when switching conversations - handled gracefully

## Architecture Overview

```
Frontend (dev.asimo.io)
├── VoiceModePanel (UI component)
│   ├── stopCurrentAudio() - stops playback on barge-in
│   ├── currentAudioRef - tracks playing audio
│   ├── isProcessingResponseRef - prevents overlaps
│   └── currentResponseIdRef - invalidates stale responses
│
├── useRealtimeVoiceSession (hook)
│   ├── activeResponseIdRef - tracks OpenAI response
│   ├── onSpeechStarted callback - notifies panel
│   ├── response.cancel - sends to OpenAI
│   └── Benign error handling
│
└── voiceSettingsStore (Zustand)
    └── Persists: voice, language, vadSensitivity
```

## Quick Commands

```bash
# Run backend voice tests
cd /home/asimo/VoiceAssist/services/api-gateway
source venv/bin/activate && export PYTHONPATH=.
python -m pytest tests/integration/test_openai_config.py tests/integration/test_voice_metrics.py -v

# Run frontend voice tests
cd /home/asimo/VoiceAssist/apps/web-app
export NODE_OPTIONS="--max-old-space-size=768"
npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts \
  src/stores/__tests__/voiceSettingsStore.test.ts \
  src/components/voice/__tests__/VoiceModeSettings.test.tsx

# Build web app
cd /home/asimo/VoiceAssist/apps/web-app
pnpm build
```

## TODOs for Future Work

### Voice UX Features

- [ ] Audio level visualization during recording
- [x] Per-user voice preferences persistence (backend) ✅ Implemented 2025-11-29
- [ ] Voice activity visualization improvements
- [ ] Multi-language auto-detection
- [ ] Session resumption on reconnect

### Testing

- [ ] E2E tests for barge-in functionality
- [ ] Test voice→chat transcript content in chat timeline
- [ ] Performance baseline (connection <2s, STT <500ms)

### Infrastructure

- [ ] Configure Prometheus scrapes for voice metrics
- [ ] Set up Grafana dashboards for voice SLOs
- [ ] Configure Sentry alerts for voice SLO violations

## Related Documentation

- [VOICE_MODE_PIPELINE.md](./VOICE_MODE_PIPELINE.md) - Full pipeline architecture
- [VOICE_MODE_SETTINGS_GUIDE.md](./VOICE_MODE_SETTINGS_GUIDE.md) - User settings
- [VOICE_READY_STATE_2025-11-25.md](./VOICE_READY_STATE_2025-11-25.md) - Previous state

---

_Last updated: 2025-11-28 by Claude_
