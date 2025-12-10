---
title: Documentation Changelog
slug: docs-changelog
summary: History of significant documentation changes.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - changelog
  - history
category: reference
component: "docs/overview"
ai_summary: >-
  Track significant documentation changes. Useful for understanding
  what's been updated and when. Check here before reading stale docs.
---

# Documentation Changelog

> **Last Updated**: 2025-12-08

This changelog tracks significant documentation updates. For code changes, see the main [CHANGELOG.md](../CHANGELOG.md).

---

## 2025-12-08

### Major Cleanup & Improvements

**New Documents:**

- `QUICK_REFERENCE.md` - Commands, ports, and locations cheatsheet
- `GLOSSARY.md` - Terminology definitions
- `DOCS_CHANGELOG.md` - This file
- `tasks/` directory with task templates:
  - `ADD_API_ENDPOINT.md`
  - `ADD_FRONTEND_COMPONENT.md`
  - `DEBUG_ISSUE.md`

**Updated Documents:**

- `ai/AGENT_ONBOARDING.md` - Added "5-Minute Context" and decision trees
- `README.md` - Fixed broken links, updated dates
- `UNIFIED_ARCHITECTURE.md` - Removed outdated phase terminology
- `SERVICE_CATALOG.md` - Updated to current/future framing
- Multiple docs - Fixed `server/` → `services/api-gateway/` references

**Archived:**

- Moved `VOICE_STATE_2025-11-29.md`, `VOICE_READY_STATE_2025-11-25.md`, `VOICE_MODE_ENHANCEMENT_10_PHASE.md` to `archive/voice-history/`

**Infrastructure:**

- Added `scripts/check-docs-health.js` for documentation validation
- Updated navigation.ts with new Quick Reference link

---

## 2025-12-08 (Earlier)

### Documentation Consolidation

**Archived (to `archive/summaries/`):**

- 13 celebration/summary documents
- Historical phase completion summaries

**Archived (to `archive/legacy-v1/`):**

- `ARCHITECTURE.md` (replaced by UNIFIED_ARCHITECTURE.md)
- `ARCHITECTURE_V2.md` (consolidated into UNIFIED_ARCHITECTURE.md)
- `DEVELOPMENT_PHASES.md` (V1 phases)

**New Documents:**

- `EXTENSION_GUIDE.md` - Practical patterns for extending VoiceAssist

**Updated Documents:**

- `START_HERE.md` - Removed celebration content, added practical next steps

---

## 2025-12-07

### Archive Reorganization

- Created `archive/phases/` for phase completion reports
- Moved 17 dated phase completion and fix documents to archive
- Updated `archive/README.md` with subdirectory index

---

## 2025-11-27 - 2025-12-06

### Continuous Updates

- Regular updates to IMPLEMENTATION_STATUS.md
- Voice mode documentation additions
- Admin Panel documentation updates
- Debugging guides expanded

---

## How to Update This Changelog

When making significant documentation changes:

1. Add a new section with today's date
2. Categorize changes:
   - **New Documents:** - Newly created docs
   - **Updated Documents:** - Significant updates to existing docs
   - **Archived:** - Docs moved to archive
   - **Removed:** - Docs deleted entirely
   - **Infrastructure:** - Tooling, scripts, navigation changes
3. Keep descriptions brief but informative
4. Update the `lastUpdated` date in frontmatter

---

## Related Documents

- [README.md](README.md) - Documentation index
- [archive/README.md](archive/README.md) - Archive index
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute
