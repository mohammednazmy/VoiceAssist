---
title: Agent Task Index
slug: ai/agent-task-index
summary: >-
  Common AI agent tasks with relevant documentation and machine-readable
  endpoints.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-04"
audience:
  - ai-agents
tags:
  - ai-agent
  - tasks
  - index
  - reference
category: ai
version: 1.2.0
ai_summary: >-
  Catalog of common AI agent tasks with relevant docs and commands. Tasks include:
  understand project status, debug backend/frontend/voice issues, update documentation,
  add API endpoints, work on admin panel, docs health audit, and NEW repository
  navigation tasks (discover components, locate features, audit docs vs code, explore
  by language, find entry points). Each task links to specific docs, code paths,
  API endpoints, and diagnostic commands.
---

# Agent Task Index

This document lists common AI agent tasks with the relevant documentation and endpoints needed to complete them.

**Machine-Readable Endpoints:**

- `https://assistdocs.asimo.io/agent/index.json` - Documentation metadata
- `https://assistdocs.asimo.io/agent/docs.json` - Full document list with filtering
- `https://assistdocs.asimo.io/agent/tasks.json` - Common agent tasks with commands
- `https://assistdocs.asimo.io/search-index.json` - Full-text search index
- `https://assistdocs.asimo.io/agent/repo-index.json` - Repository structure index
- `https://assistdocs.asimo.io/agent/repo/manifest.json` - Key files manifest
- `https://assistdocs.asimo.io/agent/repo/files/{path}.json` - Source file content

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
2. Add proper frontmatter with metadata (see [Metadata Standard](../DOCUMENTATION_METADATA_STANDARD.md))
3. Validate: `cd apps/docs-site && pnpm validate:all`
4. Regenerate search index and agent JSON: `pnpm generate-search-index && pnpm generate-agent-json`
5. Build: `pnpm build`
6. Deploy: Copy `out/` to `/var/www/assistdocs.asimo.io/`

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

### 11. Docs Health Audit

**Goal**: Assess documentation quality and identify improvement areas

**Key Documents:**

- [Documentation Metadata Standard](../DOCUMENTATION_METADATA_STANDARD.md)
- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md)
- [Agent API Reference](./AGENT_API_REFERENCE.md)

**Workflow:**

1. Fetch health metrics: `curl https://assistdocs.asimo.io/agent/health.json`
2. Run local validation: `cd apps/docs-site && pnpm validate:all`
3. Check AI summary coverage: `curl https://assistdocs.asimo.io/agent/docs-summary.json | jq '.stats'`
4. Identify stale docs from health.json `category_freshness` section
5. Add missing `ai_summary` fields to docs targeting AI agents

**Quick Commands:**

```bash
cd apps/docs-site

# Run all validation checks
pnpm validate:all

# Check for docs missing ai_summary
pnpm validate:metadata 2>&1 | grep "Missing ai_summary"

# Regenerate agent JSON after fixes
pnpm generate-agent-json
```

---

## Repository Navigation Tasks

These tasks leverage the machine-readable repository endpoints to explore and understand the codebase.

### 12. Discover Repository Components

**Goal**: List and understand all major components in the codebase

**API Endpoints:**

- `https://assistdocs.asimo.io/agent/repo-index.json` - Full repository structure
- `https://assistdocs.asimo.io/agent/repo/manifest.json` - Key files manifest

**Workflow:**

```bash
# List all component categories
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '.stats.by_component'

# Find all frontend components
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.component | startswith("frontend"))]'

# Find all backend services
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.component | startswith("backend"))]'

# Get language breakdown
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '.stats.by_language'
```

**Key Documents:**

- [Agent API Reference](./AGENT_API_REFERENCE.md) - Full endpoint documentation
- [Repo Navigation for Agents](./REPO_NAVIGATION_FOR_AGENTS.md) - Patterns and examples

---

### 13. Locate Feature Implementation

**Goal**: Given a feature name, find relevant implementation files

**API Endpoints:**

- `https://assistdocs.asimo.io/agent/repo-index.json` - File paths by component
- `https://assistdocs.asimo.io/agent/repo/files/{encoded-path}.json` - Source code content
- `https://assistdocs.asimo.io/search-index.json` - Full-text search

**Workflow:**

1. Search documentation for feature context:

   ```bash
   curl https://assistdocs.asimo.io/agent/docs.json | jq '.docs[] | select(.title | test("voice"; "i"))'
   ```

2. Find implementation files by component:

   ```bash
   # Voice features are in backend/api-gateway and frontend/web-app
   curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | test("voice"; "i"))]'
   ```

3. Get source code for specific file:

   ```bash
   # Path encoding: / → __ (double underscore)
   # Example: services/api-gateway/app/api/voice.py → services__api-gateway__app__api__voice.py.json
   curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__api__voice.py.json
   ```

4. Cross-reference with documentation:
   ```bash
   curl https://assistdocs.asimo.io/agent/docs.json | jq '.docs[] | select(.tags | index("voice"))'
   ```

**Key Documents:**

- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md) - Voice architecture
- [Backend Architecture](../BACKEND_ARCHITECTURE.md) - Service structure
- [Frontend Architecture](../FRONTEND_ARCHITECTURE.md) - App structure

---

### 14. Audit Implementation vs Documentation

**Goal**: Compare documentation claims against actual code implementation

**API Endpoints:**

- `https://assistdocs.asimo.io/agent/docs.json` - Documentation metadata
- `https://assistdocs.asimo.io/agent/repo-index.json` - Repository structure
- `https://assistdocs.asimo.io/agent/repo/files/{encoded-path}.json` - Source code

**Workflow:**

1. Identify feature documentation:

   ```bash
   curl https://assistdocs.asimo.io/agent/docs.json | jq '.docs[] | select(.category == "admin")'
   ```

2. Extract documented paths/endpoints from docs
3. Verify files exist in repo-index:

   ```bash
   curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | test("admin"))]'
   ```

4. Fetch and compare source code:

   ```bash
   curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__api__admin.py.json | jq '.content'
   ```

5. Report discrepancies:
   - Missing files referenced in docs
   - Undocumented endpoints in code
   - Version/status mismatches

**Key Documents:**

- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status matrix
- [API Reference](../API_REFERENCE.md) - Documented endpoints
- [Documentation Metadata Standard](../DOCUMENTATION_METADATA_STANDARD.md) - Status values

---

### 15. Explore Codebase by Language

**Goal**: Find all files of a specific programming language

**API Endpoint:**

- `https://assistdocs.asimo.io/agent/repo-index.json`

**Workflow:**

```bash
# Find all TypeScript files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.language == "typescript")]'

# Find all Python files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.language == "python")]'

# Count files by language
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '.stats.by_language'

# Find configuration files (YAML, JSON, TOML)
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.language | . == "yaml" or . == "json" or . == "toml")]'
```

**Supported Languages:**

typescript, javascript, python, markdown, json, yaml, toml, html, css, scss, shell, dockerfile, terraform, prisma, graphql

---

### 16. Find Entry Points and Configuration

**Goal**: Quickly locate main entry points and config files

**API Endpoint:**

- `https://assistdocs.asimo.io/agent/repo/manifest.json` - Curated key files

**Workflow:**

```bash
# Get all exported key files
curl https://assistdocs.asimo.io/agent/repo/manifest.json | jq '.files'

# Find package.json files (entry points)
curl https://assistdocs.asimo.io/agent/repo/manifest.json | jq '[.files[] | select(.path | endswith("package.json"))]'

# Find Python entry points
curl https://assistdocs.asimo.io/agent/repo/manifest.json | jq '[.files[] | select(.path | endswith("main.py"))]'

# Get root configuration files
curl https://assistdocs.asimo.io/agent/repo/manifest.json | jq '[.files[] | select(.path | contains("/") | not)]'
```

**Key Files Categories:**

| Category      | Examples                                     |
| ------------- | -------------------------------------------- |
| Root Config   | package.json, turbo.json, docker-compose.yml |
| API Gateway   | main.py, config.py, requirements.txt         |
| Web App       | next.config.js, page.tsx, layout.tsx         |
| Admin Panel   | next.config.js, page.tsx, layout.tsx         |
| Documentation | START_HERE.md, AGENT_ONBOARDING.md           |

---

## Filtering Documents by Task

Use the agent JSON API to filter documents:

```javascript
// Fetch all docs
const response = await fetch("https://assistdocs.asimo.io/agent/docs.json");
const data = await response.json();

// Filter by category
const debuggingDocs = data.docs.filter((d) => d.category === "debugging");

// Filter by audience (use canonical 'ai-agents' value)
const agentDocs = data.docs.filter((d) => d.audience && d.audience.includes("ai-agents"));

// Filter by tag
const backendDocs = data.docs.filter((d) => d.tags && d.tags.includes("backend"));

// Find docs with ai_summary
const docsWithSummary = data.docs.filter((d) => d.ai_summary);
```

---

## Related Documentation

- [Agent Onboarding](./AGENT_ONBOARDING.md) - Getting started
- [Agent API Reference](./AGENT_API_REFERENCE.md) - Endpoint details
- [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) - Component status
- [Claude Execution Guide](../CLAUDE_EXECUTION_GUIDE.md) - Workflow guidelines
