"""
System API Key model for admin-managed external service credentials.
"""

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship


class SystemAPIKey(Base):
    """System API keys for external service credentials (OpenAI, PubMed, etc.)"""

    __tablename__ = "system_api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    integration_id = Column(String(50), unique=True, nullable=False, index=True)
    key_name = Column(String(100), nullable=False)
    encrypted_value = Column(Text, nullable=True)  # Fernet encrypted, NULL = use .env
    is_override = Column(Boolean, default=False, nullable=False)
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
    validation_status = Column(String(20), nullable=True)  # "valid", "invalid", "unknown"
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship
    updated_by_user = relationship("User", foreign_keys=[updated_by])

    def __repr__(self):
        return f"<SystemAPIKey(integration_id={self.integration_id}, key_name={self.key_name})>"
