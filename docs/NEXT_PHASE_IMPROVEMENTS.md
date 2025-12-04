---
title: Next Phase Improvements
slug: next-phase-improvements
summary: Roadmap and tracking for documentation improvements and AI-friendly enhancements
ai_summary: Tracks documentation improvements across sprints. Sprint 1 (accessibility, monitoring) complete. Sprint 2 (HelpTooltip, validation) complete. Sprint 3 (versioning, CODEOWNERS, i18n) in planning. Priority TODOs include adding ai_summary to more docs.
status: stable
owner: docs
lastUpdated: "2025-12-04"
audience: ["developers", "docs", "ai-agents"]
category: planning
tags: ["roadmap", "improvements", "documentation"]
---

# Next Phase Improvements

This document tracks the roadmap for documentation improvements and AI-friendly enhancements.

---

## Sprint Status Overview

| Sprint   | Focus Area                  | Status      | Completion |
| -------- | --------------------------- | ----------- | ---------- |
| Sprint 1 | Accessibility & Monitoring  | ✅ Complete | 100%       |
| Sprint 2 | In-App Help & Validation    | ✅ Complete | 100%       |
| Sprint 3 | Versioning, Ownership, i18n | 📋 Planning | 0%         |

---

## Sprint 1: Accessibility & Monitoring ✅

**Status**: Complete

### Completed Tasks

- [x] WCAG 2.1 AA accessibility improvements
  - Skip-to-content link
  - Enhanced focus indicators
  - ARIA labels and roles
  - Reduced motion support
- [x] Documentation monitoring dashboard
  - `/agent/health.json` endpoint
  - Per-category freshness scores
  - Coverage metrics
  - Recommended next steps

---

## Sprint 2: In-App Help & Validation ✅

**Status**: Complete

### Completed Tasks

- [x] HelpTooltip component for contextual help
  - 16 help topics (feature flags, KB, settings)
  - Hover/click trigger modes
  - Documentation links
  - Tests in `shared.test.tsx`
- [x] Frontmatter validation script
  - `scripts/validate-frontmatter.js`
  - Required fields: title, status, lastUpdated, summary
  - Recommended fields: ai_summary, audience, category, owner
  - JSON output for CI integration
- [x] AI-agent navigation page
  - `/admin-guide/for-ai-agents.md`
  - Endpoint documentation
  - Directory structure guide
  - Best practices for AI agents
- [x] Enhanced agent JSON endpoints
  - `docs-summary.json` with audience grouping
  - `code-examples.json` with 3280 examples across 26 languages
  - Per-category freshness in `health.json`

---

## Sprint 3: Versioning, Ownership, i18n 📋

**Status**: Planning

See [Sprint 3 Design Documents](./planning/SPRINT_3_DESIGN_DOCS.md) for detailed specifications.

### Planned Tasks

- [ ] Documentation versioning system
  - Version manifest (versions.json)
  - VersionSelector component
  - Git-tag-based snapshots
  - SEO-friendly URLs
- [ ] CODEOWNERS for cross-team ownership
  - `.github/CODEOWNERS` file
  - Ownership metadata in frontmatter
  - Ownership metrics in health.json
- [ ] i18n/RTL multi-language preparation
  - Directory structure for locales
  - RTL CSS support
  - LocaleProvider component
  - Translation status tracking

---

## Priority TODOs

### High Priority

1. **Add ai_summary to more documents**
   - Current coverage: ~4% (10/252 docs)
   - Target: 50% coverage by end of month
   - Priority categories: api, architecture, security

2. **Migrate critical documentation to AI-friendly format**
   - [ ] Clinical workflows documentation
   - [ ] Admin panel user guide
   - [ ] Troubleshooting guides
   - [ ] API endpoint documentation

3. **Integrate validation into CI**
   - Add `npm run validate:frontmatter` to CI pipeline
   - Fail builds on missing required fields
   - Warn on missing recommended fields

### Medium Priority

4. **Improve code example extraction**
   - Add semantic labels to code blocks
   - Extract inline code references
   - Link examples to API endpoints

5. **Documentation testing framework**
   - Link validation script
   - Code example testing (syntax check)
   - Broken reference detection

### Low Priority

6. **Historical documentation cleanup**
   - Archive deprecated docs
   - Update stale references
   - Remove duplicate content

---

## Metrics Dashboard

### Current State (2025-12-04)

| Metric                | Value | Target    |
| --------------------- | ----- | --------- |
| Total Documents       | 252   | -         |
| With ai_summary       | 10    | 126 (50%) |
| AI Summary Coverage   | 4%    | 50%       |
| Validation Errors     | 0     | 0         |
| Stale Docs (30+ days) | 0     | 0         |
| Categories Tracked    | 13    | 15        |
| Code Examples         | 3,280 | -         |

### AI Agent Endpoints

| Endpoint                    | Status  | Records                |
| --------------------------- | ------- | ---------------------- |
| `/agent/index.json`         | ✅ Live | 8 endpoints            |
| `/agent/docs.json`          | ✅ Live | 252 docs               |
| `/agent/docs-summary.json`  | ✅ Live | By category & audience |
| `/agent/code-examples.json` | ✅ Live | 3,280 examples         |
| `/agent/health.json`        | ✅ Live | Per-category freshness |
| `/agent/status.json`        | ✅ Live | System status          |

---

## Changelog

### 2025-12-04

- Completed Sprint 2 tasks
- Created HelpTooltip component
- Added frontmatter validation script
- Created AI-agent navigation page
- Enhanced docs-summary.json with audience grouping
- Added code-examples.json endpoint
- Created Sprint 3 design documents
- Fixed 3 docs with validation errors

### 2025-12-03

- Completed Sprint 1 accessibility improvements
- Added health.json monitoring endpoint
- Created feature-flags documentation suite

---

## Contributing

When adding or updating documentation:

1. **Always include ai_summary** in frontmatter (2-3 sentences)
2. **Set correct audience** tags (include `ai-agents` for AI-optimized docs)
3. **Update lastUpdated** date
4. **Run validation**: `node scripts/validate-frontmatter.js`
5. **Regenerate agent JSON**: `node scripts/generate-all-agent-json.js`

---

**Document Version**: 1.0
**Last Updated**: 2025-12-04
**Maintained By**: VoiceAssist Documentation Team
