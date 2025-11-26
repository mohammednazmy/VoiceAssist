"""
OAuth authentication endpoints for Google and Microsoft login
"""

import secrets
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlencode

import httpx
from app.core.api_envelope import success_response
from app.core.business_metrics import user_logins_total, user_registrations_total
from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User
from app.schemas.auth import TokenResponse
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

logger = get_logger(__name__)
router = APIRouter(prefix="/api/auth/oauth", tags=["authentication", "oauth"])
limiter = Limiter(key_func=get_remote_address)

# OAuth provider configurations
OAUTH_PROVIDERS = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["openid", "email", "profile"],
    },
    "microsoft": {
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": ["openid", "email", "profile", "User.Read"],
    },
}


def get_oauth_config(provider: str) -> dict | None:
    """Get OAuth configuration for a provider if configured"""
    if provider == "google":
        if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
            return {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI
                or f"{settings.ALLOWED_ORIGINS.split(',')[0]}/auth/callback/google",
            }
    elif provider == "microsoft":
        if settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET:
            return {
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "redirect_uri": settings.MICROSOFT_OAUTH_REDIRECT_URI
                or f"{settings.ALLOWED_ORIGINS.split(',')[0]}/auth/callback/microsoft",
            }
    return None


@router.get("/{provider}/authorize")
@limiter.limit("30/minute")
async def oauth_authorize(
    request: Request,
    provider: Literal["google", "microsoft"],
):
    """
    Get OAuth authorization URL for the specified provider

    Returns a URL that the frontend should redirect to for OAuth login.

    - **provider**: "google" or "microsoft"

    Returns: { data: { url: string } }

    Rate limit: 30 requests per minute per IP
    """
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown OAuth provider: {provider}",
        )

    config = get_oauth_config(provider)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider.title()} OAuth is not configured. Please contact the administrator.",
        )

    provider_config = OAUTH_PROVIDERS[provider]

    # Generate state parameter for CSRF protection
    state = secrets.token_urlsafe(32)

    # Build authorization URL
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "scope": " ".join(provider_config["scopes"]),
        "state": state,
    }

    # Provider-specific parameters
    if provider == "google":
        params["access_type"] = "online"
        params["include_granted_scopes"] = "true"
        params["prompt"] = "select_account"
    elif provider == "microsoft":
        params["response_mode"] = "query"
        params["prompt"] = "select_account"

    auth_url = f"{provider_config['authorize_url']}?{urlencode(params)}"

    logger.info(
        "oauth_authorize_url_generated",
        provider=provider,
        redirect_uri=config["redirect_uri"],
    )

    return success_response({"url": auth_url, "state": state})


@router.post("/{provider}/callback")
@limiter.limit("10/minute")
async def oauth_callback(
    request: Request,
    provider: Literal["google", "microsoft"],
    db: Session = Depends(get_db),
):
    """
    Handle OAuth callback and exchange code for tokens

    - **provider**: "google" or "microsoft"
    - **code**: Authorization code from OAuth provider (in request body)

    Returns JWT tokens for the authenticated user.

    Rate limit: 10 requests per minute per IP
    """
    body = await request.json()
    code = body.get("code")

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code",
        )

    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown OAuth provider: {provider}",
        )

    config = get_oauth_config(provider)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider.title()} OAuth is not configured",
        )

    provider_config = OAUTH_PROVIDERS[provider]

    # Exchange authorization code for access token
    async with httpx.AsyncClient() as client:
        token_data = {
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "code": code,
            "redirect_uri": config["redirect_uri"],
            "grant_type": "authorization_code",
        }

        try:
            token_response = await client.post(
                provider_config["token_url"],
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0,
            )
            token_response.raise_for_status()
            tokens = token_response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "oauth_token_exchange_failed",
                provider=provider,
                status_code=e.response.status_code,
                response=e.response.text[:500],
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange authorization code for tokens",
            )
        except httpx.RequestError as e:
            logger.error(
                "oauth_token_exchange_error",
                provider=provider,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OAuth provider is temporarily unavailable",
            )

        # Fetch user info from provider
        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received from OAuth provider",
            )

        try:
            userinfo_response = await client.get(
                provider_config["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10.0,
            )
            userinfo_response.raise_for_status()
            userinfo = userinfo_response.json()
        except httpx.HTTPError as e:
            logger.error(
                "oauth_userinfo_fetch_failed",
                provider=provider,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch user information from OAuth provider",
            )

    # Extract user info based on provider
    if provider == "google":
        email = userinfo.get("email")
        full_name = userinfo.get("name") or email.split("@")[0]
        provider_user_id = userinfo.get("id")
    elif provider == "microsoft":
        email = userinfo.get("mail") or userinfo.get("userPrincipalName")
        full_name = userinfo.get("displayName") or email.split("@")[0]
        provider_user_id = userinfo.get("id")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown OAuth provider",
        )

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not available from OAuth provider. Please ensure email permissions are granted.",
        )

    # Find or create user
    user = (
        db.query(User)
        .filter(
            (User.email == email) | ((User.oauth_provider == provider) & (User.oauth_provider_id == provider_user_id))
        )
        .first()
    )

    is_new_user = False
    if not user:
        # Create new user from OAuth
        user = User(
            email=email,
            full_name=full_name,
            hashed_password=None,  # No password for OAuth users
            is_active=True,
            is_admin=False,
            oauth_provider=provider,
            oauth_provider_id=provider_user_id,
        )
        db.add(user)
        is_new_user = True
        logger.info(
            "oauth_user_created",
            provider=provider,
            email=email,
        )
        user_registrations_total.inc()
    else:
        # Update OAuth info if not set (linking existing account)
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_provider_id = provider_user_id
            logger.info(
                "oauth_account_linked",
                provider=provider,
                email=email,
            )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    # Track login metric
    user_logins_total.inc()

    # Create JWT tokens
    jwt_access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    jwt_refresh_token = create_refresh_token(data={"sub": str(user.id)})

    logger.info(
        "oauth_login_success",
        provider=provider,
        email=email,
        is_new_user=is_new_user,
    )

    return TokenResponse(
        access_token=jwt_access_token,
        refresh_token=jwt_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/{provider}/status")
async def oauth_provider_status(provider: Literal["google", "microsoft"]):
    """
    Check if an OAuth provider is configured

    Returns whether the specified provider is available for login.

    - **provider**: "google" or "microsoft"
    """
    config = get_oauth_config(provider)
    return success_response(
        {
            "provider": provider,
            "configured": config is not None,
            "enabled": config is not None,
        }
    )
