# Scaling Runbook

**Last Updated**: 2025-11-21 (Phase 7 - P3.2)
**Purpose**: Comprehensive guide for scaling VoiceAssist V2 infrastructure

---

## Scaling Overview

### Current Architecture

```
Load Balancer (if configured)
    ↓
VoiceAssist Server (Scalable)
    ↓
├── PostgreSQL (Primary + Read Replicas)
├── Redis (Cluster or Sentinel)
└── Qdrant (Distributed)
```

### Scaling Strategy

| Component | Type | Method | Max Recommended |
|-----------|------|--------|-----------------|
| **VoiceAssist Server** | Stateless | Horizontal | 10+ instances |
| **PostgreSQL** | Stateful | Vertical + Read Replicas | 1 primary + 5 replicas |
| **Redis** | Stateful | Vertical + Cluster | 6 nodes (3 master + 3 slave) |
| **Qdrant** | Stateful | Horizontal + Sharding | 6+ nodes |

---

## When to Scale

### Scaling Triggers

#### Immediate Scaling (Reactive)

Scale **immediately** if:
- CPU usage > 80% for 10+ minutes
- Memory usage > 85%
- Response time > 2 seconds (p95)
- Error rate > 5%
- Connection pool exhausted
- Queue depth > 1000

#### Planned Scaling (Proactive)

Schedule scaling if:
- Expected traffic increase (events, marketing campaigns)
- New feature launch with heavy load
- Approaching 70% capacity on any metric
- Seasonal traffic patterns

### Scaling Decision Matrix

```bash
# Quick capacity check
cat > /usr/local/bin/va-capacity-check <<'EOF'
#!/bin/bash

echo "VoiceAssist Capacity Check - $(date)"
echo "========================================"

# Check application load
CPU=$(docker stats --no-stream --format "{{.CPUPerc}}" voiceassist-voiceassist-server-1 | sed 's/%//')
MEM=$(docker stats --no-stream --format "{{.MemPerc}}" voiceassist-voiceassist-server-1 | sed 's/%//')

echo "Application:"
echo "  CPU: ${CPU}%"
echo "  Memory: ${MEM}%"

# Database connections
DB_CONN=$(docker compose exec -T postgres psql -U voiceassist -d voiceassist -t -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" | tr -d ' ')
DB_MAX=$(docker compose exec -T postgres psql -U voiceassist -d voiceassist -t -c \
  "SHOW max_connections;" | tr -d ' ')
DB_USAGE=$((DB_CONN * 100 / DB_MAX))

echo "Database:"
echo "  Active Connections: ${DB_CONN}/${DB_MAX} (${DB_USAGE}%)"

# Redis memory
REDIS_MEM=$(docker compose exec -T redis redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
echo "Redis:"
echo "  Memory Usage: ${REDIS_MEM}"

# Recommendation
echo ""
echo "Scaling Recommendations:"
if (( $(echo "$CPU > 80" | bc -l) )) || (( $(echo "$MEM > 85" | bc -l) )); then
    echo "🔴 IMMEDIATE: Scale application horizontally"
elif (( $(echo "$CPU > 70" | bc -l) )) || (( $(echo "$MEM > 70" | bc -l) )); then
    echo "🟡 SOON: Plan to scale within 24 hours"
elif [ $DB_USAGE -gt 80 ]; then
    echo "🔴 IMMEDIATE: Scale database connections or add read replica"
else
    echo "🟢 OK: Current capacity is adequate"
fi
EOF

chmod +x /usr/local/bin/va-capacity-check
```

---

## Horizontal Scaling - Application Server

### Quick Scale Up

```bash
# Scale to 3 instances
docker compose up -d --scale voiceassist-server=3

# Verify all instances running
docker compose ps voiceassist-server

# Expected output: 3 containers running
# voiceassist-voiceassist-server-1
# voiceassist-voiceassist-server-2
# voiceassist-voiceassist-server-3

# Check health of all instances
for i in {1..3}; do
    echo "Instance $i:"
    docker inspect voiceassist-voiceassist-server-$i | jq '.[0].State.Health.Status'
done
```

### Scale with Load Balancer

```yaml
# Add to docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - voiceassist-server

  voiceassist-server:
    # ... existing config ...
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

```nginx
# Create nginx.conf for load balancing
upstream voiceassist_backend {
    least_conn;  # Use least connections algorithm

    server voiceassist-server-1:8000 max_fails=3 fail_timeout=30s;
    server voiceassist-server-2:8000 max_fails=3 fail_timeout=30s;
    server voiceassist-server-3:8000 max_fails=3 fail_timeout=30s;

    keepalive 32;
}

server {
    listen 80;

    location / {
        proxy_pass http://voiceassist_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Health check
        proxy_next_upstream error timeout http_500 http_502 http_503;
    }

    location /health {
        access_log off;
        proxy_pass http://voiceassist_backend;
    }
}
```

```bash
# Deploy with load balancer
docker compose up -d --scale voiceassist-server=3

# Verify load balancing
for i in {1..10}; do
    curl -s http://localhost/health | jq -r '.hostname'
done

# Should show different hostnames, indicating round-robin
```

### Auto-Scaling with Metrics

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-autoscale

MIN_INSTANCES=2
MAX_INSTANCES=10
SCALE_UP_THRESHOLD=70
SCALE_DOWN_THRESHOLD=30
CHECK_INTERVAL=60

while true; do
    # Get current instance count
    CURRENT=$(docker compose ps -q voiceassist-server | wc -l)

    # Get average CPU across all instances
    AVG_CPU=$(docker stats --no-stream --format "{{.CPUPerc}}" \
      $(docker compose ps -q voiceassist-server) | \
      sed 's/%//g' | \
      awk '{s+=$1; n++} END {print s/n}')

    echo "[$(date)] Instances: $CURRENT, Avg CPU: ${AVG_CPU}%"

    # Scale up
    if (( $(echo "$AVG_CPU > $SCALE_UP_THRESHOLD" | bc -l) )) && [ $CURRENT -lt $MAX_INSTANCES ]; then
        NEW_COUNT=$((CURRENT + 1))
        echo "Scaling UP to $NEW_COUNT instances (CPU: ${AVG_CPU}%)"
        docker compose up -d --scale voiceassist-server=$NEW_COUNT

    # Scale down
    elif (( $(echo "$AVG_CPU < $SCALE_DOWN_THRESHOLD" | bc -l) )) && [ $CURRENT -gt $MIN_INSTANCES ]; then
        NEW_COUNT=$((CURRENT - 1))
        echo "Scaling DOWN to $NEW_COUNT instances (CPU: ${AVG_CPU}%)"
        docker compose up -d --scale voiceassist-server=$NEW_COUNT
    else
        echo "No scaling needed"
    fi

    sleep $CHECK_INTERVAL
done
```

### Graceful Instance Shutdown

```bash
# Scale down with zero downtime
CURRENT=$(docker compose ps -q voiceassist-server | wc -l)
TARGET=$((CURRENT - 1))

echo "Scaling from $CURRENT to $TARGET instances"

# Get last instance
LAST_INSTANCE="voiceassist-voiceassist-server-${CURRENT}"

# Stop accepting new connections (if using load balancer)
docker compose exec nginx nginx -s reload

# Wait for existing connections to drain (30 seconds)
echo "Draining connections..."
sleep 30

# Check remaining connections
ACTIVE_CONN=$(docker exec $LAST_INSTANCE netstat -an | grep :8000 | grep ESTABLISHED | wc -l)
echo "Active connections on instance: $ACTIVE_CONN"

# Scale down
docker compose up -d --scale voiceassist-server=$TARGET

echo "Scaled down to $TARGET instances"
```

---

## Vertical Scaling - Application Server

### Increase CPU and Memory

```yaml
# Update docker-compose.yml
services:
  voiceassist-server:
    deploy:
      resources:
        limits:
          cpus: '4'        # Increased from 2
          memory: 4G       # Increased from 2G
        reservations:
          cpus: '2'        # Increased from 1
          memory: 2G       # Increased from 1G
```

```bash
# Apply changes
docker compose up -d voiceassist-server

# Verify new limits
docker inspect voiceassist-voiceassist-server-1 | \
  jq '.[0].HostConfig.Memory, .[0].HostConfig.NanoCpus'

# Monitor performance improvement
docker stats voiceassist-voiceassist-server-1
```

### Optimize Application Workers

```bash
# Increase Gunicorn workers in Dockerfile or docker-compose.yml
# Rule: workers = (2 x CPU cores) + 1

# For 4 CPU cores:
WORKERS=9  # (2 x 4) + 1

# Update environment variable
docker compose exec voiceassist-server sh -c \
  "export GUNICORN_WORKERS=$WORKERS && supervisorctl restart gunicorn"

# Verify worker count
docker compose exec voiceassist-server ps aux | grep gunicorn
```

---

## PostgreSQL Scaling

### Vertical Scaling - Increase Resources

```yaml
# Update docker-compose.yml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"          # Increased from 100
      - "-c"
      - "shared_buffers=2GB"           # Increased from 256MB
      - "-c"
      - "effective_cache_size=6GB"     # Increased
      - "-c"
      - "maintenance_work_mem=512MB"   # Increased
      - "-c"
      - "checkpoint_completion_target=0.9"
      - "-c"
      - "wal_buffers=16MB"
      - "-c"
      - "default_statistics_target=100"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "work_mem=10MB"                # Increased
      - "-c"
      - "min_wal_size=1GB"
      - "-c"
      - "max_wal_size=4GB"             # Increased
```

```bash
# Apply changes
docker compose up -d postgres

# Verify new settings
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SHOW max_connections; SHOW shared_buffers; SHOW effective_cache_size;"
```

### Read Replica Setup

```yaml
# Add to docker-compose.yml
services:
  postgres-replica:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_replica_data:/var/lib/postgresql/data
    command:
      - "postgres"
      - "-c"
      - "hot_standby=on"
      - "-c"
      - "max_connections=200"
    depends_on:
      - postgres

volumes:
  postgres_replica_data:
```

```bash
# Setup replication on primary
docker compose exec postgres psql -U voiceassist -d postgres <<EOF
-- Create replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replica_password';

-- Configure pg_hba.conf for replication
-- Add to postgresql.conf:
-- wal_level = replica
-- max_wal_senders = 10
-- max_replication_slots = 10
-- hot_standby = on
EOF

# Restart primary
docker compose restart postgres

# Initial replica setup
docker compose exec postgres pg_basebackup \
  -h postgres \
  -D /var/lib/postgresql/data-replica \
  -U replicator \
  -v \
  -P \
  -W

# Create recovery.conf on replica
cat > recovery.conf <<EOF
standby_mode = 'on'
primary_conninfo = 'host=postgres port=5432 user=replicator password=replica_password'
trigger_file = '/tmp/postgresql.trigger.5432'
EOF

# Start replica
docker compose up -d postgres-replica

# Verify replication
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT * FROM pg_stat_replication;"
```

### Connection Pooling with PgBouncer

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
      PGBOUNCER_MIN_POOL_SIZE: 10
      PGBOUNCER_RESERVE_POOL_SIZE: 5
      PGBOUNCER_SERVER_IDLE_TIMEOUT: 600
    ports:
      - "6432:6432"
    depends_on:
      - postgres
```

```bash
# Update application to use PgBouncer
# Change DATABASE_URL in .env
DATABASE_URL=postgresql://voiceassist:password@pgbouncer:6432/voiceassist

# Restart application
docker compose up -d voiceassist-server

# Monitor PgBouncer
docker compose exec pgbouncer psql -h localhost -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS;"
docker compose exec pgbouncer psql -h localhost -p 6432 -U pgbouncer pgbouncer -c "SHOW STATS;"
```

---

## Redis Scaling

### Vertical Scaling - Increase Memory

```yaml
# Update docker-compose.yml
services:
  redis:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G       # Increased from 2G
        reservations:
          cpus: '1'
          memory: 2G
    command:
      - redis-server
      - --maxmemory 3gb   # Increased from 1gb
      - --maxmemory-policy allkeys-lru
```

```bash
# Apply changes
docker compose up -d redis

# Verify new memory limit
docker compose exec redis redis-cli CONFIG GET maxmemory
```

### Redis Cluster Setup (Horizontal Scaling)

```yaml
# Add to docker-compose.yml
services:
  redis-node-1:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_1_data:/data

  redis-node-2:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_2_data:/data

  redis-node-3:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_3_data:/data

  redis-node-4:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_4_data:/data

  redis-node-5:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_5_data:/data

  redis-node-6:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --port 6379
    volumes:
      - redis_node_6_data:/data

volumes:
  redis_node_1_data:
  redis_node_2_data:
  redis_node_3_data:
  redis_node_4_data:
  redis_node_5_data:
  redis_node_6_data:
```

```bash
# Start all nodes
docker compose up -d redis-node-{1..6}

# Create cluster
docker compose exec redis-node-1 redis-cli --cluster create \
  redis-node-1:6379 \
  redis-node-2:6379 \
  redis-node-3:6379 \
  redis-node-4:6379 \
  redis-node-5:6379 \
  redis-node-6:6379 \
  --cluster-replicas 1

# Verify cluster
docker compose exec redis-node-1 redis-cli CLUSTER INFO
docker compose exec redis-node-1 redis-cli CLUSTER NODES
```

### Redis Sentinel (High Availability)

```yaml
# Add to docker-compose.yml
services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --port 6379
    volumes:
      - redis_master_data:/data

  redis-slave-1:
    image: redis:7-alpine
    command: redis-server --port 6379 --slaveof redis-master 6379
    volumes:
      - redis_slave_1_data:/data
    depends_on:
      - redis-master

  redis-slave-2:
    image: redis:7-alpine
    command: redis-server --port 6379 --slaveof redis-master 6379
    volumes:
      - redis_slave_2_data:/data
    depends_on:
      - redis-master

  redis-sentinel-1:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./redis-sentinel.conf:/etc/redis/sentinel.conf
    depends_on:
      - redis-master

  redis-sentinel-2:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./redis-sentinel.conf:/etc/redis/sentinel.conf
    depends_on:
      - redis-master

  redis-sentinel-3:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./redis-sentinel.conf:/etc/redis/sentinel.conf
    depends_on:
      - redis-master
```

```bash
# Create redis-sentinel.conf
cat > redis-sentinel.conf <<EOF
port 26379
sentinel monitor mymaster redis-master 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel parallel-syncs mymaster 1
sentinel failover-timeout mymaster 10000
EOF

# Start Sentinel setup
docker compose up -d redis-master redis-slave-1 redis-slave-2
docker compose up -d redis-sentinel-1 redis-sentinel-2 redis-sentinel-3

# Verify Sentinel
docker compose exec redis-sentinel-1 redis-cli -p 26379 SENTINEL masters
```

---

## Qdrant Scaling

### Vertical Scaling - Increase Resources

```yaml
# Update docker-compose.yml
services:
  qdrant:
    deploy:
      resources:
        limits:
          cpus: '4'        # Increased from 2
          memory: 8G       # Increased from 4G
        reservations:
          cpus: '2'
          memory: 4G
```

### Horizontal Scaling - Distributed Cluster

```yaml
# Add to docker-compose.yml
services:
  qdrant-node-1:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    environment:
      QDRANT__CLUSTER__ENABLED: "true"
      QDRANT__CLUSTER__P2P__PORT: "6335"
    volumes:
      - qdrant_node_1_storage:/qdrant/storage

  qdrant-node-2:
    image: qdrant/qdrant:latest
    ports:
      - "6343:6333"
      - "6344:6334"
    environment:
      QDRANT__CLUSTER__ENABLED: "true"
      QDRANT__CLUSTER__P2P__PORT: "6335"
      QDRANT__CLUSTER__P2P__BOOTSTRAP__URI: "http://qdrant-node-1:6335"
    volumes:
      - qdrant_node_2_storage:/qdrant/storage
    depends_on:
      - qdrant-node-1

  qdrant-node-3:
    image: qdrant/qdrant:latest
    ports:
      - "6353:6333"
      - "6354:6334"
    environment:
      QDRANT__CLUSTER__ENABLED: "true"
      QDRANT__CLUSTER__P2P__PORT: "6335"
      QDRANT__CLUSTER__P2P__BOOTSTRAP__URI: "http://qdrant-node-1:6335"
    volumes:
      - qdrant_node_3_storage:/qdrant/storage
    depends_on:
      - qdrant-node-1

volumes:
  qdrant_node_1_storage:
  qdrant_node_2_storage:
  qdrant_node_3_storage:
```

```bash
# Start cluster
docker compose up -d qdrant-node-{1..3}

# Verify cluster
curl -s http://localhost:6333/cluster | jq '.'

# Create sharded collection
curl -X PUT http://localhost:6333/collections/voice_embeddings \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "shard_number": 3,
    "replication_factor": 2
  }'

# Verify sharding
curl -s http://localhost:6333/collections/voice_embeddings/cluster | jq '.'
```

---

## Load Testing

### Setup Load Testing Tools

```bash
# Install Apache Bench (simple HTTP testing)
# macOS:
brew install httpd

# Install Locust (Python load testing)
pip install locust

# Install k6 (modern load testing)
brew install k6
```

### Basic Load Test with Apache Bench

```bash
# Test health endpoint
ab -n 1000 -c 10 http://localhost:8000/health

# Test with authentication
ab -n 1000 -c 10 -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/users/me

# Results show:
# - Requests per second
# - Time per request
# - Transfer rate
# - Distribution of response times
```

### Advanced Load Test with Locust

```python
# Create locustfile.py
from locust import HttpUser, task, between

class VoiceAssistUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        # Login and get token
        response = self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })
        self.token = response.json()["access_token"]

    @task(3)
    def view_profile(self):
        self.client.get("/api/users/me",
            headers={"Authorization": f"Bearer {self.token}"})

    @task(2)
    def list_conversations(self):
        self.client.get("/api/conversations",
            headers={"Authorization": f"Bearer {self.token}"})

    @task(1)
    def create_message(self):
        self.client.post("/api/conversations/1/messages",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"content": "Test message"})
```

```bash
# Run load test
locust -f locustfile.py --host=http://localhost:8000

# Open browser to http://localhost:8089
# Configure:
# - Number of users: 100
# - Spawn rate: 10 users/second
# - Host: http://localhost:8000

# Command line mode (headless)
locust -f locustfile.py --host=http://localhost:8000 \
  --users 100 --spawn-rate 10 --run-time 5m --headless
```

### Load Test with k6

```javascript
// Create loadtest.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 50 },  // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% errors
  },
};

export default function () {
  // Login
  let loginRes = http.post('http://localhost:8000/api/auth/login',
    JSON.stringify({
      email: 'test@example.com',
      password: 'password'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  let token = loginRes.json('access_token');

  // Make authenticated requests
  let headers = {
    'Authorization': `Bearer ${token}`,
  };

  let profileRes = http.get('http://localhost:8000/api/users/me', { headers });
  check(profileRes, {
    'profile retrieved': (r) => r.status === 200,
  });

  sleep(1);
}
```

```bash
# Run k6 load test
k6 run loadtest.js

# With custom output
k6 run --out json=results.json loadtest.js

# View results
cat results.json | jq '.metrics'
```

### Database Load Testing

```bash
# Test PostgreSQL under load
# Create pgbench database
docker compose exec postgres createdb -U voiceassist pgbench_test

# Initialize pgbench
docker compose exec postgres pgbench -i -U voiceassist pgbench_test

# Run benchmark (100 clients, 1000 transactions each)
docker compose exec postgres pgbench \
  -c 100 \
  -t 1000 \
  -U voiceassist \
  pgbench_test

# Results show:
# - TPS (transactions per second)
# - Average latency
# - Connection time
```

### Redis Load Testing

```bash
# Use redis-benchmark
docker compose exec redis redis-benchmark \
  -h localhost \
  -p 6379 \
  -c 100 \
  -n 100000 \
  -d 100 \
  --csv

# Test specific commands
docker compose exec redis redis-benchmark \
  -t set,get,incr,lpush,lpop \
  -n 100000 \
  -q
```

---

## Capacity Planning

### Current Capacity Assessment

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-capacity-report

echo "VoiceAssist Capacity Report - $(date)"
echo "========================================"
echo ""

# Application instances
APP_INSTANCES=$(docker compose ps -q voiceassist-server | wc -l)
echo "Application Instances: $APP_INSTANCES"

# Resource usage per instance
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  $(docker compose ps -q voiceassist-server)
echo ""

# Database metrics
echo "Database Metrics:"
docker compose exec -T postgres psql -U voiceassist -d voiceassist <<EOF
SELECT
    'Active Connections' as metric,
    count(*) as value
FROM pg_stat_activity
WHERE state = 'active'
UNION ALL
SELECT
    'Database Size',
    pg_size_pretty(pg_database_size('voiceassist'))::text
UNION ALL
SELECT
    'Largest Table',
    pg_size_pretty(max(pg_total_relation_size(schemaname||'.'||tablename)))::text
FROM pg_tables
WHERE schemaname = 'public';
EOF
echo ""

# Redis metrics
echo "Redis Metrics:"
docker compose exec -T redis redis-cli INFO stats | grep -E "(total_commands_processed|instantaneous_ops_per_sec|used_memory_human)"
echo ""

# Qdrant metrics
echo "Qdrant Metrics:"
curl -s http://localhost:6333/metrics | grep -E "(collections_total|points_total)"
echo ""

# Estimated capacity
echo "Capacity Estimates:"
echo "  Current RPS: [Calculate from metrics]"
echo "  Max RPS (current setup): [Estimate based on testing]"
echo "  Headroom: [Percentage]"
echo ""

# Scaling recommendations
echo "Scaling Recommendations:"
echo "  - Application: Scale to $(( APP_INSTANCES + 2 )) instances for 50% more capacity"
echo "  - Database: Consider read replica when connections > 150"
echo "  - Redis: Current memory usage allows 2x data growth"
```

### Growth Planning

```bash
# Estimate required resources for growth

# Current metrics (example)
CURRENT_USERS=1000
CURRENT_RPS=50
CURRENT_DB_SIZE_GB=10

# Growth projections
GROWTH_RATE=1.5  # 50% growth
MONTHS=6

# Calculate future requirements
cat > /tmp/capacity_projection.py <<EOF
import math

current_users = ${CURRENT_USERS}
current_rps = ${CURRENT_RPS}
current_db_gb = ${CURRENT_DB_SIZE_GB}
monthly_growth = ${GROWTH_RATE}
months = ${MONTHS}

future_users = current_users * (monthly_growth ** months)
future_rps = current_rps * (monthly_growth ** months)
future_db_gb = current_db_gb * (monthly_growth ** months)

# Resource estimates
# Assuming 1 app instance handles 50 RPS
app_instances = math.ceil(future_rps / 50)

# Database: 100 connections per 1000 users
db_connections = math.ceil((future_users / 1000) * 100)

# Redis: 1GB per 10000 users
redis_gb = math.ceil(future_users / 10000)

print(f"Capacity Projection for {months} months:")
print(f"=" * 50)
print(f"Current Users: {current_users:,.0f}")
print(f"Projected Users: {future_users:,.0f} ({future_users/current_users:.1f}x)")
print(f"")
print(f"Current RPS: {current_rps}")
print(f"Projected RPS: {future_rps:.0f} ({future_rps/current_rps:.1f}x)")
print(f"")
print(f"Resource Requirements:")
print(f"  Application Instances: {app_instances}")
print(f"  Database Connections: {db_connections}")
print(f"  Database Storage: {future_db_gb:.0f} GB")
print(f"  Redis Memory: {redis_gb} GB")
print(f"")
print(f"Recommended Setup:")
if app_instances <= 5:
    print(f"  Application: {app_instances} instances with load balancer")
else:
    print(f"  Application: {app_instances} instances with auto-scaling")

if db_connections > 150:
    print(f"  Database: Primary + 2 read replicas + PgBouncer")
else:
    print(f"  Database: Primary + PgBouncer")

if redis_gb > 4:
    print(f"  Redis: 3-node cluster")
else:
    print(f"  Redis: Single instance ({redis_gb}GB)")
EOF

python3 /tmp/capacity_projection.py
```

---

## Performance Optimization

### Application Optimization

```bash
# Enable response caching
cat >> .env <<EOF
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_SIZE=1000
EOF

# Enable gzip compression in nginx
cat > nginx-compression.conf <<EOF
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
EOF

# Optimize database queries
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Analyze tables
ANALYZE conversations;
ANALYZE messages;
ANALYZE users;
EOF
```

### Database Query Optimization

```bash
# Identify slow queries
docker compose exec postgres psql -U voiceassist -d voiceassist <<EOF
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT
    substring(query, 1, 100) AS short_query,
    calls,
    total_time,
    mean_time,
    max_time,
    stddev_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
EOF

# Optimize connection management
cat >> .env <<EOF
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
EOF
```

### Caching Strategy

```python
# Implement multi-layer caching in application
# Example: cache.py

import redis
import hashlib
from functools import wraps

redis_client = redis.Redis(host='redis', port=6379, decode_responses=True)

def cache_result(ttl=300):
    """Cache function results in Redis"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            key_data = f"{func.__name__}:{args}:{kwargs}"
            cache_key = hashlib.md5(key_data.encode()).hexdigest()

            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Execute function
            result = func(*args, **kwargs)

            # Store in cache
            redis_client.setex(cache_key, ttl, json.dumps(result))

            return result
        return wrapper
    return decorator

# Usage:
@cache_result(ttl=600)
def get_user_conversations(user_id):
    # Expensive database query
    return db.query(Conversation).filter_by(user_id=user_id).all()
```

---

## Monitoring During Scaling

### Real-time Metrics

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-scaling-monitor

watch -n 5 '
echo "=== Application Instances ==="
docker compose ps voiceassist-server | grep Up | wc -l
echo ""

echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" | grep voiceassist
echo ""

echo "=== Request Rate (approx) ==="
docker compose logs --since 1m voiceassist-server | grep "200 OK" | wc -l
echo "requests/min"
echo ""

echo "=== Error Rate ==="
docker compose logs --since 1m voiceassist-server | grep -i error | wc -l
echo "errors/min"
echo ""

echo "=== Database Connections ==="
docker compose exec -T postgres psql -U voiceassist -d voiceassist -t -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
'
```

---

## Scaling Checklist

### Pre-Scaling

- [ ] Review current metrics and capacity
- [ ] Identify bottlenecks
- [ ] Test scaling in staging environment
- [ ] Update monitoring thresholds
- [ ] Prepare rollback plan
- [ ] Notify team of scaling activity

### During Scaling

- [ ] Monitor all metrics closely
- [ ] Watch for errors or anomalies
- [ ] Verify new instances are healthy
- [ ] Check load distribution
- [ ] Test critical functionality

### Post-Scaling

- [ ] Verify performance improvement
- [ ] Update documentation
- [ ] Review metrics for 24 hours
- [ ] Adjust monitoring alerts
- [ ] Document lessons learned
- [ ] Update capacity planning estimates

---

## Related Documentation

- [Deployment Runbook](./DEPLOYMENT.md)
- [Monitoring Runbook](./MONITORING.md)
- [Troubleshooting Runbook](./TROUBLESHOOTING.md)
- [CONNECTION_POOL_OPTIMIZATION.md](../CONNECTION_POOL_OPTIMIZATION.md)
- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Quarterly or after significant scaling events
**Next Review**: 2026-02-21
