"""
Custom middleware for security, rate limiting, and request tracing
"""

import time
import uuid
from functools import wraps
from typing import Callable, Optional

import structlog
from app.core.database import redis_client
from app.core.metrics import http_request_duration_seconds, http_requests_total
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)


# ============================================================================
# Rate Limiting Decorator
# ============================================================================


def rate_limit(
    calls: int = 10,
    period: int = 60,
    key_prefix: str = "ratelimit",
    key_func: Optional[Callable[[Request], str]] = None,
):
    """
    Rate limiting decorator for FastAPI endpoints.

    Args:
        calls: Maximum number of calls allowed in the period
        period: Time period in seconds
        key_prefix: Prefix for the Redis key
        key_func: Optional function to generate a custom rate limit key from request

    Usage:
        @router.post("/endpoint")
        @rate_limit(calls=10, period=60)
        async def my_endpoint(request: Request, ...):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find the request object in args or kwargs
            request = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                # No request object found, skip rate limiting
                return await func(*args, **kwargs)

            # Generate rate limit key
            if key_func:
                identifier = key_func(request)
            else:
                # Default: use client IP or user ID if authenticated
                user_id = getattr(request.state, "user_id", None)
                if user_id:
                    identifier = f"user:{user_id}"
                else:
                    identifier = f"ip:{request.client.host if request.client else 'unknown'}"

            redis_key = f"{key_prefix}:{request.url.path}:{identifier}"

            try:
                # Get current count
                current = redis_client.get(redis_key)
                current_count = int(current) if current else 0

                if current_count >= calls:
                    # Get TTL for retry-after header
                    ttl = redis_client.ttl(redis_key)
                    raise HTTPException(
                        status_code=429,
                        detail=f"Rate limit exceeded. Try again in {ttl} seconds.",
                        headers={"Retry-After": str(ttl)},
                    )

                # Increment counter
                pipe = redis_client.pipeline()
                pipe.incr(redis_key)
                if current_count == 0:
                    pipe.expire(redis_key, period)
                pipe.execute()

            except HTTPException:
                raise
            except Exception as e:
                # If Redis is unavailable, log and allow the request
                logger.warning(f"Rate limiting failed: {e}")

            return await func(*args, **kwargs)

        return wrapper

    return decorator


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        return response


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """
    Add correlation IDs to requests for distributed tracing
    """

    async def dispatch(self, request: Request, call_next):
        # Get or create correlation ID
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        traceparent = request.headers.get("traceparent", f"00-{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}-01")

        # Add to context for logging
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            correlation_id=correlation_id,
            traceparent=traceparent,
            method=request.method,
            path=request.url.path,
        )

        # Log request start
        start_time = time.time()
        logger.info(
            "request_started",
            method=request.method,
            path=request.url.path,
            client_host=request.client.host if request.client else None,
        )

        try:
            response = await call_next(request)

            # Log request completion
            duration = time.time() - start_time
            logger.info(
                "request_completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_seconds=duration,
            )

            # Add correlation ID to response
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["traceparent"] = traceparent

            return response

        except Exception as exc:
            # Log request error
            duration = time.time() - start_time
            logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                duration_seconds=duration,
                error=str(exc),
                exc_info=True,
            )
            raise


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Track request metrics for Prometheus
    """

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        try:
            response = await call_next(request)
            duration = time.time() - start_time

            # Track Prometheus metrics for successful requests
            try:
                endpoint = request.url.path
                method = request.method
                status_code = response.status_code

                http_requests_total.labels(
                    method=method,
                    endpoint=endpoint,
                    status_code=str(status_code),
                ).inc()
                http_request_duration_seconds.labels(
                    method=method,
                    endpoint=endpoint,
                ).observe(duration)
            except Exception as metric_err:  # pragma: no cover - defensive
                logger.debug("metrics_update_failed", error=str(metric_err))

            logger.debug(
                "request_metrics",
                method=request.method,
                endpoint=request.url.path,
                status=response.status_code,
                duration=duration,
            )

            return response

        except Exception as exc:
            duration = time.time() - start_time

            # Track metrics for failed requests as 500 errors
            try:
                endpoint = request.url.path
                method = request.method

                http_requests_total.labels(
                    method=method,
                    endpoint=endpoint,
                    status_code="500",
                ).inc()
                http_request_duration_seconds.labels(
                    method=method,
                    endpoint=endpoint,
                ).observe(duration)
            except Exception as metric_err:  # pragma: no cover - defensive
                logger.debug("metrics_update_failed", error=str(metric_err))

            logger.debug(
                "request_metrics_error",
                method=request.method,
                endpoint=request.url.path,
                duration=duration,
                error=str(exc),
            )
            raise
