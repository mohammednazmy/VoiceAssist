---
title: Voice Mode v4.1 Overview
slug: voice-mode-v4-overview
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, v4, multilingual, latency, thinking-feedback]
summary: Overview of Voice Mode Enhancement Plan v4.1 features
lastUpdated: "2024-12-04"
---

# Voice Mode v4.1 Overview

Voice Mode v4.1 introduces significant enhancements to the VoiceAssist voice pipeline, focusing on multilingual support, performance safeguards, and improved user feedback.

## Key Features

### 1. Multilingual RAG with Translation Fallback

The multilingual RAG service enables voice interactions in multiple languages:

- **Translate-then-retrieve pattern**: Non-English queries are translated to English for RAG retrieval, then responses are translated back
- **Multi-provider translation**: Primary provider (Google Translate) with automatic DeepL fallback
- **Code-switching detection**: Handles bilingual speakers mixing languages
- **Graceful degradation**: Falls back to original query when translation fails

See [Multilingual RAG Architecture](./multilingual-rag-architecture.md) for technical details.

### 2. Medical Pronunciation Lexicons

Language-specific pronunciation lexicons for accurate TTS:

- **15 languages supported**: EN, ES, FR, DE, IT, PT, AR, ZH, HI, UR, JA, KO, RU, PL, TR
- **Medical terminology**: Drug names, conditions, procedures, anatomy
- **G2P fallback**: espeak-ng for terms not in lexicons
- **Shared drug names**: 100 common medications with IPA pronunciations

See [Lexicon Service Guide](./lexicon-service-guide.md) for usage.

### 3. Latency-Aware Orchestration

Performance safeguards to maintain sub-700ms end-to-end latency:

| Stage              | Budget    | Degradation Action       |
| ------------------ | --------- | ------------------------ |
| Audio capture      | 50ms      | Log warning              |
| STT                | 200ms     | Use cached partial       |
| Language detection | 50ms      | Default to user language |
| Translation        | 200ms     | Skip translation         |
| RAG retrieval      | 300ms     | Return top-1 only        |
| LLM first token    | 300ms     | Shorten context          |
| TTS first chunk    | 150ms     | Use cached greeting      |
| **Total E2E**      | **700ms** | **Feature degradation**  |

See [Latency Budgets Guide](./latency-budgets-guide.md) for implementation.

### 4. Thinking Feedback UX

Multi-modal feedback during AI processing:

- **Audio tones**: Gentle beep, soft chime, subtle tick (Web Audio API)
- **Visual indicators**: Animated dots, pulsing circle, spinner, progress bar
- **Haptic feedback**: Gentle pulse, rhythmic patterns (mobile)
- **User controls**: Volume, style selection, enable/disable per modality

See [Thinking Tone Settings](./thinking-tone-settings.md) for configuration.

## Feature Flags

All v4.1 features are gated behind feature flags for safe rollout. Flags are grouped by workstream for independent deployment.

### Workstream 1: Translation & Multilingual RAG

| Flag                                    | Description                             | Default | Docs                                                   |
| --------------------------------------- | --------------------------------------- | ------- | ------------------------------------------------------ |
| `backend.voice_v4_translation_fallback` | Multi-provider translation with caching | Off     | [Multilingual RAG](./multilingual-rag-architecture.md) |
| `backend.voice_v4_multilingual_rag`     | Translate-then-retrieve pipeline        | Off     | [Multilingual RAG](./multilingual-rag-architecture.md) |

### Workstream 2: Audio & Speech Processing

| Flag                               | Description                      | Default | Docs                                          |
| ---------------------------------- | -------------------------------- | ------- | --------------------------------------------- |
| `backend.voice_v4_lexicon_service` | Medical pronunciation lexicons   | Off     | [Lexicon Service](./lexicon-service-guide.md) |
| `backend.voice_v4_phi_routing`     | PHI-aware STT with local Whisper | Off     | [PHI-Aware STT](./phi-aware-stt-routing.md)   |
| `backend.voice_v4_adaptive_vad`    | User-tunable VAD presets         | Off     | [Adaptive VAD](./adaptive-vad-presets.md)     |

### Workstream 3: Performance & Orchestration

| Flag                               | Description                  | Default | Docs                                          |
| ---------------------------------- | ---------------------------- | ------- | --------------------------------------------- |
| `backend.voice_v4_latency_budgets` | Latency-aware orchestration  | Off     | [Latency Budgets](./latency-budgets-guide.md) |
| `backend.voice_v4_thinking_tones`  | Backend thinking tone events | Off     | [Thinking Tones](./thinking-tone-settings.md) |

### Workstream 4: Internationalization

| Flag                           | Description                      | Default | Docs                                  |
| ------------------------------ | -------------------------------- | ------- | ------------------------------------- |
| `backend.voice_v4_rtl_support` | RTL text rendering (Arabic/Urdu) | Off     | [RTL Support](./rtl-support-guide.md) |

### Workstream 5: UI Enhancements

| Flag                                  | Description                          | Default | Docs                                             |
| ------------------------------------- | ------------------------------------ | ------- | ------------------------------------------------ |
| `ui.voice_v4_voice_first_ui`          | Voice-first unified input bar        | Off     | [Voice UI Components](./ui-components.md)        |
| `ui.voice_v4_streaming_text`          | Streaming text display during TTS    | Off     | [Streaming Text](./streaming-text-display.md)    |
| `ui.voice_v4_latency_indicator`       | Latency status with degradation info | Off     | [Latency Indicator](./latency-indicator.md)      |
| `ui.voice_v4_thinking_feedback_panel` | Audio/visual/haptic feedback         | Off     | [Thinking Feedback](./thinking-tone-settings.md) |

### Flag Dependencies

```
voice_v4_multilingual_rag
    └── voice_v4_translation_fallback (required)

voice_v4_thinking_feedback_panel (UI)
    └── voice_v4_thinking_tones (backend)

voice_v4_rtl_support
    └── voice_v4_multilingual_rag (recommended)
```

## Environment Variables

### Core Configuration

```bash
# Lexicon data directory (optional, auto-detected if not set)
VOICEASSIST_DATA_DIR=/path/to/voiceassist/data

# Translation providers (encrypted in production)
GOOGLE_TRANSLATE_API_KEY=your-key
DEEPL_API_KEY=your-key

# Feature flag defaults
VOICE_V4_ENABLED=false  # Master toggle

# Latency budget overrides (milliseconds)
VOICE_LATENCY_BUDGET_TOTAL=700
VOICE_LATENCY_BUDGET_STT=200
VOICE_LATENCY_BUDGET_TRANSLATION=200
VOICE_LATENCY_BUDGET_RAG=300
```

### VOICEASSIST_DATA_DIR Configuration

The `VOICEASSIST_DATA_DIR` environment variable specifies the root directory for lexicon files and other data assets.

**Setting the variable:**

```bash
# Linux/macOS - add to ~/.bashrc or systemd service
export VOICEASSIST_DATA_DIR=/opt/voiceassist/data

# Docker - add to docker-compose.yml
environment:
  - VOICEASSIST_DATA_DIR=/app/data

# Kubernetes - add to deployment.yaml
env:
  - name: VOICEASSIST_DATA_DIR
    value: /app/data

# CI/CD - set in pipeline configuration
env:
  VOICEASSIST_DATA_DIR: ${{ github.workspace }}/data
```

**Expected directory structure:**

```
$VOICEASSIST_DATA_DIR/
├── lexicons/
│   ├── shared/
│   │   └── drug_names.json
│   ├── en/
│   │   └── medical_phonemes.json
│   ├── es/
│   │   └── medical_phonemes.json
│   └── ... (other languages)
└── models/
    └── whisper/  (for local PHI-aware STT)
```

### Data Directory Resolution

The `_resolve_data_dir()` function in `lexicon_service.py` automatically locates the lexicon data directory using this priority:

1. **Environment variable**: If `VOICEASSIST_DATA_DIR` is set and the path exists, use it
2. **Repository root**: Walk up from the service file to find `data/lexicons/`
3. **Current working directory**: Check `./data/` relative to cwd
4. **Fallback**: Use relative path from the service file

This allows the lexicon service to work in development, CI, and production without manual configuration.

## Error Propagation

Voice Mode v4.1 implements structured error propagation to ensure graceful degradation without silent failures.

### Translation Errors

When translation fails, the system raises `TranslationFailedError` and applies graceful degradation:

```python
from app.services.latency_aware_orchestrator import (
    TranslationFailedError,
    DegradationType
)

try:
    result = await orchestrator.process_with_budgets(
        audio_data=audio_bytes,
        user_language="es"
    )
except TranslationFailedError as e:
    # Degradation already applied: uses original query
    logger.warning(f"Translation failed: {e}")
    # DegradationType.TRANSLATION_FAILED is in result.degradation_applied
```

### Error → Degradation Mapping

| Error                      | Degradation Type                        | Fallback Behavior                    |
| -------------------------- | --------------------------------------- | ------------------------------------ |
| `TranslationFailedError`   | `TRANSLATION_FAILED`                    | Use original query, inform user      |
| Translation timeout        | `TRANSLATION_BUDGET_EXCEEDED`           | Skip translation, use original       |
| Language detection timeout | `LANGUAGE_DETECTION_SKIPPED`            | Default to user's preferred language |
| RAG retrieval slow         | `RAG_LIMITED_TO_1` / `RAG_LIMITED_TO_3` | Return fewer results                 |
| LLM context overflow       | `LLM_CONTEXT_SHORTENED`                 | Truncate context history             |
| TTS cold start             | `TTS_USED_CACHED_GREETING`              | Play cached audio while warming up   |

### UI Error Surfacing

Degradation events are propagated to the frontend via WebSocket:

```typescript
// Frontend receives degradation events
socket.on("voice:degradation", (event: DegradationEvent) => {
  if (event.type === "TRANSLATION_FAILED") {
    showToast("Translation unavailable, using original language", "warning");
  }
});

// LatencyIndicator component shows degradation tooltips
<LatencyIndicator
  latencyMs={result.total_latency_ms}
  degradations={result.degradation_applied}
  showDetails={true}
/>;
```

### Logging and Monitoring

All errors emit structured logs and Prometheus metrics:

```python
# Structured logging
logger.warning("Translation failed", extra={
    "error_type": "TranslationFailedError",
    "source_language": "es",
    "degradation": "TRANSLATION_FAILED",
    "fallback": "original_query"
})

# Prometheus metrics
voice_degradation_total.labels(type="translation_failed").inc()
voice_error_total.labels(stage="translation", error="timeout").inc()
```

## Migration Guide

### Upgrading from v3

1. **Feature flags**: All v4 features are disabled by default
2. **Lexicons**: Automatically loaded from `data/lexicons/` directory
3. **Translation**: Enable `voice_v4_translation_fallback` flag
4. **UI components**: Import from `@/components/voice/`

### Testing

```bash
# Run v4 service tests
cd services/api-gateway
pytest tests/services/test_voice_v4_services.py -v

# Validate lexicons
python -c "
from app.services.lexicon_service import get_lexicon_service
import asyncio
service = get_lexicon_service()
reports = asyncio.run(service.validate_all_lexicons())
for lang, report in reports.items():
    print(f'{lang}: {report.term_count} terms ({report.status})')
"
```

## Related Documentation

- [Multilingual RAG Architecture](./multilingual-rag-architecture.md)
- [Lexicon Service Guide](./lexicon-service-guide.md)
- [Latency Budgets Guide](./latency-budgets-guide.md)
- [Thinking Tone Settings](./thinking-tone-settings.md)
- [Voice Pipeline Architecture](../VOICE_MODE_PIPELINE.md)
