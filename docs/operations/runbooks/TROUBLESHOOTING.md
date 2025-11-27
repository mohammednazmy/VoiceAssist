---
title: Troubleshooting Runbook
slug: operations/runbooks/troubleshooting
summary: Comprehensive troubleshooting guide for VoiceAssist V2 common issues.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["devops", "backend"]
tags: ["runbook", "troubleshooting", "operations", "debugging"]
relatedServices: ["api-gateway"]
version: "1.0.0"
---

# Troubleshooting Runbook

**Last Updated**: 2025-11-27
**Purpose**: Comprehensive troubleshooting guide for VoiceAssist V2 common issues

---

## Quick Diagnostic Commands

```bash
# Save as: /usr/local/bin/va-diagnose
#!/bin/bash

echo "VoiceAssist Quick Diagnostics - $(date)"
echo "========================================="

# System health
echo -e "\n[1] Service Status:"
docker compose ps

echo -e "\n[2] Health Checks:"
curl -s http://localhost:8000/health | jq '.' || echo "❌ Application not responding"

echo -e "\n[3] Recent Errors (last 5 min):"
docker compose logs --since 5m voiceassist-server 2>&1 | grep -i error | tail -10

echo -e "\n[4] Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo -e "\n[5] Database Connections:"
docker compose exec -T postgres psql -U voiceassist -d voiceassist -t -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;" 2>/dev/null

echo -e "\n[6] Redis Status:"
docker compose exec -T redis redis-cli INFO server | grep -E "(redis_version|uptime_in_seconds)" 2>/dev/null

echo -e "\n[7] Disk Space:"
df -h | grep -E "(Filesystem|/$)"

echo -e "\n========================================="
```

---

## Issues by Symptom

### 1. Application Won't Start

#### Symptom

- Container exits immediately
- Health check fails
- "Connection refused" errors

#### Investigation

```bash
# Check container logs
docker compose logs --tail=100 voiceassist-server

# Check exit code
docker compose ps -a voiceassist-server
# Exit code 0 = normal, 1 = error, 137 = OOM killed, 139 = segfault

# Check if port is already in use
lsof -i :8000

# Verify environment variables
docker compose config | grep -A 20 voiceassist-server

# Check for missing dependencies
docker compose exec voiceassist-server python -c "import sys; print(sys.path)"
```

#### Common Causes & Solutions

**Cause: Missing environment variables**

```bash
# Check required variables
cat .env | grep -E "(DATABASE_URL|REDIS_URL|SECRET_KEY)"

# Copy from example
cp .env.example .env

# Edit with correct values
vim .env

# Restart
docker compose up -d voiceassist-server
```

**Cause: Database not ready**

```bash
# Check PostgreSQL status
docker compose exec postgres pg_isready

# Wait for database
sleep 10

# Try starting again
docker compose up -d voiceassist-server

# Or add depends_on with health check in docker-compose.yml
```

**Cause: Port conflict**

```bash
# Find process using port
lsof -i :8000

# Kill conflicting process
kill -9 <PID>

# Or change application port in docker-compose.yml
ports:
  - "8001:8000"  # Changed from 8000:8000
```

**Cause: Corrupted Python cache**

```bash
# Remove Python cache
docker compose exec voiceassist-server find . -type d -name __pycache__ -exec rm -r {} +
docker compose exec voiceassist-server find . -type f -name "*.pyc" -delete

# Rebuild image
docker compose build --no-cache voiceassist-server
docker compose up -d voiceassist-server
```

---

### 2. Database Connection Issues

#### Symptom

- "Connection pool exhausted"
- "Too many connections"
- "Could not connect to database"
- Slow database queries

#### Investigation

```bash
# Check database is running
docker compose ps postgres
docker compose exec postgres pg_isready

# Check active connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*), state, wait_event_type
   FROM pg_stat_activity
   WHERE datname = 'voiceassist'
   GROUP BY state, wait_event_type;"

# Check connection limit
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SHOW max_connections;"

# Check for connection leaks
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pid, usename, application_name, state, state_change, query
   FROM pg_stat_activity
   WHERE datname = 'voiceassist'
   ORDER BY state_change DESC
   LIMIT 20;"

# Check for locks
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT
     pg_stat_activity.pid,
     pg_stat_activity.query,
     pg_locks.granted
   FROM pg_stat_activity
   JOIN pg_locks ON pg_stat_activity.pid = pg_locks.pid
   WHERE NOT pg_locks.granted
   LIMIT 10;"
```

#### Solutions

**Solution 1: Increase connection pool size**

```bash
# Update .env
cat >> .env <<EOF
DB_POOL_SIZE=30
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
EOF

# Restart application
docker compose restart voiceassist-server

# Verify new pool size
docker compose logs voiceassist-server | grep -i "pool size"
```

**Solution 2: Kill idle connections**

```bash
# Terminate idle connections older than 10 minutes
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'voiceassist'
   AND state = 'idle'
   AND state_change < current_timestamp - INTERVAL '10 minutes';"

# Verify connections reduced
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = 'voiceassist';"
```

**Solution 3: Increase max_connections in PostgreSQL**

```yaml
# Update docker-compose.yml
services:
  postgres:
    command:
      - "postgres"
      - "-c"
      - "max_connections=200" # Increased from 100
```

```bash
# Restart PostgreSQL
docker compose restart postgres

# Verify
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SHOW max_connections;"
```

**Solution 4: Add PgBouncer for connection pooling**

```yaml
# Add to docker-compose.yml
services:
  pgbouncer:
    image: pgbouncer/pgbouncer:latest
    environment:
      DATABASES_HOST: postgres
      DATABASES_PORT: 5432
      DATABASES_USER: voiceassist
      DATABASES_PASSWORD: ${POSTGRES_PASSWORD}
      DATABASES_DBNAME: voiceassist
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 1000
      PGBOUNCER_DEFAULT_POOL_SIZE: 25
    ports:
      - "6432:6432"
```

```bash
# Update DATABASE_URL in .env
DATABASE_URL=postgresql://voiceassist:password@pgbouncer:6432/voiceassist

# Restart
docker compose up -d
```

**Solution 5: Fix connection leaks in code**

```python
# Ensure proper connection cleanup
from contextlib import asynccontextmanager

@asynccontextmanager
async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        await db.close()

# Use context manager
async with get_db() as db:
    result = await db.execute(query)
    # Connection automatically closed
```

---

### 3. High Response Times / Performance Issues

#### Symptom

- API requests taking > 2 seconds
- Timeout errors
- Slow page loads

#### Investigation

```bash
# Check current response times
curl -o /dev/null -s -w "Time: %{time_total}s\n" http://localhost:8000/health

# Check application metrics
curl -s http://localhost:8000/metrics | grep http_request_duration

# Monitor in real-time
watch -n 2 'curl -o /dev/null -s -w "Time: %{time_total}s\n" http://localhost:8000/api/users/me -H "Authorization: Bearer TOKEN"'

# Check for resource constraints
docker stats --no-stream | grep voiceassist

# Identify slow database queries
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
SELECT
    pid,
    now() - query_start as duration,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;
EOF

# Check query statistics
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
SELECT
    substring(query, 1, 100) AS query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
EOF

# Check Redis latency
docker compose exec redis redis-cli --latency

# Check if Redis is slow
docker compose exec redis redis-cli SLOWLOG GET 10
```

#### Solutions

**Solution 1: Add database indexes**

```bash
# Identify missing indexes
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
-- Find tables with sequential scans
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    seq_tup_read / seq_scan as avg_seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;
EOF

# Add recommended indexes
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
-- Common indexes for VoiceAssist
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_id
    ON conversations(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at
    ON messages(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
    ON users(email);

-- Analyze tables
ANALYZE conversations;
ANALYZE messages;
ANALYZE users;
EOF

# Verify index usage
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
EOF
```

**Solution 2: Enable query result caching**

```python
# Implement Redis caching for expensive queries
import redis
import json
import hashlib
from functools import wraps

redis_client = redis.Redis(host='redis', port=6379, decode_responses=True)

def cache_query(ttl=300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"query:{func.__name__}:{hashlib.md5(str(args).encode()).hexdigest()}"

            # Try cache first
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Execute query
            result = await func(*args, **kwargs)

            # Cache result
            redis_client.setex(cache_key, ttl, json.dumps(result))

            return result
        return wrapper
    return decorator

# Usage
@cache_query(ttl=600)
async def get_user_conversations(user_id: int):
    return await db.query(Conversation).filter_by(user_id=user_id).all()
```

**Solution 3: Optimize database queries**

```python
# Use eager loading to avoid N+1 queries
from sqlalchemy.orm import joinedload

# Bad - causes N+1 queries
conversations = db.query(Conversation).all()
for conv in conversations:
    messages = conv.messages  # Separate query for each conversation

# Good - single query with join
conversations = db.query(Conversation)\
    .options(joinedload(Conversation.messages))\
    .all()

# Use select_in_loading for large collections
conversations = db.query(Conversation)\
    .options(selectinload(Conversation.messages))\
    .all()
```

**Solution 4: Scale application horizontally**

```bash
# Add more application instances
docker compose up -d --scale voiceassist-server=3

# Verify instances
docker compose ps voiceassist-server

# Add load balancer (nginx)
# See SCALING.md for details
```

**Solution 5: Increase resource limits**

```yaml
# Update docker-compose.yml
services:
  voiceassist-server:
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 4G
```

```bash
docker compose up -d voiceassist-server
```

---

### 4. Redis Connection Issues

#### Symptom

- "Connection to Redis failed"
- "Redis timeout"
- Cache not working

#### Investigation

```bash
# Check Redis status
docker compose ps redis
docker compose exec redis redis-cli ping

# Check Redis connections
docker compose exec redis redis-cli CLIENT LIST

# Check Redis memory
docker compose exec redis redis-cli INFO memory

# Check Redis logs
docker compose logs --tail=100 redis

# Test connection from application
docker compose exec voiceassist-server python -c "
import redis
r = redis.Redis(host='redis', port=6379)
print(r.ping())
"
```

#### Solutions

**Solution 1: Restart Redis**

```bash
# Restart Redis
docker compose restart redis

# Wait for startup
sleep 5

# Verify
docker compose exec redis redis-cli ping

# Restart application
docker compose restart voiceassist-server
```

**Solution 2: Clear Redis if memory full**

```bash
# Check memory usage
docker compose exec redis redis-cli INFO memory | grep used_memory_human

# Clear all keys (WARNING: destroys cache)
docker compose exec redis redis-cli FLUSHALL

# Or clear specific database
docker compose exec redis redis-cli -n 0 FLUSHDB

# Verify memory freed
docker compose exec redis redis-cli INFO memory | grep used_memory_human
```

**Solution 3: Increase Redis memory limit**

```yaml
# Update docker-compose.yml
services:
  redis:
    command:
      - redis-server
      - --maxmemory 2gb # Increased from 1gb
      - --maxmemory-policy allkeys-lru
```

```bash
docker compose up -d redis
```

**Solution 4: Fix connection string**

```bash
# Verify REDIS_URL in .env
cat .env | grep REDIS_URL

# Should be:
REDIS_URL=redis://redis:6379/0

# Update if wrong
echo "REDIS_URL=redis://redis:6379/0" >> .env

# Restart application
docker compose restart voiceassist-server
```

---

### 5. Service Container Keeps Restarting

#### Symptom

- Container exits and restarts repeatedly
- "Restarting (1) X seconds ago" in docker compose ps

#### Investigation

```bash
# Check restart count
docker inspect voiceassist-voiceassist-server-1 | grep -A 5 RestartCount

# Check exit code
docker compose ps -a voiceassist-server

# Check recent logs
docker compose logs --tail=200 voiceassist-server

# Check health check
docker inspect voiceassist-voiceassist-server-1 | grep -A 20 Health

# Check resource limits
docker stats --no-stream voiceassist-voiceassist-server-1
```

#### Solutions

**Solution 1: OOMKilled (exit code 137)**

```bash
# Verify OOM kill
docker inspect voiceassist-voiceassist-server-1 | grep OOMKilled

# Check memory usage
docker stats --no-stream | grep voiceassist-server

# Increase memory limit
# Update docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 4G  # Increased from 2G

# Restart
docker compose up -d voiceassist-server
```

**Solution 2: Application crash loop**

```bash
# Check for Python errors
docker compose logs voiceassist-server | grep -i "traceback\|error\|exception"

# Common fixes:
# - Fix missing environment variables
# - Fix import errors
# - Fix database connection issues

# Disable auto-restart temporarily to debug
docker update --restart=no voiceassist-voiceassist-server-1

# Check logs without restart interference
docker compose logs -f voiceassist-server
```

**Solution 3: Failed health check**

```bash
# Check health check command
docker inspect voiceassist-voiceassist-server-1 | grep -A 10 Healthcheck

# Test health check manually
docker compose exec voiceassist-server curl -f http://localhost:8000/health

# Increase health check timeout
# Update docker-compose.yml:
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s  # Increased from 5s
  retries: 5    # Increased from 3
  start_period: 60s  # Increased from 40s

# Restart
docker compose up -d voiceassist-server
```

---

### 6. Authentication / JWT Issues

#### Symptom

- "Invalid token" errors
- "Token expired" errors
- Users logged out unexpectedly

#### Investigation

```bash
# Check JWT configuration
cat .env | grep -E "(SECRET_KEY|JWT_)"

# Test token generation
docker compose exec voiceassist-server python -c "
from jose import jwt
from datetime import datetime, timedelta
import os

secret = os.getenv('SECRET_KEY')
payload = {'sub': 'test', 'exp': datetime.utcnow() + timedelta(hours=1)}
token = jwt.encode(payload, secret, algorithm='HS256')
print('Token:', token)

# Decode
decoded = jwt.decode(token, secret, algorithms=['HS256'])
print('Decoded:', decoded)
"

# Check for token in Redis
docker compose exec redis redis-cli KEYS "session:*"
docker compose exec redis redis-cli GET "session:some-session-id"
```

#### Solutions

**Solution 1: SECRET_KEY changed**

```bash
# This invalidates all tokens
# Generate new SECRET_KEY
openssl rand -base64 32

# Update .env
echo "SECRET_KEY=<new-secret>" >> .env

# Restart application
docker compose restart voiceassist-server

# Note: All users will need to log in again
# Clear Redis sessions
docker compose exec redis redis-cli FLUSHDB
```

**Solution 2: Token expiration too short**

```bash
# Update .env
cat >> .env <<EOF
JWT_EXPIRATION_HOURS=24
JWT_REFRESH_EXPIRATION_DAYS=30
EOF

# Restart
docker compose restart voiceassist-server
```

**Solution 3: Clock skew issues**

```bash
# Check system time
date

# Sync time (macOS)
sudo sntp -sS time.apple.com

# Restart Docker
docker compose restart
```

---

### 7. Database Migration Issues

#### Symptom

- "Duplicate column" errors
- "Table already exists" errors
- Migration fails to apply

#### Investigation

```bash
# Check current migration version
docker compose run --rm voiceassist-server alembic current

# Check migration history
docker compose run --rm voiceassist-server alembic history

# Check pending migrations
docker compose run --rm voiceassist-server alembic show head

# Check database schema
docker compose exec postgres psql -U voiceassist -d voiceassist -c "\dt"
docker compose exec postgres psql -U voiceassist -d voiceassist -c "\d users"
```

#### Solutions

**Solution 1: Migration already applied manually**

```bash
# Stamp database with current migration
docker compose run --rm voiceassist-server alembic stamp head

# Verify
docker compose run --rm voiceassist-server alembic current
```

**Solution 2: Conflicting migrations**

```bash
# Check for branches
docker compose run --rm voiceassist-server alembic branches

# Merge branches if needed
docker compose run --rm voiceassist-server alembic merge -m "merge branches" <revision1> <revision2>

# Upgrade to merged revision
docker compose run --rm voiceassist-server alembic upgrade head
```

**Solution 3: Rollback and retry**

```bash
# Downgrade one version
docker compose run --rm voiceassist-server alembic downgrade -1

# Fix migration file
vim app/alembic/versions/<migration-file>.py

# Retry upgrade
docker compose run --rm voiceassist-server alembic upgrade head
```

**Solution 4: Reset migrations (DESTRUCTIVE)**

```bash
# ⚠️  WARNING: This will destroy all data!

# Backup first
docker compose exec postgres pg_dump -U voiceassist voiceassist > backup.sql

# Drop and recreate database
docker compose exec postgres psql -U voiceassist -d postgres <<EOF
DROP DATABASE voiceassist;
CREATE DATABASE voiceassist OWNER voiceassist;
EOF

# Run all migrations
docker compose run --rm voiceassist-server alembic upgrade head

# Verify
docker compose run --rm voiceassist-server alembic current
```

---

### 8. Disk Space Issues

#### Symptom

- "No space left on device"
- Services failing to start
- Logs not writing

#### Investigation

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Find large files
du -sh /var/lib/docker/*
du -sh ~/Library/Containers/com.docker.docker/Data/*

# Check logs size
docker compose logs voiceassist-server | wc -c

# Find large Docker objects
docker image ls --format "{{.Repository}}:{{.Tag}}\t{{.Size}}"
docker volume ls
docker ps -a --format "{{.Names}}\t{{.Size}}"
```

#### Solutions

**Solution 1: Clean up Docker**

```bash
# Remove unused containers
docker container prune -f

# Remove unused images
docker image prune -a -f

# Remove unused volumes
docker volume prune -f

# Remove unused networks
docker network prune -f

# Or clean everything (⚠️  stops all containers)
docker system prune -a --volumes -f

# Check space freed
docker system df
```

**Solution 2: Clean up old backups**

```bash
# Remove old backups (keep last 7 days)
find /backups/postgres/daily -name "*.dump.gz" -mtime +7 -delete
find /backups/redis -name "*.rdb" -mtime +7 -delete
find /backups/qdrant -name "*.snapshot" -mtime +14 -delete

# Check backup directory size
du -sh /backups/*
```

**Solution 3: Configure log rotation**

```json
// Create /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
# Restart Docker daemon
sudo systemctl restart docker

# Or on macOS, restart Docker Desktop
```

**Solution 4: Clear application logs**

```bash
# Clear Docker logs for specific container
truncate -s 0 $(docker inspect --format='{{.LogPath}}' voiceassist-voiceassist-server-1)

# Remove old log files
find /var/log -name "*.log" -mtime +30 -delete
```

---

### 9. Network Connectivity Issues

#### Symptom

- "Connection refused"
- "Host unreachable"
- Containers can't communicate

#### Investigation

```bash
# Check Docker networks
docker network ls
docker network inspect voiceassist_default

# Test connectivity between containers
docker compose exec voiceassist-server ping -c 3 postgres
docker compose exec voiceassist-server ping -c 3 redis
docker compose exec voiceassist-server ping -c 3 qdrant

# Check DNS resolution
docker compose exec voiceassist-server nslookup postgres
docker compose exec voiceassist-server getent hosts postgres

# Check if ports are exposed
docker compose ps
docker port voiceassist-voiceassist-server-1

# Test from host
curl http://localhost:8000/health
telnet localhost 8000
```

#### Solutions

**Solution 1: Recreate network**

```bash
# Stop all services
docker compose down

# Remove network
docker network rm voiceassist_default

# Recreate everything
docker compose up -d

# Verify network
docker network inspect voiceassist_default
```

**Solution 2: Fix DNS issues**

```yaml
# Add to docker-compose.yml
services:
  voiceassist-server:
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

```bash
docker compose up -d voiceassist-server
```

**Solution 3: Use explicit links**

```yaml
# Add to docker-compose.yml (if needed)
services:
  voiceassist-server:
    links:
      - postgres:postgres
      - redis:redis
      - qdrant:qdrant
```

**Solution 4: Check firewall**

```bash
# macOS - check if firewall is blocking Docker
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Temporarily disable for testing
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

# Re-enable after testing
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
```

---

### 10. Qdrant Vector Search Issues

#### Symptom

- "Collection not found"
- "Vector dimension mismatch"
- Slow search results

#### Investigation

```bash
# Check Qdrant status
curl -s http://localhost:6333/healthz

# List collections
curl -s http://localhost:6333/collections | jq '.'

# Get collection info
curl -s http://localhost:6333/collections/voice_embeddings | jq '.'

# Check collection size
curl -s http://localhost:6333/collections/voice_embeddings | jq '.result.points_count'

# Check Qdrant logs
docker compose logs --tail=100 qdrant
```

#### Solutions

**Solution 1: Create missing collection**

```bash
# Create collection
curl -X PUT http://localhost:6333/collections/voice_embeddings \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'

# Verify creation
curl -s http://localhost:6333/collections/voice_embeddings | jq '.result.status'
```

**Solution 2: Fix dimension mismatch**

```bash
# Delete and recreate collection with correct dimensions
curl -X DELETE http://localhost:6333/collections/voice_embeddings

curl -X PUT http://localhost:6333/collections/voice_embeddings \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 384,  # Match your embedding model
      "distance": "Cosine"
    }
  }'
```

**Solution 3: Optimize collection for performance**

```bash
# Create index
curl -X POST http://localhost:6333/collections/voice_embeddings/index \
  -H 'Content-Type: application/json' \
  -d '{
    "field_name": "text",
    "field_schema": "keyword"
  }'

# Optimize collection
curl -X POST http://localhost:6333/collections/voice_embeddings/optimizer
```

**Solution 4: Clear and reindex**

```bash
# Delete all points
curl -X POST http://localhost:6333/collections/voice_embeddings/points/delete \
  -H 'Content-Type: application/json' \
  -d '{
    "filter": {}
  }'

# Trigger reindexing from application
# (Application-specific code to rebuild vectors)
```

---

## Troubleshooting Checklist

### Before Escalating

- [ ] Checked recent logs (5-15 minutes)
- [ ] Verified all services are running
- [ ] Checked system resources (CPU, memory, disk)
- [ ] Reviewed recent changes (deployments, config)
- [ ] Attempted restart of affected service
- [ ] Checked for known issues in documentation
- [ ] Verified network connectivity
- [ ] Checked monitoring dashboards
- [ ] Documented symptoms and attempted solutions

### Information to Collect for Escalation

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-collect-debug-info

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="/tmp/voiceassist-debug-${TIMESTAMP}"

mkdir -p $OUTPUT_DIR

echo "Collecting debug information..."

# System info
uname -a > $OUTPUT_DIR/system-info.txt
docker version >> $OUTPUT_DIR/system-info.txt
docker compose version >> $OUTPUT_DIR/system-info.txt

# Service status
docker compose ps > $OUTPUT_DIR/service-status.txt

# Logs
docker compose logs --tail=500 > $OUTPUT_DIR/all-logs.txt
docker compose logs --tail=500 voiceassist-server > $OUTPUT_DIR/app-logs.txt
docker compose logs --tail=200 postgres > $OUTPUT_DIR/postgres-logs.txt
docker compose logs --tail=200 redis > $OUTPUT_DIR/redis-logs.txt

# Configuration
docker compose config > $OUTPUT_DIR/docker-compose-config.yml
cp .env $OUTPUT_DIR/env-sanitized.txt
sed -i '' 's/=.*/=REDACTED/g' $OUTPUT_DIR/env-sanitized.txt

# Resource usage
docker stats --no-stream > $OUTPUT_DIR/resource-usage.txt
df -h > $OUTPUT_DIR/disk-usage.txt

# Network
docker network ls > $OUTPUT_DIR/networks.txt
docker network inspect voiceassist_default > $OUTPUT_DIR/network-inspect.json

# Database state
docker compose exec -T postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;" \
  > $OUTPUT_DIR/db-connections.txt

# Create archive
tar -czf voiceassist-debug-${TIMESTAMP}.tar.gz -C /tmp voiceassist-debug-${TIMESTAMP}

echo "Debug information collected: voiceassist-debug-${TIMESTAMP}.tar.gz"
echo "Please attach this file when escalating the issue"
```

---

## Common Error Messages

### Error: "bind: address already in use"

**Solution:**

```bash
# Find and kill process using the port
lsof -i :8000
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Error: "ERROR: could not find an available, non-overlapping IPv4 address pool"

**Solution:**

```bash
# Clean up unused networks
docker network prune

# Or specify custom network in docker-compose.yml
networks:
  default:
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

### Error: "ERROR: Service 'X' failed to build"

**Solution:**

```bash
# Clean Docker build cache
docker builder prune -a -f

# Rebuild with no cache
docker compose build --no-cache

# Check Dockerfile syntax
docker compose config
```

### Error: "sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) FATAL: password authentication failed"

**Solution:**

```bash
# Verify credentials in .env
cat .env | grep -E "(POSTGRES_USER|POSTGRES_PASSWORD)"

# Reset password
docker compose exec postgres psql -U postgres -c \
  "ALTER USER voiceassist WITH PASSWORD 'new_password';"

# Update .env
vim .env

# Restart application
docker compose restart voiceassist-server
```

### Error: "redis.exceptions.ConnectionError: Error connecting to redis"

**Solution:**

```bash
# Check Redis is running
docker compose ps redis

# Check Redis URL in .env
cat .env | grep REDIS_URL

# Test connection
docker compose exec redis redis-cli ping

# Restart Redis and app
docker compose restart redis voiceassist-server
```

---

## Performance Tuning Quick Wins

```bash
# 1. Add database indexes
docker compose exec postgres psql -U voiceassist -d voiceassist -f - <<EOF
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
ANALYZE;
EOF

# 2. Increase connection pool
echo "DB_POOL_SIZE=30" >> .env
echo "DB_MAX_OVERFLOW=10" >> .env

# 3. Enable Redis caching
echo "CACHE_ENABLED=true" >> .env
echo "CACHE_TTL=300" >> .env

# 4. Increase worker count
# For 4 CPU cores: workers = (2 x 4) + 1 = 9
echo "GUNICORN_WORKERS=9" >> .env

# 5. Optimize PostgreSQL settings
# See SCALING.md for detailed configuration

# Restart to apply changes
docker compose restart
```

---

## Related Documentation

- [Incident Response Runbook](./INCIDENT_RESPONSE.md)
- [Deployment Runbook](./DEPLOYMENT.md)
- [Monitoring Runbook](./MONITORING.md)
- [Scaling Runbook](./SCALING.md)
- [Backup & Restore Runbook](./BACKUP_RESTORE.md)
- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)
- [CONNECTION_POOL_OPTIMIZATION.md](../CONNECTION_POOL_OPTIMIZATION.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Monthly or after each major incident
**Next Review**: 2025-12-21
