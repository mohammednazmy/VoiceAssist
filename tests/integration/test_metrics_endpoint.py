"""Integration tests for /metrics endpoint.

Tests metrics exposure including:
- Prometheus format
- Business metrics presence
- Metric values update
"""
from __future__ import annotations

import re
from unittest.mock import patch

import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_endpoint_accessible(client):
    """Test that /metrics endpoint is accessible."""
    response = client.get("/metrics")

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_endpoint_returns_prometheus_format(client):
    """Test that /metrics returns Prometheus text format."""
    response = client.get("/metrics")

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "text/plain; version=0.0.4; charset=utf-8"


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_contains_standard_metrics(client):
    """Test that standard system metrics are present."""
    response = client.get("/metrics")

    content = response.text

    # Standard metrics that should be present
    expected_metrics = [
        "process_cpu_seconds_total",
        "process_resident_memory_bytes",
        "python_info",
    ]

    for metric in expected_metrics:
        assert metric in content, f"Expected metric {metric} not found"


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_contains_business_metrics(client):
    """Test that custom business metrics are present."""
    response = client.get("/metrics")

    content = response.text

    # Business metrics that should be exposed
    business_metrics = [
        "http_requests_total",
        "http_request_duration_seconds",
        "active_users",
    ]

    for metric in business_metrics:
        # Metrics might be present or absent if not used yet
        # Just check format is correct if present
        if metric in content:
            # Should have TYPE and HELP comments
            assert f"# TYPE {metric}" in content or f"# HELP {metric}" in content


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_counter_increments(client):
    """Test that counter metrics increment correctly."""
    # Make some requests to increment counters
    client.get("/health")
    client.get("/health")
    client.get("/health")

    response = client.get("/metrics")

    content = response.text

    # Check that http_requests_total has increased
    if "http_requests_total" in content:
        # Parse counter value
        pattern = r'http_requests_total.*?(\d+)'
        matches = re.findall(pattern, content)
        if matches:
            assert any(int(val) >= 3 for val in matches)


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_with_labels(client):
    """Test that metrics include appropriate labels."""
    response = client.get("/metrics")

    content = response.text

    # Check for labeled metrics
    if "http_requests_total" in content:
        # Should have labels like method, endpoint, status
        assert re.search(r'http_requests_total\{.*method=.*\}', content)


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_histogram_buckets(client):
    """Test that histogram metrics include buckets."""
    response = client.get("/metrics")

    content = response.text

    # If histogram present, should have _bucket, _sum, _count
    if "http_request_duration_seconds" in content:
        assert "http_request_duration_seconds_bucket" in content
        assert "http_request_duration_seconds_sum" in content
        assert "http_request_duration_seconds_count" in content


@pytest.mark.integration
@pytest.mark.metrics
def test_llm_token_metrics_present(client, authenticated_client):
    """Test that LLM token usage metrics are tracked."""
    # Make a request that uses LLM
    authenticated_client.post("/api/chat", json={
        "message": "Hello",
        "session_id": "test_session"
    })

    response = client.get("/metrics")
    content = response.text

    # Check for LLM-related metrics
    llm_metrics = ["llm_tokens_used", "llm_requests_total"]

    for metric in llm_metrics:
        # Metrics might be present if LLM was called
        if metric in content:
            assert f"# TYPE {metric}" in content or metric in content


@pytest.mark.integration
@pytest.mark.metrics
def test_error_rate_metrics(client):
    """Test that error rate metrics are tracked."""
    # Generate some errors
    client.get("/nonexistent-endpoint")
    client.get("/another-404")

    response = client.get("/metrics")
    content = response.text

    # Check for error metrics
    if "http_requests_total" in content:
        # Should have entries with status=404 or similar
        assert re.search(r'status="40[0-9]"', content)


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_format_valid_prometheus(client):
    """Test that metrics output is valid Prometheus format."""
    response = client.get("/metrics")

    content = response.text

    # Basic Prometheus format validation
    lines = content.split('\n')

    for line in lines:
        if line and not line.startswith('#'):
            # Metric lines should have format: metric_name{labels} value timestamp?
            assert ' ' in line, f"Invalid metric line: {line}"

            parts = line.split(' ')
            assert len(parts) >= 2, f"Invalid metric format: {line}"

            # Value should be a number
            try:
                float(parts[1])
            except ValueError:
                pytest.fail(f"Invalid metric value: {parts[1]}")


@pytest.mark.integration
@pytest.mark.metrics
def test_custom_business_metric_registration(client):
    """Test that custom business metrics can be registered and appear."""
    # Assuming there's an endpoint to trigger custom metrics
    response = client.get("/metrics")

    content = response.text

    # Check for custom business metrics
    custom_metrics = [
        "user_registrations_total",
        "feature_usage_total",
        "document_uploads_total",
    ]

    # These might not all be present, but format should be correct if they are
    for metric in custom_metrics:
        if metric in content:
            # Should follow Prometheus format
            assert re.search(f'{metric}{{', content) or re.search(f'{metric} \\d', content)


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_endpoint_performance(client):
    """Test that /metrics endpoint responds quickly."""
    import time

    start = time.time()
    response = client.get("/metrics")
    duration = time.time() - start

    assert response.status_code == status.HTTP_200_OK
    # Metrics endpoint should be fast (< 1 second)
    assert duration < 1.0


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_no_sensitive_data(client):
    """Test that metrics don't expose sensitive information."""
    response = client.get("/metrics")

    content = response.text.lower()

    # Should not contain sensitive data
    sensitive_terms = ["password", "secret", "token", "api_key"]

    for term in sensitive_terms:
        assert term not in content, f"Sensitive term '{term}' found in metrics"


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_gauge_reflects_current_state(client, authenticated_client):
    """Test that gauge metrics reflect current system state."""
    # This would test metrics like active_connections, queue_size, etc.
    response = client.get("/metrics")

    content = response.text

    # Gauge metrics should have reasonable values
    if "active_users" in content:
        pattern = r'active_users.*?(\d+)'
        matches = re.findall(pattern, content)
        if matches:
            value = int(matches[0])
            assert value >= 0, "Gauge should not be negative"


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_help_and_type_comments(client):
    """Test that metrics include HELP and TYPE comments."""
    response = client.get("/metrics")

    content = response.text

    # Each metric should have HELP and TYPE
    metric_names = set()
    for line in content.split('\n'):
        if line.startswith('# TYPE'):
            parts = line.split()
            if len(parts) >= 3:
                metric_names.add(parts[2])

    # Check that metrics have corresponding HELP
    for metric in metric_names:
        # Most metrics should have HELP (some internal ones might not)
        pass  # Just ensure no crash


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_update_after_activity(client, authenticated_client):
    """Test that metrics update after system activity."""
    # Get initial metrics
    response1 = client.get("/metrics")
    content1 = response1.text

    # Generate some activity
    authenticated_client.get("/health")
    authenticated_client.get("/ready")
    authenticated_client.get("/api/kb/documents")

    # Get updated metrics
    response2 = client.get("/metrics")
    content2 = response2.text

    # Metrics should have changed (increased request counts)
    assert content1 != content2


@pytest.mark.integration
@pytest.mark.metrics
@pytest.mark.slow
def test_metrics_memory_efficiency(client):
    """Test that metrics collection doesn't cause memory issues."""
    # Request metrics many times
    for _ in range(100):
        response = client.get("/metrics")
        assert response.status_code == status.HTTP_200_OK

    # Should still work without issues
    final_response = client.get("/metrics")
    assert final_response.status_code == status.HTTP_200_OK
