# VoiceAssist V2 - Backend Architecture

**Last Updated**: 2025-11-20 (Phase 2 Enhancements)
**Status**: Canonical Reference
**Purpose**: Clarify backend structure evolution from monorepo to microservices

---

## Overview

VoiceAssist V2 backend follows a **progressive architecture strategy**:
- **Phases 0-10**: Monorepo structure with clear module boundaries (Docker Compose)
- **Phases 11-14**: Optional split into microservices (Kubernetes)

This document explains both approaches and when to use each.

---

## Table of Contents

1. [Development Evolution](#development-evolution)
2. [Monorepo Structure (Phases 0-10)](#monorepo-structure-phases-0-10)
3. [Microservices Structure (Phases 11-14)](#microservices-structure-phases-11-14)
4. [When to Split](#when-to-split)
5. [Service Boundaries](#service-boundaries)
6. [Migration Path](#migration-path)

---

### Repository Layout for Backend

During Phases 0–1 the backend code lives in two related locations:

- `services/api-gateway/app/` – The **running API Gateway** used by Docker Compose.
  This service hosts the health endpoints, database connectivity, and core infrastructure
  needed to validate Phase 0–1 (PostgreSQL, Redis, Qdrant, metrics, logging, etc.).
- `server/app/` – The **logical monorepo** used for higher-level service designs:
  QueryOrchestrator, LLMClient, tool execution engine, and other components defined in
  ORCHESTRATION_DESIGN.md, TOOLS_AND_INTEGRATIONS.md, and DATA_MODEL.md.

In early phases, `services/api-gateway` is responsible for infrastructure concerns and
basic APIs, while `server/` hosts the emerging monorepo structure that later phases
will build out. The SERVICE_CATALOG and .ai/index.json document how these pieces map
to logical services.

## Development Evolution

### Phase-Based Approach

```
Phases 0-10: Monorepo + Docker Compose
    ├─ Single FastAPI application
    ├─ Clear module boundaries
    ├─ Faster development iteration
    └─ Production-ready for < 50 concurrent users

Phases 11-14: Microservices + Kubernetes (Optional)
    ├─ Extract modules to separate services
    ├─ Independent scaling
    ├─ Suitable for > 50 concurrent users
    └─ K8s orchestration
```

### Why Start with Monorepo?

**Advantages**:
- **Faster Development**: Single codebase, shared models, easier refactoring
- **Simpler Debugging**: All code in one place, unified logging
- **Lower Complexity**: No distributed tracing, service mesh, or K8s initially
- **Easier Testing**: Integration tests within single app
- **Shared Dependencies**: Common libraries, models, utilities

**When It's Sufficient**:
- Development and testing phases
- Deployment to single server
- < 50 concurrent users
- Team size < 5 developers

---

## Monorepo Structure (Phases 0-10)

### Directory Layout

```
server/
├── app/
│   ├── main.py                 # FastAPI application entry point
│   ├── api/                    # API routes (FastAPI routers)
│   │   ├── __init__.py
│   │   ├── auth.py             # Authentication endpoints
│   │   ├── chat.py             # Chat/conversation endpoints
│   │   ├── search.py           # Knowledge base search endpoints
│   │   ├── admin.py            # Admin panel endpoints
│   │   ├── voice.py            # Voice/WebSocket endpoints
│   │   ├── documents.py        # Document upload/management
│   │   └── users.py            # User management
│   │
│   ├── services/               # Business logic (service layer)
│   │   ├── __init__.py
│   │   ├── rag_service.py      # RAG pipeline orchestration
│   │   ├── phi_detector.py     # PHI detection logic
│   │   ├── voice_service.py    # Voice transcription/TTS
│   │   ├── kb_indexer.py       # Knowledge base indexing
│   │   ├── ai_router.py        # Local vs cloud AI routing
│   │   ├── search_service.py   # Vector search
│   │   ├── external_apis/      # External API integrations
│   │   │   ├── uptodate.py
│   │   │   ├── pubmed.py
│   │   │   └── nextcloud.py
│   │   └── audit_logger.py     # Audit logging service
│   │
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py             # Base model class
│   │   ├── user.py             # User model
│   │   ├── session.py          # Session/Conversation model
│   │   ├── message.py          # ChatMessage model
│   │   ├── document.py         # KnowledgeDocument model
│   │   ├── chunk.py            # KBChunk model
│   │   ├── settings.py         # UserSettings, SystemSettings models
│   │   └── audit.py            # AuditLogEntry model
│   │
│   ├── schemas/                # Pydantic schemas (from DATA_MODEL.md)
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── session.py
│   │   ├── message.py
│   │   ├── document.py
│   │   ├── citation.py
│   │   └── settings.py
│   │
│   ├── core/                   # Core configuration and utilities
│   │   ├── __init__.py
│   │   ├── config.py           # Settings (Pydantic Settings)
│   │   ├── database.py         # Database session management
│   │   ├── vector_db.py        # Qdrant client
│   │   ├── redis_client.py     # Redis client
│   │   ├── security.py         # JWT, password hashing
│   │   ├── dependencies.py     # FastAPI dependencies
│   │   └── middleware.py       # Custom middleware
│   │
│   ├── utils/                  # Utility functions
│   │   ├── __init__.py
│   │   ├── chunking.py         # Text chunking utilities
│   │   ├── pdf_parser.py       # PDF parsing
│   │   ├── embeddings.py       # Embedding generation
│   │   └── validators.py       # Custom validators
│   │
│   └── tasks/                  # Background tasks (Celery)
│       ├── __init__.py
│       ├── indexing.py         # Document indexing tasks
│       └── cleanup.py          # Maintenance tasks
│
├── tests/                      # Test suite
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests
│
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
│
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Docker image definition
├── docker-compose.yml          # Local development setup
├── .env.example                # Environment variables template
└── README.md                   # Backend documentation
```

### FastAPI Application Structure

**`app/main.py`**:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.middleware import setup_middleware
from app.api import auth, chat, search, admin, voice, documents, users

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Setup middleware
setup_middleware(app)

# Include routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["chat"])
app.include_router(search.router, prefix=f"{settings.API_V1_STR}/search", tags=["search"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(voice.router, prefix=f"{settings.API_V1_STR}/voice", tags=["voice"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["documents"])
app.include_router(users.router, prefix=f"{settings.API_V1_STR}/users", tags=["users"])

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
```

### Service Layer Pattern

Each "service" is a Python module with clear responsibilities:

**`app/services/rag_service.py`**:
```python
from typing import List, Dict
from app.services.search_service import SearchService
from app.services.ai_router import AIRouter
from app.services.phi_detector import PHIDetector
from app.schemas.message import ChatMessage
from app.schemas.citation import Citation

class RAGService:
    """Orchestrates RAG pipeline"""

    def __init__(self):
        self.search = SearchService()
        self.ai_router = AIRouter()
        self.phi_detector = PHIDetector()

    async def process_query(
        self,
        query: str,
        session_id: str,
        clinical_context: Optional[Dict] = None
    ) -> Dict:
        """
        Process user query through RAG pipeline:
        1. Detect PHI
        2. Search knowledge base
        3. Route to appropriate AI model
        4. Generate response with citations
        """
        # 1. PHI Detection
        phi_result = await self.phi_detector.detect(query)

        # 2. Search KB
        search_results = await self.search.search(
            query=query,
            filters={"specialty": clinical_context.get("specialty")}
        )

        # 3. Route to AI model
        model = self.ai_router.select_model(phi_detected=phi_result.has_phi)

        # 4. Generate response
        response = await model.generate(
            query=query,
            context=search_results,
            clinical_context=clinical_context
        )

        return {
            "content": response.text,
            "citations": response.citations,
            "model_used": model.name,
            "phi_detected": phi_result.has_phi
        }
```

### Module Boundaries

Even in monorepo, maintain strict boundaries:

| Module | Responsibility | Can Import From | Cannot Import From |
|--------|----------------|-----------------|-------------------|
| `api/` | HTTP endpoints, request/response | `services/`, `schemas/`, `core/` | `models/` directly |
| `services/` | Business logic | `models/`, `schemas/`, `core/`, other `services/` | `api/` |
| `models/` | Database ORM | `core/` | `api/`, `services/` |
| `schemas/` | Pydantic models | Nothing (pure data) | Everything |
| `core/` | Config, database, security | Nothing (foundational) | `api/`, `services/`, `models/` |

### Docker Compose Setup

**`docker-compose.yml`**:
```yaml
version: '3.8'

services:
  # Backend API (monorepo)
  backend:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/voiceassist
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - postgres
      - redis
      - qdrant
    volumes:
      - ./server:/app
      - ./data/uploads:/app/data/uploads

  # PostgreSQL
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=voiceassist
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=voiceassist
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Redis
  redis:
    image: redis:7
    volumes:
      - redis_data:/data

  # Qdrant Vector DB
  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  # Nextcloud (Phase 2+)
  nextcloud:
    image: nextcloud:29-apache
    ports:
      - "8080:80"
    environment:
      - POSTGRES_HOST=nextcloud-db
      - NEXTCLOUD_ADMIN_USER=${NEXTCLOUD_ADMIN_USER}
      - NEXTCLOUD_ADMIN_PASSWORD=${NEXTCLOUD_ADMIN_PASSWORD}
    depends_on:
      - nextcloud-db
    volumes:
      - nextcloud_data:/var/www/html

  # Nextcloud Database (Phase 2+)
  nextcloud-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=${NEXTCLOUD_DB_PASSWORD}
    volumes:
      - nextcloud_db_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  redis_data:
  qdrant_data:
  nextcloud_data:
  nextcloud_db_data:
```

---

## Microservices Structure (Phases 11-14)

### When to Split

**Trigger Conditions**:
- Deployment to Kubernetes cluster
- Need for independent scaling (e.g., voice service needs more resources)
- Team growth (> 5 developers, need ownership boundaries)
- Different deployment cycles (e.g., ML model updates vs API changes)
- Regulatory requirements (e.g., PHI handling in separate service)

### Service Decomposition

Extract modules from monorepo into separate services:

```
services/
├── api-gateway/            # Kong or Nginx (routing, rate limiting)
│   ├── kong.yml
│   └── Dockerfile
│
├── auth-service/           # Authentication (from app/api/auth.py + app/services/auth)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
├── chat-service/           # Chat/conversations (from app/api/chat.py + app/services/rag_service.py)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
├── knowledge-base-service/ # KB management (from app/api/documents.py + app/services/kb_indexer.py)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
├── voice-service/          # Voice/WebSocket (from app/api/voice.py + app/services/voice_service.py)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
├── search-service/         # Vector search (from app/services/search_service.py)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
├── admin-service/          # Admin panel API (from app/api/admin.py)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   └── services/
│   ├── Dockerfile
│   └── requirements.txt
│
└── shared/                 # Shared libraries
    ├── models/             # Shared SQLAlchemy models
    ├── schemas/            # Shared Pydantic schemas (from DATA_MODEL.md)
    └── utils/              # Shared utilities
```

### Service Communication

**Synchronous (HTTP/REST)**:
- API Gateway → Services: REST API calls
- Service → Service: HTTP with service discovery (K8s DNS)

**Asynchronous (Message Queue)**:
- Document indexing: Publish to RabbitMQ/Redis queue
- Audit logging: Async events to audit service

**Shared Data**:
- PostgreSQL: Shared database (schema per service if needed)
- Redis: Shared cache
- Qdrant: Shared vector DB

### Kubernetes Deployment

**Example: Chat Service**

**`k8s/chat-service.yaml`**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-service
  template:
    metadata:
      labels:
        app: chat-service
    spec:
      containers:
      - name: chat-service
        image: voiceassist/chat-service:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: REDIS_URL
          value: redis://redis-service:6379
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: chat-service
spec:
  selector:
    app: chat-service
  ports:
  - port: 80
    targetPort: 8000
  type: ClusterIP
```

---

## When to Split

### Decision Matrix

| Factor | Monorepo | Microservices |
|--------|----------|---------------|
| **Team Size** | < 5 developers | > 5 developers |
| **Concurrent Users** | < 50 users | > 50 users |
| **Deployment** | Single server | Multi-node K8s cluster |
| **Scaling Needs** | Vertical scaling OK | Need horizontal scaling |
| **Development Speed** | Faster (single codebase) | Slower (coordination overhead) |
| **Operational Complexity** | Low (Docker Compose) | High (K8s, service mesh) |
| **Cost** | Lower (single server) | Higher (multiple servers) |
| **Regulatory** | OK for small clinics | Required for large hospitals |

### Recommended Path

1. **Phases 0-10**: Start with monorepo + Docker Compose
2. **Phase 10 End**: Evaluate scaling needs
3. **If < 50 users**: Stay with monorepo, deploy to single Ubuntu server
4. **If > 50 users**: Proceed to Phases 11-14, split into microservices + K8s

---

## Service Boundaries

### Logical Services (Monorepo Modules)

These are the logical boundaries, whether in monorepo or microservices:

1. **Authentication Service** (`app/api/auth.py` + `app/core/security.py`)
   - User registration with email validation
   - User login/logout with JWT tokens
   - JWT token management:
     - Access tokens (15-minute expiry, HS256 algorithm)
     - Refresh tokens (7-day expiry)
     - Token verification and validation
     - **Token revocation via Redis** (`app/services/token_revocation.py`):
       - Dual-level revocation (individual tokens + all user tokens)
       - Fail-open design for Redis unavailability
       - Automatic TTL management
       - Immediate session invalidation on logout
   - Password hashing using bcrypt (via passlib)
   - **Advanced password validation** (`app/core/password_validator.py`):
     - Multi-criteria validation (uppercase, lowercase, digits, special chars)
     - Password strength scoring (0-100)
     - Common password rejection
     - Sequential and repeated character detection
   - Rate limiting on authentication endpoints:
     - Registration: 5 requests/hour per IP
     - Login: 10 requests/minute per IP
     - Token refresh: 20 requests/minute per IP
   - Authentication middleware (`get_current_user`, `get_current_admin_user`)
   - Protected endpoints with JWT dependency injection
   - **Comprehensive audit logging** for all authentication events (see Audit Service below)

2. **Chat Service** (`app/api/chat.py` + `app/services/rag_service.py`)
   - Conversation management
   - Message processing
   - RAG pipeline orchestration
   - Response generation

3. **Knowledge Base Service** (`app/api/documents.py` + `app/services/kb_indexer.py`)
   - Document upload
   - Document processing
   - Indexing jobs
   - KB management

4. **Search Service** (`app/services/search_service.py`)
   - Vector search
   - Semantic search
   - Hybrid search (vector + keyword)
   - Result reranking

5. **Voice Service** (`app/api/voice.py` + `app/services/voice_service.py`)
   - WebSocket connections
   - Audio transcription
   - Text-to-speech
   - Voice mode management

6. **Admin Service** (`app/api/admin.py`)
   - User management
   - System settings
   - Analytics dashboard
   - Audit log access

7. **PHI Detection Service** (`app/services/phi_detector.py`)
   - PHI detection
   - AI model routing
   - Local vs cloud decision

8. **External APIs Service** (`app/services/external_apis/`)
   - **Nextcloud Integration** (`app/services/nextcloud.py`):
     - OCS API client for user provisioning
     - User creation and management via REST API
     - Health check for Nextcloud connectivity
     - Authentication with admin credentials
     - WebDAV integration (future phase)
   - PubMed integration (future phase)
   - UpToDate integration (future phase)
   - External search aggregation (future phase)

9. **Audit Service** (`app/services/audit_service.py` + `app/models/audit_log.py`)
   - **HIPAA-compliant audit logging**:
     - Immutable audit trail with SHA-256 integrity verification
     - Comprehensive metadata capture (user, action, resource, timestamp)
     - Request context tracking (IP address, user agent, request ID)
     - Service context (service name, endpoint, status)
     - Success/failure tracking with error details
     - JSON metadata for additional context
   - **Automated logging for authentication events**:
     - User registration, login, logout
     - Token refresh, token revocation
     - Password changes, failed authentication attempts
   - **Query capabilities**:
     - Retrieve audit logs by user, action, timerange
     - Integrity verification for tamper detection
     - Composite indexes for efficient queries
   - **Database table**: `audit_logs` (PostgreSQL with JSONB support)

### Core Infrastructure

**Request ID Middleware** (`app/core/request_id.py`):
- Generates unique UUID v4 for each request
- Accepts client-provided request IDs via `X-Request-ID` header
- Returns request ID in response header for correlation
- Enables distributed tracing across services
- Stored in `request.state.request_id` for access in route handlers

**API Envelope Standardization** (`app/core/api_envelope.py`):
- **Consistent response format** for all endpoints:
  ```json
  {
    "success": true/false,
    "data": {...} | null,
    "error": {code, message, details, field} | null,
    "metadata": {version, request_id, pagination},
    "timestamp": "2024-11-20T12:00:00Z"
  }
  ```
- **Standard error codes** (`ErrorCodes` class):
  - INVALID_CREDENTIALS, TOKEN_EXPIRED, TOKEN_REVOKED
  - WEAK_PASSWORD, VALIDATION_ERROR, NOT_FOUND
  - UNAUTHORIZED, FORBIDDEN, INTERNAL_ERROR
- **Helper functions**:
  - `success_response(data, request_id, version, pagination)`
  - `error_response(code, message, details, field, request_id)`
- **Pagination support** via `PaginationMetadata` model
- **Benefits**:
  - Simplified client-side error handling
  - Consistent API experience across all endpoints
  - Built-in request correlation for debugging

### API Contracts

Each service exposes REST API endpoints documented in OpenAPI/Swagger.

**Example: Search Service API**

```
POST /api/v1/search
  Request:
    {
      "query": "treatment for hypertension",
      "filters": {"specialty": "cardiology"},
      "limit": 10
    }
  Response:
    {
      "results": [
        {
          "document_id": "uuid",
          "title": "Harrison's Principles - Chapter 252",
          "snippet": "...",
          "relevance_score": 0.95
        }
      ]
    }
```

---

## Migration Path

### Step-by-Step Migration (Monorepo → Microservices)

**Phase 11: Prepare for Split**

1. **Ensure Clean Boundaries**: Verify modules don't have circular dependencies
2. **Extract Shared Code**: Move shared models/schemas to `shared/` library
3. **Create Service Interfaces**: Define API contracts for each service
4. **Add Service Tests**: Test each module independently

**Phase 12: Split Services**

1. **Start with Independent Services**: Extract services with fewest dependencies first
   - Search Service (only depends on Qdrant)
   - PHI Detection Service (self-contained)

2. **Extract Core Services**: Move API-facing services next
   - Auth Service
   - Chat Service
   - Admin Service

3. **Last: Shared Services**: Extract services used by others
   - Knowledge Base Service
   - External APIs Service

**Phase 13: Deploy to Kubernetes**

1. **Create Dockerfiles**: One per service
2. **Create K8s Manifests**: Deployments, Services, ConfigMaps, Secrets
3. **Set Up Service Mesh** (optional): Istio or Linkerd for mTLS, observability
4. **Deploy to Dev Cluster**: Test inter-service communication
5. **Deploy to Prod**: Gradual rollout with monitoring

### Shared Library Pattern

**`shared/` Package**:
```python
# shared/models/user.py
from sqlalchemy import Column, String, Boolean
from shared.models.base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True)
    # ... (same across all services)
```

Install shared library in each service:
```bash
pip install -e /path/to/shared
```

Or publish to private PyPI:
```bash
pip install voiceassist-shared==1.0.0
```

---

## References

- [DATA_MODEL.md](DATA_MODEL.md) - Canonical data entities
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) - Complete service descriptions
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture overview
- [DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md) - Phase-by-phase plan
- [COMPOSE_TO_K8S_MIGRATION.md](COMPOSE_TO_K8S_MIGRATION.md) - K8s migration guide
- [server/README.md](../server/README.md) - Backend implementation guide
