"""Fix feature flag column names and add missing columns

Revision ID: 035
Revises: 034
Create Date: 2025-12-06

Fixes column name mismatch and adds missing columns from model:
1. Rename 'schedule' to 'scheduled_changes' (model expects scheduled_changes)
2. Add 'default_variant' column for multivariate flags
3. Add 'rollout_percentage' column for A/B testing
4. Add 'rollout_salt' column for consistent user assignment
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Fix column names and add missing columns."""

    # Rename 'schedule' to 'scheduled_changes' to match model
    op.alter_column(
        "feature_flags",
        "schedule",
        new_column_name="scheduled_changes",
    )

    # Add default_variant column for multivariate flags
    op.add_column(
        "feature_flags",
        sa.Column(
            "default_variant",
            sa.String(100),
            nullable=True,
            comment="Default variant ID for multivariate flags",
        ),
    )

    # Add rollout_percentage column for A/B testing (0-100)
    op.add_column(
        "feature_flags",
        sa.Column(
            "rollout_percentage",
            sa.Integer,
            nullable=True,
            server_default="100",
            comment="Percentage of users to include (0-100)",
        ),
    )

    # Add rollout_salt column for consistent user assignment
    op.add_column(
        "feature_flags",
        sa.Column(
            "rollout_salt",
            sa.String(50),
            nullable=True,
            comment="Salt for consistent user assignment",
        ),
    )


def downgrade() -> None:
    """Revert column changes."""

    # Drop added columns
    op.drop_column("feature_flags", "rollout_salt")
    op.drop_column("feature_flags", "rollout_percentage")
    op.drop_column("feature_flags", "default_variant")

    # Rename back to 'schedule'
    op.alter_column(
        "feature_flags",
        "scheduled_changes",
        new_column_name="schedule",
    )
