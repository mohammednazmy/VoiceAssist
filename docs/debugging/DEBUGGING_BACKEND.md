---
title: Backend Debugging Guide
slug: debugging/backend
summary: "Debug API Gateway, database, cache, and backend services in VoiceAssist."
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience:
  - human
  - agent
  - ai-agents
  - backend
  - sre
tags:
  - debugging
  - runbook
  - backend
  - api-gateway
  - database
  - troubleshooting
relatedServices:
  - api-gateway
category: debugging
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/main.py"
  - "services/api-gateway/app/core/database.py"
  - "services/api-gateway/app/core/config.py"
  - "services/api-gateway/app/api/health.py"
version: 1.0.0
ai_summary: >-
  Last Updated: 2025-11-27 Component: services/api-gateway/ --- Likely Causes: -
  Unhandled exception in request handler - Database connection timeout - Missing
  required environment variable - External service failure (OpenAI, Qdrant)
  Steps to Investigate: 1. Check API Gateway logs (Docker container...
---

# Backend Debugging Guide

**Last Updated:** 2025-11-27
**Component:** `services/api-gateway/`

---

## Symptoms

### 500 Internal Server Error

**Likely Causes:**

- Unhandled exception in request handler
- Database connection timeout
- Missing required environment variable
- External service failure (OpenAI, Qdrant)

**Steps to Investigate:**

1. Check API Gateway logs (Docker container):

```bash
docker logs voiceassist-server --tail 100 2>&1 | grep -i error
```

2. Look for stack traces:

```bash
docker logs voiceassist-server --since "10m" 2>&1 | grep -A 20 "Traceback"
```

3. Check health endpoints:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

4. Verify environment variables:

```bash
# Check if critical vars are set in .env (from project root)
grep -E "DATABASE_URL|REDIS_URL|OPENAI_API_KEY" .env
```

**Relevant Logs:**

- `docker logs voiceassist-server`
- Structured JSON logs with `trace_id`

**Relevant Code Paths:**

- `services/api-gateway/app/main.py` - Exception handlers
- `services/api-gateway/app/core/exceptions.py` - Custom exceptions
- `services/api-gateway/app/api/*.py` - Route handlers

---

### 401 Unauthorized

**Likely Causes:**

- JWT token expired
- Token missing from request
- Token signed with wrong key
- User revoked or deactivated

**Steps to Investigate:**

1. Decode the JWT (without verifying):

```bash
# Extract token from Authorization header
echo "YOUR_JWT_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .
```

2. Check token expiration:

```bash
# Look at 'exp' claim - Unix timestamp
```

3. Verify JWT secret matches:

```bash
# Compare JWT_SECRET_KEY in env with what was used to sign
```

4. Check if user is active:

```sql
SELECT id, email, is_active FROM users WHERE id = 'USER_ID';
```

**Relevant Code Paths:**

- `services/api-gateway/app/core/security.py` - JWT verification
- `services/api-gateway/app/core/dependencies.py` - Auth dependencies

---

### 503 Service Unavailable

**Likely Causes:**

- Database connection pool exhausted
- Redis not responding
- Qdrant vector store down
- External API rate limited

**Steps to Investigate:**

1. Check database connectivity:

```bash
# PostgreSQL
psql -h localhost -U voiceassist -d voiceassist -c "SELECT 1"

# Check connection count
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'voiceassist'"
```

2. Check Redis:

```bash
redis-cli ping
redis-cli info clients
```

3. Check Qdrant:

```bash
curl http://localhost:6333/collections
```

4. Check API Gateway connection pool:

```bash
curl http://localhost:8000/metrics | grep "db_connection"
```

**Relevant Code Paths:**

- `services/api-gateway/app/core/database.py` - DB connection
- `services/api-gateway/app/services/cache_service.py` - Redis
- `services/api-gateway/app/services/vector_store_service.py` - Qdrant

---

## Database Issues

### Connection Pool Exhaustion

**Symptoms:**

- Requests hanging
- Timeout errors
- "too many connections" in logs

**Investigation:**

```bash
# Check active connections
psql -c "SELECT count(*), state FROM pg_stat_activity WHERE datname = 'voiceassist' GROUP BY state"

# Find long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE datname = 'voiceassist' AND state != 'idle' ORDER BY duration DESC"

# Kill stuck query if needed
psql -c "SELECT pg_terminate_backend(PID)"
```

**Fix:**

- Increase `pool_size` in database config
- Add connection timeout
- Check for leaked connections in code

### Migration Issues

```bash
# Check current migration version
cd services/api-gateway
alembic current

# Check migration history
alembic history

# Run pending migrations
alembic upgrade head

# Rollback if needed
alembic downgrade -1
```

---

## Cache Issues

### Redis Not Responding

**Symptoms:**

- Cache misses everywhere
- Slower response times
- Session lookup failures

**Investigation:**

```bash
# Check Redis status
sudo systemctl status redis-server
redis-cli ping

# Check memory
redis-cli info memory

# Check connected clients
redis-cli client list

# Check slow log
redis-cli slowlog get 10
```

**Relevant Code Paths:**

- `services/api-gateway/app/services/cache_service.py`
- `services/api-gateway/app/core/config.py` - REDIS_URL

---

## OpenAI API Issues

### Rate Limiting / Quota Exceeded

**Symptoms:**

- 429 errors from OpenAI
- Empty AI responses
- Timeout waiting for completion

**Investigation:**

1. Check recent OpenAI calls:

```bash
docker logs voiceassist-server --since "1h" 2>&1 | grep -i "openai\|rate\|429"
```

2. Check API key validity:

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

3. Check usage dashboard: https://platform.openai.com/usage

**Relevant Code Paths:**

- `services/api-gateway/app/services/llm_client.py`
- `services/api-gateway/app/core/config.py` - OPENAI_API_KEY

---

## RAG Pipeline Issues

### Poor Search Results

**Symptoms:**

- Irrelevant document retrieval
- Empty results for valid queries
- Low confidence scores

**Investigation:**

1. Check vector store health:

```bash
curl http://localhost:6333/collections/medical_docs
```

2. Test embedding generation:

```python
# In Python shell
from app.services.embedding_service import EmbeddingService
svc = EmbeddingService()
embedding = await svc.embed_text("test query")
print(len(embedding))  # Should be 1536 for OpenAI ada-002
```

3. Check document count:

```bash
curl http://localhost:6333/collections/medical_docs | jq '.result.points_count'
```

**Relevant Code Paths:**

- `services/api-gateway/app/services/rag_service.py`
- `services/api-gateway/app/services/embedding_service.py`
- `services/api-gateway/app/services/vector_store_service.py`

---

## Metrics to Monitor

| Metric                            | Normal Range | Alert Threshold |
| --------------------------------- | ------------ | --------------- |
| `http_request_duration_seconds`   | < 500ms      | > 2s            |
| `db_connection_pool_size`         | 5-20         | > 80% used      |
| `http_requests_total{status=5xx}` | 0            | > 10/min        |
| `redis_connection_errors`         | 0            | > 0             |

---

## Related Documentation

- [Debugging Overview](./DEBUGGING_OVERVIEW.md)
- [Backend Architecture](../BACKEND_ARCHITECTURE.md)
- [API Reference](../API_REFERENCE.md)
