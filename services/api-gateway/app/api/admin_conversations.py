"""Admin Conversation Management API endpoints.

Provides admin-level access to view and manage all user conversations
for compliance, support, and operational purposes.
"""

from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.api.admin.utils import log_audit_event
from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db, transaction
from app.core.dependencies import get_current_admin_or_viewer, get_current_admin_user
from app.models.attachment import MessageAttachment
from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.voice_document_session import VoiceDocumentSession
from app.models.document import Document
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, and_, String, cast
from sqlalchemy.orm import Session, joinedload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/conversations", tags=["admin", "conversations"])


# ============================================================================
# Response Schemas
# ============================================================================


class ConversationAdminResponse(BaseModel):
    """Admin view of a conversation."""

    id: str
    user_id: str
    user_email: str
    user_name: Optional[str] = None
    title: str
    archived: bool
    folder_id: Optional[str] = None
    message_count: int
    branch_count: int
    has_attachments: bool
    created_at: str
    updated_at: str
    last_message_at: Optional[str] = None
    phi_mode: Optional[str] = Field(
        default=None, description="Conversation PHI mode (clinical or demo)"
    )
    tags: List[str] = Field(default_factory=list, description="Conversation tags")
    active_document_id: Optional[str] = Field(
        default=None, description="Currently active document ID for this conversation (voice mode)"
    )
    active_document_title: Optional[str] = Field(
        default=None, description="Title of currently active document (if any)"
    )
    active_document_page: Optional[int] = Field(
        default=None, description="Current page in active document (if any)"
    )


class MessageAdminResponse(BaseModel):
    """Admin view of a message."""

    id: str
    session_id: str
    role: str
    content: str
    branch_id: Optional[str] = None
    parent_message_id: Optional[str] = None
    tool_calls: Optional[Dict] = None
    tool_results: Optional[Dict] = None
    contains_phi: bool = False
    tokens: Optional[int] = None
    model: Optional[str] = None
    created_at: str
    attachments: List[Dict] = Field(default_factory=list)


class ConversationDetailResponse(BaseModel):
    """Detailed conversation with messages."""

    conversation: ConversationAdminResponse
    messages: List[MessageAdminResponse]
    total_messages: int


class ExportRequest(BaseModel):
    """Request for exporting conversation."""

    format: str = Field(default="json", pattern="^(json|markdown|csv)$")
    include_metadata: bool = True


# ============================================================================
# List All Conversations (Across Users)
# ============================================================================


@router.get("")
async def list_admin_conversations(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    search: Optional[str] = Query(None, description="Search in title or content"),
    title_search: Optional[str] = Query(
        None, description="Alias for search - search in title (for frontend compatibility)"
    ),
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    has_phi: Optional[bool] = Query(None, description="Filter conversations containing PHI"),
    phi_mode: Optional[str] = Query(
        None,
        description="Filter by conversation PHI mode ('clinical' or 'demo')",
    ),
    has_active_doc: Optional[str] = Query(
        None,
        description="Filter by whether conversation has an active voice document session ('yes' or 'no')",
    ),
    start_date: Optional[str] = Query(None, description="Filter by start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (ISO 8601)"),
) -> Dict:
    """
    List all conversations across all users with filtering and pagination.

    Admin users can view all conversations for compliance and support purposes.
    """
    try:
        # Base query with user join for email
        query = (
            db.query(
                ChatSession,
                func.count(Message.id).label("message_count"),
                func.count(func.distinct(Message.branch_id)).label("branch_count"),
                func.max(Message.created_at).label("last_message_at"),
                func.bool_or(Message.contains_phi).label("has_phi"),
                User.email.label("user_email"),
                User.full_name.label("user_name"),
                func.max(Document.document_id).label("active_document_id"),
                func.max(Document.title).label("active_document_title"),
                func.max(VoiceDocumentSession.current_page).label("active_document_page"),
            )
            .join(User, User.id == ChatSession.user_id)
            .outerjoin(Message, Message.session_id == ChatSession.id)
            .outerjoin(
                VoiceDocumentSession,
                and_(
                    VoiceDocumentSession.conversation_id == cast(ChatSession.id, String),
                    VoiceDocumentSession.is_active == True,  # noqa: E712
                ),
            )
            .outerjoin(Document, Document.document_id == VoiceDocumentSession.document_id)
            .group_by(
                ChatSession.id,
                User.email,
                User.full_name,
            )
        )

        # Apply filters
        if user_id:
            try:
                user_uuid = uuid.UUID(user_id)
                query = query.filter(ChatSession.user_id == user_uuid)
            except ValueError:
                return error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="Invalid user_id format",
                    trace_id=getattr(request.state, "trace_id", None),
                )

        # Support both 'search' and 'title_search' parameters (frontend compatibility)
        effective_search = search or title_search
        if effective_search:
            search_term = f"%{effective_search}%"
            query = query.filter(
                or_(
                    ChatSession.title.ilike(search_term),
                    User.email.ilike(search_term),
                )
            )

        if archived is not None:
            query = query.filter(ChatSession.archived == (1 if archived else 0))

        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                query = query.filter(ChatSession.created_at >= start_dt)
            except ValueError:
                pass

        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                query = query.filter(ChatSession.created_at <= end_dt)
            except ValueError:
                pass

        # Apply PHI mode filter after base query
        if phi_mode:
            mode_val = phi_mode.lower()
            if mode_val in {"clinical", "demo"}:
                query = query.filter(
                    ChatSession.context.op("->>")("phi_mode") == mode_val  # type: ignore[attr-defined]
                )

        # Get total count (before pagination)
        total_query = query.with_entities(func.count(func.distinct(ChatSession.id)))
        total = total_query.scalar() or 0

        # Apply has_active_doc filter AFTER joins, using aggregated Document info
        if has_active_doc in {"yes", "no"}:
            # We treat conversations with a non-null active_document_id as "yes"
            if has_active_doc == "yes":
                query = query.having(func.max(Document.document_id).isnot(None))
            else:
                query = query.having(func.max(Document.document_id).is_(None))

        # Apply ordering and pagination
        results = query.order_by(desc(ChatSession.updated_at)).offset(offset).limit(limit).all()

        # Check for attachments in a separate query
        session_ids = [r[0].id for r in results]
        attachments_query = (
            db.query(Message.session_id)
            .join(MessageAttachment, MessageAttachment.message_id == Message.id)
            .filter(Message.session_id.in_(session_ids))
            .distinct()
        )
        sessions_with_attachments = {r[0] for r in attachments_query.all()}

        # Build response
        conversations = []
        for row in results:
            session = row[0]
            message_count = row[1] or 0
            branch_count = row[2] or 1
            last_message_at = row[3]
            session_has_phi = row[4] or False
            user_email = row[5]
            user_name = row[6]
            active_document_id = row[7]
            active_document_title = row[8]
            active_document_page = row[9]

            context = session.context or {}
            phi_mode = context.get("phi_mode")
            tags = context.get("tags") or []

            # Apply PHI filter if specified
            if has_phi is not None and session_has_phi != has_phi:
                continue

            conversations.append(
                ConversationAdminResponse(
                    id=str(session.id),
                    user_id=str(session.user_id),
                    user_email=user_email,
                    user_name=user_name,
                    title=session.title or "Untitled Conversation",
                    archived=bool(session.archived),
                    folder_id=str(session.folder_id) if session.folder_id else None,
                    message_count=message_count,
                    branch_count=branch_count,
                    has_attachments=session.id in sessions_with_attachments,
                    created_at=(session.created_at.isoformat() + "Z" if session.created_at else ""),
                    updated_at=(session.updated_at.isoformat() + "Z" if session.updated_at else ""),
                    last_message_at=(last_message_at.isoformat() + "Z" if last_message_at else None),
                    phi_mode=phi_mode,
                    tags=tags,
                    active_document_id=active_document_id,
                    active_document_title=active_document_title,
                    active_document_page=active_document_page,
                ).model_dump()
            )

        trace_id = getattr(request.state, "trace_id", None)
        return success_response(
            {
                "conversations": conversations,
                "total": total,
                "offset": offset,
                "limit": limit,
            },
            trace_id=trace_id,
        )

    except Exception as e:
        logger.exception("Error listing admin conversations")
        return error_response(
            error_code=ErrorCodes.INTERNAL_ERROR,
            message=str(e),
            trace_id=getattr(request.state, "trace_id", None),
        )


# ============================================================================
# Get Conversation Detail
# ============================================================================


@router.get("/{conversation_id}")
async def get_admin_conversation(
    conversation_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """
    Get detailed view of a specific conversation including all messages.

    Admin users can view any conversation for compliance and support purposes.
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        return error_response(
            error_code=ErrorCodes.VALIDATION_ERROR,
            message="Invalid conversation ID format",
            trace_id=getattr(request.state, "trace_id", None),
        )

    # Get conversation with user info
    result = (
        db.query(ChatSession, User.email, User.full_name)
        .join(User, User.id == ChatSession.user_id)
        .filter(ChatSession.id == conv_uuid)
        .first()
    )

    if not result:
        return error_response(
            error_code=ErrorCodes.NOT_FOUND,
            message="Conversation not found",
            trace_id=getattr(request.state, "trace_id", None),
        )

    session, user_email, user_name = result

    # Get all messages with attachments
    messages = (
        db.query(Message)
        .options(joinedload(Message.attachments))
        .filter(Message.session_id == conv_uuid)
        .order_by(Message.created_at)
        .all()
    )

    # Count branches and check for attachments
    branch_ids = set()
    has_attachments = False
    has_phi = False

    message_responses = []
    for msg in messages:
        if msg.branch_id:
            branch_ids.add(msg.branch_id)
        if msg.attachments:
            has_attachments = True
        if msg.contains_phi:
            has_phi = True

        attachments = []
        for att in msg.attachments:
            attachments.append(
                {
                    "id": str(att.id),
                    "file_name": att.file_name,
                    "file_type": att.file_type,
                    "file_size": att.file_size,
                }
            )

        message_responses.append(
            MessageAdminResponse(
                id=str(msg.id),
                session_id=str(msg.session_id),
                role=msg.role,
                content=msg.content,
                branch_id=msg.branch_id,
                parent_message_id=(str(msg.parent_message_id) if msg.parent_message_id else None),
                tool_calls=msg.tool_calls,
                tool_results=msg.tool_results,
                contains_phi=msg.contains_phi,
                tokens=msg.tokens,
                model=msg.model,
                created_at=msg.created_at.isoformat() + "Z" if msg.created_at else "",
                attachments=attachments,
            ).model_dump()
        )

    context = session.context or {}
    phi_mode = context.get("phi_mode")
    tags = context.get("tags") or []

    conversation = ConversationAdminResponse(
        id=str(session.id),
        user_id=str(session.user_id),
        user_email=user_email,
        user_name=user_name,
        title=session.title or "Untitled Conversation",
        archived=bool(session.archived),
        folder_id=str(session.folder_id) if session.folder_id else None,
        message_count=len(messages),
        branch_count=max(1, len(branch_ids)),
        has_attachments=has_attachments,
        created_at=session.created_at.isoformat() + "Z" if session.created_at else "",
        updated_at=session.updated_at.isoformat() + "Z" if session.updated_at else "",
        last_message_at=messages[-1].created_at.isoformat() + "Z" if messages else None,
        phi_mode=phi_mode,
        tags=tags,
    )

    # Log audit event for viewing conversation
    await log_audit_event(
        db=db,
        admin_user=current_admin,
        action="view_conversation",
        resource_type="conversation",
        resource_id=conversation_id,
        details={"user_email": user_email, "contains_phi": has_phi},
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        {
            "conversation": conversation.model_dump(),
            "messages": message_responses,
            "total_messages": len(messages),
        },
        trace_id=trace_id,
    )


@router.patch("/{conversation_id}/metadata")
async def update_admin_conversation_metadata(
    conversation_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> Dict:
    """
    Update conversation-level metadata (phi_mode, tags) as an admin.

    This is a minimal admin-only endpoint used by tooling to adjust PHI mode
    and tags for compliance and workflow organization. It does not expose or
    modify message content.
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        return error_response(
            error_code=ErrorCodes.VALIDATION_ERROR,
            message="Invalid conversation ID format",
            trace_id=getattr(request.state, "trace_id", None),
        )

    session = db.query(ChatSession).filter(ChatSession.id == conv_uuid).first()
    if not session:
        return error_response(
            error_code=ErrorCodes.NOT_FOUND,
            message="Conversation not found",
            trace_id=getattr(request.state, "trace_id", None),
        )

    body = await request.json()
    phi_mode = body.get("phi_mode")
    tags = body.get("tags")

    ctx = dict(session.context or {})

    if phi_mode is not None:
        if phi_mode == "":
            ctx.pop("phi_mode", None)
        else:
            mode_val = str(phi_mode).lower()
            if mode_val not in {"clinical", "demo"}:
                return error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="phi_mode must be 'clinical' or 'demo' when provided",
                    trace_id=getattr(request.state, "trace_id", None),
                )
            ctx["phi_mode"] = mode_val

    if tags is not None:
        if not isinstance(tags, list):
          return error_response(
              error_code=ErrorCodes.VALIDATION_ERROR,
              message="tags must be an array of strings when provided",
              trace_id=getattr(request.state, "trace_id", None),
          )
        normalized = sorted(
            {str(t).strip() for t in tags if str(t).strip()}
        )
        ctx["tags"] = normalized

    session.context = ctx

    # Explicitly mark session as modified to ensure JSONB changes are persisted
    db.add(session)
    with transaction(db):
        logger.info(
            "Admin updated conversation metadata for %s: phi_mode=%s, tags=%s",
            conversation_id,
            ctx.get("phi_mode"),
            ctx.get("tags", []),
        )

    await log_audit_event(
        db=db,
        admin_user=current_admin,
        action="update_conversation_metadata",
        resource_type="conversation",
        resource_id=conversation_id,
        details={"phi_mode": ctx.get("phi_mode"), "tags": ctx.get("tags", [])},
        request=request,
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        {
            "message": "Conversation metadata updated",
            "phi_mode": ctx.get("phi_mode"),
            "tags": ctx.get("tags", []),
        },
        trace_id=trace_id,
    )


# ============================================================================
# Get Conversation Messages (Paginated)
# ============================================================================


@router.get("/{conversation_id}/messages")
async def get_admin_conversation_messages(
    conversation_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_or_viewer),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    branch_id: Optional[str] = Query(None, description="Filter by branch ID"),
) -> Dict:
    """
    Get paginated messages for a specific conversation.

    Supports filtering by branch for branched conversations.
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        return error_response(
            error_code=ErrorCodes.VALIDATION_ERROR,
            message="Invalid conversation ID format",
            trace_id=getattr(request.state, "trace_id", None),
        )

    # Verify conversation exists
    session = db.query(ChatSession).filter(ChatSession.id == conv_uuid).first()
    if not session:
        return error_response(
            error_code=ErrorCodes.NOT_FOUND,
            message="Conversation not found",
            trace_id=getattr(request.state, "trace_id", None),
        )

    # Build query
    query = db.query(Message).filter(Message.session_id == conv_uuid)

    if branch_id:
        query = query.filter(Message.branch_id == branch_id)

    total = query.count()
    messages = (
        query.options(joinedload(Message.attachments)).order_by(Message.created_at).offset(offset).limit(limit).all()
    )

    message_responses = []
    for msg in messages:
        attachments = [
            {
                "id": str(att.id),
                "file_name": att.file_name,
                "file_type": att.file_type,
                "file_size": att.file_size,
            }
            for att in msg.attachments
        ]

        message_responses.append(
            MessageAdminResponse(
                id=str(msg.id),
                session_id=str(msg.session_id),
                role=msg.role,
                content=msg.content,
                branch_id=msg.branch_id,
                parent_message_id=(str(msg.parent_message_id) if msg.parent_message_id else None),
                tool_calls=msg.tool_calls,
                tool_results=msg.tool_results,
                contains_phi=msg.contains_phi,
                tokens=msg.tokens,
                model=msg.model,
                created_at=msg.created_at.isoformat() + "Z" if msg.created_at else "",
                attachments=attachments,
            ).model_dump()
        )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        {
            "messages": message_responses,
            "total": total,
            "offset": offset,
            "limit": limit,
        },
        trace_id=trace_id,
    )


# ============================================================================
# Export Conversation
# ============================================================================


@router.post("/{conversation_id}/export")
async def export_admin_conversation(
    conversation_id: str,
    export_request: ExportRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> StreamingResponse:
    """
    Export a conversation for compliance or legal purposes.

    Supports JSON, Markdown, and CSV formats.
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid conversation ID format",
        )

    # Get conversation with user info
    result = (
        db.query(ChatSession, User.email, User.full_name)
        .join(User, User.id == ChatSession.user_id)
        .filter(ChatSession.id == conv_uuid)
        .first()
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    session, user_email, user_name = result

    # Get all messages
    messages = (
        db.query(Message)
        .options(joinedload(Message.attachments))
        .filter(Message.session_id == conv_uuid)
        .order_by(Message.created_at)
        .all()
    )

    # Log audit event
    await log_audit_event(
        db=db,
        admin_user=current_admin,
        action="export_conversation",
        resource_type="conversation",
        resource_id=conversation_id,
        details={"format": export_request.format, "user_email": user_email},
    )

    # Generate export based on format
    if export_request.format == "json":
        content = _export_json(session, messages, user_email, user_name, export_request.include_metadata)
        media_type = "application/json"
        filename = f"conversation_{conversation_id}.json"
    elif export_request.format == "markdown":
        content = _export_markdown(session, messages, user_email, user_name, export_request.include_metadata)
        media_type = "text/markdown"
        filename = f"conversation_{conversation_id}.md"
    else:  # csv
        content = _export_csv(session, messages, user_email, export_request.include_metadata)
        media_type = "text/csv"
        filename = f"conversation_{conversation_id}.csv"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_json(session, messages, user_email, user_name, include_metadata):
    """Export conversation as JSON."""
    data = {
        "conversation": {
            "id": str(session.id),
            "title": session.title or "Untitled Conversation",
            "user_email": user_email,
            "user_name": user_name,
            "created_at": (session.created_at.isoformat() + "Z" if session.created_at else None),
            "updated_at": (session.updated_at.isoformat() + "Z" if session.updated_at else None),
        },
        "messages": [],
        "exported_at": datetime.now(timezone.utc).isoformat() + "Z",
    }

    for msg in messages:
        msg_data = {
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() + "Z" if msg.created_at else None,
        }
        if include_metadata:
            msg_data.update(
                {
                    "id": str(msg.id),
                    "branch_id": msg.branch_id,
                    "tokens": msg.tokens,
                    "model": msg.model,
                    "contains_phi": msg.contains_phi,
                    "tool_calls": msg.tool_calls,
                }
            )
        data["messages"].append(msg_data)

    return json.dumps(data, indent=2)


def _export_markdown(session, messages, user_email, user_name, include_metadata):
    """Export conversation as Markdown."""
    lines = [
        f"# {session.title or 'Untitled Conversation'}",
        "",
        f"**User:** {user_name or user_email}",
        f"**Date:** {session.created_at.strftime('%Y-%m-%d %H:%M UTC') if session.created_at else 'N/A'}",
        "",
        "---",
        "",
    ]

    for msg in messages:
        role_label = {
            "user": "User",
            "assistant": "Assistant",
            "system": "System",
            "tool": "Tool",
        }.get(msg.role, msg.role.title())
        lines.append(f"### {role_label}")
        if include_metadata:
            lines.append(f"*{msg.created_at.strftime('%Y-%m-%d %H:%M:%S UTC') if msg.created_at else 'N/A'}*")
        lines.append("")
        lines.append(msg.content)
        lines.append("")

    lines.append("---")
    lines.append(f"*Exported at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}*")

    return "\n".join(lines)


def _export_csv(session, messages, user_email, include_metadata):
    """Export conversation as CSV."""
    import csv

    output = io.StringIO()
    fieldnames = ["timestamp", "role", "content"]
    if include_metadata:
        fieldnames.extend(["message_id", "branch_id", "tokens", "model", "contains_phi"])

    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for msg in messages:
        row = {
            "timestamp": msg.created_at.isoformat() if msg.created_at else "",
            "role": msg.role,
            "content": msg.content.replace("\n", "\\n"),
        }
        if include_metadata:
            row.update(
                {
                    "message_id": str(msg.id),
                    "branch_id": msg.branch_id or "",
                    "tokens": msg.tokens or "",
                    "model": msg.model or "",
                    "contains_phi": str(msg.contains_phi),
                }
            )
        writer.writerow(row)

    return output.getvalue()


# ============================================================================
# Bulk Export User Conversations
# ============================================================================


@router.post("/users/{user_id}/export")
async def export_user_conversations(
    user_id: str,
    export_request: ExportRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> StreamingResponse:
    """
    Export all conversations for a specific user.

    Used for compliance, legal requests, or data portability.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )

    # Get user
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Get all conversations
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user_uuid).order_by(ChatSession.created_at).all()

    # Log audit event
    await log_audit_event(
        db=db,
        admin_user=current_admin,
        action="bulk_export_user_conversations",
        resource_type="user",
        resource_id=user_id,
        details={
            "format": export_request.format,
            "conversation_count": len(sessions),
            "user_email": user.email,
        },
    )

    # Export all conversations
    all_data = {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.full_name,
        },
        "conversations": [],
        "exported_at": datetime.now(timezone.utc).isoformat() + "Z",
        "total_conversations": len(sessions),
    }

    for session in sessions:
        messages = db.query(Message).filter(Message.session_id == session.id).order_by(Message.created_at).all()

        conv_data = {
            "id": str(session.id),
            "title": session.title or "Untitled Conversation",
            "created_at": (session.created_at.isoformat() + "Z" if session.created_at else None),
            "messages": [],
        }

        for msg in messages:
            conv_data["messages"].append(
                {
                    "role": msg.role,
                    "content": msg.content,
                    "created_at": (msg.created_at.isoformat() + "Z" if msg.created_at else None),
                }
            )

        all_data["conversations"].append(conv_data)

    content = json.dumps(all_data, indent=2)
    filename = f"user_{user_id}_conversations.json"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
