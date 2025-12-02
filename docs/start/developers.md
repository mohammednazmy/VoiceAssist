---
title: Developer Quick Start
slug: start/developers
summary: Get started developing with VoiceAssist - setup, architecture, and contribution guide.
status: stable
stability: production
owner: engineering
lastUpdated: "2025-12-01"
audience: ["developer", "agent"]
tags: ["quickstart", "development", "setup", "contributing"]
category: getting-started
---

# Developer Quick Start

**Last Updated:** 2025-12-01

Welcome to VoiceAssist development! This guide will get you up and running quickly.

---

## Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- **Python** 3.11+ with pip
- **Docker** and Docker Compose
- **Git** for version control

---

## Quick Setup (5 minutes)

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/VoiceAssist.git
cd VoiceAssist

# Install all dependencies
pnpm install

# Copy environment template
cp .env.example .env
```

### 2. Start Development Services

```bash
# Start backend services (API Gateway, databases)
docker-compose up -d

# Start frontend development server
pnpm dev
```

### 3. Verify Setup

- **Frontend:** http://localhost:5173
- **API Gateway:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

---

## Project Structure

```
VoiceAssist/
├── apps/
│   ├── web-app/          # React frontend (Vite + TypeScript)
│   ├── admin-panel/      # Admin dashboard
│   └── docs-site/        # Documentation (Next.js)
├── packages/
│   ├── api-client/       # Type-safe API client
│   ├── config/           # Shared configuration
│   ├── types/            # TypeScript types
│   ├── ui/               # Shared UI components
│   └── utils/            # Shared utilities
├── services/
│   └── api-gateway/      # FastAPI backend
└── docs/                 # Documentation source
```

---

## Key Documentation

### Architecture

- [Unified Architecture](../UNIFIED_ARCHITECTURE.md) - Complete system overview
- [Backend Architecture](../BACKEND_ARCHITECTURE.md) - API Gateway design
- [Frontend Architecture](../FRONTEND_ARCHITECTURE.md) - React app structure
- [Realtime Architecture](../REALTIME_ARCHITECTURE.md) - WebSocket systems

### Voice Pipeline

- [Thinker-Talker Pipeline](../THINKER_TALKER_PIPELINE.md) - Voice architecture (recommended)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md) - Voice mode overview
- [Voice Pipeline WebSocket](../api-reference/voice-pipeline-ws.md) - WebSocket protocol

### API Reference

- [REST API Reference](../api-reference/rest-api.md) - Complete endpoint docs
- [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md) - Real-time communication
- [Data Model](../DATA_MODEL.md) - Database schema

### Development

- [Development Setup](../DEVELOPMENT_SETUP.md) - Full setup guide
- [Local Development](../LOCAL_DEVELOPMENT.md) - Local environment tips
- [Testing Guide](../TESTING_GUIDE.md) - Testing strategies

---

## Common Development Tasks

### Running Tests

```bash
# Frontend tests
pnpm test

# Backend tests
cd services/api-gateway
pytest tests/ -v

# E2E tests
pnpm test:e2e
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Type check
pnpm typecheck

# Format code
pnpm format
```

### Building for Production

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter web-app build
```

---

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### Commit Messages

Follow conventional commits:

```
feat(voice): add speech interruption support
fix(api): handle null conversation IDs
docs(readme): update installation instructions
```

### Pull Requests

1. Create feature branch from `main`
2. Make changes with tests
3. Run `pnpm lint && pnpm test`
4. Open PR with description
5. Address review feedback
6. Squash and merge

---

## Key Services

| Service     | Port | Description      |
| ----------- | ---- | ---------------- |
| Web App     | 5173 | React frontend   |
| API Gateway | 8000 | FastAPI backend  |
| PostgreSQL  | 5432 | Main database    |
| Redis       | 6379 | Cache & sessions |
| MinIO       | 9000 | Object storage   |

---

## Getting Help

- **Documentation:** [assistdocs.asimo.io](https://assistdocs.asimo.io)
- **Architecture Questions:** See [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)
- **API Questions:** See [API_REFERENCE.md](../API_REFERENCE.md)

---

## Next Steps

1. Read the [Architecture Overview](../UNIFIED_ARCHITECTURE.md)
2. Explore the [Thinker-Talker Pipeline](../THINKER_TALKER_PIPELINE.md)
3. Review the [API Reference](../API_REFERENCE.md)
4. Check [Contributing Guide](../DEVELOPMENT_SETUP.md)
