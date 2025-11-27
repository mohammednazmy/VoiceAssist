---
title: API Reference
slug: api-reference/overview
summary: High-level API overview, endpoint groups, and quick reference for the VoiceAssist API.
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience: ["human", "agent", "backend", "frontend"]
tags: ["api", "rest", "reference", "endpoints"]
relatedServices: ["api-gateway"]
version: "2.0.0"
---

# API Reference

**Last Updated:** 2025-11-27

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

| Group           | Prefix                     | Description                       | Module                   |
| --------------- | -------------------------- | --------------------------------- | ------------------------ |
| Authentication  | `/api/auth`                | Login, register, token management | `auth.py`                |
| OAuth           | `/api/auth/oauth`          | OAuth2 provider integration       | `auth_oauth.py`          |
| Users           | `/api/users`               | User profile and admin operations | `users.py`               |
| Conversations   | `/conversations`           | Chat sessions and branching       | `conversations.py`       |
| Folders         | `/api/folders`             | Conversation organization         | `folders.py`             |
| Attachments     | `/api/attachments`         | File attachments                  | `attachments.py`         |
| Export          | `/api/export`              | Conversation/data export          | `export.py`              |
| Sharing         | `/api/sharing`             | Share conversations               | `sharing.py`             |
| Voice           | `/api/voice`               | Voice session management          | `voice.py`               |
| Real-time       | `/api/realtime`            | WebSocket connections             | `realtime.py`            |
| Medical AI      | `/api/medical`             | Medical queries and RAG           | `medical_ai.py`          |
| External Med    | `/api/external-medical`    | External medical APIs             | `external_medical.py`    |
| Clinical        | `/api/clinical`            | Clinical context                  | `clinical_context.py`    |
| Advanced Search | `/api/search`              | Advanced search features          | `advanced_search.py`     |
| Integrations    | `/api/integrations`        | Third-party integrations          | `integrations.py`        |
| Admin Panel     | `/api/admin/panel`         | Dashboard, metrics, audit logs    | `admin_panel.py`         |
| Knowledge Base  | `/api/admin/kb`            | Document management               | `admin_kb.py`            |
| Cache           | `/api/admin/cache`         | Cache statistics and control      | `admin_cache.py`         |
| Feature Flags   | `/api/admin/feature-flags` | Feature toggle management         | `admin_feature_flags.py` |
| Health          | `/health`, `/ready`        | Service health checks             | `health.py`              |
| Metrics         | `/metrics`                 | Prometheus metrics                | `metrics.py`             |

### OpenAPI Specification

- **Swagger UI:** `http://localhost:8000/docs` (interactive API explorer)
- **ReDoc:** `http://localhost:8000/redoc` (alternative documentation)
- **OpenAPI JSON:** `http://localhost:8000/openapi.json` (downloadable spec)

For complete documentation with request/response examples, see [api-reference/rest-api.md](api-reference/rest-api.md).
