"""Add document versioning and freshness tracking

Revision ID: 042
Revises: 041
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add versioning columns to kb_documents
    op.add_column("kb_documents", sa.Column("current_version", sa.Integer, nullable=False, server_default="1"))
    op.add_column("kb_documents", sa.Column("published_date", sa.Date, nullable=True))
    op.add_column("kb_documents", sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("kb_documents", sa.Column("freshness_status", sa.String(50), nullable=False, server_default="current"))
    op.add_column("kb_documents", sa.Column("superseded_by", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True))
    op.add_column("kb_documents", sa.Column("source_url", sa.String(1000), nullable=True))
    op.add_column("kb_documents", sa.Column("auto_update_enabled", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("kb_documents", sa.Column("content_hash", sa.String(64), nullable=True))

    # Document versions table
    op.create_table(
        "document_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        # Version metadata
        sa.Column("change_type", sa.String(50), nullable=True),  # initial, update, correction, superseded
        sa.Column("change_summary", sa.Text, nullable=True),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        # Content snapshot
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("enhanced_structure", JSONB, nullable=True),
        # Source tracking
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("source_published_date", sa.Date, nullable=True),
        sa.Column("source_accessed_date", sa.Date, nullable=True),
        # Diff tracking
        sa.Column("pages_added", sa.Integer, nullable=True),
        sa.Column("pages_removed", sa.Integer, nullable=True),
        sa.Column("pages_modified", sa.Integer, nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        # Unique constraint
        sa.UniqueConstraint("document_id", "version_number", name="uq_document_version"),
    )

    # Freshness alerts table
    op.create_table(
        "freshness_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alert_type", sa.String(50), nullable=False),  # stale, source_changed, superseded, aging
        sa.Column("severity", sa.String(20), nullable=False),  # info, warning, critical
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("source_check_result", JSONB, nullable=True),
        sa.Column("acknowledged", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("acknowledged_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Indexes
    op.create_index("ix_document_versions_document", "document_versions", ["document_id"])
    op.create_index("ix_document_versions_version", "document_versions", ["document_id", "version_number"])
    op.create_index("ix_freshness_alerts_document", "freshness_alerts", ["document_id"])
    op.create_index("ix_freshness_alerts_unack", "freshness_alerts", ["acknowledged"], postgresql_where=sa.text("NOT acknowledged"))
    op.create_index("ix_kb_documents_freshness", "kb_documents", ["freshness_status"])


def downgrade() -> None:
    op.drop_table("freshness_alerts")
    op.drop_table("document_versions")
    op.drop_index("ix_kb_documents_freshness", "kb_documents")
    op.drop_column("kb_documents", "content_hash")
    op.drop_column("kb_documents", "auto_update_enabled")
    op.drop_column("kb_documents", "source_url")
    op.drop_column("kb_documents", "superseded_by")
    op.drop_column("kb_documents", "freshness_status")
    op.drop_column("kb_documents", "last_verified_at")
    op.drop_column("kb_documents", "published_date")
    op.drop_column("kb_documents", "current_version")
