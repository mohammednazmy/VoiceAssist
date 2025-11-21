"""Basic tests for the /health endpoint of the API Gateway.

These tests are intentionally lightweight so they can run without
external services (Postgres/Redis/Qdrant). They verify that the
FastAPI application starts and returns the expected shape for /health.
"""
from fastapi.testclient import TestClient

# The API Gateway FastAPI app lives in services/api-gateway/app/main.py
try:
    from services.api_gateway.app.main import app  # type: ignore
except ModuleNotFoundError:
    # Fallback when running tests from within the api-gateway package
    from app.main import app  # type: ignore

client = TestClient(app)


def test_health_endpoint_returns_healthy():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    # Relaxed assertions to keep tests robust across minor changes
    assert isinstance(data, dict)
    assert data.get("status") in {"healthy", "ok"}
    assert "timestamp" in data
    assert "version" in data
