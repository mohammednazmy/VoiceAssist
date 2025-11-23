"""
Unit tests for message attachments functionality
"""
import pytest
from uuid import uuid4
from app.models.attachment import MessageAttachment


def test_message_attachment_creation():
    """Test creating a MessageAttachment instance"""
    attachment = MessageAttachment(
        id=uuid4(),
        message_id=uuid4(),
        file_name="test.pdf",
        file_type="pdf",
        file_size=1024,
        file_url="https://example.com/test.pdf",
        mime_type="application/pdf",
        file_metadata={"pages": 5}
    )

    assert attachment.file_name == "test.pdf"
    assert attachment.file_type == "pdf"
    assert attachment.file_size == 1024
    assert attachment.file_metadata["pages"] == 5


def test_message_attachment_to_dict():
    """Test converting MessageAttachment to dictionary"""
    attachment_id = uuid4()
    message_id = uuid4()

    attachment = MessageAttachment(
        id=attachment_id,
        message_id=message_id,
        file_name="test.pdf",
        file_type="pdf",
        file_size=1024,
        file_url="https://example.com/test.pdf",
        mime_type="application/pdf",
        file_metadata={"pages": 5}
    )

    result = attachment.to_dict()

    assert result["id"] == str(attachment_id)
    assert result["message_id"] == str(message_id)
    assert result["file_name"] == "test.pdf"
    assert result["file_type"] == "pdf"
    assert result["file_metadata"]["pages"] == 5


def test_message_attachment_no_metadata():
    """Test creating MessageAttachment without metadata"""
    attachment = MessageAttachment(
        id=uuid4(),
        message_id=uuid4(),
        file_name="test.txt",
        file_type="text",
        file_size=512,
        file_url="https://example.com/test.txt"
    )

    assert attachment.file_metadata is None
    result = attachment.to_dict()
    assert result["file_metadata"] is None
