# VoiceAssist Phase 9 Test Suite

Comprehensive pytest test suite for VoiceAssist V2 Phase 9 implementation.

## Overview

This test suite provides complete coverage for Phase 9 functionality including:

- **API Envelope**: Standard response format testing
- **Password Validation**: Security and strength testing
- **Feature Flags**: A/B testing and rollout functionality
- **PHI Redaction**: Healthcare data protection
- **Business Metrics**: Prometheus metrics and observability
- **Tracing**: Distributed tracing and context propagation
- **Authentication**: JWT-based auth flows
- **Knowledge Base**: Document management and RAG queries
- **Health Checks**: Kubernetes-ready health and readiness probes

## Test Statistics

- **Total Files**: 16
- **Total Lines**: 6,452
- **Unit Tests**: 6 files (3,597 lines)
- **Integration Tests**: 5 files (2,232 lines)
- **Configuration**: 2 files (596 lines)

## Installation

```bash
# Install pytest and dependencies
pip install pytest pytest-cov pytest-asyncio pytest-timeout

# Or install all test dependencies
pip install -r requirements-test.txt
```

## Running Tests

### Run All Tests
```bash
pytest
```

### Run Only Unit Tests
```bash
pytest tests/unit/
```

### Run Only Integration Tests
```bash
pytest tests/integration/
```

### Run Tests by Marker
```bash
# Run only auth-related tests
pytest -m auth

# Run only API tests
pytest -m api

# Run only metrics tests
pytest -m metrics

# Run only PHI-related tests
pytest -m phi
```

### Run with Coverage
```bash
pytest --cov=server/app --cov-report=html
```

### Run Specific Test File
```bash
pytest tests/unit/test_api_envelope.py
```

### Run Specific Test
```bash
pytest tests/unit/test_api_envelope.py::test_success_response_returns_correct_format
```

### Skip Slow Tests
```bash
pytest -m "not slow"
```

## Test Organization

### Unit Tests (`tests/unit/`)

Tests individual components in isolation with mocked dependencies:

1. **test_api_envelope.py** (460 lines)
   - Success/error response formats
   - Metadata inclusion
   - Pagination helpers
   - Validation error formatting

2. **test_password_validator.py** (489 lines)
   - Strong password validation
   - Weak password rejection
   - Common password blocking
   - Password strength scoring

3. **test_feature_flags.py** (576 lines)
   - Flag evaluation
   - User overrides
   - A/B testing rollout percentages
   - Caching behavior

4. **test_phi_redaction.py** (660 lines)
   - SSN redaction
   - Medical record number redaction
   - Phone number masking
   - Email masking
   - Non-PHI passthrough

5. **test_business_metrics.py** (717 lines)
   - Metric registration
   - Counter increments
   - Gauge sets
   - Histogram observations

6. **test_tracing_utils.py** (695 lines)
   - Trace context propagation
   - Span creation and management
   - Trace ID generation
   - Baggage handling

### Integration Tests (`tests/integration/`)

Tests API endpoints and system integration:

1. **test_auth_flow.py** (588 lines)
   - User registration
   - Login with valid/invalid credentials
   - JWT token validation
   - Token refresh
   - Logout flows

2. **test_knowledge_base_api.py** (634 lines)
   - Document upload
   - Document listing and pagination
   - Document search
   - Document deletion
   - RAG queries

3. **test_feature_flags_api.py** (229 lines)
   - Create/update/delete flags
   - List flags
   - User overrides
   - Admin operations

4. **test_metrics_endpoint.py** (320 lines)
   - Prometheus format
   - Business metrics presence
   - Metric value updates
   - Performance checks

5. **test_health_checks.py** (461 lines)
   - /health endpoint
   - /ready endpoint
   - Database connectivity
   - Redis connectivity
   - Dependency checks

## Configuration

### pytest.ini

Configures pytest behavior:
- Test discovery patterns
- Test markers (unit, integration, slow, auth, api, etc.)
- Coverage settings
- Logging configuration
- Timeouts

### conftest.py

Provides shared fixtures:
- FastAPI test client
- Mock database sessions
- Mock Redis clients
- Test user fixtures
- Authentication tokens
- Environment mocking
- Cleanup utilities

## Test Markers

Tests are organized with markers for selective execution:

- `@pytest.mark.unit` - Fast unit tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.slow` - Tests taking >1 second
- `@pytest.mark.auth` - Authentication tests
- `@pytest.mark.api` - API endpoint tests
- `@pytest.mark.database` - Database-dependent tests
- `@pytest.mark.redis` - Redis-dependent tests
- `@pytest.mark.phi` - PHI detection/redaction tests
- `@pytest.mark.metrics` - Metrics/observability tests
- `@pytest.mark.feature_flags` - Feature flag tests

## Fixtures

### Application Fixtures
- `app` - Fresh FastAPI application
- `client` - Test client for HTTP requests
- `authenticated_client` - Client with auth headers

### Database Fixtures
- `mock_db_session` - Mock database session
- `in_memory_db_session` - Real in-memory SQLite DB

### Redis Fixtures
- `mock_redis_client` - Mock Redis client
- `mock_redis_with_data` - Redis client with test data

### Authentication Fixtures
- `test_user` - Standard test user
- `test_admin_user` - Admin test user
- `test_user_token` - Valid JWT token
- `expired_token` - Expired JWT token

### Test Data Fixtures
- `sample_document` - Sample KB document
- `sample_chat_message` - Sample chat message
- `sample_feature_flag` - Sample feature flag
- `phi_test_data` - Test data containing PHI

### Monitoring Fixtures
- `mock_prometheus_registry` - Mock metrics registry
- `mock_counter` - Mock counter metric
- `mock_gauge` - Mock gauge metric
- `mock_histogram` - Mock histogram metric

## Writing New Tests

### Unit Test Template

```python
import pytest
from app.module import function_to_test

@pytest.mark.unit
def test_should_do_something_when_condition(mock_dependency):
    """Test that function does expected behavior under condition.

    This test verifies that...
    """
    # Arrange
    test_input = "test"

    # Act
    result = function_to_test(test_input)

    # Assert
    assert result == expected_output
```

### Integration Test Template

```python
import pytest
from fastapi import status

@pytest.mark.integration
@pytest.mark.api
def test_endpoint_returns_expected_data(authenticated_client):
    """Test that API endpoint returns expected data format.

    This test verifies that...
    """
    # Arrange
    request_data = {"key": "value"}

    # Act
    response = authenticated_client.post("/api/endpoint", json=request_data)

    # Assert
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert "expected_field" in data["data"]
```

## Best Practices

1. **Test Names**: Use descriptive names that explain what's being tested
   - Format: `test_should_do_something_when_condition`
   - Example: `test_login_fails_with_invalid_password`

2. **Docstrings**: Every test should have a docstring explaining its purpose

3. **AAA Pattern**: Organize tests with Arrange, Act, Assert structure

4. **Fixtures**: Use fixtures for common setup and teardown

5. **Mocking**: Mock external dependencies in unit tests

6. **Assertions**: Include helpful error messages in assertions

7. **Parametrize**: Use `@pytest.mark.parametrize` for multiple test cases

8. **Markers**: Tag tests appropriately with markers

9. **Independence**: Tests should be independent and not rely on execution order

10. **Cleanup**: Use fixtures to ensure proper cleanup after tests

## Continuous Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    pytest tests/ --cov=server/app --cov-report=xml

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage.xml
```

## Coverage Goals

- **Overall Coverage**: >80%
- **Critical Paths**: >95% (auth, PHI handling)
- **New Code**: 100% coverage required

## Troubleshooting

### Import Errors
If you get import errors, ensure the Python path includes the server directory:
```bash
export PYTHONPATH="${PYTHONPATH}:${PWD}/server"
```

### Database Errors
Integration tests use in-memory SQLite by default. For PostgreSQL tests:
```bash
export TEST_DATABASE_URL="postgresql://test:test@localhost:5432/test_db"
```

### Redis Errors
Redis tests use mocks by default. For real Redis tests:
```bash
export TEST_REDIS_URL="redis://localhost:6379/15"
```

### Slow Tests
Skip slow tests during development:
```bash
pytest -m "not slow"
```

## Contributing

When adding new tests:

1. Place unit tests in `tests/unit/`
2. Place integration tests in `tests/integration/`
3. Add appropriate markers
4. Update this README if adding new test categories
5. Ensure tests pass locally before committing
6. Maintain >80% code coverage

## Support

For questions about the test suite:
- Check existing tests for examples
- Review pytest documentation: https://docs.pytest.org/
- Check the conftest.py for available fixtures
