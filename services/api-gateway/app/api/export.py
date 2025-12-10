"""
API endpoints for conversation export (PDF/Markdown)
"""

from datetime import datetime
from io import BytesIO
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.message import Message
from app.models.session import Session
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

router = APIRouter()


def generate_markdown(session: Session, messages: List[Message], user: User) -> str:
    """
    Generate Markdown export of a conversation.

    Args:
        session: Conversation session
        messages: List of messages
        user: User who owns the session

    Returns:
        Markdown formatted string
    """
    md_lines = []

    # Header
    md_lines.append(f"# {session.title or 'Untitled Conversation'}")
    md_lines.append("")
    md_lines.append(f"**User:** {user.email}")
    md_lines.append(f"**Created:** {session.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    md_lines.append(f"**Last Updated:** {session.updated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    md_lines.append(f"**Messages:** {len(messages)}")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # Messages
    for msg in messages:
        role = msg.role.capitalize()
        timestamp = msg.created_at.strftime("%H:%M:%S")

        md_lines.append(f"## {role} - {timestamp}")
        md_lines.append("")
        md_lines.append(msg.content)
        md_lines.append("")

        # Include tool calls if present
        if msg.tool_calls:
            md_lines.append("**Tool Calls:**")
            md_lines.append("```json")
            import json

            md_lines.append(json.dumps(msg.tool_calls, indent=2))
            md_lines.append("```")
            md_lines.append("")

        # Include tool results if present
        if msg.tool_results:
            md_lines.append("**Tool Results:**")
            md_lines.append("```json")
            import json

            md_lines.append(json.dumps(msg.tool_results, indent=2))
            md_lines.append("```")
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

    # Footer
    md_lines.append("")
    md_lines.append(f"*Exported from VoiceAssist on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}*")

    return "\n".join(md_lines)


def generate_pdf(session: Session, messages: List[Message], user: User) -> bytes:
    """
    Generate PDF export of a conversation.

    Args:
        session: Conversation session
        messages: List of messages
        user: User who owns the session

    Returns:
        PDF bytes
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF generation not available. Install reportlab: pip install reportlab",
        )

    # Create PDF buffer
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=colors.HexColor("#2C3E50"),
        spaceAfter=30,
    )

    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=colors.HexColor("#34495E"),
        spaceAfter=12,
    )

    # Title
    story.append(Paragraph(session.title or "Untitled Conversation", title_style))
    story.append(Spacer(1, 0.2 * inch))

    # Metadata table
    metadata = [
        ["User:", user.email],
        ["Created:", session.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")],
        ["Last Updated:", session.updated_at.strftime("%Y-%m-%d %H:%M:%S UTC")],
        ["Messages:", str(len(messages))],
    ]

    metadata_table = Table(metadata, colWidths=[1.5 * inch, 5 * inch])
    metadata_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONT", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(metadata_table)
    story.append(Spacer(1, 0.3 * inch))

    # Messages
    for msg in messages:
        role = msg.role.capitalize()
        timestamp = msg.created_at.strftime("%H:%M:%S")

        # Message header
        story.append(Paragraph(f"{role} - {timestamp}", heading_style))

        # Message content
        content = msg.content.replace("\n", "<br/>")
        story.append(Paragraph(content, styles["Normal"]))
        story.append(Spacer(1, 0.2 * inch))

    # Footer
    footer_text = f"Exported from VoiceAssist on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}"
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph(footer_text, styles["Italic"]))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.read()


@router.get("/sessions/{session_id}/export/markdown", response_class=StreamingResponse)
async def export_markdown(
    session_id: UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export conversation as Markdown file.

    Args:
        session_id: Session UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        Markdown file
    """
    # Get session
    session = db.query(Session).filter(Session.id == session_id, Session.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Get messages
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at).all()

    # Generate Markdown
    markdown_content = generate_markdown(session, messages, current_user)

    # Return as file
    filename = f"{session.title or 'conversation'}_{session_id}.md"
    return StreamingResponse(
        iter([markdown_content.encode("utf-8")]),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/sessions/{session_id}/export/pdf", response_class=StreamingResponse)
async def export_pdf(
    session_id: UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export conversation as PDF file.

    Args:
        session_id: Session UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        PDF file
    """
    # Get session
    session = db.query(Session).filter(Session.id == session_id, Session.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Get messages
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at).all()

    # Generate PDF
    pdf_bytes = generate_pdf(session, messages, current_user)

    # Return as file
    filename = f"{session.title or 'conversation'}_{session_id}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
