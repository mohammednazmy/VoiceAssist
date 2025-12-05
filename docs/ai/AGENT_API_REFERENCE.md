---
title: Agent API Reference
slug: ai/agent-api-reference
summary: >-
  Machine-readable JSON API endpoints for AI agents to discover and search
  documentation.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-04"
audience:
  - ai-agents
  - backend
tags:
  - api
  - ai-agent
  - json
  - documentation
  - endpoints
relatedServices:
  - docs-site
category: ai
source_of_truth: true
version: 1.6.0
component: "frontend/docs-site"
relatedPaths:
  - "apps/docs-site/scripts/generate-agent-json.js"
  - "apps/docs-site/scripts/generate-repo-index.mjs"
  - "apps/docs-site/scripts/generate-doc-code-map.mjs"
  - "apps/docs-site/public/agent/index.json"
ai_summary: >-
  Canonical reference for VoiceAssist documentation API endpoints. Base URL:
  https://assistdocs.asimo.io. Key endpoints: /agent/docs.json (full doc list
  with ai_summary), /agent/docs-summary.json (AI summaries by category),
  /agent/health.json (docs health metrics), /agent/tasks.json (common tasks),
  /search-index.json (Fuse.js search). All endpoints are static JSON generated
  at build time.
---

# Agent API Reference

The VoiceAssist documentation site exposes machine-readable JSON endpoints designed for AI agents to programmatically discover, filter, and search documentation.

**Base URL:** `https://assistdocs.asimo.io`

---

## Endpoints Overview

| Endpoint                           | Method | Purpose                                            |
| ---------------------------------- | ------ | -------------------------------------------------- |
| `/agent/index.json`                | GET    | Documentation system metadata and discovery        |
| `/agent/docs.json`                 | GET    | Full document list with metadata (incl ai_summary) |
| `/agent/docs-summary.json`         | GET    | AI-friendly summaries organized by category        |
| `/agent/tasks.json`                | GET    | Common agent tasks with commands and docs          |
| `/agent/code-examples.json`        | GET    | Code examples extracted from documentation         |
| `/agent/health.json`               | GET    | Docs health metrics: coverage, freshness, status   |
| `/agent/schema.json`               | GET    | JSON Schema for API response types                 |
| `/agent/repo-index.json`           | GET    | Repository structure index for codebase navigation |
| `/agent/repo/manifest.json`        | GET    | Manifest of exported source files                  |
| `/agent/repo/files/{encoded}.json` | GET    | Source file content (see encoding below)           |
| `/agent/doc-code-map.json`         | GET    | Bidirectional doc ↔ code crosswalk mapping         |
| `/search-index.json`               | GET    | Full-text search index (Fuse.js format)            |
| `/sitemap.xml`                     | GET    | XML sitemap for crawlers                           |

**Note:** All endpoints listed above are static JSON files generated at build time. For lexical search, use `/search-index.json` with client-side Fuse.js. For semantic search, see the [AI-Docs section](#ai-docs-semantic-search) below.

---

## GET /agent/index.json

Returns metadata about the documentation system and available endpoints.

### Request

```http
GET /agent/index.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

```json
{
  "version": "1.0",
  "generated_at": "2025-11-27T21:21:55.185Z",
  "description": "VoiceAssist documentation index for AI agents and integrations",
  "endpoints": {
    "docs_list": {
      "path": "/agent/docs.json",
      "description": "Full list of all documentation with metadata",
      "method": "GET",
      "response_format": "JSON array of DocIndexEntry objects"
    },
    "search_index": {
      "path": "/search-index.json",
      "description": "Full-text search index for client-side searching",
      "method": "GET",
      "response_format": "JSON with 'docs' array for Fuse.js"
    }
  },
  "schema": {
    "DocIndexEntry": {
      "slug": "string - URL-friendly identifier",
      "path": "string - Relative path to markdown file",
      "title": "string - Document title",
      "summary": "string? - Brief description",
      "status": "draft|experimental|stable|deprecated",
      "stability": "production|beta|experimental|legacy",
      "owner": "backend|frontend|infra|sre|docs|product|security|mixed",
      "audience": "string[] - Target readers",
      "tags": "string[] - Categorization tags",
      "relatedServices": "string[] - Related service names",
      "lastUpdated": "string - ISO date"
    }
  },
  "usage_notes": [
    "Use docs.json for browsing and filtering documentation",
    "Use search-index.json with Fuse.js for full-text search",
    "All paths are relative to the docs/ directory",
    "Filter client-side by status, audience, tags, etc."
  ]
}
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/docs.json

Returns a list of all documentation with metadata. **Filtering is done client-side.**

### Request

```http
GET /agent/docs.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

**Note:** The `count` field reflects the number of documents at build time. The actual value will vary.

```json
{
  "count": 275,
  "generated_at": "2025-12-04T23:00:04.333Z",
  "docs": [
    {
      "slug": "ai-agent-onboarding",
      "path": "ai/AGENT_ONBOARDING.md",
      "title": "AI Agent Onboarding Guide",
      "summary": "Quick context, repository structure, critical rules, and common tasks for AI coding assistants.",
      "ai_summary": "Start here for AI agents. Key directories: services/api-gateway/ (canonical backend), apps/ (frontends). Never use server/ (deprecated). Machine-readable endpoints at /agent/*.json. Read IMPLEMENTATION_STATUS.md for component status.",
      "status": "stable",
      "stability": "production",
      "owner": "docs",
      "audience": ["ai-agents"],
      "category": "ai",
      "tags": ["onboarding", "ai-agent", "getting-started"],
      "relatedServices": ["api-gateway", "web-app", "admin-panel", "docs-site"],
      "lastUpdated": "2025-12-04"
    },
    {
      "slug": "implementation-status",
      "path": "overview/IMPLEMENTATION_STATUS.md",
      "title": "Implementation Status",
      "summary": "Single source of truth for all component status...",
      "ai_summary": "Authoritative source of truth for all VoiceAssist component status. Check here first to understand what's built vs. planned before making changes.",
      "status": "stable",
      "stability": "production",
      "owner": "mixed",
      "audience": ["human", "ai-agents", "backend", "frontend", "devops"],
      "tags": ["status", "overview", "components", "roadmap"],
      "lastUpdated": "2025-11-27"
    }
  ]
}
```

### Client-Side Filtering Examples

Since filtering is done client-side, here are JavaScript examples:

```javascript
// Fetch all docs
const response = await fetch("https://assistdocs.asimo.io/agent/docs.json");
const data = await response.json();

// Filter for agent-targeted docs
const agentDocs = data.docs.filter((doc) => doc.audience && doc.audience.includes("agent"));

// Filter for stable production docs
const stableDocs = data.docs.filter((doc) => doc.status === "stable" && doc.stability === "production");

// Filter by tag
const apiDocs = data.docs.filter((doc) => doc.tags && doc.tags.includes("api"));

// Filter by owner
const backendDocs = data.docs.filter((doc) => doc.owner === "backend");
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/docs-summary.json

Returns AI-friendly document summaries organized by category. Ideal for quick context loading.

### Request

```http
GET /agent/docs-summary.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

```json
{
  "version": "2.0.0",
  "generated_at": "2025-12-04T10:37:09.670Z",
  "description": "AI-friendly document summaries for quick context loading",
  "stats": {
    "total_docs": 254,
    "with_ai_summary": 219,
    "without_ai_summary": 35,
    "ai_coverage_percentage": 86,
    "categories": 13,
    "audiences": 15,
    "ai_agent_docs": 219
  },
  "by_category": {
    "reference": {
      "count": 91,
      "docs": [
        {
          "path": "DOCUMENTATION_METADATA_STANDARD.md",
          "title": "Documentation Metadata Standard",
          "ai_summary": "Canonical reference for VoiceAssist documentation metadata schema...",
          "status": "stable",
          "owner": "docs",
          "audience": ["human", "ai-agents"],
          "last_updated": "2025-12-04"
        }
      ]
    }
  }
}
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/health.json

Returns documentation health metrics including coverage, freshness, and status by category.

### Request

```http
GET /agent/health.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

```json
{
  "version": "2.0.0",
  "generated_at": "2025-12-04T10:37:10.137Z",
  "health_status": "healthy",
  "scores": {
    "overall": 100,
    "coverage": 100,
    "freshness": 100
  },
  "summary": {
    "total_docs": 254,
    "stale_count": 0,
    "missing_frontmatter_count": 0,
    "coverage_percentage": 100
  },
  "category_freshness": {
    "reference": {
      "freshness_score": 100,
      "total_docs": 91,
      "fresh_docs": 91,
      "stale_docs": 0,
      "newest_update": "2025-12-04",
      "oldest_update": "2025-11-27",
      "status": "healthy",
      "docs_needing_update": []
    }
  }
}
```

### Usage

Use this endpoint to:

1. **Assess documentation quality** before relying on specific docs
2. **Find stale docs** that may need review
3. **Identify missing metadata** that should be added
4. **Monitor coverage** of `ai_summary` fields

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/code-examples.json

Returns code examples extracted from documentation, organized by language.

### Request

```http
GET /agent/code-examples.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

```json
{
  "version": "2.0.0",
  "generated_at": "2025-12-04T10:37:09.725Z",
  "description": "Code examples extracted from documentation",
  "stats": {
    "total_examples": 3294,
    "languages": 26,
    "top_languages": [
      { "language": "bash", "count": 1097 },
      { "language": "typescript", "count": 460 },
      { "language": "python", "count": 456 },
      { "language": "json", "count": 184 },
      { "language": "yaml", "count": 175 }
    ]
  },
  "by_language": {
    "bash": [
      {
        "doc_path": "LOCAL_DEVELOPMENT.md",
        "code": "docker compose up -d",
        "section": "Quick Start"
      }
    ]
  }
}
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/tasks.json

Returns a catalog of common tasks AI agents can perform, with relevant documentation links and shell commands.

### Request

```http
GET /agent/tasks.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response

```json
{
  "version": "1.0",
  "generated_at": "2025-11-27T23:30:00.000Z",
  "description": "Common tasks AI agents can perform on VoiceAssist documentation and systems",
  "tasks": [
    {
      "id": "debug-api-error",
      "name": "Debug API Error",
      "description": "Investigate and resolve API errors (500, 401, 404, etc.)",
      "category": "debugging",
      "docs": ["/debugging/backend", "/debugging/index"],
      "commands": ["docker logs voiceassist-server --tail 100 | grep -i error", "curl https://assist.asimo.io/health"],
      "prerequisites": ["Docker access", "curl"]
    }
  ],
  "categories": {
    "debugging": "Investigate and resolve issues",
    "operations": "Monitor and maintain systems",
    "deployment": "Deploy and update services",
    "reference": "Look up documentation and information"
  }
}
```

### TaskEntry Schema

| Field           | Type       | Description                                          |
| --------------- | ---------- | ---------------------------------------------------- |
| `id`            | `string`   | Unique task identifier (kebab-case)                  |
| `name`          | `string`   | Human-readable task name                             |
| `description`   | `string`   | What the task accomplishes                           |
| `category`      | `string`   | One of: debugging, operations, deployment, reference |
| `docs`          | `string[]` | Related documentation slugs                          |
| `commands`      | `string[]` | Shell commands to execute                            |
| `prerequisites` | `string[]` | Required tools or access                             |

### Filtering and Usage Examples

```javascript
// Fetch all tasks
const response = await fetch("https://assistdocs.asimo.io/agent/tasks.json");
const data = await response.json();

// Filter tasks by category
const debugTasks = data.tasks.filter((t) => t.category === "debugging");

// Find a task by ID
const task = data.tasks.find((t) => t.id === "debug-api-error");

// Get all unique prerequisites
const allPrereqs = [...new Set(data.tasks.flatMap((t) => t.prerequisites))];
```

### AI Agent Workflow Example

An AI agent can use this endpoint to:

1. **Match user intent to a task** - When a user says "the API is returning 500 errors", match to `debug-api-error`
2. **Retrieve relevant documentation** - Follow the `docs` array to read debugging guides
3. **Execute suggested commands** - Run the `commands` to gather diagnostic information
4. **Check prerequisites** - Verify required tools are available before executing

```javascript
// Example: Agent handling "API is broken" request
const { tasks } = await fetch("/agent/tasks.json").then((r) => r.json());
const task = tasks.find((t) => t.id === "debug-api-error");

// Read related docs
for (const docSlug of task.docs) {
  const docUrl = `https://assistdocs.asimo.io${docSlug}`;
  // Fetch and process documentation...
}

// Execute diagnostic commands
for (const cmd of task.commands) {
  console.log(`Executing: ${cmd}`);
  // Run command and analyze output...
}
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## GET /agent/schema.json

JSON Schema definitions for all API response types. Useful for validating responses or generating type definitions.

### Request

```http
GET /agent/schema.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response Structure

Returns a JSON Schema (draft-07) with definitions for:

- `DocIndexEntry` - Individual document metadata
- `DocsListResponse` - Response from `/agent/docs.json`
- `IndexResponse` - Response from `/agent/index.json`
- `SearchIndexEntry` - Individual search index entry
- `SearchIndexResponse` - Response from `/search-index.json`

### Usage Example

```javascript
// Fetch and use schema for validation
const schemaResponse = await fetch("https://assistdocs.asimo.io/agent/schema.json");
const schema = await schemaResponse.json();

// Access specific type definitions
const docEntrySchema = schema.definitions.DocIndexEntry;
console.log("Required fields:", docEntrySchema.required);
// Output: ["slug", "path", "title"]

// Get valid status values
console.log("Valid status:", docEntrySchema.properties.status.enum);
// Output: ["draft", "experimental", "stable", "deprecated", ...]
```

### Caching

- `Cache-Control: max-age=86400, public`
- Cached for 24 hours (schema changes infrequently)

---

## GET /search-index.json

Full-text search index designed for use with [Fuse.js](https://fusejs.io/).

### Request

```http
GET /search-index.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Response Structure

```json
{
  "docs": [
    {
      "title": "AI Agent Onboarding Guide",
      "slug": "ai/agent-onboarding",
      "content": "Full document content for search indexing...",
      "summary": "Quick context, repository structure...",
      "tags": ["onboarding", "ai-agent"]
    }
  ]
}
```

### Client-Side Search Example

```javascript
import Fuse from "fuse.js";

// Fetch search index
const response = await fetch("https://assistdocs.asimo.io/search-index.json");
const { docs } = await response.json();

// Configure Fuse.js
const fuse = new Fuse(docs, {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "summary", weight: 0.3 },
    { name: "tags", weight: 0.2 },
    { name: "content", weight: 0.1 },
  ],
  threshold: 0.3,
  includeScore: true,
});

// Search
const results = fuse.search("authentication");
// Returns: [{ item: {...}, score: 0.123 }, ...]
```

### Caching

- `Cache-Control: max-age=3600, public`
- Cached for 1 hour

---

## AI-Docs Semantic Search

In addition to the static JSON endpoints, VoiceAssist provides semantic documentation search powered by Qdrant vector embeddings. This enables AI agents to find relevant documentation using natural language queries.

### Overview

| Component       | Description                              |
| --------------- | ---------------------------------------- |
| **Embedding**   | `scripts/embed-docs.py`                  |
| **Collection**  | `platform_docs` in Qdrant                |
| **Model**       | text-embedding-3-small (1536 dimensions) |
| **Search Tool** | `server/app/tools/docs_search_tool.py`   |

### Search Tool Functions

The `docs_search_tool` provides two functions for AI assistants:

```python
# Semantic search across documentation
docs_search(query: str, category: str = None, max_results: int = 5)
# Returns: List of {path, title, content, score}

# Retrieve full section content by path
docs_get_section(doc_path: str, section: str = None)
# Returns: Full markdown content of the specified doc/section
```

### When to Use Which

| Method                         | Best For                                      |
| ------------------------------ | --------------------------------------------- |
| `/search-index.json` (Fuse.js) | UI search, keyword matching, offline use      |
| `docs_search` tool             | Natural language queries, semantic similarity |
| `/agent/docs.json`             | Browsing, metadata filtering, doc discovery   |

### Recommended Workflow for AI Agents

1. **Semantic search first**: Use `docs_search` tool for natural language questions
2. **Verify paths**: Cross-reference results with `/agent/docs.json` metadata
3. **Fallback to lexical**: Use `/search-index.json` if semantic search unavailable
4. **Read full content**: Use `docs_get_section` or fetch raw markdown as needed

### Re-indexing Documentation

When documentation changes significantly, the embeddings should be updated:

```bash
# Incremental update (skip unchanged docs)
python scripts/embed-docs.py

# Force re-index all documents
python scripts/embed-docs.py --force

# Preview without indexing
python scripts/embed-docs.py --dry-run
```

For more details, see [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md#ai-integration-ai-docs).

---

## Recommended Usage Pattern

For AI agents discovering the VoiceAssist documentation:

### 1. Discover the System

```http
GET /agent/index.json
```

Learn available endpoints, metadata schema, and key documents.

### 2. Get All Documents

```http
GET /agent/docs.json
```

Fetch the full document list and filter client-side.

### 3. Search for Specific Topics

```http
GET /search-index.json
```

Download the search index and use Fuse.js for full-text search.

### 4. Read Priority Documents

Based on the index, prioritize reading:

1. `/ai/onboarding` - Quick start for agents
2. `/ai/status` - Implementation status
3. `/ai/api` - This document (Agent API Reference)
4. `/docs/overview/IMPLEMENTATION_STATUS` - Detailed component status

---

## Interpreting Metadata

### Status Field

| Value          | Meaning                    | Agent Action                 |
| -------------- | -------------------------- | ---------------------------- |
| `stable`       | Production-ready, reviewed | Safe to use as authoritative |
| `experimental` | May change                 | Use with caution             |
| `draft`        | Incomplete                 | Avoid for critical decisions |
| `deprecated`   | Superseded                 | Check for replacement docs   |

### Audience Field

Documents with `audience: ["ai-agents"]` are specifically designed for AI assistants and contain:

- Structured quick references
- Code examples
- Machine-parseable tables
- Explicit rules and constraints

**Note:** The canonical value is `ai-agents`. Legacy values `agent` and `ai-agent` are accepted for backwards compatibility.

### Stability Field

| Value          | Meaning                           |
| -------------- | --------------------------------- |
| `production`   | Feature is live and stable        |
| `beta`         | Feature works but may have issues |
| `experimental` | Feature is being tested           |
| `legacy`       | Feature will be deprecated        |

---

## Repository Endpoints for AI

These endpoints expose the repository structure and source code for AI agents to explore the codebase.

### GET /agent/repo-index.json

Returns a complete index of all files and directories in the repository.

#### Request

```http
GET /agent/repo-index.json HTTP/1.1
Host: assistdocs.asimo.io
```

#### Response

```json
{
  "version": "1.0",
  "generated_at": "2025-12-04T22:00:00.000Z",
  "description": "VoiceAssist repository structure index for AI agents",
  "stats": {
    "total_files": 22921,
    "total_dirs": 2810,
    "total_size_bytes": 686000000,
    "by_language": { "typescript": 1500, "python": 800, ... },
    "by_component": { "frontend/web-app": 500, "backend/api-gateway": 800, ... }
  },
  "entries": [
    {
      "path": "apps/web-app/src/app/page.tsx",
      "type": "file",
      "size": 1234,
      "last_modified": "2025-12-04T10:00:00.000Z",
      "language": "typescript",
      "component": "frontend/web-app"
    }
  ]
}
```

#### Use Cases

- Discover repository structure
- Filter files by language (`by_language`) or component (`by_component`)
- Find entry points for each app/service
- Navigate to specific areas of the codebase

### GET /agent/repo/manifest.json

Returns a manifest of all files with exported content.

```json
{
  "version": "1.0",
  "total_files": 382,
  "files": [
    {
      "path": "services/api-gateway/app/main.py",
      "encoded": "services__api-gateway__app__main.py.json",
      "url": "/agent/repo/files/services__api-gateway__app__main.py.json"
    }
  ]
}
```

### GET /agent/repo/files/{encoded-path}.json

Returns the content of a specific file.

#### Path Encoding

- `/` in file paths is replaced with `__` (double underscore)
- `.json` extension is appended

**Example:** `services/api-gateway/app/main.py` → `services__api-gateway__app__main.py.json`

#### Response

```json
{
  "path": "services/api-gateway/app/main.py",
  "language": "python",
  "size": 5432,
  "last_modified": "2025-12-04T10:00:00.000Z",
  "lines": 150,
  "content": "#!/usr/bin/env python3\\n..."
}
```

#### Limitations

- Only key files are pre-exported (entry points, configs, important source files)
- Maximum file size: 100KB
- See `/agent/repo/manifest.json` for the list of available files

### GET /agent/doc-code-map.json

Returns a bidirectional mapping between documentation and repository files, enabling AI agents to:

- Navigate from a doc slug to related implementation files
- Find relevant docs when examining a code file

#### Response Structure

```json
{
  "generated_at": "2025-12-05T04:15:45.414Z",
  "description": "Bidirectional mapping between documentation and repository files",
  "usage": {
    "from_doc": "Use by_doc_slug[slug].relatedPaths to find implementation files",
    "from_code": "Use by_path[path].docs to find documentation for a code file",
    "fetch_code": "Encode path (/ → __) and fetch /agent/repo/files/{encoded}.json",
    "fetch_doc": "Use slug to look up full doc in /agent/docs.json"
  },
  "by_doc_slug": {
    "voice/pipeline": {
      "slug": "voice/pipeline",
      "path": "VOICE_MODE_PIPELINE.md",
      "component": "backend/api-gateway",
      "relatedPaths": ["services/api-gateway/app/api/voice.py", "apps/web-app/src/components/voice/VoiceModePanel.tsx"],
      "title": "Voice Mode Pipeline",
      "category": "voice",
      "ai_summary": "..."
    }
  },
  "by_path": {
    "services/api-gateway/app/api/voice.py": {
      "path": "services/api-gateway/app/api/voice.py",
      "docs": ["voice/pipeline"],
      "component": "backend/api-gateway"
    }
  },
  "meta": {
    "stats": {
      "docs_with_links": 12,
      "total_links": 40,
      "unique_paths": 25,
      "missing_paths": 1
    },
    "missing_paths": [{ "docSlug": "voice/pipeline", "path": "nonexistent/file.py" }]
  }
}
```

#### Schema Fields

| Field           | Type   | Description                                          |
| --------------- | ------ | ---------------------------------------------------- |
| `by_doc_slug`   | object | Map from doc slug to doc metadata with relatedPaths  |
| `by_path`       | object | Reverse map from code path to docs that reference it |
| `meta.stats`    | object | Counts: docs_with_links, total_links, unique_paths   |
| `missing_paths` | array  | Paths in relatedPaths not found in repo-index        |

#### Example Usage

**From doc to code:**

```bash
# Get code files related to voice/pipeline doc
curl https://assistdocs.asimo.io/agent/doc-code-map.json | \
  jq '.by_doc_slug["voice/pipeline"].relatedPaths'

# Fetch one of those code files
curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__api__voice.py.json
```

**From code to docs:**

```bash
# Find docs that reference a specific file
curl https://assistdocs.asimo.io/agent/doc-code-map.json | \
  jq '.by_path["services/api-gateway/app/api/voice.py"].docs'
```

### Related Documentation

- [Repo Navigation for Agents](./REPO_NAVIGATION_FOR_AGENTS.md) - How to navigate the codebase as an AI agent

---

## Live Endpoints

Test the endpoints directly:

- **Index:** https://assistdocs.asimo.io/agent/index.json
- **Docs:** https://assistdocs.asimo.io/agent/docs.json
- **Docs Summary:** https://assistdocs.asimo.io/agent/docs-summary.json
- **Health:** https://assistdocs.asimo.io/agent/health.json
- **Code Examples:** https://assistdocs.asimo.io/agent/code-examples.json
- **Tasks:** https://assistdocs.asimo.io/agent/tasks.json
- **Schema:** https://assistdocs.asimo.io/agent/schema.json
- **Repo Index:** https://assistdocs.asimo.io/agent/repo-index.json
- **Repo Manifest:** https://assistdocs.asimo.io/agent/repo/manifest.json
- **Doc-Code Map:** https://assistdocs.asimo.io/agent/doc-code-map.json
- **Search Index:** https://assistdocs.asimo.io/search-index.json
- **Sitemap:** https://assistdocs.asimo.io/sitemap.xml

---

## Related Documentation

- [Agent Onboarding Guide](./AGENT_ONBOARDING.md) - Quick start for AI agents
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md) - Documentation tooling

---

## Version History

| Version | Date       | Changes                                                                      |
| ------- | ---------- | ---------------------------------------------------------------------------- |
| 1.6.0   | 2025-12-05 | Added doc-code-map.json endpoint for bidirectional doc ↔ code crosswalk      |
| 1.5.0   | 2025-12-04 | Added repository endpoints: repo-index, repo/manifest, repo/files            |
| 1.4.0   | 2025-12-04 | Added docs-summary, health, code-examples endpoints; ai_summary in docs.json |
| 1.3.0   | 2025-12-03 | Added AI-Docs semantic search section                                        |
| 1.2.0   | 2025-11-27 | Added /agent/tasks.json endpoint documentation                               |
| 1.1.0   | 2025-11-27 | Updated to reflect static JSON endpoints                                     |
| 1.0.0   | 2025-11-27 | Initial release                                                              |
