---
title: Phase 08 Api Contracts
slug: phase-08-api-contracts
summary: >-
  This document defines the API contracts between frontend and backend for Phase
  8 features.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - backend
  - ai-agents
tags:
  - phase
  - api
  - contracts
category: api
ai_summary: >-
  This document defines the API contracts between frontend and backend for Phase
  8 features. Last Updated: 2025-11-24 - Endpoint: GET
  /api/export/sessions/{session_id}/export/markdown - Auth: Bearer token
  required - Response: text/markdown file download - Frontend:
  VoiceAssistApiClient.exportConver...
---

# Phase 8 API Contracts

This document defines the API contracts between frontend and backend for Phase 8 features.

**Last Updated:** 2025-11-24

## Export API

### Markdown Export

- **Endpoint:** `GET /api/export/sessions/{session_id}/export/markdown`
- **Auth:** Bearer token required
- **Response:** `text/markdown` file download
- **Frontend:** `VoiceAssistApiClient.exportConversationAsMarkdown(conversationId)`

### PDF Export

- **Endpoint:** `GET /api/export/sessions/{session_id}/export/pdf`
- **Auth:** Bearer token required
- **Response:** `application/pdf` file download
- **Frontend:** `VoiceAssistApiClient.exportConversationAsPdf(conversationId)`

## Attachments API

### Upload Attachment

- **Endpoint:** `POST /api/attachments/messages/{message_id}/attachments`
- **Auth:** Bearer token required
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file`: File to upload
  - `message_id`: Message UUID (in form data)
  - `metadata` (optional): JSON metadata
- **Response:** Attachment metadata object
- **Frontend:** `attachmentsApi.uploadAttachment(messageId, file, metadata, onProgress)`

### List Message Attachments

- **Endpoint:** `GET /api/attachments/messages/{message_id}/attachments`
- **Auth:** Bearer token required
- **Response:** Array of attachment metadata
- **Frontend:** `attachmentsApi.listMessageAttachments(messageId)`

### Download Attachment

- **Endpoint:** `GET /api/attachments/{attachment_id}/download`
- **Auth:** Bearer token required
- **Response:** File stream with appropriate MIME type
- **Frontend:** `attachmentsApi.downloadAttachment(attachmentId)`

### Delete Attachment

- **Endpoint:** `DELETE /api/attachments/{attachment_id}`
- **Auth:** Bearer token required
- **Response:** 204 No Content
- **Frontend:** `attachmentsApi.deleteAttachment(attachmentId)`

## Clinical Context API

### Create Clinical Context

- **Endpoint:** `POST /api/clinical-contexts`
- **Auth:** Bearer token required
- **Body:** Clinical context data (see `ClinicalContextCreate` schema)
- **Response:** Clinical context object
- **Status:** 409 if already exists (use PUT to update)

### Get Current Clinical Context

- **Endpoint:** `GET /api/clinical-contexts/current?session_id={optional}`
- **Auth:** Bearer token required
- **Response:** Clinical context object or `null` if not found

### Update Clinical Context

- **Endpoint:** `PUT /api/clinical-contexts/{context_id}`
- **Auth:** Bearer token required
- **Body:** Clinical context update data
- **Response:** Updated clinical context object

### Delete Clinical Context

- **Endpoint:** `DELETE /api/clinical-contexts/{context_id}`
- **Auth:** Bearer token required
- **Response:** 204 No Content

## WebSocket Citation Streaming

### Connection

- **Endpoint:** `ws://localhost:8000/api/realtime/ws?conversationId={uuid}&token={jwt}`
- **Protocol Version:** 1.0

### Client → Server Messages

#### Send Message

```json
{
  "type": "message",
  "content": "User's message text",
  "session_id": "optional-session-uuid",
  "clinical_context": {...}
}
```

#### Heartbeat

```json
{
  "type": "ping"
}
```

### Server → Client Messages

#### Connection Established

```json
{
  "type": "connected",
  "client_id": "uuid",
  "timestamp": "2025-11-22T00:00:00.000Z",
  "protocol_version": "1.0",
  "capabilities": ["text_streaming"]
}
```

#### Streaming Chunk

```json
{
  "type": "chunk",
  "messageId": "uuid",
  "content": "Partial response text..."
}
```

#### Message Complete

```json
{
  "type": "message.done",
  "messageId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Complete response text",
    "citations": [
      {
        "id": "string",
        "sourceId": "string",
        "sourceType": "kb|url|pubmed|doi",
        "title": "string",
        "subtitle": "string",
        "location": "string",
        "url": "string",
        "doi": "string",
        "pubmedId": "string",
        "page": 123,
        "authors": ["Author Name"],
        "publicationYear": 2023,
        "journal": "Journal Name",
        "snippet": "Relevant text excerpt",
        "relevanceScore": 0.95,
        "metadata": {}
      }
    ],
    "timestamp": 1700000000000
  },
  "timestamp": "2025-11-22T00:00:05.000Z"
}
```

#### Error

```json
{
  "type": "error",
  "messageId": "uuid",
  "error": {
    "code": "BACKEND_ERROR|AUTH_FAILED|QUOTA_EXCEEDED|CONNECTION_DROPPED",
    "message": "Error description"
  }
}
```

#### Heartbeat Response

```json
{
  "type": "pong",
  "timestamp": "2025-11-22T00:00:00.000Z"
}
```

## Citation Schema

All citations follow this structure (see `CitationSchema` in `app/schemas/websocket.py`):

```typescript
interface Citation {
  // Core fields
  id: string;

  // Legacy fields (backward compatibility)
  source?: "kb" | "url" | "pubmed" | "doi";
  reference?: string;

  // Structured fields (Phase 8)
  sourceId?: string;
  sourceType?: string;
  title?: string;
  subtitle?: string;
  location?: string;
  url?: string;
  doi?: string;
  pubmedId?: string;
  page?: number;
  authors?: string[];
  publicationYear?: number;
  journal?: string;
  snippet?: string;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}
```

## Notes

- All UUIDs can be passed as strings and will be converted to UUID objects by the backend
- Authentication tokens should be passed via `Authorization: Bearer {token}` header for REST endpoints
- WebSocket authentication uses query parameter: `?token={jwt}`
- All timestamps are in UTC
- File uploads have a 10MB size limit by default
- Allowed file types: `.pdf`, `.txt`, `.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.doc`, `.docx`
