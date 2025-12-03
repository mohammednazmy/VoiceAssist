"""Prometheus metrics middleware for FastAPI.

Provides comprehensive metrics for:
- HTTP request/response metrics
- Application-level metrics
- Business metrics
- System health metrics
"""

import time
from typing import Callable

from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

# HTTP Metrics
http_requests_total = Counter("http_requests_total", "Total HTTP requests", ["method", "endpoint", "status"])

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint", "status"],
    buckets=(
        0.005,
        0.01,
        0.025,
        0.05,
        0.075,
        0.1,
        0.25,
        0.5,
        0.75,
        1.0,
        2.5,
        5.0,
        7.5,
        10.0,
    ),
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests in progress",
    ["method", "endpoint"],
)

http_request_size_bytes = Histogram("http_request_size_bytes", "HTTP request size in bytes", ["method", "endpoint"])

http_response_size_bytes = Histogram(
    "http_response_size_bytes",
    "HTTP response size in bytes",
    ["method", "endpoint", "status"],
)

# Application Metrics
active_connections = Gauge("active_connections", "Number of active connections")

authentication_attempts_total = Counter(
    "authentication_attempts_total",
    "Total authentication attempts",
    ["status", "method"],  # status: success/failure, method: login/refresh/etc
)

# Business Metrics
rag_queries_total = Counter("rag_queries_total", "Total RAG queries processed", ["status"])  # success/failure

rag_query_duration_seconds = Histogram(
    "rag_query_duration_seconds",
    "RAG query processing duration",
    ["status"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)

document_uploads_total = Counter(
    "document_uploads_total",
    "Total document uploads to knowledge base",
    ["status", "file_type"],
)

vector_search_queries_total = Counter("vector_search_queries_total", "Total vector search queries", ["status"])

vector_search_duration_seconds = Histogram(
    "vector_search_duration_seconds",
    "Vector search duration",
    ["status"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)

# Database Metrics
database_connections_active = Gauge("database_connections_active", "Number of active database connections")

database_query_duration_seconds = Histogram(
    "database_query_duration_seconds",
    "Database query duration",
    ["operation"],  # select/insert/update/delete
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

# Redis Metrics
redis_operations_total = Counter(
    "redis_operations_total",
    "Total Redis operations",
    ["operation", "status"],  # operation: get/set/delete, status: success/failure
)

redis_operation_duration_seconds = Histogram(
    "redis_operation_duration_seconds",
    "Redis operation duration",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5),
)

# External Service Metrics
external_api_calls_total = Counter(
    "external_api_calls_total",
    "Total external API calls",
    ["service", "operation", "status"],  # service: openai/nextcloud/etc
)

external_api_duration_seconds = Histogram(
    "external_api_duration_seconds",
    "External API call duration",
    ["service", "operation"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)

# Error Metrics
errors_total = Counter("errors_total", "Total errors", ["error_type", "endpoint"])

# Health Metrics
health_check_status = Gauge(
    "health_check_status",
    "Health check status (1=healthy, 0=unhealthy)",
    ["component"],  # database/redis/qdrant/nextcloud
)

# RBAC Metrics (Phase 7)
rbac_checks_total = Counter(
    "rbac_checks_total",
    "Total RBAC permission checks",
    ["result", "endpoint", "required_role"],  # result: allowed/denied
)

# Nextcloud Integration Metrics (Phase 6)
nextcloud_operations_total = Counter(
    "nextcloud_operations_total",
    "Total Nextcloud integration operations",
    [
        "operation",
        "status",
    ],  # operation: caldav_list/webdav_get/file_index, status: success/failure
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to collect Prometheus metrics for all HTTP requests."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and collect metrics."""
        # Skip metrics endpoint to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        path = request.url.path

        # Normalize path to avoid high cardinality
        endpoint = self._normalize_path(path)

        # Track in-progress requests
        http_requests_in_progress.labels(method=method, endpoint=endpoint).inc()

        # Track request size
        content_length = request.headers.get("content-length", 0)
        try:
            content_length = int(content_length)
        except (ValueError, TypeError):
            content_length = 0
        http_request_size_bytes.labels(method=method, endpoint=endpoint).observe(content_length)

        # Track active connections
        active_connections.inc()

        start_time = time.time()
        status_code = HTTP_500_INTERNAL_SERVER_ERROR

        try:
            response = await call_next(request)
            status_code = response.status_code

            # Track response size
            if hasattr(response, "body"):
                response_size = len(response.body) if response.body else 0
            else:
                response_size = 0
            http_response_size_bytes.labels(method=method, endpoint=endpoint, status=status_code).observe(response_size)

            return response

        except Exception as e:
            # Track errors
            errors_total.labels(error_type=type(e).__name__, endpoint=endpoint).inc()
            raise

        finally:
            # Record metrics
            duration = time.time() - start_time

            http_requests_total.labels(method=method, endpoint=endpoint, status=status_code).inc()

            http_request_duration_seconds.labels(method=method, endpoint=endpoint, status=status_code).observe(duration)

            http_requests_in_progress.labels(method=method, endpoint=endpoint).dec()
            active_connections.dec()

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize path to reduce cardinality.

        Replaces UUIDs and numeric IDs with placeholders.
        """
        import re

        # Replace UUIDs
        path = re.sub(
            r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "/{uuid}",
            path,
            flags=re.IGNORECASE,
        )

        # Replace numeric IDs
        path = re.sub(r"/\d+", "/{id}", path)

        return path


def metrics_endpoint() -> Response:
    """Endpoint to expose Prometheus metrics."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
