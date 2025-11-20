# AI Agent Navigation Guide

**Purpose**: Help AI agents (like Claude Code) quickly understand and navigate the VoiceAssist V2 codebase.

---

## Quick Start for AI Agents

### First Time in This Project?

1. **Read this file** to understand how to navigate
2. **Read** [`index.json`](index.json) to see the complete file map
3. **Start with** [`docs/START_HERE.md`](../docs/START_HERE.md) for project orientation
4. **Check** [`CURRENT_PHASE.md`](../CURRENT_PHASE.md) to see what phase we're on

### Returning to This Project?

1. **Check** [`CURRENT_PHASE.md`](../CURRENT_PHASE.md) first
2. **Review** [`PHASE_STATUS.md`](../PHASE_STATUS.md) to see completed phases
3. **Continue** with the current phase's task list

---

## How to Use index.json

The [`index.json`](index.json) file is a **machine-readable index** of all documentation and code in this project. It contains:

### 1. Core Concepts

Essential design documents that define the system:

```json
{
  "core_concepts": {
    "data_model": "docs/DATA_MODEL.md",           // ALL data entities
    "backend_architecture": "docs/BACKEND_ARCHITECTURE.md",  // Monorepo vs microservices
    "orchestration": "docs/ORCHESTRATION_DESIGN.md",  // Query orchestration logic
    "service_catalog": "docs/SERVICE_CATALOG.md",  // All 10 microservices
    "security": "docs/SECURITY_COMPLIANCE.md",  // HIPAA compliance
    "semantic_search": "docs/SEMANTIC_SEARCH_DESIGN.md"  // RAG pipeline
  }
}
```

**When to read**: At the start of ANY task

### 2. Task Index

Maps common tasks to required reading:

```json
{
  "task_index": {
    "implement_backend": {
      "description": "Implement FastAPI backend services",
      "read_first": [
        "docs/DATA_MODEL.md",
        "docs/BACKEND_ARCHITECTURE.md",
        "docs/ORCHESTRATION_DESIGN.md"
      ],
      "read_next": [
        "server/README.md",
        "docs/SEMANTIC_SEARCH_DESIGN.md"
      ]
    }
  }
}
```

**How to use**:
1. Find your task in `task_index`
2. Read all files in `read_first` (in order)
3. Read files in `read_next` as needed

### 3. Dependencies

Shows which docs depend on which:

```json
{
  "dependencies": {
    "docs/WEB_APP_SPECS.md": [
      "docs/DATA_MODEL.md",
      "docs/ARCHITECTURE_V2.md"
    ]
  }
}
```

**When to use**: When updating a doc, check what else needs updating

### 4. Entity Locations

Find where each data entity is defined:

```json
{
  "entity_locations": {
    "User": {
      "definition": "docs/DATA_MODEL.md#user",
      "backend_model": "server/app/models/user.py",
      "frontend_type": "web-app/src/types/user.ts"
    }
  }
}
```

**When to use**: When implementing or referencing an entity

---

## Common AI Agent Workflows

### Workflow 1: Starting a New Phase

```
1. Read: CURRENT_PHASE.md
   → Understand what phase we're on

2. Read: docs/phases/PHASE_XX_NAME.md
   → Get detailed instructions for current phase

3. Read: Task-specific docs (from index.json task_index)
   → e.g., if implementing backend, read DATA_MODEL.md, BACKEND_ARCHITECTURE.md

4. Implement: Follow phase instructions step-by-step

5. Update: CURRENT_PHASE.md with progress

6. Verify: Check exit criteria in phase doc

7. Complete: Mark phase complete, update PHASE_STATUS.md
```

### Workflow 2: Implementing a Feature

```
1. Read: index.json → Find "task_index" entry for your feature

2. Read: All files in "read_first" list

3. Check: entity_locations and service_locations for relevant entities/services

4. Read: Implementation guide (server/README.md, web-app/README.md, etc.)

5. Implement: Write code following the specs

6. Test: Write and run tests

7. Document: Update relevant docs if you changed behavior
```

### Workflow 3: Understanding Architecture

```
1. Read: docs/START_HERE.md
   → High-level overview

2. Read: docs/ARCHITECTURE_V2.md
   → Detailed system architecture

3. Read: docs/BACKEND_ARCHITECTURE.md
   → Backend structure (monorepo vs microservices)

4. Read: docs/DATA_MODEL.md
   → All data entities and relationships

5. Read: docs/ORCHESTRATION_DESIGN.md
   → How queries flow through the system

6. Read: docs/SERVICE_CATALOG.md
   → All microservices and their responsibilities
```

### Workflow 4: Implementing an Entity

```
Example: Implementing "ChatMessage" entity

1. Read: docs/DATA_MODEL.md#chatmessage
   → Get canonical definition (JSON Schema, Pydantic, TypeScript)

2. Backend:
   - Copy Pydantic model from DATA_MODEL.md
   - Create server/app/models/message.py (SQLAlchemy)
   - Create server/app/schemas/message.py (Pydantic for API)

3. Frontend:
   - Copy TypeScript interface from DATA_MODEL.md
   - Create web-app/src/types/message.ts
   - Use in components

4. API:
   - Define endpoints in server/app/api/chat.py
   - Follow specs in docs/WEB_APP_SPECS.md#api-integration

5. Tests:
   - Write tests in server/tests/
   - Test CRUD operations, validation, relationships
```

---

## File Organization

### Documentation (`docs/`)

```
docs/
├── START_HERE.md                   # Project orientation (START HERE!)
├── ARCHITECTURE_V2.md              # System architecture
├── DATA_MODEL.md                   # Canonical data entities ⭐
├── BACKEND_ARCHITECTURE.md         # Backend structure ⭐
├── ORCHESTRATION_DESIGN.md         # Query orchestration ⭐
├── SECURITY_COMPLIANCE.md          # HIPAA compliance
├── SEMANTIC_SEARCH_DESIGN.md       # RAG pipeline
├── WEB_APP_SPECS.md                # Web app specs
├── ADMIN_PANEL_SPECS.md            # Admin panel specs
├── SERVICE_CATALOG.md              # All microservices
├── LOCAL_DEVELOPMENT.md            # Local setup guide
├── INFRASTRUCTURE_SETUP.md         # Production setup
├── DEVELOPMENT_PHASES_V2.md        # 15-phase plan
├── CLAUDE_EXECUTION_GUIDE.md       # Guide for Claude Code
└── phases/
    ├── PHASE_00_INITIALIZATION.md  # Phase 0 (canonical)
    ├── PHASE_01_LOCAL_ENVIRONMENT.md  # V1 LEGACY
    └── PHASE_02_DATABASE_SCHEMA.md    # V1 LEGACY
```

⭐ = Must-read for most tasks

### Code (`server/`, `web-app/`, `admin-panel/`)

```
server/                             # Backend API
├── app/
│   ├── api/                        # API endpoints (routers)
│   ├── services/                   # Business logic
│   ├── models/                     # SQLAlchemy ORM models
│   ├── schemas/                    # Pydantic schemas
│   ├── core/                       # Config, database, security
│   └── utils/                      # Utilities
├── tests/                          # Test suite
└── README.md                       # Backend implementation guide

web-app/                            # Next.js web app (doctor-facing)
├── src/
│   ├── app/                        # Next.js app router
│   ├── components/                 # React components
│   ├── hooks/                      # Custom hooks
│   ├── types/                      # TypeScript types
│   └── api/                        # API client
└── README.md                       # Web app implementation guide

admin-panel/                        # Next.js admin panel
├── src/
│   ├── app/                        # Next.js app router
│   ├── components/                 # React components
│   └── types/                      # TypeScript types
└── README.md                       # Admin panel implementation guide
```

---

## Entity Quick Reference

Use this table to quickly find where an entity is defined:

| Entity | Canonical Definition | Backend | Frontend (Web) | Frontend (Admin) |
|--------|---------------------|---------|----------------|------------------|
| `User` | [DATA_MODEL.md#user](../docs/DATA_MODEL.md#user) | `server/app/models/user.py` | `web-app/src/types/user.ts` | `admin-panel/src/types/user.ts` |
| `Session` | [DATA_MODEL.md#session](../docs/DATA_MODEL.md#session--conversation) | `server/app/models/session.py` | `web-app/src/types/session.ts` | - |
| `ChatMessage` | [DATA_MODEL.md#chatmessage](../docs/DATA_MODEL.md#chatmessage) | `server/app/models/message.py` | `web-app/src/types/message.ts` | - |
| `Citation` | [DATA_MODEL.md#citation](../docs/DATA_MODEL.md#citation) | `server/app/schemas/citation.py` | `web-app/src/types/citation.ts` | - |
| `KnowledgeDocument` | [DATA_MODEL.md#knowledgedocument](../docs/DATA_MODEL.md#knowledgedocument) | `server/app/models/document.py` | - | `admin-panel/src/types/document.ts` |
| `UserSettings` | [DATA_MODEL.md#usersettings](../docs/DATA_MODEL.md#usersettings) | `server/app/models/settings.py` | `web-app/src/types/settings.ts` | - |
| `SystemSettings` | [DATA_MODEL.md#systemsettings](../docs/DATA_MODEL.md#systemsettings) | `server/app/models/settings.py` | - | `admin-panel/src/types/settings.ts` |

**Rule**: ALWAYS use the canonical definition from DATA_MODEL.md as the source of truth.

---

## Service Quick Reference

| Service | Design Doc | Implementation | Purpose |
|---------|-----------|----------------|---------|
| `QueryOrchestrator` | [ORCHESTRATION_DESIGN.md](../docs/ORCHESTRATION_DESIGN.md) | `server/app/services/rag_service.py` | Main query processing |
| `PHIDetector` | [ORCHESTRATION_DESIGN.md#phi-detection](../docs/ORCHESTRATION_DESIGN.md#phi-detection--routing) | `server/app/services/phi_detector.py` | Detect PHI in queries |
| `SearchAggregator` | [SEMANTIC_SEARCH_DESIGN.md](../docs/SEMANTIC_SEARCH_DESIGN.md) | `server/app/services/search_aggregator.py` | Search multiple sources |
| `KBIndexer` | [SEMANTIC_SEARCH_DESIGN.md#indexing](../docs/SEMANTIC_SEARCH_DESIGN.md#document-ingestion-pipeline) | `server/app/services/kb_indexer.py` | Index documents |
| `AuditLogger` | [SECURITY_COMPLIANCE.md#audit](../docs/SECURITY_COMPLIANCE.md#audit-logging) | `server/app/services/audit_logger.py` | HIPAA audit logging |

---

## Example Queries for AI Agents

### "I want to implement the backend"

**Answer from index.json**:
```json
"implement_backend": {
  "read_first": [
    "docs/DATA_MODEL.md",
    "docs/BACKEND_ARCHITECTURE.md",
    "docs/ORCHESTRATION_DESIGN.md"
  ],
  "read_next": [
    "server/README.md",
    "docs/SEMANTIC_SEARCH_DESIGN.md",
    "docs/SECURITY_COMPLIANCE.md"
  ]
}
```

### "I want to implement the User entity"

**Answer from index.json**:
```json
"User": {
  "definition": "docs/DATA_MODEL.md#user",
  "backend_model": "server/app/models/user.py",
  "frontend_type": "web-app/src/types/user.ts"
}
```

**Steps**:
1. Read canonical definition: `docs/DATA_MODEL.md#user`
2. Copy Pydantic model to `server/app/models/user.py`
3. Copy TypeScript interface to `web-app/src/types/user.ts`

### "I want to understand how queries are processed"

**Answer from index.json**:
```json
"orchestration": "docs/ORCHESTRATION_DESIGN.md"
```

**Read**:
1. `docs/ORCHESTRATION_DESIGN.md` - Complete orchestration flow
2. `docs/DATA_MODEL.md#queryresponse` - Response format
3. `docs/SEMANTIC_SEARCH_DESIGN.md` - Search implementation

### "I want to start Phase 3"

**Answer from index.json**:
```json
"start_phase": {
  "read_first": [
    "CURRENT_PHASE.md",
    "PHASE_STATUS.md",
    "docs/DEVELOPMENT_PHASES_V2.md"
  ],
  "read_next": [
    "docs/phases/PHASE_03_MICROSERVICES.md",
    "docs/CLAUDE_EXECUTION_GUIDE.md"
  ]
}
```

---

## Consistency Rules for AI Agents

### 1. Data Model Consistency

**Rule**: ALL data entities MUST match `docs/DATA_MODEL.md`.

**Check**:
- Backend Pydantic models match DATA_MODEL.md
- Frontend TypeScript interfaces match DATA_MODEL.md
- API request/response types match DATA_MODEL.md

**If inconsistent**: Update the implementation, NOT DATA_MODEL.md (unless intentional)

### 2. Cross-Reference Consistency

**Rule**: When updating a doc, check `dependencies` in index.json.

**Example**:
```json
"docs/WEB_APP_SPECS.md": [
  "docs/DATA_MODEL.md",
  "docs/ARCHITECTURE_V2.md"
]
```

If you update `DATA_MODEL.md`, check if `WEB_APP_SPECS.md` needs updating.

### 3. Phase Reference Consistency

**Rule**: V2 docs MUST reference V2 phases (0-14), NOT V1 phases.

**Check**: Search for "PHASE_01_LOCAL_ENVIRONMENT" or "PHASE_02_DATABASE_SCHEMA" in V2 docs → should NOT appear

**Exception**: `docs/phases/PHASE_01_LOCAL_ENVIRONMENT.md` itself is marked as LEGACY V1

---

## Tips for Claude Code

### DO:
- Always read `index.json` first
- Use `task_index` to find what to read
- Read canonical definitions from `DATA_MODEL.md`
- Check `CURRENT_PHASE.md` before starting work
- Update `CURRENT_PHASE.md` as you progress
- Follow the phase exit criteria

### DON'T:
- Don't skip reading phase instructions
- Don't assume entity structure (always check DATA_MODEL.md)
- Don't implement without reading design docs
- Don't update DATA_MODEL.md without reviewing all dependent docs
- Don't reference V1 phase docs for V2 work

---

## Getting Help

### If you're stuck on a task:

1. Check `index.json` → `task_index` for your task
2. Read all files in `read_first` list
3. Check `entity_locations` or `service_locations` for specific components
4. Read related design docs in `core_concepts`

### If you need to understand a concept:

1. Check `quick_reference` in `index.json`
2. Read the linked doc
3. Follow `dependencies` to related docs

### If you're starting a new phase:

1. Read `CURRENT_PHASE.md`
2. Read phase doc: `docs/phases/PHASE_XX_NAME.md`
3. Read task-specific docs from phase's "Related Documentation" section

---

## Summary

This `.ai/` directory and `index.json` are designed to help AI agents:
1. **Navigate** the codebase quickly
2. **Find** relevant documentation for any task
3. **Understand** dependencies between docs
4. **Maintain** consistency across all files
5. **Work** efficiently on phases and features

**Always start with `index.json` → it's your map to the entire project.**

Good luck! 🚀
