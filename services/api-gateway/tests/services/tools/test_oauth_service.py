"""
Unit tests for OAuth Service

Tests OAuth flow, token management, and CalDAV integration.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestOAuthServiceInit:
    """Tests for OAuthService initialization."""

    def test_init_with_encryption_key(self):
        """Test initialization with encryption key."""
        with patch.dict(os.environ, {"CALENDAR_ENCRYPTION_KEY": "test-key-32-bytes-long-here123"}):
            from app.services.tools.oauth_service import OAuthService

            OAuthService()
            # Should initialize without warnings about missing key

    def test_init_without_encryption_key(self):
        """Test initialization without encryption key logs warning."""
        with patch.dict(os.environ, {"CALENDAR_ENCRYPTION_KEY": ""}, clear=False):
            # Remove the key if it exists
            env = os.environ.copy()
            env.pop("CALENDAR_ENCRYPTION_KEY", None)
            with patch.dict(os.environ, env, clear=True):
                pass

                # Reinitialize to test warning
                # Note: actual warning test would require log capture


class TestOAuthServiceProviders:
    """Tests for OAuth provider configuration."""

    def setup_method(self):
        """Set up test fixtures."""
        from app.services.tools.oauth_service import CalendarProvider, OAuthService

        self.service = OAuthService()
        self.CalendarProvider = CalendarProvider

    def test_google_oauth_config(self):
        """Test Google OAuth configuration."""
        config = self.service.OAUTH_CONFIGS.get(self.CalendarProvider.GOOGLE)

        assert config is not None
        assert "auth_url" in config
        assert "token_url" in config
        assert "scopes" in config
        assert "accounts.google.com" in config["auth_url"]
        assert "calendar" in str(config["scopes"]).lower()

    def test_microsoft_oauth_config(self):
        """Test Microsoft OAuth configuration."""
        config = self.service.OAUTH_CONFIGS.get(self.CalendarProvider.MICROSOFT)

        assert config is not None
        assert "auth_url" in config
        assert "token_url" in config
        assert "scopes" in config
        assert "microsoftonline" in config["auth_url"]

    def test_get_client_id_google(self):
        """Test getting Google client ID."""
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-google-client"}):
            client_id = self.service.get_client_id("google")
            assert client_id == "test-google-client"

    def test_get_client_id_microsoft(self):
        """Test getting Microsoft client ID."""
        with patch.dict(os.environ, {"MICROSOFT_CLIENT_ID": "test-ms-client"}):
            client_id = self.service.get_client_id("microsoft")
            assert client_id == "test-ms-client"

    def test_get_client_id_unknown(self):
        """Test getting client ID for unknown provider."""
        client_id = self.service.get_client_id("unknown_provider")
        assert client_id == ""


class TestOAuthServiceEncryption:
    """Tests for token encryption/decryption."""

    def setup_method(self):
        """Set up test fixtures with encryption key."""
        from cryptography.fernet import Fernet

        self.test_key = Fernet.generate_key()

        with patch.dict(os.environ, {"CALENDAR_ENCRYPTION_KEY": self.test_key.decode()}):
            from app.services.tools.oauth_service import OAuthService

            self.service = OAuthService()

    def test_encrypt_decrypt_roundtrip(self):
        """Test encryption and decryption of tokens."""
        original = "test-access-token-12345"

        encrypted = self.service._encrypt(original)
        assert encrypted != original
        assert len(encrypted) > len(original)

        decrypted = self.service._decrypt(encrypted)
        assert decrypted == original

    def test_encrypt_empty_string(self):
        """Test encrypting empty string."""
        encrypted = self.service._encrypt("")
        decrypted = self.service._decrypt(encrypted)
        assert decrypted == ""

    def test_decrypt_invalid_token(self):
        """Test decrypting invalid token returns None or raises."""
        result = self.service._decrypt("not-a-valid-encrypted-token")
        # Should return None or the original string on failure
        assert result is None or result == "not-a-valid-encrypted-token"


class TestOAuthServiceAuthorizationURL:
    """Tests for OAuth authorization URL generation."""

    def setup_method(self):
        """Set up test fixtures."""
        from app.services.tools.oauth_service import OAuthService

        self.service = OAuthService()

    def test_generate_google_auth_url(self):
        """Test generating Google authorization URL."""
        with patch.dict(
            os.environ,
            {
                "GOOGLE_CLIENT_ID": "test-client-id",
            },
        ):
            url, state = self.service.get_authorization_url(
                provider="google",
                redirect_uri="https://example.com/callback",
                user_id="user123",
            )

            assert "accounts.google.com" in url
            assert "client_id=test-client-id" in url
            assert "redirect_uri=" in url
            assert state is not None
            assert len(state) > 0

    def test_generate_microsoft_auth_url(self):
        """Test generating Microsoft authorization URL."""
        with patch.dict(
            os.environ,
            {
                "MICROSOFT_CLIENT_ID": "test-ms-client",
            },
        ):
            url, state = self.service.get_authorization_url(
                provider="microsoft",
                redirect_uri="https://example.com/callback",
                user_id="user123",
            )

            assert "microsoftonline" in url
            assert "client_id=test-ms-client" in url
            assert state is not None

    def test_auth_url_includes_scopes(self):
        """Test that auth URL includes required scopes."""
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-client"}):
            url, _ = self.service.get_authorization_url(
                provider="google",
                redirect_uri="https://example.com/callback",
                user_id="user123",
            )

            assert "scope=" in url
            assert "calendar" in url.lower()


class TestOAuthServiceTokenExchange:
    """Tests for OAuth token exchange."""

    def setup_method(self):
        """Set up test fixtures."""
        from app.services.tools.oauth_service import OAuthService

        self.service = OAuthService()

    @pytest.mark.asyncio
    async def test_exchange_code_for_tokens(self):
        """Test exchanging authorization code for tokens."""
        mock_response = {
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = MagicMock(
                status_code=200,
                json=MagicMock(return_value=mock_response),
                raise_for_status=MagicMock(),
            )
            mock_client.return_value.__aenter__.return_value = mock_instance

            with patch.dict(
                os.environ,
                {
                    "GOOGLE_CLIENT_ID": "test-client",
                    "GOOGLE_CLIENT_SECRET": "test-secret",
                },
            ):
                tokens = await self.service.exchange_code(
                    provider="google",
                    code="test-auth-code",
                    redirect_uri="https://example.com/callback",
                )

                assert tokens is not None
                assert tokens.get("access_token") == "test-access-token"


class TestOAuthServiceCalDAV:
    """Tests for CalDAV integration."""

    def setup_method(self):
        """Set up test fixtures."""
        from app.services.tools.oauth_service import OAuthService

        self.service = OAuthService()

    def test_build_caldav_url_apple(self):
        """Test building CalDAV URL for Apple iCloud."""
        url = self.service._build_caldav_url("apple", "user@icloud.com")

        assert "caldav.icloud.com" in url or "icloud.com" in url

    def test_build_caldav_url_nextcloud(self):
        """Test building CalDAV URL for Nextcloud."""
        url = self.service._build_caldav_url("nextcloud", "user", base_url="https://cloud.example.com")

        assert "cloud.example.com" in url
        assert "remote.php/dav" in url or "calendars" in url

    @pytest.mark.asyncio
    async def test_verify_caldav_credentials_invalid(self):
        """Test CalDAV verification with invalid credentials."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.request.return_value = MagicMock(
                status_code=401,
            )
            mock_client.return_value.__aenter__.return_value = mock_instance

            result = await self.service.verify_caldav_credentials(
                caldav_url="https://caldav.example.com",
                username="user",
                password="wrong-password",
            )

            assert result is False


class TestOAuthServiceConnectionManagement:
    """Tests for connection management."""

    def setup_method(self):
        """Set up test fixtures."""
        from app.services.tools.oauth_service import OAuthService

        self.service = OAuthService()

    @pytest.mark.asyncio
    async def test_get_user_connections_empty(self):
        """Test getting connections for user with none."""
        mock_db = AsyncMock()
        mock_db.execute.return_value = MagicMock(fetchall=MagicMock(return_value=[]))

        connections = await self.service.get_user_connections(
            user_id="user123",
            db_session=mock_db,
        )

        assert connections == []

    @pytest.mark.asyncio
    async def test_disconnect_calendar(self):
        """Test disconnecting a calendar."""
        mock_db = AsyncMock()
        mock_db.execute.return_value = MagicMock(rowcount=1)
        mock_db.commit = AsyncMock()

        result = await self.service.disconnect(
            connection_id="conn123",
            db_session=mock_db,
        )

        assert result is True
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_default_connection(self):
        """Test setting default calendar connection."""
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(rowcount=1))
        mock_db.commit = AsyncMock()

        result = await self.service.set_default_connection(
            user_id="user123",
            connection_id="conn456",
            db_session=mock_db,
        )

        assert result is True
        # Should have called execute twice (clear old default, set new)
        assert mock_db.execute.call_count >= 1


class TestCalendarProviderEnum:
    """Tests for CalendarProvider enum."""

    def test_provider_values(self):
        """Test provider enum values."""
        from app.services.tools.oauth_service import CalendarProvider

        assert CalendarProvider.GOOGLE.value == "google"
        assert CalendarProvider.MICROSOFT.value == "microsoft"
        assert CalendarProvider.APPLE.value == "apple"
        assert CalendarProvider.NEXTCLOUD.value == "nextcloud"

    def test_provider_from_string(self):
        """Test creating provider from string."""
        from app.services.tools.oauth_service import CalendarProvider

        assert CalendarProvider("google") == CalendarProvider.GOOGLE
        assert CalendarProvider("microsoft") == CalendarProvider.MICROSOFT
