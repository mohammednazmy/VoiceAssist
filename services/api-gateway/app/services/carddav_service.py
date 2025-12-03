"""
CardDAV Contacts Integration Service

CardDAV contacts integration with Nextcloud and other servers.

Features:
- List address books
- List/search contacts
- Create/update/delete contacts
- Contact groups/categories
- vCard 3.0/4.0 support
- Photo handling
"""

import uuid
import xml.etree.ElementTree as ET  # nosec B405 - parsing trusted CardDAV responses
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)


class PhoneType(str, Enum):
    """Phone number types."""

    HOME = "HOME"
    WORK = "WORK"
    CELL = "CELL"
    FAX = "FAX"
    PAGER = "PAGER"
    OTHER = "OTHER"


class EmailType(str, Enum):
    """Email address types."""

    HOME = "HOME"
    WORK = "WORK"
    OTHER = "OTHER"


class AddressType(str, Enum):
    """Address types."""

    HOME = "HOME"
    WORK = "WORK"
    OTHER = "OTHER"


@dataclass
class PhoneNumber:
    """Phone number with type."""

    number: str
    type: PhoneType = PhoneType.OTHER
    is_primary: bool = False


@dataclass
class EmailAddress:
    """Email address with type."""

    email: str
    type: EmailType = EmailType.OTHER
    is_primary: bool = False


@dataclass
class PostalAddress:
    """Postal/mailing address."""

    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    type: AddressType = AddressType.OTHER

    def to_vcard_value(self) -> str:
        """Convert to vCard ADR value."""
        # vCard ADR format: PO Box;Extended;Street;City;State;Postal;Country
        street = self.street or ""
        city = self.city or ""
        state = self.state or ""
        postal = self.postal_code or ""
        country = self.country or ""
        return f";;{street};{city};{state};{postal};{country}"


@dataclass
class Contact:
    """Contact record."""

    uid: str
    display_name: str

    # Name components
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    nickname: Optional[str] = None

    # Contact info
    emails: List[EmailAddress] = field(default_factory=list)
    phones: List[PhoneNumber] = field(default_factory=list)
    addresses: List[PostalAddress] = field(default_factory=list)

    # Organization
    organization: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None

    # Additional info
    birthday: Optional[datetime] = None
    anniversary: Optional[datetime] = None
    notes: Optional[str] = None
    website: Optional[str] = None

    # Photo (base64 encoded)
    photo: Optional[str] = None
    photo_type: Optional[str] = None  # JPEG, PNG, etc.

    # Categories/groups
    categories: List[str] = field(default_factory=list)

    # Metadata
    etag: Optional[str] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    # Raw vCard
    vcard_data: Optional[str] = None


@dataclass
class AddressBook:
    """CardDAV address book."""

    name: str
    display_name: str
    url: str
    description: Optional[str] = None
    color: Optional[str] = None
    contact_count: int = 0
    ctag: Optional[str] = None  # Sync token


@dataclass
class ContactSearchQuery:
    """Contact search parameters."""

    text: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    category: Optional[str] = None
    limit: int = 100


@dataclass
class ContactSyncResult:
    """Result of a CardDAV sync-token based sync."""

    contacts: List[Contact]
    deleted: List[str]
    sync_token: Optional[str]


# XML namespaces
NAMESPACES = {
    "D": "DAV:",
    "C": "urn:ietf:params:xml:ns:carddav",
    "CS": "http://calendarserver.org/ns/",
}

# Register namespaces for ET
for prefix, uri in NAMESPACES.items():
    ET.register_namespace(prefix, uri)


class CardDAVService:
    """
    CardDAV contacts integration service.

    Provides contact management via CardDAV protocol,
    compatible with Nextcloud, Radicale, and other servers.
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.carddav_url = f"{self.base_url}/remote.php/dav/addressbooks/users/{username}"

    def _get_auth(self) -> tuple:
        """Get HTTP basic auth tuple."""
        return (self.username, self.password)

    async def list_address_books(self) -> List[AddressBook]:
        """List all address books for the user."""
        propfind_body = """<?xml version="1.0" encoding="utf-8"?>
        <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav" xmlns:CS="http://calendarserver.org/ns/">
          <D:prop>
            <D:displayname/>
            <D:resourcetype/>
            <C:addressbook-description/>
            <CS:getctag/>
          </D:prop>
        </D:propfind>"""

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.request(
                "PROPFIND",
                self.carddav_url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml; charset=utf-8",
                },
                content=propfind_body,
                timeout=30.0,
            )
            response.raise_for_status()

        return self._parse_address_books(response.text)

    def _parse_address_books(self, xml_text: str) -> List[AddressBook]:
        """Parse PROPFIND response for address books."""
        address_books = []

        try:
            root = ET.fromstring(xml_text)  # nosec B314 - trusted CardDAV response

            for response in root.findall(".//D:response", NAMESPACES):
                href = response.find("D:href", NAMESPACES)
                if href is None:
                    continue

                # Check if this is an address book
                resource_type = response.find(".//D:resourcetype/C:addressbook", NAMESPACES)
                if resource_type is None:
                    continue

                url = href.text
                name = url.rstrip("/").split("/")[-1]

                display_name_elem = response.find(".//D:displayname", NAMESPACES)
                display_name = display_name_elem.text if display_name_elem is not None else name

                description_elem = response.find(".//C:addressbook-description", NAMESPACES)
                description = description_elem.text if description_elem is not None else None

                ctag_elem = response.find(".//CS:getctag", NAMESPACES)
                ctag = ctag_elem.text if ctag_elem is not None else None

                address_books.append(
                    AddressBook(
                        name=name,
                        display_name=display_name,
                        url=f"{self.base_url}{url}",
                        description=description,
                        ctag=ctag,
                    )
                )

        except ET.ParseError as e:
            logger.error(f"Failed to parse address books: {e}")

        return address_books

    async def list_contacts(
        self,
        address_book: str = "contacts",
        query: Optional[ContactSearchQuery] = None,
    ) -> List[Contact]:
        """List all contacts in address book."""
        url = f"{self.carddav_url}/{address_book}"

        if query and query.text:
            # Use REPORT with addressbook-query
            return await self._search_contacts(url, query)

        # Use PROPFIND for full list
        propfind_body = """<?xml version="1.0" encoding="utf-8"?>
        <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
          <D:prop>
            <D:getetag/>
            <C:address-data/>
          </D:prop>
        </D:propfind>"""

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.request(
                "PROPFIND",
                url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml; charset=utf-8",
                },
                content=propfind_body,
                timeout=30.0,
            )
            response.raise_for_status()

        return self._parse_contacts(response.text)

    async def sync_contacts(
        self,
        address_book: str = "contacts",
        sync_token: Optional[str] = None,
        limit: int = 500,
    ) -> ContactSyncResult:
        """Incrementally sync contacts using CardDAV sync tokens."""

        # If we do not have a sync token yet, perform a full read
        if not sync_token:
            contacts = await self.list_contacts(address_book)
            return ContactSyncResult(contacts=contacts, deleted=[], sync_token=None)

        url = f"{self.carddav_url}/{address_book}"
        report_body = f"""<?xml version="1.0" encoding="utf-8"?>
        <C:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
          <D:sync-token>{sync_token}</D:sync-token>
          <D:prop>
            <D:getetag/>
            <C:address-data/>
          </D:prop>
          <C:limit><C:nresults>{limit}</C:nresults></C:limit>
        </C:sync-collection>"""

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.request(
                "REPORT",
                url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml; charset=utf-8",
                },
                content=report_body,
                timeout=30.0,
            )
            # Some servers return 409 if token invalid/expired
            if response.status_code == 409:
                logger.warning("Sync token invalid; falling back to full contact sync")
                contacts = await self.list_contacts(address_book)
                return ContactSyncResult(contacts=contacts, deleted=[], sync_token=None)

            response.raise_for_status()

        contacts = self._parse_contacts(response.text)
        deleted: List[str] = []

        try:
            root = ET.fromstring(response.text)  # nosec B314 - trusted CardDAV response
            for res in root.findall(".//D:response", NAMESPACES):
                status = res.find(".//D:status", NAMESPACES)
                href = res.find("D:href", NAMESPACES)
                if status is not None and "404" in status.text and href is not None:
                    uid = href.text.rstrip("/").split("/")[-1].replace(".vcf", "")
                    deleted.append(uid)

            new_sync = self._extract_sync_token(root)
        except ET.ParseError as e:
            logger.error(f"Failed to parse sync response: {e}")
            new_sync = None

        return ContactSyncResult(contacts=contacts, deleted=deleted, sync_token=new_sync)

    async def _search_contacts(
        self,
        url: str,
        query: ContactSearchQuery,
    ) -> List[Contact]:
        """Search contacts using CardDAV REPORT."""
        # Build filter
        filters = []

        if query.text:
            # Search in multiple fields
            for prop in ["FN", "EMAIL", "TEL", "ORG", "NICKNAME"]:
                filters.append(
                    f"""<C:prop-filter name="{prop}">
                      <C:text-match collation="i;unicode-casemap" match-type="contains">{query.text}</C:text-match>
                    </C:prop-filter>"""
                )

        if query.email:
            filters.append(
                f"""<C:prop-filter name="EMAIL">
                  <C:text-match collation="i;unicode-casemap" match-type="contains">{query.email}</C:text-match>
                </C:prop-filter>"""
            )

        if query.phone:
            filters.append(
                f"""<C:prop-filter name="TEL">
                  <C:text-match collation="i;unicode-casemap" match-type="contains">{query.phone}</C:text-match>
                </C:prop-filter>"""
            )

        if query.organization:
            filters.append(
                f"""<C:prop-filter name="ORG">
                  <C:text-match collation="i;unicode-casemap" match-type="contains">{query.organization}</C:text-match>
                </C:prop-filter>"""
            )

        filter_xml = "\n".join(filters)

        report_body = f"""<?xml version="1.0" encoding="utf-8"?>
        <C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
          <D:prop>
            <D:getetag/>
            <C:address-data/>
          </D:prop>
          <C:filter test="anyof">
            {filter_xml}
          </C:filter>
          <C:limit><C:nresults>{query.limit}</C:nresults></C:limit>
        </C:addressbook-query>"""

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.request(
                "REPORT",
                url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml; charset=utf-8",
                },
                content=report_body,
                timeout=30.0,
            )
            response.raise_for_status()

        return self._parse_contacts(response.text)

    def _parse_contacts(self, xml_text: str) -> List[Contact]:
        """Parse PROPFIND/REPORT response for contacts."""
        contacts = []

        try:
            root = ET.fromstring(xml_text)  # nosec B314 - trusted CardDAV response

            for response in root.findall(".//D:response", NAMESPACES):
                href = response.find("D:href", NAMESPACES)
                if href is None or not href.text.endswith(".vcf"):
                    continue

                etag_elem = response.find(".//D:getetag", NAMESPACES)
                etag = etag_elem.text.strip('"') if etag_elem is not None else None

                address_data = response.find(".//C:address-data", NAMESPACES)
                if address_data is None or address_data.text is None:
                    continue

                contact = self._parse_vcard(address_data.text)
                if contact:
                    contact.etag = etag
                    contacts.append(contact)

        except ET.ParseError as e:
            logger.error(f"Failed to parse contacts: {e}")

        return contacts

    def _extract_sync_token(self, root: ET.Element) -> Optional[str]:
        """Extract sync-token/ctag from a sync response."""
        sync_elem = root.find(".//D:sync-token", NAMESPACES)
        if sync_elem is not None and sync_elem.text:
            return sync_elem.text.strip()

        ctag_elem = root.find(".//CS:getctag", NAMESPACES)
        if ctag_elem is not None and ctag_elem.text:
            return ctag_elem.text.strip()

        return None

    def _parse_vcard(self, vcard_text: str) -> Optional[Contact]:
        """Parse vCard text into Contact object."""
        if not vcard_text:
            return None

        lines = vcard_text.strip().split("\n")

        contact_data: Dict[str, Any] = {
            "uid": str(uuid.uuid4()),
            "display_name": "",
            "emails": [],
            "phones": [],
            "addresses": [],
            "categories": [],
        }

        current_line = ""

        for line in lines:
            # Handle line folding (continued lines start with space/tab)
            if line.startswith(" ") or line.startswith("\t"):
                current_line += line[1:]
                continue

            if current_line:
                self._parse_vcard_line(current_line, contact_data)

            current_line = line.strip()

        # Don't forget the last line
        if current_line:
            self._parse_vcard_line(current_line, contact_data)

        if not contact_data.get("display_name"):
            # Build display name from N if FN not present
            if contact_data.get("first_name") or contact_data.get("last_name"):
                parts = []
                if contact_data.get("first_name"):
                    parts.append(contact_data["first_name"])
                if contact_data.get("last_name"):
                    parts.append(contact_data["last_name"])
                contact_data["display_name"] = " ".join(parts)
            else:
                return None  # No name, skip this contact

        contact_data["vcard_data"] = vcard_text

        return Contact(**contact_data)

    def _parse_vcard_line(self, line: str, data: Dict[str, Any]) -> None:
        """Parse a single vCard line and update data dict."""
        if ":" not in line:
            return

        # Split property and value
        prop_part, value = line.split(":", 1)

        # Parse property name and parameters
        parts = prop_part.split(";")
        prop_name = parts[0].upper()
        params = {}

        for part in parts[1:]:
            if "=" in part:
                param_name, param_value = part.split("=", 1)
                params[param_name.upper()] = param_value.upper()
            else:
                # Type parameter without =
                params["TYPE"] = part.upper()

        # Parse based on property
        if prop_name == "FN":
            data["display_name"] = value

        elif prop_name == "N":
            # N format: Last;First;Middle;Prefix;Suffix
            n_parts = value.split(";")
            if len(n_parts) >= 1:
                data["last_name"] = n_parts[0] or None
            if len(n_parts) >= 2:
                data["first_name"] = n_parts[1] or None
            if len(n_parts) >= 3:
                data["middle_name"] = n_parts[2] or None
            if len(n_parts) >= 4:
                data["prefix"] = n_parts[3] or None
            if len(n_parts) >= 5:
                data["suffix"] = n_parts[4] or None

        elif prop_name == "NICKNAME":
            data["nickname"] = value

        elif prop_name == "UID":
            data["uid"] = value

        elif prop_name == "EMAIL":
            email_type = EmailType.OTHER
            if "WORK" in params.get("TYPE", ""):
                email_type = EmailType.WORK
            elif "HOME" in params.get("TYPE", ""):
                email_type = EmailType.HOME

            data["emails"].append(
                EmailAddress(
                    email=value,
                    type=email_type,
                    is_primary="PREF" in params.get("TYPE", ""),
                )
            )

        elif prop_name == "TEL":
            phone_type = PhoneType.OTHER
            type_val = params.get("TYPE", "")
            if "CELL" in type_val or "MOBILE" in type_val:
                phone_type = PhoneType.CELL
            elif "WORK" in type_val:
                phone_type = PhoneType.WORK
            elif "HOME" in type_val:
                phone_type = PhoneType.HOME
            elif "FAX" in type_val:
                phone_type = PhoneType.FAX

            data["phones"].append(
                PhoneNumber(
                    number=value,
                    type=phone_type,
                    is_primary="PREF" in type_val,
                )
            )

        elif prop_name == "ADR":
            # ADR format: PO Box;Extended;Street;City;State;Postal;Country
            addr_parts = value.split(";")

            addr_type = AddressType.OTHER
            if "WORK" in params.get("TYPE", ""):
                addr_type = AddressType.WORK
            elif "HOME" in params.get("TYPE", ""):
                addr_type = AddressType.HOME

            data["addresses"].append(
                PostalAddress(
                    street=addr_parts[2] if len(addr_parts) > 2 else None,
                    city=addr_parts[3] if len(addr_parts) > 3 else None,
                    state=addr_parts[4] if len(addr_parts) > 4 else None,
                    postal_code=addr_parts[5] if len(addr_parts) > 5 else None,
                    country=addr_parts[6] if len(addr_parts) > 6 else None,
                    type=addr_type,
                )
            )

        elif prop_name == "ORG":
            data["organization"] = value.split(";")[0]  # First part is org name

        elif prop_name == "TITLE":
            data["title"] = value

        elif prop_name == "NOTE":
            data["notes"] = value

        elif prop_name == "URL":
            data["website"] = value

        elif prop_name == "BDAY":
            try:
                # Try ISO format first
                if "T" in value:
                    data["birthday"] = datetime.fromisoformat(value.replace("Z", "+00:00"))
                else:
                    data["birthday"] = datetime.strptime(value, "%Y%m%d")
            except ValueError:
                pass

        elif prop_name == "CATEGORIES":
            data["categories"] = [c.strip() for c in value.split(",")]

        elif prop_name == "PHOTO":
            if "ENCODING" in params:
                # Base64 encoded photo
                data["photo"] = value
                data["photo_type"] = params.get("TYPE", "JPEG")

    async def get_contact(
        self,
        uid: str,
        address_book: str = "contacts",
    ) -> Optional[Contact]:
        """Get a single contact by UID."""
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.get(url, timeout=30.0)

            if response.status_code == 404:
                return None

            response.raise_for_status()

        contact = self._parse_vcard(response.text)
        if contact:
            contact.etag = response.headers.get("ETag", "").strip('"')

        return contact

    async def create_contact(
        self,
        contact: Contact,
        address_book: str = "contacts",
    ) -> str:
        """Create a new contact."""
        uid = contact.uid or str(uuid.uuid4())
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        vcard = self._contact_to_vcard(contact, uid)

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.put(
                url,
                content=vcard,
                headers={"Content-Type": "text/vcard; charset=utf-8"},
                timeout=30.0,
            )
            response.raise_for_status()

        logger.info(f"Created contact {uid}")
        return uid

    async def update_contact(
        self,
        contact: Contact,
        address_book: str = "contacts",
    ) -> bool:
        """Update an existing contact."""
        if not contact.uid:
            raise ValueError("Contact UID is required for update")

        url = f"{self.carddav_url}/{address_book}/{contact.uid}.vcf"

        vcard = self._contact_to_vcard(contact, contact.uid)

        headers = {"Content-Type": "text/vcard; charset=utf-8"}

        # Add If-Match header for optimistic locking if we have etag
        if contact.etag:
            headers["If-Match"] = f'"{contact.etag}"'

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.put(
                url,
                content=vcard,
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()

        logger.info(f"Updated contact {contact.uid}")
        return True

    async def delete_contact(
        self,
        uid: str,
        address_book: str = "contacts",
    ) -> bool:
        """Delete a contact."""
        url = f"{self.carddav_url}/{address_book}/{uid}.vcf"

        async with httpx.AsyncClient(auth=self._get_auth()) as client:
            response = await client.delete(url, timeout=30.0)

            if response.status_code == 404:
                return False

            response.raise_for_status()

        logger.info(f"Deleted contact {uid}")
        return True

    def _contact_to_vcard(self, contact: Contact, uid: str) -> str:
        """Convert Contact to vCard 3.0 format."""
        lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            f"UID:{uid}",
        ]

        # Full name
        if contact.display_name:
            lines.append(f"FN:{contact.display_name}")

        # Structured name
        n_parts = [
            contact.last_name or "",
            contact.first_name or "",
            contact.middle_name or "",
            contact.prefix or "",
            contact.suffix or "",
        ]
        lines.append(f"N:{';'.join(n_parts)}")

        # Nickname
        if contact.nickname:
            lines.append(f"NICKNAME:{contact.nickname}")

        # Emails
        for i, email in enumerate(contact.emails):
            type_str = f"TYPE={email.type.value}"
            if email.is_primary:
                type_str += ",PREF"
            lines.append(f"EMAIL;{type_str}:{email.email}")

        # Phones
        for phone in contact.phones:
            type_str = f"TYPE={phone.type.value}"
            if phone.is_primary:
                type_str += ",PREF"
            lines.append(f"TEL;{type_str}:{phone.number}")

        # Addresses
        for addr in contact.addresses:
            lines.append(f"ADR;TYPE={addr.type.value}:{addr.to_vcard_value()}")

        # Organization
        if contact.organization:
            lines.append(f"ORG:{contact.organization}")

        if contact.title:
            lines.append(f"TITLE:{contact.title}")

        # Birthday
        if contact.birthday:
            lines.append(f"BDAY:{contact.birthday.strftime('%Y%m%d')}")

        # Notes
        if contact.notes:
            # Escape special characters
            notes = contact.notes.replace("\\", "\\\\").replace("\n", "\\n")
            lines.append(f"NOTE:{notes}")

        # Website
        if contact.website:
            lines.append(f"URL:{contact.website}")

        # Categories
        if contact.categories:
            lines.append(f"CATEGORIES:{','.join(contact.categories)}")

        # Photo
        if contact.photo:
            photo_type = contact.photo_type or "JPEG"
            lines.append(f"PHOTO;ENCODING=b;TYPE={photo_type}:{contact.photo}")

        # Timestamp
        lines.append(f"REV:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}")

        lines.append("END:VCARD")

        return "\r\n".join(lines)

    async def search_contacts(
        self,
        query: str,
        address_book: str = "contacts",
        limit: int = 100,
    ) -> List[Contact]:
        """Search contacts by text."""
        search_query = ContactSearchQuery(text=query, limit=limit)
        return await self.list_contacts(address_book, search_query)

    async def get_contact_groups(
        self,
        address_book: str = "contacts",
    ) -> List[str]:
        """Get all unique contact categories/groups."""
        contacts = await self.list_contacts(address_book)

        groups = set()
        for contact in contacts:
            groups.update(contact.categories)

        return sorted(groups)


# Singleton instance
_carddav_service: Optional[CardDAVService] = None


def get_carddav_service() -> Optional[CardDAVService]:
    """Get CardDAV service singleton."""
    return _carddav_service


def configure_carddav_service(
    base_url: str,
    username: str,
    password: str,
) -> CardDAVService:
    """Configure and return CardDAV service."""
    global _carddav_service
    _carddav_service = CardDAVService(
        base_url=base_url,
        username=username,
        password=password,
    )
    return _carddav_service
