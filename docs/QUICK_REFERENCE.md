---
title: Quick Reference
slug: quick-reference
summary: Single-page reference for common commands, file locations, environment variables, and URLs.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - reference
  - commands
  - cheatsheet
category: reference
component: "docs/overview"
ai_summary: >-
  Quick reference for VoiceAssist development. Contains common commands, key file locations,
  environment variables, ports, and URLs. Use this for fast lookups during development.
---

# VoiceAssist Quick Reference

> **Last Updated**: 2025-12-08
> Single-page reference for common commands, locations, and configuration.

---

## Common Commands

### Starting the System

```bash
# Start all services (from project root)
docker compose up -d

# Start with logs visible
docker compose up

# Rebuild and start
docker compose up -d --build

# Start frontend only (after backend is running)
cd apps/web-app && pnpm dev
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v
```

### Running Tests

```bash
# Backend tests
cd services/api-gateway
source venv/bin/activate
pytest tests/ -v

# Frontend tests
cd apps/web-app
pnpm test

# E2E tests
npx playwright test

# Run specific test file
pytest tests/integration/test_voice.py -v
pnpm test src/hooks/__tests__/useAuth.test.ts
```

### Database Operations

```bash
# Run migrations
cd services/api-gateway
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Check migration status
alembic current
```

### Docker Operations

```bash
# View logs
docker logs voiceassist-server -f
docker logs voiceassist-postgres -f

# Restart single service
docker compose restart voiceassist-server

# Enter container shell
docker exec -it voiceassist-server bash

# Check container health
docker compose ps
```

---

## Key File Locations

### Backend (services/api-gateway/)

| Path | Purpose |
|------|---------|
| `app/main.py` | FastAPI application entry point |
| `app/api/` | API route handlers |
| `app/services/` | Business logic services |
| `app/core/config.py` | Configuration and settings |
| `app/models/` | SQLAlchemy database models |
| `alembic/versions/` | Database migrations |
| `tests/` | Test files |

### Frontend (apps/web-app/)

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js app router pages |
| `src/components/` | React components |
| `src/hooks/` | Custom React hooks |
| `src/stores/` | Zustand state stores |
| `src/lib/api/` | API client functions |
| `src/types/` | TypeScript type definitions |

### Configuration Files

| Path | Purpose |
|------|---------|
| `.env` | Environment variables (create from .env.example) |
| `docker-compose.yml` | Docker service definitions |
| `docker-compose.override.yml` | Local overrides |
| `turbo.json` | Turborepo configuration |
| `pnpm-workspace.yaml` | Monorepo workspace config |

### Documentation

| Path | Purpose |
|------|---------|
| `docs/START_HERE.md` | Project entry point |
| `docs/UNIFIED_ARCHITECTURE.md` | System architecture |
| `docs/EXTENSION_GUIDE.md` | How to extend the system |
| `docs/ai/AGENT_ONBOARDING.md` | AI agent quickstart |

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/voiceassist
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
JWT_ALGORITHM=HS256

# OpenAI
OPENAI_API_KEY=sk-...

# Vector Database
QDRANT_URL=http://localhost:6333
```

### Optional Variables

```bash
# Voice Services (Thinker-Talker)
DEEPGRAM_API_KEY=...          # STT
ELEVENLABS_API_KEY=...        # TTS

# Nextcloud Integration
NEXTCLOUD_URL=https://nextcloud.example.com
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
LOG_LEVEL=INFO
```

---

## Ports & URLs

### Development URLs

| Service | URL | Purpose |
|---------|-----|---------|
| API Gateway | http://localhost:8000 | Backend API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Web App | http://localhost:3000 | Main frontend |
| Admin Panel | http://localhost:3001 | Admin dashboard |
| Docs Site | http://localhost:3002 | Documentation |

### Infrastructure Services

| Service | URL/Port | Purpose |
|---------|----------|---------|
| PostgreSQL | localhost:5432 | Primary database |
| Redis | localhost:6379 | Cache & sessions |
| Qdrant | localhost:6333 | Vector database |
| Grafana | http://localhost:3000 | Metrics dashboards |
| Prometheus | http://localhost:9090 | Metrics collection |
| Jaeger | http://localhost:16686 | Distributed tracing |

### Production URLs (asimo.io)

| Service | URL |
|---------|-----|
| Web App | https://dev.asimo.io |
| Admin Panel | https://admin.asimo.io |
| Docs Site | https://assistdocs.asimo.io |
| API | https://assist.asimo.io |

---

## API Quick Reference

### Authentication

```bash
# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "pass"}'

# Protected request
curl http://localhost:8000/api/user/me \
  -H "Authorization: Bearer <token>"
```

### Health Checks

```bash
# Basic health
curl http://localhost:8000/health

# Detailed readiness
curl http://localhost:8000/ready

# Prometheus metrics
curl http://localhost:8000/metrics
```

### Common Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/user/me` | Current user profile |
| POST | `/api/chat` | Send chat message |
| WS | `/api/voice/realtime` | Voice WebSocket |
| GET | `/api/admin/users` | List users (admin) |
| GET | `/api/admin/kb/documents` | List KB documents |

---

## Troubleshooting Quick Fixes

### Container won't start

```bash
# Check logs
docker logs voiceassist-server

# Check if port is in use
lsof -i :8000

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### Database connection issues

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Test connection
docker exec -it voiceassist-postgres psql -U voiceassist -d voiceassist

# Reset database
docker compose down -v
docker compose up -d postgres
```

### Frontend build errors

```bash
# Clear caches
rm -rf node_modules .next
pnpm install
pnpm dev
```

### Tests failing

```bash
# Run with verbose output
pytest tests/ -v --tb=long

# Run single test with debug
pytest tests/test_file.py::test_name -v -s
```

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push -u origin feature/my-feature
```

### Commit Message Format

```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
```

---

## Related Documents

- **[START_HERE.md](START_HERE.md)** - Full project overview
- **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** - Detailed setup guide
- **[EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)** - Adding new features
- **[debugging/DEBUGGING_INDEX.md](debugging/DEBUGGING_INDEX.md)** - Troubleshooting guide
- **[api-reference/rest-api.md](api-reference/rest-api.md)** - Full API documentation
