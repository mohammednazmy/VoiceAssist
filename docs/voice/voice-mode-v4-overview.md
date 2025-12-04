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

All v4.1 features are gated behind feature flags for safe rollout:

### Backend Flags

| Flag                            | Description                    | Default |
| ------------------------------- | ------------------------------ | ------- |
| `voice_v4_translation_fallback` | Multi-provider translation     | Off     |
| `voice_v4_multilingual_rag`     | Multilingual RAG wrapper       | Off     |
| `voice_v4_lexicon_service`      | Medical pronunciation lexicons | Off     |
| `voice_v4_thinking_tones`       | Backend thinking tone events   | Off     |
| `voice_v4_latency_budgets`      | Latency-aware orchestration    | Off     |
| `voice_v4_phi_routing`          | PHI-aware STT routing          | Off     |
| `voice_v4_adaptive_vad`         | Adaptive VAD presets           | Off     |
| `voice_v4_rtl_support`          | RTL text rendering             | Off     |

### Frontend Flags

| Flag                               | Description              | Default |
| ---------------------------------- | ------------------------ | ------- |
| `voice_v4_voice_first_ui`          | Voice-first UI mode      | Off     |
| `voice_v4_streaming_text`          | Streaming text display   | Off     |
| `voice_v4_latency_indicator`       | Latency status component | Off     |
| `voice_v4_thinking_feedback_panel` | Thinking feedback panel  | Off     |

## Environment Variables

```bash
# Lexicon data directory (optional, auto-detected if not set)
VOICEASSIST_DATA_DIR=/path/to/voiceassist/data

# Translation providers (encrypted in production)
GOOGLE_TRANSLATE_API_KEY=your-key
DEEPL_API_KEY=your-key

# Feature flag defaults
VOICE_V4_ENABLED=false  # Master toggle
```

### Data Directory Resolution

The `_resolve_data_dir()` function in `lexicon_service.py` automatically locates the lexicon data directory:

1. **Environment variable**: If `VOICEASSIST_DATA_DIR` is set, use that path
2. **Repository root**: Walk up from the service file to find `data/lexicons/`
3. **Current working directory**: Check `./data/` relative to cwd
4. **Fallback**: Use relative path from the service file

This allows the lexicon service to work in development, CI, and production without manual configuration.

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
