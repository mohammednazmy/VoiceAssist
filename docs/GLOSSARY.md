---
title: Glossary
slug: glossary
summary: Definitions of VoiceAssist-specific terms and acronyms.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - glossary
  - terminology
  - reference
category: reference
component: "docs/overview"
ai_summary: >-
  Glossary of VoiceAssist terminology. Includes medical, technical, and
  project-specific terms. Use for understanding domain vocabulary.
---

# VoiceAssist Glossary

> **Last Updated**: 2025-12-08

Definitions of terms used throughout VoiceAssist documentation.

---

## A

### API Gateway

The central entry point for all HTTP requests. In VoiceAssist, this is the FastAPI application in `services/api-gateway/`. It handles routing, authentication, and request/response transformation.

### Audit Log

A tamper-evident record of all access to protected health information (PHI). Required for HIPAA compliance. See `app/services/audit_service.py`.

---

## B

### Barge-in

Voice feature allowing users to interrupt the AI's speech and start a new query. Implemented in the Thinker-Talker pipeline.

---

## C

### CalDAV

Calendar Distributed Authoring and Versioning. Protocol used to sync calendars with Nextcloud. See [NEXTCLOUD_INTEGRATION.md](NEXTCLOUD_INTEGRATION.md).

### Citation

A reference to a source document returned with RAG responses. Includes document title, section, and relevance score.

---

## D

### Deepgram

Third-party Speech-to-Text (STT) service used in the Thinker-Talker voice pipeline. Converts user speech to text.

---

## E

### ElevenLabs

Third-party Text-to-Speech (TTS) service used in the Thinker-Talker voice pipeline. Generates high-quality voice responses.

### Embedding

A numerical vector representation of text used for semantic search. VoiceAssist uses OpenAI embeddings stored in Qdrant.

### Ephemeral Token

A short-lived token (5 minutes) used for WebSocket voice connections. Prevents API key exposure to the browser.

---

## F

### FastAPI

Python web framework used for the VoiceAssist backend. Provides async support, automatic OpenAPI docs, and Pydantic validation.

### Frontmatter

YAML metadata at the top of markdown files. Used for document categorization, search indexing, and navigation.

---

## G

### GPT-4o

OpenAI's multimodal language model used for chat responses and medical question answering.

---

## H

### HIPAA

Health Insurance Portability and Accountability Act. US law governing protection of health information. VoiceAssist implements all 42 safeguards.

### Hook (React)

A React function for reusing stateful logic. VoiceAssist uses custom hooks for API calls (e.g., `useAuth`, `useRealtimeVoiceSession`).

---

## J

### JWT

JSON Web Token. Used for authentication. VoiceAssist uses access tokens (short-lived) and refresh tokens (long-lived).

---

## K

### Knowledge Base (KB)

The collection of indexed medical documents used for RAG queries. Managed through the Admin Panel.

---

## L

### LLM

Large Language Model. The AI model (GPT-4o) that generates responses.

---

## M

### Monorepo

A single repository containing multiple projects. VoiceAssist uses pnpm workspaces and Turborepo to manage `apps/` and `packages/`.

---

## N

### Nextcloud

Self-hosted cloud platform used for calendar, files, and email integration. Runs as a separate Docker stack.

---

## O

### OpenAI Realtime API

OpenAI's direct voice-to-voice API. Used as a fallback mode in VoiceAssist. See "Thinker-Talker" for the primary mode.

---

## P

### PHI

Protected Health Information. Any individually identifiable health information. Must be encrypted and audit-logged per HIPAA.

### Pydantic

Python library for data validation using type hints. Used for API request/response schemas.

---

## Q

### Qdrant

Vector database used for storing document embeddings and performing semantic search.

### Query Orchestrator

The core RAG component that coordinates search, retrieval, and response generation. See [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md).

---

## R

### RAG

Retrieval-Augmented Generation. The process of retrieving relevant documents and using them to generate informed responses.

### RBAC

Role-Based Access Control. Permission system where users have roles (admin, clinician) that grant specific capabilities.

---

## S

### Semantic Search

Search based on meaning rather than keywords. Uses vector embeddings to find conceptually similar content.

### STT

Speech-to-Text. Converting spoken audio to text. VoiceAssist uses Deepgram for STT.

---

## T

### Thinker-Talker Pipeline

VoiceAssist's primary voice architecture: Deepgram (STT) → GPT-4o (reasoning) → ElevenLabs (TTS). Provides unified context and full tool support.

### TTS

Text-to-Speech. Converting text to spoken audio. VoiceAssist uses ElevenLabs for TTS.

### Turborepo

Build system for JavaScript/TypeScript monorepos. Used to manage the `apps/` and `packages/` directories.

---

## V

### Vector Database

A database optimized for storing and querying high-dimensional vectors. VoiceAssist uses Qdrant.

### Voice Mode

The real-time voice interaction feature. Users speak, and VoiceAssist responds with synthesized speech.

---

## W

### WebDAV

Web Distributed Authoring and Versioning. Protocol used for file sync with Nextcloud.

### WebSocket

Protocol for real-time bidirectional communication. Used for voice streaming and chat.

---

## Related Documents

- [UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md) - System architecture
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) - All services explained
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - HIPAA and security terms
- [VOICE_MODE_PIPELINE.md](VOICE_MODE_PIPELINE.md) - Voice terminology
