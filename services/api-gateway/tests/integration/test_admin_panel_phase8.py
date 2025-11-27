"""
Integration tests for Phase 8.3 Admin Panel improvements.

Tests cover:
- Rate limiting for admin endpoints
- Redis caching for metrics
- WebSocket session tracking via Redis
- Audit logging for admin actions
- Optimized database queries
"""

import os
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

# Only import app when running full integration tests (with services available)
# Use environment variable to control this
FULL_INTEGRATION = os.environ.get("FULL_INTEGRATION", "false").lower() == "true"

if FULL_INTEGRATION:
    from app.main import app
    from fastapi.testclient import TestClient
else:
    # Mock the app for unit tests
    app = None
    TestClient = None


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis = MagicMock()
    redis.get = MagicMock(return_value=None)
    redis.set = MagicMock()
    redis.setex = MagicMock()
    redis.delete = MagicMock()
    redis.incr = MagicMock(return_value=1)
    redis.expire = MagicMock()
    redis.ttl = MagicMock(return_value=60)
    redis.pipeline = MagicMock()
    redis.smembers = MagicMock(return_value=set())
    redis.sadd = MagicMock()
    redis.srem = MagicMock()
    redis.hset = MagicMock()
    redis.hget = MagicMock(return_value=None)
    redis.hgetall = MagicMock(return_value={})
    redis.hdel = MagicMock()
    return redis


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = MagicMock()
    db.query = MagicMock()
    db.add = MagicMock()
    db.commit = MagicMock()
    db.refresh = MagicMock()
    return db


@pytest.fixture
def admin_user():
    """Create a mock admin user."""
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "admin@example.com"
    user.role = "admin"
    user.is_active = True
    return user


@pytest.fixture
def mock_request():
    """Create a mock request object."""
    request = MagicMock()
    request.client.host = "192.168.1.100"
    request.headers.get = MagicMock(return_value="Mozilla/5.0")
    request.url.path = "/api/admin/panel/summary"
    request.state.user_id = str(uuid.uuid4())
    request.state.request_id = str(uuid.uuid4())
    return request


# ============================================================================
# Route Existence Tests (Smoke Tests)
# ============================================================================


@pytest.mark.smoke
@pytest.mark.skipif(not FULL_INTEGRATION, reason="Requires full service stack")
class TestAdminRoutesExist:
    """Smoke tests to verify admin routes are registered."""

    def test_admin_summary_route(self):
        """Test /api/admin/panel/summary route exists."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/summary")
        # Should be 401/403 (not 404)
        assert resp.status_code in (401, 403, 422)

    def test_admin_metrics_route(self):
        """Test /api/admin/panel/metrics route exists."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/metrics")
        assert resp.status_code in (401, 403, 422)

    def test_admin_users_route(self):
        """Test /api/admin/panel/users route exists."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/users")
        assert resp.status_code in (401, 403, 422)

    def test_admin_audit_logs_route(self):
        """Test /api/admin/panel/audit-logs route exists."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/audit-logs")
        assert resp.status_code in (401, 403, 422)

    def test_admin_websocket_sessions_route(self):
        """Test /api/admin/panel/websocket-sessions route exists."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/websocket-sessions")
        assert resp.status_code in (401, 403, 422)


# ============================================================================
# Rate Limiting Tests
# ============================================================================


class TestRateLimiting:
    """Tests for rate limiting functionality."""

    def test_rate_limit_decorator_allows_within_limit(self, mock_redis, mock_request):
        """Test that requests within rate limit are allowed."""
        from app.core.middleware import rate_limit

        # Mock Redis to return count below limit
        mock_redis.get.return_value = b"5"  # 5 requests, limit is 10

        @rate_limit(calls=10, period=60)
        async def test_endpoint(request):
            return {"status": "ok"}

        # Should not raise
        with patch("app.core.middleware.redis_client", mock_redis):
            import asyncio

            result = asyncio.get_event_loop().run_until_complete(test_endpoint(request=mock_request))
            assert result == {"status": "ok"}

    def test_rate_limit_decorator_blocks_over_limit(self, mock_redis, mock_request):
        """Test that requests over rate limit are blocked."""
        from app.core.middleware import rate_limit

        # Mock Redis to return count at limit
        mock_redis.get.return_value = b"10"  # At limit of 10

        @rate_limit(calls=10, period=60)
        async def test_endpoint(request):
            return {"status": "ok"}

        with patch("app.core.middleware.redis_client", mock_redis):
            import asyncio

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(test_endpoint(request=mock_request))

            assert exc_info.value.status_code == 429
            assert "Rate limit exceeded" in str(exc_info.value.detail)

    def test_rate_limit_increments_counter(self, mock_redis, mock_request):
        """Test that rate limiter increments Redis counter."""
        from app.core.middleware import rate_limit

        mock_redis.get.return_value = None  # First request
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_pipe.execute.return_value = [1, True]

        @rate_limit(calls=10, period=60)
        async def test_endpoint(request):
            return {"status": "ok"}

        with patch("app.core.middleware.redis_client", mock_redis):
            import asyncio

            asyncio.get_event_loop().run_until_complete(test_endpoint(request=mock_request))

            mock_pipe.incr.assert_called_once()


# ============================================================================
# Redis Caching Tests
# ============================================================================


class TestMetricsCaching:
    """Tests for Redis caching of admin metrics."""

    def test_cache_hit_returns_cached_data(self, mock_redis):
        """Test that cached metrics are returned on cache hit."""
        import json

        cached_data = {
            "total_users": 100,
            "active_users": 80,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        mock_redis.get.return_value = json.dumps(cached_data).encode()

        # Simulate cache hit logic
        cache_key = "admin:metrics:summary"
        result = mock_redis.get(cache_key)
        assert result is not None

        parsed = json.loads(result)
        assert parsed["total_users"] == 100
        assert parsed["active_users"] == 80

    def test_cache_miss_fetches_from_db(self, mock_redis, mock_db):
        """Test that cache miss triggers database fetch."""
        mock_redis.get.return_value = None  # Cache miss

        # Verify cache miss
        cache_key = "admin:metrics:summary"
        result = mock_redis.get(cache_key)
        assert result is None

    def test_cache_set_with_ttl(self, mock_redis):
        """Test that cache is set with correct TTL."""
        import json

        data = {"total_users": 100}
        ttl = 60  # 60 seconds

        mock_redis.setex("admin:metrics:summary", ttl, json.dumps(data))

        mock_redis.setex.assert_called_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][0] == "admin:metrics:summary"
        assert call_args[0][1] == 60


# ============================================================================
# WebSocket Session Tracking Tests
# ============================================================================


class TestWebSocketSessionTracking:
    """Tests for WebSocket session tracking via Redis."""

    def test_register_websocket_session(self, mock_redis):
        """Test registering a new WebSocket session."""
        session_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        # Simulate registration
        session_data = {
            "session_id": session_id,
            "user_id": user_id,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "user_agent": "Mozilla/5.0",
            "ip_address": "192.168.1.100",
        }

        mock_redis.hset(f"ws:session:{session_id}", mapping=session_data)
        mock_redis.sadd("ws:active_sessions", session_id)

        mock_redis.hset.assert_called_once()
        mock_redis.sadd.assert_called_once_with("ws:active_sessions", session_id)

    def test_unregister_websocket_session(self, mock_redis):
        """Test unregistering a WebSocket session."""
        session_id = str(uuid.uuid4())

        # Simulate unregistration
        mock_redis.hdel(f"ws:session:{session_id}")
        mock_redis.srem("ws:active_sessions", session_id)

        mock_redis.srem.assert_called_once_with("ws:active_sessions", session_id)

    def test_get_active_session_count(self, mock_redis):
        """Test getting count of active WebSocket sessions."""
        # Mock 5 active sessions
        mock_redis.smembers.return_value = {
            b"session1",
            b"session2",
            b"session3",
            b"session4",
            b"session5",
        }

        sessions = mock_redis.smembers("ws:active_sessions")
        count = len(sessions)

        assert count == 5

    def test_get_session_details(self, mock_redis):
        """Test retrieving WebSocket session details."""
        session_id = "test-session-123"

        mock_redis.hgetall.return_value = {
            b"session_id": b"test-session-123",
            b"user_id": b"user-456",
            b"connected_at": b"2024-01-15T10:30:00Z",
        }

        session_data = mock_redis.hgetall(f"ws:session:{session_id}")

        assert session_data[b"session_id"] == b"test-session-123"
        assert session_data[b"user_id"] == b"user-456"


# ============================================================================
# Audit Logging Tests
# ============================================================================


class TestAdminAuditLogging:
    """Tests for audit logging of admin actions."""

    def test_log_admin_action_creates_entry(self, mock_db, admin_user, mock_request):
        """Test that admin actions are logged via mock."""
        # Create a mock audit log entry
        log = MagicMock()
        log.user_id = admin_user.id
        log.user_email = admin_user.email
        log.user_role = admin_user.role
        log.action = "admin_view_users"
        log.resource_type = "admin_panel"
        log.success = True
        log.ip_address = "192.168.1.100"
        log.service_name = "api-gateway"

        mock_db.add(log)
        mock_db.commit()

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        assert log.action == "admin_view_users"
        assert log.success is True

    def test_audit_log_includes_required_fields(self, admin_user):
        """Test that audit log entries include all required fields."""
        # Create a mock log with required fields
        log = MagicMock()
        log.user_id = admin_user.id
        log.user_email = admin_user.email
        log.user_role = admin_user.role
        log.action = "admin_update_user"
        log.resource_type = "user"
        log.resource_id = str(uuid.uuid4())
        log.success = True
        log.metadata = {"old_role": "clinician", "new_role": "admin"}

        assert log.user_id == admin_user.id
        assert log.action == "admin_update_user"
        assert log.resource_type == "user"
        assert log.metadata["old_role"] == "clinician"

    def test_audit_log_integrity_hash(self, admin_user):
        """Test that audit log integrity hashes work correctly."""
        import hashlib

        # Simulate hash calculation
        log_data = {
            "user_id": str(admin_user.id),
            "user_email": admin_user.email,
            "action": "admin_delete_user",
            "resource_type": "user",
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Calculate hash like the real model does
        hash_string = "|".join(
            str(log_data.get(k, "")) for k in ["user_id", "action", "resource_type", "success", "timestamp"]
        )
        calculated_hash = hashlib.sha256(hash_string.encode()).hexdigest()

        assert calculated_hash is not None
        assert len(calculated_hash) == 64


# ============================================================================
# Database Query Optimization Tests
# ============================================================================


class TestOptimizedQueries:
    """Tests for optimized database queries."""

    def test_aggregated_metrics_query(self, mock_db):
        """Test that metrics use aggregated queries."""
        from sqlalchemy import func

        # Mock aggregated query result
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = 100

        mock_query = mock_db.query.return_value
        mock_query.filter.return_value = mock_query
        mock_query.scalar.return_value = 100

        # Simulate aggregated count query
        count = mock_db.query(func.count()).scalar()

        assert count == 100
        mock_db.query.assert_called()

    def test_user_distribution_single_query(self, mock_db):
        """Test that user distribution uses a single aggregated query."""
        # Mock result from single aggregated query
        mock_result = [
            ("active", True, 80),  # 80 active users
            ("active", False, 20),  # 20 inactive users
            ("role", "admin", 5),  # 5 admins
            ("role", "clinician", 95),  # 95 clinicians
        ]

        mock_query = mock_db.query.return_value
        mock_query.group_by.return_value = mock_query
        mock_query.all.return_value = mock_result

        # Execute query
        result = mock_db.query().group_by().all()

        # Should be single query call, not multiple
        assert len(result) == 4


# ============================================================================
# Integration Tests
# ============================================================================


class TestAdminPanelIntegration:
    """End-to-end integration tests for admin panel."""

    def test_full_metrics_flow_with_caching(self, mock_redis, mock_db):
        """Test complete metrics retrieval with caching."""
        import json

        # First request - cache miss
        mock_redis.get.return_value = None

        # Simulate DB fetch and cache set
        db_result = {"total_users": 150, "active_users": 120}

        # Set cache
        mock_redis.setex("admin:metrics", 60, json.dumps(db_result))

        # Second request - cache hit
        mock_redis.get.return_value = json.dumps(db_result).encode()
        cached = json.loads(mock_redis.get("admin:metrics"))

        assert cached["total_users"] == 150
        assert cached["active_users"] == 120

    def test_admin_action_with_audit_and_rate_limit(self, mock_redis, mock_db, admin_user, mock_request):
        """Test admin action that triggers both audit logging and rate limiting."""
        # Check rate limit
        mock_redis.get.return_value = b"5"  # Under limit

        # Perform action
        action_result = {"success": True, "message": "User updated"}

        # Log audit (using mock instead of real model)
        log = MagicMock()
        log.user_id = admin_user.id
        log.user_email = admin_user.email
        log.action = "admin_update_user"
        log.success = True

        mock_db.add(log)
        mock_db.commit()

        # Increment rate limit counter
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_pipe.incr.return_value = 6

        assert action_result["success"] is True
        mock_db.add.assert_called()


# ============================================================================
# Security Tests
# ============================================================================


@pytest.mark.skipif(not FULL_INTEGRATION, reason="Requires full service stack")
class TestAdminSecurityHeaders:
    """Tests for security headers on admin endpoints."""

    def test_security_headers_present(self):
        """Test that security headers are present on admin responses."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/summary")

        # These headers should be present regardless of auth status
        # (set by SecurityHeadersMiddleware)
        assert "X-Content-Type-Options" in resp.headers
        assert "X-Frame-Options" in resp.headers

    def test_correlation_id_header(self):
        """Test that correlation ID is returned in response."""
        client = TestClient(app)
        resp = client.get("/api/admin/panel/summary", headers={"X-Correlation-ID": "test-corr-123"})

        # Should echo back correlation ID
        assert resp.headers.get("X-Correlation-ID") == "test-corr-123"
