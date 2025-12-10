---
title: WebSocket Graceful Degradation
slug: websocket-graceful-degradation
status: active
owner: backend
lastUpdated: "2024-12-06"
priority: high
category: voice
ai_summary: >-
  Phase 3 WebSocket Reliability feature enabling automatic quality reduction
  and fallback handling when network conditions degrade.
---

# WebSocket Graceful Degradation

**Status:** Feature Flag Controlled
**Feature Flag:** `backend.voice_ws_graceful_degradation`
**Phase:** WebSocket Reliability Phase 3
**Last Updated:** 2024-12-06

---

## Overview

The WebSocket Graceful Degradation feature automatically adapts to poor network conditions by:

1. **Reducing Audio Quality** - Lower bitrate, larger chunks when bandwidth is limited
2. **Increasing Buffering** - More pre-buffering to absorb jitter
3. **Fallback Protocols** - Switch to HTTP polling if WebSocket becomes unstable
4. **User Notification** - Inform users of degraded quality

---

## Degradation Levels

| Level               | Network Quality | Actions                                             |
| ------------------- | --------------- | --------------------------------------------------- |
| **Full Quality**    | Excellent/Good  | Binary audio, 1024-sample chunks, minimal buffering |
| **Reduced Quality** | Fair            | JSON audio, 2048-sample chunks, moderate buffering  |
| **Low Quality**     | Poor            | JSON audio, 4096-sample chunks, heavy buffering     |
| **Fallback Mode**   | Very Poor       | HTTP polling, longer intervals, audio disabled      |

---

## Degradation Triggers

### Automatic Detection

The system monitors these metrics to detect degradation needs:

| Metric      | Good   | Fair     | Poor     | Trigger Action     |
| ----------- | ------ | -------- | -------- | ------------------ |
| RTT         | <150ms | <300ms   | >300ms   | Increase buffering |
| Packet Loss | <1%    | <5%      | >5%      | Larger chunks      |
| Jitter      | <20ms  | <50ms    | >50ms    | More buffering     |
| Bandwidth   | >1Mbps | >500Kbps | <500Kbps | Reduce quality     |

### Manual Override

Users or admins can force degradation level:

```javascript
voiceSession.setDegradationLevel("reduced");
```

---

## Protocol Flow

### Quality Degradation

```
Client                  Server
  │                        │
  │                        │── Network quality: poor
  │                        │
  │ ← quality.degraded ────│
  │   level: "reduced"     │
  │   reason: "high_rtt"   │
  │                        │
  │ ─── ack ───────────────│
  │                        │
  │ ← audio (larger chunks)│
  │                        │
```

### Quality Restoration

```
Client                  Server
  │                        │
  │                        │── Network quality: good
  │                        │
  │ ← quality.restored ────│
  │   level: "full"        │
  │                        │
  │ ─── ack ───────────────│
  │                        │
  │ ← audio (normal)───────│
  │                        │
```

---

## Message Types

### Server → Client

```javascript
// Quality degradation
{
  "type": "quality.degraded",
  "level": "reduced",       // "reduced" | "low" | "fallback"
  "reason": "high_rtt",     // Trigger reason
  "metrics": {
    "rtt_ms": 450,
    "packet_loss": 0.02,
    "jitter_ms": 35
  },
  "recommendations": {
    "expected_latency_ms": 500,
    "audio_quality": "acceptable"
  }
}

// Quality restored
{
  "type": "quality.restored",
  "level": "full",
  "message": "Network conditions improved"
}
```

### Client → Server

```javascript
// Acknowledge degradation
{
  "type": "quality.ack",
  "accepted": true,
  "client_metrics": {
    "buffer_level": 5,
    "playback_rate": 1.0
  }
}
```

---

## Implementation

### Backend Degradation Manager

```python
class DegradationManager:
    """Manages graceful degradation based on network quality."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.current_level = "full"
        self.metrics_history = []

    async def check_network_quality(self, metrics: dict) -> Optional[str]:
        """Check if degradation is needed."""
        self.metrics_history.append(metrics)

        # Use recent metrics for decision
        recent = self.metrics_history[-10:]
        avg_rtt = sum(m["rtt_ms"] for m in recent) / len(recent)

        if avg_rtt > 300 and self.current_level == "full":
            return await self._degrade_to("reduced", "high_rtt")
        elif avg_rtt > 500 and self.current_level == "reduced":
            return await self._degrade_to("low", "very_high_rtt")
        elif avg_rtt < 150 and self.current_level != "full":
            return await self._restore_to("full")

        return None

    async def _degrade_to(self, level: str, reason: str) -> str:
        """Apply degradation level."""
        self.current_level = level
        logger.info(f"Degrading session {self.session_id} to {level}: {reason}")
        return level
```

### Frontend Handling

```typescript
// In useThinkerTalkerSession.ts
case "quality.degraded": {
  const level = message.level as string;
  const reason = message.reason as string;

  voiceLog.warn(
    `[ThinkerTalker] Quality degraded to ${level}: ${reason}`
  );

  // Adjust local settings
  if (level === "reduced") {
    setAudioBufferTarget(5);  // More buffering
  } else if (level === "low") {
    setAudioBufferTarget(10);
  }

  // Notify user
  options.onQualityChange?.(level, reason);

  // Acknowledge
  ws.send(JSON.stringify({
    type: "quality.ack",
    accepted: true,
  }));
  break;
}
```

---

## Fallback Mode

When network quality becomes too poor for real-time streaming:

1. **Disable streaming audio** - Switch to text-only mode
2. **Use HTTP polling** - Fallback transport for messages
3. **Queue audio locally** - Process when conditions improve
4. **Notify user** - Display degraded mode indicator

### Fallback Indicator

```javascript
{
  "type": "mode.fallback",
  "enabled": true,
  "message": "Network too unstable for voice. Switched to text mode.",
  "estimated_recovery_ms": 30000
}
```

---

## Configuration

### Environment Variables

```bash
# RTT threshold for degradation (ms)
VOICE_DEGRADATION_RTT_THRESHOLD=300

# Packet loss threshold (percentage)
VOICE_DEGRADATION_LOSS_THRESHOLD=5

# Enable fallback mode
VOICE_FALLBACK_MODE_ENABLED=true
```

---

## Enabling the Feature

### Via Admin Panel

1. Navigate to **Admin Panel → Feature Flags**
2. Find `backend.voice_ws_graceful_degradation`
3. Toggle to **Enabled**
4. Optionally enable `backend.voice_ws_adaptive_chunking` for best results

### Via API

```bash
curl -X PATCH https://api.dev.asimo.io/api/admin/feature-flags/backend.voice_ws_graceful_degradation \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true}'
```

---

## Monitoring

### Key Metrics

| Metric                   | Target | Alert Threshold |
| ------------------------ | ------ | --------------- |
| Time in degraded mode    | <10%   | >25%            |
| Fallback mode triggers   | <1%    | >5%             |
| Quality restoration time | <30s   | >60s            |

### Logging

```
[WS] Graceful degradation enabled for {session_id}
[WS] Degrading to {level}: {reason}
[WS] Quality restored to full
[WS] Entering fallback mode: {reason}
```

---

## User Experience

### Quality Indicators

Show users the current quality level:

| Level    | Icon | Message                             |
| -------- | ---- | ----------------------------------- |
| Full     | -    | Normal operation                    |
| Reduced  | -    | "Optimizing for your connection..." |
| Low      | -    | "Limited quality due to network"    |
| Fallback | -    | "Voice unavailable - using text"    |

---

## Troubleshooting

### Issue: Frequent degradation

1. Check user's network connection
2. Review RTT and jitter metrics
3. Consider adjusting thresholds for your use case

### Issue: Stuck in degraded mode

1. Verify restoration thresholds
2. Check if metrics are being updated
3. Force restore via admin panel if needed

---

## Related Documentation

- [WebSocket Binary Audio](./websocket-binary-audio.md) (Phase 1)
- [WebSocket Session Persistence](./websocket-session-persistence.md) (Phase 2)
- [WebSocket Latency Optimization](./websocket-latency-optimization.md)
- [Adaptive Quality Service](./adaptive-quality-service.md)
