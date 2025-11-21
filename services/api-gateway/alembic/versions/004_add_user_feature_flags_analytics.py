"""add user_feature_flags and feature_flag_analytics tables

Revision ID: 004
Revises: 003
Create Date: 2025-11-21 08:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # Add rollout_percentage column to existing feature_flags table for A/B testing
    op.add_column('feature_flags', sa.Column('rollout_percentage', sa.Integer, nullable=True, server_default='100'))
    op.add_column('feature_flags', sa.Column('rollout_salt', sa.String(50), nullable=True))

    # Create user_feature_flags table for per-user overrides
    op.create_table(
        'user_feature_flags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('flag_name', sa.String(255), nullable=False),
        sa.Column('enabled', sa.Boolean, nullable=True),
        sa.Column('value', postgresql.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('metadata', postgresql.JSON, nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['flag_name'], ['feature_flags.name'], ondelete='CASCADE'),
    )

    # Create indexes
    op.create_index('ix_user_feature_flags_user_id', 'user_feature_flags', ['user_id'])
    op.create_index('ix_user_feature_flags_flag_name', 'user_feature_flags', ['flag_name'])
    op.create_index('ix_user_feature_flags_user_flag', 'user_feature_flags', ['user_id', 'flag_name'], unique=True)

    # Create feature_flag_analytics table
    op.create_table(
        'feature_flag_analytics',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('flag_name', sa.String(255), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('checked_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('result', sa.Boolean, nullable=False),
        sa.Column('source', sa.String(50), nullable=True),
        sa.Column('endpoint', sa.String(255), nullable=True),
        sa.Column('trace_id', sa.String(100), nullable=True),
    )

    # Create indexes for analytics
    op.create_index('ix_feature_flag_analytics_flag_name', 'feature_flag_analytics', ['flag_name'])
    op.create_index('ix_feature_flag_analytics_user_id', 'feature_flag_analytics', ['user_id'])
    op.create_index('ix_feature_flag_analytics_checked_at', 'feature_flag_analytics', ['checked_at'])
    op.create_index('ix_feature_flag_analytics_trace_id', 'feature_flag_analytics', ['trace_id'])
    op.create_index('ix_feature_flag_analytics_flag_date', 'feature_flag_analytics', ['flag_name', 'checked_at'])
    op.create_index('ix_feature_flag_analytics_user_date', 'feature_flag_analytics', ['user_id', 'checked_at'])


def downgrade():
    # Drop analytics table
    op.drop_index('ix_feature_flag_analytics_user_date', table_name='feature_flag_analytics')
    op.drop_index('ix_feature_flag_analytics_flag_date', table_name='feature_flag_analytics')
    op.drop_index('ix_feature_flag_analytics_trace_id', table_name='feature_flag_analytics')
    op.drop_index('ix_feature_flag_analytics_checked_at', table_name='feature_flag_analytics')
    op.drop_index('ix_feature_flag_analytics_user_id', table_name='feature_flag_analytics')
    op.drop_index('ix_feature_flag_analytics_flag_name', table_name='feature_flag_analytics')
    op.drop_table('feature_flag_analytics')

    # Drop user overrides table
    op.drop_index('ix_user_feature_flags_user_flag', table_name='user_feature_flags')
    op.drop_index('ix_user_feature_flags_flag_name', table_name='user_feature_flags')
    op.drop_index('ix_user_feature_flags_user_id', table_name='user_feature_flags')
    op.drop_table('user_feature_flags')

    # Drop A/B testing columns
    op.drop_column('feature_flags', 'rollout_salt')
    op.drop_column('feature_flags', 'rollout_percentage')
