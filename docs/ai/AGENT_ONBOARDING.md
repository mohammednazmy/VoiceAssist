---
title: AI Agent Onboarding Guide
slug: ai/agent-onboarding
summary: Quick context, repository structure, critical rules, and common tasks for AI coding assistants.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["agent"]
tags: ["onboarding", "ai-agent", "getting-started"]
relatedServices: ["api-gateway", "web-app", "admin-panel", "docs-site"]
version: "1.0.0"
---

# AI Agent Onboarding Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-27
**Audience:** AI coding assistants (Claude, GPT, Copilot, etc.)

---

## Quick Context

VoiceAssist is an enterprise-grade, HIPAA-compliant medical AI assistant platform. This document helps AI agents quickly understand the codebase and work effectively.

### Project Status

> **Full Status:** See [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) for detailed component status.

| Component             | Status           | Location                    |
| --------------------- | ---------------- | --------------------------- |
| Backend (API Gateway) | Production Ready | `services/api-gateway/`     |
| Infrastructure        | Production Ready | `infrastructure/`, `ha-dr/` |
| Web App               | In Development   | `apps/web-app/`             |
| Admin Panel           | In Development   | `apps/admin-panel/`         |
| Docs Site             | In Development   | `apps/docs-site/`           |
| Legacy Server         | Deprecated       | `server/` (DO NOT USE)      |

### Key Facts

- **Backend Framework:** FastAPI (Python 3.11+)
- **Frontend Framework:** React 18+ with TypeScript, Vite
- **Package Manager:** pnpm (monorepo with Turborepo)
- **Database:** PostgreSQL with pgvector extension
- **Cache:** Redis
- **Vector Store:** Qdrant
- **LLM Provider:** OpenAI (GPT-4, embeddings)
- **Authentication:** JWT with access/refresh tokens
- **Compliance:** HIPAA-compliant (42/42 requirements met)

---

## Repository Structure

```
VoiceAssist/
├── services/
│   └── api-gateway/          # CANONICAL BACKEND (FastAPI)
│       ├── app/
│       │   ├── api/          # 20+ API modules
│       │   ├── core/         # Config, security, logging
│       │   ├── models/       # SQLAlchemy ORM models
│       │   ├── schemas/      # Pydantic schemas
│       │   └── services/     # Business logic (40+ services)
│       └── alembic/          # Database migrations
│
├── apps/                     # Frontend Applications (Monorepo)
│   ├── web-app/             # Main user-facing app
│   ├── admin-panel/         # Admin dashboard
│   └── docs-site/           # Documentation site (Next.js 14)
│
├── packages/                 # Shared Packages
│   ├── api-client/          # Type-safe HTTP client
│   ├── config/              # Shared configurations
│   ├── design-tokens/       # Medical-themed design system
│   ├── telemetry/           # Observability utilities
│   ├── types/               # TypeScript type definitions
│   ├── ui/                  # React component library
│   └── utils/               # Utility functions (PHI detection)
│
├── infrastructure/          # IaC (Terraform, Ansible)
├── ha-dr/                   # High Availability & DR configs
├── tests/                   # Backend test suite
├── docs/                    # Documentation
│
├── server/                  # DEPRECATED - DO NOT USE
│
├── docker-compose.yml       # Development stack
├── pnpm-workspace.yaml      # pnpm workspace config
└── turbo.json               # Turborepo config
```

---

## Critical Rules

### 1. Use the Correct Backend

**ALWAYS use `services/api-gateway/`** - This is the production backend.

**NEVER use `server/`** - This is a deprecated stub kept for reference only.

### 2. API Endpoint Patterns

```
/api/auth/*          - Authentication
/api/users/*         - User management
/conversations/*     - Chat/sessions
/api/admin/*         - Admin operations
/health, /ready      - Health checks
/metrics             - Prometheus metrics
/ws                  - WebSocket endpoint
```

### 3. Security Requirements

- All PHI (Protected Health Information) must be encrypted at rest and in transit
- Use audit logging for any PHI access via `app/services/audit_service.py`
- Never log sensitive data in plain text
- All API endpoints handling PHI need `@requires_audit` decorator

### 4. Code Style

**Backend (Python):**

- PEP 8 compliant
- Type hints required for all functions
- Docstrings for public APIs
- Use async/await for I/O operations

**Frontend (TypeScript):**

- Strict TypeScript mode enabled
- ESLint + Prettier enforced
- React functional components with hooks

---

## Common Tasks

### Adding a New API Endpoint

1. Create handler in `services/api-gateway/app/api/<module>.py`
2. Add Pydantic schemas in `app/schemas/<module>.py`
3. Register routes in `app/main.py`
4. Write tests in `tests/`

Example structure:

```python
# app/api/example.py
from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user
from app.schemas.example import ExampleRequest, ExampleResponse

router = APIRouter(prefix="/api/example", tags=["example"])

@router.post("/", response_model=ExampleResponse)
async def create_example(
    request: ExampleRequest,
    user = Depends(get_current_user)
):
    """Create a new example."""
    pass
```

### Adding a New Frontend Component

1. Create component in `packages/ui/src/components/`
2. Export from `packages/ui/src/index.ts`
3. Add Storybook story in `packages/ui/src/stories/`
4. Use in apps via `@voiceassist/ui`

### Running Tests

```bash
# Backend tests
pytest                      # All tests
pytest -m unit             # Unit only
pytest -m e2e              # E2E only
pytest --cov=app           # With coverage

# Frontend tests
pnpm test                  # All packages
pnpm --filter web-app test # Specific app
```

### Database Migrations

```bash
cd services/api-gateway

# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## Key Files Reference

### Backend Entry Points

| File                                        | Purpose                    |
| ------------------------------------------- | -------------------------- |
| `services/api-gateway/app/main.py`          | FastAPI app initialization |
| `services/api-gateway/app/core/config.py`   | Configuration management   |
| `services/api-gateway/app/core/security.py` | JWT/auth utilities         |
| `services/api-gateway/app/core/database.py` | Database connection        |

### Important Services

| File                            | Purpose             |
| ------------------------------- | ------------------- |
| `app/services/rag_service.py`   | RAG/retrieval logic |
| `app/services/llm_client.py`    | OpenAI integration  |
| `app/services/cache_service.py` | Multi-level caching |
| `app/services/audit_service.py` | HIPAA audit logging |
| `app/services/feature_flags.py` | Feature flag system |

### Frontend Entry Points

| File                                | Purpose                   |
| ----------------------------------- | ------------------------- |
| `apps/web-app/src/main.tsx`         | Web app entry             |
| `apps/admin-panel/src/main.tsx`     | Admin panel entry         |
| `apps/docs-site/src/app/layout.tsx` | Docs site layout          |
| `packages/ui/src/index.ts`          | Component library exports |

---

## Documentation Map

| Topic                    | Document                         |
| ------------------------ | -------------------------------- |
| Architecture Overview    | `docs/UNIFIED_ARCHITECTURE.md`   |
| Backend Details          | `docs/BACKEND_ARCHITECTURE.md`   |
| API Reference (concepts) | `docs/API_REFERENCE.md`          |
| API Reference (detailed) | `docs/api-reference/rest-api.md` |
| Security & HIPAA         | `docs/SECURITY_COMPLIANCE.md`    |
| Database Schema          | `docs/DATA_MODEL.md`             |
| Development Setup        | `docs/DEVELOPMENT_SETUP.md`      |
| Deployment Guide         | `docs/DEPLOYMENT_GUIDE.md`       |
| Operations Runbooks      | `docs/operations/runbooks/`      |
| Agent API Reference      | `docs/ai/AGENT_API_REFERENCE.md` |
| Docs System Internals    | `docs/INTERNAL_DOCS_SYSTEM.md`   |

---

## Machine-Readable Documentation API

The docs site exposes JSON endpoints for programmatic access:

| Endpoint                  | Purpose                           |
| ------------------------- | --------------------------------- |
| `GET /agent/index.json`   | Documentation system metadata     |
| `GET /agent/docs.json`    | Full document list with filtering |
| `GET /agent/search?q=...` | Full-text search                  |

**Example: Get all stable docs for agents:**

```
GET https://assistdocs.asimo.io/agent/docs.json?audience=agent&status=stable
```

See [Agent API Reference](./AGENT_API_REFERENCE.md) for full details.

---

## Environment Setup

### Required Environment Variables

```bash
# Core
DATABASE_URL=postgresql://user:pass@localhost:5432/voiceassist
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...

# Security
JWT_SECRET_KEY=<random-32-bytes>
ENCRYPTION_KEY=<random-32-bytes>

# Optional
QDRANT_HOST=localhost
QDRANT_PORT=6333
LOG_LEVEL=INFO
```

### Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/mohammednazmy/VoiceAssist.git
cd VoiceAssist
cp .env.example .env
# Edit .env with your keys

# 2. Start backend (Docker)
docker compose up -d
curl http://localhost:8000/health

# 3. Start frontend
pnpm install
pnpm dev
```

---

## Troubleshooting

### Common Issues

**Import Error: Module not found**

- Check you're in correct directory
- Backend: `services/api-gateway/`
- Frontend: use package names like `@voiceassist/ui`

**Database Connection Failed**

- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running: `docker compose ps`

**Tests Failing**

- Run `alembic upgrade head` for latest schema
- Check Redis is running for cache tests

### Getting Help

1. Check `docs/operations/runbooks/TROUBLESHOOTING.md`
2. Search existing docs in `docs/`
3. Check test files for usage examples

---

## API Quick Reference

### Authentication Flow

```http
POST /api/auth/register    # Create account
POST /api/auth/login       # Get tokens
POST /api/auth/refresh     # Refresh access token
POST /api/auth/logout      # Invalidate tokens
```

### Conversation Flow

```http
POST /conversations/                    # Create session
GET /conversations/{id}                 # Get session
POST /conversations/{id}/messages       # Send message
GET /conversations/{id}/messages        # Get messages
```

### Admin Operations

```http
GET /api/admin/panel/stats             # Dashboard stats
GET /api/admin/kb/documents            # List KB documents
POST /api/admin/kb/documents           # Upload document
GET /api/admin/feature-flags           # List flags
PUT /api/admin/feature-flags/{key}     # Update flag
```

### Health Checks

```http
GET /health                # Liveness probe
GET /ready                 # Readiness probe (checks deps)
GET /metrics               # Prometheus metrics
```

---

## Version History

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | 2025-11-27 | Initial release |

---

_For the full documentation index, see [docs/README.md](../README.md)._
