"""add prompts and prompt_versions tables

Revision ID: 024
Revises: 023
Create Date: 2025-11-29 12:00:00.000000

Creates the prompts table for dynamic AI prompt management and
the prompt_versions table for version history/rollback capability.
Also seeds default prompts from existing hardcoded values.
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


# Default prompts to seed (from llm_client.py and realtime_voice_service.py)
DEFAULT_PROMPTS = [
    {
        "name": "intent:diagnosis",
        "display_name": "Medical Diagnosis Assistant",
        "description": "System prompt for diagnosis-related queries",
        "prompt_type": "chat",
        "intent_category": "diagnosis",
        "system_prompt": (
            "You are a medical AI assistant specializing in clinical diagnosis. "
            "Provide evidence-based diagnostic insights with appropriate citations."
        ),
    },
    {
        "name": "intent:treatment",
        "display_name": "Treatment Planning Assistant",
        "description": "System prompt for treatment-related queries",
        "prompt_type": "chat",
        "intent_category": "treatment",
        "system_prompt": (
            "You are a medical AI assistant specializing in treatment planning. "
            "Provide evidence-based treatment recommendations with appropriate citations."
        ),
    },
    {
        "name": "intent:drug",
        "display_name": "Pharmacology Assistant",
        "description": "System prompt for drug/medication-related queries",
        "prompt_type": "chat",
        "intent_category": "drug",
        "system_prompt": (
            "You are a medical AI assistant specializing in pharmacology. "
            "Provide evidence-based drug information with appropriate citations."
        ),
    },
    {
        "name": "intent:guideline",
        "display_name": "Clinical Guidelines Assistant",
        "description": "System prompt for clinical guideline queries",
        "prompt_type": "chat",
        "intent_category": "guideline",
        "system_prompt": (
            "You are a medical AI assistant specializing in clinical guidelines. "
            "Provide evidence-based guideline information with appropriate citations."
        ),
    },
    {
        "name": "intent:summary",
        "display_name": "Medical Summarization Assistant",
        "description": "System prompt for summarization tasks",
        "prompt_type": "chat",
        "intent_category": "summary",
        "system_prompt": (
            "You are a medical AI assistant specializing in medical summarization. "
            "Provide clear, concise summaries with appropriate citations."
        ),
    },
    {
        "name": "intent:other",
        "display_name": "General Medical Assistant",
        "description": "Default system prompt for general queries",
        "prompt_type": "chat",
        "intent_category": "other",
        "system_prompt": (
            "You are a helpful medical AI assistant. "
            "Provide accurate, evidence-based information with appropriate citations."
        ),
    },
    {
        "name": "voice:default",
        "display_name": "Voice Mode Assistant",
        "description": "Default system instructions for voice/realtime mode",
        "prompt_type": "voice",
        "intent_category": None,
        "system_prompt": """You are a helpful medical AI assistant in voice mode.

Guidelines:
- Keep responses concise and conversational
- Use natural spoken language, not written text
- Ask clarifying questions when needed
- Be empathetic and professional
- Cite sources when providing medical information
- Maintain HIPAA compliance at all times

When speaking:
- Use short sentences
- Avoid complex medical jargon unless requested
- Confirm understanding before proceeding
- Offer to provide more details if needed""",
    },
]


def upgrade():
    # Create prompts table
    op.create_table(
        "prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("prompt_type", sa.String(50), nullable=False, server_default="chat", index=True),
        sa.Column("intent_category", sa.String(100), nullable=True, index=True),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("published_content", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft", index=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("current_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )

    # Create prompt_versions table
    op.create_table(
        "prompt_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("prompt_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("prompt_type", sa.String(50), nullable=False),
        sa.Column("intent_category", sa.String(100), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column("changed_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("changed_by_email", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["prompt_id"], ["prompts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("prompt_id", "version_number", name="uq_prompt_version"),
    )

    # Create additional indexes for common queries
    op.create_index("ix_prompts_type_intent", "prompts", ["prompt_type", "intent_category"])
    op.create_index("ix_prompts_status_active", "prompts", ["status", "is_active"])
    op.create_index("ix_prompt_versions_prompt_version", "prompt_versions", ["prompt_id", "version_number"])

    # Seed default prompts
    prompts_table = sa.table(
        "prompts",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("prompt_type", sa.String),
        sa.column("intent_category", sa.String),
        sa.column("system_prompt", sa.Text),
        sa.column("published_content", sa.Text),
        sa.column("status", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("current_version", sa.Integer),
    )

    prompt_versions_table = sa.table(
        "prompt_versions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("prompt_id", postgresql.UUID(as_uuid=True)),
        sa.column("version_number", sa.Integer),
        sa.column("system_prompt", sa.Text),
        sa.column("prompt_type", sa.String),
        sa.column("intent_category", sa.String),
        sa.column("change_summary", sa.String),
        sa.column("status", sa.String),
    )

    for prompt_data in DEFAULT_PROMPTS:
        prompt_id = uuid.uuid4()

        # Insert prompt
        op.bulk_insert(
            prompts_table,
            [
                {
                    "id": prompt_id,
                    "name": prompt_data["name"],
                    "display_name": prompt_data["display_name"],
                    "description": prompt_data["description"],
                    "prompt_type": prompt_data["prompt_type"],
                    "intent_category": prompt_data["intent_category"],
                    "system_prompt": prompt_data["system_prompt"],
                    "published_content": prompt_data["system_prompt"],  # Same as draft initially
                    "status": "published",
                    "is_active": True,
                    "current_version": 1,
                }
            ],
        )

        # Insert initial version
        op.bulk_insert(
            prompt_versions_table,
            [
                {
                    "id": uuid.uuid4(),
                    "prompt_id": prompt_id,
                    "version_number": 1,
                    "system_prompt": prompt_data["system_prompt"],
                    "prompt_type": prompt_data["prompt_type"],
                    "intent_category": prompt_data["intent_category"],
                    "change_summary": "Initial version (seeded from defaults)",
                    "status": "published",
                }
            ],
        )


def downgrade():
    # Drop indexes
    op.drop_index("ix_prompt_versions_prompt_version", table_name="prompt_versions")
    op.drop_index("ix_prompts_status_active", table_name="prompts")
    op.drop_index("ix_prompts_type_intent", table_name="prompts")

    # Drop tables
    op.drop_table("prompt_versions")
    op.drop_table("prompts")
