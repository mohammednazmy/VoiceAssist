"""Analytics service for dashboard data aggregation and reporting"""

import hashlib
from datetime import date, datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from app.core.logging import get_logger
from app.core.metrics import organization_api_calls_total
from app.models.analytics import (
    AnalyticsCostTracking,
    AnalyticsDailyMetrics,
    AnalyticsDocumentStats,
    AnalyticsErrorSummary,
    AnalyticsHourlyMetrics,
    AnalyticsSearchQuery,
    AnalyticsSystemHealth,
    AnalyticsUserActivity,
)
from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class AnalyticsService:
    """Service for analytics aggregation and dashboard queries"""

    # ==================== Dashboard Overview ====================

    def get_dashboard_overview(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get high-level dashboard metrics"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # Build org filter
        org_filter = []
        if organization_id:
            org_filter.append(AnalyticsDailyMetrics.organization_id == organization_id)
        else:
            org_filter.append(AnalyticsDailyMetrics.organization_id.is_(None))

        # Get totals by metric type
        metrics = (
            db.query(
                AnalyticsDailyMetrics.metric_type,
                func.sum(AnalyticsDailyMetrics.total_count).label("total"),
                func.sum(AnalyticsDailyMetrics.success_count).label("success"),
                func.sum(AnalyticsDailyMetrics.error_count).label("errors"),
                func.avg(AnalyticsDailyMetrics.avg_duration_ms).label("avg_duration"),
                func.sum(AnalyticsDailyMetrics.unique_users).label("unique_users"),
            )
            .filter(
                and_(
                    AnalyticsDailyMetrics.date >= start_date,
                    AnalyticsDailyMetrics.date <= end_date,
                    *org_filter,
                )
            )
            .group_by(AnalyticsDailyMetrics.metric_type)
            .all()
        )

        # Get daily user activity summary
        daily_active_users = (
            db.query(
                AnalyticsUserActivity.date,
                func.count(func.distinct(AnalyticsUserActivity.user_id)).label("dau"),
            )
            .filter(
                and_(
                    AnalyticsUserActivity.date >= start_date,
                    AnalyticsUserActivity.date <= end_date,
                )
            )
            .group_by(AnalyticsUserActivity.date)
            .order_by(AnalyticsUserActivity.date)
            .all()
        )

        # Get error counts
        error_counts = (
            db.query(func.sum(AnalyticsErrorSummary.occurrence_count))
            .filter(
                and_(
                    AnalyticsErrorSummary.date >= start_date,
                    AnalyticsErrorSummary.date <= end_date,
                    AnalyticsErrorSummary.resolved_at.is_(None),
                )
            )
            .scalar()
            or 0
        )

        # Get total costs
        total_cost = (
            db.query(func.sum(AnalyticsCostTracking.estimated_cost_cents))
            .filter(
                and_(
                    AnalyticsCostTracking.date >= start_date,
                    AnalyticsCostTracking.date <= end_date,
                )
            )
            .scalar()
            or 0
        )

        return {
            "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "days": days},
            "metrics_by_type": {
                m.metric_type: {
                    "total": m.total or 0,
                    "success": m.success or 0,
                    "errors": m.errors or 0,
                    "success_rate": round((m.success or 0) / m.total * 100, 2) if m.total else 0,
                    "avg_duration_ms": round(m.avg_duration, 2) if m.avg_duration else None,
                }
                for m in metrics
            },
            "daily_active_users": [{"date": d.date.isoformat(), "count": d.dau} for d in daily_active_users],
            "unresolved_errors": error_counts,
            "total_cost_cents": total_cost,
            "total_cost_dollars": round(total_cost / 100, 2),
        }

    # ==================== Usage Metrics ====================

    def get_usage_trends(
        self,
        db: Session,
        metric_type: str,
        organization_id: Optional[UUID] = None,
        days: int = 30,
        granularity: str = "daily",  # daily, hourly
    ) -> list[dict[str, Any]]:
        """Get usage trends over time"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        if granularity == "hourly":
            # Use hourly metrics for last 7 days
            query = (
                db.query(AnalyticsHourlyMetrics)
                .filter(
                    and_(
                        AnalyticsHourlyMetrics.timestamp >= datetime.combine(start_date, datetime.min.time()),
                        AnalyticsHourlyMetrics.metric_type == metric_type,
                    )
                )
                .order_by(AnalyticsHourlyMetrics.timestamp)
            )
            if organization_id:
                query = query.filter(AnalyticsHourlyMetrics.organization_id == organization_id)
            else:
                query = query.filter(AnalyticsHourlyMetrics.organization_id.is_(None))

            return [m.to_dict() for m in query.all()]
        else:
            # Use daily metrics
            query = (
                db.query(AnalyticsDailyMetrics)
                .filter(
                    and_(
                        AnalyticsDailyMetrics.date >= start_date,
                        AnalyticsDailyMetrics.date <= end_date,
                        AnalyticsDailyMetrics.metric_type == metric_type,
                    )
                )
                .order_by(AnalyticsDailyMetrics.date)
            )
            if organization_id:
                query = query.filter(AnalyticsDailyMetrics.organization_id == organization_id)
            else:
                query = query.filter(AnalyticsDailyMetrics.organization_id.is_(None))

            return [m.to_dict() for m in query.all()]

    def get_metric_comparison(
        self,
        db: Session,
        metric_type: str,
        organization_id: Optional[UUID] = None,
        days: int = 30,
    ) -> dict[str, Any]:
        """Compare current period vs previous period"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=days)

        def get_period_metrics(start: date, end: date):
            query = db.query(
                func.sum(AnalyticsDailyMetrics.total_count).label("total"),
                func.sum(AnalyticsDailyMetrics.success_count).label("success"),
                func.sum(AnalyticsDailyMetrics.error_count).label("errors"),
                func.avg(AnalyticsDailyMetrics.avg_duration_ms).label("avg_duration"),
            ).filter(
                and_(
                    AnalyticsDailyMetrics.date >= start,
                    AnalyticsDailyMetrics.date <= end,
                    AnalyticsDailyMetrics.metric_type == metric_type,
                )
            )
            if organization_id:
                query = query.filter(AnalyticsDailyMetrics.organization_id == organization_id)
            else:
                query = query.filter(AnalyticsDailyMetrics.organization_id.is_(None))

            return query.first()

        current = get_period_metrics(start_date, end_date)
        previous = get_period_metrics(prev_start, prev_end)

        def calc_change(current_val, previous_val):
            if not previous_val or previous_val == 0:
                return None
            return round((current_val - previous_val) / previous_val * 100, 2)

        return {
            "current_period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "total": current.total or 0 if current else 0,
                "success": current.success or 0 if current else 0,
                "errors": current.errors or 0 if current else 0,
                "avg_duration_ms": round(current.avg_duration, 2) if current and current.avg_duration else None,
            },
            "previous_period": {
                "start_date": prev_start.isoformat(),
                "end_date": prev_end.isoformat(),
                "total": previous.total or 0 if previous else 0,
                "success": previous.success or 0 if previous else 0,
                "errors": previous.errors or 0 if previous else 0,
                "avg_duration_ms": round(previous.avg_duration, 2) if previous and previous.avg_duration else None,
            },
            "changes": {
                "total_change_percent": calc_change(
                    current.total if current else 0, previous.total if previous else 0
                ),
                "error_change_percent": calc_change(
                    current.errors if current else 0, previous.errors if previous else 0
                ),
            },
        }

    # ==================== User Analytics ====================

    def get_user_engagement(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get user engagement metrics"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        query = db.query(
            func.count(func.distinct(AnalyticsUserActivity.user_id)).label("total_users"),
            func.sum(AnalyticsUserActivity.sessions_count).label("total_sessions"),
            func.sum(AnalyticsUserActivity.messages_sent).label("total_messages"),
            func.avg(AnalyticsUserActivity.total_active_minutes).label("avg_active_minutes"),
            func.sum(AnalyticsUserActivity.voice_minutes).label("total_voice_minutes"),
            func.sum(AnalyticsUserActivity.flashcards_reviewed).label("total_flashcards"),
            func.sum(AnalyticsUserActivity.searches_performed).label("total_searches"),
        ).filter(
            and_(
                AnalyticsUserActivity.date >= start_date,
                AnalyticsUserActivity.date <= end_date,
            )
        )

        if organization_id:
            query = query.filter(AnalyticsUserActivity.organization_id == organization_id)

        result = query.first()

        # Get feature adoption
        feature_adoption = (
            db.query(AnalyticsUserActivity.features_used)
            .filter(
                and_(
                    AnalyticsUserActivity.date >= start_date,
                    AnalyticsUserActivity.date <= end_date,
                    AnalyticsUserActivity.features_used.isnot(None),
                )
            )
            .all()
        )

        feature_counts: dict[str, int] = {}
        for row in feature_adoption:
            if row.features_used:
                for feature, used in row.features_used.items():
                    if used:
                        feature_counts[feature] = feature_counts.get(feature, 0) + 1

        return {
            "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            "total_active_users": result.total_users or 0 if result else 0,
            "total_sessions": result.total_sessions or 0 if result else 0,
            "total_messages": result.total_messages or 0 if result else 0,
            "avg_active_minutes_per_user": round(result.avg_active_minutes, 2) if result and result.avg_active_minutes else 0,
            "total_voice_minutes": round(result.total_voice_minutes, 2) if result and result.total_voice_minutes else 0,
            "total_flashcards_reviewed": result.total_flashcards or 0 if result else 0,
            "total_searches": result.total_searches or 0 if result else 0,
            "feature_adoption": feature_counts,
        }

    def get_top_users(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
        limit: int = 10,
        sort_by: str = "messages_sent",  # sessions_count, total_active_minutes, etc.
    ) -> list[dict[str, Any]]:
        """Get top users by activity"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        sort_column = getattr(AnalyticsUserActivity, sort_by, AnalyticsUserActivity.messages_sent)

        query = (
            db.query(
                AnalyticsUserActivity.user_id,
                func.sum(AnalyticsUserActivity.sessions_count).label("sessions"),
                func.sum(AnalyticsUserActivity.messages_sent).label("messages"),
                func.sum(AnalyticsUserActivity.total_active_minutes).label("active_minutes"),
                func.max(AnalyticsUserActivity.last_activity_at).label("last_active"),
            )
            .filter(
                and_(
                    AnalyticsUserActivity.date >= start_date,
                    AnalyticsUserActivity.date <= end_date,
                )
            )
            .group_by(AnalyticsUserActivity.user_id)
            .order_by(desc(func.sum(sort_column)))
            .limit(limit)
        )

        if organization_id:
            query = query.filter(AnalyticsUserActivity.organization_id == organization_id)

        return [
            {
                "user_id": str(row.user_id),
                "sessions_count": row.sessions or 0,
                "messages_sent": row.messages or 0,
                "total_active_minutes": round(row.active_minutes, 2) if row.active_minutes else 0,
                "last_activity_at": row.last_active.isoformat() if row.last_active else None,
            }
            for row in query.all()
        ]

    # ==================== Document Analytics ====================

    def get_document_insights(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get document usage insights"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # Top viewed documents
        top_viewed = (
            db.query(
                AnalyticsDocumentStats.document_id,
                func.sum(AnalyticsDocumentStats.views_count).label("views"),
                func.sum(AnalyticsDocumentStats.citation_count).label("citations"),
                func.avg(AnalyticsDocumentStats.avg_relevance_score).label("avg_score"),
            )
            .filter(
                and_(
                    AnalyticsDocumentStats.date >= start_date,
                    AnalyticsDocumentStats.date <= end_date,
                )
            )
            .group_by(AnalyticsDocumentStats.document_id)
            .order_by(desc(func.sum(AnalyticsDocumentStats.views_count)))
            .limit(limit)
        )

        if organization_id:
            top_viewed = top_viewed.filter(AnalyticsDocumentStats.organization_id == organization_id)

        # Most cited documents
        top_cited = (
            db.query(
                AnalyticsDocumentStats.document_id,
                func.sum(AnalyticsDocumentStats.citation_count).label("citations"),
            )
            .filter(
                and_(
                    AnalyticsDocumentStats.date >= start_date,
                    AnalyticsDocumentStats.date <= end_date,
                )
            )
            .group_by(AnalyticsDocumentStats.document_id)
            .order_by(desc(func.sum(AnalyticsDocumentStats.citation_count)))
            .limit(limit)
        )

        if organization_id:
            top_cited = top_cited.filter(AnalyticsDocumentStats.organization_id == organization_id)

        return {
            "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            "top_viewed": [
                {
                    "document_id": str(row.document_id),
                    "views": row.views or 0,
                    "citations": row.citations or 0,
                    "avg_relevance_score": round(row.avg_score, 3) if row.avg_score else None,
                }
                for row in top_viewed.all()
            ],
            "top_cited": [
                {
                    "document_id": str(row.document_id),
                    "citations": row.citations or 0,
                }
                for row in top_cited.all()
            ],
        }

    # ==================== Search Analytics ====================

    def get_search_insights(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get search analytics and popular queries"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Top search queries
        top_queries = (
            db.query(
                AnalyticsSearchQuery.query_hash,
                func.min(AnalyticsSearchQuery.query_text).label("query_text"),
                func.count(AnalyticsSearchQuery.id).label("search_count"),
                func.avg(AnalyticsSearchQuery.results_count).label("avg_results"),
                func.avg(AnalyticsSearchQuery.search_duration_ms).label("avg_duration"),
            )
            .filter(AnalyticsSearchQuery.created_at >= start_date)
            .group_by(AnalyticsSearchQuery.query_hash)
            .order_by(desc(func.count(AnalyticsSearchQuery.id)))
            .limit(limit)
        )

        if organization_id:
            top_queries = top_queries.filter(AnalyticsSearchQuery.organization_id == organization_id)

        # Zero-result queries (opportunities for content)
        zero_result_queries = (
            db.query(
                AnalyticsSearchQuery.query_hash,
                func.min(AnalyticsSearchQuery.query_text).label("query_text"),
                func.count(AnalyticsSearchQuery.id).label("count"),
            )
            .filter(
                and_(
                    AnalyticsSearchQuery.created_at >= start_date,
                    AnalyticsSearchQuery.results_count == 0,
                )
            )
            .group_by(AnalyticsSearchQuery.query_hash)
            .order_by(desc(func.count(AnalyticsSearchQuery.id)))
            .limit(10)
        )

        if organization_id:
            zero_result_queries = zero_result_queries.filter(AnalyticsSearchQuery.organization_id == organization_id)

        # Search performance
        search_perf = (
            db.query(
                func.count(AnalyticsSearchQuery.id).label("total"),
                func.avg(AnalyticsSearchQuery.search_duration_ms).label("avg_duration"),
                func.avg(AnalyticsSearchQuery.results_count).label("avg_results"),
            )
            .filter(AnalyticsSearchQuery.created_at >= start_date)
        )

        if organization_id:
            search_perf = search_perf.filter(AnalyticsSearchQuery.organization_id == organization_id)

        perf = search_perf.first()

        return {
            "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            "top_queries": [
                {
                    "query": row.query_text,
                    "count": row.search_count,
                    "avg_results": round(row.avg_results, 1) if row.avg_results else 0,
                    "avg_duration_ms": round(row.avg_duration, 0) if row.avg_duration else None,
                }
                for row in top_queries.all()
            ],
            "zero_result_queries": [
                {"query": row.query_text, "count": row.count} for row in zero_result_queries.all()
            ],
            "performance": {
                "total_searches": perf.total or 0 if perf else 0,
                "avg_duration_ms": round(perf.avg_duration, 0) if perf and perf.avg_duration else None,
                "avg_results_per_search": round(perf.avg_results, 1) if perf and perf.avg_results else 0,
            },
        }

    # ==================== System Health ====================

    def get_system_health(
        self,
        db: Session,
        hours: int = 24,
    ) -> dict[str, Any]:
        """Get system health overview"""
        start_time = datetime.now() - timedelta(hours=hours)

        # Get latest health check per service
        latest_health = (
            db.query(AnalyticsSystemHealth)
            .filter(AnalyticsSystemHealth.timestamp >= start_time)
            .order_by(desc(AnalyticsSystemHealth.timestamp))
            .all()
        )

        # Group by service
        services: dict[str, dict] = {}
        for record in latest_health:
            if record.service_name not in services:
                services[record.service_name] = record.to_dict()

        # Get error summary
        error_summary = (
            db.query(
                AnalyticsErrorSummary.error_type,
                func.sum(AnalyticsErrorSummary.occurrence_count).label("count"),
            )
            .filter(
                and_(
                    AnalyticsErrorSummary.date >= date.today() - timedelta(days=1),
                    AnalyticsErrorSummary.resolved_at.is_(None),
                )
            )
            .group_by(AnalyticsErrorSummary.error_type)
            .order_by(desc(func.sum(AnalyticsErrorSummary.occurrence_count)))
            .limit(10)
            .all()
        )

        overall_status = "healthy"
        for service in services.values():
            if service.get("status") == "unhealthy":
                overall_status = "unhealthy"
                break
            elif service.get("status") == "degraded":
                overall_status = "degraded"

        return {
            "overall_status": overall_status,
            "services": services,
            "top_errors": [{"type": row.error_type, "count": row.count} for row in error_summary],
            "checked_at": datetime.now().isoformat(),
        }

    # ==================== Cost Analytics ====================

    def get_cost_breakdown(
        self,
        db: Session,
        organization_id: Optional[UUID] = None,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get cost breakdown by service"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        query = (
            db.query(
                AnalyticsCostTracking.service_type,
                func.sum(AnalyticsCostTracking.usage_units).label("usage"),
                func.min(AnalyticsCostTracking.usage_unit_type).label("unit_type"),
                func.sum(AnalyticsCostTracking.estimated_cost_cents).label("estimated"),
                func.sum(AnalyticsCostTracking.actual_cost_cents).label("actual"),
            )
            .filter(
                and_(
                    AnalyticsCostTracking.date >= start_date,
                    AnalyticsCostTracking.date <= end_date,
                )
            )
            .group_by(AnalyticsCostTracking.service_type)
            .order_by(desc(func.sum(AnalyticsCostTracking.estimated_cost_cents)))
        )

        if organization_id:
            query = query.filter(AnalyticsCostTracking.organization_id == organization_id)

        results = query.all()

        total_estimated = sum(r.estimated or 0 for r in results)
        total_actual = sum(r.actual or 0 for r in results if r.actual)

        # Daily cost trend
        daily_costs = (
            db.query(
                AnalyticsCostTracking.date,
                func.sum(AnalyticsCostTracking.estimated_cost_cents).label("cost"),
            )
            .filter(
                and_(
                    AnalyticsCostTracking.date >= start_date,
                    AnalyticsCostTracking.date <= end_date,
                )
            )
            .group_by(AnalyticsCostTracking.date)
            .order_by(AnalyticsCostTracking.date)
        )

        if organization_id:
            daily_costs = daily_costs.filter(AnalyticsCostTracking.organization_id == organization_id)

        return {
            "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            "by_service": [
                {
                    "service": row.service_type,
                    "usage": row.usage or 0,
                    "unit_type": row.unit_type,
                    "estimated_cost_cents": row.estimated or 0,
                    "estimated_cost_dollars": round((row.estimated or 0) / 100, 2),
                    "actual_cost_cents": row.actual,
                    "actual_cost_dollars": round(row.actual / 100, 2) if row.actual else None,
                }
                for row in results
            ],
            "totals": {
                "estimated_cents": total_estimated,
                "estimated_dollars": round(total_estimated / 100, 2),
                "actual_cents": total_actual,
                "actual_dollars": round(total_actual / 100, 2),
            },
            "daily_trend": [
                {"date": row.date.isoformat(), "cost_cents": row.cost or 0}
                for row in daily_costs.all()
            ],
        }

    # ==================== Data Collection Helpers ====================

    def record_api_call(
        self,
        db: Session,
        endpoint: str,
        duration_ms: float,
        success: bool,
        user_id: Optional[UUID] = None,
        organization_id: Optional[UUID] = None,
        tokens_used: int = 0,
        cost_cents: int = 0,
        endpoint_category: Optional[str] = None,
    ) -> None:
        """Record an API call for analytics"""
        today = date.today()

        # Update or create daily metrics
        metric = (
            db.query(AnalyticsDailyMetrics)
            .filter(
                and_(
                    AnalyticsDailyMetrics.date == today,
                    AnalyticsDailyMetrics.organization_id == organization_id,
                    AnalyticsDailyMetrics.metric_type == AnalyticsDailyMetrics.METRIC_API_CALLS,
                )
            )
            .first()
        )

        if not metric:
            metric = AnalyticsDailyMetrics(
                date=today,
                organization_id=organization_id,
                metric_type=AnalyticsDailyMetrics.METRIC_API_CALLS,
                breakdown={"by_endpoint": {}},
            )
            # Ensure counters are initialized for in-memory usage before flush
            metric.total_count = 0
            metric.success_count = 0
            metric.error_count = 0
            metric.total_tokens = 0
            metric.total_cost_cents = 0
            db.add(metric)

        metric.total_count += 1
        if success:
            metric.success_count += 1
        else:
            metric.error_count += 1

        if tokens_used:
            metric.total_tokens = (metric.total_tokens or 0) + tokens_used
        if cost_cents:
            metric.total_cost_cents = (metric.total_cost_cents or 0) + cost_cents

        # Update rolling average duration
        if metric.avg_duration_ms is None:
            metric.avg_duration_ms = duration_ms
        else:
            # Simple rolling average
            metric.avg_duration_ms = (metric.avg_duration_ms * (metric.total_count - 1) + duration_ms) / metric.total_count

        # Update endpoint breakdown
        if metric.breakdown is None:
            metric.breakdown = {"by_endpoint": {}}
        if "by_endpoint" not in metric.breakdown:
            metric.breakdown["by_endpoint"] = {}
        metric.breakdown["by_endpoint"][endpoint] = metric.breakdown["by_endpoint"].get(endpoint, 0) + 1

        db.commit()

        # Record Prometheus organization-level API usage metric
        try:
            org_label = str(organization_id) if organization_id else "none"
            category = endpoint_category
            if category is None:
                # Derive a coarse category from the endpoint path
                if endpoint.startswith("/api/voice") or endpoint.startswith("/voice"):
                    category = "voice"
                elif endpoint.startswith("/api/kb") or endpoint.startswith("/api/documents"):
                    category = "knowledge"
                elif endpoint.startswith("/api/admin"):
                    category = "admin"
                elif endpoint.startswith("/api/conversations") or endpoint.startswith("/conversations"):
                    category = "chat"
                else:
                    category = "other"

            organization_api_calls_total.labels(organization_id=org_label, endpoint_category=category).inc()
        except Exception:
            # Metrics recording must never break request handling or analytics writes
            pass

    def record_search(
        self,
        db: Session,
        query_text: str,
        search_type: str,
        results_count: int,
        duration_ms: int,
        user_id: Optional[UUID] = None,
        organization_id: Optional[UUID] = None,
        top_result_document_id: Optional[UUID] = None,
        top_result_score: Optional[float] = None,
    ) -> UUID:
        """Record a search query for analytics"""
        query_hash = hashlib.sha256(query_text.lower().strip().encode()).hexdigest()[:64]

        search_record = AnalyticsSearchQuery(
            organization_id=organization_id,
            user_id=user_id,
            query_text=query_text,
            query_hash=query_hash,
            search_type=search_type,
            results_count=results_count,
            search_duration_ms=duration_ms,
            top_result_document_id=top_result_document_id,
            top_result_score=top_result_score,
        )

        db.add(search_record)
        db.commit()
        db.refresh(search_record)

        return search_record.id

    def record_user_activity(
        self,
        db: Session,
        user_id: UUID,
        activity_type: str,
        organization_id: Optional[UUID] = None,
        **kwargs,
    ) -> None:
        """Record user activity for engagement tracking"""
        today = date.today()

        activity = (
            db.query(AnalyticsUserActivity)
            .filter(
                and_(
                    AnalyticsUserActivity.user_id == user_id,
                    AnalyticsUserActivity.date == today,
                )
            )
            .first()
        )

        if not activity:
            activity = AnalyticsUserActivity(
                user_id=user_id,
                organization_id=organization_id,
                date=today,
                first_activity_at=datetime.utcnow(),
            )
            # Initialize counters to zero for Python-side arithmetic
            activity.sessions_count = 0
            activity.messages_sent = 0
            activity.documents_viewed = 0
            activity.documents_uploaded = 0
            activity.voice_minutes = 0.0
            activity.flashcards_reviewed = 0
            activity.searches_performed = 0
            db.add(activity)

        activity.last_activity_at = datetime.utcnow()

        # Update specific counters based on activity type
        if activity_type == "session":
            activity.sessions_count += 1
        elif activity_type == "message":
            activity.messages_sent += kwargs.get("count", 1)
        elif activity_type == "document_view":
            activity.documents_viewed += 1
        elif activity_type == "document_upload":
            activity.documents_uploaded += 1
        elif activity_type == "voice":
            activity.voice_minutes += kwargs.get("minutes", 0)
        elif activity_type == "flashcard":
            activity.flashcards_reviewed += kwargs.get("count", 1)
        elif activity_type == "search":
            activity.searches_performed += 1

        # Track feature usage
        feature = kwargs.get("feature")
        if feature:
            if activity.features_used is None:
                activity.features_used = {}
            activity.features_used[feature] = True

        db.commit()

    def record_error(
        self,
        db: Session,
        error_type: str,
        error_message: str,
        endpoint: Optional[str] = None,
        error_code: Optional[str] = None,
        organization_id: Optional[UUID] = None,
        stack_trace_hash: Optional[str] = None,
        sample_request: Optional[dict] = None,
    ) -> None:
        """Record an error for tracking"""
        today = date.today()
        now = datetime.utcnow()

        # Check for existing error summary
        existing = (
            db.query(AnalyticsErrorSummary)
            .filter(
                and_(
                    AnalyticsErrorSummary.date == today,
                    AnalyticsErrorSummary.error_type == error_type,
                    AnalyticsErrorSummary.endpoint == endpoint,
                )
            )
            .first()
        )

        if existing:
            existing.occurrence_count += 1
            existing.last_seen = now
        else:
            error = AnalyticsErrorSummary(
                date=today,
                organization_id=organization_id,
                error_type=error_type,
                error_code=error_code,
                endpoint=endpoint,
                error_message=error_message[:500] if error_message else None,  # Truncate
                first_seen=now,
                last_seen=now,
                stack_trace_hash=stack_trace_hash,
                sample_request=sample_request,
            )
            db.add(error)

        db.commit()

    def record_cost(
        self,
        db: Session,
        service_type: str,
        usage_units: int,
        usage_unit_type: str,
        estimated_cost_cents: int,
        organization_id: Optional[UUID] = None,
        breakdown: Optional[dict] = None,
    ) -> None:
        """Record cost for tracking"""
        today = date.today()

        existing = (
            db.query(AnalyticsCostTracking)
            .filter(
                and_(
                    AnalyticsCostTracking.date == today,
                    AnalyticsCostTracking.organization_id == organization_id,
                    AnalyticsCostTracking.service_type == service_type,
                )
            )
            .first()
        )

        if existing:
            existing.usage_units += usage_units
            existing.estimated_cost_cents += estimated_cost_cents
            if breakdown:
                if existing.breakdown is None:
                    existing.breakdown = {}
                for key, value in breakdown.items():
                    existing.breakdown[key] = existing.breakdown.get(key, 0) + value
        else:
            cost_record = AnalyticsCostTracking(
                date=today,
                organization_id=organization_id,
                service_type=service_type,
                usage_units=usage_units,
                usage_unit_type=usage_unit_type,
                estimated_cost_cents=estimated_cost_cents,
                breakdown=breakdown,
            )
            db.add(cost_record)

        db.commit()


# Singleton instance
analytics_service = AnalyticsService()
