"""Add response validations and citations tables for answer validation

Revision ID: 041
Revises: 040
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Response validations table
    op.create_table(
        "response_validations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("query_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("message_id", UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        # Original content
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("response_text", sa.Text, nullable=False),
        # Validation results
        sa.Column("overall_confidence", sa.Float, nullable=True),
        sa.Column("claims_total", sa.Integer, nullable=False, default=0),
        sa.Column("claims_validated", sa.Integer, nullable=False, default=0),
        sa.Column("claims_partial", sa.Integer, nullable=False, default=0),
        sa.Column("claims_unsupported", sa.Integer, nullable=False, default=0),
        # Detailed breakdown
        sa.Column("validation_details", JSONB, nullable=True),
        sa.Column("annotated_response", sa.Text, nullable=True),
        # Timing
        sa.Column("validation_time_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Response validation citations table
    op.create_table(
        "response_validation_citations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("validation_id", UUID(as_uuid=True), sa.ForeignKey("response_validations.id", ondelete="CASCADE"), nullable=False),
        # Claim info
        sa.Column("claim_text", sa.Text, nullable=False),
        sa.Column("claim_index", sa.Integer, nullable=False),
        sa.Column("claim_type", sa.String(50), nullable=True),  # factual, opinion, procedural
        sa.Column("claim_start_char", sa.Integer, nullable=True),
        sa.Column("claim_end_char", sa.Integer, nullable=True),
        # Source info
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_title", sa.String(500), nullable=True),
        sa.Column("page_number", sa.Integer, nullable=True),
        sa.Column("chunk_id", sa.String(255), nullable=True),
        sa.Column("chunk_text", sa.Text, nullable=True),
        # Match quality
        sa.Column("similarity_score", sa.Float, nullable=True),
        sa.Column("exact_match", sa.Boolean, nullable=False, default=False),
        sa.Column("relevant_excerpt", sa.Text, nullable=True),
        # Status
        sa.Column("status", sa.String(50), nullable=False),  # supported, partial, unsupported
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("explanation", sa.Text, nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes
    op.create_index("ix_response_validations_session", "response_validations", ["session_id"])
    op.create_index("ix_response_validations_user", "response_validations", ["user_id"])
    op.create_index("ix_response_validations_confidence", "response_validations", ["overall_confidence"])
    op.create_index("ix_response_validations_created", "response_validations", ["created_at"])

    op.create_index("ix_rvc_validation", "response_validation_citations", ["validation_id"])
    op.create_index("ix_rvc_document", "response_validation_citations", ["document_id"])
    op.create_index("ix_rvc_status", "response_validation_citations", ["status"])


def downgrade() -> None:
    op.drop_table("response_validation_citations")
    op.drop_table("response_validations")
