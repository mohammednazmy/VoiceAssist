---
title: "Architecture"
slug: "architecture"
summary: "> **⚠️ LEGACY V1 DOCUMENT – NOT CANONICAL FOR V2**"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["architecture"]
category: architecture
---

> **⚠️ LEGACY V1 DOCUMENT – NOT CANONICAL FOR V2**
> This describes the original 20-phase plan.
> For the current architecture and phases, see:
>
> - [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md)
> - [DEVELOPMENT_PHASES_V2.md](DEVELOPMENT_PHASES_V2.md)
> - [START_HERE.md](START_HERE.md)
> - [Implementation Status](overview/IMPLEMENTATION_STATUS.md)

# VoiceAssist Architecture

## System Overview

VoiceAssist uses a distributed architecture with components running on macOS (client), Ubuntu server (backend services), and accessible via web interfaces.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    macOS Client (Local)                      │
│                                                               │
│  ┌─────────────────┐      ┌──────────────────┐             │
│  │  Voice Interface│      │  System Services │             │
│  │  - Wake word    │      │  - Calendar      │             │
│  │  - Realtime API │      │  - Email         │             │
│  │  - Audio stream │      │  - Files         │             │
│  └────────┬────────┘      │  - Reminders     │             │
│           │               └──────────────────┘             │
│           │                                                  │
│  ┌────────┴──────────────────────────────────┐             │
│  │       AI Orchestrator (Python)             │             │
│  │  - Request routing                         │             │
│  │  - Privacy classifier                      │             │
│  │  - Context management                      │             │
│  └────────┬──────────────┬────────────────────┘             │
│           │              │                                   │
│  ┌────────┴────────┐  ┌──┴──────────────┐                  │
│  │  Local LLM      │  │  File Indexer   │                  │
│  │  (Ollama)       │  │  - Vector search│                  │
│  │  - PHI queries  │  │  - Local docs   │                  │
│  └─────────────────┘  └─────────────────┘                  │
└───────────────────────────────┬─────────────────────────────┘
                                │
                    Secure HTTPS (asimo.io)
                                │
┌───────────────────────────────┴─────────────────────────────┐
│              Ubuntu Server (asimo.io)                        │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │              API Gateway (Nginx)                   │     │
│  └─────┬──────────────┬───────────────┬───────────────┘     │
│        │              │               │                      │
│  ┌─────┴──────┐  ┌────┴─────┐  ┌─────┴──────────┐          │
│  │Voice API   │  │Medical KB│  │Admin API       │          │
│  │Service     │  │Service   │  │Service         │          │
│  └────────────┘  └──────────┘  └────────────────┘          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Medical Knowledge Base                     │   │
│  │  ┌────────────────┐  ┌─────────────────────────┐   │   │
│  │  │  Vector DB     │  │  PDF Processing         │   │   │
│  │  │  (Qdrant)      │  │  - Download             │   │   │
│  │  │  - Textbooks   │  │  - OCR                  │   │   │
│  │  │  - Guidelines  │  │  - Indexing             │   │   │
│  │  │  - Journals    │  │  - Storage              │   │   │
│  │  └────────────────┘  └─────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           External Services Integration              │   │
│  │  - PubMed API                                        │   │
│  │  - OpenEvidence API                                  │   │
│  │  - Nextcloud WebDAV                                  │   │
│  │  - Web scraping service                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Data Storage                            │   │
│  │  - PostgreSQL (metadata, users, logs)               │   │
│  │  - Redis (caching, sessions)                         │   │
│  │  - File storage (PDFs, documents)                    │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────┘
                                │
                         HTTPS/WebSocket
                                │
┌───────────────────────────────┴─────────────────────────────┐
│                    Web Clients                               │
│                                                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Web App        │  │  Admin Panel │  │  Docs Site     │ │
│  │  (React)        │  │  (React)     │  │  (Next.js)     │ │
│  │  - Voice/Text   │  │  - Config    │  │  - Guides      │ │
│  │  - Chat UI      │  │  - Analytics │  │  - API docs    │ │
│  └─────────────────┘  └──────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. macOS Client

**Voice Interface**

- Continuous audio monitoring with wake word detection (Porcupine)
- Streams to OpenAI Realtime API when activated
- Low-latency speech-to-speech conversation
- Handles interruptions and natural conversation flow

**AI Orchestrator**

- Routes requests based on privacy classification
- Manages conversation context and history
- Coordinates between local and cloud models
- Implements tool calling for system actions

**Local Processing**

- Ollama for local LLM inference
- Vector search over local files
- System integration via AppleScript/shortcuts
- File system indexing and search

**Implementation**: Python daemon + Swift UI (or Electron)

### 2. Ubuntu Server Services

#### Voice API Service

- WebSocket endpoint for web clients
- Proxy to OpenAI Realtime API
- Session management
- Authentication and authorization

#### Medical Knowledge Base Service

- RAG (Retrieval Augmented Generation) pipeline
- Vector similarity search
- Source citation and metadata tracking
- Periodic knowledge base updates

**APIs:**

- `POST /search` - Search medical knowledge
- `GET /textbook/{id}/section/{section}` - Retrieve textbook content
- `POST /journal/search` - Search medical journals
- `POST /journal/download` - Download and process PDF

#### Admin API Service

- System configuration endpoints
- User management
- Usage analytics
- Model selection and settings
- Integration testing

#### PDF Processing Pipeline

1. Download from PubMed, direct links, or upload
2. Extract text (PyPDF2, pdfplumber)
3. OCR if needed (Tesseract)
4. Chunk content intelligently (by section/paragraph)
5. Generate embeddings (OpenAI embeddings or local model)
6. Store in vector DB with metadata
7. Index in PostgreSQL for traditional search

#### External Service Integrations

**PubMed API**

- Search via E-utilities
- Download abstracts and metadata
- Full-text retrieval from PMC

**OpenEvidence API**

- Evidence summary queries
- Clinical question answering
- Guideline recommendations

**Nextcloud Integration**

- WebDAV for file access
- Automatic indexing of medical notes
- Document backup and sync

### 3. Web Application

**Frontend (React + TypeScript)**

- Chat interface with voice input option
- File upload for analysis
- Source citation display
- Conversation history
- Mobile-responsive design

**Features:**

- Text and voice input modes
- Real-time streaming responses
- Code/markdown rendering
- File attachments
- Export conversations

**Communication:**

- WebSocket for real-time chat
- REST API for file operations
- Audio streaming for voice mode

### 4. Admin Panel

**Dashboard Sections:**

1. **System Overview**
   - Active sessions
   - Resource usage (CPU, memory, GPU)
   - API quota usage
   - Error rates

2. **Configuration**
   - Model selection (local vs cloud)
   - API keys management
   - System integrations on/off
   - Privacy settings

3. **Knowledge Base Management**
   - Upload medical textbooks
   - View indexed documents
   - Trigger re-indexing
   - Delete outdated content

4. **User Management**
   - Access control (if multi-user later)
   - Usage limits
   - Audit logs

5. **Analytics**
   - Query patterns
   - Popular topics
   - Response times
   - Cost analysis (API usage)

### 5. Documentation Site

**Content Structure:**

- Getting started guide
- Installation instructions
- User manual
- Medical features guide
- API documentation (if exposing APIs)
- Troubleshooting
- Architecture diagrams

**Implementation**: Next.js with MDX or Docusaurus

## Data Flow Examples

### Example 1: Voice Query with Local Processing

```
1. User speaks: "What's on my calendar today?"
2. Wake word detected → activate Realtime API
3. Speech streamed to OpenAI → transcribed
4. Orchestrator classifies: LOCAL (calendar is system access)
5. Python script calls macOS Calendar via AppleScript
6. Response generated by local Ollama model
7. TTS via OpenAI → played to user
```

### Example 2: Medical Literature Query

```
1. User: "Find recent papers on GLP-1 agonists for heart failure"
2. Orchestrator classifies: CLOUD (medical research, no PHI)
3. Request sent to Ubuntu server medical-kb service
4. Service queries PubMed API
5. Downloads relevant PDFs from PMC
6. OCR/extract text → generate embeddings
7. Store in vector DB
8. Generate summary with GPT-4
9. Return response with citations
10. Display in UI with PDF links
```

### Example 3: Medical Textbook Query

```
1. User: "What does Harrison's say about diabetic ketoacidosis?"
2. Orchestrator classifies: HYBRID
3. Query vector DB for relevant textbook sections
4. Retrieve top 5 matching chunks with metadata
5. Send chunks + query to GPT-4 for synthesis
6. Response includes: "According to Harrison's, Chapter 420, page 2987..."
7. Return with page references and option to read more
```

## Privacy Architecture

### Data Classification

**Tier 1 - Strictly Local (PHI/Sensitive)**

- Patient notes
- Personal medical records
- Sensitive personal files
- Never sent to external APIs
- Processed by local Ollama only

**Tier 2 - Server (Private but not PHI)**

- Personal documents
- Email content
- Calendar details
- Stored on Ubuntu server
- Not sent to commercial APIs

**Tier 3 - Cloud OK (Public/General Knowledge)**

- Medical literature queries
- General medical questions
- Web searches
- Can use OpenAI/Claude APIs

### Classification Logic

- Keyword detection (patient names, MRN, etc.)
- File path analysis (/Medical-Records/\* = local)
- User tagging (mark conversations as sensitive)
- Default: assume Tier 1 unless explicitly cleared

## Security Considerations

1. **Authentication**
   - API key auth for server communication
   - OAuth for web clients (optional multi-user)
   - mTLS for macOS client ↔ server

2. **Encryption**
   - HTTPS/WSS for all network communication
   - Encrypted storage for sensitive data
   - Encrypted backups to Nextcloud

3. **Access Control**
   - File system permissions
   - API rate limiting
   - Audit logging

4. **HIPAA Considerations**
   - Business Associate Agreements needed if using OpenAI with PHI
   - Current design: never send PHI to OpenAI
   - Document data handling policies

## Scalability Considerations

**Current Design**: Single-user, personal use

**Future Expansion Possibilities**:

- Multi-user support (family members, colleagues)
- Horizontal scaling of server services
- Multiple macOS/iOS clients
- Shared knowledge base with privacy isolation
- Team collaboration features

## Deployment Architecture

### macOS Client

- LaunchAgent for auto-start
- Menu bar app
- System permissions (microphone, accessibility)
- Auto-update mechanism

### Ubuntu Server

- Docker Compose for service orchestration
- Nginx reverse proxy
- Let's Encrypt SSL certificates
- Systemd for service management
- Automated backups

### Monitoring

- Prometheus + Grafana for metrics
- Log aggregation (Loki or ELK)
- Alerting (if server issues)
- Usage tracking (anonymized)

## Technology Choices Rationale

**FastAPI**: Modern, fast, async Python framework with automatic API docs
**PostgreSQL + pgvector**: Mature relational DB with vector extension
**Qdrant/Weaviate**: Purpose-built vector databases for semantic search
**React**: Popular, well-documented, large ecosystem
**Ollama**: Simple local LLM deployment, supports many models
**OpenAI Realtime API**: Best-in-class voice interface, low latency
**Docker**: Consistent deployment, easy service isolation
