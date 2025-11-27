---
title: "Connection Pool Optimization"
slug: "operations/connection-pool-optimization"
summary: "**Last Updated**: 2025-11-20 (Phase 7 - P2.5)"
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["connection", "pool", "optimization"]
---

# Connection Pool Optimization Guide

**Last Updated**: 2025-11-20 (Phase 7 - P2.5)
**Purpose**: Guide for optimizing and monitoring database connection pools

---

## Overview

VoiceAssist V2 uses connection pooling for efficient database resource management. This document covers configuration, monitoring, and optimization of connection pools for PostgreSQL, Redis, and Qdrant.

---

## PostgreSQL Connection Pool

### Configuration

**Location**: `app/core/database.py`

**Environment Variables**:

```bash
# Connection Pool Configuration (Phase 7 - P2.5)
DB_POOL_SIZE=20              # Base pool size (default: 20)
DB_MAX_OVERFLOW=40           # Max overflow connections (default: 40)
DB_POOL_RECYCLE=3600         # Recycle connections after N seconds (default: 1 hour)
DB_POOL_TIMEOUT=30           # Connection timeout in seconds (default: 30)
```

**Pool Behavior**:

1. **pool_size (20)**: Base number of connections maintained
2. **max_overflow (40)**: Additional connections allowed beyond pool_size
3. **Total capacity**: `pool_size + max_overflow = 60` connections
4. **pool_recycle (3600s)**: Connections are recycled after 1 hour to prevent stale connections
5. **pool_timeout (30s)**: Max wait time for a connection before raising an error
6. **pool_pre_ping (True)**: Validates connections before use (prevents "MySQL server has gone away" errors)

### Monitoring

**Prometheus Metrics** (exposed at `/metrics`):

- `voiceassist_db_pool_size` - Configured pool size
- `voiceassist_db_pool_checked_out` - Connections currently in use
- `voiceassist_db_pool_checked_in` - Idle connections available
- `voiceassist_db_pool_overflow` - Overflow connections beyond pool_size
- `voiceassist_db_pool_utilization_percent` - Pool utilization percentage (0-100%)

**Example Prometheus Queries**:

```promql
# Current pool utilization
voiceassist_db_pool_utilization_percent

# Connections checked out over time
rate(voiceassist_db_pool_checked_out[5m])

# Peak overflow usage (indicates need for larger pool_size)
max_over_time(voiceassist_db_pool_overflow[1h])
```

###Optimization Recommendations

#### Low Traffic (< 10 concurrent users)

```bash
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```

#### Medium Traffic (10-50 concurrent users)

```bash
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=40
```

#### High Traffic (50-100 concurrent users)

```bash
DB_POOL_SIZE=30
DB_MAX_OVERFLOW=70
```

#### Very High Traffic (100+ concurrent users)

```bash
DB_POOL_SIZE=50
DB_MAX_OVERFLOW=100
# Consider PgBouncer for connection pooling at this scale
```

### Troubleshooting

**Symptom**: `TimeoutError: QueuePool limit of size X overflow X reached`

**Cause**: Pool exhausted, all connections in use

**Solutions**:

1. Increase `DB_POOL_SIZE` or `DB_MAX_OVERFLOW`
2. Reduce query execution time (optimize slow queries)
3. Check for connection leaks (connections not closed)
4. Implement PgBouncer for connection pooling

**Symptom**: High connection churn (many connections created/destroyed)

**Cause**: Pool too small for workload

**Solutions**:

1. Increase `DB_POOL_SIZE` to accommodate peak load
2. Monitor `db_pool_overflow` metric for frequent spikes

**Symptom**: `OperationalError: server closed the connection unexpectedly`

**Cause**: Stale connections (server closed idle connections)

**Solutions**:

1. Reduce `DB_POOL_RECYCLE` (currently 3600s)
2. Enable `pool_pre_ping=True` (already enabled)

---

## Redis Connection Pool

### Configuration

**Location**: `app/core/database.py`

**Environment Variables**:

```bash
# Redis Connection Pool Configuration (Phase 7 - P2.5)
REDIS_MAX_CONNECTIONS=50     # Max connections in pool (default: 50)
REDIS_CONNECT_TIMEOUT=5      # Connection timeout in seconds (default: 5)
REDIS_HEALTH_CHECK_INTERVAL=30  # Health check interval in seconds (default: 30)
```

**Pool Features**:

1. **max_connections (50)**: Maximum connections to Redis
2. **socket_keepalive (True)**: Keeps connections alive with TCP keepalive
3. **health_check_interval (30s)**: Periodic health checks for idle connections
4. **decode_responses (True)**: Automatically decode byte responses to strings

### Monitoring

**Prometheus Metrics**:

- `voiceassist_redis_pool_max_connections` - Configured max connections
- `voiceassist_redis_pool_in_use` - Connections currently in use
- `voiceassist_redis_pool_available` - Available connections in pool

**Example Prometheus Queries**:

```promql
# Redis pool utilization
(voiceassist_redis_pool_in_use / voiceassist_redis_pool_max_connections) * 100

# Connections in use over time
rate(voiceassist_redis_pool_in_use[5m])
```

### Optimization Recommendations

#### Low Traffic

```bash
REDIS_MAX_CONNECTIONS=25
```

#### Medium Traffic

```bash
REDIS_MAX_CONNECTIONS=50
```

#### High Traffic

```bash
REDIS_MAX_CONNECTIONS=100
```

### Troubleshooting

**Symptom**: `ConnectionError: Too many connections`

**Cause**: Redis `maxclients` limit reached or pool exhausted

**Solutions**:

1. Increase `REDIS_MAX_CONNECTIONS`
2. Check Redis `maxclients` configuration (`redis-cli CONFIG GET maxclients`)
3. Optimize Redis usage (reduce unnecessary calls)

**Symptom**: Slow Redis operations

**Cause**: Connection timeout or network latency

**Solutions**:

1. Increase `REDIS_CONNECT_TIMEOUT` if network is slow
2. Check Redis server performance (`redis-cli INFO stats`)
3. Monitor network latency between application and Redis

---

## Qdrant Connection Pool

### Configuration

**Location**: `app/core/database.py`

**Configuration**:

```python
qdrant_client = AsyncQdrantClient(
    host=settings.QDRANT_HOST,
    port=settings.QDRANT_PORT,
    timeout=10,            # Request timeout (10 seconds)
    grpc_port=6334,        # gRPC port for better performance
    prefer_grpc=True,      # Use gRPC instead of HTTP for performance
)
```

**Features**:

1. **Async Client**: Non-blocking I/O for concurrent requests
2. **gRPC Protocol**: Higher performance than HTTP (preferred when available)
3. **Timeout (10s)**: Request timeout for vector search operations

### Monitoring

**No dedicated connection pool metrics** (Qdrant uses async HTTP/gRPC, not traditional connection pooling)

**Monitor via**:

- Request latency: `voiceassist_rag_query_duration_seconds{stage="search"}`
- External API calls: `voiceassist_external_api_duration_seconds{service="qdrant"}`

### Optimization Recommendations

- **Timeout**: Increase if complex searches take > 10s
- **gRPC**: Always prefer gRPC for production (10-30% faster than HTTP)
- **Qdrant Server**: Ensure Qdrant has adequate CPU/memory for large collections

---

## Best Practices

### General Principles

1. **Monitor First**: Establish baseline metrics before tuning
2. **Incremental Changes**: Adjust pool sizes gradually (+/- 20% at a time)
3. **Test Under Load**: Use load testing to validate changes
4. **Document Changes**: Record pool size changes and performance impact

### Health Checks

**Readiness Probe** (`GET /ready`):

- Checks PostgreSQL connection
- Checks Redis connection
- Checks Qdrant connection
- Returns 503 if any dependency is down

**Health Dashboard** (Grafana):

- Monitor pool utilization over time
- Set alerts for high utilization (> 80%)
- Track connection errors

### Alerting

**Recommended Prometheus Alerts**:

```yaml
# PostgreSQL Pool Exhaustion
- alert: PostgreSQLPoolHighUtilization
  expr: voiceassist_db_pool_utilization_percent > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "PostgreSQL connection pool utilization above 80%"

# Redis Pool Exhaustion
- alert: RedisPoolHighUtilization
  expr: (voiceassist_redis_pool_in_use / voiceassist_redis_pool_max_connections) * 100 > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Redis connection pool utilization above 80%"
```

---

## Production Deployment

### PgBouncer (Recommended for > 100 concurrent users)

**Why**: PgBouncer provides lightweight connection pooling at the database proxy level

**Benefits**:

- Thousands of client connections with minimal resource overhead
- Transaction-level pooling (connections shared between transactions)
- Connection pooling across multiple application instances

**Configuration** (`docker-compose.yml`):

```yaml
pgbouncer:
  image: edoburu/pgbouncer:latest
  environment:
    - DATABASE_URL=postgres://voiceassist:password@postgres:5432/voiceassist
    - POOL_MODE=transaction
    - MAX_CLIENT_CONN=1000
    - DEFAULT_POOL_SIZE=20
  ports:
    - "6432:5432"
```

**Application Configuration**:

```bash
# Connect to PgBouncer instead of PostgreSQL directly
DATABASE_URL=postgresql://voiceassist:password@pgbouncer:6432/voiceassist

# Reduce application pool size (PgBouncer handles pooling)
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=10
```

### Redis Cluster (For High Availability)

For production with > 100 concurrent users, consider Redis Cluster or Redis Sentinel for:

- Automatic failover
- Read replicas for load distribution
- Data persistence with snapshots/AOF

---

## Debugging Tools

### PostgreSQL

**Check active connections**:

```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
```

**Check idle connections**:

```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'idle';
```

**Check long-running queries**:

```sql
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;
```

### Redis

**Check connection count**:

```bash
redis-cli INFO clients | grep connected_clients
```

**Check memory usage**:

```bash
redis-cli INFO memory | grep used_memory_human
```

### Application Logs

**Enable pool logging** (development only):

```bash
DEBUG=true  # Enables echo_pool=True in database.py
```

This logs all connection pool events (checkout, checkin, overflow).

---

## Related Documentation

- [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - System architecture
- [SLO_DEFINITIONS.md](SLO_DEFINITIONS.md) - Service level objectives
- [OBSERVABILITY.md](../OBSERVABILITY.md) - Monitoring patterns

---

**Document Version**: 1.0
**Last Updated**: 2025-11-20
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Quarterly or after major traffic changes
