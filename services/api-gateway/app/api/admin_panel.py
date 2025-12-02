"""Admin Panel API endpoints (Phase 7 + Phase 8.3 + Phase 8 Improvements).

Provides system summary information for the Admin Panel dashboard.

Phase 7: Basic summary endpoint
Phase 8.3: WebSocket status, user management, metrics, audit logs
Phase 8 Improvements:
- Database-backed audit logs (persistent)
- Redis-backed WebSocket session tracking (distributed)
- Optimized database queries (aggregated)
- Redis caching for metrics
- Audit logging for all admin actions

NOTE: This file is being refactored into the app/api/admin/ module.
Schemas and utilities have been moved to:
- app/api/admin/schemas.py
- app/api/admin/utils.py
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Literal, Optional

from app.api.admin.schemas import PasswordResetRequest, UserInviteRequest, UserUpdate
from app.api.admin.utils import (
    METRICS_CACHE_TTL,
    REDIS_METRICS_CACHE_KEY,
    enforce_admin_action_rate_limit,
    get_active_websocket_count,
    get_all_websocket_sessions,
    log_audit_event,
    resolve_admin_role,
    unregister_websocket_session,
)
from app.core.api_envelope import error_response, success_response
from app.core.database import get_db, get_db_pool_stats, get_redis_pool_stats, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.admin_audit_log_service import admin_audit_log_service
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Date, cast, desc, func
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/panel", tags=["admin", "panel"])


# ============================================================================
# System Summary Endpoint
# ============================================================================


@router.get("/summary")
async def get_system_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Return a simple system summary for the admin dashboard."""
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active.is_(True)).count()
    admin_users = db.query(User).filter(User.is_admin.is_(True)).count()

    data = {
        "total_users": total_users,
        "active_users": active_users,
        "admin_users": admin_users,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }
    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# WebSocket Status Monitoring
# ============================================================================


@router.get("/websocket-status")
async def get_websocket_status(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Return WebSocket connection status for admin dashboard."""
    # Get pool stats
    try:
        db_stats = get_db_pool_stats()
        redis_stats = get_redis_pool_stats()
    except Exception:
        db_stats = {"size": 0, "checked_out": 0, "checked_in": 0}
        redis_stats = {"max_connections": 0, "in_use_connections": 0}

    # Get sessions from Redis
    sessions = get_all_websocket_sessions()

    # Count connections by type
    connections_by_type = {"chat": 0, "voice": 0, "other": 0}
    for session_info in sessions.values():
        conn_type = session_info.get("type", "other")
        if conn_type in connections_by_type:
            connections_by_type[conn_type] += 1
        else:
            connections_by_type["other"] += 1

    # Get recent connections (last 10)
    recent_connections = sorted(
        [{"session_id": sid, **info} for sid, info in sessions.items()],
        key=lambda x: x.get("connected_at", ""),
        reverse=True,
    )[:10]

    data = {
        "active_connections": len(sessions),
        "connections_by_type": connections_by_type,
        "recent_connections": recent_connections,
        "pool_stats": {
            "database": db_stats,
            "redis": redis_stats,
        },
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# User Management CRUD (with Audit Logging)
# ============================================================================


@router.get("/users")
async def list_users(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_admin: Optional[bool] = Query(None),
) -> Dict:
    """List users with pagination and filtering."""
    query = db.query(User)

    # Apply filters
    if search:
        search_term = f"%{search}%"
        query = query.filter((User.email.ilike(search_term)) | (User.full_name.ilike(search_term)))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if is_admin is not None:
        query = query.filter(User.is_admin == is_admin)

    # Get total count
    total = query.count()

    # Apply pagination and ordering
    users = query.order_by(desc(User.created_at)).offset(offset).limit(limit).all()

    # Convert to response format
    user_list = [
        {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
            "admin_role": user.admin_role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
        }
        for user in users
    ]

    data = {
        "users": user_list,
        "total": total,
        "offset": offset,
        "limit": limit,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/users/{user_id}")
async def get_user(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get a single user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "admin_role": user.admin_role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.put("/users/{user_id}")
async def update_user(
    request: Request,
    user_id: str,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Update a user's information."""
    ensure_admin_privileges(current_admin_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    incoming_role = update_data.pop("admin_role", None)
    incoming_admin_flag = update_data.pop("is_admin", None)
    desired_role = resolve_admin_role(user.admin_role, incoming_admin_flag, incoming_role)

    # Prevent admin from demoting themselves
    if str(user.id) == str(current_admin_user.id) and desired_role != "admin":
        raise HTTPException(status_code=400, detail="Cannot remove your own admin privileges")

    # Capture original values for audit
    original_values = {
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "admin_role": user.admin_role,
        "is_active": user.is_active,
    }

    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    action_reason = update_data.pop("action_reason", None)

    try:
        rate_limit_info = None
        if "is_admin" in update_data and update_data["is_admin"] != user.is_admin:
            rate_limit_info = enforce_admin_action_rate_limit(request, action="role-change")
        if "is_active" in update_data and update_data["is_active"] is False:
            rate_limit_info = enforce_admin_action_rate_limit(request, action="account-deactivate")
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    for field, value in update_data.items():
        setattr(user, field, value)

    user.admin_role = desired_role
    user.is_admin = desired_role == "admin"

    db.commit()
    db.refresh(user)

    # Log audit event
    audit_updates = {**update_data, "admin_role": user.admin_role, "is_admin": user.is_admin}
    log_audit_event(
        db=db,
        action="user.update",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=user_id,
        success=True,
        details=json.dumps({"original": original_values, "updated": audit_updates, "reason": action_reason}),
        request=request,
    )

    if user.admin_role != original_values["admin_role"]:
        admin_audit_log_service.log_action(
            db=db,
            actor=current_admin_user,
            action="user.role_change",
            target_type="user",
            target_id=user_id,
            success=True,
            metadata={
                "from": original_values["admin_role"],
                "to": user.admin_role,
            },
            request=request,
        )

    data = {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "admin_role": user.admin_role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }

    # surface rate limit metadata when applicable
    if "rate_limit_info" in locals() and rate_limit_info:
        data["rate_limit"] = rate_limit_info

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Delete a user (soft delete by deactivating)."""
    ensure_admin_privileges(current_admin_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deleting themselves
    if str(user.id) == str(current_admin_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Capture user email for audit before deactivation
    target_email = user.email

    try:
        rate_limit_info = enforce_admin_action_rate_limit(request, action="account-deactivate")
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    # Soft delete - deactivate the user
    user.is_active = False
    db.commit()

    # Log audit event
    log_audit_event(
        db=db,
        action="user.deactivate",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=user_id,
        success=True,
        details=json.dumps({"deactivated_user_email": target_email}),
        request=request,
    )

    data = {
        "message": "User deactivated successfully",
        "user_id": user_id,
        "rate_limit": rate_limit_info,
    }
    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


class PermanentDeleteRequest(BaseModel):
    """Request model for permanent user deletion."""

    confirm_email: str  # Must match user's email for confirmation
    reason: Optional[str] = None


@router.delete("/users/{user_id}/permanent")
async def permanent_delete_user(
    request: Request,
    user_id: str,
    delete_request: PermanentDeleteRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Permanently delete a user and all associated data.

    This action is IRREVERSIBLE. All user data will be permanently removed:
    - User account
    - Sessions and messages
    - Audit logs (user reference will be anonymized)
    - Any other associated data

    Requires email confirmation to prevent accidental deletion.
    """
    from app.models.message import Message
    from app.models.session import Session as DBSession

    ensure_admin_privileges(current_admin_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deleting themselves
    if str(user.id) == str(current_admin_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Require email confirmation
    if delete_request.confirm_email.lower() != user.email.lower():
        raise HTTPException(
            status_code=400,
            detail="Email confirmation does not match. Please enter the user's email to confirm deletion.",
        )

    # Rate limit permanent delete actions (stricter limit)
    try:
        rate_limit_info = enforce_admin_action_rate_limit(request, action="permanent-delete", calls=3, period=300)
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    trace_id = getattr(request.state, "trace_id", None)

    # Capture user info for audit before deletion
    deleted_user_info = {
        "email": user.email,
        "full_name": user.full_name,
        "admin_role": user.admin_role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    # Count associated data for reporting
    session_count = 0
    message_count = 0
    try:
        session_count = db.query(func.count(DBSession.id)).filter(DBSession.user_id == user_id).scalar() or 0
        message_count = db.query(func.count(Message.id)).filter(Message.user_id == user_id).scalar() or 0
    except Exception as e:
        logger.warning(f"Could not count user data: {e}")

    # Anonymize audit logs (preserve the audit trail but remove user reference)
    try:
        db.query(AuditLog).filter(AuditLog.user_id == user_id).update(
            {
                "user_id": None,
                "user_email": f"[DELETED:{user_id[:8]}]",
            },
            synchronize_session=False,
        )
    except Exception as e:
        logger.warning(f"Could not anonymize audit logs: {e}")

    # Delete associated sessions and messages (cascade delete)
    try:
        # Delete messages first (they reference sessions)
        db.query(Message).filter(Message.user_id == user_id).delete(synchronize_session=False)
        # Delete sessions
        db.query(DBSession).filter(DBSession.user_id == user_id).delete(synchronize_session=False)
    except Exception as e:
        logger.warning(f"Error deleting user data: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to delete user data. Please try again.",
        )

    # Delete the user
    try:
        db.delete(user)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to delete user: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to delete user. Please try again.",
        )

    # Log audit event (with anonymized user info)
    log_audit_event(
        db=db,
        action="user.permanent_delete",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=user_id,
        success=True,
        details=json.dumps(
            {
                "deleted_user": deleted_user_info,
                "sessions_deleted": session_count,
                "messages_deleted": message_count,
                "reason": delete_request.reason,
            }
        ),
        request=request,
    )

    return success_response(
        {
            "message": "User permanently deleted",
            "user_id": user_id,
            "deleted_data": {
                "sessions": session_count,
                "messages": message_count,
            },
            "rate_limit": rate_limit_info,
        },
        trace_id=trace_id,
    )


def generate_temporary_password(length: int = 16) -> str:
    """Generate a secure temporary password with mixed characters."""
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_secure_token(length: int = 32) -> str:
    """Generate a cryptographically secure token."""
    return secrets.token_urlsafe(length)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    request: Request,
    user_id: str,
    reset_request: PasswordResetRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Reset a user's password (admin action).

    Two methods available:
    - "temporary": Generate a temporary password that user must change on next login
    - "email": Send a password reset email with a secure link
    """
    from app.core.config import settings
    from app.services.email_service import send_password_reset_email, send_temporary_password_email
    from passlib.context import CryptContext

    ensure_admin_privileges(current_admin_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent resetting own password through admin panel
    if str(user.id) == str(current_admin_user.id):
        raise HTTPException(
            status_code=400,
            detail="Use the account settings page to change your own password",
        )

    # Rate limit password reset actions
    try:
        enforce_admin_action_rate_limit(request, action="password-reset", calls=10, period=300)
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    trace_id = getattr(request.state, "trace_id", None)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    if reset_request.method == "temporary":
        # Generate temporary password
        temp_password = generate_temporary_password()
        user.hashed_password = pwd_context.hash(temp_password)
        user.must_change_password = True
        user.password_reset_token = None
        user.password_reset_token_expires_at = None
        db.commit()

        # Log audit event
        log_audit_event(
            db=db,
            action="user.password_reset",
            user_id=str(current_admin_user.id),
            user_email=current_admin_user.email,
            resource_type="user",
            resource_id=user_id,
            success=True,
            details=json.dumps({"method": "temporary", "notify_user": reset_request.notify_user}),
            request=request,
        )

        # Optionally send email with temporary password
        email_sent = False
        if reset_request.notify_user:
            email_sent = await send_temporary_password_email(user.email, temp_password)

        return success_response(
            {
                "success": True,
                "method": "temporary",
                "temporary_password": temp_password,
                "email_sent": email_sent,
                "message": "User must change password on next login",
            },
            trace_id=trace_id,
        )

    else:  # email method
        # Generate reset token with 24-hour expiry
        reset_token = generate_secure_token()
        user.password_reset_token = reset_token
        user.password_reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()

        # Build reset link
        reset_link = f"{settings.ADMIN_PANEL_URL}/reset-password?token={reset_token}"

        # Log audit event
        log_audit_event(
            db=db,
            action="user.password_reset",
            user_id=str(current_admin_user.id),
            user_email=current_admin_user.email,
            resource_type="user",
            resource_id=user_id,
            success=True,
            details=json.dumps({"method": "email"}),
            request=request,
        )

        # Send reset email
        email_sent = await send_password_reset_email(user.email, reset_link)

        return success_response(
            {
                "success": True,
                "method": "email",
                "email_sent": email_sent,
                "message": "Password reset email sent" if email_sent else "Failed to send email",
            },
            trace_id=trace_id,
        )


@router.post("/users/invite")
async def invite_user(
    request: Request,
    invite_request: UserInviteRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Invite a new user via email.

    Creates a user account with a pending invitation. The user will receive
    an email with a link to set their password and activate their account.
    """
    from app.core.config import settings
    from app.services.email_service import send_invitation_email

    ensure_admin_privileges(current_admin_user)

    # Check if email already exists
    existing_user = db.query(User).filter(User.email == invite_request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Rate limit invitation actions
    try:
        enforce_admin_action_rate_limit(request, action="user-invite", calls=20, period=300)
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    trace_id = getattr(request.state, "trace_id", None)

    # Generate invitation token with 7-day expiry
    invitation_token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Create user with pending invitation
    new_user = User(
        email=invite_request.email,
        full_name=invite_request.full_name or "",
        hashed_password=None,  # No password until invitation is accepted
        is_active=False,  # Inactive until invitation is accepted
        is_admin=invite_request.admin_role == "admin",
        admin_role=invite_request.admin_role,
        invitation_token=invitation_token,
        invitation_token_expires_at=expires_at,
        invitation_sent_at=datetime.now(timezone.utc),
        invited_by_id=current_admin_user.id,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Log audit event
    log_audit_event(
        db=db,
        action="user.invite",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=str(new_user.id),
        success=True,
        details=json.dumps(
            {
                "invited_email": invite_request.email,
                "role": invite_request.admin_role,
                "send_email": invite_request.send_email,
            }
        ),
        request=request,
    )

    # Build invitation link
    invitation_link = f"{settings.ADMIN_PANEL_URL}/accept-invitation?token={invitation_token}"

    # Send invitation email
    email_sent = False
    if invite_request.send_email:
        inviter_name = current_admin_user.full_name or current_admin_user.email
        email_sent = await send_invitation_email(
            to=invite_request.email,
            inviter_name=inviter_name,
            invitation_link=invitation_link,
            expires_in_days=7,
        )

    return success_response(
        {
            "success": True,
            "user_id": str(new_user.id),
            "email": new_user.email,
            "invitation_link": invitation_link,
            "email_sent": email_sent,
            "expires_at": expires_at.isoformat(),
        },
        trace_id=trace_id,
    )


@router.post("/users/{user_id}/resend-invitation")
async def resend_invitation(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Resend an invitation email to a pending user."""
    from app.core.config import settings
    from app.services.email_service import send_invitation_email

    ensure_admin_privileges(current_admin_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_active:
        raise HTTPException(status_code=400, detail="User has already accepted invitation")

    if not user.invitation_token:
        raise HTTPException(status_code=400, detail="User was not invited via email")

    trace_id = getattr(request.state, "trace_id", None)

    # Generate new invitation token with fresh 7-day expiry
    new_token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    user.invitation_token = new_token
    user.invitation_token_expires_at = expires_at
    user.invitation_sent_at = datetime.now(timezone.utc)
    db.commit()

    # Build invitation link
    invitation_link = f"{settings.ADMIN_PANEL_URL}/accept-invitation?token={new_token}"

    # Send invitation email
    inviter_name = current_admin_user.full_name or current_admin_user.email
    email_sent = await send_invitation_email(
        to=user.email,
        inviter_name=inviter_name,
        invitation_link=invitation_link,
        expires_in_days=7,
    )

    # Log audit event
    log_audit_event(
        db=db,
        action="user.resend_invitation",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=user_id,
        success=True,
        details=json.dumps({"email_sent": email_sent}),
        request=request,
    )

    return success_response(
        {
            "success": True,
            "email_sent": email_sent,
            "expires_at": expires_at.isoformat(),
            "message": "Invitation resent" if email_sent else "Failed to send email",
        },
        trace_id=trace_id,
    )


# ============================================================================
# Bulk Operations
# ============================================================================


class BulkOperationRequest(BaseModel):
    """Request model for bulk user operations."""

    user_ids: list[str]
    action: Literal["activate", "deactivate", "set_role"]
    role: Optional[Literal["user", "admin", "viewer"]] = None  # Required for set_role action
    reason: Optional[str] = None


@router.post("/users/bulk")
async def bulk_user_operation(
    request: Request,
    bulk_request: BulkOperationRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Perform bulk operations on multiple users.

    Supported actions:
    - "activate": Activate multiple user accounts
    - "deactivate": Deactivate multiple user accounts (soft delete)
    - "set_role": Set the role for multiple users (requires 'role' field)

    Returns a summary of successful and failed operations.
    """
    ensure_admin_privileges(current_admin_user)

    # Validate request
    if not bulk_request.user_ids:
        raise HTTPException(status_code=400, detail="No user IDs provided")

    if len(bulk_request.user_ids) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 users per bulk operation")

    if bulk_request.action == "set_role" and not bulk_request.role:
        raise HTTPException(status_code=400, detail="Role is required for set_role action")

    # Rate limit bulk operations
    try:
        rate_limit_info = enforce_admin_action_rate_limit(request, action="bulk-operation", calls=10, period=300)
    except HTTPException as exc:
        if exc.status_code == 429:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            trace_id = getattr(request.state, "trace_id", None)
            return JSONResponse(
                status_code=429,
                content=error_response(
                    code=detail.get("code", "RATE_LIMITED"),
                    message=detail.get("message", "Rate limit exceeded"),
                    details={"rate_limit": detail.get("rate_limit")},
                    request_id=trace_id,
                ),
            )
        raise

    trace_id = getattr(request.state, "trace_id", None)
    admin_user_id = str(current_admin_user.id)

    # Track results
    results = {
        "successful": [],
        "failed": [],
        "skipped": [],
    }

    for user_id in bulk_request.user_ids:
        try:
            # Prevent self-modification
            if user_id == admin_user_id:
                results["skipped"].append(
                    {
                        "user_id": user_id,
                        "reason": "Cannot modify your own account",
                    }
                )
                continue

            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                results["failed"].append(
                    {
                        "user_id": user_id,
                        "reason": "User not found",
                    }
                )
                continue

            # Capture original values for audit
            original_values = {
                "is_active": user.is_active,
                "is_admin": user.is_admin,
                "admin_role": user.admin_role,
            }

            # Perform the action
            if bulk_request.action == "activate":
                if user.is_active:
                    results["skipped"].append(
                        {
                            "user_id": user_id,
                            "email": user.email,
                            "reason": "Already active",
                        }
                    )
                    continue
                user.is_active = True

            elif bulk_request.action == "deactivate":
                if not user.is_active:
                    results["skipped"].append(
                        {
                            "user_id": user_id,
                            "email": user.email,
                            "reason": "Already inactive",
                        }
                    )
                    continue
                user.is_active = False

            elif bulk_request.action == "set_role":
                if user.admin_role == bulk_request.role:
                    results["skipped"].append(
                        {
                            "user_id": user_id,
                            "email": user.email,
                            "reason": f"Already has role '{bulk_request.role}'",
                        }
                    )
                    continue
                user.admin_role = bulk_request.role
                user.is_admin = bulk_request.role == "admin"

            db.commit()

            # Log audit event
            log_audit_event(
                db=db,
                action=f"user.bulk_{bulk_request.action}",
                user_id=admin_user_id,
                user_email=current_admin_user.email,
                resource_type="user",
                resource_id=user_id,
                success=True,
                details=json.dumps(
                    {
                        "original": original_values,
                        "action": bulk_request.action,
                        "new_role": bulk_request.role if bulk_request.action == "set_role" else None,
                        "reason": bulk_request.reason,
                    }
                ),
                request=request,
            )

            results["successful"].append(
                {
                    "user_id": user_id,
                    "email": user.email,
                }
            )

        except Exception as e:
            logger.warning(f"Bulk operation failed for user {user_id}: {e}")
            db.rollback()
            results["failed"].append(
                {
                    "user_id": user_id,
                    "reason": str(e),
                }
            )

    return success_response(
        {
            "action": bulk_request.action,
            "total_requested": len(bulk_request.user_ids),
            "successful": len(results["successful"]),
            "failed": len(results["failed"]),
            "skipped": len(results["skipped"]),
            "results": results,
            "rate_limit": rate_limit_info,
        },
        trace_id=trace_id,
    )


def _parse_audit_details(log: AuditLog) -> Dict:
    """Extract structured audit details from an AuditLog entry."""

    if not log.additional_data:
        return {}

    raw_details = log.additional_data
    if isinstance(raw_details, dict) and "details" in raw_details:
        raw_details = raw_details.get("details")

    if isinstance(raw_details, str):
        try:
            raw_details = json.loads(raw_details)
        except json.JSONDecodeError:
            return {"details": raw_details}

    return raw_details if isinstance(raw_details, dict) else {}


@router.get("/users/{user_id}/role-history")
async def get_role_history(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(20, ge=1, le=100),
) -> Dict:
    """Return role assignment history for a user based on audit logs."""

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.resource_type == "user",
            AuditLog.resource_id == user_id,
            AuditLog.action == "user.update",
        )
        .order_by(desc(AuditLog.timestamp))
        .limit(limit)
        .all()
    )

    history = []
    for log in logs:
        details = _parse_audit_details(log)
        original = details.get("original", {}) if isinstance(details, dict) else {}
        updated = details.get("updated", {}) if isinstance(details, dict) else {}

        if "is_admin" not in original and "is_admin" not in updated:
            continue

        from_role = "admin" if original.get("is_admin") else "user"
        to_role = "admin" if updated.get("is_admin", original.get("is_admin")) else "user"

        if from_role == to_role:
            continue

        history.append(
            {
                "id": str(log.id),
                "changed_at": log.timestamp.isoformat() if log.timestamp else None,
                "actor": log.user_email or "unknown",
                "from_role": from_role,
                "to_role": to_role,
                "reason": details.get("reason") or "Role updated by admin",
                "trace_id": log.request_id,
            }
        )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response({"history": history}, trace_id=trace_id)


@router.get("/users/{user_id}/lock-reasons")
async def get_lock_reasons(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(20, ge=1, le=100),
) -> Dict:
    """Return account lock/unlock reasons for a user."""

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.resource_type == "user",
            AuditLog.resource_id == user_id,
            AuditLog.action.in_(["user.update", "user.deactivate"]),
        )
        .order_by(desc(AuditLog.timestamp))
        .limit(limit)
        .all()
    )

    events = []
    for log in logs:
        details = _parse_audit_details(log)
        original = details.get("original", {}) if isinstance(details, dict) else {}
        updated = details.get("updated", {}) if isinstance(details, dict) else {}

        status_change = None
        if log.action == "user.deactivate":
            status_change = False
        elif "is_active" in original or "is_active" in updated:
            prev_active = original.get("is_active")
            new_active = updated.get("is_active", prev_active)
            if prev_active != new_active:
                status_change = new_active

        if status_change is None:
            continue

        events.append(
            {
                "id": str(log.id),
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "actor": log.user_email or "unknown",
                "status": "unlocked" if status_change else "locked",
                "reason": details.get("reason") or details.get("details") or "Admin status change",
                "trace_id": log.request_id,
            }
        )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response({"events": events}, trace_id=trace_id)


# ============================================================================
# System Metrics (Optimized Queries + Redis Caching)
# ============================================================================


def _fetch_metrics_from_db(db: Session, days: int) -> Dict:
    """Fetch metrics from database using optimized aggregated queries."""
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # Optimized: Single aggregated query for daily registrations
    registration_query = (
        db.query(
            cast(User.created_at, Date).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= start_date)
        .group_by(cast(User.created_at, Date))
        .order_by(cast(User.created_at, Date))
        .all()
    )

    # Optimized: Single aggregated query for daily active users
    active_query = (
        db.query(
            cast(User.last_login, Date).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.last_login >= start_date)
        .group_by(cast(User.last_login, Date))
        .order_by(cast(User.last_login, Date))
        .all()
    )

    # Convert to dict for easy lookup
    reg_by_date = {str(row.date): row.count for row in registration_query}
    active_by_date = {str(row.date): row.count for row in active_query}

    # Build daily arrays with all dates
    daily_registrations = []
    daily_active_users = []
    for i in range(days - 1, -1, -1):
        date = (now - timedelta(days=i)).date()
        date_str = str(date)
        daily_registrations.append({"date": date_str, "count": reg_by_date.get(date_str, 0)})
        daily_active_users.append({"date": date_str, "count": active_by_date.get(date_str, 0)})

    # User distribution (single query with aggregates)
    total_users = db.query(func.count(User.id)).scalar() or 0
    admin_users = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0

    return {
        "daily_registrations": daily_registrations,
        "daily_active_users": daily_active_users,
        "user_distribution": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users,
            "admins": admin_users,
            "regular": total_users - admin_users,
        },
        "period_days": days,
        "timestamp": now.isoformat() + "Z",
    }


@router.get("/metrics")
async def get_system_metrics(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(7, ge=1, le=90),
) -> Dict:
    """Return system metrics for dashboard charts with caching."""
    cache_key = f"{REDIS_METRICS_CACHE_KEY}:{days}"

    # Try to get from cache
    try:
        cached = redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
    except Exception as e:
        logger.debug(f"Cache miss or error: {e}")

    # Fetch from database
    data = _fetch_metrics_from_db(db, days)

    # Cache the result
    try:
        redis_client.setex(cache_key, METRICS_CACHE_TTL, json.dumps(data))
    except Exception as e:
        logger.debug(f"Failed to cache metrics: {e}")

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Audit Log Viewer (Database-backed)
# ============================================================================


@router.get("/audit-logs")
async def get_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    level: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
) -> Dict:
    """Return audit log entries with filtering and pagination from database."""
    query = db.query(AuditLog)

    # Apply filters
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))

    # Sort by timestamp descending (most recent first)
    query = query.order_by(desc(AuditLog.timestamp))

    # Get total count
    total = query.count()

    # Apply pagination
    logs = query.offset(offset).limit(limit).all()

    # Convert to response format
    log_list = []
    for log in logs:
        # Determine level based on success
        log_level = "info" if log.success else "error"
        if level and log_level != level:
            continue

        details = None
        if log.additional_data:
            details = (
                log.additional_data.get("details")
                if isinstance(log.additional_data, dict)
                else str(log.additional_data)
            )

        log_list.append(
            {
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "level": log_level,
                "action": log.action,
                "user_id": str(log.user_id) if log.user_id else None,
                "user_email": log.user_email,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "success": log.success,
                "details": details,
            }
        )

    data = {
        "logs": log_list,
        "total": total,
        "offset": offset,
        "limit": limit,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/audit-logs/export")
async def export_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
    action: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
):
    """Export recent admin audit activity as CSV for compliance."""

    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))

    logs = query.order_by(desc(AuditLog.timestamp)).limit(limit).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "timestamp",
            "action",
            "user_email",
            "resource_type",
            "resource_id",
            "success",
            "details",
            "trace_id",
        ]
    )

    for log in logs:
        details = _parse_audit_details(log)
        writer.writerow(
            [
                log.timestamp.isoformat() if log.timestamp else "",
                log.action,
                log.user_email or "",
                log.resource_type or "",
                log.resource_id or "",
                "success" if log.success else "error",
                json.dumps(details) if details else "",
                log.request_id or "",
            ]
        )

    output.seek(0)
    filename = f"admin-audit-{datetime.now(timezone.utc).date()}.csv"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers=headers,
    )


# ============================================================================
# Admin WebSocket for Real-time Updates
# ============================================================================

# Track connected admin WebSocket sessions
_admin_ws_connections: Dict[str, WebSocket] = {}


@router.websocket("/ws")
async def admin_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time admin panel updates.

    Provides:
    - Heartbeat/ping-pong to keep connection alive
    - Real-time metric updates (every 10 seconds)
    - System event notifications via Redis pub/sub
    - Live events (sessions, conversations, voice, etc.)
    """
    await websocket.accept()

    connection_id = str(uuid.uuid4())
    _admin_ws_connections[connection_id] = websocket

    logger.info(f"Admin WebSocket connected: {connection_id}")

    # Send initial connection confirmation
    await websocket.send_json(
        {
            "type": "connected",
            "payload": {
                "connection_id": connection_id,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        }
    )

    try:
        # Start background tasks
        update_task = asyncio.create_task(_send_periodic_updates(websocket, connection_id))
        redis_task = asyncio.create_task(_subscribe_to_admin_events(websocket, connection_id))

        # Main message loop
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)

                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_json(
                        {"type": "pong", "payload": {"timestamp": datetime.now(timezone.utc).isoformat() + "Z"}}
                    )

                # Handle event subscription
                elif data.get("type") == "subscribe":
                    event_types = data.get("payload", {}).get("event_types", [])
                    await websocket.send_json(
                        {
                            "type": "subscribed",
                            "payload": {
                                "event_types": event_types,
                                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                            },
                        }
                    )

            except asyncio.TimeoutError:
                # Send heartbeat on timeout
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(
                        {"type": "heartbeat", "payload": {"timestamp": datetime.now(timezone.utc).isoformat() + "Z"}}
                    )

    except WebSocketDisconnect:
        logger.info(f"Admin WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"Admin WebSocket error for {connection_id}: {e}")
    finally:
        update_task.cancel()
        redis_task.cancel()
        _admin_ws_connections.pop(connection_id, None)
        register_websocket_session_cleanup(connection_id)


async def _send_periodic_updates(websocket: WebSocket, connection_id: str):
    """Send periodic metric updates to connected admin clients."""
    try:
        while True:
            await asyncio.sleep(10)  # Update every 10 seconds

            if websocket.client_state != WebSocketState.CONNECTED:
                break

            try:
                # Get current stats
                active_sessions = get_active_websocket_count()
                db_stats = get_db_pool_stats()
                redis_stats = get_redis_pool_stats()

                await websocket.send_json(
                    {
                        "type": "metrics_update",
                        "payload": {
                            "active_websocket_sessions": active_sessions,
                            "database_pool": db_stats,
                            "redis_pool": redis_stats,
                            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                        },
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to send metrics update to {connection_id}: {e}")
                break

    except asyncio.CancelledError:
        pass


async def _subscribe_to_admin_events(websocket: WebSocket, connection_id: str):
    """Subscribe to Redis pub/sub for real-time admin events."""
    from app.services.admin_event_publisher import ADMIN_EVENTS_CHANNEL

    try:
        redis = redis_client
        if not redis:
            logger.warning(f"Redis not available for admin events subscription: {connection_id}")
            return

        # Create a pubsub connection
        pubsub = redis.pubsub()
        await pubsub.subscribe(ADMIN_EVENTS_CHANNEL)

        logger.debug(f"Admin WebSocket {connection_id} subscribed to events channel")

        # Listen for messages
        async for message in pubsub.listen():
            if websocket.client_state != WebSocketState.CONNECTED:
                break

            if message["type"] == "message":
                try:
                    # Parse the event data
                    event_data = json.loads(message["data"])

                    # Forward to WebSocket client
                    await websocket.send_json(
                        {
                            "type": "admin_event",
                            "payload": event_data,
                        }
                    )
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in admin event: {message['data']}")
                except Exception as e:
                    logger.warning(f"Failed to forward admin event to {connection_id}: {e}")

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error in admin events subscription for {connection_id}: {e}")
    finally:
        try:
            await pubsub.unsubscribe(ADMIN_EVENTS_CHANNEL)
            await pubsub.close()
        except Exception:
            pass


def register_websocket_session_cleanup(session_id: str):
    """Clean up WebSocket session from tracking."""
    try:
        unregister_websocket_session(session_id)
    except Exception as e:
        logger.warning(f"Failed to cleanup WebSocket session {session_id}: {e}")
