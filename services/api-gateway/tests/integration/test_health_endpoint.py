"""
Smoke test for health endpoint (Phase 0-3)

Validates that the /health endpoint is available and returns a valid response.
This is a simple smoke test that doesn't require database or Redis connectivity.
"""

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.mark.smoke
def test_health_endpoint_exists():
    """Test that /health endpoint is accessible and returns 200."""
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"


@pytest.mark.smoke
def test_health_endpoint_structure():
    """Test that /health endpoint returns expected structure."""
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    # Verify basic response structure
    assert "status" in data, "Response should have 'status' field"
    assert "timestamp" in data, "Response should have 'timestamp' field"
    assert "version" in data, "Response should have 'version' field"

    # Status should be either "healthy" or "degraded" (not "unhealthy" in smoke test)
    assert data["status"] in [
        "healthy",
        "degraded",
    ], f"Status should be 'healthy' or 'degraded', got '{data['status']}'"
