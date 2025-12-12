---
title: Knowledge Base API Reference
slug: api/knowledge-base
summary: User and admin Knowledge Base APIs built on kb_documents and RAG services.
status: stable
stability: beta
owner: backend
lastUpdated: "2025-12-12"
audience:
  - human
  - agent
  - ai-agents
  - backend
  - frontend
tags:
  - api
  - knowledge-base
  - rag
  - documents
relatedServices:
  - api-gateway
category: api
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/api/documents.py"
  - "services/api-gateway/app/api/admin_kb.py"
  - "services/api-gateway/app/api/kb.py"
  - "services/api-gateway/app/services/rag_service.py"
source_of_truth: true
version: 1.0.0
ai_summary: >-
  Describes the three Knowledge Base surfaces: user documents (/api/documents),
  admin KB management (/api/admin/kb/*), and the user-facing KB + RAG API
  (/api/kb/*) that frontends and agents should prefer.
---

# Knowledge Base API Reference

**Last Updated**: 2025-12-12  
**Status**: Stable (user/admin surfaces), Beta (RAG convenience APIs)

This document describes the **three primary KB surfaces** exposed by the
API gateway:

- User documents: `/api/documents/*`
- Admin KB management: `/api/admin/kb/*`
- User-facing KB + RAG: `/api/kb/*`

All three ultimately operate on the same `kb_documents` table and RAG
services (`rag_service.py`, `kb_indexer.py`).

---

## 1. User Documents API – `/api/documents/*`

**Module**: `app/api/documents.py`  
**Audience**: signed-in end users (clinicians)  
**Use cases**:

- Upload personal medical documents (PDF/TXT/DOCX/MD)
- Track indexing status and structure
- Control document visibility (`is_public`)

### Key endpoints

- `POST /api/documents/upload`
  - Multipart form:
    - `file` (required) – PDF/TXT/DOCX/MD
    - `title` (optional)
    - `category` (default `general`)
    - `is_public` (default `false`)
  - Returns envelope with:
    - `data.document_id`
    - `data.title`
    - `data.status` (`processing/indexed/failed`)

- `GET /api/documents`
  - Query params:
    - `skip`, `limit`
    - `category` (maps to `source_type = "user_{category}"`)
    - `include_public`
  - Returns envelope: `{ documents: [...], total, skip, limit }`

- `GET /api/documents/{document_id}`
  - Full document metadata (see `Document.to_dict()`).

- `GET /api/documents/{document_id}/status`
  - Indexing progress + PHI scan results.

- `DELETE /api/documents/{document_id}`
  - Deletes from Postgres + Qdrant, owner-only.

Frontends can continue to use these endpoints directly for user document
management (e.g., `DocumentsPage` in the web app).

---

## 2. Admin KB API – `/api/admin/kb/*`

**Module**: `app/api/admin_kb.py`  
**Audience**: system admins, knowledge engineers  
**Use cases**:

- Global knowledge base management
- Curated guidelines, journals, and shared content
- Deep troubleshooting of indexing status

### Key endpoints

- `GET /api/admin/kb/documents`
  - Paginated list of all KB documents (across users).

- `GET /api/admin/kb/documents/{document_id}`
  - Detailed KB document metadata, including indexing stats and full
    `metadata` payload.

- `POST /api/admin/kb/documents`
  - Admin upload/ingest of documents with explicit `source_type`.

- `DELETE /api/admin/kb/documents/{document_id}`
  - Hard delete of a KB document (admin-only).

The **Admin Panel** (`AdminDashboard` → `KnowledgeBaseManager`) uses this
surface via the `@voiceassist/api-client` admin KB methods.

---

## 3. User-Facing KB + RAG API – `/api/kb/*`

**Module**: `app/api/kb.py`  
**Audience**: web app, voice mode, AI agents  
**Purpose**: Provide a **friendly KB surface** that fronts `/api/documents`
and the RAG services, with response envelopes aligned to tests and
frontend expectations.

### 3.1 Upload & list – `/api/kb/documents`

- `POST /api/kb/documents`
  - Multipart form:
    - `file` (required)
    - `title` (optional)
    - `category` (default `"general"`)
    - `metadata` (optional JSON string; stored under
      `kb_documents.metadata.custom_metadata`)
  - Semantics:
    - Performs pre-flight validation for size and file type:
      - `413` if `> 10MB`
      - `422` for unsupported extensions
    - Delegates to `/api/documents/upload` for full processing.
  - Response (envelope):
    - `success: true`
    - `data.document_id`, `data.title`, `data.status`
    - `data.metadata` (parsed JSON when provided)

- `GET /api/kb/documents`
  - Query params:
    - `page` (default `1`)
    - `page_size` (default `20`)
    - `category` – derived from `source_type` (`user_{category}`)
  - Response:
    - `data.documents`: list of enriched documents with:
      - `id`, `document_id`, `title`, `source_type`, `category`,
        timestamps, indexing status, visibility flags
    - `data.pagination`: `{ page, page_size, total }`

### 3.2 CRUD helpers

- `GET /api/kb/documents/{id}`
  - 200 with `data` when found and visible.
  - `404` with `ErrorCodes.NOT_FOUND` when missing.
  - `403` with `ErrorCodes.FORBIDDEN` for non-owner/private docs.

- `DELETE /api/kb/documents/{id}`
  - Owner-only delete.
  - 200 with `data.document_id` and `status="deleted"`.

- `GET /api/kb/documents/{id}/content`
  - Returns a placeholder `data.content` string in the current environment.
  - Still enforces ownership/visibility checks.

- `PATCH /api/kb/documents/{id}`
  - Allows lightweight updates to `title` and `category`, updating
    `source_type` accordingly.

- Bulk operations:
  - `POST /api/kb/documents/bulk` – multi-file upload wrapper.
  - `POST /api/kb/documents/bulk-delete` – owner-scoped bulk delete by IDs.

### 3.3 Search – `/api/kb/documents/search`

- `POST /api/kb/documents/search`
  - Request body (`KBDocumentSearchRequest`):
    - `query: string` (required, non-empty)
    - `search_type?: "keyword" | "semantic"` (currently treated equivalently)
    - `filters?: { category?: string; date_from?: string; date_to?: string }`
    - `limit?: number` (default `10`)
  - Behavior:
    - Scopes to documents owned by the current user or public docs.
    - Uses SQL `ILIKE` over titles, plus optional category/date filtering.
  - Response:
    - `data.results`: list of `{ id, title, category, created_at, relevance_score }`.
    - Empty list is valid.
  - Errors:
    - `422` when `query` is empty.

### 3.4 RAG queries – `/api/kb/query`

- `POST /api/kb/query`
  - Request (`KBRAGQueryRequest`):
    - `question: string` (required, non-empty)
    - `context_documents?: number` (default `5`)
    - `filters?: Record<string, Any>`
    - `conversation_history?: [{ role, content }]`
    - `clinical_context_id?: string`
  - Behavior:
    - Selects up to `context_documents` recent documents as `sources`.
    - Attempts to route through `QueryOrchestrator` (`rag_service.py`) with
      `enable_rag=False` by default for tests, falling back to a lightweight
      stub when external services are unavailable.
    - Always returns a best-effort answer when inputs are valid, treating
      RAG backend failures as degraded-but-200 instead of 5xx.
  - Response:
    - `data.answer: string`
    - `data.sources: [{ id, title, category, score? }, ...]`
  - Errors:
    - `422` when `question` is empty.
    - `401` when unauthenticated.

---

## 4. Frontend & Client Usage

The TypeScript API client (`@voiceassist/api-client`) exposes first-class
helpers for all three surfaces:

- Admin KB:
  - `getAdminKBDocuments(...)`
  - `getAdminKBDocument(documentId)`
  - `uploadAdminKBDocument(file, title?, sourceType?, onProgress?)`
  - `deleteAdminKBDocument(documentId)`

- User documents:
  - `uploadUserDocument(...)` → `/api/documents/upload`
  - `getUserDocuments(...)`, `getUserDocument(...)`,
    `getUserDocumentStatus(...)`, `deleteUserDocument(...)`

- User-facing KB + RAG (`/api/kb/*`):
  - `uploadKBDocument(file, options?, onProgress?)`
  - `listKBDocuments(page?, pageSize?, category?)`
  - `getKBDocument(documentId)`
  - `deleteKBDocument(documentId)`
  - `searchKBDocuments({ query, searchType?, filters?, limit? })`
  - `queryKB({ question, contextDocuments?, filters?, conversationHistory?, clinicalContextId? })`

**Recommendation**:

- For new user-facing KB features (search surfaces, “Ask my KB” widgets,
  RAG helpers): use `/api/kb/*` via the client methods above.
- For admin workflows: use `/api/admin/kb/*`.
- For low-level document lifecycle (visibility toggles, voice document
  navigation): `/api/documents/*` remains the canonical surface.

