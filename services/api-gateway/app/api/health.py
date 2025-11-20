"""
Health check endpoints
"""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict
import time

from app.core.database import (
    check_postgres_connection,
    check_redis_connection,
    check_qdrant_connection,
)
from app.core.config import settings


router = APIRouter()


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
async def health_check():
    """
    Basic health check endpoint
    Returns 200 if the service is running
    """
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        timestamp=time.time(),
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check():
    """
    Readiness check endpoint
    Verifies connectivity to all dependencies (Postgres, Redis, Qdrant)
    Returns 200 if all dependencies are accessible, 503 otherwise
    """
    checks = {
        "postgres": check_postgres_connection(),
        "redis": check_redis_connection(),
        "qdrant": check_qdrant_connection(),
    }

    all_ready = all(checks.values())
    response_status = status.HTTP_200_OK if all_ready else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=response_status,
        content={
            "status": "ready" if all_ready else "not_ready",
            "checks": checks,
            "timestamp": time.time(),
        },
    )


@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint
    Returns basic metrics in Prometheus format
    """
    # Basic metrics for now - will be expanded in Phase 8 (Observability)
    metrics_text = f"""# HELP voiceassist_up Service uptime
# TYPE voiceassist_up gauge
voiceassist_up 1

# HELP voiceassist_info Service information
# TYPE voiceassist_info gauge
voiceassist_info{{version="{settings.APP_VERSION}",environment="{settings.ENVIRONMENT}"}} 1
"""
    return Response(content=metrics_text, media_type="text/plain")


# Import Response for metrics endpoint
from fastapi import Response
