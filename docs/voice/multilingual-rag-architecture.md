---
title: Multilingual RAG Architecture
slug: multilingual-rag-architecture
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, multilingual, rag, translation, v4]
summary: Technical architecture for multilingual voice RAG with translation fallback
lastUpdated: "2025-12-04"
category: voice
ai_summary: >-
  Multilingual RAG architecture using translate-then-retrieve pattern. Queries
  in any supported language are translated to English for RAG retrieval against
  English embeddings, then responses translated back. Integrates with language
  detection and graceful degradation.
---

# Multilingual RAG Architecture

The multilingual RAG service enables voice interactions in multiple languages by implementing a translate-then-retrieve pattern with graceful degradation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Multilingual RAG Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌─────────────┐   ┌───────────────┐             │
│  │  User    │──▶│  Language   │──▶│  Translation  │             │
│  │  Query   │   │  Detection  │   │  (if needed)  │             │
│  └──────────┘   └─────────────┘   └───────────────┘             │
│                        │                   │                     │
│                        ▼                   ▼                     │
│              ┌─────────────────────────────────┐                │
│              │    English Query for RAG        │                │
│              └─────────────────────────────────┘                │
│                              │                                   │
│                              ▼                                   │
│              ┌─────────────────────────────────┐                │
│              │      RAG Knowledge Base         │                │
│              │   (English embeddings only)     │                │
│              └─────────────────────────────────┘                │
│                              │                                   │
│                              ▼                                   │
│              ┌─────────────────────────────────┐                │
│              │      LLM Response Generation    │                │
│              │   (with language instruction)   │                │
│              └─────────────────────────────────┘                │
│                              │                                   │
│                              ▼                                   │
│              ┌─────────────────────────────────┐                │
│              │     Response in User Language   │                │
│              └─────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

## Translation Service

### Multi-Provider Fallback

```python
from app.services.translation_service import TranslationService

# Initialize with providers
service = TranslationService(
    primary_provider="google",
    fallback_provider="deepl"
)

# Translate with automatic fallback
result = await service.translate_with_fallback(
    text="¿Cuáles son los síntomas de la diabetes?",
    source="es",
    target="en"
)

if result.failed:
    # Graceful degradation - use original query
    print(f"Translation failed: {result.error_message}")
else:
    print(f"Translated: {result.text}")
    if result.used_fallback:
        print("Used fallback provider")
```

### Caching Strategy

Translations are cached in Redis with a 7-day TTL:

```python
# Cache key format
cache_key = f"trans:{source}:{target}:{hash(text)}"

# TTL
TTL_DAYS = 7

# Cache hit rate typically >80% for common queries
```

### Supported Languages

| Code | Language   | Status      |
| ---- | ---------- | ----------- |
| en   | English    | Native      |
| es   | Spanish    | Full        |
| fr   | French     | Full        |
| de   | German     | Full        |
| it   | Italian    | Full        |
| pt   | Portuguese | Full        |
| ar   | Arabic     | Full        |
| zh   | Chinese    | Full        |
| hi   | Hindi      | Full        |
| ur   | Urdu       | Full        |
| ja   | Japanese   | Placeholder |
| ko   | Korean     | Placeholder |
| ru   | Russian    | Placeholder |
| pl   | Polish     | Placeholder |
| tr   | Turkish    | Placeholder |

## Language Detection

### Code-Switching Detection

The language detection service identifies when users mix languages:

```python
from app.services.multilingual_rag_service import LanguageDetectionService

detector = LanguageDetectionService()

# Detect primary language
result = await detector.detect("Tell me about مرض السكري please")
# result.primary_language = "en"
# result.secondary_languages = ["ar"]
# result.is_code_switched = True
```

### Detection Algorithm

1. **Fast detection**: Use langdetect for initial guess
2. **Confidence check**: Verify confidence > 0.7
3. **Code-switching scan**: Check for embedded phrases in other languages
4. **Fallback**: Default to user's preferred language

## RAG Integration

### Query Flow

```python
from app.services.multilingual_rag_service import MultilingualRAGService

service = MultilingualRAGService()

response = await service.query_multilingual(
    query="¿Qué medicamentos se usan para la diabetes?",
    user_language="es"
)

# Response structure
{
    "answer": "Los medicamentos más comunes para...",
    "language": "es",
    "sources": [...],
    "original_query": "¿Qué medicamentos se usan para...",
    "translated_query": "What medications are used for...",
    "translation_warning": None,  # or "Translation used fallback"
    "latency_ms": 523.4,
    "degradation_applied": []
}
```

### LLM Prompting for Multilingual Response

The LLM is instructed to respond in the user's language:

```python
system_prompt = f"""You are a helpful medical assistant.
Respond to the user's question using the provided context.
IMPORTANT: Respond entirely in {language_name}.
Do not mix languages unless the user's query contains specific terms
that should remain in their original language (e.g., medication names).
Be accurate, helpful, and cite your sources when providing information."""
```

## Graceful Degradation

When translation fails, the system degrades gracefully:

### Degradation Levels

| Scenario                  | Action                   | DegradationType               |
| ------------------------- | ------------------------ | ----------------------------- |
| Primary translation fails | Use fallback provider    | `translation_used_fallback`   |
| All translation fails     | Use original query + LLM | `translation_failed`          |
| Translation too slow      | Skip translation         | `translation_budget_exceeded` |
| RAG retrieval fails       | Return empty results     | `rag_retrieval_failed`        |

### Error Messages by Language

```python
FALLBACK_MESSAGES = {
    "en": "I apologize, but I'm unable to process your request. Please try again.",
    "es": "Lo siento, no puedo procesar su solicitud. Por favor, inténtelo de nuevo.",
    "fr": "Je m'excuse, je ne peux pas traiter votre demande. Veuillez réessayer.",
    "de": "Es tut mir leid, ich kann Ihre Anfrage nicht bearbeiten. Bitte versuchen Sie es erneut.",
    "ar": "عذراً، لا أستطيع معالجة طلبك. يرجى المحاولة مرة أخرى.",
    "zh": "抱歉，我目前无法处理您的请求。请重试。",
    # ... more languages
}
```

## Performance Considerations

### Latency Impact

| Stage              | Typical Latency | Budget    |
| ------------------ | --------------- | --------- |
| Language detection | 10-30ms         | 50ms      |
| Translation        | 100-180ms       | 200ms     |
| RAG retrieval      | 150-250ms       | 300ms     |
| **Total impact**   | **~300ms**      | **550ms** |

### Optimization Strategies

1. **Translation caching**: 7-day Redis cache
2. **Async detection**: Run language detection in parallel with audio processing
3. **Skip translation for English**: Detect English early and bypass translation
4. **Budget-aware skipping**: Skip translation when budget is tight

## Configuration

### Environment Variables

```bash
# Primary translation provider
TRANSLATION_PROVIDER=google

# API keys (store in secrets manager)
GOOGLE_TRANSLATE_API_KEY=xxx
DEEPL_API_KEY=xxx

# Cache settings
TRANSLATION_CACHE_TTL_DAYS=7
TRANSLATION_CACHE_PREFIX=trans

# Feature flag
VOICE_V4_MULTILINGUAL_RAG=true
```

### Feature Flag

```python
from app.core.feature_flags import is_enabled

if is_enabled("voice_v4_multilingual_rag", user_id=user.id):
    service = MultilingualRAGService()
    response = await service.query_multilingual(query, user_language)
else:
    # Fall back to English-only RAG
    response = await rag_service.query(query)
```

## Testing

```python
# Test translation fallback
pytest tests/services/test_voice_v4_services.py::TestTranslationFailureHandling -v

# Test multilingual RAG
pytest tests/services/test_voice_v4_services.py::TestMultilingualRAG -v
```

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [API Reference](../api-reference/rest-api.md)
- [Latency Budgets Guide](./latency-budgets-guide.md)
