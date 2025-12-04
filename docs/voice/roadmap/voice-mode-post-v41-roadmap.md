---
title: Voice Mode Post-v4.1 Roadmap
slug: voice-mode-post-v41-roadmap
status: planning
stability: draft
owner: platform
audience:
  - human
  - ai-agents
tags: [voice, roadmap, v4.2, planning]
summary: Post-release improvements planned after Voice Mode v4.1
lastUpdated: "2024-12-04"
---

# Voice Mode Post-v4.1 Roadmap

Following the successful release of Voice Mode v4.1.0, this document outlines planned improvements and technical debt items for the next iteration.

---

## Priority 1: Security Hardening

### Bandit Issue Resolution

**Current Status:** 0 high-severity issues (resolved in PR #157)

**Remaining Items:**

- 18 medium-severity issues
- 61 low-severity issues

**Action Plan:**

1. Review medium-severity issues and categorize by risk
2. Address issues in shared utilities and core modules first
3. Add Bandit to CI pipeline with medium-severity threshold
4. Track low-severity items for incremental cleanup

---

## Priority 2: Lexicon Expansion

### Current Coverage

| Language   | Terms | Status      |
| ---------- | ----- | ----------- |
| Arabic     | 485   | Complete    |
| English    | 852   | Partial     |
| Spanish    | 205   | Minimal     |
| Chinese    | 180   | Minimal     |
| German     | 10    | Placeholder |
| French     | 10    | Placeholder |
| Italian    | 10    | Placeholder |
| Portuguese | 10    | Placeholder |
| Hindi      | 10    | Placeholder |
| Urdu       | 10    | Placeholder |
| Japanese   | 0     | Placeholder |
| Korean     | 0     | Placeholder |
| Polish     | 0     | Placeholder |
| Russian    | 0     | Placeholder |
| Turkish    | 0     | Placeholder |

### Roadmap

**Phase 1: Complete Core Languages**

- Expand Spanish lexicon to 200+ medical terms
- Add Chinese medical terminology
- Complete English Quranic transliteration lookups

**Phase 2: Add High-Demand Languages**

- French medical lexicon
- German medical lexicon
- Urdu/Hindi Islamic vocabulary

**Phase 3: Community Contributions**

- Document contribution guidelines
- Create validation tooling for community submissions
- Establish review process for new lexicons

---

## Priority 3: Test Suite Improvements

### Known Test Issues

1. **Mock-related failures** in Phase 3 tests:
   - `test_translation_timeout_triggers_degradation`
   - `test_translation_failure_triggers_degradation`
   - `test_process_audio_returns_segments`
   - `test_speaker_change_callback`
   - `test_subscribe_to_patient`
   - `test_get_latest_vitals`
   - `test_downgrade_triggers_on_poor_metrics`
   - `test_concurrent_session_test`

2. **Root causes:**
   - Async mock handling in pytest-asyncio
   - String assertion mismatches (naming conventions)
   - External service mocking (Qdrant, FHIR)

### Action Plan

1. Refactor Phase 3 tests to use proper async fixtures
2. Add pytest markers for external service tests
3. Create mock factory utilities for consistent test setup
4. Add CI configuration to skip external service tests

---

## Priority 4: G2P Service Enhancement

### Current Issue

English transliterated Quranic terms falling back to raw G2P when espeak-ng unavailable.

### Solution

1. Add espeak-ng to deployment requirements
2. Implement fallback pronunciation cache
3. Pre-compute common term pronunciations
4. Add Docker container with espeak-ng for CI

---

## Priority 5: Feature Enhancements

### v4.2 Candidates

1. **Barge-in Improvements**
   - Faster voice detection during playback
   - Smoother audio crossfade on interruption

2. **Speaker Diarization**
   - Increase speaker limit from 4 to 8
   - Add speaker naming/labeling UI

3. **Adaptive Quality**
   - Add bandwidth prediction
   - Implement proactive quality adjustment

4. **FHIR Integration**
   - Add SMART on FHIR authentication
   - Support additional FHIR resources

---

## Timeline

| Phase                   | Target  | Status  |
| ----------------------- | ------- | ------- |
| Bandit medium issues    | v4.1.1  | Planned |
| Test suite fixes        | v4.1.1  | Planned |
| Lexicon Phase 1         | v4.1.2  | Planned |
| G2P enhancement         | v4.1.2  | Planned |
| Feature enhancements    | v4.2.0  | Planned |
| Community contributions | Ongoing | Open    |

---

## Related Documentation

- [What's New in Voice Mode v4.1](../whats-new-v4-1.md)
- [Lexicon Service Guide](../lexicon-service-guide.md)
- [Voice Mode Architecture](../voice-mode-v4-overview.md)

---

**Created:** December 4, 2024
**Status:** Planning
**Owner:** Platform Team
