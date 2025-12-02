"""Admin Attachments API endpoints.

Provides comprehensive attachment management for the Admin Panel:
- List all attachments across users with filtering
- View attachment details and metadata
- Storage statistics and analytics
- Bulk operations for cleanup
- File type and size analytics

Security: All admin access to attachments is audit logged.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.api_envelope import error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.models.attachment import MessageAttachment
from app.models.message import Message
from app.models.session import Session
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.storage_service import get_storage_service
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/attachments", tags=["admin", "attachments"])


# ============================================================================
# Pydantic Models
# ============================================================================


class AttachmentInfo(BaseModel):
    """Attachment information for admin view."""

    id: str
    message_id: str
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    file_name: str
    file_type: str
    file_size: int
    file_size_formatted: str
    file_url: str
    mime_type: Optional[str] = None
    file_metadata: Optional[Dict[str, Any]] = None
    uploaded_at: str
    created_at: str


class AttachmentStats(BaseModel):
    """Attachment storage statistics."""

    total_attachments: int = 0
    total_storage_bytes: int = 0
    total_storage_formatted: str = "0 B"
    by_file_type: Dict[str, int] = {}
    by_mime_type: Dict[str, int] = {}
    size_by_file_type: Dict[str, int] = {}
    uploads_today: int = 0
    uploads_this_week: int = 0
    uploads_this_month: int = 0
    by_day: List[Dict[str, Any]] = []
    largest_files: List[Dict[str, Any]] = []
    top_uploaders: List[Dict[str, Any]] = []


class BulkDeleteRequest(BaseModel):
    """Request for bulk deletion of attachments."""

    attachment_ids: List[str] = Field(..., min_length=1, max_length=100)
    delete_files: bool = True  # Also delete from storage


class BulkDeleteResult(BaseModel):
    """Result of bulk deletion."""

    deleted_count: int
    failed_count: int
    errors: List[str] = []
    storage_freed_bytes: int = 0
    storage_freed_formatted: str = "0 B"


# ============================================================================
# Helper Functions
# ============================================================================


def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def attachment_to_info(
    attachment: MessageAttachment,
    session: Optional[Session] = None,
    user: Optional[User] = None,
) -> AttachmentInfo:
    """Convert attachment to admin info view."""
    return AttachmentInfo(
        id=str(attachment.id),
        message_id=str(attachment.message_id),
        session_id=str(session.id) if session else None,
        user_id=str(user.id) if user else None,
        user_email=user.email if user else None,
        file_name=attachment.file_name,
        file_type=attachment.file_type,
        file_size=attachment.file_size,
        file_size_formatted=format_file_size(attachment.file_size),
        file_url=attachment.file_url,
        mime_type=attachment.mime_type,
        file_metadata=attachment.file_metadata,
        uploaded_at=attachment.uploaded_at.isoformat() if attachment.uploaded_at else "",
        created_at=attachment.created_at.isoformat() if attachment.created_at else "",
    )


async def log_admin_attachment_access(
    db: DBSession,
    admin_user: User,
    action: str,
    resource_id: Optional[str] = None,
    request: Optional[Request] = None,
    details: Optional[Dict] = None,
) -> None:
    """Log admin attachment access for audit."""
    try:
        await AuditService.log_event(
            db=db,
            action=f"admin_attachment_{action}",
            success=True,
            user=admin_user,
            resource_type="attachment",
            resource_id=resource_id,
            request=request,
            metadata=details,
        )
    except Exception as e:
        logger.error(f"Failed to log attachment access: {e}")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("")
async def list_attachments(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    file_type: Optional[str] = Query(None, description="Filter by file type (pdf, image, etc)"),
    mime_type: Optional[str] = Query(None, description="Filter by MIME type"),
    min_size: Optional[int] = Query(None, description="Minimum file size in bytes"),
    max_size: Optional[int] = Query(None, description="Maximum file size in bytes"),
    uploaded_since: Optional[str] = Query(None, description="Filter by upload date (ISO format)"),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """List all attachments with filtering options.

    Provides comprehensive view of all uploaded files across users.
    """
    try:
        # Build query with joins
        query = (
            db.query(MessageAttachment, Message, Session, User)
            .join(Message, MessageAttachment.message_id == Message.id)
            .outerjoin(Session, Message.session_id == Session.id)
            .outerjoin(User, Session.user_id == User.id)
        )

        # Apply filters
        if user_id:
            try:
                query = query.filter(User.id == UUID(user_id))
            except ValueError:
                return error_response(
                    code="INVALID_USER_ID",
                    message="Invalid user ID format",
                    status_code=400,
                )

        if session_id:
            try:
                query = query.filter(Session.id == UUID(session_id))
            except ValueError:
                return error_response(
                    code="INVALID_SESSION_ID",
                    message="Invalid session ID format",
                    status_code=400,
                )

        if file_type:
            query = query.filter(MessageAttachment.file_type == file_type)

        if mime_type:
            query = query.filter(MessageAttachment.mime_type.ilike(f"%{mime_type}%"))

        if min_size is not None:
            query = query.filter(MessageAttachment.file_size >= min_size)

        if max_size is not None:
            query = query.filter(MessageAttachment.file_size <= max_size)

        if uploaded_since:
            try:
                since_date = datetime.fromisoformat(uploaded_since.replace("Z", "+00:00"))
                query = query.filter(MessageAttachment.uploaded_at >= since_date)
            except ValueError:
                return error_response(
                    code="INVALID_DATE",
                    message="Invalid date format. Use ISO format.",
                    status_code=400,
                )

        # Get total count
        total = query.count()

        # Get paginated results
        results = query.order_by(desc(MessageAttachment.uploaded_at)).offset(offset).limit(limit).all()

        # Convert to info objects
        attachments = [
            attachment_to_info(attachment, session, user).model_dump() for attachment, message, session, user in results
        ]

        # Log access
        await log_admin_attachment_access(
            db=db,
            admin_user=admin_user,
            action="list",
            request=request,
            details={"count": len(attachments), "filters": {"user_id": user_id, "file_type": file_type}},
        )

        return success_response(
            data={
                "attachments": attachments,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Failed to list attachments: {e}")
        return error_response(
            code="LIST_ERROR",
            message="Failed to list attachments",
            status_code=500,
        )


@router.get("/stats")
async def get_attachment_stats(
    days: int = Query(30, ge=1, le=365),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get attachment storage statistics and analytics.

    Returns comprehensive storage metrics without exposing file content.
    """
    try:
        stats = AttachmentStats()

        # Total counts and storage
        totals = db.query(
            func.count(MessageAttachment.id).label("count"),
            func.sum(MessageAttachment.file_size).label("total_size"),
        ).first()

        stats.total_attachments = totals.count or 0
        stats.total_storage_bytes = int(totals.total_size or 0)
        stats.total_storage_formatted = format_file_size(stats.total_storage_bytes)

        # By file type
        type_counts = (
            db.query(
                MessageAttachment.file_type,
                func.count(MessageAttachment.id).label("count"),
                func.sum(MessageAttachment.file_size).label("total_size"),
            )
            .group_by(MessageAttachment.file_type)
            .all()
        )

        stats.by_file_type = {row.file_type: row.count for row in type_counts if row.file_type}
        stats.size_by_file_type = {row.file_type: int(row.total_size or 0) for row in type_counts if row.file_type}

        # By MIME type
        mime_counts = (
            db.query(
                MessageAttachment.mime_type,
                func.count(MessageAttachment.id).label("count"),
            )
            .group_by(MessageAttachment.mime_type)
            .all()
        )

        stats.by_mime_type = {row.mime_type: row.count for row in mime_counts if row.mime_type}

        # Time-based stats
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)

        stats.uploads_today = db.query(MessageAttachment).filter(MessageAttachment.uploaded_at >= today).count()

        stats.uploads_this_week = db.query(MessageAttachment).filter(MessageAttachment.uploaded_at >= week_ago).count()

        stats.uploads_this_month = (
            db.query(MessageAttachment).filter(MessageAttachment.uploaded_at >= month_ago).count()
        )

        # Daily breakdown
        for i in range(days):
            day_start = today - timedelta(days=i)
            day_end = day_start + timedelta(days=1)

            day_stats = (
                db.query(
                    func.count(MessageAttachment.id).label("count"),
                    func.sum(MessageAttachment.file_size).label("total_size"),
                )
                .filter(
                    MessageAttachment.uploaded_at >= day_start,
                    MessageAttachment.uploaded_at < day_end,
                )
                .first()
            )

            stats.by_day.append(
                {
                    "date": day_start.strftime("%Y-%m-%d"),
                    "count": day_stats.count or 0,
                    "total_size": int(day_stats.total_size or 0),
                    "total_size_formatted": format_file_size(int(day_stats.total_size or 0)),
                }
            )

        stats.by_day.sort(key=lambda x: x["date"])

        # Largest files
        largest = db.query(MessageAttachment).order_by(desc(MessageAttachment.file_size)).limit(10).all()

        stats.largest_files = [
            {
                "id": str(a.id),
                "file_name": a.file_name,
                "file_size": a.file_size,
                "file_size_formatted": format_file_size(a.file_size),
                "file_type": a.file_type,
                "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else "",
            }
            for a in largest
        ]

        # Top uploaders (by count)
        top_uploaders_query = (
            db.query(
                User.id,
                User.email,
                func.count(MessageAttachment.id).label("upload_count"),
                func.sum(MessageAttachment.file_size).label("total_size"),
            )
            .join(Session, Session.user_id == User.id)
            .join(Message, Message.session_id == Session.id)
            .join(MessageAttachment, MessageAttachment.message_id == Message.id)
            .group_by(User.id, User.email)
            .order_by(desc(func.count(MessageAttachment.id)))
            .limit(10)
            .all()
        )

        stats.top_uploaders = [
            {
                "user_id": str(row.id),
                "user_email": row.email,
                "upload_count": row.upload_count,
                "total_size": int(row.total_size or 0),
                "total_size_formatted": format_file_size(int(row.total_size or 0)),
            }
            for row in top_uploaders_query
        ]

        return success_response(data=stats.model_dump())

    except Exception as e:
        logger.error(f"Failed to get attachment stats: {e}")
        return error_response(
            code="STATS_ERROR",
            message="Failed to retrieve statistics",
            status_code=500,
        )


@router.get("/{attachment_id}")
async def get_attachment(
    attachment_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get details of a specific attachment."""
    try:
        attachment_uuid = UUID(attachment_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid attachment ID format",
            status_code=400,
        )

    # Query with joins
    result = (
        db.query(MessageAttachment, Message, Session, User)
        .join(Message, MessageAttachment.message_id == Message.id)
        .outerjoin(Session, Message.session_id == Session.id)
        .outerjoin(User, Session.user_id == User.id)
        .filter(MessageAttachment.id == attachment_uuid)
        .first()
    )

    if not result:
        return error_response(
            code="NOT_FOUND",
            message="Attachment not found",
            status_code=404,
        )

    attachment, message, session, user = result
    info = attachment_to_info(attachment, session, user)

    # Log access
    await log_admin_attachment_access(
        db=db,
        admin_user=admin_user,
        action="view",
        resource_id=attachment_id,
        request=request,
    )

    return success_response(data=info.model_dump())


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    delete_file: bool = Query(True, description="Also delete file from storage"),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Delete an attachment.

    Optionally deletes the file from storage as well.
    """
    try:
        attachment_uuid = UUID(attachment_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid attachment ID format",
            status_code=400,
        )

    attachment = db.query(MessageAttachment).filter(MessageAttachment.id == attachment_uuid).first()

    if not attachment:
        return error_response(
            code="NOT_FOUND",
            message="Attachment not found",
            status_code=404,
        )

    file_size = attachment.file_size
    file_url = attachment.file_url

    # Delete from storage if requested
    storage_deleted = False
    if delete_file:
        try:
            storage_service = get_storage_service()
            await storage_service.delete_file(file_url)
            storage_deleted = True
        except Exception as e:
            logger.warning(f"Failed to delete file from storage: {e}")

    # Delete database record
    db.delete(attachment)
    db.commit()

    # Log deletion
    await log_admin_attachment_access(
        db=db,
        admin_user=admin_user,
        action="delete",
        resource_id=attachment_id,
        request=request,
        details={
            "file_size": file_size,
            "storage_deleted": storage_deleted,
        },
    )

    logger.info(f"Attachment {attachment_id} deleted by admin {admin_user.email}")

    return success_response(
        data={
            "deleted": True,
            "attachment_id": attachment_id,
            "storage_deleted": storage_deleted,
            "storage_freed": file_size if storage_deleted else 0,
            "storage_freed_formatted": format_file_size(file_size) if storage_deleted else "0 B",
        },
        message="Attachment deleted successfully",
    )


@router.post("/bulk-delete")
async def bulk_delete_attachments(
    request_body: BulkDeleteRequest,
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Bulk delete multiple attachments.

    Useful for storage cleanup operations.
    """
    result = BulkDeleteResult(
        deleted_count=0,
        failed_count=0,
        errors=[],
        storage_freed_bytes=0,
    )

    storage_service = get_storage_service() if request_body.delete_files else None

    for attachment_id in request_body.attachment_ids:
        try:
            attachment_uuid = UUID(attachment_id)
            attachment = db.query(MessageAttachment).filter(MessageAttachment.id == attachment_uuid).first()

            if not attachment:
                result.failed_count += 1
                result.errors.append(f"Attachment {attachment_id} not found")
                continue

            file_size = attachment.file_size

            # Delete from storage if requested
            if storage_service:
                try:
                    await storage_service.delete_file(attachment.file_url)
                    result.storage_freed_bytes += file_size
                except Exception as e:
                    logger.warning(f"Failed to delete file {attachment_id} from storage: {e}")

            # Delete database record
            db.delete(attachment)
            result.deleted_count += 1

        except ValueError:
            result.failed_count += 1
            result.errors.append(f"Invalid attachment ID: {attachment_id}")
        except Exception as e:
            result.failed_count += 1
            result.errors.append(f"Error deleting {attachment_id}: {str(e)}")

    # Commit all deletions
    db.commit()

    result.storage_freed_formatted = format_file_size(result.storage_freed_bytes)

    # Log bulk deletion
    await log_admin_attachment_access(
        db=db,
        admin_user=admin_user,
        action="bulk_delete",
        request=request,
        details={
            "deleted_count": result.deleted_count,
            "failed_count": result.failed_count,
            "storage_freed": result.storage_freed_bytes,
        },
    )

    logger.info(
        f"Bulk delete by admin {admin_user.email}: " f"{result.deleted_count} deleted, {result.failed_count} failed"
    )

    return success_response(data=result.model_dump())


@router.get("/users/{user_id}/attachments")
async def get_user_attachments(
    user_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get all attachments uploaded by a specific user."""
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

    # Query attachments for this user
    query = (
        db.query(MessageAttachment, Message, Session)
        .join(Message, MessageAttachment.message_id == Message.id)
        .join(Session, Message.session_id == Session.id)
        .filter(Session.user_id == user_uuid)
    )

    total = query.count()

    results = query.order_by(desc(MessageAttachment.uploaded_at)).offset(offset).limit(limit).all()

    attachments = [
        attachment_to_info(attachment, session, user).model_dump() for attachment, message, session in results
    ]

    # Calculate user storage usage
    storage_usage = (
        db.query(func.sum(MessageAttachment.file_size))
        .join(Message, MessageAttachment.message_id == Message.id)
        .join(Session, Message.session_id == Session.id)
        .filter(Session.user_id == user_uuid)
        .scalar()
        or 0
    )

    # Log access
    await log_admin_attachment_access(
        db=db,
        admin_user=admin_user,
        action="list_user_attachments",
        resource_id=user_id,
        request=request,
        details={"attachment_count": len(attachments)},
    )

    return success_response(
        data={
            "user_id": user_id,
            "user_email": user.email,
            "attachments": attachments,
            "total": total,
            "limit": limit,
            "offset": offset,
            "storage_usage_bytes": storage_usage,
            "storage_usage_formatted": format_file_size(storage_usage),
        }
    )


@router.post("/cleanup/orphaned")
async def cleanup_orphaned_attachments(
    dry_run: bool = Query(True, description="Only report what would be deleted"),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Find and optionally delete orphaned attachments.

    Orphaned attachments are those whose parent message no longer exists.
    """
    # Find orphaned attachments (message_id points to non-existent message)
    orphaned = (
        db.query(MessageAttachment)
        .outerjoin(Message, MessageAttachment.message_id == Message.id)
        .filter(Message.id.is_(None))
        .all()
    )

    orphaned_info = [
        {
            "id": str(a.id),
            "file_name": a.file_name,
            "file_size": a.file_size,
            "file_size_formatted": format_file_size(a.file_size),
            "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else "",
        }
        for a in orphaned
    ]

    total_size = sum(a.file_size for a in orphaned)

    if dry_run:
        return success_response(
            data={
                "dry_run": True,
                "orphaned_count": len(orphaned),
                "orphaned_size_bytes": total_size,
                "orphaned_size_formatted": format_file_size(total_size),
                "orphaned_attachments": orphaned_info,
            },
            message=f"Found {len(orphaned)} orphaned attachments. Set dry_run=false to delete.",
        )

    # Actually delete
    storage_service = get_storage_service()
    deleted_count = 0
    storage_freed = 0

    for attachment in orphaned:
        try:
            await storage_service.delete_file(attachment.file_url)
            storage_freed += attachment.file_size
        except Exception as e:
            logger.warning(f"Failed to delete orphaned file: {e}")

        db.delete(attachment)
        deleted_count += 1

    db.commit()

    # Log cleanup
    await log_admin_attachment_access(
        db=db,
        admin_user=admin_user,
        action="cleanup_orphaned",
        request=request,
        details={
            "deleted_count": deleted_count,
            "storage_freed": storage_freed,
        },
    )

    logger.info(f"Orphaned attachment cleanup by {admin_user.email}: {deleted_count} deleted")

    return success_response(
        data={
            "dry_run": False,
            "deleted_count": deleted_count,
            "storage_freed_bytes": storage_freed,
            "storage_freed_formatted": format_file_size(storage_freed),
        },
        message=f"Deleted {deleted_count} orphaned attachments",
    )
