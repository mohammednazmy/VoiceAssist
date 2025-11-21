"""
Integrations API Endpoints (Phase 6)

Provides API endpoints for Nextcloud integrations:
- Calendar operations (CalDAV)
- File auto-indexing (WebDAV)
- Email operations (IMAP/SMTP)

All endpoints require authentication and return standardized API envelopes.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.core.api_envelope import success_response, error_response, ErrorCodes
from app.core.dependencies import get_current_user, get_current_admin_user
from app.services.caldav_service import CalDAVService, CalendarEvent
from app.services.nextcloud_file_indexer import NextcloudFileIndexer
from app.services.email_service import EmailService, EmailMessage
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/integrations",
    tags=["integrations"]
)


# ===================================
# Request/Response Models
# ===================================

class CreateEventRequest(BaseModel):
    """Request model for creating a calendar event."""
    summary: str = Field(..., description="Event title")
    start: datetime = Field(..., description="Event start time")
    end: datetime = Field(..., description="Event end time")
    description: Optional[str] = Field(None, description="Event description")
    location: Optional[str] = Field(None, description="Event location")
    calendar_id: Optional[str] = Field(None, description="Target calendar ID")


class UpdateEventRequest(BaseModel):
    """Request model for updating a calendar event."""
    summary: Optional[str] = Field(None, description="New event title")
    start: Optional[datetime] = Field(None, description="New start time")
    end: Optional[datetime] = Field(None, description="New end time")
    description: Optional[str] = Field(None, description="New description")
    location: Optional[str] = Field(None, description="New location")


class IndexFileRequest(BaseModel):
    """Request model for indexing a specific file."""
    file_path: str = Field(..., description="Nextcloud file path")
    source_type: str = Field("note", description="Document source type")


class SendEmailRequest(BaseModel):
    """Request model for sending an email."""
    to_addresses: List[str] = Field(..., description="Recipient email addresses")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body")
    cc_addresses: Optional[List[str]] = Field(None, description="CC recipients")
    bcc_addresses: Optional[List[str]] = Field(None, description="BCC recipients")
    is_html: bool = Field(False, description="Whether body is HTML")


# ===================================
# Calendar Endpoints
# ===================================

@router.get("/calendar/calendars")
async def list_calendars(current_admin_user: dict = Depends(get_current_admin_user)):
    """
    List all available calendars for the authenticated user.

    Requires authentication.
    """
    try:
        # Initialize CalDAV service with user credentials
        # NOTE: In production, credentials should be stored securely per-user
        caldav_service = CalDAVService(
            caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        # Connect and list calendars
        if not caldav_service.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to calendar service"
            )

        calendars = caldav_service.list_calendars()

        return success_response(
            data={"calendars": calendars}
        )

    except Exception as e:
        logger.error(f"Error listing calendars: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list calendars"
        )


@router.get("/calendar/events")
async def list_events(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    calendar_id: Optional[str] = Query(None),
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    List calendar events within a date range.

    Requires authentication.
    """
    try:
        caldav_service = CalDAVService(
            caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        events = caldav_service.get_events(
            calendar_id=calendar_id,
            start_date=start_date,
            end_date=end_date
        )

        # Convert to dict for JSON serialization
        events_data = [
            {
                "uid": event.uid,
                "summary": event.summary,
                "description": event.description,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
                "location": event.location,
                "organizer": event.organizer,
                "attendees": event.attendees
            }
            for event in events
        ]

        return success_response(
            data={"events": events_data, "count": len(events_data)}
        )

    except Exception as e:
        logger.error(f"Error listing events: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list events"
        )


@router.post("/calendar/events")
async def create_event(
    request: CreateEventRequest,
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    Create a new calendar event.

    Requires authentication.
    """
    try:
        caldav_service = CalDAVService(
            caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        event_uid = caldav_service.create_event(
            summary=request.summary,
            start=request.start,
            end=request.end,
            description=request.description,
            location=request.location,
            calendar_id=request.calendar_id
        )

        if event_uid:
            return success_response(
                data={"event_uid": event_uid, "status": "created"}
            )
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to create event"
            )

    except Exception as e:
        logger.error(f"Error creating event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to create event"
        )


@router.put("/calendar/events/{event_uid}")
async def update_event(
    event_uid: str,
    request: UpdateEventRequest,
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    Update an existing calendar event.

    Requires authentication.
    """
    try:
        caldav_service = CalDAVService(
            caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        success = caldav_service.update_event(
            event_uid=event_uid,
            summary=request.summary,
            start=request.start,
            end=request.end,
            description=request.description,
            location=request.location
        )

        if success:
            return success_response(
                data={"event_uid": event_uid, "status": "updated"}
            )
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Event not found: {event_uid}"
            )

    except Exception as e:
        logger.error(f"Error updating event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update event"
        )


@router.delete("/calendar/events/{event_uid}")
async def delete_event(
    event_uid: str,
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    Delete a calendar event.

    Requires authentication.
    """
    try:
        caldav_service = CalDAVService(
            caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        success = caldav_service.delete_event(event_uid=event_uid)

        if success:
            return success_response(
                data={"event_uid": event_uid, "status": "deleted"}
            )
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Event not found: {event_uid}"
            )

    except Exception as e:
        logger.error(f"Error deleting event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete event"
        )


# ===================================
# File Indexing Endpoints
# ===================================

@router.post("/files/scan-and-index")
async def scan_and_index_files(
    source_type: str = Query("note", description="Default source type for indexed documents"),
    force_reindex: bool = Query(False, description="Force re-indexing of all files"),
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    Scan Nextcloud directories and auto-index medical documents.

    This endpoint triggers a full scan of configured watch directories
    and indexes all supported medical documents into the knowledge base.

    Requires authentication (admin role recommended).
    """
    try:
        # Initialize file indexer
        indexer = NextcloudFileIndexer(
            webdav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/files/" + settings.NEXTCLOUD_ADMIN_USER + "/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD,
            watch_directories=["Medical Documents", "Guidelines", "Textbooks"]
        )

        # Connect to Nextcloud
        if not indexer.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to Nextcloud"
            )

        # Scan and index
        summary = await indexer.scan_and_index(
            source_type=source_type,
            force_reindex=force_reindex
        )

        return success_response(
            data=summary
        )

    except Exception as e:
        logger.error(f"Error scanning and indexing files: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to scan and index files"
        )


@router.post("/files/index")
async def index_specific_file(
    request: IndexFileRequest,
    current_admin_user: dict = Depends(get_current_admin_user)
):
    """
    Index a specific Nextcloud file into the knowledge base.

    Useful for manually triggering indexing of a single document.

    Requires authentication (admin role recommended).
    """
    try:
        # Initialize file indexer
        indexer = NextcloudFileIndexer(
            webdav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/files/" + settings.NEXTCLOUD_ADMIN_USER + "/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD
        )

        # Connect to Nextcloud
        if not indexer.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to Nextcloud"
            )

        # Index specific file
        result = await indexer.index_specific_file(
            file_path=request.file_path,
            source_type=request.source_type
        )

        if result and result.success:
            return success_response(
                data={
                    "document_id": result.document_id,
                    "chunks_indexed": result.chunks_indexed,
                    "processing_time_ms": result.processing_time_ms,
                    "status": "indexed"
                }
            )
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to index file"
            )

    except Exception as e:
        logger.error(f"Error indexing file: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to index file"
        )


# ===================================
# Email Endpoints (Skeleton)
# ===================================

@router.get("/email/folders")
async def list_email_folders(current_user: dict = Depends(get_current_user)):
    """
    List mailbox folders.

    NOTE: This is a skeleton implementation. Email configuration
    needs to be set up per-user in production.

    Requires authentication.
    """
    return error_response(
        code="NOT_IMPLEMENTED",
        message="Email integration is not yet configured. This is a skeleton endpoint for Phase 6."
    )


@router.get("/email/messages")
async def list_email_messages(
    folder: str = Query("INBOX"),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    List recent email messages from a folder.

    NOTE: This is a skeleton implementation for Phase 6 MVP.

    Requires authentication.
    """
    return error_response(
        code="NOT_IMPLEMENTED",
        message="Email integration is not yet configured. This is a skeleton endpoint for Phase 6."
    )


@router.post("/email/send")
async def send_email(
    request: SendEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Send an email.

    NOTE: This is a skeleton implementation for Phase 6 MVP.

    Requires authentication.
    """
    return error_response(
        code="NOT_IMPLEMENTED",
        message="Email integration is not yet configured. This is a skeleton endpoint for Phase 6."
    )
