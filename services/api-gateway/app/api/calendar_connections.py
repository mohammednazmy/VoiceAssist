"""
Calendar Connections API

User-facing endpoints for managing calendar integrations
(Google, Microsoft, Apple iCloud, Nextcloud).
"""

from typing import Literal, Optional

from app.core.api_envelope import success_response
from app.core.config import settings
from app.core.database import get_async_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

# Import OAuth service for calendar connections
try:
    from app.services.tools.oauth_service import CalendarProvider, oauth_service

    OAUTH_AVAILABLE = True
except ImportError:
    OAUTH_AVAILABLE = False

logger = get_logger(__name__)
router = APIRouter(prefix="/api/user/calendars", tags=["user", "calendars"])
limiter = Limiter(key_func=get_remote_address)


# Pydantic models for request/response
class CalendarConnectionResponse(BaseModel):
    """Response model for a calendar connection."""

    id: str
    provider: str
    provider_display_name: str
    status: str
    caldav_url: Optional[str] = None
    last_sync_at: Optional[str] = None
    connected_at: Optional[str] = None
    error_message: Optional[str] = None


class CalDAVConnectionRequest(BaseModel):
    """Request model for CalDAV connection."""

    provider: Literal["apple", "nextcloud", "caldav"]
    caldav_url: str = Field(..., description="CalDAV server URL")
    username: str = Field(..., description="CalDAV username")
    password: str = Field(..., description="CalDAV password or app-specific password")
    connection_name: Optional[str] = Field(None, description="Friendly name for this connection")


class OAuthCallbackRequest(BaseModel):
    """Request model for OAuth callback."""

    code: str = Field(..., description="Authorization code from OAuth provider")
    state: str = Field(..., description="CSRF state token")


@router.get("/connections")
@limiter.limit("30/minute")
async def list_calendar_connections(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    List all calendar connections for the current user.

    Returns a list of connected calendars including status and provider info.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar integration is not available",
        )

    try:
        connections = await oauth_service.get_user_connections(
            user_id=str(current_user.id),
            db_session=db,
        )
        return success_response(connections)
    except Exception as e:
        logger.error(
            "list_calendar_connections_failed",
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve calendar connections",
        )


@router.get("/oauth/{provider}/authorize")
@limiter.limit("10/minute")
async def calendar_oauth_authorize(
    request: Request,
    provider: Literal["google", "microsoft"],
    connection_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Get OAuth authorization URL for connecting a calendar.

    This is different from login OAuth - it requests calendar-specific scopes.

    - **provider**: "google" or "microsoft"
    - **connection_name**: Optional friendly name for this calendar connection

    Returns a URL to redirect the user to for authorization.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar OAuth is not available",
        )

    # Check if provider is configured
    client_id = oauth_service.get_client_id(provider)
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider.title()} calendar integration is not configured",
        )

    try:
        # Generate callback URL using forwarded headers or fallback to ALLOWED_ORIGINS
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")

        if forwarded_host and "localhost" not in forwarded_host and "voiceassist" not in forwarded_host:
            base_url = f"{forwarded_proto}://{forwarded_host}"
        else:
            # Fallback to first allowed origin (should be the primary domain)
            allowed_origins = settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS else []
            # Prefer dev.asimo.io or first https origin
            base_url = next(
                (o.strip() for o in allowed_origins if "dev.asimo.io" in o),
                next(
                    (o.strip() for o in allowed_origins if o.strip().startswith("https")),
                    str(request.base_url).rstrip("/"),
                ),
            )

        callback_url = f"{base_url}/api/user/calendars/oauth/callback"

        logger.info(
            "calendar_oauth_redirect_uri",
            base_url=base_url,
            callback_url=callback_url,
            forwarded_host=forwarded_host,
        )

        provider_enum = CalendarProvider.GOOGLE if provider == "google" else CalendarProvider.MICROSOFT

        auth_url = await oauth_service.get_authorization_url(
            provider=provider_enum,
            user_id=str(current_user.id),
            redirect_uri=callback_url,
            db_session=db,
            connection_name=connection_name,
        )

        logger.info(
            "calendar_oauth_authorize_url_generated",
            provider=provider,
            user_id=str(current_user.id),
        )

        return success_response({"url": auth_url, "provider": provider})

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(
            "calendar_oauth_authorize_failed",
            provider=provider,
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate authorization URL",
        )


@router.get("/oauth/callback")
@limiter.limit("10/minute")
async def calendar_oauth_callback_get(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Handle OAuth callback (GET request from provider redirect).

    This endpoint receives the authorization code and state from the OAuth provider
    after the user authorizes access to their calendar.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar OAuth is not available",
        )

    try:
        result = await oauth_service.handle_callback(
            code=code,
            state=state,
            db_session=db,
        )

        logger.info(
            "calendar_oauth_callback_success",
            provider=result.get("provider"),
            user_id=result.get("user_id", "")[:8],
        )

        # Determine frontend URL from forwarded headers or config
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")

        if forwarded_host and "localhost" not in forwarded_host and "voiceassist" not in forwarded_host:
            frontend_url = f"{forwarded_proto}://{forwarded_host}"
        else:
            # Fallback to ALLOWED_ORIGINS, preferring dev.asimo.io
            allowed_origins = settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS else []
            frontend_url = next(
                (o.strip() for o in allowed_origins if "dev.asimo.io" in o),
                next(
                    (o.strip() for o in allowed_origins if o.strip().startswith("https")),
                    "https://dev.asimo.io",
                ),
            )

        # Redirect to integrations page with success status
        redirect_url = f"{frontend_url}/integrations?connected={result.get('provider')}"
        logger.info("calendar_oauth_redirecting", redirect_url=redirect_url)
        return RedirectResponse(url=redirect_url, status_code=302)

    except ValueError as e:
        logger.warning(
            "calendar_oauth_callback_invalid_state",
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(
            "calendar_oauth_callback_failed",
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete calendar connection",
        )


@router.post("/caldav/connect")
@limiter.limit("5/minute")
async def connect_caldav_calendar(
    request: Request,
    connection: CalDAVConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Connect a CalDAV calendar (Apple iCloud, Nextcloud, or generic CalDAV).

    For Apple iCloud:
    - Use `https://caldav.icloud.com/` as the caldav_url
    - Generate an app-specific password at appleid.apple.com

    For Nextcloud:
    - Use `https://your-nextcloud.com/remote.php/dav/` as the caldav_url
    - Use your Nextcloud credentials or app password

    The connection will be tested before being saved.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar integration is not available",
        )

    try:
        # Map string provider to enum
        provider_map = {
            "apple": CalendarProvider.APPLE,
            "nextcloud": CalendarProvider.NEXTCLOUD,
            "caldav": CalendarProvider.CALDAV,
        }
        provider_enum = provider_map.get(connection.provider)
        if not provider_enum:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid provider: {connection.provider}",
            )

        result = await oauth_service.connect_caldav(
            user_id=str(current_user.id),
            provider=provider_enum,
            caldav_url=connection.caldav_url,
            username=connection.username,
            password=connection.password,
            db_session=db,
            connection_name=connection.connection_name,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("error", "Failed to connect calendar"),
            )

        logger.info(
            "caldav_calendar_connected",
            provider=connection.provider,
            user_id=str(current_user.id),
        )

        return success_response(
            {
                "success": True,
                "provider": connection.provider,
                "message": f"{connection.provider.title()} calendar connected successfully",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "caldav_connect_failed",
            provider=connection.provider,
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect calendar",
        )


@router.delete("/connections/{connection_id}")
@limiter.limit("10/minute")
async def disconnect_calendar(
    request: Request,
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Disconnect (remove) a calendar connection.

    This revokes stored credentials and removes the connection.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar integration is not available",
        )

    try:
        # First verify the connection belongs to this user
        connections = await oauth_service.get_user_connections(
            user_id=str(current_user.id),
            db_session=db,
        )

        connection_ids = [c["id"] for c in connections]
        if connection_id not in connection_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar connection not found",
            )

        success = await oauth_service.disconnect(
            connection_id=connection_id,
            db_session=db,
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar connection not found",
            )

        logger.info(
            "calendar_disconnected",
            connection_id=connection_id,
            user_id=str(current_user.id),
        )

        return success_response({"success": True, "message": "Calendar disconnected"})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "calendar_disconnect_failed",
            connection_id=connection_id,
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disconnect calendar",
        )


@router.post("/connections/{connection_id}/set-default")
@limiter.limit("10/minute")
async def set_default_calendar(
    request: Request,
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Set a calendar connection as the default.

    The default calendar is used when the AI assistant creates events
    without specifying which calendar to use.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar integration is not available",
        )

    try:
        # First verify the connection belongs to this user
        connections = await oauth_service.get_user_connections(
            user_id=str(current_user.id),
            db_session=db,
        )

        connection_ids = [c["id"] for c in connections]
        if connection_id not in connection_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar connection not found",
            )

        success = await oauth_service.set_default_connection(
            user_id=str(current_user.id),
            connection_id=connection_id,
            db_session=db,
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update default calendar",
            )

        logger.info(
            "default_calendar_updated",
            connection_id=connection_id,
            user_id=str(current_user.id),
        )

        return success_response({"success": True, "message": "Default calendar updated"})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "set_default_calendar_failed",
            connection_id=connection_id,
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update default calendar",
        )


@router.post("/connections/{connection_id}/test")
@limiter.limit("5/minute")
async def test_calendar_connection(
    request: Request,
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Test a calendar connection.

    Verifies that the stored credentials are still valid and can access the calendar.
    """
    if not OAUTH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Calendar integration is not available",
        )

    try:
        # First verify the connection belongs to this user
        connections = await oauth_service.get_user_connections(
            user_id=str(current_user.id),
            db_session=db,
        )

        connection_ids = [c["id"] for c in connections]
        if connection_id not in connection_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar connection not found",
            )

        result = await oauth_service.test_connection(
            connection_id=connection_id,
            db_session=db,
        )

        if result.get("success"):
            return success_response(
                {
                    "success": True,
                    "message": "Connection test successful",
                }
            )
        else:
            return success_response(
                {
                    "success": False,
                    "error": result.get("error", "Connection test failed"),
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "calendar_test_failed",
            connection_id=connection_id,
            user_id=str(current_user.id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to test calendar connection",
        )


@router.get("/providers")
async def list_available_providers():
    """
    List available calendar providers and their configuration status.

    Returns which calendar providers are configured and available for connection.
    """
    providers = []

    # Google Calendar
    google_configured = (
        bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)
        if hasattr(settings, "GOOGLE_CLIENT_ID")
        else False
    )
    providers.append(
        {
            "id": "google",
            "name": "Google Calendar",
            "auth_type": "oauth",
            "configured": google_configured,
            "description": "Connect your Google Calendar for event management",
        }
    )

    # Microsoft Outlook
    microsoft_configured = (
        bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET)
        if hasattr(settings, "MICROSOFT_CLIENT_ID")
        else False
    )
    providers.append(
        {
            "id": "microsoft",
            "name": "Microsoft Outlook",
            "auth_type": "oauth",
            "configured": microsoft_configured,
            "description": "Connect your Outlook Calendar for event management",
        }
    )

    # Apple iCloud (CalDAV - always available if service is up)
    providers.append(
        {
            "id": "apple",
            "name": "Apple iCloud",
            "auth_type": "caldav",
            "configured": OAUTH_AVAILABLE,
            "description": "Connect your iCloud Calendar using an app-specific password",
            "setup_url": "https://support.apple.com/en-us/HT204397",
        }
    )

    # Nextcloud (CalDAV - always available if service is up)
    providers.append(
        {
            "id": "nextcloud",
            "name": "Nextcloud",
            "auth_type": "caldav",
            "configured": OAUTH_AVAILABLE,
            "description": "Connect your Nextcloud Calendar",
        }
    )

    # Generic CalDAV
    providers.append(
        {
            "id": "caldav",
            "name": "Other CalDAV",
            "auth_type": "caldav",
            "configured": OAUTH_AVAILABLE,
            "description": "Connect any CalDAV-compatible calendar server",
        }
    )

    return success_response({"providers": providers})
