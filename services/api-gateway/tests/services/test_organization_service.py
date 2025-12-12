"""Tests for OrganizationService and organization models (multi-tenancy)."""

from datetime import datetime, timedelta
from uuid import uuid4
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.models.organization import (
    Organization,
    OrganizationAPIKey,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)
from app.services.organization_service import OrganizationService


@pytest.fixture
def mock_db() -> Session:
    """Mock database session."""
    return MagicMock(spec=Session)


@pytest.fixture
def service(mock_db: Session) -> OrganizationService:
    """OrganizationService bound to mock session."""
    return OrganizationService(mock_db)


class TestOrganizationService:
    """Behavioral tests for OrganizationService."""

    def test_create_organization_success(self, service: OrganizationService, mock_db: Session) -> None:
        """Creating an organization persists org and owner membership."""
        mock_db.query.return_value.filter.return_value.first.return_value = None
        owner_id = str(uuid4())

        org = service.create_organization(
            name="Test Org",
            owner_id=owner_id,
            slug="test-org",
            description="A test organization",
        )

        assert isinstance(org, Organization)
        assert org.slug == "test-org"
        mock_db.add.assert_called()
        mock_db.commit.assert_called()

    def test_set_default_organization_updates_membership_and_user(
        self,
        service: OrganizationService,
        mock_db: Session,
    ) -> None:
        """Setting default org marks membership and user.default_organization_id."""
        user_id = str(uuid4())
        org_id = str(uuid4())

        membership = OrganizationMembership(
            organization_id=org_id,
            user_id=user_id,
            role=OrganizationMembership.ROLE_MEMBER,
            is_default=False,
        )
        service.get_membership = MagicMock(return_value=membership)  # type: ignore[assignment]

        user = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = user

        success = service.set_default_organization(user_id=user_id, org_id=org_id)

        assert success is True
        assert membership.is_default is True
        assert user.default_organization_id == org_id
        mock_db.commit.assert_called()

    def test_check_permission_uses_role_permissions(self, service: OrganizationService, mock_db: Session) -> None:
        """check_permission delegates to membership.has_permission."""
        org_id = str(uuid4())
        user_id = str(uuid4())
        membership = MagicMock(spec=OrganizationMembership)
        membership.status = "active"
        membership.has_permission.return_value = True
        service.get_membership = MagicMock(return_value=membership)  # type: ignore[assignment]

        allowed = service.check_permission(org_id, user_id, "documents:manage")

        assert allowed is True
        membership.has_permission.assert_called_with("documents:manage")


class TestOrganizationModels:
    """Model-level tests for organization entities."""

    def test_organization_plan_limits_constants(self) -> None:
        """Plan limits map contains expected tiers."""
        assert "starter" in Organization.PLAN_LIMITS
        assert "professional" in Organization.PLAN_LIMITS
        assert "enterprise" in Organization.PLAN_LIMITS

    def test_organization_to_dict_includes_core_fields(self) -> None:
        """Organization.to_dict exposes basic metadata."""
        org = Organization(
            id=uuid4(),
            name="Test Org",
            slug="test-org",
            status=Organization.STATUS_ACTIVE,
            plan=Organization.PLAN_PROFESSIONAL,
            max_users=50,
            current_users=10,
        )

        data = org.to_dict()

        assert data["name"] == "Test Org"
        assert data["slug"] == "test-org"
        assert data["status"] == "active"
        assert data["plan"] == "professional"

    def test_membership_to_dict_includes_role_and_status(self) -> None:
        """OrganizationMembership.to_dict exposes role and status."""
        membership = OrganizationMembership(
            id=uuid4(),
            organization_id=uuid4(),
            user_id=uuid4(),
            role=OrganizationMembership.ROLE_ADMIN,
            status="active",
        )

        data = membership.to_dict()

        assert data["role"] == "admin"
        assert data["status"] == "active"

    def test_invitation_expiry_flags(self) -> None:
        """Invitation exposes is_expired flag."""
        invitation = OrganizationInvitation(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            role="member",
            token="abc123",
            expires_at=datetime.utcnow() + timedelta(days=7),
        )

        data = invitation.to_dict()
        assert data["is_expired"] is False

    def test_api_key_to_dict_hides_hash(self) -> None:
        """API key dict does not expose key_hash."""
        api_key = OrganizationAPIKey(
            id=uuid4(),
            organization_id=uuid4(),
            name="Test Key",
            key_hash="secret",
            key_prefix="va_abc",
        )

        data = api_key.to_dict()

        assert data["name"] == "Test Key"
        assert data["key_prefix"] == "va_abc"
        assert "key_hash" not in data

    def test_audit_log_to_dict_includes_action(self) -> None:
        """Audit log dict includes action and resource info."""
        log = OrganizationAuditLog(
            id=uuid4(),
            organization_id=uuid4(),
            user_id=uuid4(),
            action=OrganizationAuditLog.ACTION_MEMBER_ADDED,
            resource_type="user",
            resource_id=str(uuid4()),
            details={"role": "admin"},
        )

        data = log.to_dict()

        assert data["action"] == OrganizationAuditLog.ACTION_MEMBER_ADDED
        assert data["resource_type"] == "user"
        assert data["details"]["role"] == "admin"

