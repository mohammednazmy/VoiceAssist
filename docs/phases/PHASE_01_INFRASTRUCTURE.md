---
title: Phase 01 Infrastructure
slug: phases/phase-01-infrastructure
summary: "> **V2 PHASE DOCUMENT**"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience:
  - devops
  - sre
  - ai-agents
tags:
  - phase
  - infrastructure
category: planning
ai_summary: >-
  > V2 PHASE DOCUMENT > > This phase description is part of the canonical 0–14
  V2 plan. > It is intended to guide both human developers and Claude Code >
  sessions. Always read DEVELOPMENT_PHASES_V2.md and BACKEND_ARCHITECTURE.md >
  alongside this document. Provision Postgres, Redis, and Qdrant via D...
---

# Phase 1: Core Infrastructure & Database Setup

> **V2 PHASE DOCUMENT**
>
> This phase description is part of the canonical 0–14 V2 plan.
> It is intended to guide both human developers and Claude Code
> sessions. Always read DEVELOPMENT_PHASES_V2.md and BACKEND_ARCHITECTURE.md
> alongside this document.

## 1. Overview

Provision Postgres, Redis, and Qdrant via Docker Compose and wire basic health checks.

See also:

- [DEVELOPMENT_PHASES_V2.md](../DEVELOPMENT_PHASES_V2.md)
- [PHASE_STATUS.md](../../PHASE_STATUS.md)
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md)
- [SERVICE_CATALOG.md](../SERVICE_CATALOG.md)
- [DATA_MODEL.md](../DATA_MODEL.md)

## 2. Objectives

- Clearly define the scope of Phase 01.
- Implement the minimum viable code and configs required to unblock subsequent phases.
- Keep changes small, testable, and well-documented.

## 3. Prerequisites

- Repository cloned and able to run basic tests.
- Docs read:
  - START_HERE.md
  - BACKEND_ARCHITECTURE.md
  - ORCHESTRATION_DESIGN.md (where relevant)
  - WEB_APP_SPECS.md and/or ADMIN_PANEL_SPECS.md (where relevant)
- Docker and Docker Compose installed (for phases 1–10).
- Basic familiarity with FastAPI, React, and the standard API envelope.

## 4. Step-by-Step Checklist

### 4.1 Planning

- Review the corresponding section in DEVELOPMENT_PHASES_V2.md.
- Identify which services (see SERVICE_CATALOG.md) and components are in scope.
- Update PHASE_STATUS.md to mark this phase as "In Progress".

### 4.2 Implementation

- **Docker Compose services** (see docker-compose.yml, LOCAL_DEVELOPMENT.md):
  - `postgres` - Main database (port 5432)
  - `redis` - Session cache and job queue (port 6379)
  - `qdrant` - Vector database for semantic search (port 6333)
  - `voiceassist-server` - FastAPI backend (port 8000)
- **Backend health checks** (see OBSERVABILITY.md):
  - `GET /health` - Basic liveness check
  - `GET /ready` - Readiness check (verifies DB/Redis/Qdrant connectivity)
  - `GET /metrics` - Prometheus metrics endpoint
- **Database migrations** (see DATA_MODEL.md):
  - Create initial Alembic migration for core tables (users, sessions, messages)
  - Verify migrations run successfully on fresh Postgres instance
- Implement or extend the relevant backend services under `server/app/`:
  - Update or create API routers under `server/app/api/`.
  - Update or create service modules under `server/app/services/`.
  - Ensure all endpoints use the APIEnvelope helpers from `app.core.api_envelope`.
- Implement or extend frontend components as needed:
  - For clinician web app: `web-app/src/...`
  - For admin panel: `admin-panel/src/...`
- Wire configuration via Settings (see `app.core.config`) rather than hard-coding URLs or secrets.
- Keep PHI-handling rules in mind as described in SECURITY_COMPLIANCE.md.

### 4.3 Testing

- Add or update basic unit/integration tests where applicable.
- Manually verify:
  - The affected endpoints respond with the correct envelope shape.
  - Frontend components render and handle common flows without errors.
- Update OBSERVABILITY.md if new metrics or logs are introduced.

## 5. Deliverables

- Working backend endpoints and/or services as described in DEVELOPMENT_PHASES_V2.md.
- Any necessary frontend UI elements to validate the functionality.
- Documentation updates:
  - Code-level comments for non-obvious logic.
  - Any required updates to specs in `docs/`.

## 6. Exit Criteria

- All checklist items above are completed.
- New or changed endpoints:
  - are documented in SERVICE_CATALOG.md,
  - return correct APIEnvelope responses,
  - are covered by at least smoke-tests.
- PHASE_STATUS.md updated to mark this phase as **Completed** with date.
