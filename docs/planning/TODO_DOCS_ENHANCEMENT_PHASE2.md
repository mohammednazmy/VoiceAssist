---
title: "TODO: Documentation Enhancement Phase 2"
status: draft
lastUpdated: 2025-12-04
owner: docs
audience: [ai-agent, developers]
category: planning
ai_summary: "Actionable TODO for AI agents: Implement code_refs frontmatter linking docs to code excerpts, and versioning groundwork for version selectors and versioned API endpoints."
tags: [todo, ai-agent-task, documentation, code-excerpts, versioning]
---

# TODO: Documentation Enhancement Phase 2

> **For AI Agents**: This document contains actionable tasks to continue the documentation enhancement work. Phase 1 (AI summaries at 100%, code-excerpts.json creation) is complete.

## Context

**Completed in Phase 1:**

- AI summary coverage: 100% (255/255 docs)
- Code excerpts: 2,034 excerpts extracted to `/agent/code-excerpts.json`
- Health metrics enhanced with `code_excerpts` section
- CODEOWNERS updated for new scripts
- CI workflow updated to generate code excerpts

**Related Files:**

- `/apps/docs-site/scripts/generate-code-excerpts.js` - Extracts code from codebase
- `/apps/docs-site/public/agent/code-excerpts.json` - Generated excerpts
- `/scripts/generate-all-agent-json.js` - Main agent JSON generator
- `/apps/docs-site/public/agent/health.json` - Coverage metrics

---

## Task 1: code_refs Frontmatter

### Goal

Link documentation pages to relevant code excerpts using a `code_refs` frontmatter field, enabling AI agents to quickly find the actual implementation code for any doc.

### Implementation Steps

1. **Define the `code_refs` schema** in frontmatter:

   ```yaml
   ---
   title: "Voice Pipeline Architecture"
   code_refs:
     - id: "services/api-gateway/app/services/voice_pipeline_service.py:VoicePipelineService"
       description: "Main voice pipeline service class"
     - id: "services/api-gateway/app/services/tts_service.py:TTSService"
       description: "Text-to-speech service"
   ---
   ```

2. **Create a mapping script** (`apps/docs-site/scripts/map-code-refs.js`):
   - Read all docs with their categories/tags
   - Read `code-excerpts.json`
   - Use heuristics to suggest relevant code excerpts:
     - Match doc title keywords to code excerpt names
     - Match doc category to code category (e.g., `api` docs → `api` excerpts)
     - Match `relatedServices` frontmatter to service class names
   - Output suggestions for manual review or auto-apply

3. **Update `docs-summary.json`** to include `code_refs`:
   - Modify `generateDocsSummary()` in `generate-all-agent-json.js`
   - Include `code_refs` array in each doc entry

4. **Create validation** (`apps/docs-site/scripts/validate-code-refs.js`):
   - Verify all `code_refs` IDs exist in `code-excerpts.json`
   - Warn about broken references
   - Suggest missing refs based on content analysis

### Files to Modify

- `apps/docs-site/scripts/generate-agent-json.js` - Parse `code_refs` from frontmatter
- `scripts/generate-all-agent-json.js` - Include in `docs-summary.json`
- `apps/docs-site/scripts/validate-metadata.mjs` - Add `code_refs` validation

### Acceptance Criteria

- [ ] At least 50 high-priority docs have `code_refs` frontmatter
- [ ] `docs-summary.json` includes `code_refs` for each doc
- [ ] Validation script catches broken references
- [ ] Health.json reports `code_refs_coverage` percentage

---

## Task 2: Versioning Groundwork

### Goal

Enable version-specific documentation and API endpoints to support multiple product versions.

### Implementation Steps

1. **Add version field to frontmatter**:

   ```yaml
   ---
   title: "API Reference"
   version: "2.0"
   versions_available: ["1.0", "2.0"]
   ---
   ```

2. **Create versioned directory structure** (optional approach):

   ```
   docs/
   ├── v1/
   │   └── api/
   ├── v2/
   │   └── api/
   └── current/ -> v2 (symlink)
   ```

3. **Update agent endpoints to support version filtering**:
   - Add `?version=2.0` query param support conceptually
   - Create `/agent/v2/docs.json` alternate endpoints
   - Modify `generate-all-agent-json.js`:
     ```javascript
     function generateDocs(version = null) {
       const docs = scanDocsDir(CONFIG.DOCS_DIR);
       if (version) {
         return docs.filter((d) => !d.version || d.version === version);
       }
       return docs;
     }
     ```

4. **Add version selector component** to docs-site:
   - File: `apps/docs-site/src/components/VersionSelector.tsx`
   - Store selected version in localStorage
   - Filter displayed docs by version

5. **Update index.json** with versioned endpoints:
   ```json
   {
     "endpoints": {
       "docs_v2": {
         "path": "/agent/v2/docs.json",
         "description": "Version 2.0 documentation index"
       }
     },
     "available_versions": ["1.0", "2.0"],
     "current_version": "2.0"
   }
   ```

### Files to Create

- `apps/docs-site/src/components/VersionSelector.tsx`
- `apps/docs-site/public/agent/v2/` directory structure

### Files to Modify

- `scripts/generate-all-agent-json.js` - Add version filtering
- `apps/docs-site/scripts/generate-agent-json.js` - Parse version frontmatter
- `apps/docs-site/public/agent/index.json` - Add version metadata

### Acceptance Criteria

- [ ] Docs can have `version` frontmatter field
- [ ] Agent endpoints can filter by version
- [ ] `index.json` lists available versions
- [ ] Version selector UI component exists (even if not fully integrated)

---

## Quick Reference for AI Agents

### Key Commands

```bash
# Regenerate all agent JSON files
node scripts/generate-all-agent-json.js --all

# Generate code excerpts from codebase
node apps/docs-site/scripts/generate-code-excerpts.js

# Generate AI summaries for docs missing them
node apps/docs-site/scripts/generate-ai-summaries.js --dry-run

# Validate documentation metadata
pnpm --filter docs-site validate:metadata
```

### Key Endpoints to Update

| File                       | Purpose                              |
| -------------------------- | ------------------------------------ |
| `/agent/docs.json`         | Add `code_refs` and `version` fields |
| `/agent/docs-summary.json` | Include `code_refs` array            |
| `/agent/health.json`       | Add `code_refs_coverage` metric      |
| `/agent/index.json`        | Add version metadata                 |

### Testing Changes

1. Run generators locally
2. Check output JSON files for correctness
3. Run `pnpm --filter docs-site build` to verify site builds
4. Verify health.json metrics are accurate

---

## Priority Order

1. **Task 1 (code_refs)** - High value for AI agents navigating docs↔code
2. **Task 2 (versioning)** - Important for multi-version product support

Estimated effort: 2-4 hours each task for an AI agent with full context.
