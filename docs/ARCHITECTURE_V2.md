---
title: "Architecture V2"
slug: "architecture-v2"
summary: "VoiceAssist V2 is an **enterprise-grade, HIPAA-compliant, multi-user medical AI assistant** designed to support hundreds of concurrent users with high..."
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-01"
audience: ["human"]
tags: ["architecture"]
category: architecture
---

# VoiceAssist Architecture V2 - Enterprise Microservices

## System Overview

VoiceAssist V2 is an **enterprise-grade, HIPAA-compliant, multi-user medical AI assistant** designed to support hundreds of concurrent users with high availability, security, and performance.

## Architecture Diagram

**Key Architectural Decision: Nextcloud is a separate stack, not part of VoiceAssist deployment.**

```
┌─────────────────────────────────────────────────────────────────┐
│                        Users (Web/Mobile)                        │
│                  Browser / Mobile Apps                           │
└────────────────┬────────────────────┬────────────────────────────┘
                 │                    │
          ┌──────┴──────┐      ┌──────┴──────┐
          │             │      │             │
          v             │      v             │
┌───────────────────┐   │  ┌──────────────────────────────────────┐
│  Nextcloud Stack  │   │  │    VoiceAssist Microservices Stack   │
│  (Separate)       │   │  │    (This Repository)                 │
│                   │   │  │                                      │
│  - Identity/SSO   │◄──┼──│  All VoiceAssist services integrate  │
│  - File Storage   │   │  │  with Nextcloud via HTTP APIs        │
│  - Calendar       │   │  │                                      │
│  - Email          │   │  │  Environment variables:              │
│  - User Directory │   │  │  NEXTCLOUD_BASE_URL                  │
│                   │   │  │  NEXTCLOUD_OIDC_ISSUER               │
│  Local Dev:       │   │  │  NEXTCLOUD_CLIENT_ID                 │
│  ~/Nextcloud-Dev/ │   │  │  NEXTCLOUD_CLIENT_SECRET             │
│                   │   │  │                                      │
│  Production:      │   │  │                                      │
│  cloud.asimo.io   │   │  │                                      │
└───────────────────┘   │  └──────────────────────────────────────┘
                        │
                        │  HTTPS / OIDC / WebDAV APIs
                        │
                        v
┌──────────────────────────────────────────────────────────────────┐
│              VoiceAssist Microservices (Docker Compose)          │
│                                                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  API Gateway   │  │  Auth Service  │  │  Voice Proxy     │  │
│  │  (Kong)        │  │  (JWT/OIDC)    │  │  (WebRTC)        │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│                                                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Medical KB    │  │  Admin API     │  │  File Indexer    │  │
│  │  (RAG/AI)      │  │  (Management)  │  │  (Nextcloud)     │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│                                                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Calendar/     │  │  Guideline     │  │  Medical         │  │
│  │  Email Service │  │  Scraper       │  │  Calculator      │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                      Data Layer (Docker Compose)               │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  PostgreSQL      │  │  Redis       │  │  Qdrant         │ │
│  │  (pgvector)      │  │  (Cache)     │  │  (Vectors)      │ │
│  └──────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                 Observability Stack (Docker Compose)           │
│  ┌────────────┬────────────┬────────────┬───────────────┐    │
│  │ Prometheus │  Grafana   │   Jaeger   │  Loki (Logs)  │    │
│  └────────────┴────────────┴────────────┴───────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architecture Principles

**1. Nextcloud Separation**

- Nextcloud runs as a **completely separate stack**
- Local Development: `~/Nextcloud-Dev/docker-compose.yml`
- Production: Separate deployment (existing server or dedicated cluster)
- VoiceAssist integrates via standard APIs (OIDC, WebDAV, CalDAV, CardDAV)

**2. Integration Pattern**

- VoiceAssist services are **clients** of Nextcloud
- Communication via HTTP/HTTPS APIs
- No shared Docker Compose project
- No shared databases between stacks
- Environment variables configure the connection

**3. Deployment Independence**

- Nextcloud can be updated/restarted without affecting VoiceAssist
- VoiceAssist can be updated/restarted without affecting Nextcloud
- Separate monitoring and logging (though can be aggregated)

**Authentication Flow:**

```
User → Browser → Nextcloud Login (OIDC) → JWT Token → VoiceAssist Services
```

### Local Development Architecture

```
MacBook Pro
├── ~/Nextcloud-Dev/                    # Separate Nextcloud Stack
│   ├── docker-compose.yml              # Nextcloud + DB
│   ├── data/                           # Nextcloud files
│   ├── db/                             # Nextcloud DB
│   └── config/                         # Nextcloud config
│
│   Running at: http://localhost:8080
│
└── ~/VoiceAssist/                      # VoiceAssist Stack
    ├── docker-compose.yml              # All VoiceAssist services
    ├── services/                       # Microservices code
    ├── data/                           # VoiceAssist data
    └── .env                            # Includes NEXTCLOUD_BASE_URL=http://localhost:8080

    Running at: http://localhost:8000 (API Gateway)
```

┌──────────────────────────┴──────────────────────────────────────┐
│ API Gateway (Kong/Nginx) │
│ Rate Limiting │ Auth │ Routing │ Logging │
│ │
│ NOTE: Phases 0-10 - No separate gateway, FastAPI handles all │
│ Phases 11-14 - Extract to Kong/Nginx for microservices │
└──────────────────────────┬──────────────────────────────────────┘
│
┌──────────────────────────┴──────────────────────────────────────┐
│ Service Mesh (Linkerd/Istio) │
│ mTLS │ Service Discovery │ Load Balancing │ Policies │
│ │
│ NOTE: Phases 0-10 - Not needed (single app) │
│ Phases 11-14 - Add for microservices security │
│ │
│ ┌─────────────────┬─────────────────┬─────────────────────┐ │
│ │ Voice Proxy │ Medical KB │ Admin API │ │
│ │ Service │ Service │ Service │ │
│ │ - WebRTC/WS │ - RAG Engine │ - Config Mgmt │ │
│ │ - OpenAI API │ - Orchestrator │ - User Mgmt │ │
│ │ - VAD/AEC │ - Embeddings │ - Analytics │ │
│ │ - Context │ - PubMed │ - RBAC │ │
│ └─────────────────┴─────────────────┴─────────────────────┘ │
│ │
│ Phases 0-10: Logical services (modules/routers in services/api-gateway/) │
│ Phases 11-14: Physical services (separate containers) │
│ │
│ ┌─────────────────┬─────────────────┬─────────────────────┐ │
│ │ Auth Service │ File Indexer │ Calendar/Email │ │
│ │ - JWT │ - Local Files │ Service │ │
│ │ - MFA │ - Nextcloud │ - CalDAV │ │
│ │ - RBAC │ - Auto-index │ - IMAP/SMTP │ │
│ └─────────────────┴─────────────────┴─────────────────────┘ │
│ │
│ ┌─────────────────┬─────────────────┬─────────────────────┐ │
│ │ Guideline │ Medical Calc │ PHI Detection │ │
│ │ Scraper │ Service │ Service │ │
│ │ - CDC/WHO │ - Wells/GRACE │ - Redaction │ │
│ │ - Auto-update │ - Renal Dosing │ - Classification │ │
│ └─────────────────┴─────────────────┴─────────────────────┘ │
└───────────────────────────┬───────────────────────────────────┘
│
┌───────────────────────────┴───────────────────────────────────┐
│ Data Layer (Kubernetes) │
│ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ PostgreSQL Cluster (Primary + Replicas) │ │
│ │ - Users, Conversations, Documents │ │
│ │ - pgvector extension │ │
│ │ - Encrypted at rest │ │
│ └──────────────────────────────────────────────────────────┘ │
│ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Redis Cluster (Master-Slave) │ │
│ │ - Sessions, Caching │ │
│ │ - Pub/Sub for real-time │ │
│ └──────────────────────────────────────────────────────────┘ │
│ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Qdrant (Vector Database) │ │
│ │ - Medical knowledge embeddings │ │
│ │ - Replicated for HA │ │
│ └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
│
┌───────────────────────────┴───────────────────────────────────┐
│ Observability Stack │
│ ┌───────────┬───────────┬───────────┬──────────────────┐ │
│ │Prometheus │ Grafana │ Jaeger │ Loki (Logs) │ │
│ │(Metrics) │(Dashboard)│ (Traces) │ AlertManager │ │
│ └───────────┴───────────┴───────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

```

## Key Architectural Decisions

### 1. Microservices Architecture

**Why:** Scalability, fault isolation, independent deployment, technology flexibility

## Backend Implementation Strategy

The backend uses a **monorepo-first, microservices-ready** architecture:

### Phases 0-10: Monorepo (Docker Compose Development)
- All services live in `services/api-gateway/` directory (canonical backend)
- Single FastAPI application with multiple routers
- Services are **logical boundaries** enforced through module structure
- Runs in single container for rapid development
- Suitable for < 50 concurrent users
- See [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) for complete structure
- Note: `server/` directory is **DEPRECATED** - kept for reference only

**Why Start with Monorepo?**
- Faster development iteration (single codebase)
- Simpler debugging (all code in one place)
- Lower operational complexity (no K8s, no service mesh)
- Easier testing (integration tests within single app)
- Shared dependencies and models

### Phases 11-14: Microservices (Kubernetes Migration)
- Services can be extracted to separate containers
- Each service becomes independent deployment
- Communication via HTTP/gRPC through service mesh
- Only split services that need independent scaling
- Suitable for > 50 concurrent users, high availability requirements

**When to Split:**
- Deployment to Kubernetes cluster
- Need for independent scaling (e.g., voice service needs more resources)
- Team growth (> 5 developers, need ownership boundaries)
- Different deployment cycles (e.g., ML model updates vs API changes)

### Service Catalog

**Logical Services** (see [SERVICE_CATALOG.md](SERVICE_CATALOG.md) for complete documentation):
- **API Gateway** - Entry point, routing, rate limiting (Phase 11-14 only)
- **Voice Proxy** - WebRTC/WebSocket handling, OpenAI Realtime API integration
- **Medical KB / RAG Service** - RAG engine, orchestrator, semantic search, embeddings
- **Admin API** - System management, config, analytics, real-time events via Redis pub/sub
- **Auth Service** - Authentication, JWT, MFA, RBAC
- **File Indexer / Ingestion** - Document processing, PDF/DOCX parsing, chunking
- **Calendar/Email Service** - CalDAV, IMAP/SMTP integration
- **Guideline Scraper** - Automated scraping of CDC/WHO guidelines
- **Medical Calculator** - Clinical calculators and scoring
- **PHI Detection** - Classify and redact PHI from logs/data
- **External APIs Service** - PubMed, UpToDate, Nextcloud integrations
- **Search Service** - Vector search, hybrid search (dense + sparse)

**Note:** In Phases 0-10, these services are modules/routers within the single FastAPI app. In Phases 11-14, they can be extracted to separate containers if needed.

**Medical KB / RAG Enhancements (Phase 12 hardening):**
- Model adapter registry exposes BioGPT and PubMedBERT behind feature toggles (`ENABLE_BIOGPT_ADAPTER`, `ENABLE_PUBMEDBERT_ADAPTER`) while keeping the default OpenAI model visible in API metadata.
- Query orchestrator now performs query decomposition and multi-hop retrieval when enabled (`ENABLE_QUERY_DECOMPOSITION`, `ENABLE_MULTI_HOP_RETRIEVAL`), synthesizing context across documents before calling the LLM.
- Responses surface model provenance, selection confidence, retrieval confidence, and reasoning path data so downstream clients can render transparency badges without additional lookups.

### 2. Kubernetes Orchestration

**Local Development:** K3s (lightweight K8s)
**Production:** Full Kubernetes cluster

**Benefits:**
- Container orchestration
- Auto-scaling (HorizontalPodAutoscaler)
- Self-healing (pod restarts)
- Rolling updates
- Resource management
- Declarative infrastructure

**Key K8s Resources:**
- **Deployments** - For stateless services
- **StatefulSets** - For databases
- **Services** - Internal service discovery
- **Ingress** - External routing
- **ConfigMaps/Secrets** - Configuration management
- **PersistentVolumeClaims** - Data storage
- **NetworkPolicies** - Network segmentation

### 3. Service Mesh (Linkerd/Istio)

**Purpose:** Service-to-service security, observability, traffic management

**Features:**
- **mTLS** - Automatic mutual TLS between all services
- **Service Discovery** - Dynamic service location
- **Load Balancing** - Intelligent request distribution
- **Circuit Breaking** - Prevent cascade failures
- **Retry Logic** - Automatic retries with backoff
- **Traffic Splitting** - Canary deployments, A/B testing
- **Distributed Tracing** - Request flow visualization
- **Metrics Collection** - Automatic Prometheus metrics

**Choice:** **Linkerd** recommended for simplicity and performance

### 4. Nextcloud Integration (Separate Stack)

**Why:** Unified user management, SSO, file storage, calendar, email

**Architecture Decision:** Nextcloud is a **separate deployment**, not part of VoiceAssist.

**Integration Points:**
- **User Directory** - Single source of truth for users (via API)
- **SSO** - OAuth2/OIDC authentication
- **File Storage** - Access via WebDAV API
- **Calendar** - CalDAV integration
- **Email** - Access via IMAP/SMTP or Nextcloud Mail API
- **Apps** - VoiceAssist web clients can be Nextcloud apps (optional)

**Local Development:**
```

~/Nextcloud-Dev/ ~/VoiceAssist/
├── docker-compose.yml ├── docker-compose.yml
│ └── nextcloud service │ └── voiceassist services
│ └── postgres (for Nextcloud) │ └── postgres (for VoiceAssist)
│ │
│ Port: 8080 │ Port: 8000 (API Gateway)
│ │
│ VoiceAssist connects via: │
│ NEXTCLOUD_BASE_URL=http://localhost:8080

```

**Production:**
```

Nextcloud (Separate Server/Cluster) VoiceAssist (This System)

- cloud.asimo.io - voiceassist.asimo.io
- Managed independently - Connects via HTTPS
- Can be existing NC installation - Environment: NEXTCLOUD_BASE_URL=https://cloud.asimo.io

```

**Authentication Flow:**
```

1. User → https://voiceassist.asimo.io
2. Redirect → Nextcloud OIDC (cloud.asimo.io/apps/oidc)
3. User logs in to Nextcloud (MFA if enabled)
4. Nextcloud returns authorization code
5. VoiceAssist exchanges code for JWT token
6. VoiceAssist validates token and creates session
7. User accesses VoiceAssist with valid session

````

**Integration Method:**
- **NOT** via shared Docker Compose project
- **NOT** via shared database
- **YES** via HTTP APIs (OIDC, WebDAV, CalDAV, etc.)
- **YES** via environment variable configuration

**Environment Variables Required:**
```bash
# Nextcloud Connection
NEXTCLOUD_BASE_URL=http://localhost:8080  # or https://cloud.asimo.io
NEXTCLOUD_OIDC_ISSUER=${NEXTCLOUD_BASE_URL}/apps/oidc
NEXTCLOUD_CLIENT_ID=voiceassist
NEXTCLOUD_CLIENT_SECRET=secret_from_nextcloud
NEXTCLOUD_REDIRECT_URI=http://localhost:8000/auth/callback

# Nextcloud APIs
NEXTCLOUD_WEBDAV_URL=${NEXTCLOUD_BASE_URL}/remote.php/dav
NEXTCLOUD_CALDAV_URL=${NEXTCLOUD_BASE_URL}/remote.php/dav/calendars
NEXTCLOUD_CARDDAV_URL=${NEXTCLOUD_BASE_URL}/remote.php/dav/addressbooks

# Admin credentials (for service account operations)
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=secure_password
````

### 5. Admin Panel Integration

**Purpose:** Centralized management, monitoring, and observability for platform administrators.

**URLs:**

- **Admin Panel**: `https://admin.asimo.io` (React 18 + Vite)
- **Web App**: `https://dev.asimo.io` (React 18 + Vite)
- **Docs Site**: `https://assistdocs.asimo.io` (Next.js 14 static export)

**Architecture:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Panel   │     │    Web App      │     │   Docs Site     │
│ admin.asimo.io  │────▶│  dev.asimo.io   │────▶│assistdocs.asimo.io│
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌─────────────────────┐
         │    API Gateway      │
         │  /api/admin/panel/* │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼────┐          ┌─────▼────┐
    │ Database │          │  Redis   │
    │PostgreSQL│          │ Pub/Sub  │
    └──────────┘          └──────────┘
```

**Key Features:**

- **Cross-App Navigation**: Unified navigation between admin, web app, and docs
- **Conversations Management**: View all user conversations with message history
- **Clinical Contexts**: HIPAA-compliant PHI access with audit logging
- **Voice Monitor**: Real-time visibility into voice sessions and TT pipeline
- **Real-Time Events**: WebSocket with Redis pub/sub for live updates

**Admin Panel Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/panel/conversations` | List all conversations |
| GET | `/api/admin/panel/clinical-contexts` | List clinical contexts |
| POST | `/api/admin/panel/clinical-contexts/{id}/reveal` | Reveal PHI (audited) |
| GET | `/api/admin/panel/voice/sessions` | List voice sessions |
| GET | `/api/admin/panel/voice/tt-sessions` | TT pipeline state |
| GET | `/api/admin/panel/voice/tt-analytics` | TT performance metrics |
| WS | `/api/admin/panel/ws` | Real-time event stream |

**Real-Time Event Types:**

- `session.connected` / `session.disconnected` - User sessions
- `conversation.created` / `conversation.updated` - Conversations
- `voice.session_started` / `voice.session_ended` - Voice mode
- `tt.state_changed` / `tt.tool_called` - TT pipeline
- `phi.accessed` - PHI audit events (immediate)
- `system.alert` - System notifications (immediate)

**Event Publishing:**

```python
from app.services.admin_event_publisher import (
    publish_voice_session_started,
    publish_tt_state_changed,
    publish_phi_accessed,
)

# Events are buffered and batched via Redis
await publish_voice_session_started(user_id, session_id, "realtime", "alloy")

# High-priority events bypass buffer
await publish_phi_accessed(admin_id, admin_email, context_id, target_user_id)
```

**Frontend Integration:**

```typescript
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

const { status, events, metrics } = useRealtimeEvents({
  autoConnect: true,
  eventFilter: ["voice.session_started", "tt.state_changed"],
  onEvent: (event) => console.log(event),
});
```

**Environment Variables:**

```bash
# Admin Panel
ADMIN_PANEL_ENABLED=true
ADMIN_PANEL_CORS_ORIGINS=https://admin.asimo.io

# Redis for real-time events
REDIS_URL=redis://localhost:6379
ADMIN_EVENTS_CHANNEL=admin:events

# Cross-app URLs
VITE_WEB_APP_URL=https://dev.asimo.io
VITE_DOCS_URL=https://assistdocs.asimo.io
```

**Documentation:**

- [Admin Panel Integration Guide](admin/ADMIN_PANEL_INTEGRATION_GUIDE.md)
- [Real-Time Events Guide](admin/REALTIME_EVENTS_GUIDE.md)

### 6. Zero-Trust Security Model

**Principles:**

- Never trust, always verify
- Assume breach
- Verify explicitly
- Use least privilege
- Segment access

**Implementation:**

- **mTLS** for all inter-service communication
- **Short-lived JWT tokens** (5-15 minutes)
- **Token refresh** mechanism
- **Network policies** to restrict traffic
- **Open Policy Agent** for fine-grained authorization
- **PHI detection** and automatic redaction
- **Audit logging** for all access

### 6. HIPAA Compliance

**Key Requirements:**

- **Encryption in transit** - TLS 1.2+, mTLS
- **Encryption at rest** - Database encryption, encrypted backups
- **Access controls** - RBAC, MFA, audit logs
- **PHI protection** - Never log PHI, redact when necessary
- **Backup and recovery** - Encrypted backups, tested recovery
- **Audit trail** - Log all access to ePHI
- **Risk analysis** - Periodic security assessments

### 7. High Availability Design

**Database Layer:**

- PostgreSQL primary with streaming replication
- Read replicas for load distribution
- Automatic failover

**Application Layer:**

- Multiple replicas per service (min 2 in production)
- Load balancing across replicas
- Health checks and auto-restart

**Network Layer:**

- Multiple availability zones (if cloud)
- Load balancer with health checks
- DNS failover

**Target SLAs:**

- **Availability:** 99.9% (8.76 hours downtime/year)
- **Latency:** <500ms for voice activation, <2s for chat
- **Throughput:** Support 500+ concurrent users

## Data Flow Examples

### Example 1: Voice Interaction with Dynamic Clarification

```
1. User clicks "Connect" in web app (Nextcloud-hosted)
2. Web app authenticates with Nextcloud → gets JWT token
3. Web app establishes WebRTC connection to Voice Proxy service
4. Voice Proxy validates JWT with Auth Service
5. User speaks: "Search UpToDate for kidney disease management"
6. Voice Proxy:
   - Detects end of speech (VAD)
   - Sends audio to OpenAI Realtime API
   - Transcription returned
7. Medical KB Service analyzes query:
   - Detects ambiguity ("kidney disease" is broad)
   - Generates clarification: "Do you mean acute kidney injury,
     chronic kidney disease, diabetic kidney disease, or a specific
     type like pre-renal, intrinsic, or post-renal?"
8. Voice Proxy speaks clarification back to user
9. User responds: "Chronic kidney disease"
10. Medical KB Service:
    - Queries UpToDate API with refined query
    - Retrieves relevant articles
    - Generates structured summary with RAG
11. Voice Proxy speaks summary with citations
12. User: "Download the guideline PDF"
13. File Indexer Service:
    - Downloads PDF
    - Stores in Nextcloud
    - Indexes for future queries
14. Voice Proxy: "Downloaded and saved to your Nextcloud files"
```

### Example 2: Calendar Integration

```
1. User (via voice): "Add a meeting tomorrow at 2pm with Dr. Smith"
2. Voice Proxy → Medical KB Service → analyzes intent
3. Calendar/Email Service:
   - Creates event in Nextcloud calendar (CalDAV)
   - Syncs to linked Google Calendar (if configured)
   - Sends email invite via Nextcloud Mail
4. Voice Proxy confirms: "Meeting created for tomorrow at 2pm and
   invite sent to Dr. Smith"
```

### Example 3: File Indexing

```
1. User uploads medical note PDF to Nextcloud
2. Nextcloud triggers webhook → File Indexer Service
3. File Indexer:
   - Downloads file via WebDAV
   - Extracts text (PyPDF2, pdfplumber, Tesseract)
   - Chunks intelligently
   - Classifies for PHI (PHI Detection Service)
   - Generates embeddings (local if PHI, cloud if not)
   - Stores in Qdrant with metadata
4. File becomes searchable in voice queries
```

## Security Architecture

### Network Segmentation

```
┌─────────────────────────────────────────────────────────┐
│                   Public Internet                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                  Firewall (UFW)
                  Allow: 80, 443
                        │
┌───────────────────────┴─────────────────────────────────┐
│                  DMZ (Ingress)                           │
│  Nextcloud + API Gateway                                │
└───────────────────────┬─────────────────────────────────┘
                        │
              K8s Network Policies
                        │
┌───────────────────────┴─────────────────────────────────┐
│              Application Services (Mesh)                 │
│  mTLS enforced, no service-to-service direct access     │
└───────────────────────┬─────────────────────────────────┘
                        │
              Network Policies
                        │
┌───────────────────────┴─────────────────────────────────┐
│                   Data Layer                             │
│  No external access, only from app services             │
└─────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────┐         ┌──────────┐      ┌──────────┐     ┌──────────┐
│ User │────────>│Nextcloud │─────>│ Keycloak │────>│   JWT    │
└──────┘  Login  └──────────┘ OIDC └──────────┘     └────┬─────┘
                                                           │
                                                           v
                                        ┌──────────────────────────┐
                                        │   VoiceAssist Services   │
                                        │  Validate JWT + Check    │
                                        │  Permissions (OPA)       │
                                        └──────────────────────────┘
```

### Authorization with Open Policy Agent

```rego
# Example OPA policy
package voiceassist.authz

default allow = false

# Admins can do anything
allow {
    input.user.role == "admin"
}

# Users can access their own data
allow {
    input.user.role == "user"
    input.resource.user_id == input.user.id
}

# Medical staff can access medical knowledge base
allow {
    input.user.role == "medical_staff"
    input.action == "query_medical_kb"
}
```

## Observability

**See [OBSERVABILITY.md](OBSERVABILITY.md) for complete observability patterns, logging conventions, and metrics definitions.**

### Metrics (Prometheus)

**System Metrics:**

- CPU, memory, disk, network per pod
- Request rate, latency, error rate per service
- Database connections, query latency
- Cache hit rate

**Business Metrics:**

- Active users
- Voice sessions
- Queries per minute
- Medical KB lookups
- API costs (OpenAI, UpToDate)

### Distributed Tracing (Jaeger)

**Trace Example: Voice Query**

```
Span 1: Voice Proxy receives audio (10ms)
  Span 2: OpenAI Realtime API call (300ms)
  Span 3: Medical KB query (150ms)
    Span 4: Qdrant vector search (50ms)
    Span 5: OpenAI GPT-4 summarization (100ms)
  Span 6: Response synthesis (20ms)
Total: 480ms
```

### Logging (Loki)

**Log Levels:**

- DEBUG - Development only
- INFO - Normal operations
- WARN - Potential issues
- ERROR - Errors requiring attention
- CRITICAL - Service failures

**Log Redaction:**

```python
# Automatically redact PHI
log.info(f"Processing request for user {redact_phi(user_id)}")
# Output: "Processing request for user ****"
```

### Alerting (AlertManager)

**Alert Rules:**

- Service down > 1 minute
- Error rate > 5%
- Voice latency > 1 second (p95)
- Database connections > 80% of max
- Disk usage > 80%
- SSL certificate expiring < 30 days

## Scaling Strategy

### Horizontal Scaling

```yaml
# HorizontalPodAutoscaler example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: voice-proxy-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: voice-proxy
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Database Scaling

- **Read replicas** for read-heavy operations
- **Connection pooling** (PgBouncer)
- **Query optimization** and indexing
- **Caching** with Redis

### Vertical Scaling

- Increase pod resource limits
- Use larger node instance types
- Add GPU nodes for AI workloads (if needed)

## Technology Stack Summary

| Layer             | Technology                                                       | Purpose                                 |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------- |
| **Orchestration** | Kubernetes (K3s locally)                                         | Container orchestration                 |
| **Service Mesh**  | Linkerd                                                          | mTLS, observability, traffic management |
| **Identity**      | Nextcloud + Keycloak                                             | SSO, user management                    |
| **API Gateway**   | Kong or Nginx                                                    | Routing, rate limiting, auth            |
| **Backend**       | Python FastAPI                                                   | Microservices                           |
| **Frontend**      | React 18 + Vite (web-app, admin-panel), Next.js 14 (docs-site)   | Web apps                                |
| **Databases**     | PostgreSQL (pgvector), Redis, Qdrant                             | Data persistence, caching, vectors      |
| **AI/ML**         | OpenAI, BioGPT, PubMedBERT                                       | LLM, medical models                     |
| **Voice**         | Thinker-Talker (Deepgram + ElevenLabs), OpenAI Realtime (legacy) | Voice interaction                       |
| **Observability** | Prometheus, Grafana, Jaeger, Loki                                | Monitoring, metrics, tracing, logging   |
| **IaC**           | Terraform, Ansible                                               | Infrastructure automation               |
| **CI/CD**         | GitHub Actions                                                   | Automated testing and deployment        |
| **Security**      | Let's Encrypt, OPA, mTLS                                         | SSL, authorization, encryption          |

## Deployment Architecture

### Local Development (MacBook Pro)

```
K3s Cluster (local)
├── Nextcloud (localhost:9000)
├── API Gateway (localhost:8080)
├── Voice Proxy (localhost:8001)
├── Medical KB (localhost:8002)
├── Admin API (localhost:8003)
├── Auth Service (localhost:8004)
├── PostgreSQL (localhost:5432)
├── Redis (localhost:6379)
├── Qdrant (localhost:6333)
├── Prometheus (localhost:9090)
└── Grafana (localhost:3000)
```

### Production (Ubuntu Server)

```
Kubernetes Cluster
├── Ingress (voiceassist.asimo.io)
│   └── SSL Termination
├── Service Mesh (Linkerd)
├── Microservices (2-10 replicas each)
│   ├── Nextcloud
│   ├── API Gateway
│   ├── Voice Proxy
│   ├── Medical KB
│   ├── Admin API
│   └── ... (all services)
├── Data Layer
│   ├── PostgreSQL Primary + 2 Replicas
│   ├── Redis Cluster (3 masters, 3 slaves)
│   └── Qdrant (3 replicas)
└── Observability Stack
    ├── Prometheus
    ├── Grafana
    ├── Jaeger
    └── Loki
```

## Next Steps

1. Read `SECURITY_COMPLIANCE.md` for HIPAA details
2. Read `NEXTCLOUD_INTEGRATION.md` for Nextcloud specifics
3. Review `DEVELOPMENT_PHASES_V2.md` for implementation plan
4. Start with Phase 0: Project Initialization
