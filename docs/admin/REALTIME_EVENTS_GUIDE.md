---
title: Real-Time Events Guide
description: Guide to the admin panel real-time event system using WebSocket and Redis pub/sub
version: 1.0.0
status: active
last_updated: "2025-12-01"
audience:
  - admin
  - developers
  - ai-agents
tags:
  - admin
  - real-time
  - websocket
  - redis
  - events
---

# Real-Time Events Guide

This guide covers the real-time event system that powers live updates in the VoiceAssist admin panel.

## Overview

The admin panel uses a real-time event system to provide live visibility into platform activity. Events are published from various backend services via Redis pub/sub and delivered to admin clients via WebSocket.

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Backend    │    │   Backend    │    │   Backend    │
│  Service A   │    │  Service B   │    │  Service C   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └─────────┬─────────┴─────────┬─────────┘
                 │                   │
                 ▼                   ▼
         ┌───────────────────────────────────┐
         │         Redis Pub/Sub             │
         │      Channel: admin:events        │
         └───────────────┬───────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────┐
         │        API Gateway                │
         │   WebSocket: /api/admin/panel/ws  │
         └───────────────┬───────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Admin 1 │    │ Admin 2 │    │ Admin 3 │
    └─────────┘    └─────────┘    └─────────┘
```

## Event Types

### Session Events

| Event                  | Description                           | Triggered By      |
| ---------------------- | ------------------------------------- | ----------------- |
| `session.connected`    | User WebSocket connection established | WebSocket connect |
| `session.disconnected` | User WebSocket connection closed      | WebSocket close   |

**Payload:**

```json
{
  "type": "session.connected",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "user_email": "user@example.com",
  "session_id": "ws-session-uuid",
  "data": {
    "session_type": "web"
  }
}
```

### Conversation Events

| Event                  | Description              | Triggered By                      |
| ---------------------- | ------------------------ | --------------------------------- |
| `conversation.created` | New conversation started | First message in new conversation |
| `conversation.updated` | Conversation modified    | Title change, settings update     |
| `conversation.deleted` | Conversation removed     | User or admin deletion            |

**Payload:**

```json
{
  "type": "conversation.created",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "resource_id": "conv-uuid",
  "resource_type": "conversation",
  "data": {
    "title": "New Conversation"
  }
}
```

### Message Events

| Event             | Description                       | Triggered By              |
| ----------------- | --------------------------------- | ------------------------- |
| `message.created` | New message added to conversation | User input or AI response |

**Payload:**

```json
{
  "type": "message.created",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "resource_id": "msg-uuid",
  "resource_type": "message",
  "data": {
    "conversation_id": "conv-uuid",
    "role": "user"
  }
}
```

### Clinical Context Events

| Event                      | Description                  | Triggered By    |
| -------------------------- | ---------------------------- | --------------- |
| `clinical_context.created` | New clinical context created | First PHI entry |
| `clinical_context.updated` | Context modified             | PHI update      |

**Payload:**

```json
{
  "type": "clinical_context.updated",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "resource_id": "ctx-uuid",
  "resource_type": "clinical_context",
  "data": {
    "fields_updated": ["medications", "allergies"]
  }
}
```

### PHI Events

| Event          | Description                | Triggered By          |
| -------------- | -------------------------- | --------------------- |
| `phi.accessed` | PHI data revealed by admin | Admin reveal action   |
| `phi.detected` | PHI detected in message    | PHI detection service |

**Payload (phi.accessed):**

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

### Voice Events

| Event                   | Description             | Triggered By            |
| ----------------------- | ----------------------- | ----------------------- |
| `voice.session_started` | Voice session began     | Voice mode activation   |
| `voice.session_ended`   | Voice session completed | Voice mode deactivation |
| `voice.session_error`   | Voice session error     | Processing failure      |

**Payload:**

```json
{
  "type": "voice.session_started",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "session_id": "voice-session-uuid",
  "resource_type": "voice_session",
  "data": {
    "session_type": "realtime",
    "voice": "alloy"
  }
}
```

### TT Pipeline Events

| Event                | Description                   | Triggered By             |
| -------------------- | ----------------------------- | ------------------------ |
| `tt.state_changed`   | TT pipeline state transition  | State machine transition |
| `tt.tool_called`     | Tool execution in TT pipeline | Tool invocation          |
| `tt.context_created` | New TT context window         | Context initialization   |
| `tt.context_expired` | TT context expired            | TTL expiration           |

**Payload (tt.state_changed):**

```json
{
  "type": "tt.state_changed",
  "timestamp": "2025-12-01T16:00:00Z",
  "user_id": "user-uuid",
  "session_id": "tt-session-uuid",
  "resource_type": "tt_session",
  "data": {
    "new_state": "thinking",
    "previous_state": "listening"
  }
}
```

### System Events

| Event                   | Description               | Triggered By        |
| ----------------------- | ------------------------- | ------------------- |
| `system.alert`          | System alert notification | Monitoring triggers |
| `system.health_changed` | Health status change      | Health check        |

**Payload:**

```json
{
  "type": "system.alert",
  "timestamp": "2025-12-01T16:00:00Z",
  "data": {
    "alert_type": "high_latency",
    "message": "TT pipeline latency exceeds threshold",
    "severity": "warning",
    "details": {
      "current_latency_ms": 2500,
      "threshold_ms": 2000
    }
  }
}
```

### User Events

| Event             | Description         | Triggered By           |
| ----------------- | ------------------- | ---------------------- |
| `user.logged_in`  | User login          | Authentication success |
| `user.logged_out` | User logout         | Session termination    |
| `user.created`    | New user registered | Registration           |

## Backend Integration

### Publishing Events

Use the `AdminEventPublisher` service to publish events from backend services:

```python
from app.services.admin_event_publisher import (
    AdminEvent,
    AdminEventType,
    AdminEventPublisher,
)

# Get the publisher singleton
publisher = AdminEventPublisher.get_instance()

# Create and publish an event
event = AdminEvent(
    event_type=AdminEventType.VOICE_SESSION_STARTED,
    user_id="user-uuid",
    session_id="session-uuid",
    data={
        "session_type": "realtime",
        "voice": "alloy"
    }
)
await publisher.publish(event)
```

### Convenience Functions

For common events, use the provided convenience functions:

```python
from app.services.admin_event_publisher import (
    publish_session_connected,
    publish_conversation_created,
    publish_message_created,
    publish_voice_session_started,
    publish_voice_session_ended,
    publish_tt_state_changed,
    publish_phi_accessed,
    publish_system_alert,
)

# Session events
await publish_session_connected(
    user_id="user-uuid",
    user_email="user@example.com",
    session_id="ws-uuid",
    session_type="web"
)

# Voice events
await publish_voice_session_started(
    user_id="user-uuid",
    session_id="voice-uuid",
    session_type="realtime",
    voice="alloy"
)

# TT pipeline events
await publish_tt_state_changed(
    user_id="user-uuid",
    session_id="tt-uuid",
    new_state="thinking",
    previous_state="listening"
)

# PHI audit events (published immediately)
await publish_phi_accessed(
    admin_user_id="admin-uuid",
    admin_email="admin@example.com",
    context_id="ctx-uuid",
    target_user_id="user-uuid"
)

# System alerts (published immediately)
await publish_system_alert(
    alert_type="high_latency",
    message="TT pipeline latency exceeds threshold",
    severity="warning",
    details={"current_latency_ms": 2500}
)
```

### Event Buffering

Most events are buffered for efficiency:

- **Buffer size**: 50 events
- **Flush interval**: 1 second
- **Immediate events**: PHI access, system alerts, voice session start, TT state changes

```python
# Regular publish (buffered)
await publisher.publish(event)

# Immediate publish (bypasses buffer)
await publisher.publish_immediate(event)
```

### Starting the Publisher

Initialize the publisher during application startup:

```python
from fastapi import FastAPI
from app.services.admin_event_publisher import AdminEventPublisher

app = FastAPI()

@app.on_event("startup")
async def startup():
    publisher = AdminEventPublisher.get_instance()
    await publisher.start()

@app.on_event("shutdown")
async def shutdown():
    publisher = AdminEventPublisher.get_instance()
    await publisher.stop()
```

## Frontend Integration

### Using the React Hook

The `useRealtimeEvents` hook provides a complete interface for consuming real-time events:

```tsx
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

function EventMonitor() {
  const { status, events, metrics, lastEventTime, reconnectAttempts, connect, disconnect, clearEvents, subscribe } =
    useRealtimeEvents({
      autoConnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      eventFilter: ["voice.session_started", "voice.session_ended"],
      onEvent: (event) => {
        console.log("Event received:", event);
      },
      onMetrics: (metrics) => {
        console.log("Metrics update:", metrics);
      },
      onConnectionChange: (status) => {
        console.log("Connection status:", status);
      },
    });

  return (
    <div>
      <div>Status: {status}</div>
      <div>Last event: {lastEventTime}</div>
      <div>Reconnect attempts: {reconnectAttempts}</div>

      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={clearEvents}>Clear Events</button>

      <ul>
        {events.map((event, i) => (
          <li key={i}>
            {event.type}: {event.timestamp}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Hook Options

| Option                 | Type     | Default   | Description          |
| ---------------------- | -------- | --------- | -------------------- |
| `autoConnect`          | boolean  | true      | Connect on mount     |
| `reconnectInterval`    | number   | 5000      | Reconnect delay (ms) |
| `maxReconnectAttempts` | number   | 10        | Max reconnect tries  |
| `eventFilter`          | string[] | undefined | Filter event types   |
| `onEvent`              | function | undefined | Event callback       |
| `onMetrics`            | function | undefined | Metrics callback     |
| `onConnectionChange`   | function | undefined | Status callback      |

### Hook Return Values

| Value               | Type             | Description                                               |
| ------------------- | ---------------- | --------------------------------------------------------- |
| `status`            | ConnectionStatus | connecting, connected, reconnecting, disconnected, failed |
| `events`            | AdminEvent[]     | Event buffer (max 100)                                    |
| `metrics`           | MetricsUpdate    | Latest metrics                                            |
| `lastEventTime`     | string           | Timestamp of last event                                   |
| `reconnectAttempts` | number           | Current reconnect count                                   |
| `connect`           | function         | Manual connect                                            |
| `disconnect`        | function         | Manual disconnect                                         |
| `clearEvents`       | function         | Clear event buffer                                        |
| `subscribe`         | function         | Subscribe to event types                                  |

### Event Listener Hook

For listening to specific event types:

```tsx
import { useAdminEventListener } from "@/hooks/useRealtimeEvents";

function VoiceSessionAlert() {
  const voiceEvents = useAdminEventListener(["voice.session_started", "voice.session_ended"], (event) => {
    if (event.type === "voice.session_started") {
      showNotification("Voice session started");
    }
  });

  return <div>Active voice sessions: {voiceEvents.filter((e) => e.type === "voice.session_started").length}</div>;
}
```

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket("wss://admin.asimo.io/api/admin/panel/ws");
```

### Message Types

**Client → Server:**

| Type        | Description              |
| ----------- | ------------------------ |
| `ping`      | Keep-alive ping          |
| `subscribe` | Subscribe to event types |

**Server → Client:**

| Type             | Description            |
| ---------------- | ---------------------- |
| `connected`      | Connection confirmed   |
| `pong`           | Keep-alive response    |
| `heartbeat`      | Server heartbeat       |
| `admin_event`    | Admin event            |
| `metrics_update` | Metrics snapshot       |
| `subscribed`     | Subscription confirmed |

### Subscribing to Events

```json
// Client sends
{
  "type": "subscribe",
  "payload": {
    "event_types": ["voice.session_started", "voice.session_ended"]
  }
}

// Server responds
{
  "type": "subscribed",
  "payload": {
    "event_types": ["voice.session_started", "voice.session_ended"]
  }
}
```

### Keep-Alive

The client should send pings every 30 seconds:

```json
// Client sends
{ "type": "ping" }

// Server responds
{ "type": "pong" }
```

## Configuration

### Redis Configuration

```env
REDIS_URL=redis://localhost:6379
ADMIN_EVENTS_CHANNEL=admin:events
```

### Publisher Configuration

```python
# In admin_event_publisher.py
ADMIN_EVENTS_CHANNEL = "admin:events"

class AdminEventPublisher:
    _buffer_size = 50        # Events before auto-flush
    _flush_interval = 1.0    # Seconds between flushes
```

### WebSocket Configuration

```python
# In admin_panel.py
ADMIN_EVENTS_CHANNEL = "admin:events"
HEARTBEAT_INTERVAL = 30  # seconds
```

## Monitoring

### Redis Commands

```bash
# Monitor all pub/sub messages
redis-cli MONITOR

# Subscribe to admin events channel
redis-cli SUBSCRIBE admin:events

# Check pub/sub stats
redis-cli PUBSUB CHANNELS
redis-cli PUBSUB NUMSUB admin:events
```

### Metrics

The WebSocket provides periodic metrics updates:

```json
{
  "type": "metrics_update",
  "payload": {
    "active_websocket_sessions": 5,
    "database_pool": {
      "pool_size": 20,
      "checked_out": 3,
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

## Troubleshooting

### Events Not Arriving

1. **Check Redis connection:**

   ```bash
   redis-cli ping
   ```

2. **Verify publisher is started:**

   ```python
   # Check in application startup
   logger.info("AdminEventPublisher started")
   ```

3. **Monitor Redis channel:**

   ```bash
   redis-cli SUBSCRIBE admin:events
   ```

4. **Check WebSocket connection:**
   - Browser DevTools → Network → WS
   - Verify connection status is "connected"

### WebSocket Disconnects

1. **Check for CORS issues:**

   ```env
   ADMIN_PANEL_CORS_ORIGINS=https://admin.asimo.io
   ```

2. **Verify authentication:**
   - JWT token must be valid
   - Admin role must be present

3. **Check reconnection:**
   - Hook automatically reconnects up to `maxReconnectAttempts`
   - Exponential backoff between attempts

### High Event Volume

1. **Adjust buffer settings:**

   ```python
   publisher._buffer_size = 100
   publisher._flush_interval = 2.0
   ```

2. **Filter events on client:**

   ```tsx
   useRealtimeEvents({
     eventFilter: ["voice.session_started"], // Only receive voice events
   });
   ```

3. **Implement event aggregation:**
   - Aggregate similar events before publishing
   - Use batching for high-frequency events
