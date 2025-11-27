---
title: "Architecture Diagrams"
slug: "architecture/architecture-diagrams"
summary: "**Last Updated**: 2025-11-20 (Phase 7)"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["architecture", "diagrams"]
category: architecture
---

# VoiceAssist V2 - Architecture Diagrams

**Last Updated**: 2025-11-20 (Phase 7)
**Purpose**: Visual architecture diagrams for system understanding

---

## Table of Contents

1. [System Context Diagram](#system-context-diagram)
2. [Container Diagram](#container-diagram)
3. [Component Diagram](#component-diagram)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Deployment Diagram](#deployment-diagram)
6. [Sequence Diagrams](#sequence-diagrams)

---

## System Context Diagram

High-level view of VoiceAssist and its external dependencies.

```mermaid
graph TB
    User[("👤 Clinician/User<br/>(Browser/Mobile)")]
    Admin[("👨‍💼 Admin<br/>(Browser)")]

    VA["🏥 VoiceAssist V2<br/>(Medical AI Assistant)<br/>Port: 8000"]

    NC["☁️ Nextcloud<br/>(Separate Stack)<br/>Port: 8080"]
    OpenAI["🤖 OpenAI API<br/>(Embeddings + LLM)"]

    User -->|"HTTP/WebSocket<br/>Query, Chat"| VA
    Admin -->|"HTTP<br/>Manage KB, View Dashboard"| VA

    VA -->|"CalDAV/WebDAV<br/>Calendar, Files"| NC
    VA -->|"OIDC (Future)<br/>Authentication"| NC
    VA -->|"Embeddings<br/>LLM Generation"| OpenAI

    NC -.->|"Stores Files"| User
    NC -.->|"Manages Calendar"| User

    style VA fill:#e1f5ff
    style NC fill:#fff4e1
    style OpenAI fill:#f0e1ff
```

---

## Container Diagram

Internal containers within VoiceAssist system.

```mermaid
graph TB
    subgraph "VoiceAssist System"
        subgraph "Application Layer"
            Gateway["🌐 API Gateway<br/>(FastAPI)<br/>Port: 8000"]
            Worker["⚙️ Background Worker<br/>(ARQ)<br/>Document Indexing"]
        end

        subgraph "Data Layer"
            PG[("🗄️ PostgreSQL<br/>pgvector<br/>Port: 5432")]
            Redis[("🔴 Redis<br/>6 Databases<br/>Port: 6379")]
            Qdrant[("🔍 Qdrant<br/>Vector DB<br/>Port: 6333")]
        end

        subgraph "Observability"
            Prom["📊 Prometheus<br/>Port: 9090"]
            Graf["📈 Grafana<br/>Port: 3000"]
        end
    end

    User[("👤 User")] -->|"HTTP/WS"| Gateway
    Gateway -->|"SQL"| PG
    Gateway -->|"Cache/Queue"| Redis
    Gateway -->|"Vector Search"| Qdrant
    Worker -->|"Read Jobs"| Redis
    Worker -->|"Index Docs"| Qdrant

    Gateway -->|"Metrics"| Prom
    Worker -->|"Metrics"| Prom
    Prom -->|"Data Source"| Graf

    style Gateway fill:#e1f5ff
    style Worker fill:#e1ffe1
    style PG fill:#ffe1e1
    style Redis fill:#fff4e1
    style Qdrant fill:#f0e1ff
```

---

## Component Diagram

Internal components of the API Gateway application.

```mermaid
graph TB
    subgraph "API Gateway (FastAPI Application)"
        subgraph "API Layer (app/api/)"
            AuthAPI["🔐 Auth API<br/>(/api/auth/*)"]
            RealtimeAPI["💬 Realtime API<br/>(/api/realtime/ws)"]
            AdminKB["📚 Admin KB API<br/>(/api/admin/kb/*)"]
            AdminPanel["🎛️ Admin Panel API<br/>(/api/admin/panel/*)"]
            IntegAPI["🔗 Integration API<br/>(/api/integrations/*)"]
            MetricsAPI["📊 Metrics API<br/>(/metrics)"]
        end

        subgraph "Service Layer (app/services/)"
            RAG["🧠 RAG Service<br/>(QueryOrchestrator)"]
            LLM["🤖 LLM Client<br/>(OpenAI Interface)"]
            KB["📖 KB Indexer<br/>(Document Ingestion)"]
            Search["🔍 Search Aggregator<br/>(Semantic Search)"]
            Cache["💾 Cache Service<br/>(L1 + L2)"]
            Audit["📝 Audit Service<br/>(Compliance Logging)"]
            CalDAV["📅 CalDAV Service<br/>(Calendar Ops)"]
            FileIdx["📁 File Indexer<br/>(Nextcloud Files)"]
            TokenRev["🚫 Token Revocation<br/>(Redis Blacklist)"]
        end

        subgraph "Core Layer (app/core/)"
            Security["🔒 Security<br/>(JWT, bcrypt)"]
            Database["🗄️ Database<br/>(SQLAlchemy Sessions)"]
            Config["⚙️ Config<br/>(Pydantic Settings)"]
            Envelope["📦 API Envelope<br/>(Response Format)"]
            Metrics["📈 Metrics<br/>(Prometheus Defs)"]
        end

        subgraph "Models Layer (app/models/)"
            UserModel["User Model"]
            AuditModel["Audit Log Model"]
            SessionModel["Session Model"]
        end
    end

    %% API to Service connections
    AuthAPI --> Security
    AuthAPI --> TokenRev
    AuthAPI --> Audit

    RealtimeAPI --> RAG

    AdminKB --> KB
    AdminKB --> Audit

    IntegAPI --> CalDAV
    IntegAPI --> FileIdx

    MetricsAPI --> Metrics

    %% Service to Service connections
    RAG --> Search
    RAG --> LLM
    RAG --> Cache

    Search --> Cache

    KB --> LLM

    FileIdx --> KB

    %% Service to Core connections
    RAG --> Database
    KB --> Database
    Audit --> Database

    TokenRev --> Cache

    %% Core to Models connections
    Database --> UserModel
    Database --> AuditModel
    Database --> SessionModel

    style AuthAPI fill:#ffe1e1
    style RealtimeAPI fill:#e1f5ff
    style AdminKB fill:#fff4e1
    style RAG fill:#e1ffe1
    style Cache fill:#f0e1ff
```

---

## Data Flow Diagrams

### RAG Query Flow

```mermaid
sequenceDiagram
    participant User
    participant WebSocket as Realtime API<br/>(WebSocket)
    participant Orch as Query<br/>Orchestrator
    participant Cache as Cache<br/>Service
    participant Search as Search<br/>Aggregator
    participant Qdrant as Qdrant<br/>(Vectors)
    participant LLM as LLM Client<br/>(OpenAI)

    User->>WebSocket: Send Query<br/>"What is diabetes?"
    WebSocket->>Orch: handle_query()

    Orch->>Search: generate_query_embedding()
    Search->>Cache: Check L1 (LRU)
    Cache-->>Search: Cache Miss
    Search->>Cache: Check L2 (Redis)
    Cache-->>Search: Cache Miss

    Search->>LLM: Create Embedding (OpenAI)
    LLM-->>Search: Embedding [1536 dims]
    Search->>Cache: Store in L2 + L1

    Search->>Qdrant: Vector Search<br/>(top_k=5, threshold=0.7)
    Qdrant-->>Search: Search Results<br/>(5 chunks + metadata)

    Search->>Search: Format Context
    Search-->>Orch: Context + Citations

    Orch->>LLM: Generate Response<br/>(with context)
    LLM-->>Orch: Response Text

    Orch->>Search: Extract Citations
    Search-->>Orch: Citation List

    Orch-->>WebSocket: QueryResponse<br/>(answer + citations)

    loop Streaming
        WebSocket->>User: message_chunk
    end

    WebSocket->>User: message_complete<br/>(full answer + citations)
```

### Document Indexing Flow

```mermaid
sequenceDiagram
    participant Admin
    participant API as Admin KB API
    participant Indexer as KB Indexer
    participant Extract as Text<br/>Extractor
    participant LLM as LLM Client<br/>(OpenAI)
    participant Qdrant as Qdrant<br/>(Vectors)
    participant Audit as Audit<br/>Service

    Admin->>API: POST /api/admin/kb/documents<br/>(Upload PDF)
    API->>API: Check RBAC<br/>(get_current_admin_user)

    API->>Indexer: index_pdf_document()

    Indexer->>Extract: Extract Text<br/>(PyPDF2/pdfplumber)
    Extract-->>Indexer: Raw Text

    Indexer->>Indexer: Chunk Text<br/>(500 chars, 50 overlap)

    loop For Each Chunk
        Indexer->>LLM: Create Embedding<br/>(OpenAI API)
        LLM-->>Indexer: Embedding [1536 dims]

        Indexer->>Qdrant: Store Vector<br/>(embedding + metadata)
        Qdrant-->>Indexer: Success
    end

    Indexer-->>API: IndexingResult<br/>(document_id, chunks_indexed)

    API->>Audit: Log Upload Event
    Audit-->>API: Logged

    API-->>Admin: Success Response<br/>(document_id, chunks: 42)
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant API as Auth API
    participant Validator as Password<br/>Validator
    participant Security as Security<br/>Service
    participant DB as PostgreSQL
    participant Audit as Audit<br/>Service
    participant Redis as Redis<br/>(Token Blacklist)

    rect rgb(240, 240, 255)
        Note over User,Redis: Registration
        User->>API: POST /api/auth/register<br/>{email, password}
        API->>Validator: Validate Password<br/>(strength, common passwords)
        Validator-->>API: Valid (score: 85)

        API->>Security: Hash Password (bcrypt)
        Security-->>API: Hashed Password

        API->>DB: INSERT INTO users
        DB-->>API: User Created

        API->>Audit: Log Registration Event
        Audit-->>API: Logged

        API-->>User: {user_id, email}
    end

    rect rgb(255, 240, 240)
        Note over User,Redis: Login
        User->>API: POST /api/auth/login<br/>{email, password}
        API->>DB: SELECT user<br/>WHERE email = ?
        DB-->>API: User Record

        API->>Security: Verify Password<br/>(bcrypt compare)
        Security-->>API: Valid

        API->>Security: Generate JWT Tokens<br/>(access 15min, refresh 7d)
        Security-->>API: {access_token, refresh_token}

        API->>DB: INSERT INTO sessions
        DB-->>API: Session Created

        API->>Audit: Log Login Event
        Audit-->>API: Logged

        API-->>User: {access_token, refresh_token}
    end

    rect rgb(240, 255, 240)
        Note over User,Redis: Authenticated Request
        User->>API: GET /api/auth/me<br/>Authorization: Bearer <token>
        API->>Security: Decode JWT
        Security-->>API: {user_id, email, role}

        API->>Redis: Check Token Revoked?<br/>(token:revoked:{jti})
        Redis-->>API: Not Revoked

        API->>DB: SELECT user<br/>WHERE id = ?
        DB-->>API: User Data

        API-->>User: {user}
    end

    rect rgb(255, 255, 240)
        Note over User,Redis: Logout
        User->>API: POST /api/auth/logout
        API->>Redis: Add Token to Blacklist<br/>(TTL = token expiry)
        Redis-->>API: Added

        API->>Audit: Log Logout Event
        Audit-->>API: Logged

        API-->>User: Success
    end
```

---

## Deployment Diagram

### Current Deployment (Docker Compose - Phases 0-7)

```mermaid
graph TB
    subgraph "Host Machine (MacBook Pro / Ubuntu Server)"
        subgraph "Docker Network: voiceassist_network"
            Server["📦 voiceassist-server<br/>(FastAPI)<br/>Port: 8000<br/>2 CPU, 4GB RAM"]
            Worker["📦 voiceassist-worker<br/>(ARQ)<br/>1 CPU, 2GB RAM"]

            PG["📦 postgres<br/>(pgvector/pgvector:pg16)<br/>Port: 5432<br/>2 CPU, 4GB RAM"]
            Redis["📦 redis<br/>(redis:7-alpine)<br/>Port: 6379<br/>1 CPU, 1GB RAM"]
            Qdrant["📦 qdrant<br/>(qdrant/qdrant:latest)<br/>Port: 6333<br/>2 CPU, 4GB RAM"]

            Prom["📦 prometheus<br/>(prom/prometheus)<br/>Port: 9090"]
            Graf["📦 grafana<br/>(grafana/grafana)<br/>Port: 3000"]
        end

        subgraph "Volumes"
            PGData["💾 postgres_data"]
            RedisData["💾 redis_data"]
            QdrantData["💾 qdrant_data"]
        end
    end

    subgraph "External"
        NC["☁️ Nextcloud<br/>(Separate Stack)<br/>localhost:8080 or<br/>cloud.asimo.io"]
        OpenAI["🤖 OpenAI API<br/>(api.openai.com)"]
    end

    Browser["🌐 Browser"] -->|"HTTP :8000"| Server
    Browser -->|"WS :8000"| Server
    Browser -->|"HTTP :3000"| Graf

    Server --> PG
    Server --> Redis
    Server --> Qdrant
    Server --> NC
    Server --> OpenAI

    Worker --> Redis
    Worker --> Qdrant
    Worker --> OpenAI

    Server --> Prom
    Worker --> Prom
    Prom --> Graf

    PG -.->|"Persists"| PGData
    Redis -.->|"Persists"| RedisData
    Qdrant -.->|"Persists"| QdrantData

    style Server fill:#e1f5ff
    style Worker fill:#e1ffe1
    style PG fill:#ffe1e1
    style Redis fill:#fff4e1
    style Qdrant fill:#f0e1ff
```

### Future Deployment (Kubernetes - Phases 11-14)

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "Ingress Layer"
            Ingress["⚡ Ingress Controller<br/>(Nginx/Kong)<br/>SSL Termination"]
        end

        subgraph "Service Mesh (Linkerd)"
            Gateway["🌐 API Gateway<br/>(2-5 replicas)"]
            Auth["🔐 Auth Service<br/>(2-3 replicas)"]
            Realtime["💬 Realtime Service<br/>(3-10 replicas)"]
            RAGSvc["🧠 RAG Service<br/>(3-10 replicas)"]
            Admin["🎛️ Admin Service<br/>(2 replicas)"]
        end

        subgraph "Data Layer (StatefulSets)"
            PGPrimary["🗄️ PostgreSQL<br/>Primary"]
            PGReplica1["🗄️ PostgreSQL<br/>Replica 1"]
            PGReplica2["🗄️ PostgreSQL<br/>Replica 2"]

            RedisMaster["🔴 Redis<br/>Master"]
            RedisSlave["🔴 Redis<br/>Slave"]

            QdrantCluster["🔍 Qdrant<br/>Cluster (3 nodes)"]
        end

        subgraph "Observability"
            PromHA["📊 Prometheus<br/>(HA Pair)"]
            GrafCluster["📈 Grafana"]
            Jaeger["🔍 Jaeger"]
            Loki["📝 Loki"]
        end
    end

    Internet["🌐 Internet"] -->|"HTTPS"| Ingress
    Ingress --> Gateway

    Gateway --> Auth
    Gateway --> Realtime
    Gateway --> RAGSvc
    Gateway --> Admin

    Auth --> PGPrimary
    Realtime --> RAGSvc
    RAGSvc --> QdrantCluster
    RAGSvc --> RedisMaster

    PGPrimary -.->|"Replication"| PGReplica1
    PGPrimary -.->|"Replication"| PGReplica2
    RedisMaster -.->|"Replication"| RedisSlave

    Gateway --> PromHA
    Auth --> PromHA
    Realtime --> PromHA
    RAGSvc --> PromHA

    PromHA --> GrafCluster
    PromHA --> Loki

    Gateway --> Jaeger
    Auth --> Jaeger
    Realtime --> Jaeger
    RAGSvc --> Jaeger

    style Ingress fill:#ffe1e1
    style Gateway fill:#e1f5ff
    style RAGSvc fill:#e1ffe1
    style PGPrimary fill:#ffe1e1
    style QdrantCluster fill:#f0e1ff
```

---

## Sequence Diagrams

### Calendar Event Creation

```mermaid
sequenceDiagram
    participant User
    participant API as Integration API
    participant CalDAV as CalDAV<br/>Service
    participant NC as Nextcloud<br/>CalDAV Server
    participant Audit as Audit<br/>Service

    User->>API: POST /api/integrations/calendar/events<br/>{summary, start, end}
    API->>API: Authenticate User<br/>(get_current_user)

    API->>CalDAV: create_event()

    CalDAV->>CalDAV: Build iCalendar<br/>(vobject VEVENT)
    CalDAV->>NC: CalDAV PUT<br/>/remote.php/dav/calendars/{user}/default/{uid}.ics
    NC-->>CalDAV: 201 Created

    CalDAV-->>API: Event UID

    API->>Audit: Log Event Creation
    Audit-->>API: Logged

    API-->>User: Success<br/>{event_uid}
```

### File Auto-Indexing from Nextcloud

```mermaid
sequenceDiagram
    participant Admin
    participant API as Integration API
    participant FileIdx as File<br/>Indexer
    participant NC as Nextcloud<br/>WebDAV
    participant KBIdx as KB<br/>Indexer
    participant Qdrant as Qdrant

    Admin->>API: POST /api/integrations/files/scan-and-index<br/>{source_type: "guideline"}
    API->>API: Check RBAC<br/>(get_current_admin_user)

    API->>FileIdx: scan_and_index_directory()

    FileIdx->>NC: WebDAV PROPFIND<br/>/remote.php/dav/files/{user}/Documents
    NC-->>FileIdx: File List<br/>[(file1.pdf, file2.txt, ...)]

    loop For Each File
        FileIdx->>FileIdx: Check Already Indexed?<br/>(indexed_files set)

        alt Not Indexed
            FileIdx->>NC: WebDAV GET<br/>Download file
            NC-->>FileIdx: File Bytes

            FileIdx->>KBIdx: index_document()
            KBIdx->>Qdrant: Store Vectors
            Qdrant-->>KBIdx: Success
            KBIdx-->>FileIdx: IndexingResult

            FileIdx->>FileIdx: Add to indexed_files
        else Already Indexed
            FileIdx->>FileIdx: Skip
        end
    end

    FileIdx-->>API: ScanResult<br/>{discovered: 10, indexed: 7, skipped: 3}
    API-->>Admin: Success Response
```

---

## Related Documentation

- [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - Comprehensive architecture doc
- [SERVICE_CATALOG.md](../SERVICE_CATALOG.md) - Service descriptions
- [DATA_MODEL.md](../DATA_MODEL.md) - Data entities

---

**Last Updated**: 2025-11-20
**Diagram Format**: Mermaid (render with Mermaid.js or GitHub/GitLab)
**Review Cycle**: Updated with major architecture changes
