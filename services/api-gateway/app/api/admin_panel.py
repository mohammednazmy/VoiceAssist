"""Admin Panel API endpoints (Phase 7 + Phase 8.3 enhancements).

Provides system summary information for the Admin Panel dashboard.

Phase 7: Basic summary endpoint
Phase 8.3: WebSocket status, user management, metrics, audit logs
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from app.core.api_envelope import success_response
from app.core.database import get_db, get_db_pool_stats, get_redis_pool_stats
from app.core.dependencies import get_current_admin_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/panel", tags=["admin", "panel"])

# Track active WebSocket connections (updated by realtime module)
_active_websocket_sessions: Dict[str, dict] = {}


def register_websocket_session(session_id: str, user_id: str, session_type: str):
    """Register a new WebSocket session (called from realtime handlers)."""
    _active_websocket_sessions[session_id] = {
        "user_id": user_id,
        "type": session_type,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }


def unregister_websocket_session(session_id: str):
    """Unregister a WebSocket session (called from realtime handlers)."""
    _active_websocket_sessions.pop(session_id, None)


def get_active_websocket_count() -> int:
    """Get count of active WebSocket sessions."""
    return len(_active_websocket_sessions)


# Pydantic models for request/response
class UserCreate(BaseModel):
    """Request model for creating a user."""

    email: EmailStr
    full_name: str
    is_admin: bool = False
    is_active: bool = True


class UserUpdate(BaseModel):
    """Request model for updating a user."""

    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Response model for user data."""

    id: str
    email: str
    full_name: Optional[str]
    is_admin: bool
    is_active: bool
    created_at: str
    last_login: Optional[str]

    class Config:
        from_attributes = True


class AuditLogEntry(BaseModel):
    """Response model for audit log entry."""

    timestamp: str
    level: str
    action: str
    user_id: Optional[str]
    details: Optional[str]


@router.get("/summary")
async def get_system_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Return a simple system summary for the admin dashboard.

    This endpoint is intended as a Phase 7 MVP and returns:
    - total_users: Count of user records
    - active_users: Count of active user records
    - admin_users: Count of admin users
    - timestamp: ISO8601 timestamp
    """
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
# Phase 8.3: WebSocket Status Monitoring
# ============================================================================


@router.get("/websocket-status")
async def get_websocket_status(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Return WebSocket connection status for admin dashboard.

    Returns:
    - active_connections: Count of active WebSocket connections
    - connections_by_type: Breakdown by connection type (chat, voice)
    - recent_connections: List of recent connection events
    - pool_stats: Connection pool statistics
    """
    # Get pool stats
    try:
        db_stats = get_db_pool_stats()
        redis_stats = get_redis_pool_stats()
    except Exception:
        db_stats = {"size": 0, "checked_out": 0, "checked_in": 0}
        redis_stats = {"max_connections": 0, "in_use_connections": 0}

    # Count connections by type
    connections_by_type = {"chat": 0, "voice": 0, "other": 0}
    for session_info in _active_websocket_sessions.values():
        conn_type = session_info.get("type", "other")
        if conn_type in connections_by_type:
            connections_by_type[conn_type] += 1
        else:
            connections_by_type["other"] += 1

    # Get recent connections (last 10)
    recent_connections = sorted(
        [{"session_id": sid, **info} for sid, info in _active_websocket_sessions.items()],
        key=lambda x: x.get("connected_at", ""),
        reverse=True,
    )[:10]

    data = {
        "active_connections": len(_active_websocket_sessions),
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
# Phase 8.3: User Management CRUD
# ============================================================================


@router.get("/users")
async def list_users(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_admin: Optional[bool] = Query(None),
) -> Dict:
    """List users with pagination and filtering.

    Args:
        offset: Number of records to skip
        limit: Maximum number of records to return
        search: Search term for email or full_name
        is_active: Filter by active status
        is_admin: Filter by admin status
    """
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
    current_admin_user: User = Depends(get_current_admin_user),
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
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Update a user's information."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from demoting themselves
    if str(user.id) == str(current_admin_user.id) and user_update.is_admin is False:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin privileges")

    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    data = {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Delete a user (soft delete by deactivating)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deleting themselves
    if str(user.id) == str(current_admin_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Soft delete - deactivate the user
    user.is_active = False
    db.commit()

    data = {"message": "User deactivated successfully", "user_id": user_id}
    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Phase 8.3: System Metrics for Charts
# ============================================================================


@router.get("/metrics")
async def get_system_metrics(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
    days: int = Query(7, ge=1, le=90),
) -> Dict:
    """Return system metrics for dashboard charts.

    Args:
        days: Number of days to include in the metrics (1-90)
    """
    now = datetime.now(timezone.utc)

    # Get daily user registration counts
    daily_registrations = []
    daily_active_users = []

    for i in range(days):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Count registrations for this day
        reg_count = (
            db.query(func.count(User.id)).filter(User.created_at >= day_start, User.created_at < day_end).scalar() or 0
        )
        daily_registrations.append({"date": day_start.strftime("%Y-%m-%d"), "count": reg_count})

        # Count logins for this day
        active_count = (
            db.query(func.count(User.id)).filter(User.last_login >= day_start, User.last_login < day_end).scalar() or 0
        )
        daily_active_users.append({"date": day_start.strftime("%Y-%m-%d"), "count": active_count})

    # Reverse to show oldest first
    daily_registrations.reverse()
    daily_active_users.reverse()

    # Get user role distribution
    total_users = db.query(func.count(User.id)).scalar() or 0
    admin_users = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0

    data = {
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

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Phase 8.3: Audit Log Viewer
# ============================================================================

# In-memory audit log buffer (for demo - in production use database or log service)
_audit_log_buffer: List[Dict] = []
MAX_AUDIT_LOG_SIZE = 1000


def log_audit_event(action: str, user_id: Optional[str] = None, details: Optional[str] = None):
    """Log an audit event (called from various parts of the application)."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "level": "info",
        "action": action,
        "user_id": user_id,
        "details": details,
    }
    _audit_log_buffer.append(entry)

    # Keep buffer size limited
    while len(_audit_log_buffer) > MAX_AUDIT_LOG_SIZE:
        _audit_log_buffer.pop(0)


@router.get("/audit-logs")
async def get_audit_logs(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_user),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    level: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
) -> Dict:
    """Return audit log entries with filtering and pagination.

    Args:
        offset: Number of records to skip
        limit: Maximum number of records to return
        level: Filter by log level (info, warn, error)
        action: Filter by action type
    """
    # Filter logs
    filtered_logs = _audit_log_buffer.copy()

    if level:
        filtered_logs = [log for log in filtered_logs if log.get("level") == level]
    if action:
        filtered_logs = [log for log in filtered_logs if action.lower() in log.get("action", "").lower()]

    # Sort by timestamp descending (most recent first)
    filtered_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    # Apply pagination
    total = len(filtered_logs)
    paginated_logs = filtered_logs[offset : offset + limit]

    data = {
        "logs": paginated_logs,
        "total": total,
        "offset": offset,
        "limit": limit,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)
