---
title: Documentation Health Overview
slug: docs-health-overview
summary: >-
  Overview of documentation health metrics, validation pipeline, and continuous
  improvement targets for VoiceAssist docs.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-05"
audience:
  - human
  - ai-agents
  - docs
tags:
  - documentation
  - health
  - metrics
  - quality
  - continuous-improvement
category: reference
relatedServices:
  - docs-site
version: 1.0.0
component: "frontend/docs-site"
relatedPaths:
  - "apps/docs-site/scripts/validate-frontmatter.mjs"
  - "apps/docs-site/scripts/generate-agent-json.js"
ai_summary: >-
  Single-page overview of VoiceAssist documentation health. Key metrics available
  at /agent/health.json: total docs, ai_summary coverage, freshness scores by
  category. Validation commands: pnpm validate:metadata, pnpm validate:all.
  AI agents should check health.json before relying on specific docs. Links to
  Documentation System, Agent API Reference, and Metadata Standard.
---

# Documentation Health Overview

This document provides a single-page overview of documentation health metrics, validation processes, and improvement targets for the VoiceAssist documentation system.

## Quick Health Check

```bash
# Check live health metrics
curl https://assistdocs.asimo.io/agent/health.json | jq '.health_status, .scores'

# Run local validation
cd apps/docs-site && pnpm validate:all

# Check AI summary coverage
curl https://assistdocs.asimo.io/agent/docs-summary.json | jq '.stats'
```

---

## Health Metrics

The documentation system tracks several health metrics, available via `/agent/health.json`:

### Key Metrics

| Metric             | Description                                | Target  |
| ------------------ | ------------------------------------------ | ------- |
| `health_status`    | Overall health: healthy/warning/unhealthy  | healthy |
| `scores.overall`   | Composite health score (0-100)             | 80+     |
| `scores.coverage`  | Frontmatter completeness                   | 90+     |
| `scores.freshness` | Docs updated within staleness threshold    | 80+     |
| `ai_coverage`      | Docs with `ai_summary` / total AI-targeted | 85%+    |

### Freshness Scoring

Docs are considered "stale" based on category-specific thresholds:

| Category   | Freshness Threshold |
| ---------- | ------------------- |
| API        | 60 days             |
| Operations | 90 days             |
| Reference  | 180 days            |
| Planning   | 30 days             |

---

## Validation Pipeline

### Available Commands

From `apps/docs-site`:

```bash
# Individual checks
pnpm validate:metadata    # Frontmatter schema validation
pnpm check:links          # Internal link verification
pnpm check:freshness      # Staleness detection
pnpm validate:api-sync    # API docs vs OpenAPI spec
pnpm validate:api-sync --strict  # Strict mode (fails on drift)

# Combined validation
pnpm validate:all         # All checks in sequence

# Generation
pnpm generate-search-index  # Rebuild search index
pnpm generate-agent-json    # Rebuild agent JSON endpoints
```

### What `validate:metadata` Checks

- **Required fields**: `title`, `slug`, `status`, `lastUpdated`
- **Enum values**: `status`, `stability`, `owner`, `category`
- **Array fields**: `audience`, `tags`, `relatedServices`
- **Date format**: ISO 8601 (YYYY-MM-DD)
- **AI-specific**: Warns if `audience` includes `ai-agents` but `ai_summary` is missing

### CI Integration

Validation runs automatically on:

- Pull requests touching `docs/**`
- Pre-commit hooks (if configured)
- Build pipeline (`pnpm build` calls `validate:all` via prebuild)

---

## AI-Docs Coverage

### Target Metrics

| Metric                     | Target | Description                            |
| -------------------------- | ------ | -------------------------------------- |
| `ai_summary` coverage      | 85%+   | Docs with AI-optimized summaries       |
| `ai-agents` audience usage | 100%   | AI-relevant docs tagged appropriately  |
| Schema compliance          | 100%   | All AI fields follow metadata standard |

### Improving AI Coverage

1. **Identify gaps**:

   ```bash
   pnpm validate:metadata 2>&1 | grep "Missing ai_summary"
   ```

2. **Add `ai_summary`** to docs targeting AI agents:
   - 2-3 sentences
   - Technical and concise
   - Include key facts and cross-references
   - See [Metadata Standard](DOCUMENTATION_METADATA_STANDARD.md#ai-specific-fields)

3. **Regenerate**:
   ```bash
   pnpm generate-agent-json
   ```

---

## Agent Endpoints

Machine-readable documentation available at `https://assistdocs.asimo.io`:

| Endpoint                    | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `/agent/index.json`         | Discovery endpoint with schema definitions      |
| `/agent/docs.json`          | Full doc list with metadata (incl `ai_summary`) |
| `/agent/docs-summary.json`  | AI summaries organized by category              |
| `/agent/health.json`        | Health metrics and freshness scores             |
| `/agent/code-examples.json` | Code blocks extracted from docs                 |
| `/agent/tasks.json`         | Common agent tasks with commands                |
| `/agent/schema.json`        | JSON Schema for response types                  |
| `/search-index.json`        | Fuse.js search index                            |

See [Agent API Reference](ai/AGENT_API_REFERENCE.md) for detailed endpoint documentation.

---

## Continuous Improvement

### Regular Tasks

1. **Weekly**: Run `pnpm validate:all` and address warnings
2. **Monthly**: Review `/agent/health.json` freshness scores
3. **Quarterly**: Audit `ai_summary` coverage and update stale docs

### Improvement Priorities

1. **High**: Fix validation errors (block CI)
2. **Medium**: Address freshness warnings in critical categories
3. **Low**: Add `ai_summary` to docs missing it

### Known TODOs

- ✅ All docs now have `ai_summary` (100% coverage as of 2025-12-05)
- Consider automating `ai_summary` generation for new docs
- Monitor freshness scores to catch stale docs early

---

## Related Documentation

- [Internal Documentation System](INTERNAL_DOCS_SYSTEM.md) - Validation scripts and tooling
- [Documentation Metadata Standard](DOCUMENTATION_METADATA_STANDARD.md) - Schema and field definitions
- [Agent API Reference](ai/AGENT_API_REFERENCE.md) - Endpoint documentation
- [Agent Task Index](ai/AGENT_TASK_INDEX.md) - Docs health audit task

---

## Version History

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | 2025-12-04 | Initial release |
