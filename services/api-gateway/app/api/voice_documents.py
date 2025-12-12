"""
Voice Document Session API

Provides endpoints for managing document navigation state in voice mode:
- Start a document session (set active document for a conversation)
- Get current session state (position, page, section)
- Update position (for navigation commands)
- End session

These endpoints support voice commands like:
- "I want to read Harrison's Principles"
- "Go to page 40"
- "What's in the table of contents?"
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.models.document import Document
from app.models.user import User
from app.models.voice_document_session import VoiceDocumentSession

router = APIRouter(prefix="/api/voice/documents", tags=["voice", "documents"])
logger = get_logger(__name__)


# ========== Request/Response Models ==========


class StartSessionRequest(BaseModel):
    """Request to start a document session."""

    document_id: str
    conversation_id: str


class SessionResponse(BaseModel):
    """Response with session details."""

    session_id: str
    document_id: str
    document_title: str
    total_pages: Optional[int]
    has_toc: bool
    has_figures: bool
    current_page: int
    current_section_id: Optional[str]
    is_active: bool


class UpdatePositionRequest(BaseModel):
    """Request to update position in document."""

    page: Optional[int] = None
    section_id: Optional[str] = None


# ========== Endpoints ==========


@router.post("/session", response_model=dict)
async def start_document_session(
    document_id: str = Form(...),
    conversation_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start a voice document session.

    Sets the active document for a conversation, enabling voice navigation
    commands like "read page 40" or "go to next section".

    If a session already exists for this conversation, it is updated
    with the new document.

    Args:
        document_id: Document to activate
        conversation_id: Conversation ID for this session
    """
    # Verify document exists and user has access
    document = db.query(Document).filter(Document.document_id == document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Check access
    if document.owner_id != current_user.id and not document.is_public:
        return error_response(
            code=ErrorCodes.FORBIDDEN,
            message="Access denied to this document",
        )

    # Check if document is indexed
    if document.indexing_status != "indexed":
        return error_response(
            code=ErrorCodes.PRECONDITION_FAILED,
            message=f"Document is not ready (status: {document.indexing_status})",
        )

    # Find or create session
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
            )
        )
        .first()
    )

    if session:
        # Update existing session
        session.document_id = document_id
        session.current_page = 1
        session.current_section_id = None
        session.last_read_position = 0
        session.is_active = True
        session.updated_at = datetime.now(timezone.utc)
    else:
        # Create new session
        session = VoiceDocumentSession(
            conversation_id=conversation_id,
            user_id=current_user.id,
            document_id=document_id,
            current_page=1,
            current_section_id=None,
            last_read_position=0,
            is_active=True,
        )
        db.add(session)

    db.commit()
    db.refresh(session)

    logger.info(f"Started document session for {document_id} in conversation {conversation_id}")

    return success_response(
        data={
            "session_id": str(session.id),
            "document_id": document_id,
            "document_title": document.title,
            "total_pages": document.total_pages,
            "has_toc": document.has_toc,
            "has_figures": document.has_figures,
            "current_page": session.current_page,
            "current_section_id": session.current_section_id,
            "is_active": session.is_active,
        }
    )


@router.get("/session/{conversation_id}", response_model=dict)
async def get_document_session(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current document session state.

    Returns the active document and current position for a conversation.
    If no active session exists, returns {active: false}.
    """
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
                VoiceDocumentSession.is_active == True,  # noqa: E712
            )
        )
        .first()
    )

    if not session:
        return success_response(
            data={
                "active": False,
                "conversation_id": conversation_id,
            }
        )

    # Get document details
    document = db.query(Document).filter(Document.document_id == session.document_id).first()

    if not document:
        # Document was deleted, clean up session
        session.is_active = False
        db.commit()
        return success_response(
            data={
                "active": False,
                "conversation_id": conversation_id,
            }
        )

    # Get current section title if in a section
    current_section_title = None
    if session.current_section_id and document.structure:
        for section in document.structure.get("sections", []):
            if section.get("section_id") == session.current_section_id:
                current_section_title = section.get("title")
                break

    return success_response(
        data={
            "active": True,
            "session_id": str(session.id),
            "document_id": session.document_id,
            "document_title": document.title,
            "total_pages": document.total_pages,
            "has_toc": document.has_toc,
            "has_figures": document.has_figures,
            "current_page": session.current_page,
            "current_section_id": session.current_section_id,
            "current_section_title": current_section_title,
            "conversation_id": conversation_id,
        }
    )


@router.patch("/session/{conversation_id}", response_model=dict)
async def update_session_position(
    conversation_id: str,
    page: Optional[int] = Form(None),
    section_id: Optional[str] = Form(None),
    last_read_position: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update current position in document.

    Used by navigation tools to track position after:
    - "Go to page 40"
    - "Go to next section"
    - Reading content
    """
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
                VoiceDocumentSession.is_active == True,  # noqa: E712
            )
        )
        .first()
    )

    if not session:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="No active document session",
        )

    # Update position
    if page is not None:
        session.current_page = page
    if section_id is not None:
        session.current_section_id = section_id
    if last_read_position is not None:
        session.last_read_position = last_read_position

    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return success_response(
        data={
            "session_id": str(session.id),
            "current_page": session.current_page,
            "current_section_id": session.current_section_id,
            "last_read_position": session.last_read_position,
        }
    )


@router.delete("/session/{conversation_id}", response_model=dict)
async def end_document_session(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    End the document session for a conversation.

    Deactivates the session, removing the active document context.
    """
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
                VoiceDocumentSession.is_active == True,  # noqa: E712
            )
        )
        .first()
    )

    if not session:
        return success_response(
            data={
                "message": "No active session to end",
                "conversation_id": conversation_id,
            }
        )

    session.is_active = False
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"Ended document session for conversation {conversation_id}")

    return success_response(
        data={
            "message": "Document session ended",
            "session_id": str(session.id),
            "conversation_id": conversation_id,
        }
    )


@router.get("/session/{conversation_id}/page/{page_number}", response_model=dict)
async def get_page_content(
    conversation_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get content of a specific page from the active document.

    This endpoint is used by voice navigation to read page content.
    """
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
                VoiceDocumentSession.is_active == True,  # noqa: E712
            )
        )
        .first()
    )

    if not session:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="No active document session",
        )

    document = db.query(Document).filter(Document.document_id == session.document_id).first()

    if not document:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document not found",
        )

    # Use enhanced structure for page content when available, but always
    # fall back to the original structure for navigation metadata (sections,
    # TOC, figures) since those remain the canonical navigation index.
    enhanced_structure = document.enhanced_structure or {}
    base_structure = document.structure or {}

    if not enhanced_structure and not base_structure:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document structure not available",
        )

    structure_for_pages = enhanced_structure or base_structure

    # Find page content
    pages = structure_for_pages.get("pages", [])
    page_content = None
    for page in pages:
        if page.get("page_number") == page_number:
            page_content = page
            break

    if not page_content:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message=f"Page {page_number} not found. Document has {document.total_pages} pages.",
        )

    # Determine current section using the original structure's section index
    current_section_id = None
    current_section_title = None
    sections = base_structure.get("sections", []) if base_structure else []
    sections_on_page = []

    for section in sections:
        start_page = section.get("start_page")
        end_page = section.get("end_page") or start_page
        if start_page is None:
            continue
        if start_page <= page_number <= end_page:
            # First matching section is treated as the current cursor
            if current_section_id is None:
                current_section_id = section.get("section_id")
                current_section_title = section.get("title")
            sections_on_page.append(
                {
                    "section_id": section.get("section_id"),
                    "title": section.get("title"),
                    "level": section.get("level"),
                    "start_page": start_page,
                    "end_page": end_page,
                }
            )

    # Update session position (and section cursor when we can infer it)
    session.current_page = page_number
    if current_section_id:
        session.current_section_id = current_section_id
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Get figures on this page from the canonical structure metadata
    figures_source = base_structure or enhanced_structure
    page_figures = [f for f in figures_source.get("figures", []) if f.get("page_number") == page_number]

    # Prefer enhanced content when available
    raw_text = page_content.get("raw_text") or page_content.get("text") or ""
    word_count = page_content.get("word_count")
    if word_count is None and raw_text:
        word_count = len(raw_text.split())

    # If enhanced content_blocks exist, derive a voice-friendly summary text
    voice_narration = page_content.get("voice_narration") or ""
    content_blocks = page_content.get("content_blocks") or []
    if not voice_narration and content_blocks:
        # Fallback summary from first few text/heading blocks
        parts = []
        for block in content_blocks:
            if block.get("type") in ("heading", "text") and block.get("content"):
                parts.append(block["content"])
            if len(parts) >= 3:
                break
        if parts:
            voice_narration = " ".join(parts)

    # Extract simple heading metadata for navigation-aware UIs
    page_headings = [
        {
            "type": block.get("type"),
            "content": block.get("content"),
        }
        for block in content_blocks
        if block.get("type") == "heading" and block.get("content")
    ]

    return success_response(
        data={
            "page_number": page_number,
            "total_pages": document.total_pages,
            "content": raw_text,
            "word_count": word_count or 0,
            "has_figures": page_content.get("has_figures", False),
            "figures": page_figures,
            "voice_narration": voice_narration,
            "has_enhanced_content": bool(content_blocks),
            # Navigation metadata for document-aware voice and UI flows
            "page_headings": page_headings,
            "current_section_id": current_section_id,
            "current_section_title": current_section_title,
            "sections_on_page": sections_on_page,
        }
    )


@router.get("/session/{conversation_id}/toc", response_model=dict)
async def get_document_toc(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get table of contents for the active document.

    Returns TOC entries with titles, levels, and page numbers.
    """
    session = (
        db.query(VoiceDocumentSession)
        .filter(
            and_(
                VoiceDocumentSession.conversation_id == conversation_id,
                VoiceDocumentSession.user_id == current_user.id,
                VoiceDocumentSession.is_active == True,  # noqa: E712
            )
        )
        .first()
    )

    if not session:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="No active document session",
        )

    document = db.query(Document).filter(Document.document_id == session.document_id).first()

    if not document or not document.structure:
        return error_response(
            code=ErrorCodes.NOT_FOUND,
            message="Document structure not available",
        )

    toc = document.structure.get("toc", [])

    if not toc:
        return success_response(
            data={
                "has_toc": False,
                "toc": [],
                "message": "This document doesn't have a table of contents.",
            }
        )

    return success_response(
        data={
            "has_toc": True,
            "toc": toc,
            "document_title": document.title,
        }
    )
