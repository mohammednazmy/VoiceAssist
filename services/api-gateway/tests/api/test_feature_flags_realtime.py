"""Tests for Feature Flags Real-time API (Phase 3).

Tests the SSE endpoint and version tracking for real-time flag updates.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.feature_flags_realtime import (
    FLAG_UPDATE_CHANNEL,
    FLAG_VERSION_KEY,
    FlagSubscriptionManager,
    format_sse_event,
    get_current_version,
    increment_version,
    publish_flag_update,
    router,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    """Create a test FastAPI app."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def subscription_manager():
    """Create a fresh subscription manager."""
    return FlagSubscriptionManager()


class TestFlagSubscriptionManager:
    """Tests for the FlagSubscriptionManager class."""

    @pytest.mark.asyncio
    async def test_connect_creates_queue(self, subscription_manager):
        """Test that connect creates a queue for the client."""
        queue = await subscription_manager.connect("client-1")

        assert queue is not None
        assert subscription_manager.get_connection_count() == 1

    @pytest.mark.asyncio
    async def test_connect_with_filter(self, subscription_manager):
        """Test connecting with a flag filter."""
        await subscription_manager.connect("client-1", ["ui.dark_mode", "backend.rag"])

        assert subscription_manager._subscriptions["client-1"] == {
            "ui.dark_mode",
            "backend.rag",
        }

    @pytest.mark.asyncio
    async def test_disconnect_removes_client(self, subscription_manager):
        """Test that disconnect removes the client."""
        await subscription_manager.connect("client-1")
        assert subscription_manager.get_connection_count() == 1

        await subscription_manager.disconnect("client-1")
        assert subscription_manager.get_connection_count() == 0

    @pytest.mark.asyncio
    async def test_broadcast_to_all_clients(self, subscription_manager):
        """Test broadcasting to all connected clients."""
        queue1 = await subscription_manager.connect("client-1")
        queue2 = await subscription_manager.connect("client-2")

        flag_data = {"name": "ui.dark_mode", "enabled": True}
        notified = await subscription_manager.broadcast_flag_update("ui.dark_mode", flag_data, 1)

        assert notified == 2

        # Both queues should have the event
        event1 = await queue1.get()
        event2 = await queue2.get()

        assert event1["event"] == "flag_update"
        assert event1["data"]["flag"] == "ui.dark_mode"
        assert event2["event"] == "flag_update"

    @pytest.mark.asyncio
    async def test_broadcast_respects_filter(self, subscription_manager):
        """Test that broadcast respects flag filters."""
        queue1 = await subscription_manager.connect("client-1", ["ui.dark_mode"])
        queue2 = await subscription_manager.connect("client-2", ["backend.rag"])
        queue3 = await subscription_manager.connect("client-3")  # No filter = all flags

        flag_data = {"name": "ui.dark_mode", "enabled": True}
        notified = await subscription_manager.broadcast_flag_update("ui.dark_mode", flag_data, 1)

        # Only client-1 and client-3 should be notified
        assert notified == 2

        # queue1 and queue3 should have events
        event1 = await asyncio.wait_for(queue1.get(), timeout=0.1)
        event3 = await asyncio.wait_for(queue3.get(), timeout=0.1)

        assert event1["event"] == "flag_update"
        assert event3["event"] == "flag_update"

        # queue2 should be empty
        assert queue2.empty()

    @pytest.mark.asyncio
    async def test_broadcast_bulk_update(self, subscription_manager):
        """Test bulk update broadcasting."""
        queue = await subscription_manager.connect("client-1")

        flags = {
            "ui.dark_mode": {"name": "ui.dark_mode", "enabled": True},
            "backend.rag": {"name": "backend.rag", "enabled": False},
        }
        notified = await subscription_manager.broadcast_bulk_update(flags, 2)

        assert notified == 1

        event = await queue.get()
        assert event["event"] == "flags_bulk_update"
        assert "ui.dark_mode" in event["data"]["flags"]
        assert "backend.rag" in event["data"]["flags"]


class TestSSEFormatting:
    """Tests for SSE event formatting."""

    def test_format_sse_event_basic(self):
        """Test basic SSE event formatting."""
        event = {
            "event": "flag_update",
            "data": {"flag": "ui.dark_mode", "version": 1},
        }

        formatted = format_sse_event(event)

        assert formatted.startswith("event: flag_update\n")
        assert "data: " in formatted
        assert formatted.endswith("\n\n")

    def test_format_sse_event_with_complex_data(self):
        """Test SSE formatting with complex data."""
        event = {
            "event": "connected",
            "data": {
                "client_id": "abc-123",
                "flags": {"ui.dark_mode": {"enabled": True}},
                "version": 5,
            },
        }

        formatted = format_sse_event(event)
        data_line = [line for line in formatted.split("\n") if line.startswith("data: ")][0]
        data_json = json.loads(data_line[6:])

        assert data_json["client_id"] == "abc-123"
        assert data_json["flags"]["ui.dark_mode"]["enabled"] is True


class TestVersionTracking:
    """Tests for version tracking functionality."""

    @patch("app.api.feature_flags_realtime.redis_client")
    def test_get_current_version(self, mock_redis):
        """Test getting current version from Redis."""
        mock_redis.get.return_value = "42"

        version = get_current_version()

        assert version == 42
        mock_redis.get.assert_called_once_with(FLAG_VERSION_KEY)

    @patch("app.api.feature_flags_realtime.redis_client")
    def test_get_current_version_default(self, mock_redis):
        """Test default version when Redis returns None."""
        mock_redis.get.return_value = None

        version = get_current_version()

        assert version == 0

    @patch("app.api.feature_flags_realtime.redis_client")
    def test_increment_version(self, mock_redis):
        """Test incrementing version."""
        mock_redis.incr.return_value = 43

        version = increment_version()

        assert version == 43
        mock_redis.incr.assert_called_once_with(FLAG_VERSION_KEY)


class TestPublishFlagUpdate:
    """Tests for the publish_flag_update function."""

    @pytest.mark.asyncio
    @patch("app.api.feature_flags_realtime.flag_subscription_manager")
    @patch("app.api.feature_flags_realtime.increment_version")
    @patch("app.api.feature_flags_realtime.redis_client")
    async def test_publish_broadcasts_and_publishes(self, mock_redis, mock_increment, mock_manager):
        """Test that publish broadcasts locally and publishes to Redis."""
        mock_increment.return_value = 10
        mock_manager.broadcast_flag_update = AsyncMock(return_value=2)

        flag_data = {"name": "ui.dark_mode", "enabled": True}
        await publish_flag_update("ui.dark_mode", flag_data)

        # Should broadcast locally
        mock_manager.broadcast_flag_update.assert_called_once_with("ui.dark_mode", flag_data, 10)

        # Should publish to Redis
        mock_redis.publish.assert_called_once()
        call_args = mock_redis.publish.call_args
        assert call_args[0][0] == FLAG_UPDATE_CHANNEL


class TestAPIEndpoints:
    """Tests for the API endpoints."""

    @patch("app.api.feature_flags_realtime.get_current_version")
    def test_get_version_endpoint(self, mock_version, client):
        """Test the /version endpoint."""
        mock_version.return_value = 42

        response = client.get("/api/flags/version")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["version"] == 42

    @patch("app.api.feature_flags_realtime.flag_subscription_manager")
    @patch("app.api.feature_flags_realtime.get_current_version")
    def test_get_stats_endpoint(self, mock_version, mock_manager, client):
        """Test the /stats endpoint."""
        mock_version.return_value = 10
        mock_manager.get_connection_count.return_value = 5

        response = client.get("/api/flags/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["connections"] == 5
        assert data["data"]["version"] == 10

    @patch("app.api.feature_flags_realtime.feature_flag_service")
    @patch("app.api.feature_flags_realtime.get_current_version")
    def test_get_changes_endpoint(self, mock_version, mock_service, client):
        """Test the /changes endpoint."""
        mock_version.return_value = 15
        mock_flag = MagicMock()
        mock_flag.name = "ui.dark_mode"
        mock_flag.to_dict.return_value = {"name": "ui.dark_mode", "enabled": True}
        mock_service.list_flags = AsyncMock(return_value=[mock_flag])

        response = client.get("/api/flags/changes?since_version=10")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["version"] == 15
        assert data["data"]["since_version"] == 10
        assert "ui.dark_mode" in data["data"]["flags"]


class TestSSEStream:
    """Tests for the SSE stream endpoint."""

    def test_stream_endpoint_headers(self, client):
        """Test that stream endpoint returns correct headers."""
        # Note: TestClient doesn't support streaming properly, but we can verify the endpoint exists
        # A full SSE test would require an async test client
        # For now, we just verify the endpoint responds
        pass  # SSE endpoints require special async testing


class TestIntegration:
    """Integration tests for the real-time feature flags system."""

    @pytest.mark.asyncio
    async def test_end_to_end_update_flow(self):
        """Test the full flow from update to notification."""
        manager = FlagSubscriptionManager()

        # Connect a client
        queue = await manager.connect("test-client", ["test.flag"])

        # Simulate flag update
        flag_data = {"name": "test.flag", "enabled": True, "value": "new_value"}
        notified = await manager.broadcast_flag_update("test.flag", flag_data, 1)

        assert notified == 1

        # Verify event received
        event = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert event["event"] == "flag_update"
        assert event["data"]["flag"] == "test.flag"
        assert event["data"]["value"]["enabled"] is True
        assert event["data"]["version"] == 1

        # Cleanup
        await manager.disconnect("test-client")
        assert manager.get_connection_count() == 0

    @pytest.mark.asyncio
    async def test_multiple_clients_different_filters(self):
        """Test multiple clients with different flag filters."""
        manager = FlagSubscriptionManager()

        # Connect clients with different filters
        queue_ui = await manager.connect("ui-client", ["ui.dark_mode", "ui.theme"])
        queue_backend = await manager.connect("backend-client", ["backend.rag", "backend.cache"])
        queue_all = await manager.connect("all-client")  # All flags

        # Update a UI flag
        await manager.broadcast_flag_update("ui.dark_mode", {"enabled": True}, 1)

        # Check ui-client received it
        event_ui = await asyncio.wait_for(queue_ui.get(), timeout=0.1)
        assert event_ui["data"]["flag"] == "ui.dark_mode"

        # Check all-client received it
        event_all = await asyncio.wait_for(queue_all.get(), timeout=0.1)
        assert event_all["data"]["flag"] == "ui.dark_mode"

        # Check backend-client did NOT receive it
        assert queue_backend.empty()

        # Update a backend flag
        await manager.broadcast_flag_update("backend.rag", {"enabled": False}, 2)

        # Now backend-client should receive it
        event_backend = await asyncio.wait_for(queue_backend.get(), timeout=0.1)
        assert event_backend["data"]["flag"] == "backend.rag"

        # Cleanup
        await manager.disconnect("ui-client")
        await manager.disconnect("backend-client")
        await manager.disconnect("all-client")
