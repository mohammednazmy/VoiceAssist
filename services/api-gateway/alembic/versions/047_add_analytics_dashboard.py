"""Add analytics dashboard support

Revision ID: 047
Revises: 046
Create Date: 2025-12-11

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Daily aggregated metrics - pre-computed for fast dashboard queries
    op.create_table(
        "analytics_daily_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("metric_type", sa.String(100), nullable=False),  # api_calls, sessions, documents, voice, etc.
        # Core counts
        sa.Column("total_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("unique_users", sa.Integer, nullable=False, server_default="0"),
        sa.Column("success_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("error_count", sa.BigInteger, nullable=False, server_default="0"),
        # Performance metrics
        sa.Column("avg_duration_ms", sa.Float, nullable=True),
        sa.Column("p50_duration_ms", sa.Float, nullable=True),
        sa.Column("p95_duration_ms", sa.Float, nullable=True),
        sa.Column("p99_duration_ms", sa.Float, nullable=True),
        # Resource usage
        sa.Column("total_tokens", sa.BigInteger, nullable=True),
        sa.Column("total_bytes", sa.BigInteger, nullable=True),
        sa.Column("total_cost_cents", sa.Integer, nullable=True),  # Estimated cost in cents
        # Breakdown by sub-categories (stored as JSONB)
        sa.Column("breakdown", JSONB, nullable=True),  # e.g., {"by_endpoint": {...}, "by_status": {...}}
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        # Unique constraint per date/org/metric type
        sa.UniqueConstraint("date", "organization_id", "metric_type", name="uq_daily_metrics_date_org_type"),
    )

    # Hourly metrics for real-time monitoring (last 7 days only)
    op.create_table(
        "analytics_hourly_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("metric_type", sa.String(100), nullable=False),
        sa.Column("total_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("unique_users", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("avg_duration_ms", sa.Float, nullable=True),
        sa.Column("breakdown", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("timestamp", "organization_id", "metric_type", name="uq_hourly_metrics_ts_org_type"),
    )

    # User activity tracking for engagement analytics
    op.create_table(
        "analytics_user_activity",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("date", sa.Date, nullable=False),
        # Activity counts
        sa.Column("sessions_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("messages_sent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("documents_viewed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("documents_uploaded", sa.Integer, nullable=False, server_default="0"),
        sa.Column("voice_minutes", sa.Float, nullable=False, server_default="0"),
        sa.Column("flashcards_reviewed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("searches_performed", sa.Integer, nullable=False, server_default="0"),
        # Time tracking
        sa.Column("total_active_minutes", sa.Float, nullable=False, server_default="0"),
        sa.Column("first_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        # Features used (for feature adoption tracking)
        sa.Column("features_used", JSONB, nullable=True),  # {"kb_search": true, "voice": true, ...}
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_user_activity_user_date"),
    )

    # System health metrics
    op.create_table(
        "analytics_system_health",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        # Service health
        sa.Column("service_name", sa.String(100), nullable=False),  # api-gateway, voice-service, etc.
        sa.Column("status", sa.String(50), nullable=False),  # healthy, degraded, unhealthy
        # Performance
        sa.Column("cpu_percent", sa.Float, nullable=True),
        sa.Column("memory_percent", sa.Float, nullable=True),
        sa.Column("disk_percent", sa.Float, nullable=True),
        sa.Column("active_connections", sa.Integer, nullable=True),
        # Latency percentiles
        sa.Column("latency_p50_ms", sa.Float, nullable=True),
        sa.Column("latency_p95_ms", sa.Float, nullable=True),
        sa.Column("latency_p99_ms", sa.Float, nullable=True),
        # Error rates
        sa.Column("error_rate_percent", sa.Float, nullable=True),
        sa.Column("requests_per_second", sa.Float, nullable=True),
        # External services
        sa.Column("external_services", JSONB, nullable=True),  # {"postgres": "healthy", "redis": "healthy", ...}
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Document analytics for KB insights
    op.create_table(
        "analytics_document_stats",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("date", sa.Date, nullable=False),
        # Usage stats
        sa.Column("views_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unique_viewers", sa.Integer, nullable=False, server_default="0"),
        sa.Column("search_appearances", sa.Integer, nullable=False, server_default="0"),
        sa.Column("citation_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("voice_reads", sa.Integer, nullable=False, server_default="0"),
        # Quality metrics
        sa.Column("avg_relevance_score", sa.Float, nullable=True),
        sa.Column("helpful_votes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unhelpful_votes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("document_id", "date", name="uq_doc_stats_doc_date"),
    )

    # Search analytics for understanding user needs
    op.create_table(
        "analytics_search_queries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("query_hash", sa.String(64), nullable=False),  # For grouping similar queries
        sa.Column("search_type", sa.String(50), nullable=False),  # kb, multimodal, voice
        # Results
        sa.Column("results_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("clicked_results", sa.Integer, nullable=False, server_default="0"),
        sa.Column("top_result_document_id", UUID(as_uuid=True), nullable=True),
        sa.Column("top_result_score", sa.Float, nullable=True),
        # User satisfaction signals
        sa.Column("result_selected", sa.Boolean, nullable=True),
        sa.Column("refined_query", sa.Boolean, nullable=False, server_default="false"),  # Did user search again?
        sa.Column("time_to_click_ms", sa.Integer, nullable=True),
        # Performance
        sa.Column("search_duration_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Aggregated error tracking for debugging
    op.create_table(
        "analytics_error_summary",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("error_type", sa.String(100), nullable=False),  # ValidationError, TimeoutError, etc.
        sa.Column("error_code", sa.String(50), nullable=True),  # HTTP status or internal code
        sa.Column("endpoint", sa.String(200), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),  # Sanitized error message
        sa.Column("occurrence_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("affected_users", sa.Integer, nullable=False, server_default="1"),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stack_trace_hash", sa.String(64), nullable=True),  # For grouping
        sa.Column("sample_request", JSONB, nullable=True),  # Sanitized sample request
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Cost tracking for resource optimization
    op.create_table(
        "analytics_cost_tracking",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("service_type", sa.String(100), nullable=False),  # openai, anthropic, azure_tts, storage, etc.
        # Usage
        sa.Column("usage_units", sa.BigInteger, nullable=False, server_default="0"),  # tokens, characters, bytes, etc.
        sa.Column("usage_unit_type", sa.String(50), nullable=False),  # tokens, characters, mb, requests
        # Cost
        sa.Column("estimated_cost_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("actual_cost_cents", sa.Integer, nullable=True),  # From billing if available
        # Breakdown
        sa.Column("breakdown", JSONB, nullable=True),  # {"gpt4": 100, "gpt35": 50, ...}
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("date", "organization_id", "service_type", name="uq_cost_date_org_service"),
    )

    # Create indexes for efficient querying
    op.create_index("ix_daily_metrics_date", "analytics_daily_metrics", ["date"])
    op.create_index("ix_daily_metrics_org", "analytics_daily_metrics", ["organization_id"])
    op.create_index("ix_daily_metrics_type", "analytics_daily_metrics", ["metric_type"])
    op.create_index("ix_daily_metrics_date_type", "analytics_daily_metrics", ["date", "metric_type"])

    op.create_index("ix_hourly_metrics_timestamp", "analytics_hourly_metrics", ["timestamp"])
    op.create_index("ix_hourly_metrics_org", "analytics_hourly_metrics", ["organization_id"])

    op.create_index("ix_user_activity_user", "analytics_user_activity", ["user_id"])
    op.create_index("ix_user_activity_date", "analytics_user_activity", ["date"])
    op.create_index("ix_user_activity_org", "analytics_user_activity", ["organization_id"])

    op.create_index("ix_system_health_timestamp", "analytics_system_health", ["timestamp"])
    op.create_index("ix_system_health_service", "analytics_system_health", ["service_name"])

    op.create_index("ix_doc_stats_doc", "analytics_document_stats", ["document_id"])
    op.create_index("ix_doc_stats_date", "analytics_document_stats", ["date"])
    op.create_index("ix_doc_stats_org", "analytics_document_stats", ["organization_id"])

    op.create_index("ix_search_queries_org", "analytics_search_queries", ["organization_id"])
    op.create_index("ix_search_queries_hash", "analytics_search_queries", ["query_hash"])
    op.create_index("ix_search_queries_created", "analytics_search_queries", ["created_at"])

    op.create_index("ix_error_summary_date", "analytics_error_summary", ["date"])
    op.create_index("ix_error_summary_type", "analytics_error_summary", ["error_type"])
    op.create_index("ix_error_summary_org", "analytics_error_summary", ["organization_id"])

    op.create_index("ix_cost_tracking_date", "analytics_cost_tracking", ["date"])
    op.create_index("ix_cost_tracking_org", "analytics_cost_tracking", ["organization_id"])


def downgrade() -> None:
    # Drop tables
    op.drop_table("analytics_cost_tracking")
    op.drop_table("analytics_error_summary")
    op.drop_table("analytics_search_queries")
    op.drop_table("analytics_document_stats")
    op.drop_table("analytics_system_health")
    op.drop_table("analytics_user_activity")
    op.drop_table("analytics_hourly_metrics")
    op.drop_table("analytics_daily_metrics")
