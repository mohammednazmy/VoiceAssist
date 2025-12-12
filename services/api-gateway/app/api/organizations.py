"""
Organization API endpoints for multi-tenancy.

Provides organization management, membership, invitations,
and API key management.
"""

from typing import Any, Dict, List, Optional

from app.core.database import get_db
from app.core.logging import get_logger
from app.services.auth import get_current_active_user, require_admin
from app.services.organization_service import OrganizationService
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# Request/Response Models
class CreateOrganizationRequest(BaseModel):
    """Request to create an organization."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    domain: Optional[str] = None


class UpdateOrganizationRequest(BaseModel):
    """Request to update an organization."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    domain: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class AddMemberRequest(BaseModel):
    """Request to add a member."""

    user_id: str
    role: str = Field("member", description="owner, admin, member, or viewer")


class UpdateMemberRoleRequest(BaseModel):
    """Request to update member role."""

    role: str = Field(..., description="owner, admin, member, or viewer")


class CreateInvitationRequest(BaseModel):
    """Request to create an invitation."""

    email: EmailStr
    role: str = Field("member", description="admin, member, or viewer")
    expires_days: int = Field(7, ge=1, le=30)


class AcceptInvitationRequest(BaseModel):
    """Request to accept an invitation."""

    token: str


class CreateAPIKeyRequest(BaseModel):
    """Request to create an API key."""

    name: str = Field(..., min_length=1, max_length=255)
    permissions: Optional[List[str]] = None
    rate_limit: Optional[int] = Field(None, ge=1, le=10000)
    expires_days: Optional[int] = Field(None, ge=1, le=365)


# Helper functions
def get_org_service(db: Session = Depends(get_db)) -> OrganizationService:
    """Get organization service instance."""
    return OrganizationService(db)


def verify_org_access(
    org_id: str,
    user_id: str,
    service: OrganizationService,
    permission: str = "org:read",
) -> None:
    """Verify user has access to organization."""
    if not service.check_permission(org_id, user_id, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this organization",
        )


# ============ Organization CRUD ============


@router.post("")
async def create_organization(
    request: CreateOrganizationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a new organization."""
    service = OrganizationService(db)

    try:
        org = service.create_organization(
            name=request.name,
            owner_id=str(current_user.id),
            slug=request.slug,
            description=request.description,
            domain=request.domain,
        )
        return org.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("")
async def get_user_organizations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get all organizations the current user belongs to."""
    service = OrganizationService(db)
    return service.get_user_organizations(str(current_user.id))


@router.get("/{org_id}")
async def get_organization(
    org_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get organization details."""
    service = OrganizationService(db)

    org = service.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    verify_org_access(org_id, str(current_user.id), service)

    return org.to_dict()


@router.put("/{org_id}")
async def update_organization(
    org_id: str,
    request: UpdateOrganizationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Update organization details."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "org:update")

    try:
        org = service.update_organization(
            org_id=org_id,
            user_id=str(current_user.id),
            name=request.name,
            description=request.description,
            logo_url=request.logo_url,
            domain=request.domain,
            settings=request.settings,
        )

        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        return org.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{org_id}")
async def delete_organization(
    org_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Delete (suspend) an organization."""
    service = OrganizationService(db)

    # Only owner can delete
    membership = service.get_membership(org_id, str(current_user.id))
    if not membership or membership.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete organization")

    success = service.delete_organization(org_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    return {"status": "deleted", "organization_id": org_id}


# ============ Membership Endpoints ============


@router.get("/{org_id}/members")
async def get_members(
    org_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get organization members."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service)

    return service.get_organization_members(org_id, page, page_size)


@router.post("/{org_id}/members")
async def add_member(
    org_id: str,
    request: AddMemberRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Add a member to the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    try:
        membership = service.add_member(
            org_id=org_id,
            user_id=request.user_id,
            role=request.role,
            added_by=str(current_user.id),
        )
        return membership.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{org_id}/members/{user_id}")
async def update_member_role(
    org_id: str,
    user_id: str,
    request: UpdateMemberRoleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Update a member's role."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    try:
        membership = service.update_member_role(
            org_id=org_id,
            user_id=user_id,
            new_role=request.role,
            updated_by=str(current_user.id),
        )

        if not membership:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

        return membership.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(
    org_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Remove a member from the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    try:
        success = service.remove_member(org_id, user_id, str(current_user.id))
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

        return {"status": "removed", "user_id": user_id}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{org_id}/set-default")
async def set_default_organization(
    org_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Set an organization as the user's default."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service)

    success = service.set_default_organization(str(current_user.id), org_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    return {"status": "success", "default_organization_id": org_id}


# ============ Invitation Endpoints ============


@router.post("/{org_id}/invitations")
async def create_invitation(
    org_id: str,
    request: CreateInvitationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create an invitation to join the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    try:
        invitation = service.create_invitation(
            org_id=org_id,
            email=request.email,
            role=request.role,
            invited_by=str(current_user.id),
            expires_days=request.expires_days,
        )

        return {
            **invitation.to_dict(),
            "invitation_url": f"/join?token={invitation.token}",
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{org_id}/invitations")
async def get_pending_invitations(
    org_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get pending invitations for the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    invitations = service.get_pending_invitations(org_id)
    return [inv.to_dict() for inv in invitations]


@router.delete("/{org_id}/invitations/{invitation_id}")
async def revoke_invitation(
    org_id: str,
    invitation_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Revoke an invitation."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "members:manage")

    success = service.revoke_invitation(invitation_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")

    return {"status": "revoked", "invitation_id": invitation_id}


@router.post("/invitations/accept")
async def accept_invitation(
    request: AcceptInvitationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Accept an invitation to join an organization."""
    service = OrganizationService(db)

    try:
        membership = service.accept_invitation(request.token, str(current_user.id))
        return {
            "status": "accepted",
            "membership": membership.to_dict(),
            "organization": membership.organization.to_public(),
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ============ API Key Endpoints ============


@router.post("/{org_id}/api-keys")
async def create_api_key(
    org_id: str,
    request: CreateAPIKeyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a new API key for the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "api_keys:manage")

    key, api_key = service.create_api_key(
        org_id=org_id,
        name=request.name,
        created_by=str(current_user.id),
        permissions=request.permissions,
        rate_limit=request.rate_limit,
        expires_days=request.expires_days,
    )

    return {
        "key": key,  # Only shown once!
        "api_key": api_key.to_dict(),
        "warning": "Store this key securely. It cannot be retrieved again.",
    }


@router.get("/{org_id}/api-keys")
async def get_api_keys(
    org_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get all API keys for the organization."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "api_keys:manage")

    keys = service.get_organization_api_keys(org_id)
    return [key.to_dict() for key in keys]


@router.delete("/{org_id}/api-keys/{key_id}")
async def revoke_api_key(
    org_id: str,
    key_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Revoke an API key."""
    service = OrganizationService(db)

    verify_org_access(org_id, str(current_user.id), service, "api_keys:manage")

    success = service.revoke_api_key(key_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    return {"status": "revoked", "key_id": key_id}


# ============ Audit Log Endpoints ============


@router.get("/{org_id}/audit-logs")
async def get_audit_logs(
    org_id: str,
    action: Optional[str] = Query(None, description="Filter by action"),
    user_id: Optional[str] = Query(None, description="Filter by user"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get audit logs for the organization."""
    service = OrganizationService(db)

    # Only admins/owners can view audit logs
    membership = service.get_membership(org_id, str(current_user.id))
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    return service.get_audit_logs(
        org_id=org_id,
        action=action,
        user_id=user_id,
        resource_type=resource_type,
        page=page,
        page_size=page_size,
    )


# ============ Admin Endpoints ============


@router.get("/admin/all")
async def list_all_organizations(
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    plan_filter: Optional[str] = Query(None, description="Filter by plan"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """List all organizations (system admin only)."""
    from app.models.organization import Organization

    query = db.query(Organization)

    if status_filter:
        query = query.filter(Organization.status == status_filter)
    if plan_filter:
        query = query.filter(Organization.plan == plan_filter)

    total = query.count()
    offset = (page - 1) * page_size

    orgs = query.order_by(Organization.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "organizations": [org.to_dict() for org in orgs],
    }


@router.put("/admin/{org_id}/plan")
async def update_organization_plan(
    org_id: str,
    plan: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """Update organization plan (system admin only)."""
    from app.models.organization import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    try:
        org.set_plan(plan)
        db.commit()
        db.refresh(org)
        return org.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/admin/{org_id}/status")
async def update_organization_status(
    org_id: str,
    status_value: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """Update organization status (system admin only)."""
    from app.models.organization import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if status_value not in Organization.VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Valid: {Organization.VALID_STATUSES}",
        )

    org.status = status_value
    org.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(org)

    return org.to_dict()


# Import datetime at module level
from datetime import datetime
