---
title: Frontend Architecture
slug: architecture/frontend
summary: >-
  Client applications architecture - pnpm monorepo with React, TypeScript, and
  shared packages.
status: stable
stability: production
owner: frontend
lastUpdated: "2025-12-03"
audience:
  - human
  - agent
  - ai-agents
  - frontend
tags:
  - architecture
  - frontend
  - react
  - typescript
  - monorepo
relatedServices:
  - web-app
  - admin-panel
  - docs-site
category: architecture
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/App.tsx"
  - "apps/web-app/src/components/Layout.tsx"
  - "apps/admin-panel/src/App.tsx"
  - "packages/types/src/index.ts"
  - "packages/ui/src/index.ts"
source_of_truth: true
version: 1.1.0
ai_summary: >-
  Last Updated: 2025-12-03 Status: Production Ready (Phases 0-3.5 Complete, Web
  App and Admin Panel stable) Detailed Spec:
  client-implementation/TECHNICAL_ARCHITECTURE.md --- VoiceAssist uses a pnpm
  monorepo with Turborepo for build orchestration. All frontend applications
  share common packages for...
---

# VoiceAssist Frontend Architecture

**Last Updated**: 2025-12-03
**Status**: Production Ready (Phases 0-3.5 Complete, Web App and Admin Panel stable)
**Detailed Spec**: [client-implementation/TECHNICAL_ARCHITECTURE.md](client-implementation/TECHNICAL_ARCHITECTURE.md)

---

## Overview

VoiceAssist uses a **pnpm monorepo with Turborepo** for build orchestration. All frontend applications share common packages for consistency, type safety, and code reuse.

### Quick Facts

| Aspect            | Technology                     |
| ----------------- | ------------------------------ |
| Package Manager   | pnpm 8+                        |
| Build System      | Turborepo                      |
| UI Framework      | React 18+                      |
| Language          | TypeScript (strict mode)       |
| Bundler           | Vite (apps), Rollup (packages) |
| State Management  | Zustand                        |
| Styling           | Tailwind CSS                   |
| Component Library | shadcn/ui + custom             |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         apps/                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   web-app    │  │ admin-panel  │  │    docs-site     │  │
│  │   (Vite)     │  │   (Vite)     │  │   (Next.js 14)   │  │
│  │              │  │              │  │                  │  │
│  │ User-facing  │  │ Admin ops    │  │ Documentation    │  │
│  │ medical AI   │  │ dashboard    │  │ & guides         │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    packages/                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │   │
│  │  │   ui     │ │  types   │ │  utils   │ │  api-  │ │   │
│  │  │          │ │          │ │          │ │ client │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │  config  │ │telemetry │ │ design-  │           │   │
│  │  │          │ │          │ │ tokens   │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│                  services/api-gateway/                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Applications

### 1. Web App (`apps/web-app/`)

Main user-facing medical AI assistant application.

**Features:**

- **Unified Chat/Voice Interface** (NEW) - Seamless text and voice mode in single view
- Medical knowledge retrieval with citations
- Document upload and management
- Conversation history with branching
- PHI-safe data handling

**Key Components:**

| Component              | Path                           | Purpose                                             |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| UnifiedChatContainer   | `src/components/unified-chat/` | Three-panel layout with sidebar, main, context pane |
| CollapsibleSidebar     | `src/components/unified-chat/` | Conversation list with pinning and search           |
| UnifiedInputArea       | `src/components/unified-chat/` | Text/voice mode toggle                              |
| CollapsibleContextPane | `src/components/unified-chat/` | Citations, clinical context, branches               |

**Entry Point:** `src/main.tsx`
**Dev Port:** 5173
**Documentation:** See [UNIFIED_CHAT_VOICE_UI.md](./UNIFIED_CHAT_VOICE_UI.md)

### 2. Admin Panel (`apps/admin-panel/`)

System administration and monitoring dashboard.

**Features:**

- Real-time system metrics
- User management (RBAC)
- Knowledge base administration
- Feature flag management
- Audit log viewer

**Entry Point:** `src/main.tsx`
**Dev Port:** 5174

### 3. Docs Site (`apps/docs-site/`)

Documentation website built with Next.js 14.

**Features:**

- Markdown documentation rendering
- Navigation from `navigation.ts` config
- Support for docs from multiple locations (`@root/` prefix)
- Search functionality (planned)

**Entry Point:** `src/app/layout.tsx`
**Dev Port:** 3000

---

## Shared Packages

| Package                      | Purpose                     | Key Exports                               |
| ---------------------------- | --------------------------- | ----------------------------------------- |
| `@voiceassist/ui`            | React component library     | Button, Input, Card, ChatMessage, etc.    |
| `@voiceassist/types`         | TypeScript type definitions | API types, User, Session, Message, etc.   |
| `@voiceassist/utils`         | Utility functions           | PHI detection, formatters, validators     |
| `@voiceassist/api-client`    | HTTP client                 | Type-safe API calls, auto token injection |
| `@voiceassist/config`        | Shared configurations       | ESLint, Prettier, Tailwind presets        |
| `@voiceassist/telemetry`     | Observability               | Error tracking, analytics helpers         |
| `@voiceassist/design-tokens` | Design system               | Colors, typography, spacing tokens        |

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all apps in dev mode
pnpm dev

# Start specific app
pnpm --filter web-app dev
pnpm --filter admin-panel dev
pnpm --filter docs-site dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm type-check

# Lint
pnpm lint

# Storybook (component library)
pnpm storybook
```

---

## State Management

**Zustand** is used for client-side state management.

```typescript
// Store structure pattern
interface AppStore {
  // Auth state
  user: User | null;
  token: string | null;

  // UI state
  sidebarOpen: boolean;
  theme: "light" | "dark";

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}
```

---

## API Communication

### REST API

Use `@voiceassist/api-client` for all backend calls:

```typescript
import { apiClient } from "@voiceassist/api-client";

// Typed API call with auto-token injection
const sessions = await apiClient.conversations.list();
const session = await apiClient.conversations.create({ title: "New Chat" });
```

### WebSocket

Real-time communication for streaming responses:

```typescript
import { useWebSocket } from "@/hooks/useWebSocket";

const { connect, send, messages } = useWebSocket("/ws");

// Send message
send({ type: "chat", content: "Hello" });

// Receive streaming response
messages.forEach((msg) => {
  if (msg.type === "assistant_chunk") {
    appendToResponse(msg.content);
  }
});
```

---

## Key Design Patterns

### 1. Feature-based Organization

```
src/
├── features/
│   ├── chat/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── index.ts
│   ├── auth/
│   └── admin/
```

### 2. Type-safe API Layer

All API calls are typed end-to-end using shared types from `@voiceassist/types`.

### 3. PHI Protection

Client-side PHI detection using `@voiceassist/utils`:

```typescript
import { detectPHI, redactPHI } from "@voiceassist/utils";

if (detectPHI(userInput)) {
  // Warn user or apply redaction
  const safe = redactPHI(userInput);
}
```

---

## Related Documentation

- **Detailed Architecture:** [client-implementation/TECHNICAL_ARCHITECTURE.md](client-implementation/TECHNICAL_ARCHITECTURE.md)
- **Development Roadmap:** [client-implementation/CLIENT_DEV_ROADMAP.md](client-implementation/CLIENT_DEV_ROADMAP.md)
- **Web App Specs:** [WEB_APP_SPECS.md](WEB_APP_SPECS.md)
- **Admin Panel Specs:** [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md)
- **Component Library:** Run `pnpm storybook` to view

---

## Version History

| Version | Date       | Changes                                             |
| ------- | ---------- | --------------------------------------------------- |
| 1.1.0   | 2025-12-03 | Updated status to Production Ready (Phase 3.5 done) |
| 1.0.0   | 2025-11-27 | Initial architecture document                       |
