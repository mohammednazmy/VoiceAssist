"""
Organization service for multi-tenancy management.

Handles organization CRUD, membership management, invitations,
and API key management.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import get_logger
from app.models.organization import (
    Organization,
    OrganizationAPIKey,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)
from app.models.user import User
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class OrganizationService:
    """
    Service for managing organizations and multi-tenancy.

    Features:
    - Organization CRUD
    - Membership management
    - Invitation system
    - API key management
    - Audit logging
    """

    def __init__(self, db: Session):
        self.db = db

    # ============ Organization Management ============

    def create_organization(
        self,
        name: str,
        owner_id: str,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        domain: Optional[str] = None,
        plan: str = "free",
    ) -> Organization:
        """Create a new organization with the specified user as owner."""
        # Generate slug if not provided
        if not slug:
            slug = self._generate_slug(name)

        # Validate slug uniqueness
        existing = self.db.query(Organization).filter(Organization.slug == slug).first()
        if existing:
            raise ValueError(f"Organization with slug '{slug}' already exists")

        # Validate domain uniqueness
        if domain:
            existing = self.db.query(Organization).filter(Organization.domain == domain).first()
            if existing:
                raise ValueError(f"Organization with domain '{domain}' already exists")

        # Create organization
        org = Organization(
            name=name,
            slug=slug,
            description=description,
            domain=domain,
            plan=plan,
        )
        org.set_plan(plan)

        self.db.add(org)
        self.db.flush()

        # Add owner as first member
        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=owner_id,
            role=OrganizationMembership.ROLE_OWNER,
            is_default=True,
            status="active",
            accepted_at=datetime.utcnow(),
        )
        self.db.add(membership)

        # Update org user count
        org.current_users = 1

        # Log audit
        self._log_audit(
            org.id,
            owner_id,
            OrganizationAuditLog.ACTION_ORG_CREATED,
            "organization",
            str(org.id),
            {"name": name, "plan": plan},
        )

        self.db.commit()
        self.db.refresh(org)

        logger.info("organization_created", org_id=str(org.id), name=name, owner_id=owner_id)
        return org

    def get_organization(self, org_id: str) -> Optional[Organization]:
        """Get organization by ID."""
        return self.db.query(Organization).filter(Organization.id == org_id).first()

    def get_organization_by_slug(self, slug: str) -> Optional[Organization]:
        """Get organization by slug."""
        return self.db.query(Organization).filter(Organization.slug == slug).first()

    def get_organization_by_domain(self, domain: str) -> Optional[Organization]:
        """Get organization by domain."""
        return self.db.query(Organization).filter(Organization.domain == domain).first()

    def update_organization(
        self,
        org_id: str,
        user_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        logo_url: Optional[str] = None,
        domain: Optional[str] = None,
        settings: Optional[Dict] = None,
    ) -> Optional[Organization]:
        """Update organization details."""
        org = self.get_organization(org_id)
        if not org:
            return None

        changes = {}

        if name is not None and name != org.name:
            org.name = name
            changes["name"] = name

        if description is not None:
            org.description = description
            changes["description"] = description

        if logo_url is not None:
            org.logo_url = logo_url
            changes["logo_url"] = logo_url

        if domain is not None and domain != org.domain:
            # Validate uniqueness
            existing = self.db.query(Organization).filter(
                Organization.domain == domain,
                Organization.id != org_id,
            ).first()
            if existing:
                raise ValueError(f"Domain '{domain}' already in use")
            org.domain = domain
            changes["domain"] = domain

        if settings is not None:
            org.settings = settings
            changes["settings"] = "updated"

        org.updated_at = datetime.utcnow()

        if changes:
            self._log_audit(
                org_id, user_id, OrganizationAuditLog.ACTION_ORG_UPDATED,
                "organization", org_id, changes,
            )

        self.db.commit()
        self.db.refresh(org)

        return org

    def delete_organization(self, org_id: str, user_id: str) -> bool:
        """Delete an organization (soft delete by suspending)."""
        org = self.get_organization(org_id)
        if not org:
            return False

        org.status = Organization.STATUS_SUSPENDED
        org.updated_at = datetime.utcnow()

        self._log_audit(
            org_id, user_id, OrganizationAuditLog.ACTION_ORG_DELETED,
            "organization", org_id, {},
        )

        self.db.commit()

        logger.info("organization_deleted", org_id=org_id, deleted_by=user_id)
        return True

    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug from name."""
        # Convert to lowercase and replace spaces with hyphens
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        slug = slug.strip("-")

        # Ensure uniqueness
        base_slug = slug[:50]
        counter = 0
        while True:
            test_slug = f"{base_slug}-{counter}" if counter else base_slug
            existing = self.db.query(Organization).filter(Organization.slug == test_slug).first()
            if not existing:
                return test_slug
            counter += 1

    # ============ Membership Management ============

    def get_user_organizations(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all organizations a user belongs to."""
        memberships = (
            self.db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
            )
            .all()
        )

        return [
            {
                "organization": m.organization.to_dict(),
                "role": m.role,
                "is_default": m.is_default,
            }
            for m in memberships
        ]

    def get_organization_members(
        self,
        org_id: str,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """Get all members of an organization."""
        query = (
            self.db.query(OrganizationMembership)
            .filter(OrganizationMembership.organization_id == org_id)
        )

        total = query.count()
        offset = (page - 1) * page_size

        memberships = query.order_by(
            OrganizationMembership.role,
            OrganizationMembership.created_at,
        ).offset(offset).limit(page_size).all()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "members": [
                {
                    **m.to_dict(),
                    "user": {
                        "id": str(m.user.id),
                        "email": m.user.email,
                        "name": m.user.name,
                    } if m.user else None,
                }
                for m in memberships
            ],
        }

    def get_membership(
        self,
        org_id: str,
        user_id: str,
    ) -> Optional[OrganizationMembership]:
        """Get specific membership."""
        return self.db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == user_id,
        ).first()

    def add_member(
        self,
        org_id: str,
        user_id: str,
        role: str = "member",
        added_by: Optional[str] = None,
    ) -> OrganizationMembership:
        """Add a user to an organization."""
        # Validate role
        if role not in OrganizationMembership.VALID_ROLES:
            raise ValueError(f"Invalid role. Valid roles: {OrganizationMembership.VALID_ROLES}")

        # Check org capacity
        org = self.get_organization(org_id)
        if not org:
            raise ValueError("Organization not found")

        if not org.can_add_user():
            raise ValueError("Organization user limit reached")

        # Check existing membership
        existing = self.get_membership(org_id, user_id)
        if existing:
            raise ValueError("User is already a member of this organization")

        membership = OrganizationMembership(
            organization_id=org_id,
            user_id=user_id,
            role=role,
            invited_by=added_by,
            invited_at=datetime.utcnow() if added_by else None,
            accepted_at=datetime.utcnow(),
            status="active",
        )
        self.db.add(membership)

        # Update org user count
        org.current_users = (org.current_users or 0) + 1
        org.updated_at = datetime.utcnow()

        self._log_audit(
            org_id, added_by, OrganizationAuditLog.ACTION_MEMBER_ADDED,
            "membership", str(membership.id),
            {"user_id": user_id, "role": role},
        )

        self.db.commit()
        self.db.refresh(membership)

        return membership

    def update_member_role(
        self,
        org_id: str,
        user_id: str,
        new_role: str,
        updated_by: str,
    ) -> Optional[OrganizationMembership]:
        """Update a member's role."""
        if new_role not in OrganizationMembership.VALID_ROLES:
            raise ValueError(f"Invalid role. Valid roles: {OrganizationMembership.VALID_ROLES}")

        membership = self.get_membership(org_id, user_id)
        if not membership:
            return None

        old_role = membership.role
        membership.role = new_role

        self._log_audit(
            org_id, updated_by, OrganizationAuditLog.ACTION_MEMBER_ROLE_CHANGED,
            "membership", str(membership.id),
            {"user_id": user_id, "old_role": old_role, "new_role": new_role},
        )

        self.db.commit()
        self.db.refresh(membership)

        return membership

    def remove_member(
        self,
        org_id: str,
        user_id: str,
        removed_by: str,
    ) -> bool:
        """Remove a member from an organization."""
        membership = self.get_membership(org_id, user_id)
        if not membership:
            return False

        # Cannot remove owner
        if membership.role == OrganizationMembership.ROLE_OWNER:
            raise ValueError("Cannot remove organization owner")

        self.db.delete(membership)

        # Update org user count
        org = self.get_organization(org_id)
        if org:
            org.current_users = max(0, (org.current_users or 0) - 1)
            org.updated_at = datetime.utcnow()

        self._log_audit(
            org_id, removed_by, OrganizationAuditLog.ACTION_MEMBER_REMOVED,
            "membership", str(membership.id),
            {"user_id": user_id},
        )

        self.db.commit()

        return True

    def set_default_organization(
        self,
        user_id: str,
        org_id: str,
    ) -> bool:
        """Set an organization as the user's default."""
        # Clear other defaults
        self.db.query(OrganizationMembership).filter(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.is_default == True,  # noqa: E712
        ).update({"is_default": False})

        # Set new default
        membership = self.get_membership(org_id, user_id)
        if not membership:
            return False

        membership.is_default = True

        # Persist on user record as well for fast lookup
        user = self.db.query(User).filter(User.id == user_id).first()
        if user:
            user.default_organization_id = org_id

        self.db.commit()

        return True

    def get_user_default_organization(self, user_id: str) -> Optional[Organization]:
        """
        Resolve the effective default organization for a user.

        Preference order:
        1. User.default_organization_id, if set and active
        2. Membership marked is_default, if active
        3. First active membership by created_at
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        # 1) Explicit default organization on user record
        if user.default_organization_id:
            org = self.get_organization(str(user.default_organization_id))
            if org and org.is_active:
                return org

        # 2) Membership flagged as default
        default_membership = (
            self.db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
                OrganizationMembership.is_default == True,  # noqa: E712
            )
            .first()
        )
        if default_membership and default_membership.organization and default_membership.organization.is_active:
            return default_membership.organization

        # 3) Fallback: first active membership
        first_membership = (
            self.db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
            )
            .order_by(OrganizationMembership.created_at.asc())
            .first()
        )
        if first_membership and first_membership.organization and first_membership.organization.is_active:
            return first_membership.organization

        return None

    # ============ Invitation Management ============

    def create_invitation(
        self,
        org_id: str,
        email: str,
        role: str,
        invited_by: str,
        expires_days: int = 7,
    ) -> OrganizationInvitation:
        """Create an invitation to join an organization."""
        # Check org capacity
        org = self.get_organization(org_id)
        if not org:
            raise ValueError("Organization not found")

        if not org.can_add_user():
            raise ValueError("Organization user limit reached")

        # Check for existing pending invitation
        existing = self.db.query(OrganizationInvitation).filter(
            OrganizationInvitation.organization_id == org_id,
            OrganizationInvitation.email == email.lower(),
            OrganizationInvitation.accepted_at.is_(None),
            OrganizationInvitation.expires_at > datetime.utcnow(),
        ).first()

        if existing:
            raise ValueError("An active invitation already exists for this email")

        # Check if user is already a member
        user = self.db.query(User).filter(func.lower(User.email) == email.lower()).first()
        if user:
            membership = self.get_membership(org_id, str(user.id))
            if membership:
                raise ValueError("User is already a member of this organization")

        invitation = OrganizationInvitation(
            organization_id=org_id,
            email=email.lower(),
            role=role,
            invited_by=invited_by,
            token=OrganizationInvitation.generate_token(),
            expires_at=datetime.utcnow() + timedelta(days=expires_days),
        )
        self.db.add(invitation)

        self._log_audit(
            org_id, invited_by, OrganizationAuditLog.ACTION_INVITATION_SENT,
            "invitation", str(invitation.id),
            {"email": email, "role": role},
        )

        self.db.commit()
        self.db.refresh(invitation)

        logger.info("invitation_created", org_id=org_id, email=email, role=role)
        return invitation

    def get_invitation_by_token(self, token: str) -> Optional[OrganizationInvitation]:
        """Get invitation by token."""
        return self.db.query(OrganizationInvitation).filter(
            OrganizationInvitation.token == token
        ).first()

    def accept_invitation(
        self,
        token: str,
        user_id: str,
    ) -> OrganizationMembership:
        """Accept an invitation and create membership."""
        invitation = self.get_invitation_by_token(token)

        if not invitation:
            raise ValueError("Invitation not found")

        if invitation.is_expired:
            raise ValueError("Invitation has expired")

        if invitation.is_accepted:
            raise ValueError("Invitation has already been accepted")

        # Verify email matches
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user or user.email.lower() != invitation.email.lower():
            raise ValueError("Email does not match invitation")

        # Create membership
        membership = self.add_member(
            org_id=str(invitation.organization_id),
            user_id=user_id,
            role=invitation.role,
            added_by=str(invitation.invited_by) if invitation.invited_by else None,
        )

        # Mark invitation as accepted
        invitation.accepted_at = datetime.utcnow()

        self._log_audit(
            str(invitation.organization_id), user_id,
            OrganizationAuditLog.ACTION_INVITATION_ACCEPTED,
            "invitation", str(invitation.id), {},
        )

        self.db.commit()

        return membership

    def get_pending_invitations(
        self,
        org_id: str,
    ) -> List[OrganizationInvitation]:
        """Get all pending invitations for an organization."""
        return self.db.query(OrganizationInvitation).filter(
            OrganizationInvitation.organization_id == org_id,
            OrganizationInvitation.accepted_at.is_(None),
            OrganizationInvitation.expires_at > datetime.utcnow(),
        ).all()

    def revoke_invitation(self, invitation_id: str) -> bool:
        """Revoke (delete) an invitation."""
        invitation = self.db.query(OrganizationInvitation).filter(
            OrganizationInvitation.id == invitation_id
        ).first()

        if not invitation:
            return False

        self.db.delete(invitation)
        self.db.commit()

        return True

    # ============ API Key Management ============

    def create_api_key(
        self,
        org_id: str,
        name: str,
        created_by: str,
        permissions: Optional[List[str]] = None,
        rate_limit: Optional[int] = None,
        expires_days: Optional[int] = None,
    ) -> tuple:
        """Create a new API key. Returns (key, key_record)."""
        key, prefix, key_hash = OrganizationAPIKey.generate_key()

        api_key = OrganizationAPIKey(
            organization_id=org_id,
            name=name,
            key_hash=key_hash,
            key_prefix=prefix,
            permissions=permissions,
            rate_limit=rate_limit,
            expires_at=datetime.utcnow() + timedelta(days=expires_days) if expires_days else None,
            created_by=created_by,
        )
        self.db.add(api_key)

        self._log_audit(
            org_id, created_by, OrganizationAuditLog.ACTION_API_KEY_CREATED,
            "api_key", str(api_key.id),
            {"name": name, "prefix": prefix},
        )

        self.db.commit()
        self.db.refresh(api_key)

        # Return the actual key only once - it cannot be retrieved later
        return key, api_key

    def validate_api_key(self, key: str) -> Optional[tuple]:
        """Validate an API key. Returns (organization, api_key) if valid."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()

        api_key = self.db.query(OrganizationAPIKey).filter(
            OrganizationAPIKey.key_hash == key_hash
        ).first()

        if not api_key:
            return None

        if not api_key.is_active:
            return None

        # Update last used
        api_key.update_last_used()
        self.db.commit()

        org = self.get_organization(str(api_key.organization_id))
        return org, api_key

    def get_organization_api_keys(self, org_id: str) -> List[OrganizationAPIKey]:
        """Get all API keys for an organization."""
        return self.db.query(OrganizationAPIKey).filter(
            OrganizationAPIKey.organization_id == org_id,
            OrganizationAPIKey.revoked_at.is_(None),
        ).order_by(OrganizationAPIKey.created_at.desc()).all()

    def revoke_api_key(
        self,
        key_id: str,
        revoked_by: str,
    ) -> bool:
        """Revoke an API key."""
        api_key = self.db.query(OrganizationAPIKey).filter(
            OrganizationAPIKey.id == key_id
        ).first()

        if not api_key:
            return False

        api_key.revoke()

        self._log_audit(
            str(api_key.organization_id), revoked_by,
            OrganizationAuditLog.ACTION_API_KEY_REVOKED,
            "api_key", key_id,
            {"name": api_key.name, "prefix": api_key.key_prefix},
        )

        self.db.commit()

        return True

    # ============ Audit Logging ============

    def _log_audit(
        self,
        org_id: str,
        user_id: Optional[str],
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict] = None,
        ip_address: Optional[str] = None,
    ) -> OrganizationAuditLog:
        """Create an audit log entry."""
        log = OrganizationAuditLog(
            organization_id=org_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        self.db.add(log)
        return log

    def get_audit_logs(
        self,
        org_id: str,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """Get audit logs for an organization."""
        query = self.db.query(OrganizationAuditLog).filter(
            OrganizationAuditLog.organization_id == org_id
        )

        if action:
            query = query.filter(OrganizationAuditLog.action == action)
        if user_id:
            query = query.filter(OrganizationAuditLog.user_id == user_id)
        if resource_type:
            query = query.filter(OrganizationAuditLog.resource_type == resource_type)

        total = query.count()
        offset = (page - 1) * page_size

        logs = query.order_by(
            OrganizationAuditLog.created_at.desc()
        ).offset(offset).limit(page_size).all()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "logs": [log.to_dict() for log in logs],
        }

    # ============ Permission Checking ============

    def check_permission(
        self,
        org_id: str,
        user_id: str,
        permission: str,
    ) -> bool:
        """Check if a user has a specific permission in an organization."""
        membership = self.get_membership(org_id, user_id)
        if not membership:
            return False

        if membership.status != "active":
            return False

        return membership.has_permission(permission)

    def require_permission(
        self,
        org_id: str,
        user_id: str,
        permission: str,
    ) -> None:
        """Require a permission, raise exception if not granted."""
        if not self.check_permission(org_id, user_id, permission):
            raise PermissionError(f"Permission '{permission}' required")
