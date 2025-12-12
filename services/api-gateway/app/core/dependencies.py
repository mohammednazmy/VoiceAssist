"""
FastAPI dependencies for authentication and authorization

Supports dual authentication:
- JWT Bearer token: Authorization: Bearer <jwt_token>
- API Key: X-API-Key: va_k_<key>

JWT takes priority if both are provided.
"""

from datetime import timezone
from typing import Optional

from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import verify_token
from app.models.organization import Organization
from app.models.user import User
from app.services.organization_service import OrganizationService
from app.services.session_activity import session_activity_service
from app.services.token_revocation import token_revocation_service
from app.services.user_api_key_service import user_api_key_service
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

logger = get_logger(__name__)

# Optional Bearer token - allows API key fallback
security = HTTPBearer(auto_error=False)


def _get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request, handling proxies."""
    # Check X-Forwarded-For first (set by reverse proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # First IP in the list is the original client
        return forwarded.split(",")[0].strip()
    # Fall back to direct connection IP
    if request.client:
        return request.client.host
    return None


async def _authenticate_with_api_key(
    api_key: str,
    db: Session,
    request: Request,
) -> Optional[User]:
    """
    Authenticate using X-API-Key header.

    Returns User if valid, None otherwise.
    """
    if not api_key:
        return None

    client_ip = _get_client_ip(request)

    user = user_api_key_service.validate_key(
        db=db,
        plain_key=api_key,
        update_last_used=True,
        ip_address=client_ip,
    )

    if user:
        logger.info(
            "api_key_auth_success",
            user_id=str(user.id),
            key_prefix=api_key[:12] if len(api_key) >= 12 else api_key[:4] + "...",
            ip_address=client_ip,
        )

    return user


async def _authenticate_with_jwt(
    token: str,
    db: Session,
) -> User:
    """
    Authenticate using JWT Bearer token.

    Returns User if valid, raises HTTPException otherwise.
    """
    # Check if token has been revoked
    is_revoked = await token_revocation_service.is_token_revoked(token)
    if is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify and decode token
    payload = verify_token(token, token_type="access")

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user ID from token
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from database
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")

    # Check if all user tokens have been revoked
    user_revoked = await token_revocation_service.is_user_revoked(user_id)
    if user_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="All user sessions have been revoked - please login again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_iat = payload.get("iat")
    if token_iat and user.password_changed_at:
        pwd_ts = int(
            user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
            if user.password_changed_at.tzinfo is None
            else user.password_changed_at.timestamp()
        )
        if token_iat < pwd_ts:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token issued before last password change",
                headers={"WWW-Authenticate": "Bearer"},
            )

    token_role = payload.get("role")
    if token_role and token_role != user.admin_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token role no longer valid for this account",
        )

    # Check session timeouts (inactivity and absolute)
    if token_iat:
        is_valid, error_reason = await session_activity_service.check_session_timeouts(
            user_id=str(user.id), token_iat=token_iat
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=error_reason or "Session expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> User:
    """
    Get the current authenticated user from JWT token or API key.

    Supports dual authentication:
    - JWT Bearer token: Authorization: Bearer <jwt_token>
    - API Key: X-API-Key: va_k_<key>

    JWT takes priority if both are provided.

    Args:
        request: FastAPI request object
        credentials: Optional HTTP Authorization header with Bearer token
        x_api_key: Optional X-API-Key header
        db: Database session

    Returns:
        User object for the authenticated user

    Raises:
        HTTPException: If authentication fails
    """
    # Try JWT authentication first (takes priority)
    if credentials and credentials.credentials:
        return await _authenticate_with_jwt(credentials.credentials, db)

    # Fall back to API key authentication
    if x_api_key:
        user = await _authenticate_with_api_key(x_api_key, db, request)
        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Inactive user account",
                )
            return user
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
                headers={"WWW-Authenticate": "Bearer, X-API-Key"},
            )

    # No authentication provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer, X-API-Key"},
    )


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get current user and verify they are active

    Args:
        current_user: User from get_current_user dependency

    Returns:
        Active user object

    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get current user and verify they are an admin

    Args:
        current_user: User from get_current_user dependency

    Returns:
        Admin user object

    Raises:
        HTTPException: If user is not an admin
    """
    if current_user.admin_role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


async def get_current_admin_or_viewer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current user and verify they have admin, super_admin, or viewer role."""

    if current_user.admin_role not in {"admin", "super_admin", "viewer"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or viewer role required",
        )
    return current_user


def ensure_admin_privileges(user: User) -> None:
    """Helper to enforce admin-only operations inside routes."""

    if user.admin_role not in {"admin", "super_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )


async def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Get current user if authenticated, otherwise return None

    This is useful for endpoints that work with or without authentication.
    Supports both JWT Bearer tokens and X-API-Key headers.

    Args:
        request: FastAPI request object
        credentials: Optional HTTP Authorization header
        x_api_key: Optional X-API-Key header
        db: Database session

    Returns:
        User object if authenticated, None otherwise
    """
    # Try JWT authentication first
    if credentials and credentials.credentials:
        try:
            token = credentials.credentials
            payload = verify_token(token, token_type="access")

            if not payload:
                return None

            user_id = payload.get("sub")
            if not user_id:
                return None

            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.is_active:
                return None

            token_iat = payload.get("iat")
            if token_iat and user.password_changed_at:
                pwd_ts = int(
                    user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
                    if user.password_changed_at.tzinfo is None
                    else user.password_changed_at.timestamp()
                )
                if token_iat < pwd_ts:
                    return None

            token_role = payload.get("role")
            if token_role and token_role != user.admin_role:
                return None

            return user

        except Exception:
            pass  # Fall through to try API key

    # Try API key authentication
    if x_api_key:
        try:
            user = await _authenticate_with_api_key(x_api_key, db, request)
            if user and user.is_active:
                return user
        except Exception:
            pass

    return None


def get_current_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[Organization]:
    """
    Resolve the current organization context for the authenticated user.

    Uses OrganizationService.get_user_default_organization to select the
    most appropriate active organization. Returns None if the user is not
    associated with any organization (single-tenant / personal use).
    """
    service = OrganizationService(db)
    return service.get_user_default_organization(str(current_user.id))


def get_current_organization_id(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[str]:
    """
    Convenience dependency that returns the current organization ID as a string.

    Returns None when the user has no effective organization.
    """
    org = get_current_organization(db=db, current_user=current_user)
    return str(org.id) if org else None
