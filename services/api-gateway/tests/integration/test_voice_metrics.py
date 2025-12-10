"""Tests for Voice Metrics API endpoint.

These tests verify the /voice/metrics endpoint for observability data collection.

The endpoint receives timing and count metrics from frontend voice sessions.
No transcript content or PHI is sent - only timing and counts.

Usage:
    pytest tests/integration/test_voice_metrics.py -v
"""

import pytest

# Markers for test categorization
pytestmark = [pytest.mark.integration]


class TestVoiceMetricsPayloadModel:
    """Test VoiceMetricsPayload Pydantic model (no app required)."""

    def test_payload_model_has_all_fields(self):
        """Test VoiceMetricsPayload has all expected fields."""
        from app.api.voice import VoiceMetricsPayload

        # Create with all fields
        payload = VoiceMetricsPayload(
            conversation_id="conv-123",
            connection_time_ms=1500,
            time_to_first_transcript_ms=800,
            last_stt_latency_ms=450,
            last_response_latency_ms=650,
            session_duration_ms=30000,
            user_transcript_count=5,
            ai_response_count=5,
            reconnect_count=1,
            session_started_at=1700000000000,
        )

        assert payload.conversation_id == "conv-123"
        assert payload.connection_time_ms == 1500
        assert payload.time_to_first_transcript_ms == 800
        assert payload.last_stt_latency_ms == 450
        assert payload.last_response_latency_ms == 650
        assert payload.session_duration_ms == 30000
        assert payload.user_transcript_count == 5
        assert payload.ai_response_count == 5
        assert payload.reconnect_count == 1
        assert payload.session_started_at == 1700000000000

    def test_payload_model_defaults(self):
        """Test VoiceMetricsPayload has correct defaults."""
        from app.api.voice import VoiceMetricsPayload

        payload = VoiceMetricsPayload()

        assert payload.conversation_id is None
        assert payload.connection_time_ms is None
        assert payload.time_to_first_transcript_ms is None
        assert payload.last_stt_latency_ms is None
        assert payload.last_response_latency_ms is None
        assert payload.session_duration_ms is None
        assert payload.user_transcript_count == 0
        assert payload.ai_response_count == 0
        assert payload.reconnect_count == 0
        assert payload.session_started_at is None

    def test_payload_validation_rejects_invalid_types(self):
        """Test VoiceMetricsPayload rejects invalid type values."""
        from app.api.voice import VoiceMetricsPayload
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            VoiceMetricsPayload(connection_time_ms="not-a-number")

    def test_payload_accepts_zero_counts(self):
        """Test VoiceMetricsPayload accepts zero counts."""
        from app.api.voice import VoiceMetricsPayload

        payload = VoiceMetricsPayload(
            user_transcript_count=0,
            ai_response_count=0,
            reconnect_count=0,
        )

        assert payload.user_transcript_count == 0
        assert payload.ai_response_count == 0
        assert payload.reconnect_count == 0

    def test_payload_accepts_large_values(self):
        """Test VoiceMetricsPayload accepts large metric values."""
        from app.api.voice import VoiceMetricsPayload

        payload = VoiceMetricsPayload(
            session_duration_ms=3600000,  # 1 hour
            user_transcript_count=500,
            ai_response_count=500,
            reconnect_count=10,
        )

        assert payload.session_duration_ms == 3600000
        assert payload.user_transcript_count == 500
        assert payload.ai_response_count == 500
        assert payload.reconnect_count == 10


class TestVoiceMetricsResponseModel:
    """Test VoiceMetricsResponse Pydantic model (no app required)."""

    def test_response_model_structure(self):
        """Test VoiceMetricsResponse has correct structure."""
        from app.api.voice import VoiceMetricsResponse

        response = VoiceMetricsResponse(status="ok")

        assert response.status == "ok"

    def test_response_model_json(self):
        """Test VoiceMetricsResponse serializes to JSON correctly."""
        from app.api.voice import VoiceMetricsResponse

        response = VoiceMetricsResponse(status="ok")
        json_data = response.model_dump()

        assert json_data == {"status": "ok"}


class TestVoiceMetricsEndpointExists:
    """Test that the metrics endpoint is registered (no app instantiation)."""

    def test_metrics_endpoint_is_registered_in_router(self):
        """Test that /voice/metrics POST endpoint is registered."""
        from app.api.voice import router

        # Find the route for /metrics (path includes /voice prefix)
        metrics_route = None
        for route in router.routes:
            path = getattr(route, "path", "")
            if path.endswith("/metrics"):
                metrics_route = route
                break

        assert metrics_route is not None, "POST /voice/metrics endpoint not found"
        assert "POST" in metrics_route.methods, "Expected POST method for /metrics"

    def test_metrics_endpoint_has_correct_response_model(self):
        """Test that /voice/metrics has correct response model."""
        from app.api.voice import VoiceMetricsResponse, router

        # Find the route for /metrics (path includes /voice prefix)
        for route in router.routes:
            path = getattr(route, "path", "")
            if path.endswith("/metrics"):
                # Check response model
                assert route.response_model == VoiceMetricsResponse
                break

    def test_metrics_endpoint_handler_exists(self):
        """Test that post_voice_metrics handler function exists."""
        from app.api.voice import post_voice_metrics

        assert callable(post_voice_metrics)

    def test_metrics_endpoint_has_summary(self):
        """Test that /voice/metrics endpoint has a summary."""
        from app.api.voice import router

        for route in router.routes:
            path = getattr(route, "path", "")
            if path.endswith("/metrics"):
                # The route should have a summary
                assert route.summary is not None or route.name is not None
                break
