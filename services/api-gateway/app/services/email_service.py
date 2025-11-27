"""
Complete Email Integration Service

IMAP/SMTP email integration with support for:
- Folder management
- Email threading
- Full-text search
- Attachment handling
- Email sending (reply/forward)
- Draft management

Works with any IMAP/SMTP server including Nextcloud Mail.
"""

import email
import email.utils
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from email.header import decode_header, make_header
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Any, Dict, List, Optional

import aioimaplib
import aiosmtplib
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmailPriority(str, Enum):
    """Email priority levels."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class EmailFlag(str, Enum):
    """IMAP email flags."""

    SEEN = "\\Seen"
    ANSWERED = "\\Answered"
    FLAGGED = "\\Flagged"
    DELETED = "\\Deleted"
    DRAFT = "\\Draft"
    RECENT = "\\Recent"


@dataclass
class EmailAddress:
    """Parsed email address."""

    email: str
    name: Optional[str] = None

    def __str__(self) -> str:
        if self.name:
            return f'"{self.name}" <{self.email}>'
        return self.email


@dataclass
class EmailAttachment:
    """Email attachment."""

    filename: str
    content_type: str
    size: int
    content: Optional[bytes] = None
    content_id: Optional[str] = None  # For inline attachments


@dataclass
class EmailFolder:
    """Email folder/mailbox."""

    name: str
    delimiter: str = "/"
    flags: List[str] = field(default_factory=list)
    total_messages: int = 0
    unread_messages: int = 0
    recent_messages: int = 0

    @property
    def is_inbox(self) -> bool:
        return self.name.upper() == "INBOX"

    @property
    def is_sent(self) -> bool:
        return "\\Sent" in self.flags or self.name.lower() in ["sent", "sent items"]

    @property
    def is_drafts(self) -> bool:
        return "\\Drafts" in self.flags or self.name.lower() in ["drafts"]

    @property
    def is_trash(self) -> bool:
        return "\\Trash" in self.flags or self.name.lower() in ["trash", "deleted"]

    @property
    def is_spam(self) -> bool:
        return "\\Junk" in self.flags or self.name.lower() in ["spam", "junk"]


@dataclass
class Email:
    """Complete email message."""

    id: str
    uid: int
    subject: str
    from_addr: EmailAddress
    to_addrs: List[EmailAddress]
    date: datetime
    folder: str = "INBOX"

    # Optional headers
    cc_addrs: List[EmailAddress] = field(default_factory=list)
    bcc_addrs: List[EmailAddress] = field(default_factory=list)
    reply_to: Optional[EmailAddress] = None

    # Content
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    preview: Optional[str] = None

    # Attachments
    attachments: List[EmailAttachment] = field(default_factory=list)
    has_attachments: bool = False

    # Threading
    message_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: List[str] = field(default_factory=list)
    thread_id: Optional[str] = None

    # Flags
    is_read: bool = False
    is_flagged: bool = False
    is_answered: bool = False
    is_draft: bool = False

    # Priority
    priority: EmailPriority = EmailPriority.NORMAL

    # Raw headers for debugging
    raw_headers: Dict[str, str] = field(default_factory=dict)


@dataclass
class EmailThread:
    """Email conversation thread."""

    thread_id: str
    subject: str
    participants: List[EmailAddress]
    messages: List[Email]
    last_message_date: datetime
    unread_count: int = 0
    total_count: int = 0


@dataclass
class PaginatedEmails:
    """Paginated email list response."""

    messages: List[Email]
    total: int
    page: int
    page_size: int
    has_more: bool = False

    @property
    def total_pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size


@dataclass
class EmailSearchQuery:
    """Email search query parameters."""

    text: Optional[str] = None
    from_addr: Optional[str] = None
    to_addr: Optional[str] = None
    subject: Optional[str] = None
    has_attachment: Optional[bool] = None
    is_unread: Optional[bool] = None
    is_flagged: Optional[bool] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    folder: str = "INBOX"


class EmailService:
    """
    Complete IMAP/SMTP email integration service.

    Provides async email operations with support for
    threading, search, and attachment handling.
    """

    def __init__(
        self,
        imap_host: str,
        imap_port: int = 993,
        smtp_host: str = "",
        smtp_port: int = 587,
        username: str = "",
        password: str = "",
        use_ssl: bool = True,
        use_starttls: bool = True,
    ):
        self.imap_host = imap_host
        self.imap_port = imap_port
        self.smtp_host = smtp_host or imap_host
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self.use_starttls = use_starttls

        self._imap_client: Optional[aioimaplib.IMAP4_SSL] = None

    async def _get_imap_connection(self) -> aioimaplib.IMAP4_SSL:
        """Get or create IMAP connection."""
        if self._imap_client is None:
            if self.use_ssl:
                self._imap_client = aioimaplib.IMAP4_SSL(
                    host=self.imap_host,
                    port=self.imap_port,
                )
            else:
                self._imap_client = aioimaplib.IMAP4(
                    host=self.imap_host,
                    port=self.imap_port,
                )

            await self._imap_client.wait_hello_from_server()
            await self._imap_client.login(self.username, self.password)

        return self._imap_client

    async def close(self) -> None:
        """Close IMAP connection."""
        if self._imap_client:
            try:
                await self._imap_client.logout()
            except Exception:
                pass
            self._imap_client = None

    async def list_folders(self) -> List[EmailFolder]:
        """List all email folders."""
        imap = await self._get_imap_connection()
        response = await imap.list()

        if response.result != "OK":
            logger.error(f"Failed to list folders: {response}")
            return []

        folders = []
        for line in response.lines:
            if isinstance(line, bytes):
                line = line.decode("utf-8", errors="replace")

            # Parse LIST response: (flags) "delimiter" "name"
            match = re.match(r'\(([^)]*)\)\s+"([^"]+)"\s+"?([^"]+)"?', line)
            if match:
                flags_str, delimiter, name = match.groups()
                flags = [f.strip() for f in flags_str.split() if f.strip()]
                folders.append(
                    EmailFolder(
                        name=name,
                        delimiter=delimiter,
                        flags=flags,
                    )
                )

        # Get message counts for each folder
        for folder in folders:
            try:
                status = await imap.status(
                    f'"{folder.name}"',
                    "(MESSAGES UNSEEN RECENT)",
                )
                if status.result == "OK":
                    status_line = status.lines[0]
                    if isinstance(status_line, bytes):
                        status_line = status_line.decode()

                    messages_match = re.search(r"MESSAGES\s+(\d+)", status_line)
                    unseen_match = re.search(r"UNSEEN\s+(\d+)", status_line)
                    recent_match = re.search(r"RECENT\s+(\d+)", status_line)

                    if messages_match:
                        folder.total_messages = int(messages_match.group(1))
                    if unseen_match:
                        folder.unread_messages = int(unseen_match.group(1))
                    if recent_match:
                        folder.recent_messages = int(recent_match.group(1))
            except Exception as e:
                logger.warning(f"Failed to get status for {folder.name}: {e}")

        return folders

    async def list_messages(
        self,
        folder: str = "INBOX",
        page: int = 1,
        page_size: int = 50,
        search_query: Optional[EmailSearchQuery] = None,
    ) -> PaginatedEmails:
        """List messages in folder with pagination."""
        imap = await self._get_imap_connection()

        response = await imap.select(folder)
        if response.result != "OK":
            logger.error(f"Failed to select folder {folder}: {response}")
            return PaginatedEmails(messages=[], total=0, page=page, page_size=page_size)

        search_criteria = self._build_search_criteria(search_query)
        response = await imap.search(search_criteria)
        if response.result != "OK":
            logger.error(f"Search failed: {response}")
            return PaginatedEmails(messages=[], total=0, page=page, page_size=page_size)

        message_ids = []
        for line in response.lines:
            if isinstance(line, bytes):
                line = line.decode()
            if line.strip():
                message_ids.extend(line.strip().split())

        message_ids = list(reversed(message_ids))
        total = len(message_ids)

        start = (page - 1) * page_size
        end = start + page_size
        page_ids = message_ids[start:end]

        if not page_ids:
            return PaginatedEmails(
                messages=[],
                total=total,
                page=page,
                page_size=page_size,
                has_more=end < total,
            )

        messages = await self._fetch_messages(imap, page_ids, folder, headers_only=True)

        return PaginatedEmails(
            messages=messages,
            total=total,
            page=page,
            page_size=page_size,
            has_more=end < total,
        )

    def _build_search_criteria(self, query: Optional[EmailSearchQuery]) -> str:
        """Build IMAP search criteria from query."""
        if not query:
            return "ALL"

        criteria = []

        if query.text:
            criteria.append(f'(OR SUBJECT "{query.text}" FROM "{query.text}")')

        if query.from_addr:
            criteria.append(f'FROM "{query.from_addr}"')

        if query.to_addr:
            criteria.append(f'TO "{query.to_addr}"')

        if query.subject:
            criteria.append(f'SUBJECT "{query.subject}"')

        if query.is_unread is True:
            criteria.append("UNSEEN")
        elif query.is_unread is False:
            criteria.append("SEEN")

        if query.is_flagged is True:
            criteria.append("FLAGGED")
        elif query.is_flagged is False:
            criteria.append("UNFLAGGED")

        if query.date_from:
            date_str = query.date_from.strftime("%d-%b-%Y")
            criteria.append(f"SINCE {date_str}")

        if query.date_to:
            date_str = query.date_to.strftime("%d-%b-%Y")
            criteria.append(f"BEFORE {date_str}")

        return " ".join(criteria) if criteria else "ALL"

    async def _fetch_messages(
        self,
        imap: aioimaplib.IMAP4_SSL,
        message_ids: List[str],
        folder: str,
        headers_only: bool = False,
    ) -> List[Email]:
        """Fetch messages by ID."""
        if not message_ids:
            return []

        if headers_only:
            fetch_parts = "(FLAGS BODY.PEEK[HEADER])"
        else:
            fetch_parts = "(FLAGS RFC822)"

        messages = []
        id_list = ",".join(message_ids)

        response = await imap.fetch(id_list, fetch_parts)
        if response.result != "OK":
            logger.error(f"Fetch failed: {response}")
            return []

        current_id = None
        current_data: Dict[str, Any] = {}

        for line in response.lines:
            if isinstance(line, bytes):
                match = re.match(rb"(\d+)\s+FETCH\s+\(", line)
                if match:
                    if current_id and current_data:
                        email_obj = self._parse_email_data(current_id, current_data, folder, headers_only)
                        if email_obj:
                            messages.append(email_obj)
                    current_id = match.group(1).decode()
                    current_data = {"raw": line}
                elif current_data:
                    current_data["raw"] = current_data.get("raw", b"") + line

        if current_id and current_data:
            email_obj = self._parse_email_data(current_id, current_data, folder, headers_only)
            if email_obj:
                messages.append(email_obj)

        return messages

    def _parse_email_data(
        self,
        msg_id: str,
        data: Dict[str, Any],
        folder: str,
        headers_only: bool,
    ) -> Optional[Email]:
        """Parse email from fetch response data."""
        try:
            raw = data.get("raw", b"")
            if isinstance(raw, str):
                raw = raw.encode()

            if headers_only:
                match = re.search(rb"HEADER\]\s*\{(\d+)\}\r?\n(.+)", raw, re.DOTALL)
            else:
                match = re.search(rb"RFC822\]\s*\{(\d+)\}\r?\n(.+)", raw, re.DOTALL)

            if not match:
                match = re.search(rb"HEADER\]\s+(.+)", raw, re.DOTALL)
                if not match:
                    match = re.search(rb"RFC822\s+(.+)", raw, re.DOTALL)

            if not match:
                return None

            email_content = match.group(2) if len(match.groups()) > 1 else match.group(1)
            msg = email.message_from_bytes(email_content)

            flags_match = re.search(rb"FLAGS\s*\(([^)]*)\)", raw)
            flags = []
            if flags_match:
                flags = flags_match.group(1).decode().split()

            subject = self._decode_header(msg.get("Subject", ""))
            from_addr = self._parse_address(msg.get("From", ""))
            to_addrs = self._parse_addresses(msg.get("To", ""))
            cc_addrs = self._parse_addresses(msg.get("Cc", ""))
            date = self._parse_date(msg.get("Date", ""))

            email_obj = Email(
                id=msg_id,
                uid=int(msg_id),
                subject=subject,
                from_addr=from_addr,
                to_addrs=to_addrs,
                cc_addrs=cc_addrs,
                date=date,
                folder=folder,
                message_id=msg.get("Message-ID"),
                in_reply_to=msg.get("In-Reply-To"),
                references=msg.get("References", "").split(),
                is_read=EmailFlag.SEEN.value in flags,
                is_flagged=EmailFlag.FLAGGED.value in flags,
                is_answered=EmailFlag.ANSWERED.value in flags,
                is_draft=EmailFlag.DRAFT.value in flags,
            )

            if not headers_only:
                email_obj.body_text = self._get_body_text(msg)
                email_obj.body_html = self._get_body_html(msg)
                email_obj.attachments = self._get_attachments(msg)
                email_obj.has_attachments = len(email_obj.attachments) > 0
            else:
                email_obj.preview = subject[:100] if subject else ""

            return email_obj

        except Exception as e:
            logger.error(f"Failed to parse email {msg_id}: {e}")
            return None

    def _decode_header(self, header: Optional[str]) -> str:
        """Decode email header."""
        if not header:
            return ""
        try:
            decoded = str(make_header(decode_header(header)))
            return decoded
        except Exception:
            return header

    def _parse_address(self, addr_str: str) -> EmailAddress:
        """Parse a single email address."""
        if not addr_str:
            return EmailAddress(email="", name=None)
        try:
            name, addr = email.utils.parseaddr(addr_str)
            name = self._decode_header(name) if name else None
            return EmailAddress(email=addr, name=name)
        except Exception:
            return EmailAddress(email=addr_str, name=None)

    def _parse_addresses(self, addr_str: str) -> List[EmailAddress]:
        """Parse multiple email addresses."""
        if not addr_str:
            return []
        addresses = []
        for addr in email.utils.getaddresses([addr_str]):
            name, email_addr = addr
            if email_addr:
                name = self._decode_header(name) if name else None
                addresses.append(EmailAddress(email=email_addr, name=name))
        return addresses

    def _parse_date(self, date_str: str) -> datetime:
        """Parse email date header."""
        if not date_str:
            return datetime.utcnow()
        try:
            parsed = email.utils.parsedate_to_datetime(date_str)
            return parsed.replace(tzinfo=None)
        except Exception:
            return datetime.utcnow()

    def _get_body_text(self, msg: email.message.Message) -> Optional[str]:
        """Extract plain text body from email."""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))
                if content_type == "text/plain" and "attachment" not in content_disposition:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        return payload.decode(charset, errors="replace")
        else:
            if msg.get_content_type() == "text/plain":
                payload = msg.get_payload(decode=True)
                if payload:
                    charset = msg.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
        return None

    def _get_body_html(self, msg: email.message.Message) -> Optional[str]:
        """Extract HTML body from email."""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))
                if content_type == "text/html" and "attachment" not in content_disposition:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        return payload.decode(charset, errors="replace")
        else:
            if msg.get_content_type() == "text/html":
                payload = msg.get_payload(decode=True)
                if payload:
                    charset = msg.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
        return None

    def _get_attachments(
        self,
        msg: email.message.Message,
        include_content: bool = False,
    ) -> List[EmailAttachment]:
        """Extract attachments from email."""
        attachments = []
        if not msg.is_multipart():
            return attachments

        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in content_disposition or "inline" in content_disposition:
                filename = part.get_filename()
                if filename:
                    filename = self._decode_header(filename)
                else:
                    filename = f"attachment_{len(attachments) + 1}"

                content_type = part.get_content_type()
                payload = part.get_payload(decode=True)
                size = len(payload) if payload else 0

                attachment = EmailAttachment(
                    filename=filename,
                    content_type=content_type,
                    size=size,
                    content=payload if include_content else None,
                    content_id=part.get("Content-ID"),
                )
                attachments.append(attachment)

        return attachments

    async def get_message(
        self,
        message_id: str,
        folder: str = "INBOX",
    ) -> Optional[Email]:
        """Get full message content."""
        imap = await self._get_imap_connection()
        response = await imap.select(folder)
        if response.result != "OK":
            return None
        messages = await self._fetch_messages(imap, [message_id], folder, headers_only=False)
        return messages[0] if messages else None

    async def send_email(
        self,
        to: List[str],
        subject: str,
        body: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[EmailAttachment]] = None,
        reply_to_message_id: Optional[str] = None,
        is_html: bool = False,
        priority: EmailPriority = EmailPriority.NORMAL,
    ) -> bool:
        """Send an email."""
        msg = MIMEMultipart("mixed")
        msg["From"] = self.username
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        msg["Date"] = email.utils.formatdate(localtime=True)
        msg["Message-ID"] = f"<{uuid.uuid4()}@{self.smtp_host}>"

        if cc:
            msg["Cc"] = ", ".join(cc)

        if reply_to_message_id:
            msg["In-Reply-To"] = reply_to_message_id
            msg["References"] = reply_to_message_id

        if priority == EmailPriority.HIGH:
            msg["X-Priority"] = "1"
            msg["Importance"] = "high"
        elif priority == EmailPriority.LOW:
            msg["X-Priority"] = "5"
            msg["Importance"] = "low"

        content_type = "html" if is_html or "<html>" in body.lower() else "plain"
        msg.attach(MIMEText(body, content_type, "utf-8"))

        if attachments:
            for attachment in attachments:
                if attachment.content:
                    part = MIMEApplication(attachment.content)
                    part.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename=attachment.filename,
                    )
                    part.add_header("Content-Type", attachment.content_type)
                    msg.attach(part)

        try:
            all_recipients = to + (cc or []) + (bcc or [])

            async with aiosmtplib.SMTP(
                hostname=self.smtp_host,
                port=self.smtp_port,
                use_tls=self.use_ssl,
                start_tls=self.use_starttls and not self.use_ssl,
            ) as smtp:
                await smtp.login(self.username, self.password)
                await smtp.sendmail(self.username, all_recipients, msg.as_string())

            logger.info(f"Email sent to {len(all_recipients)} recipients")
            return True

        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    async def reply_to(
        self,
        original_message: Email,
        body: str,
        reply_all: bool = False,
        attachments: Optional[List[EmailAttachment]] = None,
        is_html: bool = False,
    ) -> bool:
        """Reply to an email."""
        to = [original_message.from_addr.email]

        cc = None
        if reply_all:
            cc = [
                addr.email
                for addr in original_message.to_addrs + original_message.cc_addrs
                if addr.email.lower() != self.username.lower()
            ]

        subject = original_message.subject
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        return await self.send_email(
            to=to,
            subject=subject,
            body=body,
            cc=cc,
            attachments=attachments,
            reply_to_message_id=original_message.message_id,
            is_html=is_html,
        )

    async def forward(
        self,
        original_message: Email,
        to: List[str],
        body: Optional[str] = None,
        include_attachments: bool = True,
    ) -> bool:
        """Forward an email."""
        subject = original_message.subject
        if not subject.lower().startswith("fwd:"):
            subject = f"Fwd: {subject}"

        forward_header = f"""
---------- Forwarded message ---------
From: {original_message.from_addr}
Date: {original_message.date.strftime('%Y-%m-%d %H:%M')}
Subject: {original_message.subject}
To: {', '.join(str(a) for a in original_message.to_addrs)}

"""
        original_body = original_message.body_text or original_message.body_html or ""
        full_body = (body or "") + forward_header + original_body
        attachments = original_message.attachments if include_attachments else None

        return await self.send_email(to=to, subject=subject, body=full_body, attachments=attachments)

    async def mark_as_read(self, message_id: str, folder: str = "INBOX") -> bool:
        """Mark message as read."""
        return await self._set_flag(message_id, folder, EmailFlag.SEEN, True)

    async def mark_as_unread(self, message_id: str, folder: str = "INBOX") -> bool:
        """Mark message as unread."""
        return await self._set_flag(message_id, folder, EmailFlag.SEEN, False)

    async def flag_message(self, message_id: str, folder: str = "INBOX") -> bool:
        """Flag/star a message."""
        return await self._set_flag(message_id, folder, EmailFlag.FLAGGED, True)

    async def unflag_message(self, message_id: str, folder: str = "INBOX") -> bool:
        """Unflag/unstar a message."""
        return await self._set_flag(message_id, folder, EmailFlag.FLAGGED, False)

    async def _set_flag(
        self,
        message_id: str,
        folder: str,
        flag: EmailFlag,
        value: bool,
    ) -> bool:
        """Set or remove a flag on a message."""
        imap = await self._get_imap_connection()
        response = await imap.select(folder)
        if response.result != "OK":
            return False

        action = "+FLAGS" if value else "-FLAGS"
        response = await imap.store(message_id, action, flag.value)
        return response.result == "OK"

    async def move_message(
        self,
        message_id: str,
        from_folder: str,
        to_folder: str,
    ) -> bool:
        """Move message to another folder."""
        imap = await self._get_imap_connection()

        response = await imap.select(from_folder)
        if response.result != "OK":
            return False

        response = await imap.copy(message_id, to_folder)
        if response.result != "OK":
            return False

        response = await imap.store(message_id, "+FLAGS", EmailFlag.DELETED.value)
        if response.result != "OK":
            return False

        await imap.expunge()
        return True

    async def delete_message(
        self,
        message_id: str,
        folder: str = "INBOX",
        permanent: bool = False,
    ) -> bool:
        """Delete a message."""
        imap = await self._get_imap_connection()

        response = await imap.select(folder)
        if response.result != "OK":
            return False

        if permanent:
            response = await imap.store(message_id, "+FLAGS", EmailFlag.DELETED.value)
            if response.result == "OK":
                await imap.expunge()
                return True
        else:
            folders = await self.list_folders()
            trash_folder = next((f.name for f in folders if f.is_trash), "Trash")
            return await self.move_message(message_id, folder, trash_folder)

        return False

    async def get_thread(
        self,
        message_id: str,
        folder: str = "INBOX",
    ) -> Optional[EmailThread]:
        """Get all messages in a thread."""
        message = await self.get_message(message_id, folder)
        if not message:
            return None

        thread_id = message.in_reply_to or message.message_id

        imap = await self._get_imap_connection()
        await imap.select(folder)

        message_ids = set()

        if thread_id:
            response = await imap.search(f'HEADER "References" "{thread_id}"')
            if response.result == "OK":
                for line in response.lines:
                    if isinstance(line, bytes):
                        line = line.decode()
                    message_ids.update(line.split())

            response = await imap.search(f'HEADER "Message-ID" "{thread_id}"')
            if response.result == "OK":
                for line in response.lines:
                    if isinstance(line, bytes):
                        line = line.decode()
                    message_ids.update(line.split())

        message_ids.add(message_id)

        messages = await self._fetch_messages(imap, list(message_ids), folder, headers_only=False)

        if not messages:
            return None

        messages.sort(key=lambda m: m.date)

        participants = set()
        for msg in messages:
            participants.add(msg.from_addr)
            participants.update(msg.to_addrs)

        return EmailThread(
            thread_id=thread_id or message_id,
            subject=messages[0].subject,
            participants=list(participants),
            messages=messages,
            last_message_date=messages[-1].date,
            unread_count=sum(1 for m in messages if not m.is_read),
            total_count=len(messages),
        )

    async def search(self, query: EmailSearchQuery) -> PaginatedEmails:
        """Search emails with query."""
        return await self.list_messages(folder=query.folder, search_query=query)


# Singleton instance
_email_service: Optional[EmailService] = None


def get_email_service() -> Optional[EmailService]:
    """Get email service singleton."""
    global _email_service
    return _email_service


def configure_email_service(
    imap_host: str,
    imap_port: int = 993,
    smtp_host: str = "",
    smtp_port: int = 587,
    username: str = "",
    password: str = "",
) -> EmailService:
    """Configure and return email service."""
    global _email_service
    _email_service = EmailService(
        imap_host=imap_host,
        imap_port=imap_port,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        username=username,
        password=password,
    )
    return _email_service
