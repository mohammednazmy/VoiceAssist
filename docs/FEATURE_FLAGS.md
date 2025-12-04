---
title: "Feature Flags"
slug: "feature-flags"
summary: "Runtime feature toggling and configuration management system"
ai_summary: Feature flags enable runtime toggles without deployments. Use category.feature_name pattern (e.g., ui.dark_mode, backend.rag_strategy). Stored in PostgreSQL, cached in Redis (5min TTL). See admin-guide/feature-flags/ for detailed docs.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-04"
audience: ["developers", "admin", "ai-agents"]
tags: ["feature", "flags", "configuration", "runtime"]
category: reference
---

# Feature Flags System

**Last Updated**: 2025-11-21 (Phase 7 - P3.1)
**Purpose**: Runtime feature toggling and configuration management

---

## Overview

VoiceAssist V2 includes a comprehensive feature flag system for runtime feature management, A/B testing, and gradual rollouts. Feature flags are persisted in PostgreSQL and cached in Redis for performance.

### Key Features

- **Runtime Configuration**: Toggle features without code deployments
- **Multiple Value Types**: Boolean, string, number, and JSON flags
- **Redis Caching**: 5-minute TTL for fast access (300s)
- **Admin API**: Full CRUD operations via REST API
- **Graceful Degradation**: System continues with defaults if flags unavailable
- **Automatic Cache Invalidation**: Cache cleared on flag updates

---

## Architecture

```
┌─────────────────┐
│  Application    │
│  Code           │──┐
└─────────────────┘  │
                     │  1. Check feature flag
                     ▼
         ┌──────────────────────┐
         │  Feature Flag        │
         │  Service             │
         └──────────────────────┘
                 │
         ┌───────┴─────────┐
         │                 │
    2. Cache Hit?     3. Cache Miss
         │                 │
         ▼                 ▼
    ┌─────────┐      ┌──────────────┐
    │  Redis  │      │  PostgreSQL  │
    │  Cache  │◄─────│  feature_    │
    │  (L2)   │  4.  │  flags       │
    └─────────┘ Cache │  table       │
                      └──────────────┘
```

### Data Flow

1. **Application** checks feature flag using `feature_gate()` or `require_feature()`
2. **Feature Flag Service** checks Redis cache first (L2)
3. **Cache miss**: Query PostgreSQL `feature_flags` table
4. **Cache result** in Redis with 5-minute TTL
5. **Return** feature value to application

---

## Database Schema

### `feature_flags` Table

```sql
CREATE TABLE feature_flags (
    name VARCHAR(255) PRIMARY KEY,        -- Unique identifier
    description TEXT NOT NULL,             -- Human-readable description
    flag_type VARCHAR(50) NOT NULL        -- 'boolean', 'string', 'number', 'json'
        DEFAULT 'boolean',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,-- Boolean flag state
    value JSON NULL,                       -- Non-boolean value
    default_value JSON NULL,               -- Default when flag not found
    created_at TIMESTAMP NOT NULL          -- Creation timestamp
        DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL          -- Last update timestamp
        DEFAULT NOW(),
    metadata JSON NULL                     -- Additional metadata (tags, owner, etc.)
);

-- Indexes
CREATE INDEX ix_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX ix_feature_flags_flag_type ON feature_flags(flag_type);
```

### Migration

Feature flags table created by Alembic migration:

- **File**: `alembic/versions/003_add_feature_flags.py`
- **Revision**: `003`
- **Revises**: `002` (audit_logs)

---

## Usage

### 1. Boolean Feature Flags

#### Check if Feature Enabled

```python
from app.core.feature_flags import feature_gate, FeatureFlags

async def some_endpoint():
    if await feature_gate(FeatureFlags.RBAC_ENFORCEMENT):
        # RBAC enforcement enabled
        await check_permissions(user)
    else:
        # RBAC enforcement disabled
        pass
```

#### Require Feature (Decorator)

```python
from app.core.feature_flags import require_feature

@router.get("/beta-feature")
@require_feature("beta_features", default=False)
async def beta_feature():
    """This endpoint only accessible if 'beta_features' flag is enabled."""
    return {"message": "Beta feature enabled"}
```

### 2. Value-Based Feature Flags

#### Get String Value

```python
from app.core.feature_flags import get_feature_value, FeatureFlags

# Get RAG strategy
rag_strategy = await get_feature_value(FeatureFlags.RAG_STRATEGY, default="simple")

if rag_strategy == "multi_hop":
    # Use multi-hop RAG strategy
    pass
elif rag_strategy == "hybrid":
    # Use hybrid strategy
    pass
else:
    # Use simple strategy
    pass
```

#### Get Number Value

```python
# Get maximum search results
max_results = await get_feature_value(FeatureFlags.RAG_MAX_RESULTS, default=5)
search_results = await search_service.search(query, top_k=max_results)

# Get score threshold
score_threshold = await get_feature_value(FeatureFlags.RAG_SCORE_THRESHOLD, default=0.2)
filtered_results = [r for r in results if r.score >= score_threshold]
```

### 3. Direct Service Access

```python
from app.services.feature_flags import feature_flag_service

# Check enabled state
enabled = await feature_flag_service.is_enabled("experimental_api", default=False)

# Get value
value = await feature_flag_service.get_value("rag_strategy", default="simple")

# Get complete flag object
flag = await feature_flag_service.get_flag("rbac_enforcement", db)
```

---

## Admin API

All feature flag management endpoints require **admin authentication** (RBAC).

### Base URL

```
/api/admin/feature-flags
```

### Endpoints

#### 1. List All Feature Flags

```http
GET /api/admin/feature-flags
Authorization: Bearer <admin_jwt_token>
```

**Response**:

```json
{
  "success": true,
  "data": {
    "flags": [
      {
        "name": "rbac_enforcement",
        "description": "Enable RBAC permission checks",
        "flag_type": "boolean",
        "enabled": true,
        "value": null,
        "default_value": true,
        "created_at": "2025-11-21T08:00:00Z",
        "updated_at": "2025-11-21T08:00:00Z",
        "metadata": {
          "category": "security",
          "criticality": "high"
        }
      }
    ],
    "total": 1
  }
}
```

#### 2. Get Specific Feature Flag

```http
GET /api/admin/feature-flags/{flag_name}
Authorization: Bearer <admin_jwt_token>
```

#### 3. Create Feature Flag

```http
POST /api/admin/feature-flags
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "name": "new_feature",
  "description": "New experimental feature",
  "flag_type": "boolean",
  "enabled": false,
  "default_value": false,
  "metadata": {
    "category": "experimental",
    "owner": "engineering"
  }
}
```

#### 4. Update Feature Flag

```http
PATCH /api/admin/feature-flags/{flag_name}
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "enabled": true,
  "description": "Updated description"
}
```

#### 5. Delete Feature Flag

```http
DELETE /api/admin/feature-flags/{flag_name}
Authorization: Bearer <admin_jwt_token>
```

#### 6. Toggle Feature Flag

Quick toggle endpoint for boolean flags:

```http
POST /api/admin/feature-flags/{flag_name}/toggle
Authorization: Bearer <admin_jwt_token>
```

**Response**: Updated flag with `enabled` state toggled.

---

## Default Feature Flags

The system includes predefined feature flags for common features:

### Security & RBAC

| Flag               | Type    | Default | Description                          |
| ------------------ | ------- | ------- | ------------------------------------ |
| `rbac_enforcement` | boolean | `true`  | Enable RBAC permission checks        |
| `rbac_strict_mode` | boolean | `false` | Enable strict RBAC (deny by default) |

### Observability

| Flag              | Type    | Default | Description                    |
| ----------------- | ------- | ------- | ------------------------------ |
| `metrics_enabled` | boolean | `true`  | Enable Prometheus metrics      |
| `tracing_enabled` | boolean | `true`  | Enable OpenTelemetry tracing   |
| `logging_verbose` | boolean | `false` | Enable verbose logging (debug) |

### External Integrations

| Flag                    | Type    | Default | Description                |
| ----------------------- | ------- | ------- | -------------------------- |
| `nextcloud_integration` | boolean | `true`  | Enable Nextcloud features  |
| `openai_enabled`        | boolean | `true`  | Enable OpenAI API for RAG  |
| `nextcloud_auto_index`  | boolean | `true`  | Auto-index Nextcloud files |

### RAG Features

| Flag                  | Type   | Default    | Description                           |
| --------------------- | ------ | ---------- | ------------------------------------- |
| `rag_strategy`        | string | `"simple"` | RAG strategy: simple/multi_hop/hybrid |
| `rag_max_results`     | number | `5`        | Maximum RAG search results            |
| `rag_score_threshold` | number | `0.2`      | Minimum similarity score (0.0-1.0)    |

### Performance

| Flag             | Type    | Default | Description                    |
| ---------------- | ------- | ------- | ------------------------------ |
| `cache_enabled`  | boolean | `true`  | Enable multi-level caching     |
| `async_indexing` | boolean | `true`  | Enable async document indexing |

### Experimental

| Flag               | Type    | Default | Description                       |
| ------------------ | ------- | ------- | --------------------------------- |
| `beta_features`    | boolean | `false` | Enable beta/experimental features |
| `experimental_api` | boolean | `false` | Enable experimental API endpoints |

---

## Initialization

### Default Flags

Initialize default feature flags after database migration:

```bash
cd /Users/mohammednazmy/VoiceAssist/services/api-gateway
python scripts/init_feature_flags.py
```

**Output**:

```
✅ Feature flag initialization successful!
   - Created: 15
   - Skipped: 0
   - Errors: 0
```

### Custom Flags

Create custom flags via Admin API or directly in code:

```python
from app.services.feature_flags import feature_flag_service
from app.models.feature_flag import FeatureFlagType

# Create custom flag
flag = await feature_flag_service.create_flag(
    name="custom_feature",
    description="Custom experimental feature",
    flag_type=FeatureFlagType.BOOLEAN,
    enabled=False,
    default_value=False,
    metadata={"owner": "team-a", "jira": "VOICE-123"}
)
```

---

## Best Practices

### 1. Naming Conventions

- **Use snake_case**: `rbac_enforcement`, `openai_enabled`
- **Be descriptive**: `nextcloud_auto_index` not just `auto_index`
- **Group by domain**: `rag_strategy`, `rag_max_results`, `rag_score_threshold`

### 2. Flag Types

- **Boolean**: Simple on/off toggles
- **String**: Strategy selection, enum values
- **Number**: Thresholds, limits, sizes
- **JSON**: Complex configurations

### 3. Defaults

- Always provide `default_value` for graceful degradation
- Default should be the "safe" option (feature off, conservative limits)

### 4. Metadata

Use `metadata` field for:

- **category**: Group related flags (`"security"`, `"rag"`, `"performance"`)
- **criticality**: `"high"`, `"medium"`, `"low"`
- **owner**: Team or person responsible
- **jira/ticket**: Reference to tracking issue
- **allowed_values**: For string flags (e.g., `["simple", "multi_hop", "hybrid"]`)

### 5. Lifecycle Management

**Creation**:

1. Create flag with `enabled=false`
2. Test in development environment
3. Enable for specific users (future: user-based flags)
4. Enable globally

**Retirement**:

1. Set flag to default/safe value
2. Remove flag checks from code
3. Delete flag via Admin API
4. Verify no references remain

### 6. Monitoring

Monitor feature flag usage:

- Track flag check frequency in metrics
- Alert on flag toggle frequency (rapid changes may indicate issues)
- Log flag state changes for audit trail

---

## Caching

### Redis Cache Behavior

- **TTL**: 5 minutes (300 seconds)
- **Cache Key**: `feature_flag:{flag_name}`
- **Invalidation**: Automatic on update/delete
- **Graceful Degradation**: Queries database if Redis unavailable

### Cache Performance

- **Cache Hit**: ~1-2ms latency
- **Cache Miss (DB Query)**: ~5-10ms latency
- **Cache Invalidation**: Immediate on flag update

### Manual Cache Control

```python
from app.services.feature_flags import feature_flag_service

# Invalidate specific flag
await feature_flag_service._invalidate_cache("flag_name")

# Cache is automatically populated on next read
enabled = await feature_flag_service.is_enabled("flag_name")
```

---

## Integration Examples

### 1. RBAC Enforcement

Conditionally enforce RBAC based on flag:

```python
from app.core.dependencies import get_current_admin_user
from app.core.feature_flags import feature_gate, FeatureFlags

async def admin_only_endpoint(
    user: User = Depends(get_current_user)
):
    # Only check RBAC if enforcement enabled
    if await feature_gate(FeatureFlags.RBAC_ENFORCEMENT):
        if not user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Admin access required"
            )

    # Proceed with endpoint logic
    pass
```

### 2. RAG Strategy Selection

```python
from app.core.feature_flags import get_feature_value, FeatureFlags
from app.services.rag_service import QueryOrchestrator

async def handle_query(query: str):
    # Get RAG strategy from feature flag
    strategy = await get_feature_value(FeatureFlags.RAG_STRATEGY, default="simple")

    orchestrator = QueryOrchestrator(strategy=strategy)
    response = await orchestrator.handle_query(query)

    return response
```

### 3. Conditional Observability

```python
from app.core.feature_flags import feature_gate, FeatureFlags

async def process_request():
    # Only collect metrics if enabled
    if await feature_gate(FeatureFlags.METRICS_ENABLED):
        request_counter.inc()
        request_histogram.observe(latency)

    # Only create traces if enabled
    if await feature_gate(FeatureFlags.TRACING_ENABLED):
        with tracer.start_span("process_request") as span:
            # ... processing logic
            pass
```

---

## Troubleshooting

### Feature Flag Not Taking Effect

**Symptom**: Flag updated but changes not reflected

**Cause**: Redis cache still serving old value (5-minute TTL)

**Solution**:

1. Wait up to 5 minutes for cache to expire
2. Or manually invalidate cache:
   ```python
   await feature_flag_service._invalidate_cache("flag_name")
   ```

### Flag Returns Default Instead of Database Value

**Symptom**: Always getting default value

**Possible Causes**:

1. Flag doesn't exist in database
2. Database connection error
3. Typo in flag name

**Solution**:

1. Verify flag exists: `GET /api/admin/feature-flags/{flag_name}`
2. Check database logs for connection errors
3. Verify flag name matches constant (case-sensitive)

### Redis Connection Errors

**Symptom**: Logs show "Failed to get feature flag from cache"

**Impact**: Graceful degradation - queries database directly

**Solution**:

- Check Redis connection: `redis-cli -h redis -p 6379 -a <password> ping`
- Verify `REDIS_URL` in environment variables
- Check Redis container health: `docker ps`

---

## Security Considerations

### Access Control

- **Admin-Only API**: All feature flag management requires admin JWT token
- **RBAC Protected**: Admin API endpoints enforce `get_current_admin_user` dependency
- **Audit Logging**: All flag changes logged to audit trail

### Validation

- **Name Validation**: Max 255 characters, alphanumeric + underscores
- **Type Safety**: Flag types enforced via Pydantic models
- **Metadata Sanitization**: JSON metadata validated on creation

### Production Best Practices

1. **Limit Admin Access**: Only production admins can toggle critical flags
2. **Change Approval**: Require approval for production flag changes
3. **Rollback Plan**: Document how to revert flag changes
4. **Monitoring**: Alert on critical flag toggles (e.g., `rbac_enforcement` disabled)

---

## Related Documentation

### Feature Flag Guides (New - Recommended)

- [Feature Flags Overview](./admin-guide/feature-flags/README.md) - Comprehensive guide
- [Naming Conventions](./admin-guide/feature-flags/naming-conventions.md) - `category.feature_name` pattern
- [Feature Flag Lifecycle](./admin-guide/feature-flags/lifecycle.md) - Draft → Active → Deprecated → Removed
- [Advanced Types](./admin-guide/feature-flags/advanced-types.md) - Boolean, percentage, variant, scheduled
- [Multi-Environment](./admin-guide/feature-flags/multi-environment.md) - Dev, staging, production configs
- [Admin Panel Guide](./admin-guide/feature-flags/admin-panel-guide.md) - UI usage
- [Best Practices](./admin-guide/feature-flags/best-practices.md) - Guidelines and tips
- [System Settings vs Feature Flags](./admin-guide/system-settings-vs-flags.md) - When to use each

### Architecture & System Docs

- [UNIFIED_ARCHITECTURE.md](./UNIFIED_ARCHITECTURE.md) - System architecture
- [SERVICE_CATALOG.md](./SERVICE_CATALOG.md) - API endpoint catalog
- [SECURITY_COMPLIANCE.md](./SECURITY_COMPLIANCE.md) - Security guidelines
- [INTEGRATION_IMPROVEMENTS_PHASE_0-8.md](./INTEGRATION_IMPROVEMENTS_PHASE_0-8.md) - P3.1 implementation details

---

**Document Version**: 2.0
**Last Updated**: 2025-12-04
**Maintained By**: VoiceAssist Engineering Team
**Review Cycle**: Quarterly or after major feature additions
