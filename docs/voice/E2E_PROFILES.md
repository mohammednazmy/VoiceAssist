# Voice Mode E2E Test Profiles

This document defines the named E2E test profiles for Voice Mode testing.

## Profile Overview

| Profile                    | Purpose                              | When to Run | Env Vars                             |
| -------------------------- | ------------------------------------ | ----------- | ------------------------------------ |
| `voice-smoke`              | Quick critical path validation       | Every PR    | None                                 |
| `voice-multi-turn`         | Multi-turn flow with audio injection | Nightly     | `LIVE_REALTIME_E2E=1`                |
| `voice-barge-in`           | Basic barge-in behavior              | Nightly     | `VOICE_AUDIO_TYPE=conversationStart` |
| `voice-barge-in-realistic` | Extended barge-in scenarios          | Nightly     | `VOICE_AUDIO_TYPE=*`                 |
| `voice-barge-in-two-phase` | Two-phase barge-in with metrics      | Nightly     | `VOICE_AUDIO_TYPE=conversationStart` |
| Mock WS Transcripts        | Deterministic transcript validation  | CI          | `MOCK_WEBSOCKET_E2E=1`               |

## Running Each Profile

### Voice Smoke (PR Gate)

```bash
pnpm exec playwright test e2e/voice-mode-navigation.spec.ts e2e/voice-mode-session-smoke.spec.ts --project=chromium
```

### Multi-Turn Flow

```bash
pnpm exec playwright test --project=voice-multi-turn
```

### Barge-In Tests

```bash
# Basic
pnpm exec playwright test --project=voice-barge-in

# Realistic scenarios
pnpm exec playwright test --project=voice-barge-in-realistic

# Two-phase with metrics
pnpm exec playwright test --project=voice-barge-in-two-phase
```

### Mock WebSocket Transcripts

```bash
MOCK_WEBSOCKET_E2E=1 pnpm exec playwright test e2e/voice-transcript-validation.spec.ts --project=chromium
```

## Profile Details

### voice-smoke

- **Test files**: `voice-mode-navigation.spec.ts`, `voice-mode-session-smoke.spec.ts`
- **Purpose**: Verify Voice Mode UI renders and basic interactions work
- **Duration**: ~2 minutes
- **CI integration**: Run on every PR

### voice-multi-turn

- **Test files**: `voice-multi-turn-flow.spec.ts`
- **Purpose**: Exercise multi-turn conversation flow with metrics collection
- **Audio fixture**: Uses `getAudioFile()` for fake microphone input
- **Metrics tracked**: State transitions, turns, errors, barge-in counts

### Barge-In Profiles

- **Common purpose**: Validate barge-in detection and latency
- **Metrics assertions**:
  - `bargeInAttempts >= 1`
  - `successfulBargeIns >= 1`
  - `averageBargeInLatencyMs <= 2000` (target: ≤500ms)

## Debug Surfaces

Tests rely on these window debug objects (exposed by the Thinker/Talker pipeline):

- `window.__tt_ws_events` - WebSocket event log
- `window.__tt_audio_debug` - Audio playback state
- `window.__voiceModeDebug` - Voice mode state machine
- `window.__voiceDebug` - Legacy voice debug info
