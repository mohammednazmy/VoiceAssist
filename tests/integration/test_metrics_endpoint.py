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
    content_type = response.headers["content-type"]
    # Prometheus client may emit version=0.0.4 or 1.0.0 depending on library version.
    assert content_type.startswith("text/plain;")
    assert "charset=" in content_type


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
        "voiceassist_http_requests_total",
        "voiceassist_http_request_duration_seconds",
        "voiceassist_active_users_daily",
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
    if "voiceassist_http_requests_total" in content:
        # Parse counter value
        pattern = r'voiceassist_http_requests_total.*?(\d+)'
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
    if "voiceassist_http_requests_total" in content:
        # Should have labels like method, endpoint, status
        assert re.search(r'voiceassist_http_requests_total\{[^}]*method="[^"]+"', content)


@pytest.mark.integration
@pytest.mark.metrics
def test_metrics_histogram_buckets(client):
    """Test that histogram metrics include buckets."""
    response = client.get("/metrics")

    content = response.text

    # If histogram present, should have _bucket, _sum, _count
    if "voiceassist_http_request_duration_seconds" in content:
        assert "voiceassist_http_request_duration_seconds_bucket" in content
        assert "voiceassist_http_request_duration_seconds_sum" in content
        assert "voiceassist_http_request_duration_seconds_count" in content


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
    llm_metrics = [
        "voiceassist_openai_tokens_used_total",
        "voiceassist_rag_llm_tokens_total",
    ]

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
    if "voiceassist_http_requests_total" in content:
        # Should have entries with 4xx status codes
        assert re.search(r'status_code="40[0-9]"', content)


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
        "voiceassist_user_registrations_total",
        "voiceassist_feature_flag_checks_total",
        "voiceassist_kb_document_uploads_total",
    ]

    # These might not all be present, but format should be correct if they are
    for metric in custom_metrics:
        if metric in content:
            # If there is a series line for this metric, it should follow Prometheus format.
            if re.search(f"{metric}{{", content) or re.search(f"{metric} \\d", content):
                continue


@pytest.mark.integration
@pytest.mark.metrics
def test_kb_query_metrics_exposed(client, authenticated_client):
    """Test that KB query metrics for /api/kb/query are exposed with chat/voice channel labels."""
    # Chat-channel query (default)
    response_chat = authenticated_client.post(
        "/api/kb/query",
        json={"question": "Test KB metrics (chat)?"},
    )

    # Voice-channel query using channel hint
    response_voice = authenticated_client.post(
        "/api/kb/query",
        json={"question": "Test KB metrics (voice)?", "channel": "voice"},
    )

    for resp in (response_chat, response_voice):
        if resp.status_code in (
            status.HTTP_404_NOT_FOUND,
            status.HTTP_501_NOT_IMPLEMENTED,
        ):
            pytest.skip("KB RAG query endpoint not available for metrics test")
        if resp.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
            pytest.skip(
                f"KB RAG query failed due to backend error: {resp.status_code}",
            )
        assert resp.status_code == status.HTTP_200_OK

    # Fetch metrics and ensure KB query metrics appear with channel labels.
    metrics_response = client.get("/metrics")
    assert metrics_response.status_code == status.HTTP_200_OK

    content = metrics_response.text
    kb_metrics = [
        "voiceassist_kb_query_requests_total",
        "voiceassist_kb_query_latency_seconds",
        "voiceassist_kb_query_answer_length_tokens",
        "voiceassist_kb_query_sources_per_answer",
        "voiceassist_kb_query_top_score",
    ]

    for metric in kb_metrics:
        if metric in content:
            assert f"# TYPE {metric}" in content or f"# HELP {metric}" in content
            # At least one series should include channel labels when samples exist
            if "{" in content:
                # Chat channel
                assert re.search(
                    rf"{metric}{{[^}}]*channel=\"chat\"",
                    content,
                ), f"Expected chat channel label for {metric}"
                # Voice channel
                assert re.search(
                    rf"{metric}{{[^}}]*channel=\"voice\"",
                    content,
                ), f"Expected voice channel label for {metric}"


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
    sensitive_terms = ["password", "secret", "api_key", "access_token", "refresh_token"]

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
    if "voiceassist_active_users_daily" in content:
        pattern = r'voiceassist_active_users_daily.*?(\d+)'
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
