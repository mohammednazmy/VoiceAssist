"""Admin Panel API endpoints (Phase 7).

Provides system summary information for the Admin Panel dashboard.
This is intentionally lightweight and focuses on a simple snapshot
of key metrics for Phase 7.

Future work (later phases) can extend this with richer metrics
sourced from Prometheus, database aggregates, etc.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.api_envelope import success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.models.user import User

router = APIRouter(prefix="/api/admin/panel", tags=["admin", "panel"])


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
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)
