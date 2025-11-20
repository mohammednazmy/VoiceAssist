# VoiceAssist - Personal Medical AI Assistant

## Overview

VoiceAssist is a hybrid AI assistant system designed for medical professionals, combining voice interaction, file system access, calendar/email integration, and specialized medical knowledge retrieval capabilities.

## Key Features

### Core Capabilities
- **Always-On Voice Interface**: Natural conversation using OpenAI Realtime API
- **Hybrid AI Architecture**: Local models for privacy-sensitive tasks + cloud APIs for complex reasoning
- **Full System Access**: Files, calendar, email, reminders, notes integration
- **Web Browsing**: Real-time information retrieval and research
- **Medical Specialization**: Access to medical journals, textbooks, and clinical guidelines

### Medical Features
- PubMed and medical journal search
- Medical textbook knowledge base with citations
- Clinical guideline access (CDC, WHO, specialty societies)
- OpenEvidence integration
- PDF download and analysis of medical literature
- HIPAA-conscious privacy architecture

### Platform Support
- **macOS**: Native client with always-on listening
- **iOS**: Companion app (planned)
- **Web**: Browser-based interface for any device
- **Server**: Ubuntu-based backend (asimo.io)

## Architecture Components

### 1. macOS Native Client
- Voice interface with wake word detection
- Local LLM (Ollama)
- System integrations (Calendar, Mail, Files)
- Menu bar daemon

### 2. Ubuntu Server (asimo.io)
- Medical knowledge base (RAG system)
- Vector database for embeddings
- PDF processing pipeline
- Medical literature service
- Nextcloud integration
- Cross-device sync service

### 3. Web Application
- Browser-based voice/text interface
- Access from any device
- Real-time conversation UI
- Mobile-responsive design

### 4. Admin Panel
- System configuration
- User management
- Model selection and settings
- Integration configuration
- Usage analytics
- Knowledge base management

### 5. Documentation Site
- User guides
- API documentation
- Setup instructions
- Medical feature guides

## Project Structure

```
VoiceAssist/
├── docs/              # Project documentation
├── server/            # Ubuntu server backend
├── macos-client/      # Native macOS application
├── web-app/           # Browser-based interface
├── admin-panel/       # Admin dashboard
└── docs-site/         # Documentation website
```

## Technology Stack

### Backend
- FastAPI (Python) - API services
- PostgreSQL + pgvector - Embeddings
- Qdrant/Weaviate - Vector search
- Celery - Background tasks
- Redis - Caching

### macOS Client
- Swift/SwiftUI or Electron
- Python daemon for orchestration
- Porcupine - Wake word detection

### Web Applications
- React/Next.js - Frontend
- TypeScript
- Tailwind CSS - Styling
- WebSocket - Real-time communication

### AI Models
- OpenAI GPT-4 - Complex reasoning
- OpenAI Realtime API - Voice interface
- Ollama (Llama 3.1) - Local model
- Whisper - Speech-to-text (fallback)

### Integrations
- Nextcloud WebDAV API
- PubMed E-utilities API
- OpenEvidence API
- macOS AppleScript/Shortcuts
- Google Calendar API (optional)

## Subdomains

- `voice.asimo.io` - Voice assistant API
- `medical-kb.asimo.io` - Medical knowledge base
- `admin.asimo.io` - Administration panel
- `voiceassist.asimo.io` - Main web app
- `docs-voice.asimo.io` - Documentation site

## Privacy & Security

### Data Handling
- **Local processing**: Patient notes, PHI, sensitive files
- **Cloud processing**: General medical knowledge, public literature
- **Rule**: Never send PHI to external APIs

### Storage
- Sensitive data: Local + Ubuntu server only
- Medical textbooks: Ubuntu server
- Conversation logs: Encrypted, Nextcloud backup

## Getting Started

See individual component directories for setup instructions:
- [Server Setup](./server/README.md)
- [macOS Client](./macos-client/README.md)
- [Web App](./web-app/README.md)
- [Admin Panel](./admin-panel/README.md)

## Development Roadmap

See [ROADMAP.md](./docs/ROADMAP.md) for detailed implementation plan.

## License

Personal use project.
