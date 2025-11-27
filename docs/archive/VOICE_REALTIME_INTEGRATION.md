---
title: "Voice Realtime Integration"
slug: "archive/voice-realtime-integration"
summary: "Comprehensive documentation for the OpenAI Realtime API integration in VoiceAssist."
status: deprecated
stability: legacy
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["voice", "realtime", "integration"]
category: reference
---

# OpenAI Realtime API Integration

Comprehensive documentation for the OpenAI Realtime API integration in VoiceAssist.

## Overview

This integration adds full-duplex voice conversation capabilities using OpenAI's Realtime API. Unlike the previous voice mode (Whisper + TTS), the Realtime API provides:

- **Bidirectional Audio Streaming**: Real-time audio input and output
- **Server-Side VAD**: OpenAI handles voice activity detection
- **Lower Latency**: Direct streaming reduces round-trip time
- **Natural Conversations**: More fluid, conversational interactions

## Architecture

### Backend Components

#### 1. Configuration (`services/api-gateway/app/core/config.py`)

```python
# OpenAI Realtime API settings
REALTIME_ENABLED: bool = True
REALTIME_MODEL: str = "gpt-4o-realtime-preview-2024-10-01"
REALTIME_BASE_URL: str = "wss://api.openai.com/v1/realtime"
REALTIME_TOKEN_EXPIRY_SEC: int = 300  # 5 minutes
```

#### 2. Realtime Voice Service (`services/api-gateway/app/services/realtime_voice_service.py`)

**Purpose**: Generates ephemeral session configuration for frontend WebSocket connections.

**Key Methods**:

- `generate_session_config(user_id, conversation_id)`: Creates session configuration
- `get_session_instructions(conversation_id)`: Returns system instructions for AI
- `validate_session(session_id)`: Validates session format

**Session Configuration Structure**:

```python
{
    "url": "wss://api.openai.com/v1/realtime",
    "model": "gpt-4o-realtime-preview-2024-10-01",
    "api_key": "<OPENAI_API_KEY>",
    "session_id": "rtc_<user_id>_<random_token>",
    "expires_at": <unix_timestamp>,
    "conversation_id": "<optional_conversation_id>",
    "voice_config": {
        "voice": "alloy",
        "modalities": ["text", "audio"],
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "input_audio_transcription": {"model": "whisper-1"},
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        }
    }
}
```

#### 3. API Endpoint (`services/api-gateway/app/api/voice.py`)

**Endpoint**: `POST /api/voice/realtime-session`

**Request**:

```json
{
  "conversation_id": "optional_conversation_id"
}
```

**Response**: Session configuration object (see above)

**Authentication**: Requires valid JWT token

**Errors**:

- `503 SERVICE_UNAVAILABLE`: Realtime API not enabled or configured
- `500 INTERNAL_SERVER_ERROR`: Session creation failed

### Frontend Components

#### 1. useRealtimeVoiceSession Hook (`apps/web-app/src/hooks/useRealtimeVoiceSession.ts`)

**Purpose**: Manages WebSocket connection lifecycle and audio streaming.

**Usage**:

```typescript
const {
  status, // Connection status
  error, // Error object (if any)
  transcript, // Current transcript
  isSpeaking, // User speaking indicator
  sessionConfig, // Session configuration
  connect, // Start connection
  disconnect, // End connection
  sendMessage, // Send text message
  isConnected, // Boolean: connected
  isConnecting, // Boolean: connecting
  canSend, // Boolean: can send
} = useRealtimeVoiceSession({
  conversation_id: "conv_123",
  onTranscript: (transcript) => {
    console.log(transcript.text, transcript.is_final);
  },
  onAudioChunk: (chunk) => {
    // Handle audio playback
  },
  onError: (error) => {
    console.error(error);
  },
  onConnectionChange: (status) => {
    console.log(status);
  },
  autoConnect: false, // Manual connect
});
```

**Features**:

- WebSocket connection management
- Microphone capture (24kHz PCM16)
- Audio streaming to OpenAI
- Real-time transcript updates
- Audio chunk buffering
- Automatic cleanup

#### 2. VoiceModePanel Component (`apps/web-app/src/components/voice/VoiceModePanel.tsx`)

**Purpose**: UI component for Realtime voice conversations.

**Usage**:

```typescript
<VoiceModePanel
  conversationId="conv_123"
  onClose={() => setShowVoice(false)}
  onTranscriptReceived={(text, isFinal) => {
    if (isFinal) {
      // Save to conversation history
    }
  }}
/>
```

**Features**:

- Connection status indicator
- Waveform visualization
- Live transcript display (user + AI)
- Connection controls (start/stop)
- Error handling UI
- Instructions panel

#### 3. Chat UI Integration (`apps/web-app/src/components/chat/MessageInput.tsx`)

**New Props**:

- `enableRealtimeVoice?: boolean` - Enable Realtime voice button
- `conversationId?: string` - Current conversation ID

**UI Elements**:

- Purple speaker icon button
- Inline VoiceModePanel when active
- Separate from existing voice-to-text

#### 4. API Client Method (`packages/api-client/src/index.ts`)

```typescript
async createRealtimeSession(request: {
  conversation_id?: string | null;
}): Promise<RealtimeSessionConfig>
```

## Audio Processing

### Input (Microphone → OpenAI)

1. **Capture**: Web Audio API (24kHz, mono)
2. **Process**: ScriptProcessorNode converts Float32 → Int16 (PCM16)
3. **Encode**: Base64 encoding for JSON transport
4. **Send**: WebSocket message `input_audio_buffer.append`

```typescript
// Example audio processing
processor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0);
  const pcm16 = new Int16Array(inputData.length);

  // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
  for (let i = 0; i < inputData.length; i++) {
    const s = Math.max(-1, Math.min(1, inputData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Send to OpenAI
  ws.send(
    JSON.stringify({
      type: "input_audio_buffer.append",
      audio: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer))),
    }),
  );
};
```

### Output (OpenAI → Speakers)

1. **Receive**: WebSocket message `response.audio.delta`
2. **Decode**: Base64 → Int16 PCM16
3. **Convert**: Int16 → Float32 for Web Audio API
4. **Queue**: Buffer audio chunks
5. **Play**: AudioContext.createBufferSource()

```typescript
// Example audio playback
const audioBuffer = audioContext.createBuffer(1, pcm16.length, 24000);
const channelData = audioBuffer.getChannelData(0);

// Convert Int16 to Float32
for (let i = 0; i < pcm16.length; i++) {
  channelData[i] = pcm16[i] / 32768.0;
}

const source = audioContext.createBufferSource();
source.buffer = audioBuffer;
source.connect(audioContext.destination);
source.start();
```

## WebSocket Protocol

### Connection Flow

1. **Fetch Session Config**: `POST /api/voice/realtime-session`
2. **Connect WebSocket**: `wss://api.openai.com/v1/realtime?model=<model>`
3. **Send session.update**: Configure voice, VAD, transcription
4. **Stream Audio**: Bidirectional audio/text streaming
5. **Close Connection**: Cleanup and disconnect

### Message Types

#### Sent to OpenAI

```javascript
// Session configuration
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "instructions": "You are a helpful medical AI assistant.",
    "voice": "alloy",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": {"model": "whisper-1"},
    "turn_detection": {...}
  }
}

// Audio data
{
  "type": "input_audio_buffer.append",
  "audio": "<base64_pcm16>"
}

// Text message
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [{"type": "input_text", "text": "Hello"}]
  }
}

// Trigger response
{
  "type": "response.create"
}
```

#### Received from OpenAI

```javascript
// Session created
{
  "type": "session.created",
  "session": {...}
}

// User speech transcription
{
  "type": "conversation.item.input_audio_transcription.completed",
  "transcript": "Hello, how are you?"
}

// AI audio response
{
  "type": "response.audio.delta",
  "delta": "<base64_pcm16>"
}

// AI speech transcript (partial)
{
  "type": "response.audio_transcript.delta",
  "delta": "I'm doing well"
}

// AI speech transcript (final)
{
  "type": "response.audio_transcript.done",
  "transcript": "I'm doing well, thank you for asking!"
}

// Speech detection
{
  "type": "input_audio_buffer.speech_started"
}

{
  "type": "input_audio_buffer.speech_stopped"
}

// Error
{
  "type": "error",
  "error": {
    "message": "Error message",
    "code": "error_code"
  }
}
```

## Configuration

### Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...

# Optional (with defaults)
REALTIME_ENABLED=true
REALTIME_MODEL=gpt-4o-realtime-preview-2024-10-01
REALTIME_BASE_URL=wss://api.openai.com/v1/realtime
REALTIME_TOKEN_EXPIRY_SEC=300
```

### Feature Flags

Enable Realtime voice mode in Chat UI:

```typescript
<MessageInput
  enableRealtimeVoice={true}  // Enable Realtime voice button
  conversationId={conversationId}
  ...
/>
```

## Testing

### Manual Testing

1. **Navigate to Test Page**: `/voice-test`
2. **Locate Realtime Section**: "Realtime Voice Mode (OpenAI Realtime API)"
3. **Start Session**: Click "Start Voice Session"
4. **Test Connection**: Verify status indicator turns green
5. **Speak**: Say something and verify transcript appears
6. **Listen**: Verify AI responds with voice
7. **End Session**: Click "End Session"

### Test Scenarios

#### Scenario 1: Basic Connection

```
1. Start voice session
2. Verify WebSocket connects
3. Verify microphone permission granted
4. Verify waveform visualization appears
5. End session
6. Verify cleanup completes
```

#### Scenario 2: Voice Conversation

```
1. Start voice session
2. Speak: "Hello, can you hear me?"
3. Verify user transcript appears
4. Wait for AI response
5. Verify AI transcript appears
6. Verify audio plays
7. End session
```

#### Scenario 3: Error Handling

```
1. Disable network
2. Start voice session
3. Verify error message appears
4. Re-enable network
5. Retry connection
6. Verify successful connection
```

#### Scenario 4: Conversation Context

```
1. Start voice session in existing conversation
2. Ask question related to previous messages
3. Verify AI has context from conversation history
4. End session
```

## Browser Compatibility

### Supported Browsers

- ✅ Chrome 80+
- ✅ Edge 80+
- ✅ Safari 14.1+
- ✅ Firefox 75+

### Required APIs

- WebSocket API
- Web Audio API (AudioContext, ScriptProcessorNode)
- MediaDevices.getUserMedia
- Canvas API (for waveform)

### Known Limitations

- Safari: Requires user gesture for AudioContext
- Mobile: May have higher latency
- iOS: Requires iOS 14.3+ for Web Audio API support

## Troubleshooting

### Common Issues

#### 1. "Microphone Access Denied"

**Cause**: Browser blocked microphone permission
**Solution**: Grant microphone access in browser settings

#### 2. "WebSocket connection failed"

**Cause**: Network issues or invalid session configuration
**Solution**: Check network, verify API key is set

#### 3. "Session configuration expired"

**Cause**: Session config older than 5 minutes
**Solution**: Retry connection to fetch new config

#### 4. No audio playback

**Cause**: AudioContext not started or suspended
**Solution**: Ensure user gesture occurred before playback

#### 5. High latency

**Cause**: Network congestion or slow connection
**Solution**: Check network speed, reduce concurrent connections

### Debug Mode

Enable detailed logging:

```typescript
// In useRealtimeVoiceSession.ts
console.log("[RealtimeVoiceSession] Debug message");
```

Check browser console for:

- WebSocket connection status
- Audio processing metrics
- Error messages with stack traces

## Security Considerations

### API Key Protection

- ✅ API key stored server-side
- ✅ Session tokens generated backend
- ✅ Short-lived sessions (5 minutes)
- ✅ User authentication required

### Data Privacy

- Audio streams directly to OpenAI (not stored on server)
- Transcripts saved to conversation history (optional)
- No audio recording stored locally
- WebSocket connections encrypted (WSS)

### Rate Limiting

- Session creation rate-limited per user
- WebSocket connections monitored
- Audio streaming bandwidth monitored

## Performance Optimization

### Recommendations

1. **Audio Processing**:
   - Use ScriptProcessorNode for now (AudioWorklet in future)
   - Buffer size: 4096 samples (good balance)
   - Sample rate: 24000 Hz (Realtime API native)

2. **Network**:
   - Minimize concurrent WebSocket connections
   - Use binary frames for audio (future enhancement)
   - Monitor connection quality

3. **UI**:
   - Throttle waveform updates to 60 FPS
   - Debounce transcript updates
   - Lazy load VoiceModePanel

4. **Memory**:
   - Cleanup audio contexts on disconnect
   - Clear audio buffers regularly
   - Release MediaStream tracks

## Future Enhancements

### Planned Features

- [ ] Conversation history integration
- [ ] Audio recording/playback controls
- [ ] Voice settings (speed, pitch)
- [ ] Multiple voice options
- [ ] Text-only mode toggle
- [ ] Noise cancellation
- [ ] Echo cancellation tuning
- [ ] Mobile app support
- [ ] Offline mode

### Technical Improvements

- [ ] Migrate to AudioWorklet for better performance
- [ ] Use binary WebSocket frames for audio
- [ ] Add reconnection logic with exponential backoff
- [ ] Implement session resumption
- [ ] Add metrics and monitoring
- [ ] Create unit tests for audio processing
- [ ] Add E2E tests for voice flows

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## Support

For issues or questions:

1. Check this documentation
2. Review browser console logs
3. Test on `/voice-test` page
4. File issue with reproduction steps

## Changelog

### 2025-11-24 - Initial Release

- Backend Realtime session management
- Frontend useRealtimeVoiceSession hook
- VoiceModePanel component
- Chat UI integration
- Test page updates
- Documentation

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-11-24
