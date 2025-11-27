---
title: "Service Catalog"
slug: "service-catalog"
summary: "**Last Updated**: 2025-11-21 (Phase 6: Nextcloud App Integration & Unified Services)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["service", "catalog"]
---

# VoiceAssist V2 Service Catalog

**Last Updated**: 2025-11-21 (Phase 6: Nextcloud App Integration & Unified Services)
**Status**: Canonical Reference
**Purpose**: Comprehensive catalog of all backend services with implementation details

---

## Overview

This document catalogs all backend services in VoiceAssist V2. These are **logical services** - clear boundaries for code organization and responsibility.

### Important Notes

1. **Logical Services**: These represent service boundaries for code organization, not necessarily separate containers
2. **Phases 0-10 (Monorepo)**: All services run in single FastAPI app (`server/`) as routers/modules
3. **Phases 11-14 (Microservices)**: Services can be extracted to separate containers if scaling requires
4. **Service Boundaries**: Enforced through clear module structure even in monorepo
5. **Independent Development**: Each service has its own tests, can be developed independently

### Implementation Strategy

### Implementation Note: API Gateway Location (Phases 0–1)

For Phases 0–1, the API Gateway implementation used by Docker Compose
lives under:

- `services/api-gateway/app/` – containerized FastAPI application
  built as `voiceassist-server` in `docker-compose.yml`.

The `server/app/` directory hosts the logical monorepo design for
future phases; many service modules there are stubs awaiting
implementation and integration as the system evolves.

**Phases 0-10: Monorepo (Docker Compose Development)**

- All services live in `server/` directory
- Single FastAPI application with multiple routers
- Services are **logical boundaries** enforced through module structure
- Runs in single container for rapid development
- See [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) for structure

**Phases 11-14: Microservices (Kubernetes Migration)**

- Services can be extracted to separate containers
- Each service becomes independent deployment
- Communication via HTTP/gRPC through service mesh
- Only split services that need independent scaling

**Related Documentation:**

- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - Overall system architecture
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Monorepo to microservices evolution
- [DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md) - Implementation roadmap
- [server/README.md](../server/README.md) - Backend API details
- [DATA_MODEL.md](DATA_MODEL.md) - Canonical data entities

---

## Table of Contents

1. [API Gateway](#1-api-gateway)
2. [Voice Proxy Service](#2-voice-proxy-service)
3. [Medical Knowledge Base / RAG Service](#3-medical-knowledge-base--rag-service)
4. [Admin API / Config Service](#4-admin-api--config-service)
5. [Auth Service](#5-auth-service)
6. [File Indexer / Document Ingestion](#6-file-indexer--document-ingestion)
7. [Calendar/Email Integration Service](#7-calendaremail-integration-service)
8. [PHI Detection / Classifier](#8-phi-detection--classifier)
9. [Guideline Scraper](#9-guideline-scraper)
10. [Medical Calculator Service](#10-medical-calculator-service)

---

## 1. API Gateway

**Service ID**: `api-gateway`

**Implementation**:

- **Phases 0-10 (Monorepo)**: Not needed - single FastAPI app (`server/app/main.py`) handles all routing
- **Phases 11-14 (Microservices)**: Extract to Kong or Nginx as separate container

**Purpose**: The API Gateway serves as the single entry point for all external requests to the VoiceAssist system. It handles routing, rate limiting, authentication verification, request/response transformation, and provides a unified API surface for frontend clients. Built with Kong or Nginx, it acts as a reverse proxy that shields internal microservices from direct exposure while providing cross-cutting concerns like logging, monitoring, and security enforcement.

**Language/Runtime**:

- Phases 0-10: N/A (FastAPI handles routing)
- Phases 11-14: Kong Gateway (Lua/Nginx) or Nginx with OpenResty

**Main Ports**:

- Dev (Phases 0-10): 8000/HTTP (shared with main FastAPI app)
- Prod (Phases 11-14): 8000/HTTP, 8443/HTTPS - External-facing gateway

**Dependencies**:

- Phases 0-10: None (part of core app)
- Phases 11-14: PostgreSQL (Kong config), Redis (rate limiting), all downstream services

**Key Endpoints**:

- `GET /health` - Gateway health check
- `GET /ready` - Readiness probe (checks dependencies)
- `GET /metrics` - Prometheus metrics
- `POST /api/auth/*` - Authentication routes
- `WS /api/realtime/ws` - Realtime WebSocket communication (Phase 4)
- `POST /api/users/*` - User management endpoints
- `POST /api/medical/search` - Medical search (proxied to Medical KB)
- `POST /api/admin/*` - Admin operations (proxied to Admin API)
- `GET /metrics` - Prometheus metrics endpoint

**Configuration**:

```yaml
# Kong declarative config example
services:
  - name: voice-proxy
    url: http://voice-proxy:8001
    routes:
      - name: chat-ws
        paths: ["/api/chat/ws"]
        protocols: ["ws", "wss"]
  - name: medical-kb
    url: http://medical-kb:8002
    routes:
      - name: medical-search
        paths: ["/api/medical"]
plugins:
  - name: rate-limiting
    config:
      minute: 60
      hour: 1000
```

---

## 2. Voice Proxy Service / Realtime Communication

**Service ID**: `voice-proxy` (future) / `realtime-api` (Phase 4)

**Status**:

- **Phase 4 (Current)**: Implemented as part of API Gateway at `/api/realtime/ws`
- **Future Phases**: Will be extracted to separate service when voice features are added

**Purpose**: Manages real-time bidirectional communication between clients and the AI backend. Currently provides WebSocket-based text streaming chat with QueryOrchestrator integration. Future phases will add voice processing, OpenAI Realtime API integration, VAD, echo cancellation, and full voice assistant capabilities.

**Language/Runtime**: Python 3.11 with FastAPI and WebSockets

**Implementation (Phase 4)**:

- Location: `services/api-gateway/app/api/realtime.py`
- Integrated with QueryOrchestrator for query processing
- Supports text-based streaming responses
- Message protocol: message_start → message_chunk\* → message_complete

**Main Ports**:

- 8000/WebSocket - Realtime communication endpoint (shared with API Gateway in Phase 4)

**Dependencies**:

- QueryOrchestrator (query processing)
- LLMClient (language model interface)
- PostgreSQL (future: conversation persistence)
- Redis (future: session state)

**Key Endpoints (Phase 4)**:

- `WS /api/realtime/ws` - WebSocket connection for realtime text chat
  - Accepts: text messages with optional session_id and clinical_context_id
  - Returns: Streaming responses with citations
  - Supports: ping/pong keepalive

**Phase 4 Message Protocol**:

```json
// Client → Server
{
  "type": "message",
  "content": "User query text",
  "session_id": "optional-uuid",
  "clinical_context_id": "optional-uuid"
}
{
  "type": "ping"
}

// Server → Client
{
  "type": "connected",
  "client_id": "uuid",
  "protocol_version": "1.0",
  "capabilities": ["text_streaming"]
}
{
  "type": "message_start",
  "message_id": "uuid",
  "timestamp": "ISO-8601"
}
{
  "type": "message_chunk",
  "message_id": "uuid",
  "content": "partial text...",
  "chunk_index": 0
}
{
  "type": "message_complete",
  "message_id": "uuid",
  "content": "full response text",
  "citations": [{"id": "...", "source_type": "...", "title": "...", "url": "..."}],
  "timestamp": "ISO-8601"
}
{
  "type": "pong",
  "timestamp": "ISO-8601"
}
{
  "type": "error",
  "error": {"code": "ERROR_CODE", "message": "..."}
}
```

**Future Endpoints** (Phases 5+):

- Voice streaming (audio_chunk, VAD events)
- Session management (session.start, session.end)
- Turn-taking (interrupt, resume)
- OpenAI Realtime API integration

---

## 3. Medical Knowledge Base / RAG Service

**Service ID**: `medical-kb` or `kb-service`

**Status**: ✅ **Phase 5 MVP Implemented** (Document ingestion, semantic search, RAG-enhanced queries)

**Implementation**:

- **Phases 0-10 (Monorepo)**:
  - Admin KB API Router: `services/api-gateway/app/api/admin_kb.py`
  - RAG pipeline: `services/api-gateway/app/services/rag_service.py` (QueryOrchestrator)
  - Document ingestion: `services/api-gateway/app/services/kb_indexer.py` (KBIndexer)
  - Semantic search: `services/api-gateway/app/services/search_aggregator.py` (SearchAggregator)
  - LLM interface: `services/api-gateway/app/services/llm_client.py` (LLMClient)
- **Phases 11-14 (Microservices)**: Extract to `services/kb-service/`

**Purpose**: The Medical Knowledge Base (KB) Service implements a sophisticated Retrieval-Augmented Generation (RAG) system for medical information. It performs semantic search across indexed medical literature (textbooks, journals, guidelines), generates context-aware responses using retrieved knowledge, integrates with external medical APIs (PubMed, UpToDate), manages document embeddings in Qdrant vector database, and orchestrates multi-hop reasoning for complex medical queries. This service ensures evidence-based responses with proper citations.

**Core Component: Query Orchestrator/Conductor**
The orchestrator (`app/services/ai/orchestrator.py` or `app/services/rag_service.py`) is the heart of this service:

- Coordinates query processing from user input to final response
- Handles PHI detection and routing (local vs cloud LLM)
- Selects and searches multiple knowledge sources
- Reranks and merges results
- Generates responses with citations
- See [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) for complete design

**Language/Runtime**: Python 3.11 with FastAPI, LangChain, and Qdrant

**Main Ports**:

- Dev (Phases 0-10): 8000/HTTP (shared with main FastAPI app)
- Prod (Phases 11-14): 8002/HTTP - Internal service mesh

**Dependencies**:

- Qdrant (vector database for embeddings)
- PostgreSQL (tables: `knowledge_documents`, `kb_chunks`, `chat_messages`, `sessions`, `clinical_contexts`)
- Redis (search result caching, query cache)
- PHI Detection Service (internal call for privacy classification)
- External APIs Service (PubMed, UpToDate integration)
- LLM Service (OpenAI API or local Ollama)

**Key Endpoints**:

**Phase 5 Admin KB Endpoints** (implemented):

- `POST /api/admin/kb/documents` - Upload and index document (text or PDF)
  - Accepts: multipart/form-data with file, title, source_type, metadata
  - Returns: Document ID, chunks indexed, processing time
- `GET /api/admin/kb/documents` - List indexed documents with pagination
  - Query params: skip, limit, source_type (optional filter)
  - Returns: Paginated list of documents with metadata
- `DELETE /api/admin/kb/documents/{document_id}` - Delete document and all chunks
  - Returns: Deletion confirmation
- `GET /api/admin/kb/documents/{document_id}` - Get document details
  - Returns: Document metadata and indexing information

**Future Endpoints** (Phases 6+):

- `POST /api/medical/search` - Semantic search medical knowledge base
- `POST /api/medical/rag/query` - RAG query with context generation
- `POST /api/medical/journal/search` - Search PubMed journals
- `POST /api/medical/journal/download` - Download journal PDF
- `GET /api/medical/textbook/{id}/section/{section}` - Get textbook section
- `POST /api/medical/calculator` - Execute medical calculator
- `GET /api/medical/sources` - List available knowledge sources

**Data Model Entities** (reference [DATA_MODEL.md](DATA_MODEL.md)):

- KnowledgeDocument
- KBChunk
- ChatMessage
- Session
- ClinicalContext
- Citation

**RAG Pipeline (Phase 5 Implementation)**:

```
User Query → QueryOrchestrator →
  → SearchAggregator:
    - Generate query embedding (OpenAI text-embedding-3-small)
    - Semantic search in Qdrant (top_k=5, score_threshold=0.7)
    - Format context with sources
  → LLMClient:
    - Assemble prompt with retrieved context
    - PHI routing (cloud vs local model)
    - Generate response
  → Citation extraction
  → QueryResponse with answer + citations
```

**Phase 5 Implementation Details**:

- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Vector DB**: Qdrant with cosine similarity search
- **Chunking**: Fixed-size (500 chars) with overlap (50 chars)
- **Document Types**: Text (.txt) and PDF (.pdf) support
- **Search Configuration**: Configurable top-K and score threshold
- **Citation Tracking**: Automatic extraction of source documents from search results

**Related Documentation**:

- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - Complete orchestrator/conductor design
- [SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md) - Search implementation details
- [MEDICAL_FEATURES.md](MEDICAL_FEATURES.md) - RAG features
- [DATA_MODEL.md](DATA_MODEL.md) - Entity definitions

**Implementation Status**:

- Phases 0-10: Core component in monorepo, central to all queries
- Phases 11-14: Critical service, may need independent scaling for high query load

---

## 4. Admin API / Config Service

**Service ID**: `admin-api`

**Purpose**: The Admin API Service provides comprehensive system management capabilities for administrators. It exposes endpoints for knowledge base management (upload, reindex, delete documents), user administration (create, update, disable users), system configuration (AI model settings, security policies), analytics and reporting (usage metrics, cost tracking), health monitoring and diagnostics, and audit log access. This service powers the Admin Panel UI and requires elevated permissions.

**Language/Runtime**: Python 3.11 with FastAPI

**Main Ports**:

- 8003/HTTP - REST API for admin operations

**Dependencies**:

- PostgreSQL (all administrative data)
- Redis (cache management operations)
- Qdrant (vector DB stats and management)
- All microservices (health checks, restarts)
- File Indexer Service (trigger indexing jobs)

**Key Endpoints**:

- `GET /api/admin/dashboard` - Dashboard metrics and stats
- `GET /api/admin/services/status` - Service health checks
- `POST /api/admin/services/{service}/restart` - Restart service
- `POST /api/admin/knowledge/upload` - Upload document to KB
- `GET /api/admin/knowledge/documents` - List KB documents
- `POST /api/admin/knowledge/reindex` - Trigger reindexing
- `GET /api/admin/knowledge/jobs` - List indexing jobs
- `GET /api/admin/knowledge/stats` - Vector DB statistics
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/{id}` - Update user
- `GET /api/admin/analytics/usage` - Usage analytics
- `GET /api/admin/analytics/costs` - Cost tracking
- `GET /api/admin/audit/logs` - Audit log entries

**Admin Security**:

- Requires `admin` role in JWT
- All actions logged to audit trail
- MFA required for sensitive operations

---

## 5. Auth Service

**Service ID**: `auth-service`

**Purpose**: The Auth Service manages all authentication and authorization for the VoiceAssist system. It integrates with Nextcloud for Single Sign-On (SSO) via OIDC/OAuth2, issues and validates short-lived JWT tokens, implements multi-factor authentication (MFA) with TOTP, enforces role-based access control (RBAC), manages user sessions and token refresh, and provides secure password handling and reset workflows. This service is the security cornerstone of the entire platform.

**Phase 2 Status**: ✅ **JWT Authentication Implemented with Enhancements**

**Language/Runtime**: Python 3.11 with FastAPI and python-jose (JWT)

**Main Ports**:

- 8004/HTTP - REST API for authentication

**Dependencies**:

- PostgreSQL (user accounts, sessions, MFA secrets, audit logs)
- Redis (token revocation blacklist, session cache, rate limiting)
- External: Nextcloud OIDC provider (SSO - Phase 6+), SMTP server (password reset emails - Phase 3+)

**Phase 2 Implementation Details**:

- **JWT Tokens**: Access (15-min), Refresh (7-day), HS256 algorithm
- **Password Security** (`app/core/password_validator.py`):
  - Multi-criteria validation (min 8 chars, uppercase, lowercase, digits, special chars)
  - Common password rejection (password, 123456, qwerty, etc.)
  - Sequential/repeated character detection
  - Strength scoring (0-100): Weak/Medium/Strong classification
- **Token Revocation** (`app/services/token_revocation.py`):
  - Redis-based blacklisting with dual-level revocation
  - Individual token and all-user-tokens revocation
  - Fail-open design for Redis unavailability
  - Automatic TTL management
- **Audit Logging** (`app/services/audit_service.py`):
  - All authentication events logged automatically
  - SHA-256 integrity verification for immutable audit trail
  - Comprehensive metadata (IP, user agent, request ID, timestamp)
  - JSONB fields for extensible context
- **Request Tracking** (`app/core/request_id.py`):
  - UUID v4 generation for each request
  - X-Request-ID header for correlation
  - Distributed tracing support
- **API Envelope** (`app/core/api_envelope.py`):
  - Standardized response format for all endpoints
  - Error codes: INVALID_CREDENTIALS, TOKEN_EXPIRED, TOKEN_REVOKED, WEAK_PASSWORD
  - Request ID correlation in metadata

**Key Endpoints**:

- `POST /api/auth/login` - Username/password login (✅ Phase 2)
- `POST /api/auth/logout` - Invalidate session and tokens (✅ Phase 2)
- `POST /api/auth/refresh` - Refresh JWT access token (✅ Phase 2)
- `POST /api/auth/register` - User registration with password validation (✅ Phase 2)
- `POST /api/auth/password/reset` - Request password reset (Phase 3+)
- `POST /api/auth/password/reset/confirm` - Confirm password reset (Phase 3+)
- `POST /api/auth/mfa/setup` - Initialize MFA setup (Phase 6+)
- `POST /api/auth/mfa/verify` - Verify MFA code (Phase 6+)
- `GET /api/auth/oidc/authorize` - OIDC authorization redirect (Phase 6+)
- `POST /api/auth/oidc/callback` - OIDC callback handler (Phase 6+)
- `GET /api/auth/me` - Get current user info (✅ Phase 2)
- `POST /api/auth/token/validate` - Validate JWT token (✅ Phase 2 - internal)

**JWT Claims (Phase 2)**:

```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "clinician|admin|researcher",
  "exp": 1234567890,
  "iat": 1234567890,
  "type": "access|refresh"
}
```

**Rate Limiting (Phase 2)**:

- Registration: 5 requests/hour per IP
- Login: 10 requests/minute per IP
- Token refresh: 20 requests/minute per IP

**Database Tables**:

- `users` - User accounts with hashed passwords
- `audit_logs` - Authentication event audit trail (Phase 2)

---

## 6. File Indexer / Document Ingestion

**Service ID**: `file-indexer`

**Purpose**: The File Indexer Service automates the ingestion and indexing of medical documents into the knowledge base. It monitors file uploads (local and Nextcloud), extracts text from PDFs and DOCX files using OCR when needed, performs intelligent document chunking optimized for medical content, generates embeddings using domain-specific models (BioGPT, PubMedBERT), stores vectors in Qdrant, manages metadata and document relationships, and handles background processing queues for large-scale indexing operations.

**Language/Runtime**: Python 3.11 with Celery for background tasks

**Main Ports**:

- 8005/HTTP - REST API for indexing management
- No external-facing ports (internal service)

**Dependencies**:

- PostgreSQL (document records, indexing jobs)
- Qdrant (vector storage)
- Redis (Celery task queue)
- PHI Detection Service (classify documents before indexing)
- External: Nextcloud WebDAV (file access), Tesseract OCR (text extraction)

**Key Endpoints**:

- `POST /api/indexer/ingest` - Queue document for ingestion
- `GET /api/indexer/jobs/{id}` - Get indexing job status
- `POST /api/indexer/reindex/{doc_id}` - Reindex existing document
- `DELETE /api/indexer/document/{id}` - Remove document from index
- `POST /api/indexer/nextcloud/sync` - Sync Nextcloud files
- `GET /api/indexer/stats` - Indexing statistics

**Processing Pipeline**:

```
Upload → File Validation → Text Extraction (PyPDF2/Tesseract) →
Chunking (Medical-aware) → PHI Detection →
Embedding Generation (BioGPT) → Vector Storage (Qdrant) →
Metadata Indexing (PostgreSQL) → Completion
```

**Supported File Types**:

- PDF (native text and scanned/OCR)
- DOCX (Microsoft Word)
- TXT (plain text)
- HTML (web guidelines)

---

## 7. Calendar/Email Integration Service

**Service ID**: `calendar-email-service`

**Status**: ✅ **Phase 6 MVP Implemented** (CalDAV calendar operations, WebDAV file auto-indexing, Email skeleton)

**Implementation**:

- **Phases 0-10 (Monorepo)**:
  - Integration API Router: `services/api-gateway/app/api/integrations.py`
  - CalDAV Service: `services/api-gateway/app/services/caldav_service.py`
  - File Indexer: `services/api-gateway/app/services/nextcloud_file_indexer.py`
  - Email Service: `services/api-gateway/app/services/email_service.py` (skeleton)
- **Phases 11-14 (Microservices)**: Extract to `services/integrations-service/`

**Purpose**: The Calendar/Email Integration Service provides unified access to calendar and email functionality through multiple protocols. It integrates with Nextcloud Calendar via CalDAV, supports external calendar sync (Google Calendar, Outlook), connects to Nextcloud Mail or external IMAP/SMTP servers, enables voice commands for scheduling and email management, and maintains calendar event context for clinical workflows. This service allows clinicians to manage appointments and communications without leaving the VoiceAssist interface.

**Language/Runtime**: Python 3.11 with FastAPI, caldav library, webdavclient3

**Main Ports**:

- Dev (Phases 0-10): 8000/HTTP (shared with main FastAPI app)
- Prod (Phases 11-14): 8006/HTTP - Internal service mesh

**Dependencies**:

- PostgreSQL (event cache, email metadata - future)
- Redis (calendar sync cache - future)
- Qdrant (for file indexing into knowledge base)
- External: Nextcloud CalDAV (calendar), Nextcloud WebDAV (files), IMAP/SMTP servers

**Key Endpoints**:

**Phase 6 Calendar Endpoints** (implemented):

- `GET /api/integrations/calendar/calendars` - List all available calendars for authenticated user
  - Returns: Array of {id, name, url, supported_components}
- `GET /api/integrations/calendar/events` - List calendar events within a date range
  - Query params: start_date, end_date, calendar_id (optional)
  - Returns: Array of CalendarEvent with uid, summary, start, end, description, location
- `POST /api/integrations/calendar/events` - Create a new calendar event
  - Body: {summary, start, end, description?, location?, calendar_id?}
  - Returns: Created event UID
- `PUT /api/integrations/calendar/events/{event_uid}` - Update an existing event
  - Body: {summary?, start?, end?, description?, location?}
  - Returns: Success confirmation
- `DELETE /api/integrations/calendar/events/{event_uid}` - Delete a calendar event
  - Returns: Deletion confirmation

**Phase 6 File Indexing Endpoints** (implemented):

- `POST /api/integrations/files/scan-and-index` - Scan Nextcloud directories and auto-index medical documents
  - Query params: source_type (guideline|note|journal), force_reindex
  - Returns: {files_discovered, files_indexed, files_failed, files_skipped}
- `POST /api/integrations/files/index` - Index a specific Nextcloud file into the knowledge base
  - Body: {file_path, source_type, title?}
  - Returns: IndexingResult with document_id, chunks_indexed

**Phase 6 Email Endpoints** (skeleton - future implementation):

- `GET /api/integrations/email/folders` - List mailbox folders (NOT_IMPLEMENTED)
- `GET /api/integrations/email/messages` - List email messages (NOT_IMPLEMENTED)
- `POST /api/integrations/email/send` - Send email via SMTP (NOT_IMPLEMENTED)

**Phase 6 Implementation Details**:

**CalDAV Service** (`caldav_service.py`):

- Connects to Nextcloud Calendar via CalDAV protocol (RFC 4791)
- Supports calendar discovery and event CRUD operations
- Uses vobject library for iCalendar parsing
- Handles recurring events and timezone conversions
- Error handling for connection failures and invalid events

**Nextcloud File Indexer** (`nextcloud_file_indexer.py`):

- Discovers files in Nextcloud via WebDAV protocol
- Automatically indexes medical documents into Phase 5 KB
- Supported formats: PDF (.pdf), Text (.txt), Markdown (.md)
- Tracks indexed files to prevent re-indexing
- Configurable watch directories (default: /Documents)
- Integrates with KBIndexer from Phase 5 for embedding generation

**Email Service** (`email_service.py` - skeleton):

- Basic IMAP connection for reading emails
- SMTP support for sending emails
- Folder listing and message fetching
- Full implementation deferred to Phase 7+

**Protocols Supported** (Phase 6):

- ✅ CalDAV (Nextcloud Calendar, RFC 4791)
- ✅ WebDAV (Nextcloud Files, RFC 4918)
- 🔄 IMAP/SMTP (skeleton only)
- ⏳ CardDAV (Contacts - future)
- ⏳ Google Calendar API (future)
- ⏳ Microsoft Graph API (Outlook/Exchange - future)

**Related Documentation**:

- [NEXTCLOUD_INTEGRATION.md](NEXTCLOUD_INTEGRATION.md) - Integration architecture
- [NEXTCLOUD_APPS_DESIGN.md](NEXTCLOUD_APPS_DESIGN.md) - Nextcloud app structure
- [phases/PHASE_06_NEXTCLOUD_APPS.md](phases/PHASE_06_NEXTCLOUD_APPS.md) - Phase 6 details

**Implementation Status**:

- Phase 6 MVP: ✅ Calendar operations, ✅ File auto-indexing, 🔄 Email skeleton
- Phase 7+: Full email integration, CardDAV contacts, external calendar sync

---

## 8. PHI Detection / Classifier

**Service ID**: `phi-detection`

**Purpose**: The PHI Detection Service is a critical HIPAA compliance component that automatically identifies Protected Health Information (PHI) in user queries, documents, and conversation content. It uses machine learning models (Presidio, custom NER models) to detect patient names, dates of birth, medical record numbers, and other identifiers. Based on PHI classification, it routes queries to appropriate AI models (local for PHI, cloud for non-PHI), redacts PHI from logs and audit trails, and maintains a classification cache for performance.

**Language/Runtime**: Python 3.11 with FastAPI and Microsoft Presidio

**Main Ports**:

- 8007/HTTP - REST API for PHI detection

**Dependencies**:

- Redis (classification cache)
- PostgreSQL (detection logs for audit)
- External: Pre-trained NER models (spaCy, Hugging Face Transformers)

**Key Endpoints**:

- `POST /api/phi/detect` - Detect PHI in text
- `POST /api/phi/redact` - Redact PHI from text
- `POST /api/phi/classify` - Classify query as PHI/non-PHI
- `GET /api/phi/entities` - List detected entity types

**Detection Capabilities**:

- Patient names (PERSON)
- Dates of birth (DATE)
- Medical record numbers (MRN)
- Social Security Numbers (SSN)
- Phone numbers (PHONE)
- Addresses (LOCATION)
- Email addresses (EMAIL)
- Device identifiers
- IP addresses

**Response Format**:

```json
{
  "containsPHI": true,
  "entities": [
    {
      "type": "PERSON",
      "text": "John Doe",
      "start": 15,
      "end": 23,
      "confidence": 0.95
    }
  ],
  "redactedText": "Patient [REDACTED] presents with...",
  "routingDecision": "local"
}
```

---

## 9. Guideline Scraper

**Service ID**: `guideline-scraper`

**Purpose**: The Guideline Scraper Service automatically discovers, downloads, and indexes clinical practice guidelines from authoritative sources. It monitors CDC, WHO, medical specialty societies (AHA, ACC, ACOG, etc.) for new and updated guidelines, downloads PDFs and HTML content, extracts structured recommendations with evidence levels, detects changes in existing guidelines and notifies users, and schedules periodic updates to maintain current knowledge. This ensures the knowledge base stays current with the latest evidence-based medicine.

**Language/Runtime**: Python 3.11 with Scrapy and Celery

**Main Ports**:

- 8008/HTTP - REST API for scraper management
- No external-facing ports (background service)

**Dependencies**:

- PostgreSQL (guideline metadata, update tracking)
- Redis (Celery task queue)
- File Indexer Service (index downloaded guidelines)
- External: CDC, WHO, specialty society websites

**Key Endpoints**:

- `POST /api/scraper/sources/add` - Add guideline source
- `GET /api/scraper/sources` - List configured sources
- `POST /api/scraper/run` - Trigger scraping job
- `GET /api/scraper/jobs/{id}` - Get scraping job status
- `GET /api/scraper/guidelines/new` - List newly discovered guidelines
- `POST /api/scraper/schedule` - Configure scraping schedule

**Supported Sources**:

- CDC Guidelines (www.cdc.gov)
- WHO Guidelines (www.who.int)
- AHA/ACC Cardiovascular Guidelines
- ACOG Obstetrics Guidelines
- ACCP Chest Guidelines
- IDSA Infectious Disease Guidelines
- Custom RSS feeds

**Scraping Strategy**:

```
Source URL → HTML Parsing → Guideline Detection →
PDF Download → Metadata Extraction →
Change Detection → Indexing Queue →
Notification (if new/updated)
```

---

## 10. Medical Calculator Service

**Service ID**: `medical-calculator`

**Purpose**: The Medical Calculator Service implements a comprehensive library of clinical calculators and scoring systems commonly used in medical practice. It provides validated algorithms for risk scores (CHADS2-VASc, HAS-BLED, GRACE, Wells), renal dosing adjustments (Cockcroft-Gault, MDRD, CKD-EPI), drug dosing calculators, BMI and BSA calculations, hemodynamic calculations, and other clinical decision tools. Results include interpretations and clinical recommendations based on calculated scores.

**Language/Runtime**: Python 3.11 with FastAPI

**Main Ports**:

- 8009/HTTP - REST API for medical calculations

**Dependencies**:

- Redis (calculation result caching)
- PostgreSQL (calculation history for audit)

**Key Endpoints**:

- `GET /api/calculator/list` - List available calculators
- `POST /api/calculator/execute` - Execute calculator
- `GET /api/calculator/{name}` - Get calculator details
- `POST /api/calculator/chads2vasc` - CHADS2-VASc score
- `POST /api/calculator/wells-dvt` - Wells DVT score
- `POST /api/calculator/grace` - GRACE ACS risk score
- `POST /api/calculator/ckd-epi` - CKD-EPI GFR
- `POST /api/calculator/bmi` - BMI and BSA
- `POST /api/calculator/drug-dose` - Drug dosing (renal/hepatic)

**Available Calculators**:

- **Cardiovascular**: CHADS2-VASc, HAS-BLED, GRACE, TIMI, HEART
- **Renal**: Cockcroft-Gault, MDRD, CKD-EPI, FENa
- **VTE**: Wells DVT, Wells PE, Geneva, PERC
- **Sepsis**: qSOFA, SOFA, SIRS
- **General**: BMI, BSA, IBW, ABG interpretation
- **Drug Dosing**: Vancomycin, Aminoglycosides, Warfarin

**Example Request/Response**:

```json
// POST /api/calculator/chads2vasc
{
  "age": 75,
  "sex": "F",
  "chf": true,
  "hypertension": true,
  "stroke": false,
  "vascular": false,
  "diabetes": true
}

// Response
{
  "score": 5,
  "interpretation": "High risk",
  "annualStrokeRisk": "6.7%",
  "recommendation": "Anticoagulation strongly recommended (Class I)",
  "references": ["2019 AHA/ACC/HRS Atrial Fibrillation Guidelines"]
}
```

---

## Service Communication

### Communication Patterns

**Synchronous (HTTP/gRPC)**:

- API Gateway → All services (REST)
- Voice Proxy → Medical KB (RAG queries)
- Medical KB → PHI Detection (classification)
- Admin API → All services (health checks)

**Asynchronous (Message Queue)**:

- File Indexer → Redis/Celery (background jobs)
- Guideline Scraper → Redis/Celery (scheduled tasks)
- Admin API → File Indexer (trigger reindex)

**Streaming (WebSocket)**:

- Clients → API Gateway → Voice Proxy (real-time chat)

### Service Discovery

**Docker Compose (Development)**:

```yaml
# Services discover each other by container name
voice-proxy:
  environment:
    MEDICAL_KB_URL: http://medical-kb:8002
    PHI_DETECTION_URL: http://phi-detection:8007
```

**Kubernetes (Production)**:

```yaml
# Services discover via K8s DNS
MEDICAL_KB_URL: http://medical-kb-service.voiceassist.svc.cluster.local:8002
```

---

## Monitoring and Observability

All services expose:

- `GET /health` - Health check endpoint
- `GET /ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

**Standard Metrics**:

- Request count, latency (p50, p95, p99)
- Error rate
- Active connections
- Resource usage (CPU, memory)
- Business metrics (queries, documents indexed, etc.)

**Logging**:

- Structured JSON logs to stdout
- PHI redaction applied automatically
- Correlation IDs for request tracing

**Tracing**:

- OpenTelemetry instrumentation
- Jaeger for distributed tracing

---

## Deployment Configuration

### Resource Limits (Docker Compose)

```yaml
services:
  voice-proxy:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 512M

  medical-kb:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 4G
        reservations:
          cpus: "1.0"
          memory: 2G
```

### Scaling (Kubernetes)

```yaml
# medical-kb deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: medical-kb
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: medical-kb
          resources:
            requests:
              cpu: 1000m
              memory: 2Gi
            limits:
              cpu: 2000m
              memory: 4Gi
---
# HorizontalPodAutoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: medical-kb-hpa
spec:
  scaleTargetRef:
    kind: Deployment
    name: medical-kb
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Security Considerations

### Service-to-Service Authentication

**Docker Compose**: Shared network, no external exposure
**Kubernetes**: mTLS via service mesh (Linkerd/Istio)

### API Security

- All external endpoints behind API Gateway
- JWT validation at gateway and service level
- Rate limiting per user/IP
- Input validation with Pydantic

### Data Protection

- Encryption in transit (TLS 1.2+)
- Encryption at rest (database level)
- PHI redaction in all logs
- Audit logging for compliance

---

## Related Documentation

- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture overview
- [DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md) - Implementation phases
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - HIPAA compliance details
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - Local development setup
- [server/README.md](../server/README.md) - Backend API documentation

---

**Last Updated**: 2025-11-20
**Version**: V2.0
