# VoiceAssist Test Suite

Comprehensive test suite for the VoiceAssist platform covering E2E, integration, and voice interaction testing.

## Test Structure

```
tests/
├── conftest.py                    # Pytest configuration and fixtures
├── e2e/                           # End-to-end tests
│   └── test_user_workflows.py    # Complete user workflow tests
├── integration/                   # Service integration tests
│   └── test_service_integration.py
├── voice/                         # Voice interaction tests
│   └── test_voice_interactions.py
└── fixtures/                      # Test fixtures and sample data
```

## Running Tests

### Run all tests

```bash
pytest
```

### Run specific test categories

```bash
# E2E tests only
pytest -m e2e

# Integration tests only
pytest -m integration

# Voice tests only
pytest -m voice

# Exclude slow tests
pytest -m "not slow"
```

### Run specific test files

```bash
pytest tests/e2e/test_user_workflows.py
pytest tests/integration/test_service_integration.py
pytest tests/voice/test_voice_interactions.py
```

### Run with coverage

```bash
pytest --cov=services --cov-report=html
```

## Test Configuration

### Environment Variables

```bash
export TEST_DATABASE_URL="postgresql://voiceassist:password@localhost:5432/voiceassist_test"
export TEST_API_BASE_URL="http://localhost:8000"
```

### Test Database Setup

```bash
# Create test database
createdb voiceassist_test

# Run migrations
alembic upgrade head
```

## Test Markers

- `@pytest.mark.e2e` - End-to-end integration tests
- `@pytest.mark.voice` - Voice interaction tests
- `@pytest.mark.integration` - Service integration tests
- `@pytest.mark.slow` - Slow-running tests (>5 seconds)
- `@pytest.mark.requires_services` - Requires external services running

## Writing New Tests

### Test Structure

```python
import pytest
from httpx import AsyncClient

@pytest.mark.e2e
@pytest.mark.asyncio
async def test_my_feature(api_client: AsyncClient, user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    response = await api_client.get("/api/endpoint", headers=headers)
    assert response.status_code == 200
```

### Available Fixtures

- `api_client` - Async HTTP client for API testing
- `admin_token` - Admin authentication token
- `user_token` - Regular user authentication token
- `auth_headers_admin` - Admin auth headers
- `auth_headers_user` - User auth headers
- `test_db_session` - Database session for testing
- `sample_audio_file` - Path to sample audio file
- `sample_medical_document` - Path to sample medical document

## CI/CD Integration

Tests run automatically on:

- Pull requests
- Pushes to main branch
- Nightly builds

See `.github/workflows/ci.yml` for CI configuration.

## Test Results

Test results are available in:

- Console output (real-time)
- HTML coverage reports (`htmlcov/` directory)
- JUnit XML reports (`test-results.xml`)
- CI/CD pipeline artifacts

## Troubleshooting

### Common Issues

1. **Database connection fails**

   ```bash
   # Ensure PostgreSQL is running
   docker compose up -d postgres

   # Check connection
   psql postgresql://voiceassist:password@localhost:5432/voiceassist_test
   ```

2. **API endpoints return 404**
   - Some tests skip if endpoints aren't implemented yet
   - This is expected during development

3. **Authentication failures**
   - Ensure test users exist or registration is enabled
   - Check TEST_ADMIN_EMAIL and TEST_USER_EMAIL environment variables

## Phase 13 Completion

This test suite was created as part of Phase 13: Final Testing & Documentation to provide comprehensive coverage of:

- User registration and authentication workflows
- Document upload and processing
- RAG query workflows
- Voice interaction capabilities
- Service-to-service integration
- Health checks and monitoring
- Admin functionality
