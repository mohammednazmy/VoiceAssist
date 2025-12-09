---
title: Error Handling Patterns
slug: error-handling
summary: How errors flow through VoiceAssist and how to handle them properly.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - errors
  - exceptions
  - patterns
category: development
component: "backend/error-handling"
ai_summary: >-
  Error handling patterns for VoiceAssist. Covers API errors, frontend handling,
  logging, and user-facing messages. Follow these patterns for consistency.
---

# Error Handling Patterns

> **Last Updated**: 2025-12-08

How errors flow through VoiceAssist and how to handle them consistently.

---

## Error Flow Overview

```
Client Request
    │
    ▼
┌─────────────────────────────────────────┐
│  API Gateway (FastAPI)                  │
│  ├─ Request Validation (Pydantic)       │ → 422 Validation Error
│  ├─ Authentication                      │ → 401 Unauthorized
│  ├─ Authorization                       │ → 403 Forbidden
│  └─ Business Logic                      │ → 400/404/500
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Standard API Response                  │
│  {                                      │
│    "success": false,                    │
│    "error": { "code": "...", ... },     │
│    "data": null                         │
│  }                                      │
└─────────────────────────────────────────┘
    │
    ▼
Frontend Error Handler → User Notification
```

---

## Backend Error Handling

### Standard API Response Envelope

All API responses use a consistent envelope:

```python
# app/schemas/api_envelope.py

from pydantic import BaseModel
from typing import TypeVar, Generic, Optional

T = TypeVar("T")

class APIError(BaseModel):
    code: str           # Machine-readable code
    message: str        # Human-readable message
    details: dict = {}  # Additional context

class APIEnvelope(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[APIError] = None
```

### Custom Exceptions

Define exceptions for business logic errors:

```python
# app/core/exceptions.py

class VoiceAssistError(Exception):
    """Base exception for all VoiceAssist errors."""
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)

class NotFoundError(VoiceAssistError):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            code="NOT_FOUND",
            message=f"{resource} not found: {resource_id}",
            status_code=404
        )

class ValidationError(VoiceAssistError):
    def __init__(self, message: str, details: dict = None):
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=422
        )
        self.details = details or {}

class AuthenticationError(VoiceAssistError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            code="AUTHENTICATION_ERROR",
            message=message,
            status_code=401
        )

class AuthorizationError(VoiceAssistError):
    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            code="AUTHORIZATION_ERROR",
            message=message,
            status_code=403
        )
```

### Exception Handler

Register a global exception handler:

```python
# app/core/middleware.py

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(VoiceAssistError)
async def voiceassist_error_handler(request: Request, exc: VoiceAssistError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": getattr(exc, "details", {}),
            },
        },
    )

@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    # Log the full exception
    logger.exception("Unhandled exception")

    # Return generic error to client (don't leak internals)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            },
        },
    )
```

### Using in Routes

```python
# app/api/documents.py

@router.get("/{document_id}", response_model=APIEnvelope[Document])
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    document = await DocumentService(db).get_by_id(document_id)
    if not document:
        raise NotFoundError("Document", document_id)

    return APIEnvelope(success=True, data=document)
```

---

## Frontend Error Handling

### API Client Error Handling

```typescript
// lib/api/client.ts

export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const json = await response.json();

  if (!json.success) {
    throw new APIError(json.error.code, json.error.message, response.status, json.error.details);
  }

  return json.data;
}
```

### React Query Error Handling

```typescript
// hooks/useDocuments.ts

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => fetchAPI<Document[]>('/documents'),
    // React Query will set error state automatically
  });
}

// In component
function DocumentList() {
  const { data, error, isLoading } = useDocuments();

  if (error instanceof APIError) {
    return <ErrorDisplay code={error.code} message={error.message} />;
  }

  // ...
}
```

### Toast Notifications

```typescript
// lib/api/error-handler.ts

import { toast } from "sonner";

export function handleAPIError(error: unknown) {
  if (error instanceof APIError) {
    switch (error.code) {
      case "AUTHENTICATION_ERROR":
        toast.error("Please log in again");
        // Redirect to login
        break;
      case "AUTHORIZATION_ERROR":
        toast.error("You don't have permission for this action");
        break;
      case "NOT_FOUND":
        toast.error(error.message);
        break;
      case "VALIDATION_ERROR":
        toast.error("Please check your input");
        break;
      default:
        toast.error("Something went wrong");
    }
  } else {
    toast.error("Network error. Please try again.");
  }
}
```

---

## Error Codes Reference

| Code                   | Status | Description                             |
| ---------------------- | ------ | --------------------------------------- |
| `AUTHENTICATION_ERROR` | 401    | Invalid or expired credentials          |
| `AUTHORIZATION_ERROR`  | 403    | Valid auth but insufficient permissions |
| `NOT_FOUND`            | 404    | Resource doesn't exist                  |
| `VALIDATION_ERROR`     | 422    | Request body validation failed          |
| `RATE_LIMIT_EXCEEDED`  | 429    | Too many requests                       |
| `INTERNAL_ERROR`       | 500    | Server-side error                       |
| `SERVICE_UNAVAILABLE`  | 503    | External service down                   |

---

## Logging Errors

### Backend Logging

```python
import structlog

logger = structlog.get_logger()

# Good: Structured logging with context
logger.error(
    "document_retrieval_failed",
    document_id=document_id,
    user_id=current_user.id,
    error=str(exc),
)

# Bad: Unstructured logging
logger.error(f"Failed to get document {document_id}: {exc}")
```

### What to Log

| Severity | When to Use            | Example                     |
| -------- | ---------------------- | --------------------------- |
| ERROR    | Unrecoverable failures | Database connection failed  |
| WARNING  | Recoverable issues     | Cache miss, retry succeeded |
| INFO     | Normal operations      | User logged in              |
| DEBUG    | Development details    | Query executed in 50ms      |

### What NOT to Log

- PHI (Protected Health Information)
- Passwords or secrets
- Full stack traces to clients (only to logs)

---

## Related Documents

- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - Audit logging for PHI
- [OBSERVABILITY.md](OBSERVABILITY.md) - Monitoring and alerting
- [api-reference/rest-api.md](api-reference/rest-api.md) - API error responses
