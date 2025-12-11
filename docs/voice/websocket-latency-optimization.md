---
title: WebSocket Latency Optimization
slug: websocket-latency-optimization
status: active
owner: backend
lastUpdated: "2024-12-05"
priority: high
category: voice
ai_summary: >-
  Comprehensive guide to WebSocket latency optimizations including audio
  pre-buffering, permessage-deflate compression, and adaptive chunk sizing.
  All features are controlled via feature flags.
---

# WebSocket Latency Optimization

**Status:** Feature Flag Controlled
**Feature Flags:**

- `backend.voice_ws_audio_prebuffering`
- `backend.voice_ws_compression`
- `backend.voice_ws_adaptive_chunking`

**Last Updated:** 2024-12-05

---

## Overview

The WebSocket Latency Optimization feature provides three key improvements to the voice pipeline's real-time audio streaming:

1. **Audio Pre-buffering** - Buffers audio chunks before playback to prevent choppy audio on networks with jitter
2. **WebSocket Compression** - Enables permessage-deflate compression to reduce bandwidth usage
3. **Adaptive Chunk Sizing** - Dynamically adjusts audio chunk size based on network conditions

All optimizations are controlled by feature flags and can be enabled/disabled via the Admin Panel at localhost:5174.

---

## 1. Audio Pre-buffering

### Problem

Without pre-buffering, audio playback begins immediately when the first chunk arrives. On networks with variable latency (jitter), this can cause:

- Choppy or stuttering audio
- Gaps in playback when chunks arrive late
- Poor user experience

### Solution

Buffer a minimum number of audio chunks before starting playback, creating a "jitter buffer" that absorbs network variability.

### Configuration

| Setting              | Default | Description                                |
| -------------------- | ------- | ------------------------------------------ |
| `enablePrebuffering` | `false` | Enable/disable pre-buffering               |
| `prebufferChunks`    | `3`     | Number of chunks to buffer before playback |
| `prebufferTimeoutMs` | `500`   | Maximum wait time for buffer to fill       |

### Implementation

**Frontend (useTTAudioPlayback.ts):**

```typescript
const { queueAudioChunk, isPrebuffering, prebufferCount, prebufferTarget } = useTTAudioPlayback({
  enablePrebuffering: true,
  prebufferChunks: 3,
  prebufferTimeoutMs: 500,
});

// Show buffering indicator
if (isPrebuffering) {
  console.log(`Buffering: ${prebufferCount}/${prebufferTarget} chunks`);
}
```

### Latency Impact

- **Additional latency:** ~150ms (3 chunks × ~50ms per chunk)
- **Trade-off:** Smoother playback vs. slightly delayed start
- **Best for:** Users on WiFi, mobile networks, or connections with variable latency

---

## 2. WebSocket Compression (permessage-deflate)

### Problem

Text messages (transcripts, events, tool calls) sent over WebSocket are uncompressed, leading to:

- Higher bandwidth usage
- Slower message delivery on slow networks
- Increased costs for metered connections

### Solution

Enable the permessage-deflate WebSocket extension, which compresses text messages at the transport layer.

### Configuration

**Environment Variable:**

```bash
WS_COMPRESSION_ENABLED=true
```

**Backend (docker-compose.yml):**

```yaml
environment:
  - WS_COMPRESSION_ENABLED=${WS_COMPRESSION_ENABLED:-false}
```

### Implementation

The backend Docker entrypoint script enables compression when the environment variable is set:

```bash
if [ "${WS_COMPRESSION_ENABLED}" = "true" ]; then
    UVICORN_CMD="${UVICORN_CMD} --ws-per-message-deflate"
fi
```

### Bandwidth Savings

- **Text messages:** 15-30% reduction
- **Binary audio frames:** Not compressed (already efficient)
- **Best for:** Users on mobile data or slow connections

### Browser Compatibility

Permessage-deflate is supported by all modern browsers. The browser automatically negotiates compression with the server.

---

## 3. Adaptive Chunk Sizing

### Problem

Fixed chunk sizes (2048 samples = 128ms) may not be optimal for all network conditions:

- **Fast networks:** Larger chunks add unnecessary latency
- **Slow networks:** Small chunks create overhead, causing packet loss

### Solution

Dynamically adjust chunk size based on measured network quality:

| Network Quality | Chunk Size   | Latency |
| --------------- | ------------ | ------- |
| Excellent       | 1024 samples | 64ms    |
| Good            | 2048 samples | 128ms   |
| Fair            | 2048 samples | 128ms   |
| Poor            | 4096 samples | 256ms   |

### Network Quality Detection

The frontend uses multiple signals to assess network quality:

1. **Ping RTT** - Measures round-trip time to `/health` endpoint
2. **Navigator Network API** - effectiveType, downlink, saveData
3. **Combined assessment** - Uses worst quality from available metrics

**Quality Thresholds:**
| Metric | Excellent | Good | Fair | Poor |
|--------|-----------|------|------|------|
| RTT | <50ms | <150ms | <300ms | >300ms |
| Downlink | >10Mbps | >5Mbps | >1Mbps | <1Mbps |

### Implementation

**Frontend (useNetworkQuality.ts):**

```typescript
import { useNetworkQuality } from "@/hooks/useNetworkQuality";

function VoiceMode() {
  const { metrics } = useNetworkQuality({
    enabled: true,
    updateInterval: 5000,
    enablePing: true,
  });

  console.log(`Network: ${metrics.quality}, RTT: ${metrics.rttMs}ms`);
  console.log(`Recommended chunk size: ${metrics.recommendedChunkSize} samples`);
}
```

**Backend (voice_constants.py):**

```python
from app.core.voice_constants import AudioChunkSize

# Get recommended chunk size
chunk_size = AudioChunkSize.get_recommended_chunk_size("good")  # 2048
```

---

## Feature Flag Management

### Enabling Features

Navigate to **Admin Panel → Feature Flags** and enable:

1. `backend.voice_ws_audio_prebuffering` - Audio pre-buffering
2. `backend.voice_ws_compression` - WebSocket compression
3. `backend.voice_ws_adaptive_chunking` - Adaptive chunk sizing

### Rollout Strategy

1. **Testing:** Enable for internal testers first
2. **Gradual rollout:** Use rollout percentage (10% → 25% → 50% → 100%)
3. **Monitor:** Watch latency metrics and user feedback
4. **Rollback:** Disable feature flags if issues arise

---

## Monitoring & Metrics

### Key Metrics to Watch

| Metric                       | Target            | Alert Threshold |
| ---------------------------- | ----------------- | --------------- |
| Time to First Audio (TTFA)   | <1000ms           | >2000ms         |
| Audio underruns              | 0                 | >5 per session  |
| WebSocket message size (avg) | Reduced by 15-30% | -               |
| Pre-buffer fill time         | <500ms            | >1000ms         |

### Logging

Enable verbose logging to debug latency issues:

```bash
VOICE_LOG_LEVEL=DEBUG
```

Look for log messages like:

```
[TTAudioPlayback] Pre-buffer complete: 3 chunks in 145ms
[TTAudioPlayback] Network quality: good, chunk size: 2048
[Entrypoint] WebSocket compression (permessage-deflate) ENABLED
```

---

## Troubleshooting

### Issue: Audio still choppy with pre-buffering enabled

1. Increase `prebufferChunks` to 5-6
2. Check network quality metrics
3. Consider enabling adaptive chunking for poor networks

### Issue: Increased latency with compression

1. Compression adds CPU overhead
2. May not be beneficial on already fast networks
3. Disable compression for LAN/localhost testing

### Issue: Chunk size not adapting

1. Verify feature flag is enabled
2. Check if Network Information API is available
3. Ensure ping endpoint is accessible

---

## Related Documentation

- [Latency Budgets Guide](./latency-budgets-guide.md)
- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
- [Adaptive Quality Service](./adaptive-quality-service.md)
- [WebSocket Binary Audio](./websocket-binary-audio.md) (Phase 1 WS Reliability)
- [WebSocket Session Persistence](./websocket-session-persistence.md) (Phase 2 WS Reliability)
- [WebSocket Graceful Degradation](./websocket-graceful-degradation.md) (Phase 3 WS Reliability)
