# VoiceAssist Performance Tuning Guide

## Overview

This comprehensive guide provides strategies, techniques, and best practices for optimizing VoiceAssist performance. Use this guide to identify bottlenecks, implement optimizations, and maintain peak system performance.

## Table of Contents

- [Performance Philosophy](#performance-philosophy)
- [Database Optimization](#database-optimization)
- [Caching Strategy](#caching-strategy)
- [Kubernetes Resource Tuning](#kubernetes-resource-tuning)
- [HPA Threshold Tuning](#hpa-threshold-tuning)
- [Application-Level Optimizations](#application-level-optimizations)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Common Bottlenecks](#common-bottlenecks)

---

## Performance Philosophy

### Principles

1. **Measure First, Optimize Second**
   - Never optimize without data
   - Establish baselines before changes
   - Use profiling tools
   - A/B test optimizations

2. **Focus on Bottlenecks**
   - Identify the slowest component
   - 80/20 rule: Focus on biggest impact
   - Don't optimize prematurely
   - Avoid micro-optimizations

3. **Balance Trade-offs**
   - Performance vs Complexity
   - Cost vs Speed
   - Consistency vs Availability
   - Developer time vs Runtime performance

4. **Iterate and Validate**
   - Make one change at a time
   - Test thoroughly
   - Monitor impact
   - Roll back if needed

### Performance Optimization Workflow

```
1. Identify Issue
   ├─> Monitor metrics
   ├─> User reports
   └─> Load test results

2. Measure & Profile
   ├─> Collect baseline data
   ├─> Identify bottleneck
   └─> Understand root cause

3. Hypothesis
   ├─> Propose solution
   ├─> Estimate impact
   └─> Consider alternatives

4. Implement
   ├─> Make targeted change
   ├─> Keep it simple
   └─> Document reasoning

5. Validate
   ├─> Run load tests
   ├─> Compare metrics
   └─> Verify improvement

6. Deploy & Monitor
   ├─> Gradual rollout
   ├─> Watch dashboards
   └─> Gather feedback
```

---

## Database Optimization

### Query Optimization Checklist

#### 1. Identify Slow Queries

**Tools**:
```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time,
  stddev_time
FROM pg_stat_statements
WHERE mean_time > 100  -- Over 100ms average
ORDER BY mean_time DESC
LIMIT 20;

-- Find most frequent queries
SELECT
  query,
  calls,
  mean_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

**VoiceAssist-Specific**:
```bash
# Check slow query log
kubectl exec -it postgres-0 -n voiceassist -- \
  tail -100 /var/log/postgresql/postgresql-slow.log

# Query Prometheus for slow queries
curl -g 'http://prometheus:9090/api/v1/query?query=voiceassist_db_slow_queries_total'
```

#### 2. Add Missing Indexes

**Common Patterns**:

```sql
-- Foreign key columns (if not already indexed)
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- Frequently filtered columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- Composite indexes for common query patterns
CREATE INDEX idx_messages_conversation_timestamp
  ON messages(conversation_id, timestamp);

CREATE INDEX idx_conversations_user_created
  ON conversations(user_id, created_at);

-- Partial indexes for filtered queries
CREATE INDEX idx_active_users
  ON users(id)
  WHERE is_active = true;

CREATE INDEX idx_recent_conversations
  ON conversations(id, created_at)
  WHERE created_at > NOW() - INTERVAL '30 days';

-- Full-text search indexes
CREATE INDEX idx_documents_fts
  ON documents
  USING gin(to_tsvector('english', content));
```

**Index Analysis**:
```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Find unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey';

-- Check index size
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

#### 3. Optimize Query Structure

**N+1 Query Problem**:

**Bad** (N+1 queries):
```python
# Fetches users, then queries conversations for each user
users = session.query(User).all()
for user in users:
    # N additional queries
    conversations = session.query(Conversation)\
        .filter_by(user_id=user.id)\
        .all()
```

**Good** (Single query with JOIN):
```python
# Single query with eager loading
users = session.query(User)\
    .options(joinedload(User.conversations))\
    .all()

# Or using explicit JOIN
results = session.query(User, Conversation)\
    .join(Conversation, User.id == Conversation.user_id)\
    .all()
```

**VoiceAssist Implementation**:
```python
# In server/models/user.py
class User(Base):
    __tablename__ = "users"

    # Enable relationship eager loading
    conversations = relationship(
        "Conversation",
        back_populates="user",
        lazy="selectin"  # or "joined" for INNER JOIN
    )

# In API endpoint
@router.get("/users/{user_id}/conversations")
async def get_user_conversations(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User)\
        .options(joinedload(User.conversations))\
        .filter(User.id == user_id)\
        .first()
    return user.conversations
```

**Pagination**:

**Bad** (Loads all results):
```python
conversations = session.query(Conversation)\
    .filter(Conversation.user_id == user_id)\
    .all()
```

**Good** (Paginated):
```python
def get_conversations_paginated(user_id: int, page: int = 1, per_page: int = 20):
    offset = (page - 1) * per_page
    conversations = session.query(Conversation)\
        .filter(Conversation.user_id == user_id)\
        .order_by(Conversation.created_at.desc())\
        .limit(per_page)\
        .offset(offset)\
        .all()

    total = session.query(func.count(Conversation.id))\
        .filter(Conversation.user_id == user_id)\
        .scalar()

    return {
        "items": conversations,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": (total + per_page - 1) // per_page
    }
```

**Query Result Caching**:

```python
from functools import lru_cache
import hashlib
import json

def cache_key(user_id: int, filters: dict) -> str:
    """Generate cache key from query parameters."""
    key_data = {"user_id": user_id, "filters": filters}
    return f"query:{hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()}"

async def get_conversations_cached(
    user_id: int,
    filters: dict,
    db: Session,
    cache: Redis
):
    """Get conversations with Redis caching."""
    key = cache_key(user_id, filters)

    # Check cache
    cached = await cache.get(key)
    if cached:
        return json.loads(cached)

    # Query database
    conversations = db.query(Conversation)\
        .filter(Conversation.user_id == user_id)\
        .all()

    result = [c.to_dict() for c in conversations]

    # Cache result (5 minutes)
    await cache.setex(key, 300, json.dumps(result))

    return result
```

#### 4. Connection Pool Tuning

**Current Configuration** (`server/database.py`):

```python
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,          # Core connections
    max_overflow=10,       # Additional connections (total: 30)
    pool_timeout=30,       # Wait time for connection (seconds)
    pool_recycle=3600,     # Recycle connections after 1 hour
    pool_pre_ping=True,    # Verify connections before use
    echo=False,            # Don't log SQL (performance)
)
```

**Tuning Guidelines**:

| Scenario | pool_size | max_overflow | Total | Notes |
|----------|-----------|--------------|-------|-------|
| **Light Load** (<50 users) | 10 | 5 | 15 | Minimal resources |
| **Normal Load** (50-100 users) | 20 | 10 | 30 | Current setting |
| **Heavy Load** (100-200 users) | 30 | 20 | 50 | Increase pool |
| **Peak Load** (200+ users) | 40 | 30 | 70 | May need replicas |

**Monitoring**:
```python
# Add to server/monitoring/metrics.py
from prometheus_client import Gauge

db_pool_size = Gauge('voiceassist_db_pool_size', 'Database pool size')
db_pool_checked_out = Gauge('voiceassist_db_pool_checked_out', 'Checked out connections')
db_pool_overflow = Gauge('voiceassist_db_pool_overflow', 'Overflow connections')
db_pool_utilization = Gauge('voiceassist_db_pool_utilization_percent', 'Pool utilization %')

def update_pool_metrics():
    """Update connection pool metrics."""
    pool = engine.pool
    db_pool_size.set(pool.size())
    db_pool_checked_out.set(pool.checkedout())
    db_pool_overflow.set(pool.overflow())

    total = pool.size() + pool.overflow()
    used = pool.checkedout()
    db_pool_utilization.set((used / total * 100) if total > 0 else 0)
```

#### 5. Database Maintenance

**Regular Tasks**:

```sql
-- Analyze tables (update statistics)
ANALYZE users;
ANALYZE conversations;
ANALYZE messages;
ANALYZE documents;

-- Vacuum (reclaim space)
VACUUM ANALYZE users;
VACUUM ANALYZE conversations;

-- Reindex (rebuild indexes)
REINDEX TABLE users;
REINDEX TABLE conversations;

-- Check bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS external_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Automated Script** (`scripts/db-maintenance.sh`):

```bash
#!/bin/bash
# Daily database maintenance

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-voiceassist}"
PGUSER="${PGUSER:-postgres}"

echo "=== Starting database maintenance ==="
echo "Date: $(date)"

# Analyze all tables
echo "Running ANALYZE..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "ANALYZE;"

# Vacuum (non-blocking)
echo "Running VACUUM..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "VACUUM (ANALYZE, VERBOSE);"

# Check for bloat
echo "Checking for bloat..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" << EOF
SELECT
  schemaname || '.' || tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
EOF

echo "=== Maintenance complete ==="
```

**CronJob** (`k8s/cronjobs/db-maintenance.yaml`):

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-maintenance
  namespace: voiceassist
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: maintenance
            image: postgres:15
            command:
            - /bin/bash
            - -c
            - |
              echo "Running VACUUM ANALYZE..."
              psql "$DATABASE_URL" -c "VACUUM ANALYZE;"
              echo "Complete"
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: voiceassist-secrets
                  key: database-url
          restartPolicy: OnFailure
```

---

## Caching Strategy

### Three-Tier Cache Architecture

```
┌─────────────────────────────────────────────┐
│           Client Request                    │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  L1 Cache: In-Memory (Python dict/LRU)     │
│  - Fastest (< 1ms)                          │
│  - Per-process                              │
│  - TTL: 60s                                 │
│  - Size: 1000 items                         │
└─────────────┬───────────────────────────────┘
              │ Cache Miss
              ▼
┌─────────────────────────────────────────────┐
│  L2 Cache: Redis                            │
│  - Fast (< 5ms)                             │
│  - Shared across pods                       │
│  - TTL: 300s (5 min)                        │
│  - Size: 10GB                               │
└─────────────┬───────────────────────────────┘
              │ Cache Miss
              ▼
┌─────────────────────────────────────────────┐
│  L3 Cache: RAG/Semantic Cache               │
│  - Moderate (< 50ms)                        │
│  - Similar query matching                   │
│  - TTL: 3600s (1 hour)                      │
│  - Vector similarity                        │
└─────────────┬───────────────────────────────┘
              │ Cache Miss
              ▼
┌─────────────────────────────────────────────┐
│          Database Query                     │
└─────────────────────────────────────────────┘
```

### L1 Cache: In-Memory

**Implementation**:

```python
# server/cache/l1_cache.py
from functools import lru_cache
from typing import Any, Optional
import time
import threading

class L1Cache:
    """In-memory cache with TTL support."""

    def __init__(self, max_size: int = 1000, ttl: int = 60):
        self.max_size = max_size
        self.ttl = ttl
        self._cache = {}
        self._timestamps = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        with self._lock:
            if key not in self._cache:
                return None

            # Check TTL
            if time.time() - self._timestamps[key] > self.ttl:
                del self._cache[key]
                del self._timestamps[key]
                return None

            return self._cache[key]

    def set(self, key: str, value: Any):
        """Set value in cache with TTL."""
        with self._lock:
            # Evict oldest if at capacity
            if len(self._cache) >= self.max_size:
                oldest_key = min(self._timestamps, key=self._timestamps.get)
                del self._cache[oldest_key]
                del self._timestamps[oldest_key]

            self._cache[key] = value
            self._timestamps[key] = time.time()

    def invalidate(self, key: str):
        """Remove key from cache."""
        with self._lock:
            self._cache.pop(key, None)
            self._timestamps.pop(key, None)

    def clear(self):
        """Clear all cached items."""
        with self._lock:
            self._cache.clear()
            self._timestamps.clear()

# Global instance
l1_cache = L1Cache(max_size=1000, ttl=60)
```

**Usage**:

```python
from server.cache.l1_cache import l1_cache

async def get_user(user_id: int, db: Session) -> User:
    """Get user with L1 caching."""
    cache_key = f"user:{user_id}"

    # Check L1 cache
    cached = l1_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    user = db.query(User).filter(User.id == user_id).first()

    # Cache result
    if user:
        l1_cache.set(cache_key, user)

    return user
```

### L2 Cache: Redis

**Configuration**:

```python
# server/cache/redis_cache.py
import redis.asyncio as redis
from typing import Any, Optional
import json
import pickle

class RedisCache:
    """Redis cache with serialization support."""

    def __init__(self, url: str):
        self.redis = redis.from_url(url, decode_responses=False)

    async def get(self, key: str, deserialize: str = "json") -> Optional[Any]:
        """Get value from Redis."""
        value = await self.redis.get(key)
        if value is None:
            return None

        if deserialize == "json":
            return json.loads(value)
        elif deserialize == "pickle":
            return pickle.loads(value)
        else:
            return value

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = 300,
        serialize: str = "json"
    ):
        """Set value in Redis with TTL."""
        if serialize == "json":
            serialized = json.dumps(value)
        elif serialize == "pickle":
            serialized = pickle.dumps(value)
        else:
            serialized = value

        await self.redis.setex(key, ttl, serialized)

    async def delete(self, key: str):
        """Delete key from Redis."""
        await self.redis.delete(key)

    async def invalidate_pattern(self, pattern: str):
        """Invalidate all keys matching pattern."""
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)

# Global instance
redis_cache = RedisCache(REDIS_URL)
```

**Usage**:

```python
from server.cache.redis_cache import redis_cache

async def get_conversation(conversation_id: int, db: Session) -> Conversation:
    """Get conversation with Redis caching."""
    cache_key = f"conversation:{conversation_id}"

    # Check Redis
    cached = await redis_cache.get(cache_key)
    if cached:
        return Conversation(**cached)

    # Query database
    conversation = db.query(Conversation)\
        .filter(Conversation.id == conversation_id)\
        .first()

    # Cache result (5 minutes)
    if conversation:
        await redis_cache.set(cache_key, conversation.to_dict(), ttl=300)

    return conversation
```

### L3 Cache: RAG/Semantic

**Implementation**:

```python
# server/cache/semantic_cache.py
from typing import Optional, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer

class SemanticCache:
    """Semantic cache using vector similarity."""

    def __init__(self, threshold: float = 0.85):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.cache = {}  # {embedding_hash: (query, response, embedding)}
        self.threshold = threshold

    def _encode(self, text: str) -> np.ndarray:
        """Encode text to vector."""
        return self.model.encode(text, convert_to_numpy=True)

    def _similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity."""
        return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

    async def get(self, query: str) -> Optional[str]:
        """Get similar cached response."""
        query_embedding = self._encode(query)

        best_similarity = 0
        best_response = None

        for cached_query, response, cached_embedding in self.cache.values():
            similarity = self._similarity(query_embedding, cached_embedding)

            if similarity > best_similarity and similarity >= self.threshold:
                best_similarity = similarity
                best_response = response

        return best_response

    async def set(self, query: str, response: str):
        """Cache query-response pair."""
        embedding = self._encode(query)
        cache_key = hash(query)

        self.cache[cache_key] = (query, response, embedding)

        # Limit cache size
        if len(self.cache) > 1000:
            # Remove oldest (simple LRU would be better)
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]

# Global instance
semantic_cache = SemanticCache(threshold=0.85)
```

### Cache Invalidation Strategies

**Time-Based (TTL)**:
```python
# Set with TTL
await redis_cache.set(key, value, ttl=300)  # 5 minutes
```

**Event-Based**:
```python
# Invalidate on update
@router.put("/users/{user_id}")
async def update_user(user_id: int, data: UserUpdate, db: Session):
    # Update database
    user = db.query(User).filter(User.id == user_id).first()
    user.name = data.name
    db.commit()

    # Invalidate caches
    l1_cache.invalidate(f"user:{user_id}")
    await redis_cache.delete(f"user:{user_id}")
    await redis_cache.invalidate_pattern(f"user:{user_id}:*")

    return user
```

**Write-Through**:
```python
# Update cache on write
@router.post("/conversations")
async def create_conversation(data: ConversationCreate, db: Session):
    # Create in database
    conversation = Conversation(**data.dict())
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    # Update cache immediately
    cache_key = f"conversation:{conversation.id}"
    await redis_cache.set(cache_key, conversation.to_dict(), ttl=300)

    return conversation
```

### Cache Warming

**On Application Startup**:

```python
# server/cache/warming.py
async def warm_cache():
    """Warm cache with frequently accessed data."""
    db = SessionLocal()

    try:
        # Cache active users
        active_users = db.query(User)\
            .filter(User.is_active == True)\
            .limit(100)\
            .all()

        for user in active_users:
            cache_key = f"user:{user.id}"
            await redis_cache.set(cache_key, user.to_dict(), ttl=600)

        # Cache recent conversations
        recent_conversations = db.query(Conversation)\
            .filter(Conversation.created_at > datetime.now() - timedelta(days=7))\
            .limit(500)\
            .all()

        for conv in recent_conversations:
            cache_key = f"conversation:{conv.id}"
            await redis_cache.set(cache_key, conv.to_dict(), ttl=300)

        logger.info(f"Cache warmed: {len(active_users)} users, {len(recent_conversations)} conversations")

    finally:
        db.close()

# In server/main.py
@app.on_event("startup")
async def startup_event():
    await warm_cache()
```

---

## Kubernetes Resource Tuning

### Resource Requests and Limits

**Current Configuration**:

```yaml
# k8s/deployments/api-gateway.yaml
resources:
  requests:
    cpu: 1000m      # 1 CPU core
    memory: 1Gi     # 1 GB
  limits:
    cpu: 2000m      # 2 CPU cores
    memory: 2Gi     # 2 GB
```

**Tuning Process**:

1. **Monitor Actual Usage** (Use VPA or metrics):
   ```bash
   # Get VPA recommendations
   kubectl get vpa voiceassist-api -n voiceassist -o yaml

   # Monitor actual usage
   kubectl top pods -n voiceassist --containers
   ```

2. **Adjust Based on Observations**:

| Scenario | CPU Request | CPU Limit | Memory Request | Memory Limit |
|----------|-------------|-----------|----------------|--------------|
| **Under-provisioned** | Increase 50% | Increase 50% | Increase 50% | Increase 50% |
| **Over-provisioned** | Decrease 25% | Decrease 25% | Decrease 25% | Decrease 25% |
| **CPU-bound** | Increase CPU | Increase CPU | Keep same | Keep same |
| **Memory-bound** | Keep same | Keep same | Increase Memory | Increase Memory |

3. **Quality of Service (QoS)**:

```yaml
# Guaranteed QoS (requests == limits)
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 1000m      # Same as request
    memory: 1Gi     # Same as request

# Burstable QoS (requests < limits)
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m      # Higher than request
    memory: 2Gi     # Higher than request

# BestEffort QoS (no requests/limits)
# Not recommended for production
```

**Recommended Settings** (Post-Optimization):

```yaml
# API Gateway
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 2000m
    memory: 2Gi

# Worker Service
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1500m
    memory: 1536Mi

# Background Jobs
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

---

## HPA Threshold Tuning

### Current HPA Configuration

```yaml
# k8s/performance/api-gateway-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: voiceassist-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: voiceassist-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 50
        periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### Tuning Guidelines

#### CPU Threshold

| Load Pattern | Target % | Reasoning |
|--------------|----------|-----------|
| **Steady, predictable** | 70% | Default, balances utilization and headroom |
| **Bursty, unpredictable** | 60% | More headroom for spikes |
| **Cost-sensitive** | 80% | Higher utilization, less headroom |
| **Critical workload** | 50% | Maximum headroom for reliability |

#### Memory Threshold

| Memory Characteristics | Target % | Reasoning |
|------------------------|----------|-----------|
| **Stable usage** | 80% | Default |
| **Growing over time (leak?)** | 70% | Trigger earlier |
| **Highly variable** | 75% | Balance |

#### Scale-Up Speed

```yaml
scaleUp:
  stabilizationWindowSeconds: 0  # No delay
  policies:
  - type: Percent
    value: 100                   # Double pods
    periodSeconds: 15            # Every 15 seconds
```

**Use Cases**:
- **Aggressive** (above): Flash crowds, rapid traffic increase
- **Moderate** (default): Normal production usage
- **Conservative**: Development, cost-conscious

#### Scale-Down Speed

```yaml
scaleDown:
  stabilizationWindowSeconds: 600  # 10 minute delay
  policies:
  - type: Percent
    value: 5                       # Remove 5% of pods
    periodSeconds: 120             # Every 2 minutes
```

**Use Cases**:
- **Slow** (above): Avoid flapping, warm pods are valuable
- **Moderate** (default): Balance responsiveness and stability
- **Fast**: Development environments, cost optimization

### Custom Metrics

**Add Request Rate Metric**:

```yaml
# k8s/performance/api-gateway-hpa.yaml
spec:
  metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "50"  # 50 req/s per pod
```

**Prometheus Adapter Configuration**:

```yaml
# k8s/performance/prometheus-adapter-config.yaml
rules:
- seriesQuery: 'http_requests_total{namespace="voiceassist"}'
  resources:
    overrides:
      namespace: {resource: "namespace"}
      pod: {resource: "pod"}
  name:
    matches: "^http_requests_total"
    as: "http_requests_per_second"
  metricsQuery: 'rate(http_requests_total{<<.LabelMatchers>>}[1m])'
```

---

## Application-Level Optimizations

### Async/Await Patterns

**Before** (Synchronous):
```python
@router.get("/dashboard")
def get_dashboard(user_id: int, db: Session):
    # Sequential, blocking
    user = get_user(user_id, db)                     # 50ms
    conversations = get_conversations(user_id, db)   # 100ms
    documents = get_documents(user_id, db)           # 80ms
    stats = calculate_stats(user_id, db)             # 120ms

    # Total: 350ms
    return DashboardResponse(user, conversations, documents, stats)
```

**After** (Asynchronous):
```python
@router.get("/dashboard")
async def get_dashboard(user_id: int, db: Session):
    # Parallel, non-blocking
    user_task = get_user_async(user_id, db)
    conversations_task = get_conversations_async(user_id, db)
    documents_task = get_documents_async(user_id, db)
    stats_task = calculate_stats_async(user_id, db)

    # Wait for all concurrently
    user, conversations, documents, stats = await asyncio.gather(
        user_task,
        conversations_task,
        documents_task,
        stats_task
    )

    # Total: ~120ms (longest operation)
    return DashboardResponse(user, conversations, documents, stats)
```

### Response Compression

```python
# server/middleware/compression.py
from fastapi.middleware.gzip import GZIPMiddleware

app.add_middleware(GZIPMiddleware, minimum_size=1000)
```

**Benchmark**:
- Uncompressed: 150KB response, 50ms transfer
- Compressed: 15KB response, 10ms transfer
- **Savings**: 90% size, 80% transfer time

### Connection Pooling

```python
# server/http_client.py
import httpx

# Reuse HTTP client with connection pooling
http_client = httpx.AsyncClient(
    timeout=30.0,
    limits=httpx.Limits(
        max_keepalive_connections=20,
        max_connections=100,
        keepalive_expiry=300
    )
)

# Use in requests
async def call_external_api(url: str):
    response = await http_client.get(url)
    return response.json()
```

### Batch Processing

**Before** (Individual operations):
```python
# Process documents one by one
for document_id in document_ids:
    process_document(document_id)  # 100ms each
# Total: 100ms × 50 = 5000ms (5 seconds)
```

**After** (Batch):
```python
# Process documents in batch
process_documents_batch(document_ids)  # 800ms total
# Total: 800ms for all 50
# **Speedup**: 6.25x faster
```

---

## Monitoring and Alerting

### Key Metrics to Monitor

```yaml
# k8s/monitoring/prometheus-rules.yaml
groups:
- name: performance
  interval: 30s
  rules:
  # Response time alerts
  - alert: HighResponseTime
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High P95 response time"
      description: "P95 response time is {{ $value }}s"

  # Error rate alerts
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"

  # Cache performance
  - alert: LowCacheHitRate
    expr: rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) < 0.7
    for: 15m
    labels:
      severity: warning
    annotations:
      summary: "Low cache hit rate"
```

---

## Common Bottlenecks

### 1. Database Connection Pool Exhaustion

**Symptoms**:
- Timeouts waiting for connections
- "Connection pool is full" errors
- Increasing response times

**Solutions**:
- Increase pool size
- Add read replicas
- Implement connection pooling best practices
- Review long-running queries

### 2. Memory Leaks

**Symptoms**:
- Memory usage growing over time
- Pods being OOMKilled
- Performance degrading over time

**Solutions**:
- Profile memory usage
- Fix unclosed connections/files
- Implement proper cleanup in finally blocks
- Use context managers

### 3. Slow Queries

**Symptoms**:
- High P95/P99 response times
- Database CPU high
- Slow query logs filling up

**Solutions**:
- Add missing indexes
- Optimize query structure
- Implement query result caching
- Use EXPLAIN ANALYZE

### 4. Cache Misses

**Symptoms**:
- Low cache hit rates
- High database load
- Inconsistent response times

**Solutions**:
- Warm cache on startup
- Adjust TTL values
- Implement cache hierarchies
- Review invalidation strategy

---

## Conclusion

Performance tuning is an ongoing process. Follow these principles:

1. **Measure before optimizing**
2. **Focus on bottlenecks**
3. **Make incremental changes**
4. **Validate improvements**
5. **Monitor continuously**

For ongoing support:
- Review dashboards daily
- Run load tests weekly
- Conduct performance reviews monthly
- Update this guide as you learn

**Related Documentation**:
- Performance Benchmarks: `/docs/PERFORMANCE_BENCHMARKS.md`
- Load Testing Guide: `/docs/LOAD_TESTING_GUIDE.md`
- Dashboards: `/dashboards/`
