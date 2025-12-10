# @voiceassist/api-client

Type-safe HTTP client for VoiceAssist backend services.

## Installation

```bash
pnpm add @voiceassist/api-client
```

## Features

- Type-safe API calls with TypeScript
- Automatic retry with exponential backoff
- JWT authentication with automatic token refresh
- Distributed tracing with correlation IDs
- Configurable timeout and error handling

## Usage

```typescript
import { VoiceAssistApiClient } from "@voiceassist/api-client";

const client = new VoiceAssistApiClient({
  baseURL: "https://assist.asimo.io/api",
  timeout: 30000,
  getAccessToken: () => localStorage.getItem("accessToken"),
  onUnauthorized: () => {
    // Handle token expiry
    window.location.href = "/login";
  },
  enableRetry: true,
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
  },
});
```

## API Methods

### Authentication

```typescript
// Login
const tokens = await client.login({ email, password });

// Register
const user = await client.register({ email, password, full_name });

// Logout
await client.logout();

// Refresh token
const newTokens = await client.refreshToken(refreshToken);

// Get current user
const user = await client.getCurrentUser();
```

### Conversations

```typescript
// List conversations
const conversations = await client.getConversations(page, pageSize);

// Create conversation
const conversation = await client.createConversation("My Conversation");

// Get conversation
const conversation = await client.getConversation(id);

// Update conversation
const updated = await client.updateConversation(id, { title: "New Title" });

// Delete conversation
await client.deleteConversation(id);
```

### Messages

```typescript
// Get messages
const messages = await client.getMessages(conversationId, page, pageSize);

// Send message
const message = await client.sendMessage(conversationId, "Hello");

// Send idempotent message (safe to retry)
const message = await client.sendIdempotentMessage(conversationId, clientMessageId, "Hello");
```

### Voice

```typescript
// Transcribe audio
const text = await client.transcribeAudio(audioBlob);

// Text-to-speech
const audioBlob = await client.synthesizeSpeech(text, voiceId);

// Create realtime voice session
const session = await client.createRealtimeSession({
  conversation_id: conversationId,
  voice: "alloy",
  language: "en",
});
```

### Knowledge Base

```typescript
// Search
const results = await client.searchKnowledgeBase(query, limit);

// List documents
const docs = await client.getDocuments(page, pageSize);

// Upload document
const doc = await client.uploadDocument(file, category);
```

### Admin

```typescript
// System metrics
const metrics = await client.getSystemMetrics();

// Audit logs
const logs = await client.getAuditLogs(page, pageSize);

// Feature flags
const flags = await client.getFeatureFlags();
await client.toggleFeatureFlag(flagName);

// Cache management
const stats = await client.getCacheStats();
await client.clearCache();
```

## Retry Configuration

The client includes built-in retry logic with exponential backoff:

```typescript
import { withRetry, createRetryWrapper } from "@voiceassist/api-client";

// Manual retry
const result = await withRetry(
  () => fetchData(),
  { maxRetries: 3, baseDelay: 1000 },
  (attempt, error) => console.log(`Retry ${attempt}`, error),
);

// Create reusable wrapper
const fetchWithRetry = createRetryWrapper(fetchData, { maxRetries: 3 });
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm type-check
```

## Dependencies

- `axios` - HTTP client
- `@voiceassist/types` - Shared type definitions
