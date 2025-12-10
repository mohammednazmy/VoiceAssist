"""
API endpoints for conversation sharing
"""

import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.session import Session
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

router = APIRouter()


class ShareRequest(BaseModel):
    """Request to share a conversation"""

    expires_in_hours: Optional[int] = 24  # Default 24 hours
    password: Optional[str] = None
    allow_anonymous: bool = True


class ShareResponse(BaseModel):
    """Response with share link"""

    share_id: str
    share_url: str
    expires_at: str
    password_protected: bool


class ConversationShare(BaseModel):
    """Shared conversation details"""

    id: str
    session_id: str
    share_token: str
    created_by: str
    created_at: datetime
    expires_at: datetime
    password_hash: Optional[str] = None
    allow_anonymous: bool
    access_count: int


# In-memory storage for shares (should be moved to database in production)
# Format: {share_token: ConversationShare}
_shares = {}


@router.post("/sessions/{session_id}/share", status_code=status.HTTP_201_CREATED)
async def create_share_link(
    session_id: UUID,
    share_request: ShareRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a shareable link for a conversation.

    Args:
        session_id: Session UUID
        share_request: Share configuration
        db: Database session
        current_user: Authenticated user

    Returns:
        Share link details
    """
    # Verify session exists and belongs to user
    session = db.query(Session).filter(Session.id == session_id, Session.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Generate secure share token
    share_token = secrets.token_urlsafe(32)

    # Calculate expiration
    expires_at = datetime.utcnow() + timedelta(hours=share_request.expires_in_hours)

    # Hash password if provided
    password_hash = None
    if share_request.password:
        from app.core.security import hash_password

        password_hash = hash_password(share_request.password)

    # Create share record
    share = ConversationShare(
        id=share_token,
        session_id=str(session_id),
        share_token=share_token,
        created_by=str(current_user.id),
        created_at=datetime.utcnow(),
        expires_at=expires_at,
        password_hash=password_hash,
        allow_anonymous=share_request.allow_anonymous,
        access_count=0,
    )

    # Store share (in production, save to database)
    _shares[share_token] = share

    # Generate share URL using configured frontend URL
    base_url = settings.FRONTEND_URL.rstrip("/")
    share_url = f"{base_url}/shared/{share_token}"

    return ShareResponse(
        share_id=share_token,
        share_url=share_url,
        expires_at=expires_at.isoformat(),
        password_protected=bool(share_request.password),
    )


@router.get("/shared/{share_token}")
async def get_shared_conversation(
    share_token: str,
    password: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    """
    Access a shared conversation.

    Args:
        share_token: Share token from URL
        password: Optional password for protected shares
        db: Database session

    Returns:
        Shared conversation details
    """
    # Get share record
    share = _shares.get(share_token)
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    # Check expiration
    if datetime.utcnow() > share.expires_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link has expired")

    # Check password if required
    if share.password_hash:
        if not password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password required",
            )

        from app.core.security import verify_password

        if not verify_password(password, share.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password",
            )

    # Increment access count
    share.access_count += 1

    # Get session and messages
    session = db.query(Session).filter(Session.id == UUID(share.session_id)).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Get messages
    from app.models.message import Message

    messages = db.query(Message).filter(Message.session_id == UUID(share.session_id)).order_by(Message.created_at).all()

    return {
        "session": {
            "id": str(session.id),
            "title": session.title,
            "created_at": session.created_at.isoformat(),
            "message_count": len(messages),
        },
        "messages": [
            {
                "id": str(msg.id),
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
            }
            for msg in messages
        ],
        "share_info": {
            "created_at": share.created_at.isoformat(),
            "expires_at": share.expires_at.isoformat(),
            "access_count": share.access_count,
        },
    }


@router.delete("/sessions/{session_id}/share/{share_token}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_link(
    session_id: UUID,
    share_token: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Revoke a share link.

    Args:
        session_id: Session UUID
        share_token: Share token to revoke
        db: Database session
        current_user: Authenticated user
    """
    # Verify session belongs to user
    session = db.query(Session).filter(Session.id == session_id, Session.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Get share and verify ownership
    share = _shares.get(share_token)
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    if share.created_by != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to revoke this share link",
        )

    # Delete share
    del _shares[share_token]

    return None


@router.get("/sessions/{session_id}/shares")
async def list_share_links(
    session_id: UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all active share links for a conversation.

    Args:
        session_id: Session UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        List of share links
    """
    # Verify session belongs to user
    session = db.query(Session).filter(Session.id == session_id, Session.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Find all shares for this session
    shares = [
        share
        for share in _shares.values()
        if share.session_id == str(session_id)
        and share.created_by == str(current_user.id)
        and datetime.utcnow() <= share.expires_at
    ]

    # Generate share URLs using configured frontend URL
    base_url = settings.FRONTEND_URL.rstrip("/")

    return [
        {
            "share_token": share.share_token,
            "share_url": f"{base_url}/shared/{share.share_token}",
            "created_at": share.created_at.isoformat(),
            "expires_at": share.expires_at.isoformat(),
            "password_protected": bool(share.password_hash),
            "access_count": share.access_count,
        }
        for share in shares
    ]
