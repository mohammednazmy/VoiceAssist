---
title: Documentation Improvement - Next Phase
status: draft
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: planning
owner: documentation
summary: Remaining documentation improvements and next steps for VoiceAssist
---

# Documentation Improvement - Next Phase

## Completed in Current Phase

### Workstream A: URL Consistency ✅
- Fixed 59 occurrences of deprecated `voiceassist.asimo.io` → `dev.asimo.io`
- Updated across 12 files
- Added CI validation to prevent future regressions

### Workstream B: Agent JSON Generation ✅
- Created `scripts/generate-all-agent-json.js` - consolidated script
- Generates: index.json, docs.json, status.json, activity.json, todos.json
- Fixed gray-matter module dependency issues

### Workstream C: Feature Flag Documentation ✅
- Created `docs/admin-guide/feature-flags/` with 7 files:
  - README.md, naming-conventions.md, lifecycle.md
  - advanced-types.md, multi-environment.md, admin-panel-guide.md
  - best-practices.md
- Created `docs/admin-guide/system-settings-vs-flags.md`
- Updated naming convention to match existing code (`category.feature_name`)

### Workstream D: Style Guide ✅
- Created `docs/STYLE_GUIDE.md`
- Defined frontmatter requirements and writing standards

### Workstream E: CI/CD Validation ✅
- Enhanced `.github/workflows/docs-validation.yml`:
  - Canonical URL validation
  - Feature flag naming validation
  - Frontmatter validation
- Created `.github/workflows/sync-flag-docs.yml`

### Workstream H: Backup/Recovery ✅
- Created `scripts/backup-docs.sh`
- Functions: create, restore, list, cleanup

---

## Next Phase: Remaining Improvements

### 1. Documentation Versioning System

**Priority:** Medium
**Effort:** 2-3 days

Implement version tracking for documentation:

```typescript
// docs-site/src/lib/versioning.ts
interface DocVersion {
  version: string;        // "2.0.0"
  releaseDate: string;   // "2025-12-01"
  changelog: string;     // Path to changelog
}
```

**Tasks:**
- [ ] Add version dropdown to docs-site header
- [ ] Create `/docs/versions/` directory structure
- [ ] Implement version-aware routing
- [ ] Add `version` field to frontmatter schema

### 2. Accessibility Improvements

**Priority:** High
**Effort:** 1-2 days

WCAG 2.1 AA compliance for docs-site:

**Tasks:**
- [ ] Add skip-to-content link
- [ ] Improve keyboard navigation in sidebar
- [ ] Add ARIA labels to interactive elements
- [ ] Test with screen reader (NVDA/VoiceOver)
- [ ] Add focus indicators to all interactive elements
- [ ] Ensure color contrast meets AA standards

### 3. Documentation Monitoring Dashboard

**Priority:** Medium
**Effort:** 2-3 days

Track documentation health metrics:

**Tasks:**
- [ ] Create `/agent/health.json` endpoint with:
  - Stale doc count (not updated in 30+ days)
  - Missing frontmatter count
  - Broken link count
  - Coverage score
- [ ] Add to Grafana dashboard
- [ ] Create weekly report email/Slack notification

### 4. Cross-Team Documentation Ownership

**Priority:** Low
**Effort:** 1 day

Clarify ownership and review processes:

**Tasks:**
- [ ] Add `owner` field validation in CI
- [ ] Create CODEOWNERS for /docs directory
- [ ] Document review process in CONTRIBUTING.md
- [ ] Set up automated review requests by owner

### 5. Enhanced In-App Help Integration

**Priority:** Medium
**Effort:** 2 days

Connect apps to documentation contextually:

**Tasks:**
- [ ] Add `HelpTooltip` component with docs links
- [ ] Create `/api/docs/contextual` endpoint
- [ ] Implement context-aware help in:
  - [ ] Admin Panel settings
  - [ ] KB Editor
  - [ ] Web App voice mode
- [ ] Add "Learn more" links throughout UI

### 6. Search Index for New Feature Flag Docs ✅ COMPLETED

**Priority:** High
**Effort:** 1 day
**Completed:** 2025-12-04

**Tasks:**
- [x] Regenerate search-index.json to include admin-guide/feature-flags/
- [x] Verify DocsSearch finds feature flag content (525 references)
- [x] Test search with common queries
- [x] Deploy updated search index to assistdocs.asimo.io

### 7. Documentation Testing Framework

**Priority:** Medium
**Effort:** 2-3 days

Automated testing for documentation:

**Tasks:**
- [ ] Test code examples compile/run
- [ ] Validate API endpoint examples work
- [ ] Check internal links resolve
- [ ] Validate external links (non-blocking)
- [ ] Integration tests for docs-site

### 8. Multi-Language Documentation Prep

**Priority:** Low
**Effort:** 3-5 days

Prepare for Arabic translations:

**Tasks:**
- [ ] Add i18n structure to docs-site
- [ ] Create translation template files
- [ ] Document translation workflow
- [ ] Add RTL support to docs-site CSS
- [ ] Prioritize key docs for translation

---

## Immediate Next Steps

1. ~~**Run search index regeneration**~~ ✅ Completed 2025-12-04

2. ~~**Deploy documentation changes**~~ ✅ Deployed to assistdocs.asimo.io 2025-12-04

3. **Create GitHub issues** for each remaining improvement (pending)

4. **Schedule accessibility audit** for next sprint (pending)

## Sprint Prioritization

Based on user impact and technical dependencies:

### Sprint 1 (High Priority)
1. **Accessibility Improvements** (Task #2) - WCAG 2.1 AA compliance
   - Direct user impact for accessibility
   - Foundation for all future improvements

2. **Documentation Monitoring Dashboard** (Task #3)
   - Enables tracking of doc health
   - Automated detection of issues

### Sprint 2 (Medium Priority)
3. **Enhanced In-App Help Integration** (Task #5)
   - Better user experience in apps
   - Contextual help reduces support burden

4. **Documentation Testing Framework** (Task #7)
   - Automated validation of code examples
   - Link integrity checking

### Sprint 3 (Lower Priority)
5. **Documentation Versioning System** (Task #1)
   - Required for major version releases
   - Can defer until v3.0 planning

6. **Cross-Team Documentation Ownership** (Task #4)
   - Process improvement
   - Can be incremental

7. **Multi-Language Documentation Prep** (Task #8)
   - Arabic/RTL support
   - Defer until user demand increases

---

## Metrics to Track

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Documentation coverage | ~85% | 95% | Need to measure |
| Stale docs (>30 days) | Unknown | <5% | Add to monitoring dashboard |
| Broken links | Unknown | 0 | Run check:links |
| Accessibility score | Unknown | 95+ | Schedule audit |
| Search accuracy | 90%+ ✅ | 90%+ | 525 feature flag refs indexed |
| Feature flags documented | 23/23 ✅ | 100% | All categories covered |
| Total docs indexed | 252 | - | Current count |

---

## References

- [Feature Flag Documentation](./admin-guide/feature-flags/README.md)
- [Style Guide](./STYLE_GUIDE.md)
- [Backup Script](../scripts/backup-docs.sh)
- [Agent JSON Generator](../scripts/generate-all-agent-json.js)
