---
title: Documentation Site Specs
slug: documentation-site-specs
summary: >-
  VoiceAssist documentation site implementation details, automation pipelines,
  and AI integration.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-02"
audience:
  - human
  - agent
  - ai-agents
tags:
  - documentation
  - site
  - specs
  - automation
  - ai
category: reference
component: "frontend/docs-site"
relatedPaths:
  - "apps/docs-site/src/app/layout.tsx"
  - "apps/docs-site/src/lib/docs.ts"
  - "apps/docs-site/scripts/generate-agent-json.js"
ai_summary: >-
  - Framework: Next.js 14 (app router) with static export - Styling: Tailwind
  CSS + shadcn/ui components - Content: MDX for markdown with React components -
  Search: Fuse.js client-side with /search-index.json - Code Highlighting: Shiki
  - Diagrams: Mermaid - Theme: next-themes for dark mode Search i...
---

# Documentation Site Specifications

## Current Implementation (Canonical)

### Deployment

| Property      | Value                        |
| ------------- | ---------------------------- |
| **Domain**    | https://assistdocs.asimo.io  |
| **Framework** | Next.js 14 with App Router   |
| **Export**    | Static site generation (SSG) |
| **Hosting**   | Apache (static files)        |
| **Source**    | `apps/docs-site/`            |

### Technology Stack

- **Framework:** Next.js 14 (app router) with static export
- **Styling:** Tailwind CSS + shadcn/ui components
- **Content:** MDX for markdown with React components
- **Search:** Fuse.js client-side with `/search-index.json`
- **Code Highlighting:** Shiki
- **Diagrams:** Mermaid
- **Theme:** next-themes for dark mode

### Search Implementation

Search is fully implemented using Fuse.js for client-side fuzzy search:

```
apps/docs-site/
├── public/
│   └── search-index.json     # Pre-built search index (~248K lines)
├── scripts/
│   └── generate-search-index.js   # Builds index at build time
└── src/components/
    └── SearchDialog.tsx      # Cmd+K search interface
```

**Features:**

- Full-text search across all documentation
- Keyboard shortcut (Cmd+K / Ctrl+K)
- Fuzzy matching with relevance scoring
- Section and category filtering

---

## Agent JSON API

The docs site exposes structured JSON endpoints for AI agents:

| Endpoint             | Description                      |
| -------------------- | -------------------------------- |
| `/agent/index.json`  | Metadata & endpoint discovery    |
| `/agent/docs.json`   | Full documentation index (110K+) |
| `/agent/tasks.json`  | Common debugging tasks           |
| `/agent/schema.json` | JSON Schema definitions          |

### Usage Example

```bash
# Fetch documentation index
curl https://assistdocs.asimo.io/agent/docs.json | jq '.docs | length'

# Get specific debugging task
curl https://assistdocs.asimo.io/agent/tasks.json | jq '.tasks[] | select(.id == "check-backend-health")'
```

---

## AI Integration

### Qdrant Vector Search

Documentation is embedded for semantic search:

| Property            | Value                  |
| ------------------- | ---------------------- |
| **Collection**      | `platform_docs`        |
| **Embedding Model** | text-embedding-3-small |
| **Dimensions**      | 1536                   |
| **Distance Metric** | Cosine                 |

### AI Tools

```python
# docs_search - Semantic search across documentation
docs_search(query: str, category: str = None, max_results: int = 5)

# docs_get_section - Retrieve full section content
docs_get_section(doc_path: str, section: str = None)
```

### Embedding Pipeline

```bash
# Re-embed all documentation
python scripts/embed-docs.py --force

# Embed only changed files
python scripts/embed-docs.py --incremental
```

---

## Automation Scripts

### API & Type Sync Pipeline

| Script                       | Purpose                             | Command                   |
| ---------------------------- | ----------------------------------- | ------------------------- |
| `sync-openapi.mjs`           | Fetch OpenAPI spec from api-gateway | `pnpm sync:openapi`       |
| `generate-api-types.mjs`     | Generate TypeScript types           | `pnpm generate:api-types` |
| `validate-api-sync.mjs`      | Check for undocumented endpoints    | `pnpm validate:api-sync`  |
| `extract-component-docs.mjs` | Extract TSDoc from packages/ui      | (manual)                  |

### Validation Pipeline

| Script                  | Purpose              | Command                   |
| ----------------------- | -------------------- | ------------------------- |
| `validate-metadata.mjs` | Validate frontmatter | `pnpm validate:metadata`  |
| `check-links.mjs`       | Find broken links    | `pnpm check:links`        |
| `check-freshness.mjs`   | Detect stale docs    | `pnpm check:freshness`    |
| `docs-smoke-test.mjs`   | Test doc endpoints   | `pnpm validate:endpoints` |

### Build Pipeline

```bash
# Full validation
pnpm validate:all

# Generate search index + agent JSON
pnpm generate-search-index
pnpm generate-agent-json

# Build static site
pnpm build

# Package for deployment
pnpm deploy  # Creates artifacts/docs-site.tar.gz
```

---

## CI Integration

### Workflow: `.github/workflows/docs-validation.yml`

Triggers on PRs touching:

- `docs/**`
- `services/api-gateway/**`
- `packages/ui/**`
- `apps/docs-site/**`

**Steps:**

1. `validate:metadata` - Frontmatter validation
2. `validate:api-sync --strict` - API coverage check (fails on undocumented)
3. `check:links` - Broken link detection
4. `check:freshness` - Stale doc detection (warns if >30 days)
5. `build` - Full site build

---

## Contextual Help Components

### HelpButton

Links to relevant documentation from any page:

```tsx
// Location: packages/ui/src/components/HelpButton.tsx
<HelpButton docPath="admin/security" section="permissions" />
```

### AskAIButton

Opens dialog to ask questions with page context:

```tsx
// Location: apps/admin-panel/src/components/shared/AskAIButton.tsx
<AskAIButton context={{ page: "security", feature: "audit-logs" }} />
```

**Flow:**

1. User clicks "Ask AI" button
2. Dialog opens with text input
3. Page context pre-filled
4. Calls `/api/ai/docs/ask` endpoint
5. Returns response with doc citations

---

## Content Organization

### Directory Structure

```
docs/
├── overview/           # Architecture, status, getting started
├── phases/             # Implementation phases (1-14)
├── operations/         # DevOps, deployment, monitoring
├── debugging/          # Troubleshooting guides
├── client-impl/        # Client implementations
├── archive/            # Deprecated/historical docs
└── *.md                # Top-level specs and guides
```

### Frontmatter Requirements

Every doc must include:

```yaml
---
title: "Page Title"
slug: "url-slug"
summary: "Brief description for search and previews"
status: stable|draft|deprecated
stability: production|beta|alpha
owner: backend|frontend|docs|mixed
lastUpdated: "YYYY-MM-DD"
audience: ["human", "agent"]
tags: ["tag1", "tag2"]
category: overview|reference|guide|debugging
---
```

---

## Environment Variables

```bash
# apps/docs-site/.env
NEXT_PUBLIC_SITE_URL=https://assistdocs.asimo.io
NEXT_PUBLIC_APP_URL=https://dev.asimo.io
NEXT_PUBLIC_ADMIN_URL=https://admin.asimo.io
NEXT_PUBLIC_API_URL=https://assist.asimo.io
```

---

## Historical Considerations (Archived)

The following were evaluated during planning but not implemented:

### Framework Alternatives

- **Docusaurus** - Considered for out-of-box features, rejected for less customization flexibility
- **GitBook** - Considered for hosted solution, rejected for self-hosting requirement

### Search Alternatives

- **Algolia DocSearch** - Considered for hosted search, rejected for simplicity (Fuse.js sufficient for current scale)
- **Lunr.js** - Considered as Fuse.js alternative, Fuse.js chosen for better fuzzy matching

### Domain History

- Original proposal: `docs-voice.asimo.io`
- Current production: `assistdocs.asimo.io`

---

## Related Documentation

- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture
- [IMPLEMENTATION_STATUS.md](overview/IMPLEMENTATION_STATUS.md) - Component status
- [Debugging Index](debugging/DEBUGGING_INDEX.md) - Troubleshooting guides
