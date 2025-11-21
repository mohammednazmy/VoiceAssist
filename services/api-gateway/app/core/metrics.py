"""Prometheus metrics for VoiceAssist application (Phase 7 Integration Improvements).

Provides centralized metrics for:
- Cache hit/miss rates (L1 and L2)
- RAG query performance
- RBAC checks
- API response times
- Database connection pool usage
"""
from prometheus_client import Counter, Histogram, Gauge, Info

# Application info
app_info = Info("voiceassist_app", "VoiceAssist application information")
app_info.info({
    "version": "2.0.0",
    "phase": "7",
    "environment": "development"
})

# =========================================
# Cache Metrics (P2.1)
# =========================================

cache_hits_total = Counter(
    "voiceassist_cache_hits_total",
    "Total number of cache hits",
    ["cache_layer", "cache_key_prefix"]
)

cache_misses_total = Counter(
    "voiceassist_cache_misses_total",
    "Total number of cache misses",
    ["cache_layer", "cache_key_prefix"]
)

cache_latency_seconds = Histogram(
    "voiceassist_cache_latency_seconds",
    "Cache operation latency in seconds",
    ["cache_layer", "operation"]
)

cache_size_bytes = Gauge(
    "voiceassist_cache_size_bytes",
    "Current cache size in bytes",
    ["cache_layer"]
)

cache_entries_total = Gauge(
    "voiceassist_cache_entries_total",
    "Total number of entries in cache",
    ["cache_layer"]
)

cache_evictions_total = Counter(
    "voiceassist_cache_evictions_total",
    "Total number of cache evictions",
    ["cache_layer", "reason"]
)

# =========================================
# RAG Query Metrics
# =========================================

rag_query_duration_seconds = Histogram(
    "voiceassist_rag_query_duration_seconds",
    "RAG query processing time in seconds",
    ["stage"]  # embedding, search, llm, total
)

rag_search_results_total = Histogram(
    "voiceassist_rag_search_results_total",
    "Number of search results returned",
    buckets=[0, 1, 2, 3, 5, 10, 20]
)

rag_embedding_tokens_total = Counter(
    "voiceassist_rag_embedding_tokens_total",
    "Total tokens processed for embeddings"
)

rag_llm_tokens_total = Counter(
    "voiceassist_rag_llm_tokens_total",
    "Total tokens processed by LLM",
    ["type"]  # prompt, completion
)

# =========================================
# RBAC Metrics (Phase 7)
# =========================================

rbac_checks_total = Counter(
    "voiceassist_rbac_checks_total",
    "Total number of RBAC authorization checks",
    ["result", "endpoint", "required_role"]
)

# =========================================
# API Metrics
# =========================================

http_requests_total = Counter(
    "voiceassist_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"]
)

http_request_duration_seconds = Histogram(
    "voiceassist_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"]
)

websocket_connections_total = Gauge(
    "voiceassist_websocket_connections_total",
    "Current number of active WebSocket connections"
)

websocket_messages_total = Counter(
    "voiceassist_websocket_messages_total",
    "Total WebSocket messages",
    ["direction", "message_type"]
)

# =========================================
# Database Metrics (P2.5)
# =========================================

db_connections_total = Gauge(
    "voiceassist_db_connections_total",
    "Current number of database connections",
    ["pool_name", "state"]  # idle, in_use
)

db_query_duration_seconds = Histogram(
    "voiceassist_db_query_duration_seconds",
    "Database query duration in seconds",
    ["query_type"]
)

db_connection_errors_total = Counter(
    "voiceassist_db_connection_errors_total",
    "Total database connection errors",
    ["error_type"]
)

# Connection Pool Metrics (P2.5 - Connection Pool Optimization)
db_pool_size = Gauge(
    "voiceassist_db_pool_size",
    "PostgreSQL connection pool configured size"
)

db_pool_checked_out = Gauge(
    "voiceassist_db_pool_checked_out",
    "PostgreSQL connections currently checked out"
)

db_pool_checked_in = Gauge(
    "voiceassist_db_pool_checked_in",
    "PostgreSQL connections currently checked in (idle)"
)

db_pool_overflow = Gauge(
    "voiceassist_db_pool_overflow",
    "PostgreSQL connections in overflow (beyond pool_size)"
)

db_pool_utilization_percent = Gauge(
    "voiceassist_db_pool_utilization_percent",
    "PostgreSQL connection pool utilization percentage"
)

redis_pool_max_connections = Gauge(
    "voiceassist_redis_pool_max_connections",
    "Redis maximum connections configured"
)

redis_pool_in_use = Gauge(
    "voiceassist_redis_pool_in_use",
    "Redis connections currently in use"
)

redis_pool_available = Gauge(
    "voiceassist_redis_pool_available",
    "Redis connections available in pool"
)

# =========================================
# External Service Metrics
# =========================================

external_api_requests_total = Counter(
    "voiceassist_external_api_requests_total",
    "Total requests to external APIs",
    ["service", "endpoint", "status_code"]
)

external_api_duration_seconds = Histogram(
    "voiceassist_external_api_duration_seconds",
    "External API request duration in seconds",
    ["service", "endpoint"]
)

# =========================================
# Document Processing Metrics (ARQ)
# =========================================

document_processing_jobs_total = Counter(
    "voiceassist_document_processing_jobs_total",
    "Total document processing jobs",
    ["status"]  # queued, completed, failed
)

document_processing_duration_seconds = Histogram(
    "voiceassist_document_processing_duration_seconds",
    "Document processing duration in seconds",
    ["file_type"]
)

document_chunks_indexed_total = Counter(
    "voiceassist_document_chunks_indexed_total",
    "Total document chunks indexed"
)

# =========================================
# Health Check Metrics
# =========================================

health_check_status = Gauge(
    "voiceassist_health_check_status",
    "Health check status (1=healthy, 0=unhealthy)",
    ["check_name"]
)

health_check_duration_seconds = Histogram(
    "voiceassist_health_check_duration_seconds",
    "Health check duration in seconds",
    ["check_name"]
)
