"""add branching support to messages

Revision ID: 006
Revises: 005
Create Date: 2025-11-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    # Add parent_message_id column for conversation branching
    op.add_column(
        'messages',
        sa.Column('parent_message_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add branch_id column to identify which branch a message belongs to
    op.add_column(
        'messages',
        sa.Column('branch_id', sa.String(100), nullable=True)
    )

    # Add foreign key constraint for parent_message_id
    op.create_foreign_key(
        'fk_messages_parent_message_id',
        'messages',
        'messages',
        ['parent_message_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create indexes for efficient branch queries
    op.create_index(
        'ix_messages_parent_message_id',
        'messages',
        ['parent_message_id']
    )

    op.create_index(
        'ix_messages_branch_id',
        'messages',
        ['branch_id']
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_messages_branch_id', table_name='messages')
    op.drop_index('ix_messages_parent_message_id', table_name='messages')

    # Drop foreign key constraint
    op.drop_constraint('fk_messages_parent_message_id', 'messages', type_='foreignkey')

    # Drop columns
    op.drop_column('messages', 'branch_id')
    op.drop_column('messages', 'parent_message_id')
