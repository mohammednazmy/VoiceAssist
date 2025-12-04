---
title: AI Agent Quick Start
slug: start/ai-agents
summary: Quick start guide for AI coding assistants working on VoiceAssist.
status: stable
stability: production
owner: mixed
lastUpdated: "2025-12-02"
audience:
  - agent
  - ai-agents
tags:
  - quickstart
  - ai
  - agent
  - automation
category: getting-started
ai_summary: >-
  Last Updated: 2025-12-01 This guide helps AI coding assistants (Claude, GPT,
  Copilot, etc.) quickly understand and work on VoiceAssist. --- VoiceAssist is
  a HIPAA-compliant medical AI assistant platform with: - Voice Mode:
  Thinker-Talker pipeline (Deepgram STT → GPT-4o → ElevenLabs TTS) - Text Mo...
---

# AI Agent Quick Start

**Last Updated:** 2025-12-01

This guide helps AI coding assistants (Claude, GPT, Copilot, etc.) quickly understand and work on VoiceAssist.

---

## Project Overview

**VoiceAssist** is a HIPAA-compliant medical AI assistant platform with:

- **Voice Mode:** Thinker-Talker pipeline (Deepgram STT → GPT-4o → ElevenLabs TTS)
- **Text Mode:** Streaming chat with citations
- **Knowledge Base:** Medical textbooks, guidelines, literature
- **Admin Panel:** User management, analytics, KB administration

---

## Key Directories

```
/home/asimo/VoiceAssist/
├── apps/
│   ├── web-app/              # React frontend (main app)
│   ├── admin-panel/          # Admin dashboard
│   └── docs-site/            # Next.js documentation site
├── packages/
│   ├── api-client/           # Type-safe API client
│   ├── types/                # Shared TypeScript types
│   ├── ui/                   # Shared UI components
│   └── utils/                # Shared utilities
├── services/
│   └── api-gateway/          # FastAPI backend
│       └── app/
│           ├── api/          # REST endpoints
│           ├── services/     # Business logic (Thinker, Talker, etc.)
│           └── models/       # Database models
└── docs/                     # Documentation source
```

---

## Critical Files

### Voice Pipeline (Thinker-Talker)

| File                                                                    | Purpose               |
| ----------------------------------------------------------------------- | --------------------- |
| `services/api-gateway/app/services/thinker_service.py`                  | LLM orchestration     |
| `services/api-gateway/app/services/talker_service.py`                   | TTS synthesis         |
| `services/api-gateway/app/services/thinker_talker_websocket_handler.py` | WebSocket handling    |
| `services/api-gateway/app/services/sentence_chunker.py`                 | Text chunking for TTS |
| `apps/web-app/src/hooks/useThinkerTalkerSession.ts`                     | Frontend voice hook   |

### API Endpoints

| File                                            | Purpose                  |
| ----------------------------------------------- | ------------------------ |
| `services/api-gateway/app/api/conversations.py` | Chat CRUD                |
| `services/api-gateway/app/api/voice.py`         | Voice session management |
| `services/api-gateway/app/api/realtime.py`      | Chat WebSocket           |
| `services/api-gateway/app/api/auth.py`          | Authentication           |

### Frontend Components

| File                                         | Purpose               |
| -------------------------------------------- | --------------------- |
| `apps/web-app/src/components/ChatView.tsx`   | Main chat interface   |
| `apps/web-app/src/components/VoicePanel.tsx` | Voice mode UI         |
| `apps/web-app/src/hooks/useChatSession.ts`   | Chat state management |

---

## Documentation Index

### Architecture

- [THINKER_TALKER_PIPELINE.md](../THINKER_TALKER_PIPELINE.md) - Voice pipeline architecture
- [UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md) - System overview
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) - API Gateway design
- [FRONTEND_ARCHITECTURE.md](../FRONTEND_ARCHITECTURE.md) - React app structure

### API Reference

- [API_REFERENCE.md](../API_REFERENCE.md) - Endpoint overview
- [api-reference/rest-api.md](../api-reference/rest-api.md) - Complete REST docs
- [api-reference/voice-pipeline-ws.md](../api-reference/voice-pipeline-ws.md) - Voice WebSocket protocol
- [WEBSOCKET_PROTOCOL.md](../WEBSOCKET_PROTOCOL.md) - Chat WebSocket protocol

### Services

- [services/thinker-service.md](../services/thinker-service.md) - ThinkerService API
- [services/talker-service.md](../services/talker-service.md) - TalkerService API

### Data

- [DATA_MODEL.md](../DATA_MODEL.md) - Database schema
- [CONFIGURATION_REFERENCE.md](../CONFIGURATION_REFERENCE.md) - Environment variables

---

## Machine-Readable Endpoints

The docs site provides JSON endpoints for programmatic access:

| Endpoint                 | Description                      |
| ------------------------ | -------------------------------- |
| `GET /agent/index.json`  | Documentation system metadata    |
| `GET /agent/docs.json`   | Full document list with metadata |
| `GET /search-index.json` | Full-text search index           |

**Base URL:** `https://assistdocs.asimo.io`

See [Agent API Reference](../ai/AGENT_API_REFERENCE.md) for details.

---

## Common Tasks

### Adding a New API Endpoint

1. Create route in `services/api-gateway/app/api/<module>.py`
2. Add schema in `services/api-gateway/app/schemas/<module>.py`
3. Register in `services/api-gateway/app/main.py`
4. Add TypeScript types in `packages/types/src/`
5. Update API client in `packages/api-client/src/`

### Adding a Frontend Feature

1. Create component in `apps/web-app/src/components/`
2. Add hooks in `apps/web-app/src/hooks/`
3. Use shared UI from `packages/ui/`
4. Use API client from `packages/api-client/`

### Modifying Voice Pipeline

1. ThinkerService changes: `thinker_service.py`
2. TalkerService changes: `talker_service.py`
3. WebSocket protocol: `thinker_talker_websocket_handler.py`
4. Frontend hooks: `useThinkerTalkerSession.ts`

---

## Code Patterns

### Backend (Python/FastAPI)

```python
# Typical endpoint structure
@router.post("/conversations/{id}/messages")
async def create_message(
    id: UUID,
    request: CreateMessageRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> MessageResponse:
    # Business logic
    return MessageResponse(...)
```

### Frontend (React/TypeScript)

```typescript
// Typical hook usage
const { messages, sendMessage, isLoading } = useChatSession(conversationId);

// Voice mode
const { startListening, stopListening, isRecording } = useThinkerTalkerSession({
  onTranscript: (text) => console.log(text),
  onAudio: (audio) => playAudio(audio),
});
```

---

## Testing

```bash
# Backend tests
cd services/api-gateway
pytest tests/ -v

# Frontend tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

---

## Environment Setup

Required API keys (in `.env`):

```bash
OPENAI_API_KEY=sk-...          # GPT-4o for Thinker
DEEPGRAM_API_KEY=...           # Speech-to-text
ELEVENLABS_API_KEY=...         # Text-to-speech
DATABASE_URL=postgresql://...   # PostgreSQL
REDIS_URL=redis://...          # Cache
```

---

## Quick References

- **OpenAPI Spec:** `http://localhost:8000/openapi.json`
- **Swagger UI:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/health`
- **Docs Site:** `https://assistdocs.asimo.io`

---

## Related Documentation

- [Agent Onboarding](../ai/AGENT_ONBOARDING.md) - Detailed onboarding guide
- [Agent Task Index](../ai/AGENT_TASK_INDEX.md) - Common tasks and relevant docs
- [Claude Execution Guide](../CLAUDE_EXECUTION_GUIDE.md) - Claude-specific guidelines
