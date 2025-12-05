---
title: Lexicon Service Guide
slug: lexicon-service-guide
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, tts, pronunciation, lexicon, medical, v4]
summary: Guide to using the medical pronunciation lexicon service
lastUpdated: "2025-12-04"
category: voice
ai_summary: >-
  Medical pronunciation lexicon service for TTS. Supports 15 languages with
  medical terminology and 100+ shared drug names. Includes G2P fallback via
  espeak-ng. Key languages: English (146 terms + 280 Quranic), Arabic (155
  terms + 364 Quranic). See g2p-alternatives-evaluation.md for G2P improvements.
---

# Lexicon Service Guide

Voice Mode v4.1 includes a pronunciation lexicon service for accurate text-to-speech of medical terminology across multiple languages.

## Overview

The lexicon service provides:

- **Medical pronunciation lexicons** for 15 languages
- **Shared drug name pronunciations** (100+ medications)
- **G2P fallback** using espeak-ng
- **User custom pronunciations**
- **Coverage validation** tools

## Supported Languages

| Code | Language   | Status      | Terms | Domain Terms |
| ---- | ---------- | ----------- | ----- | ------------ |
| en   | English    | Complete    | 146   | +280 Quranic |
| es   | Spanish    | In Progress | 30    | -            |
| fr   | French     | In Progress | 10    | -            |
| de   | German     | In Progress | 10    | -            |
| it   | Italian    | In Progress | 10    | -            |
| pt   | Portuguese | In Progress | 10    | -            |
| ar   | Arabic     | Complete    | 155   | +364 Quranic |
| zh   | Chinese    | In Progress | 25    | -            |
| hi   | Hindi      | In Progress | 10    | -            |
| ur   | Urdu       | In Progress | 10    | -            |
| ja   | Japanese   | Placeholder | 5     | -            |
| ko   | Korean     | Placeholder | 5     | -            |
| ru   | Russian    | Placeholder | 5     | -            |
| pl   | Polish     | Placeholder | 5     | -            |
| tr   | Turkish    | Placeholder | 5     | -            |

### Quranic Lexicons

For the Quran Voice Tutor application, dedicated Quranic lexicons provide pronunciations for:

- **114 Surah names** (Arabic and transliterated)
- **50+ Tajweed terms** (Idgham, Ikhfa, Qalqalah, Madd, etc.)
- **200+ Quranic vocabulary** (Islamic terms, prophets, concepts)

These are automatically loaded alongside the medical lexicons for Arabic and English.

## Basic Usage

### Get Pronunciation

```python
from app.services.lexicon_service import get_lexicon_service

service = get_lexicon_service()

# Get pronunciation for a term
result = await service.get_phoneme("diabetes", "en")

print(f"Term: {result.term}")           # diabetes
print(f"Phoneme: {result.phoneme}")     # ˌdaɪəˈbiːtiːz
print(f"Source: {result.source}")       # lexicon
print(f"Confidence: {result.confidence}") # 1.0
```

### Batch Lookup

```python
terms = ["metformin", "lisinopril", "atorvastatin"]
results = await service.get_phonemes_batch(terms, "en")

for result in results:
    print(f"{result.term}: {result.phoneme}")
```

### Custom Pronunciations

```python
# Add user-defined pronunciation
service.add_user_pronunciation(
    term="Ozempic",
    phoneme="oʊˈzɛmpɪk",
    language="en"
)

# User pronunciations take priority
result = await service.get_phoneme("Ozempic", "en")
assert result.source == "user_custom"
```

## Lookup Order

The service checks sources in this order:

1. **User custom pronunciations** (highest priority)
2. **Language-specific lexicon** (`lexicons/{lang}/medical_phonemes.json`)
3. **Shared drug lexicon** (`lexicons/shared/drug_names.json`)
4. **G2P generation** (espeak-ng)
5. **English G2P fallback** (lowest priority)

```
Term: "metformin" (Spanish)
         │
         ▼
┌─────────────────────┐
│  User Custom (es)   │ ──▶ Not found
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Spanish Lexicon    │ ──▶ Not found
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Shared Drug Names  │ ──▶ Found! "mɛtˈfɔrmɪn"
└─────────────────────┘
```

## Lexicon File Format

### Language-Specific Lexicon

```json
{
  "_meta": {
    "version": "1.0.0",
    "term_count": 146,
    "last_updated": "2024-12-04",
    "language": "en",
    "alphabet": "ipa",
    "status": "complete",
    "categories": ["drug_names", "conditions", "procedures", "anatomy"]
  },
  "diabetes": "ˌdaɪəˈbiːtiːz",
  "hypertension": "ˌhaɪpərˈtɛnʃən",
  "metformin": "mɛtˈfɔrmɪn"
}
```

### Shared Drug Lexicon

```json
{
  "_meta": {
    "version": "1.0.0",
    "term_count": 97,
    "note": "Common drug pronunciations shared across languages"
  },
  "metformin": "mɛtˈfɔrmɪn",
  "lisinopril": "laɪˈsɪnəprɪl",
  "atorvastatin": "əˌtɔːvəˈstætɪn"
}
```

## Coverage Validation

### Validate Single Language

```python
report = await service.validate_lexicon_coverage("en")

print(f"Language: {report.language}")
print(f"Status: {report.status}")           # complete | partial | placeholder
print(f"Term count: {report.term_count}")
print(f"Coverage: {report.coverage_pct}%")
print(f"Missing: {report.missing_categories}")
```

### Validate All Languages

```python
reports = await service.validate_all_lexicons()

for lang, report in reports.items():
    print(f"{lang}: {report.term_count} terms ({report.status})")
```

### CLI Validation

```bash
python -c "
from app.services.lexicon_service import get_lexicon_service
import asyncio

async def validate():
    service = get_lexicon_service()
    reports = await service.validate_all_lexicons()
    for lang, report in reports.items():
        status_icon = '✓' if report.status == 'complete' else '○'
        print(f'{status_icon} {lang}: {report.term_count} terms ({report.status})')

asyncio.run(validate())
"
```

## G2P Fallback

### espeak-ng Integration

For terms not in lexicons, the service uses espeak-ng:

```python
from app.services.lexicon_service import G2PService

g2p = G2PService()

# Generate pronunciation
phoneme = await g2p.generate("Rybelsus", "en")
print(phoneme)  # ɹɪbɛlsəs
```

### Language Support

| Language   | Engine    | Voice |
| ---------- | --------- | ----- |
| English    | espeak-ng | en-us |
| Spanish    | espeak-ng | es    |
| French     | espeak-ng | fr    |
| German     | espeak-ng | de    |
| Italian    | espeak-ng | it    |
| Portuguese | espeak-ng | pt    |
| Arabic     | mishkal   | ar    |
| Chinese    | pypinyin  | zh    |
| Hindi      | espeak-ng | hi    |
| Urdu       | espeak-ng | ur    |

### Fallback Chain

```
Term: "unknownterm" (Spanish)
         │
         ▼
┌─────────────────────┐
│  Spanish G2P        │ ──▶ espeak-ng -v es
└─────────────────────┘
         │ (if fails)
         ▼
┌─────────────────────┐
│  English G2P        │ ──▶ espeak-ng -v en-us
└─────────────────────┘
         │ (if fails)
         ▼
┌─────────────────────┐
│  Raw Term           │ ──▶ /unknownterm/
└─────────────────────┘
```

## Data Directory Configuration

### Environment Variable

```bash
# Set custom data directory
export VOICEASSIST_DATA_DIR=/path/to/data

# Or in .env
VOICEASSIST_DATA_DIR=/opt/voiceassist/data
```

### Auto-Discovery via `_resolve_data_dir()`

The `_resolve_data_dir()` function provides flexible path resolution that works across environments:

1. **Environment variable**: Check `VOICEASSIST_DATA_DIR` for an absolute path
2. **Repository root**: Walk up from the service file to find `data/lexicons/` directory
3. **Current working directory**: Check `./data/` relative to cwd
4. **Fallback**: Use relative path from service file

This ensures the lexicon service works correctly in:

- Local development (uses repo-relative path)
- CI/CD pipelines (set `VOICEASSIST_DATA_DIR` to test fixture path)
- Production (set `VOICEASSIST_DATA_DIR` to deployed data location)

```python
from app.services.lexicon_service import _resolve_data_dir

data_dir = _resolve_data_dir()
print(f"Using data directory: {data_dir}")
```

For production deployments, explicitly set the environment variable:

```bash
export VOICEASSIST_DATA_DIR=/opt/voiceassist/data
```

## TTS Integration

### With ElevenLabs

```python
from app.services.elevenlabs_service import ElevenLabsService
from app.services.lexicon_service import get_lexicon_service

lexicon = get_lexicon_service()
tts = ElevenLabsService()

# Get pronunciation for medical terms
text = "Take metformin twice daily for diabetes."
terms_to_pronounce = ["metformin", "diabetes"]

pronunciations = {}
for term in terms_to_pronounce:
    result = await lexicon.get_phoneme(term, "en")
    pronunciations[term] = result.phoneme

# ElevenLabs supports IPA in <phoneme> SSML tags
ssml_text = f'Take <phoneme alphabet="ipa" ph="{pronunciations["metformin"]}">metformin</phoneme> twice daily.'
```

## Adding New Lexicons

### 1. Create Lexicon File

```bash
# Create language directory
mkdir -p data/lexicons/pt

# Create lexicon file
cat > data/lexicons/pt/medical_phonemes.json << 'EOF'
{
  "_meta": {
    "version": "0.1.0",
    "term_count": 10,
    "last_updated": "2024-12-04",
    "language": "pt",
    "alphabet": "ipa",
    "status": "in_progress",
    "categories": ["conditions", "anatomy"]
  },
  "diabetes": "dʒiaˈbetʃis",
  "coração": "koɾaˈsɐ̃w̃"
}
EOF
```

### 2. Update LexiconService

Add to `LEXICON_PATHS` in `lexicon_service.py`:

```python
LEXICON_PATHS = {
    # ...existing...
    "pt": "lexicons/pt/medical_phonemes.json",
}
```

### 3. Validate

```bash
pytest tests/services/test_voice_v4_services.py::TestLexiconLoading -v
```

## Contributing to Lexicons

### Adding New Terms

1. **Identify the correct lexicon file**:
   - Medical terms: `data/lexicons/{lang}/medical_phonemes.json`
   - Quranic terms: `data/lexicons/{lang}/quranic_phonemes.json`

2. **Use proper IPA notation**:
   - Consult [IPA chart](https://www.internationalphoneticassociation.org/content/ipa-chart)
   - Use consistent stress markers (ˈ for primary, ˌ for secondary)
   - Include vowel length markers (ː) for Arabic/English

3. **Follow the JSON format**:

   ```json
   {
     "term_in_target_language": "ipa_pronunciation"
   }
   ```

4. **Update metadata**:
   - Increment `term_count` in `_meta`
   - Update `last_updated` date
   - Add new categories if needed

### Quranic Term Guidelines

- **Surah names**: Use both Arabic script and transliterated forms
- **Tajweed terms**: Include common spelling variations
- **Arabic IPA**: Use proper pharyngeal (ħ, ʕ), emphatic (tˤ, sˤ, dˤ), and uvular (q) consonants
- **English transliteration IPA**: Approximate Arabic sounds with closest English equivalents

### Validation

Run the lexicon validation to check coverage:

```bash
cd services/api-gateway
python -c "
from app.services.lexicon_service import get_lexicon_service
import asyncio

async def validate():
    service = get_lexicon_service()
    reports = await service.validate_all_lexicons()
    for lang, report in reports.items():
        status_icon = '✓' if report.status == 'complete' else '○'
        print(f'{status_icon} {lang}: {report.term_count} terms ({report.status})')

asyncio.run(validate())
"
```

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [Multilingual RAG Architecture](./multilingual-rag-architecture.md)
- [G2P Alternatives Evaluation](./design/g2p-alternatives-evaluation.md)
