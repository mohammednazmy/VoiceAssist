"""Enhance user_feature_flags for Phase 4 overrides

Revision ID: 034
Revises: 033
Create Date: 2025-12-04

Phase 4: User-Specific Flag Overrides Enhancement

This migration enhances the existing user_feature_flags table with:
1. reason - Audit reason for the override
2. created_by - Admin who created the override
3. updated_by - Admin who last modified the override
4. Additional indexes for override management

These additions enable:
- Better auditing of override changes
- Admin accountability tracking
- Full audit trail of modifications
- Efficient override cleanup queries
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add Phase 4 override management columns to user_feature_flags."""

    # Add reason column for audit trail
    op.add_column(
        "user_feature_flags",
        sa.Column(
            "reason",
            sa.String(500),
            nullable=True,
            comment="Audit reason for creating override",
        ),
    )

    # Add created_by column for admin accountability
    op.add_column(
        "user_feature_flags",
        sa.Column(
            "created_by",
            sa.String(255),
            nullable=True,  # Nullable for existing rows
            comment="Admin who created this override",
        ),
    )

    # Add updated_by column for tracking modifications
    op.add_column(
        "user_feature_flags",
        sa.Column(
            "updated_by",
            sa.String(255),
            nullable=True,
            comment="Admin who last modified this override",
        ),
    )

    # Add partial index for expired override cleanup
    op.create_index(
        "idx_user_feature_flags_expires",
        "user_feature_flags",
        ["expires_at"],
        postgresql_where=sa.text("expires_at IS NOT NULL"),
    )

    # Add partial index for enabled overrides
    op.create_index(
        "idx_user_feature_flags_enabled",
        "user_feature_flags",
        ["enabled"],
        postgresql_where=sa.text("enabled = true"),
    )


def downgrade() -> None:
    """Remove Phase 4 columns and indexes from user_feature_flags."""

    # Drop indexes
    op.drop_index("idx_user_feature_flags_enabled", table_name="user_feature_flags")
    op.drop_index("idx_user_feature_flags_expires", table_name="user_feature_flags")

    # Drop columns
    op.drop_column("user_feature_flags", "updated_by")
    op.drop_column("user_feature_flags", "created_by")
    op.drop_column("user_feature_flags", "reason")
