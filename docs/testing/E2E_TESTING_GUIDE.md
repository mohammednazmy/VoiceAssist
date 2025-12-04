---
title: E2e Testing Guide
slug: testing/e2e-testing-guide
summary: >-
  This guide describes the comprehensive end-to-end (E2E) test suite for
  VoiceAssist V2. These tests verify complete user workflows, service
  integration...
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - e2e
  - testing
  - guide
category: testing
ai_summary: >-
  This guide describes the comprehensive end-to-end (E2E) test suite for
  VoiceAssist V2. These tests verify complete user workflows, service
  integrations, failure recovery, and performance characteristics. Tests full
  user workflows from registration through complex operations: - User
  Registration &...
---

# End-to-End Testing Guide (Phase 7 - P2.2)

## Overview

This guide describes the comprehensive end-to-end (E2E) test suite for VoiceAssist V2. These tests verify complete user workflows, service integrations, failure recovery, and performance characteristics.

## Test Categories

### 1. Complete User Journey Tests (`test_complete_user_journey.py`)

Tests full user workflows from registration through complex operations:

- **User Registration & Login**: Complete auth flow including token refresh and logout
- **Admin Document Upload**: Document upload, indexing, and async job tracking
- **RAG Query Workflow**: Full query pipeline with cache behavior verification
- **Concurrent Operations**: Multi-user concurrent registration and login
- **Error Recovery**: Handling of invalid inputs, duplicate registrations, unauthorized access
- **Session Management**: Token lifecycle across multiple requests

**Key Test:**

```python
test_full_user_journey()
# Register → Login → Verify Auth → Token Refresh → Logout → Verify Revocation
```

### 2. Service Resilience Tests (`test_service_resilience.py`)

Tests system behavior under failure conditions:

- **Redis Failure**: Graceful degradation when Redis is unavailable
- **Database Retry Logic**: Connection retry and recovery
- **Qdrant Failure**: Empty results when vector DB is down
- **OpenAI API Failure**: External API error handling
- **Concurrent Load**: System stability under concurrent requests
- **Rate Limiting**: Proper enforcement of rate limits
- **Cache Invalidation**: Correct cache behavior on data changes
- **Token Expiration**: Handling of expired JWTs
- **Transaction Rollback**: Database consistency on failures

**Key Test:**

```python
test_redis_failure_graceful_degradation()
# System continues operating when Redis is unavailable
```

### 3. Performance Characteristics Tests (`test_performance_characteristics.py`)

Benchmarks and performance validation:

- **Authentication Performance**: Login/token generation speed (<500ms avg)
- **Cache Performance**: Measurable improvement from caching (2x+ faster)
- **Health Check Performance**: Ultra-fast health endpoints (<100ms avg, <200ms p95)
- **Concurrent Authentication**: Performance under concurrent load
- **Cache Size Tracking**: Memory usage and utilization monitoring
- **Metrics Endpoint**: Prometheus metrics generation performance
- **Database Query Performance**: DB operation latency (<200ms avg)

**Performance Targets:**

- Authentication: <500ms average
- Health checks: <100ms average, <200ms p95
- Cached queries: 2x+ faster than uncached
- Concurrent logins: <1s average with 10 concurrent users

## Running E2E Tests

### Prerequisites

1. **Services Running:**

   ```bash
   docker compose up -d
   ```

2. **Service Health:**

   ```bash
   curl http://localhost:8000/health
   ```

3. **Test Database:**
   ```bash
   # Created automatically by test runner
   # Manual creation:
   PGPASSWORD=changeme_secure_password psql -h localhost -U voiceassist -d postgres -c "CREATE DATABASE voiceassist_test;"
   ```

### Quick Start

```bash
cd services/api-gateway

# Run all E2E tests
./run_e2e_tests.sh all

# Run specific test category
./run_e2e_tests.sh journey        # User journey tests
./run_e2e_tests.sh resilience     # Failure recovery tests
./run_e2e_tests.sh performance    # Performance benchmarks

# Quick smoke test
./run_e2e_tests.sh quick

# Verbose output
./run_e2e_tests.sh all -v
```

### Using Pytest Directly

```bash
# Run all E2E tests with coverage
pytest -c pytest.e2e.ini tests/e2e/ --cov=app --cov-report=html

# Run specific test file
pytest -c pytest.e2e.ini tests/e2e/test_complete_user_journey.py

# Run specific test
pytest -c pytest.e2e.ini tests/e2e/test_complete_user_journey.py::TestCompleteUserJourney::test_full_user_journey

# Run with debugging
pytest -c pytest.e2e.ini tests/e2e/ -s --pdb

# Stop on first failure
pytest -c pytest.e2e.ini tests/e2e/ -x

# Run marked tests
pytest -c pytest.e2e.ini tests/e2e/ -m "performance"
```

## Test Fixtures

### Database Fixtures

- **`test_db_engine`**: Clean PostgreSQL test database
- **`test_db_session`**: Isolated database session per test
- **`test_user`**: Standard test user (testuser@example.com)
- **`test_admin_user`**: Admin test user (admin@example.com)

### Service Fixtures

- **`test_redis`**: Isolated Redis client (database 15)
- **`test_qdrant`**: Isolated Qdrant collection
- **`client`**: FastAPI TestClient with dependency overrides

### Authentication Fixtures

- **`auth_headers`**: Bearer token headers for test user
- **`admin_auth_headers`**: Bearer token headers for admin user

### Data Fixtures

- **`sample_medical_document`**: Sample diabetes guideline document
- **`clear_cache`**: Auto-clears cache before each test

## Writing New E2E Tests

### Test Structure

```python
import pytest
from fastapi.testclient import TestClient

class TestMyFeature:
    """E2E tests for my feature."""

    def test_complete_workflow(
        self,
        client: TestClient,
        test_user,
        auth_headers: dict
    ):
        """Test complete feature workflow."""

        # Step 1: Setup
        response1 = client.post(
            "/api/my-endpoint",
            json={"data": "value"},
            headers=auth_headers
        )
        assert response1.status_code == 200

        # Step 2: Verify
        response2 = client.get(
            "/api/my-endpoint/verify",
            headers=auth_headers
        )
        assert response2.status_code == 200
        assert response2.json()["data"]["expected_field"] == "expected_value"
```

### Best Practices

1. **Test Real Workflows**: E2E tests should reflect actual user journeys
2. **Use Real Services**: Prefer actual DB/Redis over mocks (use test databases)
3. **Clean State**: Each test should start with clean state (use fixtures)
4. **Assert Thoroughly**: Verify response status, structure, and data
5. **Performance Awareness**: Include timing assertions for critical paths
6. **Failure Recovery**: Test both happy path and error scenarios
7. **Concurrent Safety**: Test concurrent operations where relevant

### Markers

```python
@pytest.mark.e2e
def test_basic_workflow():
    """Standard E2E test."""
    pass

@pytest.mark.slow
def test_long_running_operation():
    """Test that takes significant time."""
    pass

@pytest.mark.performance
def test_response_time():
    """Performance benchmark test."""
    pass

@pytest.mark.resilience
def test_service_failure_recovery():
    """Failure recovery test."""
    pass
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: ankane/pgvector:v0.5.1
        env:
          POSTGRES_PASSWORD: changeme_secure_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      qdrant:
        image: qdrant/qdrant:v1.7.3
        options: >-
          --health-cmd "curl -f http://localhost:6333/health"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install -r services/api-gateway/requirements.txt
          pip install pytest pytest-asyncio pytest-cov

      - name: Run E2E tests
        run: |
          cd services/api-gateway
          ./run_e2e_tests.sh all --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./services/api-gateway/coverage.xml
```

## Troubleshooting

### Common Issues

**Test Database Connection Errors:**

```bash
# Ensure PostgreSQL is running
docker compose ps postgres

# Recreate test database
PGPASSWORD=changeme_secure_password psql -h localhost -U voiceassist -d postgres -c "DROP DATABASE IF EXISTS voiceassist_test; CREATE DATABASE voiceassist_test;"
```

**Redis Connection Errors:**

```bash
# Verify Redis is accessible
redis-cli -h localhost -p 6379 -a changeme_redis_password ping
```

**Qdrant Connection Errors:**

```bash
# Check Qdrant health
curl http://localhost:6333/health
```

**Slow Tests:**

```bash
# Run with timing report
pytest -c pytest.e2e.ini tests/e2e/ --durations=10
```

**Flaky Tests:**

```bash
# Run tests multiple times to identify flakiness
pytest -c pytest.e2e.ini tests/e2e/ --count=5
```

## Performance Baselines

Current performance baselines (run on MacBook Pro M3, 16GB RAM):

| Operation              | Target    | Typical      |
| ---------------------- | --------- | ------------ |
| Authentication (login) | <500ms    | ~150ms       |
| Health check (avg)     | <100ms    | ~20ms        |
| Health check (p95)     | <200ms    | ~50ms        |
| Cached query           | 2x faster | 5-10x faster |
| Concurrent logins (10) | <1s       | ~300ms       |
| Metrics endpoint       | <500ms    | ~100ms       |
| Database query         | <200ms    | ~50ms        |

## Test Coverage Goals

- **Overall Coverage**: >80%
- **Critical Paths**: >95% (auth, RAG query, admin operations)
- **E2E Scenarios**: All major user journeys covered
- **Failure Scenarios**: All single-point failures tested
- **Performance**: All endpoints benchmarked

## Maintenance

### Regular Updates

1. **Add tests for new features**: E2E test per major feature
2. **Update baselines**: Review performance baselines quarterly
3. **Extend fixtures**: Add fixtures for new test patterns
4. **Review flakiness**: Monitor and fix flaky tests
5. **Update documentation**: Keep this guide current

### Test Review Checklist

- [ ] Tests pass consistently (3+ runs)
- [ ] Performance assertions realistic
- [ ] Proper cleanup (no test pollution)
- [ ] Clear test names and documentation
- [ ] Appropriate use of fixtures
- [ ] Error messages helpful for debugging

## Resources

- **Pytest Documentation**: https://docs.pytest.org/
- **FastAPI Testing**: https://fastapi.tiangolo.com/tutorial/testing/
- **Async Testing**: https://pytest-asyncio.readthedocs.io/
- **Test Client**: https://www.starlette.io/testclient/

## Contact

For questions or issues with E2E tests:

- Review test output and logs
- Check service health endpoints
- Consult this guide
- Review test source code for examples
