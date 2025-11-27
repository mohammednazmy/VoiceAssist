---
title: Voice & Realtime Debugging Guide
slug: debugging/voice-realtime
summary: Debug WebSocket connections, STT, TTS, and voice pipeline issues in VoiceAssist.
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience: ["human", "agent", "ai-agents", "backend", "frontend", "sre"]
tags: ["debugging", "runbook", "voice", "realtime", "websocket", "stt", "tts", "troubleshooting"]
relatedServices: ["api-gateway", "web-app"]
category: debugging
version: "1.0.0"
---

# Voice & Realtime Debugging Guide

**Last Updated:** 2025-11-27
**Components:** Voice pipeline, WebSocket service, STT/TTS

---

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
// Should be wss:// for production, ws:// for local
const wsUrl = `wss://assist.asimo.io/ws?token=${accessToken}`;
```

3. Test WebSocket connection manually:

```bash
# Using websocat
websocat "wss://assist.asimo.io/ws?token=YOUR_TOKEN"

# Or wscat
wscat -c "wss://assist.asimo.io/ws?token=YOUR_TOKEN"
```

4. Check Apache/Nginx proxy config:

```apache
# Required headers for WebSocket upgrade
ProxyPass /ws ws://127.0.0.1:8000/ws
ProxyPassReverse /ws ws://127.0.0.1:8000/ws

# Or for wss
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/ws$ ws://127.0.0.1:8000/ws [P,L]
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
websocat -v wss://assist.asimo.io/ws

# wscat - WebSocket cat
npm install -g wscat
wscat -c wss://assist.asimo.io/ws
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

## Related Documentation

- [Debugging Overview](./DEBUGGING_OVERVIEW.md)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md)
- [Realtime Architecture](../REALTIME_ARCHITECTURE.md)
- [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md)
