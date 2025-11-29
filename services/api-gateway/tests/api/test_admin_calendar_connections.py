"""
Admin Calendar Connections API tests

Tests admin endpoints for viewing and managing user calendar connections.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request


class TestListAllConnections:
    """Tests for GET /api/admin/calendars/connections."""

    @pytest.mark.asyncio
    async def test_list_all_connections_empty(self):
        """Test listing connections when none exist."""
        from app.api.admin_calendar_connections import list_all_calendar_connections

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"

        mock_db = AsyncMock()
        # Mock empty result for connections query
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        # Mock count result
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0
        mock_db.execute.side_effect = [mock_result, mock_count_result]

        response = await list_all_calendar_connections(
            request=mock_request,
            current_admin_user=mock_admin,
            db=mock_db,
            provider=None,
            status=None,
            limit=50,
            offset=0,
        )

        assert response["success"] is True
        assert response["data"]["connections"] == []
        assert response["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_list_all_connections_with_data(self):
        """Test listing connections with data."""
        from app.api.admin_calendar_connections import list_all_calendar_connections

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"

        # Create mock row objects
        mock_row = MagicMock()
        mock_row.id = "conn-1"
        mock_row.user_id = "user-123"
        mock_row.user_email = "user@example.com"
        mock_row.provider = "google"
        mock_row.provider_display_name = "Google Calendar"
        mock_row.status = "connected"
        mock_row.caldav_url = None
        mock_row.last_sync_at = datetime.now(timezone.utc)
        mock_row.connected_at = datetime.now(timezone.utc)
        mock_row.error_message = None

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [mock_row]
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        mock_db.execute.side_effect = [mock_result, mock_count_result]

        response = await list_all_calendar_connections(
            request=mock_request,
            current_admin_user=mock_admin,
            db=mock_db,
            provider=None,
            status=None,
            limit=50,
            offset=0,
        )

        assert response["success"] is True
        assert len(response["data"]["connections"]) == 1
        assert response["data"]["connections"][0]["provider"] == "google"
        assert response["data"]["total"] == 1

    @pytest.mark.asyncio
    async def test_list_connections_with_provider_filter(self):
        """Test listing connections filtered by provider."""
        from app.api.admin_calendar_connections import list_all_calendar_connections

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0
        mock_db.execute.side_effect = [mock_result, mock_count_result]

        response = await list_all_calendar_connections(
            request=mock_request,
            current_admin_user=mock_admin,
            db=mock_db,
            provider="google",
            status=None,
            limit=50,
            offset=0,
        )

        assert response["success"] is True
        assert response["data"]["filters"]["provider"] == "google"


class TestGetUserConnections:
    """Tests for GET /api/admin/calendars/connections/user/{user_id}."""

    @pytest.mark.asyncio
    async def test_get_user_connections(self):
        """Test getting connections for a specific user."""
        from app.api.admin_calendar_connections import get_user_calendar_connections

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_db.execute.return_value = mock_result

        response = await get_user_calendar_connections(
            request=mock_request,
            user_id="user-123",
            current_admin_user=mock_admin,
            db=mock_db,
        )

        assert response["success"] is True
        assert response["data"]["user_id"] == "user-123"
        assert response["data"]["connections"] == []


class TestAdminDeleteConnection:
    """Tests for DELETE /api/admin/calendars/connections/{connection_id}."""

    @pytest.mark.asyncio
    async def test_delete_connection_success(self):
        """Test successfully deleting a connection."""
        from app.api.admin_calendar_connections import admin_delete_calendar_connection

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"
        mock_admin.email = "admin@example.com"

        # Mock connection exists
        mock_connection = MagicMock()
        mock_connection.id = "conn-123"
        mock_connection.user_id = "user-123"
        mock_connection.provider = "google"

        mock_db = AsyncMock()
        mock_check_result = MagicMock()
        mock_check_result.fetchone.return_value = mock_connection
        mock_db.execute.return_value = mock_check_result
        mock_db.commit = AsyncMock()

        response = await admin_delete_calendar_connection(
            request=mock_request,
            connection_id="conn-123",
            current_admin_user=mock_admin,
            db=mock_db,
        )

        assert response["success"] is True
        assert response["data"]["deleted_id"] == "conn-123"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_connection_not_found(self):
        """Test deleting non-existent connection."""
        from app.api.admin_calendar_connections import admin_delete_calendar_connection
        from fastapi import HTTPException

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = None
        mock_db.execute.return_value = mock_result

        with pytest.raises(HTTPException) as exc_info:
            await admin_delete_calendar_connection(
                request=mock_request,
                connection_id="nonexistent",
                current_admin_user=mock_admin,
                db=mock_db,
            )

        assert exc_info.value.status_code == 404


class TestCalendarStats:
    """Tests for GET /api/admin/calendars/stats."""

    @pytest.mark.asyncio
    async def test_get_calendar_stats(self):
        """Test getting calendar statistics."""
        from app.api.admin_calendar_connections import get_calendar_stats

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        # Mock stats row
        mock_stats_row = MagicMock()
        mock_stats_row.total_connections = 10
        mock_stats_row.connected_count = 8
        mock_stats_row.error_count = 2
        mock_stats_row.users_with_connections = 5

        # Mock provider breakdown
        mock_provider_row_google = MagicMock()
        mock_provider_row_google.provider = "google"
        mock_provider_row_google.count = 6

        mock_provider_row_ms = MagicMock()
        mock_provider_row_ms.provider = "microsoft"
        mock_provider_row_ms.count = 4

        # Mock status breakdown
        mock_status_row_connected = MagicMock()
        mock_status_row_connected.status = "connected"
        mock_status_row_connected.count = 8

        mock_status_row_error = MagicMock()
        mock_status_row_error.status = "error"
        mock_status_row_error.count = 2

        mock_db = AsyncMock()
        mock_stats_result = MagicMock()
        mock_stats_result.fetchone.return_value = mock_stats_row

        mock_provider_result = MagicMock()
        mock_provider_result.fetchall.return_value = [mock_provider_row_google, mock_provider_row_ms]

        mock_status_result = MagicMock()
        mock_status_result.fetchall.return_value = [mock_status_row_connected, mock_status_row_error]

        mock_db.execute.side_effect = [mock_stats_result, mock_provider_result, mock_status_result]

        response = await get_calendar_stats(
            request=mock_request,
            current_admin_user=mock_admin,
            db=mock_db,
        )

        assert response["success"] is True
        assert response["data"]["total_connections"] == 10
        assert response["data"]["connected_count"] == 8
        assert response["data"]["error_count"] == 2
        assert response["data"]["by_provider"]["google"] == 6
        assert response["data"]["by_status"]["connected"] == 8


class TestProviderConfigStatus:
    """Tests for GET /api/admin/calendars/providers."""

    @pytest.mark.asyncio
    async def test_get_provider_config_status(self):
        """Test getting provider configuration status."""
        from app.api.admin_calendar_connections import get_provider_config_status

        mock_request = MagicMock(spec=Request)
        mock_request.state = MagicMock()
        mock_request.state.trace_id = "test-trace-123"

        mock_admin = MagicMock()
        mock_admin.id = "admin-123"

        with patch("app.api.admin_calendar_connections.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = "test-google-id"
            mock_settings.GOOGLE_CLIENT_SECRET = "test-google-secret"
            mock_settings.MICROSOFT_CLIENT_ID = "test-ms-id"
            mock_settings.MICROSOFT_CLIENT_SECRET = "test-ms-secret"
            mock_settings.CALENDAR_ENCRYPTION_KEY = "test-key"
            mock_settings.OAUTH_REDIRECT_URI = "https://example.com/callback"

            response = await get_provider_config_status(
                request=mock_request,
                current_admin_user=mock_admin,
            )

        assert response["success"] is True
        assert "providers" in response["data"]
        assert "google" in response["data"]["providers"]
        assert "microsoft" in response["data"]["providers"]
        assert response["data"]["encryption_key_configured"] is True
