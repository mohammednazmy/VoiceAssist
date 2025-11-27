"""Helper for writing admin audit logs."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User
from app.core.request_id import get_request_id


class AdminAuditLogService:
    """Persist admin-focused audit events."""

    def log_action(
        self,
        db: Session,
        *,
        actor: Optional[User],
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        success: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None,
    ) -> AdminAuditLog:
        request_id = get_request_id(request) if request else None
        ip_address = request.client.host if request and request.client else None

        log_entry = AdminAuditLog(
            actor_id=str(actor.id) if actor else None,
            actor_email=actor.email if actor else None,
            actor_role=actor.admin_role if actor else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            success=success,
            metadata=metadata,
            request_id=request_id,
            ip_address=ip_address,
        )

        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry


admin_audit_log_service = AdminAuditLogService()
