# WebSocket Protocol Specification - VoiceAssist

**Version:** 1.0
**Status:** Active
**Last Updated:** 2025-11-22
**Protocol Version:** 1.0

---

## Overview

The VoiceAssist WebSocket protocol enables real-time bidirectional communication between client and server for streaming chat responses, handling multiple concurrent conversations, and supporting future voice features.

### Key Features
- Real-time message streaming
- Automatic reconnection with exponential backoff
- Heartbeat/keepalive mechanism
- Error handling and recovery
- Support for multiple simultaneous connections
- Extensible event system for future features

### Protocol Specifications
- **Transport:** WebSocket (ws:// or wss://)
- **Message Format:** JSON
- **Handshake:** HTTP Upgrade (standard WebSocket)
- **Encoding:** UTF-8

---

## Connection Endpoints

### Production Endpoint
```
wss://assist.asimo.io/api/realtime/ws
```

### Development Endpoint
```
ws://localhost:8000/api/realtime/ws
```

### Environment Configuration

Use environment variables to configure the WebSocket URL:

**.env.development**
```env
VITE_WS_URL=ws://localhost:8000/api/realtime/ws
```

**.env.production**
```env
VITE_WS_URL=wss://assist.asimo.io/api/realtime/ws
```

### Connection Parameters

Connect with query parameters:
```
wss://assist.asimo.io/api/realtime/ws?conversationId=<uuid>&token=<jwt_token>
```

**Query Parameters:**
- `conversationId` (required): UUID of the conversation
- `token` (optional): JWT authentication token

**Example:**
```javascript
const url = new URL('wss://assist.asimo.io/api/realtime/ws');
url.searchParams.append('conversationId', '550e8400-e29b-41d4-a716-446655440000');
url.searchParams.append('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

const ws = new WebSocket(url.toString());
```

---

## Message Protocol

### Message Format

All messages are JSON objects with the following base structure:

```json
{
  "type": "message_type",
  "timestamp": "2025-11-22T12:34:56.789Z",
  "data": {}
}
```

### Timestamp Format
- ISO 8601 with milliseconds: `2025-11-22T12:34:56.789Z`
- Always in UTC (Z suffix)
- Server-generated for all server→client messages
- Optional for client→server messages

---

## Client → Server Messages

Messages sent from client to server.

### Message Type: `message`
Send a chat message and request a streamed response.

**Format:**
```json
{
  "type": "message",
  "content": "What are the symptoms of hypertension?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "clinical_context_id": "optional-uuid"
}
```

**Fields:**
- `type` (string, required): Must be `"message"`
- `content` (string, required): User's message text
- `session_id` (string, optional): Conversation UUID
- `clinical_context_id` (string, optional): Clinical context UUID for context-aware responses

**Example:**
```json
{
  "type": "message",
  "content": "The patient has high blood pressure. What should I do?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Server Response:**
The server will respond with a sequence of:
1. `message_start` - Indicates streaming has begun
2. `message_chunk` (multiple) - Streamed response content
3. `message_complete` - Final message with citations
4. Or `error` - If processing failed

---

### Message Type: `ping`
Heartbeat message to keep connection alive.

**Format:**
```json
{
  "type": "ping"
}
```

**Expected Response:**
```json
{
  "type": "pong",
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

**Usage:**
- Sent every 30 seconds
- Prevents connection timeout
- Validates connection health

**Implementation:**
```javascript
// Start heartbeat on connection
const heartbeatInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// Stop heartbeat on disconnect
ws.onclose = () => clearInterval(heartbeatInterval);
```

---

## Server → Client Messages

Messages sent from server to client.

### Message Type: `connected`
Sent immediately after connection is established.

**Format:**
```json
{
  "type": "connected",
  "client_id": "uuid",
  "timestamp": "2025-11-22T12:34:56.789Z",
  "protocol_version": "1.0",
  "capabilities": ["text_streaming"]
}
```

**Fields:**
- `type` (string): `"connected"`
- `client_id` (string): Unique client identifier (server-assigned)
- `timestamp` (string): Server timestamp
- `protocol_version` (string): WebSocket protocol version
- `capabilities` (array): List of supported features

**Example:**
```json
{
  "type": "connected",
  "client_id": "c550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-22T12:34:56.789Z",
  "protocol_version": "1.0",
  "capabilities": ["text_streaming"]
}
```

---

### Message Type: `message_start`
Indicates that response streaming is beginning.

**Format:**
```json
{
  "type": "message_start",
  "message_id": "uuid",
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

**Fields:**
- `type` (string): `"message_start"`
- `message_id` (string): Unique identifier for this response message
- `timestamp` (string): Server timestamp when streaming started

**Example:**
```json
{
  "type": "message_start",
  "message_id": "msg-550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

---

### Message Type: `message_chunk`
Contains a chunk of the streamed response.

**Format:**
```json
{
  "type": "message_chunk",
  "message_id": "uuid",
  "content": "Hypertension is a chronic condition...",
  "chunk_index": 0
}
```

**Fields:**
- `type` (string): `"message_chunk"`
- `message_id` (string): ID of the message being streamed
- `content` (string): Partial response text
- `chunk_index` (number): Index of this chunk (0-based)

**Example:**
```json
{
  "type": "message_chunk",
  "message_id": "msg-550e8400-e29b-41d4-a716-446655440000",
  "content": "Hypertension, or high blood pressure, ",
  "chunk_index": 0
}
```

**Notes:**
- Multiple chunks will be sent for a single message
- Chunks should be concatenated in order
- Use `chunk_index` to detect missing or out-of-order chunks

---

### Message Type: `message_complete`
Final message containing complete response and metadata.

**Format:**
```json
{
  "type": "message_complete",
  "message_id": "uuid",
  "content": "Complete response text...",
  "citations": [
    {
      "id": "cite-1",
      "source_type": "medical_journal",
      "title": "Hypertension Management Guidelines",
      "url": "https://example.com/article",
      "page": 42
    }
  ],
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

**Fields:**
- `type` (string): `"message_complete"`
- `message_id` (string): ID of the message
- `content` (string): Complete response text
- `citations` (array): Sources referenced in response
- `timestamp` (string): Server timestamp when response completed

**Citation Fields:**
- `id` (string): Unique citation identifier
- `source_type` (string): Type of source (e.g., "medical_journal", "textbook", "guideline")
- `title` (string): Citation title
- `url` (string): Link to full source
- `page` (number, optional): Page number if applicable

**Example:**
```json
{
  "type": "message_complete",
  "message_id": "msg-550e8400-e29b-41d4-a716-446655440000",
  "content": "Hypertension is a chronic condition characterized by elevated blood pressure. Treatment involves lifestyle modifications and medications.",
  "citations": [
    {
      "id": "cite-1",
      "source_type": "medical_journal",
      "title": "Blood Pressure Management in Clinical Practice",
      "url": "https://pubmed.ncbi.nlm.nih.gov/12345678",
      "page": 1
    }
  ],
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

---

### Message Type: `error`
Indicates an error occurred during message processing.

**Format:**
```json
{
  "type": "error",
  "message_id": "uuid",
  "timestamp": "2025-11-22T12:34:56.789Z",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

**Fields:**
- `type` (string): `"error"`
- `message_id` (string, optional): ID of the message that caused the error
- `timestamp` (string): Server timestamp
- `error` (object): Error details
  - `code` (string): Machine-readable error code
  - `message` (string): Human-readable error description

**Error Codes:**

| Code | Meaning | Recovery |
|------|---------|----------|
| `UNKNOWN_MESSAGE_TYPE` | Client sent unknown message type | Fix and resend |
| `INVALID_MESSAGE_FORMAT` | Message JSON is malformed | Fix format and resend |
| `MISSING_REQUIRED_FIELD` | Required field is missing | Add field and resend |
| `AUTH_FAILED` | Authentication token invalid | Reconnect with valid token |
| `QUOTA_EXCEEDED` | User quota exceeded | Wait or upgrade plan |
| `QUERY_PROCESSING_ERROR` | Error processing query | Retry message |
| `INTERNAL_ERROR` | Server error | Wait and retry |
| `CONNECTION_DROPPED` | Connection was dropped | Reconnect automatically |

**Example:**
```json
{
  "type": "error",
  "message_id": "msg-550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-22T12:34:56.789Z",
  "error": {
    "code": "QUERY_PROCESSING_ERROR",
    "message": "Failed to retrieve knowledge base references"
  }
}
```

---

### Message Type: `pong`
Response to client's ping message.

**Format:**
```json
{
  "type": "pong",
  "timestamp": "2025-11-22T12:34:56.789Z"
}
```

**Fields:**
- `type` (string): `"pong"`
- `timestamp` (string): Server timestamp

**Usage:** Confirms connection is still alive

---

## Connection Lifecycle

### Sequence Diagram

```
Client                                  Server
  |                                        |
  |------ WebSocket Upgrade Request ------>|
  |                                        |
  |<------ HTTP 101 Switching Protocols ---|
  |                                        |
  |<------- connected event message -------|
  |                                        |
  |------ message (user asks question) --->|
  |                                        |
  |<------ message_start event ------------|
  |                                        |
  |<------ message_chunk event 1 ---------|
  |<------ message_chunk event 2 ---------|
  |<------ message_chunk event 3 ---------|
  |                                        |
  |<------ message_complete event --------|
  |                                        |
  |------ ping (heartbeat every 30s) ---->|
  |<------ pong (heartbeat response) ------|
  |                                        |
  |------ Close frame (user exits) ------>|
  |                                        |
```

### Connection States

**CONNECTING**
- WebSocket connection in progress
- No messages can be sent
- Waiting for `connected` event

**CONNECTED**
- Ready to send/receive messages
- Heartbeat active
- Can send any message type

**RECONNECTING**
- Connection lost
- Attempting automatic reconnection
- Exponential backoff delay
- Queue outgoing messages (if supported)

**DISCONNECTED**
- Connection closed
- No more messages
- User must manually reconnect

### Reconnection Strategy

Automatic reconnection with exponential backoff:

```
Attempt 1: Wait 1 second    (1s)
Attempt 2: Wait 2 seconds   (2s)
Attempt 3: Wait 4 seconds   (4s)
Attempt 4: Wait 8 seconds   (8s)
Attempt 5: Wait 16 seconds  (16s)
Max 5 attempts, then fail
```

**Implementation:**
```javascript
const BASE_DELAY = 1000;           // 1 second
const MAX_ATTEMPTS = 5;
let reconnectAttempts = 0;

ws.onclose = () => {
  if (reconnectAttempts < MAX_ATTEMPTS) {
    const delay = BASE_DELAY * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    setTimeout(() => ws = connectWebSocket(), delay);
  }
};
```

---

## Client Implementation Guide

### Setup

```javascript
class ChatClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.ws = null;
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
  }

  connect(conversationId) {
    const url = new URL(`${this.baseUrl}/api/realtime/ws`);
    url.searchParams.append('conversationId', conversationId);
    url.searchParams.append('token', this.token);

    this.ws = new WebSocket(url.toString());
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = (event) => this.onMessage(event);
    this.ws.onerror = (error) => this.onError(error);
    this.ws.onclose = () => this.onClose();
  }

  onOpen() {
    console.log('Connected to WebSocket');
    this.reconnectAttempts = 0;
  }

  onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  onError(error) {
    console.error('WebSocket error:', error);
  }

  onClose() {
    console.log('Disconnected from WebSocket');
    this.attemptReconnect();
  }

  attemptReconnect() {
    if (this.reconnectAttempts < 5) {
      const delay = 1000 * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  sendMessage(content, sessionId) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'message',
      content: content,
      session_id: sessionId,
    }));
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatInterval);
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

### Usage

```javascript
const client = new ChatClient(
  'wss://assist.asimo.io',
  'your-jwt-token'
);

// Handle different message types
client.on('connected', (msg) => {
  console.log('Server says hello:', msg);
});

client.on('message_chunk', (msg) => {
  console.log('Received chunk:', msg.content);
});

client.on('message_complete', (msg) => {
  console.log('Message complete:', msg.content);
  console.log('Citations:', msg.citations);
});

client.on('error', (msg) => {
  console.error('Error:', msg.error.code, msg.error.message);
});

client.on('pong', () => {
  console.log('Heartbeat received');
});

// Connect and send message
client.connect('conversation-uuid');
client.startHeartbeat();
client.sendMessage('What is hypertension?', 'conversation-uuid');
```

---

## Server Implementation Guide

### Connection Handler

```python
from fastapi import WebSocket, WebSocketDisconnect, Query

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: str = Query(...),
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    # Validate authentication
    if token:
        user = validate_token(token)
        if not user:
            await websocket.close(code=1008)  # Policy violation
            return
    else:
        # TODO: Require token in production
        pass

    # Accept connection
    await websocket.accept()

    # Send welcome message
    await websocket.send_json({
        "type": "connected",
        "client_id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "protocol_version": "1.0",
        "capabilities": ["text_streaming"]
    })

    # Handle messages
    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, data, db)
    except WebSocketDisconnect:
        print(f"Client {conversation_id} disconnected")
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "error": {
                "code": "INTERNAL_ERROR",
                "message": str(e)
            }
        })
```

### Message Handler

```python
async def handle_message(websocket: WebSocket, data: dict, db: Session):
    message_type = data.get("type")

    if message_type == "message":
        await handle_chat_message(websocket, data, db)
    elif message_type == "ping":
        await websocket.send_json({
            "type": "pong",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
    else:
        await websocket.send_json({
            "type": "error",
            "error": {
                "code": "UNKNOWN_MESSAGE_TYPE",
                "message": f"Unknown message type: {message_type}"
            }
        })

async def handle_chat_message(websocket: WebSocket, data: dict, db: Session):
    message_id = str(uuid.uuid4())
    content = data.get("content", "")

    # Send start event
    await websocket.send_json({
        "type": "message_start",
        "message_id": message_id,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

    try:
        # Process query and stream response
        response = await query_orchestrator.handle_query(
            query=content,
            trace_id=message_id
        )

        # Stream chunks
        for i, chunk in enumerate(response_chunks):
            await websocket.send_json({
                "type": "message_chunk",
                "message_id": message_id,
                "content": chunk,
                "chunk_index": i
            })
            await asyncio.sleep(0.05)  # Simulate streaming

        # Send complete event
        await websocket.send_json({
            "type": "message_complete",
            "message_id": message_id,
            "content": response.answer,
            "citations": response.citations,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message_id": message_id,
            "error": {
                "code": "QUERY_PROCESSING_ERROR",
                "message": str(e)
            }
        })
```

---

## Security Considerations

### Authentication

**Current State:** Optional JWT token in query parameter
**Recommended:** Require JWT token for all connections

```python
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        user = validate_token(token)
    except JWTError:
        await websocket.close(code=1008)
        return
    
    # Continue with authenticated connection
    client_id = str(user.id)
    ...
```

### Message Validation

Always validate incoming messages:

```python
from pydantic import BaseModel, validator

class ChatMessage(BaseModel):
    type: str
    content: str
    session_id: Optional[str]

    @validator('content')
    def validate_content(cls, v):
        if len(v) > 10000:
            raise ValueError('Message too long')
        return v.strip()

    @validator('type')
    def validate_type(cls, v):
        if v not in ['message', 'ping']:
            raise ValueError('Invalid type')
        return v
```

### Rate Limiting

Implement per-user rate limits:

```python
from ratelimit import RateLimiter

limiter = RateLimiter(max_calls=100, time_period=60)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    if not limiter.is_allowed(user_id):
        await websocket.close(code=1008)  # Policy violation
        return
    ...
```

### Input Sanitization

Sanitize all user input:

```python
from html import escape

def sanitize_content(content: str) -> str:
    # Remove potentially harmful content
    content = escape(content)
    content = content.replace('<', '&lt;').replace('>', '&gt;')
    return content[:10000]  # Max length
```

---

## Testing Procedures

### Manual Testing Checklist

#### Basic Connection
- [ ] Connect to WebSocket without errors
- [ ] Receive `connected` event
- [ ] Connection shows `protocol_version: "1.0"`
- [ ] Connection shows expected `capabilities`

#### Message Streaming
- [ ] Send message succeeds
- [ ] Receive `message_start` event
- [ ] Receive multiple `message_chunk` events
- [ ] Chunks contain expected content
- [ ] `chunk_index` increments correctly
- [ ] Receive `message_complete` event
- [ ] Complete event has citations

#### Error Handling
- [ ] Send invalid message type → receive error
- [ ] Send malformed JSON → handle gracefully
- [ ] Send empty message → receive error or handle
- [ ] Network disconnect → attempt reconnect
- [ ] Reconnect succeeds → resume chat

#### Heartbeat
- [ ] Ping sent every 30 seconds
- [ ] Pong received in response
- [ ] Connection stays alive without messages
- [ ] Heartbeat stops after disconnect

#### Authentication
- [ ] Connect without token → rejected (if required)
- [ ] Connect with invalid token → rejected
- [ ] Connect with valid token → accepted
- [ ] Token expiry → reconnect needed

### Automated Testing

**Using WebSocket client libraries:**

```python
import asyncio
import websockets
import json

async def test_basic_chat():
    uri = "ws://localhost:8000/api/realtime/ws?conversationId=test&token=<token>"
    
    async with websockets.connect(uri) as websocket:
        # Receive connected event
        msg = await websocket.recv()
        data = json.loads(msg)
        assert data['type'] == 'connected'
        
        # Send message
        await websocket.send(json.dumps({
            'type': 'message',
            'content': 'Hello',
            'session_id': 'test'
        }))
        
        # Receive message_start
        msg = await websocket.recv()
        data = json.loads(msg)
        assert data['type'] == 'message_start'
        
        # Receive chunks
        chunks = []
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data['type'] == 'message_chunk':
                chunks.append(data['content'])
            elif data['type'] == 'message_complete':
                assert len(data['citations']) >= 0
                break

asyncio.run(test_basic_chat())
```

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect
- Check WebSocket URL is correct
- Verify HTTPS/WSS vs HTTP/WS
- Check firewall allows WebSocket port
- Verify authentication token valid

**Problem:** Connection drops immediately
- Server may reject token
- Conversation ID invalid
- Server may be down
- Check server logs

### Message Issues

**Problem:** Chunks not arriving
- Check message was sent with type `"message"`
- Verify message `content` is not empty
- Check server logs for processing errors
- Test with simple message first

**Problem:** Citations missing
- Backend may not populate citations
- Verify backend returns citations in complete event
- Check knowledge base is populated

### Heartbeat Issues

**Problem:** Connection drops after 30 seconds
- Heartbeat may not be active
- Server not responding to ping
- May be proxy stripping heartbeats
- Try increasing heartbeat frequency

---

## Future Enhancements

### Planned Features
- Voice streaming (audio chunks)
- VAD (Voice Activity Detection) events
- Turn-taking events for voice
- Message reactions/feedback
- Typing indicators
- Read receipts
- Message editing
- File transfer

### Protocol Version 2.0 (Planned)
- Improved chunking with back pressure
- Binary message support
- Message compression
- Enhanced authentication
- Rate limiting signals

---

## Changelog

### Version 1.0 (2025-11-22)
- Initial protocol specification
- Support for text streaming
- Heartbeat mechanism
- Error handling
- Client and server implementation guides

---

## Document Metadata

**Version:** 1.0
**Date:** 2025-11-22
**Author:** Claude AI Assistant
**Status:** Active
**Distribution:** Development Team

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
