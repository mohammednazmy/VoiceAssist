# Voice Mode Comprehensive Testing & Improvement Plan

## Executive Summary

This plan addresses two critical issues with voice mode:

1. **Choppy audio after barge-in** - Audio quality degrades after user interrupts AI
2. **Self-interruption** - AI doesn't reliably complete responses

The solution involves:

- **Phase 1**: Enhanced real-audio E2E tests that mimic natural conversation
- **Phase 2**: Systematic feature flag testing framework (40+ voice flags)
- **Phase 3**: Fix identified issues based on test results
- **Phase 4**: Continuous testing infrastructure

---

## Current State Analysis

### Voice Mode Feature Flags (40+ flags)

```
# Silero VAD Flags (from featureFlags.ts)
backend.voice_silero_vad_enabled           - Master Silero VAD toggle (default: true)
backend.voice_silero_echo_suppression_mode - Echo suppression mode: threshold_boost|pause|none (default: "threshold_boost")
backend.voice_silero_positive_threshold    - Base VAD threshold 0.1-0.9 (default: 0.5)
backend.voice_silero_playback_threshold_boost - Threshold boost during playback 0-0.5 (default: 0.2)
backend.voice_silero_min_speech_ms         - Min speech duration 50-500ms (default: 150)
backend.voice_silero_playback_min_speech_ms - Min speech during playback 100-500ms (default: 200)
backend.voice_silero_adaptive_threshold    - Adaptive VAD threshold (default: true)
backend.voice_silero_noise_calibration_ms  - Noise calibration duration 500-3000ms (default: 1000)
backend.voice_silero_noise_adaptation_factor - Noise adaptation factor 0-0.3 (default: 0.1)
backend.voice_silero_vad_confidence_sharing - Frontend-to-backend VAD confidence sharing (default: true)

# Natural Conversation Flags
backend.voice_instant_barge_in             - Instant barge-in via Deepgram SpeechStarted (default: true)
backend.voice_intelligent_barge_in         - Classify interruptions: backchannel/soft/hard (default: true)
backend.voice_barge_in_classifier_enabled  - Enable intelligent classification (default: false)
backend.voice_barge_in_killswitch          - MASTER KILL SWITCH for barge-in (default: false)
backend.voice_continuation_detection       - Detect when user intends to continue (default: true)
backend.voice_utterance_aggregation        - Aggregate speech segments (default: true)
backend.voice_aggregation_window_ms        - Max wait for continuation 1000-10000ms (default: 3000)
backend.voice_preemptive_listening         - Keep STT active during AI speech (default: true)
backend.voice_min_barge_in_confidence      - Min VAD confidence for barge-in 0-1 (default: 0.3)
backend.voice_hybrid_vad_fusion            - Combine Silero + Deepgram VAD (default: false)
backend.voice_word_timestamps              - Word-level transcript tracking (default: false)
backend.voice_prosody_extraction           - Prosody feature extraction (default: false)
backend.voice_adaptive_prebuffer           - Network-adaptive prebuffering (default: false)

# Audio Queue Management
backend.voice_queue_overflow_protection    - Prevent audio queue overflow (default: true)
backend.voice_schedule_watchdog            - Detect stuck audio schedules (default: true)

# WebSocket Optimization Flags
backend.voice_ws_audio_prebuffering        - Audio prebuffering (default: false)
backend.voice_ws_compression               - WebSocket compression (default: false)
backend.voice_ws_adaptive_chunking         - Adaptive chunk sizing (default: false)
backend.voice_ws_binary_audio              - Binary audio frames (default: false)
backend.voice_ws_session_persistence       - Session persistence (default: false)
backend.voice_ws_graceful_degradation      - Graceful degradation (default: false)
... (15+ more WS/AEC/WebRTC flags)
```

### Current Test Coverage

- `voice-live-e2e.spec.ts`: 34KB - Basic voice mode tests with fake audio
- `voice-barge-in.spec.ts`: 17KB - Barge-in tests with real audio injection
- `voice-real-audio.spec.ts`: 25KB - Conversation flow tests with real audio
- `voice-websocket-integration.spec.ts`: 28KB - WebSocket message verification
- `voice-test-metrics.ts`: 18KB - Metrics capture framework (ALREADY EXISTS)

### Issues Identified

1. **Audio playback state not properly reset after barge-in**
   - Queue overflow protection may be too aggressive
   - Schedule watchdog may be resetting prematurely

2. **False barge-in during natural completion**
   - VAD echo suppression may be insufficient
   - Natural completion mode timing may be off

---

## Guardrails & Success Metrics

### Environment Safety

- Default target environment: `dev.asimo.io` (or staging). Hard-fail if `E2E_BASE_URL` or `CLIENT_GATEWAY_URL` point to prod domains (`asimo.io` without `dev.` prefix).
- Require `LIVE_REALTIME_E2E=1` for any real-audio suite; skip otherwise.
- Assert Deepgram/ElevenLabs credentials before running live tests.
- Validate fixtures via `ffprobe` (mono, 16kHz, normalized to -1 dBFS peak) to reduce host-specific flakiness.

### Threshold Alignment (from featureFlags.ts)

```typescript
// Test quality thresholds aligned with feature flag defaults
const QUALITY_THRESHOLDS = {
  // Audio queue management
  maxQueueOverflows: 0, // voice_queue_overflow_protection should prevent all
  maxScheduleResets: 1, // voice_schedule_watchdog may reset once per test

  // Barge-in quality
  maxFalseBargeIns: 1, // Per 10 turns; aligned with voice_min_barge_in_confidence (0.3)
  maxMissedBargeIns: 0, // Should catch all intentional barge-ins

  // Latency targets
  maxResponseLatencyMs: 3500, // User final → AI first audio chunk
  maxBargeInLatencyMs: 800, // Speech detected → playback stopped
  p90ResponseLatencyMs: 4500, // 90th percentile
  p90BargeInLatencyMs: 500, // 90th percentile (voice_instant_barge_in target: <50ms)

  // VAD thresholds (matching featureFlags.ts defaults)
  sileroPositiveThreshold: 0.5, // voice_silero_positive_threshold
  sileroPlaybackBoost: 0.2, // voice_silero_playback_threshold_boost
  effectivePlaybackThreshold: 0.7, // 0.5 + 0.2 during AI playback
  minSpeechMs: 150, // voice_silero_min_speech_ms
  playbackMinSpeechMs: 200, // voice_silero_playback_min_speech_ms

  // Error tolerance
  maxCriticalErrors: 0, // WebSocket errors, API failures
  maxWarnings: 5, // Non-critical issues
};
```

### Metrics Persistence

- Capture structured metrics with existing `e2e/voice/utils/voice-test-metrics.ts`
- Persist per-test JSON to `test-results/voice-metrics/`
- Include short summary in test output and attach to Playwright trace
- On failure, automatically attach last 200 console lines plus relevant backend logs

---

## Phase 1: Enhanced Real-Audio E2E Tests

### 1.1 Conversation Scenario Tests

Create tests that simulate realistic conversation patterns:

```typescript
// Test scenarios to implement:
describe("Natural Conversation Scenarios", () => {
  test("Simple Q&A - user asks, AI responds completely");
  test("Multi-turn conversation - 3+ back-and-forth exchanges");
  test("Deliberate barge-in - user interrupts mid-response");
  test("Backchannel - user says 'uh-huh' without interrupting");
  test("Continuation - user pauses then continues speaking");
  test("Rapid exchange - quick Q&A with minimal pauses");
  test("Long response - AI speaks for 30+ seconds without interruption");
  test("Noisy environment - mild background noise without false barge-in");
  test("Low-volume user speech - ensure VAD still detects");
  test("Different sample rates - resampled 8k/16k/24k clips handled correctly");
});
```

### 1.2 Audio Quality Assertion Tests

```typescript
describe("Audio Quality Verification", () => {
  test("No choppy audio after barge-in");
  test("AI response completes fully without self-interruption");
  test("Audio queue stays healthy during playback");
  test("No buffer underruns during conversation");
  test("Schedule doesn't get stuck after barge-in");
  test("False barge-in rate stays below threshold across 10 turns");
});
```

### 1.3 Audio Fixture Files & Normalization

#### Directory Structure

```
e2e/fixtures/audio/
├── scenarios/
│   ├── simple-question.wav         - "What time is it?"
│   ├── complex-question.wav        - "Can you explain quantum computing?"
│   ├── backchannel-mmhmm.wav       - "Mm-hmm"
│   ├── backchannel-yes.wav         - "Yes"
│   ├── backchannel-okay.wav        - "Okay"
│   ├── soft-interrupt-wait.wav     - "Wait, um..."
│   ├── hard-interrupt-stop.wav     - "Stop! Let me ask something else"
│   ├── continuation-and-also.wav   - "And also I wanted to ask..."
│   ├── silence-5s.wav              - 5 seconds of silence
│   ├── background-cafe.wav         - Mild ambient noise (SNR ~20dB)
│   ├── low-volume-question.wav     - Whisper-level speech (-20dBFS)
│   └── long-dictation-45s.wav      - Long dictation paragraph
├── voices/
│   ├── male/                       - Male voice variants
│   └── female/                     - Female voice variants
├── generated/                      - CI-generated fixtures
│   ├── silence-*.wav               - Generated silence clips
│   └── noise-*.wav                 - Generated noise samples
└── validate-fixtures.sh            - ffprobe validation script
```

#### Fixture Normalization Script

```bash
#!/bin/bash
# e2e/fixtures/audio/validate-fixtures.sh
# Validates and normalizes audio fixtures for consistent E2E testing

set -e

FIXTURES_DIR="$(dirname "$0")"
REQUIRED_SAMPLE_RATE=16000
REQUIRED_CHANNELS=1
PEAK_THRESHOLD="-1"  # dBFS

validate_fixture() {
    local file="$1"
    local info=$(ffprobe -v quiet -show_format -show_streams "$file" 2>/dev/null)

    local sample_rate=$(echo "$info" | grep "sample_rate=" | cut -d= -f2)
    local channels=$(echo "$info" | grep "channels=" | cut -d= -f2)

    if [[ "$sample_rate" != "$REQUIRED_SAMPLE_RATE" ]]; then
        echo "WARNING: $file has sample rate $sample_rate (expected $REQUIRED_SAMPLE_RATE)"
        return 1
    fi

    if [[ "$channels" != "$REQUIRED_CHANNELS" ]]; then
        echo "WARNING: $file has $channels channels (expected $REQUIRED_CHANNELS)"
        return 1
    fi

    echo "OK: $file"
    return 0
}

normalize_fixture() {
    local input="$1"
    local output="${input%.wav}_normalized.wav"

    ffmpeg -y -i "$input" \
        -ar $REQUIRED_SAMPLE_RATE \
        -ac $REQUIRED_CHANNELS \
        -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
        "$output"

    mv "$output" "$input"
    echo "Normalized: $input"
}

generate_silence() {
    local duration="$1"
    local output="$FIXTURES_DIR/generated/silence-${duration}s.wav"

    ffmpeg -y -f lavfi -i anullsrc=r=$REQUIRED_SAMPLE_RATE:cl=mono \
        -t "$duration" "$output"
    echo "Generated: $output"
}

generate_noise() {
    local type="$1"  # white, pink, brown
    local duration="$2"
    local output="$FIXTURES_DIR/generated/noise-${type}-${duration}s.wav"

    ffmpeg -y -f lavfi -i "anoisesrc=d=$duration:c=${type}:r=$REQUIRED_SAMPLE_RATE:a=0.1" \
        -ac 1 "$output"
    echo "Generated: $output"
}

# Validate all existing fixtures
echo "=== Validating fixtures ==="
find "$FIXTURES_DIR/scenarios" -name "*.wav" -exec bash -c 'validate_fixture "$0"' {} \;

# Generate CI fixtures
echo "=== Generating CI fixtures ==="
mkdir -p "$FIXTURES_DIR/generated"
generate_silence 5
generate_silence 10
generate_noise "pink" 5

echo "=== Fixture validation complete ==="
```

### 1.4 Metrics Collector Integration

Wire `VoiceMetricsCollector` into existing voice specs:

```typescript
// e2e/voice/utils/test-setup.ts
import { test as base, Page } from "@playwright/test";
import { VoiceMetricsCollector, createMetricsCollector } from "./voice-test-metrics";
import * as fs from "fs";
import * as path from "path";

// Extend test with metrics collector
export const test = base.extend<{
  metricsCollector: VoiceMetricsCollector;
}>({
  metricsCollector: async ({ page }, use, testInfo) => {
    const collector = createMetricsCollector(page);

    await use(collector);

    // After test: persist metrics
    const metrics = collector.getMetrics();
    const convMetrics = collector.getConversationMetrics();

    const metricsDir = path.join("test-results", "voice-metrics");
    fs.mkdirSync(metricsDir, { recursive: true });

    const testName = testInfo.title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const timestamp = Date.now();

    // Write detailed metrics JSON
    fs.writeFileSync(
      path.join(metricsDir, `${testName}-${timestamp}.json`),
      JSON.stringify({ raw: metrics, summary: convMetrics }, null, 2),
    );

    // Log summary
    console.log(collector.getSummary());

    // Attach to Playwright trace
    await testInfo.attach("voice-metrics", {
      body: JSON.stringify(convMetrics, null, 2),
      contentType: "application/json",
    });

    collector.detach();
  },
});

// Environment validation
export function validateTestEnvironment(): void {
  const baseUrl = process.env.E2E_BASE_URL || "";
  const gatewayUrl = process.env.CLIENT_GATEWAY_URL || "";

  // Block production URLs
  const prodPatterns = [/^https?:\/\/(?!dev\.).*asimo\.io/];
  for (const url of [baseUrl, gatewayUrl]) {
    if (prodPatterns.some((p) => p.test(url))) {
      throw new Error(`SAFETY: Refusing to run tests against production URL: ${url}`);
    }
  }

  // Require LIVE_REALTIME_E2E for real audio tests
  if (!process.env.LIVE_REALTIME_E2E) {
    console.log("Skipping live tests (set LIVE_REALTIME_E2E=1 to enable)");
  }
}
```

### 1.5 Canonical Voice State Validation

To prevent regressions where the UI, WebSocket messages, and backend session state drift out of sync, Voice Mode has a small but critical set of tests around the **canonical voice/pipeline state model**:

- **Shared type**:
  - `VoicePipelineState` in `packages/types/src/index.ts` is the single source of truth for voice state (`idle`, `listening`, `processing`, `responding`, `speaking`, `cancelled`, `error`, etc.).
- **Frontend unit tests**:
  - `apps/web-app/src/stores/__tests__/unifiedConversationStore.test.ts` verifies:
    - `mapPipelineStateToVoiceState` (from `useThinkerTalkerVoiceMode.ts`) maps backend `PipelineState` → canonical `VoiceState`.
    - Guards in `setVoiceState`/`setVoiceConnectionStatus` never allow active states (`listening`/`responding`/`speaking`) when `voiceConnectionStatus` is `disconnected` or voice mode is off.
  - `apps/web-app/src/hooks/__tests__/useThinkerTalkerSession-recovery.test.ts` verifies:
    - `session.resume.ack.pipeline_state` is applied back into the hook’s `pipelineState` and forwarded via `onPipelineStateChange(..., "recovered")` without restoring transcripts when `storeTranscriptHistory=false`.
  - `apps/web-app/src/components/voice/__tests__/CompactVoiceBar.test.tsx` verifies:
    - The compact bar renders the expected labels for key states:
      - `"Listening"` when `pipelineState="listening"`.
      - `"Thinking"` when `pipelineState="processing"`.
      - `"Speaking"` when `pipelineState="speaking"`.
- **Backend unit tests**:
  - `services/api-gateway/tests/unit/services/test_websocket_error_edge_cases.py::TestRecoveryAndPrivacy` verifies:
    - When `store_transcript_history=False`, `session.resume.ack` scrubs `partial_transcript`/`partial_response` and `missed_message_count`, but still includes `pipeline_state` for UI recovery.
    - When `store_transcript_history=True`, `session.resume.ack` includes the partial transcript/response and accurate `missed_message_count` with the correct `pipeline_state`.
    - PARTIAL recovery (`SessionRecoveryState.PARTIAL`) reports the right `recovery_state` and `pipeline_state` without leaking transcripts.
- **E2E/Playwright checks**:
  - `apps/web-app/e2e/thinker-talker-voice.spec.ts` includes:
    - A debug harness test that:
      - Confirms `window.__voiceModeDebug.pipelineState` is always in the canonical set.
      - Asserts that when `isConnected === false`, the pipeline state is never `"listening"` or `"speaking"`.
      - When the debug state reports `pipelineState="listening"` or `"processing"`, verifies the visible compact bar label shows `"Listening"` / `"Thinking"` respectively.

These tests together form the **voice state contract** and should be kept green whenever backend `PipelineState`, frontend `VoicePipelineState`, or recovery logic in `ThinkerTalkerWebSocketHandler` is changed.

---

### 1.6 Loki Correlation: AEC Quality × Misfires × Quality Preset

To make tuning repeatable, you can use Loki to correlate AEC capability, barge-in misfire rates, and the current quality preset.

Assuming the `Voice pipeline stopped` log line is structured as described in
`docs/voice/voice-vad-personalization-analytics.md` and enriched with:

- `aec_quality` (excellent/good/fair/poor/unknown)
- `barge_in_misfire_rate` (0‒1)
- `voice_barge_in_quality_preset` (responsive/balanced/smooth)

you can run a query like:

```logql
{job="voiceassist"} |= "Voice pipeline stopped"
| json
| stats avg(barge_in_misfire_rate) by aec_quality, voice_barge_in_quality_preset
```

This gives a small table showing, for each combination of AEC quality and preset, the average misfire rate over the selected window. In practice:

- Look for rows where:
  - `aec_quality` is `poor` or `fair` and misfire rate is high → consider moving sites/devices toward `balanced` or `smooth` and enabling `backend.voice_aec_capability_tuning`.
  - `aec_quality` is `good`/`excellent` and misfire rate is very low → it may be safe to keep or extend `responsive` for dictation-focused users.

You can plug this query directly into Grafana’s Explore view or wire it into a table panel on the `voice-vad-personalization` dashboard for ongoing monitoring.

## Phase 2: Feature Flag Testing Framework

### 2.1 Smoke vs Nightly Matrix Strategy

#### Smoke Matrix (PR Tests - ~5 minutes)

Run on every PR touching voice code. Tests critical flag combinations only:

```typescript
// e2e/voice/flag-matrix-smoke.json
{
  "name": "smoke",
  "description": "Fast critical path tests for PR validation",
  "timeout": 300000,
  "combinations": [
    // Baseline: all defaults
    { "name": "baseline", "flags": {} },

    // VAD disabled
    { "name": "vad-disabled", "flags": {
      "backend.voice_silero_vad_enabled": false
    }},

    // Instant barge-in disabled
    { "name": "instant-barge-disabled", "flags": {
      "backend.voice_instant_barge_in": false
    }},

    // High threshold (less sensitive)
    { "name": "high-threshold", "flags": {
      "backend.voice_silero_positive_threshold": 0.7,
      "backend.voice_silero_playback_threshold_boost": 0.2
    }},

    // Low threshold (more sensitive)
    { "name": "low-threshold", "flags": {
      "backend.voice_silero_positive_threshold": 0.3,
      "backend.voice_silero_playback_threshold_boost": 0.1
    }}
  ]
}
```

#### Nightly Matrix (Scheduled - ~30 minutes)

Comprehensive testing of all flag combinations:

```typescript
// e2e/voice/flag-matrix-nightly.json
{
  "name": "nightly",
  "description": "Comprehensive flag matrix for nightly validation",
  "timeout": 1800000,
  "combinations": [
    // === VAD Configurations ===
    { "name": "silero-threshold-boost", "flags": {
      "backend.voice_silero_vad_enabled": true,
      "backend.voice_silero_echo_suppression_mode": "threshold_boost",
      "backend.voice_silero_playback_threshold_boost": 0.2
    }},
    { "name": "silero-pause-mode", "flags": {
      "backend.voice_silero_vad_enabled": true,
      "backend.voice_silero_echo_suppression_mode": "pause"
    }},
    { "name": "silero-no-suppression", "flags": {
      "backend.voice_silero_vad_enabled": true,
      "backend.voice_silero_echo_suppression_mode": "none"
    }},
    { "name": "vad-disabled", "flags": {
      "backend.voice_silero_vad_enabled": false
    }},

    // === Barge-in Configurations ===
    { "name": "instant-barge-with-classifier", "flags": {
      "backend.voice_instant_barge_in": true,
      "backend.voice_intelligent_barge_in": true,
      "backend.voice_barge_in_classifier_enabled": true
    }},
    { "name": "instant-barge-no-classifier", "flags": {
      "backend.voice_instant_barge_in": true,
      "backend.voice_intelligent_barge_in": true,
      "backend.voice_barge_in_classifier_enabled": false
    }},
    { "name": "delayed-barge", "flags": {
      "backend.voice_instant_barge_in": false
    }},
    { "name": "hybrid-vad-fusion", "flags": {
      "backend.voice_silero_vad_enabled": true,
      "backend.voice_hybrid_vad_fusion": true
    }},

    // === Audio Queue Configurations ===
    { "name": "queue-protection-on", "flags": {
      "backend.voice_queue_overflow_protection": true,
      "backend.voice_schedule_watchdog": true
    }},
    { "name": "queue-protection-off", "flags": {
      "backend.voice_queue_overflow_protection": false,
      "backend.voice_schedule_watchdog": false
    }},
    { "name": "watchdog-only", "flags": {
      "backend.voice_queue_overflow_protection": false,
      "backend.voice_schedule_watchdog": true
    }},

    // === Threshold Sweep ===
    { "name": "threshold-0.3", "flags": { "backend.voice_silero_positive_threshold": 0.3 }},
    { "name": "threshold-0.5", "flags": { "backend.voice_silero_positive_threshold": 0.5 }},
    { "name": "threshold-0.7", "flags": { "backend.voice_silero_positive_threshold": 0.7 }},
    { "name": "boost-0.1", "flags": { "backend.voice_silero_playback_threshold_boost": 0.1 }},
    { "name": "boost-0.2", "flags": { "backend.voice_silero_playback_threshold_boost": 0.2 }},
    { "name": "boost-0.3", "flags": { "backend.voice_silero_playback_threshold_boost": 0.3 }},

    // === WebSocket Features ===
    { "name": "ws-binary-audio", "flags": { "backend.voice_ws_binary_audio": true }},
    { "name": "ws-compression", "flags": { "backend.voice_ws_compression": true }},
    { "name": "ws-prebuffering", "flags": { "backend.voice_ws_audio_prebuffering": true }},
    { "name": "ws-adaptive-chunking", "flags": { "backend.voice_ws_adaptive_chunking": true }},

    // === Natural Conversation ===
    { "name": "continuation-detection", "flags": {
      "backend.voice_continuation_detection": true,
      "backend.voice_utterance_aggregation": true,
      "backend.voice_aggregation_window_ms": 3000
    }},
    { "name": "preemptive-listening", "flags": {
      "backend.voice_preemptive_listening": true
    }},

    // === Edge Cases ===
    { "name": "min-speech-short", "flags": { "backend.voice_silero_min_speech_ms": 50 }},
    { "name": "min-speech-long", "flags": { "backend.voice_silero_min_speech_ms": 500 }},
    { "name": "playback-min-short", "flags": { "backend.voice_silero_playback_min_speech_ms": 100 }},
    { "name": "playback-min-long", "flags": { "backend.voice_silero_playback_min_speech_ms": 500 }}
  ]
}
```

#### Hybrid VAD Signal Freshness Sweep (Staging)

To exercise the **hybrid VAD signal freshness** tuning end‑to‑end in staging, add a small sweep over `backend.voice_hybrid_vad_signal_freshness_ms` to your flag matrix (alongside `backend.voice_hybrid_vad_fusion: true`), for example:

```jsonc
{ "name": "hybrid-fresh-200ms", "flags": {
  "backend.voice_hybrid_vad_fusion": true,
  "backend.voice_hybrid_vad_signal_freshness_ms": 200
}},
{ "name": "hybrid-fresh-300ms", "flags": {
  "backend.voice_hybrid_vad_fusion": true,
  "backend.voice_hybrid_vad_signal_freshness_ms": 300
}},
{ "name": "hybrid-fresh-500ms", "flags": {
  "backend.voice_hybrid_vad_fusion": true,
  "backend.voice_hybrid_vad_signal_freshness_ms": 500
}}
```

Recommended usage:

- Use **200 ms** for low‑latency networks and lab environments (very recent Silero/Deepgram events only).
- Use **300 ms** as a balanced default (matches the built‑in config).
- Use **500 ms** in higher‑latency or jittery environments where Deepgram events may arrive later.

During these runs, watch:

- `voiceassist_voice_hybrid_vad_decision_total` (by `source`, `silero_fresh`, `deepgram_fresh`) for decision mix.
- `voiceassist_voice_barge_in_misfires_total{cause="no_transcript"}` and overall misfire rate vs response/TTFA latency.

#### Dictation VAD Presets & High-Noise Push-to-Talk (Staging)

To validate **dictation endpointing driven by VAD presets** and the new **high-noise push-to-talk** behavior in staging:

1. Enable dictation endpointing based on VAD presets:

```jsonc
{ "name": "dictation-vad-endpointing-balanced", "flags": {
  "backend.voice_dictation_vad_preset_endpointing": true,
  "backend.voice_dictation_endpoint_profile": "balanced"
}}
```

2. In the web app, start Thinker/Talker in **dictation mode** and try different VAD presets in `voiceSettingsStore`:

- `sensitive` / `balanced` → expect shorter silence windows (faster endpointing).
- `relaxed` / `accessibility` → expect longer endpointing and utterance windows.
- A custom preset with higher `vadCustomSilenceDurationMs` should produce noticeably longer pauses before dictation segments finalize.

3. In a **noisy test room** (e.g., background music or crowd noise), run a few voice sessions with:

```jsonc
{ "name": "high-noise-push-to-talk", "flags": {
  "backend.voice_v4_audio_processing": true,
  "backend.voice_dictation_vad_preset_endpointing": true
}}
```

Then verify:

- The frontend occasionally shows the **“Use push-to-talk”** hint in the T/T voice panel after sustained high noise.
- The Prometheus metric `voiceassist_voice_high_noise_push_to_talk_total{reason="high_noise"}` increases over time.
- The voice Grafana dashboard surfaces this metric alongside:
  - `voiceassist_voice_hybrid_vad_decision_total` (for overall VAD behavior).
  - `voiceassist_voice_barge_in_misfires_total{cause="no_transcript"}` (to ensure recommendations correlate with noisy, error-prone conditions).

### 2.2 Feature Flag Test Generator

```typescript
// e2e/voice/voice-flag-matrix.spec.ts
import { test } from "./utils/test-setup";
import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { FEATURE_FLAGS } from "@voiceassist/types";

// Load matrix based on environment
const isNightly = process.env.VOICE_MATRIX_NIGHTLY === "1";
const matrixFile = isNightly ? "flag-matrix-nightly.json" : "flag-matrix-smoke.json";
const matrix = JSON.parse(fs.readFileSync(path.join(__dirname, matrixFile), "utf-8"));

test.describe(`Feature Flag Matrix: ${matrix.name}`, () => {
  for (const combo of matrix.combinations) {
    test(`${combo.name}`, async ({ page, metricsCollector }) => {
      // Set feature flags via admin API
      for (const [flagName, value] of Object.entries(combo.flags)) {
        await setFeatureFlag(page, flagName, value);
      }

      // Run basic conversation test
      await runBasicConversationTest(page);

      // Assert quality thresholds
      const result = metricsCollector.assertQuality({
        maxQueueOverflows: 0,
        maxScheduleResets: 1,
        maxErrors: 0,
        maxFalseBargeIns: 1,
        maxResponseLatencyMs: 3500,
        maxBargeInLatencyMs: 800,
      });

      expect(result.pass, result.failures.join("; ")).toBe(true);
    });
  }
});

// Helper to set feature flag via admin API
async function setFeatureFlag(page: Page, flagName: string, value: unknown): Promise<void> {
  const apiBase = process.env.CLIENT_GATEWAY_URL || "http://localhost:8000";
  await page.request.post(`${apiBase}/api/v1/admin/feature-flags/${flagName}`, {
    data: { value, enabled: value !== false },
  });
}

// Helper for basic conversation test
async function runBasicConversationTest(page: Page): Promise<void> {
  // Navigate and open voice mode
  await page.goto("/");
  await page.click('[data-testid="voice-mode-toggle"]');
  await page.waitForSelector('[data-testid="voice-mode-panel"]', { timeout: 10000 });

  // Wait for AI response
  await page.waitForFunction(() => document.querySelector('[data-testid="ai-transcript"]')?.textContent?.length > 0, {
    timeout: 30000,
  });

  // Wait for response to complete
  await page.waitForTimeout(5000);
}
```

### 2.3 Admin Panel Integration Tests

```typescript
describe("Feature Flag Admin Tests", () => {
  test("can toggle voice flag via admin API");
  test("flag changes take effect immediately");
  test("flag changes persist across page refresh");
  test("flag changes sync across multiple sessions");
  test("flag propagates to WebSocket handshake");
});
```

### 2.4 Snapshotting & Drift Detection

- Persist per-run snapshots of flag states and key thresholds to detect regressions
- Compare current run against baseline to catch threshold drift
- Emit compact report (JSON + markdown) summarizing passes/failures per flag

---

## Phase 3: Specific Issue Investigation Tests

### 3.1 Choppy Audio Investigation

```typescript
describe("Choppy Audio Debug Tests", () => {
  test("captures audio buffer state during barge-in", async ({ page, metricsCollector }) => {
    // Monitor:
    // - Queue length before/during/after barge-in
    // - Schedule state transitions
    // - Audio context state
    // - Chunk timing variance
    const metrics = metricsCollector.getMetrics();

    // Analyze chunk timing consistency
    const chunkEvents = metrics.audioEvents.filter((e) => e.type === "chunk_scheduled");
    const intervals = [];
    for (let i = 1; i < chunkEvents.length; i++) {
      intervals.push(chunkEvents[i].time - chunkEvents[i - 1].time);
    }

    // Chunk intervals should be consistent (within 20% variance)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const maxVariance = avgInterval * 0.2;
    const outliers = intervals.filter((i) => Math.abs(i - avgInterval) > maxVariance);

    expect(outliers.length).toBeLessThan(intervals.length * 0.1);
  });

  test("identifies queue overflow triggers");
  test("verifies schedule reset behavior");
  test("measures chunk arrival timing");
});
```

### 3.2 Self-Interruption Investigation

```typescript
describe("Self-Interruption Debug Tests", () => {
  test("captures VAD events during AI playback", async ({ page, metricsCollector }) => {
    // Monitor VAD during playback
    const vadEvents = metricsCollector.getPlaybackVADEvents();

    // During AI playback, VAD should use boosted threshold
    const probEvents = vadEvents.filter((e) => e.type === "probability");
    for (const event of probEvents) {
      if (event.probability && event.threshold) {
        // Effective threshold during playback should be ~0.7 (0.5 + 0.2 boost)
        expect(event.threshold).toBeGreaterThanOrEqual(0.65);
      }
    }
  });

  test("identifies false barge-in sources");
  test("verifies echo suppression effectiveness");
});
```

### 3.3 Backend Correlation

- Capture server-side markers (schedule resets, playback underruns, Deepgram/ElevenLabs latency) via WebSocket debug channel or API logs
- When a test fails, pull the latest voice pipeline log slice (bounded lines) and attach to trace
- Cross-reference frontend metrics with backend timestamps for root cause analysis

---

## Phase 4: Test Infrastructure

### 4.1 Enhanced Playwright Config

```typescript
// playwright.config.ts additions
{
  name: 'voice-smoke',
  testDir: './e2e/voice',
  testMatch: /voice-flag-matrix\.spec\.ts/,
  timeout: 180 * 1000, // 3 minutes
  retries: 1,
  use: {
    ...devices['Desktop Chrome'],
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
    storageState: 'e2e/.auth/user.json',
  },
},

{
  name: 'voice-nightly',
  testDir: './e2e/voice',
  testMatch: /voice-flag-matrix\.spec\.ts/,
  timeout: 300 * 1000, // 5 minutes per test
  retries: 2,
  use: {
    ...devices['Desktop Chrome'],
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
    storageState: 'e2e/.auth/user.json',
    contextOptions: {
      recordVideo: { dir: 'test-results/videos' },
    },
  },
},

{
  name: 'voice-scenarios',
  testDir: './e2e/voice',
  testMatch: /voice-scenarios\.spec\.ts/,
  timeout: 300 * 1000, // 5 minutes for full conversation tests
  use: {
    ...devices['Desktop Chrome'],
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${audioPath}`,
      ],
    },
    storageState: 'e2e/.auth/user.json',
    contextOptions: {
      recordVideo: { dir: 'test-results/videos' },
    },
  },
},
```

### 4.2 GitHub CI Integration

```yaml
# .github/workflows/voice-e2e.yml
name: Voice Mode E2E Tests

on:
  push:
    paths:
      - "apps/web-app/src/hooks/useThinkerTalker**"
      - "apps/web-app/src/hooks/useSilero**"
      - "apps/web-app/src/hooks/useTTAudio**"
      - "apps/web-app/src/hooks/useIntelligentBargeIn**"
      - "e2e/voice/**"
      - "packages/types/src/featureFlags.ts"
  pull_request:
    paths:
      - "apps/web-app/src/hooks/useThinkerTalker**"
      - "apps/web-app/src/hooks/useSilero**"
      - "apps/web-app/src/hooks/useTTAudio**"
      - "apps/web-app/src/hooks/useIntelligentBargeIn**"
      - "e2e/voice/**"
      - "packages/types/src/featureFlags.ts"
  schedule:
    # Nightly at 2 AM UTC
    - cron: "0 2 * * *"

env:
  LIVE_REALTIME_E2E: 1

jobs:
  voice-smoke:
    name: Voice Smoke Tests (PR)
    if: github.event_name == 'pull_request' || github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: pnpm install
      - name: Install Playwright
        run: npx playwright install chromium
      - name: Validate audio fixtures
        run: bash e2e/fixtures/audio/validate-fixtures.sh
      - name: Run smoke tests
        run: |
          npx playwright test \
            --project=voice-smoke \
            --project=voice-barge-in
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: voice-smoke-results
          path: |
            test-results/
            playwright-report/

  voice-nightly:
    name: Voice Nightly Matrix
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      VOICE_MATRIX_NIGHTLY: 1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: pnpm install
      - name: Install Playwright
        run: npx playwright install chromium
      - name: Run nightly matrix
        run: |
          npx playwright test \
            --project=voice-nightly \
            --project=voice-scenarios \
            --project=voice-real-audio
      - name: Generate matrix report
        run: node scripts/generate-voice-report.js
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: voice-nightly-results
          path: |
            test-results/
            playwright-report/
            voice-matrix-report.md
```

### 4.3 Artifacts, Flake Triage, and Health

- Store `voice-test-metrics` outputs, trimmed console logs, and Playwright traces per test in `test-results/voice/`
- Add flake detector: rerun only failed voice suites once and annotate PRs with suspected flake signatures (timeouts, watchdog resets)
- Track rolling quality metrics (false barge-in rate, latency p90, queue overflows) in markdown summary dashboard

---

## Implementation Order

### Week 1: Enhanced Test Infrastructure

1. [ ] Enforce guardrails (env validation, prod URL block, LIVE_REALTIME_E2E gating)
2. [ ] Wire `VoiceMetricsCollector` into existing specs (`voice-barge-in.spec.ts`, `voice-real-audio.spec.ts`)
3. [ ] Add fixture normalization script (`validate-fixtures.sh`) and generate CI silence/noise clips
4. [ ] Create `e2e/voice/utils/test-setup.ts` with extended test fixture

### Week 2: Scenario Tests & Matrix Files

1. [ ] Create `flag-matrix-smoke.json` and `flag-matrix-nightly.json`
2. [ ] Implement `voice-flag-matrix.spec.ts` with matrix loading
3. [ ] Implement natural conversation scenario tests (`voice-scenarios.spec.ts`)
4. [ ] Add audio quality assertion tests with metrics-driven thresholds

### Week 3: CI Integration & Debug Tests

1. [ ] Create `.github/workflows/voice-e2e.yml` with smoke/nightly separation
2. [ ] Implement debug tests for choppy audio investigation
3. [ ] Implement debug tests for self-interruption investigation
4. [ ] Add backend log correlation for failure triage

### Week 4: Analysis & Fixes

1. [ ] Run full nightly matrix and analyze results
2. [ ] Identify root causes from metrics (queue overflow patterns, VAD threshold issues)
3. [ ] Fix identified issues in voice mode hooks
4. [ ] Tune VAD thresholds based on empirical data
5. [ ] Update documentation with optimal flag configurations

---

## Gap Analysis & Additional Improvements

### Identified Gaps (Now Addressed)

1. **Threshold Alignment Gap** ✅
   - Plan thresholds now aligned with `featureFlags.ts` defaults
   - Added specific threshold values from source code

2. **Metrics Collector Integration Gap** ✅
   - Added `test-setup.ts` to wire collector into existing specs
   - Added metrics persistence and trace attachment

3. **Fixture Validation Gap** ✅
   - Added `validate-fixtures.sh` script with ffprobe validation
   - Added CI fixture generation for silence/noise

4. **Smoke vs Nightly Gap** ✅
   - Split matrix into `flag-matrix-smoke.json` (5 combinations, ~5 min)
   - Split matrix into `flag-matrix-nightly.json` (25+ combinations, ~30 min)
   - CI workflow now has separate jobs for each

5. **Environment Safety Gap** ✅
   - Added production URL blocking
   - Added credential validation

### Additional Improvements Made

1. **Latency Percentiles**: Added p90 latency thresholds in addition to averages
2. **Chunk Timing Analysis**: Added variance analysis for detecting choppy audio
3. **Playback Threshold Verification**: Added tests to verify effective threshold during playback
4. **Backend Log Correlation**: Added strategy for cross-referencing frontend/backend metrics
5. **Flake Detection**: Added strategy for identifying and annotating flaky tests

---

## Expected Outcomes

1. **Comprehensive test coverage** - Every voice feature flag tested
2. **Reliable barge-in** - VAD thresholds tuned via empirical testing
3. **No choppy audio** - Audio queue management fixed
4. **No self-interruption** - Echo suppression properly configured
5. **CI/CD integration** - Automatic testing on voice mode changes
6. **Documentation** - Optimal feature flag configurations documented

---

## Files to Create/Modify

### New Files

- `e2e/voice/voice-scenarios.spec.ts` - Natural conversation scenarios
- `e2e/voice/voice-flag-matrix.spec.ts` - Feature flag matrix tests
- `e2e/voice/voice-debug.spec.ts` - Debug and investigation tests
- `e2e/voice/utils/test-setup.ts` - Extended test fixture with metrics
- `e2e/voice/flag-matrix-smoke.json` - Smoke test flag combinations
- `e2e/voice/flag-matrix-nightly.json` - Nightly test flag combinations
- `e2e/fixtures/audio/validate-fixtures.sh` - Fixture validation script
- `e2e/fixtures/audio/scenarios/` - Additional audio files
- `.github/workflows/voice-e2e.yml` - CI workflow

### Modified Files

- `playwright.config.ts` - Add voice-smoke, voice-nightly, voice-scenarios projects
- `e2e/voice/voice-barge-in.spec.ts` - Wire in metrics collector
- `e2e/voice/voice-real-audio.spec.ts` - Wire in metrics collector
- `apps/web-app/src/hooks/useTTAudioPlayback.ts` - Fix audio queue issues (if needed)
- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts` - Fix VAD/echo issues (if needed)

### Existing Files (Already Created)

- `e2e/voice/utils/voice-test-metrics.ts` ✅ - Metrics capture framework
