---
title: Plan
slug: archive/plan
summary: "This plan addresses two related issues in the VoiceAssist codebase:"
status: deprecated
stability: legacy
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - plan
category: reference
ai_summary: >-
  This plan addresses two related issues in the VoiceAssist codebase: 1.
  **WebSocket timing issues in unit tests** - Flaky tests due to race conditions
  between WebSocket lifecycle and React hooks 2. **MessageList performance
  improvements** - Adding pagination and lazy loading for large conversations
  ---
---

# Implementation Plan: WebSocket Testing & MessageList Performance

## Overview

This plan addresses two related issues in the VoiceAssist codebase:

1. **WebSocket timing issues in unit tests** - Flaky tests due to race conditions between WebSocket lifecycle and React hooks
2. **MessageList performance improvements** - Adding pagination and lazy loading for large conversations

---

## Part 1: WebSocket Testing Improvements

### Current Problem

The test files have timing issues because:

1. Mock WebSocket lifecycle (connect/open) happens asynchronously
2. React hook state updates are batched and scheduled
3. Vitest fake timers don't always flush React effects properly
4. Race conditions between WebSocket events and React state updates

**Affected Files:**

- `apps/web-app/src/hooks/__tests__/useChatSession.test.ts` (4 skipped tests)
- `apps/web-app/src/hooks/__tests__/useChatSession-citations.test.ts` (8 skipped tests)
- `apps/web-app/src/hooks/__tests__/useChatSession-editing.test.ts` (1 skipped test)

### Solution Strategy

**Approach: Extract pure logic + use MSW for WebSocket mocking**

Rather than fixing the flaky mocks, we'll:

1. Extract testable pure functions from the hook
2. Use MSW (already installed) for reliable WebSocket mocking
3. Create a test WebSocket server helper

### Implementation Steps

#### Step 1: Extract Pure Functions (New File)

**Create `apps/web-app/src/hooks/chatSessionUtils.ts`:**

```typescript
// Pure functions extracted from useChatSession for unit testing

export interface ParsedCitations {
  citations: Citation[];
  metadata: Record<string, any>;
}

/**
 * Parse citations from message.done event
 * Handles both message.citations and message.metadata.citations formats
 */
export function parseCitations(message: any): ParsedCitations {
  const citations = message.citations || message.metadata?.citations || [];
  return {
    citations,
    metadata: {
      ...message.metadata,
      citations,
    },
  };
}

/**
 * Determine if an error code is fatal (should close connection)
 */
export function isFatalError(errorCode: string): boolean {
  return ["AUTH_FAILED", "QUOTA_EXCEEDED"].includes(errorCode);
}

/**
 * Calculate reconnection delay with exponential backoff
 */
export function getReconnectDelay(attempt: number, baseDelay: number = 1000): number {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Build WebSocket URL with conversation ID and token
 */
export function buildWebSocketUrl(baseUrl: string, conversationId: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.append("conversationId", conversationId);
  url.searchParams.append("token", token);
  return url.toString();
}

/**
 * Process incoming WebSocket event and return state updates
 */
export function processWebSocketEvent(
  event: WebSocketEvent,
  currentStreamingMessage: Message | null,
): {
  streamingMessage: Message | null;
  finalMessage: Message | null;
  isTyping: boolean;
  error: { code: string; message: string } | null;
} {
  // Implementation of event processing logic
  // Returns pure state updates without side effects
}
```

#### Step 2: Create MSW WebSocket Handler

**Create `apps/web-app/src/test/mswHandlers.ts`:**

```typescript
import { ws } from "msw";

// MSW WebSocket handler for chat sessions
export const chatWebSocketHandler = ws.link("ws://localhost:8000/api/realtime/ws");

export const handlers = [
  chatWebSocketHandler.addEventListener("connection", ({ client }) => {
    // Track connected clients for test assertions
    connectedClients.add(client);

    client.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string);
      // Handle ping/pong
      if (data.type === "ping") {
        client.send(JSON.stringify({ type: "pong" }));
      }
    });

    client.addEventListener("close", () => {
      connectedClients.delete(client);
    });
  }),
];

// Test helpers
export const connectedClients = new Set<WebSocketClient>();

export function simulateMessage(data: WebSocketEvent) {
  connectedClients.forEach((client) => {
    client.send(JSON.stringify(data));
  });
}

export function simulateDisconnect() {
  connectedClients.forEach((client) => {
    client.close();
  });
}
```

#### Step 3: Update Test Setup

**Update `apps/web-app/src/test/setup.ts`:**

```typescript
import { setupServer } from "msw/node";
import { handlers } from "./mswHandlers";

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

#### Step 4: Write Pure Function Unit Tests

**Create `apps/web-app/src/hooks/__tests__/chatSessionUtils.test.ts`:**

Test the extracted pure functions directly without WebSocket timing concerns:

- `parseCitations()` - test all citation parsing scenarios
- `isFatalError()` - test error classification
- `getReconnectDelay()` - test exponential backoff
- `buildWebSocketUrl()` - test URL construction
- `processWebSocketEvent()` - test event processing logic

#### Step 5: Rewrite WebSocket Integration Tests

**Update `apps/web-app/src/hooks/__tests__/useChatSession.test.ts`:**

Use MSW WebSocket handlers for reliable async behavior:

```typescript
import { server, simulateMessage, connectedClients } from "../../test/mswHandlers";

describe("useChatSession - Connection", () => {
  it("should connect on mount", async () => {
    const { result } = renderHook(() => useChatSession({ conversationId: "conv-123" }));

    // Wait for MSW WebSocket connection
    await waitFor(() => {
      expect(connectedClients.size).toBe(1);
    });

    expect(result.current.connectionStatus).toBe("connected");
  });
});
```

### Estimated Work

| Task                                          | Complexity | Estimate  |
| --------------------------------------------- | ---------- | --------- |
| Extract pure functions to chatSessionUtils.ts | Low        | 1-2 hours |
| Write unit tests for pure functions           | Low        | 1-2 hours |
| Set up MSW WebSocket handlers                 | Medium     | 2-3 hours |
| Rewrite integration tests with MSW            | Medium     | 3-4 hours |
| Remove skipped tests / validate all pass      | Low        | 1 hour    |

**Total: ~8-12 hours**

---

## Part 2: MessageList Performance Improvements

### Current Problem

The MessageList component loads all messages at once, which can cause:

- Slow initial load for long conversations
- High memory usage with 1000+ messages
- Poor UX when scrolling through history

### Current State

- Frontend: `useConversations` loads all messages via `apiClient.getMessages(id)` without pagination
- Backend: **Already supports pagination** via `GET /{conversation_id}/messages?page=1&pageSize=50`
- MessageList: Uses react-virtuoso for virtualization (good) but loads all data upfront

### Solution Strategy

**Approach: Bi-directional infinite scroll with message caching**

1. Load initial messages (most recent 50)
2. Implement "load older" on scroll to top
3. Add message state management with pagination
4. Optional: Add message caching for performance

### Implementation Steps

#### Step 1: Update useConversations Hook

**Modify `apps/web-app/src/hooks/useConversations.ts`:**

Add paginated message loading:

```typescript
// New interface for paginated messages
interface MessagePaginationState {
  messages: Message[];
  hasOlderMessages: boolean;
  isLoadingOlder: boolean;
  oldestPage: number;
  newestPage: number;
}

// Add to hook return
const loadMessagesPage = useCallback(
  async (conversationId: string, page: number, prepend: boolean = false) => {
    const response = await apiClient.getMessages(conversationId, page, 50);
    // Return paginated response
    return {
      items: response.items,
      hasMore: page < Math.ceil(response.total / response.pageSize),
      total: response.total,
    };
  },
  [apiClient],
);

const loadOlderMessages = useCallback(async (conversationId: string) => {
  // Load previous page and prepend to existing messages
}, []);
```

#### Step 2: Create useMessagePagination Hook

**Create `apps/web-app/src/hooks/useMessagePagination.ts`:**

```typescript
export interface UseMessagePaginationOptions {
  conversationId: string;
  initialPageSize?: number;
  onError?: (message: string) => void;
}

export interface UseMessagePaginationReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  removeMessage: (messageId: string) => void;
  reset: () => void;
}

export function useMessagePagination(options: UseMessagePaginationOptions): UseMessagePaginationReturn {
  const { conversationId, initialPageSize = 50, onError } = options;
  const { apiClient } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [paginationState, setPaginationState] = useState({
    currentPage: 1,
    totalPages: 1,
    hasOlderMessages: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Load initial messages (most recent)
  useEffect(() => {
    loadInitialMessages();
  }, [conversationId]);

  const loadInitialMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get total count first
      const response = await apiClient.getMessages(conversationId, 1, 1);
      const totalMessages = response.total;
      const totalPages = Math.ceil(totalMessages / initialPageSize);

      // Load the LAST page (most recent messages)
      const lastPage = totalPages;
      const lastPageResponse = await apiClient.getMessages(conversationId, lastPage, initialPageSize);

      setMessages(lastPageResponse.items);
      setPaginationState({
        currentPage: lastPage,
        totalPages,
        hasOlderMessages: lastPage > 1,
      });
    } catch (err) {
      onError?.("Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, apiClient, initialPageSize, onError]);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingOlder || !paginationState.hasOlderMessages) return;

    setIsLoadingOlder(true);
    try {
      const olderPage = paginationState.currentPage - 1;
      const response = await apiClient.getMessages(conversationId, olderPage, initialPageSize);

      // Prepend older messages
      setMessages((prev) => [...response.items, ...prev]);
      setPaginationState((prev) => ({
        ...prev,
        currentPage: olderPage,
        hasOlderMessages: olderPage > 1,
      }));
    } catch (err) {
      onError?.("Failed to load older messages");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, apiClient, paginationState, isLoadingOlder, onError]);

  // Real-time message additions from WebSocket
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return {
    messages,
    isLoading,
    isLoadingOlder,
    hasOlderMessages: paginationState.hasOlderMessages,
    loadOlderMessages,
    addMessage,
    updateMessage,
    removeMessage,
    reset,
  };
}
```

#### Step 3: Update MessageList Component

**Modify `apps/web-app/src/components/chat/MessageList.tsx`:**

```typescript
export interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
  streamingMessageId?: string;
  // New pagination props
  hasOlderMessages?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
  // ... existing props
}

export function MessageList({
  messages,
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder,
  // ... other props
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Handle scroll to top for loading older messages
  const handleStartReached = useCallback(() => {
    if (hasOlderMessages && !isLoadingOlder && onLoadOlder) {
      onLoadOlder();
    }
  }, [hasOlderMessages, isLoadingOlder, onLoadOlder]);

  return (
    <div role="region" aria-label="Message list" className="h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        className="h-full"
        initialTopMostItemIndex={messages.length - 1}
        followOutput="smooth"
        startReached={handleStartReached}
        components={{
          Header: () => (
            hasOlderMessages ? (
              <div className="flex justify-center py-4">
                {isLoadingOlder ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <button
                    onClick={onLoadOlder}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            ) : null
          ),
          Footer: () => (/* existing typing indicator */),
        }}
        itemContent={(index, message) => (
          <MessageBubble key={message.id} message={message} /* ... */ />
        )}
      />
    </div>
  );
}
```

#### Step 4: Update API Client Types

**Update `packages/api-client/src/types.ts`:**

```typescript
export interface PaginatedMessagesResponse {
  items: Message[];
  total: number;
  page: number;
  pageSize: number;
}
```

**Update `packages/api-client/src/client.ts`:**

```typescript
async getMessages(
  conversationId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<PaginatedMessagesResponse> {
  const response = await this.fetch(
    `/api/conversations/${conversationId}/messages?page=${page}&pageSize=${pageSize}`
  );
  return response.data;
}
```

#### Step 5: Optional - Add Message Cache

**Create `apps/web-app/src/lib/messageCache.ts`:**

For very large histories, implement a simple LRU cache:

```typescript
class MessageCache {
  private cache: Map<string, { messages: Message[]; timestamp: number }>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 50, ttlMs = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  getCacheKey(conversationId: string, page: number): string {
    return `${conversationId}:${page}`;
  }

  get(conversationId: string, page: number): Message[] | null {
    const key = this.getCacheKey(conversationId, page);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.messages;
  }

  set(conversationId: string, page: number, messages: Message[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const key = this.getCacheKey(conversationId, page);
    this.cache.set(key, { messages, timestamp: Date.now() });
  }

  invalidate(conversationId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(conversationId)) {
        this.cache.delete(key);
      }
    }
  }
}

export const messageCache = new MessageCache();
```

### Estimated Work

| Task                                   | Complexity | Estimate  |
| -------------------------------------- | ---------- | --------- |
| Create useMessagePagination hook       | Medium     | 2-3 hours |
| Update MessageList with scroll-to-load | Low        | 1-2 hours |
| Update API client for pagination       | Low        | 30 min    |
| Integrate with ChatPage component      | Medium     | 1-2 hours |
| Add message caching (optional)         | Low        | 1-2 hours |
| Write tests for new functionality      | Medium     | 2-3 hours |

**Total: ~8-12 hours**

---

## Implementation Order

### Phase 1: WebSocket Testing (Lower Risk)

1. Extract pure functions
2. Set up MSW handlers
3. Write new tests
4. Validate all tests pass

### Phase 2: MessageList Performance (User-Facing)

1. Create useMessagePagination hook
2. Update MessageList component
3. Update API client
4. Integrate with ChatPage
5. Add caching if needed
6. Test with large conversations

---

## Success Criteria

### WebSocket Testing

- [ ] All 13 previously skipped tests now pass
- [ ] No flaky tests (run 10x with no failures)
- [ ] Test execution time < 30 seconds for hook tests

### MessageList Performance

- [ ] Initial load time < 500ms regardless of conversation size
- [ ] Smooth scroll experience when loading older messages
- [ ] Memory usage stays stable for 10,000+ message conversations
- [ ] No duplicate messages when loading pages

---

## Risks & Mitigations

| Risk                                      | Impact | Mitigation                                             |
| ----------------------------------------- | ------ | ------------------------------------------------------ |
| MSW WebSocket support is experimental     | Medium | Fall back to manual WebSocket mock improvements        |
| Backend pagination may have edge cases    | Low    | Backend already tested; add frontend error handling    |
| Virtuoso scroll position jumps on prepend | Medium | Use Virtuoso's `firstItemIndex` prop for stable scroll |
| Cache invalidation complexity             | Low    | Keep cache simple; invalidate on any mutation          |

---

## Notes

- The backend already supports message pagination - this is a frontend-only change
- MSW v2 has WebSocket support (we have msw@2.4.9 installed)
- react-virtuoso handles virtualization; we just need to add infinite scroll triggers
- Consider adding a "Jump to newest" button when user scrolls up significantly
