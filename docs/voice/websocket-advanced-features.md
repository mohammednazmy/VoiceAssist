# WebSocket Advanced Features

## Overview

The WebSocket Advanced Features module provides enhanced voice streaming capabilities for the VoiceAssist platform. These features address three key deficiencies in the standard WebSocket transport:

1. **No WebRTC fallback for lower latency** - Now supported via WebRTC data channels
2. **No adaptive bitrate based on network conditions** - Dynamic quality adjustment implemented
3. **No echo cancellation feedback loop** - AEC metrics reported from client to server

All features are behind feature flags and can be enabled gradually via the admin panel at `localhost:5174`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (web-app)                          │
├─────────────────────────────────────────────────────────────────────┤
│  useEnhancedVoiceSession                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ TransportManager │  │AdaptiveBitrate  │  │    AECMonitor       │  │
│  │                 │  │ Controller      │  │                     │  │
│  │  ┌───────────┐  │  │                 │  │  - Output tracking  │  │
│  │  │WebSocket  │  │  │  - Network QoS  │  │  - Echo estimation  │  │
│  │  │Transport  │  │  │  - Quality adj  │  │  - Convergence det  │  │
│  │  └───────────┘  │  │  - Hysteresis   │  │  - VAD sensitivity  │  │
│  │  ┌───────────┐  │  │                 │  │                     │  │
│  │  │WebRTC     │  │  └─────────────────┘  └─────────────────────┘  │
│  │  │Transport  │  │                                                 │
│  │  └───────────┘  │                                                 │
│  └─────────────────┘                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (api-gateway)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Voice API Endpoints                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │ /pipeline-ws    │  │ /webrtc/session │                           │
│  │ (existing)      │  │ (new signaling) │                           │
│  └─────────────────┘  └─────────────────┘                           │
│           │                    │                                     │
│           ▼                    ▼                                     │
│  ┌─────────────────────────────────────────┐                        │
│  │         WebRTC Signaling Service         │                        │
│  │  - SDP offer/answer exchange             │                        │
│  │  - ICE candidate coordination            │                        │
│  │  - Session state management              │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Feature Flags

| Flag Key                                 | Description                                      | Default |
| ---------------------------------------- | ------------------------------------------------ | ------- |
| `backend.ws_webrtc_fallback`             | Enable WebRTC data channel as fallback transport | `false` |
| `backend.ws_webrtc_prefer`               | Prefer WebRTC over WebSocket when available      | `false` |
| `backend.ws_adaptive_bitrate`            | Enable adaptive bitrate control based on network | `false` |
| `backend.ws_adaptive_bitrate_aggressive` | Use aggressive bitrate switching                 | `false` |
| `backend.ws_aec_feedback`                | Enable AEC metrics feedback from client          | `false` |
| `backend.ws_aec_barge_gate`              | Enable barge-in gating based on AEC state        | `false` |

## Components

### 1. Transport Layer

#### TransportManager

Unified transport management with automatic fallback between WebSocket and WebRTC.

```typescript
import { createTransportManager } from '@/lib/voice/transports';

const manager = createTransportManager({
  strategy: 'adaptive', // or 'websocket-only', 'webrtc-prefer'
  websocket: { wsUrl, sessionId, userId, ... },
  webrtc: { iceServers: [...] },
  autoFallback: true,
  qualitySwitchThreshold: 50,
});

await manager.connect();
await manager.send({ type: 'message', content: 'Hello' });
await manager.sendBinary(audioData, BINARY_FRAME_TYPE.AUDIO_INPUT, seq);
```

#### WebSocketTransport

WebSocket-based transport with binary protocol support.

- 5-byte header format: `[frameType (1)] [sequence (4 LE)]`
- Heartbeat mechanism for connection health
- Automatic reconnection with exponential backoff

#### WebRTCTransport

WebRTC data channel transport for lower latency (~20-50ms improvement).

- Uses unreliable data channels for audio (ordered but no retransmits)
- ICE/STUN/TURN support for NAT traversal
- Same binary protocol as WebSocket

### 2. Adaptive Bitrate Controller

Monitors network conditions and adjusts audio quality dynamically.

```typescript
import { createAdaptiveBitrateController } from "@/lib/voice";

const controller = createAdaptiveBitrateController({
  enabled: true,
  aggressive: false,
  hysteresisCount: 3,
});

controller.onQualityChange((event) => {
  console.log(`Quality: ${event.previousLevel} -> ${event.newLevel}`);
});

controller.start();
```

#### Quality Profiles

| Level   | Codec | Sample Rate | Bitrate | Use Case          |
| ------- | ----- | ----------- | ------- | ----------------- |
| high    | PCM16 | 16kHz       | 256kbps | Excellent network |
| medium  | Opus  | 16kHz       | 24kbps  | Good network      |
| low     | Opus  | 16kHz       | 16kbps  | Moderate network  |
| minimum | Opus  | 8kHz        | 12kbps  | Poor network      |

### 3. AEC Monitor

Monitors Acoustic Echo Cancellation performance and provides feedback for VAD sensitivity adjustment.

```typescript
import { createAECMonitor } from "@/lib/voice";

const monitor = createAECMonitor({
  enabled: true,
  reportIntervalMs: 500,
  echoThresholdDb: -45,
});

await monitor.initialize(microphoneStream, audioContext);

monitor.notifyOutputStarted(); // When TTS playback begins
monitor.notifyOutputStopped(); // When TTS playback ends

// Get VAD sensitivity recommendation
const multiplier = monitor.getVADSensitivityMultiplier();
// Returns 1.0 (normal), 0.8 (converged), 0.5 (converging), 0.2 (diverged)
```

#### AEC States

- **idle**: No TTS output playing
- **converging**: AEC is adapting to output
- **converged**: AEC has stabilized, barge-in safe
- **diverged**: AEC not working well, barge-in risky

### 4. Enhanced Voice Session Hook

Integrates all components with the existing Thinker/Talker pipeline.

```typescript
import { useEnhancedVoiceSession } from "@/hooks/useEnhancedVoiceSession";

const {
  // Standard session properties
  status,
  transcript,
  connect,
  disconnect,

  // Enhanced features
  enhancedFeaturesActive,
  transportType,
  qualityLevel,
  aecState,

  // Methods
  notifyOutputStarted,
  notifyOutputStopped,
  isBargeInAllowed,
  getVADSensitivityMultiplier,

  // Feature flags status
  featureFlags,
} = useEnhancedVoiceSession({
  conversation_id: "conv-123",
  // Optional overrides for testing
  forceEnableAECFeedback: true,
});
```

## Backend API Endpoints

### WebRTC Signaling

#### Create Session

```http
POST /api/voice/webrtc/session
Authorization: Bearer <token>

Response:
{
  "session_id": "uuid",
  "state": "created",
  "ice_servers": [
    {"urls": "stun:stun.l.google.com:19302"}
  ],
  "data_channel_label": "voice"
}
```

#### Submit Offer

```http
POST /api/voice/webrtc/session/{session_id}/offer
Authorization: Bearer <token>
Content-Type: application/json

{
  "offer_sdp": "<SDP offer string>"
}

Response:
{
  "session_id": "uuid",
  "answer_sdp": "<SDP answer string>",
  "state": "answer_sent"
}
```

#### Add ICE Candidate

```http
POST /api/voice/webrtc/session/{session_id}/ice-candidate
Authorization: Bearer <token>

{
  "candidate": "<ICE candidate string>",
  "sdp_mid": "0",
  "sdp_m_line_index": 0
}

Response:
{
  "success": true,
  "candidates_count": 5
}
```

## Configuration

### Environment Variables

```bash
# WebRTC STUN/TURN servers
WEBRTC_STUN_URL=stun:stun.l.google.com:19302
WEBRTC_TURN_URL=turn:your-turn-server.com:3478
WEBRTC_TURN_USERNAME=username
WEBRTC_TURN_CREDENTIAL=password
```

## Testing

### Enable Features for Testing

```typescript
// In test environment
const session = useEnhancedVoiceSession({
  forceEnableWebRTC: true,
  forceEnableAdaptiveBitrate: true,
  forceEnableAECFeedback: true,
});
```

### Simulate Network Conditions

```javascript
// Chrome DevTools > Network > Throttling
// Custom profile: 100kbps, 500ms RTT

// Monitor quality changes
session.bitrateController.onQualityChange((event) => {
  console.log("Quality adjusted:", event);
});
```

## Rollout Plan

### Phase 1: Foundation (Complete)

- Transport abstraction layer
- WebSocket and WebRTC transports
- Adaptive bitrate controller
- AEC monitor

### Phase 2: Integration (Complete)

- useEnhancedVoiceSession hook
- Backend WebRTC signaling endpoints
- Feature flag integration

### Phase 3: Testing & Optimization (Planned)

- Load testing with concurrent WebRTC sessions
- Latency measurements and optimization
- AEC tuning for different devices

### Phase 4: Production Rollout (Planned)

1. Enable for internal testing (1% rollout)
2. Enable for beta users (10% rollout)
3. Monitor metrics and adjust
4. Full rollout (100%)

## Metrics to Monitor

- **Transport latency**: RTT between client and server
- **Quality switches**: Frequency of bitrate adjustments
- **AEC convergence time**: How long until AEC stabilizes
- **Barge-in accuracy**: False positive rate during TTS playback
- **Reconnection rate**: Transport fallback frequency

## Troubleshooting

### WebRTC Connection Fails

1. Check ICE server configuration
2. Verify STUN/TURN servers are accessible
3. Check browser WebRTC support
4. Review firewall rules

### Audio Quality Issues

1. Check network quality metrics
2. Verify adaptive bitrate is enabled
3. Review quality level in metrics
4. Check for packet loss

### Echo/Feedback Issues

1. Verify AEC is enabled in getUserMedia
2. Check AEC monitor state
3. Review VAD sensitivity multiplier
4. Ensure output notifications are called

## Future Enhancements

- [ ] Opus encoding on client side (Web Codecs API)
- [ ] Media server integration (Janus/Jitsi)
- [ ] Simulcast for multiple quality streams
- [ ] SRTP for encrypted media
- [ ] Bandwidth estimation improvements
