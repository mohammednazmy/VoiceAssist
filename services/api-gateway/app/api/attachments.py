"""
API endpoints for message attachments
"""

from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.attachment import MessageAttachment
from app.models.message import Message
from app.models.user import User
from app.services.storage_service import get_storage_service
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/messages/{message_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    message_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a file attachment to a message.

    Args:
        message_id: Message UUID
        file: File to upload
        db: Database session
        current_user: Authenticated user

    Returns:
        Attachment metadata
    """
    storage_service = get_storage_service()

    # Verify message exists and belongs to user's session
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    # Verify user has access to the session
    # Note: Add session ownership check based on your Session model
    # session = db.query(Session).filter(Session.id == message.session_id, Session.user_id == current_user.id).first()
    # if not session:
    #     raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Validate file type
    if not storage_service.is_allowed_file_type(file.filename):
        allowed_types = [
            ".pdf",
            ".txt",
            ".md",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".doc",
            ".docx",
        ]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(allowed_types)}",
        )

    # Validate file size
    if file.size and file.size > storage_service.get_file_size_limit():
        max_mb = storage_service.get_file_size_limit() // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {max_mb}MB",
        )

    # Upload file
    file_url = await storage_service.upload_file(file, str(current_user.id), str(message_id))

    # Create attachment record
    attachment = MessageAttachment(
        message_id=message_id,
        file_name=file.filename,
        file_type=file.content_type.split("/")[0] if file.content_type else "unknown",
        file_size=file.size or 0,
        file_url=file_url,
        mime_type=file.content_type,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return attachment.to_dict()


@router.get("/messages/{message_id}/attachments")
async def list_attachments(
    message_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all attachments for a message.

    Args:
        message_id: Message UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        List of attachment metadata
    """
    # Verify message exists
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    # Get attachments
    attachments = db.query(MessageAttachment).filter(MessageAttachment.message_id == message_id).all()

    return [attachment.to_dict() for attachment in attachments]


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an attachment.

    Args:
        attachment_id: Attachment UUID
        db: Database session
        current_user: Authenticated user
    """
    storage_service = get_storage_service()

    # Get attachment
    attachment = db.query(MessageAttachment).filter(MessageAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    # Verify user has access to the message's session
    # Add ownership verification here

    # Delete file from storage
    await storage_service.delete_file(attachment.file_url)

    # Delete database record
    db.delete(attachment)
    db.commit()

    return None


@router.get("/attachments/{attachment_id}/download", response_class=StreamingResponse)
async def download_attachment(
    attachment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download an attachment file.

    Args:
        attachment_id: Attachment UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        File stream
    """
    storage_service = get_storage_service()

    # Get attachment
    attachment = db.query(MessageAttachment).filter(MessageAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    # Verify user has access to the message's session
    # Add ownership verification here

    # Get file content
    file_content = await storage_service.get_file(attachment.file_url)
    if not file_content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")

    # Return file stream
    return StreamingResponse(
        iter([file_content]),
        media_type=attachment.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={attachment.file_name}"},
    )
