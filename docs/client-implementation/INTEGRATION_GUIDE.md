---
title: Integration Guide
slug: client-implementation/integration-guide
summary: "**Date:** 2025-11-21"
status: stable
stability: production
owner: frontend
lastUpdated: "2025-12-08"
audience:
  - frontend
  - ai-agents
tags:
  - integration
  - guide
category: planning
ai_summary: >-
  Version: 1.0 Date: 2025-11-21 Status: Draft - Awaiting Team Review --- This
  guide provides step-by-step instructions for integrating the VoiceAssist
  client applications with the existing backend infrastructure. Backend Status:
  ✅ Complete (15/15 phases, HIPAA-compliant, production-ready) Backend L...
---

# VoiceAssist - Frontend-Backend Integration Guide

**Version:** 1.0
**Date:** 2025-11-21
**Status:** Draft - Awaiting Team Review

---

## 📋 Overview

This guide provides step-by-step instructions for integrating the VoiceAssist client applications with the existing backend infrastructure.

**Backend Status:** ✅ Complete (15/15 phases, HIPAA-compliant, production-ready)
**Backend Location:** `services/api-gateway/` (canonical backend)
**Backend Tech:** FastAPI, PostgreSQL (pgvector), Redis, Qdrant
**Backend Port:** 8000

---

## 🔗 Table of Contents

1. [Backend API Overview](#backend-api-overview)
2. [Authentication Integration](#authentication-integration)
3. [Chat/Realtime Integration](#chatrealtime-integration)
4. [Admin API Integration](#admin-api-integration)
5. [File Upload Integration](#file-upload-integration)
6. [WebSocket Integration](#websocket-integration)
7. [Environment Configuration](#environment-configuration)
8. [CORS Configuration](#cors-configuration)
9. [Testing Integration](#testing-integration)
10. [Troubleshooting](#troubleshooting)

---

## 1. Backend API Overview

### Available Endpoints

Based on the existing backend (`services/api-gateway/` directory), the following APIs are available:

#### Authentication API (`/api/auth/*`)

```
POST   /api/auth/register         - Register new user
POST   /api/auth/login            - Login with credentials
POST   /api/auth/refresh          - Refresh access token
POST   /api/auth/logout           - Logout and revoke tokens
GET    /api/auth/me               - Get current user
POST   /api/auth/forgot-password  - Request password reset
POST   /api/auth/reset-password   - Reset password with token
```

#### User Management API (`/api/users/*`)

```
GET    /api/users/:id             - Get user by ID
PATCH  /api/users/:id             - Update user
DELETE /api/users/:id             - Delete user (admin)
GET    /api/users                 - List users (admin)
```

#### Real-time Communication API (`/api/realtime/*`)

```
WS     /api/realtime/ws           - WebSocket endpoint for chat
```

#### Knowledge Base Admin API (`/api/admin/kb/*`)

```
GET    /api/admin/kb/documents    - List KB documents
POST   /api/admin/kb/upload       - Upload document
DELETE /api/admin/kb/:id          - Delete document
POST   /api/admin/kb/reindex      - Trigger reindexing
GET    /api/admin/kb/jobs         - Get indexing jobs
GET    /api/admin/kb/stats        - Get vector DB stats
```

#### Integration APIs (`/api/integrations/*`)

```
GET    /api/integrations/calendar/events     - List calendar events
POST   /api/integrations/calendar/events     - Create event
GET    /api/integrations/files/discover      - Discover Nextcloud files
POST   /api/integrations/files/index         - Index files to KB
```

#### Admin Panel API (`/api/admin/*`)

```
GET    /api/admin/panel/summary    - Dashboard summary
GET    /api/admin/system/resources - System resources
GET    /api/admin/services/status  - Service status
```

### Backend Directory Structure

```
services/api-gateway/
├── app/
│   ├── api/                        # API routers
│   │   ├── auth.py                 # Auth endpoints
│   │   ├── users.py                # User endpoints
│   │   ├── admin_kb.py             # KB admin endpoints
│   │   ├── admin_panel.py          # Admin dashboard
│   │   ├── voice.py                # Voice endpoints
│   │   └── ...
│   ├── core/
│   │   ├── security.py             # JWT, password hashing
│   │   ├── config.py               # Settings
│   │   └── ...
│   ├── models/
│   │   ├── user.py                 # User model
│   │   ├── session.py              # Session model
│   │   └── ...
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── thinker_service.py      # AI reasoning (voice)
│   │   ├── talker_service.py       # TTS service (voice)
│   │   ├── voice_pipeline_service.py # Voice orchestration
│   │   ├── query_orchestrator.py   # AI query processing
│   │   ├── search_aggregator.py    # Vector search
│   │   ├── kb_indexer.py           # Document indexing
│   │   └── ...
├── alembic/                        # Database migrations
├── tests/
├── requirements.txt
└── Dockerfile
```

---

## 2. Authentication Integration

### Step 1: Understand Backend Auth Flow

The backend uses **JWT-based authentication** with access and refresh tokens:

**Backend Implementation:**

- Location: `services/api-gateway/app/core/security.py`
- Access Token: 15 minutes expiry
- Refresh Token: 7 days expiry
- Token Storage: Sent in response, stored client-side

**Token Structure:**

```python
# Backend (services/api-gateway/app/core/security.py)

def create_access_token(user_id: str) -> str:
    """Create JWT access token"""
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(minutes=15)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def create_refresh_token(user_id: str) -> str:
    """Create JWT refresh token"""
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

### Step 2: Frontend Auth API Client

**Map to existing backend endpoints:**

```tsx
// packages/api-client/src/auth.ts

import { apiClient } from "./client";
import type { User, AuthTokens } from "@voiceassist/types";

// Backend response types (match services/api-gateway/app/api/auth.py)
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface LoginResponse {
  user: User;
  access_token: string; // Backend uses snake_case
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export const authApi = {
  /**
   * Login - POST /api/auth/login
   * Backend: services/api-gateway/app/api/auth.py::login()
   */
  login: async (data: LoginRequest): Promise<{ user: User; tokens: AuthTokens }> => {
    const response = await apiClient.post<LoginResponse>("/api/auth/login", {
      email: data.email,
      password: data.password,
    });

    // Transform backend response to frontend format
    return {
      user: response.data.user,
      tokens: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type as "Bearer",
        expiresIn: response.data.expires_in,
      },
    };
  },

  /**
   * Register - POST /api/auth/register
   * Backend: services/api-gateway/app/api/auth.py::register()
   */
  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    specialty?: string;
  }): Promise<{ user: User; tokens: AuthTokens }> => {
    const response = await apiClient.post<LoginResponse>("/api/auth/register", {
      email: data.email,
      password: data.password,
      first_name: data.firstName, // Backend expects snake_case
      last_name: data.lastName,
      specialty: data.specialty,
    });

    return {
      user: response.data.user,
      tokens: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type as "Bearer",
        expiresIn: response.data.expires_in,
      },
    };
  },

  /**
   * Refresh token - POST /api/auth/refresh
   * Backend: services/api-gateway/app/api/auth.py::refresh()
   */
  refresh: async (refreshToken: string): Promise<{ tokens: AuthTokens }> => {
    const response = await apiClient.post<LoginResponse>("/api/auth/refresh", {
      refresh_token: refreshToken,
    });

    return {
      tokens: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type as "Bearer",
        expiresIn: response.data.expires_in,
      },
    };
  },

  /**
   * Logout - POST /api/auth/logout
   * Backend: services/api-gateway/app/api/auth.py::logout()
   */
  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post("/api/auth/logout", {
      refresh_token: refreshToken,
    });
  },

  /**
   * Get current user - GET /api/auth/me
   * Backend: services/api-gateway/app/api/auth.py::get_current_user()
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>("/api/auth/me");
    return response.data;
  },
};
```

### Step 3: Axios Request Interceptor

**Add Bearer token to all requests:**

```tsx
// packages/api-client/src/client.ts

import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage or Zustand store
    const tokens = JSON.parse(localStorage.getItem("voiceassist-auth") || "{}");

    if (tokens?.state?.tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.state.tokens.accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - Handle 401 and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, attempt refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const tokens = JSON.parse(localStorage.getItem("voiceassist-auth") || "{}");
        const refreshToken = tokens?.state?.tokens?.refreshToken;

        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        // Call refresh endpoint
        const response = await authApi.refresh(refreshToken);

        // Update stored tokens
        const updatedAuth = {
          ...tokens,
          state: {
            ...tokens.state,
            tokens: response.tokens,
          },
        };
        localStorage.setItem("voiceassist-auth", JSON.stringify(updatedAuth));

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${response.tokens.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem("voiceassist-auth");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
```

### Step 4: Protected Route Implementation

```tsx
// apps/web-app/src/components/auth/ProtectedRoute.tsx

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check admin requirement
  if (requireAdmin && user?.role !== "admin") {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
```

---

## 3. Chat/Realtime Integration

### Step 1: Understand Backend WebSocket Protocol

**Backend WebSocket Handler:** `services/api-gateway/app/websockets/realtime.py`

**Connection:**

```
WS ws://localhost:8000/api/realtime/ws
```

**Message Protocol:**

```python
# Backend (services/api-gateway/app/websockets/realtime.py)

# Client sends:
{
  "type": "session.start",
  "session_id": "optional-uuid",
  "mode": "quick_consult",  # or "case_workspace"
  "clinical_context": {...}  # optional
}

# Server responds:
{
  "type": "session.started",
  "session_id": "uuid"
}

# Client sends message:
{
  "type": "message.send",
  "session_id": "uuid",
  "content": "What is diabetes?"
}

# Server streams response:
{
  "type": "message.delta",
  "session_id": "uuid",
  "message_id": "msg-uuid",
  "role": "assistant",
  "content_delta": "Diabetes is..."
}

# Server completes message:
{
  "type": "message.complete",
  "session_id": "uuid",
  "message_id": "msg-uuid"
}

# Server sends citations:
{
  "type": "citation.list",
  "session_id": "uuid",
  "message_id": "msg-uuid",
  "citations": [...]
}
```

### Step 2: Frontend WebSocket Hook

```tsx
// apps/web-app/src/hooks/useChat.ts

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./useAuth";
import type { ChatMessage, ServerEvent, ClientEvent } from "@voiceassist/types";

interface UseChatOptions {
  sessionId?: string;
  mode: "quick_consult" | "case_workspace";
  clinicalContext?: any;
}

export function useChat(options: UseChatOptions) {
  const { sessionId: initialSessionId, mode, clinicalContext } = options;
  const { tokens } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageRef = useRef<ChatMessage | null>(null);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!tokens?.accessToken) {
      console.error("No auth token available");
      return;
    }

    const wsUrl = `${import.meta.env.VITE_WS_URL}/api/realtime/ws`;

    // Add auth token as query parameter (backend expects this)
    const urlWithAuth = `${wsUrl}?token=${tokens.accessToken}`;

    wsRef.current = new WebSocket(urlWithAuth);

    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);

      // Start session
      send({
        type: "session.start",
        session_id: sessionId || undefined,
        mode,
        clinical_context: clinicalContext,
      });
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        handleServerEvent(data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket closed");
      setIsConnected(false);
      setIsStreaming(false);
    };
  }, [tokens, sessionId, mode, clinicalContext]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send message to server
  const send = useCallback((event: ClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Handle server events
  const handleServerEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "session.started":
        setSessionId(event.session_id);
        break;

      case "message.delta":
        setIsStreaming(true);

        // Create new message or update existing
        if (!currentMessageRef.current || currentMessageRef.current.id !== event.message_id) {
          const newMessage: ChatMessage = {
            id: event.message_id,
            sessionId: event.session_id,
            role: event.role as "assistant",
            content: event.content_delta,
            createdAt: new Date().toISOString(),
            streaming: true,
          };
          currentMessageRef.current = newMessage;
          setMessages((prev) => [...prev, newMessage]);
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === event.message_id ? { ...msg, content: msg.content + event.content_delta } : msg,
            ),
          );
        }
        break;

      case "message.complete":
        setIsStreaming(false);
        setMessages((prev) => prev.map((msg) => (msg.id === event.message_id ? { ...msg, streaming: false } : msg)));
        currentMessageRef.current = null;
        break;

      case "citation.list":
        setMessages((prev) =>
          prev.map((msg) => (msg.id === event.message_id ? { ...msg, citations: event.citations } : msg)),
        );
        break;

      case "error":
        console.error("Server error:", event.message);
        setIsStreaming(false);
        break;
    }
  }, []);

  // Send user message
  const sendMessage = useCallback(
    (content: string, attachments?: string[]) => {
      if (!sessionId) {
        console.error("No active session");
        return;
      }

      // Add user message to UI
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content,
        attachments: attachments?.map((id) => ({ id, type: "file", url: "", name: "" })),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Send to server
      send({
        type: "message.send",
        session_id: sessionId,
        content,
        attachments,
      });
    },
    [sessionId, send],
  );

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    sessionId,
    messages,
    isConnected,
    isStreaming,
    sendMessage,
    connect,
    disconnect,
  };
}
```

---

## 4. Admin API Integration

### Admin KB Management

**Backend:** `services/api-gateway/app/api/admin_kb.py`

```tsx
// packages/api-client/src/admin.ts

import { apiClient } from "./client";
import type { KBDocument, IndexingJob } from "@voiceassist/types";

export const adminKbApi = {
  /**
   * List KB documents - GET /api/admin/kb/documents
   * Backend: services/api-gateway/app/api/admin_kb.py::list_documents()
   */
  listDocuments: async (params?: {
    skip?: number;
    limit?: number;
    status?: string;
    source_type?: string;
  }): Promise<KBDocument[]> => {
    const response = await apiClient.get<KBDocument[]>("/api/admin/kb/documents", {
      params,
    });
    return response.data;
  },

  /**
   * Upload document - POST /api/admin/kb/upload
   * Backend: services/api-gateway/app/api/admin_kb.py::upload_document()
   */
  uploadDocument: async (
    file: File,
    metadata: {
      source_type: string;
      specialty: string;
      title?: string;
    },
  ): Promise<{ document_id: string; filename: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_type", metadata.source_type);
    formData.append("specialty", metadata.specialty);

    if (metadata.title) {
      formData.append("title", metadata.title);
    }

    const response = await apiClient.post("/api/admin/kb/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  },

  /**
   * Delete document - DELETE /api/admin/kb/:id
   * Backend: services/api-gateway/app/api/admin_kb.py::delete_document()
   */
  deleteDocument: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/api/admin/kb/${documentId}`);
  },

  /**
   * Trigger reindexing - POST /api/admin/kb/reindex
   * Backend: services/api-gateway/app/api/admin_kb.py::trigger_reindex()
   */
  triggerReindex: async (documentIds: string[]): Promise<{ job_id: string }> => {
    const response = await apiClient.post("/api/admin/kb/reindex", {
      document_ids: documentIds,
    });
    return response.data;
  },

  /**
   * Get indexing jobs - GET /api/admin/kb/jobs
   * Backend: services/api-gateway/app/api/admin_kb.py::get_indexing_jobs()
   */
  getIndexingJobs: async (limit?: number): Promise<IndexingJob[]> => {
    const response = await apiClient.get<IndexingJob[]>("/api/admin/kb/jobs", {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get vector DB stats - GET /api/admin/kb/stats
   * Backend: services/api-gateway/app/api/admin_kb.py::get_vector_stats()
   */
  getVectorStats: async (): Promise<{
    total_documents: number;
    total_chunks: number;
    vector_count: number;
  }> => {
    const response = await apiClient.get("/api/admin/kb/stats");
    return response.data;
  },
};
```

---

## 5. File Upload Integration

### Backend File Upload

**Backend:** `services/api-gateway/app/api/files.py`

```tsx
// apps/web-app/src/hooks/useFileUpload.ts

import { useState } from "react";
import { apiClient } from "@voiceassist/api-client";

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File): Promise<{ id: string; url: string }> => {
    setIsUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post<{ id: string; url: string }>("/api/files/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(percentCompleted);
        },
      });

      return response.data;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    isUploading,
    progress,
  };
}
```

---

## 6. WebSocket Integration

### Backend WebSocket Authentication

The backend expects authentication via query parameter:

```tsx
// Connect with auth token
const ws = new WebSocket(`${WS_URL}/api/realtime/ws?token=${accessToken}`);
```

**Backend Implementation:** `services/api-gateway/app/websockets/realtime.py`

```python
# Backend extracts token from query params
@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),  # Required query parameter
    db: Session = Depends(get_db)
):
    # Verify JWT token
    user = await verify_token(token)

    # Accept connection
    await websocket.accept()

    # Handle messages...
```

---

## 7. Environment Configuration

### Frontend Environment Variables

Create `.env.local` files in each app:

```bash
# apps/web-app/.env.local

# API URLs
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Environment
VITE_ENV=development

# Features
VITE_ENABLE_VOICE=true
VITE_ENABLE_FILE_UPLOAD=true

# Analytics (optional)
VITE_ANALYTICS_ID=
```

```bash
# apps/admin-panel/.env.local

# API URLs
VITE_ADMIN_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000

# Environment
VITE_ENV=development
```

### Backend Configuration

Ensure backend CORS allows frontend origins:

```python
# services/api-gateway/app/main.py

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Web app (Vite default)
        "http://localhost:5174",  # Admin panel
        "http://localhost:3000",  # Docs site (Next.js)
        "https://voiceassist.asimo.io",  # Production web app
        "https://admin.asimo.io",         # Production admin
        "https://docs-voice.asimo.io",    # Production docs
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. CORS Configuration

### Development CORS

**Backend:** Update `services/api-gateway/app/core/config.py`

```python
class Settings(BaseSettings):
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]
```

### Production CORS

Add production URLs to allowed origins:

```python
CORS_ORIGINS: list[str] = [
    "https://voiceassist.asimo.io",
    "https://admin.asimo.io",
    "https://docs-voice.asimo.io",
]
```

---

## 9. Testing Integration

### Integration Test Example

```tsx
// apps/web-app/src/__tests__/integration/auth.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { authApi } from "@voiceassist/api-client";

describe("Auth Integration", () => {
  let testUser: { email: string; password: string };

  beforeAll(() => {
    testUser = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPass123!",
    };
  });

  it("should register new user", async () => {
    const response = await authApi.register({
      email: testUser.email,
      password: testUser.password,
      firstName: "Test",
      lastName: "User",
    });

    expect(response.user).toBeDefined();
    expect(response.user.email).toBe(testUser.email);
    expect(response.tokens).toBeDefined();
    expect(response.tokens.accessToken).toBeTruthy();
  });

  it("should login with credentials", async () => {
    const response = await authApi.login(testUser);

    expect(response.user).toBeDefined();
    expect(response.tokens).toBeDefined();
  });

  it("should get current user with token", async () => {
    // Login first
    const loginResponse = await authApi.login(testUser);

    // Set token for next request
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${loginResponse.tokens.accessToken}`;

    const user = await authApi.getCurrentUser();

    expect(user.email).toBe(testUser.email);
  });
});
```

---

## 10. Troubleshooting

### Common Issues

#### Issue: 401 Unauthorized

**Cause:** Missing or invalid auth token

**Solution:**

```tsx
// Check if token is being sent
console.log("Auth header:", apiClient.defaults.headers.common["Authorization"]);

// Verify token is valid
const tokens = JSON.parse(localStorage.getItem("voiceassist-auth") || "{}");
console.log("Stored tokens:", tokens);
```

#### Issue: CORS Error

**Cause:** Frontend origin not in backend allowed origins

**Solution:**

```python
# services/api-gateway/app/main.py
# Add your frontend URL to allow_origins
allow_origins=[
    "http://localhost:5173",  # Add this
]
```

#### Issue: WebSocket Connection Failed

**Cause:** Missing auth token or wrong URL

**Solution:**

```tsx
// Ensure token is in URL
const ws = new WebSocket(`${WS_URL}/api/realtime/ws?token=${accessToken}`);

// Check WebSocket URL format
console.log("WebSocket URL:", `${WS_URL}/api/realtime/ws?token=${accessToken}`);
```

#### Issue: File Upload Fails

**Cause:** Backend file size limit or missing Content-Type

**Solution:**

```python
# services/api-gateway/app/main.py
# Increase max file size
app.add_middleware(
    ...
    max_content_length=100 * 1024 * 1024,  # 100MB
)
```

---

## Next Steps

1. **Run Backend:** `cd server && python main.py`
2. **Run Web App:** `cd apps/web-app && pnpm dev`
3. **Test Authentication:** Try login/register
4. **Test Chat:** Connect WebSocket and send message
5. **Test Admin API:** Upload document to KB

---

_This integration guide provides the complete mapping between frontend and existing backend. All endpoints, protocols, and data formats are documented._
