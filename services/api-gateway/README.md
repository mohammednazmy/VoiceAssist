# VoiceAssist API Gateway

**Version:** 2.0
**Status:** Production Ready
**Last Updated:** 2025-11-27

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
