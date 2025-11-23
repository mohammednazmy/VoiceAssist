"""
Health check endpoints
"""
from fastapi import APIRouter, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional
import time
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import (
    check_postgres_connection,
    check_redis_connection,
    check_qdrant_connection,
    engine,
    redis_client,
)
from app.services.nextcloud import check_nextcloud_connection
from app.core.config import settings
from app.core.logging import get_logger


router = APIRouter()
logger = get_logger(__name__)
limiter = Limiter(key_func=get_remote_address)


class HealthResponse(BaseModel):
    """Health check response model"""
    status: str
    version: str
    timestamp: float


class ReadinessResponse(BaseModel):
    """Readiness check response model"""
    status: str
    checks: Dict[str, bool]
    timestamp: float


@router.get("/health", response_model=HealthResponse)
@limiter.limit("100/minute")
async def health_check(request: Request):
    """
    Basic health check endpoint
    Returns 200 if the service is running

    Rate limit: 100 requests per minute
    """
    logger.debug("health_check_requested")
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        timestamp=time.time(),
    )


@router.get("/ready", response_model=ReadinessResponse)
@limiter.limit("100/minute")
async def readiness_check(request: Request):
    """
    Readiness check endpoint
    Verifies connectivity to all dependencies (Postgres, Redis, Qdrant, Nextcloud)
    Returns 200 if all dependencies are accessible, 503 otherwise

    Rate limit: 100 requests per minute
    """
    logger.debug("readiness_check_requested")

    checks = {
        "postgres": check_postgres_connection(),
        "redis": check_redis_connection(),
        "qdrant": await check_qdrant_connection(),
        "nextcloud": await check_nextcloud_connection(),
    }

    all_ready = all(checks.values())
    response_status = status.HTTP_200_OK if all_ready else status.HTTP_503_SERVICE_UNAVAILABLE

    if not all_ready:
        logger.warning("readiness_check_failed", checks=checks)
    else:
        logger.debug("readiness_check_passed")

    return JSONResponse(
        status_code=response_status,
        content={
            "status": "ready" if all_ready else "not_ready",
            "checks": checks,
            "timestamp": time.time(),
        },
    )


# Metrics endpoint removed - now handled by app/api/metrics.py (Phase 7 - P2.1, P2.5, P3.3)
# Proper Prometheus metrics with business KPIs are available at /metrics


@router.get("/health/detailed")
@limiter.limit("50/minute")
async def detailed_health_check(request: Request):
    """
    Detailed health check endpoint
    Returns comprehensive health information about all components

    Rate limit: 50 requests per minute
    """
    logger.debug("detailed_health_check_requested")

    # Measure database latency
    start = time.time()
    postgres_healthy = check_postgres_connection()
    postgres_latency = (time.time() - start) * 1000

    # Measure Redis latency
    start = time.time()
    redis_healthy = check_redis_connection()
    redis_latency = (time.time() - start) * 1000

    # Get Redis memory usage
    try:
        redis_info = redis_client.info("memory")
        redis_memory_mb = int(redis_info.get("used_memory", 0)) / 1024 / 1024
    except Exception:
        redis_memory_mb = 0

    # Measure Qdrant latency
    start = time.time()
    qdrant_healthy = await check_qdrant_connection()
    qdrant_latency = (time.time() - start) * 1000

    # Get database pool stats
    pool_size = engine.pool.size()
    pool_checked_out = engine.pool.checkedout()

    # Calculate overall status
    all_healthy = postgres_healthy and redis_healthy and qdrant_healthy
    overall_status = "healthy" if all_healthy else "degraded"

    response = {
        "status": overall_status,
        "components": {
            "postgres": {
                "status": "up" if postgres_healthy else "down",
                "latency_ms": round(postgres_latency, 2),
                "connections": {
                    "active": pool_checked_out,
                    "pool_size": pool_size,
                    "pool_max": 20,
                    "max_overflow": 40,
                },
            },
            "redis": {
                "status": "up" if redis_healthy else "down",
                "latency_ms": round(redis_latency, 2),
                "memory_used_mb": round(redis_memory_mb, 2),
            },
            "qdrant": {
                "status": "up" if qdrant_healthy else "down",
                "latency_ms": round(qdrant_latency, 2),
            },
        },
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": time.time(),
    }

    logger.info("detailed_health_check_completed", status=overall_status, latencies={
        "postgres_ms": round(postgres_latency, 2),
        "redis_ms": round(redis_latency, 2),
        "qdrant_ms": round(qdrant_latency, 2),
    })

    response_status = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=response_status, content=response)


# Import Response for metrics endpoint
from fastapi import Response
