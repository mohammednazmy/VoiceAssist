# Voice Mode Barge-In & Natural Conversation Enhancements

> **Version:** 3.0 - Enhanced with TRP Detection, Hybrid VAD Fusion, Backchanneling, and Sub-250ms Perception Target
> **Last Updated:** December 2025
> **Branch:** `feat/silero-vad-improvements`
> **Status:** Planning
> **Revision (Dec 2025 v3):** Added TRP detection, hybrid VAD fusion algorithm, backchanneling integration, mobile presets, perception latency targets, UI/UX feedback, and critical bug fixes for classifier/detector wiring

---

## Executive Summary

This plan enhances VoiceAssist's voice mode to achieve **human-like conversation fluency** through:

- **Sub-250ms perceived response latency** - Users perceive interaction as instantaneous
- **Intelligent barge-in classification** (backchannel, soft_barge, hard_barge) with **classifier wired to T/T handler**
- **Transition-Relevant Point (TRP) detection** - Predict turn changes before they happen
- **Hybrid VAD fusion algorithm** - Combine frontend Silero + backend Deepgram with weighted voting
- **Active backchanneling** - Natural cues ("uh-huh", "got it") during processing
- **Prosody-aware turn-taking** with **continuation detector results actively used**
- **Network-adaptive behavior** with mobile/low-power presets
- **AEC feedback loop** for smarter echo cancellation during barge-in
- **Comprehensive observability** with tightened SLOs (P95 mute <50ms, misfire <2%)

---

## Goals

### Primary Goals (User-Facing)

1. **Sub-250ms perceived response latency** - Research shows users perceive <250ms as instantaneous; target total pipeline under this threshold
2. **Immediate audio stop on barge-in** - Playback mutes within 50ms of speech detection (P95)
3. **No lost speech tokens** - Microphone starts streaming before TTS fade completes
4. **Intelligent interruption handling** - Distinguish backchannels ("uh huh") from true interruptions with >90% accuracy
5. **Graceful false-positive recovery** - Resume playback if barge-in was triggered by echo/noise (<2% misfire rate)
6. **Natural conversation rhythm** - Active backchanneling during processing ("got it", "one moment")

### Secondary Goals (Technical)

7. **Transition-Relevant Point (TRP) detection** - Predict turn changes using tone, pauses, and sentence completion
8. **Hybrid VAD fusion** - Weighted combination of frontend Silero + backend Deepgram with staleness detection
9. **Prosody-aware turn-taking** - Use pitch, duration, and trailing patterns with continuation detector actively adjusting silence thresholds
10. **Network resilience** - Adaptive buffering and quality adjustment with mobile/low-power presets
11. **Multilingual support** - Backchannel detection in 12 languages
12. **User personalization** - Learn individual speech patterns over sessions
13. **Safe fallback** - Predictable behavior if one VAD source is missing or stale

---

## December 2025 Revisions (v3 - Critical Fixes & Enhancements)

### Critical Bug Fixes (MUST Address)

**1. Wire Barge-In Classifier to T/T Handler**

- **Issue**: `barge_in_classifier.py` (32KB, 12-language support) exists but is NOT imported or called in `thinker_talker_websocket_handler.py`
- **Fix**: Import and instantiate `BargeInClassifier` in T/T handler; call `classify()` on barge-in events; send classification result back to frontend via `barge_in.classified` message
- **Files**: `services/api-gateway/app/services/thinker_talker_websocket_handler.py` (add import + call)

**2. Use Continuation Detector Results**

- **Issue**: `continuation_detector.py` computes analysis but result stored in `_continuation_analysis` is never read or used
- **Fix**: When `continuation_analysis.should_continue` is true, extend Deepgram endpointing from 800ms to 1600ms; send `turn.continuation_expected` event to frontend
- **Files**: `services/api-gateway/app/services/voice_pipeline_service.py` (line ~395)

**3. Implement Hybrid VAD Fusion in Backend**

- **Issue**: Frontend sends `vad.state` messages but backend stores them without using for decision-making
- **Fix**: Implement fusion algorithm in new `HybridVADDecider` class; combine frontend Silero confidence + backend Deepgram events with weighted voting

### Enhanced Hybrid VAD Arbitration

**Protocol (Frontend → Backend):**

```json
{
  "type": "vad.state",
  "source": "silero",
  "silero_confidence": 0.85,
  "is_speaking": true,
  "speech_duration_ms": 350,
  "noise_floor_db": -42,
  "is_playback_active": true,
  "effective_threshold": 0.7,
  "timestamp_ms": 1701234567890
}
```

- Stream every 100ms during speaking (250ms on moderate/poor network)
- Backend considers stale if >300ms since last message

**Fusion Algorithm (`HybridVADDecider`):**

```python
def decide_barge_in(self, silero_state: VADState, deepgram_event: SpeechEvent) -> BargeInDecision:
    silero_fresh = (now - silero_state.timestamp_ms) < 300
    deepgram_fresh = (now - deepgram_event.timestamp_ms) < 300

    # Weight Deepgram higher during playback (better echo rejection)
    if self.is_tts_playing:
        weights = {"silero": 0.3, "deepgram": 0.7}
    else:
        weights = {"silero": 0.6, "deepgram": 0.4}

    # Both agree → immediate barge-in
    if silero_state.is_speaking and deepgram_event.is_speech_started:
        return BargeInDecision(trigger=True, source="hybrid", confidence=0.95)

    # Disagreement → use fresh side with higher threshold
    if silero_fresh and not deepgram_fresh:
        return BargeInDecision(trigger=silero_state.confidence > 0.8, source="silero_only")
    if deepgram_fresh and not silero_fresh:
        return BargeInDecision(trigger=True, source="deepgram_only")

    # Both stale → wait for transcript confirmation
    return BargeInDecision(trigger=False, source="awaiting_transcript")
```

**Misfire Safety (500ms Rollback):**

- Require either: (a) both VAD signals within 150ms, OR (b) one signal + transcript token within 500ms
- If neither condition met → `resumePriorPlayback()`, emit `barge_in_rollback` metric, restore volume

### Backchanneling Integration

**Issue**: `BackchannelService` exists but not integrated with T/T pipeline

**Implementation:**

- Enable via `backend.voice_backchanneling` (currently defaults to FALSE, change to TRUE)
- During LLM processing (>500ms), inject backchannel audio: "Hmm", "Got it", "One moment"
- Multilingual backchannel phrases already defined in `barge_in_classifier.py`
- Play backchannel TTS at 60% volume to indicate "still processing"

**Trigger Conditions:**

- LLM processing time > 500ms AND no tokens streamed yet
- User transcript contains question markers ("?", rising intonation)
- Long user utterance (>5 seconds) being processed

### Transition-Relevant Point (TRP) Detection

**Concept**: Predict turn changes BEFORE they happen using conversational landmarks

**Signals to Analyze:**

1. **Syntactic completion** - Sentence ends with period, question mark, or falling intonation
2. **Prosodic cues** - Pitch drops at end of utterance (finality marker)
3. **Pause duration** - 200-400ms pause after complete thought = likely TRP
4. **Trailing patterns** - Filler words ("so...", "um...") = NOT a TRP, expect continuation
5. **Gaze/attention** (future) - When video available, eye contact signals turn yield

**Implementation:**

- Add `TRPDetector` service that analyzes Deepgram transcript + prosody features
- Returns `trp_confidence: 0.0-1.0` indicating likelihood turn is complete
- When `trp_confidence > 0.8`, reduce silence threshold to 400ms (faster response)
- When `trp_confidence < 0.3`, extend silence threshold to 1200ms (wait for continuation)

### Mobile/Low-Power Preset

**Preset: `voice_mobile_low_power`**

| Setting                | Normal  | Low-Power           |
| ---------------------- | ------- | ------------------- |
| VAD streaming interval | 100ms   | 250ms               |
| Prosody extraction     | Enabled | Disabled            |
| Pre-buffer chunks      | 3       | 5                   |
| Silero model           | Full    | Lite (if available) |
| Crossfade samples      | 240     | 120                 |
| Max queue duration     | 1000ms  | 1500ms              |
| Confidence streaming   | Always  | On speech only      |

**Trigger Conditions:**

- `navigator.connection.effectiveType` is "2g" or "slow-2g"
- `navigator.getBattery().level` < 0.2
- `navigator.hardwareConcurrency` <= 2
- Explicit user setting in voice preferences

### UI/UX Visual Feedback

**Conversation State Indicators:**

| State                   | Visual                    | Behavior                     |
| ----------------------- | ------------------------- | ---------------------------- |
| `listening`             | Pulsing mic icon (blue)   | Ready for speech             |
| `speech_detected`       | Solid mic icon + waveform | Capturing user speech        |
| `processing`            | Rotating dots             | LLM thinking                 |
| `continuation_expected` | Pulsing border (subtle)   | Waiting for user to continue |
| `ai_speaking`           | Speaker wave animation    | AI response playing          |
| `barge_in_detected`     | Flash border (yellow)     | Interruption recognized      |
| `soft_pause`            | Dimmed speaker + "Paused" | AI waiting at 20% volume     |
| `network_degraded`      | Warning icon              | Poor connection indicator    |

**Backchannel Feedback:**

- Brief text bubble with backchannel phrase ("Got it...")
- Subtle audio indicator (soft chime) when processing long query

### Naturalness, Fallbacks, and Safety Optimizations

- **Perceived latency measurement:** Capture t0 (user speech start), t1 (barge-in mute), t2 (first token), t3 (first audio chunk played) to compute perceived latency client-side and stream to metrics for P50/P95 tracking.
- **Audio worklet fallback:** If `AudioWorklet` or `SharedArrayBuffer` is unavailable, fall back to a light ScriptProcessor VAD path with reduced frame rate and disable prosody extraction; log `vad_fallback_used`.
- **Double-barge guard:** Suppress duplicate barge-in triggers within 300ms; coalesce multiple VAD triggers into one barge event.
- **User personalization store:** Persist per-user noise floor and preferred thresholds (bounded by feature flag min/max) to avoid re-calibration every session; expose reset in settings.
- **Safety/PII:** Redact transcripts and user identifiers from telemetry events; sample VAD events (e.g., 10%) in production to reduce volume.
- **Cross-language tuning:** Maintain per-language backchannel lists and soft-barge keywords; include language tag in barge-in classification to avoid English bias.
- **Low-resource devices:** Auto-disable prosody extraction and reduce Silero frame rate on devices with `hardwareConcurrency <= 2` or high CPU usage, and fall back to Deepgram-only barge-in if CPU spikes persist.

### Flag Alignment & Rollout

**Existing Flags (Admin Panel Ready):**

- `backend.voice_silero_vad_enabled` (default: TRUE)
- `backend.voice_silero_vad_confidence_sharing` (default: TRUE)
- `backend.voice_silero_echo_suppression_mode` (default: "threshold_boost")
- `backend.voice_silero_positive_threshold` (default: 0.5)
- `backend.voice_silero_playback_threshold_boost` (default: 0.2)
- `backend.voice_silero_min_speech_ms` (default: 150ms)
- `backend.voice_silero_playback_min_speech_ms` (default: 200ms)
- `backend.voice_silero_adaptive_threshold` (default: TRUE)
- `backend.voice_silero_noise_calibration_ms` (default: 1000ms)
- `backend.voice_silero_noise_adaptation_factor` (default: 0.1)
- `backend.voice_hybrid_vad` (default: TRUE)
- `backend.voice_queue_overflow_protection` (default: TRUE)
- `backend.voice_schedule_watchdog` (default: TRUE)
- `backend.voice_intelligent_barge_in` (default: FALSE → ramp to TRUE)
- `backend.voice_backchannel_max_duration_ms` (default: 500ms)

**New Flags to Add:**

- `backend.voice_backchanneling_enabled` (default: FALSE → ramp to TRUE)
- `backend.voice_trp_detection` (default: FALSE)
- `backend.voice_mobile_low_power_preset` (default: FALSE, auto-enable on mobile)
- `backend.voice_hybrid_vad_fusion` (default: FALSE → TRUE after testing)
- `backend.voice_barge_in_classifier_enabled` (default: FALSE → TRUE)

**Rollout Strategy:**

- Ship all changes dark (flags FALSE)
- Enable telemetry/observability flags first (no user impact)
- Ramp barge-in classifier to 10% → 50% → 100%
- Enable backchanneling after classifier stable
- TRP detection last (most experimental)

### Observability & SLOs (Tightened)

**SLOs:**

| Metric                           | Target                 | Alert Threshold |
| -------------------------------- | ---------------------- | --------------- |
| P95 barge-in mute latency        | <50ms                  | >100ms          |
| P99 barge-in mute latency        | <100ms                 | >200ms          |
| Misfire rate (false barge-ins)   | <2%                    | >5%             |
| Echo-triggered false VAD         | <1%                    | >3%             |
| Queue overflow resets            | <0.5% of turns         | >2%             |
| VAD disagreement resolution      | <200ms                 | >500ms          |
| Perceived response latency (P95) | <250ms                 | >400ms          |
| Backchannel trigger rate         | 20-40% of long queries | <10% or >60%    |

**Structured Events:**

```json
// Barge-in lifecycle
{"event": "barge_in_detected", "source": "hybrid", "latency_ms": 45, "silero_conf": 0.82, "deepgram_triggered": true}
{"event": "barge_in_classified", "type": "soft_barge", "phrase": "wait", "language": "en", "confidence": 0.91}
{"event": "barge_in_rollback", "reason": "no_transcript", "duration_ms": 500}
{"event": "barge_in_completed", "type": "hard_barge", "interrupted_at_word": 23, "total_words": 45}

// Queue health
{"event": "queue_overflow_reset", "queued_ms_before": 1250, "queued_ms_after": 200, "chunks_dropped": 8}
{"event": "schedule_drift_reset", "drift_ms": 1100, "chunks_trimmed": 5}

// VAD health
{"event": "vad_disagreement", "silero_conf": 0.75, "deepgram_speech": false, "resolution": "silero_only", "stale_flags": {"silero": false, "deepgram": true}}
{"event": "vad_calibration_complete", "noise_floor_db": -38, "recommended_threshold": 0.55}

// Backchanneling
{"event": "backchannel_triggered", "phrase": "Got it", "trigger_reason": "long_processing", "processing_duration_ms": 750}
```

### Testing Matrix (Expanded)

**Unit Tests:**

- VAD state machine transitions (all 13 states)
- Queue trim/backpressure under overflow
- Fade/stop ordering (ensure mic starts BEFORE fade completes)
- Rollback timer accuracy (500ms ± 10ms)
- FSM transitions: backchannel → continue, soft_barge → pause, hard_barge → stop
- TRP confidence scoring for various utterance endings
- Hybrid VAD fusion with various staleness scenarios

**Integration Tests:**

- WebSocket hybrid VAD arbitration end-to-end
- Misfire rollback with AudioContext suspend/resume
- AEC-threshold interaction during TTS playback
- Concurrent playback + mic (echo scenario)
- Barge-in classifier integration with T/T handler
- Continuation detector → dynamic endpointing adjustment
- Backchannel injection during LLM processing

**E2E Tests (Playwright):**

- Scripted barge-in during TTS (good network)
- Scripted barge-in with high RTT (300ms+)
- Scripted barge-in with packet loss (5%, 10%)
- Echo scenarios (speaker near mic)
- Noisy environment (background noise injection)
- Mobile/low-power browser simulation
- Backchannel delivery verification
- Visual state indicator transitions

**Load/Soak Tests (k6/Locust):**

- 100 concurrent voice sessions for 1 hour
- Sustained conversations with backchannels (20+ turns)
- Assert no memory growth in VAD buffers
- Assert stable queue metrics over time
- Assert WebSocket connection stability

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

| Metric                               | Target                 | Alert Threshold | Current |
| ------------------------------------ | ---------------------- | --------------- | ------- |
| **Perceived response latency (P95)** | <250ms                 | >400ms          | TBD     |
| **Barge-in mute latency (P95)**      | <50ms                  | >100ms          | TBD     |
| **Barge-in mute latency (P99)**      | <100ms                 | >200ms          | TBD     |
| **Misfire rate (false barge-ins)**   | <2%                    | >5%             | TBD     |
| **Backchannel detection accuracy**   | >90%                   | <80%            | TBD     |
| **Echo-triggered false VAD**         | <1%                    | >3%             | TBD     |
| **Queue overflow resets**            | <0.5% of turns         | >2%             | TBD     |
| **VAD disagreement resolution**      | <200ms                 | >500ms          | TBD     |
| **User interruption success rate**   | >95%                   | <90%            | TBD     |
| **Backchannel trigger rate**         | 20-40% of long queries | <10% or >60%    | TBD     |

**Latency Budget Breakdown (Target: <250ms perceived):**

| Stage                      | Target    | Notes                           |
| -------------------------- | --------- | ------------------------------- |
| Speech onset detection     | 10-30ms   | Silero VAD local detection      |
| Barge-in decision          | 20-50ms   | Hybrid VAD fusion               |
| Audio mute                 | 50ms      | Fade + suspend                  |
| STT first token            | 100-150ms | Deepgram streaming              |
| Total to "listening" state | <250ms    | User perceives instant response |

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

| Risk                                               | Impact   | Likelihood | Mitigation                                                         |
| -------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------ |
| **Barge-in classifier not wired** (current bug)    | Critical | Certain    | Wire `barge_in_classifier.py` to T/T handler immediately           |
| **Continuation detector unused** (current bug)     | High     | Certain    | Implement dynamic endpointing based on `_continuation_analysis`    |
| **Hybrid VAD fusion missing** (current gap)        | High     | Certain    | Implement `HybridVADDecider` class in backend                      |
| Silero VAD model latency on low-end devices        | High     | Medium     | Mobile preset with reduced VAD interval; fallback to RMS threshold |
| Echo cancellation failure triggers false barge-ins | High     | Medium     | AEC feedback loop, threshold boost, misfire rollback               |
| Backchanneling disrupts user flow                  | Medium   | Low        | Feature flag with conservative defaults; monitor trigger rate      |
| TRP detection false positives                      | Medium   | Medium     | Conservative thresholds initially; tune based on telemetry         |
| Network jitter causes audio gaps                   | Medium   | Medium     | Adaptive prebuffering, connection quality monitoring               |
| Backchannel detection varies by accent             | Medium   | Medium     | Fuzzy matching (Levenshtein ≤2), user personalization              |
| AudioContext suspend fails on some browsers        | Low      | Low        | Graceful fallback to gain reduction only                           |
| Memory growth in VAD buffers during long sessions  | Low      | Low        | Periodic buffer cleanup; soak testing                              |

### Critical Path Items (Blocking Natural Conversation)

1. ⚠️ **Wire barge-in classifier** - Currently unreachable, classification capability exists but unused
2. ⚠️ **Use continuation detector output** - Analysis computed but never consulted
3. ⚠️ **Implement hybrid VAD fusion** - Frontend confidence sent but not used by backend

---

## Open Questions

### Design Decisions

1. **Soft barge resume method** - Voice-initiated ("Would you like me to continue?") or button-based?
   - Recommendation: Voice-initiated with button fallback after 3 seconds

2. **False positive recovery window** - 400ms or 600ms?
   - Recommendation: 500ms (current implementation) - balances responsiveness vs safety

3. **Backchannel detection method** - ML classifier vs phrase matching?
   - Recommendation: Start with phrase matching (faster), add ML classifier as Phase 2 enhancement

4. **Adaptive prebuffering aggressiveness** - How aggressive on "moderate" connections?
   - Recommendation: 4-5 chunks (~200-250ms) for moderate, 6-8 chunks for poor

### Technical Questions

5. **TRP detection model** - Use Deepgram prosody features or train custom model?
   - Recommendation: Start with Deepgram features + rule-based, train custom if accuracy <85%

6. **Backchanneling TTS** - Pre-cache phrases or generate on-demand?
   - Recommendation: Pre-cache top 10 phrases per language at session start

7. **Mobile preset trigger** - Automatic based on device capabilities or user opt-in?
   - Recommendation: Auto-detect with user override option

8. **Hybrid VAD weights** - Fixed weights or dynamic based on echo level?
   - Recommendation: Start fixed (0.3/0.7 during playback, 0.6/0.4 idle), add dynamic later

### Answered (from v2 revisions)

- ✅ **VAD staleness threshold**: 300ms (confirmed)
- ✅ **Misfire rollback timer**: 500ms (confirmed)
- ✅ **Barge-in debounce**: 500ms between triggers (implemented)
- ✅ **Queue overflow cap**: 1 second (implemented)

---

## References

### Internal Documentation

- [Intelligent Barge-In Types](/apps/web-app/src/hooks/useIntelligentBargeIn/types.ts)
- [Silero VAD Implementation](/apps/web-app/src/hooks/useSileroVAD.ts)
- [Audio Playback Hook](/apps/web-app/src/hooks/useTTAudioPlayback.ts)
- [Voice Mode Orchestrator](/apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts)
- [Barge-In Classifier](/services/api-gateway/app/services/barge_in_classifier.py)
- [Continuation Detector](/services/api-gateway/app/services/continuation_detector.py)
- [Utterance Aggregator](/services/api-gateway/app/services/utterance_aggregator.py)
- [Backchannel Service](/services/api-gateway/app/services/backchannel_service.py)
- [T/T WebSocket Handler](/services/api-gateway/app/services/thinker_talker_websocket_handler.py)
- [Voice Architecture Docs](https://assistdocs.asimo.io/voice/architecture)

### Industry Research (2024-2025)

- [State of Voice AI 2024 - Cartesia](https://cartesia.ai/blog/state-of-voice-ai-2024) - Latency benchmarks, S2S models
- [The Complete Guide to AI Turn-Taking | 2025 - Tavus](https://www.tavus.io/post/ai-turn-taking) - TRP detection, transition cues
- [Real-Time Barge-In AI - Gnani](https://www.gnani.ai/resources/blogs/real-time-barge-in-ai-for-voice-conversations-31347) - Interruption handling best practices
- [Voice AI's Missing Piece - Fast Company](https://www.fastcompany.com/91448246/voice-ais-missing-piece-the-ability-to-listen-while-it-talks) - Full-duplex challenges
- [AI Voice Agents in 2025 - Retell AI](https://www.retellai.com/blog/ai-voice-agents-in-2025) - <250ms perception threshold
- [Conversational AI Design 2025 - Botpress](https://botpress.com/blog/conversation-design) - Backchanneling, rhythm design
