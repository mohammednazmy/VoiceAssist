"""
Two-Factor Authentication (2FA) API endpoints.

Provides endpoints for:
- Setting up 2FA with TOTP
- Verifying 2FA codes during login
- Disabling 2FA
- Managing backup codes
"""

from datetime import datetime, timezone
from typing import Optional

from app.core.business_metrics import user_logins_total
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.services.admin_audit_log_service import admin_audit_log_service
from app.services.two_factor import two_factor_service
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth/2fa", tags=["two-factor-authentication"])
limiter = Limiter(key_func=get_remote_address)


# Request/Response schemas
class TwoFactorStatusResponse(BaseModel):
    """2FA status for the current user."""

    enabled: bool
    verified_at: Optional[str] = None
    backup_codes_remaining: int = 0


class TwoFactorSetupResponse(BaseModel):
    """Response for 2FA setup initiation."""

    qr_code: str = Field(..., description="Base64-encoded QR code PNG")
    manual_entry_key: str = Field(..., description="Secret for manual entry")
    backup_codes: list[str] = Field(..., description="One-time backup codes")


class TwoFactorVerifyRequest(BaseModel):
    """Request to verify/enable 2FA."""

    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFactorDisableRequest(BaseModel):
    """Request to disable 2FA."""

    password: str
    code: str = Field(..., description="TOTP code or backup code")


class TwoFactorBackupCodesResponse(BaseModel):
    """Response with regenerated backup codes."""

    backup_codes: list[str]
    message: str


class TwoFactorLoginVerifyRequest(BaseModel):
    """Request to verify 2FA during login."""

    user_id: str
    code: str = Field(..., description="TOTP code or backup code")
    is_backup_code: bool = False


@router.get("/status", response_model=TwoFactorStatusResponse)
async def get_2fa_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get 2FA status for the current user.

    Returns whether 2FA is enabled and backup code count.
    """
    backup_count = 0
    if current_user.totp_enabled and current_user.totp_backup_codes:
        codes = two_factor_service.decrypt_backup_codes(current_user.totp_backup_codes)
        backup_count = len(codes)

    return TwoFactorStatusResponse(
        enabled=current_user.totp_enabled,
        verified_at=(current_user.totp_verified_at.isoformat() if current_user.totp_verified_at else None),
        backup_codes_remaining=backup_count,
    )


@router.post("/setup", response_model=TwoFactorSetupResponse)
@limiter.limit("5/hour")
async def setup_2fa(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Start 2FA setup for the current user.

    Returns QR code and backup codes. User must verify with a TOTP code
    to complete setup.

    Rate limit: 5 attempts per hour
    """
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled. Disable it first to reconfigure.",
        )

    # Generate 2FA setup data
    setup_data = two_factor_service.setup_2fa(current_user.email)

    # Store encrypted secret temporarily (not enabled until verified)
    current_user.totp_secret = setup_data["encrypted_secret"]
    current_user.totp_backup_codes = setup_data["encrypted_backup_codes"]
    db.commit()

    return TwoFactorSetupResponse(
        qr_code=setup_data["qr_code"],
        manual_entry_key=setup_data["secret"],
        backup_codes=setup_data["backup_codes"],
    )


@router.post("/verify")
@limiter.limit("10/minute")
async def verify_2fa(
    request: Request,
    verify_request: TwoFactorVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify TOTP code to complete 2FA setup.

    After successful verification, 2FA will be enabled for the account.

    Rate limit: 10 attempts per minute
    """
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup not started. Call /setup first.",
        )

    # Decrypt secret and verify code
    secret = two_factor_service.decrypt_secret(current_user.totp_secret)
    is_valid = two_factor_service.verify_code(secret, verify_request.code)

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please try again.",
        )

    # Enable 2FA
    current_user.totp_enabled = True
    current_user.totp_verified_at = datetime.now(timezone.utc)
    db.commit()

    # Log 2FA enabled
    admin_audit_log_service.log_action(
        db=db,
        actor=current_user,
        action="auth.2fa_enabled",
        target_type="user",
        target_id=str(current_user.id),
        success=True,
        request=request,
    )

    return {
        "message": "2FA has been enabled successfully",
        "enabled": True,
        "verified_at": current_user.totp_verified_at.isoformat(),
    }


@router.post("/disable")
@limiter.limit("5/hour")
async def disable_2fa(
    request: Request,
    disable_request: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Disable 2FA for the current user.

    Requires password and a valid TOTP code or backup code.

    Rate limit: 5 attempts per hour
    """
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled",
        )

    # Verify password
    if not verify_password(disable_request.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    # Verify TOTP code or backup code
    secret = two_factor_service.decrypt_secret(current_user.totp_secret)
    code = disable_request.code.strip()

    # Check if it's a backup code (format: XXXX-XXXX or XXXXXXXX)
    is_backup_code = len(code.replace("-", "")) == 8

    if is_backup_code:
        is_valid, _ = two_factor_service.verify_backup_code(current_user.totp_backup_codes, code)
    else:
        is_valid = two_factor_service.verify_code(secret, code)

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )

    # Disable 2FA
    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_backup_codes = None
    current_user.totp_verified_at = None
    db.commit()

    # Log 2FA disabled
    admin_audit_log_service.log_action(
        db=db,
        actor=current_user,
        action="auth.2fa_disabled",
        target_type="user",
        target_id=str(current_user.id),
        success=True,
        metadata={"method": "backup_code" if is_backup_code else "totp"},
        request=request,
    )

    return {"message": "2FA has been disabled successfully", "enabled": False}


@router.post("/backup-codes", response_model=TwoFactorBackupCodesResponse)
@limiter.limit("3/hour")
async def regenerate_backup_codes(
    request: Request,
    verify_request: TwoFactorVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Regenerate backup codes for the current user.

    Requires a valid TOTP code. Previous backup codes will be invalidated.

    Rate limit: 3 attempts per hour
    """
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled",
        )

    # Verify TOTP code
    secret = two_factor_service.decrypt_secret(current_user.totp_secret)
    if not two_factor_service.verify_code(secret, verify_request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )

    # Generate new backup codes
    new_codes = two_factor_service.generate_backup_codes()
    current_user.totp_backup_codes = two_factor_service.encrypt_backup_codes(new_codes)
    db.commit()

    return TwoFactorBackupCodesResponse(
        backup_codes=new_codes,
        message="New backup codes generated. Previous codes are now invalid.",
    )


@router.post("/verify-login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_2fa_login(
    request: Request,
    verify_request: TwoFactorLoginVerifyRequest,
    db: Session = Depends(get_db),
):
    """
    Verify 2FA code during login flow and issue tokens.

    This endpoint is called after successful password authentication
    when the user has 2FA enabled. Returns JWT tokens on success.

    Rate limit: 10 attempts per minute
    """
    # Find user
    user = db.query(User).filter(User.id == verify_request.user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    code = verify_request.code.strip()

    if verify_request.is_backup_code:
        # Verify backup code
        is_valid, new_encrypted_codes = two_factor_service.verify_backup_code(user.totp_backup_codes, code)
        if is_valid:
            # Update backup codes (remove used one)
            user.totp_backup_codes = new_encrypted_codes
            db.commit()
    else:
        # Verify TOTP code
        secret = two_factor_service.decrypt_secret(user.totp_secret)
        is_valid = two_factor_service.verify_code(secret, code)

    if not is_valid:
        # Log failed 2FA verification
        admin_audit_log_service.log_action(
            db=db,
            actor=user,
            action="auth.2fa_verify_failed",
            target_type="user",
            target_id=str(user.id),
            success=False,
            metadata={"method": "backup_code" if verify_request.is_backup_code else "totp"},
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )

    # Update last login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Track login metric
    user_logins_total.inc()

    # Log successful 2FA login
    admin_audit_log_service.log_action(
        db=db,
        actor=user,
        action="auth.login_success",
        target_type="user",
        target_id=str(user.id),
        success=True,
        metadata={
            "method": "password+2fa",
            "2fa_method": "backup_code" if verify_request.is_backup_code else "totp",
        },
        request=request,
    )

    # Create tokens
    token_role = user.admin_role or ("admin" if user.is_admin else "user")
    password_epoch = int(
        user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
        if user.password_changed_at.tzinfo is None
        else user.password_changed_at.timestamp()
    )

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
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        role=token_role,
    )
