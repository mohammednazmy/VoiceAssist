---
title: Thinker-Talker Voice Pipeline
slug: thinker-talker-pipeline
summary: VoiceAssist's voice processing architecture using local orchestration with Deepgram STT, GPT-4o, and ElevenLabs TTS.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-02"
audience: ["developers", "backend", "agent"]
tags: ["voice", "pipeline", "thinker-talker", "stt", "tts"]
category: architecture
---

# Thinker-Talker Voice Pipeline

> **Status:** Production Ready
> **Last Updated:** 2025-12-01
> **Phase:** Voice Pipeline Migration (Complete)

## Overview

The Thinker-Talker (T/T) pipeline is VoiceAssist's voice processing architecture that replaces the OpenAI Realtime API with a local orchestration approach. It provides unified conversation context, full tool/RAG support, and custom TTS with ElevenLabs for superior voice quality.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Thinker-Talker Pipeline                               │
│                                                                              │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐     │
│   │  Audio   │───>│ Deepgram STT │───>│ GPT-4o       │───>│ElevenLabs│     │
│   │  Input   │    │ (Streaming)  │    │ Thinker      │    │   TTS    │     │
│   └──────────┘    └──────────────┘    └──────────────┘    └──────────┘     │
│        │                │                    │                  │           │
│        │           Transcripts          Tool Calls         Audio Out        │
│        │                │                    │                  │           │
│        v                v                    v                  v           │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    WebSocket Handler                             │      │
│   │              (Bidirectional Client Communication)                │      │
│   └─────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Benefits Over OpenAI Realtime API

| Feature                  | OpenAI Realtime    | Thinker-Talker               |
| ------------------------ | ------------------ | ---------------------------- |
| **Conversation Context** | Separate from chat | Unified with chat mode       |
| **Tool Support**         | Limited            | Full tool calling + RAG      |
| **TTS Quality**          | OpenAI voices      | ElevenLabs premium voices    |
| **Cost**                 | Per-minute billing | Per-token + TTS chars        |
| **Voice Selection**      | 6 voices           | 11+ ElevenLabs voices        |
| **Customization**        | Limited            | Full control over each stage |
| **Barge-in**             | Built-in           | Fully supported              |

## Architecture Components

### 1. Voice Pipeline Service

**Location:** `services/api-gateway/app/services/voice_pipeline_service.py`

Orchestrates the complete STT → Thinker → Talker flow:

```python
class VoicePipelineService:
    """
    Orchestrates the complete voice pipeline:
    1. Receive audio from client
    2. Stream to Deepgram STT
    3. Send transcripts to Thinker (LLM)
    4. Stream response tokens to Talker (TTS)
    5. Send audio chunks back to client
    """
```

**Configuration:**

```python
@dataclass
class PipelineConfig:
    # STT Settings
    stt_language: str = "en"
    stt_sample_rate: int = 16000
    stt_endpointing_ms: int = 800    # Wait for natural pauses
    stt_utterance_end_ms: int = 1500  # Finalize after 1.5s silence

    # TTS Settings
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh (premium)
    tts_model: str = "eleven_turbo_v2_5"

    # Barge-in
    barge_in_enabled: bool = True
```

### 2. Thinker Service

**Location:** `services/api-gateway/app/services/thinker_service.py`

The reasoning engine that processes transcribed speech:

```python
class ThinkerService:
    """
    Unified reasoning service for the Thinker/Talker pipeline.

    Handles:
    - Conversation context management (persisted across turns)
    - Streaming LLM responses with token callbacks
    - Tool calling with result injection
    - Cancellation support
    """
```

**Key Features:**

- **ConversationContext**: Maintains history (max 20 messages) with smart trimming
- **Tool Registry**: Supports calendar, search, medical calculators, KB search
- **Streaming**: Token-by-token callbacks for low-latency TTS
- **State Machine**: IDLE → PROCESSING → TOOL_CALLING → GENERATING → COMPLETE

### 3. Talker Service

**Location:** `services/api-gateway/app/services/talker_service.py`

Text-to-Speech synthesis with streaming audio:

```python
class TalkerService:
    """
    Unified TTS service for the Thinker/Talker pipeline.

    Handles:
    - Streaming LLM tokens through sentence chunker
    - Audio queue management for gapless playback
    - Cancellation (barge-in support)
    """
```

**Voice Configuration:**

```python
@dataclass
class VoiceConfig:
    provider: TTSProvider = TTSProvider.ELEVENLABS
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh
    model_id: str = "eleven_turbo_v2_5"
    stability: float = 0.78       # Voice consistency
    similarity_boost: float = 0.85  # Voice clarity
    style: float = 0.08           # Natural, less dramatic
    output_format: str = "pcm_24000"  # Low-latency streaming
```

### 4. Sentence Chunker

**Location:** `services/api-gateway/app/services/sentence_chunker.py`

Optimizes LLM output for TTS with low latency:

```python
class SentenceChunker:
    """
    Low-latency phrase chunker for TTS processing.

    Strategy:
    - Primary: Split on sentence boundaries (. ! ?)
    - Secondary: Split on clause boundaries (, ; :) after min chars
    - Emergency: Force split at max chars

    Config (optimized for speed):
    - min_chunk_chars: 40   (avoid tiny fragments)
    - optimal_chunk_chars: 120  (natural phrases)
    - max_chunk_chars: 200  (force split)
    """
```

### 5. WebSocket Handler

**Location:** `services/api-gateway/app/services/thinker_talker_websocket_handler.py`

Manages bidirectional client communication:

```python
class ThinkerTalkerWebSocketHandler:
    """
    WebSocket handler for Thinker/Talker voice pipeline.

    Protocol Messages (Client → Server):
    - audio.input: Base64 PCM16 audio
    - audio.input.complete: Signal end of speech
    - barge_in: Interrupt AI response
    - voice.mode: Activate/deactivate voice mode

    Protocol Messages (Server → Client):
    - transcript.delta/complete: STT results
    - response.delta/complete: LLM response
    - audio.output: TTS audio chunk
    - tool.call/result: Tool execution
    - voice.state: Pipeline state update
    """
```

## Data Flow

### Complete Request/Response Cycle

```
1. User speaks into microphone
   │
   ▼
2. Frontend captures PCM16 audio (16kHz)
   │
   ▼
3. Audio streamed via WebSocket (audio.input messages)
   │
   ▼
4. Deepgram STT processes audio stream
   │
   ├──> transcript.delta (partial text)
   │
   └──> transcript.complete (final text)
        │
        ▼
5. ThinkerService receives transcript
   │
   ├──> Adds to ConversationContext
   │
   ├──> Calls GPT-4o with tools
   │
   ├──> If tool call needed:
   │    │
   │    ├──> tool.call sent to client
   │    │
   │    ├──> Tool executed
   │    │
   │    └──> tool.result sent to client
   │
   └──> response.delta (streaming tokens)
        │
        ▼
6. TalkerService receives tokens
   │
   ├──> SentenceChunker buffers tokens
   │
   ├──> Complete sentences → ElevenLabs TTS
   │
   └──> audio.output (streaming PCM)
        │
        ▼
7. Frontend plays audio via Web Audio API
```

### Barge-in Flow

```
1. AI is speaking (audio.output streaming)
   │
2. User starts speaking
   │
   ▼
3. Frontend sends barge_in message
   │
   ▼
4. Backend:
   ├──> Cancels TalkerSession
   ├──> Clears audio queue
   └──> Resets pipeline to LISTENING
   │
   ▼
5. New user speech processed normally
```

## State Machine

```
                    ┌─────────────────┐
                    │      IDLE       │
                    │  (waiting for   │
                    │   user input)   │
                    └────────┬────────┘
                             │
                    audio.input received
                             │
                             ▼
                    ┌─────────────────┐
                    │   LISTENING     │
                    │  (STT active,   │
                    │  collecting)    │
                    └────────┬────────┘
                             │
                    transcript.complete
                             │
                             ▼
                    ┌─────────────────┐
                    │  PROCESSING     │◄─────────┐
                    │  (LLM thinking) │          │
                    └────────┬────────┘          │
                             │                   │
              ┌──────────────┼──────────────┐    │
              │              │              │    │
         tool_call     no tools      error  │    │
              │              │              │    │
              ▼              ▼              │    │
    ┌─────────────────┐ ┌──────────┐       │    │
    │  TOOL_CALLING   │ │GENERATING│       │    │
    │  (executing     │ │(streaming│       │    │
    │   tool)         │ │ response)│       │    │
    └────────┬────────┘ └────┬─────┘       │    │
             │               │             │    │
        tool_result     response.complete  │    │
             │               │             │    │
             └───────┬───────┘             │    │
                     │                     │    │
                     ▼                     │    │
            ┌─────────────────┐            │    │
            │    SPEAKING     │            │    │
            │  (TTS playing)  │────────────┘    │
            └────────┬────────┘  (more to say)  │
                     │                          │
           audio complete or barge_in           │
                     │                          │
                     ▼                          │
            ┌─────────────────┐                 │
            │   CANCELLED     │─────────────────┘
            │  (interrupted)  │   (restart listening)
            └─────────────────┘
```

## WebSocket Protocol

### Client → Server Messages

| Message Type           | Description                      | Payload                                             |
| ---------------------- | -------------------------------- | --------------------------------------------------- |
| `session.init`         | Initialize session with settings | `{ voice_settings: {...}, conversation_id: "..." }` |
| `audio.input`          | Audio chunk from microphone      | `{ audio: "<base64 PCM16>" }`                       |
| `audio.input.complete` | Manual end-of-speech signal      | `{}`                                                |
| `barge_in`             | Interrupt AI response            | `{}`                                                |
| `message`              | Text input fallback              | `{ content: "..." }`                                |
| `ping`                 | Heartbeat                        | `{}`                                                |

### Server → Client Messages

| Message Type          | Description            | Payload                                      |
| --------------------- | ---------------------- | -------------------------------------------- |
| `session.ready`       | Session initialized    | `{ session_id, pipeline_mode }`              |
| `transcript.delta`    | Partial STT transcript | `{ text: "...", is_final: false }`           |
| `transcript.complete` | Final transcript       | `{ text: "...", message_id: "..." }`         |
| `response.delta`      | Streaming LLM token    | `{ delta: "...", message_id: "..." }`        |
| `response.complete`   | Complete LLM response  | `{ text: "...", message_id: "..." }`         |
| `audio.output`        | TTS audio chunk        | `{ audio: "<base64 PCM>", is_final: false }` |
| `tool.call`           | Tool being called      | `{ id, name, arguments }`                    |
| `tool.result`         | Tool result            | `{ id, name, result }`                       |
| `voice.state`         | Pipeline state change  | `{ state: "listening" }`                     |
| `error`               | Error occurred         | `{ code, message, recoverable }`             |

## Frontend Integration

### useThinkerTalkerSession Hook

**Location:** `apps/web-app/src/hooks/useThinkerTalkerSession.ts`

```typescript
const {
  status, // 'disconnected' | 'connecting' | 'ready' | 'error'
  pipelineState, // 'idle' | 'listening' | 'processing' | 'speaking'
  transcript, // Final user transcript
  metrics, // Latency and usage metrics
  connect, // Start session
  disconnect, // End session
  sendAudio, // Send audio chunk
  bargeIn, // Interrupt AI
} = useThinkerTalkerSession({
  conversation_id: "...",
  voiceSettings: {
    voice_id: "TxGEqnHWrfWFTfGW9XjX",
    language: "en",
    barge_in_enabled: true,
  },
  onTranscript: (t) => console.log("Transcript:", t),
  onAudioChunk: (audio) => playAudio(audio),
  onToolCall: (tool) => console.log("Tool:", tool),
});
```

### useTTAudioPlayback Hook

**Location:** `apps/web-app/src/hooks/useTTAudioPlayback.ts`

Handles streaming audio playback with barge-in support:

```typescript
const {
  isPlaying,
  queuedChunks,
  playAudioChunk, // Add chunk to queue
  stopPlayback, // Cancel playback (barge-in)
  clearQueue, // Clear pending audio
} = useTTAudioPlayback({
  sampleRate: 24000,
  onPlaybackEnd: () => console.log("Playback complete"),
});
```

## Configuration Reference

### Backend Environment Variables

```bash
# LLM Settings
MODEL_SELECTION_DEFAULT=gpt-4o
OPENAI_API_KEY=sk-...
OPENAI_TIMEOUT_SEC=30

# TTS Settings
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=TxGEqnHWrfWFTfGW9XjX
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5

# STT Settings
DEEPGRAM_API_KEY=...
```

### Voice Configuration Options

| Parameter          | Default                     | Range                    | Description                    |
| ------------------ | --------------------------- | ------------------------ | ------------------------------ |
| `voice_id`         | TxGEqnHWrfWFTfGW9XjX (Josh) | See available voices     | ElevenLabs voice               |
| `model_id`         | eleven_turbo_v2_5           | turbo/flash/multilingual | TTS model                      |
| `stability`        | 0.78                        | 0.0-1.0                  | Higher = more consistent voice |
| `similarity_boost` | 0.85                        | 0.0-1.0                  | Higher = clearer voice         |
| `style`            | 0.08                        | 0.0-1.0                  | Lower = more natural           |
| `output_format`    | pcm_24000                   | pcm/mp3                  | Audio format                   |

### Available ElevenLabs Voices

| Voice ID             | Name   | Gender | Premium |
| -------------------- | ------ | ------ | ------- |
| TxGEqnHWrfWFTfGW9XjX | Josh   | Male   | Yes     |
| pNInz6obpgDQGcFmaJgB | Adam   | Male   | Yes     |
| EXAVITQu4vr4xnSDxMaL | Bella  | Female | Yes     |
| 21m00Tcm4TlvDq8ikWAM | Rachel | Female | Yes     |
| AZnzlk1XvdvUeBnXmlld | Domi   | Female | No      |
| ErXwobaYiN019PkySvjV | Antoni | Male   | No      |

## Metrics & Observability

### TTVoiceMetrics

```typescript
interface TTVoiceMetrics {
  connectionTimeMs: number; // Connect to ready
  sttLatencyMs: number; // Speech end to transcript
  llmFirstTokenMs: number; // Transcript to first token
  ttsFirstAudioMs: number; // First token to first audio
  totalLatencyMs: number; // Speech end to first audio
  userUtteranceCount: number;
  aiResponseCount: number;
  toolCallCount: number;
  bargeInCount: number;
}
```

### Latency Targets

| Metric          | Target       | Description                  |
| --------------- | ------------ | ---------------------------- |
| Connection      | < 2000ms     | WebSocket + pipeline init    |
| STT             | < 500ms      | Speech end to transcript     |
| LLM First Token | < 800ms      | Transcript to first token    |
| TTS First Audio | < 400ms      | First token to audio         |
| **Total**       | **< 1500ms** | Speech end to audio playback |

## Troubleshooting

### Common Issues

**1. No audio output**

- Check ElevenLabs API key is valid
- Verify voice_id exists in available voices
- Check browser audio permissions

**2. High latency**

- Check network connection
- Verify STT endpoint is responsive
- Consider reducing chunk sizes

**3. Barge-in not working**

- Ensure `barge_in_enabled: true` in config
- Check WebSocket connection is stable
- Verify frontend is sending barge_in message

**4. Tool calls failing**

- Check user authentication (user_id required)
- Verify tool is registered in ToolRegistry
- Check tool-specific API keys (calendar, etc.)

### Debug Logging

Enable verbose logging:

```python
# Backend
import logging
logging.getLogger("app.services.thinker_service").setLevel(logging.DEBUG)
logging.getLogger("app.services.talker_service").setLevel(logging.DEBUG)
```

```typescript
// Frontend
import { voiceLog } from "../lib/logger";
voiceLog.setLevel("debug");
```

## Related Documentation

- [Thinker Service API](services/thinker-service.md)
- [Talker Service API](services/talker-service.md)
- [Voice Pipeline WebSocket Protocol](api-reference/voice-pipeline-ws.md)
- [Frontend Voice Hooks](frontend/thinker-talker-hooks.md)
- [Voice Mode Settings Guide](VOICE_MODE_SETTINGS_GUIDE.md)

## Changelog

### 2025-12-01 - Initial Release

- Complete Thinker-Talker pipeline implementation
- Deepgram STT integration with streaming
- ElevenLabs TTS with sentence chunking
- Full tool calling support
- Barge-in capability
- Unified conversation context with chat mode
