"""
Conversation branching API endpoints.

This module provides REST API endpoints for conversation branching functionality,
allowing users to fork conversations at any message point and navigate between branches.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = get_logger(__name__)


# Pydantic Schemas
class CreateConversationRequest(BaseModel):
    """Request to create a new conversation"""

    title: str = Field(..., description="Conversation title")
    folder_id: Optional[str] = Field(
        None, description="Optional folder ID to organize conversation"
    )


class UpdateConversationRequest(BaseModel):
    """Request to update a conversation"""

    title: Optional[str] = Field(None, description="New conversation title")
    archived: Optional[bool] = Field(None, description="Archive status")
    folder_id: Optional[str] = Field(None, description="Move to folder")


class ConversationResponse(BaseModel):
    """Response containing conversation details"""

    id: str
    userId: str
    title: str
    archived: bool = False
    messageCount: int = 0
    folderId: Optional[str] = None
    createdAt: str
    updatedAt: str


class ConversationsListResponse(BaseModel):
    """Paginated list of conversations"""

    items: List[ConversationResponse]
    total: int
    page: int
    pageSize: int


class CreateBranchRequest(BaseModel):
    """Request to create a new conversation branch"""

    parent_message_id: str = Field(
        ..., description="UUID of the message to branch from"
    )
    initial_message: Optional[str] = Field(
        None, description="Optional first message in the new branch"
    )


class BranchResponse(BaseModel):
    """Response containing branch details"""

    branch_id: str = Field(..., description="Unique identifier for the branch")
    session_id: str = Field(..., description="Session (conversation) ID")
    parent_message_id: str = Field(..., description="Parent message UUID")
    created_at: str = Field(..., description="ISO 8601 timestamp")
    message_count: int = Field(default=0, description="Number of messages in branch")


class BranchInfo(BaseModel):
    """Information about a conversation branch"""

    branch_id: str = Field(..., description="Branch identifier")
    parent_message_id: Optional[str] = Field(None, description="Parent message UUID")
    message_count: int = Field(..., description="Number of messages in branch")
    created_at: str = Field(..., description="ISO 8601 timestamp of first message")
    last_activity: str = Field(..., description="ISO 8601 timestamp of last message")


class MessageResponse(BaseModel):
    """Message response with branching fields"""

    id: str
    session_id: str
    role: str
    content: str
    parent_message_id: Optional[str] = None
    branch_id: Optional[str] = None
    created_at: str
    tokens: Optional[int] = None
    model: Optional[str] = None


# Helper Functions
def generate_branch_id() -> str:
    """Generate a unique branch ID"""
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    short_uuid = str(uuid.uuid4())[:8]
    return f"branch-{timestamp}-{short_uuid}"


def get_session_or_404(db: Session, session_id: uuid.UUID, user: User) -> ChatSession:
    """Get session by ID or raise 404 if not found or not owned by user"""
    session = (
        db.query(ChatSession)
        .filter(
            and_(
                ChatSession.id == session_id,
                ChatSession.user_id == user.id,
            )
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                error_code=ErrorCodes.NOT_FOUND, message="Session not found"
            ),
        )

    return session


def get_message_or_404(
    db: Session, message_id: uuid.UUID, session: ChatSession
) -> Message:
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
            detail=error_response(
                error_code=ErrorCodes.NOT_FOUND, message="Message not found"
            ),
        )

    return message


# API Endpoints - Conversation CRUD
@router.get("")
async def list_conversations(
    page: int = 1,
    pageSize: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    # Calculate offset
    offset = (page - 1) * pageSize

    # Query total count
    total = (
        db.query(func.count(ChatSession.id))
        .filter(ChatSession.user_id == current_user.id)
        .scalar()
    )

    # Query sessions with message counts
    sessions = (
        db.query(
            ChatSession,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.session_id == ChatSession.id)
        .filter(ChatSession.user_id == current_user.id)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
        .offset(offset)
        .limit(pageSize)
        .all()
    )

    conversations = [
        ConversationResponse(
            id=str(session.id),
            userId=str(session.user_id),
            title=session.title or "New Conversation",
            archived=bool(session.archived),  # Convert int to bool
            messageCount=message_count,
            folderId=str(session.folder_id) if session.folder_id else None,
            createdAt=session.created_at.isoformat() + "Z",
            updatedAt=session.updated_at.isoformat() + "Z",
        )
        for session, message_count in sessions
    ]

    return success_response(
        data=ConversationsListResponse(
            items=conversations,
            total=total,
            page=page,
            pageSize=pageSize,
        )
    )


@router.post("")
async def create_conversation(
    request: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
                    detail=error_response(
                        error_code=ErrorCodes.NOT_FOUND, message="Folder not found"
                    ),
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    error_code=ErrorCodes.VALIDATION_ERROR,
                    message="Invalid folder UUID format",
                ),
            )

    # Create new session
    new_session = ChatSession(
        user_id=current_user.id,
        title=request.title,
        folder_id=folder_uuid,
        archived=0,  # 0 = not archived, 1 = archived (Integer column)
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    logger.info(f"Created conversation {new_session.id} for user {current_user.id}")

    return success_response(
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


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    session = get_session_or_404(db, conv_uuid, current_user)

    # Get message count
    message_count = (
        db.query(func.count(Message.id))
        .filter(Message.session_id == session.id)
        .scalar()
    )

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
        )
    )


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    session = get_session_or_404(db, conv_uuid, current_user)

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
                        detail=error_response(
                            error_code=ErrorCodes.NOT_FOUND, message="Folder not found"
                        ),
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

    db.commit()
    db.refresh(session)

    # Get message count
    message_count = (
        db.query(func.count(Message.id))
        .filter(Message.session_id == session.id)
        .scalar()
    )

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
        )
    )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    session = get_session_or_404(db, conv_uuid, current_user)

    # Delete all messages first (cascade should handle this, but being explicit)
    db.query(Message).filter(Message.session_id == session.id).delete()

    # Delete the session
    db.delete(session)
    db.commit()

    logger.info(f"Deleted conversation {conversation_id}")

    return success_response(data={"message": "Conversation deleted successfully"})


# API Endpoints - Messages
@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user)

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
            parent_message_id=(
                str(msg.parent_message_id) if msg.parent_message_id else None
            ),
            branch_id=msg.branch_id,
            created_at=msg.created_at.isoformat() + "Z",
            tokens=msg.tokens,
            model=msg.model,
        )
        for msg in messages
    ]

    class MessagesListResponse(BaseModel):
        items: List[MessageResponse]
        total: int
        page: int
        pageSize: int

    return success_response(
        data=MessagesListResponse(
            items=message_responses,
            total=total,
            page=page,
            pageSize=pageSize,
        )
    )


class EditMessageRequest(BaseModel):
    """Request to edit a message"""

    content: str = Field(..., description="New message content")


@router.patch("/{conversation_id}/messages/{message_id}")
async def edit_message(
    conversation_id: str,
    message_id: str,
    request: EditMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user)

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
            parent_message_id=(
                str(message.parent_message_id) if message.parent_message_id else None
            ),
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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify conversation exists and belongs to user
    session = get_session_or_404(db, conv_uuid, current_user)

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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user)

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

    logger.info(
        f"Created branch {branch_id} from message {request.parent_message_id} "
        f"in session {session_id}"
    )

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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user)

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
            parent_message_id=(
                str(row.parent_message_id) if row.parent_message_id else None
            ),
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
            detail=error_response(
                error_code=ErrorCodes.VALIDATION_ERROR, message="Invalid UUID format"
            ),
        )

    # Verify session exists and belongs to user
    session = get_session_or_404(db, session_uuid, current_user)

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
            parent_message_id=(
                str(msg.parent_message_id) if msg.parent_message_id else None
            ),
            branch_id=msg.branch_id,
            created_at=msg.created_at.isoformat() + "Z",
            tokens=msg.tokens,
            model=msg.model,
        )
        for msg in messages
    ]

    return success_response(data=message_responses)
