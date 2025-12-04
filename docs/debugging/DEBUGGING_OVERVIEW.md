---
title: Debugging Overview
slug: debugging/overview
summary: >-
  High-level guide on how to debug VoiceAssist - logs, metrics, common symptoms,
  and where to look.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience:
  - human
  - agent
  - ai-agents
  - sre
  - backend
  - frontend
tags:
  - debugging
  - runbook
  - incident
  - logs
  - metrics
  - troubleshooting
relatedServices:
  - api-gateway
  - web-app
  - admin-panel
  - docs-site
category: debugging
version: 1.0.0
ai_summary: >-
  Last Updated: 2025-11-27 Audience: Developers, SREs, AI Assistants This guide
  provides a high-level overview of debugging VoiceAssist components. For
  detailed component-specific debugging, see the linked documents. --- ---
  Location: docker logs voiceassist-server -f (VoiceAssist runs in Docker) K...
---

# Debugging Overview

**Last Updated:** 2025-11-27
**Audience:** Developers, SREs, AI Assistants

This guide provides a high-level overview of debugging VoiceAssist components. For detailed component-specific debugging, see the linked documents.

---

## Quick Reference: Where to Look

| Symptom                    | First Place to Check               | Document                                        |
| -------------------------- | ---------------------------------- | ----------------------------------------------- |
| Backend 500 errors         | API Gateway logs                   | [Backend Debugging](./DEBUGGING_BACKEND.md)     |
| Frontend not loading       | Browser console, network tab       | [Frontend Debugging](./DEBUGGING_FRONTEND.md)   |
| WebSocket disconnects      | Realtime service logs              | [Voice/Realtime](./DEBUGGING_VOICE_REALTIME.md) |
| Voice transcription fails  | STT service logs                   | [Voice/Realtime](./DEBUGGING_VOICE_REALTIME.md) |
| Docs site 404s             | Apache rewrite rules, static files | [Docs Site](./DEBUGGING_DOCS_SITE.md)           |
| Auth failures              | JWT tokens, Redis session          | [Backend Debugging](./DEBUGGING_BACKEND.md)     |
| Database connection errors | PostgreSQL logs, connection pool   | [Backend Debugging](./DEBUGGING_BACKEND.md)     |

---

## Logs and Metrics

### Backend Logs

**Location:** `docker logs voiceassist-server -f` (VoiceAssist runs in Docker)

**Key Log Files:**

- API Gateway: `/var/log/api-gateway/` or stdout in container
- Structured JSON logs with trace IDs

**Log Levels:**

- `DEBUG` - Verbose debugging
- `INFO` - Normal operation
- `WARNING` - Recoverable issues
- `ERROR` - Failures requiring attention
- `CRITICAL` - System-level failures

### Frontend Logs

**Location:** Browser Developer Tools → Console

**Key Areas:**

- Network tab for API failures
- Console for JavaScript errors
- React DevTools for component state

### Infrastructure Metrics

**Prometheus Metrics:** `http://localhost:8000/metrics`

**Key Metrics:**

- `http_requests_total` - Request counts by endpoint and status
- `http_request_duration_seconds` - Latency histogram
- `db_connection_pool_*` - Database connection health
- `redis_*` - Cache performance
- `rag_*` - RAG pipeline metrics

---

## Common Symptoms and Causes

### Backend Issues

| Symptom                   | Likely Causes                                         |
| ------------------------- | ----------------------------------------------------- |
| 500 Internal Server Error | Unhandled exception, database timeout, missing config |
| 401 Unauthorized          | Expired JWT, missing token, wrong audience            |
| 403 Forbidden             | Insufficient role, RBAC policy violation              |
| 429 Too Many Requests     | Rate limiting triggered                               |
| 503 Service Unavailable   | Dependency down (DB, Redis, Qdrant)                   |

### Frontend Issues

| Symptom            | Likely Causes                                       |
| ------------------ | --------------------------------------------------- |
| Blank page         | JavaScript error, missing env vars, CORS            |
| API calls failing  | Network issues, wrong base URL, auth token expired  |
| State not updating | React state mutation, missing useEffect deps        |
| Slow rendering     | Unoptimized re-renders, large lists without virtual |

### Voice/Realtime Issues

| Symptom                 | Likely Causes                              |
| ----------------------- | ------------------------------------------ |
| WebSocket won't connect | CORS, proxy config, SSL termination        |
| Audio not recording     | Browser permissions, MediaRecorder support |
| Transcription empty     | STT service down, audio format unsupported |
| TTS not playing         | Audio context suspended, codec issues      |

---

## Investigation Workflow

### 1. Reproduce the Issue

```bash
# Check container status
docker ps --filter name=voiceassist

# Watch logs in real-time
docker logs voiceassist-server -f

# Test API directly
curl -X GET http://localhost:8000/health
curl -X GET http://localhost:8000/ready
```

### 2. Identify the Component

```
User Request
    ↓
[Frontend] → Check browser console
    ↓
[API Gateway] → Check service logs
    ↓
[Database/Redis/Qdrant] → Check dependency health
```

### 3. Check Dependencies

```bash
# Database
psql -h localhost -U postgres -d voiceassist -c "SELECT 1"

# Redis
redis-cli ping

# Qdrant
curl http://localhost:6333/collections
```

### 4. Review Recent Changes

```bash
# Recent commits
git log --oneline -10

# Recent logs from past hour
docker logs voiceassist-server --since "1h"
```

---

## Relevant Dashboards

| Dashboard               | URL                                     | Purpose               |
| ----------------------- | --------------------------------------- | --------------------- |
| API Health              | `/health`, `/ready`                     | Service health checks |
| Prometheus Metrics      | `/metrics`                              | Raw metrics           |
| Grafana (if configured) | `http://localhost:3000`                 | Visualization         |
| Apache Status           | `https://assist.asimo.io/server-status` | Web server metrics    |

---

## Detailed Debugging Guides

- [Backend Debugging](./DEBUGGING_BACKEND.md) - API Gateway, database, cache
- [Frontend Debugging](./DEBUGGING_FRONTEND.md) - Web app, React components
- [Voice & Realtime Debugging](./DEBUGGING_VOICE_REALTIME.md) - WebSocket, STT, TTS
- [Docs Site Debugging](./DEBUGGING_DOCS_SITE.md) - Next.js, static export, Apache

---

## Related Documentation

- [Operations Runbooks](../operations/runbooks/) - Step-by-step incident procedures
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Backend Architecture](../BACKEND_ARCHITECTURE.md) - System design
