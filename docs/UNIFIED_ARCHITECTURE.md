---
title: Unified Architecture Documentation
slug: architecture/unified
summary: Comprehensive system architecture covering all components, data flows, and integration points.
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human", "agent", "ai-agents", "backend", "frontend", "devops"]
tags: ["architecture", "system-design", "overview"]
relatedServices: ["api-gateway", "web-app", "admin-panel", "docs-site"]
category: architecture
source_of_truth: true
version: "2.0.0"
---

# VoiceAssist V2 - Unified Architecture Documentation

**Last Updated**: 2025-11-27 (All 16 Phases Complete)
**Status**: Canonical Reference
**Purpose**: Comprehensive system architecture covering all components, data flows, and integration points

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture Principles](#architecture-principles)
4. [Current Implementation Status](#current-implementation-status)
5. [Component Architecture](#component-architecture)
6. [Data Architecture](#data-architecture)
7. [Integration Architecture](#integration-architecture)
8. [Security Architecture](#security-architecture)
9. [Deployment Architecture](#deployment-architecture)
10. [Observability Architecture](#observability-architecture)
11. [Data Flow Examples](#data-flow-examples)
12. [Technology Stack](#technology-stack)
13. [Architecture Evolution](#architecture-evolution)
14. [Design Decisions and Trade-offs](#design-decisions-and-trade-offs)

---

## Executive Summary

VoiceAssist V2 is an **enterprise-grade, HIPAA-compliant medical AI assistant** designed to support clinical decision-making through voice and text interfaces. The system has completed all 16 phases (0-15) with **progressive architecture**:

- **Phases 0-10**: Monorepo-first backend with Docker Compose orchestration
- **Phases 11-14**: Security hardening, HA/DR, testing, production deployment
- **Phase 15**: Final review and handoff

**Current Capabilities** (all phases complete):

- ✅ JWT-based authentication with token revocation
- ✅ Role-based access control (RBAC) for admin operations
- ✅ RAG-powered medical knowledge base with semantic search
- ✅ Real-time WebSocket communication for streaming responses
- ✅ Nextcloud integration (CalDAV, WebDAV, file auto-indexing)
- ✅ Multi-level caching (L1 in-memory + L2 Redis)
- ✅ Comprehensive observability (Prometheus metrics, structured logging, SLOs)
- ✅ Admin panel with system monitoring dashboard
- ✅ Async background job processing for document indexing

**Design Philosophy**: Start simple (monorepo), maintain clear boundaries (logical services), scale when needed (microservices extraction).

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Users (Web/Mobile)                        │
│                  Browser / Mobile Apps / Web UI                  │
└────────────────┬────────────────────┬────────────────────────────┘
                 │                    │
          ┌──────┴──────┐      ┌──────┴──────┐
          │             │      │             │
          v             │      v             │
┌───────────────────┐   │  ┌──────────────────────────────────────┐
│  Nextcloud Stack  │   │  │    VoiceAssist Backend Stack         │
│  (Separate)       │   │  │    (This Repository)                 │
│                   │   │  │                                      │
│  - Identity/SSO   │◄──┼──│  API Gateway (FastAPI)               │
│  - File Storage   │   │  │  Port: 8000                          │
│  - Calendar       │   │  │                                      │
│  - Email          │   │  │  Logical Services (Phases 0-7):      │
│  - User Directory │   │  │  - Auth Service (JWT + RBAC)         │
│                   │   │  │  - Realtime Service (WebSocket)      │
│  Local Dev:       │   │  │  - RAG Service (QueryOrchestrator)   │
│  Port 8080        │   │  │  - Admin Service (Dashboard + Mgmt)  │
│                   │   │  │  - KB Indexer (Document Ingestion)   │
│  Production:      │   │  │  - Integration Service (CalDAV/File) │
│  cloud.asimo.io   │   │  │  - Cache Service (L1+L2)             │
└───────────────────┘   │  │  - Audit Service (Compliance)        │
                        │  │                                      │
                        │  │  Background Workers (ARQ):           │
                        │  │  - Document Indexing Jobs            │
                        │  │  - File Auto-Indexing                │
                        │  └──────────────────────────────────────┘
                        │
                        │  HTTPS / OIDC / WebDAV / CalDAV APIs
                        │
                        v
┌──────────────────────────────────────────────────────────────────┐
│                      Data Layer (Docker Compose)                 │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  PostgreSQL      │  │  Redis       │  │  Qdrant         │   │
│  │  (pgvector)      │  │  (6 DBs)     │  │  (Vectors)      │   │
│  │                  │  │              │  │                 │   │
│  │  Tables:         │  │  DB 0: Cache │  │  Collection:    │   │
│  │  - users         │  │  DB 1: Queue │  │  - medical_kb   │   │
│  │  - sessions      │  │  DB 2: L2    │  │                 │   │
│  │  - messages      │  │  DB 3: Token │  │  Embedding:     │   │
│  │  - documents     │  │  DB 15: Test │  │  - 1536 dims    │   │
│  │  - audit_logs    │  │              │  │  - Cosine sim   │   │
│  └──────────────────┘  └──────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                 Observability Stack (Docker Compose)           │
│  ┌────────────┬────────────┬────────────┬───────────────┐    │
│  │ Prometheus │  Grafana   │  (Jaeger)  │  Loki (Logs)  │    │
│  │            │            │  (Future)  │  (Future)     │    │
│  │  Metrics:  │ Dashboards:│            │               │    │
│  │  - SLOs    │ - Health   │            │               │    │
│  │  - Cache   │ - SLOs     │            │               │    │
│  │  - RAG     │ - Security │            │               │    │
│  │  - RBAC    │            │            │               │    │
│  └────────────┴────────────┴────────────┴───────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Separation

**Nextcloud is a separate stack, not part of VoiceAssist deployment.**

**Local Development:**

```
MacBook Pro
├── ~/Nextcloud-Dev/                    # Separate Nextcloud Stack
│   ├── docker-compose.yml              # Nextcloud + DB
│   └── Running at: http://localhost:8080
│
└── ~/VoiceAssist/                      # VoiceAssist Stack
    ├── docker-compose.yml              # All VoiceAssist services
    └── Running at: http://localhost:8000
    └── Connects via: NEXTCLOUD_BASE_URL=http://localhost:8080
```

**Integration Pattern:**

- VoiceAssist services are **clients** of Nextcloud
- Communication via HTTP/HTTPS APIs (OIDC, WebDAV, CalDAV, CardDAV)
- No shared Docker Compose project, no shared databases
- Environment variables configure the connection

---

## Architecture Principles

### 1. Progressive Complexity

**Start Simple**: Begin with monorepo for rapid development
**Maintain Boundaries**: Enforce logical service boundaries even in monorepo
**Scale When Needed**: Extract to microservices only when scaling requires it

**Decision Matrix:**

| Factor                 | Monorepo (Current)       | Microservices (Future)         |
| ---------------------- | ------------------------ | ------------------------------ |
| Team Size              | < 5 developers           | > 5 developers                 |
| Concurrent Users       | < 50 users               | > 50 users                     |
| Deployment             | Single server            | Multi-node K8s cluster         |
| Development Speed      | Faster (single codebase) | Slower (coordination overhead) |
| Operational Complexity | Low (Docker Compose)     | High (K8s, service mesh)       |

### 2. Security by Design

- **Zero-trust model**: Never trust, always verify
- **PHI protection**: Never log PHI, automatic redaction
- **Least privilege**: RBAC with granular permissions
- **Encryption everywhere**: TLS in transit, encryption at rest
- **Audit everything**: Immutable audit logs for all sensitive operations

### 3. Observability First

- **Metrics**: Prometheus for performance and SLO tracking
- **Logs**: Structured JSON with correlation IDs
- **Tracing**: Request context propagation (future: OpenTelemetry)
- **Dashboards**: Grafana for real-time system health
- **Alerts**: Multi-window, multi-burn-rate SLO alerting

### 4. API-First Design

- **Standard envelope**: Consistent response format across all endpoints
- **Error codes**: Typed error codes for client error handling
- **Versioning**: API version in URL path (`/api/v1/...`)
- **Documentation**: OpenAPI/Swagger auto-generated from code

### 5. Performance Optimization

- **Multi-level caching**: L1 (LRU in-memory) + L2 (Redis distributed)
- **Connection pooling**: Efficient database and API client connections
- **Async processing**: Background jobs for long-running tasks
- **Query optimization**: Indexed database queries, vector search tuning

---

## Current Implementation Status

### Phase Completion Summary

All 16 project phases (0-15) are complete. See [Implementation Status](overview/IMPLEMENTATION_STATUS.md) for detailed component status.

| Phase        | Status      | Key Deliverables                                                       |
| ------------ | ----------- | ---------------------------------------------------------------------- |
| **Phase 0**  | ✅ Complete | Project structure, Docker Compose, base infrastructure                 |
| **Phase 1**  | ✅ Complete | PostgreSQL, Redis, Qdrant, health endpoints, Alembic migrations        |
| **Phase 2**  | ✅ Complete | JWT auth, password validation, token revocation, Nextcloud integration |
| **Phase 3**  | ✅ Complete | API Gateway solidified, core endpoints, service boundaries             |
| **Phase 4**  | ✅ Complete | WebSocket realtime communication, QueryOrchestrator integration        |
| **Phase 5**  | ✅ Complete | RAG pipeline, semantic search, document ingestion, OpenAI embeddings   |
| **Phase 6**  | ✅ Complete | CalDAV calendar, WebDAV file indexing, email skeleton                  |
| **Phase 7**  | ✅ Complete | RBAC enforcement, admin panel dashboard, smoke tests                   |
| **Phase 8**  | ✅ Complete | Distributed tracing, observability infrastructure                      |
| **Phase 9**  | ✅ Complete | Infrastructure as code, CI/CD pipelines                                |
| **Phase 10** | ✅ Complete | Load testing, performance optimization                                 |
| **Phase 11** | ✅ Complete | Security hardening, HIPAA compliance                                   |
| **Phase 12** | ✅ Complete | High availability, disaster recovery                                   |
| **Phase 13** | ✅ Complete | Final testing, documentation                                           |
| **Phase 14** | ✅ Complete | Production deployment                                                  |
| **Phase 15** | ✅ Complete | Final review and handoff                                               |

### Completed Features

**Authentication & Authorization:**

- ✅ User registration with password strength validation
- ✅ JWT access tokens (15-min) + refresh tokens (7-day)
- ✅ Token revocation via Redis (dual-level: individual + all-user)
- ✅ Role-based access control (admin vs user)
- ✅ Admin-only endpoints protected with `get_current_admin_user` dependency
- ✅ Comprehensive audit logging (SHA-256 integrity verification)

**Medical AI & Knowledge Base:**

- ✅ Document upload (PDF, TXT support)
- ✅ Text extraction and intelligent chunking
- ✅ OpenAI embeddings (text-embedding-3-small, 1536 dimensions)
- ✅ Qdrant vector storage with cosine similarity
- ✅ RAG pipeline with context retrieval and citation tracking
- ✅ QueryOrchestrator with LLM integration
- ✅ Streaming responses via WebSocket

**Nextcloud Integration:**

- ✅ CalDAV calendar operations (list, create, update, delete events)
- ✅ WebDAV file discovery and auto-indexing
- ✅ Automatic knowledge base population from Nextcloud files
- ✅ Duplicate prevention for re-indexing

**Observability & Operations:**

- ✅ Prometheus metrics (cache, RAG, RBAC, HTTP, DB)
- ✅ Multi-level caching with hit/miss tracking
- ✅ SLO definitions (availability, latency, cache performance)
- ✅ SLO recording rules and alerting (Prometheus)
- ✅ Grafana dashboards (health, SLOs, security audit)
- ✅ Admin panel dashboard with system summary

**Infrastructure:**

- ✅ Docker Compose orchestration
- ✅ PostgreSQL with pgvector extension
- ✅ Redis with multiple databases (cache, queue, L2, token revocation)
- ✅ Qdrant vector database
- ✅ ARQ async job queue for background processing
- ✅ Alembic database migrations

### Future Enhancements (Optional)

The following features are candidates for future enhancement beyond the current implementation:

- ⏳ OIDC authentication integration (Nextcloud SSO)
- ⏳ Per-user credential management
- ⏳ Complete email integration (threading, search, attachments)
- ⏳ CardDAV contacts integration
- ⏳ BioGPT/PubMedBERT specialized medical models
- ⏳ Multi-hop reasoning and complex retrieval strategies
- ⏳ External integrations (UpToDate, OpenEvidence, PubMed live APIs)
- ⏳ Microservices extraction (when scaling requires)

---

## Component Architecture

### Monorepo Structure

```
VoiceAssist/
├── services/
│   └── api-gateway/              # Main FastAPI application
│       ├── app/
│       │   ├── main.py           # Application entry point
│       │   ├── api/              # API routes (FastAPI routers)
│       │   │   ├── auth.py       # Authentication endpoints
│       │   │   ├── users.py      # User management
│       │   │   ├── realtime.py   # WebSocket endpoint
│       │   │   ├── admin_kb.py   # Admin KB management
│       │   │   ├── admin_panel.py # Admin dashboard
│       │   │   ├── integrations.py # Nextcloud integrations
│       │   │   └── metrics.py    # Prometheus metrics
│       │   ├── services/         # Business logic layer
│       │   │   ├── rag_service.py         # QueryOrchestrator (RAG pipeline)
│       │   │   ├── llm_client.py          # LLM interface
│       │   │   ├── kb_indexer.py          # Document ingestion
│       │   │   ├── search_aggregator.py   # Semantic search
│       │   │   ├── cache_service.py       # Multi-level caching
│       │   │   ├── audit_service.py       # Audit logging
│       │   │   ├── caldav_service.py      # Calendar integration
│       │   │   ├── nextcloud_file_indexer.py # File auto-indexing
│       │   │   ├── email_service.py       # Email skeleton
│       │   │   └── token_revocation.py    # Token blacklist
│       │   ├── models/           # SQLAlchemy ORM models
│       │   │   ├── user.py
│       │   │   ├── session.py
│       │   │   ├── message.py
│       │   │   └── audit_log.py
│       │   ├── core/             # Core infrastructure
│       │   │   ├── config.py     # Settings (Pydantic)
│       │   │   ├── database.py   # DB session management
│       │   │   ├── security.py   # JWT, password hashing
│       │   │   ├── dependencies.py # FastAPI dependencies
│       │   │   ├── api_envelope.py # Standard response format
│       │   │   ├── metrics.py    # Prometheus metrics definitions
│       │   │   ├── request_id.py # Request correlation
│       │   │   └── password_validator.py # Password strength
│       │   └── worker/           # Background job processing
│       │       ├── tasks.py      # ARQ tasks (document indexing)
│       │       └── worker.py     # ARQ worker entrypoint
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/              # End-to-end tests (Phase 7)
│       ├── alembic/              # Database migrations
│       ├── requirements.txt
│       └── Dockerfile
├── infrastructure/
│   └── observability/
│       ├── prometheus/
│       │   ├── prometheus.yml
│       │   └── rules/
│       │       ├── slo_recording_rules.yml
│       │       └── slo_alerts.yml
│       └── grafana/
│           └── dashboards/
│               ├── health-monitoring.json
│               ├── slo-overview.json
│               └── security-audit.json
├── docs/                         # Documentation
│   ├── UNIFIED_ARCHITECTURE.md   # This document
│   ├── SERVICE_CATALOG.md
│   ├── DATA_MODEL.md
│   ├── operations/
│   │   └── SLO_DEFINITIONS.md
│   └── testing/
│       └── E2E_TESTING_GUIDE.md
├── docker-compose.yml            # Service orchestration
├── .env                          # Environment configuration
└── PHASE_STATUS.md               # Development status
```

### Logical Service Boundaries

Even in monorepo, services maintain strict boundaries:

| Service                 | Module Location                                              | Responsibility                             | Dependencies                         |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------ |
| **Auth Service**        | `app/api/auth.py` + `app/core/security.py`                   | User registration, login, JWT tokens, RBAC | PostgreSQL, Redis (token revocation) |
| **Realtime Service**    | `app/api/realtime.py`                                        | WebSocket endpoint, streaming responses    | QueryOrchestrator, LLMClient         |
| **RAG Service**         | `app/services/rag_service.py`                                | Query orchestration, RAG pipeline          | SearchAggregator, LLMClient, Qdrant  |
| **KB Indexer**          | `app/services/kb_indexer.py`                                 | Document ingestion, chunking, embedding    | OpenAI API, Qdrant, PostgreSQL       |
| **Search Aggregator**   | `app/services/search_aggregator.py`                          | Semantic search, citation extraction       | Qdrant, CacheService                 |
| **Cache Service**       | `app/services/cache_service.py`                              | Multi-level caching (L1 + L2)              | Redis                                |
| **Admin Service**       | `app/api/admin_kb.py` + `app/api/admin_panel.py`             | System management, dashboard               | All services (monitoring)            |
| **Integration Service** | `app/api/integrations.py` + `app/services/caldav_service.py` | Nextcloud integrations                     | Nextcloud APIs (CalDAV, WebDAV)      |
| **Audit Service**       | `app/services/audit_service.py`                              | Compliance logging, integrity verification | PostgreSQL                           |
| **Worker Service**      | `app/worker/`                                                | Async background jobs                      | Redis (ARQ), KBIndexer               |

### Service Communication Patterns

**Synchronous (Direct Function Calls in Monorepo):**

- API routes → Service layer
- Service → Service (internal imports)
- Service → Database (SQLAlchemy)
- Service → External APIs (HTTP clients)

**Asynchronous (Background Jobs via ARQ):**

- Document indexing jobs
- File auto-indexing from Nextcloud
- Future: Email sending, scheduled tasks

**Future (Microservices - Phases 11-14):**

- HTTP/REST between services
- gRPC for high-performance internal communication
- Message queue (RabbitMQ/Kafka) for async events

---

## Data Architecture

### Database Schema

**PostgreSQL Tables (Alembic managed):**

```sql
-- User Management
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Session Management
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP NOT NULL
);

-- Conversation Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES sessions(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL,  -- user, assistant, system
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- Audit Logs (HIPAA Compliance)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(255),
    service_name VARCHAR(100),
    endpoint VARCHAR(255),
    status_code INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB,
    integrity_hash VARCHAR(64) NOT NULL,  -- SHA-256
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### Redis Database Organization

**Redis Databases (0-15):**

| DB     | Purpose                | TTL                | Keys                                |
| ------ | ---------------------- | ------------------ | ----------------------------------- |
| **0**  | General caching        | Varies (15min-24h) | `cache:*`, `user:*`                 |
| **1**  | ARQ job queue          | N/A                | `arq:*`                             |
| **2**  | L2 cache (multi-level) | Varies             | `cache:l2:*`                        |
| **3**  | Token revocation       | Token expiry       | `token:revoked:*`, `user:revoked:*` |
| **15** | Test database          | N/A                | (cleared after tests)               |

### Qdrant Vector Database

**Collection: `medical_knowledge`**

```python
{
    "collection_name": "medical_knowledge",
    "vectors": {
        "size": 1536,  # OpenAI text-embedding-3-small
        "distance": "Cosine"
    },
    "payload_schema": {
        "document_id": "keyword",
        "chunk_index": "integer",
        "source_type": "keyword",  # textbook, journal, guideline, note
        "title": "text",
        "content": "text",
        "metadata": "json"
    }
}
```

### Data Flow Architecture

**Document Ingestion Flow:**

```
File Upload → KBIndexer →
  1. Text Extraction (PyPDF2/pdfplumber)
  2. Chunking (500 chars, 50 overlap)
  3. Embedding Generation (OpenAI API)
  4. Vector Storage (Qdrant)
  5. Metadata Storage (PostgreSQL - future)
  6. Cache Invalidation
```

**RAG Query Flow:**

```
User Query → QueryOrchestrator →
  1. Check L1 Cache (embedding)
  2. Check L2 Cache (embedding)
  3. Generate Embedding (OpenAI API)
  4. Store in Cache (L2 + L1)
  5. Vector Search (Qdrant)
  6. Format Context
  7. LLM Generation (OpenAI GPT-4)
  8. Citation Extraction
  9. Response Streaming (WebSocket)
```

**Authentication Flow:**

```
Login Request → Auth API →
  1. Validate Credentials (bcrypt)
  2. Generate JWT Tokens (access + refresh)
  3. Store Session (PostgreSQL)
  4. Audit Log (audit_logs table)
  5. Return Tokens
```

---

## Integration Architecture

### Nextcloud Integration Pattern

**Architecture Decision:** Nextcloud is a **separate deployment**, VoiceAssist is a **client**.

**Integration Points:**

1. **CalDAV (Calendar)**
   - Protocol: CalDAV (RFC 4791)
   - Library: `caldav` Python library
   - Operations: List calendars, create/update/delete events
   - Location: `app/services/caldav_service.py`

2. **WebDAV (Files)**
   - Protocol: WebDAV (RFC 4918)
   - Library: `webdavclient3`
   - Operations: Discover files, download for indexing
   - Location: `app/services/nextcloud_file_indexer.py`

3. **OIDC (Authentication - Future)**
   - Protocol: OpenID Connect
   - Flow: Authorization code flow
   - Provider: Nextcloud OIDC app
   - Status: Deferred to Phase 8+

**Environment Configuration:**

```bash
# Nextcloud Connection
NEXTCLOUD_BASE_URL=http://localhost:8080  # or https://cloud.asimo.io
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=secure_password

# CalDAV
NEXTCLOUD_CALDAV_URL=${NEXTCLOUD_BASE_URL}/remote.php/dav/calendars

# WebDAV
NEXTCLOUD_WEBDAV_URL=${NEXTCLOUD_BASE_URL}/remote.php/dav/files

# OIDC (Future)
NEXTCLOUD_OIDC_ISSUER=${NEXTCLOUD_BASE_URL}/apps/oidc
NEXTCLOUD_CLIENT_ID=voiceassist
NEXTCLOUD_CLIENT_SECRET=<from_nextcloud>
```

### External API Integrations

**OpenAI API:**

- Embeddings: `text-embedding-3-small` (1536 dimensions)
- LLM: `gpt-4-turbo-preview` (configurable)
- Usage: Document embedding, RAG response generation
- Rate limiting: Handled by OpenAI client

**Future Integrations (Phases 8+):**

- PubMed E-utilities API (medical literature search)
- UpToDate API (evidence-based clinical references)
- OpenEvidence API (guideline summaries)
- Medical calculator libraries

---

## Security Architecture

### Authentication & Authorization

**JWT Token Strategy:**

- **Access Token**: 15-minute expiry, HS256 algorithm
- **Refresh Token**: 7-day expiry, HS256 algorithm
- **Token Revocation**: Redis-based blacklist (individual + all-user-tokens)
- **Claims**: `sub` (user_id), `email`, `role`, `exp`, `iat`, `type`

**Password Security:**

- **Hashing**: bcrypt via passlib
- **Validation**: Multi-criteria (8+ chars, upper, lower, digit, special)
- **Strength Scoring**: 0-100 scale with Weak/Medium/Strong classification
- **Common Password Rejection**: Blocks password, 123456, qwerty, etc.

**RBAC (Role-Based Access Control):**

- **Roles**: `admin`, `user` (more roles in future phases)
- **Admin Enforcement**: `get_current_admin_user` dependency
- **Protected Endpoints**:
  - `/api/admin/kb/*` - Knowledge base management
  - `/api/admin/panel/*` - System dashboard
  - `/api/integrations/*` - Nextcloud integrations

### Audit Logging

**Compliance Features:**

- **Immutable Trail**: SHA-256 integrity hash on each log entry
- **Comprehensive Metadata**: User, action, resource, timestamp, IP, user agent
- **Request Correlation**: Request ID for distributed tracing
- **Tamper Detection**: Integrity verification queries
- **HIPAA Alignment**: Meets audit trail requirements

**Logged Events:**

- User registration, login, logout
- Token refresh, token revocation
- Password changes, failed authentication
- Admin operations (KB management, system config)
- Document access and modifications

### Data Protection

**Encryption:**

- **In Transit**: HTTPS/TLS 1.2+ (production)
- **At Rest**: Database-level encryption (future: PostgreSQL transparent encryption)
- **Tokens**: JWT with signed claims
- **Passwords**: bcrypt hashing (cost factor: 12)

**PHI Protection (Future):**

- PHI detection service (Phase 8+)
- Automatic log redaction
- Local vs cloud AI routing based on PHI presence
- Separate encryption keys for PHI data

### Network Security

**Docker Compose Network Isolation:**

```yaml
networks:
  voiceassist_network:
    driver: bridge
    internal: false # API gateway needs external access
  voiceassist_internal:
    driver: bridge
    internal: true # Database layer isolated
```

**Future (Kubernetes - Phases 11-14):**

- Network policies for pod-to-pod restrictions
- Service mesh (Linkerd) for mTLS
- Ingress controller with WAF (Web Application Firewall)

---

## Deployment Architecture

### Development Environment (Docker Compose)

**Current Stack:**

```yaml
# docker-compose.yml
services:
  # Application Services
  voiceassist-server:
    build: ./services/api-gateway
    ports: ["8000:8000"]
    depends_on: [postgres, redis, qdrant]

  voiceassist-worker:
    build: ./services/api-gateway
    command: ["python", "-m", "app.worker.worker"]
    depends_on: [redis]

  # Data Layer
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: [qdrant_data:/qdrant/storage]

  # Observability (Phase 7+)
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./infrastructure/observability/prometheus:/etc/prometheus

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    volumes:
      - ./infrastructure/observability/grafana:/etc/grafana
```

**Resource Allocation:**

- PostgreSQL: 2 CPU, 4GB RAM
- Redis: 1 CPU, 1GB RAM
- Qdrant: 2 CPU, 4GB RAM
- API Gateway: 2 CPU, 4GB RAM
- Worker: 1 CPU, 2GB RAM

### Production Deployment (Future - Kubernetes)

**Planned Architecture (Phases 11-14):**

```
Kubernetes Cluster
├── Ingress (voiceassist.asimo.io)
│   └── SSL Termination (Let's Encrypt)
├── Service Mesh (Linkerd)
│   └── mTLS between all services
├── Microservices (2-10 replicas each)
│   ├── API Gateway (Kong/Nginx)
│   ├── Auth Service
│   ├── Realtime Service
│   ├── RAG Service
│   ├── Admin Service
│   └── Integration Service
├── Data Layer
│   ├── PostgreSQL (Primary + 2 Read Replicas)
│   ├── Redis Cluster (3 masters, 3 replicas)
│   └── Qdrant (3 replicas)
└── Observability
    ├── Prometheus (HA pair)
    ├── Grafana
    ├── Jaeger (distributed tracing)
    └── Loki (log aggregation)
```

---

## Observability Architecture

### Metrics Collection (Prometheus)

**Instrumentation:**

- **HTTP Metrics**: Request count, latency (p50, p95, p99), status codes
- **Cache Metrics**: Hit/miss rates by layer (L1, L2), size, evictions
- **RAG Metrics**: Query latency, embedding generation time, search results
- **RBAC Metrics**: Protected endpoint access, admin operations
- **Database Metrics**: Connection pool utilization, query latency
- **External API Metrics**: OpenAI call latency, rate limits

**Metrics Endpoint:**

- Location: `GET /metrics`
- Format: Prometheus exposition format
- Protection: Optional authentication (configurable)

### Service Level Objectives (SLOs)

**Defined SLOs (Phase 7):**

| SLO                  | Target  | Error Budget   | Measurement Window |
| -------------------- | ------- | -------------- | ------------------ |
| API Availability     | 99.9%   | 43.2 min/month | 30 days            |
| API Latency (P95)    | < 500ms | -              | 5 minutes          |
| RAG Query Success    | 99%     | 1% failures    | 24 hours           |
| Cache Hit Rate       | > 40%   | -              | 1 hour             |
| Database P95 Latency | < 100ms | -              | 5 minutes          |

**Prometheus Recording Rules:**

```yaml
# API Availability (30-day)
- record: slo:api_availability:ratio_rate30d
  expr: |
    sum(rate(voiceassist_http_requests_total{status_code=~"2..|3.."}[30d]))
    / sum(rate(voiceassist_http_requests_total[30d]))

# Error Budget Remaining
- record: slo:error_budget_remaining:percent
  expr: |
    100 * (1 - ((1 - slo:api_availability:ratio_rate30d) / 0.001))
```

**Alerting:**

- Multi-window, multi-burn-rate approach (Google SRE guidelines)
- Critical alerts: SLO violations (< 99.9% availability)
- Warning alerts: Error budget burn rate > 14.4x
- Info alerts: Informational notifications

### Logging Strategy

**Structured Logging:**

```python
logger.info("user_login_success", extra={
    "user_id": user.id,
    "email": user.email,
    "ip_address": request.client.host,
    "request_id": request.state.request_id,
    "timestamp": datetime.utcnow().isoformat()
})
```

**Log Levels:**

- **DEBUG**: Development only (not in production)
- **INFO**: Normal operations, audit events
- **WARNING**: Potential issues, deprecated API usage
- **ERROR**: Errors requiring attention
- **CRITICAL**: Service failures

**Log Aggregation (Future - Loki):**

- Centralized log storage
- Full-text search
- Log correlation by request ID
- PHI redaction applied automatically

### Dashboards (Grafana)

**Implemented Dashboards (Phase 7):**

1. **Health Monitoring Dashboard** (`health-monitoring.json`)
   - System overview (CPU, memory, disk)
   - Service health status
   - Database connection pool
   - Redis memory usage
   - Qdrant storage

2. **SLO Overview Dashboard** (`slo-overview.json`)
   - API availability (30d)
   - Error budget remaining
   - Error budget burn rate
   - API latency (P50, P95, P99)
   - Cache hit rates

3. **Security Audit Dashboard** (`security-audit.json`)
   - Recent authentication events
   - Failed login attempts
   - Token revocations
   - Admin operations
   - Audit log integrity status

---

## Data Flow Examples

### Example 1: User Registration and Login

```
1. User Registration
   ├─> POST /api/auth/register {email, password}
   ├─> Password Validator: Check strength
   ├─> User Model: Create with bcrypt hash
   ├─> PostgreSQL: Insert into users table
   ├─> Audit Service: Log registration event
   └─> Response: {user_id, email}

2. User Login
   ├─> POST /api/auth/login {email, password}
   ├─> User Model: Query by email
   ├─> Security Service: Verify password (bcrypt)
   ├─> Token Service: Generate JWT tokens (access + refresh)
   ├─> Session Model: Create session record
   ├─> Audit Service: Log login event
   └─> Response: {access_token, refresh_token, user}

3. Authenticated Request
   ├─> GET /api/auth/me
   ├─> Header: Authorization: Bearer <access_token>
   ├─> Dependency: get_current_user
   ├─> Token Service: Decode and validate JWT
   ├─> Token Revocation: Check Redis blacklist
   ├─> User Model: Query user details
   └─> Response: {user}
```

### Example 2: RAG Query with Caching

```
1. User Query via WebSocket
   ├─> WS /api/realtime/ws
   ├─> Client: {"type": "message", "content": "What is diabetic ketoacidosis?"}
   ├─> Realtime Service: Parse and validate
   └─> Forward to QueryOrchestrator

2. RAG Pipeline
   ├─> QueryOrchestrator: handle_query()
   ├─> SearchAggregator: generate_query_embedding()
   │   ├─> CacheService: Check L1 cache (LRU)
   │   ├─> CacheService: Check L2 cache (Redis)
   │   ├─> Cache Miss → OpenAI API: Create embedding
   │   └─> CacheService: Store in L2 + L1 (24h TTL)
   ├─> SearchAggregator: search() in Qdrant
   │   ├─> Qdrant: Cosine similarity search (top_k=5)
   │   └─> Return: List[SearchResult]
   ├─> SearchAggregator: format_context_for_rag()
   ├─> LLMClient: generate() with context
   │   └─> OpenAI API: GPT-4 generation
   └─> SearchAggregator: extract_citations()

3. Streaming Response
   ├─> Realtime Service: Stream response chunks
   │   ├─> Send: {"type": "message_start", "message_id": "..."}
   │   ├─> Send: {"type": "message_chunk", "content": "Diabetic..."}
   │   ├─> Send: {"type": "message_chunk", "content": " ketoacidosis..."}
   │   └─> Send: {"type": "message_complete", "citations": [...]}
   └─> Client: Receives streaming response
```

### Example 3: Document Upload and Indexing

```
1. Admin Upload
   ├─> POST /api/admin/kb/documents
   ├─> Dependency: get_current_admin_user (RBAC check)
   ├─> File: multipart/form-data (PDF or TXT)
   └─> Forward to KBIndexer

2. Document Processing
   ├─> KBIndexer: index_pdf_document() or index_document()
   ├─> Text Extraction: PyPDF2 or pdfplumber
   ├─> Chunking: 500 chars, 50 overlap
   ├─> For each chunk:
   │   ├─> OpenAI API: Create embedding (1536 dims)
   │   ├─> Qdrant: Store vector with metadata
   │   │   └─> Payload: {document_id, chunk_index, title, content, source_type}
   │   └─> Metrics: Track chunks_indexed
   └─> Return: IndexingResult {document_id, chunks_indexed, success}

3. Response to Admin
   ├─> Success Envelope: {success: true, data: {...}}
   ├─> Cache Invalidation: Clear L1 + L2 caches
   ├─> Audit Log: Document upload event
   └─> Prometheus Metrics: Increment kb_documents_indexed_total
```

### Example 4: Calendar Event Creation via Nextcloud

```
1. Create Event Request
   ├─> POST /api/integrations/calendar/events
   ├─> Dependency: get_current_user (authentication)
   ├─> Body: {summary, start, end, description, location}
   └─> Forward to CalDAVService

2. CalDAV Integration
   ├─> CalDAVService: create_event()
   ├─> Connect to Nextcloud CalDAV
   │   └─> URL: {NEXTCLOUD_BASE_URL}/remote.php/dav/calendars/{user}/default
   ├─> Create iCalendar event (vobject)
   │   └─> VEVENT with SUMMARY, DTSTART, DTEND, DESCRIPTION, LOCATION
   ├─> Save to Nextcloud calendar
   └─> Return: Event UID

3. Response
   ├─> Success Envelope: {success: true, data: {event_uid: "..."}}
   ├─> Future: Send notification to user
   └─> Audit Log: Calendar event created
```

---

## Technology Stack

### Backend

| Component            | Technology  | Version | Purpose                      |
| -------------------- | ----------- | ------- | ---------------------------- |
| **Language**         | Python      | 3.11+   | Primary backend language     |
| **Framework**        | FastAPI     | 0.104+  | Async web framework          |
| **ORM**              | SQLAlchemy  | 2.0+    | Database ORM                 |
| **Migrations**       | Alembic     | 1.12+   | Database schema versioning   |
| **Validation**       | Pydantic    | 2.4+    | Data validation and settings |
| **Authentication**   | python-jose | 3.3+    | JWT token handling           |
| **Password Hashing** | passlib     | 1.7+    | bcrypt hashing               |
| **HTTP Client**      | httpx       | 0.25+   | Async HTTP requests          |
| **Job Queue**        | ARQ         | 0.25+   | Async background jobs        |

### Databases & Storage

| Component            | Technology | Version | Purpose                      |
| -------------------- | ---------- | ------- | ---------------------------- |
| **RDBMS**            | PostgreSQL | 16      | Primary relational database  |
| **Vector Extension** | pgvector   | 0.5+    | Vector storage in PostgreSQL |
| **Cache/Queue**      | Redis      | 7+      | Caching, sessions, job queue |
| **Vector DB**        | Qdrant     | 1.7+    | Semantic search              |

### AI & ML

| Component      | Technology                    | Purpose                 |
| -------------- | ----------------------------- | ----------------------- |
| **Embeddings** | OpenAI text-embedding-3-small | 1536-dim embeddings     |
| **LLM**        | OpenAI GPT-4 Turbo            | Response generation     |
| **Future**     | BioGPT, PubMedBERT            | Medical-specific models |

### Integrations

| Component          | Technology              | Purpose                 |
| ------------------ | ----------------------- | ----------------------- |
| **Calendar**       | caldav (Python library) | CalDAV protocol support |
| **Files**          | webdavclient3           | WebDAV protocol support |
| **Email**          | imaplib, smtplib        | IMAP/SMTP (future)      |
| **PDF Processing** | PyPDF2, pdfplumber      | Text extraction         |

### Observability

| Component           | Technology        | Version | Purpose                |
| ------------------- | ----------------- | ------- | ---------------------- |
| **Metrics**         | Prometheus        | 2.47+   | Metrics collection     |
| **Metrics Client**  | prometheus-client | 0.19+   | Python instrumentation |
| **Dashboards**      | Grafana           | 10.2+   | Visualization          |
| **Future: Tracing** | Jaeger            | -       | Distributed tracing    |
| **Future: Logging** | Loki              | -       | Log aggregation        |

### Infrastructure

| Component                | Technology     | Version | Purpose                       |
| ------------------------ | -------------- | ------- | ----------------------------- |
| **Containerization**     | Docker         | 24+     | Container runtime             |
| **Orchestration**        | Docker Compose | 2.23+   | Multi-container orchestration |
| **Future: K8s**          | Kubernetes     | 1.28+   | Production orchestration      |
| **Future: Service Mesh** | Linkerd        | 2.14+   | mTLS, observability           |

---

## Architecture Evolution

### Phase-by-Phase Evolution

**Phase 0-1: Foundation**

- Docker Compose setup
- PostgreSQL, Redis, Qdrant
- Health endpoints
- Database migrations

**Phase 2-3: Security & Core Services**

- JWT authentication
- Password validation and hashing
- Token revocation
- Nextcloud integration skeleton
- API Gateway solidified
- Core endpoint structure

**Phase 4: Realtime Communication**

- WebSocket endpoint
- QueryOrchestrator integration
- Message streaming protocol
- Ping/pong keepalive

**Phase 5: Medical AI**

- Document ingestion (PDF, TXT)
- OpenAI embeddings
- Qdrant vector storage
- RAG pipeline
- Semantic search
- Citation tracking

**Phase 6: Nextcloud Integration**

- CalDAV calendar operations
- WebDAV file discovery
- Automatic file indexing
- Email service skeleton

**Phase 7: Admin & RBAC**

- Role-based access control
- Admin-only endpoints
- Admin dashboard API
- Smoke tests for RBAC

**Future Phases (8-14):**

- OIDC authentication
- Complete email integration
- Frontend apps (Web Client, Admin Panel UI)
- Voice processing (VAD, Realtime API)
- Specialized medical models
- Microservices extraction (if needed)
- Kubernetes deployment
- Service mesh (Linkerd)
- Advanced observability (Jaeger, Loki)

### Migration to Microservices (When Needed)

**Trigger Conditions:**

- > 50 concurrent users
- Team size > 5 developers
- Independent scaling requirements
- Different deployment cycles
- Regulatory requirements

**Extraction Strategy:**

1. **Phase 11: Prepare**
   - Ensure clean module boundaries
   - Extract shared code to library
   - Define API contracts
   - Independent service tests

2. **Phase 12: Extract Services**
   - Start with independent services (Search, PHI Detection)
   - Extract core services (Auth, RAG, Admin)
   - Extract shared services last (Integrations)

3. **Phase 13: Deploy to Kubernetes**
   - Create Dockerfiles per service
   - Create K8s manifests (Deployments, Services, ConfigMaps, Secrets)
   - Set up service mesh (Linkerd)
   - Deploy to dev cluster, then production

---

## Design Decisions and Trade-offs

### 1. Monorepo vs Microservices (Phases 0-10)

**Decision**: Start with monorepo, maintain logical service boundaries

**Rationale:**

- Faster development iteration
- Simpler debugging (single codebase)
- Lower operational complexity
- Easier testing (no distributed systems challenges)
- Suitable for < 50 concurrent users

**Trade-offs:**

- **Pros**: Speed, simplicity, shared dependencies
- **Cons**: Single deployment unit, harder to scale independently
- **Mitigation**: Clear module boundaries enable future extraction

### 2. JWT vs Session-Based Authentication

**Decision**: JWT with short-lived access tokens + refresh tokens

**Rationale:**

- Stateless authentication (scales horizontally)
- No server-side session storage required
- Works well with SPAs and mobile apps
- Industry standard for API authentication

**Trade-offs:**

- **Pros**: Scalable, stateless, widely supported
- **Cons**: Cannot revoke tokens without additional infrastructure
- **Mitigation**: Redis-based token revocation blacklist

### 3. Multi-Level Caching (L1 + L2)

**Decision**: In-memory LRU cache (L1) + Redis distributed cache (L2)

**Rationale:**

- L1 provides ultra-low latency for hot data
- L2 provides distributed caching across instances
- Automatic promotion from L2 to L1 on cache hits

**Trade-offs:**

- **Pros**: Fast, distributed, high hit rate
- **Cons**: More complex invalidation, cache consistency
- **Mitigation**: TTLs on all cached data, explicit invalidation APIs

### 4. OpenAI Embeddings vs Self-Hosted Models

**Decision**: Use OpenAI text-embedding-3-small for MVP

**Rationale:**

- High quality embeddings (1536 dimensions)
- No infrastructure overhead
- Fast API responses
- Easy integration

**Trade-offs:**

- **Pros**: Quality, speed, simplicity
- **Cons**: External dependency, cost per API call, data privacy
- **Mitigation**: Future migration to BioGPT/PubMedBERT for medical-specific embeddings

### 5. ARQ vs Celery for Background Jobs

**Decision**: ARQ (Async Redis Queue)

**Rationale:**

- Simpler than Celery (no separate broker required)
- Native async/await support
- Lightweight, fast
- Redis-backed (already using Redis)

**Trade-offs:**

- **Pros**: Simple, async-native, fast
- **Cons**: Less mature than Celery, fewer features
- **Mitigation**: Sufficient for current needs, can migrate to Celery if needed

### 6. Docker Compose vs Kubernetes (Phases 0-10)

**Decision**: Docker Compose for development and initial production

**Rationale:**

- Simple local development
- Easy to understand and debug
- Suitable for single-server deployment
- Lower operational complexity

**Trade-offs:**

- **Pros**: Simplicity, speed, low overhead
- **Cons**: Limited scaling, no auto-healing, single point of failure
- **Mitigation**: Migrate to Kubernetes when scaling requirements justify complexity

### 7. Nextcloud Separation vs Integrated Deployment

**Decision**: Nextcloud as separate stack, VoiceAssist as client

**Rationale:**

- Nextcloud is complex, mature, independently managed
- Allows using existing Nextcloud installations
- Clear separation of concerns
- Independent update cycles

**Trade-offs:**

- **Pros**: Flexibility, clear boundaries, reuse existing infrastructure
- **Cons**: More complex configuration, network dependency
- **Mitigation**: Well-defined API contracts, robust error handling

### 8. Synchronous vs Asynchronous Service Communication

**Decision**: Synchronous (direct function calls) in monorepo, async (message queue) for long-running jobs

**Rationale:**

- Synchronous is simpler and faster for request-response patterns
- Async is better for fire-and-forget and long-running tasks
- Most operations in VoiceAssist are request-response

**Trade-offs:**

- **Pros**: Simple, fast, easy to debug
- **Cons**: Tighter coupling, harder to scale independently
- **Mitigation**: Clear service boundaries enable future async migration

---

## Related Documentation

**Core Architecture:**

- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) - Detailed service descriptions
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Backend structure evolution
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - Original V2 architecture (reference)
- [DATA_MODEL.md](DATA_MODEL.md) - Canonical data entities

**Design Documents:**

- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - RAG orchestrator design
- [SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md) - Search implementation
- [NEXTCLOUD_INTEGRATION.md](NEXTCLOUD_INTEGRATION.md) - Integration architecture

**Operations:**

- [docs/operations/SLO_DEFINITIONS.md](operations/SLO_DEFINITIONS.md) - Service level objectives
- [docs/testing/E2E_TESTING_GUIDE.md](testing/E2E_TESTING_GUIDE.md) - Testing strategy
- [OBSERVABILITY.md](OBSERVABILITY.md) - Monitoring and logging

**Development:**

- [Implementation Status](overview/IMPLEMENTATION_STATUS.md) - Component status
- [DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md) - Phase-by-phase plan
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - Local setup guide
- [Archive: CURRENT_PHASE](archive/CURRENT_PHASE.md) - Historical phase info

**Security & Compliance:**

- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - HIPAA compliance details
- [INTEGRATION_IMPROVEMENTS_PHASE_0-8.md](INTEGRATION_IMPROVEMENTS_PHASE_0-8.md) - Integration roadmap

---

**Document Version**: 1.0
**Last Updated**: 2025-11-20
**Maintained By**: VoiceAssist Development Team
**Review Cycle**: Updated after each major phase completion
