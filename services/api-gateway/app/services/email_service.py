"""
Email Integration Service (Phase 6 Skeleton)

Provides basic email operations via IMAP/SMTP for Nextcloud Mail or external
email servers. This is a skeleton implementation for Phase 6 MVP, to be
expanded in future phases with full email management capabilities.

MVP Implementation:
- IMAP connection for reading emails
- SMTP connection for sending emails
- List mailbox folders
- Fetch recent messages
- Send basic emails
- Connection management

Future enhancements:
- Advanced email filtering and search
- Attachment handling
- Email threading and conversations
- Nextcloud Mail API integration
- Email templates and bulk sending
- Read receipts and tracking
"""
from __future__ import annotations

import logging
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientError

logger = logging.getLogger(__name__)


@dataclass
class EmailMessage:
    """Represents an email message."""
    message_id: str
    subject: str
    from_address: str
    to_addresses: List[str]
    cc_addresses: List[str]
    date: datetime
    body: str
    is_read: bool = False
    has_attachments: bool = False


class EmailService:
    """
    Email integration service (IMAP/SMTP).

    Provides basic email operations for reading and sending messages.
    Phase 6 skeleton implementation.
    """

    def __init__(
        self,
        imap_host: str,
        imap_port: int,
        smtp_host: str,
        smtp_port: int,
        username: str,
        password: str,
        use_ssl: bool = True
    ):
        """
        Initialize email service.

        Args:
            imap_host: IMAP server hostname
            imap_port: IMAP server port (typically 993 for SSL)
            smtp_host: SMTP server hostname
            smtp_port: SMTP server port (typically 465 for SSL, 587 for STARTTLS)
            username: Email account username
            password: Email account password
            use_ssl: Use SSL/TLS for connections
        """
        self.imap_host = imap_host
        self.imap_port = imap_port
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl

        self.imap_client: Optional[IMAPClient] = None

    def connect_imap(self) -> bool:
        """
        Connect to IMAP server.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.imap_client = IMAPClient(
                host=self.imap_host,
                port=self.imap_port,
                ssl=self.use_ssl
            )

            self.imap_client.login(self.username, self.password)

            logger.info(f"Successfully connected to IMAP server: {self.imap_host}")
            return True

        except IMAPClientError as e:
            logger.error(f"Failed to connect to IMAP server: {e}", exc_info=True)
            return False

    def disconnect_imap(self):
        """Disconnect from IMAP server."""
        if self.imap_client:
            try:
                self.imap_client.logout()
                logger.info("Disconnected from IMAP server")
            except Exception as e:
                logger.warning(f"Error disconnecting from IMAP: {e}")
            finally:
                self.imap_client = None

    def list_folders(self) -> List[Dict[str, Any]]:
        """
        List all mailbox folders.

        Returns:
            List of folder dictionaries with name and flags
        """
        if not self.imap_client:
            if not self.connect_imap():
                return []

        try:
            folders = self.imap_client.list_folders()

            folder_list = []
            for folder in folders:
                folder_list.append({
                    "flags": folder[0],
                    "delimiter": folder[1],
                    "name": folder[2]
                })

            logger.info(f"Found {len(folder_list)} mailbox folders")
            return folder_list

        except IMAPClientError as e:
            logger.error(f"Error listing folders: {e}", exc_info=True)
            return []

    def fetch_recent_messages(
        self,
        folder: str = "INBOX",
        limit: int = 50
    ) -> List[EmailMessage]:
        """
        Fetch recent messages from a mailbox folder.

        Args:
            folder: Mailbox folder name (default: INBOX)
            limit: Maximum number of messages to fetch

        Returns:
            List of EmailMessage objects
        """
        if not self.imap_client:
            if not self.connect_imap():
                return []

        try:
            # Select folder
            self.imap_client.select_folder(folder)

            # Search for recent messages
            messages = self.imap_client.search(['ALL'])

            # Get last N messages
            message_ids = messages[-limit:] if len(messages) > limit else messages

            # Fetch message data
            messages_data = self.imap_client.fetch(message_ids, ['ENVELOPE', 'FLAGS', 'BODY.PEEK[]'])

            email_messages = []
            for msg_id, data in messages_data.items():
                try:
                    envelope = data[b'ENVELOPE']
                    flags = data[b'FLAGS']

                    email_message = EmailMessage(
                        message_id=str(msg_id),
                        subject=envelope.subject.decode('utf-8', errors='ignore') if envelope.subject else "(No Subject)",
                        from_address=envelope.from_[0].mailbox.decode() + '@' + envelope.from_[0].host.decode() if envelope.from_ else "unknown",
                        to_addresses=[addr.mailbox.decode() + '@' + addr.host.decode() for addr in (envelope.to or [])],
                        cc_addresses=[addr.mailbox.decode() + '@' + addr.host.decode() for addr in (envelope.cc or [])],
                        date=envelope.date,
                        body="",  # Body parsing skipped in skeleton version
                        is_read=b'\\Seen' in flags,
                        has_attachments=False  # Attachment detection skipped in skeleton
                    )
                    email_messages.append(email_message)

                except Exception as e:
                    logger.warning(f"Failed to parse message {msg_id}: {e}")
                    continue

            logger.info(f"Fetched {len(email_messages)} messages from {folder}")
            return email_messages

        except IMAPClientError as e:
            logger.error(f"Error fetching messages: {e}", exc_info=True)
            return []

    def send_email(
        self,
        to_addresses: List[str],
        subject: str,
        body: str,
        cc_addresses: Optional[List[str]] = None,
        bcc_addresses: Optional[List[str]] = None,
        is_html: bool = False
    ) -> bool:
        """
        Send an email via SMTP.

        Args:
            to_addresses: List of recipient email addresses
            subject: Email subject
            body: Email body content
            cc_addresses: List of CC recipients
            bcc_addresses: List of BCC recipients
            is_html: Whether body is HTML content

        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.username
            msg['To'] = ', '.join(to_addresses)
            msg['Subject'] = subject

            if cc_addresses:
                msg['Cc'] = ', '.join(cc_addresses)

            # Attach body
            body_type = 'html' if is_html else 'plain'
            msg.attach(MIMEText(body, body_type))

            # Connect to SMTP server
            if self.use_ssl:
                smtp_client = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port)
            else:
                smtp_client = smtplib.SMTP(self.smtp_host, self.smtp_port)
                smtp_client.starttls()

            smtp_client.login(self.username, self.password)

            # Send email
            all_recipients = to_addresses + (cc_addresses or []) + (bcc_addresses or [])
            smtp_client.sendmail(self.username, all_recipients, msg.as_string())

            smtp_client.quit()

            logger.info(f"Successfully sent email to {len(all_recipients)} recipients")
            return True

        except Exception as e:
            logger.error(f"Error sending email: {e}", exc_info=True)
            return False

    def mark_as_read(
        self,
        message_id: str,
        folder: str = "INBOX"
    ) -> bool:
        """
        Mark a message as read.

        Args:
            message_id: Message identifier
            folder: Mailbox folder containing the message

        Returns:
            True if successful, False otherwise
        """
        if not self.imap_client:
            if not self.connect_imap():
                return False

        try:
            self.imap_client.select_folder(folder)
            self.imap_client.add_flags([int(message_id)], [b'\\Seen'])

            logger.info(f"Marked message {message_id} as read")
            return True

        except IMAPClientError as e:
            logger.error(f"Error marking message as read: {e}", exc_info=True)
            return False

    def delete_message(
        self,
        message_id: str,
        folder: str = "INBOX"
    ) -> bool:
        """
        Delete a message (move to trash/deleted items).

        Args:
            message_id: Message identifier
            folder: Mailbox folder containing the message

        Returns:
            True if successful, False otherwise
        """
        if not self.imap_client:
            if not self.connect_imap():
                return False

        try:
            self.imap_client.select_folder(folder)
            self.imap_client.add_flags([int(message_id)], [b'\\Deleted'])
            self.imap_client.expunge()

            logger.info(f"Deleted message {message_id}")
            return True

        except IMAPClientError as e:
            logger.error(f"Error deleting message: {e}", exc_info=True)
            return False
