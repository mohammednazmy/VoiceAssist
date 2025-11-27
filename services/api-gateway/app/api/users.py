"""
User management API endpoints
"""

from datetime import datetime, timezone

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, get_current_user
from app.core.security import get_password_hash, get_refresh_token_ttl_seconds, verify_password
from app.models.user import User
from app.schemas.auth import PasswordChange, UserResponse
from app.services.admin_audit_log_service import admin_audit_log_service
from app.services.token_revocation import token_revocation_service
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/users", tags=["users"])


class UserUpdate(BaseModel):
    """User profile update request"""

    full_name: str | None = None
    email: EmailStr | None = None


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Get current user's profile information

    Requires valid access token
    """
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update current user's profile

    - **full_name**: New full name (optional)
    - **email**: New email address (optional, must be unique)

    Requires valid access token
    """
    # Check if email is being changed and if it's already in use
    if user_update.email and user_update.email != current_user.email:
        existing_user = db.query(User).filter(User.email == user_update.email).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        current_user.email = user_update.email

    # Update full name if provided
    if user_update.full_name:
        current_user.full_name = user_update.full_name

    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/me/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change current user's password

    - **old_password**: Current password for verification
    - **new_password**: New password (minimum 8 characters)

    Requires valid access token
    """
    # Verify old password
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")

    # Update password and record change
    now = datetime.now(timezone.utc)
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.password_changed_at = now
    current_user.updated_at = now
    db.commit()

    await token_revocation_service.revoke_all_user_tokens(
        str(current_user.id), ttl_seconds=get_refresh_token_ttl_seconds()
    )

    return {"message": "Password updated successfully. Please login again."}


@router.delete("/me")
async def delete_current_user_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Deactivate current user's account

    This marks the account as inactive rather than deleting it
    (soft delete for data retention and audit purposes)

    Requires valid access token
    """
    current_user.is_active = False
    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Account deactivated successfully"}


# Admin endpoints
@router.get("/")
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    List all users (admin only)

    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return

    Requires admin privileges
    """
    from app.core.api_envelope import success_response

    users = db.query(User).offset(skip).limit(limit).all()
    # Convert to dict for serialization
    users_data = [
        {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "admin_role": user.admin_role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
        }
        for user in users
    ]
    return success_response(users_data)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Get user by ID (admin only)

    Requires admin privileges
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return user


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    user_update: dict,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Update user properties (admin only)

    Supports updating:
    - is_active: boolean
    - is_admin: boolean
    - full_name: string

    Requires admin privileges
    """
    from app.core.api_envelope import success_response

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Update fields if provided
    role_before = user.admin_role
    incoming_role = user_update.get("admin_role")
    if incoming_role and incoming_role not in {"admin", "viewer", "user"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid admin role",
        )
    if incoming_role and user.id == current_user.id and incoming_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own admin privileges",
        )

    if "is_active" in user_update:
        # Don't allow deactivating yourself
        if user.id == current_user.id and not user_update["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )
        user.is_active = user_update["is_active"]

    if "is_admin" in user_update:
        # Don't allow removing your own admin privileges
        if user.id == current_user.id and not user_update["is_admin"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own admin privileges",
            )
        user.is_admin = user_update["is_admin"]
        incoming_role = "admin" if user.is_admin else (incoming_role or "user")

    if incoming_role:
        user.admin_role = incoming_role
        user.is_admin = incoming_role == "admin"

    if "full_name" in user_update:
        user.full_name = user_update["full_name"]

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    if user.admin_role != role_before:
        admin_audit_log_service.log_action(
            db=db,
            actor=current_user,
            action="user.role_change",
            target_type="user",
            target_id=str(user.id),
            metadata={"from": role_before, "to": user.admin_role},
        )

    return success_response(
        {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "admin_role": user.admin_role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "message": "User updated successfully",
        }
    )


@router.put("/{user_id}/activate")
async def activate_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Activate a user account (admin only)

    Requires admin privileges
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = True
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": f"User {user.email} activated successfully"}


@router.put("/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Deactivate a user account (admin only)

    Requires admin privileges
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Don't allow deactivating yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user.is_active = False
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": f"User {user.email} deactivated successfully"}


@router.put("/{user_id}/promote-admin")
async def promote_to_admin(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Grant admin privileges to a user (admin only)

    Requires admin privileges
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role_before = user.admin_role
    user.is_admin = True
    user.admin_role = "admin"
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    if user.admin_role != role_before:
        admin_audit_log_service.log_action(
            db=db,
            actor=current_user,
            action="user.role_change",
            target_type="user",
            target_id=str(user.id),
            metadata={"from": role_before, "to": user.admin_role},
        )

    return {"message": f"User {user.email} promoted to admin"}


@router.put("/{user_id}/revoke-admin")
async def revoke_admin_privileges(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Revoke admin privileges from a user (admin only)

    Requires admin privileges
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Don't allow revoking your own admin privileges
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke your own admin privileges",
        )

    role_before = user.admin_role
    user.is_admin = False
    user.admin_role = "user"
    user.updated_at = datetime.now(timezone.utc)
    db.commit()

    if user.admin_role != role_before:
        admin_audit_log_service.log_action(
            db=db,
            actor=current_user,
            action="user.role_change",
            target_type="user",
            target_id=str(user.id),
            metadata={"from": role_before, "to": user.admin_role},
        )

    return {"message": f"Admin privileges revoked from {user.email}"}
