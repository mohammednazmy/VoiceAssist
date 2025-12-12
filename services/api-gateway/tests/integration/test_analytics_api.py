"""Integration tests for Analytics Dashboard API"""

from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from app.main import app
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
from fastapi.testclient import TestClient


class TestAnalyticsAPISmoke:
    """Smoke tests to verify analytics routes are registered"""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.mark.smoke
    def test_analytics_overview_route_exists(self, client):
        """Verify /api/admin/analytics/overview route is registered"""
        resp = client.get("/api/admin/analytics/overview")
        # Should return 401/403 for unauthenticated, not 404
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_usage_trends_route_exists(self, client):
        """Verify /api/admin/analytics/usage/trends route is registered"""
        resp = client.get("/api/admin/analytics/usage/trends")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_usage_comparison_route_exists(self, client):
        """Verify /api/admin/analytics/usage/comparison route is registered"""
        resp = client.get("/api/admin/analytics/usage/comparison")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_users_engagement_route_exists(self, client):
        """Verify /api/admin/analytics/users/engagement route is registered"""
        resp = client.get("/api/admin/analytics/users/engagement")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_users_top_route_exists(self, client):
        """Verify /api/admin/analytics/users/top route is registered"""
        resp = client.get("/api/admin/analytics/users/top")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_documents_insights_route_exists(self, client):
        """Verify /api/admin/analytics/documents/insights route is registered"""
        resp = client.get("/api/admin/analytics/documents/insights")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_search_insights_route_exists(self, client):
        """Verify /api/admin/analytics/search/insights route is registered"""
        resp = client.get("/api/admin/analytics/search/insights")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_system_health_route_exists(self, client):
        """Verify /api/admin/analytics/system/health route is registered"""
        resp = client.get("/api/admin/analytics/system/health")
        assert resp.status_code in (401, 403)

    @pytest.mark.smoke
    def test_analytics_costs_breakdown_route_exists(self, client):
        """Verify /api/admin/analytics/costs/breakdown route is registered"""
        resp = client.get("/api/admin/analytics/costs/breakdown")
        assert resp.status_code in (401, 403)


class TestAnalyticsModelsIntegration:
    """Tests for Analytics model operations"""

    def test_daily_metrics_success_rate_calculation(self):
        """Test success rate calculation in DailyMetrics"""
        metric = AnalyticsDailyMetrics(
            id=uuid4(),
            date=date.today(),
            metric_type="api_calls",
            total_count=100,
            success_count=95,
            error_count=5,
            avg_duration_ms=150.5,
        )
        result = metric.to_dict()

        assert result["success_rate"] == 95.0
        assert result["total_count"] == 100

    def test_daily_metrics_zero_total_success_rate(self):
        """Test success rate with zero total doesn't cause division error"""
        metric = AnalyticsDailyMetrics(
            id=uuid4(),
            date=date.today(),
            metric_type="api_calls",
            total_count=0,
            success_count=0,
            error_count=0,
        )
        result = metric.to_dict()

        # Should handle division by zero gracefully
        assert "success_rate" in result

    def test_hourly_metrics_structure(self):
        """Test HourlyMetrics to_dict structure"""
        metric = AnalyticsHourlyMetrics(
            id=uuid4(),
            timestamp=datetime.utcnow().replace(minute=0, second=0, microsecond=0),
            metric_type="voice_calls",
            total_count=50,
            unique_users=10,
            error_count=2,
            avg_duration_ms=2500.0,
        )
        result = metric.to_dict()

        assert result["total_count"] == 50
        assert result["metric_type"] == "voice_calls"
        assert "timestamp" in result

    def test_user_activity_to_dict_structure(self):
        """Test UserActivity to_dict has correct structure"""
        activity = AnalyticsUserActivity(
            id=uuid4(),
            user_id=uuid4(),
            date=date.today(),
            sessions_count=5,
            messages_sent=50,
            documents_viewed=10,
            voice_minutes=15.5,
            total_active_minutes=120.0,
            flashcards_reviewed=30,
            searches_performed=10,
        )
        result = activity.to_dict()

        assert result["sessions_count"] == 5
        assert result["messages_sent"] == 50
        assert result["voice_minutes"] == 15.5
        assert result["flashcards_reviewed"] == 30

    def test_search_query_to_dict_structure(self):
        """Test SearchQuery to_dict structure"""
        query = AnalyticsSearchQuery(
            id=uuid4(),
            query_text="cardiovascular assessment",
            query_hash="abc123",
            search_type="kb",
            results_count=15,
            search_duration_ms=250,
            clicked_results=3,
        )
        result = query.to_dict()

        assert result["query_text"] == "cardiovascular assessment"
        assert result["search_type"] == "kb"
        assert result["results_count"] == 15

    def test_search_query_zero_results(self):
        """Test SearchQuery with zero results"""
        query = AnalyticsSearchQuery(
            id=uuid4(),
            query_text="nonexistent term",
            query_hash="def456",
            search_type="kb",
            results_count=0,
            search_duration_ms=100,
        )
        result = query.to_dict()

        assert result["results_count"] == 0

    def test_error_summary_resolved_status(self):
        """Test ErrorSummary resolved status"""
        now = datetime.utcnow()
        error = AnalyticsErrorSummary(
            id=uuid4(),
            date=date.today(),
            error_type="ValidationError",
            error_message="Invalid input format",
            occurrence_count=15,
            first_seen=now - timedelta(hours=5),
            last_seen=now,
            resolved_at=now,
        )
        result = error.to_dict()

        assert result["is_resolved"] is True
        assert result["occurrence_count"] == 15

    def test_error_summary_unresolved_status(self):
        """Test ErrorSummary unresolved status"""
        now = datetime.utcnow()
        error = AnalyticsErrorSummary(
            id=uuid4(),
            date=date.today(),
            error_type="ConnectionError",
            error_message="Database connection failed",
            occurrence_count=5,
            first_seen=now - timedelta(hours=1),
            last_seen=now,
            resolved_at=None,
        )
        result = error.to_dict()

        assert result["is_resolved"] is False

    def test_cost_tracking_dollars_conversion(self):
        """Test CostTracking cents to dollars conversion"""
        cost = AnalyticsCostTracking(
            id=uuid4(),
            date=date.today(),
            service_type="openai",
            usage_units=10000,
            usage_unit_type="tokens",
            estimated_cost_cents=150,
        )
        result = cost.to_dict()

        assert result["estimated_cost_cents"] == 150
        assert result["estimated_cost_dollars"] == 1.50

    def test_cost_tracking_zero_cost(self):
        """Test CostTracking with zero cost"""
        cost = AnalyticsCostTracking(
            id=uuid4(),
            date=date.today(),
            service_type="local_tts",
            usage_units=100,
            usage_unit_type="requests",
            estimated_cost_cents=0,
        )
        result = cost.to_dict()

        assert result["estimated_cost_dollars"] == 0.0

    def test_system_health_healthy_status(self):
        """Test SystemHealth healthy status"""
        health = AnalyticsSystemHealth(
            id=uuid4(),
            timestamp=datetime.utcnow(),
            service_name="api-gateway",
            status="healthy",
            latency_p50_ms=50.0,
            cpu_percent=25.5,
            memory_percent=45.0,
        )
        result = health.to_dict()

        assert result["status"] == "healthy"
        assert result["service_name"] == "api-gateway"

    def test_system_health_degraded_status(self):
        """Test SystemHealth degraded status"""
        health = AnalyticsSystemHealth(
            id=uuid4(),
            timestamp=datetime.utcnow(),
            service_name="vector-db",
            status="degraded",
            latency_p95_ms=2500.0,
            error_rate_percent=15.0,
        )
        result = health.to_dict()

        assert result["status"] == "degraded"
        assert result["latency_p95_ms"] == 2500.0

    def test_document_stats_structure(self):
        """Test DocumentStats to_dict structure"""
        stats = AnalyticsDocumentStats(
            id=uuid4(),
            date=date.today(),
            document_id=uuid4(),
            views_count=100,
            citation_count=25,
            search_appearances=50,
            avg_relevance_score=0.85,
            helpful_votes=10,
            unhelpful_votes=2,
        )
        result = stats.to_dict()

        assert result["views_count"] == 100
        assert result["citation_count"] == 25
        assert result["avg_relevance_score"] == 0.85


# Database integration tests (require db fixture)
@pytest.mark.skip(reason="Requires database fixture")
class TestAnalyticsDBIntegration:
    """Database integration tests for analytics"""

    @pytest.mark.asyncio
    async def test_record_and_retrieve_api_metrics(self, db):
        """Test recording API call metrics and retrieving trends"""
        from app.services.analytics_service import AnalyticsService

        service = AnalyticsService()

        # Record several API calls
        for i in range(5):
            service.record_api_call(
                db=db,
                endpoint="/api/test",
                duration_ms=100 + i * 10,
                success=True,
                tokens_used=50,
            )

        service.record_api_call(
            db=db,
            endpoint="/api/test",
            duration_ms=500,
            success=False,
            error_type="ValidationError",
        )

        # Get trends
        trends = service.get_usage_trends(
            db=db, metric_type="api_calls", days=1, granularity="daily"
        )

        assert len(trends) > 0

    @pytest.mark.asyncio
    async def test_record_and_retrieve_user_activity(self, db):
        """Test recording user activity and retrieving engagement"""
        from app.services.analytics_service import AnalyticsService

        service = AnalyticsService()
        user_id = uuid4()

        # Record activity
        service.record_user_activity(
            db=db,
            user_id=user_id,
            activity_type="message",
            count=10,
        )

        service.record_user_activity(
            db=db,
            user_id=user_id,
            activity_type="voice_minute",
            count=5,
        )

        # Get engagement
        engagement = service.get_user_engagement(db=db, days=1)

        assert "total_active_users" in engagement

    @pytest.mark.asyncio
    async def test_record_and_retrieve_costs(self, db):
        """Test recording costs and retrieving breakdown"""
        from app.services.analytics_service import AnalyticsService

        service = AnalyticsService()

        # Record costs for different services
        service.record_cost(
            db=db,
            service_type="openai",
            usage_units=10000,
            usage_unit_type="tokens",
            estimated_cost_cents=100,
        )

        service.record_cost(
            db=db,
            service_type="elevenlabs",
            usage_units=5000,
            usage_unit_type="characters",
            estimated_cost_cents=50,
        )

        # Get cost breakdown
        breakdown = service.get_cost_breakdown(db=db, days=1)

        assert "by_service" in breakdown
        assert "totals" in breakdown

    @pytest.mark.asyncio
    async def test_error_tracking_and_resolution(self, db):
        """Test error recording and resolution"""
        from app.services.analytics_service import AnalyticsService

        service = AnalyticsService()

        # Record error
        service.record_error(
            db=db,
            error_type="ValidationError",
            error_message="Invalid input",
            endpoint="/api/test",
        )

        # Get system health
        health = service.get_system_health(db=db, hours=1)

        assert "top_errors" in health

    @pytest.mark.asyncio
    async def test_dashboard_overview_aggregation(self, db):
        """Test dashboard overview aggregates all metrics"""
        from app.services.analytics_service import AnalyticsService

        service = AnalyticsService()

        # Record various activities
        service.record_api_call(
            db=db,
            endpoint="/api/test",
            duration_ms=100,
            success=True,
            endpoint_category="other",
        )
        service.record_cost(
            db=db, service_type="openai", usage_units=1000, estimated_cost_cents=10
        )

        # Get overview
        overview = service.get_dashboard_overview(db=db, days=1)

        assert "period" in overview
        assert "metrics_by_type" in overview
        assert "total_cost_cents" in overview
        assert "total_cost_dollars" in overview
