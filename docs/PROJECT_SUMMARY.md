---
title: Project Summary
slug: project-summary
summary: >-
  VoiceAssist is a comprehensive AI assistant system designed specifically for
  medical professionals. It combines voice and text interfaces with special...
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - project
  - summary
category: reference
component: "docs/overview"
relatedPaths:
  - "docs/START_HERE.md"
ai_summary: >-
  VoiceAssist is a comprehensive AI assistant system designed specifically for
  medical professionals. It combines voice and text interfaces with specialized
  medical knowledge retrieval, system integrations, and privacy-conscious
  architecture. 1. Medical Specialization: Access to medical textbooks,...
---

# VoiceAssist Project Summary

## Executive Overview

VoiceAssist is a comprehensive AI assistant system designed specifically for medical professionals. It combines voice and text interfaces with specialized medical knowledge retrieval, system integrations, and privacy-conscious architecture.

### Key Differentiators

1. **Medical Specialization**: Access to medical textbooks, journals, clinical guidelines
2. **Hybrid AI Architecture**: Local models for privacy + cloud APIs for power
3. **Always-On Voice**: Natural conversation with wake word activation
4. **System Integration**: Calendar, email, files, reminders, notes
5. **Privacy-First**: HIPAA-conscious design, PHI stays local
6. **Multi-Platform**: macOS native, web, iOS (planned)

## System Architecture at a Glance

```
┌──────────────────────────────────────────────────────────┐
│                   User Interfaces                         │
│  macOS Client | Web App | iOS App (future) | Admin Panel │
└────────────────────────┬─────────────────────────────────┘
                         │
                    HTTPS/WSS
                         │
┌────────────────────────┴─────────────────────────────────┐
│              Ubuntu Server (asimo.io)                     │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  API Server  │  │  Medical KB  │  │  Integrations  │ │
│  │  (FastAPI)   │  │  (RAG/Vector)│  │  (Nextcloud    │ │
│  │              │  │              │  │   PubMed, etc) │ │
│  └──────────────┘  └──────────────┘  └────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Data Layer: PostgreSQL + Redis + Qdrant              ││
│  └──────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

## Technology Stack Summary

### Backend

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Databases**: PostgreSQL (pgvector), Redis, Qdrant
- **Task Queue**: Celery
- **Server**: Nginx, Docker, Ubuntu 20.04+

### Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui, Tremor (admin)
- **State**: Zustand
- **Communication**: WebSocket, REST

### AI/ML

- **Cloud**: OpenAI GPT-4, OpenAI Realtime API
- **Local**: Ollama (Llama 3.1)
- **Embeddings**: OpenAI text-embedding-3-large
- **Voice**: OpenAI Realtime API, Porcupine (wake word)

### Infrastructure

- **Hosting**: Ubuntu server at asimo.io
- **Reverse Proxy**: Nginx
- **SSL**: Let's Encrypt
- **Containerization**: Docker
- **Monitoring**: Prometheus + Grafana (planned)

## Component Breakdown

### 1. Ubuntu Server (asimo.io)

**Purpose**: Central backend services, medical knowledge base, integrations

**Services**:

- Voice API (port 8001) - WebSocket proxy to OpenAI Realtime
- Medical KB API (port 8002) - RAG and literature search
- Main API (port 8000) - Chat, auth, general endpoints
- Admin API (port 8003) - System management

**Subdomains**:

- `voice.asimo.io` - Voice service
- `medical-kb.asimo.io` - Medical knowledge
- `voiceassist.asimo.io` - Main web app
- `admin.asimo.io` - Admin panel
- `docs-voice.asimo.io` - Documentation

### 2. macOS Native Client

**Purpose**: Always-on voice assistant with system integration

**Features**:

- Wake word detection (Porcupine)
- Menu bar application
- Local LLM (Ollama)
- File system indexing
- macOS system integrations (Calendar, Mail, Files, etc.)
- Privacy classification

**Tech**: Python + Swift/SwiftUI (or Electron)

### 3. Web Application

**Purpose**: Browser-based access from any device

**Features**:

- Text and voice chat
- File uploads
- Citation display
- Conversation history
- Responsive design

**Tech**: React + TypeScript + Vite

### 4. Admin Panel

**Purpose**: System management and monitoring

**Features**:

- Real-time dashboard
- AI model configuration
- Knowledge base management
- Integration control
- Analytics and logs
- Backup management

**Tech**: React + TypeScript + Tremor

### 5. Documentation Site

**Purpose**: User and admin documentation

**Features**:

- User guides
- Medical features documentation
- API reference
- Troubleshooting
- Search

**Tech**: Next.js + MDX

## Medical Features

### Medical Textbook Knowledge Base

- Upload PDFs of medical textbooks
- Automatic indexing with RAG
- Semantic search with citations
- Page-level references
- Voice narration

**Example Sources**:

- Harrison's Internal Medicine
- Robbins Pathology
- UpToDate (if subscription)
- Specialty textbooks

### Medical Journal Search

- PubMed API integration
- Automatic PDF download (PMC)
- Full-text indexing
- Evidence synthesis
- Citation formatting

### Clinical Guidelines

- CDC, WHO, specialty societies
- Automatic updates
- Version tracking
- Recommendation strength

### OpenEvidence Integration

- Clinical question answering
- Evidence summaries
- Cross-reference with literature

### Medical Calculators

- CHA2DS2-VASc, HAS-BLED, etc.
- Voice-activated
- Integrated with guidelines

## Privacy & Security Architecture

### Data Classification Tiers

**Tier 1 - Strictly Local (PHI)**

- Patient notes, medical records
- Sensitive personal files
- Never sent to external APIs
- Processed by local Ollama only

**Tier 2 - Server (Private)**

- Personal documents
- Email/calendar
- Stored on Ubuntu server
- Not sent to commercial APIs

**Tier 3 - Cloud OK (Public)**

- Medical literature queries
- General medical knowledge
- Web searches
- Can use OpenAI/Claude

### Privacy Mechanisms

- Automatic PHI detection (keywords, patterns)
- File path classification
- User-marked sensitivity
- Default to strictest tier
- Audit logging

### Security Measures

- HTTPS/WSS only
- JWT authentication
- API rate limiting
- Encrypted storage
- Regular backups to Nextcloud
- Firewall (UFW)
- SSL certificates (Let's Encrypt)

## Development Roadmap

### Phase 1: Foundation (Weeks 1-2)

- Ubuntu server setup
- Docker, PostgreSQL, Redis, Qdrant
- Subdomain configuration
- SSL certificates
- Basic FastAPI structure

### Phase 2: Core Voice Interface (Weeks 3-4)

- macOS client setup
- Wake word detection
- OpenAI Realtime API integration
- Basic orchestrator
- LaunchAgent auto-start

### Phase 3: Local AI & System Integration (Weeks 5-6)

- Ollama setup and integration
- macOS system integrations (Calendar, Mail, Files, etc.)
- Local file indexing
- Privacy classifier

### Phase 4: Medical Knowledge Base (Weeks 7-9)

- Vector database (Qdrant)
- PDF processing pipeline
- RAG system
- PubMed API integration
- Textbook indexing
- Guidelines scraping

### Phase 5: Web Application (Weeks 10-12)

- React app setup
- Chat interface with streaming
- Voice integration (Web Audio)
- File upload
- Responsive design

### Phase 6: Admin Panel (Weeks 13-14)

- Dashboard with real-time metrics
- Model configuration UI
- Knowledge base management
- Integration controls
- Analytics and logs

### Phase 7: Nextcloud Integration (Week 15)

- WebDAV integration
- Auto-indexing
- Backup integration

### Phase 8: Documentation Site (Week 16)

- Next.js site setup
- Content creation
- Search integration
- Deployment

### Phase 9: Testing & Refinement (Weeks 17-18)

- Integration testing
- Performance optimization
- Security audit
- Bug fixes

### Phase 10: iOS Support (Weeks 19-21) - Optional

- iOS app development
- Or Shortcuts integration

## Key Files Reference

### Documentation

- [README.md](../README.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture
- [ROADMAP.md](./ROADMAP.md) - Development plan
- [MEDICAL_FEATURES.md](./MEDICAL_FEATURES.md) - Medical capabilities
- [INFRASTRUCTURE_SETUP.md](./INFRASTRUCTURE_SETUP.md) - Server setup guide
- [WEB_APP_SPECS.md](./WEB_APP_SPECS.md) - Web app specifications
- [ADMIN_PANEL_SPECS.md](./ADMIN_PANEL_SPECS.md) - Admin panel specs
- [DOCUMENTATION_SITE_SPECS.md](./DOCUMENTATION_SITE_SPECS.md) - Docs site specs

### Component READMEs

- [server/README.md](../server/README.md) - Backend server
- [macos-client/README.md](../macos-client/README.md) - macOS client
- [apps/web-app/README.md](../apps/web-app/README.md) - Web application
- [apps/admin-panel/README.md](../apps/admin-panel/README.md) - Admin panel
- [apps/docs-site/README.md](../apps/docs-site/README.md) - Documentation site

## Quick Start Commands

### Server Setup (Ubuntu)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Redis
sudo apt install redis-server

# Clone and setup
cd ~/VoiceAssist/server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start services
uvicorn app.main:app --reload
```

### macOS Client Setup

```bash
# Install Ollama
brew install ollama

# Download model
ollama pull llama3.1:8b

# Setup client
cd ~/VoiceAssist/macos-client
pip3 install -r requirements.txt

# Run
python3 main.py
```

### Web App Development

```bash
cd ~/VoiceAssist/apps/web-app
npm install
npm run dev
```

### Admin Panel Development

```bash
cd ~/VoiceAssist/apps/admin-panel
npm install
npm run dev
```

### Documentation Site

```bash
cd ~/VoiceAssist/apps/docs-site
npm install
npm run dev
```

## Environment Variables Quick Reference

### Server (.env)

```bash
DATABASE_URL=postgresql://user:pass@localhost/voiceassist
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...
SECRET_KEY=...
JWT_SECRET=...
```

### macOS Client (.env)

```bash
SERVER_URL=https://voice.asimo.io
PORCUPINE_ACCESS_KEY=...
OPENAI_API_KEY=sk-...
OLLAMA_URL=http://localhost:11434
WAKE_WORD=computer
```

### Web Apps (.env.local)

```bash
VITE_API_URL=https://voice.asimo.io
VITE_WS_URL=wss://voice.asimo.io/ws
VITE_ENV=development
```

## Success Metrics

### Performance Targets

- Voice activation latency: < 500ms
- Response time (simple): < 2s
- Medical search (with RAG): < 5s
- Uptime: > 99.5%
- Voice recognition accuracy: > 95%

### Quality Targets

- Citation accuracy: 100%
- PHI leakage: 0 incidents
- User satisfaction: High

## Cost Estimates (Monthly)

### Cloud Services

- OpenAI API (GPT-4): ~$40-60
- OpenAI Realtime API: ~$10-20
- OpenAI Embeddings: ~$5-10
- OpenEvidence: ~$10 (subscription)

### Infrastructure

- Server: $0 (owned)
- Domain: $15/year
- SSL: $0 (Let's Encrypt)

**Total Monthly**: ~$60-100

### Cost Optimization

- Use local model for routine queries
- Batch embedding generation
- Cache common responses
- Implement request deduplication

## Next Steps

1. **Review all documentation** to ensure understanding
2. **Set up Ubuntu server** following INFRASTRUCTURE_SETUP.md
3. **Configure DNS** for subdomains
4. **Install prerequisites** on macOS
5. **Start with Phase 1** of roadmap
6. **Iterate and test** each component
7. **Deploy incrementally** to production

## Support & Resources

### Documentation

- Full docs: https://docs-voice.asimo.io (when deployed)
- GitHub repo: (to be created)

### APIs Used

- OpenAI: https://platform.openai.com/docs
- PubMed E-utilities: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- Ollama: https://ollama.ai/docs
- Qdrant: https://qdrant.tech/documentation/

### Communities

- OpenAI Discord
- FastAPI Discord
- React community

## License

Personal use project. All medical content sources must respect their individual licenses.

---

**Project Started**: November 19, 2024
**Primary Developer**: Dr. Mohammed Nazmy
**Status**: Planning Phase
**Version**: 0.1.0 (planning)
