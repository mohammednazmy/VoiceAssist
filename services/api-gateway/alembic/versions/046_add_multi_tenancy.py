"""Add multi-tenancy support for organizations

Revision ID: 046
Revises: 045
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# revision identifiers, used by Alembic.
revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Organizations table - tenants
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),  # URL-friendly identifier
        sa.Column("domain", sa.String(255), unique=True, nullable=True),  # Custom domain
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        # Status
        sa.Column("status", sa.String(50), nullable=False, server_default="'active'"),  # active, suspended, trial
        # Plan/Tier
        sa.Column("plan", sa.String(50), nullable=False, server_default="'free'"),  # free, starter, professional, enterprise
        sa.Column("plan_expires_at", sa.DateTime(timezone=True), nullable=True),
        # Limits
        sa.Column("max_users", sa.Integer, nullable=False, server_default="5"),
        sa.Column("max_documents", sa.Integer, nullable=False, server_default="100"),
        sa.Column("max_storage_mb", sa.Integer, nullable=False, server_default="1000"),
        # Usage
        sa.Column("current_users", sa.Integer, nullable=False, server_default="0"),
        sa.Column("current_documents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("current_storage_mb", sa.Integer, nullable=False, server_default="0"),
        # Settings
        sa.Column("settings", JSONB, nullable=True),
        sa.Column("features", JSONB, nullable=True),  # Feature flags per org
        # Contact
        sa.Column("billing_email", sa.String(255), nullable=True),
        sa.Column("technical_contact", sa.String(255), nullable=True),
        # Metadata
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Organization memberships
    op.create_table(
        "organization_memberships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="'member'"),  # owner, admin, member, viewer
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),  # Default org for user
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="'active'"),  # pending, active, suspended
        sa.Column("permissions", JSONB, nullable=True),  # Custom permissions override
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        # Unique constraint: one membership per user per org
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_user_membership"),
    )

    # Organization invitations
    op.create_table(
        "organization_invitations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="'member'"),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token", sa.String(255), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # API keys per organization
    op.create_table(
        "organization_api_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False),  # Hashed API key
        sa.Column("key_prefix", sa.String(20), nullable=False),  # First chars for identification
        sa.Column("permissions", JSONB, nullable=True),  # Scoped permissions
        sa.Column("rate_limit", sa.Integer, nullable=True),  # Requests per minute
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Organization audit log
    op.create_table(
        "organization_audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Add organization_id to users table
    op.add_column(
        "users",
        sa.Column("default_organization_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_default_org",
        "users",
        "organizations",
        ["default_organization_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Add organization_id to kb_documents for tenant isolation
    op.add_column(
        "kb_documents",
        sa.Column("organization_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_kb_documents_org",
        "kb_documents",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Add organization_id to sessions
    op.add_column(
        "sessions",
        sa.Column("organization_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sessions_org",
        "sessions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Create indexes
    op.create_index("ix_organizations_slug", "organizations", ["slug"])
    op.create_index("ix_organizations_domain", "organizations", ["domain"])
    op.create_index("ix_organizations_status", "organizations", ["status"])
    op.create_index("ix_organizations_plan", "organizations", ["plan"])

    op.create_index("ix_memberships_org", "organization_memberships", ["organization_id"])
    op.create_index("ix_memberships_user", "organization_memberships", ["user_id"])
    op.create_index("ix_memberships_role", "organization_memberships", ["role"])

    op.create_index("ix_invitations_org", "organization_invitations", ["organization_id"])
    op.create_index("ix_invitations_email", "organization_invitations", ["email"])
    op.create_index("ix_invitations_token", "organization_invitations", ["token"])

    op.create_index("ix_org_api_keys_org", "organization_api_keys", ["organization_id"])

    op.create_index("ix_org_audit_org", "organization_audit_logs", ["organization_id"])
    op.create_index("ix_org_audit_user", "organization_audit_logs", ["user_id"])
    op.create_index("ix_org_audit_action", "organization_audit_logs", ["action"])
    op.create_index("ix_org_audit_created", "organization_audit_logs", ["created_at"])

    op.create_index("ix_kb_documents_org", "kb_documents", ["organization_id"])
    op.create_index("ix_sessions_org", "sessions", ["organization_id"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_sessions_org")
    op.drop_index("ix_kb_documents_org")

    # Remove organization_id from tables
    op.drop_constraint("fk_sessions_org", "sessions", type_="foreignkey")
    op.drop_column("sessions", "organization_id")

    op.drop_constraint("fk_kb_documents_org", "kb_documents", type_="foreignkey")
    op.drop_column("kb_documents", "organization_id")

    op.drop_constraint("fk_users_default_org", "users", type_="foreignkey")
    op.drop_column("users", "default_organization_id")

    # Drop tables
    op.drop_table("organization_audit_logs")
    op.drop_table("organization_api_keys")
    op.drop_table("organization_invitations")
    op.drop_table("organization_memberships")
    op.drop_table("organizations")
