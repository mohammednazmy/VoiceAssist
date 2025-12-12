"""
Organization models for multi-tenancy support.

Enables multiple organizations (tenants) to use the platform
with data isolation and access control.
"""

import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class Organization(Base):
    """
    Represents an organization (tenant) in the system.

    All resources can be scoped to an organization for data isolation.
    """

    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    domain = Column(String(255), unique=True, nullable=True, index=True)
    description = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)

    # Status
    status = Column(String(50), nullable=False, default="active", index=True)

    # Plan/Tier
    plan = Column(String(50), nullable=False, default="free", index=True)
    plan_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Limits
    max_users = Column(Integer, nullable=False, default=5)
    max_documents = Column(Integer, nullable=False, default=100)
    max_storage_mb = Column(Integer, nullable=False, default=1000)

    # Usage
    current_users = Column(Integer, nullable=False, default=0)
    current_documents = Column(Integer, nullable=False, default=0)
    current_storage_mb = Column(Integer, nullable=False, default=0)

    # Settings
    settings = Column(JSONB, nullable=True)
    features = Column(JSONB, nullable=True)

    # Contact
    billing_email = Column(String(255), nullable=True)
    technical_contact = Column(String(255), nullable=True)

    # Metadata
    org_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    memberships = relationship("OrganizationMembership", back_populates="organization", cascade="all, delete-orphan")
    invitations = relationship("OrganizationInvitation", back_populates="organization", cascade="all, delete-orphan")
    api_keys = relationship("OrganizationAPIKey", back_populates="organization", cascade="all, delete-orphan")
    audit_logs = relationship("OrganizationAuditLog", back_populates="organization", cascade="all, delete-orphan")

    # Status constants
    STATUS_ACTIVE = "active"
    STATUS_SUSPENDED = "suspended"
    STATUS_TRIAL = "trial"

    VALID_STATUSES = [STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_TRIAL]

    # Plan constants
    PLAN_FREE = "free"
    PLAN_STARTER = "starter"
    PLAN_PROFESSIONAL = "professional"
    PLAN_ENTERPRISE = "enterprise"

    VALID_PLANS = [PLAN_FREE, PLAN_STARTER, PLAN_PROFESSIONAL, PLAN_ENTERPRISE]

    # Plan limits
    PLAN_LIMITS = {
        PLAN_FREE: {"max_users": 5, "max_documents": 100, "max_storage_mb": 1000},
        PLAN_STARTER: {"max_users": 20, "max_documents": 500, "max_storage_mb": 5000},
        PLAN_PROFESSIONAL: {"max_users": 100, "max_documents": 2000, "max_storage_mb": 20000},
        PLAN_ENTERPRISE: {"max_users": 1000, "max_documents": 10000, "max_storage_mb": 100000},
    }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "name": self.name,
            "slug": self.slug,
            "domain": self.domain,
            "description": self.description,
            "logo_url": self.logo_url,
            "status": self.status,
            "plan": self.plan,
            "plan_expires_at": self.plan_expires_at.isoformat() if self.plan_expires_at else None,
            "max_users": self.max_users,
            "max_documents": self.max_documents,
            "max_storage_mb": self.max_storage_mb,
            "current_users": self.current_users,
            "current_documents": self.current_documents,
            "current_storage_mb": self.current_storage_mb,
            "settings": self.settings,
            "features": self.features,
            "billing_email": self.billing_email,
            "technical_contact": self.technical_contact,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_public(self) -> Dict[str, Any]:
        """Get public representation (for non-admin users)."""
        return {
            "id": str(self.id),
            "name": self.name,
            "slug": self.slug,
            "logo_url": self.logo_url,
            "plan": self.plan,
        }

    @property
    def is_active(self) -> bool:
        """Check if organization is active."""
        return self.status == self.STATUS_ACTIVE

    @property
    def users_limit_reached(self) -> bool:
        """Check if user limit is reached."""
        return self.current_users >= self.max_users

    @property
    def documents_limit_reached(self) -> bool:
        """Check if document limit is reached."""
        return self.current_documents >= self.max_documents

    @property
    def storage_limit_reached(self) -> bool:
        """Check if storage limit is reached."""
        return self.current_storage_mb >= self.max_storage_mb

    def can_add_user(self) -> bool:
        """Check if a new user can be added."""
        return self.is_active and not self.users_limit_reached

    def can_add_document(self, size_mb: int = 0) -> bool:
        """Check if a new document can be added."""
        if not self.is_active:
            return False
        if self.documents_limit_reached:
            return False
        if self.current_storage_mb + size_mb > self.max_storage_mb:
            return False
        return True

    def set_plan(self, plan: str) -> None:
        """Update organization plan with appropriate limits."""
        if plan not in self.VALID_PLANS:
            raise ValueError(f"Invalid plan. Valid plans: {self.VALID_PLANS}")

        self.plan = plan
        limits = self.PLAN_LIMITS.get(plan, self.PLAN_LIMITS[self.PLAN_FREE])
        self.max_users = limits["max_users"]
        self.max_documents = limits["max_documents"]
        self.max_storage_mb = limits["max_storage_mb"]
        self.updated_at = datetime.utcnow()


class OrganizationMembership(Base):
    """
    Represents a user's membership in an organization.

    Defines the role and permissions for the user within the org.
    """

    __tablename__ = "organization_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(50), nullable=False, default="member", index=True)
    is_default = Column(Boolean, nullable=False, default=False)
    invited_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), nullable=False, default="active")
    permissions = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="memberships")
    user = relationship("User", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_user_membership"),
    )

    # Role constants
    ROLE_OWNER = "owner"
    ROLE_ADMIN = "admin"
    ROLE_MEMBER = "member"
    ROLE_VIEWER = "viewer"

    VALID_ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER, ROLE_VIEWER]

    # Role permissions
    ROLE_PERMISSIONS = {
        ROLE_OWNER: ["*"],  # All permissions
        ROLE_ADMIN: [
            "org:read", "org:update", "members:manage", "documents:manage",
            "sessions:manage", "api_keys:manage", "settings:manage",
        ],
        ROLE_MEMBER: [
            "org:read", "documents:read", "documents:create", "documents:update",
            "sessions:read", "sessions:create",
        ],
        ROLE_VIEWER: [
            "org:read", "documents:read", "sessions:read",
        ],
    }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "user_id": str(self.user_id),
            "role": self.role,
            "is_default": self.is_default,
            "invited_by": str(self.invited_by) if self.invited_by else None,
            "invited_at": self.invited_at.isoformat() if self.invited_at else None,
            "accepted_at": self.accepted_at.isoformat() if self.accepted_at else None,
            "status": self.status,
            "permissions": self.permissions,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def has_permission(self, permission: str) -> bool:
        """Check if membership has a specific permission."""
        # Custom permissions override role permissions
        if self.permissions:
            return permission in self.permissions or "*" in self.permissions

        role_perms = self.ROLE_PERMISSIONS.get(self.role, [])
        return permission in role_perms or "*" in role_perms

    def can_manage_members(self) -> bool:
        """Check if can manage other members."""
        return self.role in [self.ROLE_OWNER, self.ROLE_ADMIN]

    def can_manage_documents(self) -> bool:
        """Check if can manage documents."""
        return self.role in [self.ROLE_OWNER, self.ROLE_ADMIN, self.ROLE_MEMBER]


class OrganizationInvitation(Base):
    """
    Represents a pending invitation to join an organization.
    """

    __tablename__ = "organization_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), nullable=False, default="member")
    invited_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by])

    @classmethod
    def generate_token(cls) -> str:
        """Generate a secure invitation token."""
        return secrets.token_urlsafe(32)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "email": self.email,
            "role": self.role,
            "invited_by": str(self.invited_by) if self.invited_by else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "accepted_at": self.accepted_at.isoformat() if self.accepted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_expired": self.is_expired,
        }

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        return datetime.utcnow() > self.expires_at

    @property
    def is_accepted(self) -> bool:
        """Check if invitation was accepted."""
        return self.accepted_at is not None


class OrganizationAPIKey(Base):
    """
    API keys for programmatic access to organization resources.
    """

    __tablename__ = "organization_api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), nullable=False)
    key_prefix = Column(String(20), nullable=False)
    permissions = Column(JSONB, nullable=True)
    rate_limit = Column(Integer, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="api_keys")
    creator = relationship("User", foreign_keys=[created_by])

    @classmethod
    def generate_key(cls) -> tuple:
        """Generate a new API key. Returns (key, prefix, hash)."""
        import hashlib

        key = f"vak_{secrets.token_urlsafe(32)}"
        prefix = key[:12]
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        return key, prefix, key_hash

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "name": self.name,
            "key_prefix": self.key_prefix,
            "permissions": self.permissions,
            "rate_limit": self.rate_limit,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_by": str(self.created_by) if self.created_by else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_active": self.is_active,
        }

    @property
    def is_active(self) -> bool:
        """Check if API key is active."""
        if self.revoked_at:
            return False
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True

    def update_last_used(self) -> None:
        """Update last used timestamp."""
        self.last_used_at = datetime.utcnow()

    def revoke(self) -> None:
        """Revoke the API key."""
        self.revoked_at = datetime.utcnow()


class OrganizationAuditLog(Base):
    """
    Audit log for organization actions.

    Tracks all significant actions within an organization.
    """

    __tablename__ = "organization_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(100), nullable=True)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    organization = relationship("Organization", back_populates="audit_logs")
    user = relationship("User", foreign_keys=[user_id])

    # Action constants
    ACTION_ORG_CREATED = "org.created"
    ACTION_ORG_UPDATED = "org.updated"
    ACTION_ORG_DELETED = "org.deleted"
    ACTION_MEMBER_ADDED = "member.added"
    ACTION_MEMBER_REMOVED = "member.removed"
    ACTION_MEMBER_ROLE_CHANGED = "member.role_changed"
    ACTION_INVITATION_SENT = "invitation.sent"
    ACTION_INVITATION_ACCEPTED = "invitation.accepted"
    ACTION_API_KEY_CREATED = "api_key.created"
    ACTION_API_KEY_REVOKED = "api_key.revoked"
    ACTION_DOCUMENT_CREATED = "document.created"
    ACTION_DOCUMENT_DELETED = "document.deleted"
    ACTION_SETTINGS_CHANGED = "settings.changed"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "user_id": str(self.user_id) if self.user_id else None,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
