---
title: Adaptive Quality Service
slug: voice/adaptive-quality-service
summary: >-
  Dynamic voice processing quality management based on network conditions and
  system load.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-04"
audience:
  - human
  - ai-agents
  - backend
tags:
  - voice
  - quality
  - network
  - latency
category: voice
ai_summary: >-
  Backend service for adaptive voice quality control. Manages 5 quality levels
  (ULTRA to MINIMAL) based on network metrics (RTT, bandwidth, packet loss).
  Implements latency budgets per component and graceful degradation. See
  latency-budgets-guide.md for budget details.
---

# Adaptive Quality Service

**Phase 3 - Voice Mode v4.1**

Dynamic voice processing quality management based on network conditions and system load.

## Overview

The Adaptive Quality Service monitors network performance and system load in real-time, automatically adjusting voice processing quality to maintain optimal user experience within latency budgets.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Adaptive Quality Service                      │
│                                                                  │
│  Network Metrics ───▶ ┌─────────────┐ ───▶ Quality Level        │
│  (RTT, bandwidth,     │  Quality    │      (ULTRA→MINIMAL)      │
│   packet loss)        │  Adjuster   │                           │
│                       └─────────────┘                           │
│                              │                                   │
│  Latency Budget ────────────▶│◀─────── User Preferences        │
│  (per component)             │                                   │
│                              ▼                                   │
│                       ┌─────────────┐                           │
│                       │  Settings   │                           │
│                       │  Generator  │                           │
│                       └─────────────┘                           │
│                              │                                   │
│                              ▼                                   │
│              STT Model, TTS Model, Bitrate, Features            │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **5 Quality Levels**: ULTRA, HIGH, MEDIUM, LOW, MINIMAL
- **Network Monitoring**: RTT, bandwidth, packet loss, jitter
- **Latency Budgets**: Per-component budget tracking
- **Graceful Degradation**: Automatic quality reduction
- **Load Testing**: Built-in test utilities
- **Hysteresis**: Prevents quality flapping

## Quality Levels

| Level       | Target Latency | STT Model        | TTS Model       | Features             |
| ----------- | -------------- | ---------------- | --------------- | -------------------- |
| **ULTRA**   | 800ms          | whisper-large-v3 | eleven_turbo_v2 | All enabled          |
| **HIGH**    | 600ms          | whisper-1        | eleven_turbo_v2 | All enabled          |
| **MEDIUM**  | 500ms          | whisper-1        | tts-1           | Sentiment, Language  |
| **LOW**     | 400ms          | whisper-1        | tts-1           | None                 |
| **MINIMAL** | 300ms          | whisper-1        | tts-1           | None, reduced tokens |

### Detailed Settings per Level

```python
QUALITY_PRESETS = {
    QualityLevel.ULTRA: QualitySettings(
        stt_model="whisper-large-v3",
        tts_model="eleven_turbo_v2",
        audio_bitrate_kbps=128,
        sample_rate_hz=48000,
        max_context_tokens=8000,
        max_response_tokens=2000,
        enable_speaker_diarization=True,
        enable_sentiment_analysis=True,
        enable_language_detection=True,
    ),
    QualityLevel.HIGH: QualitySettings(
        stt_model="whisper-1",
        tts_model="eleven_turbo_v2",
        audio_bitrate_kbps=96,
        sample_rate_hz=24000,
        max_context_tokens=6000,
        max_response_tokens=1500,
        ...
    ),
    # ... and so on
}
```

## Network Conditions

| Condition     | RTT       | Bandwidth  | Packet Loss | Auto Level |
| ------------- | --------- | ---------- | ----------- | ---------- |
| **EXCELLENT** | <50ms     | >10 Mbps   | <0.1%       | ULTRA      |
| **GOOD**      | 50-150ms  | 2-10 Mbps  | <1%         | HIGH       |
| **FAIR**      | 150-300ms | 0.5-2 Mbps | <5%         | MEDIUM     |
| **POOR**      | 300-500ms | <0.5 Mbps  | <10%        | LOW        |
| **CRITICAL**  | >500ms    | Very low   | >10%        | MINIMAL    |

## Feature Flag

```yaml
# flag_definitions.yaml
backend.voice_v4_adaptive_quality:
  default: false
  description: "Enable adaptive quality management"
```

## Basic Usage

### Initialize Session

```python
from app.services.adaptive_quality_service import (
    get_adaptive_quality_service,
    QualityLevel
)

service = get_adaptive_quality_service()
await service.initialize()

# Start session with initial quality
state = await service.init_session(
    session_id="voice-123",
    initial_level=QualityLevel.HIGH,
    user_preference=QualityLevel.MEDIUM  # Optional override
)

print(f"Quality: {state.current_level.value}")
print(f"Target latency: {state.current_settings.target_latency_ms}ms")
```

### Update Network Metrics

```python
from app.services.adaptive_quality_service import NetworkMetrics

# Measure network conditions
metrics = NetworkMetrics(
    rtt_ms=150,
    bandwidth_kbps=5000,
    packet_loss_pct=0.5,
    jitter_ms=15
)

# Update service (may trigger quality change)
state = await service.update_network_metrics("voice-123", metrics)

print(f"Network: {state.network_condition.value}")
print(f"Quality: {state.current_level.value}")
```

### Record Component Latency

```python
# Track latency for budget monitoring
budget = service.record_latency("voice-123", "stt", latency_ms=180)
budget = service.record_latency("voice-123", "llm", latency_ms=250)
budget = service.record_latency("voice-123", "tts", latency_ms=120)

print(f"Total: {budget.total_actual_ms}ms / {budget.total_budget_ms}ms")
print(f"Exceeded: {budget.is_exceeded}")
```

### Get Current Settings

```python
settings = service.get_current_settings("voice-123")

# Use settings in voice pipeline
stt_response = await stt_service.transcribe(
    audio=audio_data,
    model=settings.stt_model,
    sample_rate=settings.sample_rate_hz
)

tts_response = await tts_service.synthesize(
    text=response_text,
    model=settings.tts_model,
    bitrate=settings.audio_bitrate_kbps
)
```

## Latency Budget System

### Budget Allocation

```
Total Budget (e.g., 600ms for HIGH)
├── STT: 25% (150ms)
├── LLM: 35% (210ms)
├── TTS: 25% (150ms)
└── Network: 15% (90ms)
```

### LatencyBudget Class

```python
@dataclass
class LatencyBudget:
    total_budget_ms: int
    stt_budget_ms: int
    llm_budget_ms: int
    tts_budget_ms: int
    network_budget_ms: int

    # Actual measurements
    stt_actual_ms: float = 0
    llm_actual_ms: float = 0
    tts_actual_ms: float = 0
    network_actual_ms: float = 0

    @property
    def is_exceeded(self) -> bool:
        return self.total_actual_ms > self.total_budget_ms
```

### Automatic Degradation

When latency budget is exceeded:

```python
# In voice pipeline
budget = service.record_latency(session_id, "llm", 350)  # Over budget

if budget.is_exceeded:
    # Service automatically triggers degradation
    # Quality: HIGH → MEDIUM
    # New budget: 600ms → 500ms
```

## Quality Change Callbacks

```python
def on_quality_change(state: QualityState, event: DegradationEvent):
    print(f"Quality changed: {event.from_level} → {event.to_level}")
    print(f"Reason: {event.reason}")

    # Update UI
    send_to_frontend({
        "type": "quality_change",
        "level": state.current_level.value,
        "reason": event.reason
    })

service.on_quality_change(on_quality_change)
```

## Hysteresis Logic

The service prevents quality flapping with hysteresis:

```python
# Downgrade: Requires 2+ poor samples in last 3
def _should_downgrade(history):
    recent = history[-3:]
    poor_count = sum(1 for m in recent if m.condition in ["poor", "critical"])
    return poor_count >= 2

# Upgrade: Requires 4+ good samples in last 5
def _should_upgrade(history):
    recent = history[-5:]
    if len(recent) < 5:
        return False
    good_count = sum(1 for m in recent if m.condition in ["excellent", "good"])
    return good_count >= 4
```

## Load Testing

### Concurrent Session Test

```python
from app.services.adaptive_quality_service import get_load_test_runner

runner = get_load_test_runner()

result = await runner.run_concurrent_session_test(
    num_sessions=50,
    duration_seconds=120,
    requests_per_second=10
)

print(f"Success rate: {result.success_rate}%")
print(f"P95 latency: {result.p95_latency_ms}ms")
print(f"Degradations: {result.degradations_triggered}")
```

### Degradation Behavior Test

```python
# Test quality degradation under poor network
events = await runner.run_degradation_test(
    session_id="test-session",
    simulate_poor_network=True
)

for event in events:
    print(f"{event.from_level} → {event.to_level}: {event.reason}")
```

### LoadTestResult

```python
@dataclass
class LoadTestResult:
    test_name: str
    concurrent_sessions: int
    duration_seconds: float
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    degradations_triggered: int

    @property
    def success_rate(self) -> float:
        return self.successful_requests / self.total_requests * 100
```

## Override Thresholds

### Custom Network Thresholds

```python
# Define custom condition thresholds
class CustomNetworkMetrics(NetworkMetrics):
    @property
    def condition(self) -> NetworkCondition:
        # Stricter thresholds for healthcare
        if self.rtt_ms < 30 and self.packet_loss_pct < 0.05:
            return NetworkCondition.EXCELLENT
        elif self.rtt_ms < 100 and self.packet_loss_pct < 0.5:
            return NetworkCondition.GOOD
        # ... etc
```

### Custom Quality Presets

```python
# Override preset settings
custom_presets = QUALITY_PRESETS.copy()
custom_presets[QualityLevel.HIGH] = QualitySettings(
    level=QualityLevel.HIGH,
    stt_model="whisper-1",
    tts_model="eleven_multilingual_v2",  # Custom TTS
    target_latency_ms=500,  # Tighter budget
    # ... other settings
)
```

## Frontend Integration

### QualityBadge Component

```tsx
interface QualityBadgeProps {
  level: "ultra" | "high" | "medium" | "low" | "minimal";
  showLabel?: boolean;
}

function QualityBadge({ level, showLabel = true }: QualityBadgeProps) {
  const colors = {
    ultra: "bg-purple-500",
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-orange-500",
    minimal: "bg-red-500",
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-white text-xs", colors[level])}>
      <span className="w-2 h-2 rounded-full bg-white/50" />
      {showLabel && <span className="uppercase font-medium">{level}</span>}
    </div>
  );
}
```

### Real-time Quality Updates

```tsx
function useQualityState(sessionId: string) {
  const [quality, setQuality] = useState<QualityState | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/voice/${sessionId}/quality`);

    es.onmessage = (event) => {
      setQuality(JSON.parse(event.data));
    };

    return () => es.close();
  }, [sessionId]);

  return quality;
}
```

## Metrics and Monitoring

### Prometheus Metrics

```python
# Exposed metrics
voice_quality_level{session_id, level}
voice_latency_budget_exceeded{session_id}
voice_degradation_total{from_level, to_level, reason}
voice_network_condition{session_id, condition}
```

### Logging

```python
# Quality change log
logger.info(
    "Quality level changed",
    extra={
        "session_id": session_id,
        "from_level": old_level,
        "to_level": new_level,
        "reason": reason,
        "network_condition": condition,
    }
)
```

## Best Practices

1. **Initialize early**: Call `init_session` at voice mode start
2. **Update frequently**: Send network metrics every 5-10 seconds
3. **Record all latencies**: Track STT, LLM, TTS, and network
4. **Handle callbacks**: Update UI when quality changes
5. **Clean up**: Call `end_session` when voice mode ends
6. **Test degradation**: Use load tests before deployment

## Related Documentation

- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
- [Latency Budgets Guide](./latency-budgets-guide.md)
- [Speaker Diarization Service](./speaker-diarization-service.md)
- [FHIR Streaming Service](./fhir-streaming-service.md)
