---
title: API Reference
slug: api-reference/overview
summary: >-
  High-level API overview, endpoint groups, and quick reference for the
  VoiceAssist API.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-02"
audience:
  - human
  - agent
  - backend
  - frontend
  - ai-agents
tags:
  - api
  - rest
  - reference
  - endpoints
category: api
relatedServices:
  - api-gateway
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/api/__init__.py"
  - "services/api-gateway/app/api/conversations.py"
  - "services/api-gateway/app/api/auth.py"
  - "services/api-gateway/app/api/voice.py"
  - "services/api-gateway/app/api/health.py"
version: 2.0.0
ai_summary: >-
  Last Updated: 2025-12-02 The VoiceAssist API provides comprehensive REST
  endpoints for building medical AI assistant applications. - Complete REST API
  Reference - Full endpoint documentation with examples - OpenAPI/Swagger UI -
  Interactive docs at http://localhost:8000/docs - ReDoc - Alternative...
---

# API Reference

**Last Updated:** 2025-12-02

The VoiceAssist API provides comprehensive REST endpoints for building medical AI assistant applications.

## Documentation

- **[Complete REST API Reference](api-reference/rest-api.md)** - Full endpoint documentation with examples
- **OpenAPI/Swagger UI** - Interactive docs at `http://localhost:8000/docs`
- **ReDoc** - Alternative docs at `http://localhost:8000/redoc`

## Quick Reference

### Base URLs

- **Production:** `https://assist.asimo.io`
- **Development:** `http://localhost:8000`

### Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <access_token>
```

### Core Endpoint Groups

| Group           | Prefix                     | Description                        | Module                   |
| --------------- | -------------------------- | ---------------------------------- | ------------------------ |
| Authentication  | `/api/auth`                | Login, register, token management  | `auth.py`                |
| OAuth           | `/api/auth/oauth`          | OAuth2 provider integration        | `auth_oauth.py`          |
| Users           | `/api/users`               | User profile and admin operations  | `users.py`               |
| Conversations   | `/conversations`           | Chat sessions and branching        | `conversations.py`       |
| Folders         | `/api/folders`             | Conversation organization          | `folders.py`             |
| Attachments     | `/api/attachments`         | File attachments                   | `attachments.py`         |
| Export          | `/api/export`              | Conversation/data export           | `export.py`              |
| Sharing         | `/api/sharing`             | Share conversations                | `sharing.py`             |
| Voice           | `/api/voice`               | Voice session management           | `voice.py`               |
| Voice Pipeline  | `/api/voice/pipeline-ws`   | Thinker-Talker WebSocket (Primary) | `voice.py` (T/T handler) |
| Real-time       | `/api/realtime`            | WebSocket connections              | `realtime.py`            |
| Medical AI      | `/api/medical`             | Medical queries and RAG            | `medical_ai.py`          |
| External Med    | `/api/external-medical`    | External medical APIs              | `external_medical.py`    |
| Clinical        | `/api/clinical`            | Clinical context                   | `clinical_context.py`    |
| Advanced Search | `/api/search`              | Advanced search features           | `advanced_search.py`     |
| Integrations    | `/api/integrations`        | Third-party integrations           | `integrations.py`        |
| Admin Panel     | `/api/admin/panel`         | Dashboard, metrics, audit logs     | `admin_panel.py`         |
| Knowledge Base  | `/api/admin/kb`            | Document management                | `admin_kb.py`            |
| Cache           | `/api/admin/cache`         | Cache statistics and control       | `admin_cache.py`         |
| Feature Flags   | `/api/admin/feature-flags` | Feature toggle management          | `admin_feature_flags.py` |
| Health          | `/health`, `/ready`        | Service health checks              | `health.py`              |
| Metrics         | `/metrics`                 | Prometheus metrics                 | `metrics.py`             |

### OpenAPI Specification

- **Swagger UI:** `http://localhost:8000/docs` (interactive API explorer)
- **ReDoc:** `http://localhost:8000/redoc` (alternative documentation)
- **OpenAPI JSON:** `http://localhost:8000/openapi.json` (downloadable spec)

For complete documentation with request/response examples, see [api-reference/rest-api.md](api-reference/rest-api.md).

### Documentation Coverage Status

As of 2025-12-02, API documentation coverage:

| Metric          | Count | Notes                             |
| --------------- | ----- | --------------------------------- |
| Total Endpoints | 310   | Backend route definitions         |
| Documented      | 39    | In rest-api.md with examples      |
| Undocumented    | 271   | Exist in code, need documentation |

**Priority endpoints to document:**

1. Core voice endpoints (`/api/voice/*`) - Most user-facing
2. Authentication 2FA (`/api/auth/2fa/*`) - Security-critical
3. Admin panel endpoints (`/api/admin/panel/*`) - Ops-critical
4. Integration endpoints (`/api/integrations/*`) - Feature expansion

Run `pnpm validate:api-sync` in `apps/docs-site/` to regenerate coverage stats.

---

## Documentation API (For AI Agents)

The docs site provides machine-readable JSON endpoints for AI agents:

### Static JSON Endpoints

| Endpoint                 | Description                             |
| ------------------------ | --------------------------------------- |
| `GET /agent/index.json`  | Documentation system metadata           |
| `GET /agent/docs.json`   | Full document list with metadata        |
| `GET /agent/tasks.json`  | Common agent tasks with commands        |
| `GET /agent/schema.json` | JSON Schema for API response types      |
| `GET /search-index.json` | Full-text search index (Fuse.js format) |

**Base URL:** `https://assistdocs.asimo.io`

**Note:** All endpoints are static JSON. Use search-index.json with client-side Fuse.js for full-text search.

### AI-Docs Semantic Search (Qdrant)

For semantic/vector search, documentation is embedded into Qdrant:

| Property            | Value                  |
| ------------------- | ---------------------- |
| **Collection**      | `platform_docs`        |
| **Embedding Model** | text-embedding-3-small |
| **Dimensions**      | 1536                   |
| **Distance Metric** | Cosine                 |

**Tool Functions (for AI agents):**

```python
# Semantic search across documentation
docs_search(query: str, category: str = None, max_results: int = 5)

# Retrieve full section content
docs_get_section(doc_path: str, section: str = None)
```

**Re-indexing Documentation:**

```bash
python scripts/embed-docs.py            # Incremental update
python scripts/embed-docs.py --force    # Force re-index all
```

For full details, see:

- [Agent API Reference](ai/AGENT_API_REFERENCE.md) - JSON endpoints
- [Agent Onboarding](ai/AGENT_ONBOARDING.md) - AI-Docs integration
- [Internal Docs System](INTERNAL_DOCS_SYSTEM.md) - Embedding workflow
