"""Tests for analytics service"""

from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from app.models.analytics import (
    AnalyticsCostTracking,
    AnalyticsDailyMetrics,
    AnalyticsErrorSummary,
    AnalyticsSearchQuery,
    AnalyticsUserActivity,
)
from app.services.analytics_service import AnalyticsService


class TestAnalyticsService:
    """Test suite for AnalyticsService"""

    @pytest.fixture
    def service(self):
        """Create analytics service instance"""
        return AnalyticsService()

    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return MagicMock()

    # ==================== Dashboard Overview Tests ====================

    def test_get_dashboard_overview_returns_structure(self, service, mock_db):
        """Test dashboard overview returns correct structure"""
        # Mock query results
        mock_db.query.return_value.filter.return_value.group_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.scalar.return_value = 0

        result = service.get_dashboard_overview(mock_db, days=30)

        assert "period" in result
        assert "metrics_by_type" in result
        assert "daily_active_users" in result
        assert "unresolved_errors" in result
        assert "total_cost_cents" in result
        assert "total_cost_dollars" in result

    def test_get_dashboard_overview_with_organization(self, service, mock_db):
        """Test dashboard overview filters by organization"""
        org_id = uuid4()
        mock_db.query.return_value.filter.return_value.group_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.scalar.return_value = 0

        result = service.get_dashboard_overview(mock_db, organization_id=org_id, days=30)

        assert result is not None

    # ==================== Usage Trends Tests ====================

    def test_get_usage_trends_daily(self, service, mock_db):
        """Test daily usage trends"""
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

        result = service.get_usage_trends(
            mock_db, metric_type="api_calls", days=30, granularity="daily"
        )

        assert isinstance(result, list)

    def test_get_usage_trends_hourly(self, service, mock_db):
        """Test hourly usage trends"""
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

        result = service.get_usage_trends(
            mock_db, metric_type="api_calls", days=7, granularity="hourly"
        )

        assert isinstance(result, list)

    # ==================== Metric Comparison Tests ====================

    def test_get_metric_comparison_structure(self, service, mock_db):
        """Test metric comparison returns correct structure"""
        mock_result = MagicMock()
        mock_result.total = 100
        mock_result.success = 95
        mock_result.errors = 5
        mock_result.avg_duration = 150.5
        mock_db.query.return_value.filter.return_value.first.return_value = mock_result

        result = service.get_metric_comparison(mock_db, metric_type="api_calls", days=30)

        assert "current_period" in result
        assert "previous_period" in result
        assert "changes" in result

    def test_get_metric_comparison_calculates_change(self, service, mock_db):
        """Test metric comparison calculates percentage changes"""
        mock_current = MagicMock()
        mock_current.total = 200
        mock_current.success = 190
        mock_current.errors = 10
        mock_current.avg_duration = 100.0

        mock_previous = MagicMock()
        mock_previous.total = 100
        mock_previous.success = 95
        mock_previous.errors = 5
        mock_previous.avg_duration = 120.0

        # get_metric_comparison performs two chained .filter() calls before .first()
        mock_db.query.return_value.filter.return_value.filter.return_value.first.side_effect = [
            mock_current,
            mock_previous,
        ]

        result = service.get_metric_comparison(mock_db, metric_type="api_calls", days=30)

        assert result["changes"]["total_change_percent"] == 100.0  # 200 vs 100

    # ==================== User Engagement Tests ====================

    def test_get_user_engagement_structure(self, service, mock_db):
        """Test user engagement returns correct structure"""
        mock_result = MagicMock()
        mock_result.total_users = 50
        mock_result.total_sessions = 200
        mock_result.total_messages = 1000
        mock_result.avg_active_minutes = 45.5
        mock_result.total_voice_minutes = 120.0
        mock_result.total_flashcards = 500
        mock_result.total_searches = 300
        mock_db.query.return_value.filter.return_value.first.return_value = mock_result
        mock_db.query.return_value.filter.return_value.all.return_value = []

        result = service.get_user_engagement(mock_db, days=30)

        assert "total_active_users" in result
        assert "total_sessions" in result
        assert "total_messages" in result
        assert "feature_adoption" in result

    def test_get_top_users_default_sort(self, service, mock_db):
        """Test top users with default sort"""
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = []

        result = service.get_top_users(mock_db, days=30, limit=10)

        assert isinstance(result, list)

    # ==================== Document Analytics Tests ====================

    def test_get_document_insights_structure(self, service, mock_db):
        """Test document insights returns correct structure"""
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = []

        result = service.get_document_insights(mock_db, days=30)

        assert "period" in result
        assert "top_viewed" in result
        assert "top_cited" in result

    # ==================== Search Analytics Tests ====================

    def test_get_search_insights_structure(self, service, mock_db):
        """Test search insights returns correct structure"""
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = []
        mock_perf = MagicMock()
        mock_perf.total = 1000
        mock_perf.avg_duration = 250.0
        mock_perf.avg_results = 5.5
        mock_db.query.return_value.filter.return_value.first.return_value = mock_perf

        result = service.get_search_insights(mock_db, days=30)

        assert "top_queries" in result
        assert "zero_result_queries" in result
        assert "performance" in result

    # ==================== System Health Tests ====================

    def test_get_system_health_structure(self, service, mock_db):
        """Test system health returns correct structure"""
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = []

        result = service.get_system_health(mock_db, hours=24)

        assert "overall_status" in result
        assert "services" in result
        assert "top_errors" in result

    # ==================== Cost Analytics Tests ====================

    def test_get_cost_breakdown_structure(self, service, mock_db):
        """Test cost breakdown returns correct structure"""
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.group_by.return_value.order_by.return_value.all.return_value = []

        result = service.get_cost_breakdown(mock_db, days=30)

        assert "period" in result
        assert "by_service" in result
        assert "totals" in result
        assert "daily_trend" in result

    # ==================== Data Recording Tests ====================

    def test_record_api_call_creates_metric(self, service, mock_db):
        """Test recording API call creates or updates metric"""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service.record_api_call(
            mock_db,
            endpoint="/api/test",
            duration_ms=150.0,
            success=True,
            tokens_used=100,
            endpoint_category="other",
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_record_api_call_updates_existing(self, service, mock_db):
        """Test recording API call updates existing metric"""
        existing_metric = MagicMock()
        existing_metric.total_count = 10
        existing_metric.success_count = 9
        existing_metric.error_count = 1
        existing_metric.total_tokens = 500
        existing_metric.avg_duration_ms = 100.0
        existing_metric.breakdown = {"by_endpoint": {}}
        mock_db.query.return_value.filter.return_value.first.return_value = existing_metric

        service.record_api_call(
            mock_db,
            endpoint="/api/test",
            duration_ms=150.0,
            success=True,
            tokens_used=100,
            endpoint_category="other",
        )

        assert existing_metric.total_count == 11
        assert existing_metric.success_count == 10
        mock_db.commit.assert_called_once()

    def test_record_search_creates_record(self, service, mock_db):
        """Test recording search creates search record"""
        service.record_search(
            mock_db,
            query_text="test query",
            search_type="kb",
            results_count=10,
            duration_ms=250,
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_record_user_activity_creates_record(self, service, mock_db):
        """Test recording user activity creates record"""
        user_id = uuid4()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service.record_user_activity(
            mock_db,
            user_id=user_id,
            activity_type="message",
            count=5,
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_record_error_creates_summary(self, service, mock_db):
        """Test recording error creates error summary"""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service.record_error(
            mock_db,
            error_type="ValidationError",
            error_message="Invalid input",
            endpoint="/api/test",
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_record_cost_creates_record(self, service, mock_db):
        """Test recording cost creates cost record"""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service.record_cost(
            mock_db,
            service_type="openai",
            usage_units=1000,
            usage_unit_type="tokens",
            estimated_cost_cents=10,
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()


class TestAnalyticsModels:
    """Test analytics model methods"""

    def test_daily_metrics_to_dict(self):
        """Test DailyMetrics to_dict conversion"""
        metric = AnalyticsDailyMetrics(
            date=date.today(),
            metric_type="api_calls",
            total_count=100,
            success_count=95,
            error_count=5,
            avg_duration_ms=150.5,
        )

        result = metric.to_dict()

        assert result["total_count"] == 100
        assert result["success_count"] == 95
        assert result["success_rate"] == 95.0
        assert result["avg_duration_ms"] == 150.5

    def test_user_activity_to_dict(self):
        """Test UserActivity to_dict conversion"""
        activity = AnalyticsUserActivity(
            user_id=uuid4(),
            date=date.today(),
            sessions_count=5,
            messages_sent=50,
            voice_minutes=15.5,
        )

        result = activity.to_dict()

        assert result["sessions_count"] == 5
        assert result["messages_sent"] == 50
        assert result["voice_minutes"] == 15.5

    def test_search_query_to_dict(self):
        """Test SearchQuery to_dict conversion"""
        query = AnalyticsSearchQuery(
            query_text="test query",
            query_hash="abc123",
            search_type="kb",
            results_count=10,
            search_duration_ms=250,
        )

        result = query.to_dict()

        assert result["query_text"] == "test query"
        assert result["search_type"] == "kb"
        assert result["results_count"] == 10

    def test_error_summary_to_dict(self):
        """Test ErrorSummary to_dict conversion"""
        now = datetime.utcnow()
        error = AnalyticsErrorSummary(
            date=date.today(),
            error_type="ValidationError",
            error_message="Invalid input",
            occurrence_count=10,
            first_seen=now,
            last_seen=now,
        )

        result = error.to_dict()

        assert result["error_type"] == "ValidationError"
        assert result["occurrence_count"] == 10
        assert result["is_resolved"] is False

    def test_cost_tracking_to_dict(self):
        """Test CostTracking to_dict conversion"""
        cost = AnalyticsCostTracking(
            date=date.today(),
            service_type="openai",
            usage_units=1000,
            usage_unit_type="tokens",
            estimated_cost_cents=100,
        )

        result = cost.to_dict()

        assert result["service_type"] == "openai"
        assert result["usage_units"] == 1000
        assert result["estimated_cost_dollars"] == 1.0
