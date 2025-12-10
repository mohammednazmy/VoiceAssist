---
title: Documentation Guide for AI Agents
slug: for-ai-agents
summary: Guide for AI agents on how to navigate and use VoiceAssist documentation effectively
ai_summary: AI agents should use /agent/*.json endpoints for structured data. Start with index.json for available endpoints, docs-summary.json for quick context, health.json for documentation status. Use ai_summary fields in frontmatter for quick understanding.
status: stable
owner: docs
lastUpdated: "2025-12-04"
audience: ["ai-agents"]
category: reference
tags: ["ai", "navigation", "meta", "documentation"]
component: "frontend/docs-site"
relatedPaths:
  - "apps/docs-site/scripts/generate-agent-json.js"
  - "apps/docs-site/public/agent/index.json"
---

# Documentation Guide for AI Agents

This page explains how AI agents should navigate and use the VoiceAssist documentation system to efficiently gather context and find relevant information.

---

## Quick Start for AI Agents

### 1. Fetch the Index

Start by fetching the agent JSON index to discover available endpoints:

```bash
curl https://assistdocs.asimo.io/agent/index.json
```

### 2. Load Documentation Summaries

For quick context, fetch the docs-summary endpoint which aggregates `ai_summary` fields:

```bash
curl https://assistdocs.asimo.io/agent/docs-summary.json
```

### 3. Check Documentation Health

Monitor documentation freshness and coverage:

```bash
curl https://assistdocs.asimo.io/agent/health.json
```

---

## Agent JSON Endpoints

All endpoints are available at `https://assistdocs.asimo.io/agent/`

| Endpoint                    | Purpose                           | Best For                |
| --------------------------- | --------------------------------- | ----------------------- |
| `/agent/index.json`         | Lists all available endpoints     | Initial discovery       |
| `/agent/docs.json`          | Full document index with metadata | Browsing/filtering docs |
| `/agent/docs-summary.json`  | AI-friendly summaries by category | Quick context loading   |
| `/agent/code-examples.json` | Code snippets with semantic tags  | Finding implementation  |
| `/agent/status.json`        | System status and feature flags   | Health checks           |
| `/agent/health.json`        | Documentation health metrics      | Quality monitoring      |
| `/agent/activity.json`      | Recent changes                    | Staying up to date      |
| `/agent/todos.json`         | Pending documentation tasks       | Finding work items      |
| `/search-index.json`        | Full-text search index            | Client-side searching   |

### Code Examples Endpoint

The `/agent/code-examples.json` endpoint provides 3,290+ code snippets with semantic tags:

```bash
curl https://assistdocs.asimo.io/agent/code-examples.json | jq '.by_tag | keys'
```

**Available tags**: `api`, `authentication`, `cache`, `component`, `config`, `database`, `docker`, `environment`, `git`, `http`, `infrastructure`, `kubernetes`, `package-manager`, `react`, `realtime`, `snippet`, `system`, `testing`

---

## Understanding Frontmatter

Every markdown document includes frontmatter metadata. Key fields for AI agents:

### Essential Fields

```yaml
---
title: Document Title
summary: One-line description
ai_summary: 2-3 sentence summary optimized for AI context loading
status: stable | draft | experimental | deprecated
lastUpdated: "2025-12-04"
---
```

### AI-Specific Fields

```yaml
---
ai_summary: Use this field for quick understanding. It's written specifically
  for AI agents to rapidly grasp document content without reading the full text.
audience: ["ai-agents", "developers"] # Check if you're the target audience
category: reference | planning | api | architecture | operations
owner: backend | frontend | docs | security # Who maintains this doc
---
```

### Using ai_summary

The `ai_summary` field provides:

- 2-3 sentences summarizing the document
- Key technical details relevant to implementation
- Cross-references to related documents when applicable

**Example:**

```yaml
ai_summary: Feature flags enable runtime toggles without deployments.
  Use category.feature_name pattern (e.g., ui.dark_mode).
  Stored in PostgreSQL, cached in Redis (5min TTL).
```

---

## Directory Structure

```
docs/
├── admin-guide/           # Admin panel and configuration docs
│   ├── feature-flags/     # Feature flag system documentation
│   │   ├── README.md              # Overview
│   │   ├── naming-conventions.md  # Naming patterns
│   │   ├── lifecycle.md           # Flag lifecycle
│   │   ├── advanced-types.md      # Boolean, percentage, variant, scheduled
│   │   ├── multi-environment.md   # Dev, staging, prod
│   │   ├── admin-panel-guide.md   # UI usage
│   │   └── best-practices.md      # Guidelines
│   └── for-ai-agents.md   # This document
│
├── admin/                 # Admin panel implementation
├── ai/                    # AI/ML features (RAG, embeddings)
├── api/                   # API specifications
├── architecture/          # System architecture
├── debugging/             # Troubleshooting guides
├── deployment/            # Deployment procedures
├── integration/           # Integration guides
├── operations/            # Operational runbooks
├── planning/              # Feature planning
├── reference/             # Reference documentation
├── security/              # Security documentation
├── testing/               # Testing guides
└── voice/                 # Voice mode documentation
```

---

## Recommended Workflow for AI Agents

### When answering questions about VoiceAssist:

1. **Check docs-summary.json first**
   - Look for relevant `ai_summary` entries
   - Filter by `category` or `audience`

2. **Use full docs.json for details**
   - Find specific documents matching the query
   - Note `lastUpdated` for freshness

3. **Fetch specific documents as needed**
   - Read the full markdown for implementation details
   - Check related documents listed in "Related Documentation" sections

### When writing code:

1. **Check feature flags status**
   - `GET /agent/status.json` → `feature_flags` section
   - Verify if features are enabled/disabled

2. **Find API documentation**
   - Filter docs.json by `category: "api"`
   - Look for OpenAPI specs in `/api/` directory

3. **Check architectural patterns**
   - Filter by `category: "architecture"`
   - Review component diagrams and data flow

### When debugging:

1. **Check health metrics**
   - `GET /agent/health.json` for documentation status
   - Look for stale or missing docs

2. **Search for troubleshooting guides**
   - Filter by `category: "debugging"`
   - Check `docs/debugging/` directory

---

## Filtering and Searching

### By Category

Available categories:

- `ai` - AI/ML features (RAG, embeddings, NLU)
- `api` - API endpoints and specifications
- `architecture` - System design and patterns
- `debugging` - Troubleshooting guides
- `deployment` - Deployment and infrastructure
- `operations` - Operational procedures
- `planning` - Feature planning and roadmaps
- `reference` - Reference documentation
- `security` - Security guidelines
- `testing` - Testing strategies
- `feature-flags` - Feature flag system

### By Audience

Target audiences include:

- `ai-agents` - Documentation optimized for AI consumption
- `developers` - Implementation details for engineers
- `admin` - Admin panel users
- `devops` - Infrastructure and deployment
- `frontend` - Frontend development
- `backend` - Backend development
- `sre` - Site reliability engineering

### By Status

- `stable` - Production-ready documentation
- `draft` - Work in progress
- `experimental` - New features being tested
- `deprecated` - Outdated, will be removed

---

## Current Documentation Metrics

Check `/agent/health.json` for real-time metrics. Current status:

| Metric          | Value     |
| --------------- | --------- |
| Total Documents | 254       |
| With AI Summary | 219 (86%) |
| Code Examples   | 3,290+    |
| Languages       | 26        |
| Semantic Tags   | 18        |
| Categories      | 13        |
| Health Status   | Healthy   |

---

## Best Practices for AI Agents

1. **Prefer ai_summary over full text** when you only need a quick understanding
2. **Check lastUpdated** before using documentation (prefer recent docs)
3. **Filter by audience** to find relevant docs faster
4. **Use health.json** to identify stale or incomplete areas
5. **Use code-examples.json by_tag** to find implementation patterns
6. **Follow cross-references** in "Related Documentation" sections
7. **Cache endpoints** - JSON endpoints can be cached for performance

---

## Related Documentation

- [Feature Flags Overview](./feature-flags/README.md)
- [System Settings vs Feature Flags](./system-settings-vs-flags.md)
- [Admin Panel Integration Guide](../admin/ADMIN_PANEL_INTEGRATION_GUIDE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-04
**Maintained By**: VoiceAssist Documentation Team
