"""
Pytest configuration and shared fixtures for VoiceAssist test suite.
Phase 13: Final Testing & Documentation
"""

import pytest
import asyncio
import os
from typing import Generator, AsyncGenerator
from httpx import AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Test environment configuration
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "postgresql://voiceassist:voiceassist_password@localhost:5432/voiceassist_test")
TEST_API_BASE_URL = os.getenv("TEST_API_BASE_URL", "http://localhost:8000")
TEST_ADMIN_EMAIL = "admin@test.com"
TEST_ADMIN_PASSWORD = "Test123!@#"
TEST_USER_EMAIL = "user@test.com"
TEST_USER_PASSWORD = "User123!@#"


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_db_engine():
    """Create test database engine."""
    engine = create_engine(TEST_DB_URL, echo=False)
    yield engine
    engine.dispose()


@pytest.fixture(scope="function")
def test_db_session(test_db_engine):
    """Create database session for each test."""
    Session = sessionmaker(bind=test_db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="session")
async def api_client() -> AsyncGenerator[AsyncClient, None]:
    """Create async HTTP client for API testing."""
    async with AsyncClient(base_url=TEST_API_BASE_URL, timeout=30.0) as client:
        yield client


@pytest.fixture(scope="session")
async def admin_token(api_client: AsyncClient) -> str:
    """Obtain admin authentication token."""
    response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    # If admin doesn't exist, try to register
    response = await api_client.post(
        "/api/auth/register",
        json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD,
            "full_name": "Test Admin",
            "role": "admin"
        }
    )
    if response.status_code == 201:
        login_response = await api_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
        )
        return login_response.json()["access_token"]
    raise Exception("Failed to obtain admin token")


@pytest.fixture(scope="session")
async def user_token(api_client: AsyncClient) -> str:
    """Obtain regular user authentication token."""
    response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    # If user doesn't exist, try to register
    response = await api_client.post(
        "/api/auth/register",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "full_name": "Test User",
            "role": "user"
        }
    )
    if response.status_code == 201:
        login_response = await api_client.post(
            "/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        return login_response.json()["access_token"]
    raise Exception("Failed to obtain user token")


@pytest.fixture
def auth_headers_admin(admin_token: str) -> dict:
    """Create authentication headers for admin requests."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def auth_headers_user(user_token: str) -> dict:
    """Create authentication headers for user requests."""
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture
def sample_audio_file():
    """Provide path to sample audio file for voice tests."""
    return "tests/fixtures/sample_audio.wav"


@pytest.fixture
def sample_medical_document():
    """Provide path to sample medical document for RAG tests."""
    return "tests/fixtures/sample_medical_document.pdf"


# Pytest configuration
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line("markers", "e2e: End-to-end integration tests")
    config.addinivalue_line("markers", "voice: Voice interaction tests")
    config.addinivalue_line("markers", "integration: Service integration tests")
    config.addinivalue_line("markers", "slow: Slow-running tests")
    config.addinivalue_line("markers", "requires_services: Tests requiring external services")
