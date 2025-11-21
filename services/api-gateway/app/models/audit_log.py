"""
Audit log model for tracking user actions and system events.

Required for HIPAA compliance - all access to PHI must be logged.
"""
from sqlalchemy import Column, String, DateTime, Boolean, JSON, UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import hashlib
from datetime import datetime


class AuditLog(Base):
    """
    Audit log entry for tracking user actions and system events.

    Includes integrity verification via hash to detect tampering.
    Immutable - should never be updated or deleted.
    """
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)

    # Who performed the action
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)  # Null for system actions
    user_email = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)

    # What action was performed
    action = Column(String(100), nullable=False, index=True)  # login, logout, create_user, etc.
    resource_type = Column(String(100), nullable=True)  # user, session, message, document, etc.
    resource_id = Column(String(255), nullable=True)

    # Request context
    request_id = Column(String(100), nullable=True, index=True)  # Correlation ID
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)

    # Service context
    service_name = Column(String(100), nullable=False, default="api-gateway")
    endpoint = Column(String(255), nullable=True)  # API endpoint called

    # Result
    success = Column(Boolean, nullable=False)
    status_code = Column(String(10), nullable=True)  # HTTP status code
    error_message = Column(String(1000), nullable=True)

    # Additional context (JSON)
    additional_data = Column(JSON, nullable=True)

    # Integrity verification
    hash = Column(String(64), nullable=False)  # SHA-256 hash for tamper detection

    def calculate_hash(self) -> str:
        """
        Calculate SHA-256 hash of critical fields for integrity verification.

        This allows detection of unauthorized modifications to audit logs.
        """
        # Use only immutable fields that won't change
        data = f"{self.timestamp}{self.user_id}{self.action}{self.resource_type}{self.resource_id}{self.success}"
        return hashlib.sha256(data.encode()).hexdigest()

    def verify_integrity(self) -> bool:
        """
        Verify that the audit log has not been tampered with.

        Returns:
            True if hash matches, False if log has been modified.
        """
        expected_hash = self.calculate_hash()
        return self.hash == expected_hash

    def __repr__(self):
        return (
            f"<AuditLog(id={self.id}, "
            f"user={self.user_email}, "
            f"action={self.action}, "
            f"resource={self.resource_type}, "
            f"success={self.success})>"
        )
