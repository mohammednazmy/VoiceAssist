# Conversations and Routing

## Overview

This document describes the conversation management and routing system in VoiceAssist. It covers URL patterns, navigation behavior, conversation lifecycle, and state management.

---

## URL Patterns

### Route Structure

```
/chat                    # Conversation auto-creation route
/chat/:conversationId    # Specific conversation route
```

### Route Parameters

- `conversationId` - UUID string identifying a specific conversation
- Example: `/chat/a1b2c3d4-e5f6-7890-abcd-ef1234567890`

---

## Routing Behavior

### 1. Landing on `/chat`

**Scenario:** User navigates to `/chat` with no conversation ID

**Behavior:**
1. ChatPage extracts `conversationId` from URL params → `undefined`
2. System automatically creates new conversation:
   ```typescript
   const newConversation = await apiClient.createConversation('New Conversation');
   ```
3. Redirects to `/chat/:conversationId` with `replace: true` (no back button to `/chat`)
4. WebSocket connects with new conversation ID

**Loading States:**
- `creating` → Shows "Creating conversation..." spinner
- Success → Redirect to new conversation
- Error → Shows error state with retry button

**Example Flow:**
```
User → /chat
       ↓
    [ChatPage useEffect]
       ↓
    POST /api/conversations
       ↓
    navigate(/chat/new-id, {replace: true})
       ↓
    /chat/new-id
```

---

### 2. Direct Navigation to `/chat/:conversationId`

**Scenario:** User navigates directly to a specific conversation (via link, bookmark, or conversation list)

**Behavior:**
1. ChatPage extracts `conversationId` from URL params
2. System validates conversation exists:
   ```typescript
   const conversation = await apiClient.getConversation(conversationId);
   ```
3. If valid:
   - Loads conversation metadata (title, messageCount, etc.)
   - Loads message history (last 50 messages)
   - Connects WebSocket with conversation ID
   - Renders chat interface
4. If invalid (404):
   - Shows "Conversation Not Found" error page
   - Provides "Back to Conversations" button → navigates to `/chat`
5. If network error:
   - Shows "Failed to Load Conversation" error page
   - Provides "Try Again" button → reloads page

**Loading States:**
- `validating` → Shows "Loading conversation..." spinner
- `loading-history` → Continues showing spinner
- Success → Renders chat interface
- Error → Shows error page

**Example Flow (Valid Conversation):**
```
User → /chat/abc123
       ↓
    [ChatPage useEffect]
       ↓
    GET /api/conversations/abc123 → 200 OK
       ↓
    GET /api/conversations/abc123/messages → 200 OK
       ↓
    [Render chat with history]
       ↓
    [Connect WebSocket]
```

**Example Flow (Invalid Conversation):**
```
User → /chat/invalid-id
       ↓
    [ChatPage useEffect]
       ↓
    GET /api/conversations/invalid-id → 404 Not Found
       ↓
    [Show "Conversation Not Found" error]
       ↓
    User clicks "Back to Conversations"
       ↓
    navigate(/chat) → Creates new conversation
```

---

### 3. Switching Conversations

**Scenario:** User clicks a different conversation in the sidebar while viewing another conversation

**Behavior:**
1. ConversationListItem onClick triggers:
   ```typescript
   navigate(`/chat/${conversation.id}`);
   ```
2. URL changes → `conversationId` param changes
3. ChatPage useEffect detects change:
   ```typescript
   if (conversationId !== activeConversationId) {
     // Clear old state
     // Load new conversation
   }
   ```
4. Old WebSocket disconnects automatically (useEffect cleanup)
5. Message state clears (prevents cross-contamination)
6. New conversation loads (validation + history)
7. New WebSocket connects

**State Transitions:**
```
Conversation A (active)
       ↓
    User clicks Conversation B in sidebar
       ↓
    navigate(/chat/B)
       ↓
    [Old WebSocket disconnects]
       ↓
    [Clear message state]
       ↓
    setActiveConversationId(null)
       ↓
    GET /api/conversations/B
       ↓
    GET /api/conversations/B/messages
       ↓
    setActiveConversationId(B)
       ↓
    [New WebSocket connects to B]
       ↓
    Conversation B (active)
```

**Critical Cleanup:**
```typescript
// In useChatSession.ts
useEffect(() => {
  connect();  // Establishes WebSocket connection

  return () => {
    disconnect();  // Cleanup: disconnect when conversationId changes
  };
}, [connect, disconnect]);

// In ChatPage.tsx
useEffect(() => {
  if (conversationId !== activeConversationId) {
    // Clear state before loading new conversation
    setActiveConversationId(null);
    setConversation(null);
    setInitialMessages([]);
    // Then load new conversation...
  }
}, [conversationId, activeConversationId]);
```

---

### 4. Browser Back/Forward Navigation

**Scenario:** User uses browser back/forward buttons

**Behavior:**
- URL changes trigger conversation switch (same as clicking in sidebar)
- History stack properly maintained
- No duplicate conversations in history (due to `replace: true` on auto-create)

**Example:**
```
1. User lands on /chat → Creates conv A → /chat/A
2. User creates new → /chat/B
3. User back button → /chat/A (loads conversation A)
4. User forward button → /chat/B (loads conversation B)
```

---

## Conversation Actions and Navigation

### Creating a New Conversation

**Trigger:** User clicks "New Conversation" button in ConversationList

**Flow:**
```typescript
1. ConversationList.handleCreateNew()
       ↓
    POST /api/conversations { title: "New Conversation" }
       ↓
    Success: newConversation object returned
       ↓
    setConversations([newConversation, ...prev])
       ↓
    navigate(/chat/newConversation.id)
       ↓
    ChatPage loads new conversation
```

**Result:**
- New conversation appears at top of list
- User navigated to new conversation
- Old conversation remains in history

---

### Deleting a Conversation

**Trigger:** User clicks Delete in conversation menu, confirms in dialog

**Flow:**
```typescript
1. ConversationListItem.handleDelete()
       ↓
    DELETE /api/conversations/id
       ↓
    Success: conversation permanently deleted
       ↓
    setConversations(prev => prev.filter(c => c.id !== id))
       ↓
    If deleting active conversation:
       navigate(/chat)  // Auto-creates new conversation
```

**Edge Cases:**
- If user deletes the currently active conversation:
  - Navigates to `/chat` (triggers auto-create)
  - Prevents user from staying on deleted conversation
- If user deletes a different conversation:
  - No navigation occurs
  - Conversation removed from sidebar list

---

### Archiving a Conversation

**Trigger:** User clicks Archive in conversation menu

**Flow:**
```typescript
1. ConversationListItem.handleArchive()
       ↓
    PATCH /api/conversations/id { archived: true }
       ↓
    Success: conversation soft-deleted
       ↓
    setConversations(prev => prev.filter(c => c.id !== id))
       ↓
    If archiving active conversation:
       navigate(/chat)  // Auto-creates new conversation
```

**Behavior:**
- Same as delete, but conversation still accessible via URL
- Archived conversations hidden from main list
- Can be shown with `ConversationList showArchived={true}`

---

### Renaming a Conversation

**Trigger:** User clicks Rename, edits title, presses Enter or clicks outside

**Flow:**
```typescript
1. ConversationListItem enters edit mode (isEditing = true)
       ↓
    User types new title
       ↓
    User presses Enter or clicks outside
       ↓
    PATCH /api/conversations/id { title: newTitle }
       ↓
    Success: updated conversation returned
       ↓
    setConversations(prev => prev.map(c => c.id === id ? updated : c))
```

**No Navigation:**
- Rename is purely a metadata update
- No URL change or conversation reload
- Title updates in sidebar and chat header

---

## State Management

### Component State Hierarchy

```
MainLayout
    │
    ├─ ConversationList (sidebar)
    │     │
    │     ├─ conversations: Conversation[]      # List of all conversations
    │     ├─ isLoading: boolean                 # Fetching conversations
    │     ├─ error: string | null               # Error message
    │     │
    │     └─ ConversationListItem (for each conversation)
    │           │
    │           ├─ isActive: boolean            # Highlighted if current
    │           ├─ isEditing: boolean           # Inline edit mode
    │           └─ showDeleteConfirm: boolean   # Delete dialog
    │
    └─ ChatPage (main content)
          │
          ├─ activeConversationId: string | null    # Current conversation
          ├─ conversation: Conversation | null      # Metadata
          ├─ initialMessages: Message[]             # History from API
          ├─ loadingState: LoadingState             # UI state
          ├─ errorType: ErrorType                   # Error category
          │
          └─ useChatSession Hook
                │
                ├─ messages: Message[]              # Combined history + streaming
                ├─ connectionStatus: ConnectionStatus
                ├─ isTyping: boolean
                └─ WebSocket connection
```

### State Synchronization

**Conversation List ↔ ChatPage:**
- No direct state sharing (decoupled)
- Both read from same API endpoints
- URL param (`conversationId`) is source of truth for active conversation
- List highlights active conversation by comparing `conversation.id === conversationId`

**Initial Messages ↔ WebSocket Messages:**
```typescript
// In useChatSession.ts
const [messages, setMessages] = useState<Message[]>(initialMessages);

// When initialMessages changes (conversation switch):
useEffect(() => {
  setMessages(initialMessages);  // Replace entire message array
  streamingMessageRef.current = null;  // Clear streaming state
  setIsTyping(false);
}, [initialMessages]);

// New messages from WebSocket are appended:
case 'delta':
  setMessages(prev => [...prev.filter(m => m.id !== streaming.id), streaming]);
```

---

## Error Handling

### Error Types

```typescript
type ErrorType =
  | 'not-found'       // 404: Conversation doesn't exist
  | 'failed-create'   // Couldn't create new conversation
  | 'failed-load'     // Network error loading conversation
  | 'websocket'       // WebSocket connection/message errors
  | null;
```

### Error UI States

#### 1. Conversation Not Found (404)

```
┌────────────────────────────────┐
│  [!] Conversation Not Found    │
│                                │
│  This conversation could not   │
│  be found. It may have been    │
│  deleted.                      │
│                                │
│  [← Back to Conversations]     │
└────────────────────────────────┘
```

**Actions:**
- "Back to Conversations" → `navigate('/chat')` → auto-creates new conversation

#### 2. Failed to Create

```
┌────────────────────────────────┐
│  [!] Failed to Create          │
│       Conversation             │
│                                │
│  Failed to create conversation.│
│  Please try again.             │
│                                │
│  [Try Again]                   │
└────────────────────────────────┘
```

**Actions:**
- "Try Again" → `window.location.reload()` → retry auto-create

#### 3. Failed to Load

```
┌────────────────────────────────┐
│  [!] Failed to Load            │
│       Conversation             │
│                                │
│  Failed to load conversation.  │
│  Please try again.             │
│                                │
│  [Try Again]                   │
└────────────────────────────────┘
```

**Actions:**
- "Try Again" → `window.location.reload()` → retry validation/load

#### 4. WebSocket Errors

```
┌────────────────────────────────┐
│  [!] CONNECTION_DROPPED: ...   │  [×]
└────────────────────────────────┘
```

**Behavior:**
- Transient toast notification (auto-dismisses in 5s for recoverable errors)
- Persistent notification for fatal errors (requires manual dismiss)
- Does not block chat interface (still shows message history)

---

## Performance Considerations

### Conversation List

**Fetching:**
- Fetches on mount: `GET /api/conversations?page=1&pageSize=50`
- Cached in component state (no global store needed)
- Re-fetches only on explicit refresh or conversation create/delete

**Sorting:**
- Server returns conversations sorted by `updatedAt DESC`
- Frontend applies additional filtering (archived vs active)

**Pagination:**
- Current: Loads first 50 conversations
- Future: Implement infinite scroll for users with >50 conversations

### Message History

**Initial Load:**
- Fetches last 50 messages: `GET /api/conversations/:id/messages?page=1&pageSize=50`
- Older messages not loaded initially

**Lazy Loading (Future Enhancement):**
- Detect scroll to top in MessageList
- Fetch older messages: `GET /api/conversations/:id/messages?page=2&pageSize=50`
- Prepend to message array without disrupting scroll position

### WebSocket Connection Management

**Connection Lifecycle:**
```typescript
Conversation A active
    ↓
[WebSocket connected to A]
    ↓
User switches to Conversation B
    ↓
[useEffect cleanup runs]
    ↓
[WebSocket disconnects from A]
    ↓
[conversationId changes]
    ↓
[useEffect runs again]
    ↓
[WebSocket connects to B]
    ↓
Conversation B active
```

**Prevents:**
- Duplicate connections
- Messages from wrong conversation appearing in UI
- Memory leaks from unclosed connections

---

## Testing Scenarios

### Unit Tests

**ConversationList.test.tsx:**
- Renders loading state
- Renders error state with retry button
- Renders empty state with "New Conversation" CTA
- Renders populated list of conversations
- Creates new conversation on button click
- Navigates to conversation on item click

**ConversationListItem.test.tsx:**
- Displays title, preview, timestamp
- Highlights when active
- Enters edit mode on rename click
- Saves on Enter, cancels on Escape
- Shows delete confirmation dialog
- Calls onDelete after confirmation

**ChatPage.test.tsx:**
- Auto-creates conversation on /chat
- Loads conversation on /chat/:id
- Shows error for invalid conversation ID
- Switches conversations properly
- Clears messages when switching
- Disconnects WebSocket on unmount

### Integration Tests

**Conversation Switching:**
1. Load conversation A
2. Verify messages from A displayed
3. Click conversation B in sidebar
4. Verify messages from A cleared
5. Verify messages from B loaded
6. Verify no cross-contamination

**Conversation Deletion:**
1. Load conversation A
2. Click delete in sidebar
3. Confirm deletion
4. Verify conversation removed from list
5. Verify navigation to /chat (new conversation created)

**Conversation Creation:**
1. Click "New Conversation" button
2. Verify new conversation created
3. Verify navigation to new conversation
4. Verify new conversation appears in sidebar list

---

## Related Documentation

- [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - Overall architecture
- [REALTIME_PROXY_SPEC.md](./REALTIME_PROXY_SPEC.md) - WebSocket protocol
- [TESTING_PHASE3.md](./TESTING_PHASE3.md) - Test plan for conversations
