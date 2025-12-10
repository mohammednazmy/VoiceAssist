"""
Smoke tests for health endpoints.

These tests verify health endpoints work WITHOUT requiring the full app stack
(no Qdrant, Redis, Postgres needed). This is achieved by mocking the database
module before importing the health router.

For full integration tests that test health checks against real services,
see the e2e test suite.
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# Mock the database module BEFORE importing the health router
# This prevents Qdrant/Redis/Postgres connections at import time
@pytest.fixture(scope="module")
def mock_database():
    """Mock database module to prevent connection attempts."""
    mock_engine = MagicMock()
    mock_engine.pool.size.return_value = 20
    mock_engine.pool.checkedout.return_value = 0

    mock_redis = MagicMock()
    mock_redis.info.return_value = {"used_memory": 1024 * 1024}

    with patch.dict(
        "sys.modules",
        {
            "app.core.database": MagicMock(
                check_postgres_connection=MagicMock(return_value=True),
                check_redis_connection=MagicMock(return_value=True),
                check_qdrant_connection=AsyncMock(return_value=True),
                engine=mock_engine,
                redis_client=mock_redis,
            ),
            "app.services.nextcloud": MagicMock(
                check_nextcloud_connection=AsyncMock(return_value=True),
            ),
        },
    ):
        yield


@pytest.fixture
def minimal_app(mock_database):
    """Create a minimal FastAPI app with only the health router.

    This avoids importing app.main which triggers database/Qdrant connections.
    """
    # Now we can safely import the health router
    from app.api.health import router as health_router
    from fastapi import FastAPI

    app = FastAPI(title="Health Test App")
    app.include_router(health_router)
    return app


@pytest.fixture
def client(minimal_app):
    """Create a test client for the minimal app."""
    from fastapi.testclient import TestClient

    return TestClient(minimal_app)


class TestBasicHealthEndpoint:
    """Tests for the basic /health endpoint."""

    @pytest.mark.smoke
    def test_health_endpoint_exists(self, client):
        """Test that /health endpoint is accessible and returns 200."""
        response = client.get("/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    @pytest.mark.smoke
    def test_health_endpoint_structure(self, client):
        """Test that /health endpoint returns expected structure."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()

        # Verify basic response structure
        assert "status" in data, "Response should have 'status' field"
        assert "timestamp" in data, "Response should have 'timestamp' field"
        assert "version" in data, "Response should have 'version' field"

        # Status should be either "healthy" or "degraded"
        assert data["status"] in [
            "healthy",
            "degraded",
        ], f"Status should be 'healthy' or 'degraded', got '{data['status']}'"


class TestOpenAIHealthEndpoint:
    """Tests for the /health/openai endpoint.

    These tests verify the endpoint structure and behavior without requiring
    a live OpenAI connection. The endpoint will return either:
    - 200 OK if OPENAI_API_KEY is configured and API is accessible
    - 503 Service Unavailable if key is missing or API is unreachable
    """

    @pytest.mark.smoke
    def test_openai_health_endpoint_exists(self, client):
        """Test that /health/openai endpoint is accessible."""
        response = client.get("/health/openai")

        # Should return either 200 (ok) or 503 (not configured/not accessible)
        assert response.status_code in [
            200,
            503,
        ], f"Expected 200 or 503, got {response.status_code}"

    @pytest.mark.smoke
    def test_openai_health_endpoint_structure(self, client):
        """Test that /health/openai endpoint returns expected structure."""
        response = client.get("/health/openai")
        data = response.json()

        # Verify required fields are present
        assert "status" in data, "Response should have 'status' field"
        assert "configured" in data, "Response should have 'configured' field"
        assert "accessible" in data, "Response should have 'accessible' field"
        assert "timestamp" in data, "Response should have 'timestamp' field"

        # Status should be "ok" or "error"
        assert data["status"] in [
            "ok",
            "error",
        ], f"Status should be 'ok' or 'error', got '{data['status']}'"

        # configured should be boolean
        assert isinstance(data["configured"], bool), "configured should be boolean"

        # If accessible, should have latency_ms
        if data["accessible"]:
            assert "latency_ms" in data, "If accessible, should have latency_ms"
            assert isinstance(data["latency_ms"], (int, float)), "latency_ms should be numeric"

        # If error, should have error message
        if data["status"] == "error":
            assert "error" in data, "If error status, should have error message"

    @pytest.mark.smoke
    def test_openai_health_configured_field_logic(self, client):
        """Test that configured field reflects OPENAI_API_KEY presence."""
        response = client.get("/health/openai")
        data = response.json()

        # If configured is False, status should be "error"
        if not data["configured"]:
            assert data["status"] == "error", "If not configured, status should be 'error'"
            assert "error" in data, "If not configured, should have error message"

    @pytest.mark.smoke
    def test_openai_health_response_time(self, client):
        """Test that the endpoint responds within a reasonable time."""
        start = time.time()
        response = client.get("/health/openai")
        elapsed = time.time() - start

        # Should respond within 15 seconds (generous for API call)
        assert elapsed < 15, f"Endpoint took {elapsed:.2f}s, expected < 15s"

        # Response should be valid JSON
        data = response.json()
        assert "status" in data
