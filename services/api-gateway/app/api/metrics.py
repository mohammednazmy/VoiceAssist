"""Prometheus Metrics Endpoint (Phase 7 Integration Improvements - P2.1, P2.5, P3.3).

Exposes Prometheus metrics for monitoring and alerting.

Metrics include:
- Cache hit/miss rates
- RAG query performance
- HTTP request latency
- Database connection pools (P2.5)
- External API performance
- Business metrics (P3.3)
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Response, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.database import get_db_pool_stats, get_redis_pool_stats, get_db
from app.core.metrics import (
    db_pool_size,
    db_pool_checked_out,
    db_pool_checked_in,
    db_pool_overflow,
    db_pool_utilization_percent,
    redis_pool_max_connections,
    redis_pool_in_use,
    redis_pool_available,
)
from app.core.business_metrics import (
    active_users_daily,
    active_users_monthly,
    kb_documents_total,
    system_uptime_seconds,
    version_info,
)
from app.models.user import User
import time

router = APIRouter(prefix="/metrics", tags=["observability"])

# Track application start time for uptime calculation
_app_start_time = time.time()


@router.get("", response_class=Response)
async def prometheus_metrics(db: Session = Depends(get_db)):
    """
    Expose Prometheus metrics in text format.

    This endpoint is scraped by Prometheus server for monitoring.
    No authentication required (should be secured at infrastructure level).

    Before generating metrics, updates:
    - Connection pool statistics (P2.5)
    - Business metrics (P3.3): DAU, MAU, system uptime

    Returns:
        Prometheus-formatted metrics
    """
    # Update connection pool metrics (P2.5)
    try:
        # PostgreSQL pool stats
        db_stats = get_db_pool_stats()
        db_pool_size.set(db_stats["size"])
        db_pool_checked_out.set(db_stats["checked_out"])
        db_pool_checked_in.set(db_stats["checked_in"])
        db_pool_overflow.set(db_stats["overflow"])
        db_pool_utilization_percent.set(db_stats["utilization_percent"])

        # Redis pool stats
        redis_stats = get_redis_pool_stats()
        redis_pool_max_connections.set(redis_stats["max_connections"])
        redis_pool_in_use.set(redis_stats["in_use_connections"])
        redis_pool_available.set(redis_stats["available_connections"])
    except Exception:
        # If pool stats collection fails, continue with other metrics
        pass

    # Update business metrics (P3.3)
    try:
        # Calculate Daily Active Users (users who logged in today)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        dau_count = db.query(func.count(distinct(User.id))).filter(
            User.last_login >= today_start
        ).scalar() or 0
        active_users_daily.set(dau_count)

        # Calculate Monthly Active Users (users who logged in this month)
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mau_count = db.query(func.count(distinct(User.id))).filter(
            User.last_login >= month_start
        ).scalar() or 0
        active_users_monthly.set(mau_count)

        # System uptime in seconds
        uptime = time.time() - _app_start_time
        system_uptime_seconds.set(uptime)

        # Version info
        version_info.info({
            "version": "0.1.0",
            "environment": "development"
        })

        # Knowledge base metrics (placeholder for now - will be populated by upload endpoint)
        # kb_documents_total and kb_chunks_total are already tracked in admin_kb.py

    except Exception as e:
        # If business metrics collection fails, continue with other metrics
        pass

    metrics_data = generate_latest()
    return Response(content=metrics_data, media_type=CONTENT_TYPE_LATEST)
