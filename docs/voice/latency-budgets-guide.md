---
title: Latency Budgets Guide
slug: latency-budgets-guide
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, performance, latency, degradation, v4]
summary: Guide to latency-aware orchestration and graceful degradation
lastUpdated: "2024-12-04"
---

# Latency Budgets Guide

Voice Mode v4.1 introduces latency-aware orchestration to maintain responsive voice interactions with a target of sub-700ms end-to-end latency.

## Overview

The latency-aware orchestrator monitors each processing stage and applies graceful degradation when stages exceed their budgets.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Voice Pipeline Stages                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Audio    STT     Lang      Translation   RAG      LLM     TTS  │
│  Capture  ─────▶  Detect  ─────────────▶  ─────▶  ─────▶  ────▶ │
│                                                                  │
│  [50ms]  [200ms]  [50ms]     [200ms]     [300ms] [300ms] [150ms]│
│                                                                  │
│  Total Budget: 700ms E2E                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Budget Configuration

### Default Budgets

```python
from app.services.latency_aware_orchestrator import LatencyBudget

default_budget = LatencyBudget(
    audio_capture_ms=50,
    stt_ms=200,
    language_detection_ms=50,
    translation_ms=200,
    rag_ms=300,
    llm_first_token_ms=300,
    tts_first_chunk_ms=150,
    total_budget_ms=700
)
```

### Stage Details

| Stage              | Budget | Description                         | Degradation          |
| ------------------ | ------ | ----------------------------------- | -------------------- |
| Audio capture      | 50ms   | Mic activation to first audio chunk | Log warning          |
| STT                | 200ms  | Speech-to-text processing           | Use cached partial   |
| Language detection | 50ms   | Detect query language               | Default to user lang |
| Translation        | 200ms  | Translate non-English queries       | Skip translation     |
| RAG retrieval      | 300ms  | Knowledge base search               | Limit results        |
| LLM first token    | 300ms  | Time to first LLM token             | Shorten context      |
| TTS first chunk    | 150ms  | Time to first audio chunk           | Use cached greeting  |

## Degradation Types

### Degradation Enum

```python
from app.services.latency_aware_orchestrator import DegradationType

class DegradationType(str, Enum):
    LANGUAGE_DETECTION_SKIPPED = "language_detection_skipped"
    LANGUAGE_DETECTION_BUDGET_EXCEEDED = "language_detection_budget_exceeded"
    TRANSLATION_SKIPPED = "translation_skipped"
    TRANSLATION_BUDGET_EXCEEDED = "translation_budget_exceeded"
    TRANSLATION_FAILED = "translation_failed"
    RAG_LIMITED_TO_1 = "rag_limited_to_1"
    RAG_LIMITED_TO_3 = "rag_limited_to_3"
    RAG_RETRIEVAL_FAILED = "rag_retrieval_failed"
    LLM_CONTEXT_SHORTENED = "llm_context_shortened"
    TTS_USED_CACHED_GREETING = "tts_used_cached_greeting"
    PARALLEL_STT_REDUCED = "parallel_stt_reduced"
```

### Degradation Actions

| Scenario                | Condition                    | Action                                |
| ----------------------- | ---------------------------- | ------------------------------------- |
| Language detection slow | > 50ms                       | Skip, use user's preferred language   |
| Translation slow        | > 200ms                      | Skip translation, use original query  |
| Translation failed      | API error or `result.failed` | Use original query + multilingual LLM |
| RAG under pressure      | < 500ms remaining            | Return top-1 result only              |
| RAG moderately slow     | < 700ms remaining            | Return top-3 results                  |
| LLM context too large   | Exceeds token limit          | Truncate context                      |
| TTS cold start          | First request                | Use cached greeting audio             |

## Usage

### Basic Usage

```python
from app.services.latency_aware_orchestrator import (
    LatencyAwareVoiceOrchestrator,
    get_latency_aware_orchestrator
)

# Get singleton instance
orchestrator = get_latency_aware_orchestrator()

# Process voice request with budget tracking
result = await orchestrator.process_with_budgets(
    audio_data=audio_bytes,
    user_language="es"
)

# Check result
print(f"Transcript: {result.transcript}")
print(f"Response: {result.response}")
print(f"Total latency: {result.total_latency_ms}ms")
print(f"Degradations: {result.degradation_applied}")
print(f"Warnings: {result.warnings}")
```

### Result Structure

```python
@dataclass
class VoiceProcessingResult:
    transcript: str                      # STT result
    detected_language: str               # Detected query language
    response: str                        # LLM response
    sources: List[Dict]                  # RAG sources
    audio_url: Optional[str]             # TTS audio URL
    total_latency_ms: float              # End-to-end latency
    stage_latencies: Dict[str, float]    # Per-stage timing
    degradation_applied: List[str]       # Applied degradations
    warnings: List[str]                  # Warning messages
    success: bool                        # Overall success
```

## Frontend Integration

### LatencyIndicator Component

Display real-time latency status:

```tsx
import { LatencyIndicator } from "@/components/voice/LatencyIndicator";

<LatencyIndicator
  latencyMs={523}
  degradations={["translation_skipped", "rag_limited_to_3"]}
  showDetails={true}
  size="sm"
/>;
```

### Status Colors

| Status | Latency   | Color  |
| ------ | --------- | ------ |
| Good   | < 500ms   | Green  |
| Fair   | 500-700ms | Yellow |
| Slow   | > 700ms   | Red    |

### Degradation Tooltips

The component shows user-friendly labels for degradations:

```typescript
const DEGRADATION_LABELS = {
  language_detection_skipped: "Language detection skipped",
  translation_skipped: "Translation skipped",
  translation_failed: "Translation failed",
  rag_limited_to_1: "Search limited",
  rag_limited_to_3: "Search limited",
  llm_context_shortened: "Context shortened",
  tts_used_cached_greeting: "Audio cached",
  parallel_stt_reduced: "Speech recognition simplified",
};
```

## Monitoring

### Metrics

The orchestrator emits metrics for monitoring:

```python
# Stage timing metrics
voice_stage_latency_ms{stage="stt"} 145
voice_stage_latency_ms{stage="translation"} 178
voice_stage_latency_ms{stage="rag"} 234

# Degradation counters
voice_degradation_total{type="translation_skipped"} 23
voice_degradation_total{type="rag_limited_to_3"} 156

# Overall latency histogram
voice_e2e_latency_ms_bucket{le="500"} 8234
voice_e2e_latency_ms_bucket{le="700"} 9156
voice_e2e_latency_ms_bucket{le="+Inf"} 9500
```

### Logging

```python
logger.info(f"Voice processing complete", extra={
    "total_latency_ms": result.total_latency_ms,
    "stage_latencies": result.stage_latencies,
    "degradations": result.degradation_applied,
    "user_language": result.detected_language
})
```

## Configuration

### Environment Variables

```bash
# Latency budget overrides (milliseconds)
VOICE_LATENCY_BUDGET_TOTAL=700
VOICE_LATENCY_BUDGET_STT=200
VOICE_LATENCY_BUDGET_TRANSLATION=200
VOICE_LATENCY_BUDGET_RAG=300

# Feature flag
VOICE_V4_LATENCY_BUDGETS=true
```

### Runtime Configuration

```python
# Custom budget for high-latency scenarios
high_latency_budget = LatencyBudget(
    total_budget_ms=1000,
    stt_ms=300,
    translation_ms=300,
    rag_ms=400
)

orchestrator = LatencyAwareVoiceOrchestrator(
    budget=high_latency_budget
)
```

## Testing

### Unit Tests

```python
# Test translation timeout triggers degradation
@pytest.mark.asyncio
async def test_translation_timeout_triggers_degradation():
    orchestrator = LatencyAwareVoiceOrchestrator(
        budget=LatencyBudget(translation_ms=1)  # Very short
    )
    # ... setup mocks ...

    result = await orchestrator.process_with_budgets(
        audio_data=b"fake_audio",
        user_language="es"
    )

    assert DegradationType.TRANSLATION_SKIPPED.value in result.degradation_applied
```

### Integration Tests

```bash
# Run latency budget tests
pytest tests/services/test_voice_v4_services.py::TestLatencyOrchestration -v
```

## Best Practices

1. **Monitor degradation rates**: High degradation rates indicate capacity issues
2. **Tune budgets per environment**: Development can use looser budgets
3. **Cache aggressively**: Translation caching reduces degradation frequency
4. **Use feature flags**: Roll out gradually and monitor impact
5. **Alert on sustained degradation**: Set up alerts for > 10% degradation rate

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [Multilingual RAG Architecture](./multilingual-rag-architecture.md)
- [Voice Pipeline Architecture](../VOICE_MODE_PIPELINE.md)
