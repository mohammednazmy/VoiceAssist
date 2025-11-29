"""
API tests for Calendar Connections endpoints

Tests user-facing calendar connection management API.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# Mock the OAuth service before importing the app
@pytest.fixture(autouse=True)
def mock_oauth_service():
    """Mock OAuth service for all tests."""
    with patch("app.api.calendar_connections.OAUTH_AVAILABLE", True), patch(
        "app.api.calendar_connections.oauth_service"
    ) as mock:
        mock.get_client_id = MagicMock(return_value="test-client-id")
        mock.get_authorization_url = MagicMock(return_value=("https://auth.example.com/oauth", "test-state-123"))
        mock.get_user_connections = AsyncMock(return_value=[])
        mock.exchange_code = AsyncMock(
            return_value={
                "access_token": "test-token",
                "refresh_token": "test-refresh",
            }
        )
        mock.save_oauth_connection = AsyncMock(return_value="conn-123")
        mock.save_caldav_connection = AsyncMock(return_value="conn-456")
        mock.disconnect = AsyncMock(return_value=True)
        mock.set_default_connection = AsyncMock(return_value=True)
        mock.test_connection = AsyncMock(return_value={"success": True})
        mock.get_provider_status = MagicMock(
            return_value=[
                {"id": "google", "name": "Google Calendar", "type": "oauth", "configured": True},
                {"id": "microsoft", "name": "Microsoft Outlook", "type": "oauth", "configured": True},
            ]
        )
        yield mock


@pytest.fixture
def mock_current_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = "user-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def auth_headers():
    """Mock authentication headers."""
    return {"Authorization": "Bearer test-token"}


class TestListConnections:
    """Tests for GET /api/user/calendars/connections."""

    @pytest.mark.asyncio
    async def test_list_connections_empty(self, mock_oauth_service, mock_current_user):
        """Test listing connections when user has none."""
        mock_oauth_service.get_user_connections.return_value = []

        from app.api.calendar_connections import list_user_calendars
        from fastapi import Request

        # Create mock request and dependencies
        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await list_user_calendars(
                request=mock_request,
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True
        assert response["data"]["connections"] == []

    @pytest.mark.asyncio
    async def test_list_connections_with_data(self, mock_oauth_service, mock_current_user):
        """Test listing connections when user has some."""
        mock_connections = [
            {
                "id": "conn-1",
                "provider": "google",
                "account_email": "user@gmail.com",
                "is_default": True,
                "is_active": True,
            },
            {
                "id": "conn-2",
                "provider": "microsoft",
                "account_email": "user@outlook.com",
                "is_default": False,
                "is_active": True,
            },
        ]
        mock_oauth_service.get_user_connections.return_value = mock_connections

        from app.api.calendar_connections import list_user_calendars
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await list_user_calendars(
                request=mock_request,
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True
        assert len(response["data"]["connections"]) == 2
        assert response["data"]["connections"][0]["provider"] == "google"


class TestOAuthAuthorize:
    """Tests for GET /api/user/calendars/oauth/{provider}/authorize."""

    @pytest.mark.asyncio
    async def test_authorize_google(self, mock_oauth_service, mock_current_user):
        """Test initiating Google OAuth flow."""
        mock_oauth_service.get_authorization_url.return_value = (
            "https://accounts.google.com/oauth?client_id=test",
            "state-123",
        )

        from app.api.calendar_connections import oauth_authorize
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_request.base_url = "https://api.example.com/"
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await oauth_authorize(
                request=mock_request,
                provider="google",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True
        assert "url" in response["data"]
        assert "google.com" in response["data"]["url"]

    @pytest.mark.asyncio
    async def test_authorize_invalid_provider(self, mock_oauth_service, mock_current_user):
        """Test OAuth with invalid provider."""
        from app.api.calendar_connections import oauth_authorize
        from fastapi import HTTPException, Request

        mock_request = MagicMock(spec=Request)
        mock_request.base_url = "https://api.example.com/"
        mock_db = AsyncMock()

        # Should raise HTTPException for invalid provider
        with pytest.raises(HTTPException) as exc_info:
            await oauth_authorize(
                request=mock_request,
                provider="invalid_provider",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_authorize_unconfigured_provider(self, mock_oauth_service, mock_current_user):
        """Test OAuth with unconfigured provider."""
        mock_oauth_service.get_client_id.return_value = ""

        from app.api.calendar_connections import oauth_authorize
        from fastapi import HTTPException, Request

        mock_request = MagicMock(spec=Request)
        mock_request.base_url = "https://api.example.com/"
        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await oauth_authorize(
                request=mock_request,
                provider="google",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert exc_info.value.status_code in [400, 503]


class TestCalDAVConnect:
    """Tests for POST /api/user/calendars/caldav/connect."""

    @pytest.mark.asyncio
    async def test_connect_caldav_success(self, mock_oauth_service, mock_current_user):
        """Test successful CalDAV connection."""
        mock_oauth_service.verify_caldav_credentials = AsyncMock(return_value=True)
        mock_oauth_service.save_caldav_connection.return_value = "conn-new"

        from app.api.calendar_connections import CalDAVConnectRequest, connect_caldav
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        request_data = CalDAVConnectRequest(
            provider="nextcloud",
            caldav_url="https://cloud.example.com",
            username="testuser",
            password="testpass",
        )

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await connect_caldav(
                request=mock_request,
                data=request_data,
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True
        assert "connection_id" in response["data"]

    @pytest.mark.asyncio
    async def test_connect_caldav_invalid_credentials(self, mock_oauth_service, mock_current_user):
        """Test CalDAV connection with invalid credentials."""
        mock_oauth_service.verify_caldav_credentials = AsyncMock(return_value=False)

        from app.api.calendar_connections import CalDAVConnectRequest, connect_caldav
        from fastapi import HTTPException, Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        request_data = CalDAVConnectRequest(
            provider="apple",
            username="user@icloud.com",
            password="wrong-password",
        )

        with pytest.raises(HTTPException) as exc_info:
            await connect_caldav(
                request=mock_request,
                data=request_data,
                current_user=mock_current_user,
                db=mock_db,
            )

        assert exc_info.value.status_code == 400


class TestDisconnect:
    """Tests for DELETE /api/user/calendars/connections/{connection_id}."""

    @pytest.mark.asyncio
    async def test_disconnect_success(self, mock_oauth_service, mock_current_user):
        """Test successful disconnection."""
        mock_oauth_service.get_user_connections.return_value = [{"id": "conn-123", "provider": "google"}]
        mock_oauth_service.disconnect.return_value = True

        from app.api.calendar_connections import disconnect_calendar
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await disconnect_calendar(
                request=mock_request,
                connection_id="conn-123",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True

    @pytest.mark.asyncio
    async def test_disconnect_not_found(self, mock_oauth_service, mock_current_user):
        """Test disconnecting non-existent connection."""
        mock_oauth_service.get_user_connections.return_value = []

        from app.api.calendar_connections import disconnect_calendar
        from fastapi import HTTPException, Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await disconnect_calendar(
                request=mock_request,
                connection_id="nonexistent",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert exc_info.value.status_code == 404


class TestSetDefault:
    """Tests for POST /api/user/calendars/connections/{connection_id}/set-default."""

    @pytest.mark.asyncio
    async def test_set_default_success(self, mock_oauth_service, mock_current_user):
        """Test setting default calendar."""
        mock_oauth_service.get_user_connections.return_value = [
            {"id": "conn-123", "provider": "google", "is_default": False}
        ]
        mock_oauth_service.set_default_connection.return_value = True

        from app.api.calendar_connections import set_default_calendar
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await set_default_calendar(
                request=mock_request,
                connection_id="conn-123",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True


class TestTestConnection:
    """Tests for POST /api/user/calendars/connections/{connection_id}/test."""

    @pytest.mark.asyncio
    async def test_connection_success(self, mock_oauth_service, mock_current_user):
        """Test successful connection test."""
        mock_oauth_service.get_user_connections.return_value = [{"id": "conn-123", "provider": "google"}]
        mock_oauth_service.test_connection.return_value = {"success": True}

        from app.api.calendar_connections import test_calendar_connection
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await test_calendar_connection(
                request=mock_request,
                connection_id="conn-123",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["success"] is True
        assert response["data"]["success"] is True

    @pytest.mark.asyncio
    async def test_connection_failure(self, mock_oauth_service, mock_current_user):
        """Test failed connection test."""
        mock_oauth_service.get_user_connections.return_value = [{"id": "conn-123", "provider": "google"}]
        mock_oauth_service.test_connection.return_value = {"success": False, "error": "Token expired"}

        from app.api.calendar_connections import test_calendar_connection
        from fastapi import Request

        mock_request = MagicMock(spec=Request)
        mock_db = AsyncMock()

        with patch("app.api.calendar_connections.get_current_user", return_value=mock_current_user):
            response = await test_calendar_connection(
                request=mock_request,
                connection_id="conn-123",
                current_user=mock_current_user,
                db=mock_db,
            )

        assert response["data"]["success"] is False
        assert "error" in response["data"]


class TestListProviders:
    """Tests for GET /api/user/calendars/providers."""

    @pytest.mark.asyncio
    async def test_list_providers(self, mock_oauth_service, mock_current_user):
        """Test listing available providers."""
        from app.api.calendar_connections import list_providers
        from fastapi import Request

        mock_request = MagicMock(spec=Request)

        response = await list_providers(request=mock_request)

        assert response["success"] is True
        assert "providers" in response["data"]
        assert len(response["data"]["providers"]) >= 2

        # Check provider structure
        for provider in response["data"]["providers"]:
            assert "id" in provider
            assert "name" in provider
            assert "auth_type" in provider
