---
title: Agent Task Index
slug: ai/agent-task-index
summary: >-
  Common AI agent tasks with relevant documentation and machine-readable
  endpoints.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-02"
audience:
  - agent
  - ai-agents
tags:
  - ai-agent
  - tasks
  - index
  - reference
category: ai
version: 1.0.0
ai_summary: >-
  This document lists common AI agent tasks with the relevant documentation and
  endpoints needed to complete them. Machine-Readable Endpoints: -
  https://assistdocs.asimo.io/agent/index.json - Documentation metadata -
  https://assistdocs.asimo.io/agent/docs.json - Full document list with
  filtering -...
---

# Agent Task Index

This document lists common AI agent tasks with the relevant documentation and endpoints needed to complete them.

**Machine-Readable Endpoints:**

- `https://assistdocs.asimo.io/agent/index.json` - Documentation metadata
- `https://assistdocs.asimo.io/agent/docs.json` - Full document list with filtering
- `https://assistdocs.asimo.io/agent/tasks.json` - Common agent tasks with commands
- `https://assistdocs.asimo.io/search-index.json` - Full-text search index

---

## Common Tasks

### 1. Understand Project Status

**Goal**: Get current state of all components

**Key Documents:**

- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - **Source of truth**
- [START_HERE.md](../START_HERE.md) - Project orientation

**API Endpoint:**

```bash
curl https://assistdocs.asimo.io/agent/docs.json | jq '.[] | select(.category == "overview")'
```

---

### 2. Implement a Project Phase

**Goal**: Complete a development phase (0-15)

**Key Documents:**

- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Check prerequisites
- `docs/phases/PHASE_XX_*.md` - Phase instructions
- [Claude Execution Guide](../CLAUDE_EXECUTION_GUIDE.md) - Process guidelines
- [Claude Prompts](../CLAUDE_PROMPTS.md) - Ready-to-use prompts

**Workflow:**

1. Check phase prerequisites in Implementation Status
2. Read the specific phase document
3. Follow Claude Execution Guide workflow
4. Update Implementation Status when complete

---

### 3. Debug Backend Issues

**Goal**: Diagnose and fix API Gateway, database, or cache problems

**Key Documents:**

- [Backend Debugging](../debugging/DEBUGGING_BACKEND.md)
- [Debugging Overview](../debugging/DEBUGGING_OVERVIEW.md)
- [Backend Architecture](../BACKEND_ARCHITECTURE.md)

**Quick Commands:**

```bash
# Check API Gateway logs
docker logs voiceassist-server --tail 100

# Check health
curl http://localhost:8000/health

# Check database
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'voiceassist'"
```

---

### 4. Debug Frontend Issues

**Goal**: Diagnose and fix React web app or admin panel problems

**Key Documents:**

- [Frontend Debugging](../debugging/DEBUGGING_FRONTEND.md)
- [Debugging Overview](../debugging/DEBUGGING_OVERVIEW.md)
- [Frontend Architecture](../FRONTEND_ARCHITECTURE.md)

**Quick Commands:**

```bash
# Check for TypeScript errors
cd apps/web-app && pnpm tsc --noEmit

# Run tests
pnpm test

# Development server
pnpm dev
```

---

### 5. Debug Voice/Realtime Issues

**Goal**: Diagnose WebSocket, STT, or TTS problems

**Key Documents:**

- [Voice & Realtime Debugging](../debugging/DEBUGGING_VOICE_REALTIME.md)
- [Realtime Architecture](../REALTIME_ARCHITECTURE.md)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md)

**Key Files:**

- `apps/web-app/src/hooks/useRealtimeVoiceSession.ts`
- `apps/web-app/src/components/voice/VoiceModePanel.tsx`
- `services/api-gateway/app/api/voice.py`

---

### 6. Update Documentation

**Goal**: Add or modify documentation

**Key Documents:**

- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md)
- [Agent API Reference](./AGENT_API_REFERENCE.md)

**Workflow:**

1. Edit markdown files in `docs/`
2. Add proper frontmatter with metadata
3. Rebuild: `cd apps/docs-site && pnpm build`
4. Regenerate agent JSON: `node scripts/generate-agent-json.mjs`
5. Deploy to `/var/www/assistdocs.asimo.io/`

---

### 7. Add New API Endpoint

**Goal**: Implement a new REST API route

**Key Documents:**

- [API Reference](../API_REFERENCE.md)
- [Backend Architecture](../BACKEND_ARCHITECTURE.md)
- `services/api-gateway/README.md`

**Key Paths:**

- Route handlers: `services/api-gateway/app/api/`
- Services: `services/api-gateway/app/services/`
- Models: `services/api-gateway/app/models/`
- Tests: `services/api-gateway/tests/`

---

### 8. Work on Admin Panel

**Goal**: Implement admin panel features

**Key Documents:**

- [Admin Panel Implementation Plan](../admin/ADMIN_PANEL_IMPLEMENTATION_PLAN.md) - **Canonical implementation roadmap**
- [Admin Panel Specs](../ADMIN_PANEL_SPECS.md) - Full specifications
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Current status

**Key Paths:**

- Backend: `services/api-gateway/app/api/admin_*.py`
- Frontend: `apps/admin-panel/src/`
- Shared types: `packages/types/src/admin/`

**Implementation Plan Phases:**

1. **Phase 1**: Backend-to-Admin Service Matrix
2. **Phase 2**: Admin API Enhancement Plan
3. **Phase 3**: Admin Panel UI Implementation
4. **Phase 4**: API Client Integration
5. **Phase 5**: Security & Compliance
6. **Phase 6**: Testing Strategy
7. **Phase 7**: Deployment & Rollout

**Admin Feature Categories:**

| Category        | API Prefix                  | UI Route                |
| --------------- | --------------------------- | ----------------------- |
| Voice/Realtime  | `/api/admin/voice/*`        | `/voice`                |
| Integrations    | `/api/admin/integrations/*` | `/integrations`         |
| Tools           | `/api/admin/tools/*`        | `/tools`, `/tools/logs` |
| Security/PHI    | `/api/admin/phi/*`          | `/security`             |
| Backups/DR      | `/api/admin/backups/*`      | `/backups`              |
| Troubleshooting | `/api/admin/logs/*`         | `/troubleshooting`      |

**Critical Requirements:**

- All endpoints must enforce RBAC (admin or viewer role)
- All mutations must emit audit logs
- PHI must be masked in all responses
- See Implementation Plan §5.6 for forbidden actions

---

### 9. Security/Compliance Work

**Goal**: HIPAA compliance, security hardening

**Key Documents:**

- [Security Compliance](../SECURITY_COMPLIANCE.md)
- [Semantic Search Design](../SEMANTIC_SEARCH_DESIGN.md) - PHI detection

---

### 10. Infrastructure/Deployment

**Goal**: Docker, Kubernetes, monitoring setup

**Key Documents:**

- [Infrastructure Setup](../INFRASTRUCTURE_SETUP.md)
- [Compose to K8s Migration](../COMPOSE_TO_K8S_MIGRATION.md)

---

## Filtering Documents by Task

Use the agent JSON API to filter documents:

```javascript
// Fetch all docs
const response = await fetch("https://assistdocs.asimo.io/agent/docs.json");
const docs = await response.json();

// Filter by category
const debuggingDocs = docs.filter((d) => d.category === "debugging");

// Filter by audience
const agentDocs = docs.filter((d) => d.audience && d.audience.includes("agent"));

// Filter by tag
const backendDocs = docs.filter((d) => d.tags && d.tags.includes("backend"));
```

---

## Related Documentation

- [Agent Onboarding](./AGENT_ONBOARDING.md) - Getting started
- [Agent API Reference](./AGENT_API_REFERENCE.md) - Endpoint details
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Claude Execution Guide](../CLAUDE_EXECUTION_GUIDE.md) - Workflow guidelines
