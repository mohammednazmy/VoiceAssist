# VoiceAssist V2 Observability

**Purpose**: This document defines observability patterns for monitoring, logging, and alerting across all VoiceAssist services.

**Last Updated**: 2025-11-20

---

## Overview

VoiceAssist V2 uses a three-pillar observability approach:
1. **Metrics** - Prometheus for time-series metrics
2. **Logs** - Structured logging with trace IDs
3. **Traces** - Distributed tracing (optional in Phase 11-14)

---

## Standard Service Endpoints

Every service must expose these endpoints:

### Health Check (Liveness)

**Endpoint**: `GET /health`

**Purpose**: Kubernetes liveness probe - is the service process running?

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-20T12:34:56.789Z",
  "service": "kb-service",
  "version": "2.0.0"
}
```

**FastAPI Example**:
```python
from fastapi import APIRouter
from datetime import datetime

router = APIRouter(tags=["observability"])

@router.get("/health")
async def health_check():
    """Liveness probe - is service running?"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "kb-service",
        "version": "2.0.0",
    }
```

---

### Readiness Check (Dependencies)

**Endpoint**: `GET /ready`

**Purpose**: Kubernetes readiness probe - are dependencies available?

**Checks**:
- Database connection (PostgreSQL)
- Redis connection
- Qdrant connection (if KB service)
- Nextcloud API (if applicable)

**Response (Healthy)**:
```json
{
  "status": "ready",
  "timestamp": "2025-11-20T12:34:56.789Z",
  "dependencies": {
    "postgres": "healthy",
    "redis": "healthy",
    "qdrant": "healthy"
  }
}
```

**Response (Degraded)**:
```json
{
  "status": "degraded",
  "timestamp": "2025-11-20T12:34:56.789Z",
  "dependencies": {
    "postgres": "healthy",
    "redis": "unhealthy",
    "qdrant": "healthy"
  }
}
```

**FastAPI Example**:
```python
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

@router.get("/ready")
async def readiness_check(
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Readiness probe - are dependencies healthy?"""

    dependencies = {}
    all_healthy = True

    # Check PostgreSQL
    try:
        await db.execute("SELECT 1")
        dependencies["postgres"] = "healthy"
    except Exception as e:
        dependencies["postgres"] = "unhealthy"
        all_healthy = False
        logger.error(f"PostgreSQL health check failed: {e}")

    # Check Redis
    try:
        await redis.ping()
        dependencies["redis"] = "healthy"
    except Exception as e:
        dependencies["redis"] = "unhealthy"
        all_healthy = False
        logger.error(f"Redis health check failed: {e}")

    # Check Qdrant (if KB service)
    if settings.SERVICE_NAME == "kb-service":
        try:
            await qdrant_client.health_check()
            dependencies["qdrant"] = "healthy"
        except Exception as e:
            dependencies["qdrant"] = "unhealthy"
            all_healthy = False
            logger.error(f"Qdrant health check failed: {e}")

    status_code = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_healthy else "degraded",
            "timestamp": datetime.utcnow().isoformat(),
            "dependencies": dependencies,
        }
    )
```

---

### Prometheus Metrics

**Endpoint**: `GET /metrics`

**Purpose**: Export metrics in Prometheus format

**Response**: Plain text Prometheus metrics

**FastAPI Setup**:
```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Define metrics
chat_requests_total = Counter(
    'chat_requests_total',
    'Total chat requests',
    ['intent', 'phi_detected']
)

kb_search_duration_seconds = Histogram(
    'kb_search_duration_seconds',
    'KB search duration',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

tool_failure_total = Counter(
    'tool_failure_total',
    'External tool failures',
    ['tool', 'error_type']
)

phi_redacted_total = Counter(
    'phi_redacted_total',
    'PHI redaction events'
)

indexing_jobs_active = Gauge(
    'indexing_jobs_active',
    'Currently running indexing jobs'
)

@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
```

---

## Key Metrics

### Chat & Query Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `chat_requests_total` | Counter | `intent`, `phi_detected` | Total chat requests by intent |
| `chat_duration_seconds` | Histogram | `intent` | End-to-end chat latency |
| `streaming_messages_total` | Counter | `completed` | Streaming message count |
| `phi_detected_total` | Counter | - | PHI detection events |
| `phi_redacted_total` | Counter | - | PHI redaction events |

**Usage in Code**:
```python
async def process_chat(request: ChatRequest):
    phi_detected = await phi_detector.detect(request.message)

    # Increment counter
    chat_requests_total.labels(
        intent=request.intent,
        phi_detected=str(phi_detected.contains_phi)
    ).inc()

    # Time the request
    with chat_duration_seconds.labels(intent=request.intent).time():
        response = await conductor.process_query(request)

    if phi_detected.contains_phi:
        phi_detected_total.inc()

    return response
```

### KB & Search Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `kb_search_duration_seconds` | Histogram | `source_type` | KB search latency |
| `kb_search_results_total` | Histogram | - | Number of results returned |
| `kb_cache_hits_total` | Counter | - | Redis cache hits |
| `kb_cache_misses_total` | Counter | - | Redis cache misses |
| `embedding_generation_duration_seconds` | Histogram | - | Embedding generation time |

### Indexing Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `indexing_jobs_active` | Gauge | - | Currently running jobs |
| `indexing_jobs_total` | Counter | `state` | Total jobs by final state |
| `indexing_duration_seconds` | Histogram | - | Time to index document |
| `chunks_created_total` | Counter | `source_type` | Total chunks created |

### Tool Invocation Metrics

VoiceAssist uses a comprehensive tools system (see [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md)) that requires detailed observability.

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `voiceassist_tool_calls_total` | Counter | `tool_name`, `status` | Total tool calls by status (completed, failed, timeout, cancelled) |
| `voiceassist_tool_execution_duration_seconds` | Histogram | `tool_name` | Tool execution duration (p50, p95, p99) |
| `voiceassist_tool_confirmation_required_total` | Counter | `tool_name`, `confirmed` | Tool calls requiring user confirmation |
| `voiceassist_tool_phi_detected_total` | Counter | `tool_name` | Tool calls with PHI detected |
| `voiceassist_tool_errors_total` | Counter | `tool_name`, `error_code` | Tool execution errors by code |
| `voiceassist_tool_timeouts_total` | Counter | `tool_name` | Tool execution timeouts |
| `voiceassist_tool_active_calls` | Gauge | `tool_name` | Currently executing tool calls |

**Status Label Values:**
- `completed` - Tool executed successfully
- `failed` - Tool execution failed with error
- `timeout` - Tool execution exceeded timeout
- `cancelled` - User cancelled tool execution

**Common Error Codes:**
- `VALIDATION_ERROR` - Invalid arguments
- `PERMISSION_DENIED` - User lacks permission
- `EXTERNAL_API_ERROR` - External service failure
- `TIMEOUT` - Execution timeout
- `PHI_VIOLATION` - PHI sent to non-PHI tool

**Usage in Tool Execution:**
```python
# server/app/services/orchestration/tool_executor.py
from prometheus_client import Counter, Histogram, Gauge
from contextvars import ContextVar
import time

# Metrics
tool_calls_total = Counter(
    'voiceassist_tool_calls_total',
    'Total tool invocations',
    ['tool_name', 'status']
)

tool_execution_duration = Histogram(
    'voiceassist_tool_execution_duration_seconds',
    'Tool execution duration',
    ['tool_name'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
)

tool_confirmation_required = Counter(
    'voiceassist_tool_confirmation_required_total',
    'Tool calls requiring confirmation',
    ['tool_name', 'confirmed']
)

tool_phi_detected = Counter(
    'voiceassist_tool_phi_detected_total',
    'Tool calls with PHI detected',
    ['tool_name']
)

tool_errors = Counter(
    'voiceassist_tool_errors_total',
    'Tool execution errors',
    ['tool_name', 'error_code']
)

tool_timeouts = Counter(
    'voiceassist_tool_timeouts_total',
    'Tool execution timeouts',
    ['tool_name']
)

tool_active_calls = Gauge(
    'voiceassist_tool_active_calls',
    'Currently executing tool calls',
    ['tool_name']
)

async def execute_tool(
    tool_name: str,
    args: dict,
    user: UserContext,
    trace_id: str,
) -> ToolResult:
    """
    Execute a tool with comprehensive metrics tracking.

    See: docs/TOOLS_AND_INTEGRATIONS.md
    See: docs/ORCHESTRATION_DESIGN.md#tool-execution-engine
    """
    start_time = time.time()
    status = "failed"  # Default to failed

    # Increment active calls
    tool_active_calls.labels(tool_name=tool_name).inc()

    try:
        # Get tool definition
        tool_def = TOOL_REGISTRY.get(tool_name)
        if not tool_def:
            tool_errors.labels(tool_name=tool_name, error_code="TOOL_NOT_FOUND").inc()
            raise ToolNotFoundError(f"Tool {tool_name} not found")

        # Check for PHI in arguments
        phi_result = await phi_detector.detect_in_dict(args)
        if phi_result.contains_phi:
            tool_phi_detected.labels(tool_name=tool_name).inc()

            # Ensure tool allows PHI
            if not tool_def.allows_phi:
                tool_errors.labels(tool_name=tool_name, error_code="PHI_VIOLATION").inc()
                raise ToolPHIViolationError(
                    f"Tool {tool_name} cannot process PHI"
                )

        # Check if confirmation required
        if tool_def.requires_confirmation:
            confirmed = await request_user_confirmation(tool_name, args, user, trace_id)
            tool_confirmation_required.labels(
                tool_name=tool_name,
                confirmed=str(confirmed).lower()
            ).inc()

            if not confirmed:
                status = "cancelled"
                return ToolResult(
                    success=False,
                    error_code="USER_CANCELLED",
                    error_message="User cancelled tool execution"
                )

        # Execute tool with timeout
        timeout_seconds = tool_def.timeout_seconds
        try:
            async with asyncio.timeout(timeout_seconds):
                result = await tool_def.execute(args, user, trace_id)
                status = "completed"
                return result

        except asyncio.TimeoutError:
            status = "timeout"
            tool_timeouts.labels(tool_name=tool_name).inc()
            raise ToolTimeoutError(
                f"Tool {tool_name} exceeded timeout ({timeout_seconds}s)"
            )

    except ToolError as e:
        status = "failed"
        tool_errors.labels(tool_name=tool_name, error_code=e.error_code).inc()
        raise

    except Exception as e:
        status = "failed"
        tool_errors.labels(tool_name=tool_name, error_code="UNKNOWN_ERROR").inc()
        raise

    finally:
        # Record metrics
        duration = time.time() - start_time
        tool_execution_duration.labels(tool_name=tool_name).observe(duration)
        tool_calls_total.labels(tool_name=tool_name, status=status).inc()
        tool_active_calls.labels(tool_name=tool_name).dec()

        # Structured logging
        logger.info(
            "Tool execution completed",
            extra={
                "tool_name": tool_name,
                "status": status,
                "duration_ms": int(duration * 1000),
                "phi_detected": phi_result.contains_phi if 'phi_result' in locals() else False,
                "trace_id": trace_id,
                "user_id": user.id,
            }
        )
```

### External Tool Metrics (Legacy)

For backward compatibility, external API calls also emit these metrics:

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `tool_requests_total` | Counter | `tool` | Total external API requests (legacy) |
| `tool_failure_total` | Counter | `tool`, `error_type` | External tool failures (legacy) |
| `tool_duration_seconds` | Histogram | `tool` | External tool latency (legacy) |

**Note**: New code should use `voiceassist_tool_*` metrics above. These legacy metrics are maintained for backward compatibility with Phase 5 implementations.

---

## Logging Conventions

### Log Structure

Every log line must include:
- `timestamp` (ISO 8601 UTC)
- `level` (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- `service` (service name)
- `trace_id` (from request)
- `message` (log message)
- `session_id` (if applicable)
- `user_id` (if applicable, never with PHI)

**JSON Format**:
```json
{
  "timestamp": "2025-11-20T12:34:56.789Z",
  "level": "INFO",
  "service": "kb-service",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "abc123",
  "user_id": "user_456",
  "message": "KB search completed",
  "duration_ms": 1234,
  "results_count": 5
}
```

### Python Logging Setup

```python
import logging
import json
from datetime import datetime
from contextvars import ContextVar

# Context var for trace_id
trace_id_var: ContextVar[str] = ContextVar('trace_id', default='')

class JSONFormatter(logging.Formatter):
    """Format logs as JSON."""

    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "service": settings.SERVICE_NAME,
            "trace_id": trace_id_var.get(),
            "message": record.getMessage(),
        }

        # Add extra fields
        if hasattr(record, 'session_id'):
            log_data['session_id'] = record.session_id
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        if hasattr(record, 'duration_ms'):
            log_data['duration_ms'] = record.duration_ms

        # Add exception info
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        return json.dumps(log_data)

# Configure logger
logger = logging.getLogger("voiceassist")
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)
logger.setLevel(logging.INFO)
```

### PHI Logging Rules

**CRITICAL**: PHI must NEVER be logged directly.

**Allowed**:
- Session IDs (UUIDs)
- User IDs (UUIDs)
- Document IDs
- Trace IDs
- Intent types
- Error codes
- Counts and aggregates

**FORBIDDEN**:
- Patient names
- Patient dates of birth
- Medical record numbers
- Actual query text (if contains PHI)
- Clinical context details
- Document content

**Instead of logging query text**:
```python
# Bad - may contain PHI
logger.info(f"Processing query: {query}")

# Good - log query hash or length
logger.info(
    "Processing query",
    extra={
        "query_length": len(query),
        "query_hash": sha256(query.encode()).hexdigest()[:8],
        "phi_detected": phi_result.contains_phi,
    }
)
```

---

## Alerting Rules

### Critical Alerts (Page On-Call)

| Alert | Condition | Action |
|-------|-----------|--------|
| Service Down | Health check failing > 2 minutes | Page on-call engineer |
| Database Unavailable | PostgreSQL readiness check failing | Page DBA + engineer |
| High Error Rate | Error rate > 5% for 5 minutes | Page on-call engineer |
| PHI Leak Detected | PHI in logs or external API call | Page security team immediately |

### Warning Alerts (Slack Notification)

| Alert | Condition | Action |
|-------|-----------|--------|
| High Latency | p95 latency > 5s for 10 minutes | Notify #engineering |
| KB Search Timeouts | > 10% timeout rate for 5 minutes | Notify #engineering |
| External Tool Failures | > 20% failure rate for 10 minutes | Notify #engineering |
| Indexing Job Failures | > 3 failed jobs in 1 hour | Notify #admin |

### Example Prometheus Alert Rules

```yaml
# alerts.yml

groups:
  - name: voiceassist
    rules:
      - alert: HighChatLatency
        expr: histogram_quantile(0.95, chat_duration_seconds_bucket) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High chat latency detected"
          description: "95th percentile chat latency is {{ $value }}s"

      - alert: HighErrorRate
        expr: rate(chat_requests_total{status="error"}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: ExternalToolFailures
        expr: rate(tool_failure_total[5m]) > 0.2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High external tool failure rate"
          description: "Tool {{ $labels.tool }} failing at {{ $value | humanizePercentage }}"
```

---

## Grafana Dashboards

### Suggested Dashboards

1. **System Overview**
   - Request rate (requests/sec)
   - Error rate (%)
   - Latency (p50, p95, p99)
   - Active sessions

2. **Chat Service**
   - Chat requests by intent
   - Streaming vs non-streaming
   - PHI detection rate
   - Citations per response

3. **Knowledge Base**
   - KB search latency
   - Cache hit rate
   - Indexing job status
   - Document count by source type

4. **External Tools**
   - Tool request rate
   - Tool failure rate
   - Tool latency by tool
   - Cost tracking (API usage)

---

## Distributed Tracing (Phase 11-14)

For microservices deployment, add distributed tracing:

**Tools**: Jaeger or OpenTelemetry

**Trace Spans**:
- Chat request (root span)
  - PHI detection
  - KB search
  - External tool calls (parallel)
  - LLM generation
  - Safety filters

**Benefits**:
- Visualize request flow across services
- Identify bottlenecks
- Debug distributed failures

---

## Related Documentation

- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - HIPAA logging requirements
- [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md) - Admin metrics dashboard
- [server/README.md](../server/README.md) - API implementation

---

## Summary

- All services expose `/health`, `/ready`, `/metrics`
- Metrics use Prometheus format
- Logs use structured JSON with trace IDs
- PHI must NEVER be logged
- Critical alerts page on-call
- Grafana dashboards for monitoring
