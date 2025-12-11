---
title: Technical Architecture
slug: client-implementation/technical-architecture
summary: "**Date:** 2025-11-21"
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - technical
  - architecture
category: planning
ai_summary: >-
  Version: 1.0 Date: 2025-11-21 Status: Draft - Awaiting Team Review --- 1.
  Architecture Overview 2. Monorepo Structure 3. Shared Packages 4. State
  Management 5. API Communication 6. Real-time Communication 7. Authentication &
  Authorization 8. Routing & Navigation 9. Performance Optimization 10. Se...
---

# VoiceAssist Client Applications - Technical Architecture

**Version:** 1.0
**Date:** 2025-11-21
**Status:** Draft - Awaiting Team Review

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Shared Packages](#shared-packages)
4. [State Management](#state-management)
5. [API Communication](#api-communication)
6. [Real-time Communication](#real-time-communication)
7. [Authentication & Authorization](#authentication--authorization)
8. [Routing & Navigation](#routing--navigation)
9. [Performance Optimization](#performance-optimization)
10. [Security Architecture](#security-architecture)
11. [Testing Architecture](#testing-architecture)
12. [Build & Deployment](#build--deployment)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Devices                          │
│  (Desktop, Tablet, Mobile - Chrome, Firefox, Safari, Edge)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CDN / Edge Cache                        │
│              (CloudFlare / AWS CloudFront)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Web App  │  │  Admin   │  │   Docs   │
        │  (SPA)   │  │  Panel   │  │   Site   │
        └──────────┘  └──────────┘  └──────────┘
                │             │             │
                └─────────────┼─────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │    Load Balancer /      │
                │    API Gateway          │
                └─────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   HTTP   │  │WebSocket │  │   Auth   │
        │ REST API │  │  Server  │  │  Service │
        └──────────┘  └──────────┘  └──────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │PostgreSQL│  │  Redis   │  │  Qdrant  │
        │ (pgvector)│  │  Cache   │  │  Vector  │
        └──────────┘  └──────────┘  └──────────┘
```

### Design Principles

1. **Monorepo First** - Single repository for all client applications
2. **Shared Core** - Maximum code reuse through shared packages
3. **Type Safety** - End-to-end TypeScript with strict mode
4. **Performance** - Code splitting, lazy loading, optimized bundles
5. **Accessibility** - WCAG 2.1 AA compliance across all apps
6. **Security** - Defense in depth, secure by default
7. **Testability** - High test coverage with automated testing
8. **Maintainability** - Clean code, clear patterns, good documentation

---

## 2. Monorepo Structure

### Directory Layout

```
VoiceAssist/
├── apps/
│   ├── web-app/                    # Main user-facing application
│   │   ├── public/                 # Static assets
│   │   ├── src/
│   │   │   ├── components/         # React components
│   │   │   ├── pages/              # Page components
│   │   │   ├── hooks/              # Custom hooks
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── utils/              # App-specific utilities
│   │   │   ├── types/              # App-specific types
│   │   │   ├── App.tsx             # Root component
│   │   │   └── main.tsx            # Entry point
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.js
│   │
│   ├── admin-panel/                # Admin/management application
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── utils/
│   │   │   ├── types/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.js
│   │
│   └── docs-site/                  # Documentation site
│       ├── app/                    # Next.js app directory
│       ├── content/                # MDX content
│       ├── components/
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.js
│       └── tailwind.config.js
│
├── packages/
│   ├── ui/                         # Shared UI component library
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button/
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Button.test.tsx
│   │   │   │   │   ├── Button.stories.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── Input/
│   │   │   │   ├── Card/
│   │   │   │   └── ...
│   │   │   ├── hooks/
│   │   │   │   ├── useMediaQuery.ts
│   │   │   │   ├── useDebounce.ts
│   │   │   │   └── ...
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── types/                      # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── chat.ts
│   │   │   │   ├── admin.ts
│   │   │   │   └── ...
│   │   │   ├── models/
│   │   │   │   ├── user.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── conversation.ts
│   │   │   │   └── ...
│   │   │   ├── events/
│   │   │   │   ├── websocket.ts
│   │   │   │   └── ...
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api-client/                 # Shared API client
│   │   ├── src/
│   │   │   ├── client.ts           # Axios instance
│   │   │   ├── auth.ts             # Auth endpoints
│   │   │   ├── chat.ts             # Chat endpoints
│   │   │   ├── admin.ts            # Admin endpoints
│   │   │   ├── websocket.ts        # WebSocket manager
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── utils/                      # Shared utilities
│   │   ├── src/
│   │   │   ├── formatting/
│   │   │   │   ├── date.ts
│   │   │   │   ├── currency.ts
│   │   │   │   ├── number.ts
│   │   │   │   └── ...
│   │   │   ├── validation/
│   │   │   │   ├── schemas.ts      # Zod schemas
│   │   │   │   └── ...
│   │   │   ├── constants/
│   │   │   │   ├── specialties.ts
│   │   │   │   ├── countries.ts
│   │   │   │   └── ...
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                     # Shared configurations
│       ├── eslint/
│       │   └── index.js
│       ├── typescript/
│       │   ├── base.json
│       │   ├── react.json
│       │   └── nextjs.json
│       └── tailwind/
│           └── base.js
│
├── server/                         # Backend (existing)
│
├── docs/                           # Project documentation
│   └── client-implementation/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-web-app.yml
│       ├── deploy-admin.yml
│       └── deploy-docs.yml
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

### Package Manager: pnpm with Workspaces

**Why pnpm?**

- Faster than npm/yarn (symlinked node_modules)
- Disk space efficient (global store)
- Strict dependency resolution
- Built-in monorepo support

**Configuration:**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// package.json (root)
{
  "name": "voiceassist-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^1.11.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### Build Orchestration: Turborepo

**Why Turborepo?**

- Intelligent task caching
- Parallel execution
- Remote caching support
- Dependency-aware scheduling

**Configuration:**

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env", "tsconfig.json"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## 3. Shared Packages

### 3.1 UI Component Library (@voiceassist/ui)

**Purpose:** Shared, reusable UI components across all applications

**Key Components:**

```tsx
// packages/ui/src/components/Button/Button.tsx

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600",
        secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:ring-gray-500",
        outline: "border border-gray-300 bg-transparent hover:bg-gray-100 focus-visible:ring-gray-500",
        ghost: "hover:bg-gray-100 hover:text-gray-900",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);

Button.displayName = "Button";
```

**Component Organization:**

Each component follows this structure:

```
Button/
├── Button.tsx           # Main component
├── Button.test.tsx      # Unit tests
├── Button.stories.tsx   # Storybook stories
├── types.ts             # TypeScript types
└── index.ts             # Exports
```

**Shared Hooks:**

```tsx
// packages/ui/src/hooks/useMediaQuery.ts

import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Set initial value
    setMatches(media.matches);

    // Listen for changes
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

// Usage example
const isMobile = useMediaQuery("(max-width: 768px)");
```

### 3.2 Types Package (@voiceassist/types)

**Purpose:** Shared TypeScript types for type-safe communication

```tsx
// packages/types/src/models/user.ts

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  specialty?: string;
  licenseNumber?: string;
  institution?: string;
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

// packages/types/src/models/message.ts

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  attachments?: Attachment[];
  metadata?: Record<string, any>;
  createdAt: string;
  streaming?: boolean;
}

export interface Citation {
  id: string;
  sourceType: "textbook" | "journal" | "guideline" | "uptodate" | "note" | "trial";
  title: string;
  subtitle?: string;
  authors?: string[];
  publicationYear?: number;
  recommendationClass?: "I" | "IIa" | "IIb" | "III";
  evidenceLevel?: "A" | "B" | "C";
  doi?: string;
  pmid?: string;
  url?: string;
  excerpt?: string;
  relevanceScore?: number;
}

// packages/types/src/events/websocket.ts

export type ClientEvent =
  | {
      type: "session.start";
      sessionId?: string;
      mode: string;
      clinicalContext?: any;
    }
  | {
      type: "message.send";
      sessionId: string;
      content: string;
      attachments?: string[];
    }
  | { type: "audio.chunk"; sessionId: string; data: ArrayBuffer }
  | { type: "generation.stop"; sessionId: string };

export type ServerEvent =
  | { type: "session.started"; sessionId: string }
  | {
      type: "message.delta";
      sessionId: string;
      messageId: string;
      role: string;
      contentDelta: string;
    }
  | { type: "message.complete"; sessionId: string; messageId: string }
  | {
      type: "citation.list";
      sessionId: string;
      messageId: string;
      citations: Citation[];
    }
  | { type: "audio.chunk"; sessionId: string; data: ArrayBuffer }
  | { type: "error"; code: string; message: string };
```

### 3.3 API Client Package (@voiceassist/api-client)

**Purpose:** Centralized API communication with type safety

```tsx
// packages/api-client/src/client.ts

import axios, { AxiosInstance, AxiosError } from "axios";
import { useAuth } from "@voiceassist/stores"; // Import from shared store

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const { tokens } = useAuth.getState();

    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - Handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // If 401 and not already retried, attempt token refresh
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        const { refreshToken } = useAuth.getState();

        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        // Refresh token
        await useAuth.getState().refreshToken();

        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuth.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// Error handler helper
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.response?.status === 404) {
      return "Resource not found";
    }

    if (error.response?.status === 500) {
      return "Server error. Please try again later.";
    }

    if (error.code === "ECONNABORTED") {
      return "Request timeout. Please try again.";
    }
  }

  return "An unexpected error occurred";
}
```

---

## 4. State Management

### Global State: Zustand

**Why Zustand?**

- Simple API, minimal boilerplate
- No providers needed
- TypeScript-friendly
- Small bundle size (~1kb)
- React hooks-based
- Built-in middleware (persist, devtools, immer)

### Auth Store Example

```tsx
// packages/stores/src/authStore.ts

import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { User, AuthTokens } from "@voiceassist/types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setUser: (user: User) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuth = create<AuthStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        // State
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,

        // Actions
        login: async (email, password) => {
          set({ isLoading: true });
          try {
            const response = await authApi.login({ email, password });
            set({
              user: response.user,
              tokens: response.tokens,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        logout: async () => {
          const { tokens } = get();
          if (tokens) {
            await authApi.logout(tokens.refreshToken);
          }
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
          });
        },

        refreshToken: async () => {
          const { tokens } = get();
          if (!tokens?.refreshToken) {
            throw new Error("No refresh token");
          }

          const response = await authApi.refresh(tokens.refreshToken);
          set({ tokens: response.tokens });
        },

        setUser: (user) => {
          set({ user });
        },
      })),
      {
        name: "voiceassist-auth",
        partialize: (state) => ({
          user: state.user,
          tokens: state.tokens,
          isAuthenticated: state.isAuthenticated,
        }),
      },
    ),
    { name: "AuthStore" },
  ),
);
```

### Chat Store Example

```tsx
// apps/web-app/src/stores/chatStore.ts

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { ChatMessage, Conversation } from "@voiceassist/types";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId -> messages
  isStreaming: boolean;
  isConnected: boolean;
}

interface ChatActions {
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (id: string) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setStreaming: (isStreaming: boolean) => void;
  setConnected: (isConnected: boolean) => void;
  clearMessages: (conversationId: string) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChat = create<ChatStore>()(
  devtools(
    immer((set) => ({
      // State
      conversations: [],
      currentConversationId: null,
      messages: {},
      isStreaming: false,
      isConnected: false,

      // Actions
      setConversations: (conversations) => {
        set({ conversations });
      },

      setCurrentConversation: (id) => {
        set({ currentConversationId: id });
      },

      addMessage: (conversationId, message) => {
        set((state) => {
          if (!state.messages[conversationId]) {
            state.messages[conversationId] = [];
          }
          state.messages[conversationId].push(message);
        });
      },

      updateMessage: (conversationId, messageId, updates) => {
        set((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return;

          const index = messages.findIndex((m) => m.id === messageId);
          if (index !== -1) {
            Object.assign(messages[index], updates);
          }
        });
      },

      setStreaming: (isStreaming) => {
        set({ isStreaming });
      },

      setConnected: (isConnected) => {
        set({ isConnected });
      },

      clearMessages: (conversationId) => {
        set((state) => {
          delete state.messages[conversationId];
        });
      },
    })),
    { name: "ChatStore" },
  ),
);
```

---

## 5. API Communication

### REST API Communication

**Base URL Configuration:**

```tsx
// Environment variables
VITE_API_URL=https://localhost:5173
VITE_WS_URL=wss://localhost:5173
```

**API Modules:**

```tsx
// packages/api-client/src/chat.ts

import { apiClient, handleApiError } from "./client";
import type { Conversation, ChatMessage } from "@voiceassist/types";

export const chatApi = {
  /**
   * Get all conversations for current user
   */
  getConversations: async (): Promise<Conversation[]> => {
    try {
      const response = await apiClient.get<Conversation[]>("/api/conversations");
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get specific conversation
   */
  getConversation: async (id: string): Promise<Conversation> => {
    const response = await apiClient.get<Conversation>(`/api/conversations/${id}`);
    return response.data;
  },

  /**
   * Get messages for a conversation
   */
  getMessages: async (conversationId: string): Promise<ChatMessage[]> => {
    const response = await apiClient.get<ChatMessage[]>(`/api/conversations/${conversationId}/messages`);
    return response.data;
  },

  /**
   * Delete conversation
   */
  deleteConversation: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/conversations/${id}`);
  },

  /**
   * Upload file
   */
  uploadFile: async (file: File): Promise<{ id: string; url: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<{ id: string; url: string }>("/api/files/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
        console.log(`Upload progress: ${percentCompleted}%`);
      },
    });

    return response.data;
  },
};
```

---

## 6. Real-time Communication

### WebSocket Manager

```tsx
// packages/api-client/src/websocket.ts

import type { ClientEvent, ServerEvent } from "@voiceassist/types";

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private pingInterval: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Set<(event: ServerEvent) => void>> = new Map();

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: ServerEvent = JSON.parse(event.data);
            this.emit(data.type, data);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.stopPing();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      console.warn("WebSocket not connected, cannot send:", event);
    }
  }

  on(eventType: string, handler: (event: ServerEvent) => void): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  private emit(eventType: string, event: ServerEvent): void {
    const handlers = this.eventHandlers.get(eventType);

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" } as any);
    }, 30000); // Ping every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

---

_Due to length, I'll create the remaining sections in focused documents. This Technical Architecture document continues with sections on Security, Testing, Build & Deployment, etc. Should I continue with the complete Technical Architecture, or move to other documents?_

---

## 13. Internationalization (i18n)

### i18n Foundation

**Current Implementation:**

- ✅ Locale configuration module: `packages/config/i18n.ts`
- ✅ Supported locales: English (default), Arabic, Spanish, French
- ✅ RTL support scaffolding for Arabic
- ✅ Locale metadata: date/time formats, text direction, support status

**Locale Configuration:**

```typescript
import { SupportedLocale, DEFAULT_LOCALE, detectBrowserLocale, getLocaleMetadata } from "@voiceassist/config/i18n";

// Detect user's locale
const userLocale = detectBrowserLocale(); // Falls back to 'en'

// Get locale metadata
const metadata = getLocaleMetadata(SupportedLocale.Arabic);
// { code: 'ar', direction: 'rtl', isRTL: true, ... }
```

**Implementation Roadmap:**

1. **Phase 1** (Current): Locale scaffolding and configuration
2. **Phase 2** (Planned): Integration with i18next or react-intl
3. **Phase 3** (Planned): Translation keys and message catalogs
4. **Phase 4** (Planned): Medical content localization (Arabic priority)
5. **Phase 5** (Planned): Dynamic locale switching and persistence

**Extension Points:**

- `packages/config/i18n.ts` - Core configuration
- Future: `packages/i18n/` - Translation library integration
- Future: `apps/*/locales/` - Translation files per application

See [WEB_APP_FEATURE_SPECS.md](WEB_APP_FEATURE_SPECS.md) for detailed i18n requirements.

---

**Current Status:**

- ✅ MASTER_IMPLEMENTATION_PLAN.md (20,000+ words)
- ⏳ WEB_APP_FEATURE_SPECS.md (Started - 3 features detailed)
- ⏳ TECHNICAL_ARCHITECTURE.md (In progress - Core sections complete)
- ✅ i18n foundation added (2025-11-22)

Next up:

- Complete Technical Architecture
- Create Admin Panel specs
- Create Integration Guide
- Create Development Workflow
- Update existing README files
