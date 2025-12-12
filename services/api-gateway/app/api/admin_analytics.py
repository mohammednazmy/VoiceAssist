"""Admin Analytics Dashboard API endpoints"""

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.core.logging import get_logger
from app.models.user import User
from app.services.analytics_service import analytics_service
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin/analytics", tags=["admin-analytics"])


# ==================== Request/Response Models ====================


class DateRangeParams(BaseModel):
    """Common date range parameters"""

    days: int = Field(default=30, ge=1, le=365, description="Number of days to include")
    organization_id: Optional[UUID] = Field(default=None, description="Filter by organization")


class DashboardOverviewResponse(BaseModel):
    """Dashboard overview response"""

    period: dict[str, Any]
    metrics_by_type: dict[str, Any]
    daily_active_users: list[dict[str, Any]]
    unresolved_errors: int
    total_cost_cents: int
    total_cost_dollars: float


class UsageTrendResponse(BaseModel):
    """Usage trend response"""

    metric_type: str
    granularity: str
    data: list[dict[str, Any]]


class MetricComparisonResponse(BaseModel):
    """Metric comparison response"""

    metric_type: str
    current_period: dict[str, Any]
    previous_period: dict[str, Any]
    changes: dict[str, Any]


class UserEngagementResponse(BaseModel):
    """User engagement response"""

    period: dict[str, Any]
    total_active_users: int
    total_sessions: int
    total_messages: int
    avg_active_minutes_per_user: float
    total_voice_minutes: float
    total_flashcards_reviewed: int
    total_searches: int
    feature_adoption: dict[str, int]


class SystemHealthResponse(BaseModel):
    """System health response"""

    overall_status: str
    services: dict[str, Any]
    top_errors: list[dict[str, Any]]
    checked_at: str


class CostBreakdownResponse(BaseModel):
    """Cost breakdown response"""

    period: dict[str, Any]
    by_service: list[dict[str, Any]]
    totals: dict[str, Any]
    daily_trend: list[dict[str, Any]]


# ==================== Dashboard Overview ====================


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    days: int = Query(default=30, ge=1, le=365),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get high-level dashboard overview with key metrics.

    Includes:
    - Metrics totals by type (API calls, sessions, documents, etc.)
    - Daily active user counts
    - Unresolved error count
    - Total estimated costs
    """
    logger.info(
        "admin_analytics_overview_requested",
        user_id=str(current_user.id),
        days=days,
        organization_id=str(organization_id) if organization_id else None,
    )

    return analytics_service.get_dashboard_overview(
        db=db,
        organization_id=organization_id,
        days=days,
    )


# ==================== Usage Metrics ====================


@router.get("/usage/trends")
async def get_usage_trends(
    metric_type: str = Query(..., description="Type of metric: api_calls, sessions, documents, voice, search, chat, knowledge_base, learning"),
    days: int = Query(default=30, ge=1, le=90),
    granularity: str = Query(default="daily", pattern="^(daily|hourly)$"),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get usage trends over time for a specific metric type.

    Supports daily and hourly granularity.
    """
    logger.info(
        "admin_analytics_trends_requested",
        user_id=str(current_user.id),
        metric_type=metric_type,
        days=days,
        granularity=granularity,
    )

    data = analytics_service.get_usage_trends(
        db=db,
        metric_type=metric_type,
        organization_id=organization_id,
        days=days,
        granularity=granularity,
    )

    return {
        "metric_type": metric_type,
        "granularity": granularity,
        "data": data,
    }


@router.get("/usage/comparison")
async def get_metric_comparison(
    metric_type: str = Query(..., description="Type of metric to compare"),
    days: int = Query(default=30, ge=1, le=90),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Compare current period metrics with the previous period.

    Useful for identifying trends and improvements.
    """
    comparison = analytics_service.get_metric_comparison(
        db=db,
        metric_type=metric_type,
        organization_id=organization_id,
        days=days,
    )

    return {
        "metric_type": metric_type,
        **comparison,
    }


# ==================== User Analytics ====================


@router.get("/users/engagement", response_model=UserEngagementResponse)
async def get_user_engagement(
    days: int = Query(default=30, ge=1, le=365),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get user engagement metrics.

    Includes:
    - Total active users
    - Session and message counts
    - Voice and flashcard usage
    - Feature adoption rates
    """
    logger.info(
        "admin_analytics_engagement_requested",
        user_id=str(current_user.id),
        days=days,
    )

    return analytics_service.get_user_engagement(
        db=db,
        organization_id=organization_id,
        days=days,
    )


@router.get("/users/top")
async def get_top_users(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=10, ge=1, le=100),
    sort_by: str = Query(default="messages_sent", pattern="^(sessions_count|messages_sent|total_active_minutes|flashcards_reviewed)$"),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get top users by activity.

    Can sort by sessions, messages, active time, or flashcards.
    """
    users = analytics_service.get_top_users(
        db=db,
        organization_id=organization_id,
        days=days,
        limit=limit,
        sort_by=sort_by,
    )

    return {
        "period_days": days,
        "sort_by": sort_by,
        "users": users,
    }


@router.get("/users/retention")
async def get_user_retention(
    cohort_days: int = Query(default=7, ge=1, le=30, description="Days to define a cohort"),
    weeks: int = Query(default=8, ge=1, le=52, description="Number of weeks to analyze"),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get user retention cohort analysis.

    Shows how many users return after their first visit.
    """
    # TODO: Implement cohort analysis
    # This requires tracking first_seen_at for users

    return {
        "message": "Retention analysis coming soon",
        "cohort_days": cohort_days,
        "weeks": weeks,
    }


# ==================== Document Analytics ====================


@router.get("/documents/insights")
async def get_document_insights(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get document usage insights.

    Includes:
    - Top viewed documents
    - Most cited documents
    - Document quality metrics
    """
    logger.info(
        "admin_analytics_documents_requested",
        user_id=str(current_user.id),
        days=days,
    )

    return analytics_service.get_document_insights(
        db=db,
        organization_id=organization_id,
        days=days,
        limit=limit,
    )


# ==================== Search Analytics ====================


@router.get("/search/insights")
async def get_search_insights(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get search analytics and insights.

    Includes:
    - Top search queries
    - Zero-result queries (content gaps)
    - Search performance metrics
    """
    logger.info(
        "admin_analytics_search_requested",
        user_id=str(current_user.id),
        days=days,
    )

    return analytics_service.get_search_insights(
        db=db,
        organization_id=organization_id,
        days=days,
        limit=limit,
    )


# ==================== System Health ====================


@router.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get system health overview.

    Includes:
    - Service status
    - Performance metrics
    - Top errors
    """
    logger.info(
        "admin_analytics_health_requested",
        user_id=str(current_user.id),
        hours=hours,
    )

    return analytics_service.get_system_health(db=db, hours=hours)


@router.get("/system/errors")
async def get_error_details(
    days: int = Query(default=7, ge=1, le=30),
    error_type: Optional[str] = Query(default=None),
    resolved: Optional[bool] = Query(default=None),
    organization_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get detailed error information for debugging.
    """
    from app.models.analytics import AnalyticsErrorSummary
    from sqlalchemy import and_, desc

    end_date = date.today()
    start_date = end_date - datetime.timedelta(days=days) if hasattr(datetime, 'timedelta') else date.today()

    # Import timedelta properly
    from datetime import timedelta
    start_date = end_date - timedelta(days=days)

    query = (
        db.query(AnalyticsErrorSummary)
        .filter(
            and_(
                AnalyticsErrorSummary.date >= start_date,
                AnalyticsErrorSummary.date <= end_date,
            )
        )
        .order_by(desc(AnalyticsErrorSummary.occurrence_count))
        .limit(limit)
    )

    if error_type:
        query = query.filter(AnalyticsErrorSummary.error_type == error_type)
    if resolved is not None:
        if resolved:
            query = query.filter(AnalyticsErrorSummary.resolved_at.isnot(None))
        else:
            query = query.filter(AnalyticsErrorSummary.resolved_at.is_(None))
    if organization_id:
        query = query.filter(AnalyticsErrorSummary.organization_id == organization_id)

    errors = query.all()

    return {
        "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "total": len(errors),
        "errors": [e.to_dict() for e in errors],
    }


@router.post("/system/errors/{error_id}/resolve")
async def resolve_error(
    error_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Mark an error as resolved."""
    from app.models.analytics import AnalyticsErrorSummary

    error = db.query(AnalyticsErrorSummary).filter(AnalyticsErrorSummary.id == error_id).first()

    if not error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error not found")

    error.resolved_at = datetime.utcnow()
    db.commit()

    logger.info(
        "error_resolved",
        error_id=str(error_id),
        user_id=str(current_user.id),
    )

    return {"status": "resolved", "error_id": str(error_id)}


# ==================== Cost Analytics ====================


@router.get("/costs/breakdown", response_model=CostBreakdownResponse)
async def get_cost_breakdown(
    days: int = Query(default=30, ge=1, le=365),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get cost breakdown by service.

    Includes:
    - Costs by service type (OpenAI, Azure, etc.)
    - Daily cost trend
    - Estimated vs actual costs
    """
    logger.info(
        "admin_analytics_costs_requested",
        user_id=str(current_user.id),
        days=days,
    )

    return analytics_service.get_cost_breakdown(
        db=db,
        organization_id=organization_id,
        days=days,
    )


@router.get("/costs/forecast")
async def get_cost_forecast(
    days: int = Query(default=30, ge=7, le=90, description="Days of historical data to use"),
    forecast_days: int = Query(default=30, ge=7, le=90, description="Days to forecast"),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get cost forecast based on historical trends.

    Uses simple linear regression on historical data.
    """
    from datetime import timedelta

    from app.models.analytics import AnalyticsCostTracking
    from sqlalchemy import and_, func

    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    # Get historical daily costs
    query = (
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
        query = query.filter(AnalyticsCostTracking.organization_id == organization_id)

    historical = query.all()

    if len(historical) < 7:
        return {
            "error": "Insufficient data for forecast",
            "message": "Need at least 7 days of cost data",
        }

    # Simple linear regression
    costs = [row.cost or 0 for row in historical]
    n = len(costs)
    x_mean = (n - 1) / 2
    y_mean = sum(costs) / n

    numerator = sum((i - x_mean) * (costs[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2 for i in range(n))

    slope = numerator / denominator if denominator != 0 else 0
    intercept = y_mean - slope * x_mean

    # Generate forecast
    forecast = []
    for i in range(forecast_days):
        forecast_date = end_date + timedelta(days=i + 1)
        forecast_cost = max(0, intercept + slope * (n + i))  # Don't allow negative
        forecast.append({
            "date": forecast_date.isoformat(),
            "estimated_cost_cents": int(forecast_cost),
            "estimated_cost_dollars": round(forecast_cost / 100, 2),
        })

    total_forecast = sum(f["estimated_cost_cents"] for f in forecast)

    return {
        "historical_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "forecast_period": {"days": forecast_days},
        "forecast": forecast,
        "total_forecast_cents": total_forecast,
        "total_forecast_dollars": round(total_forecast / 100, 2),
        "daily_average_forecast_cents": int(total_forecast / forecast_days),
    }


# ==================== Export ====================


@router.get("/export")
async def export_analytics(
    report_type: str = Query(..., pattern="^(overview|usage|users|documents|search|costs)$"),
    format: str = Query(default="json", pattern="^(json|csv)$"),
    days: int = Query(default=30, ge=1, le=365),
    organization_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Export analytics data for external analysis.

    Supports JSON and CSV formats.
    """
    logger.info(
        "admin_analytics_export_requested",
        user_id=str(current_user.id),
        report_type=report_type,
        format=format,
    )

    # Get the appropriate data
    if report_type == "overview":
        data = analytics_service.get_dashboard_overview(db, organization_id, days)
    elif report_type == "usage":
        data = analytics_service.get_usage_trends(db, "api_calls", organization_id, days)
    elif report_type == "users":
        data = analytics_service.get_user_engagement(db, organization_id, days)
    elif report_type == "documents":
        data = analytics_service.get_document_insights(db, organization_id, days)
    elif report_type == "search":
        data = analytics_service.get_search_insights(db, organization_id, days)
    elif report_type == "costs":
        data = analytics_service.get_cost_breakdown(db, organization_id, days)
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")

    if format == "csv":
        # Convert to CSV format
        import csv
        import io

        output = io.StringIO()
        if isinstance(data, list):
            if data:
                writer = csv.DictWriter(output, fieldnames=data[0].keys())
                writer.writeheader()
                writer.writerows(data)
        elif isinstance(data, dict):
            # Flatten dict for CSV
            flat_data = []
            for key, value in data.items():
                if isinstance(value, list):
                    for item in value:
                        flat_data.append({"category": key, **item} if isinstance(item, dict) else {"category": key, "value": item})
                elif isinstance(value, dict):
                    flat_data.append({"category": key, **value})
                else:
                    flat_data.append({"category": key, "value": value})

            if flat_data:
                writer = csv.DictWriter(output, fieldnames=flat_data[0].keys())
                writer.writeheader()
                writer.writerows(flat_data)

        from fastapi.responses import StreamingResponse

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=analytics_{report_type}_{date.today().isoformat()}.csv"},
        )

    return {
        "report_type": report_type,
        "generated_at": datetime.utcnow().isoformat(),
        "data": data,
    }
