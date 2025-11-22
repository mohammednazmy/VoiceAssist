# VoiceAssist Client Architecture Overview

## Three-Domain Architecture

The VoiceAssist platform is deployed across three dedicated domains, each serving a specific purpose:

```
┌─────────────────────────────────────────────────────────────┐
│                    VoiceAssist Platform                      │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  assist.asimo.io │  │ admin.asimo.io   │  │assistdocs  │ │
│  │                  │  │                  │  │.asimo.io   │ │
│  │   Main Web App   │  │  Admin Panel &   │  │            │ │
│  │   Chat Interface │  │  KB Editor       │  │ Technical  │ │
│  │   Real-time      │  │  User Mgmt       │  │ Docs Site  │ │
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
│     │  Static Files  │                                       │
│     │  (Markdown)    │                                       │
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

#### 3. assistdocs.asimo.io (Documentation)
**Primary Purpose:** Technical documentation and API reference

**Key Features:**
- Comprehensive technical documentation
- API reference documentation
- Integration guides
- Development tutorials
- Architecture diagrams
- Deployment guides

**Technology Stack:**
- Static Markdown files
- MkDocs or similar static site generator
- Syntax highlighting for code examples
- Search functionality
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
- Docs site (`assistdocs.asimo.io`) served as static markdown

**Environment Variables:**
```bash
VITE_API_URL=https://assist.asimo.io/api
VITE_WS_URL=wss://assist.asimo.io/api/realtime
VITE_ADMIN_URL=https://admin.asimo.io
VITE_DOCS_URL=https://assistdocs.asimo.io
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
