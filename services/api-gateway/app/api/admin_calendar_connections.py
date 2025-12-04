"""Admin Calendar Connections API endpoints.

Provides admin endpoints for viewing and managing user calendar connections:
- GET /api/admin/calendars/connections - List all calendar connections
- GET /api/admin/calendars/connections/{user_id} - Get connections for specific user
- DELETE /api/admin/calendars/connections/{connection_id} - Remove a connection
- GET /api/admin/calendars/stats - Get calendar connection statistics
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from app.core.api_envelope import success_response
from app.core.database import get_async_db
from app.core.dependencies import get_current_admin_or_viewer, get_current_admin_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/calendars", tags=["admin", "calendars"])


# ============================================================================
# Pydantic Models
# ============================================================================


class CalendarConnectionAdmin(BaseModel):
    """Admin view of a calendar connection."""

    id: str
    user_id: str
    user_email: Optional[str] = None
    provider: str
    provider_display_name: str
    status: str
    caldav_url: Optional[str] = None
    last_sync_at: Optional[str] = None
    connected_at: Optional[str] = None
    error_message: Optional[str] = None


class CalendarStatsResponse(BaseModel):
    """Statistics about calendar connections."""

    total_connections: int
    connected_count: int
    error_count: int
    by_provider: Dict[str, int]
    by_status: Dict[str, int]
    users_with_connections: int
    avg_connections_per_user: float


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/connections")
async def list_all_calendar_connections(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    db: AsyncSession = Depends(get_async_db),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict:
    """List all calendar connections across all users.

    Available to admin and viewer roles.
    """
    # Build query with filters
    filters = ["1=1"]
    params = {"limit": limit, "offset": offset}

    if provider:
        filters.append("c.provider = :provider")
        params["provider"] = provider

    if status:
        filters.append("c.status = :status")
        params["status"] = status

    where_clause = " AND ".join(filters)

    # Query connections with user info
    # nosec B608 - where_clause is built from hardcoded filter strings, all values are parameterized
    query = f"""
        SELECT
            c.id, c.user_id, u.email as user_email, c.provider,
            c.provider_display_name, c.status, c.caldav_url,
            c.last_sync_at, c.connected_at, c.error_message
        FROM user_calendar_connections c
        LEFT JOIN users u ON c.user_id::uuid = u.id
        WHERE {where_clause}
        ORDER BY c.connected_at DESC
        LIMIT :limit OFFSET :offset
    """

    result = await db.execute(text(query), params)
    rows = result.fetchall()

    # Get total count
    # nosec B608 - where_clause is built from hardcoded filter strings, all values are parameterized
    count_query = f"""
        SELECT COUNT(*) as total
        FROM user_calendar_connections c
        WHERE {where_clause}
    """
    count_params = {k: v for k, v in params.items() if k not in ["limit", "offset"]}
    count_result = await db.execute(text(count_query), count_params)
    total_count = count_result.scalar()

    connections = [
        {
            "id": str(row.id),
            "user_id": row.user_id,
            "user_email": row.user_email,
            "provider": row.provider,
            "provider_display_name": row.provider_display_name,
            "status": row.status,
            "caldav_url": row.caldav_url,
            "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
            "connected_at": row.connected_at.isoformat() if row.connected_at else None,
            "error_message": row.error_message,
        }
        for row in rows
    ]

    data = {
        "connections": connections,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "filters": {"provider": provider, "status": status},
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/connections/user/{user_id}")
async def get_user_calendar_connections(
    request: Request,
    user_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    db: AsyncSession = Depends(get_async_db),
) -> Dict:
    """Get calendar connections for a specific user.

    Available to admin and viewer roles.
    """
    query = """
        SELECT
            c.id, c.user_id, u.email as user_email, c.provider,
            c.provider_display_name, c.status, c.caldav_url,
            c.last_sync_at, c.connected_at, c.error_message
        FROM user_calendar_connections c
        LEFT JOIN users u ON c.user_id::uuid = u.id
        WHERE c.user_id = :user_id
        ORDER BY c.connected_at
    """

    result = await db.execute(text(query), {"user_id": user_id})
    rows = result.fetchall()

    connections = [
        {
            "id": str(row.id),
            "user_id": row.user_id,
            "user_email": row.user_email,
            "provider": row.provider,
            "provider_display_name": row.provider_display_name,
            "status": row.status,
            "caldav_url": row.caldav_url,
            "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
            "connected_at": row.connected_at.isoformat() if row.connected_at else None,
            "error_message": row.error_message,
        }
        for row in rows
    ]

    data = {
        "user_id": user_id,
        "connections": connections,
        "total": len(connections),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.delete("/connections/{connection_id}")
async def admin_delete_calendar_connection(
    request: Request,
    connection_id: str,
    current_admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_async_db),
) -> Dict:
    """Delete a calendar connection (admin only).

    Use with caution - this removes the user's calendar integration.
    """
    # First check if connection exists
    check_query = """
        SELECT id, user_id, provider FROM user_calendar_connections WHERE id = :id
    """
    result = await db.execute(text(check_query), {"id": connection_id})
    connection = result.fetchone()

    if not connection:
        raise HTTPException(status_code=404, detail="Calendar connection not found")

    # Delete the connection
    delete_query = "DELETE FROM user_calendar_connections WHERE id = :id"
    await db.execute(text(delete_query), {"id": connection_id})
    await db.commit()

    logger.info(
        f"Admin {current_admin_user.email} deleted calendar connection {connection_id} "
        f"(user: {connection.user_id}, provider: {connection.provider})"
    )

    data = {
        "success": True,
        "deleted_id": connection_id,
        "user_id": connection.user_id,
        "provider": connection.provider,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/stats")
async def get_calendar_stats(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    db: AsyncSession = Depends(get_async_db),
) -> Dict:
    """Get statistics about calendar connections.

    Available to admin and viewer roles.
    """
    # Get overall stats
    stats_query = """
        SELECT
            COUNT(*) as total_connections,
            COUNT(CASE WHEN status = 'connected' THEN 1 END) as connected_count,
            COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
            COUNT(DISTINCT user_id) as users_with_connections
        FROM user_calendar_connections
    """
    result = await db.execute(text(stats_query))
    stats_row = result.fetchone()

    # Get breakdown by provider
    provider_query = """
        SELECT provider, COUNT(*) as count
        FROM user_calendar_connections
        GROUP BY provider
        ORDER BY count DESC
    """
    provider_result = await db.execute(text(provider_query))
    by_provider = {row.provider: row.count for row in provider_result.fetchall()}

    # Get breakdown by status
    status_query = """
        SELECT status, COUNT(*) as count
        FROM user_calendar_connections
        GROUP BY status
    """
    status_result = await db.execute(text(status_query))
    by_status = {row.status: row.count for row in status_result.fetchall()}

    total = stats_row.total_connections or 0
    users = stats_row.users_with_connections or 0

    data = {
        "total_connections": total,
        "connected_count": stats_row.connected_count or 0,
        "error_count": stats_row.error_count or 0,
        "by_provider": by_provider,
        "by_status": by_status,
        "users_with_connections": users,
        "avg_connections_per_user": round(total / users, 2) if users > 0 else 0,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/providers")
async def get_provider_config_status(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get configuration status for all calendar providers.

    Shows which providers are properly configured in the environment.
    """
    from app.core.config import settings

    providers = {
        "google": {
            "name": "Google Calendar",
            "type": "oauth",
            "configured": bool(
                getattr(settings, "GOOGLE_CLIENT_ID", None) and getattr(settings, "GOOGLE_CLIENT_SECRET", None)
            ),
            "client_id_set": bool(getattr(settings, "GOOGLE_CLIENT_ID", None)),
            "client_secret_set": bool(getattr(settings, "GOOGLE_CLIENT_SECRET", None)),
        },
        "microsoft": {
            "name": "Microsoft Outlook",
            "type": "oauth",
            "configured": bool(
                getattr(settings, "MICROSOFT_CLIENT_ID", None) and getattr(settings, "MICROSOFT_CLIENT_SECRET", None)
            ),
            "client_id_set": bool(getattr(settings, "MICROSOFT_CLIENT_ID", None)),
            "client_secret_set": bool(getattr(settings, "MICROSOFT_CLIENT_SECRET", None)),
        },
        "apple": {
            "name": "Apple iCloud",
            "type": "caldav",
            "configured": True,  # CalDAV doesn't require server config
            "notes": "Users provide their own app-specific passwords",
        },
        "nextcloud": {
            "name": "Nextcloud",
            "type": "caldav",
            "configured": True,  # CalDAV doesn't require server config
            "notes": "Users provide their own server URL and credentials",
        },
        "caldav": {
            "name": "Generic CalDAV",
            "type": "caldav",
            "configured": True,
            "notes": "Users provide their own server URL and credentials",
        },
    }

    # Check encryption key
    encryption_configured = bool(getattr(settings, "CALENDAR_ENCRYPTION_KEY", None))

    data = {
        "providers": providers,
        "encryption_key_configured": encryption_configured,
        "oauth_redirect_uri": getattr(settings, "OAUTH_REDIRECT_URI", None),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)
