# Part 2: Deferred Backend Features - Implementation Plan

**Version:** 1.0
**Date:** 2025-11-26
**Status:** Planning
**Priority:** HIGH
**Estimated Duration:** 17-22 weeks

---

## Executive Summary

This document provides a comprehensive implementation plan for the deferred backend features identified during VoiceAssist V2 development. These features were intentionally deferred from the initial 15-phase development to focus on core functionality first.

**Scope:**

1. **Voice Pipeline Completion** (3-4 weeks) - Full voice interaction capability
2. **Advanced Medical AI** (4-5 weeks) - Specialized medical models and reasoning
3. **External Medical Integrations** (6-8 weeks) - UpToDate, enhanced PubMed, calculators
4. **Nextcloud Integration Completion** (4-5 weeks) - OIDC, email, contacts, app packaging

**Total Estimated Effort:** 17-22 weeks with 2-3 developers

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Voice Pipeline Completion](#1-voice-pipeline-completion)
3. [Advanced Medical AI](#2-advanced-medical-ai)
4. [External Medical Integrations](#3-external-medical-integrations)
5. [Nextcloud Integration Completion](#4-nextcloud-integration-completion)
6. [Implementation Phases](#implementation-phases)
7. [Technical Architecture](#technical-architecture)
8. [Risk Assessment](#risk-assessment)
9. [Success Metrics](#success-metrics)
10. [Appendices](#appendices)

---

## Current State Analysis

### What's Already Implemented

| Component               | Status      | Location                                                      | Notes                  |
| ----------------------- | ----------- | ------------------------------------------------------------- | ---------------------- |
| **WebSocket Realtime**  | ✅ Complete | `services/api-gateway/app/api/realtime.py`                    | Text streaming only    |
| **RAG Pipeline**        | ✅ Complete | `services/api-gateway/app/services/rag_service.py`            | OpenAI embeddings      |
| **PubMed Search**       | ✅ Complete | `server/app/tools/medical_search_tool.py`                     | NCBI E-utilities       |
| **OpenEvidence API**    | ✅ Complete | `server/app/tools/medical_search_tool.py`                     | Needs API key          |
| **Medical Guidelines**  | ✅ Complete | `server/app/tools/medical_search_tool.py`                     | Vector search          |
| **Medical Calculator**  | ✅ Complete | `server/app/tools/calculator_tool.py`                         | Basic calculations     |
| **Diagnosis Tool**      | ✅ Complete | `server/app/tools/diagnosis_tool.py`                          | Differential diagnosis |
| **CalDAV Integration**  | ✅ Complete | `services/api-gateway/app/services/caldav_service.py`         | Calendar CRUD          |
| **WebDAV File Indexer** | ✅ Complete | `services/api-gateway/app/services/nextcloud_file_indexer.py` | Auto-indexing          |
| **Email Service**       | ⚠️ Skeleton | `services/api-gateway/app/services/email_service.py`          | Basic IMAP/SMTP        |
| **JWT Authentication**  | ✅ Complete | `services/api-gateway/app/core/security.py`                   | Access + Refresh       |

### What's Missing (This Plan)

| Component                | Priority | Complexity | Dependencies             |
| ------------------------ | -------- | ---------- | ------------------------ |
| OpenAI Realtime API      | HIGH     | High       | WebRTC, Audio codecs     |
| WebRTC Audio Streaming   | HIGH     | High       | Browser APIs, STUN/TURN  |
| Voice Activity Detection | HIGH     | Medium     | Audio processing         |
| Echo Cancellation        | HIGH     | Medium     | WebRTC, DSP              |
| Barge-in Support         | HIGH     | High       | Realtime API, State mgmt |
| Voice Authentication     | MEDIUM   | Medium     | Speaker recognition      |
| BioGPT/PubMedBERT        | HIGH     | High       | GPU, Model hosting       |
| Multi-hop Reasoning      | MEDIUM   | High       | Query decomposition      |
| UpToDate API             | HIGH     | Medium     | License, API contract    |
| OIDC SSO                 | HIGH     | Medium     | Nextcloud OIDC app       |
| Full Email Integration   | MEDIUM   | Medium     | IMAP threading           |
| CardDAV Contacts         | LOW      | Low        | Contact sync             |
| Google Calendar Sync     | MEDIUM   | Medium     | OAuth, Google APIs       |
| Nextcloud App Packaging  | MEDIUM   | Medium     | NC app guidelines        |

---

## 1. Voice Pipeline Completion

### 1.1 Overview

**Objective:** Enable natural, real-time voice conversations between clinicians and the AI assistant.

**Current State:** WebSocket endpoint exists for text streaming. No audio processing.

**Target State:** Full duplex audio streaming with OpenAI Realtime API, VAD, echo cancellation, and barge-in.

### 1.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client (Browser/App)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Microphone  │  │   WebRTC    │  │    VAD      │  │   Speaker   │   │
│  │   Input     │──▶│   Codec    │──▶│  (Client)   │──▶│   Output    │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                │                │                │            │
│         │                ▼                │                ▲            │
│         │         ┌─────────────┐         │                │            │
│         │         │  WebSocket  │         │                │            │
│         │         │  (Audio)    │◀────────┘                │            │
│         │         └──────┬──────┘                          │            │
└─────────│────────────────│─────────────────────────────────│────────────┘
          │                │                                 │
          │                ▼                                 │
┌─────────│────────────────────────────────────────────────────────────────┐
│         │          VoiceAssist Backend                     │            │
│         │    ┌─────────────────────────────────────────┐  │            │
│         │    │         Voice Gateway Service            │  │            │
│         │    │  ┌───────────┐  ┌───────────────────┐  │  │            │
│         │    │  │  Audio    │  │  Session Manager   │  │  │            │
│         └────┼──▶│  Router   │  │  (Conversation)    │  │  │            │
│              │  └─────┬─────┘  └───────────────────┘  │  │            │
│              │        │                                │  │            │
│              │        ▼                                │  │            │
│              │  ┌─────────────┐  ┌───────────────────┐│  │            │
│              │  │ VAD Engine  │  │  Barge-in Handler ││  │            │
│              │  │ (Server)    │  │                   ││  │            │
│              │  └─────────────┘  └───────────────────┘│  │            │
│              └─────────────────────────────────────────┘  │            │
│                          │                                 │            │
│                          ▼                                 │            │
│              ┌─────────────────────────────────────────┐  │            │
│              │        OpenAI Realtime API              │  │            │
│              │  ┌───────────┐  ┌───────────────────┐  │  │            │
│              │  │   ASR     │  │   Response Gen    │  │  │            │
│              │  │ (Whisper) │  │   (GPT-4o-RT)     │──┼──┘            │
│              │  └───────────┘  └───────────────────┘  │               │
│              │        │              │                │               │
│              │        ▼              ▼                │               │
│              │  ┌───────────┐  ┌───────────────────┐  │               │
│              │  │ Transcript│  │   TTS Audio       │──┼───────────────┘
│              │  │  Events   │  │   (Streaming)     │  │
│              │  └───────────┘  └───────────────────┘  │
│              └─────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Component Specifications

#### 1.3.1 OpenAI Realtime API Integration

**File:** `services/api-gateway/app/services/openai_realtime.py`

```python
# Core implementation structure
class OpenAIRealtimeClient:
    """
    WebSocket client for OpenAI Realtime API (gpt-4o-realtime-preview).

    Features:
    - Bidirectional audio streaming
    - Function calling support
    - Conversation state management
    - Automatic reconnection
    - Rate limiting and backpressure
    """

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-realtime-preview-2024-10-01",
        voice: str = "alloy",
        instructions: str = "",
        tools: List[Dict] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.voice = voice
        self.instructions = instructions
        self.tools = tools or []
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.session_id: Optional[str] = None
        self.conversation_id: Optional[str] = None

    async def connect(self) -> None:
        """Establish WebSocket connection to OpenAI Realtime API."""

    async def send_audio(self, audio_chunk: bytes) -> None:
        """Send audio chunk to API (base64-encoded PCM16 24kHz mono)."""

    async def send_text(self, text: str) -> None:
        """Send text input for text-to-speech."""

    async def create_response(self, modalities: List[str] = ["text", "audio"]) -> None:
        """Trigger response generation."""

    async def cancel_response(self) -> None:
        """Cancel ongoing response (for barge-in)."""

    async def truncate_audio(self, item_id: str, audio_end_ms: int) -> None:
        """Truncate audio playback (for barge-in)."""

    async def handle_events(self, callback: Callable) -> None:
        """Process incoming events from API."""
```

**OpenAI Realtime API Events to Handle:**

| Event                                    | Direction     | Purpose                    |
| ---------------------------------------- | ------------- | -------------------------- |
| `session.created`                        | Server→Client | Session initialized        |
| `session.updated`                        | Server→Client | Session config changed     |
| `input_audio_buffer.append`              | Client→Server | Send audio chunk           |
| `input_audio_buffer.commit`              | Client→Server | Finalize audio input       |
| `input_audio_buffer.clear`               | Client→Server | Clear audio buffer         |
| `conversation.item.create`               | Client→Server | Add conversation item      |
| `response.create`                        | Client→Server | Trigger response           |
| `response.cancel`                        | Client→Server | Cancel response (barge-in) |
| `response.audio.delta`                   | Server→Client | Audio chunk                |
| `response.audio.done`                    | Server→Client | Audio complete             |
| `response.audio_transcript.delta`        | Server→Client | Transcript chunk           |
| `response.text.delta`                    | Server→Client | Text chunk                 |
| `response.function_call_arguments.delta` | Server→Client | Tool call                  |
| `response.done`                          | Server→Client | Response complete          |
| `error`                                  | Server→Client | Error occurred             |

#### 1.3.2 WebRTC Audio Streaming

**File:** `services/api-gateway/app/services/webrtc_handler.py`

```python
class WebRTCHandler:
    """
    WebRTC audio handling for browser-to-server audio streaming.

    Audio Format:
    - Input: PCM16 24kHz mono (from browser MediaRecorder)
    - Output: PCM16 24kHz mono (to browser AudioContext)

    Features:
    - ICE candidate handling
    - STUN/TURN server configuration
    - Audio track management
    - Codec negotiation (Opus preferred)
    """

    SUPPORTED_CODECS = ["opus", "pcm"]
    SAMPLE_RATE = 24000
    CHANNELS = 1
    BITS_PER_SAMPLE = 16

    async def handle_offer(self, sdp: str) -> str:
        """Process WebRTC offer and return answer SDP."""

    async def handle_ice_candidate(self, candidate: Dict) -> None:
        """Process ICE candidate."""

    async def on_audio_track(self, track: MediaStreamTrack) -> None:
        """Handle incoming audio track from client."""

    async def send_audio(self, audio_data: bytes) -> None:
        """Send audio to client via WebRTC data channel or audio track."""
```

**Alternative: WebSocket Audio (Simpler Implementation)**

For initial implementation, use WebSocket-based audio streaming instead of full WebRTC:

```python
class WebSocketAudioHandler:
    """
    WebSocket-based audio streaming (simpler than WebRTC).

    Protocol:
    - Client sends: {"type": "audio", "data": "<base64-pcm>"}
    - Server sends: {"type": "audio", "data": "<base64-pcm>"}
    - Server sends: {"type": "transcript", "text": "...", "is_final": bool}
    """

    async def receive_audio_chunk(self, data: str) -> bytes:
        """Decode base64 audio from client."""

    async def send_audio_chunk(self, audio: bytes) -> None:
        """Send base64-encoded audio to client."""
```

#### 1.3.3 Voice Activity Detection (VAD)

**File:** `services/api-gateway/app/services/vad_service.py`

```python
class VADService:
    """
    Voice Activity Detection using Silero VAD or WebRTC VAD.

    Options:
    1. Silero VAD (PyTorch) - More accurate, higher latency
    2. WebRTC VAD (py-webrtcvad) - Faster, lower accuracy
    3. OpenAI Realtime API built-in VAD - Server-side

    For production, recommend using OpenAI's built-in VAD with
    server_vad turn detection mode.
    """

    class VADMode(Enum):
        CLIENT_SIDE = "client"      # Browser-based VAD
        SERVER_SIDE = "server"      # Our server VAD
        OPENAI_VAD = "openai"       # OpenAI Realtime API VAD

    def __init__(
        self,
        mode: VADMode = VADMode.OPENAI_VAD,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 500,
    ):
        self.mode = mode
        self.threshold = threshold
        self.min_speech_duration_ms = min_speech_duration_ms
        self.min_silence_duration_ms = min_silence_duration_ms

    async def detect_speech(self, audio_chunk: bytes) -> VADResult:
        """Detect speech in audio chunk."""

    async def get_speech_segments(self, audio: bytes) -> List[SpeechSegment]:
        """Extract speech segments from audio."""
```

**OpenAI Realtime API VAD Configuration:**

```json
{
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500
  }
}
```

#### 1.3.4 Echo Cancellation and Noise Suppression

**Approach:** Leverage browser's built-in AEC/NS via MediaStream constraints.

**File:** `apps/web-app/src/hooks/useAudioProcessing.ts`

```typescript
interface AudioConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

export function useAudioProcessing() {
  const getAudioStream = async (): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 24000,
        channelCount: 1,
      },
    });
  };

  // For advanced processing, use Web Audio API AudioWorklet
  const createAudioProcessor = async (stream: MediaStream) => {
    const audioContext = new AudioContext({ sampleRate: 24000 });
    await audioContext.audioWorklet.addModule("/audio-processor.js");

    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, "audio-processor");

    source.connect(processor);
    processor.connect(audioContext.destination);

    return processor;
  };
}
```

#### 1.3.5 Barge-in Support

**File:** `services/api-gateway/app/services/barge_in_handler.py`

```python
class BargeInHandler:
    """
    Handle conversation interruption (barge-in) during AI speech.

    When user starts speaking while AI is responding:
    1. Detect user speech via VAD
    2. Cancel current OpenAI response
    3. Truncate audio playback on client
    4. Start processing new user input

    State Machine:
    - IDLE: No active response
    - AI_SPEAKING: AI is generating/streaming response
    - USER_SPEAKING: User is speaking (may interrupt)
    - PROCESSING: Processing user input
    """

    class ConversationState(Enum):
        IDLE = "idle"
        AI_SPEAKING = "ai_speaking"
        USER_SPEAKING = "user_speaking"
        PROCESSING = "processing"

    def __init__(self, realtime_client: OpenAIRealtimeClient):
        self.realtime_client = realtime_client
        self.state = self.ConversationState.IDLE
        self.current_response_id: Optional[str] = None
        self.audio_playback_position_ms: int = 0

    async def on_user_speech_start(self) -> None:
        """Handle user starting to speak."""
        if self.state == self.ConversationState.AI_SPEAKING:
            # Barge-in detected!
            await self.handle_barge_in()

    async def handle_barge_in(self) -> None:
        """Cancel AI response and prepare for new input."""
        # 1. Cancel response on OpenAI
        await self.realtime_client.cancel_response()

        # 2. Truncate audio (tell client to stop playback)
        if self.current_response_id:
            await self.realtime_client.truncate_audio(
                item_id=self.current_response_id,
                audio_end_ms=self.audio_playback_position_ms
            )

        # 3. Update state
        self.state = self.ConversationState.USER_SPEAKING

    async def on_ai_response_start(self, response_id: str) -> None:
        """Handle AI starting to respond."""
        self.state = self.ConversationState.AI_SPEAKING
        self.current_response_id = response_id
        self.audio_playback_position_ms = 0

    async def on_ai_response_done(self) -> None:
        """Handle AI finishing response."""
        self.state = self.ConversationState.IDLE
        self.current_response_id = None
```

#### 1.3.6 Voice Authentication

**File:** `services/api-gateway/app/services/voice_auth.py`

```python
class VoiceAuthService:
    """
    Speaker verification for voice authentication.

    Options:
    1. Azure Speaker Recognition API
    2. AWS Voice ID
    3. Self-hosted (speechbrain, resemblyzer)

    Flow:
    1. Enrollment: User speaks passphrase, create voice profile
    2. Verification: Compare voice to stored profile
    3. Continuous: Periodically verify during session
    """

    class AuthProvider(Enum):
        AZURE = "azure"
        AWS = "aws"
        LOCAL = "local"

    def __init__(
        self,
        provider: AuthProvider = AuthProvider.LOCAL,
        threshold: float = 0.7,
    ):
        self.provider = provider
        self.threshold = threshold

    async def enroll_voice(
        self,
        user_id: str,
        audio_samples: List[bytes],
    ) -> VoiceProfile:
        """Create voice profile from audio samples."""

    async def verify_voice(
        self,
        user_id: str,
        audio: bytes,
    ) -> VerificationResult:
        """Verify speaker identity."""

    async def continuous_verify(
        self,
        user_id: str,
        audio_stream: AsyncIterator[bytes],
    ) -> AsyncIterator[VerificationResult]:
        """Continuously verify speaker during conversation."""
```

### 1.4 API Endpoints

#### New WebSocket Endpoint for Voice

**File:** `services/api-gateway/app/api/voice.py`

```python
@router.websocket("/api/voice/ws")
async def voice_websocket(
    websocket: WebSocket,
    token: str = Query(...),
    conversation_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    WebSocket endpoint for voice conversations.

    Query Parameters:
    - token: JWT access token (required)
    - conversation_id: Existing conversation ID (optional)

    Client → Server Messages:
    - {"type": "audio", "data": "<base64-pcm-24khz-mono>"}
    - {"type": "config", "voice": "alloy", "vad": "server"}
    - {"type": "cancel"} - Cancel current response (barge-in)

    Server → Client Messages:
    - {"type": "connected", "session_id": "..."}
    - {"type": "transcript.partial", "text": "..."}
    - {"type": "transcript.final", "text": "..."}
    - {"type": "audio", "data": "<base64-pcm>"}
    - {"type": "response.start", "response_id": "..."}
    - {"type": "response.done", "response_id": "..."}
    - {"type": "error", "code": "...", "message": "..."}
    """
```

### 1.5 Configuration

**Environment Variables:**

```bash
# OpenAI Realtime API
OPENAI_REALTIME_ENABLED=true
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-10-01
OPENAI_REALTIME_VOICE=alloy  # alloy, echo, shimmer, etc.

# Voice Processing
VOICE_VAD_MODE=openai  # client, server, openai
VOICE_VAD_THRESHOLD=0.5
VOICE_SILENCE_DURATION_MS=500
VOICE_BARGE_IN_ENABLED=true

# Audio Format
VOICE_SAMPLE_RATE=24000
VOICE_CHANNELS=1
VOICE_BITS_PER_SAMPLE=16

# Voice Authentication (optional)
VOICE_AUTH_ENABLED=false
VOICE_AUTH_PROVIDER=local  # azure, aws, local
VOICE_AUTH_THRESHOLD=0.7

# WebRTC (if using)
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=
TURN_USERNAME=
TURN_PASSWORD=
```

### 1.6 Implementation Tasks

| Task                       | Priority | Effort | Dependencies          |
| -------------------------- | -------- | ------ | --------------------- |
| OpenAI Realtime API client | P0       | 3 days | OpenAI API key        |
| WebSocket audio endpoint   | P0       | 2 days | Realtime client       |
| Audio encoding/decoding    | P0       | 1 day  | -                     |
| VAD integration            | P1       | 2 days | Audio endpoint        |
| Barge-in handler           | P1       | 2 days | VAD, Realtime client  |
| Frontend audio capture     | P0       | 2 days | -                     |
| Frontend audio playback    | P0       | 2 days | -                     |
| Session state management   | P1       | 2 days | -                     |
| Tool calling in voice      | P1       | 2 days | Existing tools        |
| Voice authentication       | P2       | 3 days | Voice profile storage |
| Echo cancellation tuning   | P2       | 1 day  | Browser APIs          |
| Performance optimization   | P2       | 2 days | All components        |
| Integration tests          | P1       | 2 days | All components        |
| Documentation              | P2       | 1 day  | All components        |

**Total Effort:** 3-4 weeks

---

## 2. Advanced Medical AI

### 2.1 Overview

**Objective:** Enhance medical AI capabilities with specialized embeddings, domain-specific models, and advanced reasoning.

**Current State:** OpenAI embeddings (text-embedding-3-small), single-hop RAG, basic entity recognition.

**Target State:** BioGPT/PubMedBERT embeddings, multi-hop reasoning, fine-tuned NER, cross-document synthesis.

### 2.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Advanced Medical AI Pipeline                       │
│                                                                          │
│  ┌──────────────────┐      ┌──────────────────┐      ┌───────────────┐ │
│  │   Query Input    │──────▶│  Query Analyzer  │──────▶│  Query Router │ │
│  └──────────────────┘      └──────────────────┘      └───────┬───────┘ │
│                                                              │          │
│                     ┌────────────────────────────────────────┼──────┐   │
│                     │                                        │      │   │
│                     ▼                                        ▼      ▼   │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────┐│
│  │   Simple Query       │  │   Complex Query      │  │  Multi-Source  ││
│  │   (Single-hop RAG)   │  │   (Multi-hop)        │  │  (Synthesis)   ││
│  └──────────┬───────────┘  └──────────┬───────────┘  └───────┬────────┘│
│             │                         │                       │         │
│             ▼                         ▼                       ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Embedding Layer                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │   OpenAI    │  │  BioGPT     │  │  PubMedBERT             │  │  │
│  │  │  (General)  │  │  (Medical)  │  │  (Literature)           │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│             │                         │                       │         │
│             ▼                         ▼                       ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Retrieval Layer                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │   Qdrant    │  │  Hybrid     │  │  Re-ranking             │  │  │
│  │  │  (Vectors)  │  │  (BM25+Vec) │  │  (Cross-encoder)        │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│             │                         │                       │         │
│             ▼                         ▼                       ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Medical NLP Layer                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │  Entity     │  │  Relation   │  │  Concept Linking        │  │  │
│  │  │  Recognition│  │  Extraction │  │  (UMLS, SNOMED)         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│             │                         │                       │         │
│             ▼                         ▼                       ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Response Generation                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │  GPT-4      │  │  Citation   │  │  Confidence Scoring     │  │  │
│  │  │  (Answer)   │  │  Tracking   │  │                         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Specifications

#### 2.3.1 BioGPT/PubMedBERT Integration

**File:** `services/api-gateway/app/services/medical_embeddings.py`

```python
class MedicalEmbeddingService:
    """
    Medical-specific embeddings using BioGPT or PubMedBERT.

    Models:
    1. microsoft/BioGPT - Generative pre-trained for biomedical
    2. microsoft/PubMedBERT - BERT pre-trained on PubMed
    3. allenai/scibert - Scientific BERT
    4. dmis-lab/biobert - BioBERT

    Deployment Options:
    1. Self-hosted (GPU required, ~8GB VRAM)
    2. Hugging Face Inference API
    3. AWS SageMaker
    4. Azure ML
    """

    class ModelType(Enum):
        OPENAI = "openai"           # text-embedding-3-small/large
        BIOGPT = "biogpt"           # microsoft/biogpt
        PUBMEDBERT = "pubmedbert"   # microsoft/PubMedBERT
        SCIBERT = "scibert"         # allenai/scibert

    def __init__(
        self,
        model_type: ModelType = ModelType.PUBMEDBERT,
        device: str = "cuda",  # cuda, cpu, mps
        batch_size: int = 32,
    ):
        self.model_type = model_type
        self.device = device
        self.batch_size = batch_size
        self.model = None
        self.tokenizer = None

    async def load_model(self) -> None:
        """Load the embedding model."""
        if self.model_type == self.ModelType.PUBMEDBERT:
            from transformers import AutoTokenizer, AutoModel
            self.tokenizer = AutoTokenizer.from_pretrained(
                "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
            )
            self.model = AutoModel.from_pretrained(
                "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
            ).to(self.device)

    async def embed(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings for texts."""
        embeddings = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            inputs = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt"
            ).to(self.device)

            with torch.no_grad():
                outputs = self.model(**inputs)
                # Mean pooling
                batch_embeddings = outputs.last_hidden_state.mean(dim=1)
                embeddings.append(batch_embeddings.cpu().numpy())

        return np.vstack(embeddings)

    async def embed_query(self, query: str) -> np.ndarray:
        """Embed a single query (with query-specific processing)."""
        # Add medical query prefix for better retrieval
        processed = f"medical query: {query}"
        return await self.embed([processed])
```

**Hybrid Embedding Strategy:**

```python
class HybridEmbeddingService:
    """
    Combine multiple embedding models for better retrieval.

    Strategy:
    1. Use OpenAI for general text understanding
    2. Use PubMedBERT for medical terminology
    3. Weighted combination based on query type
    """

    def __init__(self):
        self.openai_embeddings = OpenAIEmbeddings()
        self.medical_embeddings = MedicalEmbeddingService()

    async def embed(
        self,
        text: str,
        query_type: str = "general"
    ) -> np.ndarray:
        """Generate hybrid embedding."""
        openai_emb = await self.openai_embeddings.embed(text)
        medical_emb = await self.medical_embeddings.embed([text])

        # Weight based on query type
        if query_type == "clinical":
            return 0.3 * openai_emb + 0.7 * medical_emb
        elif query_type == "research":
            return 0.2 * openai_emb + 0.8 * medical_emb
        else:
            return 0.6 * openai_emb + 0.4 * medical_emb
```

#### 2.3.2 Medical Entity Recognition

**File:** `services/api-gateway/app/services/medical_ner.py`

```python
class MedicalNERService:
    """
    Medical Named Entity Recognition using:
    1. scispaCy (en_core_sci_lg, en_ner_bc5cdr_md)
    2. Hugging Face medical NER models
    3. UMLS concept linking

    Entity Types:
    - DISEASE: Diseases and conditions
    - DRUG: Medications and drugs
    - SYMPTOM: Signs and symptoms
    - PROCEDURE: Medical procedures
    - ANATOMY: Body parts and organs
    - LAB_VALUE: Laboratory results
    - DOSAGE: Drug dosages
    """

    ENTITY_TYPES = [
        "DISEASE", "DRUG", "SYMPTOM", "PROCEDURE",
        "ANATOMY", "LAB_VALUE", "DOSAGE", "GENE"
    ]

    def __init__(self, model: str = "en_ner_bc5cdr_md"):
        self.nlp = None
        self.model_name = model
        self.linker = None  # UMLS linker

    async def load(self) -> None:
        """Load NER model and UMLS linker."""
        import scispacy
        import spacy
        from scispacy.linking import EntityLinker

        self.nlp = spacy.load(self.model_name)
        self.nlp.add_pipe("scispacy_linker", config={
            "resolve_abbreviations": True,
            "linker_name": "umls"
        })

    async def extract_entities(self, text: str) -> List[MedicalEntity]:
        """Extract medical entities from text."""
        doc = self.nlp(text)
        entities = []

        for ent in doc.ents:
            # Get UMLS concepts
            umls_concepts = []
            if hasattr(ent._, 'kb_ents') and ent._.kb_ents:
                for cui, score in ent._.kb_ents[:3]:
                    umls_concepts.append({
                        "cui": cui,
                        "score": score,
                        "name": self.get_umls_name(cui)
                    })

            entities.append(MedicalEntity(
                text=ent.text,
                label=ent.label_,
                start=ent.start_char,
                end=ent.end_char,
                umls_concepts=umls_concepts
            ))

        return entities

    async def link_to_umls(self, entity: str) -> List[UMLSConcept]:
        """Link entity text to UMLS concepts."""

    async def expand_query(self, query: str) -> str:
        """Expand query with synonyms and related terms."""
        entities = await self.extract_entities(query)
        expansions = []

        for entity in entities:
            for concept in entity.umls_concepts:
                # Add synonyms from UMLS
                synonyms = await self.get_synonyms(concept["cui"])
                expansions.extend(synonyms[:2])

        return f"{query} {' '.join(expansions)}"
```

#### 2.3.3 Multi-hop Reasoning

**File:** `services/api-gateway/app/services/multi_hop_reasoning.py`

```python
class MultiHopReasoningService:
    """
    Multi-hop reasoning for complex medical queries.

    Example Query: "What are the drug interactions between metformin
    and the first-line treatment for hypertension in diabetic patients?"

    Steps:
    1. Decompose: What is first-line HTN treatment for diabetics?
    2. Retrieve: ACE inhibitors or ARBs
    3. Decompose: What are interactions between metformin and ACE inhibitors?
    4. Retrieve: Drug interaction data
    5. Synthesize: Combined answer with citations

    Chain Types:
    - Sequential: A → B → C
    - Parallel: A + B → C
    - Conditional: if A then B else C
    """

    class ReasoningChain:
        def __init__(self):
            self.steps: List[ReasoningStep] = []
            self.context: Dict[str, Any] = {}

    class ReasoningStep:
        question: str
        answer: Optional[str]
        sources: List[Citation]
        confidence: float
        next_steps: List[str]

    def __init__(
        self,
        rag_service: QueryOrchestrator,
        llm_client: LLMClient,
        max_hops: int = 3,
    ):
        self.rag_service = rag_service
        self.llm_client = llm_client
        self.max_hops = max_hops

    async def decompose_query(self, query: str) -> List[str]:
        """Break complex query into sub-questions."""
        prompt = f"""Decompose this medical query into simpler sub-questions.

Query: {query}

Return a JSON list of sub-questions that need to be answered to fully
address the original query. Order them logically.

Example output:
["What is condition X?", "What are treatments for X?", "What are side effects?"]
"""
        response = await self.llm_client.generate(prompt)
        return json.loads(response)

    async def execute_chain(
        self,
        query: str,
        chain: ReasoningChain,
    ) -> MultiHopResult:
        """Execute multi-hop reasoning chain."""
        sub_questions = await self.decompose_query(query)

        for i, sub_q in enumerate(sub_questions[:self.max_hops]):
            # Add context from previous steps
            contextualized_query = self._add_context(sub_q, chain.context)

            # Retrieve relevant documents
            result = await self.rag_service.handle_query(
                QueryRequest(query=contextualized_query)
            )

            # Store in context for next step
            chain.context[f"step_{i}"] = {
                "question": sub_q,
                "answer": result.answer,
                "sources": result.citations
            }

            chain.steps.append(ReasoningStep(
                question=sub_q,
                answer=result.answer,
                sources=result.citations,
                confidence=self._calculate_confidence(result),
                next_steps=sub_questions[i+1:i+2]
            ))

        # Synthesize final answer
        return await self._synthesize(query, chain)

    async def _synthesize(
        self,
        original_query: str,
        chain: ReasoningChain,
    ) -> MultiHopResult:
        """Synthesize final answer from reasoning chain."""
        context = "\n\n".join([
            f"Q: {step.question}\nA: {step.answer}"
            for step in chain.steps
        ])

        prompt = f"""Based on the following reasoning chain, provide a
comprehensive answer to the original question.

Original Question: {original_query}

Reasoning Chain:
{context}

Provide a synthesized answer that:
1. Directly addresses the original question
2. Cites specific sources from each step
3. Notes any uncertainties or limitations
"""

        answer = await self.llm_client.generate(prompt)

        # Collect all citations
        all_citations = []
        for step in chain.steps:
            all_citations.extend(step.sources)

        return MultiHopResult(
            query=original_query,
            answer=answer,
            reasoning_chain=chain,
            citations=self._deduplicate_citations(all_citations),
            confidence=self._calculate_overall_confidence(chain)
        )
```

#### 2.3.4 Cross-Document Synthesis

**File:** `services/api-gateway/app/services/document_synthesis.py`

```python
class CrossDocumentSynthesizer:
    """
    Synthesize information across multiple documents.

    Use Cases:
    1. Comparing treatment guidelines from different sources
    2. Aggregating evidence from multiple studies
    3. Resolving conflicts between sources
    4. Creating comprehensive summaries
    """

    async def synthesize(
        self,
        documents: List[Document],
        query: str,
        synthesis_type: str = "aggregate"  # aggregate, compare, resolve
    ) -> SynthesisResult:
        """Synthesize information from multiple documents."""

        if synthesis_type == "compare":
            return await self._compare_documents(documents, query)
        elif synthesis_type == "resolve":
            return await self._resolve_conflicts(documents, query)
        else:
            return await self._aggregate_information(documents, query)

    async def _compare_documents(
        self,
        documents: List[Document],
        query: str
    ) -> SynthesisResult:
        """Compare information across documents."""
        # Extract key claims from each document
        claims_by_doc = {}
        for doc in documents:
            claims = await self._extract_claims(doc, query)
            claims_by_doc[doc.id] = claims

        # Identify agreements and disagreements
        comparison = await self._compare_claims(claims_by_doc)

        return SynthesisResult(
            summary=comparison.summary,
            agreements=comparison.agreements,
            disagreements=comparison.disagreements,
            sources=documents
        )

    async def _resolve_conflicts(
        self,
        documents: List[Document],
        query: str
    ) -> SynthesisResult:
        """Resolve conflicting information."""
        # Identify conflicts
        conflicts = await self._identify_conflicts(documents, query)

        # Rank sources by reliability
        ranked_sources = await self._rank_by_reliability(documents)

        # Generate resolution with justification
        resolution = await self._generate_resolution(conflicts, ranked_sources)

        return SynthesisResult(
            summary=resolution.summary,
            resolution=resolution.conclusion,
            justification=resolution.reasoning,
            sources=ranked_sources
        )
```

### 2.4 Implementation Tasks

| Task                         | Priority | Effort | Dependencies        |
| ---------------------------- | -------- | ------ | ------------------- |
| PubMedBERT embedding service | P0       | 3 days | GPU/API access      |
| Hybrid embedding strategy    | P1       | 2 days | PubMedBERT service  |
| Medical NER with scispaCy    | P1       | 2 days | scispaCy models     |
| UMLS concept linking         | P1       | 2 days | UMLS license        |
| Query decomposition          | P0       | 2 days | LLM client          |
| Multi-hop reasoning engine   | P0       | 4 days | Query decomposition |
| Cross-document synthesis     | P1       | 3 days | Multi-hop reasoning |
| Confidence scoring           | P2       | 2 days | All components      |
| Caching for embeddings       | P1       | 1 day  | Redis               |
| Model serving optimization   | P2       | 2 days | GPU profiling       |
| Integration tests            | P1       | 2 days | All components      |
| Benchmarking & evaluation    | P2       | 2 days | Test datasets       |

**Total Effort:** 4-5 weeks

---

## 3. External Medical Integrations

### 3.1 Overview

**Objective:** Integrate premium external medical knowledge sources.

**Current State:**

- PubMed: ✅ Implemented (NCBI E-utilities)
- OpenEvidence: ✅ Implemented (needs API key)
- Medical Guidelines: ✅ Implemented (local vector search)
- Medical Calculator: ✅ Implemented (basic calculations)

**Target State:** Add UpToDate, enhance PubMed with advanced features, add comprehensive medical calculators.

### 3.2 UpToDate API Integration

**File:** `services/api-gateway/app/services/uptodate_service.py`

```python
class UpToDateService:
    """
    UpToDate API integration for clinical decision support.

    API Endpoints:
    - /search: Topic search
    - /topics/{id}: Topic content
    - /graphics/{id}: Medical graphics
    - /drug-interactions: Drug interaction checker
    - /calculators: Medical calculators

    Pricing: Enterprise license required (~$500-1500/month)
    Rate Limits: Varies by license tier
    """

    BASE_URL = "https://api.uptodate.com/v1"

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        cache: CacheService,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.cache = cache
        self.client = httpx.AsyncClient(timeout=30.0)

    async def search_topics(
        self,
        query: str,
        max_results: int = 10,
        specialty: Optional[str] = None,
    ) -> List[UpToDateTopic]:
        """Search UpToDate topics."""
        cache_key = f"uptodate:search:{hash(query)}:{specialty}"
        cached = await self.cache.get(cache_key)
        if cached:
            return [UpToDateTopic(**t) for t in cached]

        response = await self._request("GET", "/search", params={
            "q": query,
            "limit": max_results,
            "specialty": specialty,
        })

        topics = [
            UpToDateTopic(
                id=item["id"],
                title=item["title"],
                specialty=item.get("specialty"),
                last_updated=item.get("lastUpdated"),
                relevance_score=item.get("score", 0),
            )
            for item in response.get("results", [])
        ]

        await self.cache.set(cache_key, [t.dict() for t in topics], ttl=3600)
        return topics

    async def get_topic_content(
        self,
        topic_id: str,
        section: Optional[str] = None,
    ) -> UpToDateContent:
        """Get full topic content."""
        cache_key = f"uptodate:topic:{topic_id}:{section}"
        cached = await self.cache.get(cache_key)
        if cached:
            return UpToDateContent(**cached)

        response = await self._request("GET", f"/topics/{topic_id}", params={
            "section": section,
        })

        content = UpToDateContent(
            id=topic_id,
            title=response["title"],
            sections=response.get("sections", []),
            references=response.get("references", []),
            last_updated=response.get("lastUpdated"),
            authors=response.get("authors", []),
        )

        await self.cache.set(cache_key, content.dict(), ttl=86400)
        return content

    async def check_drug_interactions(
        self,
        drugs: List[str],
    ) -> DrugInteractionResult:
        """Check for drug-drug interactions."""
        response = await self._request("POST", "/drug-interactions", json={
            "drugs": drugs,
        })

        interactions = []
        for item in response.get("interactions", []):
            interactions.append(DrugInteraction(
                drug1=item["drug1"],
                drug2=item["drug2"],
                severity=item["severity"],  # major, moderate, minor
                description=item["description"],
                mechanism=item.get("mechanism"),
                management=item.get("management"),
                references=item.get("references", []),
            ))

        return DrugInteractionResult(
            drugs=drugs,
            interactions=interactions,
            has_major=any(i.severity == "major" for i in interactions),
        )

    async def get_calculator(
        self,
        calculator_id: str,
        inputs: Dict[str, Any],
    ) -> CalculatorResult:
        """Run a medical calculator."""
        response = await self._request("POST", f"/calculators/{calculator_id}", json={
            "inputs": inputs,
        })

        return CalculatorResult(
            calculator=calculator_id,
            inputs=inputs,
            result=response["result"],
            interpretation=response.get("interpretation"),
            references=response.get("references", []),
        )

    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Make authenticated API request."""
        headers = {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

        response = await self.client.request(
            method,
            f"{self.BASE_URL}{endpoint}",
            headers=headers,
            **kwargs
        )
        response.raise_for_status()
        return response.json()
```

**Tool Definition:**

```python
SEARCH_UPTODATE_DEF = ToolDefinition(
    name="search_uptodate",
    description="""Search UpToDate for evidence-based clinical information.

UpToDate provides:
- Clinical topic summaries written by physicians
- Treatment recommendations with evidence grades
- Drug information and interactions
- Medical calculators
- Regularly updated content

Use this for:
- Current treatment guidelines
- Drug dosing and interactions
- Clinical decision support
- Evidence-based recommendations""",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Clinical question or topic"
            },
            "max_results": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "default": 5
            },
            "specialty": {
                "type": "string",
                "enum": [
                    "cardiology", "endocrinology", "gastroenterology",
                    "infectious-disease", "nephrology", "neurology",
                    "oncology", "pulmonology", "rheumatology"
                ]
            },
            "include_content": {
                "type": "boolean",
                "default": False,
                "description": "Include full topic content (slower)"
            }
        },
        "required": ["query"]
    },
    category=ToolCategory.MEDICAL,
    requires_phi=False,
    requires_confirmation=False,
    risk_level=RiskLevel.LOW,
    rate_limit=20,
    timeout_seconds=30
)
```

### 3.3 Enhanced PubMed Integration

**File:** `services/api-gateway/app/services/pubmed_enhanced.py`

```python
class EnhancedPubMedService:
    """
    Enhanced PubMed integration with additional features.

    New Features:
    - Full-text access via PMC
    - Citation network analysis
    - Similar articles
    - Clinical trial matching
    - Automated systematic review support
    """

    async def search_with_mesh(
        self,
        query: str,
        mesh_terms: List[str] = None,
        publication_types: List[str] = None,
    ) -> PubMedSearchResult:
        """Search with MeSH term expansion."""
        # Expand query with MeSH terms
        if mesh_terms:
            mesh_query = " OR ".join([f'"{term}"[MeSH]' for term in mesh_terms])
            query = f"({query}) AND ({mesh_query})"

        # Add publication type filters
        if publication_types:
            type_query = " OR ".join([
                f'"{pt}"[Publication Type]' for pt in publication_types
            ])
            query = f"({query}) AND ({type_query})"

        return await self._esearch(query)

    async def get_full_text(self, pmid: str) -> Optional[str]:
        """Get full text from PMC if available."""
        # Check if article is in PMC
        pmc_id = await self._get_pmc_id(pmid)
        if not pmc_id:
            return None

        # Fetch full text from PMC
        response = await self._fetch_pmc_full_text(pmc_id)
        return response

    async def find_similar_articles(
        self,
        pmid: str,
        max_results: int = 10,
    ) -> List[PubMedArticle]:
        """Find similar articles using NCBI's Related Articles."""
        response = await self._elink(
            dbfrom="pubmed",
            db="pubmed",
            id=pmid,
            linkname="pubmed_pubmed"
        )

        related_pmids = response.get("linksets", [{}])[0].get("ids", [])
        return await self._efetch(related_pmids[:max_results])

    async def get_citation_network(
        self,
        pmid: str,
        depth: int = 1,
    ) -> CitationNetwork:
        """Build citation network for an article."""
        # Get articles that cite this one
        citing = await self._elink(
            dbfrom="pubmed",
            db="pubmed",
            id=pmid,
            linkname="pubmed_pubmed_citedin"
        )

        # Get articles this one cites
        cited = await self._elink(
            dbfrom="pubmed",
            db="pubmed",
            id=pmid,
            linkname="pubmed_pubmed_refs"
        )

        return CitationNetwork(
            article_pmid=pmid,
            citing_articles=citing.get("linksets", [{}])[0].get("ids", []),
            cited_articles=cited.get("linksets", [{}])[0].get("ids", []),
        )

    async def search_clinical_trials(
        self,
        condition: str,
        intervention: Optional[str] = None,
        status: str = "recruiting",
    ) -> List[ClinicalTrial]:
        """Search ClinicalTrials.gov via PubMed."""
        query = f"{condition}[Condition]"
        if intervention:
            query += f" AND {intervention}[Intervention]"

        # Add NCT filter
        query += ' AND "clinicaltrials.gov"[Source]'

        return await self._search_trials(query, status)
```

### 3.4 Comprehensive Medical Calculators

**File:** `services/api-gateway/app/tools/medical_calculators.py`

```python
class MedicalCalculators:
    """
    Comprehensive medical calculator library.

    Categories:
    1. Cardiovascular: CHADS2, CHA2DS2-VASc, HEART, Wells DVT/PE
    2. Nephrology: CKD-EPI, MDRD, Cockcroft-Gault
    3. Hepatology: MELD, Child-Pugh, FIB-4
    4. Critical Care: APACHE II, SOFA, qSOFA
    5. Obstetrics: Bishop Score, APGAR
    6. Pulmonology: CURB-65, PSI/PORT
    7. Oncology: ECOG, Karnofsky
    8. Endocrinology: HOMA-IR, Framingham
    9. Pediatrics: Pediatric GCS, PEWS
    10. General: BMI, BSA, IBW, ABW
    """

    CALCULATORS = {
        # Cardiovascular
        "chads2_vasc": CHA2DS2VASc,
        "heart_score": HEARTScore,
        "wells_dvt": WellsDVT,
        "wells_pe": WellsPE,
        "timi_stemi": TIMISTEMI,
        "timi_nstemi": TIMINSTE,

        # Nephrology
        "ckd_epi": CKDEPI,
        "mdrd": MDRD,
        "cockcroft_gault": CockcroftGault,
        "fena": FeNa,

        # Hepatology
        "meld": MELD,
        "meld_na": MELDNa,
        "child_pugh": ChildPugh,
        "fib4": FIB4,

        # Critical Care
        "apache2": APACHEII,
        "sofa": SOFA,
        "qsofa": qSOFA,
        "curb65": CURB65,

        # General
        "bmi": BMI,
        "bsa": BSA,
        "ibw": IBW,
        "corrected_calcium": CorrectedCalcium,
        "anion_gap": AnionGap,
        "corrected_sodium": CorrectedSodium,
        "a_a_gradient": AAGradient,
    }

    @classmethod
    async def calculate(
        cls,
        calculator_name: str,
        inputs: Dict[str, Any],
    ) -> CalculatorResult:
        """Run a medical calculator."""
        if calculator_name not in cls.CALCULATORS:
            raise ValueError(f"Unknown calculator: {calculator_name}")

        calculator = cls.CALCULATORS[calculator_name]
        return await calculator.calculate(inputs)

    @classmethod
    def get_calculator_info(cls, calculator_name: str) -> CalculatorInfo:
        """Get calculator metadata and input requirements."""
        calculator = cls.CALCULATORS[calculator_name]
        return CalculatorInfo(
            name=calculator_name,
            display_name=calculator.DISPLAY_NAME,
            description=calculator.DESCRIPTION,
            category=calculator.CATEGORY,
            inputs=calculator.INPUTS,
            references=calculator.REFERENCES,
        )


class CHA2DS2VASc:
    """CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk."""

    DISPLAY_NAME = "CHA₂DS₂-VASc Score"
    DESCRIPTION = "Estimates stroke risk in patients with atrial fibrillation"
    CATEGORY = "cardiovascular"

    INPUTS = [
        {"name": "age", "type": "integer", "required": True},
        {"name": "sex", "type": "string", "enum": ["male", "female"], "required": True},
        {"name": "chf_history", "type": "boolean", "required": True},
        {"name": "hypertension", "type": "boolean", "required": True},
        {"name": "stroke_tia_history", "type": "boolean", "required": True},
        {"name": "vascular_disease", "type": "boolean", "required": True},
        {"name": "diabetes", "type": "boolean", "required": True},
    ]

    REFERENCES = [
        "Lip GY, et al. Chest. 2010;137(2):263-272",
    ]

    @classmethod
    async def calculate(cls, inputs: Dict[str, Any]) -> CalculatorResult:
        score = 0

        # Age scoring
        age = inputs["age"]
        if age >= 75:
            score += 2
        elif age >= 65:
            score += 1

        # Sex
        if inputs["sex"] == "female":
            score += 1

        # Conditions
        if inputs.get("chf_history"):
            score += 1
        if inputs.get("hypertension"):
            score += 1
        if inputs.get("stroke_tia_history"):
            score += 2
        if inputs.get("vascular_disease"):
            score += 1
        if inputs.get("diabetes"):
            score += 1

        # Interpretation
        risk_table = {
            0: ("0.2%", "Low risk - Consider no anticoagulation"),
            1: ("0.6%", "Low-moderate risk - Consider anticoagulation"),
            2: ("2.2%", "Moderate risk - Anticoagulation recommended"),
            3: ("3.2%", "Moderate-high risk - Anticoagulation recommended"),
            4: ("4.8%", "High risk - Anticoagulation recommended"),
            5: ("7.2%", "High risk - Anticoagulation recommended"),
            6: ("9.7%", "Very high risk - Anticoagulation recommended"),
            7: ("11.2%", "Very high risk - Anticoagulation recommended"),
            8: ("10.8%", "Very high risk - Anticoagulation recommended"),
            9: ("12.2%", "Very high risk - Anticoagulation recommended"),
        }

        annual_risk, recommendation = risk_table.get(score, ("High", "Anticoagulation recommended"))

        return CalculatorResult(
            calculator="chads2_vasc",
            score=score,
            interpretation=f"Annual stroke risk: {annual_risk}",
            recommendation=recommendation,
            inputs=inputs,
        )
```

### 3.5 Implementation Tasks

| Task                        | Priority | Effort | Dependencies       |
| --------------------------- | -------- | ------ | ------------------ |
| UpToDate API client         | P0       | 3 days | API license        |
| UpToDate search tool        | P0       | 2 days | API client         |
| UpToDate drug interactions  | P0       | 2 days | API client         |
| Enhanced PubMed (MeSH)      | P1       | 2 days | Existing PubMed    |
| PubMed full-text (PMC)      | P1       | 2 days | PMC API            |
| PubMed citation network     | P2       | 2 days | eLink API          |
| Clinical trial search       | P1       | 2 days | ClinicalTrials.gov |
| Medical calculators (20+)   | P0       | 5 days | -                  |
| Calculator tool integration | P1       | 1 day  | Calculators        |
| Caching layer               | P1       | 2 days | Redis              |
| Rate limiting               | P1       | 1 day  | -                  |
| Integration tests           | P1       | 2 days | All components     |
| Documentation               | P2       | 1 day  | All components     |

**Total Effort:** 6-8 weeks

---

## 4. Nextcloud Integration Completion

### 4.1 Overview

**Objective:** Complete Nextcloud integration with SSO, email, contacts, and app packaging.

**Current State:**

- CalDAV calendar: ✅ Complete
- WebDAV file indexer: ✅ Complete
- Email: ⚠️ Skeleton only
- OIDC: ❌ Not implemented
- CardDAV: ❌ Not implemented
- App packaging: ❌ Not implemented
- Google Calendar: ❌ Not implemented

### 4.2 OIDC Single Sign-On

**File:** `services/api-gateway/app/services/oidc_service.py`

```python
class OIDCService:
    """
    OpenID Connect authentication with Nextcloud.

    Flow:
    1. User clicks "Login with Nextcloud"
    2. Redirect to Nextcloud authorization endpoint
    3. User authenticates with Nextcloud
    4. Nextcloud redirects back with authorization code
    5. Exchange code for tokens
    6. Validate ID token and create session

    Required Nextcloud Apps:
    - oidc (OpenID Connect)
    - oauth2 (OAuth 2.0)
    """

    def __init__(
        self,
        issuer: str,  # https://cloud.asimo.io
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        scopes: List[str] = None,
    ):
        self.issuer = issuer
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.scopes = scopes or ["openid", "profile", "email"]

        # OIDC endpoints (discovered or configured)
        self.authorization_endpoint = f"{issuer}/apps/oauth2/authorize"
        self.token_endpoint = f"{issuer}/apps/oauth2/api/v1/token"
        self.userinfo_endpoint = f"{issuer}/ocs/v2.php/cloud/user"
        self.jwks_uri = f"{issuer}/apps/oidc/.well-known/jwks.json"

    async def get_authorization_url(
        self,
        state: str,
        nonce: str,
    ) -> str:
        """Generate authorization URL for redirect."""
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(self.scopes),
            "state": state,
            "nonce": nonce,
        }
        return f"{self.authorization_endpoint}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
    ) -> OIDCTokens:
        """Exchange authorization code for tokens."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
            response.raise_for_status()
            data = response.json()

        return OIDCTokens(
            access_token=data["access_token"],
            id_token=data.get("id_token"),
            refresh_token=data.get("refresh_token"),
            expires_in=data.get("expires_in", 3600),
            token_type=data.get("token_type", "Bearer"),
        )

    async def validate_id_token(
        self,
        id_token: str,
        nonce: str,
    ) -> OIDCClaims:
        """Validate and decode ID token."""
        # Fetch JWKS
        async with httpx.AsyncClient() as client:
            response = await client.get(self.jwks_uri)
            jwks = response.json()

        # Decode and validate
        from jose import jwt

        claims = jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=self.client_id,
            issuer=self.issuer,
        )

        # Verify nonce
        if claims.get("nonce") != nonce:
            raise ValueError("Invalid nonce")

        return OIDCClaims(
            sub=claims["sub"],
            email=claims.get("email"),
            name=claims.get("name"),
            preferred_username=claims.get("preferred_username"),
        )

    async def get_user_info(
        self,
        access_token: str,
    ) -> NextcloudUser:
        """Get user info from Nextcloud OCS API."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.userinfo_endpoint,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "OCS-APIRequest": "true",
                },
            )
            response.raise_for_status()
            data = response.json()

        user_data = data["ocs"]["data"]
        return NextcloudUser(
            id=user_data["id"],
            email=user_data.get("email"),
            display_name=user_data.get("displayname"),
            groups=user_data.get("groups", []),
            quota=user_data.get("quota"),
        )
```

**API Endpoints:**

```python
@router.get("/api/auth/oidc/login")
async def oidc_login(request: Request):
    """Initiate OIDC login flow."""
    state = generate_state()
    nonce = generate_nonce()

    # Store state and nonce in session
    request.session["oidc_state"] = state
    request.session["oidc_nonce"] = nonce

    auth_url = await oidc_service.get_authorization_url(state, nonce)
    return RedirectResponse(auth_url)

@router.get("/api/auth/oidc/callback")
async def oidc_callback(
    code: str,
    state: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle OIDC callback."""
    # Verify state
    if state != request.session.get("oidc_state"):
        raise HTTPException(400, "Invalid state")

    # Exchange code for tokens
    tokens = await oidc_service.exchange_code(code)

    # Validate ID token
    claims = await oidc_service.validate_id_token(
        tokens.id_token,
        request.session.get("oidc_nonce"),
    )

    # Get or create user
    user = await get_or_create_user_from_oidc(db, claims)

    # Store Nextcloud tokens for API access
    await store_nextcloud_tokens(user.id, tokens)

    # Create local session
    access_token, refresh_token = create_tokens(user)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }
```

### 4.3 Complete Email Integration

**File:** `services/api-gateway/app/services/email_service.py` (Enhanced)

```python
class EmailService:
    """
    Complete IMAP/SMTP email integration.

    Features:
    - Folder management
    - Email threading
    - Full-text search
    - Attachment handling
    - Email sending
    - Reply/forward
    - Read receipts
    """

    def __init__(
        self,
        imap_host: str,
        imap_port: int,
        smtp_host: str,
        smtp_port: int,
        username: str,
        password: str,
        use_ssl: bool = True,
    ):
        self.imap_config = IMAPConfig(imap_host, imap_port, use_ssl)
        self.smtp_config = SMTPConfig(smtp_host, smtp_port, use_ssl)
        self.username = username
        self.password = password

    async def list_folders(self) -> List[EmailFolder]:
        """List all email folders."""
        async with self._imap_connection() as imap:
            folders = await imap.list()
            return [EmailFolder(name=f.name, delimiter=f.delimiter) for f in folders]

    async def list_messages(
        self,
        folder: str = "INBOX",
        page: int = 1,
        page_size: int = 50,
        search_query: Optional[str] = None,
    ) -> PaginatedEmails:
        """List messages in folder with pagination."""
        async with self._imap_connection() as imap:
            await imap.select(folder)

            if search_query:
                # Search by subject, from, or body
                message_ids = await imap.search(
                    f'(OR SUBJECT "{search_query}" FROM "{search_query}")'
                )
            else:
                message_ids = await imap.search("ALL")

            # Reverse for newest first
            message_ids = list(reversed(message_ids))

            # Paginate
            start = (page - 1) * page_size
            end = start + page_size
            page_ids = message_ids[start:end]

            # Fetch headers
            messages = await self._fetch_messages(imap, page_ids)

            return PaginatedEmails(
                messages=messages,
                total=len(message_ids),
                page=page,
                page_size=page_size,
            )

    async def get_message(
        self,
        message_id: str,
        folder: str = "INBOX",
    ) -> Email:
        """Get full message content."""
        async with self._imap_connection() as imap:
            await imap.select(folder)
            message = await imap.fetch([message_id], ["RFC822"])

            # Parse email
            email_msg = email.message_from_bytes(message[message_id]["RFC822"])

            return Email(
                id=message_id,
                subject=self._decode_header(email_msg["Subject"]),
                from_addr=self._parse_address(email_msg["From"]),
                to_addrs=self._parse_addresses(email_msg["To"]),
                cc_addrs=self._parse_addresses(email_msg.get("Cc", "")),
                date=self._parse_date(email_msg["Date"]),
                body_text=self._get_body_text(email_msg),
                body_html=self._get_body_html(email_msg),
                attachments=self._get_attachments(email_msg),
                thread_id=email_msg.get("In-Reply-To"),
            )

    async def send_email(
        self,
        to: List[str],
        subject: str,
        body: str,
        cc: List[str] = None,
        bcc: List[str] = None,
        attachments: List[EmailAttachment] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send an email."""
        msg = MIMEMultipart("mixed")
        msg["From"] = self.username
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject

        if cc:
            msg["Cc"] = ", ".join(cc)
        if reply_to:
            msg["In-Reply-To"] = reply_to
            msg["References"] = reply_to

        # Add body
        msg.attach(MIMEText(body, "html" if "<html>" in body else "plain"))

        # Add attachments
        if attachments:
            for attachment in attachments:
                part = MIMEApplication(attachment.content)
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=attachment.filename,
                )
                msg.attach(part)

        # Send via SMTP
        async with self._smtp_connection() as smtp:
            all_recipients = to + (cc or []) + (bcc or [])
            await smtp.sendmail(self.username, all_recipients, msg.as_string())

        return True

    async def get_thread(self, message_id: str) -> List[Email]:
        """Get all messages in a thread."""
        # Get thread references
        message = await self.get_message(message_id)
        thread_id = message.thread_id or message_id

        # Search for all messages in thread
        async with self._imap_connection() as imap:
            await imap.select("INBOX")

            # Search by References header
            message_ids = await imap.search(f'HEADER "References" "{thread_id}"')

            # Also search for original message
            original_ids = await imap.search(f'HEADER "Message-ID" "{thread_id}"')

            all_ids = list(set(message_ids + original_ids))

            messages = []
            for msg_id in all_ids:
                messages.append(await self.get_message(msg_id))

            # Sort by date
            messages.sort(key=lambda m: m.date)

            return messages
```

### 4.4 CardDAV Contacts Integration

**File:** `services/api-gateway/app/services/carddav_service.py`

```python
class CardDAVService:
    """
    CardDAV contacts integration with Nextcloud.

    Features:
    - List contacts
    - Search contacts
    - Create/update/delete contacts
    - Contact groups
    - vCard import/export
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
    ):
        self.base_url = base_url
        self.username = username
        self.password = password
        self.carddav_url = f"{base_url}/remote.php/dav/addressbooks/users/{username}"

    async def list_address_books(self) -> List[AddressBook]:
        """List all address books."""
        async with httpx.AsyncClient(auth=(self.username, self.password)) as client:
            response = await client.request(
                "PROPFIND",
                self.carddav_url,
                headers={"Depth": "1"},
                content=PROPFIND_ADDRESSBOOKS,
            )

            # Parse response
            return self._parse_address_books(response.text)

    async def list_contacts(
        self,
        address_book: str = "contacts",
        query: Optional[str] = None,
    ) -> List[Contact]:
        """List all contacts in address book."""
        url = f"{self.carddav_url}/{address_book}"

        if query:
            # Use AddressBook Query Report
            content = self._build_search_query(query)
            method = "REPORT"
        else:
            content = PROPFIND_CONTACTS
            method = "PROPFIND"

        async with httpx.AsyncClient(auth=(self.username, self.password)) as client:
            response = await client.request(
                method,
                url,
                headers={"Depth": "1"},
                content=content,
            )

            return self._parse_contacts(response.text)

    async def get_contact(
        self,
        uid: str,
        address_book: str = "contacts",
    ) -> Contact:
        """Get a single contact by UID."""
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        async with httpx.AsyncClient(auth=(self.username, self.password)) as client:
            response = await client.get(url)
            response.raise_for_status()

            return self._parse_vcard(response.text)

    async def create_contact(
        self,
        contact: Contact,
        address_book: str = "contacts",
    ) -> str:
        """Create a new contact."""
        uid = contact.uid or str(uuid.uuid4())
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        vcard = self._contact_to_vcard(contact)

        async with httpx.AsyncClient(auth=(self.username, self.password)) as client:
            response = await client.put(
                url,
                content=vcard,
                headers={"Content-Type": "text/vcard"},
            )
            response.raise_for_status()

        return uid

    async def update_contact(
        self,
        contact: Contact,
        address_book: str = "contacts",
    ) -> bool:
        """Update an existing contact."""
        return await self.create_contact(contact, address_book)

    async def delete_contact(
        self,
        uid: str,
        address_book: str = "contacts",
    ) -> bool:
        """Delete a contact."""
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        async with httpx.AsyncClient(auth=(self.username, self.password)) as client:
            response = await client.delete(url)
            return response.status_code == 204

    async def search_contacts(
        self,
        query: str,
        fields: List[str] = None,
    ) -> List[Contact]:
        """Search contacts by name, email, phone, etc."""
        fields = fields or ["FN", "EMAIL", "TEL", "ORG"]

        # Build CardDAV search query
        filters = " ".join([
            f'<C:prop-filter name="{field}">'
            f'<C:text-match collation="i;unicode-casemap" '
            f'match-type="contains">{query}</C:text-match>'
            f'</C:prop-filter>'
            for field in fields
        ])

        search_query = f"""<?xml version="1.0" encoding="utf-8"?>
        <C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
          <D:prop>
            <D:getetag/>
            <C:address-data/>
          </D:prop>
          <C:filter test="anyof">
            {filters}
          </C:filter>
        </C:addressbook-query>"""

        return await self.list_contacts(query=search_query)
```

### 4.5 Google Calendar Sync

**File:** `services/api-gateway/app/services/google_calendar_service.py`

```python
class GoogleCalendarService:
    """
    Google Calendar synchronization.

    Flow:
    1. User authorizes Google Calendar access
    2. Store OAuth tokens
    3. Sync events bidirectionally
    4. Handle conflicts

    APIs:
    - Google Calendar API v3
    - OAuth 2.0 for web applications
    """

    SCOPES = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
    ]

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    async def get_authorization_url(self, state: str) -> str:
        """Generate Google OAuth authorization URL."""
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    async def exchange_code(self, code: str) -> GoogleTokens:
        """Exchange authorization code for tokens."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": self.redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            data = response.json()

        return GoogleTokens(
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token"),
            expires_in=data["expires_in"],
        )

    async def list_calendars(
        self,
        access_token: str,
    ) -> List[GoogleCalendar]:
        """List user's Google Calendars."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            data = response.json()

        return [
            GoogleCalendar(
                id=item["id"],
                summary=item["summary"],
                primary=item.get("primary", False),
                access_role=item.get("accessRole"),
            )
            for item in data.get("items", [])
        ]

    async def list_events(
        self,
        access_token: str,
        calendar_id: str = "primary",
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        max_results: int = 100,
    ) -> List[GoogleEvent]:
        """List events from a calendar."""
        params = {
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }

        if time_min:
            params["timeMin"] = time_min.isoformat() + "Z"
        if time_max:
            params["timeMax"] = time_max.isoformat() + "Z"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
            response.raise_for_status()
            data = response.json()

        return [self._parse_event(item) for item in data.get("items", [])]

    async def sync_to_nextcloud(
        self,
        user_id: str,
        google_tokens: GoogleTokens,
        nextcloud_calendar: str,
    ) -> SyncResult:
        """Sync Google Calendar events to Nextcloud."""
        # Get events from Google
        google_events = await self.list_events(
            google_tokens.access_token,
            time_min=datetime.utcnow() - timedelta(days=30),
            time_max=datetime.utcnow() + timedelta(days=365),
        )

        # Get existing events from Nextcloud
        caldav_service = CalDAVService(...)
        nextcloud_events = await caldav_service.list_events(nextcloud_calendar)

        # Build sync map
        nc_by_google_id = {
            e.metadata.get("google_id"): e
            for e in nextcloud_events
            if e.metadata.get("google_id")
        }

        created = 0
        updated = 0

        for google_event in google_events:
            if google_event.id in nc_by_google_id:
                # Update existing
                nc_event = nc_by_google_id[google_event.id]
                if self._event_changed(google_event, nc_event):
                    await caldav_service.update_event(
                        nc_event.id,
                        self._google_to_caldav(google_event),
                    )
                    updated += 1
            else:
                # Create new
                await caldav_service.create_event(
                    nextcloud_calendar,
                    self._google_to_caldav(google_event),
                )
                created += 1

        return SyncResult(
            source="google",
            destination="nextcloud",
            created=created,
            updated=updated,
            errors=[],
        )
```

### 4.6 Nextcloud App Packaging

**Directory Structure:**

```
nextcloud-apps/
├── voiceassist/
│   ├── appinfo/
│   │   ├── info.xml          # App metadata
│   │   ├── routes.php        # App routes
│   │   └── app.php           # App initialization
│   ├── lib/
│   │   ├── AppInfo/
│   │   │   └── Application.php
│   │   ├── Controller/
│   │   │   ├── PageController.php
│   │   │   └── ApiController.php
│   │   └── Service/
│   │       └── VoiceAssistService.php
│   ├── templates/
│   │   └── main.php          # Main template
│   ├── js/
│   │   └── voiceassist.js    # Bundled React app
│   ├── css/
│   │   └── voiceassist.css   # Styles
│   ├── img/
│   │   └── app.svg           # App icon
│   └── README.md
```

**appinfo/info.xml:**

```xml
<?xml version="1.0"?>
<info xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="https://apps.nextcloud.com/schema/apps/info.xsd">
    <id>voiceassist</id>
    <name>VoiceAssist</name>
    <summary>AI-powered voice assistant for clinical decision support</summary>
    <description><![CDATA[
VoiceAssist is an enterprise medical AI assistant that provides:
- Voice-enabled clinical queries
- Evidence-based recommendations
- Drug interaction checking
- Medical calculators
- Integration with Nextcloud files and calendar
    ]]></description>
    <version>1.0.0</version>
    <licence>agpl</licence>
    <author mail="dev@asimo.io">Asimo</author>
    <namespace>VoiceAssist</namespace>
    <category>tools</category>
    <website>https://voiceassist.asimo.io</website>
    <bugs>https://github.com/asimo/voiceassist/issues</bugs>
    <repository>https://github.com/asimo/voiceassist</repository>
    <dependencies>
        <nextcloud min-version="27" max-version="29"/>
        <php min-version="8.1"/>
    </dependencies>
    <navigations>
        <navigation>
            <name>VoiceAssist</name>
            <route>voiceassist.page.index</route>
            <icon>app.svg</icon>
            <order>10</order>
        </navigation>
    </navigations>
    <settings>
        <admin>OCA\VoiceAssist\Settings\Admin</admin>
        <admin-section>OCA\VoiceAssist\Settings\AdminSection</admin-section>
    </settings>
</info>
```

### 4.7 Implementation Tasks

| Task                        | Priority | Effort | Dependencies         |
| --------------------------- | -------- | ------ | -------------------- |
| OIDC service implementation | P0       | 3 days | Nextcloud OIDC app   |
| OIDC API endpoints          | P0       | 2 days | OIDC service         |
| Frontend OIDC integration   | P0       | 2 days | OIDC endpoints       |
| Email service enhancement   | P1       | 4 days | IMAP/SMTP access     |
| Email threading             | P1       | 2 days | Email service        |
| Email search                | P1       | 1 day  | Email service        |
| CardDAV service             | P1       | 3 days | Nextcloud CardDAV    |
| Contact search              | P2       | 1 day  | CardDAV service      |
| Google Calendar OAuth       | P1       | 2 days | Google Cloud project |
| Google Calendar sync        | P1       | 3 days | OAuth, CalDAV        |
| Nextcloud app structure     | P1       | 2 days | -                    |
| React app bundling for NC   | P1       | 2 days | Frontend build       |
| Nextcloud app store prep    | P2       | 2 days | App structure        |
| Integration tests           | P1       | 2 days | All components       |
| Documentation               | P2       | 1 day  | All components       |

**Total Effort:** 4-5 weeks

---

## Implementation Phases

### Phase 2.1: Voice Pipeline (Weeks 1-4)

**Objectives:**

- Full OpenAI Realtime API integration
- Browser audio capture and playback
- VAD and barge-in support

**Milestones:**

- Week 1: OpenAI Realtime client, WebSocket audio endpoint
- Week 2: Frontend audio capture, basic streaming
- Week 3: VAD integration, barge-in handling
- Week 4: Voice authentication (optional), testing

**Deliverables:**

- `services/api-gateway/app/services/openai_realtime.py`
- `services/api-gateway/app/api/voice.py`
- `apps/web-app/src/hooks/useVoiceSession.ts`
- Integration tests

### Phase 2.2: Advanced Medical AI (Weeks 5-9)

**Objectives:**

- Medical-specific embeddings
- Multi-hop reasoning
- Enhanced NER

**Milestones:**

- Week 5-6: PubMedBERT integration, hybrid embeddings
- Week 7: Medical NER, UMLS linking
- Week 8: Multi-hop reasoning engine
- Week 9: Cross-document synthesis, testing

**Deliverables:**

- `services/api-gateway/app/services/medical_embeddings.py`
- `services/api-gateway/app/services/medical_ner.py`
- `services/api-gateway/app/services/multi_hop_reasoning.py`
- Benchmarking results

### Phase 2.3: External Medical Integrations (Weeks 10-17)

**Objectives:**

- UpToDate API integration
- Enhanced PubMed
- Comprehensive medical calculators

**Milestones:**

- Week 10-12: UpToDate API client, tools
- Week 13-14: Enhanced PubMed (full-text, citations)
- Week 15-16: Medical calculators (20+)
- Week 17: Integration, testing

**Deliverables:**

- `services/api-gateway/app/services/uptodate_service.py`
- `services/api-gateway/app/services/pubmed_enhanced.py`
- `services/api-gateway/app/tools/medical_calculators.py`
- Tool integrations

### Phase 2.4: Nextcloud Completion (Weeks 18-22)

**Objectives:**

- OIDC SSO
- Complete email integration
- CardDAV contacts
- Google Calendar sync
- App packaging

**Milestones:**

- Week 18-19: OIDC SSO implementation
- Week 20: Email integration completion
- Week 21: CardDAV, Google Calendar
- Week 22: Nextcloud app packaging, testing

**Deliverables:**

- `services/api-gateway/app/services/oidc_service.py`
- `services/api-gateway/app/services/email_service.py` (enhanced)
- `services/api-gateway/app/services/carddav_service.py`
- `services/api-gateway/app/services/google_calendar_service.py`
- `nextcloud-apps/voiceassist/`

---

## Technical Architecture

### New Services Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      VoiceAssist Backend (Enhanced)                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        API Layer (FastAPI)                         │ │
│  │  /api/auth/*    /api/voice/*    /api/medical/*    /api/calendar/* │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────┬─────────────┬─────┴─────┬─────────────┬─────────────┐ │
│  │   Voice     │   Medical   │   Integ-  │   Nextcloud │   Existing  │ │
│  │   Gateway   │   AI        │   rations │   Services  │   Services  │ │
│  ├─────────────┼─────────────┼───────────┼─────────────┼─────────────┤ │
│  │ OpenAI RT   │ Medical Emb │ UpToDate  │ OIDC        │ RAG         │ │
│  │ VAD         │ Medical NER │ PubMed+   │ Email       │ Search      │ │
│  │ Barge-in    │ Multi-hop   │ Calc      │ CardDAV     │ LLM Client  │ │
│  │ Voice Auth  │ Synthesis   │           │ Google Cal  │ Cache       │ │
│  └─────────────┴─────────────┴───────────┴─────────────┴─────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Data Layer                                   │ │
│  │  PostgreSQL    Redis    Qdrant    Nextcloud    External APIs       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Dependencies

**Backend (requirements.txt additions):**

```
# Voice Pipeline
websockets>=12.0
aiohttp>=3.9.0

# Medical AI
transformers>=4.36.0
torch>=2.1.0
scispacy>=0.5.3
spacy>=3.7.0

# Additional scispaCy models (install separately):
# pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.3/en_core_sci_lg-0.5.3.tar.gz
# pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.3/en_ner_bc5cdr_md-0.5.3.tar.gz

# Integrations
google-api-python-client>=2.111.0
google-auth-oauthlib>=1.2.0
vobject>=0.9.6.1  # vCard parsing

# Email
aiosmtplib>=3.0.0
aioimaplib>=1.0.1
```

**Environment Variables (additions):**

```bash
# Voice Pipeline
OPENAI_REALTIME_ENABLED=true
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-10-01
VOICE_VAD_MODE=openai

# Medical AI
MEDICAL_EMBEDDING_MODEL=pubmedbert  # openai, pubmedbert, biogpt
MEDICAL_EMBEDDING_DEVICE=cuda  # cuda, cpu, mps
UMLS_API_KEY=  # For UMLS concept linking

# UpToDate
UPTODATE_API_KEY=
UPTODATE_API_SECRET=
UPTODATE_BASE_URL=https://api.uptodate.com/v1

# OIDC
OIDC_ENABLED=true
OIDC_ISSUER=https://cloud.asimo.io
OIDC_CLIENT_ID=voiceassist
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=https://voiceassist.asimo.io/api/auth/oidc/callback

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://voiceassist.asimo.io/api/auth/google/callback
```

---

## Risk Assessment

### High Risks

| Risk                                | Impact | Probability | Mitigation                                  |
| ----------------------------------- | ------ | ----------- | ------------------------------------------- |
| OpenAI Realtime API changes         | High   | Medium      | Abstract API layer, monitor announcements   |
| UpToDate license cost               | High   | High        | Negotiate enterprise pricing, usage caps    |
| GPU requirements for medical models | High   | Medium      | Cloud GPU (Lambda, AWS), model optimization |
| Voice latency issues                | High   | Medium      | Edge deployment, audio optimization         |

### Medium Risks

| Risk                          | Impact | Probability | Mitigation                      |
| ----------------------------- | ------ | ----------- | ------------------------------- |
| Nextcloud OIDC compatibility  | Medium | Medium      | Test with multiple NC versions  |
| Google API quota limits       | Medium | Low         | Request quota increase, caching |
| Email threading complexity    | Medium | Medium      | Start with basic threading      |
| Browser audio API differences | Medium | Medium      | Polyfills, feature detection    |

### Low Risks

| Risk                   | Impact | Probability | Mitigation                         |
| ---------------------- | ------ | ----------- | ---------------------------------- |
| CardDAV parsing issues | Low    | Low         | Use established library (vobject)  |
| Calculator accuracy    | Low    | Low         | Validate against established tools |
| App store rejection    | Low    | Medium      | Follow NC guidelines strictly      |

---

## Success Metrics

### Voice Pipeline

| Metric                                           | Target  | Measurement                         |
| ------------------------------------------------ | ------- | ----------------------------------- |
| Voice latency (user speech to AI response start) | < 500ms | P95 latency                         |
| Transcription accuracy                           | > 95%   | Word Error Rate                     |
| Barge-in success rate                            | > 90%   | Successful interruptions / attempts |
| Voice session stability                          | > 99%   | Sessions without errors             |

### Medical AI

| Metric                      | Target | Measurement           |
| --------------------------- | ------ | --------------------- |
| Medical query accuracy      | > 90%  | Expert evaluation     |
| Multi-hop reasoning success | > 80%  | Correct decomposition |
| Entity recognition F1       | > 85%  | Standard NER metrics  |
| Embedding quality           | > 0.8  | Mean reciprocal rank  |

### External Integrations

| Metric                  | Target  | Measurement                  |
| ----------------------- | ------- | ---------------------------- |
| UpToDate cache hit rate | > 70%   | Cache hits / total requests  |
| Calculator accuracy     | 100%    | Validated against references |
| API availability        | > 99.5% | Successful requests          |

### Nextcloud Integration

| Metric                  | Target | Measurement                  |
| ----------------------- | ------ | ---------------------------- |
| OIDC login success rate | > 99%  | Successful logins / attempts |
| Email sync reliability  | > 99%  | Successful syncs             |
| Calendar sync accuracy  | 100%   | Events correctly synced      |

---

## Appendices

### Appendix A: File Structure (New Files)

```
services/api-gateway/app/
├── api/
│   ├── voice.py                      # NEW: Voice WebSocket endpoint
│   └── oidc.py                       # NEW: OIDC endpoints
├── services/
│   ├── openai_realtime.py            # NEW: OpenAI Realtime client
│   ├── vad_service.py                # NEW: Voice Activity Detection
│   ├── barge_in_handler.py           # NEW: Barge-in handling
│   ├── voice_auth.py                 # NEW: Voice authentication
│   ├── medical_embeddings.py         # NEW: Medical embeddings
│   ├── medical_ner.py                # NEW: Medical NER
│   ├── multi_hop_reasoning.py        # NEW: Multi-hop reasoning
│   ├── document_synthesis.py         # NEW: Cross-doc synthesis
│   ├── uptodate_service.py           # NEW: UpToDate API
│   ├── pubmed_enhanced.py            # NEW: Enhanced PubMed
│   ├── oidc_service.py               # NEW: OIDC authentication
│   ├── email_service.py              # ENHANCED
│   ├── carddav_service.py            # NEW: CardDAV contacts
│   └── google_calendar_service.py    # NEW: Google Calendar
└── tools/
    └── medical_calculators.py        # NEW: 20+ calculators

apps/web-app/src/
├── hooks/
│   ├── useVoiceSession.ts            # NEW: Voice session hook
│   └── useAudioProcessing.ts         # NEW: Audio processing hook
└── components/
    └── VoiceMode/
        ├── VoiceButton.tsx           # NEW
        ├── AudioVisualizer.tsx       # NEW
        └── TranscriptPanel.tsx       # NEW

nextcloud-apps/voiceassist/           # NEW: Complete Nextcloud app
```

### Appendix B: Database Migrations

**New Tables:**

```sql
-- Voice profiles for authentication
CREATE TABLE voice_profiles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    profile_data BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- External API credentials per user
CREATE TABLE user_credentials (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    provider VARCHAR(50) NOT NULL,  -- google, uptodate, etc.
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE(user_id, provider)
);

-- OIDC sessions
CREATE TABLE oidc_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    nextcloud_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL
);

-- Email sync state
CREATE TABLE email_sync_state (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    folder VARCHAR(255) NOT NULL,
    last_uid INTEGER,
    last_sync TIMESTAMP,
    UNIQUE(user_id, folder)
);

-- Calculator history
CREATE TABLE calculator_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    calculator_name VARCHAR(100) NOT NULL,
    inputs JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL
);
```

### Appendix C: API Endpoints Summary

**New Endpoints:**

```
# Voice
WS  /api/voice/ws                      # Voice WebSocket
POST /api/voice/profiles               # Create voice profile
GET  /api/voice/profiles               # List voice profiles
POST /api/voice/verify                 # Verify voice

# OIDC
GET  /api/auth/oidc/login              # Initiate OIDC login
GET  /api/auth/oidc/callback           # OIDC callback
POST /api/auth/oidc/logout             # OIDC logout

# Google Calendar
GET  /api/auth/google/login            # Initiate Google OAuth
GET  /api/auth/google/callback         # Google callback
GET  /api/calendar/google/calendars    # List Google calendars
GET  /api/calendar/google/events       # List Google events
POST /api/calendar/google/sync         # Sync to Nextcloud

# Email
GET  /api/email/folders                # List folders
GET  /api/email/messages               # List messages
GET  /api/email/messages/{id}          # Get message
GET  /api/email/threads/{id}           # Get thread
POST /api/email/send                   # Send email

# Contacts
GET  /api/contacts                     # List contacts
GET  /api/contacts/{id}                # Get contact
POST /api/contacts                     # Create contact
PUT  /api/contacts/{id}                # Update contact
DELETE /api/contacts/{id}              # Delete contact
GET  /api/contacts/search              # Search contacts

# UpToDate
GET  /api/medical/uptodate/search      # Search UpToDate
GET  /api/medical/uptodate/topics/{id} # Get topic
POST /api/medical/uptodate/interactions # Drug interactions

# Calculators
GET  /api/medical/calculators          # List calculators
GET  /api/medical/calculators/{id}     # Get calculator info
POST /api/medical/calculators/{id}     # Run calculator
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for completing the deferred backend features in VoiceAssist. The plan is structured into four major areas:

1. **Voice Pipeline** - Enabling natural voice interactions
2. **Advanced Medical AI** - Specialized embeddings and reasoning
3. **External Medical Integrations** - Premium knowledge sources
4. **Nextcloud Integration** - Complete SSO and productivity features

**Key Success Factors:**

- Phased implementation to manage complexity
- Clear dependencies and milestones
- Comprehensive testing at each phase
- Documentation throughout

**Next Steps:**

1. Review and approve this plan
2. Obtain necessary licenses (UpToDate, UMLS)
3. Set up GPU infrastructure for medical models
4. Begin Phase 2.1: Voice Pipeline

---

**Document Version:** 1.0
**Created:** 2025-11-26
**Author:** Claude Code
**Status:** Draft - Pending Review
