# Voice Mode Barge-In & Natural Conversation Enhancements

> **Version:** 5.0 - Speculative TTS, Semantic Endpointing, Canary Deployment, and Production Hardening
> **Last Updated:** December 7, 2025
> **Branch:** `feat/silero-vad-improvements`
> **Status:** ✅ COMPLETE - All Core Phases Implemented (1-8)
> **Revision (Dec 2025 v5):** Added speculative TTS (PredGen), End-of-Utterance transformer model, canary deployment strategy, error budgets, WebRTC native AEC, device-specific presets with values, active session handling during rollback, expanded testing matrix, and privacy opt-in flows
>
> ### Implementation Completion Summary (Dec 7, 2025)
>
> | Phase | Description               | Status                                                          |
> | ----- | ------------------------- | --------------------------------------------------------------- |
> | 1     | Playback & Queue Control  | ✅ Complete - MAX_QUEUE_DURATION_MS, watchdog, instant barge-in |
> | 2     | Intelligent Barge-In      | ✅ Complete - classifyBargeIn + BargeInClassifier wired to T/T  |
> | 3     | Prosody-Aware Turn-Taking | ✅ Complete - prosodyExtractor + continuation_detector wired    |
> | 4     | VAD & AEC Refinement      | ✅ Complete - HybridVADDecider wired, AEC feedback loop         |
> | 5     | Transcript Delivery       | ✅ Complete - transcript_sync_service, sequence numbers         |
> | 6     | Network-Adaptive Behavior | ✅ Complete - useNetworkQuality, adaptive prebuffering          |
> | 7     | Observability & Telemetry | ✅ Complete - 15+ Prometheus metrics, Grafana dashboard         |
> | 8     | Testing Strategy          | ✅ Complete - Unit tests (40+ frontend, 64+ backend), E2E tests |
>
> **Feature Flags Added:** `voice_queue_overflow_protection`, `voice_schedule_watchdog`, `voice_intelligent_barge_in`

---

## Executive Summary

This plan enhances VoiceAssist's voice mode to achieve **human-like conversation fluency** through:

**Core Capabilities (v1-v4):**

- **Sub-200ms perceived response latency** - Approaching Moshi's 200ms benchmark (vs 230ms human-to-human)
- **Full-duplex foundations** - Listen and speak concurrently, handle overlapping speech gracefully
- **Intelligent barge-in classification** (backchannel, soft_barge, hard_barge) with **classifier wired to T/T handler**
- **Semantic VAD** - Understand intent behind interruptions, not just acoustic activity
- **Transition-Relevant Point (TRP) detection** - Predict turn changes before they happen
- **Hybrid VAD fusion algorithm** - Combine frontend Silero + backend Deepgram with weighted voting
- **Emotional awareness** - Detect user frustration/urgency to adjust response timing
- **Active backchanneling** - Natural cues ("uh-huh", "got it") during processing
- **Transcript-audio sync** - Clean text truncation on interruption (word-accurate)
- **Prosody-aware turn-taking** with **continuation detector results actively used**
- **Network-adaptive behavior** with mobile/low-power presets
- **Manual override controls** - Mute and force-reply buttons for imperfect environments
- **AEC feedback loop** for smarter echo cancellation during barge-in
- **Comprehensive observability** with tightened SLOs (P95 mute <50ms, misfire <2%)

**v5 Production Hardening:**

- **Speculative TTS (PredGen)** - Generate candidate responses while user speaks for near-zero latency
- **End-of-Utterance (EOU) transformer** - Semantic turn completion prediction, dynamic silence timeout
- **WebRTC native AEC** - Leverage browser-native echo cancellation via ElevenLabs WebRTC endpoint
- **Device-specific presets** - Pre-configured thresholds for AirPods, USB mics, speakerphones, etc.
- **Canary deployment** - Structured rollout (1% → 10% → 50% → 100%) with automatic rollback
- **Error budgets** - Monthly quotas for misfires, queue overflows, latency violations
- **Privacy opt-in flow** - Consent-based feature gating for emotion/semantic detection
- **Master kill switch** - `backend.voice_barge_in_killswitch` for instant rollback to legacy behavior

---

## Goals

### Primary Goals (User-Facing)

1. **Sub-200ms perceived response latency** - Target Moshi-level latency (200ms) approaching human-to-human (230ms); users perceive as instantaneous
2. **Immediate audio stop on barge-in** - Playback mutes within 50ms of speech detection (P95)
3. **No lost speech tokens** - Microphone starts streaming before TTS fade completes
4. **Intelligent interruption handling** - Distinguish backchannels ("uh huh") from true interruptions with >90% accuracy
5. **Graceful false-positive recovery** - Resume playback if barge-in was triggered by echo/noise (<2% misfire rate)
6. **Natural conversation rhythm** - Active backchanneling during processing ("got it", "one moment")
7. **Clean transcript truncation** - Word-accurate text cutoff when audio is interrupted (no dangling partial words)

### Secondary Goals (Technical)

8. **Full-duplex foundations** - Process user and AI speech streams concurrently; handle natural overlaps
9. **Semantic VAD** - Go beyond acoustic detection to understand intent (question, command, backchannel)
10. **Emotional awareness** - Detect frustration/urgency via tone; adjust response priority
11. **Transition-Relevant Point (TRP) detection** - Predict turn changes using tone, pauses, and sentence completion
12. **Hybrid VAD fusion** - Weighted combination of frontend Silero + backend Deepgram with staleness detection
13. **Prosody-aware turn-taking** - Use pitch, duration, and trailing patterns with continuation detector actively adjusting silence thresholds
14. **Network resilience** - Adaptive buffering and quality adjustment with mobile/low-power presets
15. **Multilingual support** - Backchannel detection in 12 languages
16. **User personalization** - Learn individual speech patterns over sessions
17. **Safe fallback** - Predictable behavior if one VAD source is missing or stale
18. **Accessibility** - Full keyboard control, screen reader support, visual alternatives to audio cues

---

## December 2025 Revisions (v4 - Full-Duplex & Advanced Naturalness)

### Full-Duplex Foundations

**Concept**: Move from strict turn-taking to concurrent speech processing, inspired by Kyutai's Moshi (200ms latency).

**Multi-Stream Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    AUDIO STREAMS                             │
├─────────────────────────────────────────────────────────────┤
│  User Stream ──────┐                                        │
│                    ├──▶ Joint Processor ──▶ Decision Engine │
│  AI Stream ────────┘    (overlap detection)   (who speaks?) │
│                                                              │
│  States: USER_ONLY | AI_ONLY | OVERLAP | SILENCE            │
└─────────────────────────────────────────────────────────────┘
```

**Overlap Handling Strategies:**

1. **Backchannel overlap** - User says "uh huh" during AI speech → AI continues (don't stop)
2. **Question overlap** - User starts question during AI → Soft pause, prioritize user
3. **Correction overlap** - User says "no, wait" → Hard stop, process correction
4. **Accidental overlap** - User starts speaking at same time as AI → First speaker priority with 100ms grace

**Implementation:**

- Add `OverlapDetector` service that monitors both streams concurrently
- Classify overlap type using first 200ms of overlapping audio
- Emit `overlap.detected` event with classification
- Feature flag: `backend.voice_full_duplex_overlap` (default: FALSE)

### Semantic VAD (Intent-Aware Detection)

**Concept**: Beyond acoustic "is someone speaking?", understand "what are they trying to do?"

**Semantic Categories:**
| Category | Examples | Action |
|----------|----------|--------|
| `backchannel` | "uh huh", "yeah", "mmm" | Continue AI, no interruption |
| `question` | "what?", "how?", rising intonation | Soft pause, process question |
| `command` | "stop", "wait", "hold on" | Hard stop immediately |
| `correction` | "no", "actually", "I meant" | Hard stop, add context |
| `continuation` | "and", "also", "but" | Extend listening window |
| `affirmation` | "yes", "correct", "exactly" | Continue AI, acknowledge |

**Implementation:**

- Lightweight classifier on first 300ms of speech + transcript
- Run in parallel with acoustic VAD (doesn't add latency)
- Use Deepgram's interim transcripts for real-time classification
- Feature flag: `backend.voice_semantic_vad` (default: FALSE)

### Emotional Awareness

**Concept**: Detect user emotional state to adjust conversation dynamics.

**Detectable States:**
| State | Indicators | Response Adjustment |
|-------|------------|---------------------|
| `frustrated` | Raised voice, short utterances, repeated questions | Faster response, apologetic tone |
| `confused` | Hesitation, "um", question intonation | Slower, clearer response |
| `urgent` | Fast speech, interruptions | Prioritize, skip pleasantries |
| `relaxed` | Normal pace, full sentences | Standard pacing |
| `disengaged` | Long pauses, short responses | Engage with question |

**Implementation:**

- Use Hume AI integration (already exists: `emotion_detection_service.py`)
- Feed emotion state to Thinker for response adaptation
- Adjust barge-in sensitivity: frustrated users get faster response
- Feature flag: `backend.voice_emotional_awareness` (default: FALSE)

### Transcript-Audio Synchronization

**Problem**: When user interrupts, we need to truncate the transcript at the exact word where audio stopped. Currently, OpenAI Realtime API also struggles with this.

**Solution: Word-Level Timestamps**

```json
// Audio chunk with word alignment
{
  "type": "audio.chunk",
  "chunk_index": 5,
  "start_offset_ms": 1250,
  "end_offset_ms": 1500,
  "words": [
    { "word": "The", "start_ms": 1250, "end_ms": 1300 },
    { "word": "answer", "start_ms": 1300, "end_ms": 1450 },
    { "word": "is", "start_ms": 1450, "end_ms": 1500 }
  ]
}
```

**On Barge-In:**

1. Record `interrupted_at_ms` (playback position when muted)
2. Find last complete word before `interrupted_at_ms`
3. Truncate transcript at that word boundary
4. Mark remaining text as `[interrupted]` in conversation history
5. Send `transcript.truncated` event with clean text

**Implementation:**

- ElevenLabs provides word timestamps via `alignment` parameter
- Store word boundaries in `useTTAudioPlayback`
- On barge-in: calculate truncation point, emit event
- Feature flag: `backend.voice_word_timestamps` (default: FALSE)

### Manual Override Controls (Mute & Force-Reply)

**Rationale**: Per OpenAI Realtime API recommendations, VAD is imperfect in noisy environments. Always provide manual controls.

**UI Controls:**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  [🎤 Mute]  [▶️ Force Reply]  [⏹️ Stop AI]          │
│                                                     │
│  Keyboard: M = Mute, Space = Force Reply, Esc = Stop│
└─────────────────────────────────────────────────────┘
```

**Behaviors:**

- **Mute**: Disable mic, VAD pauses, AI continues speaking
- **Force Reply**: Immediately end user turn, trigger AI response (useful when VAD misses turn end)
- **Stop AI**: Immediately stop AI speech, return to listening

**Implementation:**

- Add buttons to `VoiceModePanel.tsx`
- Add keyboard shortcuts with `useHotkeys`
- Emit `manual_control.used` metric to track adoption
- Feature flag: `backend.voice_manual_controls` (default: TRUE)

### Conversation Context Preservation

**Problem**: On hard barge-in, what happens to the AI's interrupted response?

**Strategy:**

```
User: "What's the capital of France?"
AI: "The capital of France is Par—" [interrupted]
User: "Actually, what about Germany?"
AI: "The capital of Germany is Berlin. [Regarding your earlier question, the capital of France is Paris.]"
```

**Implementation:**

- Store interrupted response in `_interrupted_context`
- Include `interrupted_response_summary` in next LLM prompt
- Allow LLM to naturally reference unfinished thought if relevant
- Clear context after 2 successful turns
- Feature flag: `backend.voice_context_preservation` (default: TRUE)

### Accessibility Considerations

**Requirements:**

1. **Keyboard navigation**: All controls accessible via Tab, Enter, Space
2. **Screen reader**: ARIA labels for all voice states ("AI is speaking", "Listening for speech")
3. **Visual alternatives**: Text transcripts always visible, visual waveform for audio activity
4. **Reduced motion**: Disable animations if `prefers-reduced-motion` is set
5. **High contrast**: Ensure state indicators visible in high contrast mode

**Implementation:**

- Add `aria-live="polite"` regions for state changes
- Add `role="status"` to voice mode panel
- Add keyboard shortcuts with visible hints
- Test with VoiceOver, NVDA, JAWS

### Browser Compatibility Matrix

| Browser          | Audio Worklet | Silero VAD | WebRTC AEC | Status                      |
| ---------------- | ------------- | ---------- | ---------- | --------------------------- |
| Chrome 90+       | ✅            | ✅         | ✅         | Full support                |
| Firefox 76+      | ✅            | ✅         | ✅         | Full support                |
| Safari 14.1+     | ✅            | ✅         | ⚠️ Limited | Fallback to threshold boost |
| Edge 90+         | ✅            | ✅         | ✅         | Full support                |
| Chrome Android   | ✅            | ✅         | ⚠️ Varies  | Device-dependent            |
| Safari iOS 14.5+ | ⚠️            | ⚠️         | ❌         | ScriptProcessor fallback    |
| Firefox Android  | ✅            | ✅         | ⚠️ Varies  | Device-dependent            |

**Fallback Strategy:**

- If AudioWorklet unavailable → ScriptProcessor with reduced frame rate
- If Silero VAD fails → RMS threshold detection
- If WebRTC AEC unavailable → Increased playback threshold boost (0.3 instead of 0.2)

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

### Delivery Priorities, Safety, and Compatibility

- **MVP first, stretch later:** Ship (1) hybrid VAD fusion + 500ms rollback, (2) queue/scheduling guardrails, (3) clean transcript truncation, (4) manual overrides. Treat semantic VAD, emotional awareness, TRP detection, full-duplex overlap, and active backchanneling as stretch behind flags until validated.
- **Kill switches:** One master `backend.voice_barge_in_killswitch` plus per-feature flags (semantic, emotional, TRP, backchanneling) to instantly revert to the current barge-in path.
- **Consent & privacy:** Emotion/semantic classification must never log raw audio or PII; only derived labels/metrics. Disable emotion detection if the user has not opted in; tag events with `privacy_opt_out` when applicable.
- **Device/browser compatibility:** Detect lack of `AudioWorklet`/`SharedArrayBuffer` (Safari/Firefox/mobile) and fall back to low-power mode with Deepgram-first barge-in. Skip AEC feedback polling when WebRTC stats are unavailable.
- **Acoustic robustness:** Maintain per-device presets (laptop mic, AirPods, wired headset) with default thresholds; expose a quick selector in voice settings.
- **A/B + ramp plan:** Default new classifiers off; run 10% → 50% → 100% experiments with guardrail alerts (misfire >5%, mute latency P95 >100ms, queue overflows >2%). Roll back automatically on alert breach.
- **Data minimization:** Sample VAD/confidence events (e.g., 10%) in production; redact transcripts/user IDs from structured events; clamp metric cardinality.

### Naturalness, Fallbacks, and Safety Optimizations

- **Perceived latency measurement:** Capture t0 (user speech start), t1 (barge-in mute), t2 (first token), t3 (first audio chunk played) to compute perceived latency client-side and stream to metrics for P50/P95 tracking.
- **Audio worklet fallback:** If `AudioWorklet` or `SharedArrayBuffer` is unavailable, fall back to a light ScriptProcessor VAD path with reduced frame rate and disable prosody extraction; log `vad_fallback_used`.
- **Double-barge guard:** Suppress duplicate barge-in triggers within 500ms (aligned with debounce timer); coalesce multiple VAD triggers into one barge event.
- **User personalization store:** Persist per-user noise floor and preferred thresholds (bounded by feature flag min/max) to avoid re-calibration every session; expose reset in settings.
- **Safety/PII:** Redact transcripts and user identifiers from telemetry events; sample VAD events (e.g., 10%) in production to reduce volume.
- **Cross-language tuning:** Maintain per-language backchannel lists and soft-barge keywords; include language tag in barge-in classification to avoid English bias.
- **Low-resource devices:** Auto-disable prosody extraction and reduce Silero frame rate on devices with `hardwareConcurrency <= 2` or high CPU usage, and fall back to Deepgram-only barge-in if CPU spikes persist.

---

## December 2025 Revisions (v5 - Production Hardening & Advanced Techniques)

### Speculative TTS (PredGen-Inspired)

**Concept:** Generate candidate TTS responses while user is still speaking to achieve near-zero perceived latency.

**Research Background:** PredGen (2025) demonstrates 2x latency reduction by speculatively decoding LLM responses during user input time.

**Implementation:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPECULATIVE TTS PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│  User Speaking ──▶ Partial Transcript ──▶ Intent Prediction     │
│                              │                                   │
│                              ▼                                   │
│                    Speculative LLM Call                          │
│                    (top-3 likely responses)                      │
│                              │                                   │
│                              ▼                                   │
│                    Pre-generate TTS (first sentence only)        │
│                              │                                   │
│  User Finishes ──▶ Match speculation? ──▶ Yes: Play immediately  │
│                              │                                   │
│                              └──▶ No: Discard, generate fresh    │
└─────────────────────────────────────────────────────────────────┘
```

**Speculation Triggers:**

| Trigger          | Example                    | Speculation Strategy                    |
| ---------------- | -------------------------- | --------------------------------------- |
| Greeting pattern | "Hi", "Hello"              | Pre-generate greeting response          |
| Question word    | "What", "How", "Why"       | Pre-fetch relevant context              |
| Command pattern  | "Tell me about", "Explain" | Start knowledge retrieval               |
| Confirmation     | "Yes", "Correct", "Okay"   | Pre-generate acknowledgment + next step |

**Resource Management:**

- Maximum 3 speculative candidates in flight
- Discard oldest speculation on new intent detection
- GPU memory cap: 512MB for speculative TTS buffers
- Feature flag: `backend.voice_speculative_tts` (default: FALSE)

### End-of-Utterance (EOU) Transformer Model

**Concept:** Use semantic content to predict turn completion, not just silence duration.

**Research Background:** LiveKit's 135M parameter SmolLM v2-based EOU model predicts end of speech using content analysis, reducing cut-ins and sluggish responses.

**Dynamic Silence Timeout:**

```python
def calculate_silence_timeout(transcript: str, eou_confidence: float) -> int:
    """
    Adjust silence timeout based on semantic completion prediction.

    Returns timeout in milliseconds.
    """
    base_timeout = 500  # Default 500ms

    # High confidence user is done → shorter timeout
    if eou_confidence > 0.85:
        return max(200, base_timeout - 200)  # 300ms minimum

    # Mid-sentence indicators → extend timeout
    if eou_confidence < 0.3:
        return min(1500, base_timeout + 500)  # 1000ms, max 1.5s

    # Trailing indicators extend further
    trailing_words = ["um", "uh", "so", "and", "but", "like"]
    if transcript.strip().split()[-1].lower() in trailing_words:
        return min(1800, base_timeout + 800)  # 1300ms, max 1.8s

    return base_timeout
```

**EOU Model Integration:**

- Deploy lightweight transformer (135M params) as sidecar or within backend
- Feed Deepgram interim transcripts to EOU model every 100ms
- EOU returns `eou_confidence: 0.0-1.0`
- Combine with TRP detection for best accuracy
- Feature flag: `backend.voice_eou_model` (default: FALSE)

**Comparison to Current Approach:**

| Approach              | Cut-in Rate | Sluggish Rate | Latency            |
| --------------------- | ----------- | ------------- | ------------------ |
| Fixed 500ms timeout   | 15%         | 10%           | 500ms              |
| VAD-only              | 20%         | 5%            | 300ms              |
| EOU + dynamic timeout | 5%          | 3%            | 200-600ms adaptive |

### WebRTC Native AEC Integration

**Concept:** Leverage ElevenLabs WebRTC endpoint for browser-native echo cancellation.

**Background:** ElevenLabs now supports WebRTC with best-in-class AEC and background noise removal built-in.

**Architecture Change:**

```
Current:  Browser → WebSocket → Backend → ElevenLabs → WebSocket → Browser
                     (manual AEC)

Proposed: Browser → WebRTC → ElevenLabs (native AEC) → WebRTC → Browser
                     ↓
          Backend ← Signaling only (SDP exchange)
```

**Benefits:**

- Native browser AEC (Chrome, Firefox, Edge all implement adaptive AEC)
- Lower latency (direct peer connection vs WebSocket relay)
- Reduced backend load (audio doesn't traverse our servers)
- Better echo rejection during barge-in

**Hybrid Mode:**

- Use WebRTC for audio transport (best AEC)
- Use WebSocket for control messages (barge-in signals, transcripts)
- Fallback to full WebSocket if WebRTC connection fails

**Implementation:**

- Add `useWebRTCAudio` hook for RTC connection management
- Keep existing WebSocket for control plane
- Feature flag: `backend.voice_webrtc_audio` (default: FALSE)

### Device-Specific Audio Presets

**Concept:** Pre-configured thresholds for common audio hardware to avoid re-calibration.

**Preset Definitions:**

| Preset           | Noise Floor | VAD Threshold | Playback Boost | Echo Window | AEC Mode   |
| ---------------- | ----------- | ------------- | -------------- | ----------- | ---------- |
| `laptop_builtin` | -35 dB      | 0.55          | 0.25           | 100ms       | aggressive |
| `airpods_pro`    | -45 dB      | 0.45          | 0.15           | 50ms        | light      |
| `wired_headset`  | -50 dB      | 0.40          | 0.10           | 30ms        | minimal    |
| `usb_microphone` | -55 dB      | 0.35          | 0.10           | 40ms        | minimal    |
| `speakerphone`   | -25 dB      | 0.70          | 0.35           | 150ms       | aggressive |
| `mobile_builtin` | -30 dB      | 0.60          | 0.30           | 120ms       | aggressive |

**Auto-Detection:**

```typescript
async function detectAudioDevice(): Promise<DevicePreset> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInput = devices.find((d) => d.kind === "audioinput" && d.deviceId === "default");

  const label = audioInput?.label.toLowerCase() || "";

  if (label.includes("airpods")) return "airpods_pro";
  if (label.includes("usb") || label.includes("blue yeti")) return "usb_microphone";
  if (label.includes("headset") || label.includes("headphone")) return "wired_headset";
  if (label.includes("speakerphone") || label.includes("jabra")) return "speakerphone";
  if (/android|iphone|ipad/i.test(navigator.userAgent)) return "mobile_builtin";

  return "laptop_builtin"; // Default
}
```

**UI Selector:**

- Add dropdown in voice settings: "Audio Device Type"
- Options: Auto-detect, Laptop/Desktop, AirPods/Wireless Earbuds, Wired Headset, USB Microphone, Speakerphone
- Store preference in user settings, apply on session start
- Feature flag: `backend.voice_device_presets` (default: TRUE)

### Canary Deployment Strategy

**Concept:** Structured rollout with automatic rollback for voice-critical changes.

**Deployment Tiers:**

| Tier   | Traffic | Duration | Success Criteria                 |
| ------ | ------- | -------- | -------------------------------- |
| Canary | 1%      | 1 hour   | All metrics within 2x baseline   |
| Beta   | 10%     | 24 hours | All metrics within 1.5x baseline |
| Staged | 50%     | 48 hours | All metrics within 1.2x baseline |
| GA     | 100%    | -        | Metrics match or beat baseline   |

**Automatic Rollback Triggers:**

```yaml
rollback_triggers:
  - metric: barge_in_mute_latency_p95
    threshold: ">100ms"
    window: 5m

  - metric: misfire_rate
    threshold: ">5%"
    window: 15m

  - metric: queue_overflow_rate
    threshold: ">2%"
    window: 10m

  - metric: error_rate
    threshold: ">1%"
    window: 5m

  - metric: websocket_disconnect_rate
    threshold: ">0.5%"
    window: 5m
```

**Active Session Handling:**

When kill switch activated or rollback triggered:

1. **New sessions:** Route to stable version immediately
2. **Active sessions:** Complete current turn, then gracefully migrate
3. **Grace period:** 30 seconds for in-flight audio to complete
4. **Fallback behavior:** Revert to simple VAD (no classification) if classifier fails

**Implementation:**

- Use feature flag percentage (`backend.voice_barge_in_v5_percentage: 0-100`)
- Argo Rollouts for Kubernetes orchestration
- Prometheus alerts → webhook → Argo rollback
- Feature flag: `backend.voice_canary_enabled` (default: TRUE in staging, FALSE in prod)

### Error Budget Concept

**Concept:** Define acceptable error rates to balance reliability with velocity.

**Monthly Error Budgets:**

| Metric                 | Budget (monthly) | Calculation                            |
| ---------------------- | ---------------- | -------------------------------------- |
| Barge-in misfires      | 2% of turns      | `misfire_count / total_turns`          |
| Queue overflows        | 0.5% of sessions | `overflow_sessions / total_sessions`   |
| P95 latency violations | 5% of responses  | `slow_responses / total_responses`     |
| WebSocket disconnects  | 0.1% of sessions | `disconnect_sessions / total_sessions` |

**Budget Consumption Alerts:**

```yaml
alerts:
  - name: error_budget_50_percent
    condition: "budget_consumed > 50%"
    action: "Notify team, pause non-critical deploys"

  - name: error_budget_80_percent
    condition: "budget_consumed > 80%"
    action: "Halt all deploys, investigate"

  - name: error_budget_exhausted
    condition: "budget_consumed >= 100%"
    action: "Auto-rollback to last known good, page on-call"
```

**Burn Rate Calculation:**

```python
def calculate_burn_rate(current_errors: int, budget: int, elapsed_hours: int) -> float:
    """
    Calculate error budget burn rate.

    burn_rate = 1.0 means consuming budget at exactly sustainable pace
    burn_rate > 1.0 means burning faster than sustainable
    """
    hours_in_month = 720
    expected_errors_by_now = (budget * elapsed_hours) / hours_in_month

    if expected_errors_by_now == 0:
        return float('inf') if current_errors > 0 else 0.0

    return current_errors / expected_errors_by_now
```

### Privacy Opt-In Flow

**Concept:** Clear user consent for emotion detection and semantic analysis features.

**Consent Levels:**

| Level           | Features Enabled                | Data Collected             |
| --------------- | ------------------------------- | -------------------------- |
| Basic (default) | VAD, barge-in, transcript       | Aggregated metrics only    |
| Enhanced        | + Emotion detection             | Emotion labels (no audio)  |
| Full            | + Semantic VAD, personalization | Intent labels, preferences |

**Opt-In UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🎤 Voice Mode Settings                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Voice Analysis Level:                                           │
│                                                                  │
│  ○ Basic                                                         │
│    Standard voice detection and transcription                    │
│                                                                  │
│  ○ Enhanced                                                      │
│    + Emotion-aware responses (detects frustration, urgency)      │
│    ℹ️ No audio stored, only emotion labels                       │
│                                                                  │
│  ○ Full                                                          │
│    + Personalized voice patterns (learns your speech style)      │
│    ℹ️ Preferences stored locally, synced encrypted               │
│                                                                  │
│  [Learn more about voice data privacy]                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Backend Enforcement:**

```python
def get_enabled_features(user_consent_level: str) -> dict:
    features = {
        "vad": True,
        "barge_in": True,
        "transcript": True,
        "emotion_detection": False,
        "semantic_vad": False,
        "personalization": False,
    }

    if user_consent_level in ["enhanced", "full"]:
        features["emotion_detection"] = True

    if user_consent_level == "full":
        features["semantic_vad"] = True
        features["personalization"] = True

    return features
```

**Telemetry Redaction:**

- All events include `consent_level` field
- Events for non-consented features are dropped at collection
- Transcript redaction: Replace actual text with `[REDACTED]` in telemetry
- Feature flag: `backend.voice_privacy_enforcement` (default: TRUE)

### Updated Browser Compatibility Matrix

| Browser          | Audio Worklet | SharedArrayBuffer | Silero VAD | WebRTC AEC | WebRTC Audio | Status                        |
| ---------------- | ------------- | ----------------- | ---------- | ---------- | ------------ | ----------------------------- |
| Chrome 90+       | ✅            | ✅                | ✅         | ✅         | ✅           | Full support                  |
| Firefox 79+      | ✅            | ✅ (COOP/COEP)    | ✅         | ✅         | ✅           | Full support                  |
| Safari 15.2+     | ✅            | ✅ (COOP/COEP)    | ✅         | ⚠️ Limited | ⚠️ Limited   | Threshold boost fallback      |
| Edge 90+         | ✅            | ✅                | ✅         | ✅         | ✅           | Full support                  |
| Chrome Android   | ✅            | ✅                | ✅         | ⚠️ Varies  | ✅           | Device-dependent              |
| Safari iOS 15.4+ | ⚠️            | ⚠️                | ⚠️         | ❌         | ❌           | ScriptProcessor + WS fallback |
| Firefox Android  | ✅            | ⚠️                | ✅         | ⚠️ Varies  | ⚠️ Varies    | Device-dependent              |

**Required Headers for SharedArrayBuffer:**

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Fallback Chain:**

1. Full: AudioWorklet + SharedArrayBuffer + WebRTC
2. Reduced: AudioWorklet + WebSocket audio
3. Legacy: ScriptProcessor + WebSocket audio + Deepgram-only VAD

### Expanded Testing Matrix

**Kill Switch Tests:**

```typescript
describe("Kill Switch Behavior", () => {
  it("should route new sessions to stable on killswitch activation");
  it("should complete active turn before migrating session");
  it("should respect 30-second grace period for in-flight audio");
  it("should revert to simple VAD when classifier fails");
  it("should log killswitch activation with reason");
});
```

**Device Preset Tests:**

```typescript
describe("Device Presets", () => {
  it("should auto-detect AirPods and apply preset");
  it("should persist user override across sessions");
  it("should apply correct thresholds for each preset");
  it("should fallback to laptop_builtin for unknown devices");
});
```

**Privacy Redaction Tests:**

```python
class TestPrivacyRedaction:
    def test_redact_transcript_in_telemetry(self):
        # Assert actual words replaced with [REDACTED]

    def test_drop_emotion_events_without_consent(self):
        # Assert events filtered at collection

    def test_consent_level_included_in_all_events(self):
        # Assert consent_level field present
```

**Canary Rollback Tests:**

```typescript
describe("Canary Rollback", () => {
  it("should trigger rollback when p95 latency exceeds 100ms for 5min");
  it("should trigger rollback when misfire rate exceeds 5% for 15min");
  it("should preserve active sessions during rollback");
  it("should log rollback reason and metrics snapshot");
});
```

**EOU Model Tests:**

```python
class TestEOUModel:
    def test_extend_timeout_for_trailing_words(self):
        # "I was thinking about, um..." → 1300ms timeout

    def test_shorten_timeout_for_complete_sentence(self):
        # "What time is it?" → 300ms timeout

    def test_default_timeout_for_ambiguous(self):
        # "The weather is" → 500ms timeout
```

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

- `backend.voice_barge_in_killswitch` (default: FALSE) - **MASTER KILL SWITCH** - Instantly revert to legacy barge-in
- `backend.voice_backchanneling_enabled` (default: FALSE → ramp to TRUE)
- `backend.voice_trp_detection` (default: FALSE)
- `backend.voice_mobile_low_power_preset` (default: FALSE, auto-enable on mobile)
- `backend.voice_hybrid_vad_fusion` (default: FALSE → TRUE after testing)
- `backend.voice_barge_in_classifier_enabled` (default: FALSE → TRUE)
- `backend.voice_full_duplex_overlap` (default: FALSE) - Multi-stream overlap detection
- `backend.voice_semantic_vad` (default: FALSE) - Intent-aware VAD classification
- `backend.voice_emotional_awareness` (default: FALSE) - Emotion-based response adjustment
- `backend.voice_word_timestamps` (default: FALSE) - Word-level audio alignment
- `backend.voice_manual_controls` (default: TRUE) - Mute/Force Reply/Stop buttons
- `backend.voice_context_preservation` (default: TRUE) - Store interrupted responses

**v5 Flags (Production Hardening):**

- `backend.voice_speculative_tts` (default: FALSE) - PredGen-inspired speculative generation
- `backend.voice_eou_model` (default: FALSE) - End-of-Utterance transformer model
- `backend.voice_webrtc_audio` (default: FALSE) - WebRTC native AEC transport
- `backend.voice_device_presets` (default: TRUE) - Device-specific threshold presets
- `backend.voice_canary_enabled` (default: FALSE) - Canary deployment with auto-rollback
- `backend.voice_barge_in_v5_percentage` (default: 0) - Percentage traffic for v5 features (0-100)
- `backend.voice_privacy_enforcement` (default: TRUE) - Enforce consent-based feature gating

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
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Browser)                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐    ┌──────────────────────┐    ┌───────────────────────┐  │
│  │  useSileroVAD   │───▶│ useIntelligentBargeIn│───▶│ useTTAudioPlayback    │  │
│  │ (Neural VAD)    │    │ (Classification FSM) │    │ (Queue + Word Sync)   │  │
│  └────────┬────────┘    └──────────┬───────────┘    └─────────┬─────────────┘  │
│           │                        │                          │                 │
│           │ VAD confidence         │ barge-in type            │ fade/stop +     │
│           │                        │                          │ truncation point│
│           ▼                        ▼                          ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │              useThinkerTalkerVoiceMode (Orchestrator)                   │   │
│  │  - State machine: listening → speaking → barge_in → classifying        │   │
│  │  - Coordinates VAD, playback, WebSocket transport                       │   │
│  │  - Manual controls: Mute, Force Reply, Stop AI                          │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    │                                            │
│                                    │ WebSocket messages (vad.state, barge_in)   │
└────────────────────────────────────┼────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐   ┌────────────────────┐   ┌─────────────────────────────┐ │
│  │ Deepgram STT   │──▶│ HybridVADDecider   │──▶│ ThinkerTalkerHandler       │ │
│  │(SpeechStarted) │   │ (Fusion Algorithm) │   │ (WebSocket Protocol)       │ │
│  └────────────────┘   └────────────────────┘   └───────────┬─────────────────┘ │
│                              │                             │                    │
│  ┌────────────────┐          │                             │                    │
│  │ SemanticVAD    │◀─────────┘                             │                    │
│  │ (Intent Class) │                                        │                    │
│  └────────────────┘                                        │                    │
│                                                            │                    │
│  ┌────────────────┐   ┌────────────────────┐              │                    │
│  │ UtteranceAggr. │──▶│ BargeInClassifier  │◀─────────────┘                    │
│  │ (Multi-segment)│   │ (Backchannel/Soft) │                                   │
│  └────────────────┘   └────────────────────┘                                   │
│                              │                                                  │
│  ┌────────────────┐          │                                                  │
│  │ TRPDetector    │◀─────────┘                                                  │
│  │ (Turn Predict) │                                                             │
│  └────────────────┘                                                             │
│                                                                                  │
│  ┌────────────────┐   ┌────────────────────┐   ┌───────────────────────────┐   │
│  │ Continuation   │──▶│ EmotionDetector    │──▶│ OverlapDetector           │   │
│  │ Detector       │   │ (Hume AI)          │   │ (Full-Duplex)             │   │
│  └────────────────┘   └────────────────────┘   └───────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
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
| **Perceived response latency (P95)** | <200ms                 | >300ms          | TBD     |
| **Barge-in mute latency (P95)**      | <50ms                  | >100ms          | TBD     |
| **Barge-in mute latency (P99)**      | <100ms                 | >200ms          | TBD     |
| **Misfire rate (false barge-ins)**   | <2%                    | >5%             | TBD     |
| **Backchannel detection accuracy**   | >90%                   | <80%            | TBD     |
| **Echo-triggered false VAD**         | <1%                    | >3%             | TBD     |
| **Queue overflow resets**            | <0.5% of turns         | >2%             | TBD     |
| **VAD disagreement resolution**      | <200ms                 | >500ms          | TBD     |
| **User interruption success rate**   | >95%                   | <90%            | TBD     |
| **Backchannel trigger rate**         | 20-40% of long queries | <10% or >60%    | TBD     |

**Latency Budget Breakdown (Target: <200ms perceived, Moshi-inspired):**

| Stage                      | Target   | Notes                                    |
| -------------------------- | -------- | ---------------------------------------- |
| Speech onset detection     | 10-20ms  | Silero VAD local detection (optimized)   |
| Barge-in decision          | 10-30ms  | Hybrid VAD fusion (parallel processing)  |
| Audio mute                 | 30-50ms  | Fast fade (30ms) + suspend               |
| STT first token            | 80-100ms | Deepgram streaming (optimize connection) |
| Total to "listening" state | <200ms   | Approaching human-to-human (230ms)       |

**Comparison to Industry:**

| System                 | Response Latency | Notes                            |
| ---------------------- | ---------------- | -------------------------------- |
| Human-to-human         | ~230ms           | Natural conversation baseline    |
| Moshi (Kyutai)         | 160-200ms        | State-of-the-art full-duplex     |
| OpenAI Realtime        | 500-2000ms       | High variance, network-dependent |
| **VoiceAssist Target** | **<200ms**       | Matching Moshi benchmark         |

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
- [OpenAI Realtime API: The Missing Manual - Latent Space](https://www.latent.space/p/realtime-api) - VAD challenges, manual controls recommendation
- [How OpenAI handles Interruptions - Medium](https://medium.com/@alozie_igbokwe/building-an-ai-caller-with-openai-realtime-api-part-5-how-openai-handles-interruptions-9050a453d28e) - Interruption recovery patterns
- [Moshi: Full-Duplex Real-Time Dialogue - MarkTechPost](https://www.marktechpost.com/2024/09/18/kyutai-open-sources-moshi-a-breakthrough-full-duplex-real-time-dialogue-system-that-revolutionizes-human-like-conversations-with-unmatched-latency-and-speech-quality/) - 160ms latency benchmark
- [Full-Duplex-Bench - arXiv](https://arxiv.org/html/2503.04721v1) - Evaluation suite for turn-taking capabilities
- [Speech-Language Models Deep Dive - Hume AI](https://www.hume.ai/blog/speech-language-models-a-deeper-dive-into-voice-ai) - Emotional awareness in voice AI

### v5 Research Additions (December 2025)

- [PredGen: Accelerated LLM Inference via Speculation - arXiv](https://arxiv.org/abs/2506.15556) - 2x latency reduction through input-time speculation
- [Improving Turn Detection with Transformers - LiveKit](https://blog.livekit.io/using-a-transformer-to-improve-end-of-turn-detection/) - End-of-Utterance model, dynamic silence timeout
- [ElevenLabs Conversational AI WebRTC - ElevenLabs](https://elevenlabs.io/blog/conversational-ai-webrtc) - Native browser AEC for voice AI
- [Voice Bot GPT-4o Realtime Best Practices - Microsoft](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/voice-bot-gpt-4o-realtime-best-practices---a-learning-from-customer-journey/4373584) - Configurable VAD settings
- [Intelligent Turn Detection (Endpointing) - AssemblyAI](https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent) - Semantic endpointing, content-aware detection
- [Canary Rollback for AI Workflows - UIX Store](https://uixstore.com/minimizing-risk-in-cloud-deployments-canary-rollback-for-ai-driven-workflows/) - Auto-rollback strategies
- [TTS Benchmark 2025 - Smallest.ai](https://smallest.ai/blog/-tts-benchmark-2025-smallestai-vs-cartesia-report) - Sub-100ms TTS latency benchmarks
- [AI Assistant Turn-Taking Fixes - Speechmatics](https://www.speechmatics.com/company/articles-and-news/your-ai-assistant-keeps-cutting-you-off-im-fixing-that) - Cut-in prevention strategies
