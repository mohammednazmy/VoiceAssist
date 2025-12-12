"""Analytics models for dashboard and reporting"""

import uuid
from datetime import date, datetime
from typing import Any, Optional

from app.core.database import Base
from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship


class AnalyticsDailyMetrics(Base):
    """Daily aggregated metrics for fast dashboard queries"""

    __tablename__ = "analytics_daily_metrics"

    # Metric types
    METRIC_API_CALLS = "api_calls"
    METRIC_SESSIONS = "sessions"
    METRIC_DOCUMENTS = "documents"
    METRIC_VOICE = "voice"
    METRIC_SEARCH = "search"
    METRIC_CHAT = "chat"
    METRIC_KB = "knowledge_base"
    METRIC_LEARNING = "learning"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    metric_type = Column(String(100), nullable=False)

    # Core counts
    total_count = Column(BigInteger, nullable=False, default=0)
    unique_users = Column(Integer, nullable=False, default=0)
    success_count = Column(BigInteger, nullable=False, default=0)
    error_count = Column(BigInteger, nullable=False, default=0)

    # Performance metrics
    avg_duration_ms = Column(Float, nullable=True)
    p50_duration_ms = Column(Float, nullable=True)
    p95_duration_ms = Column(Float, nullable=True)
    p99_duration_ms = Column(Float, nullable=True)

    # Resource usage
    total_tokens = Column(BigInteger, nullable=True)
    total_bytes = Column(BigInteger, nullable=True)
    total_cost_cents = Column(Integer, nullable=True)

    # Breakdown by sub-categories
    breakdown = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", backref="daily_metrics")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "date": self.date.isoformat() if self.date else None,
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "metric_type": self.metric_type,
            "total_count": self.total_count,
            "unique_users": self.unique_users,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "success_rate": (
                round(self.success_count / self.total_count * 100, 2)
                if self.total_count > 0
                else 100.0
            ),
            "avg_duration_ms": self.avg_duration_ms,
            "p50_duration_ms": self.p50_duration_ms,
            "p95_duration_ms": self.p95_duration_ms,
            "p99_duration_ms": self.p99_duration_ms,
            "total_tokens": self.total_tokens,
            "total_bytes": self.total_bytes,
            "total_cost_cents": self.total_cost_cents,
            "breakdown": self.breakdown,
        }


class AnalyticsHourlyMetrics(Base):
    """Hourly metrics for real-time monitoring"""

    __tablename__ = "analytics_hourly_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    metric_type = Column(String(100), nullable=False)
    total_count = Column(BigInteger, nullable=False, default=0)
    unique_users = Column(Integer, nullable=False, default=0)
    error_count = Column(BigInteger, nullable=False, default=0)
    avg_duration_ms = Column(Float, nullable=True)
    breakdown = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", backref="hourly_metrics")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "metric_type": self.metric_type,
            "total_count": self.total_count,
            "unique_users": self.unique_users,
            "error_count": self.error_count,
            "avg_duration_ms": self.avg_duration_ms,
            "breakdown": self.breakdown,
        }


class AnalyticsUserActivity(Base):
    """User activity tracking for engagement analytics"""

    __tablename__ = "analytics_user_activity"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    date = Column(Date, nullable=False)

    # Activity counts
    sessions_count = Column(Integer, nullable=False, default=0)
    messages_sent = Column(Integer, nullable=False, default=0)
    documents_viewed = Column(Integer, nullable=False, default=0)
    documents_uploaded = Column(Integer, nullable=False, default=0)
    voice_minutes = Column(Float, nullable=False, default=0.0)
    flashcards_reviewed = Column(Integer, nullable=False, default=0)
    searches_performed = Column(Integer, nullable=False, default=0)

    # Time tracking
    total_active_minutes = Column(Float, nullable=False, default=0.0)
    first_activity_at = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)

    # Features used
    features_used = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="activity_records")
    organization = relationship("Organization", backref="user_activities")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "date": self.date.isoformat() if self.date else None,
            "sessions_count": self.sessions_count,
            "messages_sent": self.messages_sent,
            "documents_viewed": self.documents_viewed,
            "documents_uploaded": self.documents_uploaded,
            "voice_minutes": self.voice_minutes,
            "flashcards_reviewed": self.flashcards_reviewed,
            "searches_performed": self.searches_performed,
            "total_active_minutes": self.total_active_minutes,
            "first_activity_at": self.first_activity_at.isoformat() if self.first_activity_at else None,
            "last_activity_at": self.last_activity_at.isoformat() if self.last_activity_at else None,
            "features_used": self.features_used,
        }


class AnalyticsSystemHealth(Base):
    """System health metrics"""

    __tablename__ = "analytics_system_health"

    STATUS_HEALTHY = "healthy"
    STATUS_DEGRADED = "degraded"
    STATUS_UNHEALTHY = "unhealthy"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    service_name = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False)

    # Performance
    cpu_percent = Column(Float, nullable=True)
    memory_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    active_connections = Column(Integer, nullable=True)

    # Latency percentiles
    latency_p50_ms = Column(Float, nullable=True)
    latency_p95_ms = Column(Float, nullable=True)
    latency_p99_ms = Column(Float, nullable=True)

    # Error rates
    error_rate_percent = Column(Float, nullable=True)
    requests_per_second = Column(Float, nullable=True)

    # External services
    external_services = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "service_name": self.service_name,
            "status": self.status,
            "cpu_percent": self.cpu_percent,
            "memory_percent": self.memory_percent,
            "disk_percent": self.disk_percent,
            "active_connections": self.active_connections,
            "latency_p50_ms": self.latency_p50_ms,
            "latency_p95_ms": self.latency_p95_ms,
            "latency_p99_ms": self.latency_p99_ms,
            "error_rate_percent": self.error_rate_percent,
            "requests_per_second": self.requests_per_second,
            "external_services": self.external_services,
        }


class AnalyticsDocumentStats(Base):
    """Document analytics for KB insights"""

    __tablename__ = "analytics_document_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    date = Column(Date, nullable=False)

    # Usage stats
    views_count = Column(Integer, nullable=False, default=0)
    unique_viewers = Column(Integer, nullable=False, default=0)
    search_appearances = Column(Integer, nullable=False, default=0)
    citation_count = Column(Integer, nullable=False, default=0)
    voice_reads = Column(Integer, nullable=False, default=0)

    # Quality metrics
    avg_relevance_score = Column(Float, nullable=True)
    helpful_votes = Column(Integer, nullable=False, default=0)
    unhelpful_votes = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    document = relationship("Document", backref="analytics_stats")
    organization = relationship("Organization", backref="document_stats")

    def to_dict(self) -> dict[str, Any]:
        helpfulness = 0.0
        total_votes = self.helpful_votes + self.unhelpful_votes
        if total_votes > 0:
            helpfulness = round(self.helpful_votes / total_votes * 100, 2)

        return {
            "id": str(self.id),
            "document_id": str(self.document_id),
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "date": self.date.isoformat() if self.date else None,
            "views_count": self.views_count,
            "unique_viewers": self.unique_viewers,
            "search_appearances": self.search_appearances,
            "citation_count": self.citation_count,
            "voice_reads": self.voice_reads,
            "avg_relevance_score": self.avg_relevance_score,
            "helpful_votes": self.helpful_votes,
            "unhelpful_votes": self.unhelpful_votes,
            "helpfulness_percent": helpfulness,
        }


class AnalyticsSearchQuery(Base):
    """Search analytics for understanding user needs"""

    __tablename__ = "analytics_search_queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    query_text = Column(Text, nullable=False)
    query_hash = Column(String(64), nullable=False)
    search_type = Column(String(50), nullable=False)

    # Results
    results_count = Column(Integer, nullable=False, default=0)
    clicked_results = Column(Integer, nullable=False, default=0)
    top_result_document_id = Column(UUID(as_uuid=True), nullable=True)
    top_result_score = Column(Float, nullable=True)

    # User satisfaction signals
    result_selected = Column(Boolean, nullable=True)
    refined_query = Column(Boolean, nullable=False, default=False)
    time_to_click_ms = Column(Integer, nullable=True)

    # Performance
    search_duration_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", backref="search_queries")
    user = relationship("User", backref="search_queries")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "query_text": self.query_text,
            "search_type": self.search_type,
            "results_count": self.results_count,
            "clicked_results": self.clicked_results,
            "top_result_score": self.top_result_score,
            "result_selected": self.result_selected,
            "refined_query": self.refined_query,
            "search_duration_ms": self.search_duration_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AnalyticsErrorSummary(Base):
    """Aggregated error tracking for debugging"""

    __tablename__ = "analytics_error_summary"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    error_type = Column(String(100), nullable=False)
    error_code = Column(String(50), nullable=True)
    endpoint = Column(String(200), nullable=True)
    error_message = Column(Text, nullable=True)
    occurrence_count = Column(Integer, nullable=False, default=1)
    affected_users = Column(Integer, nullable=False, default=1)
    first_seen = Column(DateTime(timezone=True), nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=False)
    stack_trace_hash = Column(String(64), nullable=True)
    sample_request = Column(JSONB, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", backref="error_summaries")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "date": self.date.isoformat() if self.date else None,
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "error_type": self.error_type,
            "error_code": self.error_code,
            "endpoint": self.endpoint,
            "error_message": self.error_message,
            "occurrence_count": self.occurrence_count,
            "affected_users": self.affected_users,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "is_resolved": self.resolved_at is not None,
        }


class AnalyticsCostTracking(Base):
    """Cost tracking for resource optimization"""

    __tablename__ = "analytics_cost_tracking"

    # Service types
    SERVICE_OPENAI = "openai"
    SERVICE_ANTHROPIC = "anthropic"
    SERVICE_AZURE_TTS = "azure_tts"
    SERVICE_AZURE_STT = "azure_stt"
    SERVICE_STORAGE = "storage"
    SERVICE_EMBEDDING = "embedding"
    SERVICE_CLIP = "clip"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    service_type = Column(String(100), nullable=False)

    # Usage
    usage_units = Column(BigInteger, nullable=False, default=0)
    usage_unit_type = Column(String(50), nullable=False)

    # Cost
    estimated_cost_cents = Column(Integer, nullable=False, default=0)
    actual_cost_cents = Column(Integer, nullable=True)

    # Breakdown
    breakdown = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", backref="cost_tracking")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "date": self.date.isoformat() if self.date else None,
            "organization_id": str(self.organization_id) if self.organization_id else None,
            "service_type": self.service_type,
            "usage_units": self.usage_units,
            "usage_unit_type": self.usage_unit_type,
            "estimated_cost_cents": self.estimated_cost_cents,
            "estimated_cost_dollars": round(self.estimated_cost_cents / 100, 2),
            "actual_cost_cents": self.actual_cost_cents,
            "actual_cost_dollars": round(self.actual_cost_cents / 100, 2) if self.actual_cost_cents else None,
            "breakdown": self.breakdown,
        }
