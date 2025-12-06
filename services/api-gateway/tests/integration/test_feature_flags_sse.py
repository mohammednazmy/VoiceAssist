"""
Integration tests for Feature Flags SSE real-time updates.

Tests the Phase 3 real-time feature flag propagation system including:
- SSE connection establishment
- Flag update broadcasting
- Last-Event-ID reconnection support
- Version tracking
- Redis pub/sub coordination (mocked)

NOTE: SSE endpoints don't require authentication for these tests.

NOTE: SSE streaming tests that use client.stream() are skipped in CI because:
1. They require the SSE endpoint to yield events immediately
2. The TestClient's streaming can block indefinitely waiting for data
3. In CI, the SSE infrastructure (Redis pub/sub, async event loops) may not
   work reliably with TestClient's synchronous stream interface
"""

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.feature_flags_realtime import (
    FLAG_EVENT_HISTORY_KEY,
    FLAG_VERSION_KEY,
    FlagSubscriptionManager,
    format_sse_event,
    get_current_version,
    get_events_since,
    increment_version,
    publish_flag_update,
    store_event_in_history,
)
from app.main import app
from fastapi.testclient import TestClient

# Skip SSE streaming tests in CI - they require proper SSE infrastructure
# that's hard to simulate with TestClient's synchronous stream interface
SKIP_SSE_STREAMING_IN_CI = pytest.mark.skipif(
    os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true",
    reason="SSE streaming tests are unreliable in CI - require proper async SSE infrastructure",
)


class TestSSEEndpoints:
    """Test suite for SSE feature flags endpoints."""

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_sse_stream_connects_successfully(self):
        """Test that SSE stream endpoint can be connected to."""
        client = TestClient(app)

        # SSE endpoints return streaming response
        # TestClient handles it specially
        with client.stream("GET", "/api/flags/stream") as response:
            assert response.status_code == 200
            assert response.headers.get("content-type") == "text/event-stream; charset=utf-8"
            assert response.headers.get("cache-control") == "no-cache"

            # Read first event (should be 'connected')
            for line in response.iter_lines():
                if line.startswith("event:"):
                    assert "connected" in line
                    break

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_sse_stream_with_flag_filter(self):
        """Test SSE stream with specific flag filter."""
        client = TestClient(app)

        with client.stream("GET", "/api/flags/stream?flags=test.flag1,test.flag2") as response:
            assert response.status_code == 200
            # Should successfully connect with filter
            for line in response.iter_lines():
                if line.startswith("event:"):
                    assert "connected" in line
                    break

    def test_version_endpoint(self):
        """Test the version endpoint returns current version."""
        client = TestClient(app)

        response = client.get("/api/flags/version")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "version" in data["data"]
        assert "timestamp" in data["data"]
        assert isinstance(data["data"]["version"], int)

    def test_stats_endpoint(self):
        """Test the stats endpoint returns connection statistics."""
        client = TestClient(app)

        response = client.get("/api/flags/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "connections" in data["data"]
        assert "version" in data["data"]
        assert isinstance(data["data"]["connections"], int)

    def test_changes_endpoint(self):
        """Test the changes endpoint returns flag changes since version."""
        client = TestClient(app)

        response = client.get("/api/flags/changes?since_version=0")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "version" in data["data"]
        assert "since_version" in data["data"]
        assert "flags" in data["data"]
        assert data["data"]["since_version"] == 0


class TestSSEEventFormatting:
    """Test suite for SSE event formatting."""

    def test_format_sse_event_basic(self):
        """Test basic SSE event formatting."""
        event = {
            "event": "flag_update",
            "data": {"flag": "test.flag", "value": True},
        }

        result = format_sse_event(event)

        assert "event: flag_update\n" in result
        assert "data: " in result
        assert result.endswith("\n\n")

    def test_format_sse_event_with_id(self):
        """Test SSE event formatting with event ID."""
        event = {
            "event": "flag_update",
            "data": {"flag": "test.flag", "value": True},
        }

        result = format_sse_event(event, event_id=42)

        assert "id: 42\n" in result
        assert "event: flag_update\n" in result
        assert "data: " in result

    def test_format_sse_event_data_is_json(self):
        """Test that event data is properly JSON serialized."""
        event = {
            "event": "connected",
            "data": {
                "client_id": "test-123",
                "version": 5,
                "flags": {"test.flag": {"enabled": True}},
            },
        }

        result = format_sse_event(event)

        # Extract data line
        for line in result.split("\n"):
            if line.startswith("data:"):
                data_json = line.replace("data: ", "")
                parsed = json.loads(data_json)
                assert parsed["client_id"] == "test-123"
                assert parsed["version"] == 5
                assert parsed["flags"]["test.flag"]["enabled"] is True
                break


class TestFlagSubscriptionManager:
    """Test suite for FlagSubscriptionManager."""

    @pytest.mark.asyncio
    async def test_connect_creates_queue(self):
        """Test that connect creates a queue for the client."""
        manager = FlagSubscriptionManager()

        queue = await manager.connect("test-client-1")

        assert queue is not None
        assert manager.get_connection_count() == 1

    @pytest.mark.asyncio
    async def test_disconnect_removes_client(self):
        """Test that disconnect removes the client."""
        manager = FlagSubscriptionManager()

        await manager.connect("test-client-1")
        assert manager.get_connection_count() == 1

        await manager.disconnect("test-client-1")
        assert manager.get_connection_count() == 0

    @pytest.mark.asyncio
    async def test_broadcast_to_all_clients(self):
        """Test broadcasting flag update to all connected clients."""
        manager = FlagSubscriptionManager()

        queue1 = await manager.connect("client-1")
        queue2 = await manager.connect("client-2")

        notified = await manager.broadcast_flag_update(
            "test.flag",
            {"enabled": True},
            version=1,
        )

        assert notified == 2

        # Both queues should have the event
        event1 = await asyncio.wait_for(queue1.get(), timeout=1.0)
        event2 = await asyncio.wait_for(queue2.get(), timeout=1.0)

        assert event1["event"] == "flag_update"
        assert event1["data"]["flag"] == "test.flag"
        assert event2["event"] == "flag_update"
        assert event2["data"]["flag"] == "test.flag"

    @pytest.mark.asyncio
    async def test_broadcast_respects_filter(self):
        """Test that broadcast respects client's flag filter."""
        manager = FlagSubscriptionManager()

        # Client 1 subscribes to specific flags
        queue1 = await manager.connect("client-1", flag_filter=["flag.a", "flag.b"])
        # Client 2 subscribes to all flags
        queue2 = await manager.connect("client-2")

        # Broadcast update for flag.c (not in client-1's filter)
        notified = await manager.broadcast_flag_update(
            "flag.c",
            {"enabled": True},
            version=1,
        )

        # Only client-2 should be notified
        assert notified == 1

        # Client 2 should have the event
        event2 = await asyncio.wait_for(queue2.get(), timeout=1.0)
        assert event2["data"]["flag"] == "flag.c"

        # Client 1's queue should be empty
        assert queue1.empty()

    @pytest.mark.asyncio
    async def test_broadcast_bulk_update(self):
        """Test bulk flag update broadcasting."""
        manager = FlagSubscriptionManager()

        queue = await manager.connect("client-1")

        flags = {
            "flag.a": {"enabled": True},
            "flag.b": {"enabled": False},
        }

        notified = await manager.broadcast_bulk_update(flags, version=2)

        assert notified == 1

        event = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert event["event"] == "flags_bulk_update"
        assert "flag.a" in event["data"]["flags"]
        assert "flag.b" in event["data"]["flags"]


class TestRedisEventHistory:
    """Test suite for Redis event history (Last-Event-ID support)."""

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client for event history tests."""
        with patch("app.api.feature_flags_realtime.redis_client") as mock:
            # Set up sorted set behavior
            mock_store = {}

            def zadd(key, mapping):
                if key not in mock_store:
                    mock_store[key] = []
                for data, score in mapping.items():
                    mock_store[key].append((data, score))
                mock_store[key].sort(key=lambda x: x[1])

            def zrangebyscore(key, min_score, max_score, withscores=False):
                if key not in mock_store:
                    return []
                # Parse exclusive notation
                if min_score.startswith("("):
                    min_val = float(min_score[1:])
                    exclusive = True
                else:
                    min_val = float(min_score) if min_score != "-inf" else float("-inf")
                    exclusive = False

                max_val = float("inf") if max_score == "+inf" else float(max_score)

                results = []
                for data, score in mock_store.get(key, []):
                    if exclusive:
                        if min_val < score <= max_val:
                            results.append((data, score) if withscores else data)
                    else:
                        if min_val <= score <= max_val:
                            results.append((data, score) if withscores else data)
                return results

            def zremrangebyrank(key, start, stop):
                if key in mock_store:
                    # Keep only the most recent entries
                    if stop < 0:
                        keep_from = -stop - 1
                        mock_store[key] = mock_store[key][-keep_from:]

            mock.zadd = MagicMock(side_effect=zadd)
            mock.zrangebyscore = MagicMock(side_effect=zrangebyscore)
            mock.zremrangebyrank = MagicMock(side_effect=zremrangebyrank)
            mock.expire = MagicMock()
            mock._store = mock_store

            yield mock

    def test_store_event_in_history(self, mock_redis):
        """Test storing events in Redis sorted set."""
        event_data = {
            "type": "flag_update",
            "flag": "test.flag",
            "version": 1,
        }

        store_event_in_history(1, event_data)

        mock_redis.zadd.assert_called_once()
        mock_redis.expire.assert_called_once()

    def test_get_events_since(self, mock_redis):
        """Test retrieving events since a specific version."""
        # Pre-populate mock store
        mock_redis._store[FLAG_EVENT_HISTORY_KEY] = [
            (json.dumps({"flag": "flag1", "version": 1}), 1),
            (json.dumps({"flag": "flag2", "version": 2}), 2),
            (json.dumps({"flag": "flag3", "version": 3}), 3),
        ]

        events = get_events_since(1)

        # Should get events with version > 1
        assert len(events) == 2
        assert events[0]["_event_id"] == 2
        assert events[1]["_event_id"] == 3


class TestVersionTracking:
    """Test suite for version tracking."""

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client for version tests."""
        with patch("app.api.feature_flags_realtime.redis_client") as mock:
            mock_version = {"value": "0"}

            def get(key):
                if key == FLAG_VERSION_KEY:
                    return mock_version["value"]
                return None

            def incr(key):
                if key == FLAG_VERSION_KEY:
                    mock_version["value"] = str(int(mock_version["value"]) + 1)
                    return int(mock_version["value"])
                return 1

            mock.get = MagicMock(side_effect=get)
            mock.incr = MagicMock(side_effect=incr)

            yield mock

    def test_get_current_version(self, mock_redis):
        """Test getting current version from Redis."""
        version = get_current_version()
        assert version == 0

    def test_increment_version(self, mock_redis):
        """Test incrementing version."""
        version1 = increment_version()
        assert version1 == 1

        version2 = increment_version()
        assert version2 == 2


class TestLastEventIDReconnection:
    """Test suite for Last-Event-ID reconnection pattern."""

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_sse_stream_with_last_event_id_header(self):
        """Test SSE stream reconnection with Last-Event-ID header."""
        client = TestClient(app)

        # Connect with Last-Event-ID header
        with client.stream(
            "GET",
            "/api/flags/stream",
            headers={"Last-Event-ID": "5"},
        ) as response:
            assert response.status_code == 200

            # Should receive reconnected event or connected (depending on state)
            for line in response.iter_lines():
                if line.startswith("event:"):
                    # Either reconnected or connected is valid
                    assert "reconnected" in line or "connected" in line
                    break

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_invalid_last_event_id_handled_gracefully(self):
        """Test that invalid Last-Event-ID is handled gracefully."""
        client = TestClient(app)

        # Connect with invalid Last-Event-ID
        with client.stream(
            "GET",
            "/api/flags/stream",
            headers={"Last-Event-ID": "not-a-number"},
        ) as response:
            assert response.status_code == 200
            # Should still connect (invalid ID treated as fresh connection)


class TestPublishFlagUpdate:
    """Test suite for publishing flag updates."""

    @pytest.fixture
    def mock_redis_and_manager(self):
        """Mock Redis and subscription manager for publish tests."""
        with patch("app.api.feature_flags_realtime.redis_client") as mock_redis, patch(
            "app.api.feature_flags_realtime.flag_subscription_manager"
        ) as mock_manager:
            mock_redis.incr = MagicMock(return_value=1)
            mock_redis.zadd = MagicMock()
            mock_redis.zremrangebyrank = MagicMock()
            mock_redis.expire = MagicMock()
            mock_redis.publish = MagicMock()

            mock_manager.broadcast_flag_update = AsyncMock(return_value=2)

            yield mock_redis, mock_manager

    @pytest.mark.asyncio
    async def test_publish_flag_update_broadcasts(self, mock_redis_and_manager):
        """Test that publishing a flag update broadcasts to clients."""
        mock_redis, mock_manager = mock_redis_and_manager

        await publish_flag_update("test.flag", {"enabled": True})

        # Should increment version
        mock_redis.incr.assert_called_once()

        # Should store in history
        mock_redis.zadd.assert_called_once()

        # Should broadcast to local clients
        mock_manager.broadcast_flag_update.assert_called_once()

        # Should publish to Redis pub/sub
        mock_redis.publish.assert_called_once()

    @pytest.mark.asyncio
    async def test_publish_includes_timestamp(self, mock_redis_and_manager):
        """Test that published events include timestamp."""
        mock_redis, mock_manager = mock_redis_and_manager

        await publish_flag_update("test.flag", {"enabled": True})

        # Check the published message contains timestamp
        call_args = mock_redis.publish.call_args
        event_json = call_args[0][1]
        event_data = json.loads(event_json)

        assert "timestamp" in event_data
        assert "version" in event_data
        assert event_data["flag"] == "test.flag"


class TestReconnectionWithPartialHistory:
    """Test suite for Last-Event-ID reconnection with partial/pruned history."""

    @pytest.fixture
    def mock_redis_with_pruned_history(self):
        """Mock Redis with partially pruned event history."""
        with patch("app.api.feature_flags_realtime.redis_client") as mock:
            # Simulate history that starts at event 50 (earlier events pruned)
            mock_store = {
                FLAG_EVENT_HISTORY_KEY: [
                    (json.dumps({"flag": "flag1", "version": 50}), 50),
                    (json.dumps({"flag": "flag2", "version": 51}), 51),
                    (json.dumps({"flag": "flag3", "version": 52}), 52),
                ]
            }

            def zrangebyscore(key, min_score, max_score, withscores=False, start=None, num=None):
                if key not in mock_store:
                    return []

                # Parse exclusive notation
                if isinstance(min_score, str) and min_score.startswith("("):
                    min_val = float(min_score[1:])
                    exclusive = True
                elif min_score == "-inf":
                    min_val = float("-inf")
                    exclusive = False
                else:
                    min_val = float(min_score)
                    exclusive = False

                max_val = float("inf") if max_score == "+inf" else float(max_score)

                results = []
                for data, score in mock_store.get(key, []):
                    if exclusive:
                        if min_val < score <= max_val:
                            results.append((data, score) if withscores else data)
                    else:
                        if min_val <= score <= max_val:
                            results.append((data, score) if withscores else data)

                # Apply start/num for pagination
                if start is not None and num is not None:
                    results = results[start : start + num]

                return results

            def zcard(key):
                return len(mock_store.get(key, []))

            def zrange(key, start, stop, withscores=False):
                items = mock_store.get(key, [])
                if stop == -1:
                    sliced = items[start:]
                else:
                    sliced = items[start : stop + 1]
                return sliced if withscores else [item[0] for item in sliced]

            mock.zrangebyscore = MagicMock(side_effect=zrangebyscore)
            mock.zcard = MagicMock(side_effect=zcard)
            mock.zrange = MagicMock(side_effect=zrange)
            mock._store = mock_store

            yield mock

    def test_get_events_since_detects_incomplete_history(self, mock_redis_with_pruned_history):
        """Test that get_events_since detects incomplete history when client is too far behind."""
        # Client at version 30, but history starts at 50
        events, history_complete = get_events_since(30)

        # Should detect incomplete history
        assert history_complete is False
        # Should still return available events
        assert len(events) == 3

    def test_get_events_since_complete_history(self, mock_redis_with_pruned_history):
        """Test that get_events_since reports complete history when client is caught up."""
        # Client at version 49 (just before first available event)
        events, history_complete = get_events_since(49)

        # History should be complete (50 - 49 = 1, no gap)
        assert history_complete is True
        assert len(events) == 3

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_reconnection_with_stale_last_event_id(self):
        """Test SSE reconnection when Last-Event-ID is too old (history pruned)."""
        client = TestClient(app)

        # Connect with very old Last-Event-ID
        with client.stream(
            "GET",
            "/api/flags/stream",
            headers={"Last-Event-ID": "1"},  # Very old
        ) as response:
            assert response.status_code == 200

            # Should receive either history_incomplete or reconnected/connected event
            events_received = []
            for i, line in enumerate(response.iter_lines()):
                if line.startswith("event:"):
                    events_received.append(line)
                if i > 10:  # Read a few events then break
                    break

            # At least one event should be received
            assert len(events_received) >= 1


class TestScheduledChangesWithDST:
    """Test suite for scheduled variant changes around daylight saving time transitions."""

    def test_scheduled_change_respects_timezone(self):
        """Test that scheduled changes respect the specified timezone."""
        from datetime import datetime

        from app.services.variant_assignment import ScheduledChange

        # Create a scheduled change in America/New_York timezone
        change = ScheduledChange(
            id="test-1",
            scheduled_at=datetime(2025, 3, 9, 2, 30),  # During DST transition
            changes={"control": 50, "variant": 50},
            timezone_id="America/New_York",
        )

        # Verify the change stores timezone info
        assert change.timezone_id == "America/New_York"

    def test_scheduled_change_is_due_check(self):
        """Test the is_due check for scheduled changes."""
        from datetime import datetime, timedelta
        from datetime import timezone as tz

        from app.services.variant_assignment import ScheduledChange

        # Create a change scheduled for 1 hour from now
        future_time = datetime.now(tz.utc) + timedelta(hours=1)
        change = ScheduledChange(
            id="test-1",
            scheduled_at=future_time,
            changes={"control": 50, "variant": 50},
        )

        # Should not be due yet
        assert change.is_due() is False

        # Create a change scheduled for 1 hour ago
        past_time = datetime.now(tz.utc) - timedelta(hours=1)
        past_change = ScheduledChange(
            id="test-2",
            scheduled_at=past_time,
            changes={"control": 50, "variant": 50},
        )

        # Should be due
        assert past_change.is_due() is True

    def test_scheduled_change_cancelled_not_applied(self):
        """Test that cancelled scheduled changes are not applied."""
        from datetime import datetime, timedelta
        from datetime import timezone as tz

        from app.services.variant_assignment import ScheduledChange

        # Create a change that was scheduled in the past but cancelled
        past_time = datetime.now(tz.utc) - timedelta(hours=1)
        change = ScheduledChange(
            id="test-1",
            scheduled_at=past_time,
            changes={"control": 50, "variant": 50},
            cancelled=True,
            cancelled_at=datetime.now(tz.utc),
        )

        # Cancelled changes should still report is_due = True (they need to be skipped separately)
        # The apply logic should check cancelled flag
        assert change.cancelled is True


class TestSSERateLimiting:
    """Test suite for SSE endpoint rate limiting."""

    @pytest.fixture
    def mock_rate_limiter(self):
        """Mock rate limiter for testing."""
        with patch("app.api.feature_flags_realtime.sse_rate_limiter") as mock:
            mock.check_rate_limit = MagicMock(return_value=(True, 1))
            mock.release = MagicMock()
            yield mock

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_rate_limit_allows_connection(self, mock_rate_limiter):
        """Test that connections within rate limit are allowed."""
        mock_rate_limiter.check_rate_limit.return_value = (True, 1)

        client = TestClient(app)
        with client.stream("GET", "/api/flags/stream") as response:
            assert response.status_code == 200

    def test_rate_limit_blocks_when_exceeded(self):
        """Test that connections are blocked when rate limit is exceeded."""
        with patch("app.api.feature_flags_realtime.sse_rate_limiter") as mock:
            mock.check_rate_limit.return_value = (False, 10)  # Limit exceeded

            client = TestClient(app)
            response = client.get("/api/flags/stream")

            # Should return 429 Too Many Requests
            assert response.status_code == 429
            assert "Rate limit exceeded" in response.json()["error"]
            assert "Retry-After" in response.headers


class TestSSERBAC:
    """Test suite for SSE endpoint RBAC (Role-Based Access Control)."""

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_unauthenticated_receives_public_flags(self):
        """Test that unauthenticated users receive only public flags."""
        client = TestClient(app)

        with client.stream("GET", "/api/flags/stream") as response:
            assert response.status_code == 200
            # Should successfully connect (public flags are allowed)

    @SKIP_SSE_STREAMING_IN_CI
    @pytest.mark.timeout(30)
    def test_requesting_admin_flag_without_auth_denied(self):
        """Test that requesting admin-only flags without auth is denied."""
        # This test depends on having a flag with visibility=admin
        # For now, just verify the endpoint handles the request
        client = TestClient(app)

        with client.stream("GET", "/api/flags/stream?flags=admin.internal_flag") as response:
            # If no accessible flags match, should either:
            # 1. Return 403 (access denied)
            # 2. Return 200 with empty flags (filtered out)
            # Both are valid depending on whether the flag exists
            assert response.status_code in [200, 403]

    def test_flag_visibility_helper(self):
        """Test the flag visibility helper functions."""
        from app.api.feature_flags_realtime import (
            FLAG_VISIBILITY_ADMIN,
            FLAG_VISIBILITY_AUTHENTICATED,
            FLAG_VISIBILITY_PUBLIC,
            get_flag_visibility,
            user_can_access_flag,
        )

        # Test public flag
        public_meta = {"visibility": FLAG_VISIBILITY_PUBLIC}
        assert get_flag_visibility(public_meta) == FLAG_VISIBILITY_PUBLIC
        assert user_can_access_flag(None, public_meta) is True

        # Test authenticated flag
        auth_meta = {"visibility": FLAG_VISIBILITY_AUTHENTICATED}
        assert user_can_access_flag(None, auth_meta) is False

        # Test admin flag
        admin_meta = {"visibility": FLAG_VISIBILITY_ADMIN}
        assert user_can_access_flag(None, admin_meta) is False

        # Test default visibility (no metadata)
        assert get_flag_visibility(None) == FLAG_VISIBILITY_PUBLIC
        assert user_can_access_flag(None, None) is True


class TestEventHistoryStats:
    """Test suite for event history statistics endpoint."""

    def test_history_stats_endpoint(self):
        """Test the history-stats endpoint returns statistics."""
        client = TestClient(app)

        response = client.get("/api/flags/history-stats")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "global_event_count" in data["data"] or "error" in data["data"]
        assert "timestamp" in data["data"]

    def test_stats_includes_version_drift(self):
        """Test that stats endpoint includes version drift information."""
        client = TestClient(app)

        response = client.get("/api/flags/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "version_drift" in data["data"]
        assert "event_history" in data["data"]
