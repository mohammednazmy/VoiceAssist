---
title: "Readme"
slug: "architecture/readme"
summary: "**Last Updated**: 2025-11-20 (Phase 7)"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["readme"]
category: architecture
---

# VoiceAssist V2 - Architecture Documentation

**Last Updated**: 2025-11-20 (Phase 7)

This directory contains comprehensive architecture documentation for VoiceAssist V2.

---

## Quick Start

**New to VoiceAssist?** Start here:

1. **[UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)** - Comprehensive system architecture (START HERE)
2. **[ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)** - Visual diagrams (Mermaid)
3. **[SERVICE_CATALOG.md](../SERVICE_CATALOG.md)** - Detailed service descriptions

---

## Documentation Index

### Core Architecture

| Document                                                  | Purpose                              | Last Updated |
| --------------------------------------------------------- | ------------------------------------ | ------------ |
| **[UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)** | **Canonical architecture reference** | 2025-11-20   |
| [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)      | Visual architecture diagrams         | 2025-11-20   |
| [SERVICE_CATALOG.md](../SERVICE_CATALOG.md)               | Comprehensive service catalog        | 2025-11-21   |
| [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md)     | Backend structure evolution          | 2025-11-20   |

### Design Documents

| Document                                                  | Purpose                            |
| --------------------------------------------------------- | ---------------------------------- |
| [ORCHESTRATION_DESIGN.md](../ORCHESTRATION_DESIGN.md)     | RAG query orchestrator design      |
| [SEMANTIC_SEARCH_DESIGN.md](../SEMANTIC_SEARCH_DESIGN.md) | Vector search implementation       |
| [DATA_MODEL.md](../DATA_MODEL.md)                         | Canonical data entities            |
| [NEXTCLOUD_INTEGRATION.md](../NEXTCLOUD_INTEGRATION.md)   | Nextcloud integration architecture |

### Operations & Observability

| Document                                                          | Purpose                         |
| ----------------------------------------------------------------- | ------------------------------- |
| [operations/SLO_DEFINITIONS.md](../operations/SLO_DEFINITIONS.md) | Service level objectives        |
| [OBSERVABILITY.md](../OBSERVABILITY.md)                           | Monitoring and logging patterns |
| [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md)               | HIPAA compliance details        |

### Development

| Document                                                        | Purpose               |
| --------------------------------------------------------------- | --------------------- |
| [Implementation Status](../overview/IMPLEMENTATION_STATUS.md)   | Component status      |
| [DEVELOPMENT_PHASES_V2.md](../DEVELOPMENT_PHASES_V2.md)         | Phase-by-phase plan   |
| [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)                 | Local setup guide     |
| [testing/E2E_TESTING_GUIDE.md](../testing/E2E_TESTING_GUIDE.md) | Testing strategy      |
| [Archive: CURRENT_PHASE](../archive/CURRENT_PHASE.md)           | Historical phase info |

---

## Architecture Overview

VoiceAssist V2 follows a **progressive architecture strategy**:

- **Phases 0-7 (Current)**: Monorepo-first backend with Docker Compose
- **Phases 8-14 (Future)**: Optional microservices with Kubernetes

### Current Capabilities (Phase 7)

✅ JWT authentication with RBAC
✅ RAG-powered medical knowledge base
✅ Real-time WebSocket communication
✅ Nextcloud integration (CalDAV, WebDAV)
✅ Multi-level caching (L1 + L2)
✅ Comprehensive observability (Prometheus, Grafana)
✅ Admin panel with system monitoring
✅ Async background job processing

### System Architecture (High-Level)

```
┌─────────────────────────────────────────────┐
│           Users (Web/Mobile)                 │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐  ┌────────▼───────────────┐
│  Nextcloud     │  │  VoiceAssist Backend   │
│  (Separate)    │◄─┤  - API Gateway         │
│  - Auth/SSO    │  │  - RAG Service         │
│  - Calendar    │  │  - Admin Service       │
│  - Files       │  │  - Integrations        │
└────────────────┘  └────────┬───────────────┘
                             │
                    ┌────────┴────────┐
                    │   Data Layer    │
                    │  - PostgreSQL   │
                    │  - Redis        │
                    │  - Qdrant       │
                    └─────────────────┘
```

For detailed diagrams, see [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md).

---

## Key Architecture Principles

1. **Progressive Complexity**: Start simple (monorepo), maintain boundaries, scale when needed
2. **Security by Design**: Zero-trust, HIPAA-compliant, audit everything
3. **Observability First**: Metrics, logs, tracing, dashboards, alerts
4. **API-First Design**: Standard envelope, typed errors, versioning
5. **Performance Optimization**: Multi-level caching, async processing

---

## Technology Stack Summary

**Backend**: Python 3.11, FastAPI, SQLAlchemy, Pydantic
**Databases**: PostgreSQL (pgvector), Redis, Qdrant
**AI/ML**: OpenAI (embeddings + LLM)
**Integration**: caldav, webdavclient3, httpx
**Observability**: Prometheus, Grafana, (future: Jaeger, Loki)
**Infrastructure**: Docker Compose (current), Kubernetes (future)

---

## Reading Guide by Role

### For New Developers

1. Read [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - System overview
2. Review [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - Visual understanding
3. Check [SERVICE_CATALOG.md](../SERVICE_CATALOG.md) - Service responsibilities
4. Follow [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md) - Setup instructions

### For System Architects

1. Read [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - Complete architecture
2. Review [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) - Monorepo to microservices
3. Study [ORCHESTRATION_DESIGN.md](../ORCHESTRATION_DESIGN.md) - RAG pipeline
4. Check [SEMANTIC_SEARCH_DESIGN.md](../SEMANTIC_SEARCH_DESIGN.md) - Vector search

### For Operations/DevOps

1. Read [operations/SLO_DEFINITIONS.md](../operations/SLO_DEFINITIONS.md) - SLOs and error budgets
2. Review [OBSERVABILITY.md](../OBSERVABILITY.md) - Monitoring patterns
3. Check [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - Deployment architecture
4. Study future K8s deployment in [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

### For Security/Compliance

1. Read [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md) - HIPAA details
2. Review security architecture section in [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)
3. Check audit logging in [SERVICE_CATALOG.md](../SERVICE_CATALOG.md)
4. Review authentication flows in [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

---

## Architecture Evolution Timeline

| Phase   | Focus                                                  | Status      |
| ------- | ------------------------------------------------------ | ----------- |
| **0-1** | Foundation (Docker, DB, Redis, Qdrant)                 | ✅ Complete |
| **2-3** | Security & Core Services (JWT, Auth, API Gateway)      | ✅ Complete |
| **4**   | Realtime Communication (WebSocket, QueryOrchestrator)  | ✅ Complete |
| **5**   | Medical AI (RAG, semantic search, document ingestion)  | ✅ Complete |
| **6**   | Nextcloud Integration (CalDAV, WebDAV, file indexing)  | ✅ Complete |
| **7**   | Admin & RBAC (admin endpoints, dashboard, smoke tests) | ✅ Complete |
| **8+**  | OIDC, email, voice, frontend, microservices            | ⏳ Future   |

---

## Related Resources

**Code Repositories:**

- Backend: `/services/api-gateway/`
- Tests: `/services/api-gateway/tests/`
- Infrastructure: `/infrastructure/observability/`

**External Documentation:**

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [Qdrant Docs](https://qdrant.tech/documentation/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)

---

## Contributing to Architecture Docs

**When to Update:**

- After completing a major phase
- After significant architectural changes
- After adding new services or components
- After infrastructure changes (new databases, observability)

**Update Process:**

1. Update [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) first (canonical reference)
2. Update [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) if visual changes
3. Update [SERVICE_CATALOG.md](../SERVICE_CATALOG.md) if service changes
4. Update [Implementation Status](../overview/IMPLEMENTATION_STATUS.md) for component status changes
5. Create phase completion report in `/docs/` (e.g., `PHASE_XX_COMPLETION_REPORT.md`)

**Review Cycle:**

- Minor updates: As needed during development
- Major reviews: After each phase completion
- Full audit: Every 3 phases (currently at Phase 7, next full audit at Phase 10)

---

## Questions or Issues?

- **Architecture Questions**: Review [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) first
- **Service-Specific Questions**: Check [SERVICE_CATALOG.md](../SERVICE_CATALOG.md)
- **Setup Issues**: Follow [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)
- **Bug Reports**: Use issue tracker with architecture context

---

**Document Version**: 1.0
**Last Updated**: 2025-11-20
**Maintained By**: VoiceAssist Development Team
**Next Review**: After Phase 10 completion
