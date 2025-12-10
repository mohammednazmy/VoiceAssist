"""
OAuth Service for VoiceAssist Calendar Integration

Handles OAuth flows for Google Calendar and Microsoft Outlook,
as well as CalDAV credential management for Apple iCloud and Nextcloud.
"""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CalendarProvider(str, Enum):
    """Supported calendar providers."""

    GOOGLE = "google"
    MICROSOFT = "microsoft"
    APPLE = "apple"
    NEXTCLOUD = "nextcloud"
    CALDAV = "caldav"


class OAuthService:
    """
    Handles OAuth flows and credential management for calendar providers.

    Responsibilities:
    - Generate OAuth authorization URLs
    - Exchange authorization codes for tokens
    - Refresh expired tokens
    - Encrypt/decrypt stored tokens
    - Manage CalDAV credentials
    """

    # OAuth configuration for each provider
    OAUTH_CONFIGS = {
        CalendarProvider.GOOGLE: {
            "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "scopes": [
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/calendar.events",
            ],
        },
        CalendarProvider.MICROSOFT: {
            "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "scopes": [
                "https://graph.microsoft.com/Calendars.ReadWrite",
                "offline_access",
            ],
        },
    }

    def __init__(self):
        """Initialize OAuth service with encryption key."""
        self._encryption_key = self._get_encryption_key()
        if self._encryption_key:
            self._cipher = Fernet(self._encryption_key)
        else:
            self._cipher = None
            logger.warning("No CALENDAR_ENCRYPTION_KEY set - token encryption disabled")

    def _get_encryption_key(self) -> Optional[bytes]:
        """Get the encryption key from environment."""
        key = os.environ.get("CALENDAR_ENCRYPTION_KEY")
        if key:
            return key.encode() if isinstance(key, str) else key
        return None

    def get_client_id(self, provider: str) -> str:
        """Get OAuth client ID for a provider."""
        if provider == "google":
            return os.environ.get("GOOGLE_CLIENT_ID", "")
        elif provider == "microsoft":
            return os.environ.get("MICROSOFT_CLIENT_ID", "")
        return ""

    def get_client_secret(self, provider: str) -> str:
        """Get OAuth client secret for a provider."""
        if provider == "google":
            return os.environ.get("GOOGLE_CLIENT_SECRET", "")
        elif provider == "microsoft":
            return os.environ.get("MICROSOFT_CLIENT_SECRET", "")
        return ""

    def _encrypt(self, data: str) -> str:
        """Encrypt a string using Fernet."""
        if not self._cipher:
            return data  # No encryption if key not set
        return self._cipher.encrypt(data.encode()).decode()

    def _decrypt(self, encrypted_data: str) -> Optional[str]:
        """Decrypt a string using Fernet.

        Returns:
            Decrypted string, or None if decryption fails.
        """
        if not self._cipher:
            return encrypted_data
        try:
            return self._cipher.decrypt(encrypted_data.encode()).decode()
        except Exception:
            # Invalid token format or decryption error
            return None

    async def get_authorization_url(
        self,
        provider: CalendarProvider,
        user_id: str,
        redirect_uri: str,
        db_session: AsyncSession,
        connection_name: Optional[str] = None,
    ) -> str:
        """
        Generate OAuth authorization URL with CSRF state.

        Args:
            provider: Calendar provider (google or microsoft)
            user_id: User identifier
            redirect_uri: Where to redirect after authorization
            db_session: Database session
            connection_name: Optional friendly name for the connection

        Returns:
            Authorization URL to redirect user to
        """
        if provider not in [CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT]:
            raise ValueError(f"OAuth not supported for provider: {provider}")

        config = self.OAUTH_CONFIGS[provider]

        # Generate CSRF state token
        state = secrets.token_urlsafe(32)

        # Store state in database
        await db_session.execute(
            text(
                """
                INSERT INTO oauth_states (state, user_id, provider, redirect_uri, connection_name)
                VALUES (:state, :user_id, :provider, :redirect_uri, :connection_name)
            """
            ),
            {
                "state": state,
                "user_id": user_id,
                "provider": provider.value,
                "redirect_uri": redirect_uri,
                "connection_name": connection_name,
            },
        )
        await db_session.commit()

        # Build authorization URL
        params = {
            "client_id": self.get_client_id(provider.value),
            "redirect_uri": os.environ.get("OAUTH_REDIRECT_URI", redirect_uri),
            "scope": " ".join(config["scopes"]),
            "state": state,
            "response_type": "code",
            "access_type": "offline",  # For refresh token
            "prompt": "consent",
        }

        return f"{config['auth_url']}?{urlencode(params)}"

    async def handle_callback(
        self,
        code: str,
        state: str,
        db_session: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Handle OAuth callback - exchange code for tokens.

        Args:
            code: Authorization code from provider
            state: CSRF state token
            db_session: Database session

        Returns:
            Dict with success status and provider info
        """
        # Validate state
        result = await db_session.execute(
            text(
                """
                SELECT user_id, provider, redirect_uri, connection_name
                FROM oauth_states
                WHERE state = :state AND expires_at > now()
            """
            ),
            {"state": state},
        )
        state_record = result.fetchone()

        if not state_record:
            raise ValueError("Invalid or expired OAuth state")

        user_id = state_record.user_id
        provider = CalendarProvider(state_record.provider)
        connection_name = state_record.connection_name

        # Delete used state
        await db_session.execute(
            text("DELETE FROM oauth_states WHERE state = :state"),
            {"state": state},
        )

        # Exchange code for tokens
        config = self.OAUTH_CONFIGS[provider]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data={
                    "client_id": self.get_client_id(provider.value),
                    "client_secret": self.get_client_secret(provider.value),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": os.environ.get("OAUTH_REDIRECT_URI", state_record.redirect_uri),
                },
            )
            response.raise_for_status()
            tokens = response.json()

        # Encrypt tokens
        access_token_encrypted = self._encrypt(tokens["access_token"])
        refresh_token_encrypted = self._encrypt(tokens.get("refresh_token", ""))

        # Calculate token expiry
        expires_in = tokens.get("expires_in", 3600)
        token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Store or update connection
        await db_session.execute(
            text(
                """
                INSERT INTO user_calendar_connections
                (user_id, provider, provider_display_name, access_token_encrypted,
                 refresh_token_encrypted, token_expires_at, status, scopes)
                VALUES (:user_id, :provider, :display_name, :access_token, :refresh_token,
                        :expires_at, 'connected', :scopes)
                ON CONFLICT (user_id, provider, caldav_url)
                DO UPDATE SET
                    access_token_encrypted = :access_token,
                    refresh_token_encrypted = :refresh_token,
                    token_expires_at = :expires_at,
                    status = 'connected',
                    error_message = NULL,
                    updated_at = now()
            """
            ),
            {
                "user_id": user_id,
                "provider": provider.value,
                "display_name": connection_name or f"{provider.value.title()} Calendar",
                "access_token": access_token_encrypted,
                "refresh_token": refresh_token_encrypted,
                "expires_at": token_expires_at,
                "scopes": config["scopes"],
            },
        )
        await db_session.commit()

        logger.info(f"Successfully connected {provider.value} calendar for user {user_id[:8]}...")

        return {
            "success": True,
            "provider": provider.value,
            "user_id": user_id,
        }

    async def connect_caldav(
        self,
        user_id: str,
        provider: CalendarProvider,
        caldav_url: str,
        username: str,
        password: str,
        db_session: AsyncSession,
        connection_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Store CalDAV credentials for Apple iCloud or Nextcloud.

        Args:
            user_id: User identifier
            provider: Calendar provider (apple, nextcloud, or caldav)
            caldav_url: CalDAV server URL
            username: CalDAV username
            password: CalDAV password (or app-specific password)
            db_session: Database session
            connection_name: Optional friendly name

        Returns:
            Dict with success status
        """
        # Test connection first
        try:
            from app.services.caldav_service import CalDAVService

            caldav = CalDAVService(url=caldav_url, username=username, password=password)
            # Try to list calendars to verify connection
            await caldav.test_connection()
        except Exception as e:
            logger.warning(f"CalDAV connection test failed: {e}")
            return {
                "success": False,
                "error": f"Connection test failed: {str(e)}",
            }

        # Encrypt credentials
        password_encrypted = self._encrypt(password)

        # Store connection
        await db_session.execute(
            text(
                """
                INSERT INTO user_calendar_connections
                (user_id, provider, provider_display_name, caldav_url,
                 caldav_username, caldav_password_encrypted, status)
                VALUES (:user_id, :provider, :display_name, :caldav_url,
                        :username, :password, 'connected')
                ON CONFLICT (user_id, provider, caldav_url)
                DO UPDATE SET
                    caldav_username = :username,
                    caldav_password_encrypted = :password,
                    status = 'connected',
                    error_message = NULL,
                    updated_at = now()
            """
            ),
            {
                "user_id": user_id,
                "provider": provider.value,
                "display_name": connection_name or f"{provider.value.title()} Calendar",
                "caldav_url": caldav_url,
                "username": username,
                "password": password_encrypted,
            },
        )
        await db_session.commit()

        logger.info(f"Successfully connected {provider.value} CalDAV calendar for user {user_id[:8]}...")

        return {
            "success": True,
            "provider": provider.value,
        }

    async def get_decrypted_tokens(
        self,
        connection_id: str,
        db_session: Optional[AsyncSession],
    ) -> Optional[Dict[str, str]]:
        """
        Get decrypted OAuth tokens for a connection.
        Automatically refreshes expired tokens if a refresh token is available.

        Args:
            connection_id: Calendar connection ID
            db_session: Database session

        Returns:
            Dict with access_token and refresh_token, or None
        """
        if not db_session:
            return None

        result = await db_session.execute(
            text(
                """
                SELECT access_token_encrypted, refresh_token_encrypted, token_expires_at, provider
                FROM user_calendar_connections
                WHERE id = :id
            """
            ),
            {"id": connection_id},
        )
        row = result.fetchone()

        if not row or not row.access_token_encrypted:
            return None

        access_token = self._decrypt(row.access_token_encrypted)
        refresh_token = self._decrypt(row.refresh_token_encrypted) if row.refresh_token_encrypted else None

        # Check if token needs refresh (with 5 minute buffer)
        buffer_time = timedelta(minutes=5)
        if row.token_expires_at and row.token_expires_at < datetime.now(timezone.utc) + buffer_time:
            if refresh_token:
                logger.info(f"Token expired for connection {connection_id}, attempting refresh...")
                try:
                    new_tokens = await self._refresh_oauth_token(
                        provider=row.provider,
                        refresh_token=refresh_token,
                        connection_id=connection_id,
                        db_session=db_session,
                    )
                    if new_tokens:
                        access_token = new_tokens["access_token"]
                        if new_tokens.get("refresh_token"):
                            refresh_token = new_tokens["refresh_token"]
                        logger.info(f"Successfully refreshed token for connection {connection_id}")
                except Exception as e:
                    logger.error(f"Failed to refresh token for connection {connection_id}: {e}")
                    # Return the old token anyway - it might still work for a few seconds
            else:
                logger.warning(f"Token expired for connection {connection_id} but no refresh token available")

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
        }

    async def _refresh_oauth_token(
        self,
        provider: str,
        refresh_token: str,
        connection_id: str,
        db_session: AsyncSession,
    ) -> Optional[Dict[str, str]]:
        """
        Refresh an expired OAuth token.

        Args:
            provider: Calendar provider (google or microsoft)
            refresh_token: The refresh token
            connection_id: Connection ID to update
            db_session: Database session

        Returns:
            Dict with new access_token (and optionally new refresh_token), or None
        """
        try:
            provider_enum = CalendarProvider(provider)
        except ValueError:
            logger.error(f"Unknown provider for token refresh: {provider}")
            return None

        if provider_enum not in self.OAUTH_CONFIGS:
            logger.error(f"OAuth not supported for provider: {provider}")
            return None

        config = self.OAUTH_CONFIGS[provider_enum]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data={
                    "client_id": self.get_client_id(provider),
                    "client_secret": self.get_client_secret(provider),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            response.raise_for_status()
            tokens = response.json()

        # Encrypt new tokens
        access_token_encrypted = self._encrypt(tokens["access_token"])
        # Some providers return a new refresh token, some don't
        new_refresh_token = tokens.get("refresh_token")
        refresh_token_encrypted = self._encrypt(new_refresh_token) if new_refresh_token else None

        # Calculate new token expiry
        expires_in = tokens.get("expires_in", 3600)
        token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Update the connection with new tokens
        if refresh_token_encrypted:
            await db_session.execute(
                text(
                    """
                    UPDATE user_calendar_connections
                    SET access_token_encrypted = :access_token,
                        refresh_token_encrypted = :refresh_token,
                        token_expires_at = :expires_at,
                        status = 'connected',
                        error_message = NULL,
                        updated_at = now()
                    WHERE id = :id
                """
                ),
                {
                    "access_token": access_token_encrypted,
                    "refresh_token": refresh_token_encrypted,
                    "expires_at": token_expires_at,
                    "id": connection_id,
                },
            )
        else:
            await db_session.execute(
                text(
                    """
                    UPDATE user_calendar_connections
                    SET access_token_encrypted = :access_token,
                        token_expires_at = :expires_at,
                        status = 'connected',
                        error_message = NULL,
                        updated_at = now()
                    WHERE id = :id
                """
                ),
                {
                    "access_token": access_token_encrypted,
                    "expires_at": token_expires_at,
                    "id": connection_id,
                },
            )
        await db_session.commit()

        return {
            "access_token": tokens["access_token"],
            "refresh_token": new_refresh_token or refresh_token,
        }

    async def get_caldav_credentials(
        self,
        connection_id: str,
        db_session: Optional[AsyncSession],
    ) -> Optional[Dict[str, str]]:
        """
        Get decrypted CalDAV credentials for a connection.

        Args:
            connection_id: Calendar connection ID
            db_session: Database session

        Returns:
            Dict with url, username, password, or None
        """
        if not db_session:
            return None

        result = await db_session.execute(
            text(
                """
                SELECT caldav_url, caldav_username, caldav_password_encrypted
                FROM user_calendar_connections
                WHERE id = :id AND status = 'connected'
            """
            ),
            {"id": connection_id},
        )
        row = result.fetchone()

        if not row or not row.caldav_url:
            return None

        return {
            "url": row.caldav_url,
            "username": row.caldav_username,
            "password": (self._decrypt(row.caldav_password_encrypted) if row.caldav_password_encrypted else None),
        }

    async def get_user_connections(
        self,
        user_id: str,
        db_session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """
        Get all calendar connections for a user.

        Args:
            user_id: User identifier
            db_session: Database session

        Returns:
            List of connection dictionaries
        """
        result = await db_session.execute(
            text(
                """
                SELECT id, provider, provider_display_name, status, caldav_url,
                       last_sync_at, connected_at, error_message, token_expires_at, is_default
                FROM user_calendar_connections
                WHERE user_id = :user_id
                ORDER BY connected_at
            """
            ),
            {"user_id": user_id},
        )
        rows = result.fetchall()

        now = datetime.now(timezone.utc)
        return [
            {
                "id": str(row.id),
                "provider": row.provider,
                "provider_display_name": row.provider_display_name,
                "status": row.status,
                "is_active": row.status == "connected" and (row.token_expires_at is None or row.token_expires_at > now),
                "is_default": row.is_default or False,
                "caldav_url": row.caldav_url,
                "last_sync_at": (row.last_sync_at.isoformat() if row.last_sync_at else None),
                "connected_at": (row.connected_at.isoformat() if row.connected_at else None),
                "error_message": row.error_message,
            }
            for row in rows
        ]

    async def disconnect(
        self,
        connection_id: str,
        db_session: AsyncSession,
    ) -> bool:
        """
        Disconnect (delete) a calendar connection.

        Args:
            connection_id: Calendar connection ID
            db_session: Database session

        Returns:
            True if deleted, False otherwise
        """
        result = await db_session.execute(
            text("DELETE FROM user_calendar_connections WHERE id = :id"),
            {"id": connection_id},
        )
        await db_session.commit()

        return result.rowcount > 0

    async def set_default_connection(
        self,
        user_id: str,
        connection_id: str,
        db_session: AsyncSession,
    ) -> bool:
        """
        Set a calendar connection as the default for a user.

        This first clears any existing default, then sets the specified
        connection as the new default.

        Args:
            user_id: User's ID
            connection_id: Connection ID to set as default
            db_session: Database session

        Returns:
            True if successful, False otherwise
        """
        # First, clear existing default for this user
        await db_session.execute(
            text(
                """
                UPDATE user_calendar_connections
                SET is_default = FALSE
                WHERE user_id = :user_id AND is_default = TRUE
            """
            ),
            {"user_id": user_id},
        )

        # Set the new default
        result = await db_session.execute(
            text(
                """
                UPDATE user_calendar_connections
                SET is_default = TRUE
                WHERE id = :id AND user_id = :user_id
            """
            ),
            {"id": connection_id, "user_id": user_id},
        )
        await db_session.commit()

        return result.rowcount > 0

    async def test_connection(
        self,
        connection_id: str,
        db_session: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Test a calendar connection.

        Args:
            connection_id: Calendar connection ID
            db_session: Database session

        Returns:
            Dict with test results
        """
        result = await db_session.execute(
            text(
                """
                SELECT provider, caldav_url
                FROM user_calendar_connections
                WHERE id = :id
            """
            ),
            {"id": connection_id},
        )
        row = result.fetchone()

        if not row:
            return {"success": False, "error": "Connection not found"}

        provider = row.provider

        try:
            if provider in ["google", "microsoft"]:
                # Test OAuth connection by listing calendars
                tokens = await self.get_decrypted_tokens(connection_id, db_session)
                if not tokens:
                    return {"success": False, "error": "No valid tokens"}

                # Simple API test
                if provider == "google":
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(
                            "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                            headers={"Authorization": f"Bearer {tokens['access_token']}"},
                        )
                        resp.raise_for_status()
                elif provider == "microsoft":
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(
                            "https://graph.microsoft.com/v1.0/me/calendars",
                            headers={"Authorization": f"Bearer {tokens['access_token']}"},
                        )
                        resp.raise_for_status()

            else:
                # Test CalDAV connection
                creds = await self.get_caldav_credentials(connection_id, db_session)
                if not creds:
                    return {"success": False, "error": "No CalDAV credentials"}

                from app.services.caldav_service import CalDAVService

                caldav = CalDAVService(
                    url=creds["url"],
                    username=creds["username"],
                    password=creds["password"],
                )
                await caldav.test_connection()

            # Update last sync time
            await db_session.execute(
                text(
                    """
                    UPDATE user_calendar_connections
                    SET last_sync_at = now(), status = 'connected', error_message = NULL
                    WHERE id = :id
                """
                ),
                {"id": connection_id},
            )
            await db_session.commit()

            return {"success": True}

        except Exception as e:
            # Update connection status with error
            await db_session.execute(
                text(
                    """
                    UPDATE user_calendar_connections
                    SET status = 'error', error_message = :error
                    WHERE id = :id
                """
                ),
                {"id": connection_id, "error": str(e)[:500]},
            )
            await db_session.commit()

            return {"success": False, "error": str(e)}


# Global singleton instance
oauth_service = OAuthService()
