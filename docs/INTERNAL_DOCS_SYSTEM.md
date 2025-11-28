---
title: Internal Documentation System
slug: internal-docs-system
summary: Developer guide for documentation tooling, validation scripts, and quality gates.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human", "backend", "frontend", "devops"]
tags: ["documentation", "tooling", "ci-cd", "quality"]
category: reference
relatedServices: ["docs-site"]
---

# Internal Documentation System

This document describes the documentation infrastructure for VoiceAssist, including validation scripts, quality gates, and how to maintain documentation quality.

## Overview

The VoiceAssist documentation system consists of:

| Component          | Purpose                         | Location                      |
| ------------------ | ------------------------------- | ----------------------------- |
| Docs Directory     | Markdown source files           | `docs/`                       |
| Docs Site          | Next.js documentation website   | `apps/docs-site/`             |
| Agent API          | Machine-readable JSON endpoints | `/agent/*`                    |
| Validation Scripts | Quality gates and linting       | `apps/docs-site/scripts/`     |
| API Doc Generator  | OpenAPI introspection           | `services/api-gateway/tools/` |

## Validation Scripts

### validate-metadata.ts

**Purpose:** Validates YAML frontmatter against the metadata schema.

**Script:** `apps/docs-site/scripts/validate-metadata.ts`

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

### check-links.ts

**Purpose:** Detects broken internal links in markdown files.

**Script:** `apps/docs-site/scripts/check-links.ts`

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

1. `pnpm validate:metadata`
2. `pnpm check:links`

**When to run:**

- Before releasing documentation updates
- In CI/CD pipelines as a blocking gate
- During documentation audits

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

**Purpose:** Legacy documentation validator (deprecated in favor of validate-metadata.ts).

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
lastUpdated: "2025-11-27" # Required: ISO date
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

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | 2025-11-27 | Initial release |
