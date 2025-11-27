---
title: Agent API Reference
slug: ai/agent-api-reference
summary: Machine-readable JSON API endpoints for AI agents to discover and search documentation.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["agent", "backend"]
tags: ["api", "ai-agent", "json", "documentation"]
relatedServices: ["docs-site"]
version: "1.0.0"
---

# Agent API Reference

The VoiceAssist documentation site exposes machine-readable JSON endpoints designed for AI agents to programmatically discover, filter, and search documentation.

**Base URL:** `https://assistdocs.asimo.io`

---

## Endpoints Overview

| Endpoint            | Method | Purpose                                     |
| ------------------- | ------ | ------------------------------------------- |
| `/agent/index.json` | GET    | Documentation system metadata and discovery |
| `/agent/docs.json`  | GET    | Full document list with filtering           |
| `/agent/search`     | GET    | Full-text search across all documentation   |

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
  "version": "1.0.0",
  "generated_at": "2025-11-27T12:00:00.000Z",
  "description": "VoiceAssist Documentation API for AI Agents",
  "project": {
    "name": "VoiceAssist",
    "description": "Enterprise-grade, HIPAA-compliant medical AI assistant platform",
    "repository": "https://github.com/mohammednazmy/VoiceAssist"
  },
  "endpoints": {
    "index": {
      "url": "/agent/index.json",
      "description": "This index - documentation system metadata"
    },
    "docs": {
      "url": "/agent/docs.json",
      "description": "Full document list with metadata"
    },
    "search": {
      "url": "/agent/search",
      "description": "Search documentation (query param: q)",
      "example": "/agent/search?q=authentication"
    },
    "sitemap": {
      "url": "/sitemap.xml",
      "description": "XML sitemap for all documentation pages"
    }
  },
  "documentation": {
    "architecture": {
      "slug": "architecture/unified",
      "description": "System architecture overview"
    },
    "api_reference": {
      "slug": "api-reference/rest-api",
      "description": "REST API documentation"
    },
    "agent_onboarding": {
      "slug": "ai/agent-onboarding",
      "description": "Quick start guide for AI agents"
    },
    "implementation_status": {
      "slug": "overview/implementation-status",
      "description": "Component status and roadmap"
    }
  },
  "metadata_schema": {
    "required_fields": ["title", "slug", "status", "lastUpdated"],
    "status_values": ["draft", "experimental", "stable", "deprecated"],
    "stability_values": ["production", "beta", "experimental", "legacy"],
    "audience_values": ["human", "agent", "backend", "frontend", "devops", "admin", "user"]
  },
  "tips": [
    "Use /agent/docs.json to get all documents with metadata",
    "Filter by audience=['agent'] for AI-specific documentation",
    "Check status='stable' for production-ready docs",
    "The 'summary' field provides a one-line description"
  ]
}
```

### Caching

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`
- Cached for 1 hour, stale-while-revalidate for 24 hours

---

## GET /agent/docs.json

Returns a list of all documentation with metadata. Supports filtering.

### Request

```http
GET /agent/docs.json HTTP/1.1
Host: assistdocs.asimo.io
```

### Query Parameters

| Parameter   | Type   | Description               | Example                 |
| ----------- | ------ | ------------------------- | ----------------------- |
| `status`    | string | Filter by document status | `?status=stable`        |
| `audience`  | string | Filter by target audience | `?audience=agent`       |
| `tag`       | string | Filter by tag             | `?tag=api`              |
| `owner`     | string | Filter by team ownership  | `?owner=backend`        |
| `stability` | string | Filter by stability level | `?stability=production` |

### Response

```json
{
  "count": 42,
  "generated_at": "2025-11-27T12:00:00.000Z",
  "filters": {
    "status": null,
    "audience": null,
    "tag": null,
    "owner": null,
    "stability": null
  },
  "docs": [
    {
      "slug": "ai/agent-onboarding",
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
      "slug": "overview/implementation-status",
      "path": "overview/IMPLEMENTATION_STATUS.md",
      "title": "Implementation Status",
      "summary": "Single source of truth for all component status...",
      "status": "stable",
      "stability": "production",
      "owner": "docs",
      "audience": ["human", "agent"],
      "tags": ["status", "roadmap"],
      "lastUpdated": "2025-11-27"
    }
  ]
}
```

### Example: Filter for AI Agent Docs

```http
GET /agent/docs.json?audience=agent&status=stable HTTP/1.1
Host: assistdocs.asimo.io
```

### Example: Filter for Backend Documentation

```http
GET /agent/docs.json?owner=backend&stability=production HTTP/1.1
Host: assistdocs.asimo.io
```

### Caching

- `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`
- Cached for 5 minutes, stale-while-revalidate for 1 hour

---

## GET /agent/search

Full-text search across all documentation.

### Request

```http
GET /agent/search?q=authentication HTTP/1.1
Host: assistdocs.asimo.io
```

### Query Parameters

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| `q`       | string | Yes      | Search query (min 2 characters) |
| `limit`   | number | No       | Maximum results (default: 20)   |

### Response

```json
{
  "query": "authentication",
  "count": 5,
  "generated_at": "2025-11-27T12:00:00.000Z",
  "results": [
    {
      "slug": "api-reference/rest-api",
      "path": "api-reference/rest-api.md",
      "title": "REST API Reference",
      "summary": "Complete REST API documentation",
      "status": "stable",
      "score": 150,
      "snippet": "...JWT authentication flow using access and refresh tokens..."
    },
    {
      "slug": "security-compliance",
      "path": "SECURITY_COMPLIANCE.md",
      "title": "Security & Compliance",
      "summary": "Security architecture and HIPAA compliance",
      "status": "stable",
      "score": 120,
      "snippet": "...authentication mechanisms include OAuth 2.0..."
    }
  ]
}
```

### Scoring Algorithm

Results are ranked by relevance:

| Match Location        | Score Weight |
| --------------------- | ------------ |
| Title (exact match)   | +100         |
| Title (word match)    | +20 per word |
| Summary (exact match) | +50          |
| Summary (word match)  | +10 per word |
| Tags (exact match)    | +30          |
| Tags (word match)     | +15 per word |
| Content (exact match) | +20          |
| Content (word match)  | +3 per word  |

### Error Response

```json
{
  "error": "Query parameter 'q' is required and must be at least 2 characters",
  "example": "/agent/search?q=authentication"
}
```

### Caching

- `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- Cached for 1 minute, stale-while-revalidate for 5 minutes

---

## Recommended Usage Pattern

For AI agents discovering the VoiceAssist documentation:

### 1. Discover the System

```http
GET /agent/index.json
```

Learn available endpoints, metadata schema, and key documents.

### 2. Get Relevant Documents

```http
GET /agent/docs.json?audience=agent&status=stable
```

Filter for AI-specific, production-ready documentation.

### 3. Search for Specific Topics

```http
GET /agent/search?q=api+endpoints
```

Find documentation on specific topics.

### 4. Read Priority Documents

Based on the index, prioritize:

1. `ai/agent-onboarding` - Quick start for agents
2. `overview/implementation-status` - What's implemented
3. `api-reference/rest-api` - API details
4. `architecture/unified` - System design

---

## Interpreting Metadata

### Status Field

| Value          | Meaning                    | Agent Action                 |
| -------------- | -------------------------- | ---------------------------- |
| `stable`       | Production-ready, reviewed | Safe to use as authoritative |
| `experimental` | May change                 | Use with caution             |
| `draft`        | Incomplete                 | Avoid for critical decisions |
| `deprecated`   | Superseded                 | Check `replacedBy` field     |

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

## Related Documentation

- [Agent Onboarding Guide](./AGENT_ONBOARDING.md) - Quick start for AI agents
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md) - Documentation tooling

---

## Version History

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | 2025-11-27 | Initial release |
