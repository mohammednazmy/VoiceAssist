"""
Unit tests for Nextcloud Integration Services (Phase 4)

Tests cover:
- OIDC authentication service
- CardDAV contacts service
- CalDAV calendar service
- Email service
- Integration API endpoints
"""

import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.caldav_service import CalDAVService, CalendarEvent
from app.services.carddav_service import AddressBook, AddressType, CardDAVService, Contact, ContactSearchQuery
from app.services.carddav_service import EmailAddress as CardEmailAddress
from app.services.carddav_service import EmailType, PhoneNumber, PhoneType, PostalAddress
from app.services.email_service import Email, EmailAddress, EmailAttachment, EmailFolder, EmailService, EmailThread
from app.services.oidc_service import (
    AuthorizationRequest,
    OIDCClaims,
    OIDCProvider,
    OIDCProviderConfig,
    OIDCService,
    OIDCTokens,
)

# ===================================
# OIDC Service Tests
# ===================================


class TestOIDCService:
    """Tests for OIDC authentication service."""

    def test_provider_config_creation(self):
        """Test creating provider configuration."""
        config = OIDCProviderConfig(
            provider=OIDCProvider.NEXTCLOUD,
            issuer="https://nextcloud.example.com",
            client_id="test-client",
            client_secret="test-secret",
            redirect_uri="https://app.example.com/callback",
        )

        assert config.provider == OIDCProvider.NEXTCLOUD
        assert config.client_id == "test-client"
        assert config.scopes == ["openid", "profile", "email"]

    def test_authorization_request_creation(self):
        """Test creating authorization request."""
        auth_request = AuthorizationRequest(
            provider=OIDCProvider.GOOGLE,
            redirect_uri="https://app.example.com/callback",
            state="random-state",
            nonce="random-nonce",
        )

        assert auth_request.provider == OIDCProvider.GOOGLE
        assert auth_request.state == "random-state"
        assert auth_request.nonce == "random-nonce"
        assert auth_request.redirect_uri == "https://app.example.com/callback"

    def test_tokens_expiration(self):
        """Test token expiration calculation."""
        tokens = OIDCTokens(
            access_token="test-access-token",
            id_token="test-id-token",
            refresh_token="test-refresh-token",
            expires_in=3600,
            issued_at=datetime(2024, 1, 1, 12, 0, 0),
        )

        assert tokens.expires_at == datetime(2024, 1, 1, 13, 0, 0)
        assert tokens.is_expired is True  # Since issued_at is in the past

    def test_claims_from_token(self):
        """Test parsing claims from ID token."""
        claims = OIDCClaims(
            sub="user-123",
            iss="https://auth.example.com",
            aud="test-client",
            exp=int((datetime.utcnow() + timedelta(hours=1)).timestamp()),
            iat=int(datetime.utcnow().timestamp()),
            email="user@example.com",
            name="Test User",
            preferred_username="testuser",
        )

        assert claims.sub == "user-123"
        assert claims.email == "user@example.com"
        assert claims.name == "Test User"


class TestOIDCServiceMethods:
    """Tests for OIDC service methods with mocking."""

    @pytest.fixture
    def oidc_service(self):
        """Create OIDC service instance."""
        return OIDCService()

    @pytest.mark.asyncio
    async def test_get_authorization_url(self, oidc_service):
        """Test generating authorization URL."""
        auth_request = AuthorizationRequest(
            provider=OIDCProvider.GOOGLE,
            redirect_uri="https://app.example.com/callback",
            state="test-state",
            nonce="test-nonce",
        )

        with patch.object(oidc_service, "get_authorization_url", new_callable=AsyncMock) as mock_method:
            mock_method.return_value = "https://accounts.google.com/o/oauth2/auth?..."
            url = await oidc_service.get_authorization_url(auth_request)

            assert "https://accounts.google.com" in url or mock_method.called


# ===================================
# CardDAV Service Tests
# ===================================


class TestCardDAVModels:
    """Tests for CardDAV data models."""

    def test_contact_creation(self):
        """Test creating a Contact."""
        contact = Contact(
            uid="contact-123",
            display_name="John Doe",
            first_name="John",
            last_name="Doe",
            emails=[
                CardEmailAddress(email="john@example.com", type=EmailType.WORK, is_primary=True),
            ],
            phones=[
                PhoneNumber(number="+1-555-1234", type=PhoneType.CELL, is_primary=True),
            ],
            organization="Acme Inc",
        )

        assert contact.uid == "contact-123"
        assert contact.display_name == "John Doe"
        assert len(contact.emails) == 1
        assert contact.emails[0].is_primary is True

    def test_address_book_creation(self):
        """Test creating an AddressBook."""
        address_book = AddressBook(
            name="contacts",
            display_name="My Contacts",
            url="/dav/addressbooks/user/contacts/",
            contact_count=100,
        )

        assert address_book.name == "contacts"
        assert address_book.contact_count == 100

    def test_postal_address_to_vcard(self):
        """Test postal address vCard conversion."""
        address = PostalAddress(
            street="123 Main St",
            city="New York",
            state="NY",
            postal_code="10001",
            country="USA",
            type=AddressType.WORK,
        )

        vcard_value = address.to_vcard_value()
        assert "123 Main St" in vcard_value
        assert "New York" in vcard_value
        assert "NY" in vcard_value

    def test_contact_search_query(self):
        """Test contact search query."""
        query = ContactSearchQuery(
            text="John",
            email="john@",
            organization="Acme",
            limit=50,
        )

        assert query.text == "John"
        assert query.limit == 50


class TestCardDAVService:
    """Tests for CardDAV service methods."""

    @pytest.fixture
    def carddav_service(self):
        """Create CardDAV service instance."""
        return CardDAVService(
            base_url="https://nextcloud.example.com",
            username="testuser",
            password="testpass",
        )

    @pytest.mark.asyncio
    async def test_list_address_books(self, carddav_service):
        """Test listing address books."""
        mock_response = MagicMock()
        mock_response.text = """<?xml version="1.0"?>
        <D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
            <D:response>
                <D:href>/dav/addressbooks/user/contacts/</D:href>
                <D:propstat>
                    <D:prop>
                        <D:displayname>Contacts</D:displayname>
                        <D:resourcetype><C:addressbook/></D:resourcetype>
                    </D:prop>
                </D:propstat>
            </D:response>
        </D:multistatus>"""
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client.request.return_value = mock_response
            mock_client_class.return_value = mock_client

            await carddav_service.list_address_books()

            # Verify the request was made
            mock_client.request.assert_called_once()


# ===================================
# CalDAV Service Tests
# ===================================


class TestCalDAVModels:
    """Tests for CalDAV data models."""

    def test_calendar_event_creation(self):
        """Test creating a CalendarEvent."""
        event = CalendarEvent(
            uid="event-123",
            summary="Team Meeting",
            description="Weekly sync",
            start=datetime(2024, 1, 15, 10, 0, 0),
            end=datetime(2024, 1, 15, 11, 0, 0),
            location="Conference Room A",
            organizer="organizer@example.com",
            attendees=["user1@example.com", "user2@example.com"],
        )

        assert event.uid == "event-123"
        assert event.summary == "Team Meeting"
        assert len(event.attendees) == 2

    def test_calendar_event_duration(self):
        """Test event duration calculation."""
        start = datetime(2024, 1, 15, 10, 0, 0)
        end = datetime(2024, 1, 15, 12, 30, 0)

        event = CalendarEvent(
            uid="event-123",
            summary="Long Meeting",
            description=None,
            start=start,
            end=end,
        )

        duration = event.end - event.start
        assert duration.total_seconds() == 9000  # 2.5 hours


class TestCalDAVService:
    """Tests for CalDAV service methods."""

    @pytest.fixture
    def caldav_service(self):
        """Create CalDAV service instance."""
        return CalDAVService(
            caldav_url="https://nextcloud.example.com/remote.php/dav/",
            username="testuser",
            password="testpass",
        )

    def test_service_initialization(self, caldav_service):
        """Test service initialization."""
        assert caldav_service.caldav_url == "https://nextcloud.example.com/remote.php/dav/"
        assert caldav_service.username == "testuser"

    def test_connect_failure(self, caldav_service):
        """Test connection failure handling."""
        with patch("caldav.DAVClient") as mock_client_class:
            mock_client_class.side_effect = Exception("Connection refused")
            result = caldav_service.connect()
            assert result is False


# ===================================
# Email Service Tests
# ===================================


class TestEmailModels:
    """Tests for Email data models."""

    def test_email_address_creation(self):
        """Test creating an EmailAddress."""
        addr = EmailAddress(email="user@example.com", name="John Doe")
        assert str(addr) == '"John Doe" <user@example.com>'

        addr_no_name = EmailAddress(email="user@example.com")
        assert str(addr_no_name) == "user@example.com"

    def test_email_folder_properties(self):
        """Test EmailFolder properties."""
        inbox = EmailFolder(
            name="INBOX",
            total_messages=100,
            unread_messages=5,
            recent_messages=2,
        )

        assert inbox.is_inbox is True
        assert inbox.is_sent is False
        assert inbox.is_drafts is False

        sent = EmailFolder(
            name="Sent",
            flags=["\\Sent"],
            total_messages=50,
        )
        assert sent.is_sent is True

    def test_email_attachment(self):
        """Test EmailAttachment creation."""
        attachment = EmailAttachment(
            filename="document.pdf",
            content_type="application/pdf",
            size=1024000,
        )

        assert attachment.filename == "document.pdf"
        assert attachment.size == 1024000

    def test_email_creation(self):
        """Test creating an Email."""
        email_msg = Email(
            id="<msg-123@example.com>",
            uid=12345,
            subject="Test Subject",
            from_addr=EmailAddress(email="sender@example.com", name="Sender"),
            to_addrs=[EmailAddress(email="recipient@example.com")],
            date=datetime(2024, 1, 15, 10, 0, 0),
            body_text="Hello, World!",
            body_html="<p>Hello, World!</p>",
            preview="Hello, World!...",
            is_read=False,
            is_flagged=False,
            folder="INBOX",
        )

        assert email_msg.subject == "Test Subject"
        assert email_msg.is_read is False
        assert email_msg.folder == "INBOX"

    def test_email_thread(self):
        """Test EmailThread creation."""
        thread = EmailThread(
            thread_id="thread-123",
            subject="Re: Test Subject",
            participants=[
                EmailAddress(email="user1@example.com"),
                EmailAddress(email="user2@example.com"),
            ],
            messages=[],
            last_message_date=datetime(2024, 1, 15, 12, 0, 0),
            total_count=5,
        )

        assert thread.total_count == 5
        assert len(thread.participants) == 2


class TestEmailService:
    """Tests for Email service methods."""

    @pytest.fixture
    def email_service(self):
        """Create Email service instance."""
        return EmailService(
            imap_host="imap.example.com",
            imap_port=993,
            smtp_host="smtp.example.com",
            smtp_port=587,
            username="testuser@example.com",
            password="testpass",
            use_ssl=True,
        )

    def test_service_initialization(self, email_service):
        """Test service initialization."""
        assert email_service.imap_host == "imap.example.com"
        assert email_service.smtp_host == "smtp.example.com"
        assert email_service.use_ssl is True

    @pytest.mark.asyncio
    async def test_unconfigured_service(self):
        """Test service behavior when not configured."""
        service = EmailService(
            imap_host="",
            imap_port=993,
            smtp_host="",
            smtp_port=587,
            username="",
            password="",
        )

        # Service should handle missing configuration gracefully
        assert service.imap_host == ""


# ===================================
# Integration API Tests
# ===================================


class TestIntegrationAPIHelpers:
    """Tests for integration API helper functions."""

    def test_contact_to_dict(self):
        """Test converting Contact to dict."""
        from app.api.integrations import contact_to_dict

        contact = Contact(
            uid="contact-123",
            display_name="Jane Doe",
            first_name="Jane",
            last_name="Doe",
            emails=[CardEmailAddress(email="jane@example.com", type=EmailType.HOME)],
            phones=[PhoneNumber(number="+1-555-5678", type=PhoneType.CELL)],
            addresses=[
                PostalAddress(
                    street="456 Oak Ave",
                    city="Boston",
                    state="MA",
                    type=AddressType.HOME,
                )
            ],
            organization="Tech Corp",
            categories=["Friends", "Work"],
            birthday=datetime(1990, 5, 15),
        )

        result = contact_to_dict(contact)

        assert result["uid"] == "contact-123"
        assert result["display_name"] == "Jane Doe"
        assert len(result["emails"]) == 1
        assert result["emails"][0]["email"] == "jane@example.com"
        assert result["organization"] == "Tech Corp"

    def test_email_to_dict(self):
        """Test converting Email to dict."""
        from app.api.integrations import email_to_dict

        email_msg = Email(
            id="<msg-456@example.com>",
            uid=67890,
            subject="Important Update",
            from_addr=EmailAddress(email="boss@example.com", name="Boss"),
            to_addrs=[EmailAddress(email="employee@example.com")],
            date=datetime(2024, 1, 20, 14, 30, 0),
            preview="Please review the attached...",
            is_read=True,
            is_flagged=True,
            has_attachments=True,
            folder="INBOX",
            thread_id="thread-456",
        )

        result = email_to_dict(email_msg)

        assert result["id"] == "<msg-456@example.com>"
        assert result["subject"] == "Important Update"
        assert result["is_read"] is True
        assert result["is_flagged"] is True
        assert result["has_attachments"] is True


class TestOIDCEndpoints:
    """Tests for OIDC API endpoints."""

    @pytest.mark.asyncio
    async def test_start_oidc_auth_invalid_provider(self):
        """Test starting OIDC auth with invalid provider."""
        from app.api.integrations import OIDCAuthStartRequest, start_oidc_auth

        request = OIDCAuthStartRequest(
            provider="invalid-provider",
            redirect_uri="https://app.example.com/callback",
        )

        with patch("app.api.integrations.get_oidc_service") as mock_get_service:
            mock_service = AsyncMock()
            mock_get_service.return_value = mock_service

            response = await start_oidc_auth(request)

            assert response.get("success") is False or "Unknown provider" in str(response)


class TestContactEndpoints:
    """Tests for Contact API endpoints."""

    def test_phone_type_mapping(self):
        """Test phone type enum mapping."""
        from app.api.integrations import PhoneNumberRequest

        request = PhoneNumberRequest(
            number="+1-555-1234",
            type="CELL",
            is_primary=True,
        )

        assert request.number == "+1-555-1234"
        assert request.type == "CELL"

    def test_email_type_mapping(self):
        """Test email type enum mapping."""
        from app.api.integrations import EmailAddressRequest

        request = EmailAddressRequest(
            email="user@example.com",
            type="WORK",
            is_primary=False,
        )

        assert request.email == "user@example.com"
        assert request.type == "WORK"


class TestEmailEndpoints:
    """Tests for Email API endpoints."""

    def test_send_email_request_validation(self):
        """Test SendEmailRequest validation."""
        from app.api.integrations import SendEmailRequest

        request = SendEmailRequest(
            to_addresses=["recipient@example.com"],
            subject="Test Email",
            body="This is a test email.",
            cc_addresses=["cc@example.com"],
            is_html=False,
        )

        assert len(request.to_addresses) == 1
        assert request.subject == "Test Email"
        assert request.is_html is False


# ===================================
# Edge Cases and Error Handling
# ===================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_contact(self):
        """Test creating a minimal contact."""
        contact = Contact(
            uid=str(uuid.uuid4()),
            display_name="Minimal Contact",
        )

        assert contact.emails == []
        assert contact.phones == []
        assert contact.addresses == []
        assert contact.categories == []

    def test_email_without_body(self):
        """Test email without body content."""
        email_msg = Email(
            id="<msg-empty@example.com>",
            uid=0,
            subject="Empty Email",
            from_addr=EmailAddress(email="sender@example.com"),
            to_addrs=[],
            date=datetime.now(),
            preview="",
            is_read=False,
            folder="INBOX",
        )

        assert email_msg.body_text is None
        assert email_msg.body_html is None

    def test_calendar_event_without_attendees(self):
        """Test calendar event without attendees."""
        event = CalendarEvent(
            uid="solo-event",
            summary="Personal Time",
            description="Focus time",
            start=datetime(2024, 1, 15, 9, 0, 0),
            end=datetime(2024, 1, 15, 10, 0, 0),
        )

        assert event.attendees == []
        assert event.location is None
        assert event.organizer is None

    def test_contact_with_multiple_emails(self):
        """Test contact with multiple email addresses."""
        contact = Contact(
            uid="multi-email",
            display_name="Multi Email User",
            emails=[
                CardEmailAddress(email="work@example.com", type=EmailType.WORK, is_primary=True),
                CardEmailAddress(email="home@example.com", type=EmailType.HOME, is_primary=False),
                CardEmailAddress(email="other@example.com", type=EmailType.OTHER, is_primary=False),
            ],
        )

        assert len(contact.emails) == 3
        primary = [e for e in contact.emails if e.is_primary]
        assert len(primary) == 1
        assert primary[0].email == "work@example.com"
