# VoiceAssist API Gateway

**Version:** 2.1
**Status:** Production Ready
**Last Updated:** 2025-12-03

---

## Overview

The API Gateway is the main backend service for VoiceAssist, providing a comprehensive REST API and WebSocket interface for the medical AI assistant platform. Built with FastAPI, it handles authentication, conversation management, medical knowledge retrieval (RAG), voice processing, and admin operations.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │                 FastAPI Application              │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│   │
│  │  │  Auth   │ │  Chat   │ │  Admin  │ │  Voice ││   │
│  │  │  API    │ │  API    │ │  API    │ │  API   ││   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └───┬────┘│   │
│  │       │           │           │          │      │   │
│  │  ┌────▼───────────▼───────────▼──────────▼────┐│   │
│  │  │              Core Services                  ││   │
│  │  │  RAG │ Cache │ Audit │ Feature Flags │ KB  ││   │
│  │  └─────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌────────┐         ┌────────┐          ┌────────┐
│PostgreSQL        │ Redis  │          │ Qdrant │
│(pgvector)│        │(Cache) │          │(Vectors)
└────────┘         └────────┘          └────────┘
```

## Directory Structure

```
api-gateway/
├── app/
│   ├── api/                    # API endpoint handlers
│   │   ├── auth.py             # Authentication endpoints
│   │   ├── users.py            # User management
│   │   ├── conversations.py    # Chat/conversation management
│   │   ├── admin_panel.py      # Admin dashboard
│   │   ├── admin_kb.py         # Knowledge base admin
│   │   ├── admin_cache.py      # Cache management
│   │   ├── admin_feature_flags.py # Feature flags
│   │   ├── health.py           # Health checks
│   │   ├── voice.py            # Voice endpoints
│   │   ├── realtime.py         # WebSocket handling
│   │   ├── medical_ai.py       # Medical AI endpoints
│   │   └── ...                 # Additional endpoints
│   │
│   ├── core/                   # Core framework code
│   │   ├── config.py           # Configuration management
│   │   ├── database.py         # Database connections
│   │   ├── security.py         # JWT/auth utilities
│   │   ├── dependencies.py     # FastAPI dependencies
│   │   ├── logging.py          # Structured logging
│   │   ├── api_envelope.py     # Response formatting
│   │   └── business_metrics.py # Prometheus metrics
│   │
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py             # User model
│   │   ├── session.py          # Chat session model
│   │   ├── message.py          # Message model
│   │   ├── audit_log.py        # Audit log model
│   │   └── ...
│   │
│   ├── schemas/                # Pydantic schemas
│   │   ├── auth.py             # Auth request/response
│   │   ├── websocket.py        # WebSocket events
│   │   └── ...
│   │
│   ├── services/               # Business logic services
│   │   ├── rag_service.py      # RAG/retrieval
│   │   ├── llm_client.py       # OpenAI client
│   │   ├── cache_service.py    # Multi-level caching
│   │   ├── audit_service.py    # Audit logging
│   │   ├── feature_flags.py    # Feature flag service
│   │   ├── kb_indexer.py       # Document indexing
│   │   ├── voice_*.py          # Voice processing
│   │   └── ...                 # 40+ services
│   │
│   ├── middleware/             # Request middleware
│   │   └── rate_limit.py       # Rate limiting
│   │
│   └── main.py                 # Application entry point
│
├── alembic/                    # Database migrations
│   ├── versions/               # Migration files
│   └── env.py
│
├── tests/                      # Test suite
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests
│
├── scripts/                    # Utility scripts
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Container image
├── Dockerfile.worker           # Background worker image
└── pytest.ini                  # Test configuration
```

## Development Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- Qdrant vector database
- OpenAI API key

### Local Development

```bash
# Navigate to api-gateway directory
cd services/api-gateway

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment (from project root)
cp ../../.env.example ../../.env
# Edit .env with your configuration

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Using Docker Compose (Recommended)

```bash
# From project root
docker compose up -d

# View logs
docker compose logs -f api-gateway
```

## Configuration

Configuration is managed via environment variables. Key settings:

| Variable                           | Description                  | Default                  |
| ---------------------------------- | ---------------------------- | ------------------------ |
| `DATABASE_URL`                     | PostgreSQL connection string | Required                 |
| `REDIS_URL`                        | Redis connection string      | `redis://localhost:6379` |
| `QDRANT_HOST`                      | Qdrant server host           | `localhost`              |
| `QDRANT_PORT`                      | Qdrant server port           | `6333`                   |
| `OPENAI_API_KEY`                   | OpenAI API key               | Required                 |
| `JWT_SECRET_KEY`                   | JWT signing key              | Required                 |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`  | Access token TTL             | `5`                      |
| `JWT_REFRESH_TOKEN_EXPIRE_MINUTES` | Refresh token TTL            | `60`                     |

See `.env.example` for all available options.

## API Endpoints

### Core Groups

| Prefix                     | Description                              |
| -------------------------- | ---------------------------------------- |
| `/api/auth`                | Authentication (login, register, tokens) |
| `/api/users`               | User management                          |
| `/conversations`           | Chat sessions and messages               |
| `/api/admin/panel`         | Admin dashboard                          |
| `/api/admin/kb`            | Knowledge base management                |
| `/api/admin/cache`         | Cache control                            |
| `/api/admin/feature-flags` | Feature toggles                          |
| `/health`, `/ready`        | Health checks                            |
| `/metrics`                 | Prometheus metrics                       |
| `/ws`                      | WebSocket real-time                      |

### Documentation

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **Full API Reference:** See `docs/api-reference/rest-api.md`

### Feature Flags Real-time API (SSE)

The feature flags system supports real-time updates via Server-Sent Events (SSE), enabling clients to receive flag changes instantly without polling.

#### SSE Endpoints

| Endpoint                   | Method | Description                                 |
| -------------------------- | ------ | ------------------------------------------- |
| `/api/flags/stream`        | GET    | Subscribe to real-time flag updates via SSE |
| `/api/flags/version`       | GET    | Get current global flag version             |
| `/api/flags/changes`       | GET    | Get flag changes since a specific version   |
| `/api/flags/stats`         | GET    | Get real-time connection statistics         |
| `/api/flags/history-stats` | GET    | Get detailed event history statistics       |

#### SSE Security

**Rate Limiting:**

- Max 10 SSE connections per IP address per minute
- Returns 429 with `Retry-After` header when exceeded
- Connections are released when client disconnects

**RBAC (Role-Based Access Control):**

- Flag visibility levels: `public`, `authenticated`, `admin`, `internal`
- Unauthenticated users only receive public flags
- Authenticated users receive public + authenticated flags
- Admin users receive public + authenticated + admin flags
- Internal flags are never exposed via SSE
- Use `Authorization: Bearer <token>` header for authenticated access

#### SSE Stream Events

| Event Type           | Description                                    | Data Fields                                                                |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `connected`          | Initial connection with current flags          | `client_id`, `version`, `flags`, `timestamp`                               |
| `reconnected`        | Reconnection after Last-Event-ID               | `client_id`, `version`, `events_replayed`, `history_complete`, `timestamp` |
| `history_incomplete` | Event history was pruned, bulk refresh follows | `client_id`, `message`, `last_event_id`, `current_version`, `timestamp`    |
| `flag_update`        | Single flag was updated                        | `flag`, `value`, `version`, `timestamp`, `replayed?`                       |
| `flags_bulk_update`  | Multiple flags changed                         | `flags`, `version`, `timestamp`, `reason?`                                 |
| `heartbeat`          | Keep-alive (every 30s)                         | `timestamp`, `version`                                                     |
| `error`              | Error notification                             | `message`, `timestamp`                                                     |

#### Usage Examples

**JavaScript/Browser:**

```javascript
// Subscribe to all flag updates
const eventSource = new EventSource("/api/flags/stream");

// Or subscribe to specific flags
const eventSource = new EventSource("/api/flags/stream?flags=ui.dark_mode,backend.rag");

// Handle events
eventSource.addEventListener("connected", (e) => {
  const { flags, version, client_id } = JSON.parse(e.data);
  console.log(`Connected with ${Object.keys(flags).length} flags at version ${version}`);
});

eventSource.addEventListener("flag_update", (e) => {
  const { flag, value, version } = JSON.parse(e.data);
  console.log(`Flag ${flag} updated:`, value.enabled);
});

eventSource.addEventListener("reconnected", (e) => {
  const { events_replayed, version } = JSON.parse(e.data);
  console.log(`Reconnected, replayed ${events_replayed} events`);
});
```

**cURL:**

```bash
# Subscribe to all flags (streaming)
curl -N http://localhost:8000/api/flags/stream

# Subscribe to specific flags
curl -N "http://localhost:8000/api/flags/stream?flags=ui.dark_mode,backend.cache"

# Check current version
curl http://localhost:8000/api/flags/version

# Get connection stats
curl http://localhost:8000/api/flags/stats
```

#### Last-Event-ID Reconnection

The SSE endpoint supports the `Last-Event-ID` header for seamless reconnection. When a client reconnects with this header, the server replays any missed events before switching to live updates.

```javascript
// Browser EventSource handles this automatically
// The server includes `id:` field in each event

// Manual reconnection example:
fetch("/api/flags/stream", {
  headers: { "Last-Event-ID": "42" },
});
```

#### Prometheus Metrics

SSE connections are monitored with these metrics:

| Metric                                           | Type      | Labels             | Description                            |
| ------------------------------------------------ | --------- | ------------------ | -------------------------------------- |
| `voiceassist_sse_connections_active`             | Gauge     | -                  | Current active connections             |
| `voiceassist_sse_connections_total`              | Counter   | action             | Total connections (connect/disconnect) |
| `voiceassist_sse_reconnects_total`               | Counter   | with_last_event_id | Reconnection attempts                  |
| `voiceassist_sse_events_replayed_total`          | Counter   | -                  | Events replayed on reconnect           |
| `voiceassist_sse_events_dropped_total`           | Counter   | reason             | Events dropped (queue errors)          |
| `voiceassist_sse_flag_updates_broadcast_total`   | Counter   | event_type         | Flag broadcasts by type                |
| `voiceassist_sse_flag_update_rate_total`         | Counter   | flag_name          | Per-flag update rate                   |
| `voiceassist_sse_clients_notified`               | Histogram | -                  | Clients per broadcast                  |
| `voiceassist_sse_version_lag`                    | Histogram | -                  | Version lag on reconnect               |
| `voiceassist_sse_event_delivery_latency_seconds` | Histogram | event_type         | Event delivery latency                 |
| `voiceassist_sse_connection_duration_seconds`    | Histogram | -                  | Connection duration                    |
| `voiceassist_sse_client_version_drift`           | Gauge     | -                  | Max version drift across clients       |
| `voiceassist_sse_history_incomplete_total`       | Counter   | -                  | Times history was incomplete           |

### Scheduled Variant Changes API

The feature flags system supports scheduling variant weight changes for A/B tests and gradual rollouts.

#### Scheduled Changes Endpoints

| Endpoint                                                         | Method | Description                         |
| ---------------------------------------------------------------- | ------ | ----------------------------------- |
| `/api/admin/feature-flags/{flag}/scheduled-changes`              | GET    | List scheduled changes for a flag   |
| `/api/admin/feature-flags/{flag}/scheduled-changes`              | POST   | Create a new scheduled change       |
| `/api/admin/feature-flags/{flag}/scheduled-changes/{id}/preview` | GET    | Preview change impact               |
| `/api/admin/feature-flags/{flag}/scheduled-changes/{id}`         | PATCH  | Update a scheduled change           |
| `/api/admin/feature-flags/{flag}/scheduled-changes/{id}/cancel`  | POST   | Cancel a scheduled change           |
| `/api/admin/feature-flags/{flag}/scheduled-changes/{id}`         | DELETE | Delete a scheduled change           |
| `/api/admin/feature-flags/scheduled-changes/all`                 | GET    | List all pending scheduled changes  |
| `/api/admin/feature-flags/{flag}/invalidate-cache`               | POST   | Force cache invalidation for a flag |

#### Example: Schedule a Variant Weight Change

```bash
# Schedule a variant weight change for 2025-01-15 at 14:00 UTC
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/admin/feature-flags/new_checkout/scheduled-changes" \
  -d '{
    "scheduled_at": "2025-01-15T14:00:00Z",
    "changes": {
      "control": 20,
      "variant_a": 40,
      "variant_b": 40
    },
    "description": "Increase variant exposure after Phase 1 analysis",
    "timezone_id": "America/New_York"
  }'

# Preview the impact before applying
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/admin/feature-flags/new_checkout/scheduled-changes/abc123/preview"

# Cancel a scheduled change
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/admin/feature-flags/new_checkout/scheduled-changes/abc123/cancel"
```

#### Cache Invalidation

When variant weights change (immediately or via scheduled changes), the system automatically:

- Invalidates cached bucket assignments for affected flags
- Notifies SSE subscribers of the changes
- Logs the cache invalidation for audit purposes

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test categories
pytest -m unit           # Unit tests only
pytest -m integration    # Integration tests
pytest -m e2e           # End-to-end tests

# Run specific file
pytest tests/unit/test_auth.py -v
```

### Test Structure

- **Unit Tests** (`tests/unit/`): Test individual components in isolation
- **Integration Tests** (`tests/integration/`): Test service interactions
- **E2E Tests** (`tests/e2e/`): Full workflow tests
- **Contract Tests** (`tests/contract/`): API contract verification

## Key Features

### Authentication & Authorization

- JWT-based authentication with access/refresh tokens
- Role-based access control (user, admin, superadmin, viewer)
- Rate limiting on sensitive endpoints
- Token revocation via Redis

### Medical Knowledge Base (RAG)

- Document ingestion and indexing
- Hybrid search (semantic + keyword)
- Multi-hop reasoning for complex queries
- Citation tracking and verification

### Real-time Communication

- WebSocket support for streaming responses
- Voice input processing
- Typing indicators and presence

### Voice Mode Enhancement (10-Phase - Complete 2025-12-03)

The voice pipeline has been enhanced with 10 phases of improvements:

| Service                         | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `emotion_detection_service.py`  | Hume AI emotion detection from speech |
| `backchannel_service.py`        | Natural verbal acknowledgments        |
| `prosody_analysis_service.py`   | Speech pattern analysis               |
| `memory_context_service.py`     | Three-tier conversation memory        |
| `repair_strategy_service.py`    | Conversational repair strategies      |
| `dictation_service.py`          | Medical dictation state management    |
| `voice_command_service.py`      | Voice command processing              |
| `note_formatter_service.py`     | Medical note formatting               |
| `medical_vocabulary_service.py` | Medical terminology support           |
| `patient_context_service.py`    | HIPAA-compliant patient context       |
| `dictation_phi_monitor.py`      | Real-time PHI monitoring              |
| `session_analytics_service.py`  | Session analytics tracking            |
| `feedback_service.py`           | User feedback collection              |

**Documentation:** See `docs/VOICE_MODE_ENHANCEMENT_10_PHASE.md`

### Observability

- Structured logging with correlation IDs
- Prometheus metrics export
- Distributed tracing (Jaeger)
- HIPAA-compliant audit logging

### Caching

- Multi-level caching (L1 in-memory, L2 Redis)
- Intelligent cache invalidation
- Query result caching

## Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one version
alembic downgrade -1

# View current version
alembic current
```

## Deployment

### Production Build

```bash
# Build Docker image
docker build -t voiceassist-api-gateway .

# Run container
docker run -d \
  --name api-gateway \
  -p 8000:8000 \
  --env-file .env \
  voiceassist-api-gateway
```

### Health Checks

- **Liveness:** `GET /health` - Returns 200 if running
- **Readiness:** `GET /ready` - Checks all dependencies

## Contributing

1. Follow PEP 8 style guidelines
2. Add type hints to all functions
3. Write tests for new features
4. Update documentation as needed

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

---

_For more information, see the [main documentation](../../docs/README.md)._
