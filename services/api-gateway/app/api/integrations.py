"""
Integrations API Endpoints (Phase 4 - Nextcloud Integration)

Provides API endpoints for Nextcloud integrations:
- OIDC authentication (SSO with Nextcloud)
- Calendar operations (CalDAV)
- Contact operations (CardDAV)
- Email operations (IMAP/SMTP)
- File auto-indexing (WebDAV)

All endpoints require authentication and return standardized API envelopes.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.api_envelope import ErrorCodes, error_response, success_response
from app.core.config import settings
from app.core.dependencies import get_current_admin_user, get_current_user
from app.services.caldav_service import CalDAVService
from app.services.carddav_service import AddressType, CardDAVService, Contact, ContactSearchQuery
from app.services.carddav_service import EmailAddress as CardEmailAddress
from app.services.carddav_service import EmailType, PhoneNumber, PhoneType, PostalAddress
from app.services.email_service import Email, EmailService
from app.services.nextcloud_file_indexer import NextcloudFileIndexer
from app.services.oidc_service import AuthorizationRequest, OIDCProvider, OIDCService
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ===================================
# OIDC Request/Response Models
# ===================================


class OIDCAuthStartRequest(BaseModel):
    """Request to start OIDC authentication flow."""

    provider: str = Field(..., description="OIDC provider (nextcloud, google, microsoft)")
    redirect_uri: str = Field(..., description="Where to redirect after auth")


class OIDCAuthStartResponse(BaseModel):
    """Response with authorization URL."""

    authorization_url: str
    state: str
    nonce: str


class OIDCCallbackRequest(BaseModel):
    """OIDC callback request."""

    code: str = Field(..., description="Authorization code from provider")
    state: str = Field(..., description="State parameter for CSRF validation")


class OIDCUserInfo(BaseModel):
    """OIDC user information."""

    sub: str
    email: Optional[str] = None
    name: Optional[str] = None
    preferred_username: Optional[str] = None
    picture: Optional[str] = None


# ===================================
# Calendar Request/Response Models
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


# ===================================
# Contact Request/Response Models
# ===================================


class PhoneNumberRequest(BaseModel):
    """Phone number input."""

    number: str
    type: str = "OTHER"
    is_primary: bool = False


class EmailAddressRequest(BaseModel):
    """Email address input."""

    email: EmailStr
    type: str = "OTHER"
    is_primary: bool = False


class PostalAddressRequest(BaseModel):
    """Postal address input."""

    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    type: str = "OTHER"


class CreateContactRequest(BaseModel):
    """Request to create a contact."""

    display_name: str = Field(..., description="Contact display name")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    nickname: Optional[str] = None
    emails: List[EmailAddressRequest] = Field(default_factory=list)
    phones: List[PhoneNumberRequest] = Field(default_factory=list)
    addresses: List[PostalAddressRequest] = Field(default_factory=list)
    organization: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    website: Optional[str] = None
    categories: List[str] = Field(default_factory=list)


class UpdateContactRequest(BaseModel):
    """Request to update a contact."""

    display_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    nickname: Optional[str] = None
    emails: Optional[List[EmailAddressRequest]] = None
    phones: Optional[List[PhoneNumberRequest]] = None
    addresses: Optional[List[PostalAddressRequest]] = None
    organization: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    website: Optional[str] = None
    categories: Optional[List[str]] = None


# ===================================
# Email Request/Response Models
# ===================================


class SendEmailRequest(BaseModel):
    """Request model for sending an email."""

    to_addresses: List[EmailStr] = Field(..., description="Recipient email addresses")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body")
    cc_addresses: Optional[List[EmailStr]] = Field(None, description="CC recipients")
    bcc_addresses: Optional[List[EmailStr]] = Field(None, description="BCC recipients")
    is_html: bool = Field(False, description="Whether body is HTML")
    reply_to: Optional[str] = Field(None, description="Message-ID to reply to")


class EmailSearchRequest(BaseModel):
    """Request model for searching emails."""

    query: str = Field(..., description="Search query")
    folder: str = Field("INBOX", description="Folder to search in")
    limit: int = Field(50, le=200, description="Maximum results")


# ===================================
# File Indexing Request Models
# ===================================


class IndexFileRequest(BaseModel):
    """Request model for indexing a specific file."""

    file_path: str = Field(..., description="Nextcloud file path")
    source_type: str = Field("note", description="Document source type")


# ===================================
# Helper Functions
# ===================================


def get_oidc_service() -> OIDCService:
    """Get OIDC service instance."""
    return OIDCService()


def get_caldav_service() -> CalDAVService:
    """Get CalDAV service instance with Nextcloud credentials."""
    return CalDAVService(
        caldav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/",
        username=settings.NEXTCLOUD_ADMIN_USER,
        password=settings.NEXTCLOUD_ADMIN_PASSWORD,
    )


def get_carddav_service() -> CardDAVService:
    """Get CardDAV service instance with Nextcloud credentials."""
    return CardDAVService(
        base_url=settings.NEXTCLOUD_URL,
        username=settings.NEXTCLOUD_ADMIN_USER,
        password=settings.NEXTCLOUD_ADMIN_PASSWORD,
    )


def get_email_service() -> EmailService:
    """Get email service instance."""
    return EmailService(
        imap_host=getattr(settings, "IMAP_HOST", ""),
        imap_port=getattr(settings, "IMAP_PORT", 993),
        smtp_host=getattr(settings, "SMTP_HOST", ""),
        smtp_port=getattr(settings, "SMTP_PORT", 587),
        username=getattr(settings, "EMAIL_USERNAME", ""),
        password=getattr(settings, "EMAIL_PASSWORD", ""),
        use_ssl=getattr(settings, "EMAIL_USE_SSL", True),
    )


def contact_to_dict(contact: Contact) -> Dict[str, Any]:
    """Convert Contact dataclass to dict for JSON serialization."""
    return {
        "uid": contact.uid,
        "display_name": contact.display_name,
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "middle_name": contact.middle_name,
        "nickname": contact.nickname,
        "emails": [{"email": e.email, "type": e.type.value, "is_primary": e.is_primary} for e in contact.emails],
        "phones": [{"number": p.number, "type": p.type.value, "is_primary": p.is_primary} for p in contact.phones],
        "addresses": [
            {
                "street": a.street,
                "city": a.city,
                "state": a.state,
                "postal_code": a.postal_code,
                "country": a.country,
                "type": a.type.value,
            }
            for a in contact.addresses
        ],
        "organization": contact.organization,
        "title": contact.title,
        "notes": contact.notes,
        "website": contact.website,
        "categories": contact.categories,
        "birthday": contact.birthday.isoformat() if contact.birthday else None,
        "created": contact.created.isoformat() if contact.created else None,
        "modified": contact.modified.isoformat() if contact.modified else None,
    }


def email_to_dict(email: Email) -> Dict[str, Any]:
    """Convert Email dataclass to dict for JSON serialization."""
    return {
        "id": email.id,
        "message_id": email.message_id,
        "uid": email.uid,
        "subject": email.subject,
        "from_addr": str(email.from_addr) if email.from_addr else None,
        "to_addrs": [str(a) for a in email.to_addrs],
        "cc_addrs": [str(a) for a in email.cc_addrs] if email.cc_addrs else [],
        "date": email.date.isoformat() if email.date else None,
        "preview": email.preview,
        "is_read": email.is_read,
        "is_flagged": email.is_flagged,
        "has_attachments": email.has_attachments,
        "folder": email.folder,
        "thread_id": email.thread_id,
    }


# ===================================
# OIDC Authentication Endpoints
# ===================================


# Store for OIDC state/nonce (in production, use Redis)
_oidc_states: Dict[str, Dict[str, str]] = {}


@router.post("/oidc/auth/start")
async def start_oidc_auth(request: OIDCAuthStartRequest):
    """
    Start OIDC authentication flow.

    Returns an authorization URL to redirect the user to.
    """
    try:
        # Validate provider
        provider_str = request.provider.lower()
        if provider_str == "nextcloud":
            provider = OIDCProvider.NEXTCLOUD
        elif provider_str == "google":
            provider = OIDCProvider.GOOGLE
        elif provider_str == "microsoft":
            provider = OIDCProvider.MICROSOFT
        else:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message=f"Unknown provider: {request.provider}",
            )

        # Generate state and nonce
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)

        # Store for validation
        _oidc_states[state] = {
            "nonce": nonce,
            "redirect_uri": request.redirect_uri,
            "provider": provider_str,
        }

        # Build authorization URL
        service = get_oidc_service()
        auth_request = AuthorizationRequest(
            provider=provider,
            redirect_uri=request.redirect_uri,
            state=state,
            nonce=nonce,
        )

        auth_url = await service.get_authorization_url(auth_request)

        return success_response(
            data={
                "authorization_url": auth_url,
                "state": state,
                "nonce": nonce,
            }
        )

    except Exception as e:
        logger.error(f"Error starting OIDC auth: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to start authentication",
        )


@router.post("/oidc/auth/callback")
async def handle_oidc_callback(request: OIDCCallbackRequest):
    """
    Handle OIDC callback after provider authentication.

    Exchanges authorization code for tokens and returns user info.
    """
    try:
        # Validate state
        if request.state not in _oidc_states:
            return error_response(
                code=ErrorCodes.VALIDATION_ERROR,
                message="Invalid or expired state parameter",
            )

        state_data = _oidc_states.pop(request.state)
        nonce = state_data["nonce"]
        redirect_uri = state_data["redirect_uri"]
        provider_str = state_data["provider"]

        # Map provider
        provider_map = {
            "nextcloud": OIDCProvider.NEXTCLOUD,
            "google": OIDCProvider.GOOGLE,
            "microsoft": OIDCProvider.MICROSOFT,
        }
        provider = provider_map.get(provider_str, OIDCProvider.NEXTCLOUD)

        # Exchange code for tokens
        service = get_oidc_service()
        auth_request = AuthorizationRequest(
            provider=provider,
            redirect_uri=redirect_uri,
            state=request.state,
            nonce=nonce,
        )

        tokens = await service.exchange_code(request.code, auth_request)

        # Validate ID token
        claims = await service.validate_id_token(tokens.id_token, nonce, provider)

        return success_response(
            data={
                "access_token": tokens.access_token,
                "id_token": tokens.id_token,
                "refresh_token": tokens.refresh_token,
                "expires_in": tokens.expires_in,
                "user": {
                    "sub": claims.sub,
                    "email": claims.email,
                    "name": claims.name,
                    "preferred_username": claims.preferred_username,
                },
            }
        )

    except Exception as e:
        logger.error(f"Error handling OIDC callback: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Authentication failed",
        )


@router.get("/oidc/userinfo")
async def get_oidc_userinfo(
    current_user: dict = Depends(get_current_user),
):
    """
    Get user info from OIDC provider.

    Requires authentication via access token.
    """
    try:
        # Get access token from session/request
        access_token = current_user.get("oidc_access_token")
        if not access_token:
            return error_response(
                code=ErrorCodes.UNAUTHORIZED,
                message="No OIDC access token found",
            )

        service = get_oidc_service()
        user_info = await service.get_nextcloud_user(access_token)

        return success_response(
            data={
                "user_id": user_info.user_id,
                "display_name": user_info.display_name,
                "email": user_info.email,
                "groups": user_info.groups,
                "quota_used": user_info.quota_used,
                "quota_total": user_info.quota_total,
            }
        )

    except Exception as e:
        logger.error(f"Error getting user info: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get user info",
        )


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
        caldav_service = get_caldav_service()

        if not caldav_service.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to calendar service",
            )

        calendars = caldav_service.list_calendars()

        return success_response(data={"calendars": calendars})

    except Exception as e:
        logger.error(f"Error listing calendars: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list calendars",
        )


@router.get("/calendar/events")
async def list_events(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    calendar_id: Optional[str] = Query(None),
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    List calendar events within a date range.

    Requires authentication.
    """
    try:
        caldav_service = get_caldav_service()

        events = caldav_service.get_events(
            calendar_id=calendar_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Convert to dict for JSON serialization
        events_data = [
            {
                "uid": event.uid,
                "summary": event.summary,
                "description": event.description,
                "start": (event.start.isoformat() if hasattr(event.start, "isoformat") else str(event.start)),
                "end": (event.end.isoformat() if hasattr(event.end, "isoformat") else str(event.end)),
                "location": event.location,
                "organizer": event.organizer,
                "attendees": event.attendees,
            }
            for event in events
        ]

        return success_response(data={"events": events_data, "count": len(events_data)})

    except Exception as e:
        logger.error(f"Error listing events: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to list events",
        )


@router.post("/calendar/events")
async def create_event(
    request: CreateEventRequest,
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    Create a new calendar event.

    Requires authentication.
    """
    try:
        caldav_service = get_caldav_service()

        event_uid = caldav_service.create_event(
            summary=request.summary,
            start=request.start,
            end=request.end,
            description=request.description,
            location=request.location,
            calendar_id=request.calendar_id,
        )

        if event_uid:
            return success_response(data={"event_uid": event_uid, "status": "created"})
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to create event",
            )

    except Exception as e:
        logger.error(f"Error creating event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to create event",
        )


@router.put("/calendar/events/{event_uid}")
async def update_event(
    event_uid: str,
    request: UpdateEventRequest,
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    Update an existing calendar event.

    Requires authentication.
    """
    try:
        caldav_service = get_caldav_service()

        success = caldav_service.update_event(
            event_uid=event_uid,
            summary=request.summary,
            start=request.start,
            end=request.end,
            description=request.description,
            location=request.location,
        )

        if success:
            return success_response(data={"event_uid": event_uid, "status": "updated"})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Event not found: {event_uid}",
            )

    except Exception as e:
        logger.error(f"Error updating event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update event",
        )


@router.delete("/calendar/events/{event_uid}")
async def delete_event(
    event_uid: str,
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    Delete a calendar event.

    Requires authentication.
    """
    try:
        caldav_service = get_caldav_service()

        success = caldav_service.delete_event(event_uid=event_uid)

        if success:
            return success_response(data={"event_uid": event_uid, "status": "deleted"})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Event not found: {event_uid}",
            )

    except Exception as e:
        logger.error(f"Error deleting event: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete event",
        )


# ===================================
# Contact Endpoints (CardDAV)
# ===================================


@router.get("/contacts/addressbooks")
async def list_address_books(current_user: dict = Depends(get_current_user)):
    """
    List all address books for the authenticated user.
    """
    try:
        service = get_carddav_service()
        address_books = await service.list_address_books()

        return success_response(
            data={
                "address_books": [
                    {
                        "name": ab.name,
                        "display_name": ab.display_name,
                        "url": ab.url,
                        "description": ab.description,
                        "contact_count": ab.contact_count,
                    }
                    for ab in address_books
                ]
            }
        )

    except Exception as e:
        logger.error(f"Error listing address books: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
            message="Failed to list address books",
        )


@router.get("/contacts")
async def list_contacts(
    address_book: str = Query("contacts", description="Address book name"),
    search: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(100, le=500, description="Maximum results"),
    current_user: dict = Depends(get_current_user),
):
    """
    List contacts in an address book.
    """
    try:
        service = get_carddav_service()

        query = None
        if search:
            query = ContactSearchQuery(text=search, limit=limit)

        contacts = await service.list_contacts(address_book=address_book, query=query)

        return success_response(
            data={
                "contacts": [contact_to_dict(c) for c in contacts[:limit]],
                "count": len(contacts),
            }
        )

    except Exception as e:
        logger.error(f"Error listing contacts: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
            message="Failed to list contacts",
        )


@router.get("/contacts/{uid}")
async def get_contact(
    uid: str,
    address_book: str = Query("contacts", description="Address book name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get a specific contact by UID.
    """
    try:
        service = get_carddav_service()
        contact = await service.get_contact(uid=uid, address_book=address_book)

        if contact:
            return success_response(data={"contact": contact_to_dict(contact)})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Contact not found: {uid}",
            )

    except Exception as e:
        logger.error(f"Error getting contact: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get contact",
        )


@router.post("/contacts")
async def create_contact(
    request: CreateContactRequest,
    address_book: str = Query("contacts", description="Address book name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new contact.
    """
    try:
        import uuid

        service = get_carddav_service()

        # Build Contact object
        contact = Contact(
            uid=str(uuid.uuid4()),
            display_name=request.display_name,
            first_name=request.first_name,
            last_name=request.last_name,
            middle_name=request.middle_name,
            nickname=request.nickname,
            organization=request.organization,
            title=request.title,
            notes=request.notes,
            website=request.website,
            categories=request.categories,
            emails=[
                CardEmailAddress(
                    email=e.email,
                    type=(EmailType[e.type.upper()] if e.type.upper() in EmailType.__members__ else EmailType.OTHER),
                    is_primary=e.is_primary,
                )
                for e in request.emails
            ],
            phones=[
                PhoneNumber(
                    number=p.number,
                    type=(PhoneType[p.type.upper()] if p.type.upper() in PhoneType.__members__ else PhoneType.OTHER),
                    is_primary=p.is_primary,
                )
                for p in request.phones
            ],
            addresses=[
                PostalAddress(
                    street=a.street,
                    city=a.city,
                    state=a.state,
                    postal_code=a.postal_code,
                    country=a.country,
                    type=(
                        AddressType[a.type.upper()] if a.type.upper() in AddressType.__members__ else AddressType.OTHER
                    ),
                )
                for a in request.addresses
            ],
        )

        new_uid = await service.create_contact(contact=contact, address_book=address_book)

        return success_response(
            data={
                "uid": new_uid,
                "status": "created",
            }
        )

    except Exception as e:
        logger.error(f"Error creating contact: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to create contact",
        )


@router.put("/contacts/{uid}")
async def update_contact(
    uid: str,
    request: UpdateContactRequest,
    address_book: str = Query("contacts", description="Address book name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing contact.
    """
    try:
        service = get_carddav_service()

        # Get existing contact
        existing = await service.get_contact(uid=uid, address_book=address_book)
        if not existing:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Contact not found: {uid}",
            )

        # Update fields
        if request.display_name is not None:
            existing.display_name = request.display_name
        if request.first_name is not None:
            existing.first_name = request.first_name
        if request.last_name is not None:
            existing.last_name = request.last_name
        if request.middle_name is not None:
            existing.middle_name = request.middle_name
        if request.nickname is not None:
            existing.nickname = request.nickname
        if request.organization is not None:
            existing.organization = request.organization
        if request.title is not None:
            existing.title = request.title
        if request.notes is not None:
            existing.notes = request.notes
        if request.website is not None:
            existing.website = request.website
        if request.categories is not None:
            existing.categories = request.categories

        if request.emails is not None:
            existing.emails = [
                CardEmailAddress(
                    email=e.email,
                    type=(EmailType[e.type.upper()] if e.type.upper() in EmailType.__members__ else EmailType.OTHER),
                    is_primary=e.is_primary,
                )
                for e in request.emails
            ]

        if request.phones is not None:
            existing.phones = [
                PhoneNumber(
                    number=p.number,
                    type=(PhoneType[p.type.upper()] if p.type.upper() in PhoneType.__members__ else PhoneType.OTHER),
                    is_primary=p.is_primary,
                )
                for p in request.phones
            ]

        if request.addresses is not None:
            existing.addresses = [
                PostalAddress(
                    street=a.street,
                    city=a.city,
                    state=a.state,
                    postal_code=a.postal_code,
                    country=a.country,
                    type=(
                        AddressType[a.type.upper()] if a.type.upper() in AddressType.__members__ else AddressType.OTHER
                    ),
                )
                for a in request.addresses
            ]

        success = await service.update_contact(contact=existing, address_book=address_book)

        if success:
            return success_response(data={"uid": uid, "status": "updated"})
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to update contact",
            )

    except Exception as e:
        logger.error(f"Error updating contact: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update contact",
        )


@router.delete("/contacts/{uid}")
async def delete_contact(
    uid: str,
    address_book: str = Query("contacts", description="Address book name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a contact.
    """
    try:
        service = get_carddav_service()
        success = await service.delete_contact(uid=uid, address_book=address_book)

        if success:
            return success_response(data={"uid": uid, "status": "deleted"})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Contact not found: {uid}",
            )

    except Exception as e:
        logger.error(f"Error deleting contact: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete contact",
        )


@router.get("/contacts/search")
async def search_contacts(
    query: str = Query(..., description="Search query"),
    address_book: str = Query("contacts", description="Address book name"),
    limit: int = Query(50, le=200, description="Maximum results"),
    current_user: dict = Depends(get_current_user),
):
    """
    Search contacts by name, email, phone, or organization.
    """
    try:
        service = get_carddav_service()
        contacts = await service.search_contacts(query=query, address_book=address_book)

        return success_response(
            data={
                "contacts": [contact_to_dict(c) for c in contacts[:limit]],
                "count": len(contacts),
                "query": query,
            }
        )

    except Exception as e:
        logger.error(f"Error searching contacts: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
            message="Failed to search contacts",
        )


# ===================================
# Email Endpoints
# ===================================


@router.get("/email/folders")
async def list_email_folders(current_user: dict = Depends(get_current_user)):
    """
    List email folders/mailboxes.
    """
    try:
        service = get_email_service()

        # Check if email is configured
        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured. Set IMAP_HOST, SMTP_HOST, and EMAIL_* settings.",
            )

        folders = await service.list_folders()

        return success_response(
            data={
                "folders": [
                    {
                        "name": f.name,
                        "total_messages": f.total_messages,
                        "unread_messages": f.unread_messages,
                        "is_inbox": f.is_inbox,
                        "is_sent": f.is_sent,
                        "is_drafts": f.is_drafts,
                    }
                    for f in folders
                ]
            }
        )

    except Exception as e:
        logger.error(f"Error listing email folders: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
            message="Failed to list email folders",
        )


@router.get("/email/messages")
async def list_email_messages(
    folder: str = Query("INBOX", description="Folder name"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, le=200, description="Messages per page"),
    current_user: dict = Depends(get_current_user),
):
    """
    List email messages in a folder.
    """
    try:
        service = get_email_service()

        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        result = await service.list_messages(
            folder=folder,
            page=page,
            page_size=page_size,
        )

        return success_response(
            data={
                "messages": [email_to_dict(e) for e in result.messages],
                "total": result.total,
                "page": result.page,
                "page_size": result.page_size,
                "has_more": result.has_more,
            }
        )

    except Exception as e:
        logger.error(f"Error listing email messages: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
            message="Failed to list email messages",
        )


@router.get("/email/messages/{message_id}")
async def get_email_message(
    message_id: str,
    folder: str = Query("INBOX", description="Folder name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get a specific email message with full content.
    """
    try:
        service = get_email_service()

        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        email = await service.get_message(message_id=message_id, folder=folder)

        if email:
            result = email_to_dict(email)
            result["body_text"] = email.body_text
            result["body_html"] = email.body_html
            result["attachments"] = [
                {
                    "filename": a.filename,
                    "content_type": a.content_type,
                    "size": a.size,
                }
                for a in email.attachments
            ]
            return success_response(data={"message": result})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Message not found: {message_id}",
            )

    except Exception as e:
        logger.error(f"Error getting email message: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get email message",
        )


@router.post("/email/send")
async def send_email(
    request: SendEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Send an email.
    """
    try:
        service = get_email_service()

        if not service.smtp_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured. Set SMTP_HOST and EMAIL_* settings.",
            )

        success = await service.send_email(
            to=request.to_addresses,
            subject=request.subject,
            body=request.body,
            cc=request.cc_addresses,
            bcc=request.bcc_addresses,
            html=request.is_html,
        )

        if success:
            return success_response(data={"status": "sent"})
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to send email",
            )

    except Exception as e:
        logger.error(f"Error sending email: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to send email",
        )


@router.post("/email/messages/{message_id}/reply")
async def reply_to_email(
    message_id: str,
    body: str = Query(..., description="Reply body"),
    reply_all: bool = Query(False, description="Reply to all recipients"),
    folder: str = Query("INBOX", description="Folder containing original"),
    current_user: dict = Depends(get_current_user),
):
    """
    Reply to an email message.
    """
    try:
        service = get_email_service()

        if not service.smtp_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        # Get original message
        original = await service.get_message(message_id=message_id, folder=folder)
        if not original:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Original message not found: {message_id}",
            )

        success = await service.reply_to(
            original_message=original,
            body=body,
            reply_all=reply_all,
        )

        if success:
            return success_response(data={"status": "sent"})
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to send reply",
            )

    except Exception as e:
        logger.error(f"Error replying to email: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to reply to email",
        )


@router.get("/email/threads/{thread_id}")
async def get_email_thread(
    thread_id: str,
    folder: str = Query("INBOX", description="Folder name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get an email thread (conversation).
    """
    try:
        service = get_email_service()

        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        thread = await service.get_thread(message_id=thread_id, folder=folder)

        if thread:
            return success_response(
                data={
                    "thread": {
                        "thread_id": thread.thread_id,
                        "subject": thread.subject,
                        "participants": [str(p) for p in thread.participants],
                        "total_count": thread.total_count,
                        "unread_count": thread.unread_count,
                        "last_message_date": (
                            thread.last_message_date.isoformat() if thread.last_message_date else None
                        ),
                        "messages": [email_to_dict(m) for m in thread.messages],
                    }
                }
            )
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Thread not found: {thread_id}",
            )

    except Exception as e:
        logger.error(f"Error getting email thread: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to get email thread",
        )


@router.put("/email/messages/{message_id}/flags")
async def update_email_flags(
    message_id: str,
    mark_read: Optional[bool] = Query(None, description="Mark as read/unread"),
    mark_flagged: Optional[bool] = Query(None, description="Mark as flagged/unflagged"),
    folder: str = Query("INBOX", description="Folder name"),
    current_user: dict = Depends(get_current_user),
):
    """
    Update email message flags (read, flagged).
    """
    try:
        service = get_email_service()

        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        success = True

        if mark_read is not None:
            success = success and await service.mark_read(
                message_id=message_id,
                folder=folder,
                read=mark_read,
            )

        if mark_flagged is not None:
            success = success and await service.mark_flagged(
                message_id=message_id,
                folder=folder,
                flagged=mark_flagged,
            )

        if success:
            return success_response(data={"message_id": message_id, "status": "updated"})
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to update message flags",
            )

    except Exception as e:
        logger.error(f"Error updating email flags: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to update email flags",
        )


@router.delete("/email/messages/{message_id}")
async def delete_email(
    message_id: str,
    folder: str = Query("INBOX", description="Folder name"),
    permanent: bool = Query(False, description="Permanently delete"),
    current_user: dict = Depends(get_current_user),
):
    """
    Delete an email message.
    """
    try:
        service = get_email_service()

        if not service.imap_host:
            return error_response(
                code="NOT_CONFIGURED",
                message="Email integration is not configured.",
            )

        success = await service.delete_message(
            message_id=message_id,
            folder=folder,
            permanent=permanent,
        )

        if success:
            return success_response(data={"message_id": message_id, "status": "deleted"})
        else:
            return error_response(
                code=ErrorCodes.NOT_FOUND,
                message=f"Message not found: {message_id}",
            )

    except Exception as e:
        logger.error(f"Error deleting email: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to delete email",
        )


# ===================================
# File Indexing Endpoints
# ===================================


@router.post("/files/scan-and-index")
async def scan_and_index_files(
    source_type: str = Query("note", description="Default source type for indexed documents"),
    force_reindex: bool = Query(False, description="Force re-indexing of all files"),
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    Scan Nextcloud directories and auto-index medical documents.

    This endpoint triggers a full scan of configured watch directories
    and indexes all supported medical documents into the knowledge base.

    Requires authentication (admin role recommended).
    """
    try:
        indexer = NextcloudFileIndexer(
            webdav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/files/" + settings.NEXTCLOUD_ADMIN_USER + "/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD,
            watch_directories=["Medical Documents", "Guidelines", "Textbooks"],
        )

        if not indexer.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to Nextcloud",
            )

        summary = await indexer.scan_and_index(
            source_type=source_type,
            force_reindex=force_reindex,
        )

        return success_response(data=summary)

    except Exception as e:
        logger.error(f"Error scanning and indexing files: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to scan and index files",
        )


@router.post("/files/index")
async def index_specific_file(
    request: IndexFileRequest,
    current_admin_user: dict = Depends(get_current_admin_user),
):
    """
    Index a specific Nextcloud file into the knowledge base.

    Useful for manually triggering indexing of a single document.

    Requires authentication (admin role recommended).
    """
    try:
        indexer = NextcloudFileIndexer(
            webdav_url=settings.NEXTCLOUD_URL + "/remote.php/dav/files/" + settings.NEXTCLOUD_ADMIN_USER + "/",
            username=settings.NEXTCLOUD_ADMIN_USER,
            password=settings.NEXTCLOUD_ADMIN_PASSWORD,
        )

        if not indexer.connect():
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to connect to Nextcloud",
            )

        result = await indexer.index_specific_file(
            file_path=request.file_path,
            source_type=request.source_type,
        )

        if result and result.success:
            return success_response(
                data={
                    "document_id": result.document_id,
                    "chunks_indexed": result.chunks_indexed,
                    "processing_time_ms": result.processing_time_ms,
                    "status": "indexed",
                }
            )
        else:
            return error_response(
                code=ErrorCodes.EXTERNAL_SERVICE_ERROR,
                message="Failed to index file",
            )

    except Exception as e:
        logger.error(f"Error indexing file: {e}", exc_info=True)
        return error_response(
            code=ErrorCodes.INTERNAL_ERROR,
            message="Failed to index file",
        )
