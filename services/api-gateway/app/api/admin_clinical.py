"""Admin Clinical Context API endpoints.

Provides comprehensive clinical context management for the Admin Panel:
- List all clinical contexts with PHI masking options
- View individual context details with audit trail
- PHI access audit log for HIPAA compliance
- Clinical context statistics and analytics

HIPAA Compliance: All access to clinical contexts is audit logged.
PHI data is masked by default unless explicitly unmasked with audit trail.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.api_envelope import error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.models.audit_log import AuditLog
from app.models.clinical_context import ClinicalContext
from app.models.user import User
from app.services.audit_service import AuditService
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/clinical", tags=["admin", "clinical"])


# ============================================================================
# Pydantic Models
# ============================================================================


class ClinicalContextSummary(BaseModel):
    """Summary of a clinical context for list view (PHI masked by default)."""

    id: str
    user_id: str
    user_email: Optional[str] = None
    session_id: Optional[str] = None
    has_demographics: bool = False
    has_chief_complaint: bool = False
    has_problems: bool = False
    has_medications: bool = False
    has_allergies: bool = False
    has_vitals: bool = False
    last_updated: str
    created_at: str


class ClinicalContextDetail(BaseModel):
    """Detailed clinical context (PHI included when authorized)."""

    id: str
    user_id: str
    user_email: Optional[str] = None
    session_id: Optional[str] = None

    # Demographics (masked or actual)
    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None

    # Clinical data (masked or actual)
    chief_complaint: Optional[str] = None
    problems: List[str] = []
    medications: List[str] = []
    allergies: List[str] = []
    vitals: dict = {}

    # Metadata
    last_updated: str
    created_at: str

    # Audit info
    access_logged: bool = True
    phi_masked: bool = True


class ClinicalContextStats(BaseModel):
    """Clinical context statistics."""

    total_contexts: int = 0
    contexts_with_demographics: int = 0
    contexts_with_chief_complaint: int = 0
    contexts_with_problems: int = 0
    contexts_with_medications: int = 0
    contexts_with_allergies: int = 0
    contexts_with_vitals: int = 0
    active_today: int = 0
    active_this_week: int = 0
    by_day: List[Dict[str, Any]] = []


class ClinicalAuditEntry(BaseModel):
    """PHI access audit log entry."""

    id: str
    timestamp: str
    admin_email: Optional[str] = None
    action: str
    resource_id: Optional[str] = None
    phi_accessed: bool = False
    ip_address: Optional[str] = None
    details: Dict[str, Any] = {}


# ============================================================================
# Helper Functions
# ============================================================================


def mask_phi_value(value: Any, phi_type: str = "text") -> Any:
    """Mask PHI value for display."""
    if value is None:
        return None

    if phi_type == "text" and isinstance(value, str):
        if len(value) <= 4:
            return "***"
        return value[:2] + "***" + value[-2:]

    if phi_type == "number":
        return "***"

    if phi_type == "list" and isinstance(value, list):
        return [f"[{i + 1}] ***" for i in range(len(value))]

    if phi_type == "dict" and isinstance(value, dict):
        return {k: "***" for k in value.keys()}

    return "***"


def context_to_summary(context: ClinicalContext, user: Optional[User] = None) -> ClinicalContextSummary:
    """Convert clinical context to summary (no PHI exposed)."""
    return ClinicalContextSummary(
        id=str(context.id),
        user_id=str(context.user_id),
        user_email=user.email if user else None,
        session_id=str(context.session_id) if context.session_id else None,
        has_demographics=bool(context.age or context.gender or context.weight_kg or context.height_cm),
        has_chief_complaint=bool(context.chief_complaint),
        has_problems=bool(context.problems and len(context.problems) > 0),
        has_medications=bool(context.medications and len(context.medications) > 0),
        has_allergies=bool(context.allergies and len(context.allergies) > 0),
        has_vitals=bool(context.vitals and len(context.vitals) > 0),
        last_updated=context.last_updated.isoformat() if context.last_updated else "",
        created_at=context.created_at.isoformat() if context.created_at else "",
    )


def context_to_detail(
    context: ClinicalContext,
    user: Optional[User] = None,
    mask_phi: bool = True,
) -> ClinicalContextDetail:
    """Convert clinical context to detail view with optional PHI masking."""
    if mask_phi:
        return ClinicalContextDetail(
            id=str(context.id),
            user_id=str(context.user_id),
            user_email=user.email if user else None,
            session_id=str(context.session_id) if context.session_id else None,
            age=mask_phi_value(context.age, "number") if context.age else None,
            gender=mask_phi_value(context.gender) if context.gender else None,
            weight_kg=mask_phi_value(context.weight_kg, "number") if context.weight_kg else None,
            height_cm=mask_phi_value(context.height_cm, "number") if context.height_cm else None,
            chief_complaint=mask_phi_value(context.chief_complaint) if context.chief_complaint else None,
            problems=mask_phi_value(context.problems or [], "list"),
            medications=mask_phi_value(context.medications or [], "list"),
            allergies=mask_phi_value(context.allergies or [], "list"),
            vitals=mask_phi_value(context.vitals or {}, "dict"),
            last_updated=context.last_updated.isoformat() if context.last_updated else "",
            created_at=context.created_at.isoformat() if context.created_at else "",
            phi_masked=True,
        )
    else:
        return ClinicalContextDetail(
            id=str(context.id),
            user_id=str(context.user_id),
            user_email=user.email if user else None,
            session_id=str(context.session_id) if context.session_id else None,
            age=context.age,
            gender=context.gender,
            weight_kg=float(context.weight_kg) if context.weight_kg else None,
            height_cm=float(context.height_cm) if context.height_cm else None,
            chief_complaint=context.chief_complaint,
            problems=context.problems or [],
            medications=context.medications or [],
            allergies=context.allergies or [],
            vitals=context.vitals or {},
            last_updated=context.last_updated.isoformat() if context.last_updated else "",
            created_at=context.created_at.isoformat() if context.created_at else "",
            phi_masked=False,
        )


async def log_clinical_access(
    db: Session,
    admin_user: User,
    action: str,
    resource_id: Optional[str] = None,
    phi_accessed: bool = False,
    request: Optional[Request] = None,
    details: Optional[Dict] = None,
) -> None:
    """Log clinical context access for HIPAA compliance."""
    try:
        await AuditService.log_event(
            db=db,
            action=f"clinical_{action}",
            success=True,
            user=admin_user,
            resource_type="clinical_context",
            resource_id=resource_id,
            request=request,
            metadata={
                "phi_accessed": phi_accessed,
                **(details or {}),
            },
        )
    except Exception as e:
        logger.error(f"Failed to log clinical access: {e}")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/contexts")
async def list_clinical_contexts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    has_chief_complaint: Optional[bool] = Query(None, description="Filter by chief complaint presence"),
    updated_since: Optional[str] = Query(None, description="Filter by last updated date (ISO format)"),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """List all clinical contexts with PHI masked.

    Returns summary information about clinical contexts without exposing PHI.
    Use the detail endpoint with explicit PHI access to view full data.
    """
    try:
        query = db.query(ClinicalContext)

        # Apply filters
        if user_id:
            try:
                query = query.filter(ClinicalContext.user_id == UUID(user_id))
            except ValueError:
                return error_response(
                    code="INVALID_USER_ID",
                    message="Invalid user ID format",
                    status_code=400,
                )

        if has_chief_complaint is not None:
            if has_chief_complaint:
                query = query.filter(ClinicalContext.chief_complaint.isnot(None))
            else:
                query = query.filter(ClinicalContext.chief_complaint.is_(None))

        if updated_since:
            try:
                since_date = datetime.fromisoformat(updated_since.replace("Z", "+00:00"))
                query = query.filter(ClinicalContext.last_updated >= since_date)
            except ValueError:
                return error_response(
                    code="INVALID_DATE",
                    message="Invalid date format. Use ISO format.",
                    status_code=400,
                )

        # Get total count
        total = query.count()

        # Get paginated results with user info
        contexts = query.order_by(desc(ClinicalContext.last_updated)).offset(offset).limit(limit).all()

        # Get user info for each context
        user_ids = [c.user_id for c in contexts]
        users = {str(u.id): u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

        # Convert to summaries
        summaries = [context_to_summary(c, users.get(str(c.user_id))).model_dump() for c in contexts]

        # Log access
        await log_clinical_access(
            db=db,
            admin_user=admin_user,
            action="list",
            request=request,
            details={"count": len(summaries), "filters": {"user_id": user_id}},
        )

        return success_response(
            data={
                "contexts": summaries,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Failed to list clinical contexts: {e}")
        return error_response(
            code="LIST_ERROR",
            message="Failed to list clinical contexts",
            status_code=500,
        )


@router.get("/contexts/{context_id}")
async def get_clinical_context(
    context_id: str,
    include_phi: bool = Query(False, description="Include PHI data (logged for audit)"),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get details of a specific clinical context.

    By default, PHI is masked. Set include_phi=true to view actual PHI values.
    All PHI access is logged for HIPAA compliance.
    """
    try:
        context_uuid = UUID(context_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid context ID format",
            status_code=400,
        )

    context = db.query(ClinicalContext).filter(ClinicalContext.id == context_uuid).first()

    if not context:
        return error_response(
            code="NOT_FOUND",
            message="Clinical context not found",
            status_code=404,
        )

    # Get user info
    user = db.query(User).filter(User.id == context.user_id).first()

    # Convert to detail view
    detail = context_to_detail(context, user, mask_phi=not include_phi)

    # Log access (PHI access is specifically noted)
    await log_clinical_access(
        db=db,
        admin_user=admin_user,
        action="view",
        resource_id=context_id,
        phi_accessed=include_phi,
        request=request,
        details={"phi_requested": include_phi},
    )

    # Get access history for this context
    access_history = (
        db.query(AuditLog)
        .filter(
            AuditLog.action.like("clinical_%"),
            AuditLog.resource_id == context_id,
        )
        .order_by(desc(AuditLog.timestamp))
        .limit(10)
        .all()
    )

    history_entries = [
        {
            "timestamp": log.timestamp.isoformat() if log.timestamp else "",
            "admin_email": log.user_email,
            "action": log.action,
            "phi_accessed": (log.additional_data or {}).get("phi_accessed", False),
        }
        for log in access_history
    ]

    return success_response(
        data={
            "context": detail.model_dump(),
            "access_history": history_entries,
        }
    )


@router.get("/audit")
async def get_clinical_audit_log(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    phi_only: bool = Query(False, description="Only show PHI access events"),
    admin_id: Optional[str] = Query(None, description="Filter by admin user ID"),
    since: Optional[str] = Query(None, description="Filter by date (ISO format)"),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get clinical context PHI access audit log.

    Returns all admin access to clinical contexts for HIPAA compliance reporting.
    """
    try:
        query = db.query(AuditLog).filter(AuditLog.action.like("clinical_%"))

        # Apply filters
        if phi_only:
            # Filter for PHI access using JSON query
            query = query.filter(func.json_extract(AuditLog.additional_data, "$.phi_accessed") == True)  # noqa: E712

        if admin_id:
            try:
                query = query.filter(AuditLog.user_id == admin_id)
            except ValueError:
                pass

        if since:
            try:
                since_date = datetime.fromisoformat(since.replace("Z", "+00:00"))
                query = query.filter(AuditLog.timestamp >= since_date)
            except ValueError:
                return error_response(
                    code="INVALID_DATE",
                    message="Invalid date format. Use ISO format.",
                    status_code=400,
                )

        total = query.count()

        logs = query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit).all()

        entries = [
            ClinicalAuditEntry(
                id=str(log.id),
                timestamp=log.timestamp.isoformat() if log.timestamp else "",
                admin_email=log.user_email,
                action=log.action,
                resource_id=log.resource_id,
                phi_accessed=(log.additional_data or {}).get("phi_accessed", False),
                ip_address=log.ip_address,
                details=log.additional_data or {},
            ).model_dump()
            for log in logs
        ]

        return success_response(
            data={
                "audit_entries": entries,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Failed to get clinical audit log: {e}")
        return error_response(
            code="AUDIT_ERROR",
            message="Failed to retrieve audit log",
            status_code=500,
        )


@router.get("/stats")
async def get_clinical_stats(
    days: int = Query(7, ge=1, le=90),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get clinical context statistics and analytics.

    Returns aggregate statistics without exposing any PHI.
    """
    try:
        stats = ClinicalContextStats()

        # Total counts
        stats.total_contexts = db.query(ClinicalContext).count()

        stats.contexts_with_demographics = (
            db.query(ClinicalContext)
            .filter(
                (ClinicalContext.age.isnot(None))
                | (ClinicalContext.gender.isnot(None))
                | (ClinicalContext.weight_kg.isnot(None))
                | (ClinicalContext.height_cm.isnot(None))
            )
            .count()
        )

        stats.contexts_with_chief_complaint = (
            db.query(ClinicalContext).filter(ClinicalContext.chief_complaint.isnot(None)).count()
        )

        # For JSONB fields, check for non-empty arrays
        stats.contexts_with_problems = (
            db.query(ClinicalContext)
            .filter(
                ClinicalContext.problems.isnot(None),
                func.jsonb_array_length(ClinicalContext.problems) > 0,
            )
            .count()
        )

        stats.contexts_with_medications = (
            db.query(ClinicalContext)
            .filter(
                ClinicalContext.medications.isnot(None),
                func.jsonb_array_length(ClinicalContext.medications) > 0,
            )
            .count()
        )

        stats.contexts_with_allergies = (
            db.query(ClinicalContext)
            .filter(
                ClinicalContext.allergies.isnot(None),
                func.jsonb_array_length(ClinicalContext.allergies) > 0,
            )
            .count()
        )

        stats.contexts_with_vitals = db.query(ClinicalContext).filter(ClinicalContext.vitals.isnot(None)).count()

        # Activity stats
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = today - timedelta(days=7)

        stats.active_today = db.query(ClinicalContext).filter(ClinicalContext.last_updated >= today).count()

        stats.active_this_week = db.query(ClinicalContext).filter(ClinicalContext.last_updated >= week_ago).count()

        # Daily breakdown
        for i in range(days):
            day_start = today - timedelta(days=i)
            day_end = day_start + timedelta(days=1)

            count = (
                db.query(ClinicalContext)
                .filter(
                    ClinicalContext.last_updated >= day_start,
                    ClinicalContext.last_updated < day_end,
                )
                .count()
            )

            stats.by_day.append(
                {
                    "date": day_start.strftime("%Y-%m-%d"),
                    "count": count,
                }
            )

        # Sort chronologically
        stats.by_day.sort(key=lambda x: x["date"])

        return success_response(data=stats.model_dump())

    except Exception as e:
        logger.error(f"Failed to get clinical stats: {e}")
        return error_response(
            code="STATS_ERROR",
            message="Failed to retrieve statistics",
            status_code=500,
        )


@router.delete("/contexts/{context_id}")
async def delete_clinical_context(
    context_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Delete a clinical context.

    This action is logged and should only be used for data cleanup or user requests.
    """
    try:
        context_uuid = UUID(context_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid context ID format",
            status_code=400,
        )

    context = db.query(ClinicalContext).filter(ClinicalContext.id == context_uuid).first()

    if not context:
        return error_response(
            code="NOT_FOUND",
            message="Clinical context not found",
            status_code=404,
        )

    user_id = str(context.user_id)

    # Delete the context
    db.delete(context)
    db.commit()

    # Log the deletion
    await log_clinical_access(
        db=db,
        admin_user=admin_user,
        action="delete",
        resource_id=context_id,
        phi_accessed=False,  # Deletion doesn't access PHI content
        request=request,
        details={"user_id": user_id},
    )

    logger.info(f"Clinical context {context_id} deleted by admin {admin_user.email}")

    return success_response(
        data={"deleted": True, "context_id": context_id},
        message="Clinical context deleted successfully",
    )


@router.get("/users/{user_id}/contexts")
async def get_user_clinical_contexts(
    user_id: str,
    include_phi: bool = Query(False, description="Include PHI data (logged for audit)"),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get all clinical contexts for a specific user.

    Useful for user data export or account management.
    """
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid user ID format",
            status_code=400,
        )

    # Verify user exists
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        return error_response(
            code="USER_NOT_FOUND",
            message="User not found",
            status_code=404,
        )

    # Get all contexts for user
    contexts = (
        db.query(ClinicalContext)
        .filter(ClinicalContext.user_id == user_uuid)
        .order_by(desc(ClinicalContext.last_updated))
        .all()
    )

    # Convert to appropriate format
    if include_phi:
        results = [context_to_detail(c, user, mask_phi=False).model_dump() for c in contexts]
    else:
        results = [context_to_summary(c, user).model_dump() for c in contexts]

    # Log access
    await log_clinical_access(
        db=db,
        admin_user=admin_user,
        action="list_user_contexts",
        resource_id=user_id,
        phi_accessed=include_phi,
        request=request,
        details={"context_count": len(results)},
    )

    return success_response(
        data={
            "user_id": user_id,
            "user_email": user.email,
            "contexts": results,
            "total": len(results),
            "phi_included": include_phi,
        }
    )
