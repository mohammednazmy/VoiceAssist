---
title: "Architecture Overview"
slug: "client-implementation/architecture-overview"
summary: "The VoiceAssist platform is deployed across three dedicated domains, each serving a specific purpose:"
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["architecture", "overview"]
category: planning
---

# VoiceAssist Client Architecture Overview

## Three-Domain Architecture

The VoiceAssist platform is deployed across three dedicated domains, each serving a specific purpose:

```
┌─────────────────────────────────────────────────────────────┐
│                    VoiceAssist Platform                      │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  assist.asimo.io │  │ admin.asimo.io   │  │ docs.asimo │ │
│  │                  │  │                  │  │ .io        │ │
│  │   Main Web App   │  │  Admin Panel &   │  │ Docs Hub   │ │
│  │   Chat Interface │  │  KB Editor       │  │ (canonical)│ │
│  │   Real-time      │  │  User Mgmt       │  │            │ │
│  │   Messaging      │  │  Settings        │  │            │ │
│  └────────┬─────────┘  └────────┬─────────┘  └─────┬──────┘ │
│           │                     │                   │        │
│           └────────────┬────────┘                   │        │
│                        │                            │        │
│              ┌─────────▼─────────┐                  │        │
│              │                   │                  │        │
│              │  Backend Services │                  │        │
│              │  (assist.asimo.io)│                  │        │
│              │                   │                  │        │
│              │  • REST API       │                  │        │
│              │  • WebSocket      │                  │        │
│              │  • Auth           │                  │        │
│              └───────────────────┘                  │        │
│                                                     │        │
│              ┌──────────────────────────────────────┘        │
│              │                                               │
│              ▼                                               │
│     ┌────────────────┐                                       │
│     │                │                                       │
│     │  Next.js +     │                                       │
│     │  Markdown docs │                                       │
│     └────────────────┘                                       │
└──────────────────────────────────────────────────────────────┘
```

### Domain Purposes

#### 1. assist.asimo.io (Main Application)

**Primary Purpose:** End-user chat interface with real-time AI assistant

**Key Features:**

- Chat interface with WebSocket streaming
- Message history with virtualization
- Citation display and references
- File attachment support
- Markdown rendering with code highlighting
- Math equation support (KaTeX)
- User authentication and session management

**Technology Stack:**

- React 18.2+ with TypeScript
- Vite build system
- React Router v6
- Zustand state management
- react-virtuoso for message virtualization
- react-markdown for content rendering
- WebSocket for real-time communication

**Key Endpoints:**

- `GET /` - Main app (SPA)
- `GET /api/health` - Health check
- `POST /api/auth/login` - Authentication
- `POST /api/auth/register` - User registration
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `WS /api/realtime` - WebSocket streaming endpoint
- `POST /api/attachments/upload` - File upload

---

#### 2. admin.asimo.io (Administration)

**Primary Purpose:** Administrative control panel and knowledge base management

**Key Features:**

- User management and roles
- Knowledge base editing
- Document upload and indexing
- System settings and configuration
- Analytics and usage metrics
- Audit logs

**Technology Stack:**

- React 18.2+ with TypeScript
- Shared component library with main app
- Tailwind CSS for styling
- Role-based access control (RBAC)

**Key Endpoints:**

- `GET /` - Admin panel (SPA)
- `GET /api/admin/users` - User management
- `POST /api/admin/kb/upload` - Document upload
- `GET /api/admin/analytics` - Usage metrics
- `GET /api/admin/settings` - System configuration

---

#### 3. docs.asimo.io (Documentation)

**Primary Purpose:** Technical documentation and API reference

**Key Features:**

- Comprehensive technical documentation
- API reference documentation
- Integration guides
- Development tutorials
- Architecture diagrams
- Deployment guides

**Technology Stack:**

- Next.js 14 (App Router)
- Markdown content sourced from monorepo `docs/`
- Tailwind Typography styling
- Reverse proxy at Apache2 → Next.js runtime on port 3001
- Version control via Git

**Content Structure:**

```
docs/
├── overview/
│   ├── architecture.md
│   └── getting-started.md
├── client-implementation/
│   ├── folder-structure.md
│   ├── testing-guide.md
│   └── deployment.md
├── api-reference/
│   ├── rest-api.md
│   ├── websocket-events.md
│   └── authentication.md
└── realtime/
    ├── proxy-spec.md
    └── streaming-protocol.md
```

---

## Client Folder Structure

```
apps/web-app/                    # Main application (assist.asimo.io)
├── src/
│   ├── components/
│   │   ├── auth/                # Authentication components
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── chat/                # Chat interface components
│   │   │   ├── MessageList.tsx         # Virtualized message list
│   │   │   ├── MessageBubble.tsx       # Individual message rendering
│   │   │   ├── MessageInput.tsx        # Message input with auto-expansion
│   │   │   ├── CitationDisplay.tsx     # Citation rendering
│   │   │   ├── ConnectionStatus.tsx    # WebSocket status indicator
│   │   │   ├── ChatErrorBoundary.tsx   # Error boundary for chat
│   │   │   └── __tests__/              # Component unit tests
│   │   ├── conversations/       # Conversation management
│   │   │   ├── ConversationList.tsx    # Conversation list sidebar
│   │   │   ├── ConversationListItem.tsx # Individual conversation item
│   │   │   └── __tests__/              # Conversation tests
│   │   ├── layout/              # Layout components
│   │   │   ├── MainLayout.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   └── common/              # Shared components
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── LoadingSpinner.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── HomePage.tsx
│   │   ├── ChatPage.tsx          # Main chat interface
│   │   ├── ProfilePage.tsx
│   │   └── OAuthCallbackPage.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useChatSession.ts     # WebSocket chat hook
│   │   └── __tests__/            # Hook unit tests
│   ├── stores/
│   │   ├── authStore.ts          # Zustand auth store
│   │   └── conversationStore.ts
│   ├── lib/
│   │   ├── api.ts                # REST API client
│   │   ├── websocket.ts          # WebSocket utilities
│   │   └── validators.ts
│   ├── __tests__/
│   │   └── integration/          # Integration tests
│   │       └── ChatFlow.test.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── public/
│   └── assets/
├── index.html
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── tsconfig.json

packages/
├── types/                        # Shared TypeScript types
│   ├── src/
│   │   └── index.ts              # Message, Citation, WebSocket types
│   └── package.json
└── ui-components/                # Shared component library
    ├── src/
    │   ├── Button/
    │   ├── Input/
    │   └── index.ts
    └── package.json
```

---

## Data Flow Architecture

### 1. User Message Flow

```
┌─────────────┐
│    User     │
│  (Browser)  │
└──────┬──────┘
       │ 1. Types message
       │ 2. Clicks Send / Presses Enter
       ▼
┌────────────────────────┐
│   MessageInput.tsx     │
│  - Validates input     │
│  - Triggers onSend     │
└──────┬─────────────────┘
       │ 3. sendMessage(content, attachments?)
       ▼
┌────────────────────────┐
│  useChatSession Hook   │
│  - Checks WebSocket    │
│  - Adds to messages[]  │
│  - Sends to server     │
└──────┬─────────────────┘
       │ 4. WebSocket send
       ▼
┌────────────────────────┐
│  Backend API           │
│  /api/realtime         │
│  - Processes message   │
│  - Calls OpenAI API    │
└──────┬─────────────────┘
       │ 5. Streaming response
       ▼
┌────────────────────────┐
│  useChatSession Hook   │
│  - Receives delta      │
│  - Updates streaming   │
│  - Emits message.done  │
└──────┬─────────────────┘
       │ 6. State update
       ▼
┌────────────────────────┐
│   MessageList.tsx      │
│  - Renders messages    │
│  - Shows streaming     │
│  - Auto-scrolls        │
└────────────────────────┘
```

### 2. Authentication Flow

```
┌─────────────┐
│  LoginPage  │
│  (UI Form)  │
└──────┬──────┘
       │ 1. Submit credentials
       ▼
┌─────────────┐
│  useAuth    │
│   Hook      │
└──────┬──────┘
       │ 2. POST /api/auth/login
       ▼
┌────────────────────────┐
│  Backend Auth Service  │
│  - Validates           │
│  - Issues JWT          │
└──────┬─────────────────┘
       │ 3. Returns tokens
       ▼
┌─────────────┐
│ authStore   │
│  (Zustand)  │
└──────┬──────┘
       │ 4. Stores tokens
       │ 5. Sets user state
       ▼
┌──────────────────┐
│ ProtectedRoute   │
│  - Checks auth   │
│  - Redirects     │
└──────────────────┘
```

---

## Real-time Communication

### WebSocket Protocol

**Connection URL:**

```
wss://assist.asimo.io/api/realtime?conversationId={id}&token={jwt}
```

**Event Types:**

- `delta` - Incremental text update during streaming
- `chunk` - Complete text chunk
- `message.done` - Final message with citations and metadata
- `error` - Error occurred
- `ping` - Heartbeat from client
- `pong` - Heartbeat response from server

**See detailed specification:** [docs/realtime/proxy-spec.md](./realtime/proxy-spec.md)

---

## Conversation Management

### Overview

VoiceAssist implements a first-class conversation management system that allows users to organize their chat sessions into distinct conversations with titles, history, and metadata. Each conversation is a logical grouping of messages with its own WebSocket session and persistent history.

### Conversation Data Model

```typescript
interface Conversation {
  id: string; // Unique conversation identifier
  userId: string; // Owner of the conversation
  title: string; // User-editable title
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  messageCount: number; // Total messages in conversation
  archived?: boolean; // Soft-delete flag
  lastMessagePreview?: string; // Snippet of last message
}
```

**Key Fields:**

- `id` - UUID generated on creation, used in URLs and WebSocket connections
- `title` - Defaults to "New Conversation", user can rename inline
- `archived` - Soft delete flag, archived conversations hidden from main list
- `lastMessagePreview` - First ~100 chars of last message for quick preview

### Conversation Routing Model

**URL Structure:**

```
/chat                    → Auto-creates conversation, redirects to /chat/:id
/chat/:conversationId    → Loads specific conversation with history
```

**Routing Behavior:**

1. **Landing on `/chat`:**
   - System creates a new conversation via `POST /api/conversations`
   - Redirects to `/chat/:conversationId` with `replace: true`
   - WebSocket connects automatically with new conversation ID

2. **Navigating to `/chat/:conversationId`:**
   - System validates conversation exists via `GET /api/conversations/:id`
   - If valid: Loads message history, connects WebSocket
   - If invalid (404): Shows error state with "Back to Conversations" button
   - If network error: Shows retry interface

3. **Switching Conversations:**
   - Old WebSocket connection automatically disconnects
   - Message state clears to prevent cross-contamination
   - New conversation history loads from API
   - New WebSocket connection establishes with new conversation ID

### Conversation Lifecycle

```
┌──────────────┐
│   Created    │  POST /api/conversations
│  (Active)    │  - title: "New Conversation"
└──────┬───────┘  - archived: false
       │
       │ User sends messages
       │ title updates automatically
       ▼
┌──────────────┐
│   Active     │  PATCH /api/conversations/:id
│  (In Use)    │  - User can rename
└──────┬───────┘  - Messages accumulate
       │          - lastMessagePreview updates
       │
       │ User archives
       ▼
┌──────────────┐
│  Archived    │  PATCH /api/conversations/:id
│  (Hidden)    │  { archived: true }
└──────┬───────┘  - Removed from main list
       │          - Still accessible via URL
       │
       │ User deletes
       ▼
┌──────────────┐
│   Deleted    │  DELETE /api/conversations/:id
│  (Removed)   │  - Permanently removed
└──────────────┘  - All messages deleted
```

### UI Components

#### ConversationList Component

**Location:** `apps/web-app/src/components/conversations/ConversationList.tsx`

**Responsibilities:**

- Fetches and displays list of conversations
- Handles create, rename, archive, delete operations
- Sorts by most recently updated
- Filters archived vs active conversations
- Loading, error, and empty states

**States:**

```typescript
- Loading: Shows spinner while fetching conversations
- Error: Shows error message with retry button
- Empty: Shows "No conversations" with create CTA
- Populated: Shows scrollable list of conversations
```

**Actions:**

```typescript
- Create: Creates new conversation, navigates to /chat/:id
- Click: Navigates to /chat/:conversationId
- Rename: Inline edit with Enter/Escape handlers
- Archive: Soft deletes, removes from list
- Delete: Shows confirmation dialog, permanently deletes
```

#### ConversationListItem Component

**Location:** `apps/web-app/src/components/conversations/ConversationListItem.tsx`

**Features:**

- Displays title, last message preview, relative timestamp
- Active state highlighting (current conversation)
- Inline editing for rename (focus, Enter saves, Escape cancels)
- 3-dot menu with Rename, Archive, Delete actions
- Delete confirmation dialog to prevent accidents

**UX Patterns:**

- Truncates long titles and previews with ellipsis
- Relative timestamps ("2 minutes ago", "3 hours ago")
- Keyboard navigation support (Enter, Escape, Tab)
- Confirmation dialog for destructive delete action

#### MainLayout Integration

**Location:** `apps/web-app/src/components/layout/MainLayout.tsx`

**Behavior:**

- Detects chat routes via `useLocation()` hook
- Conditionally renders ConversationList in sidebar when on `/chat` routes
- Shows traditional navigation (Home, Settings, etc.) on other routes
- Responsive: Collapsible sidebar on mobile devices

```typescript
const isChatRoute = location.pathname.startsWith('/chat');

// In sidebar:
{isChatRoute ? (
  <ConversationList />
) : (
  <nav>{/* Traditional links */}</nav>
)}
```

#### ChatPage Integration

**Location:** `apps/web-app/src/pages/ChatPage.tsx`

**Conversation Initialization:**

```typescript
1. Extract conversationId from URL params
2. If no conversationId:
   - Create new conversation
   - Redirect to /chat/:newId
3. If conversationId present:
   - Validate conversation exists
   - Load message history
   - Connect WebSocket with conversationId
4. If invalid conversationId:
   - Show error state
   - Provide "Back to Conversations" button
```

**Error Handling:**

- `not-found`: Conversation doesn't exist (404)
- `failed-create`: Couldn't create conversation
- `failed-load`: Network error loading conversation
- `websocket`: Real-time connection errors

### API Integration

**Conversation Endpoints:**

```typescript
GET    /api/conversations           // List conversations
GET    /api/conversations/:id       // Get specific conversation
POST   /api/conversations           // Create conversation
PATCH  /api/conversations/:id       // Update (rename/archive)
DELETE /api/conversations/:id       // Delete conversation
```

**Message Endpoints:**

```typescript
GET    /api/conversations/:id/messages  // Get conversation history
POST   /api/conversations/:id/messages  // Send message (REST fallback)
```

**WebSocket Connection:**

```
wss://assist.asimo.io/api/realtime?conversationId={id}&token={jwt}
```

### State Management

**Conversation State:**

- Conversation list managed locally in `ConversationList` component
- Active conversation stored in `ChatPage` component state
- Message history synced between initial load and WebSocket updates

**Message State:**

- Initial messages loaded from REST API (`GET /messages`)
- New messages received via WebSocket streaming
- Combined into single message array in `useChatSession` hook

**Navigation State:**

- Active conversation highlighted in sidebar list
- URL param (`conversationId`) drives conversation loading
- Browser back/forward properly switches conversations

### Performance Considerations

**Conversation List:**

- Fetches up to 50 most recent conversations
- Sorted by `updatedAt` on backend for efficiency
- Frontend filtering for archived vs active
- Pagination can be added if user has >50 conversations

**Message History:**

- Loads last 50 messages on conversation switch
- Older messages can be lazy-loaded on scroll to top
- Virtualized message rendering handles 1000+ messages

**WebSocket Cleanup:**

- Automatic disconnect when switching conversations
- `useEffect` cleanup ensures no lingering connections
- Reconnection logic prevents duplicate connections

### Related Documentation

- [CONVERSATIONS_AND_ROUTING.md](./CONVERSATIONS_AND_ROUTING.md) - Detailed routing behavior
- [REALTIME_PROXY_SPEC.md](./REALTIME_PROXY_SPEC.md) - WebSocket protocol
- [TESTING_PHASE3.md](./TESTING_PHASE3.md) - Conversation testing plan

---

## Testing Architecture

### Test Coverage

```
apps/web-app/src/
├── components/chat/__tests__/
│   ├── MessageBubble.test.tsx      # Unit tests (14 cases)
│   ├── MessageList.test.tsx        # Unit tests (19 cases)
│   ├── CitationDisplay.test.tsx    # Unit tests (20 cases)
│   └── MessageInput.test.tsx       # Unit tests (28 cases)
├── hooks/__tests__/
│   └── useChatSession.test.ts      # Unit tests (22 cases)
└── __tests__/integration/
    └── ChatFlow.test.tsx            # Integration tests (8 flows)
```

**Test Stack:**

- Vitest 4.0+ for test runner
- @testing-library/react for component testing
- @testing-library/user-event for user interactions
- jsdom for DOM environment

**See detailed testing guide:** [docs/client-implementation/TESTING_PHASE2.md](./TESTING_PHASE2.md)

---

## Deployment Architecture

### Build Process

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build for production
pnpm build

# Output:
# apps/web-app/dist/ (static files for assist.asimo.io)
```

### Production Deployment

**Static Hosting:**

- Main app (`assist.asimo.io`) served via CDN or static hosting
- Admin panel (`admin.asimo.io`) served separately
- Docs site (`docs.asimo.io`) proxied to Next.js runtime with `assistdocs.asimo.io` 301-redirected to the canonical host

**Environment Variables:**

```bash
VITE_API_URL=https://assist.asimo.io/api
VITE_WS_URL=wss://assist.asimo.io/api/realtime
VITE_ADMIN_URL=https://admin.asimo.io
VITE_DOCS_URL=https://docs.asimo.io
```

---

## Performance Optimizations

### Current Optimizations

1. **Message Virtualization**
   - react-virtuoso for efficient rendering of long message lists
   - Only visible messages are rendered in DOM
   - Supports 1000+ messages without performance degradation

2. **Component Memoization**
   - `MessageBubble` wrapped in `React.memo` to prevent unnecessary re-renders
   - Callbacks memoized with `useCallback` in `useChatSession`

3. **Streaming Optimizations**
   - Functional setState to avoid stale closures
   - Batched updates via React's state management
   - Ref-based streaming message to reduce state updates

4. **Code Splitting**
   - Lazy loading of routes with React.lazy
   - Syntax highlighter loaded on-demand
   - KaTeX loaded only when math equations present

### TODO: Future Optimizations

- Implement pagination for conversations with >1000 messages
- Add lazy loading of older messages on scroll to top
- Implement message caching/indexing for very large histories
- Add service worker for offline support
- Implement request deduplication for API calls

---

## Security Considerations

### Authentication

- JWT-based authentication with refresh tokens
- Tokens stored in memory (not localStorage for XSS protection)
- Automatic token refresh before expiration
- Protected routes with `ProtectedRoute` component

### WebSocket Security

- Token-based authentication in WebSocket URL
- Connection validation on server
- Rate limiting on message sending
- Input sanitization on both client and server

### Content Security

- Markdown sanitization via `react-markdown`
- XSS prevention with proper escaping
- HTTPS-only connections
- Content Security Policy (CSP) headers

---

## Monitoring and Observability

### Client-Side Metrics

**Performance Metrics:**

- Message render time
- WebSocket connection latency
- Streaming latency (first token, total time)
- Component re-render counts

**Error Tracking:**

- Error boundaries for graceful degradation
- WebSocket connection errors
- API request failures
- User interaction errors

**User Analytics:**

- Message send frequency
- Average conversation length
- Feature usage (citations, attachments)
- Connection quality metrics

---

## Related Documentation

- [Client Folder Structure](./CLIENT_FOLDER_STRUCTURE.md)
- [Real-time Proxy Specification](./REALTIME_PROXY_SPEC.md)
- [Phase 2 Testing Plan](./TESTING_PHASE2.md)
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md)
- [API Reference](../api-reference/rest-api.md)
