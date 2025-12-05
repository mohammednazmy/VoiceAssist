---
title: Internal Documentation System
slug: internal-docs-system
summary: >-
  Developer guide for documentation tooling, validation scripts, and quality
  gates.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-04"
audience:
  - human
  - ai-agents
  - backend
  - frontend
  - devops
tags:
  - documentation
  - tooling
  - ci-cd
  - quality
category: reference
relatedServices:
  - docs-site
ai_summary: >-
  Documentation infrastructure for VoiceAssist. Key validation commands:
  pnpm validate:metadata (frontmatter), pnpm validate:all (all checks).
  Agent endpoints at assistdocs.asimo.io/agent/*.json include docs.json
  (with ai_summary), docs-summary.json, health.json, and code-examples.json.
  See Agent API Reference for endpoint details.
---

# Internal Documentation System

This document describes the documentation infrastructure for VoiceAssist, including validation scripts, quality gates, and how to maintain documentation quality.

## Overview

The VoiceAssist documentation system consists of:

| Component          | Purpose                         | Location                                           |
| ------------------ | ------------------------------- | -------------------------------------------------- |
| Docs Directory     | Markdown source files           | `docs/`                                            |
| Docs Site          | Next.js documentation website   | `apps/docs-site/`                                  |
| Agent API          | Machine-readable JSON endpoints | See [Agent Endpoints](#agent-json-endpoints) below |
| Validation Scripts | Quality gates and linting       | `apps/docs-site/scripts/`                          |
| API Doc Generator  | OpenAPI introspection           | `services/api-gateway/tools/`                      |

### Agent JSON Endpoints

Static JSON endpoints served at `assistdocs.asimo.io`:

| Endpoint                    | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `/agent/index.json`         | Documentation system metadata and discovery        |
| `/agent/docs.json`          | Full document list with metadata (incl ai_summary) |
| `/agent/docs-summary.json`  | AI-friendly summaries organized by category        |
| `/agent/tasks.json`         | Common agent tasks with commands                   |
| `/agent/code-examples.json` | Code examples extracted from documentation         |
| `/agent/health.json`        | Docs health metrics: coverage, freshness, status   |
| `/agent/schema.json`        | JSON Schema for API response types                 |
| `/search-index.json`        | Full-text search index (Fuse.js)                   |

For detailed usage, see [Agent API Reference](ai/AGENT_API_REFERENCE.md).

## Validation Scripts

### validate-metadata.mjs

**Purpose:** Validates YAML frontmatter against the metadata schema.

**Script:** `apps/docs-site/scripts/validate-metadata.mjs`

**Command:**

```bash
cd apps/docs-site
pnpm validate:metadata
```

**What it checks:**

- Required fields: `title`, `slug`, `status`, `lastUpdated`
- Enum values: `status`, `stability`, `owner`, `audience`
- Date format: ISO 8601 (YYYY-MM-DD)
- Array types: `tags`, `audience`, `relatedServices`

**When to run:**

- Before committing documentation changes
- In CI/CD pipelines
- During pre-release validation

**Example output:**

```
Validating documentation metadata...

docs/VOICE_MODE_PIPELINE.md:
  WARNING: Missing recommended field: status

============================================================
Files scanned: 42
Files with issues: 3
Total errors: 0
Total warnings: 5
============================================================

Validation passed with warnings.
```

---

### check-links.mjs

**Purpose:** Detects broken internal links in markdown files.

**Script:** `apps/docs-site/scripts/check-links.mjs`

**Command:**

```bash
cd apps/docs-site
pnpm check:links
```

**What it checks:**

- Internal markdown links (e.g., `[text](./example.md)`)
- Cross-file references
- Relative path resolution

**When to run:**

- After renaming or moving documentation files
- Before merging documentation PRs
- During periodic documentation audits

---

### validate:all

**Purpose:** Runs all validation scripts in sequence.

**Command:**

```bash
cd apps/docs-site
pnpm validate:all
```

**Runs:**

1. `pnpm validate:metadata` - Frontmatter validation
2. `pnpm check:links` - Broken link detection
3. `pnpm check:freshness` - Stale doc detection (warns if >30 days)
4. `pnpm validate:api-sync` - API coverage check

**When to run:**

- Before releasing documentation updates
- In CI/CD pipelines as a blocking gate
- During documentation audits

---

### check-freshness.mjs

**Purpose:** Detects stale documentation files based on lastUpdated date.

**Script:** `apps/docs-site/scripts/check-freshness.mjs`

**Command:**

```bash
cd apps/docs-site
pnpm check:freshness
```

**What it checks:**

- Documents with lastUpdated older than 30 days (warning)
- Documents with lastUpdated older than 90 days (error)
- Missing lastUpdated fields

---

### validate-api-sync.mjs

**Purpose:** Verifies API documentation coverage against OpenAPI spec.

**Script:** `apps/docs-site/scripts/validate-api-sync.mjs`

**Command:**

```bash
cd apps/docs-site
pnpm validate:api-sync           # Warn on undocumented endpoints
pnpm validate:api-sync --strict  # Fail on undocumented endpoints
```

**What it checks:**

- Endpoints in OpenAPI spec but missing from documentation
- Endpoints documented but not in OpenAPI spec
- Parameter mismatches

---

### sync-openapi.mjs

**Purpose:** Fetches and caches OpenAPI spec from API gateway.

**Script:** `apps/docs-site/scripts/sync-openapi.mjs`

**Command:**

```bash
cd apps/docs-site
pnpm sync:openapi           # Check for changes (dry run)
pnpm sync:openapi --update  # Update local cache
```

---

### generate:api-docs

**Purpose:** Regenerates API documentation from OpenAPI spec.

**Command:**

```bash
cd apps/docs-site
pnpm generate:api-docs
```

**Script:** `services/api-gateway/tools/generate_api_docs.py`

**What it does:**

1. Fetches OpenAPI spec from running API gateway (or uses cached spec)
2. Generates `docs/api-reference/API_ROUTES.md` (Markdown)
3. Generates `docs/api-reference/api-routes.json` (JSON)
4. Updates route counts and documentation

**When to run:**

- After adding/modifying API endpoints
- Before major releases
- To verify API-documentation alignment

**Requirements:**

- Python 3.8+
- Running API gateway (or existing `openapi.json`)

---

## Other Validation Tools

### validate-docs.mjs

**Purpose:** Legacy documentation validator (deprecated in favor of validate-metadata.mjs).

**Command:**

```bash
pnpm validate-docs
```

### generate-search-index.js

**Purpose:** Generates search index for docs site search functionality.

**Command:**

```bash
pnpm generate-search-index
```

**Note:** Runs automatically before `dev` and `build`.

### generate-api-reference.mjs

**Purpose:** Generates API reference page data.

**Command:**

```bash
pnpm generate:api-reference
```

---

## AI Integration (AI-Docs)

The documentation system integrates with the AI assistant for semantic search.

### embed-docs.py

**Purpose:** Embeds documentation into Qdrant for semantic search.

**Script:** `scripts/embed-docs.py`

**Command:**

```bash
python scripts/embed-docs.py                    # Incremental update
python scripts/embed-docs.py --force            # Force re-index all
python scripts/embed-docs.py --dry-run          # Preview without indexing
python scripts/embed-docs.py --collection NAME  # Custom collection
```

**Configuration:**

| Property            | Value                  |
| ------------------- | ---------------------- |
| **Collection**      | `platform_docs`        |
| **Embedding Model** | text-embedding-3-small |
| **Dimensions**      | 1536                   |
| **Distance Metric** | Cosine                 |

### docs_search_tool.py

**Purpose:** LLM tool for semantic documentation search.

**Script:** `server/app/tools/docs_search_tool.py` _(legacy location - `server/` is deprecated; current implementation uses Qdrant-backed semantic search via the AI-Docs pipeline)_

**Functions:**

```python
# docs_search - Semantic search across documentation
docs_search(query: str, category: str = None, max_results: int = 5)

# docs_get_section - Retrieve full section content
docs_get_section(doc_path: str, section: str = None)
```

**Usage:** The AI assistant automatically uses these tools when answering questions about the platform.

---

## Metadata Schema

All documentation files should include YAML frontmatter. See [DOCUMENTATION_METADATA_STANDARD.md](./DOCUMENTATION_METADATA_STANDARD.md) for the full schema.

### Quick Reference

```yaml
---
title: Document Title # Required
slug: path/to-document # Required (URL path)
summary: One-line description # Recommended
status: stable # Required: draft|experimental|stable|deprecated
stability: production # Optional: production|beta|experimental|legacy
owner: backend # Optional: backend|frontend|infra|sre|docs|product|security|mixed
lastUpdated: "2025-12-02" # Required: ISO date
audience: ["human", "agent"] # Optional: who should read this
tags: ["api", "architecture"] # Optional: searchable tags
relatedServices: ["api-gateway"] # Optional: related services
---
```

### Status Values

| Status         | Meaning                              |
| -------------- | ------------------------------------ |
| `draft`        | Work in progress, may be incomplete  |
| `experimental` | New approach, subject to change      |
| `stable`       | Production-ready, reviewed           |
| `deprecated`   | Superseded, maintained for reference |

### Audience Values

| Audience   | Description                    |
| ---------- | ------------------------------ |
| `human`    | Human developers and operators |
| `agent`    | AI coding assistants           |
| `backend`  | Backend developers             |
| `frontend` | Frontend developers            |
| `devops`   | DevOps/SRE engineers           |
| `admin`    | System administrators          |
| `user`     | End users                      |

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Documentation Quality
on:
  pull_request:
    paths:
      - "docs/**"
      - "apps/docs-site/**"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install
      - run: cd apps/docs-site && pnpm validate:all
```

### Pre-commit Hook

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
cd apps/docs-site
pnpm validate:metadata
```

---

## Related Documentation

- [Implementation Status](./overview/IMPLEMENTATION_STATUS.md) - Component status tracking
- [Documentation Metadata Standard](./DOCUMENTATION_METADATA_STANDARD.md) - Full metadata schema
- [Agent API Reference](./ai/AGENT_API_REFERENCE.md) - Machine-readable endpoints
- [Agent Onboarding](./ai/AGENT_ONBOARDING.md) - AI assistant quick start

---

## Version History

| Version | Date       | Changes                                                                 |
| ------- | ---------- | ----------------------------------------------------------------------- |
| 1.1.0   | 2025-12-02 | Added new scripts (check-freshness, validate-api-sync), AI-Docs section |
| 1.0.0   | 2025-11-27 | Initial release                                                         |
