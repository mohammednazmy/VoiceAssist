---
title: Voice & Realtime Debugging Guide
slug: debugging/voice-realtime
summary: >-
  Debug WebSocket connections, STT, TTS, and voice pipeline issues in
  VoiceAssist.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-02"
audience:
  - human
  - agent
  - ai-agents
  - backend
  - frontend
  - sre
tags:
  - debugging
  - runbook
  - voice
  - realtime
  - websocket
  - stt
  - tts
  - troubleshooting
  - thinker-talker
relatedServices:
  - api-gateway
  - web-app
category: debugging
version: 2.0.0
ai_summary: >-
  Last Updated: 2025-12-02 Components: Voice pipeline, WebSocket service,
  STT/TTS --- VoiceAssist has two voice pipelines: Always debug Thinker-Talker
  first unless specifically working with the legacy pipeline. ---
  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ │ Browser
  │───▶│ De...
---

# Voice & Realtime Debugging Guide

**Last Updated:** 2025-12-02
**Components:** Voice pipeline, WebSocket service, STT/TTS

---

## Voice Pipeline Overview

VoiceAssist has two voice pipelines:

| Pipeline                | Status          | Endpoint                 | Components                             |
| ----------------------- | --------------- | ------------------------ | -------------------------------------- |
| **Thinker-Talker**      | Primary         | `/api/voice/pipeline-ws` | Deepgram STT → GPT-4o → ElevenLabs TTS |
| **OpenAI Realtime API** | Legacy/Fallback | `/api/realtime`          | OpenAI Realtime API (WebSocket)        |

**Always debug Thinker-Talker first** unless specifically working with the legacy pipeline.

---

## Part A: Thinker-Talker Voice Pipeline (Primary)

### Architecture

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Browser   │───▶│ Deepgram    │───▶│  GPT-4o      │───▶│ ElevenLabs  │
│ Audio Input │    │ STT Service │    │ Thinker Svc  │    │ TTS Service │
└─────────────┘    └─────────────┘    └──────────────┘    └─────────────┘
       │                  │                  │                  │
       │                  ▼                  ▼                  ▼
       │           transcript.delta    response.delta     audio.output
       │           transcript.complete response.complete
       └───────────────────────────────────────────────────────────────▶
                                WebSocket Messages
```

### Key Files

| File                                                  | Purpose                               |
| ----------------------------------------------------- | ------------------------------------- |
| `app/services/voice_pipeline_service.py`              | Main pipeline orchestrator            |
| `app/services/thinker_service.py`                     | LLM service (GPT-4o, tool calling)    |
| `app/services/talker_service.py`                      | TTS service (ElevenLabs streaming)    |
| `app/services/streaming_stt_service.py`               | STT service (Deepgram streaming)      |
| `app/services/sentence_chunker.py`                    | Phrase-level chunking for low latency |
| `app/services/thinker_talker_websocket_handler.py`    | WebSocket handler                     |
| `apps/web-app/src/hooks/useThinkerTalkerSession.ts`   | Client WebSocket hook                 |
| `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts` | Voice mode state machine              |

### WebSocket Message Types

| Message Type          | Direction     | Description                    |
| --------------------- | ------------- | ------------------------------ |
| `audio.input`         | Client→Server | Base64-encoded PCM audio       |
| `transcript.delta`    | Server→Client | Partial transcript from STT    |
| `transcript.complete` | Server→Client | Final transcript               |
| `response.delta`      | Server→Client | Streaming LLM token            |
| `response.complete`   | Server→Client | Full LLM response              |
| `audio.output`        | Server→Client | Base64-encoded TTS audio chunk |
| `tool.call`           | Server→Client | Function/tool invocation       |
| `tool.result`         | Server→Client | Tool execution result          |
| `voice.state`         | Server→Client | Pipeline state change          |
| `error`               | Server→Client | Error notification             |

### Pipeline States

```python
PipelineState = {
    IDLE,           # Waiting for input
    LISTENING,      # Recording user audio
    PROCESSING,     # Running STT/LLM
    SPEAKING,       # Playing TTS audio
    CANCELLED,      # Barge-in triggered
    ERROR
}
```

### Thinker-Talker Debugging

#### No Transcripts

**Likely Causes:**

- Deepgram API key invalid or expired
- Audio not reaching server
- Wrong audio format (expects 16kHz PCM16)
- Deepgram service down

**Steps to Investigate:**

1. Check Deepgram health:

```bash
# Check environment variable
echo $DEEPGRAM_API_KEY | head -c 10

# Test Deepgram directly
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @test.wav
```

2. Check server logs for STT errors:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -iE "deepgram|stt|transcri"
```

3. Verify audio format in client:

```javascript
// Should be PCM16 at 16kHz
console.log("Sample rate:", audioContext.sampleRate);
// If 48kHz, ensure resampling is active
```

4. Check WebSocket messages in browser DevTools → Network → WS.

**Relevant Code:**

- `app/services/streaming_stt_service.py` - Deepgram integration

#### No LLM Response

**Likely Causes:**

- OpenAI API key invalid
- Rate limiting
- Context too long
- Tool call hanging

**Steps to Investigate:**

1. Check Thinker service logs:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -iE "thinker|openai|llm|gpt"
```

2. Verify OpenAI API:

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 10}'
```

3. Check for tool call issues:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -iE "tool|function|call"
```

**Relevant Code:**

- `app/services/thinker_service.py` - LLM orchestration
- `app/services/llm_client.py` - OpenAI client

#### No Audio Output

**Likely Causes:**

- ElevenLabs API key invalid
- Voice ID not found
- TTS service failed
- Audio not playing in browser (autoplay policy)

**Steps to Investigate:**

1. Check ElevenLabs health:

```bash
curl https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | jq '.voices[0].voice_id'
```

2. Check Talker service logs:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -iE "talker|elevenlabs|tts|audio"
```

3. Verify voice ID in config:

```bash
grep -r "voice_id" services/api-gateway/app/core/config.py
# Default: TxGEqnHWrfWFTfGW9XjX (Josh)
```

4. Check browser autoplay:

```javascript
// AudioContext must be resumed after user interaction
if (audioContext.state === "suspended") {
  await audioContext.resume();
}
```

**Relevant Code:**

- `app/services/talker_service.py` - TTS orchestration
- `app/services/elevenlabs_service.py` - ElevenLabs client

#### Barge-in Not Working

**Likely Causes:**

- Barge-in disabled in config
- Voice Activity Detection (VAD) not triggering
- Audio overlap prevention issue

**Steps to Investigate:**

1. Check config:

```python
# In voice_pipeline_service.py
PipelineConfig:
  barge_in_enabled: True  # Should be True
```

2. Check VAD sensitivity:

```javascript
// Client-side VAD config
const vadConfig = {
  threshold: 0.5, // Lower = more sensitive
  minSpeechFrames: 3,
};
```

3. Check logs for barge-in events:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -iE "barge|cancel|interrupt"
```

**Relevant Code:**

- `app/services/voice_pipeline_service.py` - `barge_in()` method
- `apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts` - Client barge-in

#### High Latency

**Targets:**

| Metric                   | Target  | Alert   |
| ------------------------ | ------- | ------- |
| STT latency              | < 300ms | > 800ms |
| First LLM token          | < 500ms | > 1.5s  |
| First TTS audio          | < 200ms | > 600ms |
| Total (speech-to-speech) | < 1.2s  | > 3s    |

**Steps to Investigate:**

1. Check pipeline metrics:

```bash
curl http://localhost:8000/api/voice/metrics | jq '.'
```

2. Check sentence chunker config:

```python
# In sentence_chunker.py - phrase-level for low latency
ChunkerConfig:
  min_chunk_chars: 15    # Avoid tiny fragments
  optimal_chunk_chars: 50 # Clause boundary
  max_chunk_chars: 80    # Force split limit
```

3. Enable debug logging:

```bash
export VOICE_LOG_LEVEL=DEBUG
docker restart voiceassist-server
```

---

## Part B: Legacy OpenAI Realtime API (Fallback)

> **Note:** This pipeline is maintained for backward compatibility. Prefer Thinker-Talker for new development.

### Key Files

| File                                                | Purpose                     |
| --------------------------------------------------- | --------------------------- |
| `app/api/realtime.py`                               | Legacy WebSocket endpoint   |
| `app/services/realtime_voice_service.py`            | OpenAI Realtime integration |
| `apps/web-app/src/hooks/useRealtimeVoiceSession.ts` | Legacy client hook          |

### Legacy Debugging

For OpenAI Realtime API issues, refer to:

- OpenAI Realtime API documentation
- Check `OPENAI_API_KEY` environment variable
- Verify WebSocket connection to `/api/realtime`

---

## Part C: Common Issues (Both Pipelines)

## Symptoms

### WebSocket Won't Connect

**Likely Causes:**

- CORS blocking WebSocket upgrade
- Wrong WebSocket URL (ws vs wss)
- Proxy not forwarding upgrade headers
- Auth token invalid

**Steps to Investigate:**

1. Check browser console for errors:

```
WebSocket connection to 'wss://...' failed
```

2. Verify WebSocket URL:

```javascript
// Thinker-Talker voice pipeline (primary)
const voiceWsUrl = `wss://assist.asimo.io/api/voice/pipeline-ws?token=${accessToken}`;

// Chat streaming
const chatWsUrl = `wss://assist.asimo.io/api/realtime/ws?token=${accessToken}`;
```

3. Test WebSocket connection manually:

```bash
# Test Thinker-Talker voice pipeline (primary)
websocat "wss://assist.asimo.io/api/voice/pipeline-ws?token=YOUR_TOKEN"

# Test chat streaming WebSocket
wscat -c "wss://assist.asimo.io/api/realtime/ws?token=YOUR_TOKEN"
```

4. Check Apache/Nginx proxy config:

```apache
# WebSocket proxy for API endpoints
ProxyPass /api/voice/pipeline-ws ws://127.0.0.1:8000/api/voice/pipeline-ws
ProxyPassReverse /api/voice/pipeline-ws ws://127.0.0.1:8000/api/voice/pipeline-ws
ProxyPass /api/realtime/ws ws://127.0.0.1:8000/api/realtime/ws
ProxyPassReverse /api/realtime/ws ws://127.0.0.1:8000/api/realtime/ws

# WebSocket upgrade headers
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/api/(.*)$ ws://127.0.0.1:8000/api/$1 [P,L]
```

**Relevant Code Paths:**

- `services/api-gateway/app/api/websocket.py` - WebSocket endpoint
- `apps/web-app/src/services/websocket/` - Client connection
- Apache config: `/etc/apache2/sites-available/`

---

### WebSocket Disconnects Frequently

**Likely Causes:**

- Idle timeout (30-60s default)
- Network instability
- Server restarting
- Memory pressure on server

**Steps to Investigate:**

1. Check disconnect reason:

```javascript
socket.onclose = (event) => {
  console.log("Close code:", event.code);
  console.log("Close reason:", event.reason);
};
// 1000 = normal, 1001 = going away, 1006 = abnormal
```

2. Check server logs for connection drops:

```bash
docker logs voiceassist-server --since "10m" 2>&1 | grep -i "websocket\|disconnect"
```

3. Implement heartbeat/ping:

```javascript
// Client side
setInterval(() => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ping" }));
  }
}, 30000);
```

4. Check proxy timeouts:

```apache
ProxyTimeout 300
# Or
ProxyBadHeader Ignore
```

**Relevant Code Paths:**

- `services/api-gateway/app/api/websocket.py` - Connection handling
- `apps/web-app/src/services/websocket/WebSocketService.ts` - Reconnection logic

---

### Audio Not Recording

**Likely Causes:**

- Browser permission denied
- MediaRecorder not supported
- Wrong audio format
- AudioContext suspended

**Steps to Investigate:**

1. Check browser permissions:

```javascript
const permission = await navigator.permissions.query({ name: "microphone" });
console.log("Microphone permission:", permission.state);
// 'granted', 'denied', or 'prompt'
```

2. Request microphone access:

```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Got audio stream:", stream);
} catch (err) {
  console.error("Microphone error:", err.name, err.message);
}
```

3. Check MediaRecorder support:

```javascript
console.log("MediaRecorder supported:", typeof MediaRecorder !== "undefined");
console.log("Supported MIME types:");
["audio/webm", "audio/mp4", "audio/ogg"].forEach((type) => {
  console.log(type, MediaRecorder.isTypeSupported(type));
});
```

4. Resume AudioContext (required after user interaction):

```javascript
const audioContext = new AudioContext();
if (audioContext.state === "suspended") {
  await audioContext.resume();
}
```

**Relevant Code Paths:**

- `apps/web-app/src/services/voice/VoiceRecorder.ts`
- `apps/web-app/src/hooks/useVoiceInput.ts`

---

### Speech-to-Text (STT) Not Working

**Likely Causes:**

- Audio format not supported
- STT service down
- API key invalid
- Audio too quiet/noisy

**Steps to Investigate:**

1. Check STT service logs:

```bash
docker logs voiceassist-server --since "5m" 2>&1 | grep -i "stt\|transcri\|whisper"
```

2. Verify audio is being sent:

```javascript
// Log audio blob details
console.log("Audio blob:", blob.size, blob.type);
// Should be > 0 bytes and correct MIME type
```

3. Test STT directly:

```bash
# Test OpenAI Whisper API
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file=@test.mp3 \
  -F model=whisper-1
```

4. Check audio quality:

```javascript
// Analyze audio levels
const analyser = audioContext.createAnalyser();
// Connect to microphone stream
// Check for sufficient amplitude
```

**Relevant Code Paths:**

- `services/api-gateway/app/services/stt_service.py`
- `services/api-gateway/app/api/voice.py`

---

### Text-to-Speech (TTS) Not Playing

**Likely Causes:**

- AudioContext suspended (autoplay policy)
- Audio element not connected
- TTS API failure
- Wrong audio format/codec

**Steps to Investigate:**

1. Check AudioContext state:

```javascript
console.log("AudioContext state:", audioContext.state);
// Should be 'running', not 'suspended'
```

2. Resume after user interaction:

```javascript
button.onclick = async () => {
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  playTTS();
};
```

3. Check TTS service:

```bash
# Test OpenAI TTS API
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "tts-1", "input": "Hello", "voice": "alloy"}' \
  --output test.mp3
```

4. Verify audio playback:

```javascript
const audio = new Audio();
audio.src = URL.createObjectURL(audioBlob);
audio.oncanplay = () => console.log("Audio can play");
audio.onerror = (e) => console.error("Audio error:", e);
await audio.play();
```

**Relevant Code Paths:**

- `services/api-gateway/app/services/tts_service.py`
- `apps/web-app/src/services/voice/TTSPlayer.ts`

---

### Voice Activity Detection (VAD) Issues

**Likely Causes:**

- Threshold too high/low
- Background noise
- Wrong sample rate
- VAD model not loaded

**Steps to Investigate:**

1. Check VAD configuration:

```javascript
const vadConfig = {
  threshold: 0.5, // Adjust based on noise level
  minSpeechFrames: 3, // Minimum frames to trigger
  preSpeechPadFrames: 10,
  redemptionFrames: 8,
};
```

2. Visualize audio levels:

```javascript
// Use canvas to show real-time levels
const draw = () => {
  analyser.getByteFrequencyData(dataArray);
  // Draw to canvas
  requestAnimationFrame(draw);
};
```

3. Check sample rate:

```javascript
console.log("AudioContext sample rate:", audioContext.sampleRate);
// VAD typically expects 16000 Hz
```

**Relevant Code Paths:**

- `apps/web-app/src/services/voice/VADService.ts`
- `apps/web-app/src/utils/vad.ts`

---

## Debugging Tools

### Browser DevTools

```javascript
// Monitor WebSocket traffic
// DevTools → Network → WS → Select connection → Messages
```

### Audio Debugging

```javascript
// Create audio visualizer
const analyser = audioContext.createAnalyser();
analyser.fftSize = 2048;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

function draw() {
  requestAnimationFrame(draw);
  analyser.getByteTimeDomainData(dataArray);
  // Draw waveform to canvas
}
```

### WebSocket Testing

```bash
# websocat - WebSocket Swiss Army knife
# Test Thinker-Talker voice pipeline
websocat -v "wss://assist.asimo.io/api/voice/pipeline-ws?token=YOUR_TOKEN"

# wscat - WebSocket cat
npm install -g wscat
# Test chat streaming WebSocket
wscat -c "wss://assist.asimo.io/api/realtime/ws?token=YOUR_TOKEN"
```

---

## Common Error Messages

| Error                                               | Cause                 | Fix                                      |
| --------------------------------------------------- | --------------------- | ---------------------------------------- |
| `NotAllowedError: Permission denied`                | Microphone blocked    | Request permission with user interaction |
| `NotFoundError: Device not found`                   | No microphone         | Check hardware/drivers                   |
| `AudioContext was not allowed to start`             | Autoplay policy       | Resume after user click                  |
| `WebSocket is closed before connection established` | Connection rejected   | Check auth, CORS, proxy                  |
| `MediaRecorder: not supported`                      | Browser compatibility | Use audio/webm, add polyfill             |

---

## Performance Metrics

| Metric                    | Target  | Alert   |
| ------------------------- | ------- | ------- |
| WebSocket latency         | < 100ms | > 500ms |
| STT processing time       | < 2s    | > 5s    |
| TTS generation time       | < 1s    | > 3s    |
| Audio capture to response | < 3s    | > 7s    |

---

## Voice Health Endpoint

Check voice pipeline health:

```bash
# Health check for all voice components
curl http://localhost:8000/health/voice | jq '.'

# Example response
{
  "status": "healthy",
  "components": {
    "deepgram": "healthy",
    "openai": "healthy",
    "elevenlabs": "healthy"
  }
}
```

---

## Related Documentation

- [Debugging Overview](/operations/debugging-overview)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md) - Detailed Thinker-Talker architecture
- [Thinker-Talker Pipeline](../THINKER_TALKER_PIPELINE.md) - Pipeline design and implementation
- [Implementation Status](/ai/status) - Voice feature status
- [API Reference](/reference/api) - Voice endpoints
