---
title: Testing Strategy
slug: testing-strategy
summary: What to test, how to test, and coverage expectations for VoiceAssist.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-08"
audience:
  - human
  - ai-agents
tags:
  - testing
  - quality
  - patterns
category: development
component: "testing"
ai_summary: >-
  Testing strategy for VoiceAssist. Covers unit, integration, E2E tests.
  Includes coverage targets and when to write each test type.
---

# Testing Strategy

> **Last Updated**: 2025-12-08

Guide to testing VoiceAssist effectively.

---

## Test Pyramid

```
         ┌─────────┐
        /│   E2E   │\         Slow, expensive, few
       / │  Tests  │ \        (Critical user flows)
      /  └─────────┘  \
     /   ┌─────────────┐\
    /    │ Integration │ \    Medium speed, some
   /     │    Tests    │  \   (API, DB, services)
  /      └─────────────┘   \
 /       ┌─────────────────┐\
/        │   Unit Tests    │ \ Fast, cheap, many
         └─────────────────┘   (Functions, components)
```

---

## Backend Testing

### Unit Tests

**Location:** `tests/unit/`

**What to test:**

- Pure functions
- Business logic in services
- Schema validation
- Utility functions

```python
# tests/unit/test_phi_detector.py

import pytest
from app.services.phi_detector import PHIDetector

def test_detects_ssn():
    detector = PHIDetector()
    result = detector.detect("My SSN is 123-45-6789")
    assert result.has_phi == True
    assert "ssn" in result.detected_types

def test_no_phi_in_clean_text():
    detector = PHIDetector()
    result = detector.detect("The patient has a headache")
    assert result.has_phi == False
```

**Coverage target:** 80%+

### Integration Tests

**Location:** `tests/integration/`

**What to test:**

- API endpoints
- Database operations
- External service integrations (mocked)

```python
# tests/integration/test_auth_api.py

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user):
    response = await client.post("/api/auth/login", json={
        "email": test_user.email,
        "password": "testpass123",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()["data"]

@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, test_user):
    response = await client.post("/api/auth/login", json={
        "email": test_user.email,
        "password": "wrongpassword",
    })
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_ERROR"
```

**Coverage target:** Key flows covered

### Test Fixtures

```python
# tests/conftest.py

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.fixture
async def db_session():
    """Create a test database session."""
    async with async_session_maker() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(db_session):
    """Create an async test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", hashed_password=hash_password("testpass123"))
    db_session.add(user)
    await db_session.commit()
    return user

@pytest.fixture
async def auth_headers(test_user):
    """Get auth headers for test user."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
```

---

## Frontend Testing

### Unit Tests (Vitest)

**Location:** `apps/web-app/src/**/__tests__/`

**What to test:**

- Utility functions
- Custom hooks
- Component rendering
- User interactions

```typescript
// src/hooks/__tests__/useAuth.test.ts

import { renderHook, act } from "@testing-library/react";
import { useAuth } from "../useAuth";

describe("useAuth", () => {
  it("starts with no user", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("logs in user", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("test@example.com", "password");
    });

    expect(result.current.isAuthenticated).toBe(true);
  });
});
```

### Component Tests

```typescript
// src/components/chat/__tests__/MessageInput.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { MessageInput } from '../MessageInput';

describe('MessageInput', () => {
  it('renders input field', () => {
    render(<MessageInput onSend={() => {}} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSend when submitted', () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.submit(screen.getByRole('form'));

    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('disables send when empty', () => {
    render(<MessageInput onSend={() => {}} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
```

---

## E2E Testing (Playwright)

**Location:** `e2e/`

**What to test:**

- Critical user flows
- Multi-page workflows
- Authentication flows
- Voice mode (with mocks)

```typescript
// e2e/auth.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("user can log in", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Welcome")).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.getByText("Invalid credentials")).toBeVisible();
  });
});
```

---

## Running Tests

### Backend

```bash
cd services/api-gateway

# All tests
pytest

# With coverage
pytest --cov=app --cov-report=html

# Specific file
pytest tests/unit/test_phi_detector.py -v

# Run tests matching pattern
pytest -k "test_login" -v
```

### Frontend

```bash
cd apps/web-app

# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Specific file
pnpm test src/hooks/__tests__/useAuth.test.ts
```

### E2E

```bash
# From project root
npx playwright test

# With UI
npx playwright test --ui

# Specific file
npx playwright test e2e/auth.spec.ts

# Debug mode
npx playwright test --debug
```

---

## Coverage Targets

| Area                | Target    | Current |
| ------------------- | --------- | ------- |
| Backend unit tests  | 80%       | ~75%    |
| Backend integration | Key flows | ✅      |
| Frontend components | 70%       | ~65%    |
| Frontend hooks      | 80%       | ~80%    |
| E2E critical flows  | 100%      | ✅      |

---

## When to Write Tests

### Must Have Tests

- [ ] New API endpoints
- [ ] Business logic with edge cases
- [ ] Authentication/authorization changes
- [ ] Data validation
- [ ] Bug fixes (add regression test)

### Nice to Have Tests

- [ ] UI component variations
- [ ] Performance benchmarks
- [ ] Accessibility checks

### Skip Tests For

- Simple getters/setters
- Pass-through functions
- Framework-provided functionality

---

## CI/CD Integration

Tests run automatically on:

- Pull request creation
- Push to main branch
- Nightly scheduled runs

```yaml
# .github/workflows/test.yml (example)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run backend tests
        run: |
          cd services/api-gateway
          pip install -r requirements-dev.txt
          pytest --cov=app --cov-fail-under=70
      - name: Run frontend tests
        run: |
          cd apps/web-app
          pnpm install
          pnpm test
```

---

## Related Documents

- [tasks/DEBUG_ISSUE.md](tasks/DEBUG_ISSUE.md) - Debugging checklist
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Test commands
- [testing/E2E_TESTING_GUIDE.md](testing/E2E_TESTING_GUIDE.md) - E2E details
