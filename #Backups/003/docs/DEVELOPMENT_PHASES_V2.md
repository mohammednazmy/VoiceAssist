# VoiceAssist Development Phases V2 - Enterprise Architecture

## Overview

VoiceAssist has been redesigned as an **enterprise-grade, HIPAA-compliant, multi-user medical AI assistant** with microservices architecture, Kubernetes orchestration, service mesh, and full Nextcloud integration.

## Architectural Shift

### Original Scope (V1)
- Personal use system
- Single user
- Simple Docker deployment
- macOS client focus

### Enhanced Scope (V2)
- **Multi-user enterprise system** (hundreds of concurrent users)
- **Microservices architecture** with Kubernetes/K3s
- **Service mesh** (Istio/Linkerd/Kong) for security and resilience
- **HIPAA compliance** with zero-trust security model
- **Nextcloud integration** as central identity provider
- **Web-based voice assistant** with advanced VAD/echo cancellation
- **Dynamic conversational AI** with clarifying questions
- **Infrastructure as Code** (Terraform/Ansible)
- **Full observability** (Prometheus/Grafana/Jaeger)

## Development Approach: Compose-First, Kubernetes-Later

### Strategy

**Phase 1-10: Docker Compose Development**
- All microservices implemented with **Docker Compose**
- Local development on MacBook Pro
- Full enterprise features (microservices, security, observability)
- Rapid iteration and testing
- No Kubernetes complexity during development
- Same architecture patterns, simpler orchestration

**Phase 11-12: Kubernetes Migration Preparation**
- Create Kubernetes manifests
- Test K8s deployment locally (K3s/Minikube)
- Maintain Compose for development

**Phase 13-14: Production Kubernetes Deployment**
- Deploy to production Kubernetes cluster
- Service mesh installation
- High availability configuration
- Production monitoring

### Why Compose-First?

✅ **Faster Development**
- No K8s learning curve initially
- Simpler debugging
- Quicker iteration cycles

✅ **Lower Complexity**
- Docker Compose is simpler than K8s
- Easier to understand service relationships
- Less YAML configuration

✅ **Same Architecture**
- Microservices design identical
- Security patterns identical
- Observability identical
- Just different orchestration

✅ **Easy Migration**
- Compose services → K8s Deployments
- Compose networks → K8s Services
- Compose volumes → K8s PersistentVolumes
- Well-documented migration path

### Local Development (MacBook Pro)
- **Docker Compose** for all services
- **Docker Desktop** with sufficient resources (8GB+ RAM)
- Multiple compose files for different environments
- Full feature parity with production architecture
- Local domains via /etc/hosts

### Production Deployment (Ubuntu Server)
- **Kubernetes** cluster (K3s or full K8s)
- **Service mesh** (Linkerd recommended)
- **High availability** with replicas
- **Load balancing** and auto-scaling
- **Encrypted backups** and disaster recovery

### Migration Timeline

```
Phases 0-10: Compose Development (80% of work)
    ↓
Phase 11: K8s Manifest Creation
    ↓
Phase 12: Local K8s Testing
    ↓
Phase 13: Production K8s Prep
    ↓
Phase 14: Production Deployment
```

## Phase Structure

Each phase is designed for Claude Code completion in **one focused session (4-8 hours)**. Phases now include:
- Infrastructure setup
- Security hardening
- Comprehensive testing
- Documentation updates

## Phase 0: Project Initialization & Architecture Setup

**Duration:** 4-6 hours
**Goal:** Set up project structure, Docker Compose environment, and initial documentation

### Objectives
- Create comprehensive directory structure for microservices
- Install Docker Desktop and verify installation
- Set up development tooling (for future: Terraform, Ansible)
- Initialize version control with proper .gitignore
- Create architecture documentation
- Set up CURRENT_PHASE.md tracking system

### Deliverables
- Complete project structure in ~/VoiceAssist
- Docker Desktop installed and running
- Initial documentation (ARCHITECTURE_V2.md, SECURITY_COMPLIANCE.md)
- CURRENT_PHASE.md tracking file
- Base docker-compose.yml created
- Development environment verified

### Compose-First Approach
- Install Docker Desktop (not K3s)
- Create docker-compose.yml skeleton
- Set up local domains in /etc/hosts
- No Kubernetes configuration yet

### Tasks
1. Create microservices directory structure
2. Install Docker Desktop
3. Create base docker-compose.yml
4. Set up /etc/hosts for local domains
5. Create initial architecture diagrams
6. Initialize git repository
7. Create CURRENT_PHASE.md tracking system

**File:** `docs/phases/PHASE_00_INITIALIZATION.md`

---

## Phase 1: Core Infrastructure & Database Setup

**Duration:** 6-8 hours
**Goal:** Set up core databases with Docker Compose and basic microservices framework

### Objectives
- Deploy PostgreSQL with pgvector via Compose
- Deploy Redis for caching and sessions
- Deploy Qdrant for vector storage
- Create Docker images for base services
- Add services to docker-compose.yml
- Implement health checks

### Deliverables
- All databases running in Docker Compose
- Docker images for base services
- Updated docker-compose.yml with all databases
- Database schemas and migrations (Alembic)
- Health check endpoints
- Data persistence with volumes

### Compose-First Approach
- Use official PostgreSQL, Redis, Qdrant images
- Configure with environment variables
- Use Docker volumes for persistence
- Connect services via Compose networks
- No StatefulSets or K8s concepts yet

### Tasks
1. Create Dockerfiles for each microservice
2. Add PostgreSQL to docker-compose.yml with pgvector
3. Add Redis to docker-compose.yml
4. Add Qdrant to docker-compose.yml
5. Create database init scripts
6. Implement Alembic migrations
7. Test database connectivity
8. Configure volumes for data persistence

**File:** `docs/phases/PHASE_01_INFRASTRUCTURE.md`

---

## Phase 2: Security Foundation & Nextcloud Integration

**Duration:** 6-8 hours
**Goal:** Implement Nextcloud SSO and authentication infrastructure with Docker Compose

### Objectives
- Install and configure Nextcloud via Compose
- Set up Keycloak/OIDC for identity management
- Implement JWT-based authentication with short-lived tokens
- Create user management through Nextcloud
- Implement MFA
- Set up HTTPS with self-signed certificates

### Deliverables
- Nextcloud instance running in Compose
- Keycloak configured with Nextcloud
- Authentication service with JWT
- User registration/login via Nextcloud
- MFA implementation
- HTTPS configured for local development

### Compose-First Approach
- Add Nextcloud to docker-compose.yml
- Add Keycloak to docker-compose.yml
- Use Compose networking for service communication
- HTTPS with self-signed certs (mkcert)
- mTLS deferred to service mesh (K8s phase)

### Tasks
1. Add Nextcloud to docker-compose.yml
2. Add Keycloak to docker-compose.yml
3. Configure Keycloak with Nextcloud OIDC
4. Create authentication microservice (FastAPI)
5. Implement JWT token generation/validation
6. Set up self-signed certificates with mkcert
7. Create user sync service (Nextcloud ↔ local DB)
8. Implement MFA with TOTP

**File:** `docs/phases/PHASE_02_SECURITY_NEXTCLOUD.md`

---

## Phase 3: API Gateway & Core Microservices

**Duration:** 6-8 hours
**Goal:** Create core microservices with Docker Compose and basic observability

### Objectives
- Create API Gateway microservice
- Create Voice Proxy microservice skeleton
- Create Medical KB microservice skeleton
- Create Admin API microservice skeleton
- Set up observability (Prometheus, Grafana) in Compose
- Implement health checks and service discovery

### Deliverables
- API Gateway microservice (Kong or Nginx)
- Voice Proxy microservice skeleton
- Medical KB microservice skeleton
- Admin API microservice skeleton
- All services in docker-compose.yml
- Prometheus and Grafana running in Compose
- Service health monitoring

### Compose-First Approach
- No service mesh yet (deferred to K8s phase)
- Use Compose networking for service discovery
- API Gateway handles routing and rate limiting
- Prometheus scrapes metrics from Compose services
- Grafana dashboards for basic monitoring

### Tasks
1. Create API Gateway service (Kong in Compose)
2. Create Voice Proxy service (FastAPI)
3. Create Medical KB service (FastAPI)
4. Create Admin API service (FastAPI)
5. Add all services to docker-compose.yml
6. Add Prometheus to docker-compose.yml
7. Add Grafana to docker-compose.yml
8. Configure Prometheus to scrape services
9. Create basic Grafana dashboards

**File:** `docs/phases/PHASE_03_MICROSERVICES.md`

---

## Phase 4: Advanced Voice Pipeline & Dynamic Conversations

**Duration:** 8-10 hours
**Goal:** Build web-based voice assistant with VAD, echo cancellation, and dynamic clarification

### Objectives
- Implement web-based voice client (React + WebRTC)
- Integrate robust VAD and echo cancellation
- Connect to OpenAI Realtime API
- Implement dynamic conversational flow with clarifying questions
- Add conversation context and memory
- Support barge-in and turn-taking

### Deliverables
- Web voice client with WebRTC streaming
- Voice Proxy microservice with OpenAI integration
- VAD and echo cancellation implemented
- Conversation management service
- Dynamic clarification logic (e.g., for UpToDate queries)
- Persistent conversation memory
- WebSocket connection management

### Tasks
1. Create React voice client with WebRTC
2. Implement VAD using @azure/cognitiveservices-speech or similar
3. Add echo cancellation (WebRTC AEC)
4. Implement noise suppression
5. Create WebSocket handler in Voice Proxy
6. Integrate OpenAI Realtime API
7. Build conversation context manager
8. Implement clarification prompts (e.g., "kidney disease" → ask about type)
9. Add barge-in support
10. Test voice quality and latency

**File:** `docs/phases/PHASE_04_VOICE_PIPELINE.md`

---

## Phase 5: Medical Knowledge Base & RAG System

**Duration:** 8-10 hours
**Goal:** Build advanced RAG system with domain-specific models and automated guideline ingestion

### Objectives
- Implement PDF processing pipeline
- Integrate domain-specific models (BioGPT, PubMedBERT)
- Build advanced RAG with multi-hop reasoning
- Integrate UpToDate (if licensed)
- Integrate OpenEvidence
- Automate guideline ingestion (CDC, WHO, specialty societies)
- Extend medical calculators

### Deliverables
- PDF processing microservice
- Embedding generation with BioGPT/PubMedBERT
- Advanced RAG system with multi-hop reasoning
- UpToDate integration
- OpenEvidence integration
- Automated guideline scraper
- Extended medical calculator library
- PubMed integration

### Tasks
1. Create PDF processing service
2. Integrate BioGPT for medical summarization
3. Add PubMedBERT embeddings
4. Implement multi-hop RAG
5. Integrate UpToDate API
6. Integrate OpenEvidence API
7. Build guideline scrapers (CDC, WHO)
8. Create guideline update notification system
9. Implement medical calculators (Wells, GRACE, renal dosing)
10. Add voice-activated differential diagnosis

**File:** `docs/phases/PHASE_05_MEDICAL_AI.md`

---

## Phase 6: Nextcloud App Integration & Unified Services

**Duration:** 6-8 hours
**Goal:** Package all web apps as Nextcloud apps and unify calendar/email/file operations

### Objectives
- Package web client as Nextcloud app
- Package admin panel as Nextcloud app
- Package docs site as Nextcloud app
- Implement unified calendar operations
- Integrate email synchronization
- Create unified file browser
- Auto-index Nextcloud files

### Deliverables
- VoiceAssist Web Client Nextcloud app
- VoiceAssist Admin Nextcloud app
- VoiceAssist Docs Nextcloud app
- Calendar integration (Nextcloud + external)
- Email integration (Nextcloud Mail)
- File browser with auto-indexing
- Nextcloud Tasks integration

### Tasks
1. Create Nextcloud app structure for web client
2. Package admin panel as Nextcloud app
3. Package docs as Nextcloud app
4. Implement CalDAV integration
5. Add Google Calendar sync (optional)
6. Integrate Nextcloud Mail
7. Create file indexing service for Nextcloud files
8. Implement task synchronization
9. Test all integrations

**File:** `docs/phases/PHASE_06_NEXTCLOUD_APPS.md`

---

## Phase 7: Advanced Admin Panel & RBAC

**Duration:** 6-8 hours
**Goal:** Build comprehensive admin control center with RBAC and cost analytics

### Objectives
- Create admin dashboard with real-time metrics
- Implement role-based access control
- Add model selection (local vs cloud)
- Build cost tracking and analytics
- Create knowledge base management UI
- Add security policy configuration

### Deliverables
- Admin dashboard with Prometheus metrics
- RBAC system with roles (admin, viewer, user)
- Model configuration interface
- Cost analytics dashboard
- Knowledge base management UI
- Security policy editor
- User management interface

### Tasks
1. Build admin dashboard (React + Tremor)
2. Integrate Prometheus metrics
3. Implement RBAC with Open Policy Agent
4. Create model selection UI
5. Build cost tracking system
6. Create knowledge base upload/management UI
7. Add security policy configuration
8. Implement user role management

**File:** `docs/phases/PHASE_07_ADMIN_PANEL.md`

---

## Phase 8: Distributed Tracing & Advanced Observability

**Duration:** 4-6 hours
**Goal:** Implement comprehensive observability with tracing, logging, and alerting

### Objectives
- Deploy Jaeger/Zipkin for distributed tracing
- Set up centralized logging (Loki or ELK)
- Configure alerting (AlertManager)
- Implement log redaction for PHI
- Create observability dashboards

### Deliverables
- Jaeger deployed and tracing all services
- Centralized logging with Loki
- AlertManager with HIPAA-relevant alerts
- PHI redaction in logs
- Comprehensive Grafana dashboards
- Log retention policies (30-90 days)

### Tasks
1. Deploy Jaeger in K3s
2. Instrument services with OpenTelemetry
3. Deploy Loki for log aggregation
4. Implement log redaction
5. Configure AlertManager
6. Create alert rules (latency, error rates, resource usage)
7. Build Grafana dashboards
8. Configure log retention

**File:** `docs/phases/PHASE_08_OBSERVABILITY.md`

---

## Phase 9: Infrastructure as Code & CI/CD

**Duration:** 6-8 hours
**Goal:** Define all infrastructure as code and automate CI/CD pipelines

### Objectives
- Create Terraform modules for all infrastructure
- Write Ansible playbooks for server configuration
- Set up CI/CD pipelines (GitHub Actions or GitLab CI)
- Automate testing (unit, integration, security)
- Implement automated deployment

### Deliverables
- Terraform modules for K8s, databases, services
- Ansible playbooks for Ubuntu server setup
- CI/CD pipelines
- Automated test suites
- Deployment automation scripts
- Infrastructure documentation

### Tasks
1. Write Terraform modules
2. Create Ansible playbooks
3. Set up GitHub Actions workflows
4. Write unit tests (pytest for backend)
5. Write integration tests
6. Add security scanning (SAST, DAST)
7. Create deployment scripts
8. Document infrastructure

**File:** `docs/phases/PHASE_09_IAC_CICD.md`

---

## Phase 10: Load Testing & Performance Optimization

**Duration:** 6-8 hours
**Goal:** Test system under load and optimize for hundreds of concurrent users

### Objectives
- Perform load testing with k6 or Locust
- Test voice mode with multiple concurrent connections
- Optimize database queries
- Implement caching strategies
- Configure auto-scaling
- Verify latency targets

### Deliverables
- Load testing scripts
- Performance benchmarks
- Optimized database queries
- Redis caching implemented
- HorizontalPodAutoscaler configs
- Performance report

### Tasks
1. Write k6 load testing scripts
2. Test with 100, 200, 500 concurrent users
3. Test voice mode with concurrent connections
4. Profile and optimize slow queries
5. Implement Redis caching
6. Configure K8s HPA
7. Tune resource limits
8. Document performance characteristics

**File:** `docs/phases/PHASE_10_LOAD_TESTING.md`

---

## Phase 11: Security Hardening & HIPAA Compliance

**Duration:** 6-8 hours
**Goal:** Implement comprehensive security measures and ensure HIPAA compliance

### Objectives
- Conduct security audit
- Implement encryption at rest and in transit
- Set up audit logging
- Configure network policies
- Implement PHI detection and redaction
- Document HIPAA compliance measures

### Deliverables
- Security audit report
- Encryption at rest for all databases
- mTLS for all inter-service communication
- Audit logs for all access
- Network policies (K8s NetworkPolicy)
- PHI detection service
- HIPAA compliance documentation

### Tasks
1. Run security vulnerability scans
2. Enable database encryption at rest
3. Verify mTLS on all services
4. Implement comprehensive audit logging
5. Create K8s NetworkPolicies
6. Build PHI detection service
7. Test PHI redaction
8. Write HIPAA compliance report
9. Perform penetration testing (if possible)

**File:** `docs/phases/PHASE_11_SECURITY_HIPAA.md`

---

## Phase 12: High Availability & Disaster Recovery

**Duration:** 4-6 hours
**Goal:** Configure HA, backup, and disaster recovery procedures

### Objectives
- Configure database replication
- Set up automated encrypted backups
- Create disaster recovery procedures
- Implement off-site backup storage
- Test backup and restore

### Deliverables
- PostgreSQL with replication
- Automated backup scripts
- Encrypted backup storage
- Disaster recovery runbook
- Tested backup/restore procedures

### Tasks
1. Configure PostgreSQL replication
2. Set up automated daily backups
3. Encrypt backups
4. Store backups off-site (Nextcloud, S3, etc.)
5. Write disaster recovery procedures
6. Test backup restoration
7. Document RTO and RPO

**File:** `docs/phases/PHASE_12_HA_DR.md`

---

## Phase 13: Final Testing & Documentation

**Duration:** 6-8 hours
**Goal:** Comprehensive end-to-end testing and documentation finalization

### Objectives
- Write comprehensive test suite
- Perform end-to-end testing
- Test voice interactions
- Update all documentation
- Create deployment guide

### Deliverables
- Complete test suite
- E2E test results
- Voice interaction test results
- Updated architecture documentation
- Deployment guide for Ubuntu server
- User documentation

### Tasks
1. Write E2E tests
2. Test complete user workflows
3. Test voice mode thoroughly
4. Test all integrations
5. Update ARCHITECTURE.md
6. Update all component READMEs
7. Write deployment guide
8. Create user documentation

**File:** `docs/phases/PHASE_13_TESTING_DOCS.md`

---

## Phase 14: Production Deployment

**Duration:** 6-8 hours
**Goal:** Deploy to Ubuntu server and configure production environment

### Objectives
- Deploy to Ubuntu server
- Configure production domains and SSL
- Set up production monitoring
- Perform production testing
- Document production setup

### Deliverables
- Production deployment
- SSL certificates configured
- Production monitoring active
- Production tested and verified
- Production documentation

### Tasks
1. Copy project to Ubuntu server
2. Run Terraform to provision infrastructure
3. Run Ansible to configure server
4. Deploy K8s cluster
5. Configure domain DNS
6. Set up SSL with Let's Encrypt
7. Deploy all microservices
8. Configure production monitoring
9. Run smoke tests
10. Document production setup

**File:** `docs/phases/PHASE_14_PRODUCTION_DEPLOY.md`

---

## CURRENT_PHASE.md Tracking System

Create `~/VoiceAssist/CURRENT_PHASE.md`:

```markdown
# Current Development Phase

**Current Phase:** Phase 0
**Status:** Not Started
**Started:** N/A
**Last Updated:** 2024-11-19

## Phase 0: Project Initialization & Architecture Setup

### Objectives
- [ ] Create microservices directory structure
- [ ] Install K3s locally
- [ ] Set up Terraform and Ansible
- [ ] Create initial architecture diagrams
- [ ] Initialize git repository
- [ ] Create CURRENT_PHASE.md tracking system

### Progress Notes
[Claude will update this section with progress notes]

### Next Steps
[Claude will update this section with next steps]

## Completed Tasks
[List completed tasks here]

## Blockers/Issues
[Note any blockers or issues]
```

## How Claude Code Will Work With This

### Starting a Phase

```
Please check ~/VoiceAssist/CURRENT_PHASE.md to see what phase we're on.
Read the corresponding phase document in docs/phases/.
Check what tasks are already complete.
Continue implementing the remaining tasks.
Update CURRENT_PHASE.md with progress.
Update all relevant documentation.
Test thoroughly.
When complete, mark the phase as done and update to next phase.
```

### Claude's Workflow

1. **Read CURRENT_PHASE.md** to understand current state
2. **Read phase document** for detailed instructions
3. **Check existing code/infrastructure** to see what's done
4. **Implement remaining tasks** step by step
5. **Test each task** as it's completed
6. **Update CURRENT_PHASE.md** with progress
7. **Update documentation** (ARCHITECTURE.md, etc.)
8. **Verify exit criteria** are met
9. **Move to next phase** or note blockers

## Summary

- **14 phases total** (up from 20 simpler phases)
- **Each phase: 4-10 hours** of focused work
- **Total: ~90-110 hours** of development time
- **Enterprise-grade architecture** with K8s, service mesh, HIPAA compliance
- **Nextcloud-integrated** for identity and apps
- **Comprehensive testing** and documentation
- **Production-ready** deployment

## Key Technologies

- **Container Orchestration:** Kubernetes (K3s locally)
- **Service Mesh:** Linkerd or Istio
- **Identity:** Nextcloud + Keycloak/OIDC
- **Databases:** PostgreSQL (pgvector), Redis, Qdrant
- **AI:** OpenAI Realtime API, BioGPT, PubMedBERT
- **Observability:** Prometheus, Grafana, Jaeger, Loki
- **IaC:** Terraform, Ansible
- **CI/CD:** GitHub Actions
- **Security:** mTLS, JWT, OPA, network policies

## Important: Compose-First for Phases 0-10

**All phases 0-10 use Docker Compose exclusively.**

Key Points:
- No Kubernetes until Phase 11
- All services run in docker-compose.yml
- Same microservices architecture
- Simpler orchestration
- Full feature parity with K8s design
- Easy migration path to K8s

Each phase document includes:
- **Section A:** Docker Compose Implementation (primary)
- **Section B:** Kubernetes Migration Notes (for reference)

## Kubernetes Migration (Phases 11-14)

**Phase 11:** Create K8s manifests, test locally
**Phase 12:** HA configuration, service mesh
**Phase 13:** Final testing and documentation
**Phase 14:** Production K8s deployment

## Next Steps

1. Read `DEVELOPMENT_PHASES_V2.md` (this document)
2. Read `ARCHITECTURE_V2.md` (updated architecture)
3. Read `SECURITY_COMPLIANCE.md` (HIPAA requirements)
4. Read `COMPOSE_TO_K8S_MIGRATION.md` (migration guide)
5. Start Phase 0: Project Initialization (Compose-first)
