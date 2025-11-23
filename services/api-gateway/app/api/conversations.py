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
from app.core.logging import get_logger
from app.core.security import get_current_user
from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/conversations", tags=["conversations"])
logger = get_logger(__name__)


# Pydantic Schemas
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


# API Endpoints
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


@router.get("/{session_id}/branches", response_model=List[BranchInfo])
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


@router.get(
    "/{session_id}/branches/{branch_id}/messages", response_model=List[MessageResponse]
)
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
