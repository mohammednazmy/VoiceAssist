"""add clinical contexts

Revision ID: 008_add_clinical_contexts
Revises: 007_add_message_attachments
Create Date: 2025-11-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "008_add_clinical_contexts"
down_revision = "007_add_message_attachments"
branch_labels = None
depends_on = None


def upgrade():
    """Create clinical_contexts table"""
    op.create_table(
        "clinical_contexts",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Demographics
        sa.Column("age", sa.Integer, nullable=True),
        sa.Column("gender", sa.String(50), nullable=True),
        sa.Column("weight_kg", sa.Numeric(5, 2), nullable=True),
        sa.Column("height_cm", sa.Numeric(5, 2), nullable=True),
        # Clinical data
        sa.Column("chief_complaint", sa.Text, nullable=True),
        sa.Column(
            "problems", JSONB, nullable=True, comment="Array of problems/diagnoses"
        ),
        sa.Column("medications", JSONB, nullable=True, comment="Array of medications"),
        sa.Column("allergies", JSONB, nullable=True, comment="Array of allergies"),
        # Vitals
        sa.Column(
            "vitals",
            JSONB,
            nullable=True,
            comment="temperature, heart_rate, blood_pressure, respiratory_rate, spo2",
        ),
        # Metadata
        sa.Column(
            "last_updated",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Create indexes
    op.create_index("idx_clinical_contexts_user_id", "clinical_contexts", ["user_id"])
    op.create_index(
        "idx_clinical_contexts_session_id", "clinical_contexts", ["session_id"]
    )

    # Create unique constraint for user_id + session_id
    op.create_unique_constraint(
        "uq_clinical_contexts_user_session",
        "clinical_contexts",
        ["user_id", "session_id"],
    )


def downgrade():
    """Drop clinical_contexts table"""
    op.drop_constraint(
        "uq_clinical_contexts_user_session", "clinical_contexts", type_="unique"
    )
    op.drop_index("idx_clinical_contexts_session_id", table_name="clinical_contexts")
    op.drop_index("idx_clinical_contexts_user_id", table_name="clinical_contexts")
    op.drop_table("clinical_contexts")
