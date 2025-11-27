"""
Authentication endpoints for user registration, login, and token management
"""

from datetime import datetime, timezone

from app.core.business_metrics import user_logins_total, user_registrations_total
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    get_refresh_token_ttl_seconds,
    verify_password,
    verify_token,
)
from app.models.user import User
from app.schemas.auth import TokenRefresh, TokenResponse, UserLogin, UserRegister, UserResponse
from app.services.token_revocation import token_revocation_service
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["authentication"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")  # Strict rate limit for registration
async def register(request: Request, user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account

    - **email**: Valid email address (must be unique)
    - **password**: Password (minimum 8 characters)
    - **full_name**: User's full name

    Rate limit: 5 registrations per hour per IP
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        is_active=True,
        is_admin=False,
        admin_role="user",
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Track registration metric (P3.3 - Business Metrics)
    user_registrations_total.inc()

    return new_user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")  # Rate limit login attempts
async def login(request: Request, login_data: UserLogin, db: Session = Depends(get_db)):
    """
    Login with email and password to receive JWT tokens

    - **email**: User's email address
    - **password**: User's password

    Returns short-lived access and refresh tokens (5 min / 60 min by default)

    Rate limit: 10 login attempts per minute per IP
    """
    # Find user by email (optimized with limit)
    user = db.query(User).filter(User.email == login_data.email).limit(1).first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    # Update last login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Track login metric (P3.3 - Business Metrics)
    user_logins_total.inc()

    token_role = user.admin_role or ("admin" if user.is_admin else "user")
    password_epoch = int(
        user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
        if user.password_changed_at.tzinfo is None
        else user.password_changed_at.timestamp()
    )

    # Create tokens
    base_claims = {
        "sub": str(user.id),
        "email": user.email,
        "role": token_role,
        "pwd": password_epoch,
    }
    access_token = create_access_token(data=base_claims)
    refresh_token = create_refresh_token(data=base_claims)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # Convert to seconds
        refresh_expires_in=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        role=token_role,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh_token(
    request: Request,
    token_data: TokenRefresh,
    db: Session = Depends(get_db),
):
    """
    Get a new access token using a refresh token

    - **refresh_token**: Valid refresh token

    Returns new access token and refresh token pair

    Rate limit: 20 requests per minute per IP
    """
    # Verify refresh token
    payload = verify_token(token_data.refresh_token, token_type="refresh")

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    token_role = payload.get("role")
    token_iat = payload.get("iat")
    token_pwd = payload.get("pwd")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Verify user still exists and is active (optimized with limit)
    user = db.query(User).filter(User.id == user_id).limit(1).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if token_role and token_role != user.admin_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Refresh token role no longer valid",
        )

    if token_iat and user.password_changed_at:
        pwd_ts = int(
            user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
            if user.password_changed_at.tzinfo is None
            else user.password_changed_at.timestamp()
        )
        if token_iat < pwd_ts or (token_pwd and token_pwd < pwd_ts):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token issued before last password change",
            )

    user_revoked = await token_revocation_service.is_user_revoked(user_id)
    if user_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="All user sessions have been revoked - please login again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create new token pair
    token_role = user.admin_role or ("admin" if user.is_admin else "user")
    password_epoch = int(
        user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
        if user.password_changed_at.tzinfo is None
        else user.password_changed_at.timestamp()
    )
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "role": token_role,
        "pwd": password_epoch,
    }
    access_token = create_access_token(data=claims)
    new_refresh_token = create_refresh_token(data=claims)

    # Rotate refresh token by revoking the one that was just used
    await token_revocation_service.revoke_token(token_data.refresh_token, ttl_seconds=get_refresh_token_ttl_seconds())

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        role=token_role,
    )


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout current user

    Note: In a stateless JWT system, logout is primarily handled client-side
    by discarding the tokens. This endpoint exists for consistency and
    could be extended to maintain a token blacklist in Redis if needed.
    """
    return {"message": "Successfully logged out", "detail": "Please discard your access and refresh tokens"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user's information

    Requires valid access token in Authorization header
    """
    return current_user
