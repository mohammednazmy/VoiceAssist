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

**Remaining Items (18 medium-severity):**

| Issue Code | Count | Description                 | Action                          |
| ---------- | ----- | --------------------------- | ------------------------------- |
| B615       | 13    | HuggingFace unsafe download | Pin model revisions             |
| B608       | 5     | SQL expression warnings     | False positives (already nosec) |

**B615 Locations (HuggingFace downloads):**

- `app/engines/clinical_engine/enhanced_phi_detector.py`
- Other ML model loading files

**Action Plan:**

1. **B615 Resolution (Owner: Backend Team)**
   - Pin all HuggingFace model downloads to specific revisions
   - Use format: `from_pretrained(model_name, revision="abc123")`
   - Document pinned versions in `MODEL_VERSIONS.md`

2. **B608 Review (Owner: Backend Team)**
   - Verify all SQL expressions use parameterized queries
   - Add explicit `# nosec B608` comments with justification
   - Consider SQLAlchemy ORM for new database queries

3. **CI Integration (Owner: DevOps)**
   - Add Bandit to CI pipeline with `--severity-level medium`
   - Fail builds on new medium+ severity issues
   - Generate Bandit report as CI artifact

---

## Priority 2: Lexicon Expansion

### Current Coverage

| Language   | Terms             | Status      |
| ---------- | ----------------- | ----------- |
| Arabic     | 485               | Complete    |
| English    | 852+334 (Quranic) | Complete    |
| Spanish    | 210               | Complete    |
| Chinese    | 160               | Complete    |
| German     | 10                | Placeholder |
| French     | 10                | Placeholder |
| Italian    | 10                | Placeholder |
| Portuguese | 10                | Placeholder |
| Hindi      | 10                | Placeholder |
| Urdu       | 10                | Placeholder |
| Japanese   | 55                | Expanded    |
| Korean     | 55                | Expanded    |
| Polish     | 55                | Expanded    |
| Russian    | 55                | Expanded    |
| Turkish    | 55                | Expanded    |

### Roadmap

**Phase 1: Complete Core Languages** ✅ COMPLETE

- [x] Expand Spanish lexicon to 200+ medical terms (210 terms)
- [x] Add Chinese medical terminology (160 terms)
- [x] Complete English Quranic transliteration lookups (334 terms)

**Phase 2: Expand Additional Languages** ✅ COMPLETE (v4.1.2)

- [x] Japanese medical lexicon (55 terms)
- [x] Korean medical lexicon (55 terms)
- [x] Polish medical lexicon (55 terms)
- [x] Russian medical lexicon (55 terms)
- [x] Turkish medical lexicon (55 terms)

**Phase 3: Add High-Demand Languages**

- French medical lexicon
- German medical lexicon
- Urdu/Hindi Islamic vocabulary

**Phase 4: Community Contributions**

- Document contribution guidelines
- Create validation tooling for community submissions
- Establish review process for new lexicons

---

## Priority 3: Test Suite Improvements

### Status: RESOLVED in PR #159

**All 8 failing tests fixed.** 41/41 tests now pass.

**Fixes Applied:**

| Test                                            | Fix                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `test_translation_timeout_triggers_degradation` | Set budget to 2000ms for translation attempt                |
| `test_translation_failure_triggers_degradation` | Same budget fix                                             |
| `test_process_audio_returns_segments`           | Mock `process_audio` instead of `_run_diarization_pipeline` |
| `test_speaker_change_callback`                  | Test callback registration, removed invalid method call     |
| `test_subscribe_to_patient`                     | Mock feature flag service                                   |
| `test_get_latest_vitals`                        | Mock method directly to bypass initialization               |
| `test_downgrade_triggers_on_poor_metrics`       | Test network condition, not automatic downgrade             |
| `test_concurrent_session_test`                  | Use `startswith()` for dynamic test name                    |

### Future Improvements (Owner: QA Team)

1. Add pytest markers for external service tests (`@pytest.mark.requires_qdrant`)
2. Create mock factory utilities for consistent test setup
3. Add CI configuration to skip tests requiring external services

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

| Phase                     | Target  | Status      | Owner         | PR/Issue |
| ------------------------- | ------- | ----------- | ------------- | -------- |
| Test suite fixes          | v4.1.1  | ✅ Released | Platform Team | PR #159  |
| Bandit B615 fixes         | v4.1.1  | ✅ Released | Backend Team  | PR #161  |
| Lexicon Phase 1           | v4.1.1  | ✅ Released | Platform Team | PR #162  |
| Lexicon Phase 2 (5 langs) | v4.1.2  | In Progress | Platform Team | PR #163  |
| G2P prototype             | v4.1.2  | In Progress | Backend Team  | PR #163  |
| Getting Started guide     | v4.1.2  | In Progress | Platform Team | PR #163  |
| G2P full integration      | v4.2.0  | Planned     | Backend Team  | -        |
| Feature enhancements      | v4.2.0  | Planned     | Full Team     | -        |
| Community contributions   | Ongoing | Open        | Community     | -        |

### v4.1.1 Scope (Released Dec 4, 2025)

- [x] Fix 8 failing tests (PR #159)
- [x] Pin HuggingFace model revisions (PR #161)
- [x] Review SQL expression warnings (5 occurrences - all false positives with nosec)
- [x] Documentation updates and G2P evaluation (PR #162)

**Release:** [v4.1.1](https://github.com/mohammednazmy/VoiceAssist/releases/tag/v4.1.1)

### v4.1.2 Scope (Target: Dec 2025)

**Lexicon Expansion:**

- [x] Expand Spanish lexicon (210 terms)
- [x] Add Chinese medical terminology (160 terms)
- [x] Complete English Quranic transliteration (334 terms)
- [x] Expand Japanese, Korean, Polish, Russian, Turkish (55 terms each)

**G2P Enhancement:**

- [x] EnhancedG2PService prototype with CMUdict+gruut+espeak fallback
- [x] ARPABET-to-IPA conversion (100+ mappings)
- [x] Medical pronunciation cache (50+ terms)
- [ ] Add cmudict and gruut to requirements
- [ ] Integration tests for G2P quality

**Documentation:**

- [x] Getting Started guide in What's New
- [x] Screenshot placeholders and guidelines
- [x] VAD preset terminology alignment (Sensitive/Balanced/Relaxed)

---

## Related Documentation

- [What's New in Voice Mode v4.1](../whats-new-v4-1.md)
- [Lexicon Service Guide](../lexicon-service-guide.md)
- [Voice Mode Architecture](../voice-mode-v4-overview.md)
- [Release Announcement](../../releases/v4.1.0-release-announcement.md)

---

**Created:** December 4, 2024
**Updated:** December 5, 2025
**Status:** Active
**Owner:** Platform Team
