---
title: API Routes Reference
slug: api-reference/routes
summary: Auto-generated route listing from OpenAPI specification.
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience:
  - human
  - agent
  - backend
  - frontend
  - ai-agents
tags:
  - api
  - routes
  - auto-generated
category: api
relatedServices:
  - api-gateway
version: 1.0.0
ai_summary: >-
  Generated: 2025-11-27 12:24:10 UTC App: VoiceAssist API Gateway Version: 0.1.0
  --- - Total Routes: 98 - Total Tags/Modules: 9 --- --- Most endpoints require
  authentication via Bearer token: Authorization: Bearer <access_token> Obtain
  tokens via /api/auth/login or /api/auth/register. --- The compl...
---

# API Routes Reference

**Generated:** 2025-11-27 12:24:10 UTC
**App:** VoiceAssist API Gateway
**Version:** 0.1.0

---

## Summary

- **Total Routes:** 98
- **Total Tags/Modules:** 9

### Tags Overview

| Tag            | Routes | Description                          |
| -------------- | ------ | ------------------------------------ |
| admin          | 21     |                                      |
| authentication | 8      |                                      |
| conversations  | 16     | Chat sessions and branching          |
| health         | 4      | Service health and readiness checks  |
| integrations   | 10     | Nextcloud and external services      |
| observability  | 1      |                                      |
| untagged       | 22     |                                      |
| users          | 11     | User profile and management          |
| voice          | 5      | Voice input/output and transcription |

---

## Routes by Tag

### Admin

| Method   | Path                                          | Summary                  | Auth |
| -------- | --------------------------------------------- | ------------------------ | ---- |
| `POST`   | `/api/admin/cache/clear`                      | Clear Cache              | Yes  |
| `POST`   | `/api/admin/cache/invalidate`                 | Invalidate Cache Pattern | Yes  |
| `GET`    | `/api/admin/cache/stats`                      | Get Cache Stats          | Yes  |
| `GET`    | `/api/admin/feature-flags`                    | List Feature Flags       | Yes  |
| `POST`   | `/api/admin/feature-flags`                    | Create Feature Flag      | Yes  |
| `DELETE` | `/api/admin/feature-flags/{flag_name}`        | Delete Feature Flag      | Yes  |
| `GET`    | `/api/admin/feature-flags/{flag_name}`        | Get Feature Flag         | Yes  |
| `PATCH`  | `/api/admin/feature-flags/{flag_name}`        | Update Feature Flag      | Yes  |
| `POST`   | `/api/admin/feature-flags/{flag_name}/toggle` | Toggle Feature Flag      | Yes  |
| `GET`    | `/api/admin/kb/documents`                     | List Documents           | Yes  |
| `POST`   | `/api/admin/kb/documents`                     | Upload Document          | Yes  |
| `DELETE` | `/api/admin/kb/documents/{document_id}`       | Delete Document          | Yes  |
| `GET`    | `/api/admin/kb/documents/{document_id}`       | Get Document             | Yes  |
| `GET`    | `/api/admin/panel/audit-logs`                 | Get Audit Logs           | Yes  |
| `GET`    | `/api/admin/panel/metrics`                    | Get System Metrics       | Yes  |
| `GET`    | `/api/admin/panel/summary`                    | Get System Summary       | Yes  |
| `GET`    | `/api/admin/panel/users`                      | List Users               | Yes  |
| `DELETE` | `/api/admin/panel/users/{user_id}`            | Delete User              | Yes  |
| `GET`    | `/api/admin/panel/users/{user_id}`            | Get User                 | Yes  |
| `PUT`    | `/api/admin/panel/users/{user_id}`            | Update User              | Yes  |
| `GET`    | `/api/admin/panel/websocket-status`           | Get Websocket Status     | Yes  |

### Authentication

| Method | Path                                   | Summary               | Auth |
| ------ | -------------------------------------- | --------------------- | ---- |
| `POST` | `/api/auth/login`                      | Login                 | No   |
| `POST` | `/api/auth/logout`                     | Logout                | Yes  |
| `GET`  | `/api/auth/me`                         | Get Current User Info | Yes  |
| `GET`  | `/api/auth/oauth/{provider}/authorize` | Oauth Authorize       | No   |
| `POST` | `/api/auth/oauth/{provider}/callback`  | Oauth Callback        | No   |
| `GET`  | `/api/auth/oauth/{provider}/status`    | Oauth Provider Status | No   |
| `POST` | `/api/auth/refresh`                    | Refresh Token         | No   |
| `POST` | `/api/auth/register`                   | Register              | No   |

### Conversations

| Method   | Path                                                            | Summary                      | Auth |
| -------- | --------------------------------------------------------------- | ---------------------------- | ---- |
| `GET`    | `/api/conversations`                                            | List Conversations           | Yes  |
| `POST`   | `/api/conversations`                                            | Create Conversation          | Yes  |
| `DELETE` | `/api/conversations/{conversation_id}`                          | Delete Conversation          | Yes  |
| `GET`    | `/api/conversations/{conversation_id}`                          | Get Conversation             | Yes  |
| `PATCH`  | `/api/conversations/{conversation_id}`                          | Update Conversation          | Yes  |
| `GET`    | `/api/conversations/{conversation_id}/events`                   | Get Conversation Events      | Yes  |
| `GET`    | `/api/conversations/{conversation_id}/messages`                 | Get Messages                 | Yes  |
| `POST`   | `/api/conversations/{conversation_id}/messages`                 | Create Message               | Yes  |
| `DELETE` | `/api/conversations/{conversation_id}/messages/{message_id}`    | Delete Message               | Yes  |
| `PATCH`  | `/api/conversations/{conversation_id}/messages/{message_id}`    | Edit Message                 | Yes  |
| `GET`    | `/api/conversations/{conversation_id}/settings`                 | Get Conversation Settings    | Yes  |
| `PATCH`  | `/api/conversations/{conversation_id}/settings`                 | Patch Conversation Settings  | Yes  |
| `PUT`    | `/api/conversations/{conversation_id}/settings`                 | Update Conversation Settings | Yes  |
| `GET`    | `/api/conversations/{session_id}/branches`                      | List Branches                | Yes  |
| `POST`   | `/api/conversations/{session_id}/branches`                      | Create Branch                | Yes  |
| `GET`    | `/api/conversations/{session_id}/branches/{branch_id}/messages` | Get Branch Messages          | Yes  |

### Health

| Method | Path               | Summary               | Auth |
| ------ | ------------------ | --------------------- | ---- |
| `GET`  | `/health`          | Health Check          | No   |
| `GET`  | `/health/detailed` | Detailed Health Check | No   |
| `GET`  | `/health/openai`   | Openai Health Check   | No   |
| `GET`  | `/ready`           | Readiness Check       | No   |

### Integrations

| Method   | Path                                            | Summary              | Auth |
| -------- | ----------------------------------------------- | -------------------- | ---- |
| `GET`    | `/api/integrations/calendar/calendars`          | List Calendars       | Yes  |
| `GET`    | `/api/integrations/calendar/events`             | List Events          | Yes  |
| `POST`   | `/api/integrations/calendar/events`             | Create Event         | Yes  |
| `DELETE` | `/api/integrations/calendar/events/{event_uid}` | Delete Event         | Yes  |
| `PUT`    | `/api/integrations/calendar/events/{event_uid}` | Update Event         | Yes  |
| `GET`    | `/api/integrations/email/folders`               | List Email Folders   | Yes  |
| `GET`    | `/api/integrations/email/messages`              | List Email Messages  | Yes  |
| `POST`   | `/api/integrations/email/send`                  | Send Email           | Yes  |
| `POST`   | `/api/integrations/files/index`                 | Index Specific File  | Yes  |
| `POST`   | `/api/integrations/files/scan-and-index`        | Scan And Index Files | Yes  |

### Observability

| Method | Path       | Summary            | Auth |
| ------ | ---------- | ------------------ | ---- |
| `GET`  | `/metrics` | Prometheus Metrics | No   |

### Untagged

| Method   | Path                                               | Summary                      | Auth |
| -------- | -------------------------------------------------- | ---------------------------- | ---- |
| `DELETE` | `/api/attachments/{attachment_id}`                 | Delete Attachment            | Yes  |
| `GET`    | `/api/attachments/{attachment_id}/download`        | Download Attachment          | Yes  |
| `POST`   | `/api/clinical-contexts`                           | Create Clinical Context      | Yes  |
| `GET`    | `/api/clinical-contexts/current`                   | Get Current Clinical Context | Yes  |
| `DELETE` | `/api/clinical-contexts/{context_id}`              | Delete Clinical Context      | Yes  |
| `GET`    | `/api/clinical-contexts/{context_id}`              | Get Clinical Context         | Yes  |
| `PUT`    | `/api/clinical-contexts/{context_id}`              | Update Clinical Context      | Yes  |
| `GET`    | `/api/folders`                                     | List Folders                 | Yes  |
| `POST`   | `/api/folders`                                     | Create Folder                | Yes  |
| `GET`    | `/api/folders/tree`                                | Get Folder Tree              | Yes  |
| `DELETE` | `/api/folders/{folder_id}`                         | Delete Folder                | Yes  |
| `GET`    | `/api/folders/{folder_id}`                         | Get Folder                   | Yes  |
| `PUT`    | `/api/folders/{folder_id}`                         | Update Folder                | Yes  |
| `POST`   | `/api/folders/{folder_id}/move/{target_folder_id}` | Move Folder                  | Yes  |
| `GET`    | `/api/messages/{message_id}/attachments`           | List Attachments             | Yes  |
| `POST`   | `/api/messages/{message_id}/attachments`           | Upload Attachment            | Yes  |
| `GET`    | `/api/sessions/{session_id}/export/markdown`       | Export Markdown              | Yes  |
| `GET`    | `/api/sessions/{session_id}/export/pdf`            | Export Pdf                   | Yes  |
| `POST`   | `/api/sessions/{session_id}/share`                 | Create Share Link            | Yes  |
| `DELETE` | `/api/sessions/{session_id}/share/{share_token}`   | Revoke Share Link            | Yes  |
| `GET`    | `/api/sessions/{session_id}/shares`                | List Share Links             | Yes  |
| `GET`    | `/api/shared/{share_token}`                        | Get Shared Conversation      | No   |

### Users

| Method   | Path                                 | Summary                     | Auth |
| -------- | ------------------------------------ | --------------------------- | ---- |
| `GET`    | `/api/users/`                        | List Users                  | Yes  |
| `DELETE` | `/api/users/me`                      | Delete Current User Account | Yes  |
| `GET`    | `/api/users/me`                      | Get Current User Profile    | Yes  |
| `PUT`    | `/api/users/me`                      | Update Current User Profile | Yes  |
| `POST`   | `/api/users/me/change-password`      | Change Password             | Yes  |
| `GET`    | `/api/users/{user_id}`               | Get User By Id              | Yes  |
| `PATCH`  | `/api/users/{user_id}`               | Update User                 | Yes  |
| `PUT`    | `/api/users/{user_id}/activate`      | Activate User               | Yes  |
| `PUT`    | `/api/users/{user_id}/deactivate`    | Deactivate User             | Yes  |
| `PUT`    | `/api/users/{user_id}/promote-admin` | Promote To Admin            | Yes  |
| `PUT`    | `/api/users/{user_id}/revoke-admin`  | Revoke Admin Privileges     | Yes  |

### Voice

| Method | Path                          | Summary                             | Auth |
| ------ | ----------------------------- | ----------------------------------- | ---- |
| `POST` | `/api/voice/metrics`          | Submit voice session metrics        | Yes  |
| `POST` | `/api/voice/realtime-session` | Create Realtime API session         | Yes  |
| `POST` | `/api/voice/relay`            | Relay final voice transcript to RAG | Yes  |
| `POST` | `/api/voice/synthesize`       | Synthesize speech from text         | Yes  |
| `POST` | `/api/voice/transcribe`       | Transcribe audio to text            | Yes  |

---

## Authentication

Most endpoints require authentication via Bearer token:

```
Authorization: Bearer <access_token>
```

Obtain tokens via `/api/auth/login` or `/api/auth/register`.

---

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available at:

- **Swagger UI:** `/docs`
- **ReDoc:** `/redoc`
- **OpenAPI JSON:** `/openapi.json`

---

_This document is auto-generated from the OpenAPI specification._
_Do not edit manually - regenerate using `tools/generate_api_docs.py`._
