---
title: Voice VAD Personalization & Barge-In Analytics
slug: voice-vad-personalization-analytics
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, vad, silero, barge-in, analytics]
summary: Analytics and observability for Silero VAD personalization, barge-in misfires, and threshold tuning.
lastUpdated: "2025-12-11"
category: voice
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/services/voice_pipeline_service.py"
  - "services/api-gateway/app/services/thinker_talker_websocket_handler.py"
  - "apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts"
  - "apps/web-app/src/stores/voiceSettingsStore.ts"
  - "infrastructure/observability/grafana/dashboards/voice-barge-in.json"
  - "infrastructure/observability/grafana/dashboards/voice-vad-personalization.json"
ai_summary: >-
  Describes how VoiceAssist tracks Silero VAD personalization and barge-in
  quality using privacy-safe analytics. The frontend persists a calibrated
  personalizedVadThreshold, sends it to the Thinker/Talker pipeline via
  TTSessionConfig and VAD state messages, and the backend logs per-session
  barge-in counts, misfires, misfire rate, and recommended threshold actions.
  A Grafana dashboard backed by Loki log queries visualizes threshold
  distributions and misfire correlations to guide safe default tuning for
  future releases.
---

# Voice VAD Personalization & Barge-In Analytics

This document explains how Silero VAD personalization is wired end-to-end and
how we collect analytics to tune thresholds and misfire behavior over time.

The goal is to give ops and engineers a **privacy-safe** view of:

- How calibrated thresholds (`personalizedVadThreshold`) are distributed
- How barge-in **misfire rates** vary with those thresholds and with the
  per-session `vad_sensitivity` slider
- When the system recommends raising or lowering default thresholds

No raw audio, transcripts, or PHI are logged as part of this pipeline.

## 1. Frontend: Calibration & Settings

### 1.1 Calibration & Personalized Threshold

The web app stores calibration state in `voiceSettingsStore`:

- `vadCalibrated: boolean`
- `lastCalibrationDate: number | null`
- `personalizedVadThreshold: number | null` (0–1)
- `vadSensitivity: number` (0–100 slider)

Two flows can set `personalizedVadThreshold`:

1. **Silero noise calibration (quick, ambient-only)**  
   - Triggered automatically on first Thinker/Talker voice connection when
     Silero VAD is enabled and `vadCalibrated === false`.
   - `useThinkerTalkerVoiceMode` calls `sileroVAD.calibrateNoise()`.
   - On success, it stores:
     - `vadCalibrated = true`
     - `lastCalibrationDate = Date.now()`
     - `personalizedVadThreshold = vad.adaptiveThreshold`

2. **Guided calibration dialog (full personalization)**  
   - Launched from the **Recalibrate** button in `VoiceModeSettings`.
   - Uses `usePersonalization` and `CalibrationDialog` to run a guided flow
     (ambient + voice samples).
   - On completion, it updates the same store keys with the recommended
     VAD threshold for the user.

### 1.2 Sensitivity Slider Behavior

The **Voice Detection Sensitivity** slider is anchored to the calibrated
baseline when available:

- When `personalizedVadThreshold !== null`, the label shows  
  **“Voice Detection Sensitivity (personalized baseline)”**.
- `useThinkerTalkerVoiceMode` maps the slider (0–100) into:
  - An adjusted Silero `positiveThreshold` around the baseline
  - An adjusted `minSpeechMs` window
- This mapping is bounded to safe ranges so clinicians can make the system
  slightly more or less sensitive without breaking barge-in.

The same `vadSensitivity` value is also sent to the backend (see below) so
misfire analytics can be correlated with the user-facing slider.

## 2. Frontend → Backend: Session Config & VAD State

### 2.1 Session Initialization (TTSessionConfig / advanced_settings)

`useThinkerTalkerSession` now supports an `advancedSettings` payload that is
sent with the initial `session.init` WebSocket message:

```jsonc
{
  "type": "session.init",
  "protocol_version": "2.0",
  "conversation_id": "...",
  "voice_settings": {
    "voice_id": "...",
    "language": "en",
    "barge_in_enabled": true,
    "vad_sensitivity": 72
  },
  "advanced_settings": {
    "vad_sensitivity": 72,
    "personalized_vad_threshold": 0.47,
    "enable_behavior_learning": true
  }
}
```

On the backend:

- `advanced_settings.personalized_vad_threshold` → `TTSessionConfig.personalized_vad_threshold`
- `advanced_settings.vad_sensitivity` → `TTSessionConfig.vad_sensitivity`
- `advanced_settings.enable_behavior_learning` → `TTSessionConfig.enable_behavior_learning`

When the Thinker/Talker pipeline session is created, these fields are copied
into the `PipelineConfig`, including:

- `PipelineConfig.vad_sensitivity`
- `PipelineConfig.personalized_vad_threshold`

This allows the pipeline to **see the same personalization state** that the
frontend is using.

### 2.2 Streaming VAD State

During speech, `useSileroVAD` exposes a `getVADState()` helper and
`useThinkerTalkerVoiceMode` periodically sends VAD snapshots over the WebSocket
while the user is speaking:

- `silero_confidence`
- `is_speaking`
- `speech_duration_ms`
- `is_playback_active`
- `effective_threshold`
- `aec_quality`
- `personalized_threshold` (the same value as `personalizedVadThreshold`)

The backend consumes this via
`ThinkerTalkerWebSocketHandler._handle_vad_state()` and forwards it into the
hybrid VAD components for barge-in decisions. For analytics, the important
piece here is that the backend sees the **effective threshold and personalized
baseline** during real conversations.

## 3. Backend: Aggregated Session Analytics

### 3.1 Pipeline Metrics

`VoicePipelineSession` tracks per-session barge-in metrics in
`PipelineMetrics`:

- `barge_in_count` – how many barge-ins happened in the session
- `barge_in_misfires` – how many rollbacks occurred because no transcript
  arrived after a barge-in (echo/noise)

`barge_in_count` is incremented when a barge-in completes, and
`barge_in_misfires` is incremented in the misfire rollback path.

### 3.2 Session Stop Log (Loki-Friendly)

When a pipeline session stops, `VoicePipelineSession.stop()` emits a
single **aggregate log line** with the key analytics fields:

- `barge_in_count`
- `barge_in_misfires`
- `barge_in_misfire_rate`
- `personalized_vad_threshold` (rounded numeric or null)
- `vad_sensitivity` (0–100 int)
- `recommended_threshold_action`:
  - `"increase_threshold"` if misfire rate > 30% and at least 3 barge-ins
  - `"decrease_threshold"` if misfire rate < 5% and at least 3 barge-ins
  - `"none"` otherwise
 - `aec_quality` (excellent/good/fair/poor/unknown) – last AEC capability level seen
 - `voice_barge_in_quality_preset` (`responsive`/`balanced`/`smooth`) – server-side preset

Example (conceptual) log payload as seen in Loki:

```json
{
  "msg": "Voice pipeline stopped: 7f2c1e4a-...",
  "total_latency_ms": 8420,
  "audio_chunks": 132,
  "barge_in_count": 5,
  "barge_in_misfires": 1,
  "barge_in_misfire_rate": 0.2,
  "personalized_vad_threshold": 0.47,
  "vad_sensitivity": 72,
  "recommended_threshold_action": "none",
  "aec_quality": "good",
  "voice_barge_in_quality_preset": "responsive"
}
```

Because this log is **numeric-only** and does not include transcripts,
utterances, or patient identifiers, it is safe from a PHI perspective and
fits within our HIPAA logging posture.

## 4. Grafana / Loki Dashboard

A dedicated Grafana dashboard is provided at:

- `infrastructure/observability/grafana/dashboards/voice-vad-personalization.json`

This dashboard uses Loki as its data source (`datasource: "Loki"`) and
provides:

1. **Recent Personalization Events (logs panel)**  
   - Query (example):  
     `{job="voiceassist"} |= "Voice pipeline stopped" | json`
   - Lets you quickly inspect `personalized_vad_threshold`,
     `vad_sensitivity`, and `recommended_threshold_action` for recent
     sessions.

2. **Threshold Distribution (timeseries or bar gauge)**  
   - Query (example):  
     `sum(count_over_time({job="voiceassist"} |= "Voice pipeline stopped" | json [24h])) by (personalized_vad_threshold)`
   - Shows how many sessions used each calibrated threshold value.

3. **Misfire Recommendations (bar gauge)**  
   - Query (example):  
     `sum(count_over_time({job="voiceassist"} |= "Voice pipeline stopped" | json [24h])) by (recommended_threshold_action)`
   - Quickly surfaces how often the system would like thresholds increased
     or decreased across the fleet.

You can customize these queries based on your Loki label schema (for example,
filter by environment, cluster, or deployment).

## 5. Using Analytics to Tune Defaults

Recommended workflow for ops / engineering:

1. **Collect data for a few weeks** in the target environment (clinic, pilot
   site, etc.).
2. Use the dashboard to answer:
   - Where do most `personalized_vad_threshold` values cluster
     (e.g. 0.42–0.52)?
   - In which ranges is `recommended_threshold_action` frequently
     `"increase_threshold"` vs `"decrease_threshold"`?
3. Based on those findings:
   - Adjust the **default Silero thresholds** and `noiseAdaptationFactor`
     in `useSileroVAD`.
   - Adjust the **slider mapping ranges** in
     `useThinkerTalkerVoiceMode` (`userAdjustedSileroConfig`).
   - Optionally adjust backend `vad_sensitivity` defaults for specific
     device profiles or environments via feature flags.

Threshold changes should follow the normal rollout process:

- Start with internal/staging environments
- Use percentage-based flag rollouts where possible
- Monitor the personalization dashboard and the existing
  `voice-barge-in` dashboard for regression

## 6. Future Extensions (Optional)

The current design intentionally stops short of **automatic runtime tuning** of
defaults to keep behavior predictable in clinical environments. Potential
future extensions (behind a feature flag) include:

- Cohort-specific default thresholds (by device class or site)
- Automatic default nudging when misfire rates stay low/high for a sustained
  period
- Offline periodic jobs that compute recommended defaults from Loki logs and
  propose them as changes rather than applying automatically

Any such extensions should continue to respect HIPAA constraints and must be
observable, explainable, and reversible via normal ops workflows.

## 7. Feature Flag Presets: Dictation vs Conversation

The barge-in/Silero behavior can be switched between presets without code
changes using the existing string feature flag:

- `backend.voice_barge_in_quality_preset` with allowed values:
  - `"responsive"` – **dictation-optimized** (default)
  - `"balanced"` – conversational default
  - `"smooth"` – waits for more natural breaks

The frontend reads this flag via `apiClient.getFeatureFlag` and applies it as
follows in `useThinkerTalkerVoiceMode`:

- `"responsive"`:
  - Uses the dictation-optimized Silero configuration (lower thresholds,
    shorter min speech duration) as the base.
- `"balanced"`:
  - Raises `positiveThreshold` modestly and lengthens `minSpeechMs` /
    `playbackMinSpeechMs`, approximating the prior “balanced conversation”
    behavior.
- `"smooth"`:
  - Raises thresholds and durations further, making barge-in less aggressive
    and better suited for long-form explanations where interruptions should be
    rarer.

To switch an environment into dictation-first mode, set:

```text
backend.voice_barge_in_quality_preset = responsive
```

To revert to more conservative conversational behavior:

```text
backend.voice_barge_in_quality_preset = balanced
```

or for maximum smoothness:

```text
backend.voice_barge_in_quality_preset = smooth
```
