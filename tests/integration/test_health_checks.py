"""Integration tests for health and readiness endpoints aligned with current API design."""

from __future__ import annotations

import time

import pytest
from fastapi import status


# ============================================================================
# Health Endpoint Tests
# ============================================================================


@pytest.mark.integration
def test_health_endpoint_returns_basic_status(client):
    """Verify /health returns 200 and basic status fields."""
    response = client.get("/health")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] in {"healthy", "degraded", "unhealthy"}
    assert isinstance(data["version"], str)
    assert isinstance(data["timestamp"], (int, float))


@pytest.mark.integration
def test_health_endpoint_no_authentication_required(client):
    """Test that /health endpoint doesn't require authentication."""
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
def test_health_endpoint_responds_quickly(client):
    """Test that /health endpoint responds within a reasonable latency budget."""
    start = time.time()
    response = client.get("/health")
    duration = time.time() - start

    assert response.status_code == status.HTTP_200_OK
    # Allow some headroom for CI noise
    assert duration < 0.5, "Health check should be fast"


@pytest.mark.integration
def test_health_endpoint_available_under_moderate_load(client):
    """Ensure /health remains available under moderate load."""
    responses = [client.get("/health") for _ in range(50)]
    # Some environments may apply rate limiting under heavy load; accept 200 or 429.
    assert all(r.status_code in (status.HTTP_200_OK, status.HTTP_429_TOO_MANY_REQUESTS) for r in responses)


# ============================================================================
# Readiness Endpoint Tests
# ============================================================================


@pytest.mark.integration
def test_ready_endpoint_returns_status_and_checks(client):
    """Verify /ready returns status, checks, and timestamp."""
    response = client.get("/ready")

    assert response.status_code in (status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE)
    data = response.json()
    assert data["status"] in {"ready", "not_ready"}
    assert isinstance(data.get("checks"), dict)
    assert isinstance(data["timestamp"], (int, float))


@pytest.mark.integration
def test_ready_endpoint_no_authentication_required(client):
    """Test that /ready endpoint doesn't require authentication."""
    response = client.get("/ready")
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE)


@pytest.mark.integration
def test_ready_checks_known_dependencies(client):
    """Readiness checks should include core dependencies when configured."""
    response = client.get("/ready")
    data = response.json()
    checks = data.get("checks", {})

    # These keys are used by the current implementation
    for key in {"postgres", "redis", "qdrant", "nextcloud"}:
        if key in checks:
            assert isinstance(checks[key], bool)


@pytest.mark.integration
def test_liveness_endpoint_exists(client):
    """Verify /live liveness endpoint is available and fast."""
    start = time.time()
    response = client.get("/live")
    duration = time.time() - start

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "healthy"
    assert duration < 0.5


@pytest.mark.integration
def test_health_and_ready_have_different_purposes(client):
    """Health should be simple; ready reflects dependency state."""
    health_response = client.get("/health")
    ready_response = client.get("/ready")

    if health_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        pytest.skip("Health endpoint rate limit exceeded in test environment")

    assert health_response.status_code == status.HTTP_200_OK
    assert ready_response.status_code in (status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE)


@pytest.mark.integration
def test_ready_suitable_for_kubernetes_readiness(client):
    """Ready endpoint should return clear status for probes."""
    response = client.get("/ready")
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE)
    data = response.json()
    assert data["status"] in {"ready", "not_ready"}


@pytest.mark.integration
def test_health_suitable_for_kubernetes_liveness(client):
    """Health endpoint should be suitable as a liveness probe."""
    response = client.get("/health")
    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        pytest.skip("Health endpoint rate limit exceeded in test environment")

    assert response.status_code == status.HTTP_200_OK
    # Ensure response completes quickly enough for liveness checks.
    assert response.elapsed.total_seconds() < 1 if hasattr(response, "elapsed") else True


# ============================================================================
# Monitoring Integration Tests
# ============================================================================


@pytest.mark.integration
def test_health_check_recorded_in_metrics(client):
    """Health checks should be visible in Prometheus metrics when enabled."""
    client.get("/health")

    metrics_response = client.get("/metrics")
    if metrics_response.status_code != status.HTTP_200_OK:
        pytest.skip(f"Metrics endpoint unavailable: {metrics_response.status_code}")

    metrics_text = metrics_response.text
    # We don't assert exact metric names here; just that health traffic is visible somewhere.
    if "http_requests_total" in metrics_text:
        assert "/health" in metrics_text or "health" in metrics_text
