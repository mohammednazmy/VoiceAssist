---
title: G2P Service Alternatives Evaluation
slug: g2p-alternatives-evaluation
status: draft
stability: experimental
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, g2p, pronunciation, tts, design]
summary: Evaluation of G2P (Grapheme-to-Phoneme) alternatives for v4.1.2
lastUpdated: "2024-12-04"
---

# G2P Service Alternatives Evaluation

This document evaluates alternative G2P (Grapheme-to-Phoneme) systems for the VoiceAssist platform, addressing the current limitations with espeak-ng availability and pronunciation quality.

## Current Implementation

**Location:** `services/api-gateway/app/services/lexicon_service.py`

### Architecture

```
Term → Lexicon Lookup → Shared Drugs → G2P → Fallback
                         ↓
        espeak-ng (most languages)
        pypinyin (Chinese)
        mishkal (Arabic - placeholder)
```

### Issues

1. **espeak-ng dependency**: Not always installed, causing fallback to raw term
2. **Quality**: espeak-ng pronunciations can be robotic/non-native
3. **Medical terminology**: Poor handling of medical/pharmaceutical terms
4. **Arabic support**: mishkal integration incomplete

---

## Alternative G2P Libraries

### 1. phonemizer

**Repository:** https://github.com/bootphon/phonemizer
**License:** GPL-3.0

**Pros:**

- Wraps espeak-ng, Festival, and other backends
- Clean Python API
- Supports batch processing
- Multiple output formats (IPA, SAMPA)

**Cons:**

- Still requires espeak-ng as backend
- GPL license may cause issues
- No improvement over raw espeak-ng quality

**Installation:**

```bash
pip install phonemizer
apt-get install espeak-ng  # Still required
```

**Code Example:**

```python
from phonemizer import phonemize
text = "diabetes mellitus"
phonemes = phonemize(text, language='en-us', backend='espeak')
# Output: "daɪəbiːtiːz mɛlɪtəs"
```

**Verdict:** ❌ Not recommended - same espeak dependency

---

### 2. g2p_en

**Repository:** https://github.com/Kyubyong/g2p
**License:** Apache-2.0

**Pros:**

- Neural network-based G2P for English
- No espeak dependency
- Pure Python
- Good quality for common words

**Cons:**

- English only
- No medical vocabulary training
- Slower than rule-based

**Installation:**

```bash
pip install g2p_en
```

**Code Example:**

```python
from g2p_en import G2p
g2p = G2p()
phonemes = g2p("metformin")
# Output: ['M', 'EH1', 'T', 'F', 'AO0', 'R', 'M', 'IH0', 'N']
```

**Verdict:** ⚠️ Possible for English fallback

---

### 3. gruut

**Repository:** https://github.com/rhasspy/gruut
**License:** MIT

**Pros:**

- Multi-language support (20+ languages)
- Designed for TTS pipelines
- MIT license
- Pure Python, no system dependencies
- Includes lexicon support

**Cons:**

- Less accurate than neural models
- No Arabic support
- Requires language-specific data files

**Installation:**

```bash
pip install gruut[en,es,de,fr]
```

**Code Example:**

```python
from gruut import sentences
for sent in sentences("Metformin is used for diabetes", lang="en-us"):
    for word in sent:
        print(word.text, word.phonemes)
```

**Verdict:** ✅ Recommended for evaluation

---

### 4. cmudict (CMU Pronouncing Dictionary)

**Repository:** Part of NLTK / standalone
**License:** BSD

**Pros:**

- 130,000+ English pronunciations
- Fast dictionary lookup
- No ML overhead
- Widely used standard

**Cons:**

- English only
- No OOV handling (needs G2P fallback)
- No medical terminology

**Installation:**

```bash
pip install cmudict
# OR via NLTK
python -c "import nltk; nltk.download('cmudict')"
```

**Verdict:** ✅ Recommended as primary English lookup

---

### 5. epitran

**Repository:** https://github.com/dmort27/epitran
**License:** MIT

**Pros:**

- Rule-based IPA transcription
- Supports 100+ languages
- No ML overhead
- Consistent output

**Cons:**

- Rule-based = less accurate
- No context awareness
- Limited phonetic detail

**Verdict:** ⚠️ Useful for placeholder languages

---

## Recommendation

### Proposed Architecture

```
Term → Lexicon Lookup → CMUdict → gruut → espeak-ng fallback
         ↓
  (Medical lexicons)   (English)  (Multi-lang)  (Last resort)
```

### Implementation Plan

#### Phase 1: Add CMUdict for English

```python
class EnhancedG2PService:
    def __init__(self):
        self.cmudict = None
        self._load_cmudict()

    def _load_cmudict(self):
        try:
            import cmudict
            self.cmudict = cmudict.dict()
        except ImportError:
            logger.warning("cmudict not available")

    async def generate_english(self, term: str) -> str:
        # 1. Try CMUdict
        if self.cmudict and term.lower() in self.cmudict:
            return self._arpabet_to_ipa(self.cmudict[term.lower()][0])

        # 2. Try gruut
        # 3. Fall back to espeak-ng
```

#### Phase 2: Add gruut for Multi-language

```python
async def generate(self, term: str, language: str) -> str:
    if language == "en":
        return await self.generate_english(term)

    # Try gruut for supported languages
    if language in self.GRUUT_LANGUAGES:
        return await self._generate_gruut(term, language)

    # Fall back to espeak-ng
    return await self._generate_espeak(term, language)
```

#### Phase 3: Pre-compute Common Pronunciations

Build a pronunciation cache for common medical terms:

```python
PRECOMPUTED_PRONUNCIATIONS = {
    "metformin": "mɛtˈfɔrmɪn",
    "lisinopril": "laɪˈsɪnəprɪl",
    # ... 1000+ medical terms
}
```

---

## Migration Path

1. **v4.1.2**: Add CMUdict for English, optional gruut
2. **v4.2.0**: Full gruut integration, deprecate espeak-ng primary
3. **v4.3.0**: Neural G2P for medical terms

## Dependencies

### Current

```
# Already in requirements
pypinyin>=0.48.0  # Chinese pinyin
```

### Proposed Additions

```
cmudict>=1.0.12     # CMU Pronouncing Dictionary
gruut>=2.3.0        # Multi-language G2P
```

### Optional (system)

```bash
# Still useful as fallback
apt-get install espeak-ng
```

---

## Testing Strategy

### Unit Tests

```python
class TestG2PService:
    async def test_english_cmudict_lookup(self):
        g2p = EnhancedG2PService()
        result = await g2p.generate("hello", "en")
        assert "h" in result.lower()
        assert g2p.last_source == "cmudict"

    async def test_fallback_chain(self):
        g2p = EnhancedG2PService()
        # Unknown word should fall through to gruut/espeak
        result = await g2p.generate("xyzabc123", "en")
        assert result  # Should return something, not error
```

### Integration Tests

```python
async def test_medical_term_quality(self):
    """Compare G2P output against reference pronunciations."""
    g2p = EnhancedG2PService()
    reference = load_reference_pronunciations()

    for term, expected_ipa in reference.items():
        result = await g2p.generate(term, "en")
        similarity = phonetic_similarity(result, expected_ipa)
        assert similarity > 0.8, f"Poor pronunciation for {term}"
```

---

## Decision

**Recommended approach:** Implement CMUdict + gruut hybrid

**Rationale:**

- CMUdict provides high-quality English pronunciations
- gruut adds multi-language support without system dependencies
- espeak-ng remains as fallback for unsupported languages
- No GPL licensing issues (all MIT/BSD/Apache)

**Next Steps:**

1. ~~Add `cmudict` and `gruut` to requirements~~
2. ~~Implement `EnhancedG2PService` class~~ ✅ DONE
3. ~~Add ARPABET-to-IPA conversion utility~~ ✅ DONE
4. ~~Build pronunciation cache for medical terms~~ ✅ DONE (50+ terms)
5. Update lexicon service to use new G2P

## Implementation Status

**Prototype:** `services/api-gateway/app/services/enhanced_g2p_service.py`

**Features Implemented:**

- ARPABET-to-IPA conversion (100+ phoneme mappings)
- Medical pronunciation cache (50+ common terms)
- CMUdict lookup for English (~130k words)
- gruut integration for 11 languages
- espeak-ng fallback for all other languages
- Runtime caching (up to 10k entries)
- Batch generation support

**Fallback Chain:**

1. Medical pronunciation cache (confidence: 0.95)
2. CMUdict lookup for English (confidence: 0.90)
3. gruut for supported languages (confidence: 0.80)
4. espeak-ng for all languages (confidence: 0.70)
5. Raw term fallback (confidence: 0.30)

---

**Created:** December 4, 2024
**Updated:** December 4, 2025
**Author:** Platform Team
**Status:** Prototype Complete
