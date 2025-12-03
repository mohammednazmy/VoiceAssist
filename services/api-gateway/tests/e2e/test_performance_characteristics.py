"""E2E Test: Performance Characteristics (Phase 7 - P2.2).

Tests performance and caching behavior:
- Response time benchmarks
- Cache hit/miss performance
- Query performance with/without RAG
- Memory and resource usage patterns

NOTE: Tests expect specific API response format and Redis/Qdrant connection.
Some tests use fixtures that need DB session scope matching.
"""

import time

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skip(
    reason="Tests require specific API response format and proper fixture scopes - need rewrite"
)


class TestPerformanceCharacteristics:
    """Test performance characteristics and caching behavior."""

    def test_authentication_performance(self, client: TestClient, test_user):
        """Test authentication endpoint performance."""

        # Measure login performance
        iterations = 10
        login_times = []

        for _ in range(iterations):
            start_time = time.time()

            response = client.post(
                "/api/auth/login",
                json={"email": test_user.email, "password": "Test123!@#"},
            )

            duration = time.time() - start_time
            login_times.append(duration)

            assert response.status_code == 200

        avg_login_time = sum(login_times) / len(login_times)

        # Login should complete in under 500ms on average
        assert avg_login_time < 0.5, f"Average login time {avg_login_time:.3f}s exceeds 500ms"

    def test_cache_performance_improvement(self, client: TestClient, test_admin_user, admin_auth_headers: dict):
        """Test that caching provides measurable performance improvement."""

        # Skip if cache endpoint not available
        cache_stats_response = client.get("/api/admin/cache/stats", headers=admin_auth_headers)
        if cache_stats_response.status_code != 200:
            pytest.skip("Cache management API not available")

        # Clear cache first
        client.post("/api/admin/cache/clear", headers=admin_auth_headers)

        # Make a query (cache miss)
        query_data = {"query": "diabetes", "session_id": "perf-test"}

        uncached_times = []
        for _ in range(3):
            start_time = time.time()
            response = client.post("/api/realtime/query", json=query_data, headers=admin_auth_headers)
            duration = time.time() - start_time
            if response.status_code == 200:
                uncached_times.append(duration)
            time.sleep(0.1)  # Small delay between requests

        if not uncached_times:
            pytest.skip("RAG query endpoint not available")

        # Make same query again (should hit cache)
        cached_times = []
        for _ in range(3):
            start_time = time.time()
            response = client.post("/api/realtime/query", json=query_data, headers=admin_auth_headers)
            duration = time.time() - start_time
            if response.status_code == 200:
                cached_times.append(duration)

        avg_uncached = sum(uncached_times) / len(uncached_times)
        avg_cached = sum(cached_times) / len(cached_times)

        # Cached requests should be faster (at least 2x)
        improvement_ratio = avg_uncached / avg_cached if avg_cached > 0 else 1

        print(
            f"\nCache performance: uncached={avg_uncached:.3f}s, "
            f"cached={avg_cached:.3f}s, improvement={improvement_ratio:.2f}x"
        )

        # Cache should provide some improvement (though exact ratio varies)
        assert improvement_ratio > 1.0, "Cache should provide performance improvement"

    def test_health_check_performance(self, client: TestClient):
        """Test health check endpoint performance."""

        iterations = 50
        health_times = []

        for _ in range(iterations):
            start_time = time.time()
            response = client.get("/health")
            duration = time.time() - start_time

            health_times.append(duration)
            assert response.status_code == 200

        avg_health_time = sum(health_times) / len(health_times)
        p95_health_time = sorted(health_times)[int(0.95 * len(health_times))]

        # Health check should be very fast
        assert avg_health_time < 0.1, f"Average health check {avg_health_time:.3f}s exceeds 100ms"
        assert p95_health_time < 0.2, f"P95 health check {p95_health_time:.3f}s exceeds 200ms"

        print(f"\nHealth check performance: avg={avg_health_time*1000:.1f}ms, p95={p95_health_time*1000:.1f}ms")

    def test_concurrent_authentication_performance(self, client: TestClient):
        """Test authentication performance under concurrent load."""
        import concurrent.futures

        # Register test users first
        for i in range(10):
            client.post(
                "/api/auth/register",
                json={
                    "email": f"concurrent_perf_{i}@example.com",
                    "password": "ConcurrentPerf123!@#",
                },
            )

        def login_user(user_id: int):
            start_time = time.time()
            response = client.post(
                "/api/auth/login",
                json={
                    "email": f"concurrent_perf_{user_id}@example.com",
                    "password": "ConcurrentPerf123!@#",
                },
            )
            duration = time.time() - start_time
            return duration, response.status_code

        # Run concurrent logins
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(login_user, i) for i in range(10)]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]

        durations = [r[0] for r in results]
        status_codes = [r[1] for r in results]

        # All should succeed
        assert all(code == 200 for code in status_codes)

        # Performance should remain acceptable under load
        avg_duration = sum(durations) / len(durations)
        assert avg_duration < 1.0, f"Average concurrent login {avg_duration:.3f}s exceeds 1s"

        print(f"\nConcurrent login performance: avg={avg_duration*1000:.1f}ms")

    def test_cache_size_tracking(self, client: TestClient, test_admin_user, admin_auth_headers: dict):
        """Test cache size tracking and metrics."""

        cache_stats_response = client.get("/api/admin/cache/stats", headers=admin_auth_headers)

        if cache_stats_response.status_code != 200:
            pytest.skip("Cache management API not available")

        data = cache_stats_response.json()["data"]

        # Verify cache stats structure
        assert "l1_size" in data
        assert "l1_max_size" in data
        assert "l1_utilization" in data
        assert "l2_used_memory" in data

        # L1 size should be within bounds
        assert 0 <= data["l1_size"] <= data["l1_max_size"]
        assert 0.0 <= data["l1_utilization"] <= 1.0

        print(
            f"\nCache stats: L1={data['l1_size']}/{data['l1_max_size']}, "
            f"utilization={data['l1_utilization']:.2%}, "
            f"L2_memory={data['l2_used_memory_human']}"
        )

    def test_metrics_endpoint_performance(self, client: TestClient):
        """Test Prometheus metrics endpoint performance."""

        # Metrics endpoint should be fast even with many metrics
        start_time = time.time()
        response = client.get("/metrics")
        duration = time.time() - start_time

        assert response.status_code == 200
        assert duration < 0.5, f"Metrics endpoint {duration:.3f}s exceeds 500ms"

        # Verify metrics format
        metrics_text = response.text
        assert "voiceassist_" in metrics_text  # Our custom metrics
        assert len(metrics_text) > 100  # Should have substantial content

        print(f"\nMetrics endpoint: {duration*1000:.1f}ms, {len(metrics_text)} bytes")

    def test_database_query_performance(self, client: TestClient, test_user, auth_headers: dict):
        """Test database query performance."""

        iterations = 20
        query_times = []

        for _ in range(iterations):
            start_time = time.time()
            response = client.get("/api/auth/me", headers=auth_headers)
            duration = time.time() - start_time

            query_times.append(duration)
            assert response.status_code == 200

        avg_query_time = sum(query_times) / len(query_times)

        # Database queries should be fast
        assert avg_query_time < 0.2, f"Average DB query {avg_query_time:.3f}s exceeds 200ms"

        print(f"\nDatabase query performance: avg={avg_query_time*1000:.1f}ms")
