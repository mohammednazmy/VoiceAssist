---
title: Extension Guide
slug: extension-guide
summary: >-
  Practical patterns for extending VoiceAssist: adding endpoints, services,
  integrations, and frontend components.
status: stable
stability: production
owner: mixed
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
  - backend
  - frontend
tags:
  - development
  - patterns
  - extension
  - how-to
category: development
component: "platform/development"
relatedPaths:
  - "services/api-gateway/app/api/"
  - "services/api-gateway/app/services/"
  - "apps/web-app/src/components/"
  - "apps/web-app/src/hooks/"
---

# VoiceAssist Extension Guide

This guide provides practical patterns for extending VoiceAssist. Each section includes file locations, code patterns, and step-by-step instructions.

---

## Quick Reference

| Task                   | Location                                            | Key Files          |
| ---------------------- | --------------------------------------------------- | ------------------ |
| Add API endpoint       | `services/api-gateway/app/api/`                     | `*.py` route files |
| Add service            | `services/api-gateway/app/services/`                | `*_service.py`     |
| Add database model     | `services/api-gateway/app/models/`                  | `*.py` + migration |
| Add frontend component | `apps/web-app/src/components/`                      | `*.tsx`            |
| Add React hook         | `apps/web-app/src/hooks/`                           | `use*.ts`          |
| Add feature flag       | `services/api-gateway/app/core/flag_definitions.py` | Flag definition    |

---

## 1. Adding a New API Endpoint

### Backend (FastAPI)

**Location:** `services/api-gateway/app/api/`

**Step 1: Create or extend a route file**

```python
# services/api-gateway/app/api/my_feature.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.my_feature import MyFeatureRequest, MyFeatureResponse

router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.get("/", response_model=list[MyFeatureResponse])
async def list_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all items for the current user."""
    # Implementation here
    pass

@router.post("/", response_model=MyFeatureResponse)
async def create_item(
    request: MyFeatureRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new item."""
    # Implementation here
    pass
```

**Step 2: Create Pydantic schemas**

```python
# services/api-gateway/app/schemas/my_feature.py

from pydantic import BaseModel
from datetime import datetime

class MyFeatureRequest(BaseModel):
    name: str
    description: str | None = None

class MyFeatureResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True
```

**Step 3: Register the router**

```python
# services/api-gateway/app/main.py

from app.api.my_feature import router as my_feature_router

app.include_router(my_feature_router, prefix="/api")
```

### Frontend Integration

```typescript
// apps/web-app/src/services/myFeatureApi.ts

import { apiClient } from "@voiceassist/api-client";

export interface MyFeature {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export const myFeatureApi = {
  list: () => apiClient.get<MyFeature[]>("/api/my-feature"),
  create: (data: { name: string; description?: string }) => apiClient.post<MyFeature>("/api/my-feature", data),
};
```

---

## 2. Adding a New Service

Services contain business logic separated from API routes.

**Location:** `services/api-gateway/app/services/`

**Pattern:**

```python
# services/api-gateway/app/services/my_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.logging import get_logger

logger = get_logger(__name__)

class MyService:
    """Service for handling my feature logic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_item(self, user: User, item_id: int) -> dict:
        """Process an item with business logic."""
        logger.info(f"Processing item {item_id} for user {user.id}")

        # Business logic here
        result = await self._do_processing(item_id)

        return {"status": "processed", "result": result}

    async def _do_processing(self, item_id: int) -> str:
        """Internal processing method."""
        # Implementation
        return "done"
```

**Using the service in an API route:**

```python
from app.services.my_service import MyService

@router.post("/{item_id}/process")
async def process_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = MyService(db)
    return await service.process_item(current_user, item_id)
```

---

## 3. Adding a Database Model

**Location:** `services/api-gateway/app/models/`

**Step 1: Create the model**

```python
# services/api-gateway/app/models/my_model.py

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

class MyModel(Base):
    __tablename__ = "my_models"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="my_models")
```

**Step 2: Create a migration**

```bash
cd services/api-gateway
alembic revision --autogenerate -m "Add my_models table"
alembic upgrade head
```

**Step 3: Export from models/**init**.py**

```python
# services/api-gateway/app/models/__init__.py

from .my_model import MyModel
```

---

## 4. Adding a Frontend Component

**Location:** `apps/web-app/src/components/`

**Pattern:**

```tsx
// apps/web-app/src/components/my-feature/MyFeatureCard.tsx

import { Card, CardHeader, CardContent } from "@voiceassist/ui";

interface MyFeatureCardProps {
  title: string;
  description?: string;
  onAction: () => void;
}

export function MyFeatureCard({ title, description, onAction }: MyFeatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-medium">{title}</h3>
      </CardHeader>
      <CardContent>
        {description && <p className="text-gray-600">{description}</p>}
        <button onClick={onAction} className="mt-4 px-4 py-2 bg-primary text-white rounded">
          Take Action
        </button>
      </CardContent>
    </Card>
  );
}
```

**With data fetching hook:**

```tsx
// apps/web-app/src/hooks/useMyFeature.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { myFeatureApi } from "../services/myFeatureApi";

export function useMyFeatures() {
  return useQuery({
    queryKey: ["my-features"],
    queryFn: myFeatureApi.list,
  });
}

export function useCreateMyFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: myFeatureApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-features"] });
    },
  });
}
```

---

## 5. Adding a Tool/Integration

Tools are callable functions available to the AI assistant.

**Location:** `services/api-gateway/app/services/tools/`

**Pattern:**

```python
# services/api-gateway/app/services/tools/my_tool.py

from typing import Any
from app.core.logging import get_logger

logger = get_logger(__name__)

class MyTool:
    """Tool for performing a specific action."""

    name = "my_tool"
    description = "Performs a specific action based on user input"

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    async def execute(self, query: str, context: dict | None = None) -> dict[str, Any]:
        """Execute the tool with the given query."""
        logger.info(f"Executing {self.name} with query: {query}")

        # Tool logic here
        result = await self._process(query)

        return {
            "tool": self.name,
            "query": query,
            "result": result,
        }

    async def _process(self, query: str) -> str:
        """Internal processing logic."""
        # Implementation
        return f"Processed: {query}"
```

**Registering the tool:**

```python
# services/api-gateway/app/services/tool_registry.py

from app.services.tools.my_tool import MyTool

AVAILABLE_TOOLS = {
    "my_tool": MyTool,
    # ... other tools
}
```

---

## 6. Adding a Feature Flag

Feature flags control feature rollout and A/B testing.

**Location:** `services/api-gateway/app/core/flag_definitions.py`

**Step 1: Define the flag**

```python
# In flag_definitions.py

FLAG_DEFINITIONS = {
    # ... existing flags ...

    "my_new_feature": {
        "description": "Enable the new feature",
        "default": False,
        "type": "boolean",
        "owner": "backend",
        "tags": ["feature", "experimental"],
    },

    "my_feature_variant": {
        "description": "A/B test variant for my feature",
        "default": "control",
        "type": "string",
        "variants": ["control", "variant_a", "variant_b"],
        "owner": "frontend",
        "tags": ["ab-test"],
    },
}
```

**Step 2: Use in backend**

```python
from app.core.feature_flags import get_flag_value

async def my_endpoint(user: User):
    if await get_flag_value("my_new_feature", user_id=user.id):
        return {"feature": "enabled"}
    return {"feature": "disabled"}
```

**Step 3: Use in frontend**

```tsx
import { useFeatureFlag } from "../hooks/useFeatureFlags";

function MyComponent() {
  const isEnabled = useFeatureFlag("my_new_feature");

  if (!isEnabled) return null;

  return <div>New Feature Content</div>;
}
```

---

## 7. Adding Medical Knowledge Sources

To add new medical knowledge sources for RAG.

**Location:** `services/api-gateway/app/services/kb_indexer.py`

**Pattern:**

```python
# Add a new document processor

class MySourceProcessor:
    """Processor for my medical source."""

    async def process(self, document: bytes, metadata: dict) -> list[dict]:
        """Process document into chunks for indexing."""
        chunks = []

        # Parse document
        content = self._parse(document)

        # Chunk content
        for i, chunk in enumerate(self._chunk(content)):
            chunks.append({
                "content": chunk,
                "metadata": {
                    **metadata,
                    "source": "my_source",
                    "chunk_index": i,
                },
            })

        return chunks

    def _parse(self, document: bytes) -> str:
        """Parse document bytes to text."""
        # Implementation based on document type
        pass

    def _chunk(self, content: str, chunk_size: int = 1000) -> list[str]:
        """Split content into chunks."""
        # Implementation
        pass
```

---

## 8. Adding Voice Pipeline Components

Voice components integrate with the Thinker/Talker pipeline.

**Backend Location:** `services/api-gateway/app/services/`

**Key files:**

- `thinker_service.py` - AI reasoning
- `talker_service.py` - TTS synthesis
- `voice_pipeline_service.py` - Orchestration

**Frontend Location:** `apps/web-app/src/hooks/`

**Key files:**

- `useThinkerTalkerSession.ts` - Voice session management
- `useTTAudioPlayback.ts` - Audio playback

**Pattern for custom voice processing:**

```python
# services/api-gateway/app/services/my_voice_processor.py

from app.services.thinker_service import ThinkerService

class MyVoiceProcessor:
    """Custom voice processing for specific use case."""

    def __init__(self, thinker: ThinkerService):
        self.thinker = thinker

    async def process_utterance(self, text: str, context: dict) -> str:
        """Process a voice utterance with custom logic."""
        # Pre-processing
        processed_text = self._preprocess(text)

        # Use thinker for AI reasoning
        response = await self.thinker.process(processed_text, context)

        # Post-processing
        return self._postprocess(response)
```

---

## Common Patterns

### Error Handling

```python
from fastapi import HTTPException

# Raise HTTP errors
raise HTTPException(status_code=404, detail="Item not found")
raise HTTPException(status_code=403, detail="Not authorized")
```

### Logging

```python
from app.core.logging import get_logger

logger = get_logger(__name__)

logger.info("Operation completed", extra={"user_id": user.id})
logger.error("Operation failed", exc_info=True)
```

### Testing

```python
# tests/unit/services/test_my_service.py

import pytest
from app.services.my_service import MyService

@pytest.mark.asyncio
async def test_process_item(db_session, test_user):
    service = MyService(db_session)
    result = await service.process_item(test_user, item_id=1)
    assert result["status"] == "processed"
```

---

## File Naming Conventions

| Type            | Convention                 | Example                  |
| --------------- | -------------------------- | ------------------------ |
| API route       | `snake_case.py`            | `admin_kb.py`            |
| Service         | `snake_case_service.py`    | `kb_indexer.py`          |
| Model           | `snake_case.py`            | `conversation_memory.py` |
| Schema          | `snake_case.py`            | `auth.py`                |
| React component | `PascalCase.tsx`           | `ChatPanel.tsx`          |
| React hook      | `useCamelCase.ts`          | `useChatSession.ts`      |
| Test file       | `test_*.py` or `*.spec.ts` | `test_auth.py`           |

---

## Related Documentation

- [UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md) - System architecture
- [services/api-gateway/README.md](../services/api-gateway/README.md) - Backend details
- [apps/web-app/README.md](../apps/web-app/README.md) - Frontend details
- [debugging/DEBUGGING_INDEX.md](debugging/DEBUGGING_INDEX.md) - Troubleshooting
