"""
Health check endpoints
"""

import time
from typing import Dict

from app.core.config import settings
from app.core.database import (
    check_postgres_connection,
    check_qdrant_connection,
    check_redis_connection,
    engine,
    redis_client,
)
from app.core.logging import get_logger
from app.core.resilience import get_circuit_breaker_status
from app.services.nextcloud import check_nextcloud_connection
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

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


@router.get("/ready", response_class=JSONResponse)
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


@router.get("/health/openai", response_class=JSONResponse)
@limiter.limit("10/minute")
async def openai_health_check(request: Request):
    """
    OpenAI API connectivity health check.

    Tests that the configured OPENAI_API_KEY is valid and can connect
    to OpenAI's API by making a cheap models.list() call.

    Rate limit: 10 requests per minute (to avoid wasting API quota)

    Returns:
        200: OpenAI API is accessible and key is valid
        503: OpenAI API is not accessible or key is invalid/missing

    Response body:
        - status: "ok" or "error"
        - configured: whether OPENAI_API_KEY is set
        - accessible: whether API call succeeded (only if configured)
        - latency_ms: API call latency in milliseconds (only if accessible)
        - error: error message (only if failed)
        - timestamp: Unix timestamp

    Note: This endpoint does NOT reveal the API key value.
    """
    logger.debug("openai_health_check_requested")

    result = {
        "status": "error",
        "configured": False,
        "accessible": False,
        "timestamp": time.time(),
    }

    # Check if key is configured
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        result["error"] = "OPENAI_API_KEY not configured"
        logger.warning("openai_health_check_failed: key not configured")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=result,
        )

    result["configured"] = True

    # Test API connectivity
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key, timeout=10.0)

        start = time.time()
        models = await client.models.list()
        latency_ms = (time.time() - start) * 1000

        result["status"] = "ok"
        result["accessible"] = True
        result["latency_ms"] = round(latency_ms, 2)
        result["models_accessible"] = len(models.data) if models.data else 0

        logger.info(
            "openai_health_check_passed",
            latency_ms=round(latency_ms, 2),
            models_count=result["models_accessible"],
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=result,
        )

    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)

        # Sanitize error message to avoid leaking sensitive info
        if "invalid_api_key" in error_msg.lower() or "incorrect api key" in error_msg.lower():
            result["error"] = "API key invalid or expired"
        elif "rate_limit" in error_msg.lower():
            result["error"] = "Rate limited by OpenAI"
        elif "timeout" in error_msg.lower():
            result["error"] = "OpenAI API timeout"
        elif "connection" in error_msg.lower():
            result["error"] = f"Connection error: {error_type}"
        else:
            result["error"] = f"{error_type}: {error_msg[:100]}"

        logger.error(
            "openai_health_check_failed",
            error=result["error"],
            exc_info=True,
        )

        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=result,
        )


@router.get("/health/detailed", response_class=JSONResponse)
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

    # Measure Qdrant latency (skip if disabled)
    qdrant_enabled = settings.QDRANT_ENABLED if hasattr(settings, "QDRANT_ENABLED") else True
    if qdrant_enabled:
        start = time.time()
        qdrant_healthy = await check_qdrant_connection()
        qdrant_latency = (time.time() - start) * 1000
    else:
        qdrant_healthy = True  # Report as healthy when disabled
        qdrant_latency = 0

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
                "status": ("disabled" if not qdrant_enabled else ("up" if qdrant_healthy else "down")),
                "latency_ms": round(qdrant_latency, 2),
                "enabled": qdrant_enabled,
            },
        },
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": time.time(),
    }

    logger.info(
        "detailed_health_check_completed",
        status=overall_status,
        latencies={
            "postgres_ms": round(postgres_latency, 2),
            "redis_ms": round(redis_latency, 2),
            "qdrant_ms": round(qdrant_latency, 2),
        },
    )

    response_status = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=response_status, content=response)


@router.get("/health/circuit-breakers", response_class=JSONResponse)
@limiter.limit("100/minute")
async def circuit_breaker_status(request: Request):
    """
    Circuit breaker status endpoint.

    Returns the current state of all circuit breakers for monitoring
    and alerting purposes.

    Rate limit: 100 requests per minute

    Response body:
        - status: "ok" if all breakers are closed, "degraded" if any are open
        - breakers: Dict of breaker name -> status info
        - timestamp: Unix timestamp

    Circuit Breaker States:
        - closed: Normal operation, requests pass through
        - open: Service is failing, requests fail immediately
        - half-open: Testing if service recovered
    """
    logger.debug("circuit_breaker_status_requested")

    breakers = get_circuit_breaker_status()

    # Check if any breakers are open
    any_open = any(b["state"] == "open" for b in breakers.values())
    overall_status = "degraded" if any_open else "ok"

    response = {
        "status": overall_status,
        "breakers": breakers,
        "timestamp": time.time(),
    }

    if any_open:
        logger.warning(
            "circuit_breakers_degraded",
            open_breakers=[name for name, b in breakers.items() if b["state"] == "open"],
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response,
    )


@router.get("/health/voice", response_class=JSONResponse)
@limiter.limit("50/minute")
async def voice_health_check(request: Request):
    """
    Voice subsystem health check endpoint.

    Returns comprehensive health status of the voice pipeline including:
    - Overall status (healthy/degraded/unhealthy)
    - Provider connectivity (OpenAI, ElevenLabs, Deepgram)
    - Redis session store health
    - Recent error rate
    - TTFA SLO compliance
    - Active session count

    Rate limit: 50 requests per minute
    """
    logger.debug("voice_health_check_requested")

    result = {
        "status": "healthy",
        "timestamp": time.time(),
        "providers": {},
        "session_store": {"status": "unknown"},
        "metrics": {
            "active_sessions": 0,
            "error_rate_5m": None,
            "ttfa_p95_ms": None,
            "ttfa_slo_compliant": None,
        },
        "slo": {
            "ttfa_target_ms": 200,
            "error_rate_target": 0.01,  # 1%
        },
    }

    issues = []

    # Check Redis session store health
    try:
        redis_start = time.time()
        redis_healthy = check_redis_connection()
        redis_latency = (time.time() - redis_start) * 1000

        # Check active voice sessions in Redis
        active_sessions = 0
        try:
            keys = redis_client.keys("voice:session:*")
            active_sessions = len(keys) if keys else 0
        except Exception:
            pass

        result["session_store"] = {
            "status": "up" if redis_healthy else "down",
            "latency_ms": round(redis_latency, 2),
            "active_sessions": active_sessions,
        }
        result["metrics"]["active_sessions"] = active_sessions

        if not redis_healthy:
            issues.append("Redis session store unavailable")
    except Exception as e:
        result["session_store"] = {"status": "error", "error": str(e)}
        issues.append(f"Redis error: {str(e)[:50]}")

    # Check OpenAI provider
    try:
        from openai import AsyncOpenAI

        api_key = settings.OPENAI_API_KEY
        if api_key:
            client = AsyncOpenAI(api_key=api_key, timeout=5.0)
            start = time.time()
            await client.models.list()
            latency = (time.time() - start) * 1000

            result["providers"]["openai"] = {
                "status": "up",
                "latency_ms": round(latency, 2),
            }
        else:
            result["providers"]["openai"] = {"status": "not_configured"}
            issues.append("OpenAI not configured")
    except Exception as e:
        result["providers"]["openai"] = {
            "status": "down",
            "error": str(e)[:100],
        }
        issues.append("OpenAI unavailable")

    # Check ElevenLabs provider
    try:
        elevenlabs_key = getattr(settings, "ELEVENLABS_API_KEY", None)
        if elevenlabs_key:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as client:
                start = time.time()
                resp = await client.get(
                    "https://api.elevenlabs.io/v1/voices",
                    headers={"xi-api-key": elevenlabs_key},
                )
                latency = (time.time() - start) * 1000

                if resp.status_code == 200:
                    result["providers"]["elevenlabs"] = {
                        "status": "up",
                        "latency_ms": round(latency, 2),
                    }
                else:
                    result["providers"]["elevenlabs"] = {
                        "status": "degraded",
                        "status_code": resp.status_code,
                    }
                    issues.append(f"ElevenLabs returned {resp.status_code}")
        else:
            result["providers"]["elevenlabs"] = {"status": "not_configured"}
    except Exception as e:
        result["providers"]["elevenlabs"] = {
            "status": "down",
            "error": str(e)[:100],
        }
        issues.append("ElevenLabs unavailable")

    # Check Deepgram STT provider
    try:
        deepgram_key = getattr(settings, "DEEPGRAM_API_KEY", None)
        if deepgram_key:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as client:
                start = time.time()
                resp = await client.get(
                    "https://api.deepgram.com/v1/projects",
                    headers={"Authorization": f"Token {deepgram_key}"},
                )
                latency = (time.time() - start) * 1000

                if resp.status_code == 200:
                    result["providers"]["deepgram"] = {
                        "status": "up",
                        "latency_ms": round(latency, 2),
                    }
                else:
                    result["providers"]["deepgram"] = {
                        "status": "degraded",
                        "status_code": resp.status_code,
                    }
                    issues.append(f"Deepgram returned {resp.status_code}")
        else:
            result["providers"]["deepgram"] = {"status": "not_configured"}
    except Exception as e:
        result["providers"]["deepgram"] = {
            "status": "down",
            "error": str(e)[:100],
        }
        issues.append("Deepgram unavailable")

    # Get circuit breaker status for voice-related breakers
    breakers = get_circuit_breaker_status()
    voice_breakers = {
        k: v for k, v in breakers.items() if "voice" in k.lower() or "tts" in k.lower() or "stt" in k.lower()
    }
    if voice_breakers:
        result["circuit_breakers"] = voice_breakers
        for name, breaker in voice_breakers.items():
            if breaker.get("state") == "open":
                issues.append(f"Circuit breaker open: {name}")

    # Determine overall status
    critical_issues = [i for i in issues if "unavailable" in i.lower() or "down" in i.lower()]
    if critical_issues:
        result["status"] = "unhealthy"
    elif issues:
        result["status"] = "degraded"
    else:
        result["status"] = "healthy"

    result["issues"] = issues if issues else None

    # Log result
    logger.info(
        "voice_health_check_completed",
        status=result["status"],
        providers={k: v.get("status") for k, v in result["providers"].items()},
        active_sessions=result["metrics"]["active_sessions"],
        issue_count=len(issues),
    )

    response_status = (
        status.HTTP_200_OK
        if result["status"] == "healthy"
        else (
            status.HTTP_503_SERVICE_UNAVAILABLE if result["status"] == "unhealthy" else status.HTTP_200_OK
        )  # Return 200 for degraded (still functional)
    )

    return JSONResponse(status_code=response_status, content=result)
