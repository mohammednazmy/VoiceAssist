---
title: Readme
slug: readme
summary: "**Last Updated**: 2025-12-08"
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - readme
category: reference
component: "docs/overview"
relatedPaths:
  - "docs/ai/AGENT_ONBOARDING.md"
  - "docs/overview/IMPLEMENTATION_STATUS.md"
ai_summary: >-
  Last Updated: 2025-12-08 Project Status: ✅ All 15 Phases Complete - Production
  Ready (100%) --- If you're an AI coding assistant (Claude, GPT, Copilot,
  etc.): - ai/AGENT_ONBOARDING.md - Start here for quick context, repository
  structure, critical rules, and common tasks - overview/IMPLEMENTATION_...
---

# VoiceAssist V2 Documentation Index

**Last Updated**: 2025-12-08
**Project Status**: ✅ All 15 Phases Complete - Production Ready (100%)

---

## 📚 Quick Navigation

### 🤖 For AI Agents

If you're an AI coding assistant (Claude, GPT, Copilot, etc.):

- **[ai/AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.md)** - Start here for quick context, repository structure, critical rules, and common tasks
- **[overview/IMPLEMENTATION_STATUS.md](overview/IMPLEMENTATION_STATUS.md)** - Single source of truth for component status
- **Key Rule:** Use `services/api-gateway/` for backend work (NOT `server/` which is deprecated)

### 🚀 Start Here

- **[START_HERE.md](START_HERE.md)** - Project overview and getting started
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Commands, ports, file locations cheatsheet
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Executive summary
- **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** - Development environment setup
- **[API_REFERENCE.md](API_REFERENCE.md)** - High-level API overview and endpoint groups
- **[api-reference/rest-api.md](api-reference/rest-api.md)** - Detailed REST reference with request/response examples
- **[../services/api-gateway/README.md](../services/api-gateway/README.md)** - Canonical backend service guide

### 🏗️ Architecture

- **[UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md)** - Complete system architecture (PRIMARY)
- **[BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)** - Backend service architecture
- **[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)** - Frontend monorepo architecture
- **[REALTIME_ARCHITECTURE.md](REALTIME_ARCHITECTURE.md)** - WebSocket and streaming architecture
- **[SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md)** - Security model and HIPAA compliance
- **[architecture/ARCHITECTURE_DIAGRAMS.md](architecture/ARCHITECTURE_DIAGRAMS.md)** - Visual diagrams
- **[DATA_MODEL.md](DATA_MODEL.md)** - Database schema and relationships
- **[SERVICE_CATALOG.md](SERVICE_CATALOG.md)** - Microservices catalog

### 📋 Development Phases

- **[DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md)** - Official phase plan (Phases 0-14)
- **[phases/](phases/)** - Individual phase documents
  - [PHASE_00_INITIALIZATION.md](phases/PHASE_00_INITIALIZATION.md) - ✅ Complete
  - [PHASE_01_INFRASTRUCTURE.md](phases/PHASE_01_INFRASTRUCTURE.md) - ✅ Complete
  - [PHASE_02_SECURITY_NEXTCLOUD.md](phases/PHASE_02_SECURITY_NEXTCLOUD.md) - ✅ Complete
  - [PHASE_03_MICROSERVICES.md](phases/PHASE_03_MICROSERVICES.md) - ✅ Complete
  - [PHASE_04_VOICE_PIPELINE.md](phases/PHASE_04_VOICE_PIPELINE.md) - ✅ Complete
  - [PHASE_05_MEDICAL_AI.md](phases/PHASE_05_MEDICAL_AI.md) - ✅ Complete
  - [PHASE_06_NEXTCLOUD_APPS.md](phases/PHASE_06_NEXTCLOUD_APPS.md) - ✅ Complete
  - [PHASE_07_ADMIN_PANEL.md](phases/PHASE_07_ADMIN_PANEL.md) - ✅ Complete
  - [PHASE_08_OBSERVABILITY.md](phases/PHASE_08_OBSERVABILITY.md) - ✅ Complete
  - [PHASE_09_IAC_CICD.md](phases/PHASE_09_IAC_CICD.md) - ✅ Complete
  - [PHASE_10_LOAD_TESTING.md](phases/PHASE_10_LOAD_TESTING.md) - ✅ Complete
  - [PHASE_11_SECURITY_HIPAA.md](phases/PHASE_11_SECURITY_HIPAA.md) - ✅ Complete
  - [PHASE_12_HA_DR.md](phases/PHASE_12_HA_DR.md) - ✅ Complete
  - [PHASE_13_TESTING_DOCS.md](phases/PHASE_13_TESTING_DOCS.md) - ✅ Complete
  - [PHASE_14_PRODUCTION_DEPLOY.md](phases/PHASE_14_PRODUCTION_DEPLOY.md) - ✅ Complete
  - [PHASE_15_COMPLETE_SUMMARY.md](phases/PHASE_15_COMPLETE_SUMMARY.md) - ✅ Complete (Final Review & Handoff)
- **Archived summaries:** see [archive/](archive/) for all phase completion recaps and historical notes

### 🔧 Integration Improvements (Phase 7 Enhancement)

- **[INTEGRATION_IMPROVEMENTS_PHASE_0-8.md](INTEGRATION_IMPROVEMENTS_PHASE_0-8.md)** - Integration roadmap
- **[INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md)** - Handoff document (previous session)
- **Status**: Priority 1-3 Complete (210/392 hours = 54%)
  - ✅ **P1**: Health monitoring, tracing, config docs, security dashboards, async queues
  - ✅ **P2**: Multi-level caching, E2E tests, SLO monitoring, architecture docs, connection pools
  - ✅ **P3**: Feature flags, operational runbooks, business metrics, contract testing, chaos engineering
  - 📋 **P4**: Secret management, UX monitoring, cost dashboard, onboarding, alert escalation (144h remaining)

---

## 🔍 Feature-Specific Documentation

### Security & Compliance

- **[SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md)** - HIPAA compliance and security
- **[FEATURE_FLAGS.md](FEATURE_FLAGS.md)** - Feature flag system with A/B testing

### Medical Features

- **[MEDICAL_FEATURES.md](MEDICAL_FEATURES.md)** - Medical AI and RAG capabilities
- **[SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md)** - Vector search architecture

### Integrations

- **[NEXTCLOUD_INTEGRATION.md](NEXTCLOUD_INTEGRATION.md)** - Nextcloud integration guide
- **[NEXTCLOUD_APPS_DESIGN.md](NEXTCLOUD_APPS_DESIGN.md)** - Nextcloud app specifications
- **[TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md)** - External integrations

### Infrastructure

- **[INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md)** - Infrastructure deployment
- **[COMPOSE_TO_K8S_MIGRATION.md](COMPOSE_TO_K8S_MIGRATION.md)** - Kubernetes migration guide
- **[ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md)** - Container orchestration

### Backend Services & Shared Packages

| Document                                                                   | Purpose                            | Audience               |
| -------------------------------------------------------------------------- | ---------------------------------- | ---------------------- |
| **[SERVICE_CATALOG.md](SERVICE_CATALOG.md)**                               | Microservices catalog              | All developers, DevOps |
| **[../services/api-gateway/README.md](../services/api-gateway/README.md)** | Canonical API Gateway guide        | Backend devs           |
| **[EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)**                               | Practical patterns for extending   | All developers         |
| **[../apps/web-app/README.md](../apps/web-app/README.md)**                 | Web app implementation details     | Frontend devs          |
| **[../apps/admin-panel/README.md](../apps/admin-panel/README.md)**         | Admin panel implementation details | Frontend devs          |
| **[../apps/docs-site/README.md](../apps/docs-site/README.md)**             | Documentation site implementation  | Frontend devs          |

**Shared packages:**

- [../packages/api-client/README.md](../packages/api-client/README.md)
- [../packages/config/README.md](../packages/config/README.md)
- [../packages/design-tokens/README.md](../packages/design-tokens/README.md)
- [../packages/telemetry/README.md](../packages/telemetry/README.md)
- [../packages/types/README.md](../packages/types/README.md)
- [../packages/ui/README.md](../packages/ui/README.md)
- [../packages/utils/README.md](../packages/utils/README.md)

---

## 📊 Operations & Monitoring

### Observability

- **[OBSERVABILITY.md](OBSERVABILITY.md)** - Observability overview
- **[operations/BUSINESS_METRICS.md](operations/BUSINESS_METRICS.md)** - ✨ NEW: Business KPIs guide
- **[operations/CONNECTION_POOL_OPTIMIZATION.md](operations/CONNECTION_POOL_OPTIMIZATION.md)** - Performance tuning
- **[operations/SLO_DEFINITIONS.md](operations/SLO_DEFINITIONS.md)** - Service Level Objectives

### Operational Runbooks

All runbooks are production-ready with copy-paste commands:

- **[operations/runbooks/DEPLOYMENT.md](operations/runbooks/DEPLOYMENT.md)** - ✨ NEW: Deployment procedures
- **[operations/runbooks/INCIDENT_RESPONSE.md](operations/runbooks/INCIDENT_RESPONSE.md)** - ✨ NEW: Incident management
- **[operations/runbooks/BACKUP_RESTORE.md](operations/runbooks/BACKUP_RESTORE.md)** - ✨ NEW: Backup procedures
- **[operations/runbooks/SCALING.md](operations/runbooks/SCALING.md)** - ✨ NEW: Horizontal/vertical scaling
- **[operations/runbooks/MONITORING.md](operations/runbooks/MONITORING.md)** - ✨ NEW: Monitoring setup
- **[operations/runbooks/TROUBLESHOOTING.md](operations/runbooks/TROUBLESHOOTING.md)** - ✨ NEW: Common issues

---

## 🧪 Testing

### Testing Documentation

- **[TESTING_CONTRACTS.md](TESTING_CONTRACTS.md)** - ✨ NEW: Contract testing with Pact
- **[CHAOS_ENGINEERING.md](CHAOS_ENGINEERING.md)** - ✨ NEW: Chaos engineering guide
- **[testing/E2E_TESTING_GUIDE.md](testing/E2E_TESTING_GUIDE.md)** - End-to-end testing

### Test Types

- **Unit Tests**: Located in `tests/unit/`
- **Integration Tests**: Located in `tests/integration/`
- **Contract Tests**: Located in `tests/contract/` (NEW)
- **Chaos Experiments**: Located in `chaos/experiments/` (NEW)

---

## ⚙️ Configuration

### Configuration References

- **[CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)** - Complete configuration catalog
- **`.env.example`** - Environment variable template
- **`docker-compose.yml`** - Service orchestration

### Configuration by Component

- Database: PostgreSQL with pgvector
- Cache: Redis with connection pooling
- Vector Store: Qdrant
- Content: Nextcloud with CalDAV/WebDAV
- Monitoring: Prometheus, Grafana, Jaeger, Loki
- Contract Testing: Pact Broker (NEW)

---

## 📝 API & UI Specifications

### API Documentation

- **High-level overview:** [API_REFERENCE.md](API_REFERENCE.md) — use this for conceptual guidance, endpoint group summaries, and quick lookups
- **REST reference:** [api-reference/rest-api.md](api-reference/rest-api.md) — use this when you need request/response schemas, parameters, and concrete examples
- **OpenAPI Spec**: Available at `http://localhost:8000/docs` when running
- **ReDoc**: Available at `http://localhost:8000/redoc`

### UI Specifications

- **[WEB_APP_SPECS.md](WEB_APP_SPECS.md)** - Clinician web app specs
- **[ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md)** - Admin panel specs
- **[DOCUMENTATION_SITE_SPECS.md](DOCUMENTATION_SITE_SPECS.md)** - Documentation site

---

## 📁 Archived Documentation

Historical phase completion reports and summaries have been moved to the archive:

- **[archive/phases/](archive/phases/)** - Phase completion reports (PHASE_0_1 through PHASE_10)
- **[archive/summaries/](archive/summaries/)** - Historical summaries and celebration documents
- **[archive/legacy-v1/](archive/legacy-v1/)** - V1 architecture documentation

For current status, see **[overview/IMPLEMENTATION_STATUS.md](overview/IMPLEMENTATION_STATUS.md)**.

---

## 🎯 Current Status (2025-12-08)

### ✅ All 15 Phases Complete - 100% Production Ready

**Phase 0-1**: Infrastructure, database, API gateway
**Phase 2**: Security (JWT), Nextcloud integration
**Phase 3**: Core microservices
**Phase 4**: Realtime WebSocket communication
**Phase 5**: Medical knowledge base with RAG
**Phase 6**: Nextcloud app integration (CalDAV, files, email)
**Phase 7**: Admin panel with RBAC
**Phase 8**: Full observability stack (Prometheus, Grafana, Jaeger, Loki)
**Phase 9**: Infrastructure as Code & CI/CD (Terraform, Ansible, GitHub Actions)
**Phase 10**: Load testing & performance optimization
**Phase 11**: Security hardening & HIPAA compliance
**Phase 12**: High availability & disaster recovery
**Phase 13**: Final testing & documentation
**Phase 14**: Production deployment
**Phase 15**: Final review & handoff

### 🚀 Current Focus: Frontend Development & Continuous Improvement

- **Client Applications**: Web app, admin panel, docs site (monorepo with pnpm + Turborepo)
- **Frontend Status**: Phase 0-2 complete, Phase 3 (Voice Features) in progress
- See [overview/IMPLEMENTATION_STATUS.md](overview/IMPLEMENTATION_STATUS.md) for current status

---

## 🚀 Quick Start Commands

### Start All Services

```bash
cd ~/VoiceAssist
docker compose up -d
```

### Verify System Health

```bash
curl http://localhost:8000/health
```

### View Metrics

```bash
curl http://localhost:8000/metrics | head -50
```

### Run Tests

```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# Contract tests (NEW)
pytest tests/contract/

# Chaos tests (NEW)
./scripts/run-chaos-tests.sh
```

### Access Dashboards

- **API Docs**: http://localhost:8000/docs
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **Pact Broker**: http://localhost:9292 (pact/pact)

---

## 📊 Metrics & Monitoring

### Business Metrics (NEW)

VoiceAssist now exposes **257 lines** of business metrics:

**User Activity**: DAU, MAU, registrations, logins, session duration
**RAG Performance**: Query success rate, citations per query, satisfaction scores
**Knowledge Base**: Documents, chunks, upload rates, indexing duration
**API Usage**: Endpoint calls, response times
**Cost Tracking**: OpenAI API calls, token usage, estimated costs
**System Health**: Uptime, feature flag checks, admin actions

**Dashboard**: Import `dashboards/business-metrics.json` into Grafana (20 panels)

### Key Prometheus Queries

```promql
# Daily Active Users
voiceassist_active_users_daily

# RAG Query Success Rate
sum(voiceassist_rag_queries_total{success="true"}) /
sum(voiceassist_rag_queries_total)

# API P95 Latency
histogram_quantile(0.95, voiceassist_http_request_duration_seconds_bucket)

# OpenAI Cost
voiceassist_openai_api_cost_dollars_total
```

---

## 🔗 External Resources

### Tools & Technologies

- **FastAPI**: https://fastapi.tiangolo.com/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Redis**: https://redis.io/documentation
- **Qdrant**: https://qdrant.tech/documentation/
- **Nextcloud**: https://docs.nextcloud.com/
- **Prometheus**: https://prometheus.io/docs/
- **Grafana**: https://grafana.com/docs/
- **Jaeger**: https://www.jaegertracing.io/docs/
- **Pact**: https://docs.pact.io/
- **Chaos Toolkit**: https://chaostoolkit.org/

### Compliance

- **HIPAA**: https://www.hhs.gov/hipaa/
- **HITECH**: https://www.hhs.gov/hipaa/for-professionals/special-topics/hitech-act-enforcement-interim-final-rule/index.html

---

## 📞 Support & Contact

### Documentation Issues

- File issues in the project repository
- Check `TROUBLESHOOTING.md` for common problems

### Phase-Specific Questions

- Refer to individual phase completion reports
- Check `operations/runbooks/` for operational procedures

---

## 📝 Document Maintenance

**Last Updated**: 2025-12-08
**Maintained By**: VoiceAssist Development Team
**Review Cycle**: After each phase completion
**Format**: GitHub-Flavored Markdown

### Contributing to Documentation

1. Keep docs concise and actionable
2. Update this index when adding new docs
3. Follow existing formatting conventions
4. Include code examples where helpful
5. Mark deprecated docs with ⚠️ prefix

---

**Version**: V2.0
**Status**: ✅ Production Ready (All 15 Phases Complete)
**Current Focus**: Frontend Development & Continuous Improvement
