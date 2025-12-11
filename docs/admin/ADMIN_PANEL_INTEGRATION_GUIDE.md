---
title: Admin Panel Integration Guide
slug: admin/admin-panel-integration-guide
summary: Comprehensive guide for the VoiceAssist admin panel with cross-app navigation, real-time events, and voice monitoring
ai_summary: Admin panel integrates cross-app navigation, real-time event streaming via WebSocket/Redis, and voice session monitoring. Provides centralized control for feature flags, knowledge base, and system health.
status: stable
owner: frontend
lastUpdated: "2025-12-04"
audience:
  - admin
  - developers
  - ai-agents
category: reference
tags:
  - admin
  - integration
  - voice-monitoring
  - real-time
component: "frontend/admin-panel"
relatedPaths:
  - "apps/admin-panel/src/App.tsx"
  - "apps/admin-panel/src/components/AdminLayout.tsx"
  - "services/api-gateway/app/api/admin_panel.py"
  - "apps/web-app/src/components/admin/VoiceAdminPanel.tsx"
---

# Admin Panel Integration Guide

This guide covers the VoiceAssist admin panel integration with the main web app, including cross-app navigation, real-time event streaming, and voice session monitoring.

**Admin Panel URL:** http://localhost:5174

## Table of Contents

1. [Overview](#overview)
2. [Cross-App Navigation](#cross-app-navigation)
3. [Conversations Management](#conversations-management)
4. [Clinical Contexts & PHI](#clinical-contexts--phi)
5. [Voice Monitor & TT Pipeline](#voice-monitor--tt-pipeline)
6. [Real-Time Events](#real-time-events)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)

---

## Overview

The admin panel provides a centralized interface for monitoring and managing the VoiceAssist platform. Key capabilities include:

- **Conversations Management**: View all user conversations with full message history
- **Clinical Contexts**: Access and audit PHI data with HIPAA-compliant logging
- **Voice Monitoring**: Real-time visibility into voice sessions and the Thinker-Talker pipeline
- **System Metrics**: Database pools, Redis connections, and WebSocket sessions
- **Real-Time Events**: Live event streaming via WebSocket with Redis pub/sub

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Panel   │     │    Web App      │     │   Docs Site     │
│ localhost:5174  │────▶│  localhost:5173   │────▶│  localhost:3001  │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌─────────────────────┐
         │    API Gateway      │
         │  /api/admin/panel/* │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼────┐          ┌─────▼────┐
    │ Database │          │  Redis   │
    │PostgreSQL│          │ Pub/Sub  │
    └──────────┘          └──────────┘
```

---

## Cross-App Navigation

The admin panel integrates seamlessly with other VoiceAssist applications through a unified navigation system.

### Navigation Configuration

The navigation configuration is defined in `/apps/admin-panel/src/config/externalLinks.ts`:

```typescript
export interface ExternalApp {
  id: string;
  name: string;
  url: string;
  description: string;
  icon: string;
}

export const externalApps: ExternalApp[] = [
  {
    id: "web-app",
    name: "VoiceAssist App",
    url: "http://localhost:5173",
    description: "Main voice assistant application",
    icon: "MessageSquare",
  },
  {
    id: "docs",
    name: "Documentation",
    url: "http://localhost:3001",
    description: "Technical documentation",
    icon: "Book",
  },
];
```

### Using the AppSwitcher Component

The `AppSwitcher` component provides a dropdown menu for navigating between applications:

```tsx
import { AppSwitcher } from "@/components/AppSwitcher";

// In your header component
<AppSwitcher currentApp="admin" />;
```

### Environment Variables

Configure application URLs via environment variables:

```env
VITE_WEB_APP_URL=http://localhost:5173
VITE_DOCS_URL=http://localhost:3001
VITE_ADMIN_URL=http://localhost:5174
```

---

## Conversations Management

The Conversations page provides administrators with visibility into all user conversations.

### Accessing Conversations

Navigate to **Conversations** in the admin sidebar to view:

- All conversations across all users
- Message count and creation time
- Last activity timestamp
- Conversation title and status

### Conversation List API

```http
GET /api/admin/panel/conversations
```

Query parameters:

- `user_id` (optional): Filter by user
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Results per page (default: 50)
- `sort_by` (optional): Sort field (created_at, updated_at, message_count)
- `sort_order` (optional): asc or desc

Response:

```json
{
  "conversations": [
    {
      "id": "conv-uuid",
      "user_id": "user-uuid",
      "user_email": "user@example.com",
      "title": "Conversation Title",
      "message_count": 42,
      "created_at": "2025-12-01T10:00:00Z",
      "updated_at": "2025-12-01T15:30:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 50
}
```

### Viewing Conversation Details

```http
GET /api/admin/panel/conversations/{conversation_id}
```

Returns the full conversation with all messages:

```json
{
  "id": "conv-uuid",
  "user_id": "user-uuid",
  "user_email": "user@example.com",
  "title": "Conversation Title",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "Hello, I have a question...",
      "created_at": "2025-12-01T10:00:00Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "I'd be happy to help...",
      "created_at": "2025-12-01T10:00:05Z"
    }
  ],
  "created_at": "2025-12-01T10:00:00Z",
  "updated_at": "2025-12-01T15:30:00Z"
}
```

---

## Clinical Contexts & PHI

The Clinical Contexts page provides HIPAA-compliant access to Protected Health Information (PHI).

### PHI Access Requirements

- All PHI access is logged with admin user ID, timestamp, and target user
- PHI data is masked by default until explicitly revealed
- Access requires appropriate admin role permissions

### Clinical Context List

```http
GET /api/admin/panel/clinical-contexts
```

Query parameters:

- `user_id` (optional): Filter by user
- `has_phi` (optional): Filter by PHI presence (true/false)
- `page` (optional): Page number
- `page_size` (optional): Results per page

Response with masked PHI:

```json
{
  "contexts": [
    {
      "id": "ctx-uuid",
      "user_id": "user-uuid",
      "user_email": "user@example.com",
      "has_phi": true,
      "phi_masked": {
        "conditions": ["[REDACTED]"],
        "medications": ["[REDACTED]"],
        "allergies": ["[REDACTED]"]
      },
      "created_at": "2025-12-01T10:00:00Z",
      "updated_at": "2025-12-01T15:30:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 50
}
```

### Revealing PHI

To reveal PHI data (logged for audit):

```http
POST /api/admin/panel/clinical-contexts/{context_id}/reveal
```

Response includes unmasked PHI:

```json
{
  "id": "ctx-uuid",
  "phi": {
    "conditions": ["Hypertension", "Type 2 Diabetes"],
    "medications": ["Metformin 500mg", "Lisinopril 10mg"],
    "allergies": ["Penicillin"]
  },
  "revealed_at": "2025-12-01T16:00:00Z",
  "revealed_by": "admin@example.com"
}
```

### Audit Logging

All PHI access events are published to the real-time event stream:

```json
{
  "type": "phi.accessed",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "admin-uuid",
  "user_email": "admin@example.com",
  "resource_id": "ctx-uuid",
  "resource_type": "clinical_context",
  "data": {
    "target_user_id": "user-uuid"
  }
}
```

---

## Voice Monitor & TT Pipeline

The Voice Monitor provides real-time visibility into voice sessions and the Thinker-Talker (TT) pipeline.

### Voice Sessions Tab

View all active voice sessions:

| Field      | Description                                |
| ---------- | ------------------------------------------ |
| Session ID | Unique WebSocket session identifier        |
| User       | Email of connected user                    |
| Status     | connected, speaking, listening, processing |
| Duration   | Time since connection                      |
| Voice      | Selected TTS voice                         |
| Quality    | Audio quality preset                       |

### TT Pipeline Tab

Monitor the Thinker-Talker pipeline components:

#### TT Sessions

Active Thinker-Talker sessions with state information:

- **Session ID**: Unique TT session identifier
- **State**: idle, thinking, speaking, listening, tool_executing
- **Thinker Model**: Active LLM model
- **Current Tool**: Currently executing tool (if any)
- **Latency**: Round-trip processing time

#### TT Contexts

Active context windows with expiration tracking:

- **Context ID**: Unique context identifier
- **Session ID**: Parent TT session
- **Created**: Context creation time
- **Expires**: TTL expiration time
- **Size**: Context token count

#### Quality Presets

Available audio quality configurations:

| Preset | Sample Rate | Bit Depth | Buffer Size |
| ------ | ----------- | --------- | ----------- |
| high   | 48000 Hz    | 24-bit    | 4096        |
| medium | 44100 Hz    | 16-bit    | 2048        |
| low    | 22050 Hz    | 16-bit    | 1024        |

### Analytics Tab

Voice pipeline performance metrics:

- **Tool Call Frequency**: Bar chart of most-used tools
- **KB Performance**: Knowledge base query latency
- **Average Latency**: TT pipeline response time
- **Error Rate**: Failed voice sessions percentage

### API Endpoints

```http
# Get active voice sessions
GET /api/admin/panel/voice/sessions

# Get TT pipeline state
GET /api/admin/panel/voice/tt-sessions
GET /api/admin/panel/voice/tt-contexts
GET /api/admin/panel/voice/quality-presets

# Get TT analytics
GET /api/admin/panel/voice/tt-analytics

# Cleanup expired contexts
POST /api/admin/panel/voice/tt-contexts/cleanup

# Disconnect a voice session
POST /api/admin/panel/voice/sessions/{session_id}/disconnect
```

---

## Real-Time Events

The admin panel receives real-time events via WebSocket, powered by Redis pub/sub.

### WebSocket Connection

Connect to the admin WebSocket endpoint:

```typescript
const ws = new WebSocket("wss://localhost:5174/api/admin/panel/ws");
```

### Event Types

| Event Type                 | Description                 |
| -------------------------- | --------------------------- |
| `session.connected`        | User connected to WebSocket |
| `session.disconnected`     | User disconnected           |
| `conversation.created`     | New conversation started    |
| `conversation.updated`     | Conversation modified       |
| `message.created`          | New message added           |
| `clinical_context.created` | New clinical context        |
| `clinical_context.updated` | Context modified            |
| `phi.accessed`             | PHI data revealed (audit)   |
| `phi.detected`             | PHI detected in message     |
| `voice.session_started`    | Voice session began         |
| `voice.session_ended`      | Voice session ended         |
| `voice.session_error`      | Voice session error         |
| `tt.state_changed`         | TT pipeline state change    |
| `tt.tool_called`           | TT tool execution           |
| `tt.context_created`       | TT context created          |
| `tt.context_expired`       | TT context expired          |
| `system.alert`             | System alert notification   |
| `system.health_changed`    | Health status change        |
| `user.logged_in`           | User login                  |
| `user.logged_out`          | User logout                 |
| `user.created`             | New user registered         |

### Event Payload Format

```json
{
  "type": "admin_event",
  "payload": {
    "type": "voice.session_started",
    "timestamp": "2025-12-01T16:00:00Z",
    "user_id": "user-uuid",
    "user_email": "user@example.com",
    "session_id": "ws-session-uuid",
    "resource_id": "voice-session-uuid",
    "resource_type": "voice_session",
    "data": {
      "session_type": "realtime",
      "voice": "alloy"
    }
  }
}
```

### Subscribing to Events

Filter events by type:

```typescript
ws.send(
  JSON.stringify({
    type: "subscribe",
    payload: {
      event_types: ["voice.session_started", "voice.session_ended"],
    },
  }),
);
```

### Using the React Hook

```tsx
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

function VoiceMonitor() {
  const { status, events, metrics, connect, disconnect } = useRealtimeEvents({
    autoConnect: true,
    eventFilter: ["voice.session_started", "voice.session_ended"],
    onEvent: (event) => {
      console.log("New event:", event);
    },
    onMetrics: (metrics) => {
      console.log("Metrics update:", metrics);
    },
  });

  return (
    <div>
      <p>Connection: {status}</p>
      <p>Events received: {events.length}</p>
    </div>
  );
}
```

### Metrics Updates

The WebSocket also receives periodic metrics:

```json
{
  "type": "metrics_update",
  "payload": {
    "active_websocket_sessions": 42,
    "database_pool": {
      "pool_size": 20,
      "checked_out": 5,
      "overflow": 0
    },
    "redis_pool": {
      "total_connections": 10,
      "available_connections": 8
    },
    "timestamp": "2025-12-01T16:00:00Z"
  }
}
```

---

## API Reference

### Admin Panel Endpoints

All endpoints require admin authentication.

| Method | Endpoint                                          | Description             |
| ------ | ------------------------------------------------- | ----------------------- |
| GET    | `/api/admin/panel/conversations`                  | List conversations      |
| GET    | `/api/admin/panel/conversations/{id}`             | Get conversation detail |
| GET    | `/api/admin/panel/clinical-contexts`              | List clinical contexts  |
| GET    | `/api/admin/panel/clinical-contexts/{id}`         | Get context detail      |
| POST   | `/api/admin/panel/clinical-contexts/{id}/reveal`  | Reveal PHI              |
| GET    | `/api/admin/panel/voice/sessions`                 | List voice sessions     |
| POST   | `/api/admin/panel/voice/sessions/{id}/disconnect` | Disconnect session      |
| GET    | `/api/admin/panel/voice/tt-sessions`              | List TT sessions        |
| GET    | `/api/admin/panel/voice/tt-contexts`              | List TT contexts        |
| POST   | `/api/admin/panel/voice/tt-contexts/cleanup`      | Cleanup contexts        |
| GET    | `/api/admin/panel/voice/quality-presets`          | Get quality presets     |
| GET    | `/api/admin/panel/voice/tt-analytics`             | Get TT analytics        |
| WS     | `/api/admin/panel/ws`                             | Real-time events        |

### Authentication

All admin API requests require a valid JWT token in the Authorization header:

```http
Authorization: Bearer <admin_jwt_token>
```

### Error Responses

```json
{
  "detail": "Not authorized to access this resource",
  "status_code": 403
}
```

---

## Configuration

### Environment Variables

```env
# API Gateway
ADMIN_PANEL_ENABLED=true
ADMIN_PANEL_CORS_ORIGINS=http://localhost:5174

# Redis (for real-time events)
REDIS_URL=redis://localhost:6379
ADMIN_EVENTS_CHANNEL=admin:events

# Database
DATABASE_URL=postgresql://user:pass@localhost/voiceassist

# JWT
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
```

### Redis Pub/Sub Configuration

The admin event publisher uses Redis pub/sub for broadcasting events:

```python
from app.services.admin_event_publisher import (
    AdminEventPublisher,
    publish_voice_session_started,
    publish_phi_accessed,
)

# Start the publisher
publisher = AdminEventPublisher.get_instance()
await publisher.start()

# Publish events
await publish_voice_session_started(
    user_id="user-uuid",
    session_id="session-uuid",
    session_type="realtime",
    voice="alloy"
)
```

### Feature Flags

```env
# Enable/disable admin features
FEATURE_ADMIN_VOICE_MONITOR=true
FEATURE_ADMIN_REALTIME_EVENTS=true
FEATURE_ADMIN_PHI_ACCESS=true
```

---

## Troubleshooting

### WebSocket Connection Issues

1. Check that the admin panel is properly authenticated
2. Verify Redis is running and accessible
3. Check for CORS configuration issues

```bash
# Test Redis connection
redis-cli ping

# Check Redis pub/sub
redis-cli SUBSCRIBE admin:events
```

### Missing Events

1. Verify the event publisher is started during app initialization
2. Check that events are being published from the source

```python
# In main.py startup
@app.on_event("startup")
async def startup():
    publisher = AdminEventPublisher.get_instance()
    await publisher.start()
```

### PHI Access Denied

1. Verify admin user has appropriate role
2. Check audit log for access attempts
3. Confirm context ID exists

---

## Related Documentation

- [Thinker-Talker Pipeline](../THINKER_TALKER_PIPELINE.md)
- [Voice Mode Pipeline](../VOICE_MODE_PIPELINE.md)
- [Security & Compliance](../SECURITY_COMPLIANCE.md)
- [HIPAA Compliance Matrix](../HIPAA_COMPLIANCE_MATRIX.md)
- [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md)
