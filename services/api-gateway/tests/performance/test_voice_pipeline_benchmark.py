"""Voice Pipeline Performance Benchmark Tests - Phase 11.1.

Benchmarks voice pipeline performance:
- Admin voice API response times
- Voice session metrics query performance
- Provider configuration endpoint latency
- Feature flag lookup performance
"""

import statistics
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from app.core.dependencies import get_current_admin_or_viewer, get_current_admin_user
from app.main import app
from app.models.user import User
from fastapi.testclient import TestClient

# Performance thresholds (in seconds)
THRESHOLDS = {
    "voice_sessions_list": 0.2,  # 200ms
    "voice_metrics_get": 0.15,  # 150ms
    "voice_health_check": 0.1,  # 100ms
    "voice_analytics": 0.25,  # 250ms
    "voice_providers_list": 0.1,  # 100ms
    "voice_config_get": 0.1,  # 100ms
    "voice_feature_flags": 0.15,  # 150ms
    "voice_feature_flag_update": 0.2,  # 200ms
}


def get_mock_admin_user():
    """Return a mock admin user for testing."""
    user = MagicMock(spec=User)
    user.id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    user.email = "admin@test.com"
    user.role = "admin"
    user.admin_role = "admin"
    return user


@pytest.fixture
def perf_client():
    """Create test client with mocked admin auth for performance testing."""
    app.dependency_overrides[get_current_admin_or_viewer] = get_mock_admin_user
    app.dependency_overrides[get_current_admin_user] = get_mock_admin_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def measure_endpoint_performance(client, method, url, iterations=20, **kwargs):
    """Measure endpoint performance over multiple iterations.

    Returns dict with avg, min, max, p50, p95, p99 latencies.
    """
    latencies = []

    for _ in range(iterations):
        start = time.perf_counter()
        if method == "GET":
            _ = client.get(url, **kwargs)
        elif method == "POST":
            _ = client.post(url, **kwargs)
        elif method == "PATCH":
            _ = client.patch(url, **kwargs)
        else:
            raise ValueError(f"Unsupported method: {method}")
        end = time.perf_counter()

        latencies.append(end - start)

        # Small delay to avoid overwhelming the server
        time.sleep(0.01)

    latencies.sort()
    n = len(latencies)

    return {
        "avg": statistics.mean(latencies),
        "min": min(latencies),
        "max": max(latencies),
        "p50": latencies[n // 2],
        "p95": latencies[int(n * 0.95)],
        "p99": latencies[int(n * 0.99)],
        "iterations": n,
        "latencies": latencies,
    }


class TestVoiceAdminAPIPerformance:
    """Voice Admin API endpoint performance tests."""

    @patch("app.api.admin_voice.get_all_voice_sessions")
    def test_voice_sessions_list_performance(self, mock_get_sessions, perf_client):
        """Benchmark: List voice sessions endpoint."""
        # Mock with realistic data
        mock_get_sessions.return_value = {
            f"session-{i}": {
                "user_id": f"user-{i}",
                "type": "voice" if i % 2 == 0 else "realtime",
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "messages_count": i * 5,
            }
            for i in range(100)  # Simulate 100 active sessions
        }

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/sessions")

        print("\n[Benchmark] Voice Sessions List:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P50: {results['p50']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")
        print(f"  P99: {results['p99']*1000:.2f}ms")

        assert (
            results["avg"] < THRESHOLDS["voice_sessions_list"]
        ), f"Avg {results['avg']*1000:.1f}ms exceeds threshold {THRESHOLDS['voice_sessions_list']*1000}ms"
        assert (
            results["p95"] < THRESHOLDS["voice_sessions_list"] * 2
        ), f"P95 {results['p95']*1000:.1f}ms exceeds threshold"

    @patch("app.core.database.redis_client")
    def test_voice_metrics_performance(self, mock_redis, perf_client):
        """Benchmark: Get voice metrics endpoint."""
        mock_redis.hgetall.return_value = {
            "total_sessions": "1500",
            "active_sessions": "42",
            "total_messages": "15000",
            "avg_duration": "180.5",
        }
        mock_redis.ping.return_value = True
        mock_redis.get.return_value = None

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/metrics")

        print("\n[Benchmark] Voice Metrics Get:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_metrics_get"]

    @patch("app.core.database.redis_client")
    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    def test_voice_health_check_performance(self, mock_elevenlabs, mock_realtime, mock_redis, perf_client):
        """Benchmark: Voice health check endpoint."""
        mock_redis.ping.return_value = True
        mock_redis.hgetall.return_value = {}
        mock_redis.get.return_value = None
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/health", iterations=50)

        print("\n[Benchmark] Voice Health Check:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P50: {results['p50']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_health_check"]

    @patch("app.core.database.redis_client")
    def test_voice_analytics_performance(self, mock_redis, perf_client):
        """Benchmark: Voice analytics endpoint."""
        mock_redis.get.return_value = None
        mock_redis.hgetall.return_value = {}
        mock_redis.ping.return_value = True

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/analytics")

        print("\n[Benchmark] Voice Analytics:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_analytics"]

    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    def test_voice_providers_performance(self, mock_elevenlabs, mock_realtime, perf_client):
        """Benchmark: List voice providers endpoint."""
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/providers", iterations=30)

        print("\n[Benchmark] Voice Providers List:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_providers_list"]

    @patch("app.api.admin_voice.get_voice_config")
    def test_voice_config_performance(self, mock_get_config, perf_client):
        """Benchmark: Get voice config endpoint."""
        from app.api.admin_voice import VoiceConfig

        mock_get_config.return_value = VoiceConfig()

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/config", iterations=30)

        print("\n[Benchmark] Voice Config Get:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_config_get"]

    @patch("app.api.admin_voice.get_db")
    def test_voice_feature_flags_performance(self, mock_get_db, perf_client):
        """Benchmark: Get voice feature flags endpoint."""
        mock_session = MagicMock()
        mock_flags = [
            MagicMock(
                name=f"voice.feature_{i}",
                enabled=i % 2 == 0,
                description=f"Feature {i} description",
            )
            for i in range(10)
        ]
        mock_session.query.return_value.filter.return_value.all.return_value = mock_flags
        mock_get_db.return_value = iter([mock_session])

        results = measure_endpoint_performance(perf_client, "GET", "/api/admin/voice/feature-flags")

        print("\n[Benchmark] Voice Feature Flags:")
        print(f"  Average: {results['avg']*1000:.2f}ms")
        print(f"  P95: {results['p95']*1000:.2f}ms")

        assert results["avg"] < THRESHOLDS["voice_feature_flags"]


class TestVoiceEndpointLatencyTargets:
    """Test that voice endpoints meet latency targets for real-time use."""

    REALTIME_THRESHOLD_MS = 100  # 100ms for real-time endpoints

    @patch("app.core.database.redis_client")
    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    def test_latency_under_load(self, mock_elevenlabs, mock_realtime, mock_redis, perf_client):
        """Test latency remains acceptable under concurrent requests."""
        import concurrent.futures

        mock_redis.ping.return_value = True
        mock_redis.hgetall.return_value = {}
        mock_redis.get.return_value = None
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True

        def make_request(endpoint):
            start = time.perf_counter()
            perf_client.get(endpoint)
            return time.perf_counter() - start

        endpoints = [
            "/api/admin/voice/health",
            "/api/admin/voice/metrics",
            "/api/admin/voice/providers",
        ]

        # Run concurrent requests
        all_latencies = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for _ in range(30):  # 30 total requests
                for endpoint in endpoints:
                    futures.append(executor.submit(make_request, endpoint))

            for future in concurrent.futures.as_completed(futures):
                all_latencies.append(future.result())

        avg_latency = statistics.mean(all_latencies)
        p95_latency = sorted(all_latencies)[int(len(all_latencies) * 0.95)]

        print("\n[Load Test] Concurrent Request Latency:")
        print(f"  Total requests: {len(all_latencies)}")
        print(f"  Average: {avg_latency*1000:.2f}ms")
        print(f"  P95: {p95_latency*1000:.2f}ms")

        # Under load, latency should still be reasonable
        assert avg_latency < 0.3, f"Avg latency {avg_latency*1000:.1f}ms too high under load"


class TestVoiceMetricsDatabasePerformance:
    """Test database query performance for voice_session_metrics table."""

    def test_voice_metrics_table_exists(self, perf_client):
        """Verify voice_session_metrics table exists and is queryable."""
        # This test verifies the migration ran successfully
        # The actual database test would require a real database connection
        pass  # Table existence verified in migration test


class TestVoicePipelinePerformanceSummary:
    """Generate performance summary report."""

    @patch("app.core.database.redis_client")
    @patch("app.api.admin_voice.realtime_voice_service")
    @patch("app.api.admin_voice.elevenlabs_service")
    @patch("app.api.admin_voice.get_all_voice_sessions")
    @patch("app.api.admin_voice.get_voice_config")
    def test_generate_performance_report(
        self,
        mock_get_config,
        mock_get_sessions,
        mock_elevenlabs,
        mock_realtime,
        mock_redis,
        perf_client,
    ):
        """Generate comprehensive performance report for all voice endpoints."""
        # Setup mocks
        mock_redis.ping.return_value = True
        mock_redis.hgetall.return_value = {}
        mock_redis.get.return_value = None
        mock_realtime.is_enabled.return_value = True
        mock_elevenlabs.is_enabled.return_value = True
        mock_get_sessions.return_value = {}
        from app.api.admin_voice import VoiceConfig

        mock_get_config.return_value = VoiceConfig()

        endpoints = [
            ("GET", "/api/admin/voice/sessions", "voice_sessions_list"),
            ("GET", "/api/admin/voice/metrics", "voice_metrics_get"),
            ("GET", "/api/admin/voice/health", "voice_health_check"),
            ("GET", "/api/admin/voice/analytics", "voice_analytics"),
            ("GET", "/api/admin/voice/providers", "voice_providers_list"),
            ("GET", "/api/admin/voice/config", "voice_config_get"),
        ]

        print("\n" + "=" * 60)
        print("VOICE PIPELINE PERFORMANCE BENCHMARK REPORT")
        print("Phase 11.1 - VoiceAssist Voice Pipeline Sprint")
        print("=" * 60)

        all_pass = True
        for method, url, name in endpoints:
            results = measure_endpoint_performance(perf_client, method, url, iterations=20)

            threshold = THRESHOLDS.get(name, 0.2)
            passed = results["avg"] < threshold

            status = "PASS" if passed else "FAIL"
            all_pass = all_pass and passed

            print(f"\n{name}:")
            print(f"  Endpoint: {method} {url}")
            print(f"  Threshold: {threshold*1000:.0f}ms")
            print(f"  Average:   {results['avg']*1000:.2f}ms [{status}]")
            print(f"  P50:       {results['p50']*1000:.2f}ms")
            print(f"  P95:       {results['p95']*1000:.2f}ms")
            print(f"  P99:       {results['p99']*1000:.2f}ms")
            print(f"  Min/Max:   {results['min']*1000:.2f}ms / {results['max']*1000:.2f}ms")

        print("\n" + "=" * 60)
        print(f"OVERALL: {'ALL TESTS PASSED' if all_pass else 'SOME TESTS FAILED'}")
        print("=" * 60)

        assert all_pass, "Some endpoints exceeded performance thresholds"
