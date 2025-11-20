# VoiceAssist V2 - Canonical Data Model

**Last Updated**: 2025-11-20
**Status**: Canonical Reference
**Purpose**: Single source of truth for all data entities across VoiceAssist V2

---

## Overview

This document defines ALL data entities used in VoiceAssist V2. Each entity has:
1. **Purpose** - What the entity represents
2. **Storage Location** - Where data is persisted
3. **Relationships** - How it relates to other entities
4. **Field Definitions** - Required vs optional, types, formats
5. **Three Representations**:
   - **JSON Schema** (language-agnostic, for API contracts)
   - **Pydantic** (Python/FastAPI backend)
   - **TypeScript** (Next.js frontend)

---

## Entity Index

### Core Entities
- [User](#user) - System user (clinician)
- [Session / Conversation](#session--conversation) - Chat conversation container
- [ChatMessage](#chatmessage) - Individual message in conversation
- [ClinicalContext](#clinicalcontext) - Patient context for a session
- [Citation](#citation) - Source reference for an answer

### Knowledge Base Entities
- [KnowledgeDocument](#knowledgedocument) - Top-level document in KB
- [KBChunk](#kbchunk) - Embedded chunk of a document
- [IndexingJob](#indexingjob) - Background job for document processing

### Configuration Entities
- [UserSettings](#usersettings) - Per-user preferences
- [SystemSettings](#systemsettings) - Global system configuration

### Audit & Security
- [AuditLogEntry](#auditlogentry) - Security audit log record

### Tool Invocation
- [ToolCall](#toolcall) - Tool invocation request
- [ToolResult](#toolresult) - Tool execution result (embedded in ToolCall)

---

## Core Entities

### User

**Purpose**: Represents a clinician or administrator using the system.

**Storage**: PostgreSQL (`users` table)

**Relationships**:
- Has many: `Session`, `KnowledgeDocument`, `AuditLogEntry`
- References: `UserSettings` (1:1)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `email` (required, string, unique) - Email address for login
- `username` (required, string, unique) - Username for display
- `hashed_password` (required, string) - Bcrypt hashed password
- `full_name` (optional, string) - Full name
- `specialty` (optional, string) - Medical specialty (e.g., "cardiology")
- `is_active` (required, boolean, default: true) - Account active status
- `is_superuser` (required, boolean, default: false) - Admin privileges
- `created_at` (required, timestamp) - Account creation time
- `updated_at` (required, timestamp) - Last update time
- `last_login` (optional, timestamp) - Last successful login

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Email address"
    },
    "username": {
      "type": "string",
      "minLength": 3,
      "maxLength": 50,
      "description": "Username"
    },
    "hashed_password": {
      "type": "string",
      "description": "Bcrypt hashed password"
    },
    "full_name": {
      "type": "string",
      "description": "Full name"
    },
    "specialty": {
      "type": "string",
      "description": "Medical specialty"
    },
    "is_active": {
      "type": "boolean",
      "default": true
    },
    "is_superuser": {
      "type": "boolean",
      "default": false
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "last_login": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": ["id", "email", "username", "hashed_password", "is_active", "is_superuser", "created_at", "updated_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class User(BaseModel):
    """User entity for clinicians and admins"""
    id: str = Field(..., description="UUID v4 identifier")
    email: EmailStr = Field(..., description="Email address")
    username: str = Field(..., min_length=3, max_length=50)
    hashed_password: str = Field(..., description="Bcrypt hashed password")
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    is_active: bool = True
    is_superuser: bool = False
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export interface User {
  id: string;  // uuid4
  email: string;
  username: string;
  hashedPassword: string;
  fullName?: string;
  specialty?: string;
  isActive: boolean;
  isSuperuser: boolean;
  createdAt: string;  // ISO 8601 timestamp
  updatedAt: string;  // ISO 8601 timestamp
  lastLogin?: string;  // ISO 8601 timestamp
}
```

---

### Session / Conversation

**Purpose**: Container for a chat conversation between user and AI assistant.

**Storage**: PostgreSQL (`sessions` table)

**Relationships**:
- Belongs to: `User`
- Has many: `ChatMessage`
- References: `ClinicalContext` (optional, 1:1)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `user_id` (required, uuid4) - Foreign key to User
- `title` (optional, string) - Conversation title (auto-generated or user-set)
- `mode` (required, enum) - Conversation mode: `text`, `voice`, `case_workspace`
- `is_archived` (required, boolean, default: false) - Archive status
- `created_at` (required, timestamp) - Creation time
- `updated_at` (required, timestamp) - Last message time
- `clinical_context_id` (optional, uuid4) - Foreign key to ClinicalContext

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Session",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "user_id": {"type": "string", "format": "uuid"},
    "title": {"type": "string"},
    "mode": {
      "type": "string",
      "enum": ["text", "voice", "case_workspace"]
    },
    "is_archived": {"type": "boolean", "default": false},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"},
    "clinical_context_id": {"type": "string", "format": "uuid"}
  },
  "required": ["id", "user_id", "mode", "is_archived", "created_at", "updated_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class SessionMode(str, Enum):
    TEXT = "text"
    VOICE = "voice"
    CASE_WORKSPACE = "case_workspace"

class Session(BaseModel):
    """Chat conversation session"""
    id: str = Field(..., description="UUID v4 identifier")
    user_id: str = Field(..., description="User UUID")
    title: Optional[str] = None
    mode: SessionMode
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime
    clinical_context_id: Optional[str] = None

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type SessionMode = 'text' | 'voice' | 'case_workspace';

export interface Session {
  id: string;  // uuid4
  userId: string;  // uuid4
  title?: string;
  mode: SessionMode;
  isArchived: boolean;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
  clinicalContextId?: string;  // uuid4
}
```

---

### ChatMessage

**Purpose**: Individual message in a conversation (user query or AI response).

**Storage**: PostgreSQL (`chat_messages` table)

**Relationships**:
- Belongs to: `Session`
- References: `Citation[]` (embedded in metadata)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `session_id` (required, uuid4) - Foreign key to Session
- `role` (required, enum) - Message role: `user`, `assistant`, `system`
- `content` (required, string) - Message text content
- `audio_url` (optional, string) - URL to audio recording (for voice messages)
- `metadata` (optional, object) - Additional data (citations, tool calls, etc.)
- `created_at` (required, timestamp) - Message creation time

**Metadata Structure**:
```typescript
{
  citations?: Citation[];
  sources_searched?: string[];  // e.g., ["uptodate", "pubmed"]
  model_used?: string;  // e.g., "gpt-4", "llama-3.1-8b"
  tokens?: number;
  cost?: number;
  phi_detected?: boolean;
  routing_decision?: string;
}
```

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatMessage",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "session_id": {"type": "string", "format": "uuid"},
    "role": {
      "type": "string",
      "enum": ["user", "assistant", "system"]
    },
    "content": {"type": "string"},
    "audio_url": {"type": "string", "format": "uri"},
    "metadata": {"type": "object"},
    "created_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "session_id", "role", "content", "created_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class ChatMessage(BaseModel):
    """Individual message in conversation"""
    id: str = Field(..., description="UUID v4 identifier")
    session_id: str = Field(..., description="Session UUID")
    role: MessageRole
    content: str
    audio_url: Optional[HttpUrl] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;  // uuid4
  sessionId: string;  // uuid4
  role: MessageRole;
  content: string;
  audioUrl?: string;
  metadata?: {
    citations?: Citation[];
    sourcesSearched?: string[];
    modelUsed?: string;
    tokens?: number;
    cost?: number;
    phiDetected?: boolean;
    routingDecision?: string;
    [key: string]: any;
  };
  createdAt: string;  // ISO 8601
}
```

---

### ClinicalContext

**Purpose**: Patient or case context for a clinical consultation session.

**Storage**: PostgreSQL (`clinical_contexts` table)

**Relationships**:
- Belongs to: `Session` (1:1)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `session_id` (required, uuid4) - Foreign key to Session
- `patient_age` (optional, integer) - Patient age in years
- `patient_sex` (optional, enum) - `male`, `female`, `other`
- `chief_complaint` (optional, string) - Primary presenting complaint
- `relevant_history` (optional, string) - Relevant medical history
- `current_medications` (optional, array of strings) - List of medications
- `allergies` (optional, array of strings) - Known allergies
- `vital_signs` (optional, object) - BP, HR, temp, etc.
- `created_at` (required, timestamp)
- `updated_at` (required, timestamp)

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClinicalContext",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "session_id": {"type": "string", "format": "uuid"},
    "patient_age": {"type": "integer", "minimum": 0, "maximum": 150},
    "patient_sex": {"type": "string", "enum": ["male", "female", "other"]},
    "chief_complaint": {"type": "string"},
    "relevant_history": {"type": "string"},
    "current_medications": {"type": "array", "items": {"type": "string"}},
    "allergies": {"type": "array", "items": {"type": "string"}},
    "vital_signs": {
      "type": "object",
      "properties": {
        "bp_systolic": {"type": "integer"},
        "bp_diastolic": {"type": "integer"},
        "heart_rate": {"type": "integer"},
        "temperature": {"type": "number"},
        "respiratory_rate": {"type": "integer"},
        "o2_saturation": {"type": "integer"}
      }
    },
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "session_id", "created_at", "updated_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

class PatientSex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class VitalSigns(BaseModel):
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    respiratory_rate: Optional[int] = None
    o2_saturation: Optional[int] = None

class ClinicalContext(BaseModel):
    """Patient/case context for consultation"""
    id: str = Field(..., description="UUID v4 identifier")
    session_id: str = Field(..., description="Session UUID")
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_sex: Optional[PatientSex] = None
    chief_complaint: Optional[str] = None
    relevant_history: Optional[str] = None
    current_medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    vital_signs: Optional[VitalSigns] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type PatientSex = 'male' | 'female' | 'other';

export interface VitalSigns {
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  o2Saturation?: number;
}

export interface ClinicalContext {
  id: string;  // uuid4
  sessionId: string;  // uuid4
  patientAge?: number;
  patientSex?: PatientSex;
  chiefComplaint?: string;
  relevantHistory?: string;
  currentMedications?: string[];
  allergies?: string[];
  vitalSigns?: VitalSigns;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
```

---

### Citation

**Purpose**: Reference to a source document or section that supports an AI-generated answer.

**Storage**: Embedded in `ChatMessage.metadata.citations` (not a separate table)

**Relationships**:
- Embedded in: `ChatMessage`
- References: `KnowledgeDocument.id` (for internal KB) or external identifier

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `source_type` (required, enum) - Type: `textbook`, `journal`, `guideline`, `uptodate`, `pubmed`, `note`
- `source_id` (optional, string) - KB document ID or external reference (PMID, DOI)
- `title` (required, string) - Source title
- `subtitle` (optional, string) - Chapter, section, or article title
- `authors` (optional, array of strings) - Author names
- `publication_year` (optional, integer) - Year published
- `location` (optional, string) - Page, chapter, or section reference (e.g., "ch. 252", "p. 2987")
- `url` (optional, string) - External URL if available
- `doi` (optional, string) - DOI for journal articles
- `snippet` (optional, string) - Relevant excerpt from source (max 500 chars)
- `relevance_score` (optional, float) - Search relevance score (0-1)

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Citation",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "source_type": {
      "type": "string",
      "enum": ["textbook", "journal", "guideline", "uptodate", "pubmed", "note"]
    },
    "source_id": {"type": "string"},
    "title": {"type": "string"},
    "subtitle": {"type": "string"},
    "authors": {"type": "array", "items": {"type": "string"}},
    "publication_year": {"type": "integer"},
    "location": {"type": "string"},
    "url": {"type": "string", "format": "uri"},
    "doi": {"type": "string"},
    "snippet": {"type": "string", "maxLength": 500},
    "relevance_score": {"type": "number", "minimum": 0, "maximum": 1}
  },
  "required": ["id", "source_type", "title"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List
from enum import Enum

class SourceType(str, Enum):
    TEXTBOOK = "textbook"
    JOURNAL = "journal"
    GUIDELINE = "guideline"
    UPTODATE = "uptodate"
    PUBMED = "pubmed"
    NOTE = "note"

class Citation(BaseModel):
    """Source citation for AI responses"""
    id: str = Field(..., description="UUID v4 identifier")
    source_type: SourceType
    source_id: Optional[str] = None
    title: str
    subtitle: Optional[str] = None
    authors: Optional[List[str]] = None
    publication_year: Optional[int] = None
    location: Optional[str] = None
    url: Optional[HttpUrl] = None
    doi: Optional[str] = None
    snippet: Optional[str] = Field(None, max_length=500)
    relevance_score: Optional[float] = Field(None, ge=0.0, le=1.0)
```

#### TypeScript

```typescript
export type SourceType = 'textbook' | 'journal' | 'guideline' | 'uptodate' | 'pubmed' | 'note';

export interface Citation {
  id: string;  // uuid4
  sourceType: SourceType;
  sourceId?: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  publicationYear?: number;
  location?: string;  // e.g., "ch. 252", "p. 2987"
  url?: string;
  doi?: string;
  snippet?: string;  // max 500 chars
  relevanceScore?: number;  // 0-1
}
```

---

## Knowledge Base Entities

### KnowledgeDocument

**Purpose**: Top-level document in the medical knowledge base (textbook, journal, guideline).

**Storage**: PostgreSQL (`knowledge_documents` table)

**Relationships**:
- Belongs to: `User` (uploader)
- Has many: `KBChunk`
- References: `IndexingJob` (processing status)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `user_id` (required, uuid4) - Foreign key to User (uploader)
- `doc_key` (required, string, unique) - Stable idempotency key (e.g., "textbook-harrisons-21e-ch252")
- `content_hash` (required, string) - SHA-256 hash of document content for change detection
- `version` (required, integer, default: 1) - Document version number (increments on re-ingestion)
- `superseded_by` (optional, uuid4) - Reference to newer version if this version is superseded
- `title` (required, string) - Document title
- `document_type` (required, enum) - Type: `textbook`, `journal`, `guideline`, `other`
- `specialty` (optional, string) - Medical specialty
- `file_path` (required, string) - Path to original file
- `file_name` (required, string) - Original filename
- `file_size` (required, integer) - Size in bytes
- `file_format` (required, enum) - Format: `pdf`, `docx`, `txt`, `html`
- `page_count` (optional, integer) - Number of pages
- `authors` (optional, array of strings) - Author names
- `publication_year` (optional, integer) - Year published
- `publisher` (optional, string) - Publisher name
- `edition` (optional, string) - Edition (e.g., "5th")
- `isbn` (optional, string) - ISBN number
- `doi` (optional, string) - DOI
- `is_indexed` (required, boolean, default: false) - Indexing complete?
- `indexing_status` (required, enum) - Status: `pending`, `processing`, `completed`, `failed`
- `chunk_count` (optional, integer) - Number of chunks generated
- `metadata` (optional, object) - Additional metadata
- `created_at` (required, timestamp)
- `updated_at` (required, timestamp)

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KnowledgeDocument",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "user_id": {"type": "string", "format": "uuid"},
    "doc_key": {"type": "string"},
    "content_hash": {"type": "string"},
    "version": {"type": "integer", "default": 1},
    "superseded_by": {"type": "string", "format": "uuid"},
    "title": {"type": "string"},
    "document_type": {
      "type": "string",
      "enum": ["textbook", "journal", "guideline", "other"]
    },
    "specialty": {"type": "string"},
    "file_path": {"type": "string"},
    "file_name": {"type": "string"},
    "file_size": {"type": "integer"},
    "file_format": {
      "type": "string",
      "enum": ["pdf", "docx", "txt", "html"]
    },
    "page_count": {"type": "integer"},
    "authors": {"type": "array", "items": {"type": "string"}},
    "publication_year": {"type": "integer"},
    "publisher": {"type": "string"},
    "edition": {"type": "string"},
    "isbn": {"type": "string"},
    "doi": {"type": "string"},
    "is_indexed": {"type": "boolean", "default": false},
    "indexing_status": {
      "type": "string",
      "enum": ["pending", "processing", "completed", "failed"]
    },
    "chunk_count": {"type": "integer"},
    "metadata": {"type": "object"},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "user_id", "doc_key", "content_hash", "version", "title", "document_type", "file_path", "file_name", "file_size", "file_format", "is_indexed", "indexing_status", "created_at", "updated_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class DocumentType(str, Enum):
    TEXTBOOK = "textbook"
    JOURNAL = "journal"
    GUIDELINE = "guideline"
    OTHER = "other"

class FileFormat(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    HTML = "html"

class IndexingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class KnowledgeDocument(BaseModel):
    """Medical knowledge base document"""
    id: str = Field(..., description="UUID v4 identifier")
    user_id: str = Field(..., description="Uploader UUID")
    doc_key: str = Field(..., description="Stable idempotency key")
    content_hash: str = Field(..., description="SHA-256 hash of content")
    version: int = Field(default=1, description="Document version number")
    superseded_by: Optional[str] = Field(None, description="UUID of newer version")
    title: str
    document_type: DocumentType
    specialty: Optional[str] = None
    file_path: str
    file_name: str
    file_size: int
    file_format: FileFormat
    page_count: Optional[int] = None
    authors: Optional[List[str]] = None
    publication_year: Optional[int] = None
    publisher: Optional[str] = None
    edition: Optional[str] = None
    isbn: Optional[str] = None
    doi: Optional[str] = None
    is_indexed: bool = False
    indexing_status: IndexingStatus = IndexingStatus.PENDING
    chunk_count: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type DocumentType = 'textbook' | 'journal' | 'guideline' | 'other';
export type FileFormat = 'pdf' | 'docx' | 'txt' | 'html';
export type IndexingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeDocument {
  id: string;  // uuid4
  userId: string;  // uuid4
  docKey: string;  // Stable idempotency key
  contentHash: string;  // SHA-256 hash
  version: number;  // Version number (default: 1)
  supersededBy?: string;  // uuid4 of newer version
  title: string;
  documentType: DocumentType;
  specialty?: string;
  filePath: string;
  fileName: string;
  fileSize: number;  // bytes
  fileFormat: FileFormat;
  pageCount?: number;
  authors?: string[];
  publicationYear?: number;
  publisher?: string;
  edition?: string;
  isbn?: string;
  doi?: string;
  isIndexed: boolean;
  indexingStatus: IndexingStatus;
  chunkCount?: number;
  metadata?: Record<string, any>;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
```

---

### KBChunk

**Purpose**: Embedded text chunk of a document for vector search and RAG.

**Storage**:
- PostgreSQL (`kb_chunks` table) - Metadata
- Qdrant (`medical_knowledge` collection) - Vector embeddings

**Relationships**:
- Belongs to: `KnowledgeDocument`

**Fields** (PostgreSQL):
- `id` (required, uuid4) - Unique identifier
- `document_id` (required, uuid4) - Foreign key to KnowledgeDocument
- `chunk_index` (required, integer) - Order within document (0-based)
- `content` (required, text) - Chunk text content
- `page_number` (optional, integer) - Page number in original document
- `chapter` (optional, string) - Chapter or section name
- `heading` (optional, string) - Section heading
- `token_count` (required, integer) - Number of tokens
- `qdrant_id` (required, string) - Point ID in Qdrant collection
- `embedding_model` (required, string) - Model used for embedding
- `superseded` (required, boolean, default: false) - Whether this chunk is superseded by a newer version
- `created_at` (required, timestamp)

**Fields** (Qdrant Point):
- `id` (string) - Same as `qdrant_id` in PostgreSQL
- `vector` (array of floats) - Embedding vector (dimensions: 3072 for text-embedding-3-large)
- `payload` (object):
  - `document_id` (uuid4)
  - `chunk_id` (uuid4) - Same as PostgreSQL `id`
  - `content` (string)
  - `page_number` (integer)
  - `chapter` (string)
  - `document_title` (string)
  - `document_type` (string)
  - `specialty` (string)
  - `authors` (array of strings)
  - `publication_year` (integer)

#### JSON Schema (PostgreSQL)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KBChunk",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "document_id": {"type": "string", "format": "uuid"},
    "chunk_index": {"type": "integer", "minimum": 0},
    "content": {"type": "string"},
    "page_number": {"type": "integer"},
    "chapter": {"type": "string"},
    "heading": {"type": "string"},
    "token_count": {"type": "integer"},
    "qdrant_id": {"type": "string"},
    "embedding_model": {"type": "string"},
    "superseded": {"type": "boolean", "default": false},
    "created_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "document_id", "chunk_index", "content", "token_count", "qdrant_id", "embedding_model", "superseded", "created_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class KBChunk(BaseModel):
    """Knowledge base document chunk"""
    id: str = Field(..., description="UUID v4 identifier")
    document_id: str = Field(..., description="Document UUID")
    chunk_index: int = Field(..., ge=0)
    content: str
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    heading: Optional[str] = None
    token_count: int
    qdrant_id: str
    embedding_model: str
    superseded: bool = Field(default=False, description="Whether chunk is superseded")
    created_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export interface KBChunk {
  id: string;  // uuid4
  documentId: string;  // uuid4
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  chapter?: string;
  heading?: string;
  tokenCount: number;
  qdrantId: string;
  embeddingModel: string;
  superseded: boolean;  // Whether chunk is superseded (default: false)
  createdAt: string;  // ISO 8601
}

// Qdrant Point Payload
export interface QdrantPayload {
  documentId: string;  // uuid4
  chunkId: string;  // uuid4
  content: string;
  pageNumber?: number;
  chapter?: string;
  documentTitle: string;
  documentType: string;
  specialty?: string;
  authors?: string[];
  publicationYear?: number;
}
```

---

### IndexingJob

**Purpose**: Background job for processing and indexing uploaded documents.

**Storage**: PostgreSQL (`indexing_jobs` table)

**Relationships**:
- References: `KnowledgeDocument`
- References: `User` (job creator)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `document_id` (required, uuid4) - Foreign key to KnowledgeDocument
- `doc_key` (required, string) - Document key reference for tracking
- `user_id` (required, uuid4) - Foreign key to User
- `state` (required, enum) - State: `pending`, `running`, `completed`, `failed`, `superseded`
- `status` (optional, enum) - Legacy status field (deprecated, use `state`)
- `progress` (optional, float) - Progress percentage (0-100) - deprecated in favor of processed_chunks/total_chunks
- `current_step` (optional, string) - Current processing step
- `total_chunks` (optional, integer) - Total chunks to process
- `processed_chunks` (required, integer, default: 0) - Chunks processed so far
- `chunks_created` (optional, integer) - Number of chunks created (deprecated, use processed_chunks)
- `retry_count` (required, integer, default: 0) - Number of retry attempts
- `max_retries` (required, integer, default: 3) - Maximum retry attempts allowed
- `error_message` (optional, string) - Error message if failed
- `error_details` (optional, object) - Additional error context (stack trace, etc.)
- `superseded_by` (optional, string) - ID of newer job that supersedes this one
- `started_at` (optional, timestamp) - Job start time
- `completed_at` (optional, timestamp) - Job completion time
- `failed_at` (optional, timestamp) - Job failure time
- `created_at` (required, timestamp)
- `updated_at` (required, timestamp)

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "IndexingJob",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "document_id": {"type": "string", "format": "uuid"},
    "doc_key": {"type": "string"},
    "user_id": {"type": "string", "format": "uuid"},
    "state": {
      "type": "string",
      "enum": ["pending", "running", "completed", "failed", "superseded"]
    },
    "status": {
      "type": "string",
      "enum": ["pending", "processing", "completed", "failed"]
    },
    "progress": {"type": "number", "minimum": 0, "maximum": 100},
    "current_step": {"type": "string"},
    "total_chunks": {"type": "integer"},
    "processed_chunks": {"type": "integer", "default": 0},
    "chunks_created": {"type": "integer"},
    "retry_count": {"type": "integer", "default": 0},
    "max_retries": {"type": "integer", "default": 3},
    "error_message": {"type": "string"},
    "error_details": {"type": "object"},
    "superseded_by": {"type": "string"},
    "started_at": {"type": "string", "format": "date-time"},
    "completed_at": {"type": "string", "format": "date-time"},
    "failed_at": {"type": "string", "format": "date-time"},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "document_id", "doc_key", "user_id", "state", "processed_chunks", "retry_count", "max_retries", "created_at", "updated_at"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class JobStatus(str, Enum):
    """Legacy status enum - use JobState instead"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class JobState(str, Enum):
    """Job state enum with superseded support"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SUPERSEDED = "superseded"

class IndexingJob(BaseModel):
    """Background document indexing job"""
    id: str = Field(..., description="UUID v4 identifier")
    document_id: str = Field(..., description="Document UUID")
    doc_key: str = Field(..., description="Document key reference")
    user_id: str = Field(..., description="User UUID")
    state: JobState = Field(..., description="Job state")
    status: Optional[JobStatus] = Field(None, description="Legacy status (deprecated)")
    progress: Optional[float] = Field(None, ge=0.0, le=100.0, description="Progress percentage (deprecated)")
    current_step: Optional[str] = None
    total_chunks: Optional[int] = Field(None, description="Total chunks to process")
    processed_chunks: int = Field(default=0, description="Chunks processed")
    chunks_created: Optional[int] = Field(None, description="Chunks created (deprecated)")
    retry_count: int = Field(default=0, description="Number of retries")
    max_retries: int = Field(default=3, description="Max retry attempts")
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    superseded_by: Optional[str] = Field(None, description="ID of newer job")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
// Legacy status enum - use JobState instead
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Job state enum with superseded support
export type JobState = 'pending' | 'running' | 'completed' | 'failed' | 'superseded';

export interface IndexingJob {
  id: string;  // uuid4
  documentId: string;  // uuid4
  docKey: string;  // Document key reference
  userId: string;  // uuid4
  state: JobState;  // Current job state
  status?: JobStatus;  // Legacy status (deprecated)
  progress?: number;  // 0-100 (deprecated, use processedChunks/totalChunks)
  currentStep?: string;
  totalChunks?: number;  // Total chunks to process
  processedChunks: number;  // Chunks processed (default: 0)
  chunksCreated?: number;  // Deprecated, use processedChunks
  retryCount: number;  // Number of retries (default: 0)
  maxRetries: number;  // Max retry attempts (default: 3)
  errorMessage?: string;
  errorDetails?: Record<string, any>;  // Additional error context
  supersededBy?: string;  // ID of newer job
  startedAt?: string;  // ISO 8601
  completedAt?: string;  // ISO 8601
  failedAt?: string;  // ISO 8601
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
```

---

## Configuration Entities

### UserSettings

**Purpose**: Per-user preferences and configuration (see WEB_APP_SPECS.md for complete details).

**Storage**: PostgreSQL (`user_settings` table)

**Relationships**:
- Belongs to: `User` (1:1)

**Fields**:
See [WEB_APP_SPECS.md - User Settings Section](WEB_APP_SPECS.md#user-settings--preferences) for complete field definitions.

**Summary**:
- General (language, timezone, theme)
- Voice (input device, activation mode, TTS settings)
- Citations (display style, priority sources)
- Display (font size, spacing, animations)
- Clinical Context (specialty, practice type)
- Privacy (query logging, PHI detection)
- Notifications (email, in-app, digest)
- Shortcuts (keyboard shortcuts)
- Advanced (experimental features)

#### TypeScript (Summary)

```typescript
export interface UserSettings {
  id: string;  // uuid4
  userId: string;  // uuid4
  general: GeneralSettings;
  voice: VoiceSettings;
  citations: CitationSettings;
  display: DisplaySettings;
  clinicalContext: ClinicalContextSettings;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  shortcuts: ShortcutSettings;
  advanced: AdvancedSettings;
  createdAt: string;
  updatedAt: string;
}
```

**Full Definition**: See [WEB_APP_SPECS.md](WEB_APP_SPECS.md#user-settings--preferences)

---

### SystemSettings

**Purpose**: Global system configuration (see ADMIN_PANEL_SPECS.md for complete details).

**Storage**: PostgreSQL (`system_settings` table) + file backup at `/etc/voiceassist/system.json`

**Relationships**: None (singleton, only one record)

**Fields**:
See [ADMIN_PANEL_SPECS.md - System Settings Section](ADMIN_PANEL_SPECS.md#system-settings-interface) for complete field definitions.

**Summary**:
- General (system name, maintenance mode)
- Data Retention (log retention, auto-cleanup)
- Backup (schedule, retention, encryption)
- AI Configuration (model selection, routing strategy, rate limits)
- Logging (level, destinations, PHI redaction)
- Security (MFA enforcement, session timeout)
- Email (SMTP configuration)
- Feature Flags (enable/disable features)
- Resource Limits (per-user quotas)

#### TypeScript (Summary)

```typescript
export interface SystemSettings {
  id: string;  // uuid4
  general: GeneralSystemSettings;
  dataRetention: DataRetentionSettings;
  backup: BackupSettings;
  aiConfiguration: AIConfigurationSettings;
  logging: LoggingSettings;
  security: SecuritySettings;
  email: EmailSettings;
  featureFlags: FeatureFlagsSettings;
  resourceLimits: ResourceLimitsSettings;
  createdAt: string;
  updatedAt: string;
}
```

**Full Definition**: See [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md#system-settings-interface)

---

## Audit & Security

### AuditLogEntry

**Purpose**: Security audit log for all system actions requiring HIPAA compliance.

**Storage**: PostgreSQL (`audit_logs` table) with append-only, no delete permissions

**Relationships**:
- References: `User` (actor)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `user_id` (optional, uuid4) - Foreign key to User (null for system actions)
- `action` (required, string) - Action type (e.g., "user.login", "document.upload", "query.execute")
- `resource_type` (required, string) - Resource affected (e.g., "user", "document", "session")
- `resource_id` (optional, string) - ID of affected resource
- `status` (required, enum) - Status: `success`, `failure`, `denied`
- `ip_address` (required, string) - Client IP address
- `user_agent` (optional, string) - Client user agent
- `details` (optional, object) - Additional context (PHI-redacted)
- `phi_accessed` (required, boolean, default: false) - Was PHI accessed?
- `timestamp` (required, timestamp) - Event timestamp
- `session_id` (optional, string) - Session identifier

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AuditLogEntry",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "user_id": {"type": "string", "format": "uuid"},
    "action": {"type": "string"},
    "resource_type": {"type": "string"},
    "resource_id": {"type": "string"},
    "status": {
      "type": "string",
      "enum": ["success", "failure", "denied"]
    },
    "ip_address": {"type": "string"},
    "user_agent": {"type": "string"},
    "details": {"type": "object"},
    "phi_accessed": {"type": "boolean", "default": false},
    "timestamp": {"type": "string", "format": "date-time"},
    "session_id": {"type": "string"}
  },
  "required": ["id", "action", "resource_type", "status", "ip_address", "phi_accessed", "timestamp"]
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field, IPvAnyAddress
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class AuditStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    DENIED = "denied"

class AuditLogEntry(BaseModel):
    """HIPAA-compliant audit log entry"""
    id: str = Field(..., description="UUID v4 identifier")
    user_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    status: AuditStatus
    ip_address: str
    user_agent: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    phi_accessed: bool = False
    timestamp: datetime
    session_id: Optional[str] = None

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type AuditStatus = 'success' | 'failure' | 'denied';

export interface AuditLogEntry {
  id: string;  // uuid4
  userId?: string;  // uuid4
  action: string;  // e.g., "user.login", "document.upload"
  resourceType: string;  // e.g., "user", "document"
  resourceId?: string;
  status: AuditStatus;
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;  // PHI-redacted
  phiAccessed: boolean;
  timestamp: string;  // ISO 8601
  sessionId?: string;
}
```

---

## Tool Invocation Entities

### ToolCall

**Purpose**: Record of a tool invocation request and its result. Used for audit trail, debugging, and analytics.

**Storage**: PostgreSQL (`tool_calls` table)

**Relationships**:
- References: `User` (executor), `Session` (conversation context)

**Fields**:
- `id` (required, uuid4) - Unique identifier
- `session_id` (required, uuid4) - Foreign key to Session
- `user_id` (required, uuid4) - Foreign key to User
- `tool_name` (required, string) - Tool that was called (e.g., "get_calendar_events")
- `arguments` (required, object) - Tool arguments (JSON)
- `result` (optional, ToolResult) - Tool execution result (embedded)
- `status` (required, enum) - Status: `pending`, `success`, `error`, `denied`, `timeout`
- `confirmation_required` (required, boolean) - Was user confirmation required?
- `user_confirmed` (optional, boolean) - Did user confirm? (null if no confirmation needed)
- `phi_involved` (required, boolean) - Did tool process PHI?
- `execution_time_ms` (optional, float) - Execution time in milliseconds
- `error_message` (optional, string) - Error message if failed
- `trace_id` (required, string) - Distributed tracing ID
- `timestamp` (required, timestamp) - Call timestamp
- `created_at` (required, timestamp) - Record creation time

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ToolCall",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "session_id": {"type": "string", "format": "uuid"},
    "user_id": {"type": "string", "format": "uuid"},
    "tool_name": {
      "type": "string",
      "description": "Tool name from TOOL_REGISTRY"
    },
    "arguments": {
      "type": "object",
      "description": "Tool arguments (validated against tool schema)"
    },
    "result": {
      "$ref": "#/definitions/ToolResult",
      "description": "Tool execution result (embedded)"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "success", "error", "denied", "timeout"]
    },
    "confirmation_required": {"type": "boolean"},
    "user_confirmed": {"type": "boolean"},
    "phi_involved": {"type": "boolean"},
    "execution_time_ms": {"type": "number"},
    "error_message": {"type": "string"},
    "trace_id": {"type": "string"},
    "timestamp": {"type": "string", "format": "date-time"},
    "created_at": {"type": "string", "format": "date-time"}
  },
  "required": ["id", "session_id", "user_id", "tool_name", "arguments", "status", "confirmation_required", "phi_involved", "trace_id", "timestamp", "created_at"],
  "definitions": {
    "ToolResult": {
      "type": "object",
      "properties": {
        "success": {"type": "boolean"},
        "result": {"type": "object"},
        "error": {"type": "string"},
        "execution_time_ms": {"type": "number"},
        "citations": {
          "type": "array",
          "items": {"type": "object"}
        }
      },
      "required": ["success", "execution_time_ms"]
    }
  }
}
```

#### Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class ToolCallStatus(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    ERROR = "error"
    DENIED = "denied"
    TIMEOUT = "timeout"

class ToolResult(BaseModel):
    """Tool execution result (embedded in ToolCall)"""
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: float
    citations: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class ToolCall(BaseModel):
    """Tool invocation record"""
    id: str = Field(..., description="UUID v4 identifier")
    session_id: str
    user_id: str
    tool_name: str
    arguments: Dict[str, Any]
    result: Optional[ToolResult] = None
    status: ToolCallStatus
    confirmation_required: bool
    user_confirmed: Optional[bool] = None
    phi_involved: bool
    execution_time_ms: Optional[float] = None
    error_message: Optional[str] = None
    trace_id: str
    timestamp: datetime
    created_at: datetime

    class Config:
        from_attributes = True
```

#### TypeScript

```typescript
export type ToolCallStatus = 'pending' | 'success' | 'error' | 'denied' | 'timeout';

export interface ToolResult {
  success: boolean;
  result?: Record<string, any>;
  error?: string;
  executionTimeMs: float;
  citations?: Citation[];
}

export interface ToolCall {
  id: string;  // uuid4
  sessionId: string;  // uuid4
  userId: string;  // uuid4
  toolName: string;  // e.g., "get_calendar_events"
  arguments: Record<string, any>;
  result?: ToolResult;
  status: ToolCallStatus;
  confirmationRequired: boolean;
  userConfirmed?: boolean;
  phiInvolved: boolean;
  executionTimeMs?: number;
  errorMessage?: string;
  traceId: string;
  timestamp: string;  // ISO 8601
  createdAt: string;  // ISO 8601
}
```

### ToolResult

**Purpose**: Result from a tool execution. Embedded within ToolCall entity.

**Storage**: Embedded in ToolCall (not a separate table)

**Note**: See ToolResult definition in ToolCall entity above. This is NOT stored as a separate entity, but as a JSON field within the `tool_calls` table.

**Fields**:
- `success` (required, boolean) - Did tool execute successfully?
- `result` (optional, object) - Tool result data (structure depends on tool)
- `error` (optional, string) - Error message if failed
- `execution_time_ms` (required, float) - Execution time in milliseconds
- `citations` (optional, array) - Citations if tool returns citable content

---

## Entity Relationship Diagram

```
User (1) ───────< (N) Session (1) ────────< (N) ChatMessage
  │                    │                           │
  │                    ├──── (1:1) ClinicalContext │
  │                    │                           │
  │                    └────< (N) ToolCall ────────┘ (references session & user)
  │
  ├────< (N) KnowledgeDocument (1) ───────< (N) KBChunk
  │                    │                           │
  │                    └──< (1) IndexingJob        │
  │                                                  │
  ├──── (1:1) UserSettings                         │
  │                                                  │
  └────< (N) AuditLogEntry                         │
                                                     │
SystemSettings (singleton)                          │
                                                     │
                                    Qdrant Vector DB ┘
                                    (embeddings)

ToolResult (embedded in ToolCall, not separate entity)
```

---

## Storage Summary

| Entity | PostgreSQL Table | Qdrant Collection | Redis Cache | Notes |
|--------|------------------|-------------------|-------------|-------|
| User | `users` | - | Session tokens | Primary storage: PostgreSQL |
| Session | `sessions` | - | Active sessions | Cache for quick lookup |
| ChatMessage | `chat_messages` | - | Recent messages | Citations embedded in metadata |
| ClinicalContext | `clinical_contexts` | - | - | 1:1 with Session |
| Citation | Embedded in ChatMessage | - | - | Not a separate table |
| KnowledgeDocument | `knowledge_documents` | - | - | Metadata only |
| KBChunk | `kb_chunks` | `medical_knowledge` | - | Text in PostgreSQL, vectors in Qdrant |
| IndexingJob | `indexing_jobs` | - | Job status | Background processing |
| UserSettings | `user_settings` | - | Settings cache | Per-user preferences |
| SystemSettings | `system_settings` | - | Settings cache | Singleton, file backup |
| AuditLogEntry | `audit_logs` | - | - | Append-only, HIPAA compliance |
| ToolCall | `tool_calls` | - | - | Tool invocation audit trail |
| ToolResult | Embedded in ToolCall | - | - | Not a separate table (JSON field in tool_calls) |

---

## Usage Guidelines

### For Backend Developers (Python/FastAPI)

1. **Import from this document**: All Pydantic models should match these definitions
2. **SQLAlchemy Models**: Create from Pydantic models using `from_attributes = True`
3. **API Responses**: Use Pydantic models for serialization
4. **Validation**: Pydantic handles validation automatically

**Example**:
```python
from app.models.data_model import User, Session, ChatMessage

# SQLAlchemy model inherits from Pydantic
class UserDB(User):
    class Config:
        from_attributes = True
```

### For Frontend Developers (TypeScript/Next.js)

1. **Import types**: Copy TypeScript interfaces to your project
2. **API Client**: Use types for request/response typing
3. **State Management**: Use types in Zustand/Redux stores
4. **Forms**: Use types for form validation (Zod, Yup)

**Example**:
```typescript
import { User, Session, ChatMessage } from '@/types/data-model';

// API call with types
async function getSession(id: string): Promise<Session> {
  const response = await fetch(`/api/sessions/${id}`);
  return response.json();
}
```

### For Database Administrators

1. **PostgreSQL Schema**: Use JSON Schema definitions for table design
2. **Indexes**: Create indexes on foreign keys and frequently queried fields
3. **Constraints**: Enforce required fields, unique constraints, enums
4. **Migrations**: Use Alembic for schema changes

### For API Consumers

1. **JSON Schema**: Use for contract validation (OpenAPI/Swagger)
2. **Validation**: Validate requests/responses against schemas
3. **Documentation**: Generate API docs from schemas

---

## Maintenance

### Updating This Document

When adding or modifying entities:

1. Update all three representations (JSON Schema, Pydantic, TypeScript)
2. Update Entity Index
3. Update Entity Relationship Diagram
4. Update Storage Summary
5. Reference this document in WEB_APP_SPECS.md, ADMIN_PANEL_SPECS.md, SEMANTIC_SEARCH_DESIGN.md
6. Notify all developers of changes

### Version Control

- This document is the **single source of truth**
- All changes must be reviewed by tech lead
- Major changes require migration plan

---

## References

- [WEB_APP_SPECS.md](WEB_APP_SPECS.md) - User settings, clinical workflows
- [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md) - System settings, admin features
- [SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md) - Knowledge base entities
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - Audit logging requirements
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture
