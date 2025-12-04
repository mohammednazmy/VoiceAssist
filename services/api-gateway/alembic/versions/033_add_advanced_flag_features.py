"""Add advanced feature flag features

Revision ID: 033
Revises: 032
Create Date: 2025-12-04

Phase 3.2: Advanced Flag Types & Segmentation Rules

This migration adds support for:
1. Multivariate flags with variants (A/B testing with multiple variants)
2. Targeting/segmentation rules for user-based flag evaluation
3. Scheduling support for time-based flag activation

New columns:
- variants (JSONB): List of variant definitions for multivariate flags
- targeting_rules (JSONB): Segmentation rules for user targeting
- schedule (JSONB): Scheduled activation/deactivation times
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add advanced flag features columns."""

    # Add variants column for multivariate flags
    # Structure: [{"id": "variant_a", "name": "Variant A", "value": {...}, "weight": 50}, ...]
    op.add_column(
        "feature_flags",
        sa.Column(
            "variants",
            JSONB,
            nullable=True,
            server_default=None,
            comment="List of variant definitions for multivariate flags",
        ),
    )

    # Add targeting_rules column for segmentation
    # Structure: {
    #   "rules": [
    #     {"attribute": "user_role", "operator": "in", "value": ["admin", "staff"], "variant": "variant_a"},
    #     {"attribute": "user_id", "operator": "equals", "value": "uuid-123", "variant": "variant_b"},
    #   ],
    #   "default_variant": "control"
    # }
    op.add_column(
        "feature_flags",
        sa.Column(
            "targeting_rules",
            JSONB,
            nullable=True,
            server_default=None,
            comment="Segmentation rules for user-based flag targeting",
        ),
    )

    # Add schedule column for time-based activation
    # Structure: {
    #   "start_at": "2025-01-01T00:00:00Z",
    #   "end_at": "2025-01-31T23:59:59Z",
    #   "timezone": "UTC",
    #   "recurring": null
    # }
    op.add_column(
        "feature_flags",
        sa.Column(
            "schedule",
            JSONB,
            nullable=True,
            server_default=None,
            comment="Scheduled activation/deactivation configuration",
        ),
    )

    # Add environment column for multi-environment support
    # Default is 'production', values: 'development', 'staging', 'production'
    op.add_column(
        "feature_flags",
        sa.Column(
            "environment",
            sa.String(50),
            nullable=False,
            server_default="production",
            comment="Environment this flag applies to",
        ),
    )

    # Add archived flag for soft-delete/deprecation
    op.add_column(
        "feature_flags",
        sa.Column(
            "archived",
            sa.Boolean,
            nullable=False,
            server_default="false",
            comment="Whether flag is archived (soft-deleted)",
        ),
    )

    # Add archived_at timestamp
    op.add_column(
        "feature_flags",
        sa.Column(
            "archived_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when flag was archived",
        ),
    )

    # Create index on environment for efficient filtering
    op.create_index(
        "ix_feature_flags_environment",
        "feature_flags",
        ["environment"],
    )

    # Create index on archived for efficient filtering of active flags
    op.create_index(
        "ix_feature_flags_archived",
        "feature_flags",
        ["archived"],
    )


def downgrade() -> None:
    """Remove advanced flag features columns."""
    op.drop_index("ix_feature_flags_archived", table_name="feature_flags")
    op.drop_index("ix_feature_flags_environment", table_name="feature_flags")
    op.drop_column("feature_flags", "archived_at")
    op.drop_column("feature_flags", "archived")
    op.drop_column("feature_flags", "environment")
    op.drop_column("feature_flags", "schedule")
    op.drop_column("feature_flags", "targeting_rules")
    op.drop_column("feature_flags", "variants")
