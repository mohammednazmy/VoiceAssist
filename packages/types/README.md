# @voiceassist/types

Shared TypeScript type definitions for VoiceAssist applications.

## Installation

```bash
pnpm add @voiceassist/types
```

## Overview

This package provides centralized type definitions used across all VoiceAssist frontend applications and the API client. It ensures type consistency between the web app, admin panel, and documentation site.

## Type Categories

### User & Authentication

```typescript
import type { User, UserRole, AuthTokens, LoginRequest, LoginResponse, TokenResponse } from "@voiceassist/types";

// User roles
type UserRole = "admin" | "physician" | "staff" | "patient";
```

### Chat & Conversations

```typescript
import type { Message, Conversation, Citation, Branch, CreateBranchRequest } from "@voiceassist/types";

// Message with optional citations and attachments
interface Message {
  id: string;
  conversationId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  attachments?: string[];
  timestamp: number;
  parentId?: string; // For branching
  branchId?: string;
}
```

### Clinical Context (HIPAA-compliant)

```typescript
import type { ClinicalContext, ClinicalContextCreate, ClinicalContextUpdate, Vitals } from "@voiceassist/types";

interface Vitals {
  temperature?: number; // Celsius
  heartRate?: number; // BPM
  bloodPressure?: string; // "120/80"
  respiratoryRate?: number;
  spo2?: number; // Percentage
}
```

### Knowledge Base

```typescript
import type { Document, DocumentStatus, SearchResult, KnowledgeBaseEntry } from "@voiceassist/types";

type DocumentStatus = "pending" | "processing" | "indexed" | "failed";
```

### Folders & Organization

```typescript
import type { Folder, CreateFolderRequest, UpdateFolderRequest } from "@voiceassist/types";
```

### Sharing

```typescript
import type { ShareRequest, ShareResponse, ShareLink } from "@voiceassist/types";
```

### Attachments

```typescript
import type { Attachment, AttachmentUploadResponse, UploadProgress } from "@voiceassist/types";
```

### Voice

```typescript
import type { VoiceConfig, TranscriptionResult } from "@voiceassist/types";
```

### WebSocket Events

```typescript
import type {
  WebSocketEvent,
  WebSocketEventType,
  WebSocketError,
  WebSocketErrorCode,
  ConnectionStatus,
  ChatStreamChunk,
} from "@voiceassist/types";

type WebSocketEventType =
  | "delta"
  | "chunk"
  | "message.done"
  | "user_message.created"
  | "history"
  | "connected"
  | "error"
  | "ping"
  | "pong";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
```

### API Responses

```typescript
import type { ApiResponse, ApiError, ApiMeta, PaginatedResponse } from "@voiceassist/types";

// Standard API envelope
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}
```

### Admin Types

```typescript
import type { SystemMetrics, AuditLogEntry } from "@voiceassist/types";
```

### Utility Types

```typescript
import type { Nullable, Optional, DeepPartial } from "@voiceassist/types";

// Helper types
type Nullable<T> = T | null;
type Optional<T> = T | undefined;
type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };
```

## Usage Example

```typescript
import type { User, Conversation, Message } from "@voiceassist/types";

function displayConversation(conversation: Conversation, messages: Message[]) {
  console.log(`Conversation: ${conversation.title}`);
  messages.forEach((msg) => {
    console.log(`[${msg.role}]: ${msg.content}`);
  });
}

async function getCurrentUser(): Promise<User> {
  const response = await fetch("/api/users/me");
  return response.json();
}
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
