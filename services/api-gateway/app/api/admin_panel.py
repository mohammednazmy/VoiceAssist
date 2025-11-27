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
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from app.core.api_envelope import success_response
from app.core.database import get_db, get_db_pool_stats, get_redis_pool_stats, redis_client
from app.core.dependencies import get_current_admin_user
from app.models.audit_log import AuditLog
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import Date, cast, desc, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/panel", tags=["admin", "panel"])

# Redis keys for WebSocket session tracking and caching
REDIS_WS_SESSIONS_KEY = "voiceassist:ws:sessions"
REDIS_METRICS_CACHE_KEY = "voiceassist:admin:metrics"
METRICS_CACHE_TTL = 60  # Cache metrics for 60 seconds


# ============================================================================
# Audit Log Helper Functions (Database-backed)
# ============================================================================


def log_audit_event(
    db: Session,
    action: str,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    success: bool = True,
    details: Optional[str] = None,
    request: Optional[Request] = None,
) -> AuditLog:
    """Log an audit event to the database.

    Args:
        db: Database session
        action: Action performed (e.g., 'user.update', 'user.delete')
        user_id: ID of user performing the action
        user_email: Email of user performing the action
        resource_type: Type of resource affected (e.g., 'user', 'session')
        resource_id: ID of the affected resource
        success: Whether the action was successful
        details: Additional details (JSON string)
        request: FastAPI request object for context
    """
    entry = AuditLog(
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        success=success,
        additional_data={"details": details} if details else None,
        request_id=getattr(request.state, "trace_id", None) if request else None,
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500] if request else None,
        endpoint=str(request.url.path) if request else None,
    )
    # Calculate integrity hash
    entry.hash = entry.calculate_hash()

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ============================================================================
# WebSocket Session Tracking (Redis-backed for distributed deployments)
# ============================================================================


def register_websocket_session(session_id: str, user_id: str, session_type: str):
    """Register a new WebSocket session in Redis."""
    try:
        session_data = json.dumps(
            {
                "user_id": user_id,
                "type": session_type,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        redis_client.hset(REDIS_WS_SESSIONS_KEY, session_id, session_data)
        # Set expiry on the hash (auto-cleanup stale sessions after 24h)
        redis_client.expire(REDIS_WS_SESSIONS_KEY, 86400)
    except Exception as e:
        logger.warning(f"Failed to register WebSocket session in Redis: {e}")


def unregister_websocket_session(session_id: str):
    """Unregister a WebSocket session from Redis."""
    try:
        redis_client.hdel(REDIS_WS_SESSIONS_KEY, session_id)
    except Exception as e:
        logger.warning(f"Failed to unregister WebSocket session from Redis: {e}")


def get_all_websocket_sessions() -> Dict[str, dict]:
    """Get all active WebSocket sessions from Redis."""
    try:
        sessions = redis_client.hgetall(REDIS_WS_SESSIONS_KEY)
        return {sid: json.loads(data) if isinstance(data, str) else data for sid, data in sessions.items()}
    except Exception as e:
        logger.warning(f"Failed to get WebSocket sessions from Redis: {e}")
        return {}


def get_active_websocket_count() -> int:
    """Get count of active WebSocket sessions."""
    try:
        return redis_client.hlen(REDIS_WS_SESSIONS_KEY)
    except Exception:
        return 0


# ============================================================================
# Pydantic Models
# ============================================================================


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


class AuditLogEntryResponse(BaseModel):
    """Response model for audit log entry."""

    timestamp: str
    level: str
    action: str
    user_id: Optional[str]
    user_email: Optional[str]
    resource_type: Optional[str]
    resource_id: Optional[str]
    success: bool
    details: Optional[str]


# ============================================================================
# System Summary Endpoint
# ============================================================================


@router.get("/summary")
async def get_system_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
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
    current_admin_user: User = Depends(get_current_admin_user),
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
    current_admin_user: User = Depends(get_current_admin_user),
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

    # Capture original values for audit
    original_values = {
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
    }

    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    # Log audit event
    log_audit_event(
        db=db,
        action="user.update",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="user",
        resource_id=user_id,
        success=True,
        details=json.dumps({"original": original_values, "updated": update_data}),
        request=request,
    )

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

    # Capture user email for audit before deactivation
    target_email = user.email

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

    data = {"message": "User deactivated successfully", "user_id": user_id}
    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


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
    current_admin_user: User = Depends(get_current_admin_user),
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
    current_admin_user: User = Depends(get_current_admin_user),
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
