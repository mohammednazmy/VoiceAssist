---
title: Thinker-Talker Frontend Hooks
slug: frontend/thinker-talker-hooks
summary: >-
  React hooks for WebSocket connections, audio capture, and playback in the
  Thinker-Talker voice mode.
status: stable
stability: production
owner: frontend
lastUpdated: "2025-12-02"
audience:
  - developers
  - frontend
  - agent
  - ai-agents
tags:
  - hooks
  - react
  - voice
  - frontend
  - websocket
category: reference
ai_summary: >-
  > Location: apps/web-app/src/hooks/ > Status: Production Ready > Last Updated:
  2025-12-01 The Thinker-Talker frontend integration consists of several React
  hooks that manage WebSocket connections, audio capture, and playback. These
  hooks provide a complete voice mode implementation. ┌────────────...
---

# Thinker-Talker Frontend Hooks

> **Location:** `apps/web-app/src/hooks/`
> **Status:** Production Ready
> **Last Updated:** 2025-12-01

## Overview

The Thinker-Talker frontend integration consists of several React hooks that manage WebSocket connections, audio capture, and playback. These hooks provide a complete voice mode implementation.

## Hook Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Voice Mode Components                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              useThinkerTalkerVoiceMode                   │    │
│  │         (High-level orchestration hook)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              ┌───────────────┴───────────────┐                  │
│              ▼                               ▼                   │
│  ┌─────────────────────────┐    ┌─────────────────────────┐     │
│  │ useThinkerTalkerSession │    │  useTTAudioPlayback     │     │
│  │ (WebSocket + Protocol)  │    │  (Audio Queue + Play)   │     │
│  └─────────────────────────┘    └─────────────────────────┘     │
│              │                               │                   │
│              ▼                               ▼                   │
│  ┌─────────────────────────┐    ┌─────────────────────────┐     │
│  │    WebSocket API        │    │   Web Audio API         │     │
│  │    (Backend T/T)        │    │   (AudioContext)        │     │
│  └─────────────────────────┘    └─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## useThinkerTalkerSession

Main hook for WebSocket communication with the T/T pipeline.

### Import

```typescript
import { useThinkerTalkerSession } from "../hooks/useThinkerTalkerSession";
```

### Usage

```typescript
const {
  status,
  error,
  transcript,
  partialTranscript,
  pipelineState,
  currentToolCalls,
  metrics,
  connect,
  disconnect,
  sendAudioChunk,
  bargeIn,
} = useThinkerTalkerSession({
  conversation_id: "conv-123",
  voiceSettings: {
    voice_id: "TxGEqnHWrfWFTfGW9XjX",
    language: "en",
    barge_in_enabled: true,
  },
  onTranscript: (t) => console.log("Transcript:", t.text),
  onResponseDelta: (delta, id) => appendToChat(delta),
  onAudioChunk: (audio) => playAudio(audio),
  onToolCall: (tool) => showToolUI(tool),
});
```

### Options

```typescript
interface UseThinkerTalkerSessionOptions {
  conversation_id?: string;
  voiceSettings?: TTVoiceSettings;
  onTranscript?: (transcript: TTTranscript) => void;
  onResponseDelta?: (delta: string, messageId: string) => void;
  onResponseComplete?: (content: string, messageId: string) => void;
  onAudioChunk?: (audioBase64: string) => void;
  onToolCall?: (toolCall: TTToolCall) => void;
  onToolResult?: (toolCall: TTToolCall) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: TTConnectionStatus) => void;
  onPipelineStateChange?: (state: PipelineState) => void;
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
  onSpeechStarted?: () => void;
  onStopPlayback?: () => void;
  autoConnect?: boolean;
}
```

### Return Values

| Field               | Type                          | Description            |
| ------------------- | ----------------------------- | ---------------------- |
| `status`            | `TTConnectionStatus`          | Connection state       |
| `error`             | `Error \| null`               | Last error             |
| `transcript`        | `string`                      | Final user transcript  |
| `partialTranscript` | `string`                      | Streaming transcript   |
| `pipelineState`     | `PipelineState`               | Backend pipeline state |
| `currentToolCalls`  | `TTToolCall[]`                | Active tool calls      |
| `metrics`           | `TTVoiceMetrics`              | Performance metrics    |
| `connect`           | `() => Promise<void>`         | Start session          |
| `disconnect`        | `() => void`                  | End session            |
| `sendAudioChunk`    | `(data: ArrayBuffer) => void` | Send audio             |
| `bargeIn`           | `() => void`                  | Interrupt AI           |

### Types

```typescript
type TTConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"
  | "error"
  | "failed"
  | "mic_permission_denied";

type PipelineState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "cancelled"
  | "error";

interface TTTranscript {
  text: string;
  is_final: boolean;
  timestamp: number;
  message_id?: string;
}

interface TTToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}

interface TTVoiceMetrics {
  connectionTimeMs: number | null;
  sttLatencyMs: number | null;
  llmFirstTokenMs: number | null;
  ttsFirstAudioMs: number | null;
  totalLatencyMs: number | null;
  sessionDurationMs: number | null;
  userUtteranceCount: number;
  aiResponseCount: number;
  toolCallCount: number;
  bargeInCount: number;
  reconnectCount: number;
  sessionStartedAt: number | null;
}

interface TTVoiceSettings {
  voice_id?: string;
  language?: string;
  barge_in_enabled?: boolean;
  tts_model?: string;
}
```

### Reconnection

The hook implements automatic reconnection with exponential backoff:

```typescript
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 300; // 300ms
const MAX_RECONNECT_DELAY = 30000; // 30s

// Delay calculation
delay = min((BASE_DELAY * 2) ^ attempt, MAX_DELAY);
```

Fatal errors (mic permission denied) do not trigger reconnection.

## useTTAudioPlayback

Handles streaming PCM audio playback with queue management.

### Import

```typescript
import { useTTAudioPlayback } from "../hooks/useTTAudioPlayback";
```

### Usage

```typescript
const { isPlaying, queuedChunks, currentLatency, playAudioChunk, stopPlayback, clearQueue, getAudioContext } =
  useTTAudioPlayback({
    sampleRate: 24000,
    onPlaybackStart: () => console.log("Started playing"),
    onPlaybackEnd: () => console.log("Finished playing"),
    onError: (err) => console.error("Playback error:", err),
  });

// Queue audio from WebSocket
function handleAudioChunk(base64Audio: string) {
  const pcmData = base64ToArrayBuffer(base64Audio);
  playAudioChunk(pcmData);
}

// Handle barge-in
function handleBargeIn() {
  stopPlayback();
  clearQueue();
}
```

### Options

```typescript
interface UseTTAudioPlaybackOptions {
  sampleRate?: number; // Default: 24000
  bufferSize?: number; // Default: 4096
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
}
```

### Return Values

| Field             | Type                          | Description             |
| ----------------- | ----------------------------- | ----------------------- |
| `isPlaying`       | `boolean`                     | Audio currently playing |
| `queuedChunks`    | `number`                      | Chunks waiting to play  |
| `currentLatency`  | `number`                      | Playback latency (ms)   |
| `playAudioChunk`  | `(data: ArrayBuffer) => void` | Queue chunk             |
| `stopPlayback`    | `() => void`                  | Stop immediately        |
| `clearQueue`      | `() => void`                  | Clear pending chunks    |
| `getAudioContext` | `() => AudioContext`          | Get context             |

### Audio Format

Expects 24kHz mono PCM16 (little-endian):

```typescript
// Convert base64 to playable audio
function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Convert PCM16 to Float32 for Web Audio
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }

  return float32;
}
```

## useThinkerTalkerVoiceMode

High-level orchestration combining session and playback.

### Import

```typescript
import { useThinkerTalkerVoiceMode } from "../hooks/useThinkerTalkerVoiceMode";
```

### Usage

```typescript
const {
  // Connection
  isConnected,
  isConnecting,
  connectionError,

  // State
  voiceState,
  isListening,
  isProcessing,
  isSpeaking,

  // Transcripts
  transcript,
  partialTranscript,

  // Audio
  isPlaying,
  audioLevel,

  // Tools
  activeToolCalls,

  // Metrics
  metrics,

  // Actions
  connect,
  disconnect,
  toggleVoice,
  bargeIn,
} = useThinkerTalkerVoiceMode({
  conversationId: "conv-123",
  voiceId: "TxGEqnHWrfWFTfGW9XjX",
  onTranscriptComplete: (text) => addMessage("user", text),
  onResponseComplete: (text) => addMessage("assistant", text),
});
```

### Options

```typescript
interface UseThinkerTalkerVoiceModeOptions {
  conversationId?: string;
  voiceId?: string;
  language?: string;
  bargeInEnabled?: boolean;
  autoConnect?: boolean;
  onTranscriptComplete?: (text: string) => void;
  onResponseDelta?: (delta: string) => void;
  onResponseComplete?: (text: string) => void;
  onToolCall?: (tool: TTToolCall) => void;
  onError?: (error: Error) => void;
}
```

### Return Values

| Field               | Type                  | Description            |
| ------------------- | --------------------- | ---------------------- |
| `isConnected`       | `boolean`             | WebSocket connected    |
| `isConnecting`      | `boolean`             | Connection in progress |
| `connectionError`   | `Error \| null`       | Connection error       |
| `voiceState`        | `PipelineState`       | Current state          |
| `isListening`       | `boolean`             | STT active             |
| `isProcessing`      | `boolean`             | LLM thinking           |
| `isSpeaking`        | `boolean`             | TTS playing            |
| `transcript`        | `string`              | Final transcript       |
| `partialTranscript` | `string`              | Partial transcript     |
| `isPlaying`         | `boolean`             | Audio playing          |
| `audioLevel`        | `number`              | Mic level (0-1)        |
| `activeToolCalls`   | `TTToolCall[]`        | Current tools          |
| `metrics`           | `TTVoiceMetrics`      | Performance data       |
| `connect`           | `() => Promise<void>` | Start voice            |
| `disconnect`        | `() => void`          | End voice              |
| `toggleVoice`       | `() => void`          | Toggle on/off          |
| `bargeIn`           | `() => void`          | Interrupt              |

## useVoicePreferencesSync

Syncs voice settings with backend.

### Import

```typescript
import { useVoicePreferencesSync } from "../hooks/useVoicePreferencesSync";
```

### Usage

```typescript
const { preferences, isLoading, error, updatePreferences, resetToDefaults } = useVoicePreferencesSync();

// Update voice
await updatePreferences({
  voice_id: "21m00Tcm4TlvDq8ikWAM", // Rachel
  stability: 0.7,
  similarity_boost: 0.8,
});
```

### Return Values

| Field               | Type                 | Description      |
| ------------------- | -------------------- | ---------------- |
| `preferences`       | `VoicePreferences`   | Current settings |
| `isLoading`         | `boolean`            | Loading state    |
| `error`             | `Error \| null`      | Last error       |
| `updatePreferences` | `(prefs) => Promise` | Save settings    |
| `resetToDefaults`   | `() => Promise`      | Reset all        |

## Complete Example

```tsx
import React, { useCallback } from "react";
import { useThinkerTalkerVoiceMode } from "../hooks/useThinkerTalkerVoiceMode";
import { useVoicePreferencesSync } from "../hooks/useVoicePreferencesSync";

function VoicePanel({ conversationId }: { conversationId: string }) {
  const { preferences } = useVoicePreferencesSync();

  const {
    isConnected,
    isConnecting,
    voiceState,
    transcript,
    partialTranscript,
    activeToolCalls,
    metrics,
    connect,
    disconnect,
    bargeIn,
  } = useThinkerTalkerVoiceMode({
    conversationId,
    voiceId: preferences.voice_id,
    onTranscriptComplete: useCallback((text) => {
      console.log("User said:", text);
    }, []),
    onResponseComplete: useCallback((text) => {
      console.log("AI said:", text);
    }, []),
    onToolCall: useCallback((tool) => {
      console.log("Tool called:", tool.name);
    }, []),
  });

  return (
    <div className="voice-panel">
      {/* Connection status */}
      <div className="status">
        {isConnecting ? "Connecting..." : isConnected ? `Status: ${voiceState}` : "Disconnected"}
      </div>

      {/* Transcript display */}
      <div className="transcript">{transcript || partialTranscript || "Listening..."}</div>

      {/* Tool calls */}
      {activeToolCalls.map((tool) => (
        <div key={tool.id} className="tool-call">
          {tool.name}: {tool.status}
        </div>
      ))}

      {/* Metrics */}
      <div className="metrics">Latency: {metrics.totalLatencyMs}ms</div>

      {/* Controls */}
      <button onClick={isConnected ? disconnect : connect}>{isConnected ? "Stop" : "Start"} Voice</button>

      {voiceState === "speaking" && <button onClick={bargeIn}>Interrupt</button>}
    </div>
  );
}
```

## Error Handling

### Microphone Permission

```typescript
// The hook detects permission errors
if (status === "mic_permission_denied") {
  return (
    <div className="error">
      <p>Microphone access is required for voice mode.</p>
      <button onClick={requestMicPermission}>
        Allow Microphone
      </button>
    </div>
  );
}
```

### Connection Errors

```typescript
const { error, status, reconnectAttempts } = useThinkerTalkerSession({
  onError: (err) => {
    if (isMicPermissionError(err)) {
      showPermissionDialog();
    } else {
      showErrorToast(err.message);
    }
  },
});

if (status === "reconnecting") {
  return <div>Reconnecting... (attempt {reconnectAttempts}/5)</div>;
}

if (status === "failed") {
  return <div>Connection failed. Please refresh.</div>;
}
```

## Performance Tips

### 1. Memoize Callbacks

```typescript
const onTranscript = useCallback((t: TTTranscript) => {
  // Handle transcript
}, []);

const onAudioChunk = useCallback(
  (audio: string) => {
    playAudioChunk(base64ToArrayBuffer(audio));
  },
  [playAudioChunk],
);
```

### 2. Avoid Re-renders

```typescript
// Use refs for frequently updating values
const metricsRef = useRef(metrics);
useEffect(() => {
  metricsRef.current = metrics;
}, [metrics]);
```

### 3. Batch State Updates

```typescript
// In the hook implementation
const handleMessage = useCallback((msg) => {
  // React 18 automatically batches these
  setTranscript(msg.text);
  setPipelineState(msg.state);
  setMetrics((prev) => ({ ...prev, ...msg.metrics }));
}, []);
```

## Related Documentation

- [Thinker-Talker Pipeline Overview](../THINKER_TALKER_PIPELINE.md)
- [Voice Pipeline WebSocket API](../api-reference/voice-pipeline-ws.md)
- [Voice Mode Settings Guide](../VOICE_MODE_SETTINGS_GUIDE.md)
