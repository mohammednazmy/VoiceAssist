"""Add background_jobs table for task queue tracking

Revision ID: 039
Revises: 038
Create Date: 2025-12-11

This migration adds the background_jobs table for:
1. Persistent job tracking across restarts
2. Progress monitoring with WebSocket updates
3. Job history for debugging and analytics
4. Retry tracking and error logging
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade():
    """Create background_jobs table"""

    op.create_table(
        "background_jobs",
        # Primary key
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # ARQ job reference
        sa.Column(
            "arq_job_id",
            sa.String(255),
            unique=True,
            nullable=True,
            index=True,
            comment="ARQ job identifier for correlation",
        ),
        # Job type classification
        sa.Column(
            "job_type",
            sa.String(100),
            nullable=False,
            index=True,
            comment="Job type: document_processing, tts_generation, embedding, etc.",
        ),
        # Status tracking
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="pending",
            index=True,
            comment="Job status: pending, running, completed, failed, cancelled",
        ),
        # Priority (1=highest, 10=lowest)
        sa.Column(
            "priority",
            sa.Integer,
            nullable=False,
            server_default=sa.text("5"),
            comment="Job priority: 1 (highest) to 10 (lowest)",
        ),
        # Context references
        sa.Column(
            "document_id",
            UUID(as_uuid=True),
            sa.ForeignKey("kb_documents.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
            comment="Related document if applicable",
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            nullable=True,
            index=True,
            comment="Tenant ID for multi-tenancy (future)",
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
            comment="User who initiated the job",
        ),
        # Payload and results
        sa.Column(
            "input_payload",
            JSONB,
            nullable=True,
            comment="Job input parameters (excluding large binary data)",
        ),
        sa.Column(
            "result_payload",
            JSONB,
            nullable=True,
            comment="Job result data",
        ),
        sa.Column(
            "error_message",
            sa.Text,
            nullable=True,
            comment="Error details if job failed",
        ),
        sa.Column(
            "error_traceback",
            sa.Text,
            nullable=True,
            comment="Full traceback for debugging",
        ),
        # Progress tracking
        sa.Column(
            "progress",
            sa.Integer,
            nullable=False,
            server_default=sa.text("0"),
            comment="Progress percentage (0-100)",
        ),
        sa.Column(
            "progress_message",
            sa.String(500),
            nullable=True,
            comment="Current progress description",
        ),
        sa.Column(
            "progress_details",
            JSONB,
            nullable=True,
            comment="Detailed progress data (pages processed, etc.)",
        ),
        # Timing
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            index=True,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="When job execution started",
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="When job completed (success or failure)",
        ),
        # Retry tracking
        sa.Column(
            "retry_count",
            sa.Integer,
            nullable=False,
            server_default=sa.text("0"),
            comment="Number of retry attempts",
        ),
        sa.Column(
            "max_retries",
            sa.Integer,
            nullable=False,
            server_default=sa.text("3"),
            comment="Maximum allowed retries",
        ),
        sa.Column(
            "next_retry_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Scheduled time for next retry",
        ),
        # Check constraint for status values
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="valid_job_status",
        ),
    )

    # Create composite indexes for common queries
    op.create_index(
        "ix_background_jobs_type_status",
        "background_jobs",
        ["job_type", "status"],
    )

    op.create_index(
        "ix_background_jobs_status_created",
        "background_jobs",
        ["status", "created_at"],
    )

    # Index for finding jobs to retry
    op.create_index(
        "ix_background_jobs_retry",
        "background_jobs",
        ["status", "next_retry_at"],
        postgresql_where=sa.text("status = 'failed' AND next_retry_at IS NOT NULL"),
    )


def downgrade():
    """Remove background_jobs table"""

    op.drop_index("ix_background_jobs_retry", table_name="background_jobs")
    op.drop_index("ix_background_jobs_status_created", table_name="background_jobs")
    op.drop_index("ix_background_jobs_type_status", table_name="background_jobs")
    op.drop_table("background_jobs")
