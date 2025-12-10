---
title: Legacy Server (Deprecated)
description: Legacy backend service - DO NOT USE for new development
version: 1.0.0
status: deprecated
last_updated: 2025-11-27
---

# VoiceAssist Server

> **DEPRECATION NOTICE**
>
> This `server/` directory is a **legacy stub** and should **NOT** be used for new development.
>
> **Use `services/api-gateway/` instead** - This is the canonical, production-ready backend.
>
> This directory is preserved only for historical reference and documentation of the API response envelope format.

## Overview

The VoiceAssist server is the backend service that powers the AI assistant system. Built with FastAPI (Python), it provides APIs for conversation management, medical knowledge retrieval, system integrations, and administration.

## Standard API Response Envelope

All API endpoints return responses wrapped in a standard envelope for consistent error handling and tracing.

### Success Response

```json
{
  "success": true,
  "data": {
    "... endpoint-specific payload ..."
  },
  "error": null,
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-20T12:34:56.789Z"
}
```

### Error Response

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "KB_TIMEOUT",
    "message": "Knowledge base search timed out after 5000ms",
    "details": {
      "timeout_ms": 5000,
      "query": "heart failure management",
      "attempted_sources": ["internal_kb", "pubmed"]
    }
  },
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-20T12:34:56.789Z"
}
```

### Standard Error Codes

| Code               | HTTP Status | Meaning                    | When to Use                                   |
| ------------------ | ----------- | -------------------------- | --------------------------------------------- |
| `AUTH_FAILED`      | 401         | Authentication failed      | Invalid or expired JWT token                  |
| `AUTH_REQUIRED`    | 401         | Authentication required    | No token provided                             |
| `FORBIDDEN`        | 403         | Insufficient permissions   | User lacks required role (e.g., admin)        |
| `VALIDATION_ERROR` | 422         | Request validation failed  | Invalid request body, missing required fields |
| `RATE_LIMITED`     | 429         | Too many requests          | User or IP exceeded rate limit                |
| `PHI_DETECTED`     | 200\*       | PHI detected in query      | Query routed to local LLM (not an error)      |
| `PHI_REDACTED`     | 200\*       | PHI redacted from response | Safety filter triggered, partial response     |
| `KB_TIMEOUT`       | 504         | KB search timeout          | Qdrant didn't respond within timeout          |
| `TOOL_ERROR`       | 503         | External tool failure      | PubMed, UpToDate, or other API failed         |
| `LLM_ERROR`        | 503         | LLM generation failed      | OpenAI or local Llama error                   |
| `INTERNAL_ERROR`   | 500         | Unexpected server error    | Unhandled exception, database error           |
| `NOT_FOUND`        | 404         | Resource not found         | Document, session, or user doesn't exist      |
| `CONFLICT`         | 409         | Resource conflict          | Document with same key already exists         |

**Note**: `PHI_DETECTED` and `PHI_REDACTED` use HTTP 200 because they're successful responses with warnings, not errors.

### Pydantic Models

```python
from pydantic import BaseModel, Field
from typing import Any, Optional
from datetime import datetime
from uuid import uuid4

class APIError(BaseModel):
    """Error details for failed API responses."""
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[dict[str, Any]] = Field(
        None,
        description="Additional error context (stack trace, validation errors, etc.)"
    )

class APIEnvelope(BaseModel):
    """Standard response envelope for all API endpoints."""
    success: bool = Field(..., description="True if request succeeded, False if error")
    data: Optional[Any] = Field(None, description="Response payload (null on error)")
    error: Optional[APIError] = Field(None, description="Error details (null on success)")
    trace_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique request ID for tracing/debugging"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Server timestamp (ISO 8601 UTC)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": {"message": "Operation successful"},
                "error": None,
                "trace_id": "550e8400-e29b-41d4-a716-446655440000",
                "timestamp": "2025-11-20T12:34:56.789Z"
            }
        }
```

### FastAPI Envelope Helpers

```python
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Any

def success_response(
    data: Any,
    trace_id: Optional[str] = None,
) -> APIEnvelope:
    """Create a success response envelope."""
    return APIEnvelope(
        success=True,
        data=data,
        error=None,
        trace_id=trace_id or str(uuid4()),
        timestamp=datetime.utcnow(),
    )

def error_response(
    code: str,
    message: str,
    details: Optional[dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    status_code: int = 500,
) -> JSONResponse:
    """Create an error response envelope."""
    envelope = APIEnvelope(
        success=False,
        data=None,
        error=APIError(
            code=code,
            message=message,
            details=details or {},
        ),
        trace_id=trace_id or str(uuid4()),
        timestamp=datetime.utcnow(),
    )
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json"),
    )

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to ensure all errors use standard envelope."""
    trace_id = request.state.trace_id if hasattr(request.state, "trace_id") else str(uuid4())

    # Log the error with trace_id
    logger.error(
        f"Unhandled exception: {exc}",
        extra={
            "trace_id": trace_id,
            "path": request.url.path,
            "method": request.method,
        },
        exc_info=True,
    )

    return error_response(
        code="INTERNAL_ERROR",
        message="An unexpected error occurred. Please contact support with the trace ID.",
        details={"exception_type": type(exc).__name__} if settings.DEBUG else None,
        trace_id=trace_id,
        status_code=500,
    )
```

### Example Usage

```python
from fastapi import APIRouter, Depends
from app.schemas import ChatRequest, ChatResponse
from app.core.envelope import success_response, error_response
from app.services.conductor import QueryConductor

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/message", response_model=APIEnvelope)
async def send_message(
    request: ChatRequest,
    trace_id: str = Depends(get_trace_id),
    conductor: QueryConductor = Depends(get_conductor),
) -> APIEnvelope:
    """
    Send a chat message and receive AI-generated response.

    Returns standard APIEnvelope with ChatResponse in data field.
    """
    try:
        response = await conductor.process_query(
            request=request,
            trace_id=trace_id,
        )
        return success_response(data=response.model_dump(), trace_id=trace_id)

    except TimeoutError as e:
        return error_response(
            code="KB_TIMEOUT",
            message="Knowledge base search timed out",
            details={"timeout_ms": 5000},
            trace_id=trace_id,
            status_code=504,
        )

    except Exception as e:
        # Global handler will catch this, but we can be explicit
        return error_response(
            code="INTERNAL_ERROR",
            message=str(e),
            trace_id=trace_id,
            status_code=500,
        )
```

### Middleware for Trace ID

```python
from fastapi import Request
from uuid import uuid4

@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    """Add trace_id to request state for logging and response."""
    trace_id = request.headers.get("X-Trace-ID") or str(uuid4())
    request.state.trace_id = trace_id

    response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id

    return response
```

## Service Architecture

This FastAPI application hosts multiple logical services that correspond to the services defined in [SERVICE_CATALOG.md](../docs/SERVICE_CATALOG.md).

During **Phases 0-10**, all services run in this single application as routers. During **Phases 11-14**, services can be extracted to separate deployments if needed.

### Service Mapping

| Service (SERVICE_CATALOG.md) | Implementation in server/                                            |
| ---------------------------- | -------------------------------------------------------------------- |
| **Auth Service**             | `app/api/auth.py` + `app/services/auth/` + `app/core/security.py`    |
| **KB Service / Medical KB**  | `app/api/kb.py` or `app/api/chat.py` + `app/services/rag_service.py` |
| **Orchestrator/Conductor**   | `app/services/ai/orchestrator.py` (part of KB Service)               |
| **Admin API**                | `app/api/admin.py`                                                   |
| **Voice Proxy / Realtime**   | `app/api/realtime.py` or `app/api/voice.py` + `app/services/voice/`  |
| **Search Service**           | `app/services/search_service.py` + `app/core/vector_db.py`           |
| **Ingestion Service**        | `app/services/ingestion/` + `app/tasks/indexing.py`                  |
| **PHI Detector**             | `app/services/phi/phi_detector.py`                                   |
| **External APIs**            | `app/services/external_apis/` (pubmed.py, uptodate.py, nextcloud.py) |
| **Logging Service**          | `app/core/logging.py` + `app/core/middleware.py`                     |

### Orchestrator / Conductor

The orchestrator (`app/services/ai/orchestrator.py` or `app/services/rag_service.py`) is the core component of the **KB Service** that coordinates:

- Intent classification
- PHI detection and routing (local vs cloud LLM)
- KB retrieval (semantic search)
- External tool calls (PubMed, UpToDate)
- LLM answer generation
- Safety filtering and citation assembly

**See [CONDUCTOR_DESIGN.md](../docs/ORCHESTRATION_DESIGN.md) for complete design.**

## Architecture

- **FastAPI**: Modern async Python web framework
- **PostgreSQL + pgvector**: Database with vector search
- **Qdrant**: Vector database for embeddings
- **Redis**: Caching and session management
- **Celery**: Background task processing (PDF indexing, etc.)

## Directory Structure

```
server/
├── app/
│   ├── main.py                 # FastAPI application entry point
│   ├── config.py               # Configuration management
│   ├── api/                    # API routes
│   │   ├── endpoints/          # Endpoint implementations
│   │   │   ├── auth.py
│   │   │   ├── chat.py
│   │   │   ├── medical.py
│   │   │   ├── admin.py
│   │   │   └── integrations.py
│   │   └── deps.py             # Dependencies (auth, db sessions)
│   ├── core/                   # Core functionality
│   │   ├── security.py         # Auth, JWT, passwords
│   │   └── database.py         # Database connections
│   ├── models/                 # SQLAlchemy models
│   │   ├── user.py
│   │   ├── conversation.py
│   │   ├── document.py
│   │   └── citation.py
│   ├── services/               # Business logic
│   │   ├── ai/                 # AI-related services
│   │   │   ├── orchestrator.py    # Request routing
│   │   │   ├── local_llm.py       # Ollama integration
│   │   │   ├── cloud_api.py       # OpenAI/Claude APIs
│   │   │   └── embeddings.py      # Embedding generation
│   │   ├── medical/            # Medical features
│   │   │   ├── rag.py             # RAG implementation
│   │   │   ├── pubmed.py          # PubMed API
│   │   │   ├── pdf_processor.py   # PDF download & processing
│   │   │   └── guidelines.py      # Clinical guidelines
│   │   └── integrations/       # External integrations
│   │       ├── nextcloud.py
│   │       ├── calendar.py
│   │       └── email.py
│   └── utils/                  # Utility functions
│       ├── logger.py
│       └── helpers.py
├── tests/                      # Unit and integration tests
├── scripts/                    # Utility scripts
│   ├── backup_db.sh
│   ├── index_documents.py
│   └── migrate.py
├── alembic/                    # Database migrations
├── requirements.txt            # Python dependencies
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 14+ with pgvector
- Redis
- Qdrant (running via Docker or standalone)

### Installation

1. Create virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure environment:

```bash
cp .env.example .env
# Edit .env with your settings
```

4. Run database migrations:

```bash
alembic upgrade head
```

5. Start server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`
API documentation: `http://localhost:8000/docs`

## Key Services

### AI Orchestrator

Routes requests to appropriate AI model (local vs cloud) based on privacy classification.

### Medical RAG System

Retrieves relevant medical knowledge from textbooks, journals, and guidelines using vector search.

### PDF Processing Pipeline

Downloads, extracts text, generates embeddings, and indexes medical literature.

### Integration Services

Connects to external services like Nextcloud, calendar, email, PubMed, etc.

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token

### Chat

- `WS /api/chat/ws` - WebSocket for real-time chat
- `POST /api/chat/message` - Send message (REST alternative)
- `GET /api/chat/conversations` - List conversations
- `GET /api/chat/conversations/{id}` - Get conversation details

### Medical

- `POST /api/medical/search` - Search medical knowledge base
- `POST /api/medical/journal/search` - Search PubMed
- `POST /api/medical/journal/download` - Download PDF
- `GET /api/medical/textbook/{id}/section/{section}` - Get textbook content

### Admin

- `GET /api/admin/dashboard` - Dashboard metrics
- `GET /api/admin/services/status` - Service health
- `POST /api/admin/knowledge/upload` - Upload document
- `POST /api/admin/knowledge/reindex` - Trigger reindex

### Integrations

- `GET /api/integrations/calendar/events` - Get calendar events
- `POST /api/integrations/calendar/events` - Create event
- `GET /api/integrations/nextcloud/files` - List files

## API Contracts

This section provides detailed API contracts with Pydantic models and FastAPI route implementations.

### Chat API

**WebSocket Event Schemas:**

```python
# app/api/schemas/chat.py
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime

# Client → Server Events
class SessionStartEvent(BaseModel):
    type: Literal['session.start']
    sessionId: Optional[str] = None
    mode: Literal['quick_consult', 'case_workspace', 'guideline_comparison']
    clinicalContext: Optional['ClinicalContext'] = None
    preferences: Optional[dict] = None

class MessageSendEvent(BaseModel):
    type: Literal['message.send']
    sessionId: str
    content: str
    attachments: Optional[List[str]] = None

class AudioChunkEvent(BaseModel):
    type: Literal['audio.chunk']
    sessionId: str
    data: bytes
    sequence: int

class GenerationStopEvent(BaseModel):
    type: Literal['generation.stop']
    sessionId: str

# Server → Client Events
class SessionStartedEvent(BaseModel):
    type: Literal['session.started']
    sessionId: str
    timestamp: datetime

class MessageDeltaEvent(BaseModel):
    type: Literal['message.delta']
    sessionId: str
    messageId: str
    role: Literal['assistant', 'system']
    contentDelta: str
    index: Optional[int] = None

class MessageCompleteEvent(BaseModel):
    type: Literal['message.complete']
    sessionId: str
    messageId: str
    finishReason: str

class CitationListEvent(BaseModel):
    type: Literal['citation.list']
    sessionId: str
    messageId: str
    citations: List['Citation']

class ErrorEvent(BaseModel):
    type: Literal['error']
    sessionId: str
    error: str
    code: str
```

**REST API Implementation:**

```python
# app/api/endpoints/chat.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import get_db, get_current_user
from app.api.schemas.chat import (
    ConversationResponse,
    MessageRequest,
    MessageResponse
)
from app.models.user import User
from app.services.ai.orchestrator import AIOrchestrator

router = APIRouter()

@router.post("/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send a message in a conversation (non-streaming alternative to WebSocket).

    - **sessionId**: Conversation session ID
    - **content**: Message text
    - **clinicalContext**: Optional patient/case context
    """
    orchestrator = AIOrchestrator(db=db, user=current_user)

    result = await orchestrator.process_message(
        session_id=request.sessionId,
        content=request.content,
        clinical_context=request.clinicalContext
    )

    return MessageResponse(
        messageId=result['message_id'],
        content=result['content'],
        citations=result['citations'],
        createdAt=result['created_at']
    )

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List user's conversations with pagination.
    """
    conversations = db.query(Conversation)\
        .filter(Conversation.user_id == current_user.id)\
        .order_by(Conversation.updated_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()

    return [
        ConversationResponse(
            id=conv.id,
            title=conv.title,
            mode=conv.mode,
            messageCount=len(conv.messages),
            lastMessage=conv.messages[-1].content if conv.messages else None,
            createdAt=conv.created_at,
            updatedAt=conv.updated_at
        )
        for conv in conversations
    ]
```

**Pydantic Request/Response Models:**

```python
# app/api/schemas/chat.py (continued)
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ClinicalContext(BaseModel):
    id: str
    caseId: Optional[str] = None
    title: str
    patient: Optional[dict] = None  # {age, sex, weight, height}
    problems: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    labs: Optional[str] = None
    vitals: Optional[str] = None
    notes: Optional[str] = None
    specialty: Optional[str] = None
    urgency: Optional[str] = None

class Citation(BaseModel):
    id: str
    sourceType: str
    title: str
    subtitle: Optional[str] = None
    authors: Optional[List[str]] = None
    source: Optional[str] = None
    publisher: Optional[str] = None
    publicationYear: Optional[int] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    url: Optional[str] = None
    recommendationClass: Optional[str] = None
    evidenceLevel: Optional[str] = None
    excerpt: Optional[str] = None
    relevanceScore: Optional[float] = None

class MessageRequest(BaseModel):
    sessionId: str
    content: str
    clinicalContext: Optional[ClinicalContext] = None
    attachments: Optional[List[str]] = None

class MessageResponse(BaseModel):
    messageId: str
    content: str
    citations: List[Citation]
    createdAt: datetime

class ConversationResponse(BaseModel):
    id: str
    title: str
    mode: str
    messageCount: int
    lastMessage: Optional[str]
    createdAt: datetime
    updatedAt: datetime
```

### Medical Knowledge API

**Search Medical Knowledge Base:**

```python
# app/api/endpoints/medical.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.deps import get_db, get_current_user
from app.api.schemas.medical import (
    MedicalSearchRequest,
    MedicalSearchResponse,
    KBSearchResult
)
from app.services.medical.rag import RAGService
from app.models.user import User

router = APIRouter()

@router.post("/search", response_model=MedicalSearchResponse)
async def search_knowledge_base(
    request: MedicalSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Semantic search across medical knowledge base.

    - **query**: Natural language question
    - **filters**: Optional filters (specialty, source type, date range)
    - **limit**: Max results to return
    - **includeExcerpts**: Include text excerpts in results
    """
    rag_service = RAGService(db=db)

    results = await rag_service.search(
        query=request.query,
        filters=request.filters,
        limit=request.limit,
        include_excerpts=request.includeExcerpts
    )

    return MedicalSearchResponse(
        query=request.query,
        results=[
            KBSearchResult(
                id=r['id'],
                title=r['title'],
                sourceType=r['source_type'],
                excerpt=r.get('excerpt'),
                score=r['score'],
                metadata=r['metadata']
            )
            for r in results
        ],
        totalResults=len(results)
    )
```

**Pydantic Schemas:**

```python
# app/api/schemas/medical.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class MedicalSearchFilters(BaseModel):
    specialty: Optional[List[str]] = None
    sourceType: Optional[List[str]] = None  # ['guideline', 'textbook', 'journal']
    dateFrom: Optional[datetime] = None
    dateTo: Optional[datetime] = None
    recommendationClass: Optional[List[str]] = None  # ['I', 'IIa', 'IIb', 'III']

class MedicalSearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    filters: Optional[MedicalSearchFilters] = None
    limit: int = Field(default=10, ge=1, le=100)
    includeExcerpts: bool = True

class KBSearchResult(BaseModel):
    id: str
    title: str
    sourceType: str
    excerpt: Optional[str]
    score: float
    metadata: Dict[str, Any]

class MedicalSearchResponse(BaseModel):
    query: str
    results: List[KBSearchResult]
    totalResults: int
```

### Admin Panel API

**Complete Admin Route Example:**

```python
# app/api/endpoints/admin.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.api.deps import get_db, get_admin_user
from app.api.schemas.admin import (
    DocumentUploadResponse,
    DocumentListResponse,
    ReindexRequest,
    ReindexResponse,
    IndexingJobResponse,
    VectorDBStatsResponse
)
from app.models.user import User
from app.models.document import Document, IndexingJob
from app.services.medical.pdf_processor import PDFProcessor
from app.core.database import get_vector_db

router = APIRouter()

@router.post("/knowledge/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    sourceType: str = 'textbook',
    specialty: str = 'general',
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)  # Admin only
):
    """
    Upload a medical document (PDF, DOCX) for indexing.

    - **file**: Document file (PDF or DOCX)
    - **sourceType**: Type of source (textbook, guideline, journal, etc.)
    - **specialty**: Medical specialty

    Returns document ID and triggers background indexing job.
    """
    # Validate file type
    if not file.filename.endswith(('.pdf', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files supported")

    # Create document record
    doc_id = str(uuid.uuid4())
    document = Document(
        id=doc_id,
        filename=file.filename,
        source_type=sourceType,
        specialty=specialty,
        status='uploading',
        uploaded_by=current_user.id
    )
    db.add(document)
    db.commit()

    # Save file
    file_path = f"/data/documents/{doc_id}/{file.filename}"
    with open(file_path, 'wb') as f:
        content = await file.read()
        f.write(content)

    document.file_path = file_path
    document.file_size = len(content)
    document.status = 'uploaded'
    db.commit()

    # Trigger background indexing
    background_tasks.add_task(
        index_document_task,
        doc_id=doc_id,
        db=db
    )

    return DocumentUploadResponse(
        documentId=doc_id,
        filename=file.filename,
        status='uploaded',
        message='Document uploaded successfully. Indexing started.'
    )

@router.get("/knowledge/documents", response_model=List[DocumentListResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    List all documents in knowledge base with optional status filter.
    """
    query = db.query(Document)

    if status:
        query = query.filter(Document.status == status)

    documents = query.order_by(Document.uploaded_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()

    return [
        DocumentListResponse(
            id=doc.id,
            filename=doc.filename,
            sourceType=doc.source_type,
            specialty=doc.specialty,
            status=doc.status,
            fileSize=doc.file_size,
            chunkCount=doc.chunk_count,
            uploadedAt=doc.uploaded_at,
            indexedAt=doc.indexed_at
        )
        for doc in documents
    ]

@router.post("/knowledge/reindex", response_model=ReindexResponse)
async def trigger_reindex(
    request: ReindexRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    Trigger re-indexing of documents.

    - **documentIds**: List of document IDs to reindex (empty = reindex all)
    - **force**: Force reindex even if already indexed
    """
    doc_ids = request.documentIds

    if not doc_ids:
        # Reindex all documents
        documents = db.query(Document).filter(Document.status == 'indexed').all()
        doc_ids = [doc.id for doc in documents]

    # Create indexing job
    job_id = str(uuid.uuid4())
    job = IndexingJob(
        id=job_id,
        document_count=len(doc_ids),
        status='pending',
        started_by=current_user.id
    )
    db.add(job)
    db.commit()

    # Trigger background reindexing
    background_tasks.add_task(
        reindex_documents_task,
        job_id=job_id,
        doc_ids=doc_ids,
        force=request.force,
        db=db
    )

    return ReindexResponse(
        jobId=job_id,
        documentCount=len(doc_ids),
        status='pending',
        message=f'Reindexing {len(doc_ids)} documents'
    )

@router.get("/knowledge/jobs", response_model=List[IndexingJobResponse])
async def list_indexing_jobs(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    List recent indexing jobs with their status.
    """
    jobs = db.query(IndexingJob)\
        .order_by(IndexingJob.created_at.desc())\
        .limit(limit)\
        .all()

    return [
        IndexingJobResponse(
            id=job.id,
            documentCount=job.document_count,
            processedCount=job.processed_count,
            status=job.status,
            error=job.error,
            createdAt=job.created_at,
            completedAt=job.completed_at
        )
        for job in jobs
    ]

@router.get("/knowledge/stats", response_model=VectorDBStatsResponse)
async def get_vector_db_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    Get vector database statistics.
    """
    vector_db = get_vector_db()

    collection_info = await vector_db.get_collection_info('medical_knowledge')

    doc_count = db.query(Document).filter(Document.status == 'indexed').count()
    total_chunks = db.query(Document).with_entities(
        db.func.sum(Document.chunk_count)
    ).scalar() or 0

    return VectorDBStatsResponse(
        totalDocuments=doc_count,
        totalChunks=total_chunks,
        vectorCount=collection_info['vectors_count'],
        indexedSize=collection_info['indexed_vectors_count'],
        embeddingDimension=collection_info['config']['params']['vectors']['size']
    )
```

**Admin Pydantic Schemas:**

```python
# app/api/schemas/admin.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class DocumentUploadResponse(BaseModel):
    documentId: str
    filename: str
    status: str
    message: str

class DocumentListResponse(BaseModel):
    id: str
    filename: str
    sourceType: str
    specialty: str
    status: str
    fileSize: int
    chunkCount: Optional[int]
    uploadedAt: datetime
    indexedAt: Optional[datetime]

class ReindexRequest(BaseModel):
    documentIds: List[str] = Field(default_factory=list)
    force: bool = False

class ReindexResponse(BaseModel):
    jobId: str
    documentCount: int
    status: str
    message: str

class IndexingJobResponse(BaseModel):
    id: str
    documentCount: int
    processedCount: int
    status: str  # 'pending', 'running', 'completed', 'failed'
    error: Optional[str]
    createdAt: datetime
    completedAt: Optional[datetime]

class VectorDBStatsResponse(BaseModel):
    totalDocuments: int
    totalChunks: int
    vectorCount: int
    indexedSize: int
    embeddingDimension: int
```

**TypeScript Client Example (for Admin Panel):**

```typescript
// admin-panel/src/services/api.ts
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Upload document
export async function uploadDocument(
  file: File,
  sourceType: string,
  specialty: string,
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sourceType", sourceType);
  formData.append("specialty", specialty);

  const response = await api.post("/api/admin/knowledge/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

// List documents
export async function listDocuments(
  skip: number = 0,
  limit: number = 50,
  status?: string,
): Promise<DocumentListResponse[]> {
  const response = await api.get("/api/admin/knowledge/documents", {
    params: { skip, limit, status },
  });

  return response.data;
}

// Trigger reindex
export async function triggerReindex(documentIds: string[] = [], force: boolean = false): Promise<ReindexResponse> {
  const response = await api.post("/api/admin/knowledge/reindex", {
    documentIds,
    force,
  });

  return response.data;
}

// Get vector DB stats
export async function getVectorDBStats(): Promise<VectorDBStatsResponse> {
  const response = await api.get("/api/admin/knowledge/stats");
  return response.data;
}
```

## Configuration

Key environment variables (see `.env.example`):

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost/voiceassist

# Redis
REDIS_URL=redis://localhost:6379

# Vector DB
QDRANT_URL=http://localhost:6333

# OpenAI
OPENAI_API_KEY=sk-...

# Server
HOST=0.0.0.0
PORT=8000
ENVIRONMENT=production

# Security
SECRET_KEY=...
JWT_SECRET=...
```

## Development

### Running Tests

```bash
pytest tests/
```

### Code Quality

```bash
# Format code
black app/

# Lint
flake8 app/

# Type checking
mypy app/
```

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### Production

See [INFRASTRUCTURE_SETUP.md](../docs/INFRASTRUCTURE_SETUP.md) for detailed deployment instructions.

## Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics` (Prometheus format)
- Logs: Structured JSON logging to stdout

## Security

- JWT-based authentication
- Rate limiting on all endpoints
- Input validation with Pydantic
- SQL injection protection (SQLAlchemy)
- CORS configuration
- HTTPS only in production

## Performance

- Async/await for I/O operations
- Connection pooling (DB, Redis)
- Response caching where appropriate
- Background tasks with Celery

## Troubleshooting

### Server won't start

- Check port 8000 is not in use: `lsof -i :8000`
- Verify database connection
- Check environment variables

### Slow responses

- Check database query performance
- Monitor vector search latency
- Review API rate limits

### Memory issues

- Monitor Ollama memory usage
- Check vector DB size
- Review background task queue

## Contributing

See [CONTRIBUTING.md](../docs/CONTRIBUTING.md) for development guidelines.

## License

Personal use project.
