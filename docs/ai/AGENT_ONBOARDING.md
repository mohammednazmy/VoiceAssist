---
title: AI Agent Onboarding Guide
slug: ai/agent-onboarding
summary: >-
  Quick context, repository structure, critical rules, and common tasks for AI
  coding assistants.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-02"
audience:
  - agent
  - ai-agents
tags:
  - onboarding
  - ai-agent
  - getting-started
  - workflows
relatedServices:
  - api-gateway
  - web-app
  - admin-panel
  - docs-site
category: ai
version: 1.2.0
ai_summary: >-
  Version: 1.3.0 Last Updated: 2025-12-02 Audience: AI coding assistants
  (Claude, GPT, Copilot, etc.) --- Start here. This section provides the fastest
  path to context. Base URL: https://assistdocs.asimo.io ALWAYS use:
  services/api-gateway/ (FastAPI, production-ready) NEVER use: server/
  (deprecated...
---

# AI Agent Onboarding Guide

**Version:** 1.3.0
**Last Updated:** 2025-12-02
**Audience:** AI coding assistants (Claude, GPT, Copilot, etc.)

---

## TL;DR for AI Agents

**Start here.** This section provides the fastest path to context.

### Essential Documents (Read These First)

| Document                                                      | Purpose                       |
| ------------------------------------------------------------- | ----------------------------- |
| [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) | What's built vs. planned      |
| [Service Catalog](../SERVICE_CATALOG.md)                      | All services and their status |
| [Unified Architecture](../UNIFIED_ARCHITECTURE.md)            | System design overview        |
| [Debugging Index](../debugging/DEBUGGING_INDEX.md)            | Troubleshooting hub           |

### Machine-Readable Endpoints

| Endpoint                 | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `GET /agent/index.json`  | Documentation system metadata & discovery        |
| `GET /agent/docs.json`   | All documents with metadata (filter client-side) |
| `GET /agent/tasks.json`  | Common agent tasks with commands and docs        |
| `GET /agent/schema.json` | JSON Schema for API response types               |
| `GET /search-index.json` | Full-text search index (Fuse.js format)          |
| `GET /sitemap.xml`       | XML sitemap for crawlers                         |

**Base URL:** `https://assistdocs.asimo.io`

### Safety & Norms

| Document                                                  | Purpose                         |
| --------------------------------------------------------- | ------------------------------- |
| [CLAUDE_EXECUTION_GUIDE.md](../CLAUDE_EXECUTION_GUIDE.md) | Claude-specific guidelines      |
| [CLAUDE_PROMPTS.md](../CLAUDE_PROMPTS.md)                 | Standard prompt templates       |
| [Security Compliance](../SECURITY_COMPLIANCE.md)          | HIPAA and security requirements |

### Canonical Backend Location

**ALWAYS use:** `services/api-gateway/` (FastAPI, production-ready)

**NEVER use:** `server/` (deprecated stub)

---

## Quick Context

VoiceAssist is an enterprise-grade, HIPAA-compliant medical AI assistant platform. This document helps AI agents quickly understand the codebase and work effectively.

### Project Status

> **Full Status:** See [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) for detailed component status.

| Component             | Status           | Location                    |
| --------------------- | ---------------- | --------------------------- |
| Backend (API Gateway) | Production Ready | `services/api-gateway/`     |
| Infrastructure        | Production Ready | `infrastructure/`, `ha-dr/` |
| Admin Panel           | Production Ready | `apps/admin-panel/`         |
| Docs Site             | Production Ready | `apps/docs-site/`           |
| Web App               | Production Ready | `apps/web-app/`             |
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

## Common Tasks for AI Agents

This section provides task-specific guidance for common development scenarios.

### Task: Add a New REST Endpoint to the API Gateway

**Docs to read first:**

- [API_REFERENCE.md](../API_REFERENCE.md) - Endpoint patterns and conventions
- [api-reference/rest-api.md](../api-reference/rest-api.md) - Detailed endpoint specs
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) - Service layer design

**Directories to inspect:**

- `services/api-gateway/app/api/` - Existing API modules
- `services/api-gateway/app/schemas/` - Pydantic request/response schemas
- `services/api-gateway/app/services/` - Business logic services

**Steps:**

1. Create handler in `app/api/<module>.py`
2. Add schemas in `app/schemas/<module>.py`
3. Register router in `app/main.py`
4. Add tests in `tests/test_<module>.py`

**Verify:**

```bash
cd services/api-gateway
pytest tests/test_<module>.py -v
curl http://localhost:8000/<endpoint>
```

### Task: Debug a Failing Medical Query (RAG Issues)

**Docs to read first:**

- [SEMANTIC_SEARCH_DESIGN.md](../SEMANTIC_SEARCH_DESIGN.md) - RAG architecture
- [debugging/DEBUGGING_BACKEND.md](../debugging/DEBUGGING_BACKEND.md) - Backend debugging

**Key files:**

- `app/services/rag_service.py` - RAG pipeline logic
- `app/services/llm_client.py` - OpenAI integration
- `app/services/cache_service.py` - Cache layer

**Diagnostic commands:**

```bash
# Check RAG service logs
journalctl -u voiceassist-api -f | grep -i rag

# Test embedding generation
curl -X POST http://localhost:8000/api/search/test \
  -H "Content-Type: application/json" \
  -d '{"query": "test medical query"}'

# Check Qdrant health
curl http://localhost:6333/collections
```

### Task: Debug Voice / WebSocket Issues

**Docs to read first:**

- [debugging/DEBUGGING_VOICE_REALTIME.md](../debugging/DEBUGGING_VOICE_REALTIME.md) - Voice debugging
- [REALTIME_ARCHITECTURE.md](../REALTIME_ARCHITECTURE.md) - WebSocket design
- [VOICE_MODE_PIPELINE.md](../VOICE_MODE_PIPELINE.md) - Voice pipeline

**Key files:**

- `apps/web-app/src/hooks/useThinkerTalkerSession.ts` - Primary voice WebSocket client
- `apps/web-app/src/hooks/useRealtimeVoiceSession.ts` - Legacy Realtime API client
- `app/api/thinker_talker_websocket_handler.py` - T/T WebSocket server
- `app/api/realtime.py` - Legacy WebSocket endpoint

**Diagnostic commands:**

```bash
# Check WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8000/ws

# Check browser console for WebSocket errors
# Look for: "WebSocket connection failed" or "error_no_match"
```

### Task: Fix a Broken Docs Page or Missing Document

**Docs to read first:**

- [debugging/DEBUGGING_DOCS_SITE.md](../debugging/DEBUGGING_DOCS_SITE.md) - Docs site debugging
- [INTERNAL_DOCS_SYSTEM.md](../INTERNAL_DOCS_SYSTEM.md) - Docs system internals

**Key files:**

- `apps/docs-site/src/lib/navigation.ts` - Navigation config
- `apps/docs-site/src/lib/docs.ts` - Document loading
- `apps/docs-site/src/components/DocPage.tsx` - Page rendering

**Steps to fix a 404:**

1. Check if doc exists in `docs/` with correct path
2. Verify route in `navigation.ts` matches expected URL
3. Ensure doc has valid frontmatter if metadata is required
4. Rebuild and redeploy:

```bash
cd apps/docs-site
pnpm build
sudo cp -r out/* /var/www/assistdocs.asimo.io/
```

### Task: Update Agent JSON or Search Index

**Key files:**

- `apps/docs-site/scripts/generate-agent-json.js` - Agent JSON generator
- `apps/docs-site/scripts/generate-search-index.js` - Search index generator

**Commands:**

```bash
cd apps/docs-site

# Regenerate agent JSON
pnpm run generate-agent-json

# Regenerate search index
pnpm run generate-search-index

# Full rebuild
pnpm build
```

**Verify:**

```bash
curl https://assistdocs.asimo.io/agent/docs.json | jq '.count'
curl https://assistdocs.asimo.io/search-index.json | jq '.docs | length'
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

| Endpoint                 | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `GET /agent/index.json`  | Documentation system metadata           |
| `GET /agent/docs.json`   | Full document list with metadata        |
| `GET /agent/tasks.json`  | Common tasks with commands and docs     |
| `GET /search-index.json` | Full-text search index (Fuse.js format) |

### Interpreting Document Metadata

When filtering `/agent/docs.json`, use these fields to find relevant documents:

| Field       | Values                                             | AI Agent Guidance                             |
| ----------- | -------------------------------------------------- | --------------------------------------------- |
| `status`    | `stable`, `experimental`, `draft`, `deprecated`    | Prefer `stable` for authoritative information |
| `stability` | `production`, `beta`, `experimental`, `legacy`     | Prefer `production` for reliable features     |
| `audience`  | `["agent"]`, `["human"]`, `["backend"]`, etc.      | Filter for `agent` to find AI-optimized docs  |
| `owner`     | `backend`, `frontend`, `infra`, `docs`, `security` | Use to find domain experts                    |
| `tags`      | Varies (e.g., `["api", "debugging"]`)              | Use for topic-based filtering                 |

### Example Workflows

**Find docs for debugging:**

```javascript
const data = await fetch("/agent/docs.json").then((r) => r.json());
const debugDocs = data.docs.filter((d) => d.tags?.includes("debugging") && d.status === "stable");
```

**Find task-specific guidance:**

```javascript
const tasks = await fetch("/agent/tasks.json").then((r) => r.json());
const task = tasks.tasks.find((t) => t.id === "debug-api-error");
// task.docs contains relevant documentation paths
// task.commands contains diagnostic shell commands
```

**Full-text search:**

```javascript
import Fuse from "fuse.js";
const index = await fetch("/search-index.json").then((r) => r.json());
const fuse = new Fuse(index.docs, {
  keys: ["title", "summary", "content"],
  threshold: 0.3,
});
const results = fuse.search("authentication error");
```

See [Agent API Reference](./AGENT_API_REFERENCE.md) for full endpoint documentation.

---

## AI-Docs Integration (Semantic Search)

Documentation is embedded into Qdrant for semantic search, enabling AI assistants to find relevant docs using natural language queries.

### Architecture

| Component   | Location                               | Purpose                          |
| ----------- | -------------------------------------- | -------------------------------- |
| Embedder    | `scripts/embed-docs.py`                | Embeds docs into Qdrant          |
| Search Tool | `server/app/tools/docs_search_tool.py` | LLM tool for semantic doc search |
| Collection  | `platform_docs` (Qdrant)               | Vector storage for embeddings    |

### Embedding Configuration

| Property            | Value                  |
| ------------------- | ---------------------- |
| **Collection**      | `platform_docs`        |
| **Embedding Model** | text-embedding-3-small |
| **Dimensions**      | 1536                   |
| **Distance Metric** | Cosine                 |

### Tool Functions

```python
# Semantic search across platform documentation
docs_search(query: str, category: str = None, max_results: int = 5)

# Retrieve full section content by path
docs_get_section(doc_path: str, section: str = None)
```

### Re-indexing Documentation

```bash
# Incremental update (skip unchanged)
python scripts/embed-docs.py

# Force re-index all
python scripts/embed-docs.py --force

# Preview without indexing
python scripts/embed-docs.py --dry-run
```

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

### Debugging Guides

For detailed troubleshooting, see the debugging documentation:

| Guide                                                      | Purpose                               |
| ---------------------------------------------------------- | ------------------------------------- |
| [Debugging Overview](../debugging/DEBUGGING_OVERVIEW.md)   | Quick symptom-to-guide reference      |
| [Backend Debugging](../debugging/DEBUGGING_BACKEND.md)     | API Gateway, database, cache issues   |
| [Frontend Debugging](../debugging/DEBUGGING_FRONTEND.md)   | React, browser, network issues        |
| [Voice/Realtime](../debugging/DEBUGGING_VOICE_REALTIME.md) | WebSocket, STT, TTS issues            |
| [Docs Site](../debugging/DEBUGGING_DOCS_SITE.md)           | Next.js, static export, Apache issues |

### Getting Help

1. Check the [Debugging Overview](../debugging/DEBUGGING_OVERVIEW.md) for common symptoms
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

| Version | Date       | Changes                                               |
| ------- | ---------- | ----------------------------------------------------- |
| 1.3.0   | 2025-12-02 | Added AI-Docs integration section, fixed voice hooks  |
| 1.2.0   | 2025-11-27 | Added tasks.json endpoint, improved metadata guidance |
| 1.1.0   | 2025-11-27 | Added common tasks and debugging workflows            |
| 1.0.0   | 2025-11-27 | Initial release                                       |

---

_For the full documentation index, see [docs/README.md](../README.md)._
