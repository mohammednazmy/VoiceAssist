# Local Dev Voice Lab Checklist

Short, repeatable steps for testing Thinker/Talker voice mode, barge‑in, and playback behavior on a local developer machine.

This is meant for **local dev only** (laptops / workstations), not shared staging or production.

---

## 1. Prerequisites

- Docker + Docker Compose installed and running.
- Node.js + pnpm installed (matching the repo’s documented versions).
- Python 3.11+ installed for backend tests.

From the repo root (`VoiceAssist/`), the commands below assume:

- Backend/API: `services/api-gateway`
- Web app: `apps/web-app`
- Admin panel: `apps/admin-panel`

---

## 2. Bring Up the Local Stack

From the repo root:

```bash
# Start core services (Postgres, Redis, Qdrant, API, web/app containers)
docker compose up -d
```

Wait for containers to report `Healthy` (Postgres/Redis/Qdrant) and confirm the API:

- API docs: http://localhost:8000/docs

Optional (if you prefer dev servers instead of the dockerized frontend):

```bash
# In a separate terminal: web app dev
cd apps/web-app
pnpm dev

# In another terminal: admin panel dev
cd apps/admin-panel
pnpm dev
```

- Web app: http://localhost:5173
- Admin panel: http://localhost:5174/admin

---

## 3. Enable “Voice Lab” Settings Locally

These settings make local testing of barge‑in and playback more deterministic and responsive.

### 3.1 Browser LocalStorage Flags

In the browser console on `http://localhost:5173/chat` (per‑browser, per‑profile):

```js
localStorage.setItem("voiceassist-force-silero-vad", "true");
localStorage.setItem("voiceassist-force-instant-barge-in", "true");
```

These flags:

- Force Silero VAD even in automation‑like environments.
- Enable “instant barge‑in” paths so `fadeOut(30)` is used aggressively.

You can remove them with:

```js
localStorage.removeItem("voiceassist-force-silero-vad");
localStorage.removeItem("voiceassist-force-instant-barge-in");
```

### 3.2 Voice Feature Flags (Admin Panel)

Open the Admin panel: http://localhost:5174/admin → “Feature Flags” → enable the **Voice Flags** quick filter.

For local voice labs, use:

- `backend.voice_barge_in_quality_preset = "responsive"`
  - Dictation‑focused, highly responsive barge‑in.
- `backend.voice_aec_capability_tuning = true`
  - Hybrid VAD thresholds adapt to device AEC quality (better behavior on laptops vs headsets).
- `backend.voice_v4_audio_processing = true`
  - Enables server‑side echo cancellation / AGC / noise suppression.
- `backend.voice_hybrid_vad_signal_freshness_ms = 300`
  - Reasonable default for local networks; adjust in [200, 500] ms for experiments.

Optional (helpful for debugging):

- `backend.voice_silero_vad_confidence_sharing = true`
- `backend.voice_hybrid_vad_fusion = true`

These are visible in the Feature Flags page using the “Voice Flags” filter, with tips inline.

---

## 4. Run Fast Local Test Slices

These test slices give a quick signal that voice mode, barge‑in, and state management are healthy.

### 4.1 Backend Voice Tests

From the repo root:

```bash
python3 -m pytest services/api-gateway/tests/voice -q
```

This covers:

- `HybridVADDecider` (hybrid Deepgram + Silero VAD).
- AEC‑aware tuning and quality presets.
- Frontend `vad.state` → pipeline wiring and misfire rollback.

### 4.2 Frontend Voice Tests (Web App)

From `apps/web-app`:

```bash
pnpm vitest run \
  src/hooks/__tests__/useTTAudioPlayback.test.ts \
  src/hooks/__tests__/useThinkerTalkerSession-recovery.test.ts \
  src/stores/__tests__/unifiedConversationStore.test.ts \
  --reporter=basic
```

These cover:

- `useTTAudioPlayback`: queueing, fadeOut/stop behavior, barge‑in cleanup.
- `useThinkerTalkerSession`: recovery snapshots + pipeline_state handling.
- `useUnifiedConversationStore`: voice state invariants and connection guards.

Optional E2E (when `LIVE_REALTIME_E2E=1` and local API is reachable):

```bash
pnpm test:e2e
```

Focus on:

- `e2e/voice/voice-barge-in-instant.spec.ts`
- `e2e/voice/voice-barge-in-realistic.spec.ts`
- `e2e/voice/voice-scenarios.spec.ts`

---

## 5. Manual Voice Mode Smoke Test

On `http://localhost:5173/chat`:

1. Open the voice mode panel and grant microphone permission.
2. Speak a short prompt and wait until the AI is clearly speaking back.
3. While the AI is speaking, start talking over it:
   - The AI audio should mute almost immediately (<100 ms), and the UI should reflect “Listening…” or similar.
4. Try a brief noise (keyboard tap, throat clear):
   - AI **should not** barge‑in for most small noises.

Useful console signals:

- `[TTVoiceMode] Backend VAD barge-in: user speaking while AI playing`
- `[TTVoiceMode] Local VAD barge-in: user speaking while AI playing`
- `[TTAudioPlayback] Barge-in audio stopped in …ms`

---

## 6. Optional: Local Observability Check

If Grafana/Loki are running locally (via docker compose or your dev stack):

- Open Grafana: usually http://localhost:3000
- Voice dashboards:
  - **voice-barge-in**: hybrid decision breakdown, misfire counts.
  - **voice-vad-personalization**: personalized thresholds and misfire correlation.

Watch for:

- Reasonable barge‑in latency distributions.
- Low “no_transcript” misfires in local dev.

---

## 7. When to Promote Changes Beyond Local Dev

Before moving a change to shared staging:

- Backend voice tests pass (`services/api-gateway/tests/voice`).
- Frontend voice tests pass (`useTTAudioPlayback`, session recovery, unified store).
- Local manual smoke tests show:
  - Instant barge‑in (AI never “talks over” you).
  - No obvious echo loops or runaway misfires on your primary local device.

Once those are green, repeat similar steps in staging with more realistic devices and environments.

