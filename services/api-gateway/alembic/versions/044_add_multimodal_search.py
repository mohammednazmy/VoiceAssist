"""Add multi-modal search tables for CLIP embeddings

Revision ID: 044
Revises: 043
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# revision identifiers, used by Alembic.
revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Document images table - stores extracted images from documents
    op.create_table(
        "document_images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer, nullable=True),
        sa.Column("image_index", sa.Integer, nullable=False),  # Index within page
        # Image storage
        sa.Column("storage_path", sa.String(500), nullable=False),  # Path to stored image
        sa.Column("thumbnail_path", sa.String(500), nullable=True),  # Thumbnail for preview
        sa.Column("image_format", sa.String(20), nullable=True),  # png, jpg, etc.
        sa.Column("width", sa.Integer, nullable=True),
        sa.Column("height", sa.Integer, nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),  # bytes
        # Content analysis
        sa.Column("caption", sa.Text, nullable=True),  # Extracted/generated caption
        sa.Column("alt_text", sa.Text, nullable=True),  # Accessibility text
        sa.Column("image_type", sa.String(50), nullable=True),  # figure, chart, diagram, photo, table_image
        sa.Column("ocr_text", sa.Text, nullable=True),  # Text extracted via OCR
        # Embeddings (CLIP produces 512-dim vectors)
        sa.Column("clip_embedding", ARRAY(sa.Float), nullable=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),  # clip-vit-base-patch32
        # Context
        sa.Column("surrounding_text", sa.Text, nullable=True),  # Text near the image
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Text chunks with CLIP embeddings for multi-modal search
    op.create_table(
        "multimodal_text_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_id", sa.String(255), nullable=True),  # Reference to original chunk
        sa.Column("page_number", sa.Integer, nullable=True),
        # Text content
        sa.Column("text_content", sa.Text, nullable=False),
        sa.Column("text_type", sa.String(50), nullable=True),  # paragraph, header, caption, list
        # CLIP text embedding
        sa.Column("clip_embedding", ARRAY(sa.Float), nullable=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        # Metadata
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Multi-modal search queries for analytics
    op.create_table(
        "multimodal_search_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("query_text", sa.Text, nullable=True),
        sa.Column("query_image_path", sa.String(500), nullable=True),  # If image search
        sa.Column("search_type", sa.String(50), nullable=False),  # text_to_image, image_to_text, image_to_image, text_to_text_multimodal
        sa.Column("results_count", sa.Integer, nullable=True),
        sa.Column("top_result_score", sa.Float, nullable=True),
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("filters_applied", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Image extraction status per document
    op.create_table(
        "document_image_extractions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),  # pending, processing, complete, failed
        sa.Column("images_count", sa.Integer, nullable=True),
        sa.Column("pages_processed", sa.Integer, nullable=True),
        sa.Column("total_pages", sa.Integer, nullable=True),
        sa.Column("extraction_method", sa.String(50), nullable=True),  # pdfplumber, pymupdf, ocr
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes for efficient queries
    op.create_index("ix_doc_images_document", "document_images", ["document_id"])
    op.create_index("ix_doc_images_page", "document_images", ["document_id", "page_number"])
    op.create_index("ix_doc_images_type", "document_images", ["image_type"])

    op.create_index("ix_mm_text_document", "multimodal_text_chunks", ["document_id"])
    op.create_index("ix_mm_text_page", "multimodal_text_chunks", ["document_id", "page_number"])

    op.create_index("ix_mm_search_user", "multimodal_search_logs", ["user_id"])
    op.create_index("ix_mm_search_type", "multimodal_search_logs", ["search_type"])
    op.create_index("ix_mm_search_created", "multimodal_search_logs", ["created_at"])

    op.create_index("ix_img_extract_status", "document_image_extractions", ["status"])


def downgrade() -> None:
    op.drop_table("document_image_extractions")
    op.drop_table("multimodal_search_logs")
    op.drop_table("multimodal_text_chunks")
    op.drop_table("document_images")
