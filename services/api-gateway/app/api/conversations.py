"""
Conversation branching API endpoints.

This module provides REST API endpoints for conversation branching functionality,
allowing users to fork conversations at any message point and navigate between branches.

Note: Pydantic schemas are now defined in app/api/conversations/schemas.py
"""

import time
import uuid
from datetime import datetime
from typing import Any, Optional

from app.api.conversation_schemas.schemas import (
    BranchInfo,
    BranchResponse,
    ConversationResponse,
    ConversationSettingsSchema,
    ConversationsListResponse,
    CreateBranchRequest,
    CreateConversationRequest,
    CreateMessageRequest,
    EditMessageRequest,
    MessageResponse,
    MessagesListResponse,
    SessionEventResponse,
    UpdateConversationRequest,
)
from app.services.llm_client import LLMClient, LLMRequest
from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db, transaction
from app.core.dependencies import get_current_organization, get_current_user
from app.core.logging import get_logger
from app.core.metrics import record_instrumented_api_call
from app.models.message import Message
from app.models.organization import Organization
from app.models.session import Session as ChatSession
from app.models.user import User
from app.services.analytics_service import analytics_service
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = get_logger(__name__)


def _generate_fallback_title(raw_text: str, max_length: int = 80) -> str:
    """
    Generate a simple, local fallback title from raw text.

    This is used when LLM-based titling is unavailable. It performs basic
    cleaning and truncation without sending any PHI-bearing content externally.
    """
    if not raw_text:
        return "New Conversation"

    cleaned = " ".join(raw_text.split())
    if len(cleaned) <= max_length:
        return cleaned

    truncated = cleaned[:max_length]
    last_space = truncated.rfind(" ")
    if last_space > max_length * 0.5:
        truncated = truncated[:last_space]
    return truncated.rstrip() + "…"


async def _generate_llm_title(combined_text: str, trace_id: Optional[str] = None) -> Optional[str]:
    """
    Generate a PHI-conscious title using the LLM client.

    The prompt instructs the model to avoid emitting PHI (names, MRNs, DOBs,
    exact dates). We also mark phi_present=True so llm_client will prefer the
    configured local/PHI-safe model path when available.
    """
    combined = combined_text.strip()
    if not combined:
        return None

    # Truncate to a reasonable length for cost/safety – we only need a high-level idea.
    excerpt = combined[:1200]

    client = LLMClient()
    prompt = (
        "You are a medical assistant. Based on the brief conversation excerpt below, "
        "generate a concise, clinician-facing title (max 60 characters).\n\n"
        "Requirements:\n"
        "- Capture the main clinical topic or task.\n"
        "- Do NOT include PHI such as patient names, MRNs, DOBs, or exact dates.\n"
        "- Do NOT include facility names or other direct identifiers.\n"
        "- Return ONLY the title text, with no quotes or additional commentary.\n\n"
        f"Conversation excerpt:\n{excerpt}"
    )

    try:
        response = await client.generate(
            LLMRequest(
                prompt=prompt,
                intent="summary",
                temperature=0.2,
                max_tokens=32,
                phi_present=True,
                trace_id=trace_id,
            )
        )
    except Exception as e:
        logger.warning("Auto-title LLM call failed: %s", e)
        return None

    if not response.text:
        return None

    line = response.text.strip().split("\n")[0].strip().strip('"')
    return line[:80] if line else None


# Helper Functions
def generate_branch_id() -> str:
    """Generate a unique branch ID"""
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    short_uuid = str(uuid.uuid4())[:8]
    return f"branch-{timestamp}-{short_uuid}"


def get_session_or_404(
    db: Session,
    session_id: uuid.UUID,
    user: User,
    current_org: Organization | None = None,
) -> ChatSession:
    """Get session by ID or raise 404 if not found or not owned by user.

    When a current organization is provided, sessions are additionally scoped
    to that organization to enforce tenant isolation.
    """
    filters = [
        ChatSession.id == session_id,
        ChatSession.user_id == user.id,
    ]
    if current_org is not None:
        filters.append(ChatSession.organization_id == current_org.id)

    session = db.query(ChatSession).filter(and_(*filters)).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(error_code=ErrorCodes.NOT_FOUND, message="Session not found"),
        )

    return session


def get_message_or_404(db: Session, message_id: uuid.UUID, session: ChatSession) -> Message:
    """Get message by ID or raise 404 if not found or not in session"""
    message = (
        db.query(Message)
        .filter(
            and_(
                Message.id == message_id,
                Message.session_id == session.id,
            )
        )
        .first()
    )

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(error_code=ErrorCodes.NOT_FOUND, message="Message not found"),
        )

    return message


# API Endpoints - Conversation CRUD
@router.get("")
async def list_conversations(
    page: int = 1,
    pageSize: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    List all conversations for the current user.

    Returns paginated list of conversations with message counts and metadata.

    Args:
        page: Page number (1-indexed)
        pageSize: Number of items per page
        db: Database session
        current_user: Authenticated user

    Returns:
        PaginatedResponse with conversations
    """
    start_time = time.time()

    # Calculate offset
    offset = (page - 1) * pageSize

    # Build base filters
    filters = [ChatSession.user_id == current_user.id]
    if current_org is not None:
        filters.append(ChatSession.organization_id == current_org.id)

    # Query total count
    total = db.query(func.count(ChatSession.id)).filter(and_(*filters)).scalar()

    # Query sessions with message counts
    sessions = (
        db.query(
            ChatSession,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.session_id == ChatSession.id)
        .filter(and_(*filters))
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
        .offset(offset)
        .limit(pageSize)
        .all()
    )

    conversations = []
    for session, message_count in sessions:
        context = session.context or {}
        # Conversation-level PHI mode and tags are stored in context for now to avoid schema changes
        phi_mode = context.get("phi_mode")
        tags = context.get("tags")

        conversations.append(
            ConversationResponse(
                id=str(session.id),
                userId=str(session.user_id),
                title=session.title or "New Conversation",
                archived=bool(session.archived),  # Convert int to bool
                messageCount=message_count,
                folderId=str(session.folder_id) if session.folder_id else None,
                createdAt=session.created_at.isoformat() + "Z",
                updatedAt=session.updated_at.isoformat() + "Z",
                phiMode=phi_mode,
                tags=tags,
                metadata=context if isinstance(context, dict) else None,
            )
        )

    response = success_response(
        data=ConversationsListResponse(
            items=conversations,
            total=total,
            page=page,
            pageSize=pageSize,
        )
    )

    # Record analytics (best-effort)
    elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
    org_id = current_org.id if current_org else None
    record_instrumented_api_call(
        analytics_service=analytics_service,
        db=db,
        endpoint="/api/conversations",
        duration_ms=float(elapsed_ms),
        success=True,
        user_id=current_user.id,
        organization_id=org_id,
        endpoint_category="chat",
    )

    return response


@router.post("")
async def create_conversation(
    request: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Create a new conversation.

    Args:
        request: Conversation creation request
        db: Database session
        current_user: Authenticated user

    Returns:
        ConversationResponse with new conversation details
    """
    start_time = time.time()

    # Validate folder_id if provided
    folder_uuid = None
    if request.folder_id:
        try:
            folder_uuid = uuid.UUID(request.folder_id)
            # Verify folder exists and belongs to user
            from app.models.folder import ConversationFolder

            folder = (
                db.query(ConversationFolder)
                .filter(
                    and_(
                        ConversationFolder.id == folder_uuid,
                        ConversationFolder.user_id == current_user.id,
                    )
                )
                .first()
            )
            if not folder:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=error_response(error_code=ErrorCodes.NOT_FOUND, message="Folder not found"),
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="Invalid folder UUID format",
                ),
            )

    # Create new session with transaction management
    organization_id = current_org.id if current_org else None
    new_session = ChatSession(
        user_id=current_user.id,
        title=request.title,
        folder_id=folder_uuid,
        organization_id=organization_id,
        archived=0,  # 0 = not archived, 1 = archived (Integer column)
    )

    with transaction(db):
        db.add(new_session)
        # Transaction context manager handles commit/rollback

    db.refresh(new_session)
    logger.info(f"Created conversation {new_session.id} for user {current_user.id}")

    response = success_response(
        data=ConversationResponse(
            id=str(new_session.id),
            userId=str(new_session.user_id),
            title=new_session.title,
            archived=bool(new_session.archived),  # Convert int to bool
            messageCount=0,
            folderId=str(new_session.folder_id) if new_session.folder_id else None,
            createdAt=new_session.created_at.isoformat() + "Z",
            updatedAt=new_session.updated_at.isoformat() + "Z",
        )
    )

    # Record analytics and user activity (best-effort)
    try:
        elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
        org_id = current_org.id if current_org else None

        record_instrumented_api_call(
            analytics_service=analytics_service,
            db=db,
            endpoint="/api/conversations",
            duration_ms=float(elapsed_ms),
            success=True,
            user_id=current_user.id,
            organization_id=org_id,
            endpoint_category="chat",
        )

        analytics_service.record_user_activity(
            db=db,
            user_id=current_user.id,
            activity_type="session",
            organization_id=org_id,
            feature="chat",
        )
    except Exception as exc:  # pragma: no cover - analytics must not break API
        logger.warning("create_conversation_analytics_failed", extra={"error": str(exc)})

    return response


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Get a specific conversation by ID.

    Args:
        conversation_id: UUID of the conversation
        db: Database session
        current_user: Authenticated user

    Returns:
        ConversationResponse with conversation details

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    start_time = time.time()

    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Get message count
    message_count = db.query(func.count(Message.id)).filter(Message.session_id == session.id).scalar()

    context = session.context or {}
    phi_mode = context.get("phi_mode")
    tags = context.get("tags")

    response = success_response(
        data=ConversationResponse(
            id=str(session.id),
            userId=str(session.user_id),
            title=session.title or "New Conversation",
            archived=bool(session.archived),  # Convert int to bool
            messageCount=message_count,
            folderId=str(session.folder_id) if session.folder_id else None,
            createdAt=session.created_at.isoformat() + "Z",
            updatedAt=session.updated_at.isoformat() + "Z",
            phiMode=phi_mode,
            tags=tags,
            metadata=context if isinstance(context, dict) else None,
        )
    )

    # Record analytics (best-effort)
    elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
    org_id = current_org.id if current_org else None
    record_instrumented_api_call(
        analytics_service=analytics_service,
        db=db,
        endpoint="/api/conversations/{conversation_id}",
        duration_ms=float(elapsed_ms),
        success=True,
        user_id=current_user.id,
        organization_id=org_id,
        endpoint_category="chat",
    )

    return response


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Update a conversation's metadata.

    Args:
        conversation_id: UUID of the conversation
        request: Update request with fields to change
        db: Database session
        current_user: Authenticated user

    Returns:
        ConversationResponse with updated conversation details

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Update fields if provided
    if request.title is not None:
        session.title = request.title
    if request.archived is not None:
        session.archived = 1 if request.archived else 0  # Convert bool to int
    if request.folder_id is not None:
        if request.folder_id:
            try:
                folder_uuid = uuid.UUID(request.folder_id)
                # Verify folder exists and belongs to user
                from app.models.folder import ConversationFolder

                folder = (
                    db.query(ConversationFolder)
                    .filter(
                        and_(
                            ConversationFolder.id == folder_uuid,
                            ConversationFolder.user_id == current_user.id,
                        )
                    )
                    .first()
                )
                if not folder:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=error_response(error_code=ErrorCodes.NOT_FOUND, message="Folder not found"),
                    )
                session.folder_id = folder_uuid
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_response(
                        error_code=ErrorCodes.VALIDATION_ERROR,
                        message="Invalid folder UUID format",
                    ),
                )
        else:
            session.folder_id = None

    # Conversation-level metadata stored in context JSONB
    if request.phi_mode is not None or request.tags is not None:
        ctx = dict(session.context or {})
        if request.phi_mode is not None:
            # Normalize phi_mode to expected values ("clinical" | "demo")
            mode_value = str(request.phi_mode).lower()
            if mode_value not in {"clinical", "demo"}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_response(
                        error_code=ErrorCodes.VALIDATION_ERROR,
                        message="phiMode must be 'clinical' or 'demo'",
                    ),
                )
            ctx["phi_mode"] = mode_value
        if request.tags is not None:
            # Ensure tags is a list of strings and de-duplicate
            normalized_tags = sorted({str(t).strip() for t in request.tags if str(t).strip()})
            ctx["tags"] = normalized_tags
        session.context = ctx

    # Explicitly mark session as modified to ensure JSONB changes are persisted
    db.add(session)
    with transaction(db):
        logger.debug(f"Updated conversation metadata for {session.id}")

    db.refresh(session)

    # Get message count
    message_count = db.query(func.count(Message.id)).filter(Message.session_id == session.id).scalar()

    context = session.context or {}
    phi_mode = context.get("phi_mode")
    tags = context.get("tags")

    logger.info(f"Updated conversation {session.id}")

    return success_response(
        data=ConversationResponse(
            id=str(session.id),
            userId=str(session.user_id),
            title=session.title or "New Conversation",
            archived=bool(session.archived),  # Convert int to bool
            messageCount=message_count,
            folderId=str(session.folder_id) if session.folder_id else None,
            createdAt=session.created_at.isoformat() + "Z",
            updatedAt=session.updated_at.isoformat() + "Z",
            phiMode=phi_mode,
            tags=tags,
            metadata=context if isinstance(context, dict) else None,
        )
    )


@router.delete("/all")
async def delete_all_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Delete ALL conversations for the current user.

    This is a destructive operation that removes all conversations and their messages.
    Used for bulk cleanup / account reset scenarios.

    Args:
        db: Database session
        current_user: Authenticated user

    Returns:
        Success response with count of deleted conversations
    """
    # Get all user's conversations (optionally scoped to current org)
    query = db.query(ChatSession).filter(ChatSession.user_id == current_user.id)
    if current_org is not None:
        query = query.filter(ChatSession.organization_id == current_org.id)
    user_sessions = query.all()

    session_ids = [s.id for s in user_sessions]

    if not session_ids:
        return success_response(data={"deleted_count": 0, "message": "No conversations to delete"})

    # Delete all messages and sessions atomically
    with transaction(db):
        # Delete messages first (foreign key constraint)
        deleted_messages = (
            db.query(Message).filter(Message.session_id.in_(session_ids)).delete(synchronize_session=False)
        )

        # Delete all sessions
        deleted_count = (
            db.query(ChatSession).filter(ChatSession.user_id == current_user.id).delete(synchronize_session=False)
        )

    logger.info(f"Deleted {deleted_count} conversations and {deleted_messages} messages for user {current_user.id}")

    return success_response(
        data={
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} conversation(s)",
        }
    )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Delete a conversation and all its messages.

    Args:
        conversation_id: UUID of the conversation
        db: Database session
        current_user: Authenticated user

    Returns:
        Success response

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Delete all messages and session atomically
    with transaction(db):
        db.query(Message).filter(Message.session_id == session.id).delete()
        db.delete(session)

    logger.info(f"Deleted conversation {conversation_id}")

    return success_response(data={"message": "Conversation deleted successfully"})


@router.post("/{conversation_id}/auto-title")
async def auto_title_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Generate and apply an automatic clinical title for a conversation.

    The title is derived from the first 1–2 user turns and the first assistant
    answer, using a local heuristic with optional LLM refinement. The LLM call,
    when enabled, is PHI-conscious and instructed not to emit identifiers.
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Load a small slice of the earliest messages on the main branch
    messages = (
        db.query(Message)
        .filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.is_(None),
            )
        )
        .order_by(Message.created_at.asc())
        .limit(10)
        .all()
    )

    # Build combined text from first 1–2 user turns and first assistant answer
    pieces = []
    user_count = 0
    assistant_added = False
    for msg in messages:
        if msg.role == "user":
            if user_count < 2:
                pieces.append(f"User: {msg.content}")
                user_count += 1
        elif msg.role == "assistant" and not assistant_added:
            pieces.append(f"Assistant: {msg.content}")
            assistant_added = True
        if user_count >= 2 and assistant_added:
            break

    if not pieces and messages:
        # Fallback to very first message content if roles are unexpected
        pieces.append(messages[0].content or "")

    combined_text = " ".join(pieces).strip()
    if not combined_text:
        combined_text = session.title or "New Conversation"

    # Local fallback title first (no external calls)
    fallback_title = _generate_fallback_title(combined_text)

    # Optional LLM-based refinement – PHI-aware and best-effort only
    trace_id: Optional[str] = None
    llm_title = await _generate_llm_title(combined_text, trace_id=trace_id)
    final_title = llm_title or fallback_title

    # Persist the new title
    session.title = final_title
    db.add(session)  # Explicitly mark as modified for JSONB/attribute detection
    with transaction(db):
        logger.debug(f"Auto-titled conversation {conversation_id} to: {final_title}")

    db.refresh(session)

    # Recompute message count for response
    message_count = db.query(func.count(Message.id)).filter(Message.session_id == session.id).scalar()
    context = session.context or {}

    return success_response(
        data=ConversationResponse(
            id=str(session.id),
            userId=str(session.user_id),
            title=session.title or "New Conversation",
            archived=bool(session.archived),
            messageCount=message_count,
            folderId=str(session.folder_id) if session.folder_id else None,
            createdAt=session.created_at.isoformat() + "Z",
            updatedAt=session.updated_at.isoformat() + "Z",
            phiMode=context.get("phi_mode"),
            tags=context.get("tags"),
            metadata=context if isinstance(context, dict) else None,
        )
    )


# API Endpoints - Messages
@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Get all messages in a conversation (main branch).

    Returns paginated list of messages in chronological order.

    Args:
        conversation_id: UUID of the conversation
        page: Page number (1-indexed)
        pageSize: Number of messages per page
        db: Database session
        current_user: Authenticated user

    Returns:
        PaginatedResponse with messages

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    start_time = time.time()

    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Calculate offset
    offset = (page - 1) * pageSize

    # Query total count (main branch only - no branch_id)
    total = (
        db.query(func.count(Message.id))
        .filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.is_(None),
            )
        )
        .scalar()
    )

    # Query messages in chronological order
    messages = (
        db.query(Message)
        .filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.is_(None),
            )
        )
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(pageSize)
        .all()
    )

    message_responses = [
        MessageResponse(
            id=str(msg.id),
            session_id=str(msg.session_id),
            role=msg.role,
            content=msg.content,
            parent_message_id=(str(msg.parent_message_id) if msg.parent_message_id else None),
            branch_id=msg.branch_id,
            created_at=msg.created_at.isoformat() + "Z",
            tokens=msg.tokens,
            model=msg.model,
        )
        for msg in messages
    ]

    response = success_response(
        data=MessagesListResponse(
            items=message_responses,
            total=total,
            page=page,
            pageSize=pageSize,
        )
    )

    # Record analytics (best-effort)
    elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
    org_id = session.organization_id
    record_instrumented_api_call(
        analytics_service=analytics_service,
        db=db,
        endpoint="/api/conversations/{conversation_id}/messages",
        duration_ms=float(elapsed_ms),
        success=True,
        user_id=current_user.id,
        organization_id=org_id,
        endpoint_category="chat",
    )

    return response


@router.post("/{conversation_id}/messages")
async def create_message(
    conversation_id: str,
    request: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Create a new message in a conversation with optional idempotency.

    If `client_message_id` is provided, this endpoint is idempotent:
    - If a message with the same (conversation_id, branch_id, client_message_id)
      already exists, the existing message is returned without creating a duplicate.
    - This allows safe retries without creating duplicate messages.

    Args:
        conversation_id: UUID of the conversation
        request: Message creation request
        db: Database session
        current_user: Authenticated user

    Returns:
        MessageResponse with the created (or existing) message

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
        400: Invalid request (e.g., invalid UUIDs)
    """
    start_time = time.time()

    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Parse optional parent_message_id
    parent_message_uuid = None
    if request.parent_message_id:
        try:
            parent_message_uuid = uuid.UUID(request.parent_message_id)
            # Verify parent message exists and belongs to session
            get_message_or_404(db, parent_message_uuid, session)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="Invalid parent_message_id UUID format",
                ),
            )

    message_created = False

    # Check for idempotent request
    if request.client_message_id:
        # Look for existing message with same idempotency key
        existing_message = (
            db.query(Message)
            .filter(
                and_(
                    Message.session_id == session.id,
                    Message.branch_id == request.branch_id,
                    Message.client_message_id == request.client_message_id,
                )
            )
            .first()
        )

        if existing_message:
            logger.info(
                f"Idempotent message creation: returning existing message "
                f"{existing_message.id} for client_message_id={request.client_message_id}"
            )
            response = success_response(
                data=MessageResponse(
                    id=str(existing_message.id),
                    session_id=str(existing_message.session_id),
                    role=existing_message.role,
                    content=existing_message.content,
                    parent_message_id=(
                        str(existing_message.parent_message_id) if existing_message.parent_message_id else None
                    ),
                    branch_id=existing_message.branch_id,
                    client_message_id=existing_message.client_message_id,
                    created_at=existing_message.created_at.isoformat() + "Z",
                    tokens=existing_message.tokens,
                    model=existing_message.model,
                    is_duplicate=True,
                )
            )
            # Still record API call analytics but do not increment message counters
            elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
            record_instrumented_api_call(
                analytics_service=analytics_service,
                db=db,
                endpoint="/api/conversations/{conversation_id}/messages",
                duration_ms=float(elapsed_ms),
                success=True,
                user_id=current_user.id,
                organization_id=session.organization_id,
                endpoint_category="chat",
            )

            return response

    # Create new message
    new_message = Message(
        session_id=session.id,
        role=request.role,
        content=request.content,
        branch_id=request.branch_id,
        parent_message_id=parent_message_uuid,
        client_message_id=request.client_message_id,
        message_metadata=request.metadata,
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    message_created = True

    logger.info(
        f"Created message {new_message.id} in conversation {conversation_id}"
        + (f" with client_message_id={request.client_message_id}" if request.client_message_id else "")
    )

    response = success_response(
        data=MessageResponse(
            id=str(new_message.id),
            session_id=str(new_message.session_id),
            role=new_message.role,
            content=new_message.content,
            parent_message_id=(str(new_message.parent_message_id) if new_message.parent_message_id else None),
            branch_id=new_message.branch_id,
            client_message_id=new_message.client_message_id,
            created_at=new_message.created_at.isoformat() + "Z",
            tokens=new_message.tokens,
            model=new_message.model,
            is_duplicate=False,
        )
    )

    # Record analytics and user activity (best-effort)
    try:
        elapsed_ms = int(max(time.time() - start_time, 0.0) * 1000)
        org_id = session.organization_id
        record_instrumented_api_call(
            analytics_service=analytics_service,
            db=db,
            endpoint="/api/conversations/{conversation_id}/messages",
            duration_ms=float(elapsed_ms),
            success=True,
            user_id=current_user.id,
            organization_id=org_id,
            endpoint_category="chat",
        )
        if message_created:
            analytics_service.record_user_activity(
                db=db,
                user_id=current_user.id,
                activity_type="message",
                organization_id=org_id,
                count=1,
                feature="chat",
            )
    except Exception as exc:  # pragma: no cover
        logger.warning("create_message_analytics_failed", extra={"error": str(exc)})

    return response


@router.patch("/{conversation_id}/messages/{message_id}")
async def edit_message(
    conversation_id: str,
    message_id: str,
    request: EditMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Edit a message's content.

    Args:
        conversation_id: UUID of the conversation
        message_id: UUID of the message to edit
        request: Edit request with new content
        db: Database session
        current_user: Authenticated user

    Returns:
        MessageResponse with updated message

    Raises:
        404: Conversation or message not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
        msg_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Get message
    message = get_message_or_404(db, msg_uuid, session)

    # Update content
    message.content = request.content
    db.commit()
    db.refresh(message)

    logger.info(f"Edited message {message_id} in conversation {conversation_id}")

    return success_response(
        data=MessageResponse(
            id=str(message.id),
            session_id=str(message.session_id),
            role=message.role,
            content=message.content,
            parent_message_id=(str(message.parent_message_id) if message.parent_message_id else None),
            branch_id=message.branch_id,
            created_at=message.created_at.isoformat() + "Z",
            tokens=message.tokens,
            model=message.model,
        )
    )


@router.delete("/{conversation_id}/messages/{message_id}")
async def delete_message(
    conversation_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Delete a message.

    Args:
        conversation_id: UUID of the conversation
        message_id: UUID of the message to delete
        db: Database session
        current_user: Authenticated user

    Returns:
        Success response

    Raises:
        404: Conversation or message not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
        msg_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Get message
    message = get_message_or_404(db, msg_uuid, session)

    # Delete message
    db.delete(message)
    db.commit()

    logger.info(f"Deleted message {message_id} from conversation {conversation_id}")

    return success_response(data={"message": "Message deleted successfully"})


# API Endpoints - Conversation Branching
@router.post("/{session_id}/branches", response_model=BranchResponse)
async def create_branch(
    session_id: str,
    request: CreateBranchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Create a new conversation branch from a specific message.

    This endpoint allows forking a conversation at any message point,
    creating an alternative conversation path.

    Args:
        session_id: UUID of the conversation session
        request: Branch creation request with parent_message_id
        db: Database session
        current_user: Authenticated user

    Returns:
        BranchResponse with branch_id and metadata

    Raises:
        404: Session or parent message not found
        403: User doesn't own the session
    """
    try:
        session_uuid = uuid.UUID(session_id)
        parent_message_uuid = uuid.UUID(request.parent_message_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user, current_org=current_org)

    # Verify parent message exists and belongs to session
    parent_message = get_message_or_404(db, parent_message_uuid, session)

    # Generate unique branch ID
    branch_id = generate_branch_id()

    # If initial message provided, create it in the new branch
    message_count = 0
    if request.initial_message:
        new_message = Message(
            session_id=session.id,
            role="user",
            content=request.initial_message,
            parent_message_id=parent_message.id,
            branch_id=branch_id,
        )
        db.add(new_message)
        db.commit()
        message_count = 1

    logger.info(f"Created branch {branch_id} from message {request.parent_message_id} " f"in session {session_id}")

    return success_response(
        data=BranchResponse(
            branch_id=branch_id,
            session_id=str(session.id),
            parent_message_id=request.parent_message_id,
            created_at=datetime.utcnow().isoformat() + "Z",
            message_count=message_count,
        )
    )


@router.get("/{session_id}/branches")
async def list_branches(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    List all branches in a conversation.

    Returns metadata about each branch including message count and timestamps.

    Args:
        session_id: UUID of the conversation session
        db: Database session
        current_user: Authenticated user

    Returns:
        List of BranchInfo objects

    Raises:
        404: Session not found
        403: User doesn't own the session
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user, current_org=current_org)

    # Query all unique branch_ids with metadata
    branch_data = (
        db.query(
            Message.branch_id,
            Message.parent_message_id,
            func.count(Message.id).label("message_count"),
            func.min(Message.created_at).label("created_at"),
            func.max(Message.created_at).label("last_activity"),
        )
        .filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.isnot(None),
            )
        )
        .group_by(Message.branch_id, Message.parent_message_id)
        .all()
    )

    branches = [
        BranchInfo(
            branch_id=row.branch_id,
            parent_message_id=(str(row.parent_message_id) if row.parent_message_id else None),
            message_count=row.message_count,
            created_at=row.created_at.isoformat() + "Z",
            last_activity=row.last_activity.isoformat() + "Z",
        )
        for row in branch_data
    ]

    # Include main branch if it has messages
    main_branch_count = (
        db.query(func.count(Message.id))
        .filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.is_(None),
            )
        )
        .scalar()
    )

    if main_branch_count > 0:
        main_branch_data = (
            db.query(
                func.min(Message.created_at).label("created_at"),
                func.max(Message.created_at).label("last_activity"),
            )
            .filter(
                and_(
                    Message.session_id == session.id,
                    Message.branch_id.is_(None),
                )
            )
            .first()
        )

        branches.insert(
            0,
            BranchInfo(
                branch_id="main",
                parent_message_id=None,
                message_count=main_branch_count,
                created_at=main_branch_data.created_at.isoformat() + "Z",
                last_activity=main_branch_data.last_activity.isoformat() + "Z",
            ),
        )

    return success_response(data=branches)


@router.get("/{session_id}/branches/{branch_id}/messages")
async def get_branch_messages(
    session_id: str,
    branch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Get all messages in a specific branch.

    Returns messages in chronological order for the specified branch.

    Args:
        session_id: UUID of the conversation session
        branch_id: Branch identifier (use "main" for main conversation)
        db: Database session
        current_user: Authenticated user

    Returns:
        List of MessageResponse objects

    Raises:
        404: Session not found
        403: User doesn't own the session
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user, current_org=current_org)

    # Build query based on branch_id
    if branch_id == "main":
        # Main branch: messages with no branch_id
        query = db.query(Message).filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id.is_(None),
            )
        )
    else:
        # Specific branch: messages with matching branch_id
        query = db.query(Message).filter(
            and_(
                Message.session_id == session.id,
                Message.branch_id == branch_id,
            )
        )

    messages = query.order_by(Message.created_at.asc()).all()

    message_responses = [
        MessageResponse(
            id=str(msg.id),
            session_id=str(msg.session_id),
            role=msg.role,
            content=msg.content,
            parent_message_id=(str(msg.parent_message_id) if msg.parent_message_id else None),
            branch_id=msg.branch_id,
            created_at=msg.created_at.isoformat() + "Z",
            tokens=msg.tokens,
            model=msg.model,
        )
        for msg in messages
    ]

    return success_response(data=message_responses)


# ============================================================================
# Session Events API (P0.5 - Structured Event Logging)
# ============================================================================


@router.get("/{conversation_id}/events")
async def get_conversation_events(
    conversation_id: str,
    event_types: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Get events for a conversation (for session inspection/debugging).

    This endpoint returns structured events logged during conversation/voice
    sessions, useful for debugging, performance analysis, and session replay.

    Args:
        conversation_id: UUID of the conversation
        event_types: Optional comma-separated list of event types to filter
        since: Optional ISO timestamp to filter events after
        limit: Max events to return (default 100, max 1000)
        offset: Pagination offset
        db: Database session
        current_user: Authenticated user

    Returns:
        List of SessionEventResponse objects

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Import here to avoid circular imports
    from app.models.session_event import SessionEvent

    # Build query
    query = db.query(SessionEvent).filter(SessionEvent.conversation_id == session.id)

    # Filter by event types
    if event_types:
        type_list = [t.strip() for t in event_types.split(",")]
        query = query.filter(SessionEvent.event_type.in_(type_list))

    # Filter by time
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            query = query.filter(SessionEvent.created_at >= since_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="Invalid 'since' timestamp format. Use ISO 8601.",
                ),
            )

    # Limit to reasonable max
    limit = min(limit, 1000)

    events = query.order_by(SessionEvent.created_at.asc()).offset(offset).limit(limit).all()

    event_responses = [
        SessionEventResponse(
            id=str(event.id),
            conversation_id=str(event.conversation_id),
            session_id=event.session_id,
            branch_id=event.branch_id,
            event_type=event.event_type,
            payload=event.payload,
            source=event.source,
            trace_id=event.trace_id,
            created_at=event.created_at.isoformat() + "Z",
        )
        for event in events
    ]

    return success_response(data=event_responses)


# ============================================================================
# Conversation Settings API (P1 feature)
# ============================================================================


@router.get("/{conversation_id}/settings")
async def get_conversation_settings(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Get settings for a conversation.

    Args:
        conversation_id: UUID of the conversation
        db: Database session
        current_user: Authenticated user

    Returns:
        ConversationSettingsSchema with current settings

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Return settings (or empty dict if none)
    settings = session.settings or {}

    return success_response(data=ConversationSettingsSchema(**settings))


@router.put("/{conversation_id}/settings")
async def update_conversation_settings(
    conversation_id: str,
    settings: ConversationSettingsSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Update settings for a conversation.

    Args:
        conversation_id: UUID of the conversation
        settings: New settings to apply
        db: Database session
        current_user: Authenticated user

    Returns:
        Updated ConversationSettingsSchema

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user, current_org=current_org)

    # Merge new settings with existing (exclude None values)
    current_settings = session.settings or {}
    new_settings = settings.model_dump(exclude_none=True)
    merged_settings = {**current_settings, **new_settings}

    # Update session
    session.settings = merged_settings
    db.commit()
    db.refresh(session)

    logger.info(f"Updated settings for conversation {conversation_id}")

    return success_response(data=ConversationSettingsSchema(**merged_settings))


@router.patch("/{conversation_id}/settings")
async def patch_conversation_settings(
    conversation_id: str,
    settings: ConversationSettingsSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_org: Organization | None = Depends(get_current_organization),
):
    """
    Partially update settings for a conversation (same as PUT for this use case).

    Args:
        conversation_id: UUID of the conversation
        settings: Settings to update (only non-None values are applied)
        db: Database session
        current_user: Authenticated user

    Returns:
        Updated ConversationSettingsSchema

    Raises:
        404: Conversation not found
        403: User doesn't own the conversation
    """
    return await update_conversation_settings(conversation_id, settings, db, current_user, current_org)
