---
title: Debugging Index
slug: debugging/index
summary: Central hub for all VoiceAssist troubleshooting documentation - logs, metrics, health endpoints, and debugging guides by subsystem.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["human", "agent", "ai-agents", "developers", "sre", "backend", "frontend"]
tags: ["debugging", "runbook", "troubleshooting", "logs", "metrics", "index"]
relatedServices: ["api-gateway", "web-app", "admin-panel", "docs-site"]
category: debugging
version: "1.0.0"
---

# Debugging Index

**Last Updated:** 2025-11-27
**Audience:** Developers, SREs, AI Assistants

This is the central hub for all VoiceAssist troubleshooting documentation. Use this index to quickly find the right debugging guide, logs, metrics, and runbooks for any subsystem.

---

## Quick Reference: Subsystem Overview

| Subsystem      | Primary Guide                                    | Key Logs                            | Health Endpoint               |
| -------------- | ------------------------------------------------ | ----------------------------------- | ----------------------------- |
| Backend/API    | [Backend Debugging](./DEBUGGING_BACKEND.md)      | `journalctl -u quran-rtc`           | `/health`, `/ready`           |
| Frontend/Web   | [Frontend Debugging](./DEBUGGING_FRONTEND.md)    | Browser Console, Network Tab        | N/A (static)                  |
| Voice/Realtime | [Voice Debugging](./DEBUGGING_VOICE_REALTIME.md) | `journalctl -u quran-rtc`           | `/ws` endpoint                |
| Docs Site      | [Docs Site Debugging](./DEBUGGING_DOCS_SITE.md)  | `/var/log/apache2/assistdocs-*.log` | `/agent/index.json`           |
| Infrastructure | [Overview](./DEBUGGING_OVERVIEW.md)              | `journalctl`, Apache logs           | Apache status, systemd status |

---

## Debugging Guides by Subsystem

### Backend Services

**Primary Guide:** [Backend Debugging](./DEBUGGING_BACKEND.md)

**Key Logs:**

```bash
# API Gateway logs
journalctl -u quran-rtc -f

# With error filtering
journalctl -u quran-rtc -n 100 --no-pager | grep -i error
```

**Key Health Endpoints:**

- `GET /health` - Basic health check
- `GET /ready` - Readiness (includes dependencies)
- `GET /metrics` - Prometheus metrics

**Related Runbooks:**

- [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [Disaster Recovery](../DISASTER_RECOVERY_RUNBOOK.md)

---

### Frontend (Web App & Admin Panel)

**Primary Guide:** [Frontend Debugging](./DEBUGGING_FRONTEND.md)

**Key Logs:**

- Browser DevTools → Console
- Browser DevTools → Network Tab
- React DevTools → Profiler

**Debugging Tools:**

- Chrome DevTools
- React Developer Tools extension
- Redux DevTools (if applicable)

**Related Documentation:**

- [Web App Feature Specs](../client-implementation/WEB_APP_FEATURE_SPECS.md)
- [Admin Panel Feature Specs](../client-implementation/ADMIN_PANEL_FEATURE_SPECS.md)

---

### Voice & Realtime (WebSocket, STT, TTS)

**Primary Guide:** [Voice & Realtime Debugging](./DEBUGGING_VOICE_REALTIME.md)

**Key Logs:**

```bash
# Voice service logs
journalctl -u quran-rtc --since "10 minutes ago" | grep -i "websocket\|stt\|tts\|voice"
```

**Key Health Endpoints:**

- WebSocket: `wss://assist.asimo.io/ws`
- Test tools: `websocat`, `wscat`

**Related Documentation:**

- [Voice Mode Settings Guide](../VOICE_MODE_SETTINGS_GUIDE.md)
- [Voice Ready State](../VOICE_READY_STATE_2025-11-25.md)

---

### Documentation Site

**Primary Guide:** [Docs Site Debugging](./DEBUGGING_DOCS_SITE.md)

**Key Logs:**

```bash
# Apache logs for docs site
sudo tail -f /var/log/apache2/assistdocs-error.log
sudo tail -f /var/log/apache2/assistdocs-access.log
```

**Key Health Endpoints:**

- `GET /` - Homepage
- `GET /agent/index.json` - AI agent discovery endpoint
- `GET /agent/docs.json` - Documentation list
- `GET /search-index.json` - Search index
- `GET /sitemap.xml` - Sitemap

**Related Documentation:**

- [Agent API Reference](../ai/AGENT_API_REFERENCE.md)
- [Agent Onboarding](../ai/AGENT_ONBOARDING.md)

---

### Infrastructure

**Primary Guide:** [Debugging Overview](./DEBUGGING_OVERVIEW.md)

**Key Services:**

```bash
# Check all major services
sudo systemctl status quran-rtc apache2 redis-server

# Check systemd for failures
sudo systemctl list-units --failed
```

**Key Health Checks:**

```bash
# Database
psql -h localhost -U voiceassist -d voiceassist -c "SELECT 1"

# Redis
redis-cli ping

# Apache
sudo apachectl configtest
```

**Related Documentation:**

- [Infrastructure Setup](../INFRASTRUCTURE_SETUP.md)
- [Apache Configuration](../apache-configs/)
- [SLO Definitions](../operations/SLO_DEFINITIONS.md)

---

## Key Metrics & Monitoring

### Prometheus Metrics (from `/metrics`)

| Metric                          | Description               | Alert Threshold |
| ------------------------------- | ------------------------- | --------------- |
| `http_requests_total`           | Request count by status   | > 10 5xx/min    |
| `http_request_duration_seconds` | Request latency           | > 2s p95        |
| `db_connection_pool_size`       | Active DB connections     | > 80% pool      |
| `redis_connection_errors`       | Redis connection failures | > 0             |

### Application Logs

Log format is structured JSON with trace IDs:

```json
{
  "timestamp": "2025-11-27T12:00:00Z",
  "level": "ERROR",
  "trace_id": "abc123",
  "message": "Database connection failed",
  "service": "api-gateway"
}
```

---

## Common Investigation Workflows

### 1. API Error Investigation

1. Check health endpoints: `curl /health && curl /ready`
2. Review recent errors: `journalctl -u quran-rtc -n 100 | grep ERROR`
3. Check dependencies: Redis, PostgreSQL, Qdrant
4. Look for trace ID in logs to follow request path

### 2. Frontend Issue Investigation

1. Open Browser DevTools (F12)
2. Check Console for JavaScript errors
3. Check Network tab for failed API calls
4. Verify environment variables

### 3. WebSocket/Voice Issue Investigation

1. Test WebSocket connection: `websocat wss://assist.asimo.io/ws`
2. Check browser console for connection errors
3. Verify Apache WebSocket proxy configuration
4. Check audio permissions in browser

### 4. Docs Site Investigation

1. Verify static files exist: `ls /var/www/assistdocs.asimo.io/`
2. Test with explicit .html: `curl /ai/onboarding.html`
3. Check Apache rewrite rules
4. Run validation: `pnpm validate:metadata`

---

## Runbooks & Operations

| Scenario                  | Runbook                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| Production Deployment     | [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT_RUNBOOK.md) |
| Disaster Recovery         | [Disaster Recovery Runbook](../DISASTER_RECOVERY_RUNBOOK.md)         |
| Performance Investigation | [Performance Tuning Guide](../PERFORMANCE_TUNING_GUIDE.md)           |
| Load Testing              | [Load Testing Guide](../LOAD_TESTING_GUIDE.md)                       |

---

## Related Documentation

- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status overview
- [API Reference](../API_REFERENCE.md) - API endpoint documentation
- [Backend Architecture](../BACKEND_ARCHITECTURE.md) - System design
- [Service Catalog](../SERVICE_CATALOG.md) - Service inventory
