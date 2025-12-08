# Voice Mode Barge-In & Natural Conversation Enhancements

> **Version:** 2.0 - Enhanced with Intelligent Classification, Prosody-Aware Turn-Taking, and Network Resilience
> **Last Updated:** December 2025
> **Branch:** `feat/intelligent-barge-in`
> **Status:** Planning

---

## Executive Summary

This plan enhances VoiceAssist's voice mode to deliver truly natural conversations through:

- **Intelligent barge-in classification** (backchannel, soft_barge, hard_barge)
- **Prosody-aware turn-taking** that detects when users intend to continue speaking
- **Sub-100ms barge-in latency** with instant audio muting and queue control
- **Network-adaptive behavior** that gracefully degrades on poor connections
- **AEC feedback loop** for smarter echo cancellation during barge-in
- **Comprehensive observability** for production monitoring and tuning

---

## Goals

### Primary Goals

1. **Immediate audio stop on barge-in** - Playback mutes within 50ms of speech detection
2. **No lost speech tokens** - Microphone starts streaming before TTS fade completes
3. **Intelligent interruption handling** - Distinguish backchannels ("uh huh") from true interruptions
4. **Realtime playback synchronization** - Prevent multi-second queue buildup and transcript lag
5. **Graceful false-positive recovery** - Resume playback if barge-in was triggered by echo/noise

### Secondary Goals

6. **Prosody-aware turn-taking** - Use pitch, duration, and trailing patterns to predict turn completion
7. **Network resilience** - Adaptive buffering and quality adjustment based on connection quality
8. **Multilingual support** - Backchannel detection in 12 languages
9. **User personalization** - Learn individual speech patterns over sessions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Browser)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌──────────────────────┐    ┌───────────────────┐  │
│  │  useSileroVAD   │───▶│ useIntelligentBargeIn│───▶│ useTTAudioPlayback│  │
│  │ (Neural VAD)    │    │ (Classification FSM) │    │ (Queue Control)   │  │
│  └────────┬────────┘    └──────────┬───────────┘    └─────────┬─────────┘  │
│           │                        │                          │             │
│           │ VAD confidence         │ barge-in type            │ fade/stop   │
│           ▼                        ▼                          ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              useThinkerTalkerVoiceMode (Orchestrator)               │   │
│  │  - State machine: listening → speaking → barge_in → classifying    │   │
│  │  - Coordinates VAD, playback, WebSocket transport                   │   │
│  └─────────────────────────────────┬───────────────────────────────────┘   │
│                                    │                                        │
│                                    │ WebSocket messages                     │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐   ┌────────────────────┐   ┌─────────────────────────┐ │
│  │ Deepgram STT   │──▶│ ContinuationDetector│──▶│ ThinkerTalkerHandler   │ │
│  │(SpeechStarted) │   │ (Prosody Analysis)  │   │ (WebSocket Protocol)   │ │
│  └────────────────┘   └────────────────────┘   └───────────┬─────────────┘ │
│                                                             │               │
│  ┌────────────────┐   ┌────────────────────┐               │               │
│  │ UtteranceAggr. │──▶│ BargeInClassifier  │◀──────────────┘               │
│  │ (Multi-segment)│   │ (Backchannel/Soft) │                               │
│  └────────────────┘   └────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scope

### In Scope

- Frontend: Audio playback queue control, Silero VAD integration, intelligent barge-in classification, transcript alignment, observability
- Backend: Barge-in classification service, prosody analysis integration, continuation detection, WebSocket protocol extensions
- Feature flags: All changes guarded by admin-configurable feature flags
- Tests: Unit, integration, and E2E tests for barge-in flows

### Out of Scope

- STT/TTS provider changes (using existing Deepgram + ElevenLabs)
- Major WebSocket protocol redesign
- Mobile-specific audio handling

---

## Implementation Phases

### Phase 1: Playback & Queue Control Hardening (Foundation)

**Goal:** Ensure audio playback never drifts more than 1 second behind realtime.

#### 1.1 Queue Duration Enforcement

**Design:**

- Track total queued duration: `queuedDuration = sum(chunk.length) / sampleRate`
- Hard cap at 1 second (configurable via feature flag)
- When exceeded: drop oldest chunks, reset `nextScheduledTime` to `currentTime + epsilon`
- Emit `queue_overflow` telemetry event on each reset

**Implementation Steps:**

1. Add `queuedDurationMs` computed property to `useTTAudioPlayback`
2. Add `MAX_QUEUE_DURATION_MS` constant (default: 1000ms, feature flag: `backend.voice_max_queue_duration_ms`)
3. In `queueAudioChunk()`: check duration before adding, trim if over limit
4. After trim: reset scheduling state, log warning, emit metric
5. Add feature flag `backend.voice_queue_overflow_protection` (default: true)

**Files to Modify:**

- `apps/web-app/src/hooks/useTTAudioPlayback.ts`
- `packages/types/src/featureFlags.ts`

#### 1.2 Instant Barge-In Audio Path

**Design:**

- On barge-in signal: execute in parallel (not serial):
  1. Set `bargeInActive = true` (gate for new chunks)
  2. Call `fadeOut(50)` for rapid gain reduction
  3. Suspend `AudioContext` after fade for hard mute
  4. Clear audio queue (drop stale chunks)
  5. Reset scheduling state (`nextScheduledTime = 0`)
- Mic must start streaming BEFORE fade completes (parallel, not after)

**Implementation Steps:**

1. Create `performInstantBargeIn()` method that runs all operations in parallel
2. Move mic activation to trigger immediately on barge-in signal
3. Add `audioContext.suspend()` after fade completes for guaranteed silence
4. Add `audioContext.resume()` on next audio chunk or explicit resume
5. Add telemetry: `barge_in_latency_ms` (speech onset → playback muted)

**Files to Modify:**

- `apps/web-app/src/hooks/useTTAudioPlayback.ts`
- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`

#### 1.3 Scheduling Watchdog

**Design:**

- Background timer compares `nextScheduledTime` vs `audioContext.currentTime`
- If drift exceeds 1 second: reset schedule, trim queue, log warning
- Prevents runaway scheduling that causes perceptual lag

**Implementation Steps:**

1. Add `useEffect` with 500ms interval to check scheduling drift
2. If `nextScheduledTime - audioContext.currentTime > MAX_SCHEDULE_DRIFT_S`: reset
3. Emit `schedule_drift_reset` metric with drift amount
4. Add feature flag `backend.voice_schedule_watchdog` (default: true)

**Files to Modify:**

- `apps/web-app/src/hooks/useTTAudioPlayback.ts`

---

### Phase 2: Intelligent Barge-In Classification (Core Feature)

**Goal:** Distinguish between backchannels, soft interruptions, and hard interruptions.

#### 2.1 Barge-In State Machine

**Design:**
Implement full FSM from existing `useIntelligentBargeIn/types.ts`:

```
States:
  idle → calibrating → connecting → listening → speech_detected →
  user_speaking → processing_stt → processing_llm → ai_responding →
  ai_speaking → barge_in_detected → (soft_barge | awaiting_continuation | listening)

Transitions:
  ai_speaking + VAD speech → barge_in_detected
  barge_in_detected + classification → soft_barge | hard_barge | backchannel
  backchannel → ai_speaking (continue)
  soft_barge → awaiting_continuation (AI paused, volume at 20%)
  hard_barge → listening (AI stopped, process new query)
```

**Implementation Steps:**

1. Create `useIntelligentBargeIn.ts` hook implementing `UseIntelligentBargeInReturn`
2. Integrate with `useSileroVAD` for speech detection during AI playback
3. Add debounce window (100ms) to confirm speech before classifying
4. Wire to `useTTAudioPlayback` for fade/stop control
5. Add feature flag `backend.voice_intelligent_barge_in` (default: false initially)

**Files to Create:**

- `apps/web-app/src/hooks/useIntelligentBargeIn/useIntelligentBargeIn.ts`

**Files to Modify:**

- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`
- `packages/types/src/featureFlags.ts`

#### 2.2 Backchannel Detection (Frontend + Backend)

**Design:**

- **Frontend (fast path):** Check transcript against `backchannelPhrases` Map (12 languages)
- **Backend (authoritative):** Use continuation detector + prosody analysis for confirmation
- Classification criteria:
  - Duration < 500ms (configurable: `backend.voice_backchannel_max_duration_ms`)
  - Matches known phrase pattern
  - Low energy/flat prosody (not emphatic)

**Implementation Steps:**

1. Add `classifyBargeIn()` function using existing `DEFAULT_BARGE_IN_CONFIG.backchannelPhrases`
2. Integrate with backend classifier via WebSocket message `barge_in.classify`
3. Add phrase matching with fuzzy tolerance (Levenshtein distance ≤ 2)
4. Add audio duration check before phrase matching
5. Wire to state machine: backchannel → continue AI, no interruption

**Files to Create:**

- `apps/web-app/src/hooks/useIntelligentBargeIn/classifyBargeIn.ts`
- `services/api-gateway/app/services/barge_in_classification_service.py`

**Files to Modify:**

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`

#### 2.3 Soft vs Hard Barge Detection

**Design:**

- **Soft barge:** Short utterances like "wait", "hold on", "one moment" + pause
  - Action: Fade AI to 20%, pause TTS generation, wait for user
  - Resume: If no speech in 2s, ask "Would you like me to continue?"
- **Hard barge:** Sustained speech (>300ms) that's not a backchannel
  - Action: Full stop, clear context marker, process as new query

**Implementation Steps:**

1. Add duration threshold: < 300ms = soft barge candidate, ≥ 300ms = hard barge
2. Add phrase detection for soft barge keywords per language
3. Implement soft barge behavior:
   - Reduce volume to `softBargeFadeLevel` (0.2)
   - Set `aiPaused = true` in state machine
   - Start 2-second resume timer
4. Implement hard barge behavior:
   - Full `stop()` + mic activation
   - Clear AI response context
   - Emit `hard_barge` event to backend

**Files to Modify:**

- `apps/web-app/src/hooks/useIntelligentBargeIn/useIntelligentBargeIn.ts`
- `apps/web-app/src/hooks/useTTAudioPlayback.ts`

#### 2.4 False-Positive Recovery

**Design:**

- After barge-in detected, monitor for actual user speech
- If no valid speech frames within 400-600ms: classify as false positive
- Recovery actions:
  - Restore previous playback state
  - Resume TTS from last position (if buffered)
  - Log false positive for threshold tuning

**Implementation Steps:**

1. Add `falsePositiveRecoveryMs` config option (default: 500ms)
2. Start timer when barge-in triggers
3. If timer fires without confirmed speech: call `resumePriorPlayback()`
4. Track `false_positive_count` metric for threshold tuning
5. Optionally: auto-adjust VAD threshold based on false positive rate

**Files to Modify:**

- `apps/web-app/src/hooks/useIntelligentBargeIn/useIntelligentBargeIn.ts`
- `apps/web-app/src/hooks/useTTAudioPlayback.ts` (add `resumeFromPosition()`)

---

### Phase 3: Prosody-Aware Turn-Taking (Natural Conversation)

**Goal:** Use prosodic cues to predict when users intend to continue speaking.

#### 3.1 Frontend Prosody Feature Extraction

**Design:**

- Extract from Silero VAD audio frames:
  - Pitch contour (rising = question, falling = statement)
  - Energy decay pattern (trailing off = incomplete)
  - Speech rate changes (slowing = finishing, speeding = continuing)
- Send features to backend with transcript for holistic analysis

**Implementation Steps:**

1. Add pitch extraction using Web Audio API `AnalyserNode` + autocorrelation
2. Track energy over 50ms windows for decay detection
3. Add `prosodyFeatures` to WebSocket `audio.input.complete` message
4. Feature flag: `backend.voice_prosody_extraction` (default: false)

**Files to Create:**

- `apps/web-app/src/lib/prosodyExtractor.ts`

**Files to Modify:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
- `packages/types/src/voice.ts` (add prosody types)

#### 3.2 Backend Continuation Detection Integration

**Design:**
Leverage existing `continuation_detector.py` service:

- Analyzes trailing words for continuation indicators
- Detects filler words ("um", "uh", "so...")
- Uses prosody features when available
- Returns confidence score for "user will continue speaking"

**Implementation Steps:**

1. Wire `ContinuationDetector` to WebSocket handler
2. When confidence > 0.7: extend silence threshold by 2x
3. Send `turn.continuation_detected` event to frontend
4. Frontend shows visual indicator (e.g., pulsing border)
5. Feature flag: `backend.voice_continuation_detection` (already exists, default: true)

**Files to Modify:**

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`
- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
- `apps/web-app/src/components/voice/VoiceModePanel.tsx` (visual indicator)

#### 3.3 Utterance Aggregation

**Design:**
Leverage existing `utterance_aggregator.py` service:

- Collects speech segments within aggregation window (3s default)
- Merges into single utterance for LLM processing
- Prevents context fragmentation from natural pauses

**Implementation Steps:**

1. Enable by default (feature flag already exists: `backend.voice_utterance_aggregation`)
2. Add visual indicator showing "still listening" during aggregation
3. Configure window via `backend.voice_aggregation_window_ms` (default: 3000)
4. Emit `utterance.aggregated` event with segment count

**Files to Modify:**

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`
- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`

---

### Phase 4: VAD & Echo Cancellation Refinement

**Goal:** Improve speech detection accuracy, especially during AI playback.

#### 4.1 Hybrid VAD (Frontend + Backend)

**Design:**

- Frontend Silero VAD: Fast, local detection (~10-30ms latency)
- Backend Deepgram VAD: Server-side confirmation with SpeechStarted event
- Dual-trigger strategy: First detection wins, but require both for high-confidence
- De-duplication: Ignore backend if frontend already triggered within 200ms

**Implementation Steps:**

1. Add `vadSource` field to barge-in events: "frontend" | "backend" | "both"
2. Implement `BargeInController` that accepts triggers from both sources
3. Add 100ms debounce between duplicate triggers
4. Log VAD trigger source for tuning
5. Feature flag: `backend.voice_hybrid_vad` (default: true)

**Files to Create:**

- `apps/web-app/src/hooks/useIntelligentBargeIn/bargeInController.ts`

**Files to Modify:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`

#### 4.2 Adaptive VAD Thresholds

**Design:**
Leverage existing Silero VAD adaptive threshold infrastructure:

- Calibrate during first 1s of session (measure ambient noise)
- Adjust `positiveSpeechThreshold` based on noise floor
- During AI playback: boost threshold by 0.2 (existing behavior)
- After repeated false positives: auto-increase threshold

**Implementation Steps:**

1. Wire existing `enableAdaptiveThreshold` option to feature flag
2. Add `calibrate()` method call at session start
3. Store calibration results in `CalibrationResult` type
4. Adjust threshold dynamically: `base + noiseAdjustment + playbackBoost`
5. Feature flag: `backend.voice_silero_adaptive_threshold` (already exists, default: true)

**Files to Modify:**

- `apps/web-app/src/hooks/useSileroVAD.ts`
- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`

#### 4.3 AEC Feedback Loop (Advanced)

**Design:**

- Track echo cancellation state from browser via `RTCPeerConnection.getStats()` (if WebRTC fallback enabled)
- When AEC diverged/converged status changes, adjust VAD sensitivity
- Gate barge-in on AEC convergence state to prevent echo triggers

**Implementation Steps:**

1. Add `useAECFeedback` hook that polls WebRTC stats (when available)
2. Expose `aecConverged: boolean` state
3. When `!aecConverged`: temporarily boost VAD threshold by additional 0.1
4. Feature flag: `backend.ws_aec_barge_gate` (already exists, default: false)

**Files to Create:**

- `apps/web-app/src/hooks/useAECFeedback.ts`

**Files to Modify:**

- `apps/web-app/src/hooks/useSileroVAD.ts`

---

### Phase 5: Transcript Delivery & UI Alignment

**Goal:** Ensure transcripts arrive in realtime, not delayed until audio finishes.

#### 5.1 Streaming Partial Transcripts

**Design:**

- Start streaming `transcript.delta` events as soon as TTS begins
- Don't wait for audio chunk completion
- Attach sequence numbers for ordering guarantee

**Implementation Steps:**

1. Add `sequence` field to all `transcript.delta` messages
2. Emit partial transcript immediately when available from Thinker
3. Frontend renders deltas progressively using sequence for ordering
4. Handle out-of-order arrival gracefully (buffer and sort)

**Files to Modify:**

- `services/api-gateway/app/services/thinker_talker_websocket_handler.py`
- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
- `apps/web-app/src/components/voice/VoiceModePanel.tsx`

#### 5.2 Audio-Transcript Synchronization

**Design:**

- TTS chunks include timestamp from start of utterance
- Frontend maps transcript words to audio playback position
- Enables visual highlight of currently spoken word (karaoke-style)

**Implementation Steps:**

1. Add `startOffsetMs` field to `audio.chunk` messages
2. Track playback position in `useTTAudioPlayback`
3. Map transcript words to audio positions
4. Add optional word highlighting in UI (feature flagged)
5. Feature flag: `backend.voice_word_highlighting` (default: false)

**Files to Modify:**

- `services/api-gateway/app/services/talker_service.py`
- `apps/web-app/src/hooks/useTTAudioPlayback.ts`
- `apps/web-app/src/components/voice/TranscriptDisplay.tsx`

---

### Phase 6: Network-Adaptive Behavior

**Goal:** Maintain conversation quality across varying network conditions.

#### 6.1 Connection Quality Monitoring

**Design:**

- Track WebSocket latency via heartbeat round-trip time
- Monitor audio chunk delivery jitter
- Classify connection: "good" (RTT < 100ms), "moderate" (100-300ms), "poor" (>300ms)

**Implementation Steps:**

1. Add latency measurement to WebSocket heartbeat
2. Calculate jitter from audio chunk arrival times
3. Expose `connectionQuality` state from `useThinkerTalkerSession`
4. Store in context for adaptive behavior

**Files to Modify:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
- `apps/web-app/src/context/VoiceModeContext.tsx`

#### 6.2 Adaptive Prebuffering

**Design:**

- Good connection: 2-3 chunks (~100-150ms buffer)
- Moderate connection: 4-5 chunks (~200-250ms buffer)
- Poor connection: 6-8 chunks (~300-400ms buffer)
- Never exceed 1s total queue

**Implementation Steps:**

1. Add `getAdaptivePrebufferTarget()` function based on connection quality
2. Pass dynamic `prebufferChunks` to `useTTAudioPlayback`
3. Log prebuffer adjustments for analysis
4. Feature flag: `backend.voice_adaptive_prebuffer` (default: false)

**Files to Modify:**

- `apps/web-app/src/hooks/useTTAudioPlayback.ts`
- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`

#### 6.3 Graceful Degradation

**Design:**
When connection severely degrades:

- Reduce TTS quality (lower bitrate)
- Increase chunk size (fewer round-trips)
- Show user indicator
- Fallback to batch STT if streaming fails repeatedly

**Implementation Steps:**

1. Add `degradationLevel` state: 0 (none), 1 (light), 2 (heavy)
2. At level 1: request lower TTS bitrate from backend
3. At level 2: increase chunk size, show warning UI
4. Feature flag: `backend.ws_graceful_degradation` (already exists, default: false)

**Files to Modify:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
- `services/api-gateway/app/services/talker_service.py`

---

### Phase 7: Observability & Telemetry

**Goal:** Comprehensive metrics for production monitoring and iterative tuning.

#### 7.1 Frontend Metrics

| Metric                    | Description                                | Collection Point      |
| ------------------------- | ------------------------------------------ | --------------------- |
| `barge_in_latency_ms`     | Time from speech onset to playback muted   | useIntelligentBargeIn |
| `ttfa_ms`                 | Time to first audio for each response      | useTTAudioPlayback    |
| `queue_depth_chunks`      | Current audio queue depth                  | useTTAudioPlayback    |
| `queue_overflow_count`    | Number of queue overflow resets            | useTTAudioPlayback    |
| `vad_trigger_source`      | Frontend vs backend VAD trigger            | useIntelligentBargeIn |
| `barge_in_classification` | backchannel / soft / hard / false_positive | useIntelligentBargeIn |
| `context_suspend_count`   | AudioContext suspend/resume events         | useTTAudioPlayback    |
| `schedule_drift_resets`   | Scheduling watchdog triggers               | useTTAudioPlayback    |
| `false_positive_rate`     | Barge-ins without confirmed speech         | useIntelligentBargeIn |

#### 7.2 Backend Metrics

| Metric                        | Description                      | Collection Point     |
| ----------------------------- | -------------------------------- | -------------------- |
| `backend_barge_in_count`      | Total barge-ins processed        | WebSocket handler    |
| `continuation_detected_count` | Continuation detection triggers  | ContinuationDetector |
| `utterance_aggregation_count` | Multi-segment aggregations       | UtteranceAggregator  |
| `stt_latency_ms`              | STT first transcript latency     | StreamingSTTService  |
| `tts_first_chunk_ms`          | TTS first chunk delivery latency | TalkerService        |

#### 7.3 Implementation Steps

1. Emit structured logs via `voiceLog()` with metric tags
2. Add Prometheus counters/histograms in backend services
3. Create Grafana dashboard panels:
   - Barge-in latency distribution (p50, p95, p99)
   - Classification breakdown pie chart
   - Queue depth over time
   - False positive rate trend
4. Add alerting for p99 barge-in latency > 200ms

**Files to Create:**

- `infrastructure/observability/grafana/dashboards/voice-barge-in.json`

**Files to Modify:**

- `apps/web-app/src/lib/logger.ts`
- `services/api-gateway/app/core/metrics.py`

---

### Phase 8: Testing Strategy

#### 8.1 Unit Tests (Vitest)

**Audio Playback Tests:**

```typescript
describe("useTTAudioPlayback", () => {
  it("should trim queue when duration exceeds 1 second");
  it("should reset scheduling on watchdog trigger");
  it("should mute within 50ms on barge-in");
  it("should resume playback after false positive");
  it("should apply crossfade between chunks");
  it("should handle binary audio chunks");
});
```

**Barge-In Classification Tests:**

```typescript
describe("classifyBargeIn", () => {
  it('should classify "uh huh" as backchannel');
  it('should classify "wait" as soft_barge');
  it("should classify 500ms+ speech as hard_barge");
  it("should handle multilingual backchannels");
  it('should return "unclear" for ambiguous input');
});
```

**VAD Integration Tests:**

```typescript
describe("useSileroVAD", () => {
  it("should boost threshold during playback");
  it("should calibrate based on ambient noise");
  it("should detect speech with 0.5 threshold");
  it("should filter echo with 0.7 threshold");
});
```

**Files to Create:**

- `apps/web-app/src/hooks/__tests__/useIntelligentBargeIn.test.ts`
- `apps/web-app/src/hooks/__tests__/useTTAudioPlayback.barge-in.test.ts`

#### 8.2 Integration Tests (Playwright)

```typescript
describe("Voice Mode Barge-In", () => {
  it("should stop AI speech within 100ms when user speaks", async () => {
    // Start AI response
    // Inject simulated user speech via Web Audio API
    // Assert playback gain reaches 0 within 100ms
    // Assert mic becomes active
  });

  it("should continue AI for backchannel utterances", async () => {
    // Start AI response
    // Inject "uh huh" audio
    // Assert AI continues playing
    // Assert no interruption event emitted
  });

  it('should soft pause for "wait" and resume', async () => {
    // Start AI response
    // Inject "wait" audio
    // Assert volume drops to 20%
    // Wait 2s with no speech
    // Assert AI offers to continue
  });
});
```

**Files to Create:**

- `apps/web-app/playwright/voice-barge-in.spec.ts`

#### 8.3 Backend Tests (pytest)

```python
class TestBargeInClassification:
    def test_classify_backchannel_english(self):
        # Test "yeah", "uh huh" classification

    def test_classify_backchannel_arabic(self):
        # Test "اها", "نعم" classification

    def test_classify_soft_barge(self):
        # Test "wait", "hold on" classification

    def test_classify_hard_barge(self):
        # Test sustained speech classification
```

**Files to Create:**

- `services/api-gateway/tests/test_barge_in_classification.py`

#### 8.4 E2E Voice Flow Tests (GitHub CI)

Run on CI with simulated audio:

- Full conversation with barge-in scenarios
- Network latency simulation
- Multi-language backchannel detection
- False positive recovery verification

---

## Feature Flags

All changes are guarded by feature flags for gradual rollout:

| Flag                                        | Type    | Default | Description                                |
| ------------------------------------------- | ------- | ------- | ------------------------------------------ |
| `backend.voice_intelligent_barge_in`        | boolean | false   | Enable intelligent barge-in classification |
| `backend.voice_backchannel_detection`       | boolean | false   | Enable backchannel phrase detection        |
| `backend.voice_soft_barge`                  | boolean | false   | Enable soft barge (pause) behavior         |
| `backend.voice_queue_overflow_protection`   | boolean | true    | Enable 1s queue cap                        |
| `backend.voice_schedule_watchdog`           | boolean | true    | Enable scheduling drift detection          |
| `backend.voice_max_queue_duration_ms`       | number  | 1000    | Maximum queue duration in ms               |
| `backend.voice_backchannel_max_duration_ms` | number  | 500     | Max duration for backchannel               |
| `backend.voice_false_positive_recovery_ms`  | number  | 500     | False positive recovery window             |
| `backend.voice_hybrid_vad`                  | boolean | true    | Enable dual VAD (frontend + backend)       |
| `backend.voice_prosody_extraction`          | boolean | false   | Enable prosody feature extraction          |
| `backend.voice_word_highlighting`           | boolean | false   | Enable karaoke-style word highlighting     |
| `backend.voice_adaptive_prebuffer`          | boolean | false   | Enable network-adaptive buffering          |

---

## Rollout Strategy

### Stage 1: Foundation (Week 1)

- Deploy Phase 1 (queue control, instant barge-in) behind flags
- Enable `voice_queue_overflow_protection` and `voice_schedule_watchdog`
- Collect baseline metrics

### Stage 2: Classification (Week 2)

- Deploy Phase 2 (intelligent classification)
- Enable for internal testing only
- Tune backchannel phrases and thresholds

### Stage 3: Natural Conversation (Week 3)

- Deploy Phases 3-4 (prosody, VAD refinement)
- Enable continuation detection (already flagged)
- A/B test with 10% of users

### Stage 4: Polish (Week 4)

- Deploy Phases 5-6 (transcript sync, network adaptation)
- Full rollout of proven features
- Disable experimental flags that didn't improve metrics

---

## Success Criteria

| Metric                         | Target  | Current |
| ------------------------------ | ------- | ------- |
| Barge-in latency (p95)         | < 100ms | TBD     |
| False positive rate            | < 5%    | TBD     |
| Backchannel detection accuracy | > 90%   | TBD     |
| Queue overflow events          | < 1/min | TBD     |
| User interruption success rate | > 95%   | TBD     |

---

## Dependencies

### Existing Infrastructure (Leverage)

- `useSileroVAD` - Local neural VAD with echo suppression
- `useTTAudioPlayback` - Audio queue and scheduling
- `useIntelligentBargeIn/types.ts` - Type definitions (implement hook)
- `ContinuationDetector` - Backend prosody analysis
- `UtteranceAggregator` - Multi-segment collection
- Feature flag system via admin panel

### External Dependencies

- None (using existing Deepgram + ElevenLabs)

---

## Risks & Mitigations

| Risk                                               | Impact | Mitigation                                 |
| -------------------------------------------------- | ------ | ------------------------------------------ |
| Silero VAD model latency on low-end devices        | High   | Feature flag to fall back to RMS threshold |
| Echo cancellation failure triggers false barge-ins | High   | AEC feedback loop, threshold boost         |
| Network jitter causes audio gaps                   | Medium | Adaptive prebuffering, queue management    |
| Backchannel detection varies by accent             | Medium | Fuzzy matching, user personalization       |
| AudioContext suspend fails on some browsers        | Low    | Graceful fallback to gain reduction only   |

---

## Open Questions

1. Should soft barge resume be voice-initiated ("Would you like me to continue?") or button-based?
2. What's the right false positive recovery window - 400ms or 600ms?
3. Should backchannel detection use ML classifier instead of phrase matching?
4. How aggressive should adaptive prebuffering be on "moderate" connections?

---

## References

- [Intelligent Barge-In Types](/apps/web-app/src/hooks/useIntelligentBargeIn/types.ts)
- [Silero VAD Implementation](/apps/web-app/src/hooks/useSileroVAD.ts)
- [Audio Playback Hook](/apps/web-app/src/hooks/useTTAudioPlayback.ts)
- [Continuation Detector](/services/api-gateway/app/services/continuation_detector.py)
- [Voice Architecture Docs](https://assistdocs.asimo.io/voice/architecture)
