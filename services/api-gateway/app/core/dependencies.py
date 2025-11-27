"""
FastAPI dependencies for authentication and authorization
"""
from datetime import timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User
from app.services.token_revocation import token_revocation_service


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get the current authenticated user from JWT token

    Includes token revocation check for enhanced security.

    Args:
        credentials: HTTP Authorization header with Bearer token
        db: Database session

    Returns:
        User object for the authenticated user

    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )

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

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user)
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
    if current_user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


async def get_current_admin_or_viewer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current user and verify they have admin or viewer role."""

    if current_user.admin_role not in {"admin", "viewer"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or viewer role required",
        )
    return current_user


def ensure_admin_privileges(user: User) -> None:
    """Helper to enforce admin-only operations inside routes."""

    if user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )


def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get current user if authenticated, otherwise return None

    This is useful for endpoints that work with or without authentication.

    Args:
        credentials: Optional HTTP Authorization header
        db: Database session

    Returns:
        User object if authenticated, None otherwise
    """
    if not credentials:
        return None

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
        return None
