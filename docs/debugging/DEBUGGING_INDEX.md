---
title: Debugging Index
slug: debugging/index
summary: Central hub for all VoiceAssist troubleshooting documentation - logs, metrics, health endpoints, and debugging guides by subsystem.
status: stable
stability: production
owner: sre
lastUpdated: "2025-12-02"
audience: ["human", "agent", "ai-agents", "developers", "sre", "backend", "frontend"]
tags: ["debugging", "runbook", "troubleshooting", "logs", "metrics", "index"]
relatedServices: ["api-gateway", "web-app", "admin-panel", "docs-site"]
category: debugging
version: "1.1.0"
---

# Debugging Index

**Last Updated:** 2025-12-02
**Version:** 1.1.0
**Audience:** Developers, SREs, AI Assistants

> **Note:** Voice/Realtime rows now target the Thinker-Talker pipeline at `/api/voice/pipeline-ws`. The legacy OpenAI Realtime API is documented separately.

This is the central hub for all VoiceAssist troubleshooting documentation. Use this index to quickly find the right debugging guide, logs, metrics, and runbooks for any subsystem.

---

## Debug by Symptom

| Symptom                      | Likely Subsystem | First Doc to Read                                    | Key Commands                                              |
| ---------------------------- | ---------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| API returns 500 errors       | Backend          | [Backend Debugging](/operations/debugging-backend)   | `docker logs voiceassist-server --tail 100 \| grep ERROR` |
| WebSocket disconnects        | Voice/Realtime   | [Voice Debugging](/operations/debugging-voice)       | `websocat "wss://assist.asimo.io/api/voice/pipeline-ws"`  |
| Voice input not working      | Voice/Realtime   | [Voice Debugging](/operations/debugging-voice)       | Check browser audio permissions                           |
| Pages return 404             | Docs Site        | [Docs Site Debugging](/operations/debugging-docs)    | `ls /var/www/assistdocs.asimo.io/`                        |
| Slow response times          | Backend          | [Backend Debugging](/operations/debugging-backend)   | `curl /metrics \| grep http_request_duration`             |
| Authentication failing       | Backend          | [Backend Debugging](/operations/debugging-backend)   | Check JWT token expiry, Redis status                      |
| Search not returning results | Backend          | [Backend Debugging](/operations/debugging-backend)   | Check Qdrant connection, embedding status                 |
| UI renders incorrectly       | Frontend         | [Frontend Debugging](/operations/debugging-frontend) | Browser DevTools Console & Network                        |
| SSL certificate errors       | Infrastructure   | [Debugging Overview](/operations/debugging-overview) | `sudo certbot certificates`                               |
| Service won't start          | Infrastructure   | [Debugging Overview](/operations/debugging-overview) | `sudo systemctl status <service>`                         |

---

## AI Agent Playbook

For AI assistants debugging VoiceAssist issues:

### Required Information to Collect

1. **Error context**: Exact error message, timestamp, affected endpoint
2. **Logs**: Last 100 lines from relevant service (`journalctl -u <service> -n 100`)
3. **Health status**: Output of `/health` and `/ready` endpoints
4. **Recent changes**: Any deployments or config changes in past 24h

### Standard Investigation Steps

```bash
# 1. Check container status
docker ps --filter name=voiceassist
docker logs voiceassist-server --tail 50

# 2. Check recent errors
docker logs voiceassist-server --since "30m" 2>&1 | grep -i error

# 3. Check health endpoints
curl -s https://assist.asimo.io/health | jq
curl -s https://assist.asimo.io/ready | jq

# 4. Check dependencies
docker exec voiceassist-redis redis-cli ping
curl -s http://localhost:6333/collections | jq  # Qdrant
```

### What "Good" vs "Bad" Looks Like

| Check          | Good                                         | Bad                    |
| -------------- | -------------------------------------------- | ---------------------- |
| `/health`      | `{"status": "healthy"}`                      | Non-200 or timeout     |
| `/ready`       | `{"status": "ready", "dependencies": {...}}` | Any dependency `false` |
| Service status | `active (running)`                           | `failed` or `inactive` |
| Redis          | `PONG`                                       | Connection refused     |
| Apache         | `Syntax OK` from configtest                  | Syntax errors          |

---

## Quick Reference: Subsystem Overview

| Subsystem      | Primary Guide                                        | Key Logs                            | Health Endpoint               |
| -------------- | ---------------------------------------------------- | ----------------------------------- | ----------------------------- |
| Backend/API    | [Backend Debugging](/operations/debugging-backend)   | `docker logs voiceassist-server`    | `/health`, `/ready`           |
| Frontend/Web   | [Frontend Debugging](/operations/debugging-frontend) | Browser Console, Network Tab        | N/A (static)                  |
| Voice/Realtime | [Voice Debugging](/operations/debugging-voice)       | `docker logs voiceassist-server`    | `/ws` endpoint                |
| Docs Site      | [Docs Site Debugging](/operations/debugging-docs)    | `/var/log/apache2/assistdocs-*.log` | `/agent/index.json`           |
| Infrastructure | [Overview](/operations/debugging-overview)           | `docker logs`, Apache logs          | Docker health, systemd status |

---

## Debugging Guides by Subsystem

### Backend Services

**Primary Guide:** [Backend Debugging](/operations/debugging-backend)

**Key Logs:**

```bash
# API Gateway logs (Docker container)
docker logs voiceassist-server -f

# With error filtering
docker logs voiceassist-server --tail 100 2>&1 | grep -i error
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

**Primary Guide:** [Frontend Debugging](/operations/debugging-frontend)

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

**Primary Guide:** [Voice & Realtime Debugging](/operations/debugging-voice)

**Key Logs:**

```bash
# Voice service logs (Docker container)
docker logs voiceassist-server --since "10m" 2>&1 | grep -i "websocket\|stt\|tts\|voice"
```

**Key Endpoints:**

- Voice Pipeline (T/T): `wss://assist.asimo.io/api/voice/pipeline-ws`
- Chat Streaming: `wss://assist.asimo.io/api/realtime/ws`
- Test tools: `websocat`, `wscat`

**Related Documentation:**

- [Voice Mode Settings Guide](../VOICE_MODE_SETTINGS_GUIDE.md)
- [Voice Ready State](../VOICE_READY_STATE_2025-11-25.md)

---

### Documentation Site

**Primary Guide:** [Docs Site Debugging](/operations/debugging-docs)

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
- `GET /agent/tasks.json` - Common agent tasks
- `GET /agent/schema.json` - JSON Schema for API types
- `GET /search-index.json` - Search index
- `GET /sitemap.xml` - Sitemap

**Related Documentation:**

- [Agent API Reference](../ai/AGENT_API_REFERENCE.md)
- [Agent Onboarding](../ai/AGENT_ONBOARDING.md)

---

### Infrastructure

**Primary Guide:** [Debugging Overview](/operations/debugging-overview)

**Key Services:**

```bash
# Check all major Docker containers
docker ps --filter name=voiceassist

# Check Apache
sudo systemctl status apache2

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
2. Review recent errors: `docker logs voiceassist-server --tail 100 | grep ERROR`
3. Check dependencies: Redis, PostgreSQL, Qdrant
4. Look for trace ID in logs to follow request path

### 2. Frontend Issue Investigation

1. Open Browser DevTools (F12)
2. Check Console for JavaScript errors
3. Check Network tab for failed API calls
4. Verify environment variables

### 3. WebSocket/Voice Issue Investigation

1. Test voice pipeline: `websocat "wss://assist.asimo.io/api/voice/pipeline-ws?token=..."`
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

- [Implementation Status](/ai/status) - Component status overview
- [API Reference](/reference/api) - API endpoint documentation
- [Backend Architecture](/architecture) - System design
- [Service Catalog](../SERVICE_CATALOG.md) - Service inventory
