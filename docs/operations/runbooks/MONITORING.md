# Monitoring Runbook

**Last Updated**: 2025-11-21 (Phase 7 - P3.2)
**Purpose**: Comprehensive guide for monitoring and observability in VoiceAssist V2

---

## Monitoring Architecture

```
Application Metrics
    ↓
Prometheus (Metrics Collection)
    ↓
Grafana (Visualization)
    ↓
AlertManager (Alerting)
    ↓
PagerDuty/Slack/Email
```

### Key Monitoring Components

| Component | Purpose | Port | Dashboard |
|-----------|---------|------|-----------|
| **Prometheus** | Metrics collection & storage | 9090 | http://localhost:9090 |
| **Grafana** | Metrics visualization | 3000 | http://localhost:3000 |
| **AlertManager** | Alert routing & management | 9093 | http://localhost:9093 |
| **Application Metrics** | Custom app metrics | 8000/metrics | http://localhost:8000/metrics |

---

## Setup Monitoring Stack

### Docker Compose Configuration

```yaml
# Add to docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
    depends_on:
      - prometheus

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    ports:
      - "9187:9187"
    environment:
      DATA_SOURCE_NAME: "postgresql://voiceassist:${POSTGRES_PASSWORD}@postgres:5432/voiceassist?sslmode=disable"
    depends_on:
      - postgres

  redis-exporter:
    image: oliver006/redis_exporter:latest
    ports:
      - "9121:9121"
    environment:
      REDIS_ADDR: "redis:6379"
    depends_on:
      - redis

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
```

### Prometheus Configuration

```yaml
# Create monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'voiceassist-prod'
    environment: 'production'

# Load alerting rules
rule_files:
  - '/etc/prometheus/alerts.yml'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# Scrape configurations
scrape_configs:
  # VoiceAssist Application
  - job_name: 'voiceassist-app'
    static_configs:
      - targets: ['voiceassist-server:8000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  # PostgreSQL
  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Node metrics
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Grafana
  - job_name: 'grafana'
    static_configs:
      - targets: ['grafana:3000']
```

### Alert Rules

```yaml
# Create monitoring/alerts.yml
groups:
  - name: voiceassist_alerts
    interval: 30s
    rules:
      # Application availability
      - alert: ApplicationDown
        expr: up{job="voiceassist-app"} == 0
        for: 1m
        labels:
          severity: critical
          component: application
        annotations:
          summary: "VoiceAssist application is down"
          description: "Application {{ $labels.instance }} is not responding"

      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m]) /
          rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
          component: application
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} over last 5 minutes"

      # Slow response times
      - alert: SlowResponseTime
        expr: |
          histogram_quantile(0.95,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
          component: application
        annotations:
          summary: "Slow API response times"
          description: "95th percentile response time is {{ $value }}s"

      # High CPU usage
      - alert: HighCPUUsage
        expr: |
          100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}% on {{ $labels.instance }}"

      # High memory usage
      - alert: HighMemoryUsage
        expr: |
          (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 10m
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}% on {{ $labels.instance }}"

      # Database connection pool exhaustion
      - alert: DatabaseConnectionPoolExhausted
        expr: |
          pg_stat_database_numbackends / pg_settings_max_connections > 0.8
        for: 5m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "Database connections at {{ $value | humanizePercentage }} of maximum"

      # Database down
      - alert: DatabaseDown
        expr: up{job="postgresql"} == 0
        for: 1m
        labels:
          severity: critical
          component: database
        annotations:
          summary: "PostgreSQL database is down"
          description: "Database {{ $labels.instance }} is not responding"

      # Redis down
      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
          component: cache
        annotations:
          summary: "Redis is down"
          description: "Redis {{ $labels.instance }} is not responding"

      # High Redis memory usage
      - alert: HighRedisMemory
        expr: |
          redis_memory_used_bytes / redis_memory_max_bytes > 0.9
        for: 5m
        labels:
          severity: warning
          component: cache
        annotations:
          summary: "Redis memory usage high"
          description: "Redis memory usage at {{ $value | humanizePercentage }}"

      # Disk space low
      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 20
        for: 10m
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "Low disk space"
          description: "Only {{ $value }}% disk space remaining on {{ $labels.instance }}"

      # Certificate expiration
      - alert: SSLCertificateExpiring
        expr: |
          (ssl_certificate_expiry_seconds - time()) / 86400 < 30
        for: 1h
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "SSL certificate expiring soon"
          description: "SSL certificate expires in {{ $value }} days"
```

### AlertManager Configuration

```yaml
# Create monitoring/alertmanager.yml
global:
  resolve_timeout: 5m
  slack_api_url: '${SLACK_WEBHOOK_URL}'

# Default route
route:
  receiver: 'default'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

  routes:
    # Critical alerts -> PagerDuty + Slack
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true

    - match:
        severity: critical
      receiver: 'slack-critical'

    # Warning alerts -> Slack only
    - match:
        severity: warning
      receiver: 'slack-warnings'

# Receivers
receivers:
  - name: 'default'
    slack_configs:
      - channel: '#voiceassist-alerts'
        title: 'VoiceAssist Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ .Annotations.description }}\n{{ end }}'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'

  - name: 'slack-critical'
    slack_configs:
      - channel: '#voiceassist-critical'
        username: 'AlertManager'
        color: 'danger'
        title: '🔴 CRITICAL: {{ .GroupLabels.alertname }}'
        text: |
          *Summary:* {{ .CommonAnnotations.summary }}
          *Description:* {{ .CommonAnnotations.description }}
          *Severity:* {{ .GroupLabels.severity }}
          *Component:* {{ .GroupLabels.component }}

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#voiceassist-alerts'
        username: 'AlertManager'
        color: 'warning'
        title: '⚠️  WARNING: {{ .GroupLabels.alertname }}'
        text: |
          *Summary:* {{ .CommonAnnotations.summary }}
          *Description:* {{ .CommonAnnotations.description }}
          *Severity:* {{ .GroupLabels.severity }}
          *Component:* {{ .GroupLabels.component }}

  - name: 'email-ops'
    email_configs:
      - to: 'ops-team@voiceassist.local'
        from: 'alertmanager@voiceassist.local'
        smarthost: 'smtp.gmail.com:587'
        auth_username: '${SMTP_USERNAME}'
        auth_password: '${SMTP_PASSWORD}'
        headers:
          Subject: '[VoiceAssist] {{ .GroupLabels.alertname }}'
```

### Deploy Monitoring Stack

```bash
# Create monitoring directory
mkdir -p /Users/mohammednazmy/VoiceAssist/monitoring/grafana/{provisioning,dashboards}

# Start monitoring stack
docker compose up -d prometheus grafana alertmanager node-exporter postgres-exporter redis-exporter

# Verify services
docker compose ps | grep -E "(prometheus|grafana|alertmanager)"

# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Access Grafana
echo "Grafana: http://localhost:3000 (admin/admin)"
echo "Prometheus: http://localhost:9090"
echo "AlertManager: http://localhost:9093"
```

---

## Grafana Dashboards

### Provision Datasource

```yaml
# Create monitoring/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Provision Dashboards

```yaml
# Create monitoring/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1

providers:
  - name: 'VoiceAssist'
    orgId: 1
    folder: 'VoiceAssist V2'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

### Application Overview Dashboard

```json
// Create monitoring/grafana/dashboards/application-overview.json
{
  "dashboard": {
    "title": "VoiceAssist - Application Overview",
    "tags": ["voiceassist", "application"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"voiceassist-app\"}[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p95"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "5xx errors"
          }
        ]
      },
      {
        "title": "Active Instances",
        "type": "stat",
        "targets": [
          {
            "expr": "count(up{job=\"voiceassist-app\"} == 1)"
          }
        ]
      }
    ]
  }
}
```

### Database Dashboard

```json
// Create monitoring/grafana/dashboards/database.json
{
  "dashboard": {
    "title": "VoiceAssist - Database",
    "tags": ["voiceassist", "database", "postgresql"],
    "panels": [
      {
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends",
            "legendFormat": "Active connections"
          }
        ]
      },
      {
        "title": "Query Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(pg_stat_database_tup_fetched[5m])",
            "legendFormat": "Rows fetched/sec"
          }
        ]
      },
      {
        "title": "Database Size",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_database_size_bytes",
            "legendFormat": "Database size"
          }
        ]
      },
      {
        "title": "Cache Hit Ratio",
        "type": "gauge",
        "targets": [
          {
            "expr": "rate(pg_stat_database_blks_hit[5m]) / (rate(pg_stat_database_blks_hit[5m]) + rate(pg_stat_database_blks_read[5m]))"
          }
        ]
      }
    ]
  }
}
```

### Import Pre-built Dashboards

```bash
# Import Node Exporter dashboard
curl -X POST http://localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "dashboard": {
      "id": null,
      "uid": null,
      "title": "Node Exporter Full",
      "gnetId": 1860
    },
    "overwrite": false,
    "inputs": [
      {
        "name": "DS_PROMETHEUS",
        "type": "datasource",
        "pluginId": "prometheus",
        "value": "Prometheus"
      }
    ]
  }'

# Import PostgreSQL dashboard
curl -X POST http://localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "dashboard": {
      "id": null,
      "uid": null,
      "title": "PostgreSQL Database",
      "gnetId": 9628
    },
    "overwrite": false,
    "inputs": [
      {
        "name": "DS_PROMETHEUS",
        "type": "datasource",
        "pluginId": "prometheus",
        "value": "Prometheus"
      }
    ]
  }'

# Import Redis dashboard
curl -X POST http://localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "dashboard": {
      "id": null,
      "uid": null,
      "title": "Redis Dashboard",
      "gnetId": 11835
    },
    "overwrite": false,
    "inputs": [
      {
        "name": "DS_PROMETHEUS",
        "type": "datasource",
        "pluginId": "prometheus",
        "value": "Prometheus"
      }
    ]
  }'
```

---

## Application Metrics

### Instrument Application Code

```python
# Add to application code (e.g., app/monitoring.py)
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from fastapi import FastAPI, Response
import time

app = FastAPI()

# Metrics
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint']
)

ACTIVE_REQUESTS = Gauge(
    'http_requests_active',
    'Number of active HTTP requests',
    ['method', 'endpoint']
)

DB_CONNECTION_POOL = Gauge(
    'db_connection_pool_size',
    'Database connection pool size',
    ['state']  # active, idle
)

CACHE_OPERATIONS = Counter(
    'cache_operations_total',
    'Total cache operations',
    ['operation', 'status']  # get/set, hit/miss
)

# Middleware to track metrics
@app.middleware("http")
async def track_metrics(request, call_next):
    method = request.method
    endpoint = request.url.path

    ACTIVE_REQUESTS.labels(method=method, endpoint=endpoint).inc()

    start_time = time.time()
    try:
        response = await call_next(request)
        status = response.status_code
    except Exception as e:
        status = 500
        raise
    finally:
        duration = time.time() - start_time

        REQUEST_COUNT.labels(
            method=method,
            endpoint=endpoint,
            status=status
        ).inc()

        REQUEST_DURATION.labels(
            method=method,
            endpoint=endpoint
        ).observe(duration)

        ACTIVE_REQUESTS.labels(method=method, endpoint=endpoint).dec()

    return response

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    return Response(
        content=generate_latest(),
        media_type="text/plain"
    )

# Custom metric tracking
def track_cache_operation(operation: str, hit: bool):
    """Track cache hit/miss"""
    status = "hit" if hit else "miss"
    CACHE_OPERATIONS.labels(operation=operation, status=status).inc()

def update_connection_pool_metrics(active: int, idle: int):
    """Update database connection pool metrics"""
    DB_CONNECTION_POOL.labels(state="active").set(active)
    DB_CONNECTION_POOL.labels(state="idle").set(idle)
```

### Custom Business Metrics

```python
# Track business-specific metrics
from prometheus_client import Counter, Gauge

# User metrics
USER_REGISTRATIONS = Counter(
    'user_registrations_total',
    'Total user registrations'
)

ACTIVE_USERS = Gauge(
    'active_users',
    'Number of currently active users'
)

# Conversation metrics
CONVERSATIONS_CREATED = Counter(
    'conversations_created_total',
    'Total conversations created'
)

MESSAGES_SENT = Counter(
    'messages_sent_total',
    'Total messages sent',
    ['conversation_type']
)

# Voice processing metrics
VOICE_PROCESSING_DURATION = Histogram(
    'voice_processing_duration_seconds',
    'Voice processing duration in seconds'
)

VOICE_PROCESSING_ERRORS = Counter(
    'voice_processing_errors_total',
    'Total voice processing errors',
    ['error_type']
)

# Usage in application
def create_conversation(user_id: int):
    CONVERSATIONS_CREATED.inc()
    # ... rest of the logic

def send_message(conversation_id: int, message: str):
    MESSAGES_SENT.labels(conversation_type="text").inc()
    # ... rest of the logic

def process_voice(audio_data: bytes):
    start_time = time.time()
    try:
        result = process_audio(audio_data)
        VOICE_PROCESSING_DURATION.observe(time.time() - start_time)
        return result
    except Exception as e:
        VOICE_PROCESSING_ERRORS.labels(error_type=type(e).__name__).inc()
        raise
```

---

## Log Aggregation

### Structured Logging

```python
# Configure structured logging
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }

        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id

        if hasattr(record, 'request_id'):
            log_data['request_id'] = record.request_id

        return json.dumps(log_data)

# Configure logger
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())

logger = logging.getLogger('voiceassist')
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Usage
logger.info("User logged in", extra={'user_id': 123})
logger.error("Database connection failed", exc_info=True)
```

### Centralized Logging with Loki

```yaml
# Add to docker-compose.yml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki-config.yml:/etc/loki/local-config.yaml
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./monitoring/promtail-config.yml:/etc/promtail/config.yml
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki

volumes:
  loki_data:
```

```yaml
# Create monitoring/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 168h

storage_config:
  boltdb:
    directory: /loki/index
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
```

```yaml
# Create monitoring/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
```

```bash
# Add Loki datasource to Grafana
curl -X POST http://localhost:3000/api/datasources \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "name": "Loki",
    "type": "loki",
    "url": "http://loki:3100",
    "access": "proxy",
    "isDefault": false
  }'
```

---

## Health Checks

### Application Health Endpoints

```python
# Comprehensive health check endpoints
from fastapi import APIRouter, status
from typing import Dict
import asyncio

router = APIRouter()

@router.get("/health")
async def health_check() -> Dict:
    """Basic health check - always returns 200 if app is running"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0"
    }

@router.get("/ready")
async def readiness_check() -> Dict:
    """Readiness check - verifies all dependencies"""
    checks = {
        "database": await check_database(),
        "redis": await check_redis(),
        "qdrant": await check_qdrant()
    }

    all_healthy = all(checks.values())

    return {
        "status": "ready" if all_healthy else "not_ready",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks
    }

async def check_database() -> bool:
    """Check database connectivity"""
    try:
        await db.execute("SELECT 1")
        return True
    except Exception:
        return False

async def check_redis() -> bool:
    """Check Redis connectivity"""
    try:
        redis_client.ping()
        return True
    except Exception:
        return False

async def check_qdrant() -> bool:
    """Check Qdrant connectivity"""
    try:
        response = await http_client.get("http://qdrant:6333/healthz")
        return response.status_code == 200
    except Exception:
        return False

@router.get("/live")
async def liveness_check() -> Dict:
    """Liveness check - for Kubernetes/Docker"""
    return {"status": "alive"}
```

### Docker Health Checks

```yaml
# Update docker-compose.yml with health checks
services:
  voiceassist-server:
    # ... existing config ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    # ... existing config ...
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U voiceassist"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    # ... existing config ...
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  qdrant:
    # ... existing config ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Monitoring Operations

### Daily Monitoring Routine

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-monitoring-daily

echo "VoiceAssist Daily Monitoring Report - $(date)"
echo "=============================================="
echo ""

# 1. Check all services are up
echo "1. Service Health:"
docker compose ps | grep -E "(Up|healthy)" | wc -l
docker compose ps
echo ""

# 2. Check Prometheus targets
echo "2. Prometheus Targets:"
curl -s http://localhost:9090/api/v1/targets | \
  jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
echo ""

# 3. Check for active alerts
echo "3. Active Alerts:"
curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.status.state=="active") | {name: .labels.alertname, severity: .labels.severity}'
echo ""

# 4. Resource usage summary
echo "4. Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" | head -10
echo ""

# 5. Error rate (last 24 hours)
echo "5. Error Rate (24h):"
docker compose logs --since 24h voiceassist-server | grep -i error | wc -l
echo ""

# 6. Database health
echo "6. Database Health:"
docker compose exec -T postgres psql -U voiceassist -d voiceassist <<EOF
SELECT
    'Connections' as metric,
    count(*)::text as value
FROM pg_stat_activity
UNION ALL
SELECT
    'Database Size',
    pg_size_pretty(pg_database_size('voiceassist'))
UNION ALL
SELECT
    'Cache Hit Ratio',
    round((sum(blks_hit) * 100.0 / NULLIF(sum(blks_hit) + sum(blks_read), 0))::numeric, 2)::text || '%'
FROM pg_stat_database;
EOF
echo ""

# 7. Backup status
echo "7. Last Backup:"
ls -lh /backups/postgres/daily/*.dump.gz 2>/dev/null | tail -1
echo ""

echo "=============================================="
echo "Report completed"
```

### Troubleshooting Monitoring Issues

#### Prometheus Not Scraping Targets

```bash
# Check Prometheus logs
docker compose logs prometheus | tail -50

# Check target configuration
curl -s http://localhost:9090/api/v1/targets | jq '.'

# Verify network connectivity
docker compose exec prometheus wget -O- http://voiceassist-server:8000/metrics

# Reload Prometheus configuration
curl -X POST http://localhost:9090/-/reload
```

#### Grafana Dashboards Not Loading

```bash
# Check Grafana logs
docker compose logs grafana | tail -50

# Verify datasource connection
curl -s http://localhost:3000/api/datasources \
  -u admin:admin | jq '.'

# Test Prometheus connection from Grafana
curl -s http://localhost:3000/api/datasources/proxy/1/api/v1/query?query=up \
  -u admin:admin | jq '.'

# Restart Grafana
docker compose restart grafana
```

#### Alerts Not Firing

```bash
# Check AlertManager status
curl -s http://localhost:9093/api/v1/status | jq '.'

# Check alert rules in Prometheus
curl -s http://localhost:9090/api/v1/rules | jq '.'

# Check specific alert state
curl -s 'http://localhost:9090/api/v1/query?query=ALERTS{alertname="HighErrorRate"}' | jq '.'

# Verify AlertManager configuration
docker compose exec alertmanager amtool config show

# Check AlertManager logs
docker compose logs alertmanager | tail -50
```

---

## Monitoring Best Practices

### 1. Define SLOs (Service Level Objectives)

```yaml
# Document SLOs
SLOs:
  - name: Availability
    target: 99.9%
    measurement: uptime over 30 days

  - name: Response Time
    target: p95 < 500ms
    measurement: 95th percentile of all API requests

  - name: Error Rate
    target: < 0.1%
    measurement: 5xx errors / total requests

  - name: Data Durability
    target: 99.999%
    measurement: no data loss events
```

### 2. Alert Fatigue Prevention

```yaml
# Guidelines for creating alerts:
# - Alert on symptoms, not causes
# - Make alerts actionable
# - Include runbook links
# - Set appropriate thresholds
# - Use proper severity levels
# - Group related alerts

# Good alert example:
- alert: UserFacingErrorRate
  expr: rate(http_requests_total{status="500"}[5m]) > 0.05
  for: 5m
  annotations:
    summary: "High user-facing error rate"
    description: "More than 5% of requests failing"
    runbook_url: "https://docs.voiceassist.local/runbooks/troubleshooting#high-error-rate"

# Bad alert example (too noisy):
- alert: SingleError
  expr: increase(http_requests_total{status="500"}[1m]) > 0
  for: 0s
```

### 3. Dashboard Organization

```
Dashboards Structure:
├── Executive Dashboard (high-level KPIs)
├── Application Overview (request rate, errors, latency)
├── Infrastructure (CPU, memory, disk, network)
├── Database Performance (connections, queries, cache hit ratio)
├── Cache Performance (Redis operations, memory, hit rate)
├── Business Metrics (users, conversations, messages)
└── On-Call Dashboard (active alerts, recent incidents)
```

---

## Related Documentation

- [Incident Response Runbook](./INCIDENT_RESPONSE.md)
- [Troubleshooting Runbook](./TROUBLESHOOTING.md)
- [Deployment Runbook](./DEPLOYMENT.md)
- [Scaling Runbook](./SCALING.md)
- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Quarterly
**Next Review**: 2026-02-21
