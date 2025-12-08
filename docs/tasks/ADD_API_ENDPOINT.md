# Task: Add a New API Endpoint

Step-by-step checklist for adding a new REST API endpoint to VoiceAssist.

## Prerequisites

- [ ] Backend running (`docker compose up -d`)
- [ ] Virtual environment activated (`source venv/bin/activate`)
- [ ] Understand the feature requirements

## Steps

### 1. Create the Route Handler

**Location:** `services/api-gateway/app/api/`

```python
# services/api-gateway/app/api/my_feature.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.schemas.my_feature import MyFeatureRequest, MyFeatureResponse
from app.services.my_feature_service import MyFeatureService

router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.post("/", response_model=MyFeatureResponse)
async def create_my_feature(
    request: MyFeatureRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Create a new my-feature resource."""
    service = MyFeatureService(db)
    return await service.create(request, current_user.id)
```

- [ ] Created route file in `app/api/`
- [ ] Used appropriate HTTP method (GET, POST, PUT, DELETE)
- [ ] Added authentication dependency if needed
- [ ] Added proper response model

### 2. Create Request/Response Schemas

**Location:** `services/api-gateway/app/schemas/`

```python
# services/api-gateway/app/schemas/my_feature.py

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class MyFeatureRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

class MyFeatureResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] Created Pydantic schemas
- [ ] Added field validations
- [ ] Enabled ORM mode if returning DB models

### 3. Create the Service Layer

**Location:** `services/api-gateway/app/services/`

```python
# services/api-gateway/app/services/my_feature_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.my_feature import MyFeature
from app.schemas.my_feature import MyFeatureRequest

class MyFeatureService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, request: MyFeatureRequest, user_id: str) -> MyFeature:
        feature = MyFeature(
            name=request.name,
            description=request.description,
            user_id=user_id,
        )
        self.db.add(feature)
        await self.db.commit()
        await self.db.refresh(feature)
        return feature
```

- [ ] Created service class
- [ ] Implemented business logic
- [ ] Used async/await for database operations

### 4. Create Database Model (if needed)

**Location:** `services/api-gateway/app/models/`

```python
# services/api-gateway/app/models/my_feature.py

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.models.base import Base

class MyFeature(Base):
    __tablename__ = "my_features"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    user_id = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] Created SQLAlchemy model
- [ ] Added to `app/models/__init__.py`
- [ ] Created migration: `alembic revision --autogenerate -m "add my_features table"`
- [ ] Applied migration: `alembic upgrade head`

### 5. Register the Router

**Location:** `services/api-gateway/app/main.py`

```python
# Add to imports
from app.api.my_feature import router as my_feature_router

# Add in create_app()
app.include_router(my_feature_router, prefix="/api")
```

- [ ] Imported router
- [ ] Added to app with prefix

### 6. Add Tests

**Location:** `tests/`

```python
# tests/test_my_feature.py

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_my_feature(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/my-feature/",
        json={"name": "Test Feature"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Feature"
```

- [ ] Created test file
- [ ] Added happy path tests
- [ ] Added error case tests
- [ ] Tests pass: `pytest tests/test_my_feature.py -v`

### 7. Update Documentation

- [ ] Added endpoint to [API_REFERENCE.md](../API_REFERENCE.md)
- [ ] Updated [api-reference/rest-api.md](../api-reference/rest-api.md) if significant

## Verification

```bash
# Run tests
pytest tests/test_my_feature.py -v

# Test manually
curl -X POST http://localhost:8000/api/my-feature/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'
```

## Common Issues

1. **Import errors**: Check `__init__.py` files include new modules
2. **Migration issues**: Run `alembic current` to check state
3. **Auth failures**: Ensure `get_current_user` dependency is correct
4. **Validation errors**: Check Pydantic schema field types
