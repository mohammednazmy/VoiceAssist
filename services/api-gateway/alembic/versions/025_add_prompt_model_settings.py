"""add temperature, max_tokens, model_name to prompts table

Revision ID: 025
Revises: 024
Create Date: 2025-11-29 14:00:00.000000

Adds model settings columns to prompts table for per-prompt
temperature, max_tokens, and model_name configuration.
Also seeds the system:rag_instructions prompt.
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


# Conversational RAG instructions (replaces hardcoded rigid instructions)
RAG_INSTRUCTIONS_PROMPT = """You are a knowledgeable and friendly medical assistant helping users understand health information.

Your personality:
- Warm and approachable - like a patient healthcare educator who genuinely enjoys helping
- Conversational but professional - you can chat naturally while maintaining accuracy
- Empathetic and engaged - show understanding for health concerns

Guidelines:
- Answer questions directly, then offer to explore further
- Explain medical concepts in plain language
- Use natural language - contractions ("I'd", "you're") are fine
- Acknowledge when a topic is complex or when concerns are valid
- If you don't know something, say so warmly rather than deflecting

When using retrieved content:
- Summarize naturally rather than reading verbatim
- Connect ideas to what the user has asked about before
- Suggest related topics they might find helpful

You can discuss:
- Any health-related topic the user brings up
- General wellness, lifestyle, and prevention
- Clarifications and follow-up questions
- Non-medical small talk when the user initiates it

Important: Always recommend consulting a healthcare provider for specific medical advice."""


def upgrade():
    # Add new columns to prompts table
    op.add_column("prompts", sa.Column("temperature", sa.Float, nullable=True, comment="LLM temperature (0.0-2.0)"))
    op.add_column("prompts", sa.Column("max_tokens", sa.Integer, nullable=True, comment="Maximum response tokens"))
    op.add_column("prompts", sa.Column("model_name", sa.String(100), nullable=True, comment="Optional model override"))

    # Update existing prompts with default values
    op.execute(
        """
        UPDATE prompts
        SET temperature = CASE
            WHEN prompt_type = 'voice' THEN 0.8
            WHEN intent_category = 'other' THEN 0.8
            ELSE 0.7
        END,
        max_tokens = CASE
            WHEN intent_category = 'other' THEN 1536
            ELSE 1024
        END
        WHERE temperature IS NULL
    """
    )

    # Seed the system:rag_instructions prompt
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
        sa.column("temperature", sa.Float),
        sa.column("max_tokens", sa.Integer),
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

    prompt_id = uuid.uuid4()

    # Insert system:rag_instructions prompt
    op.bulk_insert(
        prompts_table,
        [
            {
                "id": prompt_id,
                "name": "system:rag_instructions",
                "display_name": "RAG Orchestrator Instructions",
                "description": "Instructions injected into the RAG orchestrator for all queries. Controls response style and behavior.",
                "prompt_type": "system",
                "intent_category": None,
                "system_prompt": RAG_INSTRUCTIONS_PROMPT,
                "published_content": RAG_INSTRUCTIONS_PROMPT,
                "status": "published",
                "is_active": True,
                "current_version": 1,
                "temperature": None,  # Not applicable for instructions
                "max_tokens": None,  # Not applicable for instructions
            }
        ],
    )

    # Insert initial version for the new prompt
    op.bulk_insert(
        prompt_versions_table,
        [
            {
                "id": uuid.uuid4(),
                "prompt_id": prompt_id,
                "version_number": 1,
                "system_prompt": RAG_INSTRUCTIONS_PROMPT,
                "prompt_type": "system",
                "intent_category": None,
                "change_summary": "Initial version - conversational RAG instructions",
                "status": "published",
            }
        ],
    )


def downgrade():
    # Delete the seeded prompt
    op.execute("DELETE FROM prompts WHERE name = 'system:rag_instructions'")

    # Remove the columns
    op.drop_column("prompts", "model_name")
    op.drop_column("prompts", "max_tokens")
    op.drop_column("prompts", "temperature")
