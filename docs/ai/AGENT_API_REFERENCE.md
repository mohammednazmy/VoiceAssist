---
title: Agent API Reference
slug: ai/agent-api-reference
summary: >-
  Machine-readable JSON API endpoints for AI agents to discover and search
  documentation.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-03"
audience:
  - agent
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
version: 1.3.0
ai_summary: >-
  The VoiceAssist documentation site exposes machine-readable JSON endpoints
  designed for AI agents to programmatically discover, filter, and search
  documentation. Base URL: https://assistdocs.asimo.io --- Note: All endpoints
  listed above are static JSON files generated at build time. For lexical s...
---

# Agent API Reference

The VoiceAssist documentation site exposes machine-readable JSON endpoints designed for AI agents to programmatically discover, filter, and search documentation.

**Base URL:** `https://assistdocs.asimo.io`

---

## Endpoints Overview

| Endpoint             | Method | Purpose                                     |
| -------------------- | ------ | ------------------------------------------- |
| `/agent/index.json`  | GET    | Documentation system metadata and discovery |
| `/agent/docs.json`   | GET    | Full document list with metadata            |
| `/agent/tasks.json`  | GET    | Common agent tasks with commands and docs   |
| `/agent/schema.json` | GET    | JSON Schema for API response types          |
| `/search-index.json` | GET    | Full-text search index (Fuse.js format)     |
| `/sitemap.xml`       | GET    | XML sitemap for crawlers                    |

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
  "count": 224,
  "generated_at": "2025-11-27T21:21:55.185Z",
  "docs": [
    {
      "slug": "ai-agent-onboarding",
      "path": "ai/AGENT_ONBOARDING.md",
      "title": "AI Agent Onboarding Guide",
      "summary": "Quick context, repository structure, critical rules, and common tasks for AI coding assistants.",
      "status": "stable",
      "stability": "production",
      "owner": "docs",
      "audience": ["agent"],
      "tags": ["onboarding", "ai-agent", "getting-started"],
      "relatedServices": ["api-gateway", "web-app", "admin-panel", "docs-site"],
      "lastUpdated": "2025-11-27"
    },
    {
      "slug": "implementation-status",
      "path": "overview/IMPLEMENTATION_STATUS.md",
      "title": "Implementation Status",
      "summary": "Single source of truth for all component status...",
      "status": "stable",
      "stability": "production",
      "owner": "mixed",
      "audience": ["human", "agent", "backend", "frontend", "devops"],
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

Documents with `audience: ["agent"]` are specifically designed for AI assistants and contain:

- Structured quick references
- Code examples
- Machine-parseable tables
- Explicit rules and constraints

### Stability Field

| Value          | Meaning                           |
| -------------- | --------------------------------- |
| `production`   | Feature is live and stable        |
| `beta`         | Feature works but may have issues |
| `experimental` | Feature is being tested           |
| `legacy`       | Feature will be deprecated        |

---

## Live Endpoints

Test the endpoints directly:

- **Index:** https://assistdocs.asimo.io/agent/index.json
- **Docs:** https://assistdocs.asimo.io/agent/docs.json
- **Tasks:** https://assistdocs.asimo.io/agent/tasks.json
- **Schema:** https://assistdocs.asimo.io/agent/schema.json
- **Search Index:** https://assistdocs.asimo.io/search-index.json
- **Sitemap:** https://assistdocs.asimo.io/sitemap.xml

---

## Related Documentation

- [Agent Onboarding Guide](./AGENT_ONBOARDING.md) - Quick start for AI agents
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md) - Documentation tooling

---

## Version History

| Version | Date       | Changes                                        |
| ------- | ---------- | ---------------------------------------------- |
| 1.3.0   | 2025-12-03 | Added AI-Docs semantic search section          |
| 1.2.0   | 2025-11-27 | Added /agent/tasks.json endpoint documentation |
| 1.1.0   | 2025-11-27 | Updated to reflect static JSON endpoints       |
| 1.0.0   | 2025-11-27 | Initial release                                |
