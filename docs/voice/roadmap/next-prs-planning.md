---
title: Next PRs Planning - Post Phase 3
slug: next-prs-planning
status: draft
owner: backend
audience:
  - human
  - ai-agents
tags: [planning, security, lexicon, roadmap]
summary: Planning document for lexicon expansion and security cleanup PRs
lastUpdated: "2025-12-04"
category: planning
ai_summary: >-
  Post-Phase 3 PR planning for security cleanup and lexicon expansion. Security
  PR addresses Bandit issues: B324 (MD5), B608 (SQL injection), B615
  (HuggingFace unpinned). See MODEL_VERSIONS.md for pinned revisions and
  voice-mode-post-v41-roadmap.md for full roadmap.
---

# Next PRs Planning - Post Voice Mode v4.1 Phase 3

This document outlines the next steps after completing Voice Mode v4.1 Phase 3.

## PR #1: Security Cleanup

**Branch:** `security/bandit-cleanup`

### Priority Issues (Must Fix)

#### High Severity

1. **B324: Weak MD5 hash** in `speaker_diarization_service.py:881`
   - Currently: `hashlib.md5(hash_input.encode()).hexdigest()`
   - Fix: Add `usedforsecurity=False` parameter
   - Example: `hashlib.md5(hash_input.encode(), usedforsecurity=False).hexdigest()`

#### Medium Severity

2. **B608: SQL Injection** in multiple files
   - `admin_calendar_connections.py:96` - String-based WHERE clause
   - `admin_calendar_connections.py:112` - Count query
   - `query_profiler.py:277`
   - `analytics_service.py:65, 246, 442`
   - Fix: Use parameterized queries or SQLAlchemy ORM

3. **B615: HuggingFace Unpinned Downloads** (11 instances)
   - `enhanced_phi_detector.py:215-216`
   - `ml_classifier.py:205, 252, 460`
   - `medical_embedding_service.py:171, 176-179`
   - `medical_embeddings.py:148-149, 240-241`
   - Fix: Add revision pinning to all `from_pretrained()` calls

### Low Priority (False Positives & Acceptable)

These are false positives that can be addressed with `# nosec` comments:

4. **B105/B106: Hardcoded Password False Positives**
   - Error code constants (`TOKEN_INVALID`, `TOKEN_REVOKED`, etc.)
   - Token type strings (`"access"`, `"bearer"`, `"refresh"`)
   - OAuth URLs (Google, Epic FHIR endpoints)
   - Fix: Add `# nosec B105 - error code constant` comments

5. **B110: Try/Except/Pass**
   - Many instances for graceful error handling
   - Fix: Add logging or explicit `# nosec B110` with reason

6. **B403: Pickle Import**
   - `cache_service.py:28` - Used for internal caching
   - Fix: Add comment explaining controlled usage

### Tasks Checklist

- [ ] Fix MD5 hash in speaker_diarization_service.py
- [ ] Refactor SQL queries to use parameterized statements
- [ ] Pin HuggingFace model revisions
- [ ] Add nosec comments with explanations for false positives
- [ ] Add logging to try/except/pass blocks where appropriate
- [ ] Run full bandit scan and verify all issues addressed
- [ ] Update security documentation

### Estimated Changes

| File                           | Changes        |
| ------------------------------ | -------------- |
| speaker_diarization_service.py | 1 line         |
| admin_calendar_connections.py  | 20-30 lines    |
| query_profiler.py              | 10 lines       |
| analytics_service.py           | 30-40 lines    |
| enhanced_phi_detector.py       | 5 lines        |
| ml_classifier.py               | 10 lines       |
| medical_embedding\*.py         | 15 lines       |
| Various api/\*.py              | nosec comments |

---

## PR #2: Lexicon Expansion

**Branch:** `feature/lexicon-expansion-quranic`

### Overview

Expand the lexicon service with comprehensive Quranic terminology for improved voice mode understanding.

### New Lexicon Categories

#### 1. Surah Names (114 entries)

```yaml
quranic_surahs:
  - term: "Al-Fatiha"
    aliases: ["The Opening", "Fatiha", "الفاتحة"]
    number: 1
    type: "Meccan"
    verses: 7
  - term: "Al-Baqara"
    aliases: ["The Cow", "Baqara", "البقرة"]
    number: 2
    type: "Medinan"
    verses: 286
  # ... all 114 surahs
```

#### 2. Tajweed Terms (50+ entries)

```yaml
tajweed_terms:
  - term: "Ikhfa"
    arabic: "إخفاء"
    definition: "Concealment - a nasal sound made when noon sakinah or tanween is followed by specific letters"
    related: ["noon_sakinah", "tanween"]
  - term: "Idgham"
    arabic: "إدغام"
    definition: "Merging - assimilating noon sakinah or tanween into following letter"
    related: ["noon_sakinah", "idgham_with_ghunnah"]
  # ... more terms
```

#### 3. Quranic Arabic Vocabulary (200+ entries)

```yaml
quranic_vocabulary:
  - term: "Taqwa"
    arabic: "تقوى"
    definition: "God-consciousness, piety, mindfulness of Allah"
    root: "و-ق-ي"
    frequency: 258 # occurrences in Quran
  - term: "Rahman"
    arabic: "الرحمن"
    definition: "The Most Merciful - one of the names of Allah"
    category: "names_of_allah"
  # ... more vocabulary
```

#### 4. Famous Reciters (20+ entries)

```yaml
quranic_reciters:
  - name: "Abdul Rahman Al-Sudais"
    arabic: "عبد الرحمن السديس"
    country: "Saudi Arabia"
    style: "Hafs"
    known_for: ["Imam of Masjid al-Haram"]
  - name: "Mishary Rashid Alafasy"
    arabic: "مشاري راشد العفاسي"
    country: "Kuwait"
    style: "Hafs"
  # ... more reciters
```

#### 5. Islamic Terms (100+ entries)

```yaml
islamic_terms:
  - term: "Salah"
    aliases: ["Prayer", "Salat", "صلاة"]
    definition: "The ritual prayer, one of the Five Pillars of Islam"
  - term: "Zakat"
    aliases: ["Alms-giving", "زكاة"]
    definition: "Obligatory charity, one of the Five Pillars of Islam"
  # ... more terms
```

### Implementation Tasks

- [ ] Create lexicon data files in YAML format
- [ ] Add Arabic text normalization utilities
- [ ] Implement phonetic matching for Arabic transliterations
- [ ] Add Surah number-to-name lookup
- [ ] Create reciter voice preference mapping
- [ ] Add tajweed explanation generator
- [ ] Integrate with KB search for Quranic references
- [ ] Add tests for lexicon expansion
- [ ] Update documentation

### Files to Create/Modify

| File                                       | Action            |
| ------------------------------------------ | ----------------- |
| `data/lexicons/quranic_surahs.yaml`        | Create            |
| `data/lexicons/tajweed_terms.yaml`         | Create            |
| `data/lexicons/quranic_vocabulary.yaml`    | Create            |
| `data/lexicons/islamic_terms.yaml`         | Create            |
| `data/lexicons/quranic_reciters.yaml`      | Create            |
| `services/lexicon_service.py`              | Extend            |
| `services/kb_service.py`                   | Add surah lookups |
| `tests/services/test_lexicon_expansion.py` | Create            |

### Integration Points

1. **Voice Recognition Enhancement**
   - Use lexicon for Arabic term correction in STT
   - Improve surah name recognition

2. **KB Search Enhancement**
   - Surah name → verse lookup
   - Tajweed term → explanation
   - Vocabulary → definitions

3. **TTS Enhancement**
   - Proper Arabic pronunciation hints
   - Reciter name pronunciation

---

## Timeline and Priority

| PR                | Priority | Dependencies | Estimated Effort |
| ----------------- | -------- | ------------ | ---------------- |
| Security Cleanup  | High     | None         | 1-2 days         |
| Lexicon Expansion | Medium   | None         | 3-5 days         |

### Recommended Order

1. **Security Cleanup First** - Addresses potential vulnerabilities
2. **Lexicon Expansion Second** - Enhances user experience

---

## Related Documentation

- [Phase 3 Implementation Plan](../phase3-implementation-plan.md)
- [Voice Mode v4.1 Overview](../voice-mode-v4-overview.md)
- [Model Versions Reference](../MODEL_VERSIONS.md)
