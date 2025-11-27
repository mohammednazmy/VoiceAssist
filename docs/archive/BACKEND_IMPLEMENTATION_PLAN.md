---
title: "Backend Implementation Plan"
slug: "archive/backend-implementation-plan"
summary: "**Date**: 2025-11-23"
status: deprecated
stability: legacy
owner: docs
lastUpdated: "2025-11-27"
audience: ["backend"]
tags: ["backend", "implementation", "plan"]
category: reference
---

# Backend Implementation Plan for Frontend Features

**Date**: 2025-11-23
**Status**: Planning Phase
**Based on**: PR#24 (claude/review-codebase-planning-01BPQKdZZnAgjqJ8F3ztUYtV)
**Priority**: High - Frontend features are waiting for backend support

---

## Executive Summary

The frontend team has successfully implemented **Phases 3-8** with 15+ new components and features. However, several features require backend API endpoints and functionality that are either missing or incomplete. This document outlines the required backend work to fully support the frontend implementation.

---

## Current Status: What's Implemented

### ✅ Already Working (Backend Complete):

1. **Voice Transcription** - `/voice/transcribe` endpoint exists (services/api-gateway/app/api/voice.py)
2. **Voice Synthesis** - `/voice/synthesize` endpoint exists
3. **Conversation Branching API** - Backend support already implemented
4. **Basic file upload** - `/api/admin/kb/documents` exists for admin document upload

### ⚠️ Partially Working (Needs Enhancement):

1. **File Upload in Chat** - Admin upload works, but chat-specific upload not implemented
2. **Clinical Context** - Frontend stores in localStorage, no backend persistence
3. **Citations** - Frontend parses from messages, backend needs to return structured citations

### ❌ Missing Backend Support (Needs Implementation):

1. **File attachments in messages** - No endpoint for user file uploads in chat
2. **Clinical context persistence** - No endpoint to save/retrieve clinical context
3. **Clinical context in RAG** - Clinical context not sent to backend for context-aware responses
4. **Structured citations in responses** - Citations embedded in text, not returned as structured data
5. **Export API** - No backend export endpoint (currently frontend-only via browser)
6. **Conversation folders/categorization** - No backend support

---

## Priority 1: Critical Backend Work (Week 1-2)

### 1.1 File Upload in Chat Messages ⭐⭐⭐

**Frontend Implementation:**

- `FileUpload.tsx` component complete
- Drag-and-drop UI, progress tracking, multi-file support
- Sends files via `apiClient.uploadDocument()`

**Backend Gaps:**

1. No endpoint for user file uploads (non-admin)
2. No file attachment association with messages
3. No file storage/retrieval for chat attachments

**Required Backend Work:**

#### A. Database Schema Changes

```sql
-- New table: message_attachments
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,  -- 'pdf', 'image', 'text', 'markdown'
    file_size INTEGER NOT NULL,
    file_url TEXT NOT NULL,  -- S3/storage URL
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);
```

#### B. New API Endpoints

```python
# File: services/api-gateway/app/api/attachments.py

@router.post("/api/messages/{message_id}/attachments")
async def upload_message_attachment(
    message_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload file attachment for a message"""
    # 1. Validate file (type, size)
    # 2. Store file (S3 or local storage)
    # 3. Create attachment record
    # 4. Return attachment metadata

@router.get("/api/messages/{message_id}/attachments")
async def get_message_attachments(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all attachments for a message"""

@router.delete("/api/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an attachment"""

@router.get("/api/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Download attachment file"""
```

#### C. Message Model Updates

```python
# File: services/api-gateway/app/models/message.py

class Message(Base):
    # ... existing fields ...

    # New relationship
    attachments = relationship(
        "MessageAttachment",
        back_populates="message",
        cascade="all, delete-orphan"
    )

class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: str
    message_id: str
    file_name: str
    file_type: str
    file_size: int
    file_url: str
    mime_type: str
    uploaded_at: datetime
```

#### D. Storage Service

```python
# File: services/api-gateway/app/services/storage_service.py

class StorageService:
    """Handle file storage (S3 or local)"""

    async def upload_file(
        self,
        file: UploadFile,
        user_id: str,
        message_id: str
    ) -> str:
        """Upload file and return URL"""
        # Use S3 or local filesystem
        # Return accessible URL

    async def delete_file(self, file_url: str):
        """Delete file from storage"""

    async def get_file(self, file_url: str) -> bytes:
        """Retrieve file content"""
```

**Estimated Effort:** 3-4 days

---

### 1.2 Clinical Context Persistence ⭐⭐⭐

**Frontend Implementation:**

- `ClinicalContextSidebar.tsx` complete
- Stores in localStorage with key `voiceassist:clinical-context`
- Sends context with messages (TODO: verify this)

**Backend Gaps:**

1. No clinical context storage
2. No API to save/retrieve clinical context per user
3. Clinical context not passed to LLM/RAG pipeline

**Required Backend Work:**

#### A. Database Schema

```sql
-- New table: clinical_contexts
CREATE TABLE clinical_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

    -- Demographics
    age INTEGER,
    gender VARCHAR(50),
    weight_kg DECIMAL(5,2),
    height_cm DECIMAL(5,2),

    -- Clinical data
    chief_complaint TEXT,
    problems JSONB,  -- array of problems
    medications JSONB,  -- array of medications
    allergies JSONB,  -- array of allergies

    -- Vitals
    vitals JSONB,  -- {temp, hr, bp, rr, spo2}

    -- Metadata
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, conversation_id)
);

CREATE INDEX idx_clinical_contexts_user_id ON clinical_contexts(user_id);
CREATE INDEX idx_clinical_contexts_conversation_id ON clinical_contexts(conversation_id);
```

#### B. New API Endpoints

```python
# File: services/api-gateway/app/api/clinical_context.py

@router.get("/api/users/me/clinical-context")
async def get_user_clinical_context(
    conversation_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get clinical context for user (optionally scoped to conversation)"""

@router.put("/api/users/me/clinical-context")
async def update_clinical_context(
    context: ClinicalContextUpdate,
    conversation_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Update clinical context (create or update)"""

@router.delete("/api/users/me/clinical-context")
async def clear_clinical_context(
    conversation_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Clear clinical context"""
```

#### C. Integration with RAG Pipeline

```python
# File: services/api-gateway/app/services/rag_service.py

class QueryOrchestrator:
    async def process_query(
        self,
        query: str,
        user_id: str,
        conversation_id: str,
        clinical_context: Optional[ClinicalContext] = None  # NEW
    ):
        # Include clinical context in LLM system prompt
        system_prompt = self._build_system_prompt(clinical_context)

        # Pass to LLM with enhanced context
        response = await self.llm_client.generate(
            query=query,
            system_prompt=system_prompt,
            context=clinical_context
        )
```

#### D. Frontend Migration from localStorage

```typescript
// In ChatPage.tsx - update to use API instead of localStorage

// On mount, load from backend
useEffect(() => {
  const loadClinicalContext = async () => {
    const context = await apiClient.getClinicalContext(conversationId);
    setClinicalContext(context);
  };
  loadClinicalContext();
}, [conversationId]);

// On change, save to backend
const handleContextChange = async (newContext: ClinicalContext) => {
  setClinicalContext(newContext);
  await apiClient.updateClinicalContext(conversationId, newContext);
};
```

**Estimated Effort:** 2-3 days

---

### 1.3 Structured Citations in Responses ⭐⭐

**Frontend Implementation:**

- `CitationSidebar.tsx` extracts citations from message content
- Expects citations in message metadata or parses from text

**Backend Gaps:**

1. Citations are embedded in response text, not returned as structured data
2. No citation metadata in message responses

**Required Backend Work:**

#### A. Update Message Response Schema

```python
# File: services/api-gateway/app/models/message.py

class Citation(BaseModel):
    """Structured citation"""
    id: str
    title: str
    authors: Optional[List[str]] = None
    year: Optional[int] = None
    source: Optional[str] = None  # journal, textbook, guideline
    doi: Optional[str] = None
    pubmed_id: Optional[str] = None
    url: Optional[str] = None
    excerpt: Optional[str] = None  # relevant excerpt

class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: List[Citation] = []  # NEW
    metadata: dict = {}
    created_at: datetime
```

#### B. Update RAG Service to Return Citations

```python
# File: services/api-gateway/app/services/rag_service.py

class QueryResponse(BaseModel):
    answer: str
    citations: List[Citation]  # Structured citations
    message_id: str

class QueryOrchestrator:
    async def process_query(self, query: str):
        # Get relevant documents from vector DB
        docs = await self.search_aggregator.semantic_search(query)

        # Build citations from retrieved docs
        citations = self._build_citations(docs)

        # Generate response with LLM
        answer = await self.llm_client.generate(query, context=docs)

        return QueryResponse(
            answer=answer,
            citations=citations,  # Return structured citations
            message_id=str(uuid.uuid4())
        )

    def _build_citations(self, docs: List[SearchResult]) -> List[Citation]:
        """Convert search results to structured citations"""
        citations = []
        for doc in docs:
            citations.append(Citation(
                id=doc.id,
                title=doc.metadata.get('title'),
                authors=doc.metadata.get('authors'),
                year=doc.metadata.get('year'),
                source=doc.metadata.get('source'),
                doi=doc.metadata.get('doi'),
                url=doc.metadata.get('url'),
                excerpt=doc.text[:200]
            ))
        return citations
```

#### C. Update WebSocket Protocol

```python
# File: services/api-gateway/app/api/realtime.py

# Add citations to message_complete event
await websocket.send_json({
    "type": "message_complete",
    "message_id": response.message_id,
    "content": full_response,
    "citations": [c.dict() for c in response.citations],  # NEW
    "timestamp": datetime.now().isoformat()
})
```

**Estimated Effort:** 2 days

---

## Priority 2: Important Backend Enhancements (Week 3-4)

### 2.1 Export API Endpoint ⭐

**Frontend Implementation:**

- Frontend exports via browser (Markdown download, PDF print)
- No backend involved currently

**Why Add Backend:**

- Better PDF generation (headless Chrome/Puppeteer)
- Email export option
- Archive management
- Server-side rendering for consistent formatting

**Required Backend Work:**

```python
# File: services/api-gateway/app/api/export.py

@router.post("/api/conversations/{conversation_id}/export")
async def export_conversation(
    conversation_id: str,
    export_request: ExportRequest,
    current_user: User = Depends(get_current_user)
):
    """Export conversation to PDF or Markdown"""

    # export_request: {format: 'pdf'|'markdown', include_citations: bool, include_timestamps: bool}

    if export_request.format == 'pdf':
        # Use pdfkit or weasyprint
        pdf_bytes = await generate_pdf(conversation_id, export_request.options)
        return Response(content=pdf_bytes, media_type="application/pdf")

    elif export_request.format == 'markdown':
        markdown = await generate_markdown(conversation_id, export_request.options)
        return Response(content=markdown, media_type="text/markdown")
```

**Estimated Effort:** 1-2 days

---

### 2.2 Conversation Folders/Categorization ⭐

**Frontend Implementation:**

- Not implemented yet (deferred)
- Frontend ready to consume API

**Required Backend Work:**

#### A. Database Schema

```sql
-- New table: conversation_folders
CREATE TABLE conversation_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50),  -- hex color for UI
    icon VARCHAR(50),  -- icon name
    parent_folder_id UUID REFERENCES conversation_folders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, name, parent_folder_id)
);

-- Add folder_id to conversations
ALTER TABLE conversations
ADD COLUMN folder_id UUID REFERENCES conversation_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_folder_id ON conversations(folder_id);
```

#### B. API Endpoints

```python
@router.post("/api/folders")
async def create_folder(...)

@router.get("/api/folders")
async def list_folders(...)

@router.put("/api/conversations/{conversation_id}/folder")
async def move_to_folder(...)
```

**Estimated Effort:** 2 days

---

## Priority 3: Nice-to-Have Features (Week 5+)

### 3.1 Advanced File Processing ⭐

**Current:** Basic file upload
**Enhancement:** Extract text from PDFs/images, include in RAG context

```python
# OCR for images (Tesseract)
# PDF text extraction (PyPDF2)
# Include extracted text in message context
```

**Estimated Effort:** 2-3 days

---

### 3.2 Conversation Sharing ⭐

**Feature:** Share conversation with other users or via public link

```python
@router.post("/api/conversations/{conversation_id}/share")
async def create_share_link(...)

@router.get("/api/shared/{share_token}")
async def get_shared_conversation(...)
```

**Estimated Effort:** 2 days

---

### 3.3 Enhanced Voice Features ⭐

**Current:** Basic transcribe/synthesize
**Enhancement:** Streaming audio, speaker diarization

**Estimated Effort:** 3-4 days

---

## Implementation Timeline

### Week 1-2: Priority 1 (Critical)

- [ ] Day 1-2: File upload in chat messages (database, endpoints, storage)
- [ ] Day 3-4: File upload service integration and testing
- [ ] Day 5-6: Clinical context persistence (database, endpoints)
- [ ] Day 7: Clinical context RAG integration
- [ ] Day 8-9: Structured citations (update RAG, WebSocket protocol)
- [ ] Day 10: Testing and bug fixes

### Week 3-4: Priority 2 (Important)

- [ ] Day 11-12: Export API endpoint (PDF/Markdown generation)
- [ ] Day 13-14: Conversation folders (database, endpoints)
- [ ] Day 15-16: Testing and polish
- [ ] Day 17-18: Documentation and deployment

### Week 5+: Priority 3 (Nice-to-Have)

- [ ] Advanced file processing
- [ ] Conversation sharing
- [ ] Enhanced voice features

---

## Database Migration Plan

### Migration 001: Message Attachments

```sql
-- Create message_attachments table
-- See section 1.1
```

### Migration 002: Clinical Contexts

```sql
-- Create clinical_contexts table
-- See section 1.2
```

### Migration 003: Conversation Folders

```sql
-- Create conversation_folders table
-- Add folder_id to conversations
-- See section 2.2
```

---

## Testing Strategy

### Unit Tests

- [ ] File upload service tests
- [ ] Clinical context CRUD tests
- [ ] Citation extraction tests
- [ ] Export generation tests

### Integration Tests

- [ ] E2E file upload flow
- [ ] Clinical context in RAG pipeline
- [ ] Citation parsing from LLM responses
- [ ] Export API with real conversations

### Load Tests

- [ ] File upload with concurrent users
- [ ] Large file handling (10MB PDFs)
- [ ] Export generation under load

---

## Security Considerations

### File Upload

- ✅ File type validation (whitelist)
- ✅ File size limits (10MB per file)
- ✅ Virus scanning (ClamAV)
- ✅ User quota limits
- ✅ Secure file storage (S3 with presigned URLs)

### Clinical Context

- ✅ PHI protection (encryption at rest)
- ✅ Access control (user can only access their own context)
- ✅ Audit logging (track all access)
- ✅ HIPAA compliance validation

### Citations

- ✅ Prevent citation injection attacks
- ✅ Validate citation URLs
- ✅ Sanitize citation text

---

## Dependencies & Prerequisites

### Required Packages

```bash
# Python
pip install boto3  # S3 storage
pip install pdfkit  # PDF generation
pip install weasyprint  # Alternative PDF generator
pip install python-multipart  # File uploads
pip install clamav  # Virus scanning

# Node (already installed)
# @voiceassist/api-client - update with new endpoints
```

### Configuration

```env
# .env additions
AWS_S3_BUCKET=voiceassist-uploads
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
MAX_FILE_SIZE_MB=10
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

---

## Success Metrics

### Performance

- File upload: < 5s for 10MB file
- Clinical context save: < 500ms
- Citation extraction: < 1s
- Export generation: < 10s for 100-message conversation

### Reliability

- File upload success rate: > 99%
- Clinical context persistence: 100%
- Citation accuracy: > 95%

### User Experience

- File upload progress visible
- Clinical context auto-saves
- Citations load with messages
- Export completes without errors

---

## Rollout Plan

### Phase 1: Backend Implementation (Week 1-2)

1. Implement Priority 1 features
2. Unit testing
3. Integration testing
4. Deploy to staging

### Phase 2: Frontend Integration (Week 3)

1. Update API client with new endpoints
2. Replace localStorage with backend calls
3. Test file upload flow E2E
4. Test clinical context persistence

### Phase 3: Production Deployment (Week 4)

1. Database migrations
2. Backend deployment
3. Frontend deployment
4. Monitoring and rollback plan

---

## Next Steps

1. **Review this plan** with team and get approval
2. **Create JIRA tickets** for each feature
3. **Set up development environment** (S3 bucket, ClamAV)
4. **Start with Priority 1, Task 1.1** (File upload in chat)
5. **Daily standups** to track progress

---

## Questions for Product Team

1. **File Storage:** S3 vs local filesystem for production?
2. **Clinical Context:** Per-conversation or global per-user?
3. **Citations:** How to handle duplicate citations across messages?
4. **Export:** Email export feature needed?
5. **Folders:** Support nested folders (folders within folders)?

---

**Document Owner:** Backend Team (Claude)
**Last Updated:** 2025-11-23
**Status:** Draft - Awaiting Approval
**Next Review:** 2025-11-24
