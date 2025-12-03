"""add conversation folders

Revision ID: 009_add_conversation_folders
Revises: 008_add_clinical_contexts
Create Date: 2025-11-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    """Create conversation_folders table and add folder_id to sessions"""
    # Create conversation_folders table
    op.create_table(
        "conversation_folders",
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
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(50), nullable=True, comment="Hex color for UI"),
        sa.Column("icon", sa.String(50), nullable=True, comment="Icon name"),
        sa.Column(
            "parent_folder_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversation_folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Create indexes
    op.create_index("idx_conversation_folders_user_id", "conversation_folders", ["user_id"])
    op.create_index(
        "idx_conversation_folders_parent_folder_id",
        "conversation_folders",
        ["parent_folder_id"],
    )

    # Create unique constraint for user_id + name + parent_folder_id
    op.create_unique_constraint(
        "uq_conversation_folders_user_name_parent",
        "conversation_folders",
        ["user_id", "name", "parent_folder_id"],
    )

    # Add folder_id to sessions table
    op.add_column(
        "sessions",
        sa.Column(
            "folder_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversation_folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_sessions_folder_id", "sessions", ["folder_id"])


def downgrade():
    """Drop conversation_folders table and folder_id from sessions"""
    op.drop_index("idx_sessions_folder_id", table_name="sessions")
    op.drop_column("sessions", "folder_id")
    op.drop_constraint(
        "uq_conversation_folders_user_name_parent",
        "conversation_folders",
        type_="unique",
    )
    op.drop_index("idx_conversation_folders_parent_folder_id", table_name="conversation_folders")
    op.drop_index("idx_conversation_folders_user_id", table_name="conversation_folders")
    op.drop_table("conversation_folders")
