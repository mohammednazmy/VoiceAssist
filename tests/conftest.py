"""
Pytest configuration and shared fixtures for VoiceAssist test suite.
Phase 13: Final Testing & Documentation
"""

import asyncio
import os
from typing import AsyncGenerator, Generator

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

# Test environment configuration
_default_db_url = os.getenv("DATABASE_URL")
if _default_db_url:
    # Map container-internal postgres:5432 to host localhost:5433 when using docker-compose.override.yml
    _default_test_db_url = _default_db_url.replace("postgres:5432", "localhost:5433")
else:
    # Default to the external Postgres port exposed by docker-compose.override.yml
    _default_test_db_url = "postgresql://voiceassist:voiceassist_password@localhost:5433/voiceassist_test"

TEST_DB_URL = os.getenv("TEST_DATABASE_URL", _default_test_db_url)
TEST_API_BASE_URL = os.getenv("TEST_API_BASE_URL", "http://localhost:8000")
TEST_ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@test.com")
TEST_ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "Test123!@#")
TEST_USER_EMAIL = os.getenv("TEST_USER_EMAIL", "integration_user@example.com")
TEST_USER_PASSWORD = os.getenv("TEST_USER_PASSWORD", "correct_password")


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
    try:
        # Verify connectivity once; if unavailable, skip database-dependent tests
        try:
            session.execute(text("SELECT 1"))
        except OperationalError:
            pytest.skip(f"Test database unavailable at {TEST_DB_URL}")

        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="session")
async def api_client() -> AsyncGenerator["AsyncAPIClient", None]:
    """Create async HTTP client wrapper for API testing."""
    client = AsyncAPIClient(base_url=TEST_API_BASE_URL, timeout=30.0)
    yield client


@pytest.fixture(scope="session")
async def admin_token(api_client: AsyncClient) -> str:
    """Obtain admin authentication token."""
    response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            return token

    # If admin doesn't exist or login failed, try to register
    response = await api_client.post(
        "/api/auth/register",
        json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD,
            "full_name": "Test Admin",
            "role": "admin"
        }
    )
    if response.status_code not in (200, 201, 400, 409, 429):
        pytest.skip(f"Auth service unavailable for admin_token fixture: {response.status_code}")

    # Attempt login after registration or when user already exists / is rate-limited.
    login_response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    if login_response.status_code != 200:
        pytest.skip(f"Unable to log in admin user for admin_token fixture: {login_response.status_code}")
    login_data = login_response.json()
    token = login_data.get("access_token")
    if not token:
        pytest.skip("Admin login response missing access_token")
    return token


@pytest.fixture(scope="session")
async def user_token(api_client: AsyncClient) -> str:
    """Obtain regular user authentication token."""
    response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            return token

    # If user doesn't exist or login failed, try to register
    response = await api_client.post(
        "/api/auth/register",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "full_name": "Test User",
            "role": "user"
        }
    )
    if response.status_code not in (200, 201, 400, 409, 429):
        pytest.skip(f"Auth service unavailable for user_token fixture: {response.status_code}")

    # Attempt login after registration or when user already exists / is rate-limited.
    login_response = await api_client.post(
        "/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
    )
    if login_response.status_code != 200:
        pytest.skip(f"Unable to log in test user for user_token fixture: {login_response.status_code}")
    login_data = login_response.json()
    token = login_data.get("access_token")
    if not token:
        pytest.skip("User login response missing access_token")
    return token


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


class APIClient:
    """Synchronous API client wrapper used by integration tests.

    Provides a minimal requests-like interface backed by httpx.Client,
    with a mutable headers attribute and automatic base_url prefixing.
    """

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout)

    @property
    def headers(self) -> httpx.Headers:
        return self._client.headers

    @headers.setter
    def headers(self, value: dict) -> None:
        # Replace default headers with provided ones
        self._client.headers.clear()
        self._client.headers.update(value)

    def get(self, url: str, **kwargs):
        return self._client.get(url, **kwargs)

    def post(self, url: str, **kwargs):
        return self._client.post(url, **kwargs)

    def delete(self, url: str, **kwargs):
        return self._client.delete(url, **kwargs)

    def patch(self, url: str, **kwargs):
        return self._client.patch(url, **kwargs)

    def close(self) -> None:
        self._client.close()


class AsyncAPIClient:
    """Async HTTP client wrapper that avoids binding to a single event loop.

    Each request uses a fresh httpx.AsyncClient under the hood so that
    the session-scoped fixture can be used across multiple event loops.
    """

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self._base_url = base_url
        self._timeout = timeout

    async def get(self, url: str, **kwargs):
        async with AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            return await client.get(url, **kwargs)

    async def post(self, url: str, **kwargs):
        async with AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            return await client.post(url, **kwargs)

    async def delete(self, url: str, **kwargs):
        async with AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            return await client.delete(url, **kwargs)

    async def patch(self, url: str, **kwargs):
        async with AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            return await client.patch(url, **kwargs)


@pytest.fixture
def client() -> Generator[APIClient, None, None]:
    """Synchronous HTTP client for integration tests."""
    api_client = APIClient(base_url=TEST_API_BASE_URL, timeout=30.0)
    try:
        yield api_client
    finally:
        api_client.close()


@pytest.fixture
def test_user(client: APIClient) -> dict:
    """Ensure a test user exists and return its basic info."""
    user_data = {
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "full_name": "Integration Test User",
    }

    # Try to register the user; if it already exists, that's fine.
    register_resp = client.post("/api/auth/register", json=user_data)
    # Treat 429 (rate limit) the same as "already exists" so that
    # tests can proceed by logging in when the registration endpoint
    # is temporarily rate-limited in shared environments.
    if register_resp.status_code not in (200, 201, 400, 429):
        pytest.skip(f"Auth service unavailable for test_user fixture: {register_resp.status_code}")

    if register_resp.status_code in (200, 201):
        payload = register_resp.json()
        # Contract tests expect bare UserResponse, not envelope.
        user_id = payload.get("id")
    else:
        # Email already registered - log in to retrieve user id via /api/auth/me
        login_resp = client.post(
            "/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        )
        if login_resp.status_code != 200:
            pytest.skip(f"Unable to log in test user: {login_resp.status_code}")
        tokens = login_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            pytest.skip("Login response missing access_token for test_user")
        client.headers = {"Authorization": f"Bearer {access_token}"}
        me_resp = client.get("/api/auth/me")
        if me_resp.status_code != 200:
            pytest.skip(f"Unable to fetch /api/auth/me for test_user: {me_resp.status_code}")
        user_payload = me_resp.json()
        user_id = user_payload.get("id")

    return {
        "id": user_id,
        "email": TEST_USER_EMAIL,
        "username": TEST_USER_EMAIL.split("@")[0],
    }


@pytest.fixture
def authenticated_client(client: APIClient, test_user: dict) -> APIClient:
    """Client authenticated as the test user."""
    login_resp = client.post(
        "/api/auth/login",
        json={"email": test_user["email"], "password": TEST_USER_PASSWORD},
    )
    if login_resp.status_code != 200:
        pytest.skip(f"Unable to authenticate test user: {login_resp.status_code}")
    tokens = login_resp.json()
    access_token = tokens.get("access_token")
    if not access_token:
        pytest.skip("Authenticated login response missing access_token")
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client


@pytest.fixture
def test_admin_token(client: APIClient) -> str:
    """Obtain an admin JWT token for synchronous tests."""
    login_resp = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    if login_resp.status_code == 200:
        data = login_resp.json()
        token = data.get("access_token")
        if token:
            return token

    # Attempt to register an admin user if login failed
    register_resp = client.post(
        "/api/auth/register",
        json={
            "email": TEST_ADMIN_EMAIL,
            "password": TEST_ADMIN_PASSWORD,
            "full_name": "Test Admin",
        },
    )
    if register_resp.status_code not in (200, 201, 400):
        pytest.skip(f"Unable to register admin user: {register_resp.status_code}")

    # Try login again
    login_resp = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    if login_resp.status_code != 200:
        pytest.skip(f"Unable to obtain admin token: {login_resp.status_code}")
    data = login_resp.json()
    token = data.get("access_token")
    if not token:
        pytest.skip("Admin login response missing access_token")
    return token


@pytest.fixture
def sample_feature_flag(authenticated_client: APIClient, test_admin_token: str) -> dict:
    """Create or fetch a sample feature flag for integration tests."""
    authenticated_client.headers = {"Authorization": f"Bearer {test_admin_token}"}
    flag_data = {
        "name": "test_feature",
        "description": "Test feature flag for integration tests",
        "enabled": False,
        "flag_type": "boolean",
    }

    create_resp = authenticated_client.post("/api/admin/feature-flags", json=flag_data)
    if create_resp.status_code == 201:
        payload = create_resp.json()
        return payload.get("data", {})

    # If already exists, fetch it
    get_resp = authenticated_client.get(f"/api/admin/feature-flags/{flag_data['name']}")
    if get_resp.status_code != 200:
        pytest.skip(f"Feature flags API unavailable: {get_resp.status_code}")
    return get_resp.json().get("data", {})


@pytest.fixture
def expired_token() -> str:
    """Dummy expired/invalid token for negative-path tests."""
    return "expired_or_invalid_token"
