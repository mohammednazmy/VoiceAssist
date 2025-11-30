"""Pytest fixtures for E2E tests (Phase 7 - P2.2).

Provides realistic test fixtures that interact with actual services:
- Real database connections (test schema)
- Real Redis connections (test database)
- Real Qdrant connections (test collection)
- Mock external APIs (OpenAI, Nextcloud)
"""

import asyncio
import os
from typing import AsyncGenerator, Generator

import pytest
import redis.asyncio as redis
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.user import User
from app.services.cache_service import cache_service
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Test database configuration
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://voiceassist:changeme_secure_password@localhost:5432/voiceassist_test"
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def test_db_engine():
    """Create a test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        poolclass=StaticPool,
        echo=False,
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)

    yield engine

    # Drop all tables after test
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def test_db_session(test_db_engine) -> Generator[Session, None, None]:
    """Create a test database session."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_db_engine)
    session = SessionLocal()

    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def client(test_db_session: Session) -> TestClient:
    """Create a test client with dependency overrides."""

    def override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)

    yield client

    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
async def test_redis() -> AsyncGenerator[redis.Redis, None]:
    """Create a test Redis client (database 15 for testing)."""
    client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        db=15,  # Use database 15 for E2E tests
        decode_responses=False,
    )

    # Clear test database before test
    await client.flushdb()

    yield client

    # Clear test database after test
    await client.flushdb()
    await client.aclose()


@pytest.fixture(scope="function")
def test_qdrant() -> Generator[QdrantClient, None, None]:
    """Create a test Qdrant client with test collection."""
    client = QdrantClient(url=settings.QDRANT_URL)

    test_collection = "test_medical_kb"

    # Delete test collection if it exists
    try:
        client.delete_collection(collection_name=test_collection)
    except Exception:
        pass

    # Create fresh test collection
    from qdrant_client.models import Distance, VectorParams

    client.create_collection(
        collection_name=test_collection,
        vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
    )

    yield client

    # Clean up test collection
    try:
        client.delete_collection(collection_name=test_collection)
    except Exception:
        pass


@pytest.fixture(scope="function")
def test_user(test_db_session: Session) -> User:
    """Create a test user."""
    from app.core.security import get_password_hash

    user = User(
        email="testuser@example.com",
        full_name="Test User",
        hashed_password=get_password_hash("Test123!@#"),
        is_active=True,
        is_admin=False,
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    return user


@pytest.fixture(scope="function")
def test_admin_user(test_db_session: Session) -> User:
    """Create a test admin user."""
    from app.core.security import get_password_hash

    admin = User(
        email="admin@example.com",
        full_name="Admin User",
        hashed_password=get_password_hash("Admin123!@#"),
        is_active=True,
        is_admin=True,
    )
    test_db_session.add(admin)
    test_db_session.commit()
    test_db_session.refresh(admin)

    return admin


@pytest.fixture(scope="function")
def auth_headers(client: TestClient, test_user: User) -> dict:
    """Get authentication headers for test user."""
    response = client.post("/api/auth/login", json={"email": "testuser@example.com", "password": "Test123!@#"})
    assert response.status_code == 200
    data = response.json()
    # Response is TokenResponse directly, not wrapped in data envelope
    access_token = data["access_token"]

    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="function")
def admin_auth_headers(client: TestClient, test_admin_user: User) -> dict:
    """Get authentication headers for admin user."""
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "Admin123!@#"})
    assert response.status_code == 200
    data = response.json()
    # Response is TokenResponse directly, not wrapped in data envelope
    access_token = data["access_token"]

    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="function", autouse=True)
async def clear_cache():
    """Clear cache before each test."""
    try:
        await cache_service.clear()
    except Exception:
        pass  # Cache might not be available in all tests


@pytest.fixture(scope="function")
def sample_medical_document() -> str:
    """Sample medical document for testing."""
    return """
    # Diabetes Mellitus Type 2 - Clinical Guidelines

    ## Diagnosis
    - Fasting plasma glucose ≥126 mg/dL (7.0 mmol/L)
    - HbA1c ≥6.5% (48 mmol/mol)
    - Random plasma glucose ≥200 mg/dL (11.1 mmol/L) with symptoms

    ## Initial Treatment
    - Lifestyle modifications (diet, exercise)
    - Metformin 500-1000mg twice daily
    - Target HbA1c <7% for most patients

    ## Monitoring
    - HbA1c every 3 months until stable
    - Annual comprehensive foot exam
    - Annual eye exam
    - Quarterly BP and weight checks
    """
