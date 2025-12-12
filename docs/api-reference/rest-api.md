---
title: REST API Reference
slug: api-reference/rest-api
summary: Complete REST API documentation with request/response examples.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-12"
audience:
  - human
  - agent
  - backend
  - frontend
  - ai-agents
tags:
  - api
  - rest
  - reference
  - endpoints
  - examples
category: api
relatedServices:
  - api-gateway
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/api/__init__.py"
  - "services/api-gateway/app/api/conversations.py"
  - "services/api-gateway/app/api/auth.py"
  - "packages/api-client/src/index.ts"
version: 2.0.0
ai_summary: >-
  Version: 2.0 Base URL: http://localhost:8000/api (production) or
  http://localhost:8000/api (development) Last Updated: 2025-11-27 > See Also:
  Auto-generated API Routes - Complete route listing from OpenAPI spec --- The
  VoiceAssist API provides a comprehensive set of endpoints for building
  medic...
---

# VoiceAssist REST API Reference

**Version:** 2.1
**Base URL:** `http://localhost:8000/api` (production) or `http://localhost:8000/api` (development)
**Last Updated:** 2025-12-12

> **See Also:** [Auto-generated API Routes](API_ROUTES.md) - Complete route listing from OpenAPI spec

---

## Overview

The VoiceAssist API provides a comprehensive set of endpoints for building medical AI assistant applications. All endpoints follow REST conventions and return JSON responses wrapped in a standard envelope format.

### Authentication

Most endpoints require JWT authentication. Include the access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Response Envelope

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO-8601"
  }
}
```

### Rate Limiting

Rate limits are applied per IP address. Headers returned:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Authentication (`/api/auth`)

### Register User

```
POST /api/auth/register
```

Create a new user account.

**Rate Limit:** 5/hour per IP

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Doe"
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_admin": false,
  "created_at": "2025-11-27T10:00:00Z"
}
```

---

### Login

```
POST /api/auth/login
```

Authenticate and receive JWT tokens.

**Rate Limit:** 10/minute per IP

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 300
}
```

---

### Refresh Token

```
POST /api/auth/refresh
```

Get a new access token using a refresh token.

**Request Body:**

```json
{
  "refresh_token": "eyJhbG..."
}
```

**Response (200):**

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 300
}
```

---

### Logout

```
POST /api/auth/logout
```

Revoke current tokens.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "message": "Successfully logged out"
}
```

---

### Get Current User

```
GET /api/auth/me
```

Get authenticated user's information.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_admin": false,
  "admin_role": "user",
  "created_at": "2025-11-27T10:00:00Z",
  "last_login": "2025-11-27T12:00:00Z"
}
```

---

## User Management (`/api/users`)

### Get Current User Profile

```
GET /api/users/me
```

**Headers:** `Authorization: Bearer <access_token>`

---

### Update Current User Profile

```
PUT /api/users/me
```

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "full_name": "John Updated",
  "email": "newemail@example.com"
}
```

---

### Change Password

```
POST /api/users/me/change-password
```

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "old_password": "currentPassword",
  "new_password": "newSecurePassword123"
}
```

---

### Delete Account

```
DELETE /api/users/me
```

Permanently delete user account.

**Headers:** `Authorization: Bearer <access_token>`

---

### List Users (Admin)

```
GET /api/users?offset=0&limit=20
```

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**

- `offset` (int): Pagination offset (default: 0)
- `limit` (int): Page size (default: 20, max: 100)

---

### Get User by ID (Admin)

```
GET /api/users/{user_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Update User (Admin)

```
PATCH /api/users/{user_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Activate User (Admin)

```
PUT /api/users/{user_id}/activate
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Deactivate User (Admin)

```
PUT /api/users/{user_id}/deactivate
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Promote to Admin (Admin)

```
PUT /api/users/{user_id}/promote-admin
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Revoke Admin (Admin)

```
PUT /api/users/{user_id}/revoke-admin
```

**Headers:** `Authorization: Bearer <admin_token>`

---

## Conversations (`/conversations`)

### List Conversations

```
GET /conversations?page=1&pageSize=20
```

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

- `page` (int): Page number (default: 1)
- `pageSize` (int): Items per page (default: 20)
- `archived` (bool): Filter archived conversations
- `folderId` (string): Filter by folder

**Response (200):**

```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Medical Inquiry",
      "archived": false,
      "messageCount": 5,
      "folderId": null,
      "createdAt": "2025-11-27T10:00:00Z",
      "updatedAt": "2025-11-27T12:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

### Create Conversation

```
POST /conversations
```

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "title": "New Medical Discussion",
  "folder_id": "optional-folder-uuid"
}
```

---

### Get Conversation

```
GET /conversations/{conversation_id}
```

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "Medical Inquiry",
  "archived": false,
  "messageCount": 5,
  "folderId": null,
  "phiMode": "clinical",
  "tags": ["cardiology", "follow-up"],
  "metadata": {
    "phi_mode": "clinical",
    "tags": ["cardiology", "follow-up"],
    "active_document_id": "doc-uuid"
  },
  "createdAt": "2025-11-27T10:00:00Z",
  "updatedAt": "2025-11-27T12:00:00Z"
}
```

---

### Update Conversation

```
PATCH /conversations/{conversation_id}
```

Update a conversation's metadata including title, archived status, folder, PHI mode, and tags.

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "title": "Updated Title",
  "archived": false,
  "folder_id": "new-folder-uuid",
  "phi_mode": "clinical",
  "tags": ["cardiology", "urgent"]
}
```

**Field Details:**

| Field       | Type     | Description                                      |
| ----------- | -------- | ------------------------------------------------ |
| `title`     | string   | Conversation title                               |
| `archived`  | boolean  | Whether the conversation is archived             |
| `folder_id` | string   | UUID of folder to move conversation to           |
| `phi_mode`  | string   | PHI handling mode: `"clinical"` or `"demo"`      |
| `tags`      | string[] | User-defined tags (de-duplicated, sorted)        |

**Response (200):**

```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "Updated Title",
  "archived": false,
  "messageCount": 5,
  "folderId": "new-folder-uuid",
  "phiMode": "clinical",
  "tags": ["cardiology", "urgent"],
  "createdAt": "2025-11-27T10:00:00Z",
  "updatedAt": "2025-11-27T12:30:00Z"
}
```

---

### Auto-Title Conversation

```
POST /conversations/{conversation_id}/auto-title
```

Generate and apply an automatic clinical title for a conversation based on its content.

The title is derived from the first 1–2 user turns and the first assistant answer using a PHI-conscious LLM prompt. The model is instructed not to emit identifiers (names, MRNs, DOBs).

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "Chest pain evaluation and cardiac workup",
  "archived": false,
  "messageCount": 5,
  "phiMode": "clinical",
  "createdAt": "2025-11-27T10:00:00Z",
  "updatedAt": "2025-11-27T12:35:00Z"
}
```

**Notes:**

- Falls back to local heuristic-based title if LLM is unavailable
- Title is truncated to 80 characters maximum
- PHI-safe: instructed not to include patient names, MRNs, or dates

---

### Delete Conversation

```
DELETE /conversations/{conversation_id}
```

**Headers:** `Authorization: Bearer <access_token>`

---

### Create Branch

```
POST /conversations/{conversation_id}/branches
```

Fork a conversation from a specific message.

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "parent_message_id": "message-uuid",
  "initial_message": "Optional first message in branch"
}
```

---

### List Branches

```
GET /conversations/{conversation_id}/branches
```

**Headers:** `Authorization: Bearer <access_token>`

---

### Get Conversation Events

```
GET /conversations/{conversation_id}/events
```

Get structured events logged during conversation/voice sessions for debugging and session replay.

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter     | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| `event_types` | string | Comma-separated list of event types to filter    |
| `since`       | string | ISO 8601 timestamp to filter events after        |
| `limit`       | int    | Max events to return (default: 100, max: 1000)   |
| `offset`      | int    | Pagination offset                                |

**Response (200):**

```json
[
  {
    "id": "event-uuid",
    "conversation_id": "conv-uuid",
    "session_id": "voice-session-id",
    "branch_id": null,
    "event_type": "voice_turn_start",
    "payload": {
      "vad_triggered": true,
      "audio_level_db": -22.5
    },
    "source": "voice_pipeline",
    "trace_id": "trace-uuid",
    "created_at": "2025-11-27T12:00:00Z"
  }
]
```

---

### Get Conversation Settings

```
GET /conversations/{conversation_id}/settings
```

Get per-conversation settings for voice, model preferences, etc.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "voice_enabled": true,
  "preferred_model": "gpt-4",
  "temperature": 0.7,
  "max_tokens": 2048
}
```

---

### Update Conversation Settings

```
PUT /conversations/{conversation_id}/settings
```

Update settings for a specific conversation. Settings are merged with existing values.

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "voice_enabled": true,
  "preferred_model": "gpt-4",
  "temperature": 0.7
}
```

---

### Get Messages

```
GET /conversations/{conversation_id}/messages?branch_id=main
```

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

- `branch_id` (string): Branch identifier (default: "main")
- `limit` (int): Maximum messages to return

---

## Admin Panel (`/api/admin/panel`)

### Dashboard Summary

```
GET /api/admin/panel/summary
```

Get dashboard metrics summary.

**Headers:** `Authorization: Bearer <admin_token>`

**Response (200):**

```json
{
  "users": {
    "total": 150,
    "active": 142,
    "admins": 3
  },
  "conversations": {
    "total": 1250,
    "today": 45
  },
  "system": {
    "status": "healthy",
    "uptime": 864000
  }
}
```

---

### WebSocket Status

```
GET /api/admin/panel/websocket-status
```

Get real-time connection status.

**Headers:** `Authorization: Bearer <admin_token>`

---

### List Users

```
GET /api/admin/panel/users?offset=0&limit=20
```

Paginated user list with statistics.

**Headers:** `Authorization: Bearer <admin_token>`

---

### Get User Details

```
GET /api/admin/panel/users/{user_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Update User

```
PUT /api/admin/panel/users/{user_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Delete User

```
DELETE /api/admin/panel/users/{user_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### User Role History

```
GET /api/admin/panel/users/{user_id}/role-history
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Account Lock Reasons

```
GET /api/admin/panel/users/{user_id}/lock-reasons
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### System Metrics

```
GET /api/admin/panel/metrics
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Audit Logs

```
GET /api/admin/panel/audit-logs?page=1&limit=50
```

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**

- `page` (int): Page number
- `limit` (int): Items per page
- `action` (string): Filter by action type
- `user_id` (string): Filter by user

---

### Export Audit Logs

```
GET /api/admin/panel/audit-logs/export?format=csv
```

**Headers:** `Authorization: Bearer <admin_token>`

---

## Knowledge Base Admin (`/api/admin/kb`)

### List Documents

```
GET /api/admin/kb/documents?offset=0&limit=20
```

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**

- `offset` (int): Pagination offset
- `limit` (int): Page size
- `status` (string): Filter by status (uploaded, processing, indexed, failed)

---

### Upload Document

```
POST /api/admin/kb/documents
Content-Type: multipart/form-data
```

Upload a document for indexing.

**Headers:** `Authorization: Bearer <admin_token>`

**Form Data:**

- `file`: PDF or TXT file (max 50MB)
- `title` (string): Document title
- `category` (string): Document category

---

### Get Document Details

```
GET /api/admin/kb/documents/{document_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Delete Document

```
DELETE /api/admin/kb/documents/{document_id}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Reindex Document

```
POST /api/admin/kb/documents/{document_id}/reindex
```

**Headers:** `Authorization: Bearer <admin_token>`

---

## Cache Management (`/api/admin/cache`)

### Cache Statistics

```
GET /api/admin/cache/stats
```

**Headers:** `Authorization: Bearer <admin_token>`

**Response (200):**

```json
{
  "redis": {
    "connected": true,
    "used_memory": "15MB",
    "keys": 1250
  },
  "l1_cache": {
    "size": 500,
    "hits": 12500,
    "misses": 250
  }
}
```

---

### Clear Cache

```
POST /api/admin/cache/clear
```

Clear all caches.

**Headers:** `Authorization: Bearer <admin_token>`

---

### Invalidate Cache Pattern

```
POST /api/admin/cache/invalidate
```

Invalidate specific cache keys.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**

```json
{
  "pattern": "user:*"
}
```

---

## Feature Flags (`/api/admin/feature-flags`)

### List Feature Flags

```
GET /api/admin/feature-flags
```

**Headers:** `Authorization: Bearer <admin_token>`

**Response (200):**

```json
{
  "flags": [
    {
      "name": "voice_mode",
      "enabled": true,
      "description": "Enable voice input mode",
      "rollout_percentage": 100,
      "updated_at": "2025-11-27T10:00:00Z"
    }
  ]
}
```

---

### Get Feature Flag

```
GET /api/admin/feature-flags/{flag_name}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Create Feature Flag

```
POST /api/admin/feature-flags
```

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**

```json
{
  "name": "new_feature",
  "enabled": false,
  "description": "Description of the feature",
  "rollout_percentage": 0
}
```

---

### Update Feature Flag

```
PATCH /api/admin/feature-flags/{flag_name}
```

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**

```json
{
  "enabled": true,
  "rollout_percentage": 50
}
```

---

### Delete Feature Flag

```
DELETE /api/admin/feature-flags/{flag_name}
```

**Headers:** `Authorization: Bearer <admin_token>`

---

### Toggle Feature Flag

```
POST /api/admin/feature-flags/{flag_name}/toggle
```

Quick toggle for feature flags.

**Headers:** `Authorization: Bearer <admin_token>`

---

## Health Checks

### Liveness Check

```
GET /health
```

Basic health check. Returns 200 if service is running.

**Rate Limit:** 100/minute

**Response (200):**

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": 1732703400.123
}
```

---

### Readiness Check

```
GET /ready
```

Checks all dependencies (PostgreSQL, Redis, Qdrant, Nextcloud).

**Rate Limit:** 100/minute

**Response (200):**

```json
{
  "status": "ready",
  "checks": {
    "postgres": true,
    "redis": true,
    "qdrant": true,
    "nextcloud": true
  },
  "timestamp": 1732703400.123
}
```

**Response (503):** If any dependency is unavailable.

---

## Metrics

### Prometheus Metrics

```
GET /metrics
```

Prometheus-formatted metrics for monitoring.

---

## Voice Endpoints (`/api/voice`)

### Start Voice Session

```
POST /api/voice/session
```

Initialize a voice interaction session.

**Headers:** `Authorization: Bearer <access_token>`

---

### Send Audio

```
POST /api/voice/audio
Content-Type: multipart/form-data
```

Send audio for transcription and processing.

**Headers:** `Authorization: Bearer <access_token>`

---

## WebSocket Realtime (`/ws`)

### Connect

```
WS /ws?token=<access_token>
```

Establish WebSocket connection for real-time chat.

### Events

**Client → Server:**

- `message_send`: Send a new message
- `typing_start`: Start typing indicator
- `typing_stop`: Stop typing indicator

**Server → Client:**

- `connected`: Connection established
- `chunk`: Streaming response chunk
- `message_done`: Complete message with citations
- `error`: Error notification

---

## Error Codes

| Code               | HTTP Status | Description                       |
| ------------------ | ----------- | --------------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid authentication |
| `FORBIDDEN`        | 403         | Insufficient permissions          |
| `NOT_FOUND`        | 404         | Resource not found                |
| `VALIDATION_ERROR` | 422         | Request validation failed         |
| `RATE_LIMITED`     | 429         | Too many requests                 |
| `INTERNAL_ERROR`   | 500         | Server error                      |

---

## OpenAPI Documentation

Interactive API documentation is available at:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

---

_Last Updated: 2025-12-12_
