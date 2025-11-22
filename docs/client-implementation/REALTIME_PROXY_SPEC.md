# Real-time Proxy Specification

## Overview

The VoiceAssist platform uses WebSocket connections for real-time bidirectional communication between the client and the OpenAI Realtime API. This document specifies the protocol, message formats, error handling, and implementation details.

---

## WebSocket Endpoint

### Connection URL

```
wss://assist.asimo.io/api/realtime
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Unique conversation identifier |
| `token` | string | Yes | JWT authentication token |

### Example Connection

```javascript
const conversationId = 'conv-123';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const ws = new WebSocket(
  `wss://assist.asimo.io/api/realtime?conversationId=${conversationId}&token=${token}`
);
```

---

## Conversation Scoping

### Overview

Each WebSocket connection is scoped to a single conversation. The `conversationId` query parameter determines which conversation the WebSocket session belongs to. This scoping ensures proper message isolation and history management.

### Conversation-WebSocket Relationship

**One-to-One Mapping:**
- Each WebSocket connection is associated with exactly one conversation
- Each conversation can have at most one active WebSocket connection per client
- Messages sent over the WebSocket are automatically associated with the conversation

**Connection Lifecycle:**
```
Conversation Created → Load History → Connect WebSocket → Send/Receive Messages
                                           ↓
                        Switch Conversation: Disconnect WebSocket → Connect to New Conversation
                                           ↓
                        Delete Conversation: Disconnect WebSocket → Conversation Removed
```

### Switching Conversations

**Process:**
1. Client disconnects existing WebSocket connection
2. Client clears message state for old conversation
3. Client fetches new conversation history via REST API:
   ```
   GET /api/conversations/{newConversationId}/messages
   ```
4. Client connects new WebSocket with new `conversationId`:
   ```javascript
   const ws = new WebSocket(
     `wss://assist.asimo.io/api/realtime?conversationId=${newConversationId}&token=${token}`
   );
   ```

**Critical Requirements:**
- Old WebSocket **must** be disconnected before connecting to new conversation
- Message state **must** be cleared to prevent cross-contamination
- Connection to new conversation **must** use correct `conversationId` parameter

**Error Prevention:**
```typescript
// WRONG: Switching conversationId without disconnecting
ws.send(JSON.stringify({ conversationId: 'new-id' })); // ❌ NOT SUPPORTED

// CORRECT: Disconnect old, connect new
oldWs.close();
const newWs = new WebSocket(`wss://...?conversationId=new-id&token=${token}`); // ✅
```

### Message Persistence

**REST API (Persistent):**
- Messages are stored in the database associated with their conversation
- History retrieved via: `GET /api/conversations/{conversationId}/messages`
- Persists across WebSocket disconnections

**WebSocket (Real-time):**
- New messages sent via WebSocket are saved to database
- Streaming responses are saved when complete (`message.done` event)
- Messages persist even if WebSocket disconnects during streaming

**Initial Load:**
```typescript
// 1. Load conversation history from REST API
const history = await apiClient.getMessages(conversationId, 1, 50);

// 2. Initialize messages with history
const [messages, setMessages] = useState(history.items);

// 3. Connect WebSocket for new real-time messages
const ws = useChatSession({ conversationId, initialMessages: history.items });
```

### Authorization

**Conversation Access Control:**
1. Server validates JWT token
2. Server extracts user ID from token
3. Server checks if user owns conversation with given `conversationId`
4. If unauthorized, connection is rejected with `AUTH_FAILED` error

**Security Flow:**
```
Client connects with conversationId + token
          ↓
Server validates token signature
          ↓
Server extracts userId from token
          ↓
Server queries: SELECT * FROM conversations WHERE id = conversationId AND userId = userId
          ↓
If found: Allow connection
If not found: Reject with AUTH_FAILED
```

**See detailed conversation management:** [CONVERSATIONS_AND_ROUTING.md](./CONVERSATIONS_AND_ROUTING.md)

---

## Connection Lifecycle

### 1. Connection Handshake

```
Client                          Server
  │                               │
  ├──── WebSocket CONNECT ───────>│
  │     (with query params)       │
  │                               │
  │<──────── OPEN ────────────────┤
  │     (readyState = 1)          │
  │                               │
```

### 2. Heartbeat Mechanism

**Purpose:** Detect dead connections and keep connection alive

**Interval:** 30 seconds

**Protocol:**
```
Client                          Server
  │                               │
  ├────── ping ──────────────────>│ (every 30s)
  │                               │
  │<─────── pong ──────────────────┤
  │                               │
```

**Ping Message:**
```json
{
  "type": "ping"
}
```

**Pong Response:**
```json
{
  "type": "pong"
}
```

### 3. Connection Close

**Normal Closure:**
```
Client                          Server
  │                               │
  ├──── WebSocket CLOSE ─────────>│
  │     (code: 1000)              │
  │                               │
  │<──────── CLOSE ───────────────┤
  │                               │
```

**Abnormal Closure (triggers reconnection):**
- Code 1006: Connection dropped
- Server crashes or network failure
- Authentication failure

---

## Message Protocol

### Event Types

| Event Type | Direction | Description |
|-----------|-----------|-------------|
| `delta` | Server → Client | Incremental text update during streaming |
| `chunk` | Server → Client | Complete text chunk |
| `message.done` | Server → Client | Final message with full content and metadata |
| `message.send` | Client → Server | User sends a new message |
| `error` | Server → Client | Error occurred during processing |
| `ping` | Client → Server | Heartbeat from client |
| `pong` | Server → Client | Heartbeat response |

---

## Message Schemas

### 1. Client → Server: Send Message

**Event Type:** `message.send`

**Purpose:** User sends a new message to the assistant

**Schema:**
```typescript
interface MessageSendEvent {
  type: 'message.send';
  message: {
    id: string;              // Client-generated unique ID
    role: 'user';
    content: string;         // Message text
    attachments?: string[];  // Optional attachment IDs
    timestamp: number;       // Unix timestamp in milliseconds
  };
}
```

**Example:**
```json
{
  "type": "message.send",
  "message": {
    "id": "msg-1732212345678",
    "role": "user",
    "content": "What is the treatment for hypertension?",
    "attachments": ["attachment-1732212340000-medical-report.pdf"],
    "timestamp": 1732212345678
  }
}
```

---

### 2. Server → Client: Delta Update

**Event Type:** `delta`

**Purpose:** Incremental text updates during streaming response

**Schema:**
```typescript
interface DeltaEvent {
  type: 'delta';
  eventId?: string;       // Optional unique event ID
  messageId: string;      // Assistant message ID
  delta: string;          // Incremental text to append
  metadata?: any;         // Optional metadata
}
```

**Example Sequence:**
```json
// Delta 1
{
  "type": "delta",
  "messageId": "msg-assistant-1",
  "delta": "Treatment for "
}

// Delta 2
{
  "type": "delta",
  "messageId": "msg-assistant-1",
  "delta": "hypertension typically "
}

// Delta 3
{
  "type": "delta",
  "messageId": "msg-assistant-1",
  "delta": "includes lifestyle modifications and medication."
}
```

**Client Behavior:**
- Append `delta` to existing message content
- If no message exists with `messageId`, create new message
- Update UI in real-time as deltas arrive
- Show streaming indicator while receiving deltas

---

### 3. Server → Client: Chunk Update

**Event Type:** `chunk`

**Purpose:** Complete text chunks (alternative to delta)

**Schema:**
```typescript
interface ChunkEvent {
  type: 'chunk';
  eventId?: string;
  messageId: string;
  content: string;        // Complete text chunk
  metadata?: any;
}
```

**Example:**
```json
{
  "type": "chunk",
  "messageId": "msg-assistant-1",
  "content": "Treatment for hypertension includes lifestyle modifications and medication."
}
```

**Client Behavior:**
- Append `content` to existing message
- Similar to delta but with larger chunks

---

### 4. Server → Client: Message Done

**Event Type:** `message.done`

**Purpose:** Signal end of streaming and provide final message

**Schema:**
```typescript
interface MessageDoneEvent {
  type: 'message.done';
  message: {
    id: string;
    role: 'assistant';
    content: string;        // Final complete message text
    citations?: Citation[]; // Optional citations/sources
    attachments?: string[]; // Optional attachment IDs
    timestamp: number;      // Unix timestamp
    metadata?: any;
  };
}
```

**Citation Schema:**
```typescript
interface Citation {
  id: string;               // Unique citation ID
  source: 'kb' | 'url';     // Knowledge base or external URL
  reference: string;        // Document ID or URL
  snippet?: string;         // Relevant excerpt
  page?: number;            // Page number (for PDFs)
  metadata?: Record<string, any>;
}
```

**Example:**
```json
{
  "type": "message.done",
  "message": {
    "id": "msg-assistant-1",
    "role": "assistant",
    "content": "Treatment for hypertension includes lifestyle modifications such as diet and exercise, and medications like ACE inhibitors or diuretics.",
    "citations": [
      {
        "id": "cite-1",
        "source": "kb",
        "reference": "doc-clinical-guidelines-2024",
        "snippet": "Lifestyle modifications are first-line treatment for hypertension.",
        "page": 42,
        "metadata": {
          "author": "American Heart Association",
          "year": "2024"
        }
      }
    ],
    "timestamp": 1732212350000
  }
}
```

**Client Behavior:**
- Replace streaming message with final message
- Display citations if present
- Hide streaming indicator
- Scroll to show complete message
- Call `onMessage` callback if provided

---

### 5. Server → Client: Error

**Event Type:** `error`

**Purpose:** Communicate errors during processing

**Schema:**
```typescript
interface ErrorEvent {
  type: 'error';
  error: {
    code: WebSocketErrorCode;
    message: string;
    details?: any;
  };
}

type WebSocketErrorCode =
  | 'AUTH_FAILED'         // Authentication failed
  | 'RATE_LIMITED'        // Too many requests
  | 'QUOTA_EXCEEDED'      // Usage quota exceeded
  | 'INVALID_EVENT'       // Malformed event
  | 'BACKEND_ERROR'       // Server error
  | 'CONNECTION_DROPPED'; // Connection lost
```

**Examples:**

**Rate Limited:**
```json
{
  "type": "error",
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please slow down.",
    "details": {
      "retryAfter": 30
    }
  }
}
```

**Authentication Failed:**
```json
{
  "type": "error",
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid or expired authentication token."
  }
}
```

**Backend Error:**
```json
{
  "type": "error",
  "error": {
    "code": "BACKEND_ERROR",
    "message": "An unexpected error occurred. Please try again."
  }
}
```

**Client Behavior:**
- Display error toast/notification
- For `AUTH_FAILED`, `QUOTA_EXCEEDED`: Close connection (fatal)
- For `RATE_LIMITED`, `BACKEND_ERROR`: Show transient error
- Auto-dismiss transient errors after 5 seconds
- Call `onError` callback if provided

---

## Error Handling

### Error Categories

#### 1. Fatal Errors (Close Connection)

| Error Code | Description | Client Action |
|-----------|-------------|---------------|
| `AUTH_FAILED` | Invalid or expired token | Close connection, redirect to login |
| `QUOTA_EXCEEDED` | Usage limit reached | Close connection, show quota error |

#### 2. Transient Errors (Show Toast)

| Error Code | Description | Client Action |
|-----------|-------------|---------------|
| `RATE_LIMITED` | Too many requests | Show error toast for 5s |
| `BACKEND_ERROR` | Server error | Show error toast for 5s |
| `INVALID_EVENT` | Malformed message | Show error toast for 5s |

#### 3. Connection Errors (Reconnect)

| Error Code | Description | Client Action |
|-----------|-------------|---------------|
| `CONNECTION_DROPPED` | Lost connection | Attempt reconnection with backoff |

### Reconnection Logic

**Strategy:** Exponential backoff with maximum attempts

**Parameters:**
- Initial delay: 1 second
- Backoff multiplier: 2x
- Maximum attempts: 5
- Maximum delay: 16 seconds

**Delay Sequence:**
1. 1 second
2. 2 seconds
3. 4 seconds
4. 8 seconds
5. 16 seconds

**Implementation:**
```typescript
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_ATTEMPTS = 5;

let reconnectAttempts = 0;

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showError('CONNECTION_DROPPED', 'Maximum reconnection attempts reached');
    return;
  }

  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
  reconnectAttempts++;

  setTimeout(() => {
    connect();
  }, delay);
}
```

---

## Connection States

### State Machine

```
┌──────────────┐
│ disconnected │──┐
└──────────────┘  │
       ▲          │ connect()
       │          │
       │          ▼
       │   ┌────────────┐
       │   │ connecting │
       │   └────────────┘
       │          │
       │          │ onopen
       │          ▼
       │   ┌───────────┐
       └───┤ connected │
       │   └───────────┘
       │          │
  onclose│          │ onerror / onclose
       │          ▼
       │   ┌──────────────┐
       └───┤ reconnecting │
           └──────────────┘
```

### State Descriptions

| State | Description | UI Indicator |
|-------|-------------|--------------|
| `connecting` | Initial connection in progress | Yellow pulsing dot |
| `connected` | WebSocket open and ready | Green solid dot |
| `reconnecting` | Attempting to reconnect after disconnect | Orange pinging dot |
| `disconnected` | Connection closed, not reconnecting | Red solid dot + Retry button |

---

## Rate Limiting

### Client-Side Throttling

**Message Sending:**
- Maximum: 10 messages per minute
- Burst: 3 messages per 5 seconds

**Heartbeat:**
- Fixed interval: 30 seconds
- No user-triggered pings

### Server-Side Limits

**Per User:**
- 100 messages per hour
- 1000 messages per day

**Per Conversation:**
- 50 messages per 10 minutes

**Response:**
```json
{
  "type": "error",
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please slow down.",
    "details": {
      "limit": "100 messages per hour",
      "retryAfter": 3600
    }
  }
}
```

---

## Security

### Authentication

**Token Validation:**
1. Extract `token` from WebSocket query parameter
2. Verify JWT signature and expiration
3. Extract user ID from token
4. Authorize conversation access

**Token Refresh:**
- Client refreshes token before expiration
- Reconnects with new token automatically

### Input Validation

**Server-Side:**
- Validate all event types
- Sanitize message content
- Check message length limits (max 10,000 characters)
- Validate attachment IDs

**Client-Side:**
- Sanitize user input before display
- Validate file types and sizes for attachments
- Use `react-markdown` for safe markdown rendering

### Connection Security

- HTTPS/WSS only
- TLS 1.2 or higher
- Certificate pinning (optional)

---

## Performance Considerations

### Message Batching

**Delta Events:**
- Server may batch small deltas to reduce event frequency
- Target: 10-20 deltas per second maximum
- Client handles rapid delta updates efficiently

### Streaming Latency

**Target Metrics:**
- Time to first token: <200ms
- Average delta interval: 50-100ms
- Total response time: <2s for typical responses

### Message Size Limits

| Type | Maximum Size |
|------|--------------|
| User message content | 10,000 characters |
| Delta content | 1,000 characters |
| Chunk content | 5,000 characters |
| Citation snippet | 500 characters |
| Attachments | 10 MB per file |

---

## Testing

### WebSocket Test Suite

**Connection Tests:**
- Successful connection with valid token
- Rejected connection with invalid token
- Reconnection after disconnect
- Heartbeat mechanism

**Message Flow Tests:**
- Send user message
- Receive delta events
- Receive message.done event
- Handle error events

**Error Handling Tests:**
- Fatal errors close connection
- Transient errors show toast
- Reconnection with exponential backoff

**See test implementation:** `apps/web-app/src/hooks/__tests__/useChatSession.test.ts`

---

## Monitoring

### Client-Side Metrics

**Connection Quality:**
- Connection success rate
- Reconnection frequency
- Average connection duration
- Heartbeat response time

**Message Performance:**
- Message send latency
- Time to first token
- Average streaming duration
- Delta reception rate

**Error Tracking:**
- Error frequency by type
- Fatal vs transient errors
- Reconnection success rate

### Server-Side Metrics

**WebSocket Connections:**
- Active connections
- Connection duration
- Disconnection reasons

**Message Processing:**
- Messages processed per second
- Average response time
- Error rate

---

## Client Implementation Reference

### useChatSession Hook

**Location:** `apps/web-app/src/hooks/useChatSession.ts`

**Key Features:**
- Automatic connection management
- Message state synchronization
- Streaming support with delta/chunk handling
- Reconnection with exponential backoff
- Error handling and callbacks

**Usage Example:**
```typescript
import { useChatSession } from '../hooks/useChatSession';

function ChatPage() {
  const {
    messages,
    connectionStatus,
    isTyping,
    sendMessage,
    reconnect,
  } = useChatSession({
    conversationId: 'conv-123',
    onError: (code, message) => {
      console.error(`WebSocket error: ${code} - ${message}`);
    },
    onConnectionChange: (status) => {
      console.log(`Connection status: ${status}`);
    },
  });

  return (
    <div>
      <ConnectionStatus status={connectionStatus} onReconnect={reconnect} />
      <MessageList messages={messages} isTyping={isTyping} />
      <MessageInput onSend={sendMessage} disabled={connectionStatus !== 'connected'} />
    </div>
  );
}
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
- [Conversations and Routing](./CONVERSATIONS_AND_ROUTING.md)
- [Phase 2 Testing Plan](./TESTING_PHASE2.md)
- [Phase 3 Testing Plan](./TESTING_PHASE3.md)
- [Client Development Workflow](./DEVELOPMENT_WORKFLOW.md)
- [API Reference](../api-reference/rest-api.md)
