---
title: Remaining Message Edit Work
slug: remaining-message-edit-work
summary: "**Created:** 2025-11-23"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - remaining
  - message
  - edit
  - work
category: reference
ai_summary: >-
  Created: 2025-11-23 Status: In Progress (API + Menu Complete, UI + Tests
  Pending) Priority: High (Phase 2 Advanced Features) --- File:
  packages/api-client/src/index.ts Added two new methods: async
  editMessage(conversationId: string, messageId: string, content: string):
  Promise<Message> async dele...
---

# Message Editing & Regeneration - Remaining Implementation

**Created:** 2025-11-23
**Status:** In Progress (API + Menu Complete, UI + Tests Pending)
**Priority:** High (Phase 2 Advanced Features)

---

## ✅ Completed Work

### 1. API Client Extensions

**File:** `packages/api-client/src/index.ts`

Added two new methods:

```typescript
async editMessage(conversationId: string, messageId: string, content: string): Promise<Message>
async deleteMessage(conversationId: string, messageId: string): Promise<void>
```

**Location:** Lines 207-226

### 2. MessageActionMenu Component

**File:** `apps/web-app/src/components/chat/MessageActionMenu.tsx`

**Features:**

- Dropdown menu triggered by three-dot icon
- Copy message to clipboard
- Edit (user messages only)
- Regenerate (assistant messages only)
- Delete with confirmation
- Accessible with proper ARIA attributes
- Click-outside-to-close behavior
- Keyboard navigation support

---

## 🔄 Remaining Work

### Task 1: Enhanced MessageBubble with Inline Editing

**File to Modify:** `apps/web-app/src/components/chat/MessageBubble.tsx`

**Requirements:**

1. **Add State for Editing Mode**

   ```typescript
   const [isEditing, setIsEditing] = useState(false);
   const [editedContent, setEditedContent] = useState(message.content);
   const [isSaving, setIsSaving] = useState(false);
   ```

2. **Integrate MessageActionMenu**
   - Import and render `MessageActionMenu` component
   - Position it in the top-right corner of message bubble
   - Make it visible on hover via `group` and `group-hover` classes
   - Wire up callbacks:
     - `onEdit={() => setIsEditing(true)}`
     - `onRegenerate={() => props.onRegenerate?.(message.id)}`
     - `onDelete={() => props.onDelete?.(message.id)}`
     - `onCopy={() => navigator.clipboard.writeText(message.content)}`

3. **Implement Inline Edit UI**

   ```tsx
   {isEditing ? (
     <div className="space-y-2">
       <textarea
         value={editedContent}
         onChange={(e) => setEditedContent(e.target.value)}
         className="w-full min-h-[100px] p-2 border rounded"
         autoFocus
         onKeyDown={(e) => {
           if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
             handleSave();
           } else if (e.key === 'Escape') {
             handleCancel();
           }
         }}
       />
       <div className="flex justify-end space-x-2">
         <button onClick={handleCancel} disabled={isSaving}>
           Cancel
         </button>
         <button onClick={handleSave} disabled={isSaving}>
           {isSaving ? 'Saving...' : 'Save'}
         </button>
       </div>
     </div>
   ) : (
     // Existing ReactMarkdown rendering
   )}
   ```

4. **Add Save/Cancel Handlers**

   ```typescript
   const handleSave = async () => {
     if (editedContent === message.content) {
       setIsEditing(false);
       return;
     }

     setIsSaving(true);
     try {
       await props.onEditSave?.(message.id, editedContent);
       setIsEditing(false);
     } catch (error) {
       console.error("Failed to save edit:", error);
       // Show error toast
     } finally {
       setIsSaving(false);
     }
   };

   const handleCancel = () => {
     setEditedContent(message.content);
     setIsEditing(false);
   };
   ```

5. **Update Component Props**

   ```typescript
   export interface MessageBubbleProps {
     message: Message;
     isStreaming?: boolean;
     onEditSave?: (messageId: string, newContent: string) => Promise<void>;
     onRegenerate?: (messageId: string) => Promise<void>;
     onDelete?: (messageId: string) => Promise<void>;
   }
   ```

6. **Add Hover Group Class**
   - Wrap message bubble in `<div className="group">` to enable hover-based action menu

---

### Task 2: Update useChatSession Hook

**File to Modify:** `apps/web-app/src/hooks/useChatSession.ts`

**Requirements:**

1. **Add Editing State**

   ```typescript
   const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
   ```

2. **Implement editMessage Function**

   ```typescript
   const editMessage = useCallback(
     async (messageId: string, newContent: string) => {
       try {
         const updatedMessage = await apiClient.editMessage(conversationId, messageId, newContent);

         // Update local state
         setMessages((prev) => prev.map((msg) => (msg.id === messageId ? updatedMessage : msg)));

         setEditingMessageId(null);
       } catch (error) {
         console.error("Failed to edit message:", error);
         throw error;
       }
     },
     [conversationId, apiClient],
   );
   ```

3. **Implement regenerateMessage Function**

   ```typescript
   const regenerateMessage = useCallback(
     async (assistantMessageId: string) => {
       // Find the assistant message and the user message before it
       const messageIndex = messages.findIndex((m) => m.id === assistantMessageId);
       if (messageIndex === -1 || messageIndex === 0) {
         console.error("Cannot regenerate: invalid message");
         return;
       }

       const userMessage = messages[messageIndex - 1];
       if (userMessage.role !== "user") {
         console.error("Cannot regenerate: previous message is not from user");
         return;
       }

       // Remove the old assistant message
       setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));

       // Re-send the user message (will trigger new assistant response via WebSocket)
       sendMessage(userMessage.content);
     },
     [messages, sendMessage],
   );
   ```

4. **Implement deleteMessage Function**

   ```typescript
   const deleteMessage = useCallback(
     async (messageId: string) => {
       if (!confirm("Are you sure you want to delete this message?")) {
         return;
       }

       try {
         await apiClient.deleteMessage(conversationId, messageId);

         // Update local state
         setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
       } catch (error) {
         console.error("Failed to delete message:", error);
         throw error;
       }
     },
     [conversationId, apiClient],
   );
   ```

5. **Update Return Type**

   ```typescript
   interface UseChatSessionReturn {
     messages: Message[];
     connectionStatus: ConnectionStatus;
     isTyping: boolean;
     editingMessageId: string | null;
     sendMessage: (content: string, attachments?: string[]) => void;
     editMessage: (messageId: string, newContent: string) => Promise<void>;
     regenerateMessage: (messageId: string) => Promise<void>;
     deleteMessage: (messageId: string) => Promise<void>;
     disconnect: () => void;
     reconnect: () => void;
   }
   ```

6. **Import apiClient**
   - Add `useAuth` hook to get `apiClient`:
   ```typescript
   import { useAuth } from "./useAuth";
   // ...
   const { apiClient } = useAuth();
   ```

---

### Task 3: Wire Up Components in ChatPage

**File to Modify:** `apps/web-app/src/pages/ChatPage.tsx`

**Requirements:**

1. **Get New Functions from Hook**

   ```typescript
   const {
     messages,
     connectionStatus,
     isTyping,
     sendMessage,
     editMessage,
     regenerateMessage,
     deleteMessage,
     reconnect,
   } = useChatSession({
     conversationId: activeConversationId || "",
     onError: handleError,
     initialMessages,
   });
   ```

2. **Pass Functions to MessageList**
   - Update `MessageList` to accept and forward these props to `MessageBubble`

---

### Task 4: Comprehensive Tests

**Files to Create:**

#### 4.1 MessageActionMenu Tests

**File:** `apps/web-app/src/components/chat/__tests__/MessageActionMenu.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActionMenu } from '../MessageActionMenu';

describe('MessageActionMenu', () => {
  const mockOnEdit = vi.fn();
  const mockOnRegenerate = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnCopy = vi.fn();

  it('renders menu button', () => {
    render(
      <MessageActionMenu
        messageId="msg-1"
        role="user"
        onEdit={mockOnEdit}
      />
    );

    const button = screen.getByLabelText('Message actions');
    expect(button).toBeInTheDocument();
  });

  it('shows edit option for user messages', async () => {
    const user = userEvent.setup();
    render(
      <MessageActionMenu
        messageId="msg-1"
        role="user"
        onEdit={mockOnEdit}
      />
    );

    await user.click(screen.getByLabelText('Message actions'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('shows regenerate option for assistant messages', async () => {
    const user = userEvent.setup();
    render(
      <MessageActionMenu
        messageId="msg-1"
        role="assistant"
        onRegenerate={mockOnRegenerate}
      />
    );

    await user.click(screen.getByLabelText('Message actions'));
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
  });

  it('does not render for system messages', () => {
    const { container } = render(
      <MessageActionMenu
        messageId="msg-1"
        role="system"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('calls onEdit when edit is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MessageActionMenu
        messageId="msg-1"
        role="user"
        onEdit={mockOnEdit}
      />
    );

    await user.click(screen.getByLabelText('Message actions'));
    await user.click(screen.getByText('Edit'));

    expect(mockOnEdit).toHaveBeenCalled();
  });

  it('closes menu after action', async () => {
    const user = userEvent.setup();
    render(
      <MessageActionMenu
        messageId="msg-1"
        role="user"
        onCopy={mockOnCopy}
      />
    );

    await user.click(screen.getByLabelText('Message actions'));
    await user.click(screen.getByText('Copy'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

#### 4.2 Message Editing Integration Tests

**File:** `apps/web-app/src/hooks/__tests__/useChatSession-editing.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";

// Mock WebSocket and API client
vi.mock("../useAuth", () => ({
  useAuth: () => ({
    apiClient: mockApiClient,
    tokens: { accessToken: "mock-token" },
  }),
}));

const mockApiClient = {
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
};

describe("useChatSession - Editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should edit a message successfully", async () => {
    const initialMessages = [{ id: "msg-1", role: "user", content: "Hello", timestamp: "2024-01-01" }];

    mockApiClient.editMessage.mockResolvedValue({
      id: "msg-1",
      role: "user",
      content: "Hello World",
      timestamp: "2024-01-01",
    });

    const { result } = renderHook(() =>
      useChatSession({
        conversationId: "conv-1",
        initialMessages,
      }),
    );

    await act(async () => {
      await result.current.editMessage("msg-1", "Hello World");
    });

    expect(mockApiClient.editMessage).toHaveBeenCalledWith("conv-1", "msg-1", "Hello World");
    expect(result.current.messages[0].content).toBe("Hello World");
  });

  it("should delete a message successfully", async () => {
    const initialMessages = [
      { id: "msg-1", role: "user", content: "Hello", timestamp: "2024-01-01" },
      { id: "msg-2", role: "assistant", content: "Hi", timestamp: "2024-01-01" },
    ];

    mockApiClient.deleteMessage.mockResolvedValue(undefined);

    // Mock window.confirm
    global.confirm = vi.fn(() => true);

    const { result } = renderHook(() =>
      useChatSession({
        conversationId: "conv-1",
        initialMessages,
      }),
    );

    await act(async () => {
      await result.current.deleteMessage("msg-1");
    });

    expect(mockApiClient.deleteMessage).toHaveBeenCalledWith("conv-1", "msg-1");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe("msg-2");
  });

  it("should handle edit errors gracefully", async () => {
    const initialMessages = [{ id: "msg-1", role: "user", content: "Hello", timestamp: "2024-01-01" }];

    mockApiClient.editMessage.mockRejectedValue(new Error("API Error"));

    const { result } = renderHook(() =>
      useChatSession({
        conversationId: "conv-1",
        initialMessages,
      }),
    );

    await expect(async () => {
      await act(async () => {
        await result.current.editMessage("msg-1", "Hello World");
      });
    }).rejects.toThrow("API Error");

    // Message should remain unchanged
    expect(result.current.messages[0].content).toBe("Hello");
  });
});
```

#### 4.3 MessageBubble Editing Tests

**File:** `apps/web-app/src/components/chat/__tests__/MessageBubble-editing.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../MessageBubble';

describe('MessageBubble - Editing', () => {
  const mockMessage = {
    id: 'msg-1',
    role: 'user' as const,
    content: 'Hello, world!',
    timestamp: '2024-01-01T00:00:00Z',
  };

  it('shows edit button on hover for user messages', () => {
    render(<MessageBubble message={mockMessage} />);

    // Action menu should be present but initially hidden
    const actionButton = screen.getByLabelText('Message actions');
    expect(actionButton).toHaveClass('opacity-0');
  });

  it('enters edit mode when edit is clicked', async () => {
    const user = userEvent.setup();
    const mockOnEditSave = vi.fn();

    render(
      <MessageBubble
        message={mockMessage}
        onEditSave={mockOnEditSave}
      />
    );

    // Open action menu
    await user.click(screen.getByLabelText('Message actions'));

    // Click edit
    await user.click(screen.getByText('Edit'));

    // Should show textarea
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Hello, world!');
  });

  it('saves edited message when save is clicked', async () => {
    const user = userEvent.setup();
    const mockOnEditSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageBubble
        message={mockMessage}
        onEditSave={mockOnEditSave}
      />
    );

    // Enter edit mode
    await user.click(screen.getByLabelText('Message actions'));
    await user.click(screen.getByText('Edit'));

    // Edit the message
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Updated message');

    // Save
    await user.click(screen.getByText('Save'));

    expect(mockOnEditSave).toHaveBeenCalledWith('msg-1', 'Updated message');
  });

  it('cancels edit when cancel is clicked', async () => {
    const user = userEvent.setup();
    const mockOnEditSave = vi.fn();

    render(
      <MessageBubble
        message={mockMessage}
        onEditSave={mockOnEditSave}
      />
    );

    // Enter edit mode
    await user.click(screen.getByLabelText('Message actions'));
    await user.click(screen.getByText('Edit'));

    // Edit the message
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Updated message');

    // Cancel
    await user.click(screen.getByText('Cancel'));

    // Should show original message
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    expect(mockOnEditSave).not.toHaveBeenCalled();
  });

  it('saves on Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const mockOnEditSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageBubble
        message={mockMessage}
        onEditSave={mockOnEditSave}
      />
    );

    // Enter edit mode
    await user.click(screen.getByLabelText('Message actions'));
    await user.click(screen.getByText('Edit'));

    // Edit and save with Ctrl+Enter
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Updated{Control>}{Enter}{/Control}');

    expect(mockOnEditSave).toHaveBeenCalledWith('msg-1', 'Updated');
  });
});
```

---

## 🎯 Implementation Checklist

### Phase 1: MessageBubble Enhancement

- [ ] Add editing state management
- [ ] Integrate MessageActionMenu
- [ ] Implement inline edit UI (textarea + buttons)
- [ ] Add save/cancel handlers
- [ ] Add keyboard shortcuts (Ctrl+Enter, Escape)
- [ ] Update props interface
- [ ] Add hover effects for action menu

### Phase 2: Hook Updates

- [ ] Import useAuth hook
- [ ] Add editing state
- [ ] Implement editMessage function
- [ ] Implement regenerateMessage function
- [ ] Implement deleteMessage function
- [ ] Update return type
- [ ] Add error handling

### Phase 3: Integration

- [ ] Update ChatPage to pass new functions
- [ ] Update MessageList to forward props
- [ ] Test end-to-end flow
- [ ] Verify WebSocket integration

### Phase 4: Testing

- [ ] Write MessageActionMenu tests (6 tests minimum)
- [ ] Write useChatSession editing tests (4 tests minimum)
- [ ] Write MessageBubble editing tests (6 tests minimum)
- [ ] Run full test suite (`pnpm test`)
- [ ] Verify all tests pass

### Phase 5: Polish & Documentation

- [ ] Add loading states during save
- [ ] Add error toast notifications
- [ ] Test keyboard navigation
- [ ] Test accessibility with screen reader
- [ ] Update component documentation
- [ ] Update FRONTEND_PHASE1_PHASE2_SUMMARY.md

---

## 🚀 Next Steps After Completion

Once message editing and regeneration are complete and tested:

1. **Conversation Branching**
   - Design branch data model
   - Implement branch UI
   - Add branch navigation

2. **Keyboard Shortcuts**
   - Implement Cmd/Ctrl+K for search
   - Implement Cmd/Ctrl+Enter for send
   - Add Escape to close modals
   - Create shortcuts help dialog

3. **Performance Optimization**
   - Profile rendering performance
   - Optimize re-renders
   - Add virtual scrolling for long conversations
   - Implement message caching

4. **Accessibility Audit**
   - Run axe-core automated tests
   - Test with keyboard only
   - Test with screen reader (NVDA/JAWS)
   - Fix any WCAG 2.1 AA violations

---

**Document Version:** 1.0
**Last Updated:** 2025-11-23
**Estimated Effort:** 1-2 days for completion
