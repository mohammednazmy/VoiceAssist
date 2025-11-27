---
title: "Testing Phase2"
slug: "client-implementation/testing-phase2"
summary: "This document outlines the comprehensive testing strategy for Phase 2 (Chat Interface) of the VoiceAssist client application. It covers unit tests, in..."
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["testing", "phase2"]
category: planning
---

# Phase 2 Testing Plan: Chat Interface

## Overview

This document outlines the comprehensive testing strategy for Phase 2 (Chat Interface) of the VoiceAssist client application. It covers unit tests, integration tests, test file locations, and testing best practices.

---

## Test Coverage Summary

| Category              | Test Files | Test Cases | Coverage              |
| --------------------- | ---------- | ---------- | --------------------- |
| **Unit Tests**        | 5 files    | 103 cases  | Components, Hooks     |
| **Integration Tests** | 1 file     | 8 flows    | End-to-end user flows |
| **Total**             | 6 files    | 111 cases  | Full Phase 2 coverage |

---

## Test Stack

### Testing Framework

- **Vitest 4.0+** - Fast, Vite-native test runner with Jest-compatible API
- **@testing-library/react** - Component testing utilities
- **@testing-library/user-event** - User interaction simulation
- **jsdom** - DOM environment for tests

### Configuration Files

- `vitest.config.ts` - Vitest configuration
- `apps/web-app/src/setupTests.ts` - Test environment setup
- `package.json` - Test scripts and dependencies

---

## Unit Tests

### 1. MessageBubble Component

**File:** `apps/web-app/src/components/chat/__tests__/MessageBubble.test.tsx`

**Test Cases:** 14

**Coverage Areas:**

#### Role Variants (3 tests)

- Renders user message with correct styling (bg-primary-500, right-aligned)
- Renders assistant message with correct styling (bg-white, border, left-aligned)
- Renders system message with correct styling (bg-neutral-100)

#### Content Rendering (8 tests)

- Renders plain text content
- Renders markdown bold text (`**bold**`)
- Renders markdown italic text (`*italic*`)
- Renders markdown links with target="\_blank" and noopener noreferrer
- Renders inline code with monospace font
- Renders code blocks with syntax highlighting (50+ languages)
- Renders ordered and unordered lists
- Renders blockquotes with border styling

#### Streaming State (3 tests)

- Shows streaming indicator (animated dots) when isStreaming is true
- Hides streaming indicator when isStreaming is false
- Hides streaming indicator by default

**Key Assertions:**

```typescript
// Role styling
expect(container.querySelector(".bg-primary-500")).toBeInTheDocument();

// Markdown rendering
const bold = container.querySelector("strong");
expect(bold?.textContent).toBe("bold");

// Streaming indicator
const dots = container.querySelectorAll(".animate-bounce");
expect(dots.length).toBeGreaterThan(0);
```

---

### 2. CitationDisplay Component

**File:** `apps/web-app/src/components/chat/__tests__/CitationDisplay.test.tsx`

**Test Cases:** 20

**Coverage Areas:**

#### Rendering (3 tests)

- Renders nothing when citations array is empty
- Shows "1 Source" for single citation
- Shows "2 Sources" for multiple citations

#### Source Type Badges (4 tests)

- Shows "Knowledge Base" badge for KB citations
- Shows "External Link" badge for URL citations
- Shows page number when present (e.g., "Page 42")
- Does not show page number when absent

#### Expand/Collapse Behavior (4 tests)

- Starts in collapsed state (snippet not visible)
- Expands when clicked (snippet becomes visible)
- Collapses when clicked again
- Toggles chevron icon rotation (rotate-180 class)

#### Expanded Content (4 tests)

- Shows snippet with "Excerpt:" label
- Shows reference with "Reference:" label
- Shows metadata (author, year) when present
- Shows "Open Source" link button for URL citations

#### Multiple Citations (2 tests)

- Renders each citation independently
- Expands citations independently (toggle one doesn't affect others)

#### Accessibility (3 tests)

- Has proper ARIA attributes (aria-expanded, aria-controls)
- Updates aria-expanded on toggle (false → true → false)
- Button is keyboard accessible

**Key Assertions:**

```typescript
// Collapsed state
expect(screen.queryByText(/treatment protocols/i)).not.toBeInTheDocument();

// Expanded state
await user.click(button);
expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();

// Accessibility
expect(button).toHaveAttribute("aria-expanded", "false");
```

---

### 3. MessageList Component

**File:** `apps/web-app/src/components/chat/__tests__/MessageList.test.tsx`

**Test Cases:** 19

**Coverage Areas:**

#### Empty State (3 tests)

- Renders "Start a Conversation" when no messages
- Shows chat icon in empty state
- Does not render virtuoso when empty

#### Message Rendering (4 tests)

- Renders all messages in virtuoso
- Renders messages with MessageBubble component
- Passes correct props to MessageBubble (role-based styling)
- Handles single message correctly

#### Typing Indicator (5 tests)

- Shows typing indicator in footer when isTyping is true
- Hides typing indicator when isTyping is false
- Hides typing indicator when isTyping is undefined
- Does not show footer typing when streaming a specific message
- Applies staggered animation delays to dots (0s, 0.1s, 0.2s)

#### Streaming State (2 tests)

- Passes isStreaming to correct message bubble (matching streamingMessageId)
- Does not show streaming when streamingMessageId doesn't match

#### Long Message Lists (2 tests)

- Renders 100 messages efficiently with virtualization
- Passes correct data to virtuoso

#### Accessibility (3 tests)

- Renders semantic HTML structure with role="region"
- Has descriptive empty state heading
- Maintains message order for screen readers

**Key Assertions:**

```typescript
// Virtualization
const messageBubbles = container.querySelectorAll("[data-message-id]");
expect(messageBubbles.length).toBe(mockMessages.length);

// Typing indicator
const dots = container.querySelectorAll(".animate-bounce");
expect(dots?.length).toBe(3);

// Accessibility
expect(container.querySelector('[role="region"]')).toBeInTheDocument();
```

---

### 4. MessageInput Component

**File:** `apps/web-app/src/components/chat/__tests__/MessageInput.test.tsx`

**Test Cases:** 28

**Coverage Areas:**

#### Rendering (5 tests)

- Renders textarea with default placeholder
- Renders textarea with custom placeholder
- Renders send button
- Renders markdown hint
- Shows/hides attachment button based on enableAttachments prop

#### Typing and Content (4 tests)

- Updates content when user types
- Allows multiline content (Shift+Enter)
- Shows character count for messages >500 characters
- Does not show character count for messages <500 characters

#### Keyboard Handling (5 tests)

- Sends message on Enter key
- Adds newline on Shift+Enter
- Does not send empty messages
- Does not send whitespace-only messages
- Trims whitespace when sending

#### Send Button (5 tests)

- Sends message when clicked
- Is disabled when textarea is empty
- Is enabled when textarea has content
- Is disabled when disabled prop is true
- Is disabled for whitespace-only content

#### Disabled State (3 tests)

- Disables textarea when disabled prop is true
- Does not send message when disabled
- Applies disabled styling to send button

#### Clearing Content (2 tests)

- Clears textarea after sending (Enter key)
- Clears textarea after clicking send button

#### Attachments (7 tests)

- Does not show attachment preview when none added
- Handles file selection
- Removes attachment when clicking remove button
- Sends attachments with message
- Clears attachments after sending
- Accepts multiple file types (.pdf, .png, .jpg, etc.)
- Disables attachment button when disabled

#### Auto-Expansion (2 tests)

- Sets max height on textarea (200px)
- Has initial single row

#### Accessibility (3 tests)

- Has aria-label on textarea
- Has aria-label on send button
- Has aria-label on remove attachment button

**Key Assertions:**

```typescript
// Keyboard behavior
await user.type(textarea, "Hello world");
await user.keyboard("{Enter}");
expect(mockOnSend).toHaveBeenCalledWith("Hello world", undefined);

// Button disabled state
expect(sendButton).toBeDisabled(); // when empty

// Attachments
await user.upload(fileInput, file);
expect(screen.getByText(/test.pdf/i)).toBeInTheDocument();
```

---

### 5. useChatSession Hook

**File:** `apps/web-app/src/hooks/__tests__/useChatSession.test.ts`

**Test Cases:** 22

**Coverage Areas:**

#### Connection Lifecycle (4 tests)

- Connects on mount with "connecting" status
- Includes conversationId and token in WebSocket URL
- Disconnects on unmount
- Calls onConnectionChange callback

#### Heartbeat Mechanism (2 tests)

- Sends ping every 30 seconds
- Stops heartbeat on disconnect

#### Sending Messages (4 tests)

- Sends user message via WebSocket
- Adds user message to messages array
- Includes attachments when provided
- Does not send when not connected (shows error)

#### Receiving Delta Events (2 tests)

- Handles delta event and updates streaming message
- Appends multiple deltas to same message

#### Receiving Chunk Events (1 test)

- Handles chunk event correctly

#### Receiving Message.Done Events (2 tests)

- Finalizes message on message.done (with citations)
- Clears streaming state after message.done

#### Error Handling (3 tests)

- Handles error event and calls onError callback
- Closes connection on fatal errors (AUTH_FAILED)
- Closes connection on QUOTA_EXCEEDED

#### Reconnection Logic (3 tests)

- Attempts reconnection on disconnect
- Uses exponential backoff (1s, 2s, 4s, 8s, 16s)
- Stops reconnecting after 5 max attempts

#### Manual Reconnection (2 tests)

- Reconnects when reconnect() is called
- Resets reconnect attempts on manual reconnect

**Key Assertions:**

```typescript
// Connection
expect(result.current.connectionStatus).toBe("connecting");

// Message sending
const messages = mockWebSocket.getSentMessages();
expect(messages[0]).toMatchObject({
  type: "message.send",
  message: { role: "user", content: "Hello world" },
});

// Delta handling
expect(result.current.messages[0].content).toBe("Hello world");

// Reconnection backoff
const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
vi.advanceTimersByTime(delay);
```

---

## Integration Tests

### ChatFlow Integration Tests

**File:** `apps/web-app/src/__tests__/integration/ChatFlow.test.tsx`

**Test Cases:** 8 flows

**Coverage Areas:**

#### 1. Complete Send→Stream→Done Cycle

- User types message and sends
- WebSocket receives message
- Server streams response with delta events
- Shows streaming indicator
- Finalizes with message.done (including citations)
- Hides streaming indicator

#### 2. Citation Display

- Displays "1 Source" badge in assistant message
- Expands citation on click
- Shows snippet, reference, page number, metadata

#### 3. Multiple Citations

- Shows "2 Sources" badge
- Renders KB and URL citations correctly

#### 4. Error Handling

- Displays error toast on WebSocket error
- Dismisses error toast on close button
- Auto-dismisses transient errors after 5 seconds

#### 5. Connection Status

- Shows "Connected" when WebSocket opens
- Shows "Reconnecting" on disconnect
- Disables input when not connected

#### 6. Manual Reconnection

- Shows "Disconnected" status
- Displays "Retry" button
- Reconnects when button clicked

#### 7. Conversation Routing

- Creates conversation on mount if none provided
- Shows "Creating conversation..." loading state

#### 8. Message History Scrolling

- Sends multiple messages
- Auto-scrolls to bottom
- Latest messages visible

**Key Assertions:**

```typescript
// Send→Stream→Done
expect(screen.getByText("What is the treatment for hypertension?")).toBeInTheDocument();
expect(screen.getByText(/treatment for hypertension includes/i)).toBeInTheDocument();

// Citations
expect(screen.getByText("1 Source")).toBeInTheDocument();
expect(screen.getByText(/treatment protocols require/i)).toBeInTheDocument();

// Error handling
expect(screen.getByText(/RATE_LIMITED/i)).toBeInTheDocument();
```

---

## Running Tests

### Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test MessageBubble.test.tsx

# Run tests matching pattern
pnpm test --grep "streaming"
```

### Configuration

**vitest.config.ts:**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/setupTests.ts"],
    },
  },
});
```

---

## Test File Locations

```
apps/web-app/src/
├── components/
│   └── chat/
│       ├── __tests__/
│       │   ├── MessageBubble.test.tsx     # 14 tests
│       │   ├── MessageList.test.tsx       # 19 tests
│       │   ├── CitationDisplay.test.tsx   # 20 tests
│       │   └── MessageInput.test.tsx      # 28 tests
│       ├── MessageBubble.tsx
│       ├── MessageList.tsx
│       ├── CitationDisplay.tsx
│       └── MessageInput.tsx
├── hooks/
│   ├── __tests__/
│   │   └── useChatSession.test.ts         # 22 tests
│   └── useChatSession.ts
└── __tests__/
    └── integration/
        └── ChatFlow.test.tsx               # 8 integration tests
```

---

## Testing Best Practices

### 1. Component Testing

**DO:**

- Test user-visible behavior, not implementation details
- Use semantic queries (`getByRole`, `getByLabelText`)
- Test accessibility (ARIA attributes, keyboard navigation)
- Mock external dependencies (WebSocket, API calls)

**DON'T:**

- Test internal state or private methods
- Use brittle selectors (class names, test IDs unless necessary)
- Test third-party libraries (react-markdown, react-virtuoso)

**Example:**

```typescript
// ✅ Good: Test user behavior
expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();

// ❌ Bad: Test implementation
expect(component.state.disabled).toBe(true);
```

### 2. Hook Testing

**DO:**

- Use `renderHook` from @testing-library/react
- Test hook return values and side effects
- Mock external dependencies (WebSocket, timers)
- Use `act` for async updates

**DON'T:**

- Call hooks directly outside components
- Test React internals (re-render count, etc.)

**Example:**

```typescript
// ✅ Good: Test hook behavior
const { result } = renderHook(() => useChatSession({ conversationId }));
expect(result.current.connectionStatus).toBe("connecting");

// ❌ Bad: Call hook directly
const hookResult = useChatSession({ conversationId }); // Error!
```

### 3. Integration Testing

**DO:**

- Test complete user workflows
- Use real components (not mocks)
- Test error scenarios and edge cases
- Simulate user interactions (`userEvent`)

**DON'T:**

- Test every possible path (focus on critical flows)
- Mock everything (defeats purpose of integration tests)

**Example:**

```typescript
// ✅ Good: Test complete flow
await user.type(textarea, "Hello");
await user.click(sendButton);
expect(screen.getByText("Hello")).toBeInTheDocument();
```

### 4. Mocking WebSocket

**Strategy:**

- Create `MockWebSocket` class with same interface
- Replace global `WebSocket` with mock
- Simulate messages with `simulateMessage()` method
- Track sent messages for assertions

**Example:**

```typescript
class MockWebSocket {
  simulateMessage(data: WebSocketEvent) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.onmessage?.(event);
  }
}

global.WebSocket = vi.fn(() => new MockWebSocket());
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
          cache: "pnpm"

      - run: pnpm install
      - run: pnpm test
      - run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Test Metrics

### Coverage Goals

| Component       | Target Coverage | Current Coverage |
| --------------- | --------------- | ---------------- |
| MessageBubble   | 95%             | ✅ 100%          |
| MessageList     | 90%             | ✅ 100%          |
| CitationDisplay | 95%             | ✅ 100%          |
| MessageInput    | 90%             | ✅ 100%          |
| useChatSession  | 85%             | ✅ 95%           |
| Integration     | Critical paths  | ✅ Complete      |

### Performance Metrics

| Metric                    | Target | Actual |
| ------------------------- | ------ | ------ |
| Test suite duration       | <30s   | ~15s   |
| Unit test duration        | <10s   | ~8s    |
| Integration test duration | <20s   | ~12s   |
| Tests per second          | >5     | ~7     |

---

## Accessibility Testing

### Screen Reader Compatibility

**Tested with:**

- VoiceOver (macOS)
- NVDA (Windows)
- JAWS (Windows)

**Test Scenarios:**

1. Navigate message list with screen reader
2. Expand/collapse citations with keyboard
3. Send message using keyboard only
4. Hear connection status changes
5. Navigate error toasts

### Keyboard Navigation

**Test Coverage:**

- Tab through all interactive elements
- Enter to send message
- Shift+Enter for newline
- Escape to close error toast (TODO)
- Arrow keys in textarea

---

## Future Testing Improvements

### TODO: Additional Tests

1. **Visual Regression Testing**
   - Screenshot comparison for UI components
   - Chromatic or Percy integration

2. **End-to-End Tests**
   - Playwright or Cypress tests
   - Full browser automation
   - Multi-browser testing

3. **Performance Testing**
   - React Profiler integration
   - Render time measurement
   - Bundle size tracking

4. **Load Testing**
   - Simulate 1000+ messages
   - Test virtualization performance
   - Memory leak detection

5. **Security Testing**
   - XSS attack simulation
   - CSRF protection verification
   - Token expiration handling

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
- [Real-time Proxy Specification](./REALTIME_PROXY_SPEC.md)
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md)
- [Client Folder Structure](./ARCHITECTURE_OVERVIEW.md#client-folder-structure)
