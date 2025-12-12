---
title: Voice Mode Pipeline
slug: voice/pipeline
summary: >-
  Unified Voice Mode pipeline architecture, data flow, barge-in, audio playback,
  metrics, offline fallback, and testing strategy.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-12"
audience:
  - human
  - agent
  - backend
  - frontend
  - ai-agents
tags:
  - voice
  - realtime
  - websocket
  - openai
  - api
  - barge-in
  - audio
  - offline
  - multilingual
category: voice
relatedServices:
  - api-gateway
  - web-app
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/api/voice.py"
  - "services/api-gateway/app/api/admin_voice.py"
  - "services/api-gateway/app/services/rag_service.py"
  - "services/api-gateway/app/api/advanced_search.py"
  - "services/api-gateway/app/api/kb.py"
  - "services/api-gateway/app/services/session_analytics_service.py"
  - "apps/web-app/src/components/voice/VoiceModePanel.tsx"
  - "apps/web-app/src/hooks/useRealtimeVoiceSession.ts"
  - "apps/web-app/src/components/admin/VoiceMetricsDashboard.tsx"
ai_summary: >-
  > Status: Production-ready > Last Updated: 2025-12-03 This document describes
  the unified Voice Mode pipeline architecture, data flow, metrics, and testing
  strategy. It serves as the canonical reference for developers working on
  real-time voice features. VoiceAssist supports two voice pipeline mo...
---

# Voice Mode Pipeline

> **Status**: Production-ready
> **Last Updated**: 2025-12-03

This document describes the unified Voice Mode pipeline architecture, data flow, metrics, and testing strategy. It serves as the canonical reference for developers working on real-time voice features, including PHI-conscious RAG behavior and enhanced document integration.

## Voice Pipeline Modes

VoiceAssist supports **two voice pipeline modes**:

| Mode                             | Description                    | Best For                                       |
| -------------------------------- | ------------------------------ | ---------------------------------------------- |
| **Thinker-Talker** (Recommended) | Local STT → LLM → TTS pipeline | Full tool support, unified context, custom TTS |
| **OpenAI Realtime** (Legacy)     | Direct OpenAI Realtime API     | Quick setup, minimal backend changes           |

### Thinker-Talker Pipeline (Primary)

The Thinker-Talker pipeline is the recommended approach, providing:

- **Unified conversation context** between voice and chat modes
- **Full tool/RAG support** in voice interactions
- **Custom TTS** via ElevenLabs with premium voices
- **Lower cost** per interaction

**Documentation:** [THINKER_TALKER_PIPELINE.md](THINKER_TALKER_PIPELINE.md)

```
[Audio] → [Deepgram STT] → [GPT-4o Thinker] → [ElevenLabs TTS] → [Audio Out]
              │                    │                    │
         Transcripts          Tool Calls           Audio Chunks
              │                    │                    │
              └───────── WebSocket Handler ──────────────┘
```

### OpenAI Realtime API (Legacy)

The original implementation using OpenAI's Realtime API directly. Still supported for backward compatibility.

### PHI-Conscious RAG for Voice (2025-12 Update)

VoiceAssist now supports **PHI-conscious RAG behavior** for voice flows:

- The shared RAG orchestrator (`QueryOrchestrator`) accepts an `exclude_phi` flag.
- When `exclude_phi` is true, retrieval applies a metadata filter in Qdrant so that:
  - Only chunks with `phi_risk` in `["none", "low", "medium"]` are used.
  - High-risk PHI KB chunks are excluded from RAG context.
- Voice relay and Thinker/Talker flows expose this flag:
  - REST: `POST /api/voice/relay` (`VoiceRelayRequest.exclude_phi?: boolean`).
  - WebSocket: `/api/voice/relay-ws` messages may include `"exclude_phi": true` on `transcript.final`.
  - Thinker/Talker: `session.init.advanced_settings.phi_mode: "clinical" | "demo"` is mapped to
    a per-session `exclude_phi` flag on the voice pipeline and the Thinker tool execution context.
- This is especially useful for:
  - Demos and non-clinical environments.
  - Scenarios where the assistant must avoid PHI-heavy KB content when answering general questions.

### Voice Session PHI Analytics (2025-12 Update)

To support admin observability for PHI-conscious behavior, VoiceAssist tracks PHI-related
metadata per voice session in the `SessionAnalyticsService`:

- `phi_mode`: `"clinical"` or `"demo"` for each voice session.
- `exclude_phi`: whether RAG calls in that session are running in PHI-conscious mode.
- `reading_mode_enabled`, `reading_detail`, `reading_speed`: reading-mode hints for
  document-aware voice navigation.

The admin API exposes a lightweight aggregation endpoint:

- `GET /api/admin/voice/analytics/phi`:
  - `active_sessions_total`
  - `active_sessions_clinical`
  - `active_sessions_demo`
  - `phi_conscious_sessions`
  - `phi_conscious_rate` (percentage of active sessions with `exclude_phi=true`)

The clinician web app’s **Voice Health Dashboard** surfaces these metrics as compact chips:

- “X demo sessions”
- “Y% PHI-conscious RAG”

This makes it easy to confirm that staging and demo environments are predominantly running
in PHI-conscious mode, without exposing any raw PHI or transcripts in analytics.

### Preferred RAG Surface for Voice (2025-12 Update)

As of the KB API unification work, **all new voice features should prefer
the `/api/kb/query` surface for RAG-backed answers**:

- `/api/kb/query` is implemented in `app/api/kb.py` and backed by
  `QueryOrchestrator` from `rag_service.py`.
- It encapsulates:
  - KB document selection (user + public docs).
  - A resilient RAG call path that degrades gracefully when external
    services are unavailable.
- Voice relays and Thinker/Talker flows should treat `/api/kb/query` as
  the canonical “RAG answer” endpoint, rather than calling lower-level
  RAG orchestrators or legacy `/api/advanced-search/*` endpoints directly.

Frontend code can reach this surface via the shared TypeScript client:

- `apiClient.queryKB({ question, contextDocuments?, filters?, conversationHistory?, clinicalContextId? })`

---

## Implementation Status

### Thinker-Talker Components

| Component             | Status   | Location                                                        |
| --------------------- | -------- | --------------------------------------------------------------- |
| ThinkerService        | **Live** | `app/services/thinker_service.py`                               |
| TalkerService         | **Live** | `app/services/talker_service.py`                                |
| VoicePipelineService  | **Live** | `app/services/voice_pipeline_service.py`                        |
| T/T WebSocket Handler | **Live** | `app/services/thinker_talker_websocket_handler.py`              |
| SentenceChunker       | **Live** | `app/services/sentence_chunker.py`                              |
| Frontend T/T hook     | **Live** | `apps/web-app/src/hooks/useThinkerTalkerSession.ts`             |
| T/T Audio Playback    | **Live** | `apps/web-app/src/hooks/useTTAudioPlayback.ts`                  |
| T/T Voice Panel       | **Live** | `apps/web-app/src/components/voice/ThinkerTalkerVoicePanel.tsx` |

### OpenAI Realtime Components (Legacy)

| Component                  | Status      | Location                                               |
| -------------------------- | ----------- | ------------------------------------------------------ |
| Backend session endpoint   | **Live**    | `services/api-gateway/app/api/voice.py`                |
| Ephemeral token generation | **Live**    | `app/services/realtime_voice_service.py`               |
| Voice metrics endpoint     | **Live**    | `POST /api/voice/metrics`                              |
| Frontend voice hook        | **Live**    | `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`    |
| Voice settings store       | **Live**    | `apps/web-app/src/stores/voiceSettingsStore.ts`        |
| Voice UI panel             | **Live**    | `apps/web-app/src/components/voice/VoiceModePanel.tsx` |
| Chat timeline integration  | **Live**    | Voice messages appear in chat                          |
| Barge-in support           | **Live**    | `response.cancel` + `onSpeechStarted` callback         |
| Audio overlap prevention   | **Live**    | Response ID tracking + `isProcessingResponseRef`       |
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
- **Barge-in support** (interrupt AI while speaking)
- **Audio playback management** (prevent overlapping responses)
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

### Echo / AEC Capability Tuning

Voice mode supports **capability-aware echo handling** that adapts barge-in aggressiveness based on the device’s echo cancellation quality.

- The frontend uses `useAECFeedback` (WebRTC stats) to estimate AEC quality as:
  - `excellent`, `good`, `fair`, `poor`, or `unknown`.
- This quality is attached to `vad.state` messages sent from the browser to the Thinker/Talker pipeline:

```json
{
  "type": "vad.state",
  "silero_confidence": 0.82,
  "is_speaking": true,
  "speech_duration_ms": 220,
  "is_playback_active": true,
  "effective_threshold": 0.71,
  "aec_quality": "fair"
}
```

On the backend:

- `HybridVADDecider` can adjust its thresholds when **`backend.voice_aec_capability_tuning`** is enabled:
  - `fair`: slightly higher hybrid thresholds and minimum speech duration.
  - `poor`: more conservative thresholds and a longer misfire rollback window.
- Hybrid VAD fusion also:
  - Uses **real Deepgram confidence** (from streaming transcripts) in `DeepgramEvent.confidence` rather than a binary 0/1.
  - Treats Silero and Deepgram signals as **fresh** using `HybridVADConfig.signal_freshness_ms` (default 300ms), which can be tuned via the numeric flag `backend.voice_hybrid_vad_signal_freshness_ms`.
  - Applies lightweight **noise- and user-aware tweaks** to `min_speech_duration_ms` and `hybrid_score_threshold` based on server-side SNR and the user’s `vad_sensitivity`.
  - Emits aggregate Prometheus metrics (`voiceassist_voice_hybrid_vad_decision_total`, `voiceassist_voice_barge_in_misfires_total`) for tuning and dashboards without exposing PHI.
- On the frontend:
  - `useThinkerTalkerVoiceMode` uses AEC quality to make Silero’s playback-time thresholds more conservative only when `backend.voice_aec_capability_tuning` is enabled.

### Adaptive noise handling and push-to-talk recommendation

- On first successful Silero start, the client runs `sileroVAD.calibrateNoise()` and stores a personalized threshold in `voiceSettingsStore`; this feeds into both local VAD thresholds and backend analytics (via `personalized_threshold` in `vad.state`).
- On the backend, `VoicePipelineSession` collects ~1s of early ambient audio and calls `AudioProcessingService.calibrate_noise_floor`, improving SNR estimates used for hybrid VAD tuning.
- During the session, the audio processor maintains an `snr_estimate_db`; if SNR remains below a conservative threshold for several seconds, the pipeline emits `voice.state` with `push_to_talk_recommended: true` and `reason="high_noise"`.
- The T/T hook surfaces this via `pushToTalkRecommended`, and the T/T voice panel shows a small hint suggesting push-to-talk in very noisy environments. Only aggregate SNR and flags are used; no raw audio or transcripts are logged.

## Canonical Voice Pipeline State Model

To keep the UI, WebSocket messages, and backend session state aligned, VoiceAssist uses a **canonical voice/pipeline state** type shared across the monorepo.

### Shared Type: `VoicePipelineState`

**Location:** `packages/types/src/index.ts:VoicePipelineState`

```ts
export type VoicePipelineState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "responding"
  | "speaking"
  | "cancelled"
  | "error"
  | "disconnected";
```

This union is the **source of truth** for:

- Frontend `voiceState` in the unified store
- Backend WebSocket session `pipeline_state`
- WebSocket `voice.state` events and `session.resume.ack.pipeline_state`

### Frontend Mapping

- **Unified conversation store**
  - **Location:** `apps/web-app/src/stores/unifiedConversationStore.ts`
  - `voiceState: VoicePipelineState` holds the current voice/pipeline state for the unified chat+voice UI.
  - `voiceConnectionStatus` is a separate transport state: `"disconnected" | "connecting" | "connected" | "reconnecting" | "error"`.
  - Actions like `setVoiceState`, `startListening`, `startSpeaking`, and `setVoiceConnectionStatus` enforce invariants:
    - When `voiceConnectionStatus` is `disconnected`/`error`, `voiceState` is coerced to `"idle"`/`"error"` (never `"listening"` or `"responding"` while disconnected).
    - When voice mode is inactive, `voiceState` is kept in `"idle"`/`"error"` and won’t enter active states.

- **Thinker/Talker voice hook**
  - **Location:** `apps/web-app/src/hooks/useThinkerTalkerSession.ts`
  - Defines a narrower `PipelineState` (`"idle" | "listening" | "processing" | "speaking" | "cancelled" | "error"`) that mirrors the backend `PipelineState` enum.
  - Handles incoming:
    - `voice.state` messages (`data.state: PipelineState`).
    - `session.resume.ack` messages with `pipeline_state: PipelineState`.
  - For `session.resume.ack`, it:
    - Restores any partial transcript/response (if present).
    - Updates the local `pipelineState` and calls `onPipelineStateChange(pipelineState, "recovered")`.

- **Thinker/Talker VoiceMode UI**
  - **Location:** `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`
  - Receives `onPipelineStateChange(state: PipelineState, reason?: string)` from `useThinkerTalkerSession` and maps it into `VoicePipelineState` on the unified store:
    - `"listening"` → `voiceState = "listening"`
    - `"processing"` → `voiceState = "processing"`
    - `"speaking"` → `voiceState = "responding"`
    - `"idle" | "cancelled"` → `voiceState = "idle"`
    - `"error"` → `voiceState = "error"` + clears local listening/speaking flags
  - Because `voiceState` uses the shared `VoicePipelineState`, the UI text (“Listening…”, “Thinking…”, “Responding…”, “Disconnected”, etc.) remains consistent with backend state.

### Backend Mapping

- **Pipeline state enum**
  - **Location:** `services/api-gateway/app/services/voice_pipeline_service.py:PipelineState`
  - Enum values: `"idle"`, `"listening"`, `"processing"`, `"speaking"`, `"cancelled"`, `"error"`.
  - All external state exposed to the WebSocket maps directly to these `.value` strings, which are a subset of `VoicePipelineState`.

- **WebSocket `voice.state` messages**
  - **Location:** `services/api-gateway/app/services/voice_pipeline_service.py:_send_state_update`
  - Emits:

    ```json
    {
      "type": "voice.state",
      "state": "listening" | "processing" | "speaking" | "idle" | "cancelled" | "error",
      "reason": "natural" | "barge_in" | "rollback" | ...
    }
    ```

  - Handled by `useThinkerTalkerSession` and propagated to the unified store via `onPipelineStateChange`.

- **WebSocket session state persistence**
  - **Location:** `services/api-gateway/app/services/websocket_session_state.py`
  - Field: `pipeline_state: str` stores the last known pipeline state for recovery.
  - When a disconnect occurs, `ThinkerTalkerWebSocketHandler._save_disconnection_state()` persists:

    ```python
    "pipeline_state": (self._pipeline_session.state.value if self._pipeline_session else "idle")
    ```

  - On `session.resume`, `attempt_recovery()` returns the `WebSocketSessionState` along with buffered messages and audio checkpoints.

  - **Recovery snapshot (`session.resume.ack`)**
  - **Location:** `services/api-gateway/app/services/thinker_talker_websocket_handler.py:_handle_session_resume`
  - After a successful recovery, the server sends:

    ```json
    {
      "type": "session.resume.ack",
      "recovery_state": "none" | "partial" | "full",
      "conversation_id": "conv_...",
      "partial_transcript": "..." | "",
      "partial_response": "..." | "",
      "missed_message_count": 0,
      "pipeline_state": "idle" | "listening" | "processing" | "speaking" | "cancelled" | "error"
    }
    ```

  - The frontend maps `pipeline_state` into `VoicePipelineState` via `useThinkerTalkerSession` → `useThinkerTalkerVoiceMode` → `useUnifiedConversationStore`.
  - **Privacy:** when `storeTranscriptHistory` is disabled for a session, `partial_transcript`, `partial_response`, and transcript/response `missed_message_count` are cleared in this payload, while `pipeline_state` is still sent so the UI can show the correct “Listening / Processing / Responding / Error” state after reconnect.

### Developer Note: Voice State Contract Checklist

When changing voice or pipeline state logic, keep this contract in mind:

- **If you add a new backend `PipelineState` value:**
  - Update `VoicePipelineState` in `packages/types/src/index.ts`.
  - Update `PipelineState` in `useThinkerTalkerSession.ts` and its handlers for `voice.state` and `pipeline.state`.
  - Map the new state into `VoicePipelineState` in `useThinkerTalkerVoiceMode.ts` and, if needed, into accessibility labels in `useVoiceAccessibility.ts`.

- **If you change reconnection/recovery behavior:**
  - Ensure `session.resume.ack` continues to include a canonical `pipeline_state`.
  - Verify `useThinkerTalkerSession` forwards the recovered state via `onPipelineStateChange(..., "recovered")`.
  - Keep `useUnifiedConversationStore` guards intact so you never end up with `"listening"` / `"responding"` while `voiceConnectionStatus` is `"disconnected"` or voice mode is off.

- **If you add privacy-related options (e.g., around transcript history):**
  - Thread the option through `AdvancedVoiceSettings` → `TTSessionConfig` → `WebSocketSessionState.store_transcript_history`.
  - Ensure backend recovery (`session.resume.ack`) and message buffering respect the flag (no transcript content or replay when disabled) while still sending `pipeline_state` for UI correctness.

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

## Barge-in & Audio Playback

**Location**: `apps/web-app/src/components/voice/VoiceModePanel.tsx`, `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`

### Barge-in Flow

When the user starts speaking while the AI is responding, the system immediately:

1. **Detects speech start** via OpenAI's `input_audio_buffer.speech_started` event
2. **Cancels active response** by sending `response.cancel` to OpenAI
3. **Stops audio playback** via `onSpeechStarted` callback
4. **Clears pending responses** to prevent stale audio from playing

```
User speaks → speech_started event → response.cancel → stopCurrentAudio()
                                                            ↓
                                                    Audio stops
                                                    Queue cleared
                                                    Response ID incremented
```

### Response Cancellation

**Location**: `useRealtimeVoiceSession.ts` - `handleRealtimeMessage`

```typescript
case "input_audio_buffer.speech_started":
  setIsSpeaking(true);
  setPartialTranscript("");

  // Barge-in: Cancel any active response when user starts speaking
  if (activeResponseIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: "response.cancel" }));
    activeResponseIdRef.current = null;
  }

  // Notify parent to stop audio playback
  options.onSpeechStarted?.();
  break;
```

### Audio Playback Management

**Location**: `VoiceModePanel.tsx`

The panel tracks audio playback state to prevent overlapping responses:

```typescript
// Track currently playing Audio element
const currentAudioRef = useRef<HTMLAudioElement | null>(null);

// Prevent overlapping response processing
const isProcessingResponseRef = useRef(false);

// Response ID to invalidate stale responses after barge-in
const currentResponseIdRef = useRef<number>(0);
```

**Stop current audio function:**

```typescript
const stopCurrentAudio = useCallback(() => {
  if (currentAudioRef.current) {
    currentAudioRef.current.pause();
    currentAudioRef.current.currentTime = 0;
    if (currentAudioRef.current.src.startsWith("blob:")) {
      URL.revokeObjectURL(currentAudioRef.current.src);
    }
    currentAudioRef.current = null;
  }
  audioQueueRef.current = [];
  isPlayingRef.current = false;
  currentResponseIdRef.current++; // Invalidate pending responses
  isProcessingResponseRef.current = false;
}, []);
```

### Overlap Prevention

When a relay result arrives, the handler checks:

1. **Already processing?** Skip if `isProcessingResponseRef.current === true`
2. **Response ID valid?** Skip playback if ID changed (barge-in occurred)

```typescript
onRelayResult: async ({ answer }) => {
  if (answer) {
    // Prevent overlapping responses
    if (isProcessingResponseRef.current) {
      console.log("[VoiceModePanel] Skipping response - already processing another");
      return;
    }

    const responseId = ++currentResponseIdRef.current;
    isProcessingResponseRef.current = true;

    // ... synthesis and playback ...

    // Check if response is still valid before playback
    if (responseId !== currentResponseIdRef.current) {
      console.log("[VoiceModePanel] Response cancelled - skipping playback");
      return;
    }
  }
};
```

### Error Handling

Benign cancellation errors (e.g., "Cancellation failed: no active response found") are handled gracefully:

```typescript
case "error": {
  const errorMessage = message.error?.message || "Realtime API error";

  // Ignore benign cancellation errors
  if (
    errorMessage.includes("Cancellation failed") ||
    errorMessage.includes("no active response")
  ) {
    voiceLog.debug(`Ignoring benign error: ${errorMessage}`);
    break;
  }

  handleError(new Error(errorMessage));
  break;
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
# Backend (from project root)
cd services/api-gateway
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
# Run from VoiceAssist project root

# 1. Backend tests (CI-safe, mocked)
cd services/api-gateway
source venv/bin/activate
export PYTHONPATH=.
python -m pytest tests/integration/test_openai_config.py -v

# 2. Frontend unit tests (run individually to avoid OOM)
cd apps/web-app
export NODE_OPTIONS="--max-old-space-size=768"

npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts --reporter=dot
npx vitest run src/hooks/__tests__/useChatSession-voice-integration.test.ts --reporter=dot
npx vitest run src/stores/__tests__/voiceSettingsStore.test.ts --reporter=dot
npx vitest run src/components/voice/__tests__/VoiceModeSettings.test.tsx --reporter=dot
npx vitest run src/components/chat/__tests__/MessageInput-voice-settings.test.tsx --reporter=dot

# 3. E2E tests (Chromium, mocked backend)
# From project root
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
| `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts`     | Thinker/Talker voice hook |
| `apps/web-app/src/components/voice/VoiceModePanel.tsx`    | UI panel                  |
| `apps/web-app/src/components/voice/VoiceModeSettings.tsx` | Settings modal            |
| `apps/web-app/src/stores/voiceSettingsStore.ts`           | Settings store            |
| `apps/web-app/src/components/chat/MessageInput.tsx`       | Voice button integration  |
| `apps/web-app/src/pages/ChatPage.tsx`                     | Chat timeline integration |
| `apps/web-app/src/hooks/useChatSession.ts`                | addMessage() helper       |

#### Silero VAD Asset Configuration (Frontend)

Silero model assets and ONNX Runtime can be served from a self-controlled origin to avoid external CDN dependency:

- `VITE_SILERO_ONNX_WASM_BASE_URL`  
  Base URL for `onnxruntime-web` WASM files (e.g. `/vendor/onnxruntime-web/dist/` in the default Docker image).
- `VITE_SILERO_VAD_ASSET_BASE_URL`  
  Base URL for `@ricky0123/vad-web` assets (e.g. `/vendor/silero-vad/` in the default Docker image).

If these env vars are unset, the web app falls back to jsDelivr for compatibility. Production deployments should configure them to point at a local static path (e.g. `apps/web-app/public` served via nginx).

For more detailed guidance on hosting and paths, see
[docs/voice/silero-vad-env.md](./voice/silero-vad-env.md).

#### Silero VAD Personalization & Analytics

Silero VAD personalization is wired end-to-end:

- The web app stores calibration state in `voiceSettingsStore` (`vadCalibrated`,
  `lastCalibrationDate`, `personalizedVadThreshold`, `vadSensitivity`).
- `useThinkerTalkerVoiceMode`:
  - Runs a quick ambient noise calibration (`sileroVAD.calibrateNoise()`) on
    first connection when needed and persists `personalizedVadThreshold`.
  - Anchors the sensitivity slider on this personalized baseline when present
    and maps 0–100 into safe Silero thresholds and minimum speech durations.
- The Thinker/Talker WebSocket client sends both:
  - `voice_settings.vad_sensitivity` (0–100)
  - `advanced_settings.personalized_vad_threshold` and
    `advanced_settings.vad_sensitivity`
- The backend copies these into `TTSessionConfig` and `PipelineConfig` so the
  pipeline can see the calibrated baseline.

At session end, `VoicePipelineSession.stop()` logs **aggregate, numeric-only**
stats for analytics:

- `barge_in_count`, `barge_in_misfires`, `barge_in_misfire_rate`
- `personalized_vad_threshold` (rounded)
- `vad_sensitivity`
- `recommended_threshold_action` (`increase_threshold`, `decrease_threshold`,
  or `none`)

These logs are designed for Loki/Grafana dashboards and offline analysis of:

- Threshold distribution across users/environments
- Correlation between personalized thresholds and barge-in misfire rates

For a deeper walkthrough and example queries, see
[docs/voice/voice-vad-personalization-analytics.md](./voice/voice-vad-personalization-analytics.md).

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

- [VOICE_MODE_ENHANCEMENT_10_PHASE.md](./VOICE_MODE_ENHANCEMENT_10_PHASE.md) - **10-phase enhancement plan (emotion, dictation, analytics)**
- [VOICE_MODE_SETTINGS_GUIDE.md](./VOICE_MODE_SETTINGS_GUIDE.md) - User settings configuration
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - E2E testing strategy and validation checklist

## Observability & Monitoring (Phase 3)

**Implemented:** 2025-12-02

The voice pipeline includes comprehensive observability features for production monitoring.

### Error Taxonomy (`voice_errors.py`)

Location: `services/api-gateway/app/core/voice_errors.py`

Structured error classification with 8 categories and 40+ error codes:

| Category   | Codes          | Description                    |
| ---------- | -------------- | ------------------------------ |
| CONNECTION | CONN_001-7     | WebSocket, network failures    |
| STT        | STT_001-7      | Speech-to-text errors          |
| TTS        | TTS_001-7      | Text-to-speech errors          |
| LLM        | LLM_001-6      | LLM processing errors          |
| AUDIO      | AUDIO_001-6    | Audio encoding/decoding errors |
| TIMEOUT    | TIMEOUT_001-7  | Various timeout conditions     |
| PROVIDER   | PROVIDER_001-6 | External provider errors       |
| INTERNAL   | INTERNAL_001-5 | Internal server errors         |

Each error code includes:

- Recoverability flag (can auto-retry)
- Retry configuration (delay, max attempts)
- User-friendly description

### Voice Metrics (`metrics.py`)

Location: `services/api-gateway/app/core/metrics.py`

Prometheus metrics for voice pipeline monitoring:

| Metric                                 | Type      | Labels                                | Description            |
| -------------------------------------- | --------- | ------------------------------------- | ---------------------- |
| `voice_errors_total`                   | Counter   | category, code, provider, recoverable | Total voice errors     |
| `voice_pipeline_stage_latency_seconds` | Histogram | stage                                 | Per-stage latency      |
| `voice_ttfa_seconds`                   | Histogram | -                                     | Time to first audio    |
| `voice_active_sessions`                | Gauge     | -                                     | Active voice sessions  |
| `voice_barge_in_total`                 | Counter   | -                                     | Barge-in events        |
| `voice_audio_chunks_total`             | Counter   | status                                | Audio chunks processed |

### Per-Stage Latency Tracking (`voice_timing.py`)

Location: `services/api-gateway/app/core/voice_timing.py`

Pipeline stages tracked:

- `audio_receive` - Time to receive audio from client
- `vad_process` - Voice activity detection time
- `stt_transcribe` - Speech-to-text latency
- `llm_process` - LLM inference time
- `tts_synthesize` - Text-to-speech synthesis
- `audio_send` - Time to send audio to client
- `ttfa` - Time to first audio (end-to-end)

Usage:

```python
from app.core.voice_timing import create_pipeline_timings, PipelineStage

timings = create_pipeline_timings(session_id="abc123")

with timings.time_stage(PipelineStage.STT_TRANSCRIBE):
    transcript = await stt_client.transcribe(audio)

timings.record_ttfa()  # When first audio byte ready
timings.finalize()     # When response complete
```

### SLO Alerts (`voice_slo_alerts.yml`)

Location: `infrastructure/observability/prometheus/rules/voice_slo_alerts.yml`

SLO targets with Prometheus alerting rules:

| SLO                  | Target  | Alert                           |
| -------------------- | ------- | ------------------------------- |
| TTFA P95             | < 200ms | VoiceTTFASLOViolation           |
| STT Latency P95      | < 300ms | VoiceSTTLatencySLOViolation     |
| TTS First Chunk P95  | < 200ms | VoiceTTSFirstChunkSLOViolation  |
| Connection Time P95  | < 500ms | VoiceConnectionTimeSLOViolation |
| Error Rate           | < 1%    | VoiceErrorRateHigh              |
| Session Success Rate | > 95%   | VoiceSessionSuccessRateLow      |

### Client Telemetry (`voiceTelemetry.ts`)

Location: `apps/web-app/src/lib/voiceTelemetry.ts`

Frontend telemetry with:

- **Network quality assessment** via Network Information API
- **Browser performance metrics** via Performance.memory API
- **Jitter estimation** for network quality
- **Batched reporting** (10s intervals)
- **Beacon API** for reliable delivery on page unload

```typescript
import { getVoiceTelemetry } from "@/lib/voiceTelemetry";

const telemetry = getVoiceTelemetry();
telemetry.startSession(sessionId);
telemetry.recordLatency("stt", 150);
telemetry.recordLatency("ttfa", 180);
telemetry.endSession();
```

### Voice Health Endpoint (`/health/voice`)

Location: `services/api-gateway/app/api/health.py`

Comprehensive voice subsystem health check:

```bash
curl http://localhost:8000/health/voice
```

Response:

```json
{
  "status": "healthy",
  "providers": {
    "openai": { "status": "up", "latency_ms": 120.5 },
    "elevenlabs": { "status": "up", "latency_ms": 85.2 },
    "deepgram": { "status": "up", "latency_ms": 95.8 }
  },
  "session_store": { "status": "up", "active_sessions": 5 },
  "metrics": { "active_sessions": 5 },
  "slo": { "ttfa_target_ms": 200, "error_rate_target": 0.01 }
}
```

### Debug Logging Configuration

Location: `services/api-gateway/app/core/logging.py`

Configurable voice log verbosity via `VOICE_LOG_LEVEL` environment variable:

| Level    | Content                                       |
| -------- | --------------------------------------------- |
| MINIMAL  | Errors only                                   |
| STANDARD | + Session lifecycle (start/end/state changes) |
| VERBOSE  | + All latency measurements                    |
| DEBUG    | + Audio frame details, chunk timing           |

Usage:

```python
from app.core.logging import get_voice_logger

voice_log = get_voice_logger(__name__)
voice_log.session_start(session_id="abc123", provider="thinker_talker")
voice_log.latency("stt_transcribe", 150.5, session_id="abc123")
voice_log.error("voice_connection_failed", error_code="CONN_001")
```

---

## Phase 9: Offline & Network Fallback

**Implemented:** 2025-12-03

The voice pipeline now includes comprehensive offline support and network-aware fallback mechanisms.

### Network Monitoring (`networkMonitor.ts`)

Location: `apps/web-app/src/lib/offline/networkMonitor.ts`

Continuously monitors network health using multiple signals:

- **Navigator.onLine**: Basic online/offline detection
- **Network Information API**: Connection type, downlink speed, RTT
- **Health Check Pinging**: Periodic `/api/health` pings for latency measurement

```typescript
import { getNetworkMonitor } from "@/lib/offline/networkMonitor";

const monitor = getNetworkMonitor();
monitor.subscribe((status) => {
  console.log(`Network quality: ${status.quality}`);
  console.log(`Health check latency: ${status.healthCheckLatencyMs}ms`);
});
```

#### Network Quality Levels

| Quality   | Latency     | isHealthy | Action                     |
| --------- | ----------- | --------- | -------------------------- |
| Excellent | < 100ms     | true      | Full cloud processing      |
| Good      | < 200ms     | true      | Full cloud processing      |
| Moderate  | < 500ms     | true      | Cloud with quality warning |
| Poor      | ≥ 500ms     | variable  | Consider offline fallback  |
| Offline   | Unreachable | false     | Automatic offline fallback |

#### Configuration

```typescript
const monitor = createNetworkMonitor({
  healthCheckUrl: "/api/health",
  healthCheckIntervalMs: 30000, // 30 seconds
  healthCheckTimeoutMs: 5000, // 5 seconds
  goodLatencyThresholdMs: 100,
  moderateLatencyThresholdMs: 200,
  poorLatencyThresholdMs: 500,
  failuresBeforeUnhealthy: 3,
});
```

### useNetworkStatus Hook

Location: `apps/web-app/src/hooks/useNetworkStatus.ts`

React hook providing network status with computed properties:

```typescript
const {
  isOnline,
  isHealthy,
  quality,
  healthCheckLatencyMs,
  effectiveType, // "4g", "3g", "2g", "slow-2g"
  downlink, // Mbps
  rtt, // Round-trip time ms
  isSuitableForVoice, // quality >= "good" && isHealthy
  shouldUseOffline, // !isOnline || !isHealthy || quality < "moderate"
  qualityScore, // 0-4 (offline=0, poor=1, moderate=2, good=3, excellent=4)
  checkNow, // Force immediate health check
} = useNetworkStatus();
```

### Offline VAD with Network Fallback

Location: `apps/web-app/src/hooks/useOfflineVAD.ts`

The `useOfflineVADWithFallback` hook automatically switches between network and offline VAD:

```typescript
const {
  isListening,
  isSpeaking,
  currentEnergy,
  isUsingOfflineVAD, // Currently using offline mode?
  networkAvailable,
  networkQuality,
  modeReason, // "network_vad" | "network_unavailable" | "poor_quality" | "forced_offline"
  forceOffline, // Manually switch to offline
  forceNetwork, // Manually switch to network (if available)
  startListening,
  stopListening,
} = useOfflineVADWithFallback({
  useNetworkMonitor: true,
  minNetworkQuality: "moderate",
  networkRecoveryDelayMs: 2000, // Prevent flapping
  onFallbackToOffline: () => console.log("Switched to offline VAD"),
  onReturnToNetwork: () => console.log("Returned to network VAD"),
});
```

### Fallback Decision Flow

```
┌────────────────────┐
│  Network Monitor   │
│  Health Check      │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐     NO     ┌────────────────────┐
│  Is Online?        │──────────▶│  Use Offline VAD   │
└─────────┬──────────┘            └────────────────────┘
          │ YES
          ▼
┌────────────────────┐     NO     ┌────────────────────┐
│  Is Healthy?       │──────────▶│  Use Offline VAD   │
│  (3+ checks pass)  │            │  reason: unhealthy │
└─────────┬──────────┘            └────────────────────┘
          │ YES
          ▼
┌────────────────────┐     NO     ┌────────────────────┐
│  Quality ≥ Min?    │──────────▶│  Use Offline VAD   │
│  (e.g., moderate)  │            │  reason: poor_qual │
└─────────┬──────────┘            └────────────────────┘
          │ YES
          ▼
┌────────────────────┐
│  Use Network VAD   │
│  (cloud processing)│
└────────────────────┘
```

### TTS Caching (`useTTSCache`)

Location: `apps/web-app/src/hooks/useOfflineVAD.ts`

Caches synthesized TTS audio for offline playback:

```typescript
const {
  getTTS, // Get audio (from cache or fresh)
  preload, // Preload common phrases
  isCached, // Check if text is cached
  stats, // { entryCount, sizeMB, hitRate }
  clear, // Clear cache
} = useTTSCache({
  voice: "alloy",
  maxSizeMB: 50,
  ttsFunction: async (text) => synthesizeAudio(text),
});

// Preload common phrases on app start
await preload(); // Caches "I'm listening", "Go ahead", etc.

// Get TTS (cache hit = instant, cache miss = synthesize + cache)
const audio = await getTTS("Hello world");
```

### User Settings Integration

Phase 9 settings are stored in `voiceSettingsStore`:

| Setting                 | Default | Description                              |
| ----------------------- | ------- | ---------------------------------------- |
| `enableOfflineFallback` | `true`  | Auto-switch to offline when network poor |
| `preferOfflineVAD`      | `false` | Force offline VAD (privacy mode)         |
| `ttsCacheEnabled`       | `true`  | Enable TTS response caching              |

### File Reference (Phase 9)

| File                                                            | Purpose                         |
| --------------------------------------------------------------- | ------------------------------- |
| `apps/web-app/src/lib/offline/networkMonitor.ts`                | Network health monitoring       |
| `apps/web-app/src/lib/offline/webrtcVAD.ts`                     | WebRTC-based offline VAD        |
| `apps/web-app/src/lib/offline/types.ts`                         | Offline module type definitions |
| `apps/web-app/src/hooks/useNetworkStatus.ts`                    | React hook for network status   |
| `apps/web-app/src/hooks/useOfflineVAD.ts`                       | Offline VAD + TTS cache hooks   |
| `apps/web-app/src/lib/offline/__tests__/networkMonitor.test.ts` | Network monitor tests           |

---

## Future Work

- ~~**Metrics export to backend**: Send metrics to backend for aggregation/alerting~~ ✓ Implemented
- ~~**Barge-in support**: Allow user to interrupt AI responses~~ ✓ Implemented (2025-11-28)
- ~~**Audio overlap prevention**: Prevent multiple responses playing simultaneously~~ ✓ Implemented (2025-11-28)
- ~~**Per-user voice preferences**: Backend persistence for TTS settings~~ ✓ Implemented (2025-11-29)
- ~~**Context-aware voice styles**: Auto-detect tone from content~~ ✓ Implemented (2025-11-29)
- ~~**Aggressive latency optimization**: 200ms VAD, 256-sample chunks, 300ms reconnect~~ ✓ Implemented (2025-11-29)
- ~~**Observability & Monitoring (Phase 3)**: Error taxonomy, metrics, SLO alerts, telemetry~~ ✓ Implemented (2025-12-02)
- ~~**Phase 7: Multilingual Support**: Auto language detection, accent profiles, language switch confidence~~ ✓ Implemented (2025-12-03)
- ~~**Phase 8: Voice Calibration**: Personalized VAD thresholds, calibration wizard, adaptive learning~~ ✓ Implemented (2025-12-03)
- ~~**Phase 9: Offline Fallback**: Network monitoring, offline VAD, TTS caching, quality-based switching~~ ✓ Implemented (2025-12-03)
- ~~**Phase 10: Conversation Intelligence**: Sentiment tracking, discourse analysis, response recommendations~~ ✓ Implemented (2025-12-03)

### Voice Mode Enhancement - 10 Phase Plan ✅ COMPLETE (2025-12-03)

A comprehensive enhancement transforming voice mode into a human-like conversational partner with medical dictation:

- ~~**Phase 1**: Emotional Intelligence (Hume AI)~~ ✓ Complete
- ~~**Phase 2**: Backchanneling System~~ ✓ Complete
- ~~**Phase 3**: Prosody Analysis~~ ✓ Complete
- ~~**Phase 4**: Memory & Context System~~ ✓ Complete
- ~~**Phase 5**: Advanced Turn-Taking~~ ✓ Complete
- ~~**Phase 6**: Variable Response Timing~~ ✓ Complete
- ~~**Phase 7**: Conversational Repair~~ ✓ Complete
- ~~**Phase 8**: Medical Dictation Core~~ ✓ Complete
- ~~**Phase 9**: Patient Context Integration~~ ✓ Complete
- ~~**Phase 10**: Frontend Integration & Analytics~~ ✓ Complete

**Full documentation:** [VOICE_MODE_ENHANCEMENT_10_PHASE.md](./VOICE_MODE_ENHANCEMENT_10_PHASE.md)

### Remaining Tasks

- **Voice→chat transcript content E2E**: Test actual transcript content in chat timeline
- **Error tracking integration**: Send errors to Sentry/similar
- **Audio level visualization**: Show real-time audio level meter during recording
