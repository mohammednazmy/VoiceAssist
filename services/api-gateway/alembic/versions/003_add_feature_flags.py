"""add feature_flags table

Revision ID: 003
Revises: 002
Create Date: 2025-11-21 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # Create feature_flags table
    op.create_table(
        'feature_flags',
        sa.Column('name', sa.String(255), primary_key=True, index=True),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('flag_type', sa.String(50), nullable=False, server_default='boolean'),
        sa.Column('enabled', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('value', postgresql.JSON, nullable=True),
        sa.Column('default_value', postgresql.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('metadata', postgresql.JSON, nullable=True),
    )

    # Create indexes for common queries
    op.create_index('ix_feature_flags_enabled', 'feature_flags', ['enabled'])
    op.create_index('ix_feature_flags_flag_type', 'feature_flags', ['flag_type'])


def downgrade():
    # Drop indexes
    op.drop_index('ix_feature_flags_flag_type', table_name='feature_flags')
    op.drop_index('ix_feature_flags_enabled', table_name='feature_flags')

    # Drop table
    op.drop_table('feature_flags')
