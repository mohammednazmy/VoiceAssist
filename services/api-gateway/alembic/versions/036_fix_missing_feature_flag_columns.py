"""Fix missing feature_flag columns

Revision ID: 036
Revises: 035
Create Date: 2025-12-10

This migration adds columns that were supposed to be added in 033-035
but failed due to missing prerequisite columns.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = :table_name AND column_name = :column_name
            )
        """),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add missing columns to feature_flags table."""

    # Add variants column if missing
    if not column_exists("feature_flags", "variants"):
        op.add_column(
            "feature_flags",
            sa.Column(
                "variants",
                JSONB,
                nullable=True,
                comment="List of variant definitions for multivariate flags",
            ),
        )

    # Add targeting_rules column if missing
    if not column_exists("feature_flags", "targeting_rules"):
        op.add_column(
            "feature_flags",
            sa.Column(
                "targeting_rules",
                JSONB,
                nullable=True,
                comment="Segmentation rules for user-based flag targeting",
            ),
        )

    # Add scheduled_changes column if missing (was 'schedule' in 033, renamed in 035)
    if not column_exists("feature_flags", "scheduled_changes"):
        op.add_column(
            "feature_flags",
            sa.Column(
                "scheduled_changes",
                JSONB,
                nullable=True,
                comment="Scheduled weight changes for gradual rollout",
            ),
        )

    # Add default_variant column if missing
    if not column_exists("feature_flags", "default_variant"):
        op.add_column(
            "feature_flags",
            sa.Column(
                "default_variant",
                sa.String(100),
                nullable=True,
                comment="Default variant ID for multivariate flags",
            ),
        )

    # Add environment column if missing
    if not column_exists("feature_flags", "environment"):
        op.add_column(
            "feature_flags",
            sa.Column(
                "environment",
                sa.String(50),
                nullable=True,
                server_default="production",
                comment="Environment this flag applies to",
            ),
        )

    # Add archived column if missing
    if not column_exists("feature_flags", "archived"):
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


def downgrade() -> None:
    """Remove columns added by this migration."""
    # Only drop columns if they exist
    if column_exists("feature_flags", "archived"):
        op.drop_column("feature_flags", "archived")
    if column_exists("feature_flags", "environment"):
        op.drop_column("feature_flags", "environment")
    if column_exists("feature_flags", "default_variant"):
        op.drop_column("feature_flags", "default_variant")
    if column_exists("feature_flags", "scheduled_changes"):
        op.drop_column("feature_flags", "scheduled_changes")
    if column_exists("feature_flags", "targeting_rules"):
        op.drop_column("feature_flags", "targeting_rules")
    if column_exists("feature_flags", "variants"):
        op.drop_column("feature_flags", "variants")
