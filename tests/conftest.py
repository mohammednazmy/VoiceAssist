"""Pytest configuration and shared fixtures for VoiceAssist Phase 9 tests.

This module provides common fixtures for unit and integration tests including:
- Test client setup
- Mock database sessions
- Mock Redis clients
- Test user fixtures
- Environment variable mocking
- Cleanup utilities
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, Generator
from unittest.mock import MagicMock, Mock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Add server/app to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.main import create_app
from app.core.api_envelope import APIEnvelope


# ============================================================================
# Application Fixtures
# ============================================================================


@pytest.fixture
def app():
    """Create a fresh FastAPI application instance for testing."""
    return create_app()


@pytest.fixture
def client(app) -> TestClient:
    """Create a FastAPI test client.

    This client can be used to make HTTP requests to the application
    without actually starting a server.
    """
    return TestClient(app)


@pytest.fixture
def authenticated_client(client, test_user_token) -> TestClient:
    """Create a test client with authentication headers pre-configured."""
    client.headers = {
        **client.headers,
        "Authorization": f"Bearer {test_user_token}",
    }
    return client


# ============================================================================
# Database Fixtures
# ============================================================================


@pytest.fixture
def mock_db_session() -> Generator[Mock, None, None]:
    """Provide a mock database session for unit tests.

    This mock session can be used to test database interactions without
    actually connecting to a database.
    """
    session = MagicMock(spec=Session)
    session.query = MagicMock()
    session.add = MagicMock()
    session.commit = MagicMock()
    session.rollback = MagicMock()
    session.close = MagicMock()
    session.flush = MagicMock()
    session.refresh = MagicMock()

    yield session

    # Verify session was properly closed
    session.close.assert_called()


@pytest.fixture
def in_memory_db_session() -> Generator[Session, None, None]:
    """Provide an in-memory SQLite database session for integration tests.

    This creates a real database in memory that is destroyed after the test.
    """
    # Create in-memory SQLite database
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Create tables (assumes Base.metadata is available)
    # Note: Import your models here if needed
    # Base.metadata.create_all(bind=engine)

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# ============================================================================
# Redis Fixtures
# ============================================================================


@pytest.fixture
def mock_redis_client() -> Generator[Mock, None, None]:
    """Provide a mock Redis client for testing caching and pub/sub."""
    redis_mock = MagicMock()

    # Setup common Redis operations
    redis_mock.get = MagicMock(return_value=None)
    redis_mock.set = MagicMock(return_value=True)
    redis_mock.delete = MagicMock(return_value=1)
    redis_mock.exists = MagicMock(return_value=False)
    redis_mock.incr = MagicMock(return_value=1)
    redis_mock.decr = MagicMock(return_value=0)
    redis_mock.expire = MagicMock(return_value=True)
    redis_mock.ttl = MagicMock(return_value=-1)
    redis_mock.ping = MagicMock(return_value=True)

    # Hash operations
    redis_mock.hget = MagicMock(return_value=None)
    redis_mock.hset = MagicMock(return_value=1)
    redis_mock.hgetall = MagicMock(return_value={})
    redis_mock.hdel = MagicMock(return_value=1)

    # List operations
    redis_mock.lpush = MagicMock(return_value=1)
    redis_mock.rpush = MagicMock(return_value=1)
    redis_mock.lpop = MagicMock(return_value=None)
    redis_mock.rpop = MagicMock(return_value=None)
    redis_mock.lrange = MagicMock(return_value=[])

    yield redis_mock


@pytest.fixture
def mock_redis_with_data(mock_redis_client) -> Mock:
    """Provide a mock Redis client pre-populated with test data."""
    # Setup some test data
    test_data = {
        "test:key1": "value1",
        "test:key2": "value2",
        "user:123:session": "session_token_abc",
    }

    def get_side_effect(key):
        return test_data.get(key)

    mock_redis_client.get.side_effect = get_side_effect
    mock_redis_client.exists.side_effect = lambda key: key in test_data

    return mock_redis_client


# ============================================================================
# Authentication and User Fixtures
# ============================================================================


@pytest.fixture
def test_user() -> Dict[str, Any]:
    """Provide a test user dictionary with common fields."""
    return {
        "id": "test-user-123",
        "email": "test@example.com",
        "username": "testuser",
        "full_name": "Test User",
        "is_active": True,
        "is_admin": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }


@pytest.fixture
def test_admin_user() -> Dict[str, Any]:
    """Provide a test admin user dictionary."""
    return {
        "id": "admin-user-456",
        "email": "admin@example.com",
        "username": "adminuser",
        "full_name": "Admin User",
        "is_active": True,
        "is_admin": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }


@pytest.fixture
def test_user_token() -> str:
    """Provide a test JWT token for authentication.

    Note: In real tests, you should generate a proper JWT token
    using your application's token generation logic.
    """
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZXhwIjoxNzAwMDAwMDAwfQ.test_signature"


@pytest.fixture
def test_admin_token() -> str:
    """Provide a test JWT token for admin authentication."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi11c2VyLTQ1NiIsImV4cCI6MTcwMDAwMDAwMCwiaXNfYWRtaW4iOnRydWV9.admin_signature"


@pytest.fixture
def expired_token() -> str:
    """Provide an expired JWT token for testing token validation."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZXhwIjoxNTAwMDAwMDAwfQ.expired_signature"


# ============================================================================
# Environment and Configuration Fixtures
# ============================================================================


@pytest.fixture
def mock_env_vars() -> Generator[Dict[str, str], None, None]:
    """Provide mock environment variables for testing.

    Yields a dictionary that can be modified by tests. Variables are
    automatically cleaned up after the test.
    """
    original_env = os.environ.copy()

    test_env = {
        "DATABASE_URL": "postgresql://test:test@localhost:5432/test_db",
        "REDIS_URL": "redis://localhost:6379/0",
        "JWT_SECRET": "test_secret_key_for_testing_only",
        "JWT_ALGORITHM": "HS256",
        "JWT_EXPIRATION_MINUTES": "60",
        "ENVIRONMENT": "test",
        "DEBUG": "true",
        "LOG_LEVEL": "DEBUG",
        "OPENAI_API_KEY": "test_openai_key",
        "ANTHROPIC_API_KEY": "test_anthropic_key",
    }

    os.environ.update(test_env)

    yield test_env

    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)


@pytest.fixture(autouse=True)
def reset_env_for_tests(monkeypatch):
    """Automatically set safe test environment variables for all tests."""
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")


# ============================================================================
# Trace and Request Context Fixtures
# ============================================================================


@pytest.fixture
def trace_id() -> str:
    """Provide a test trace ID for request tracking."""
    return str(uuid4())


@pytest.fixture
def request_context(trace_id) -> Dict[str, Any]:
    """Provide a mock request context with common attributes."""
    return {
        "trace_id": trace_id,
        "user_id": "test-user-123",
        "ip_address": "127.0.0.1",
        "user_agent": "pytest-test-client",
        "timestamp": datetime.utcnow(),
    }


# ============================================================================
# Mock External Service Fixtures
# ============================================================================


@pytest.fixture
def mock_llm_client():
    """Provide a mock LLM client for testing AI interactions."""
    client = MagicMock()
    client.generate_response = MagicMock(return_value="Test LLM response")
    client.generate_embedding = MagicMock(return_value=[0.1] * 1536)
    return client


@pytest.fixture
def mock_vector_store():
    """Provide a mock vector store (Qdrant) client."""
    store = MagicMock()
    store.search = MagicMock(return_value=[])
    store.upsert = MagicMock(return_value=True)
    store.delete = MagicMock(return_value=True)
    return store


@pytest.fixture
def mock_s3_client():
    """Provide a mock S3 client for testing file uploads."""
    client = MagicMock()
    client.upload_file = MagicMock(return_value={"url": "https://s3.example.com/test.pdf"})
    client.download_file = MagicMock(return_value=b"test file content")
    client.delete_file = MagicMock(return_value=True)
    return client


# ============================================================================
# Test Data Fixtures
# ============================================================================


@pytest.fixture
def sample_document() -> Dict[str, Any]:
    """Provide a sample document for knowledge base testing."""
    return {
        "id": str(uuid4()),
        "title": "Test Document",
        "content": "This is test document content for knowledge base testing.",
        "source": "test",
        "metadata": {
            "author": "Test Author",
            "created_at": datetime.utcnow().isoformat(),
        },
    }


@pytest.fixture
def sample_chat_message() -> Dict[str, Any]:
    """Provide a sample chat message."""
    return {
        "role": "user",
        "content": "What is the weather like today?",
        "timestamp": datetime.utcnow().isoformat(),
    }


@pytest.fixture
def sample_feature_flag() -> Dict[str, Any]:
    """Provide a sample feature flag configuration."""
    return {
        "name": "test_feature",
        "enabled": True,
        "description": "Test feature flag",
        "rollout_percentage": 100,
        "user_overrides": {},
        "created_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# PHI Test Data Fixtures
# ============================================================================


@pytest.fixture
def phi_test_data() -> Dict[str, Any]:
    """Provide test data containing PHI for redaction testing."""
    return {
        "text_with_ssn": "Patient SSN is 123-45-6789",
        "text_with_phone": "Call me at 555-123-4567",
        "text_with_email": "Contact: patient@example.com",
        "text_with_mrn": "Medical Record Number: MRN-123456",
        "text_with_multiple": "John Doe, SSN: 987-65-4321, Phone: 555-987-6543",
        "text_without_phi": "The weather is nice today.",
    }


@pytest.fixture
def phi_patterns() -> Dict[str, str]:
    """Provide regex patterns for PHI detection testing."""
    return {
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
        "phone": r"\b\d{3}-\d{3}-\d{4}\b",
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "mrn": r"\bMRN-\d{6}\b",
    }


# ============================================================================
# Metrics and Monitoring Fixtures
# ============================================================================


@pytest.fixture
def mock_prometheus_registry():
    """Provide a mock Prometheus metrics registry."""
    registry = MagicMock()
    registry.register = MagicMock()
    registry.unregister = MagicMock()
    registry.get_sample_value = MagicMock(return_value=0.0)
    return registry


@pytest.fixture
def mock_counter():
    """Provide a mock Prometheus counter metric."""
    counter = MagicMock()
    counter.inc = MagicMock()
    counter.labels = MagicMock(return_value=counter)
    return counter


@pytest.fixture
def mock_gauge():
    """Provide a mock Prometheus gauge metric."""
    gauge = MagicMock()
    gauge.set = MagicMock()
    gauge.inc = MagicMock()
    gauge.dec = MagicMock()
    gauge.labels = MagicMock(return_value=gauge)
    return gauge


@pytest.fixture
def mock_histogram():
    """Provide a mock Prometheus histogram metric."""
    histogram = MagicMock()
    histogram.observe = MagicMock()
    histogram.time = MagicMock()
    histogram.labels = MagicMock(return_value=histogram)
    return histogram


# ============================================================================
# Cleanup Fixtures
# ============================================================================


@pytest.fixture(autouse=True)
def cleanup_test_files():
    """Automatically clean up any test files created during testing."""
    test_files = []

    yield test_files

    # Clean up files after test
    for filepath in test_files:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass  # Best effort cleanup


@pytest.fixture
def temp_directory(tmp_path):
    """Provide a temporary directory that is cleaned up after the test."""
    return tmp_path


# ============================================================================
# Parametrized Test Data
# ============================================================================


@pytest.fixture(params=[
    ("password123", False, "Too weak - no uppercase or special characters"),
    ("Password123", False, "Missing special character"),
    ("Password123!", True, "Strong password"),
    ("P@ssw0rd!", True, "Strong password with special chars"),
])
def password_test_case(request):
    """Provide parametrized password test cases."""
    return request.param


# ============================================================================
# Response Validation Helpers
# ============================================================================


def assert_api_envelope_success(response_data: Dict[str, Any], expected_data: Any = None):
    """Assert that an API response follows the envelope format and is successful."""
    assert response_data["success"] is True
    assert response_data["error"] is None
    assert "trace_id" in response_data
    assert "timestamp" in response_data

    if expected_data is not None:
        assert response_data["data"] == expected_data


def assert_api_envelope_error(
    response_data: Dict[str, Any],
    expected_code: str,
    expected_message: str = None
):
    """Assert that an API response follows the envelope format and contains an error."""
    assert response_data["success"] is False
    assert response_data["data"] is None
    assert response_data["error"] is not None
    assert response_data["error"]["code"] == expected_code

    if expected_message:
        assert expected_message in response_data["error"]["message"]

    assert "trace_id" in response_data
    assert "timestamp" in response_data


# Export helper functions so they can be imported in tests
pytest.assert_api_envelope_success = assert_api_envelope_success
pytest.assert_api_envelope_error = assert_api_envelope_error
