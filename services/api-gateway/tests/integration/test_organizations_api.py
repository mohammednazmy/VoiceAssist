"""Integration tests for Organizations API (Multi-Tenancy)"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from app.main import app
from app.models.organization import (
    Organization,
    OrganizationAPIKey,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)
from fastapi.testclient import TestClient


class TestOrganizationsAPISmoke:
    """Smoke tests to verify routes are registered"""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.mark.smoke
    def test_organizations_list_route_exists(self, client):
        """Verify /api/organizations route is registered"""
        resp = client.get("/api/organizations")
        # Should return 401/403 for unauthenticated, not 404
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_organizations_create_route_exists(self, client):
        """Verify POST /api/organizations route is registered"""
        resp = client.post("/api/organizations", json={})
        assert resp.status_code in (401, 403, 422)  # 422 if validation fails

    @pytest.mark.smoke
    def test_organization_detail_route_exists(self, client):
        """Verify /api/organizations/{id} route is registered"""
        resp = client.get(f"/api/organizations/{uuid4()}")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_organization_members_route_exists(self, client):
        """Verify /api/organizations/{id}/members route is registered"""
        resp = client.get(f"/api/organizations/{uuid4()}/members")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_organization_invitations_route_exists(self, client):
        """Verify /api/organizations/{id}/invitations route is registered"""
        resp = client.get(f"/api/organizations/{uuid4()}/invitations")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_organization_api_keys_route_exists(self, client):
        """Verify /api/organizations/{id}/api-keys route is registered"""
        resp = client.get(f"/api/organizations/{uuid4()}/api-keys")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_organization_audit_logs_route_exists(self, client):
        """Verify /api/organizations/{id}/audit-logs route is registered"""
        resp = client.get(f"/api/organizations/{uuid4()}/audit-logs")
        assert resp.status_code in (401, 403)


class TestOrganizationModelsIntegration:
    """Tests for Organization model operations"""

    def test_organization_plan_limits_starter(self):
        """Test starter plan limits"""
        limits = Organization.PLAN_LIMITS.get("starter", {})
        assert limits["max_users"] == 20
        assert limits["max_documents"] == 500

    def test_organization_plan_limits_professional(self):
        """Test professional plan limits"""
        limits = Organization.PLAN_LIMITS.get("professional", {})
        assert limits["max_users"] == 100
        assert limits["max_documents"] == 2000

    def test_organization_plan_limits_enterprise(self):
        """Test enterprise plan limits"""
        limits = Organization.PLAN_LIMITS.get("enterprise", {})
        assert limits["max_users"] == 1000
        assert limits["max_documents"] == 10000

    def test_membership_role_permissions_owner(self):
        """Test owner has all permissions (wildcard)"""
        owner_perms = OrganizationMembership.ROLE_PERMISSIONS.get("owner", [])
        # Owner has wildcard permission '*'
        assert "*" in owner_perms

    def test_membership_role_permissions_admin(self):
        """Test admin permissions"""
        admin_perms = OrganizationMembership.ROLE_PERMISSIONS.get("admin", [])
        assert "members:manage" in admin_perms
        assert "documents:manage" in admin_perms
        assert "settings:manage" in admin_perms

    def test_membership_role_permissions_member(self):
        """Test member has limited permissions"""
        member_perms = OrganizationMembership.ROLE_PERMISSIONS.get("member", [])
        assert "documents:read" in member_perms
        assert "documents:create" in member_perms
        # Member should not have admin permissions
        assert "members:manage" not in member_perms

    def test_organization_to_dict_includes_required_fields(self):
        """Test organization to_dict has required fields"""
        org = Organization(
            id=uuid4(),
            name="Test Organization",
            slug="test-org",
            status="active",
            plan="professional",
            max_users=50,
            current_users=10,
        )
        result = org.to_dict()

        assert "id" in result
        assert result["name"] == "Test Organization"
        assert result["slug"] == "test-org"
        assert result["status"] == "active"
        assert result["plan"] == "professional"

    def test_membership_to_dict_includes_required_fields(self):
        """Test membership to_dict has required fields"""
        membership = OrganizationMembership(
            id=uuid4(),
            organization_id=uuid4(),
            user_id=uuid4(),
            role="admin",
            status="active",
        )
        result = membership.to_dict()

        assert "id" in result
        assert result["role"] == "admin"
        assert result["status"] == "active"

    def test_invitation_is_expired_false(self):
        """Test invitation is_expired returns False for valid invitation"""
        invitation = OrganizationInvitation(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            role="member",
            token="abc123",
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        result = invitation.to_dict()
        assert result["is_expired"] is False

    def test_invitation_is_expired_true(self):
        """Test invitation is_expired returns True for expired invitation"""
        invitation = OrganizationInvitation(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            role="member",
            token="abc123",
            expires_at=datetime.utcnow() - timedelta(days=1),
        )
        result = invitation.to_dict()
        assert result["is_expired"] is True

    def test_api_key_to_dict_hides_hash(self):
        """Test API key to_dict does not expose key_hash"""
        api_key = OrganizationAPIKey(
            id=uuid4(),
            organization_id=uuid4(),
            name="Test Key",
            key_hash="secret_hash_value",
            key_prefix="va_abc",
        )
        result = api_key.to_dict()

        assert result["name"] == "Test Key"
        assert result["key_prefix"] == "va_abc"
        assert "key_hash" not in result

    def test_audit_log_to_dict_includes_action_details(self):
        """Test audit log to_dict includes action details"""
        log = OrganizationAuditLog(
            id=uuid4(),
            organization_id=uuid4(),
            user_id=uuid4(),
            action="member.added",
            resource_type="user",
            resource_id=str(uuid4()),
            details={"role": "admin"},
        )
        result = log.to_dict()

        assert result["action"] == "member.added"
        assert result["resource_type"] == "user"
        assert result["details"]["role"] == "admin"


# Database integration tests (require db fixture)
pytestmark_db = pytest.mark.skip(
    reason="Tests require 'db' fixture - need database session fixture"
)


@pytest.mark.skip(reason="Requires database fixture")
class TestOrganizationsDBIntegration:
    """Database integration tests for organizations"""

    @pytest.mark.asyncio
    async def test_create_organization_with_owner(self, db):
        """Test creating organization automatically adds owner membership"""
        from app.services.organization_service import OrganizationService

        service = OrganizationService()
        owner_id = uuid4()

        org = service.create_organization(
            db=db,
            name="Test Org",
            owner_id=owner_id,
            slug="test-org",
        )

        assert org is not None
        assert org.slug == "test-org"

        # Verify owner membership was created
        membership = (
            db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == owner_id,
            )
            .first()
        )
        assert membership is not None
        assert membership.role == "owner"

    @pytest.mark.asyncio
    async def test_invite_and_accept_workflow(self, db):
        """Test complete invitation workflow"""
        from app.services.organization_service import OrganizationService

        service = OrganizationService()
        owner_id = uuid4()
        invitee_id = uuid4()

        # Create org
        org = service.create_organization(
            db=db, name="Test Org", owner_id=owner_id, slug="test-workflow"
        )

        # Create invitation
        invitation = service.create_invitation(
            db=db,
            organization_id=org.id,
            email="invitee@example.com",
            role="member",
            invited_by=owner_id,
        )
        assert invitation is not None
        assert invitation.token is not None

        # Accept invitation
        membership = service.accept_invitation(
            db=db, token=invitation.token, user_id=invitee_id
        )
        assert membership is not None
        assert membership.role == "member"
        assert membership.user_id == invitee_id

    @pytest.mark.asyncio
    async def test_api_key_lifecycle(self, db):
        """Test API key creation, validation, and revocation"""
        from app.services.organization_service import OrganizationService

        service = OrganizationService()
        owner_id = uuid4()

        # Create org
        org = service.create_organization(
            db=db, name="Test Org", owner_id=owner_id, slug="test-api-keys"
        )

        # Create API key
        result = service.create_api_key(
            db=db,
            organization_id=org.id,
            name="Test Key",
            created_by=owner_id,
            permissions={"read": True},
        )
        assert "key" in result
        assert result["key"].startswith("va_")
        key_value = result["key"]
        key_id = result["key_id"]

        # Validate key
        validated = service.validate_api_key(db, key_value)
        assert validated is not None
        assert validated.organization_id == org.id

        # Revoke key
        revoked = service.revoke_api_key(db, key_id)
        assert revoked is True

        # Validate revoked key should fail
        invalid = service.validate_api_key(db, key_value)
        assert invalid is None
