"""Admin Panel Utility Functions.

Provides helper functions for rate limiting, audit logging, and WebSocket session tracking.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict, Optional

from app.core.database import redis_client, transaction
from app.models.audit_log import AuditLog
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Redis keys for WebSocket session tracking and caching
REDIS_WS_SESSIONS_KEY = "voiceassist:ws:sessions"
REDIS_METRICS_CACHE_KEY = "voiceassist:admin:metrics"
METRICS_CACHE_TTL = 60  # Cache metrics for 60 seconds


def enforce_admin_action_rate_limit(
    request: Request,
    action: str,
    calls: int = 5,
    period: int = 60,
) -> Dict[str, Optional[int]]:
    """Enforce a Redis-backed rate limit for sensitive admin actions.

    Returns a rate limit payload that can be surfaced to clients. On failure,
    raises an HTTPException with details that can be converted into an
    APIEnvelope error response.
    """

    identifier = getattr(request.state, "user_id", None) or (request.client.host if request.client else "unknown")
    redis_key = f"admin:{action}:{identifier}"

    try:
        current = redis_client.get(redis_key)
        current_count = int(current) if current else 0

        if current_count >= calls:
            ttl = redis_client.ttl(redis_key)
            retry_after = ttl if ttl and ttl > 0 else period
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": f"{action} limit reached",
                    "rate_limit": {
                        "limit": calls,
                        "remaining": 0,
                        "reset_in": retry_after,
                    },
                },
                headers={"Retry-After": str(retry_after)},
            )

        pipe = redis_client.pipeline()
        pipe.incr(redis_key)
        if current_count == 0:
            pipe.expire(redis_key, period)
        pipe.execute()

        reset_in = redis_client.ttl(redis_key)
        return {
            "limit": calls,
            "remaining": max(calls - (current_count + 1), 0),
            "reset_in": reset_in if reset_in and reset_in > 0 else period,
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive path
        logger.warning(f"Rate limiting failed: {exc}")
        return {"limit": calls, "remaining": None, "reset_in": None}


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

    with transaction(db):
        db.add(entry)

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


def register_websocket_session_cleanup(session_id: str):
    """Register a cleanup task for WebSocket session (legacy alias)."""
    unregister_websocket_session(session_id)


# ============================================================================
# Password/Token Helpers
# ============================================================================


def generate_temporary_password(length: int = 16) -> str:
    """Generate a secure temporary password."""
    return secrets.token_urlsafe(length)


def generate_secure_token(length: int = 32) -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(length)


def resolve_admin_role(current_role: str, incoming_admin_flag: Optional[bool], incoming_role: Optional[str]) -> str:
    """Determine the resulting admin role based on incoming values."""
    from app.api.admin.schemas import ALLOWED_ADMIN_ROLES

    if incoming_role:
        if incoming_role not in ALLOWED_ADMIN_ROLES:
            raise HTTPException(
                status_code=400,
                detail="Invalid admin role specified",
            )
        role = incoming_role
    else:
        role = current_role

    if incoming_admin_flag is not None:
        role = "admin" if incoming_admin_flag else ("viewer" if role == "viewer" else "user")

    return role
