"""Admin Folders API endpoints.

Provides comprehensive folder management for the Admin Panel:
- List all conversation folders across users
- View folder details and hierarchy
- Folder organization statistics
- User folder usage analytics
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.api_envelope import error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.models.folder import ConversationFolder
from app.models.session import Session
from app.models.user import User
from app.services.audit_service import AuditService
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/folders", tags=["admin", "folders"])


# ============================================================================
# Pydantic Models
# ============================================================================


class FolderInfo(BaseModel):
    """Folder information for admin view."""

    id: str
    user_id: str
    user_email: Optional[str] = None
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_folder_id: Optional[str] = None
    parent_folder_name: Optional[str] = None
    created_at: str
    conversation_count: int = 0
    child_folder_count: int = 0


class FolderTreeNode(BaseModel):
    """Folder tree node for hierarchical view."""

    id: str
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    conversation_count: int = 0
    children: List["FolderTreeNode"] = []


class FolderStats(BaseModel):
    """Folder organization statistics."""

    total_folders: int = 0
    total_root_folders: int = 0
    total_nested_folders: int = 0
    max_depth: int = 0
    users_with_folders: int = 0
    users_without_folders: int = 0
    avg_folders_per_user: float = 0.0
    avg_conversations_per_folder: float = 0.0
    folders_by_depth: Dict[int, int] = {}
    by_color: Dict[str, int] = {}
    top_users_by_folders: List[Dict[str, Any]] = []
    empty_folders: int = 0
    folders_created_today: int = 0
    folders_created_this_week: int = 0


class UserFolderSummary(BaseModel):
    """Summary of a user's folder usage."""

    user_id: str
    user_email: str
    folder_count: int = 0
    root_folder_count: int = 0
    max_depth: int = 0
    total_conversations_in_folders: int = 0


# Allow FolderTreeNode to reference itself
FolderTreeNode.model_rebuild()


# ============================================================================
# Helper Functions
# ============================================================================


def folder_to_info(
    folder: ConversationFolder,
    user: Optional[User] = None,
    parent: Optional[ConversationFolder] = None,
    conversation_count: int = 0,
    child_count: int = 0,
) -> FolderInfo:
    """Convert folder to admin info view."""
    return FolderInfo(
        id=str(folder.id),
        user_id=str(folder.user_id),
        user_email=user.email if user else None,
        name=folder.name,
        color=folder.color,
        icon=folder.icon,
        parent_folder_id=(str(folder.parent_folder_id) if folder.parent_folder_id else None),
        parent_folder_name=parent.name if parent else None,
        created_at=folder.created_at.isoformat() if folder.created_at else "",
        conversation_count=conversation_count,
        child_folder_count=child_count,
    )


def get_folder_depth(folder: ConversationFolder, folders_map: Dict[str, ConversationFolder]) -> int:
    """Calculate folder depth in hierarchy."""
    depth = 0
    current = folder
    while current.parent_folder_id:
        depth += 1
        parent_id = str(current.parent_folder_id)
        if parent_id not in folders_map:
            break
        current = folders_map[parent_id]
        if depth > 100:  # Prevent infinite loops
            break
    return depth


async def log_admin_folder_access(
    db: DBSession,
    admin_user: User,
    action: str,
    resource_id: Optional[str] = None,
    request: Optional[Request] = None,
    details: Optional[Dict] = None,
) -> None:
    """Log admin folder access for audit."""
    try:
        await AuditService.log_event(
            db=db,
            action=f"admin_folder_{action}",
            success=True,
            user=admin_user,
            resource_type="folder",
            resource_id=resource_id,
            request=request,
            metadata=details,
        )
    except Exception as e:
        logger.error(f"Failed to log folder access: {e}")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("")
async def list_folders(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    name_search: Optional[str] = Query(None, description="Search by folder name"),
    root_only: bool = Query(False, description="Only show root folders"),
    color: Optional[str] = Query(None, description="Filter by color"),
    created_since: Optional[str] = Query(None, description="Filter by creation date (ISO format)"),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """List all folders with filtering options."""
    try:
        query = db.query(ConversationFolder)

        # Apply filters
        if user_id:
            try:
                query = query.filter(ConversationFolder.user_id == UUID(user_id))
            except ValueError:
                return error_response(
                    code="INVALID_USER_ID",
                    message="Invalid user ID format",
                    status_code=400,
                )

        if name_search:
            query = query.filter(ConversationFolder.name.ilike(f"%{name_search}%"))

        if root_only:
            query = query.filter(ConversationFolder.parent_folder_id.is_(None))

        if color:
            query = query.filter(ConversationFolder.color == color)

        if created_since:
            try:
                since_date = datetime.fromisoformat(created_since.replace("Z", "+00:00"))
                query = query.filter(ConversationFolder.created_at >= since_date)
            except ValueError:
                return error_response(
                    code="INVALID_DATE",
                    message="Invalid date format. Use ISO format.",
                    status_code=400,
                )

        # Get total count
        total = query.count()

        # Get paginated results
        folders = query.order_by(desc(ConversationFolder.created_at)).offset(offset).limit(limit).all()

        # Get user info and counts
        user_ids = list(set(f.user_id for f in folders))
        users = {str(u.id): u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

        # Get parent folders
        parent_ids = [f.parent_folder_id for f in folders if f.parent_folder_id]
        parents = {
            str(p.id): p for p in db.query(ConversationFolder).filter(ConversationFolder.id.in_(parent_ids)).all()
        }

        # Get conversation counts
        folder_ids = [f.id for f in folders]
        conv_counts = dict(
            db.query(Session.folder_id, func.count(Session.id))
            .filter(Session.folder_id.in_(folder_ids))
            .group_by(Session.folder_id)
            .all()
        )

        # Get child folder counts
        child_counts = dict(
            db.query(ConversationFolder.parent_folder_id, func.count(ConversationFolder.id))
            .filter(ConversationFolder.parent_folder_id.in_(folder_ids))
            .group_by(ConversationFolder.parent_folder_id)
            .all()
        )

        # Build response
        folder_list = [
            folder_to_info(
                f,
                users.get(str(f.user_id)),
                parents.get(str(f.parent_folder_id)) if f.parent_folder_id else None,
                conv_counts.get(f.id, 0),
                child_counts.get(f.id, 0),
            ).model_dump()
            for f in folders
        ]

        # Log access
        await log_admin_folder_access(
            db=db,
            admin_user=admin_user,
            action="list",
            request=request,
            details={"count": len(folder_list)},
        )

        return success_response(
            data={
                "folders": folder_list,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        logger.error(f"Failed to list folders: {e}")
        return error_response(
            code="LIST_ERROR",
            message="Failed to list folders",
            status_code=500,
        )


@router.get("/stats")
async def get_folder_stats(
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get folder organization statistics."""
    try:
        stats = FolderStats()

        # Total counts
        stats.total_folders = db.query(ConversationFolder).count()
        stats.total_root_folders = (
            db.query(ConversationFolder).filter(ConversationFolder.parent_folder_id.is_(None)).count()
        )
        stats.total_nested_folders = stats.total_folders - stats.total_root_folders

        # Get all folders for depth calculations
        all_folders = db.query(ConversationFolder).all()
        folders_map = {str(f.id): f for f in all_folders}

        # Calculate depths
        depths = [get_folder_depth(f, folders_map) for f in all_folders]
        stats.max_depth = max(depths) if depths else 0

        # Count by depth
        stats.folders_by_depth = {}
        for depth in depths:
            stats.folders_by_depth[depth] = stats.folders_by_depth.get(depth, 0) + 1

        # User statistics
        total_users = db.query(User).count()
        users_with = db.query(func.count(func.distinct(ConversationFolder.user_id))).scalar() or 0
        stats.users_with_folders = users_with
        stats.users_without_folders = total_users - users_with

        if users_with > 0:
            stats.avg_folders_per_user = round(stats.total_folders / users_with, 2)

        # Conversation counts
        total_conversations_in_folders = db.query(Session).filter(Session.folder_id.isnot(None)).count()
        if stats.total_folders > 0:
            stats.avg_conversations_per_folder = round(total_conversations_in_folders / stats.total_folders, 2)

        # By color
        color_counts = (
            db.query(ConversationFolder.color, func.count(ConversationFolder.id))
            .filter(ConversationFolder.color.isnot(None))
            .group_by(ConversationFolder.color)
            .all()
        )
        stats.by_color = {color: count for color, count in color_counts if color}

        # Top users
        top_users = (
            db.query(
                User.id,
                User.email,
                func.count(ConversationFolder.id).label("folder_count"),
            )
            .join(ConversationFolder, ConversationFolder.user_id == User.id)
            .group_by(User.id, User.email)
            .order_by(desc(func.count(ConversationFolder.id)))
            .limit(10)
            .all()
        )

        stats.top_users_by_folders = [
            {
                "user_id": str(u.id),
                "user_email": u.email,
                "folder_count": u.folder_count,
            }
            for u in top_users
        ]

        # Empty folders (no conversations)
        folders_with_convs = db.query(func.distinct(Session.folder_id)).filter(Session.folder_id.isnot(None)).subquery()
        stats.empty_folders = (
            db.query(ConversationFolder).filter(ConversationFolder.id.notin_(folders_with_convs.select())).count()
        )

        # Time-based stats
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = today - timedelta(days=7)

        stats.folders_created_today = (
            db.query(ConversationFolder).filter(ConversationFolder.created_at >= today).count()
        )

        stats.folders_created_this_week = (
            db.query(ConversationFolder).filter(ConversationFolder.created_at >= week_ago).count()
        )

        return success_response(data=stats.model_dump())

    except Exception as e:
        logger.error(f"Failed to get folder stats: {e}")
        return error_response(
            code="STATS_ERROR",
            message="Failed to retrieve statistics",
            status_code=500,
        )


@router.get("/{folder_id}")
async def get_folder(
    folder_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get details of a specific folder."""
    try:
        folder_uuid = UUID(folder_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid folder ID format",
            status_code=400,
        )

    folder = db.query(ConversationFolder).filter(ConversationFolder.id == folder_uuid).first()

    if not folder:
        return error_response(
            code="NOT_FOUND",
            message="Folder not found",
            status_code=404,
        )

    # Get user info
    user = db.query(User).filter(User.id == folder.user_id).first()

    # Get parent folder
    parent = None
    if folder.parent_folder_id:
        parent = db.query(ConversationFolder).filter(ConversationFolder.id == folder.parent_folder_id).first()

    # Get counts
    conversation_count = db.query(Session).filter(Session.folder_id == folder_uuid).count()
    child_count = db.query(ConversationFolder).filter(ConversationFolder.parent_folder_id == folder_uuid).count()

    # Get children
    children = (
        db.query(ConversationFolder)
        .filter(ConversationFolder.parent_folder_id == folder_uuid)
        .order_by(ConversationFolder.name)
        .all()
    )

    child_list = [
        {
            "id": str(c.id),
            "name": c.name,
            "color": c.color,
            "icon": c.icon,
            "conversation_count": db.query(Session).filter(Session.folder_id == c.id).count(),
        }
        for c in children
    ]

    # Get conversations in this folder
    conversations = (
        db.query(Session).filter(Session.folder_id == folder_uuid).order_by(desc(Session.updated_at)).limit(20).all()
    )

    conv_list = [
        {
            "id": str(s.id),
            "title": s.title,
            "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        }
        for s in conversations
    ]

    info = folder_to_info(folder, user, parent, conversation_count, child_count)

    # Log access
    await log_admin_folder_access(
        db=db,
        admin_user=admin_user,
        action="view",
        resource_id=folder_id,
        request=request,
    )

    return success_response(
        data={
            "folder": info.model_dump(),
            "children": child_list,
            "conversations": conv_list,
            "total_conversations": conversation_count,
        }
    )


@router.get("/users/{user_id}/folders")
async def get_user_folders(
    user_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Get all folders for a specific user with hierarchy."""
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

    # Get all user's folders
    all_folders = (
        db.query(ConversationFolder)
        .filter(ConversationFolder.user_id == user_uuid)
        .order_by(ConversationFolder.name)
        .all()
    )

    # Get conversation counts
    folder_ids = [f.id for f in all_folders]
    conv_counts = dict(
        db.query(Session.folder_id, func.count(Session.id))
        .filter(Session.folder_id.in_(folder_ids))
        .group_by(Session.folder_id)
        .all()
    )

    # Build tree
    folder_map = {}
    for f in all_folders:
        folder_map[str(f.id)] = {
            "id": str(f.id),
            "name": f.name,
            "color": f.color,
            "icon": f.icon,
            "parent_folder_id": str(f.parent_folder_id) if f.parent_folder_id else None,
            "conversation_count": conv_counts.get(f.id, 0),
            "created_at": f.created_at.isoformat() if f.created_at else "",
            "children": [],
        }

    # Build hierarchy
    root_folders = []
    for folder in folder_map.values():
        if folder["parent_folder_id"]:
            parent = folder_map.get(folder["parent_folder_id"])
            if parent:
                parent["children"].append(folder)
        else:
            root_folders.append(folder)

    # Calculate summary
    folders_map = {str(f.id): f for f in all_folders}
    depths = [get_folder_depth(f, folders_map) for f in all_folders]
    max_depth = max(depths) if depths else 0

    total_convs = sum(conv_counts.values())

    summary = UserFolderSummary(
        user_id=str(user.id),
        user_email=user.email,
        folder_count=len(all_folders),
        root_folder_count=len(root_folders),
        max_depth=max_depth,
        total_conversations_in_folders=total_convs,
    )

    # Log access
    await log_admin_folder_access(
        db=db,
        admin_user=admin_user,
        action="list_user_folders",
        resource_id=user_id,
        request=request,
        details={"folder_count": len(all_folders)},
    )

    return success_response(
        data={
            "summary": summary.model_dump(),
            "folder_tree": root_folders,
            "total_folders": len(all_folders),
        }
    )


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    recursive: bool = Query(False, description="Delete child folders recursively"),
    admin_user: User = Depends(get_current_admin_user),
    db: DBSession = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """Delete a folder.

    By default, child folders and conversations are orphaned.
    Set recursive=true to delete child folders as well.
    """
    try:
        folder_uuid = UUID(folder_id)
    except ValueError:
        return error_response(
            code="INVALID_ID",
            message="Invalid folder ID format",
            status_code=400,
        )

    folder = db.query(ConversationFolder).filter(ConversationFolder.id == folder_uuid).first()

    if not folder:
        return error_response(
            code="NOT_FOUND",
            message="Folder not found",
            status_code=404,
        )

    deleted_count = 0
    orphaned_conversations = 0

    if recursive:
        # Recursively delete child folders
        def delete_recursive(folder_id: UUID) -> int:
            count = 0
            children = db.query(ConversationFolder).filter(ConversationFolder.parent_folder_id == folder_id).all()

            for child in children:
                count += delete_recursive(child.id)
                db.delete(child)
                count += 1

            return count

        deleted_count = delete_recursive(folder_uuid)

    # Count conversations that will be orphaned
    orphaned_conversations = db.query(Session).filter(Session.folder_id == folder_uuid).count()

    # Delete the folder (sessions will be orphaned due to SET NULL)
    db.delete(folder)
    db.commit()
    deleted_count += 1

    # Log deletion
    await log_admin_folder_access(
        db=db,
        admin_user=admin_user,
        action="delete",
        resource_id=folder_id,
        request=request,
        details={
            "recursive": recursive,
            "deleted_count": deleted_count,
            "orphaned_conversations": orphaned_conversations,
        },
    )

    logger.info(f"Folder {folder_id} deleted by admin {admin_user.email}")

    return success_response(
        data={
            "deleted": True,
            "folder_id": folder_id,
            "deleted_count": deleted_count,
            "orphaned_conversations": orphaned_conversations,
        },
        message=f"Folder deleted successfully. {orphaned_conversations} conversations orphaned.",
    )
