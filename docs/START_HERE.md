---
title: "Start Here"
slug: "start-here"
summary: "**Welcome to VoiceAssist V2** - A HIPAA-compliant voice-enabled clinical decision support system."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["start", "here"]
---

# 🚀 VoiceAssist V2 - Start Here

**Welcome to VoiceAssist V2** - A HIPAA-compliant voice-enabled clinical decision support system.

This document is your entry point to the project. Choose your path below based on your role and experience level.

**Status update:** All 15 phase specifications are complete. Backend and infrastructure are production-ready. Frontend web app is in active development (Phase 3). See [Implementation Status](overview/IMPLEMENTATION_STATUS.md) for detailed component status.

---

## 🎯 Quick Start

### For New Developers

1. Read [What is VoiceAssist V2?](#what-is-voiceassist-v2) (5 min)
2. Follow [Getting Started](#getting-started) (30 min)
3. Review [Documentation Map](#documentation-map) to understand what's available
4. Start with [PHASE_00_INITIALIZATION.md](phases/PHASE_00_INITIALIZATION.md)

### For Experienced Developers

1. Review **[UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md)** for complete system design
2. Check [ARCHITECTURE_DIAGRAMS.md](architecture/ARCHITECTURE_DIAGRAMS.md) for visual diagrams
3. Set up local environment: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
4. Jump to [Development Roadmap](#development-roadmap) to see phases

### For Clinicians

1. Read [WEB_APP_SPECS.md](WEB_APP_SPECS.md) to understand clinical workflows
2. Review [User Settings](WEB_APP_SPECS.md#user-settings--preferences) you'll be able to configure
3. Understand [HIPAA protections](SECURITY_COMPLIANCE.md) built into the system

### For Security Reviewers

1. Start with [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md)
2. Review [PHI Detection & Routing](SEMANTIC_SEARCH_DESIGN.md#phi-detection--routing)
3. Check [Audit Logging](ADMIN_PANEL_SPECS.md#audit-logs-audit) requirements

### For System Administrators

1. Read [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md) for admin interface
2. Review [System Settings](ADMIN_PANEL_SPECS.md#system-settings-interface) you'll configure
3. Follow [INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md) for deployment

### Choosing API References

- Use [API_REFERENCE.md](API_REFERENCE.md) for a high-level overview of endpoint groups, concepts, and quick lookups.
- Use [api-reference/rest-api.md](api-reference/rest-api.md) for endpoint-by-endpoint request/response details and examples.
- See [../services/api-gateway/README.md](../services/api-gateway/README.md) for the canonical backend service guide.

---

## 📖 What is VoiceAssist V2?

VoiceAssist V2 is a **HIPAA-compliant voice-enabled clinical decision support system** designed for healthcare providers. It enables doctors to ask clinical questions using voice input and receive evidence-based answers with citations from authoritative medical sources.

### Key Features

- 🎤 **Voice-First Interface**: Push-to-talk and voice-activated modes
- 🔒 **HIPAA Compliant**: PHI detection, audit logging, encrypted storage
- 📚 **Evidence-Based**: Searches UpToDate, PubMed, guidelines, and local knowledge base
- 🤖 **Hybrid AI**: Local Llama for PHI queries, cloud models for general clinical questions
- 📋 **Clinical Workflows**: Quick Consult, Case Workspace, Differential Diagnosis, Drug Reference
- 📊 **Admin Panel**: Knowledge base management, user administration, analytics
- 🔐 **Secure Architecture**: Separate Nextcloud stack for PHI document storage

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VoiceAssist V2 Stack                          │
├─────────────────────────────────────────────────────────────────┤
│  Web App (Next.js)          Admin Panel (Next.js)               │
│       ↓                            ↓                             │
│  ┌─────────────────────────────────────────────────┐            │
│  │         FastAPI Backend (Python)                │            │
│  │  - RAG Engine    - Auth         - PHI Detection │            │
│  │  - AI Router     - Search       - Audit Logs    │            │
│  └─────────────────────────────────────────────────┘            │
│       ↓           ↓              ↓                               │
│  PostgreSQL   Qdrant Vector   Redis Cache                       │
│  (Users/Logs)   (Embeddings)   (Sessions)                       │
└─────────────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────────────┐
│               Separate Nextcloud Stack (PHI Docs)               │
│  - Document Storage  - WebDAV API  - Encryption at Rest         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation Map

All documentation is in the `docs/` directory. Here's the complete index:

### 🎯 Overview & Planning

| Document                                                                                      | Purpose                                                        | Audience                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| **[START_HERE.md](START_HERE.md)** ⭐                                                         | This file - project orientation                                | Everyone                           |
| **[UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md)** ⭐                                     | **Canonical architecture reference**                           | **Developers, Architects, DevOps** |
| **[architecture/ARCHITECTURE_DIAGRAMS.md](architecture/ARCHITECTURE_DIAGRAMS.md)** ⭐ **NEW** | **Visual architecture diagrams (Mermaid)**                     | **Developers, Architects**         |
| **[ARCHITECTURE_V2.md](ARCHITECTURE_V2.md)**                                                  | System architecture, Docker Compose-first approach (reference) | Developers, DevOps                 |
| **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)**                                                  | High-level overview, tech stack, cost estimates                | Stakeholders, PMs                  |
| **[ROADMAP.md](ROADMAP.md)**                                                                  | Product roadmap and feature timeline                           | Product, Management                |
| **[ENHANCEMENT_SUMMARY.md](ENHANCEMENT_SUMMARY.md)**                                          | Summary of documentation enhancements                          | Contributors                       |

### 🛠️ Getting Started

| Document                                                       | Purpose                             | Audience   |
| -------------------------------------------------------------- | ----------------------------------- | ---------- |
| **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** ⭐            | Complete local dev setup guide      | Developers |
| **[INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md)**         | Production server deployment        | DevOps     |
| **[COMPOSE_TO_K8S_MIGRATION.md](COMPOSE_TO_K8S_MIGRATION.md)** | Migration guide from Compose to K8s | DevOps     |

### 🖥️ Frontend Specifications

| Document                                                       | Purpose                                         | Audience              |
| -------------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| **[WEB_APP_SPECS.md](WEB_APP_SPECS.md)** ⭐                    | Doctor-facing web app specs, clinical workflows | Frontend devs, UX     |
| **[ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md)** ⭐            | Admin panel specs, system management            | Frontend devs, Admins |
| **[DOCUMENTATION_SITE_SPECS.md](DOCUMENTATION_SITE_SPECS.md)** | User-facing docs site specs                     | Technical writers     |

### 🔧 Backend & Services

| Document                                                                   | Purpose                                     | Audience                   |
| -------------------------------------------------------------------------- | ------------------------------------------- | -------------------------- |
| **[SERVICE_CATALOG.md](SERVICE_CATALOG.md)** ⭐                            | Complete catalog of all 10 microservices    | All developers, DevOps     |
| **[SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md)** ⭐              | Knowledge base, vector search, RAG pipeline | Backend devs, ML           |
| **[api-reference/rest-api.md](api-reference/rest-api.md)**                 | Endpoint-by-endpoint REST reference         | Backend devs               |
| **[API_REFERENCE.md](API_REFERENCE.md)**                                   | High-level API overview and endpoint groups | Backend devs, stakeholders |
| **[../services/api-gateway/README.md](../services/api-gateway/README.md)** | Canonical API Gateway service guide         | Backend devs               |
| **[server/README.md](../server/README.md)**                                | Backend API documentation                   | Backend devs               |
| **[apps/web-app/README.md](../apps/web-app/README.md)**                    | Web app implementation details              | Frontend devs              |
| **[apps/admin-panel/README.md](../apps/admin-panel/README.md)**            | Admin panel implementation details          | Frontend devs              |
| **[apps/docs-site/README.md](../apps/docs-site/README.md)**                | Documentation site implementation           | Frontend devs              |

**Shared packages:** [../packages/api-client/README.md](../packages/api-client/README.md), [../packages/config/README.md](../packages/config/README.md), [../packages/design-tokens/README.md](../packages/design-tokens/README.md), [../packages/telemetry/README.md](../packages/telemetry/README.md), [../packages/types/README.md](../packages/types/README.md), [../packages/ui/README.md](../packages/ui/README.md), [../packages/utils/README.md](../packages/utils/README.md)

### 🔒 Security & Compliance

| Document                                                 | Purpose                                    | Audience             |
| -------------------------------------------------------- | ------------------------------------------ | -------------------- |
| **[SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md)** ⭐  | HIPAA compliance, PHI handling, audit logs | Security, Compliance |
| **[NEXTCLOUD_INTEGRATION.md](NEXTCLOUD_INTEGRATION.md)** | Separate Nextcloud stack for PHI docs      | DevOps, Security     |

### 🚀 Infrastructure & Deployment

| Document                                                       | Purpose                                    | Audience |
| -------------------------------------------------------------- | ------------------------------------------ | -------- |
| **[INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md)**         | Ubuntu server setup, production deployment | DevOps   |
| **[COMPOSE_TO_K8S_MIGRATION.md](COMPOSE_TO_K8S_MIGRATION.md)** | Kubernetes migration guide                 | DevOps   |

### 🤖 For AI Assistants / Automation

| Document                                                   | Purpose                                                  | Audience                   |
| ---------------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| **[Agent Onboarding](ai/AGENT_ONBOARDING.md)** ⭐          | Quick start guide for AI coding assistants               | Claude Code, AI assistants |
| **[Agent API Reference](ai/AGENT_API_REFERENCE.md)** ⭐    | Machine-readable JSON endpoints for agents               | Claude Code, AI assistants |
| **[CLAUDE_EXECUTION_GUIDE.md](CLAUDE_EXECUTION_GUIDE.md)** | Session startup, branching, safety rules, quality checks | Claude Code, AI assistants |
| **[CLAUDE_PROMPTS.md](CLAUDE_PROMPTS.md)**                 | Ready-to-use prompts for common development tasks        | Claude Code, AI assistants |

**Machine-Readable Endpoints (web):**

- `GET /agent/index.json` - Documentation system metadata
- `GET /agent/docs.json` - Full document list with filtering
- `GET /search-index.json` - Full-text search index (Fuse.js format)

### 📋 Phase Documents (Development Plan)

All phases are in `docs/phases/`. Follow them sequentially:

| Phase        | Name                  | Duration | Focus                                     | File                                                               |
| ------------ | --------------------- | -------- | ----------------------------------------- | ------------------------------------------------------------------ |
| **Phase 0**  | Initialization        | 2h       | Read all specs, understand architecture   | [PHASE_00_INITIALIZATION.md](phases/PHASE_00_INITIALIZATION.md) ⭐ |
| **Phase 1**  | Local Environment     | 3h       | Docker Compose, PostgreSQL, Redis, Qdrant | PHASE*01*\*.md                                                     |
| **Phase 2**  | Database Schema       | 2h       | SQLAlchemy models, Alembic migrations     | PHASE*02*\*.md                                                     |
| **Phase 3**  | Authentication        | 4h       | JWT, user management, RBAC                | PHASE*03*\*.md                                                     |
| **Phase 4**  | Document Ingestion    | 4h       | PDF/DOCX parsing, vector embeddings       | PHASE*04*\*.md                                                     |
| **Phase 5**  | Semantic Search       | 5h       | Qdrant integration, RAG pipeline          | PHASE*05*\*.md                                                     |
| **Phase 6**  | PHI Detection         | 3h       | Presidio integration, routing logic       | PHASE*06*\*.md                                                     |
| **Phase 7**  | AI Router             | 4h       | Llama local, OpenAI cloud, cost tracking  | PHASE*07*\*.md                                                     |
| **Phase 8**  | External Search       | 3h       | PubMed, UpToDate APIs                     | PHASE*08*\*.md                                                     |
| **Phase 9**  | Nextcloud Integration | 3h       | WebDAV, PHI document storage              | PHASE*09*\*.md                                                     |
| **Phase 10** | WebSocket & Voice     | 4h       | Real-time chat, voice transcription       | PHASE*10*\*.md                                                     |
| **Phase 11** | Web App UI            | 8h       | Next.js, clinical workflows, voice UI     | PHASE*11*\*.md                                                     |
| **Phase 12** | Admin Panel UI        | 6h       | Next.js, KB management, user admin        | PHASE*12*\*.md                                                     |
| **Phase 13** | Testing & Monitoring  | 4h       | Pytest, Prometheus, Grafana               | PHASE*13*\*.md                                                     |
| **Phase 14** | Production Deployment | 5h       | Ubuntu server, systemd, backups           | PHASE*14*\*.md                                                     |

**Total Estimated Time**: ~60 hours of focused development

---

## 🗺️ Development Roadmap

### Docker Compose Development (Phases 0-10)

**Goal**: Build fully functional system using Docker Compose on local machine

- ✅ **Phase 0**: Understand architecture and specifications
- 🏗️ **Phases 1-3**: Foundation (environment, database, auth)
- 🏗️ **Phases 4-8**: Core functionality (ingestion, search, AI)
- 🏗️ **Phases 9-10**: Integration (Nextcloud, voice)

**Deliverable**: Working backend with Docker Compose

### Frontend Development (Phases 11-12)

**Goal**: Build Next.js frontends that connect to backend

- 🏗️ **Phase 11**: Web App (doctor-facing interface)
- 🏗️ **Phase 12**: Admin Panel (system management)

**Deliverable**: Complete web and admin interfaces

### Production Deployment (Phases 13-14)

**Goal**: Deploy to Ubuntu server with production configs

- 🏗️ **Phase 13**: Testing, monitoring, observability
- 🏗️ **Phase 14**: Production deployment, backups, systemd

**Deliverable**: Production-ready system on Ubuntu server

### Future: Kubernetes Migration (Optional)

**Goal**: Scale to multi-node K8s cluster

- Follow [COMPOSE_TO_K8S_MIGRATION.md](COMPOSE_TO_K8S_MIGRATION.md)
- Convert Docker Compose to K8s manifests or Helm charts
- Add auto-scaling, load balancing, multi-region

---

## 🔑 Key Decisions & Rationale

### 1. Docker Compose First, Kubernetes Later

**Decision**: Build with Docker Compose, deploy to single Ubuntu server first, migrate to K8s when needed

**Rationale**:

- Faster development iteration
- Simpler debugging and local testing
- Cost-effective for initial deployment
- Easy migration path when scaling needs arise

### 2. Separate Nextcloud Stack

**Decision**: Run Nextcloud in separate Docker Compose stack with its own database

**Rationale**:

- PHI isolation (separate audit logs, backups, encryption keys)
- Independent scaling and maintenance
- Clear security boundary
- Easier compliance audits

### 3. HIPAA Compliance from Day 1

**Decision**: Build HIPAA controls into every component from the start

**Rationale**:

- Retrofitting compliance is expensive and risky
- PHI detection must be part of core routing logic
- Audit logging must be comprehensive from start
- Encryption and access controls easier to add early

### 4. Hybrid AI Model

**Decision**: Use local Llama for PHI queries, cloud models for general questions

**Rationale**:

- Keeps PHI on-premises for HIPAA compliance
- Leverages cloud model quality when safe
- Reduces cloud costs by routing appropriately
- Provides fallback options

### 5. Phase-Based Development

**Decision**: Break project into 14 sequential phases

**Rationale**:

- Each phase is independently completable
- Clear exit criteria and verification
- Easy progress tracking
- Suitable for AI-assisted development with Claude Code

---

## 🏁 Getting Started

### Prerequisites

- macOS (or Linux) with Docker Desktop
- Python 3.11+
- Node.js 18+ with pnpm
- 16GB RAM minimum
- Basic knowledge of FastAPI, Next.js, Docker

### Step 1: Set Up Environment

```bash
# Navigate to project root
cd ~/VoiceAssist  # or your project directory

# Read the local development guide
cat docs/LOCAL_DEVELOPMENT.md

# Follow the setup instructions
# - Install Docker Desktop
# - Create .env files
# - Start Docker Compose services
```

### Step 2: Understand the Architecture

```bash
# Read architecture document
cat docs/ARCHITECTURE_V2.md

# Review key specifications
cat docs/WEB_APP_SPECS.md
cat docs/ADMIN_PANEL_SPECS.md
cat docs/SEMANTIC_SEARCH_DESIGN.md
```

### Step 3: Start Phase 0

```bash
# Read Phase 0 instructions
cat docs/phases/PHASE_00_INITIALIZATION.md

# This phase ensures you understand:
# - System architecture
# - Clinical workflows
# - Security requirements
# - Development approach
```

### Step 4: Continue Through Phases

Follow phases sequentially, verifying exit criteria before moving to the next phase.

---

## 🧭 Learning Path

### Week 1: Foundation

- **Day 1-2**: Read all specifications, understand architecture
- **Day 3**: Set up local environment (Phase 1)
- **Day 4**: Create database schema (Phase 2)
- **Day 5**: Implement authentication (Phase 3)

### Week 2: Core Features

- **Day 1-2**: Document ingestion pipeline (Phase 4)
- **Day 3-4**: Semantic search and RAG (Phase 5)
- **Day 5**: PHI detection (Phase 6)

### Week 3: AI & Integration

- **Day 1-2**: AI model router (Phase 7)
- **Day 3**: External search APIs (Phase 8)
- **Day 4**: Nextcloud integration (Phase 9)
- **Day 5**: WebSocket and voice (Phase 10)

### Week 4: Frontend

- **Day 1-4**: Web app UI (Phase 11)
- **Day 5**: Admin panel UI (Phase 12)

### Week 5: Production

- **Day 1-2**: Testing and monitoring (Phase 13)
- **Day 3-4**: Production deployment (Phase 14)
- **Day 5**: Verification and documentation

---

## 📝 Development Workflow

### Daily Workflow

1. **Start services**: `docker compose up -d`
2. **Check logs**: `docker compose logs -f`
3. **Work on current phase**: Follow phase document
4. **Run tests**: `pytest` or `pnpm test`
5. **Verify functionality**: Manual testing
6. **Commit changes**: Git commit with clear message
7. **Update phase status**: Mark tasks complete

### Working with Claude Code

```
I want to work on Phase [N]. Please:
1. Read ~/VoiceAssist/docs/phases/PHASE_[N]_*.md
2. Check all prerequisites are met
3. Complete all tasks in order
4. Run all tests and verify functionality
5. Update documentation
6. Verify exit criteria
7. Commit the changes
```

### Troubleshooting

- Check service logs: `docker compose logs [service-name]`
- Verify environment variables: `cat .env`
- Review [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) troubleshooting section
- Check phase-specific troubleshooting in phase documents

---

## 📊 Project Status

**Current Status**: Documentation Complete, Ready to Begin Development

**Next Step**: Phase 0 - Initialization (Read all specs and understand architecture)

**Estimated Time to MVP**: 60 hours across 14 phases

**Target Deployment**: Single Ubuntu server with Docker Compose

---

## 🆘 Support & Resources

### Documentation

- **All specs**: `docs/`
- **Phase docs**: `docs/phases/`
- **Applications**: `apps/{web-app,admin-panel,docs-site}/`
- **Services**: `services/api-gateway/`
- **Server**: `server/`

### Key Technologies

- **Backend**: FastAPI, SQLAlchemy, Alembic, LangChain
- **Frontend**: Next.js, React, TailwindCSS, shadcn/ui
- **AI/ML**: Llama 3.1 8B, OpenAI GPT-4, Qdrant
- **Infrastructure**: Docker Compose, PostgreSQL, Redis, Nextcloud

### Getting Help

1. Check phase troubleshooting section
2. Review specification documents
3. Search logs for errors
4. Ask Claude Code for assistance with specific issues

---

## 📇 Machine-Readable Documentation API

For AI assistants and automated tooling, VoiceAssist provides machine-readable JSON endpoints:

### Web API Endpoints

**Base URL**: `https://assistdocs.asimo.io`

| Endpoint             | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `/agent/index.json`  | Documentation system metadata and discovery    |
| `/agent/docs.json`   | Full document list with metadata for filtering |
| `/search-index.json` | Full-text search index (Fuse.js format)        |
| `/sitemap.xml`       | XML sitemap for crawlers                       |

**Usage by AI Agents**:

1. Fetch `/agent/index.json` to understand available endpoints and schema
2. Fetch `/agent/docs.json` to get all documents with metadata
3. Filter client-side by `status`, `audience`, `tags`, etc.
4. Use `/search-index.json` with Fuse.js for full-text search

See the [Agent API Reference](ai/AGENT_API_REFERENCE.md) for complete details.

### DOC_INDEX.yml (Legacy)

**Location**: [`docs/DOC_INDEX.yml`](DOC_INDEX.yml)

**Purpose**: Canonical registry of all project documentation with metadata. This YAML file is still available for local tooling but the web JSON endpoints are preferred for programmatic access.

---

## 🎉 Let's Build!

You now have a comprehensive understanding of VoiceAssist V2. The project is structured to be built phase-by-phase, with clear specifications and requirements at every step.

**Ready to start?** Open [PHASE_00_INITIALIZATION.md](phases/PHASE_00_INITIALIZATION.md) and begin your journey.

Good luck! 🚀

---

## 📜 Legacy V1 Materials

The following documents describe the original 20-phase V1 plan. They are preserved **for historical reference only** and are not canonical for V2 development:

- [DEVELOPMENT_PHASES.md](DEVELOPMENT_PHASES.md) - Original 20-phase plan (V1)
- [ALL_PHASES_SUMMARY.md](ALL_PHASES_SUMMARY.md) - Original phase summaries (V1)
- [ROADMAP.md](ROADMAP.md) - Original roadmap (V1)
- [ARCHITECTURE.md](ARCHITECTURE.md) - Original architecture (V1)
- [../PHASE_STATUS.md](../PHASE_STATUS.md) - Original phase tracking (V1)

**Note**: All V1 documents have been marked with a legacy banner directing readers to the current V2 documentation.
