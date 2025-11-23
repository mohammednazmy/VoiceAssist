# VoiceAssist - Enterprise Medical AI Assistant

**Backend Status:** ✅ PRODUCTION READY (15/15 phases complete - 100%)
**Frontend Status:** 🚧 IN PROGRESS (Milestone 1: Phases 0-2 complete, Phase 3 starting)
**Architecture:** HIPAA-compliant microservices with Docker Compose & Kubernetes
**Version:** 2.0

[![Backend CI](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/ci.yml/badge.svg)](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/ci.yml)
[![Frontend CI](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/frontend-ci.yml)
[![Security Scan](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/security-scan.yml/badge.svg)](https://github.com/mohammednazmy/VoiceAssist/actions/workflows/security-scan.yml)
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)](tests/)
[![HIPAA](https://img.shields.io/badge/HIPAA-compliant-blue)](docs/HIPAA_COMPLIANCE_MATRIX.md)
[![Production](https://img.shields.io/badge/status-production--ready-success)](docs/DEPLOYMENT_GUIDE.md)

---

## 🎯 Overview

VoiceAssist is an enterprise-grade, HIPAA-compliant medical AI assistant platform designed for healthcare professionals. It provides voice-based queries, medical knowledge retrieval (RAG), document management, and real-time assistance with comprehensive security, high availability, and disaster recovery capabilities.

### Project Status

**Backend V2 (Production Ready):**

- ✅ All 15 development phases complete (Phases 0-15)
- ✅ 35,000+ lines of production-quality code
- ✅ 250+ automated tests with 95% coverage
- ✅ Full HIPAA compliance (42/42 requirements met)
- ✅ Production deployment automation ready
- ✅ HA/DR, monitoring, and security hardening complete

**Client Applications (In Development):**

- ✅ Monorepo foundation with pnpm workspaces + Turborepo
- ✅ Shared packages: design-tokens, types, utils, api-client, ui, config
- ✅ Phase 0: Foundation complete
- ✅ Phase 1: Authentication & Layout complete
- ✅ Phase 2: Chat Interface complete
- 🚧 Phase 3: Voice Features (starting)
- 📋 Remaining: Admin panel, documentation site, and advanced features

See [docs/client-implementation/](docs/client-implementation/) for the complete frontend roadmap.

### Key Highlights

- ✅ **Production Ready** - Complete with HA/DR, monitoring, and security hardening
- 🏥 **Healthcare Focused** - HIPAA-compliant with PHI data protection
- 🎤 **Voice Interface** - Advanced voice recognition and natural language processing
- 📚 **Medical Knowledge** - RAG-powered medical information retrieval
- 🔐 **Enterprise Security** - Zero-trust architecture with audit logging
- 📊 **Full Observability** - Prometheus, Grafana, Jaeger, and Loki
- 🚀 **High Availability** - PostgreSQL replication, automated backups, failover
- 🧪 **Comprehensive Tests** - 50+ E2E, integration, and voice tests

---

## 🚀 Quick Start

### Prerequisites

- Docker 24.0+ and Docker Compose 2.20+
- Python 3.11+
- 8GB RAM minimum (32GB recommended for production)
- OpenAI API key

### Local Development Setup

For detailed setup instructions, see **[docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md)**.

Quick start:

```bash
# 1. Clone the repository
git clone https://github.com/mohammednazmy/VoiceAssist.git
cd VoiceAssist

# 2. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY and other credentials

# 3. Validate environment
make check-env

# 4. Start all services
docker compose up -d

# 5. Check service health
docker compose ps
curl http://localhost:8000/health

# 6. Access services
# API Gateway: http://localhost:8000
# API Docs: http://localhost:8000/docs
# Grafana: http://localhost:3001 (admin/admin)
# Prometheus: http://localhost:9090
```

### Running Tests

```bash
# Backend tests
pip install pytest pytest-asyncio httpx
pytest                      # Run all tests
pytest -m e2e              # End-to-end tests
pytest -m voice            # Voice interaction tests

# Frontend tests
pnpm test                  # Run all frontend tests
pnpm test --filter @voiceassist/ui  # Test specific package
```

### Frontend Development (Client Applications)

```bash
# Install dependencies (first time)
npm install -g pnpm        # Install pnpm globally
pnpm install              # Install all workspace dependencies

# Development
pnpm dev                  # Start all apps in dev mode
pnpm --filter web-app dev # Start specific app

# Build
pnpm build                # Build all packages with Turbo
pnpm --filter @voiceassist/ui build  # Build specific package

# Storybook (Component Library)
pnpm storybook            # Open Storybook at http://localhost:6006

# Linting & Type Checking
pnpm lint                 # Lint all packages
pnpm type-check          # TypeScript type checking
```

---

## 📁 Project Structure

```
VoiceAssist/
├── apps/                         # 🆕 Client Applications (Monorepo)
│   ├── web-app/                 # User-facing medical AI assistant
│   ├── admin-panel/             # System management dashboard
│   └── docs-site/               # Documentation website
│
├── packages/                     # 🆕 Shared Packages
│   ├── design-tokens/           # Medical-themed design system
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Utility functions (incl. PHI detection)
│   ├── api-client/              # Type-safe HTTP client
│   ├── ui/                      # React component library + Storybook
│   └── config/                  # Shared configurations
│
├── services/                     # Backend Microservices
│   ├── api-gateway/             # Main FastAPI gateway
│   │   ├── main.py
│   │   ├── routes/
│   │   └── requirements.txt
│   └── worker/                  # Background task worker
│
├── tests/                       # Comprehensive test suite
│   ├── e2e/                    # End-to-end tests (20+ scenarios)
│   ├── voice/                  # Voice interaction tests (10+ scenarios)
│   ├── integration/            # Service integration tests (15+ scenarios)
│   ├── conftest.py             # Pytest configuration
│   └── README.md               # Test documentation
│
├── docs/                       # Documentation
│   ├── DEPLOYMENT_GUIDE.md    # Production deployment (3 options)
│   ├── USER_GUIDE.md          # End-user documentation
│   ├── ARCHITECTURE_V2.md     # System architecture
│   ├── client-implementation/ # 🆕 Frontend development roadmap
│   └── phases/                # Phase completion summaries
│
├── infrastructure/             # Infrastructure as Code
│   ├── docker/                # Docker configurations
│   ├── kubernetes/            # K8s manifests
│   ├── terraform/             # Cloud infrastructure
│   └── observability/         # Monitoring stack
│
├── ha-dr/                     # High Availability & Disaster Recovery
│   ├── postgresql/            # Database replication configs
│   ├── backup/                # Automated backup scripts
│   └── testing/               # HA/DR testing scripts
│
├── security/                  # Security configurations
│   ├── network-policies/      # Kubernetes network policies
│   └── rbac/                  # Role-based access control
│
├── package.json               # 🆕 Monorepo root package.json
├── pnpm-workspace.yaml        # 🆕 pnpm workspace configuration
├── turbo.json                 # 🆕 Turborepo configuration
├── docker-compose.yml         # Development stack
├── pytest.ini                 # Test configuration
├── .env.example              # Environment template
├── CURRENT_PHASE.md          # Development progress
└── PHASE_STATUS.md           # Phase completion tracking
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Users (Web/Mobile)                      │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
             v                      v
    ┌─────────────────┐    ┌──────────────────┐
    │ Nextcloud Stack │    │ VoiceAssist Stack│
    │   (Separate)    │    │  (This Repo)     │
    │  - SSO/Auth     │◄───┤  - API Gateway   │
    │  - Files        │    │  - Voice Service │
    │  - Calendar     │    │  - Medical KB    │
    └─────────────────┘    └────────┬─────────┘
                                    │
                ┌───────────────────┴──────────────────┐
                │           Data Layer                  │
                │  ┌──────────┬─────────┬──────────┐  │
                │  │PostgreSQL│  Redis  │  Qdrant  │  │
                │  │(Primary +│ (Cache) │ (Vectors)│  │
                │  │ Replica) │         │          │  │
                │  └──────────┴─────────┴──────────┘  │
                └───────────────────┬───────────────────┘
                                    │
                ┌───────────────────┴───────────────────┐
                │      Observability Stack              │
                │  Prometheus | Grafana | Jaeger | Loki│
                └───────────────────────────────────────┘
```

### Key Components

- **API Gateway** - FastAPI-based REST API with authentication
- **Voice Service** - Speech-to-text and natural language processing
- **Medical Knowledge Base** - RAG system with vector search (Qdrant)
- **Worker Service** - Background task processing (ARQ/Redis)
- **PostgreSQL** - Primary database with streaming replication
- **Redis** - Caching and task queue
- **Monitoring** - Prometheus, Grafana, Jaeger, Loki

---

## ✨ Key Features

### Core Functionality

- 🎤 **Voice Assistant** - Real-time voice queries with transcription
- 🏥 **Medical AI** - RAG-based medical knowledge retrieval
- 📄 **Document Management** - Upload, process, and search medical documents
- 📅 **Calendar Integration** - Nextcloud calendar sync
- 🔍 **Vector Search** - Semantic search using Qdrant
- 💬 **Chat Interface** - Conversational AI with context

### Enterprise Features

- 🔐 **HIPAA Compliance** - PHI data encryption, audit logs, BAA available
- 👥 **Multi-tenancy** - Organization and role-based access control
- 🌐 **SSO Integration** - Nextcloud OIDC authentication
- 📊 **Analytics Dashboard** - Usage metrics and insights
- 🔔 **Notifications** - Email, SMS, push notifications
- 🌍 **Internationalization** - Multi-language support (planned)

### Infrastructure

- 🚀 **High Availability** - Database replication, failover (RTO: 30 min)
- 💾 **Automated Backups** - Daily encrypted backups (RPO: 24 hours)
- 📈 **Auto-scaling** - Kubernetes HPA support
- 🔒 **Security Hardening** - Network policies, secrets management
- 📊 **Monitoring** - Real-time metrics, alerts, distributed tracing
- 🧪 **Testing** - 50+ automated tests (E2E, integration, voice)

---

## 📖 Documentation

### Getting Started

- [Quick Start Guide](docs/START_HERE.md)
- [Development Workflow](docs/DEVELOPMENT_PHASES_V2.md)
- [Current Phase Status](CURRENT_PHASE.md)

### 🆕 Client Applications (Milestone 1 - IN PROGRESS)

**Status:** 🚀 **Phase 0 Complete** | 📍 **Phase 1 Starting** (Weeks 3-4: Authentication & Layout)

**Monorepo Foundation:**

- ✅ pnpm workspaces + Turborepo build system
- ✅ 6 shared packages (design-tokens, types, utils, api-client, ui, config)
- ✅ Medical-themed design system (blue/teal palette)
- ✅ PHI detection & redaction utilities (HIPAA-compliant)
- ✅ Storybook 8.0 component documentation
- ✅ Type-safe API client with auto-token injection

**Applications:**

- **Web App** (`apps/web-app`) - Main user-facing medical AI assistant
- **Admin Panel** (`apps/admin-panel`) - System management dashboard
- **Documentation Site** (`apps/docs-site`) - User and developer documentation

**Development Commands:**

```bash
pnpm build          # Build all packages (Turborepo)
pnpm dev            # Run development servers
pnpm storybook      # View component library (port 6006)
pnpm test           # Run all tests
```

**Documentation:**

- [Unified Roadmap](docs/client-implementation/CLIENT_DEV_ROADMAP.md) - Complete 52-week plan
- [Master Implementation Plan](docs/client-implementation/MASTER_IMPLEMENTATION_PLAN.md) - 20-week client apps roadmap
- [Open Questions](docs/client-implementation/OPEN_QUESTIONS.md) - Decisions & clarifications
- [Web App Feature Specs](docs/client-implementation/WEB_APP_FEATURE_SPECS.md) - Detailed specifications
- [Technical Architecture](docs/client-implementation/TECHNICAL_ARCHITECTURE.md) - Monorepo patterns

### Architecture & Design

- [System Architecture](docs/ARCHITECTURE_V2.md)
- [Security & Compliance](docs/SECURITY_COMPLIANCE.md)
- [HIPAA Compliance Matrix](docs/HIPAA_COMPLIANCE_MATRIX.md)

### Deployment

- [asimo.io Production Deployment](docs/DEPLOYMENT_SUMMARY_ASIMO.md) - ✅ Live deployment guide
- [asimo-production README](deployment/asimo-production/README.md) - Production configuration
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) - Docker, Kubernetes, Cloud
- [High Availability Setup](ha-dr/postgresql/README.md)
- [Disaster Recovery Runbook](docs/DISASTER_RECOVERY_RUNBOOK.md)
- [RTO/RPO Documentation](docs/RTO_RPO_DOCUMENTATION.md)

### User Guides

- [User Guide](docs/USER_GUIDE.md) - End-user documentation
- [Admin Guide](docs/ADMIN_GUIDE.md)
- [API Documentation](docs/API_REFERENCE.md)

### Testing & Development

- [Test Documentation](tests/README.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Development Setup](docs/DEVELOPMENT_SETUP.md)

---

## 🧪 Testing

### Test Suite Overview

VoiceAssist includes comprehensive testing:

| Category                | Tests   | Coverage                                       |
| ----------------------- | ------- | ---------------------------------------------- |
| **E2E Workflows**       | 20+     | User registration, auth, documents, RAG, admin |
| **Voice Interactions**  | 10+     | Transcription, sessions, clarifications        |
| **Service Integration** | 15+     | Database, Redis, Qdrant, Nextcloud, workers    |
| **Health Checks**       | 5+      | System availability, component health          |
| **Total**               | **50+** | **~95% coverage**                              |

### Running Tests

```bash
# All tests
pytest

# Specific categories
pytest -m e2e          # End-to-end tests
pytest -m voice        # Voice tests
pytest -m integration  # Integration tests
pytest -m "not slow"   # Exclude slow tests

# With coverage
pytest --cov=services --cov-report=html
open htmlcov/index.html

# Specific test file
pytest tests/e2e/test_user_workflows.py

# Verbose output
pytest -v

# CI/CD format
pytest --junitxml=test-results.xml
```

See [Test Documentation](tests/README.md) for details.

---

## 🚀 Deployment

### Production Deployment (asimo.io)

**✅ LIVE IN PRODUCTION**

VoiceAssist is currently deployed at:

- **Main API:** https://assist.asimo.io
- **Monitoring Dashboard:** https://monitor.asimo.io

**Production Environment:**

- Ubuntu 24.04 LTS server
- Docker Compose deployment
- Apache reverse proxy with SSL/TLS (Let's Encrypt)
- Full monitoring stack (Prometheus + Grafana + Jaeger + Loki)
- Email alerts configured for mo@asimo.io

**Deployment Summary:** See [DEPLOYMENT_SUMMARY_ASIMO.md](docs/DEPLOYMENT_SUMMARY_ASIMO.md)

### Deployment Options

**1. Docker Compose (Development/Small Production)**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**2. Production Deployment to asimo.io**

```bash
cd ~/VoiceAssist
sudo ./deployment/asimo-production/deploy-to-asimo.sh
```

See [asimo-production README](deployment/asimo-production/README.md) for details.

**3. Kubernetes (Production)**

```bash
kubectl apply -f infrastructure/kubernetes/
```

**4. Cloud (AWS/GCP/Azure)**

```bash
cd infrastructure/terraform
terraform init
terraform apply -var-file="production.tfvars"
```

See [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

### High Availability

- **PostgreSQL Replication** - Primary + hot standby replica
- **Automated Backups** - Daily encrypted backups with 30-day retention
- **Failover** - RTO: 30 minutes, RPO: < 1 minute
- **Load Balancing** - Nginx/HAProxy with health checks
- **Monitoring** - Prometheus alerts with PagerDuty integration

See [HA/DR Documentation](docs/RTO_RPO_DOCUMENTATION.md) for details.

---

## 🔒 Security & Compliance

### HIPAA Compliance

- ✅ **Data Encryption** - AES-256 at rest, TLS 1.3 in transit
- ✅ **Access Control** - RBAC with least privilege
- ✅ **Audit Logging** - Comprehensive audit trail
- ✅ **PHI Protection** - De-identification and anonymization
- ✅ **Business Associate Agreement** - Available
- ✅ **Security Assessments** - Regular penetration testing

### Security Features

- Multi-factor authentication (MFA)
- OAuth 2.0 / OIDC integration
- API rate limiting
- Network segmentation
- Secrets management (Vault/K8s secrets)
- Container scanning
- Dependency vulnerability scanning

See [Security & Compliance](docs/SECURITY_COMPLIANCE.md) for details.

---

## 📊 Monitoring & Observability

### Monitoring Stack

- **Prometheus** - Metrics collection and alerting
- **Grafana** - Dashboards and visualization
- **Jaeger** - Distributed tracing
- **Loki** - Log aggregation

### Key Metrics

- Request rate and latency (p50, p95, p99)
- Error rates and status codes
- Database performance and replication lag
- Resource utilization (CPU, memory, disk)
- Business metrics (users, queries, documents)

### Accessing Monitoring

**Production (asimo.io):**

```bash
# Grafana (dashboards) - HTTPS with SSL
open https://monitor.asimo.io
# Credentials configured

# Prometheus (local access via SSH tunnel)
ssh -L 9090:localhost:9090 root@asimo.io
open http://localhost:9090

# Jaeger (local access via SSH tunnel)
ssh -L 16686:localhost:16686 root@asimo.io
open http://localhost:16686
```

**Local Development:**

```bash
# Grafana (dashboards)
open http://localhost:3001
# Default: admin/admin

# Prometheus (metrics)
open http://localhost:9090

# Jaeger (tracing)
open http://localhost:16686
```

---

## 🛠️ Development

### Development Workflow

```bash
# 1. Check current phase
cat CURRENT_PHASE.md

# 2. Start development environment
docker compose up -d

# 3. Make changes
# Edit code in services/

# 4. Run tests
pytest

# 5. Commit changes
git add .
git commit -m "feat: add new feature"

# 6. Create pull request
gh pr create
```

### Development Standards

- **Code Style** - PEP 8 (Python), Prettier (JavaScript)
- **Type Hints** - Required for all Python functions
- **Documentation** - Docstrings for all public APIs
- **Testing** - Unit tests for new features
- **Security** - SAST scanning with Bandit/Semgrep

---

## 📈 Development Status

### Phase Progress

**Completed:** 15/15 phases (100%) - ✅ PROJECT COMPLETE

- ✅ Phase 0 - Project Initialization
- ✅ Phase 1 - Core Infrastructure & Database
- ✅ Phase 2 - Security & Nextcloud Integration
- ✅ Phase 3 - API Gateway & Microservices
- ✅ Phase 4 - Real-time Communication
- ✅ Phase 5 - Medical Knowledge Base (RAG)
- ✅ Phase 6 - Nextcloud App Integration
- ✅ Phase 7 - Admin Panel & RBAC
- ✅ Phase 8 - Distributed Tracing & Observability
- ✅ Phase 9 - Infrastructure as Code & CI/CD
- ✅ Phase 10 - Load Testing & Performance
- ✅ Phase 11 - Security Hardening & HIPAA
- ✅ Phase 12 - High Availability & Disaster Recovery
- ✅ Phase 13 - Final Testing & Documentation
- ✅ Phase 14 - Production Deployment
- ✅ Phase 15 - Final Review & Handoff

**🎉 ALL PHASES COMPLETE - PROJECT DELIVERED! 🎉**

**Current Status:** ✅ PROJECT COMPLETE - Production Ready

**Next Phase:** Continuous Improvement & Frontend Development

See:

- [Phase Status](PHASE_STATUS.md) - Detailed 15-phase completion status
- [Continuous Improvement Plan](docs/CONTINUOUS_IMPROVEMENT_PLAN.md) - Post-launch roadmap with 6+ milestones

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Getting Help

- **Documentation** - Check [docs/](docs/) first
- **Issues** - Report bugs on [GitHub Issues](https://github.com/mohammednazmy/VoiceAssist/issues)
- **Discussions** - Ask questions in [GitHub Discussions](https://github.com/mohammednazmy/VoiceAssist/discussions)

---

## 📄 License

Personal/Internal Use - See [LICENSE](LICENSE) for details.

---

## 🎉 Acknowledgments

Built with:

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [PostgreSQL](https://www.postgresql.org/) - Reliable database
- [Redis](https://redis.io/) - In-memory data store
- [Qdrant](https://qdrant.tech/) - Vector search engine
- [OpenAI](https://openai.com/) - AI capabilities
- [Docker](https://www.docker.com/) - Containerization
- [Kubernetes](https://kubernetes.io/) - Orchestration

---

**Version:** 2.0
**Last Updated:** 2025-11-21
**Status:** Production Ready (Phase 13 Complete)

For the latest updates, see [CHANGELOG.md](CHANGELOG.md)
