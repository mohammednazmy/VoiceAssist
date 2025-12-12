"""Business Metrics Collection (Phase 7 - P3.3).

Tracks business KPIs for VoiceAssist V2.

This module uses a safe registration pattern to prevent "Duplicated timeseries"
errors during hot reloads or multi-worker setups.
"""

from __future__ import annotations

from prometheus_client import REGISTRY, Counter, Gauge, Histogram, Info


def safe_counter(name: str, documentation: str, labelnames=None):
    """Create or retrieve a Counter metric safely."""
    labelnames = labelnames or []
    try:
        # Try to get existing metric from registry
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        # If not found, create new one
        return Counter(name, documentation, labelnames=labelnames)
    except ValueError:
        # Metric already exists, retrieve it
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        # Fallback: create dummy metric
        return _create_dummy_metric()


def safe_histogram(name: str, documentation: str, labelnames=None, buckets=None):
    """Create or retrieve a Histogram metric safely."""
    labelnames = labelnames or []
    try:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return Histogram(name, documentation, labelnames=labelnames, buckets=buckets)
    except ValueError:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return _create_dummy_metric()


def safe_gauge(name: str, documentation: str, labelnames=None):
    """Create or retrieve a Gauge metric safely."""
    labelnames = labelnames or []
    try:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return Gauge(name, documentation, labelnames=labelnames)
    except ValueError:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return _create_dummy_metric()


def safe_info(name: str, documentation: str):
    """Create or retrieve an Info metric safely."""
    try:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return Info(name, documentation)
    except ValueError:
        for collector in list(REGISTRY._collector_to_names.keys()):
            if hasattr(collector, "_name") and collector._name == name:
                return collector
        return _create_dummy_metric()


class _DummyMetric:
    """Dummy metric that does nothing but provides the same interface."""

    def inc(self, *args, **kwargs):
        pass

    def dec(self, *args, **kwargs):
        pass

    def set(self, *args, **kwargs):
        pass

    def observe(self, *args, **kwargs):
        pass

    def labels(self, *args, **kwargs):
        return self

    def info(self, *args, **kwargs):
        pass


def _create_dummy_metric():
    """Create a dummy metric as a fallback."""
    return _DummyMetric()


# User Activity Metrics
user_registrations_total = safe_counter("voiceassist_user_registrations_total", "Total number of user registrations")

user_logins_total = safe_counter("voiceassist_user_logins_total", "Total number of successful user logins")

active_users_daily = safe_gauge("voiceassist_active_users_daily", "Number of unique users active today")

active_users_monthly = safe_gauge("voiceassist_active_users_monthly", "Number of unique users active this month")

user_session_duration = safe_histogram(
    "voiceassist_user_session_duration_seconds",
    "User session duration in seconds",
    buckets=[60, 300, 600, 1800, 3600, 7200, 14400],  # 1m to 4h
)

# RAG Query Metrics
rag_queries_total = safe_counter(
    "voiceassist_rag_queries_total",
    "Total number of RAG queries",
    labelnames=["success", "has_citations"],
)

rag_query_satisfaction = safe_histogram(
    "voiceassist_rag_query_satisfaction_score",
    "User satisfaction scores for RAG queries (0-5)",
    buckets=[0, 1, 2, 3, 4, 5],
)

rag_citations_per_query = safe_histogram(
    "voiceassist_rag_citations_per_query",
    "Number of citations returned per query",
    buckets=[0, 1, 2, 3, 5, 10, 20],
)

# Knowledge Base Metrics
kb_documents_total = safe_gauge("voiceassist_kb_documents_total", "Total number of documents in knowledge base")

kb_chunks_total = safe_gauge("voiceassist_kb_chunks_total", "Total number of indexed chunks")

kb_document_uploads_total = safe_counter(
    "voiceassist_kb_document_uploads_total",
    "Total number of document uploads",
    labelnames=["source_type", "file_type"],
)

kb_indexing_duration = safe_histogram(
    "voiceassist_kb_indexing_duration_seconds",
    "Document indexing duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300],
)

# Enhanced PDF Processing Metrics (Phase 5)
enhanced_kb_processing_total = safe_counter(
    "voiceassist_kb_enhanced_processing_total",
    "Total number of enhanced PDF processing runs",
    labelnames=["status"],  # success, failed
)

enhanced_kb_processing_pages = safe_histogram(
    "voiceassist_kb_enhanced_processing_pages",
    "Distribution of pages per enhanced PDF processing run",
    buckets=[1, 10, 25, 50, 100, 250, 500],
)

enhanced_kb_processing_cost_dollars = safe_histogram(
    "voiceassist_kb_enhanced_processing_cost_dollars",
    "Estimated OpenAI vision cost (USD) per enhanced processing run",
    buckets=[0.01, 0.10, 0.50, 1.0, 2.5, 5.0],
)

# HTTP KB Query Metrics (chat + voice)
kb_query_requests_total = safe_counter(
    "voiceassist_kb_query_requests_total",
    "Total number of /api/kb/query requests",
    labelnames=["channel", "success"],
)

kb_query_latency_seconds = safe_histogram(
    "voiceassist_kb_query_latency_seconds",
    "Latency for /api/kb/query requests by channel",
    labelnames=["channel"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

kb_query_answer_length_tokens = safe_histogram(
    "voiceassist_kb_query_answer_length_tokens",
    "Approximate length of KB answers returned via /api/kb/query (in tokens)",
    labelnames=["channel"],
    buckets=[10, 25, 50, 100, 200, 400],
)

kb_query_sources_per_answer = safe_histogram(
    "voiceassist_kb_query_sources_per_answer",
    "Number of KB sources attached to each /api/kb/query answer",
    labelnames=["channel"],
    buckets=[0, 1, 2, 3, 5, 10],
)

kb_query_top_score = safe_histogram(
    "voiceassist_kb_query_top_score",
    "Top relevance score of first KB source per /api/kb/query response",
    labelnames=["channel"],
    buckets=[0.0, 0.1, 0.25, 0.5, 0.75, 1.0],
)

kb_query_failures_total = safe_counter(
    "voiceassist_kb_query_failures_total",
    "Total number of /api/kb/query failures by reason",
    labelnames=["channel", "reason"],
)

# Voice KB Tool Metrics
voice_kb_tool_calls_total = safe_counter(
    "voiceassist_voice_kb_tool_calls_total",
    "Total number of KB-related tool calls in voice sessions",
    labelnames=["tool_name", "success"],
)

voice_kb_tool_latency_seconds = safe_histogram(
    "voiceassist_voice_kb_tool_latency_seconds",
    "Latency for KB-related tool calls in voice sessions",
    labelnames=["tool_name"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

voice_kb_answer_length_tokens = safe_histogram(
    "voiceassist_voice_kb_answer_length_tokens",
    "Approximate length of KB answers returned via voice tools (in tokens)",
    labelnames=["tool_name"],
    buckets=[10, 25, 50, 100, 200, 400],
)

voice_kb_sources_per_answer = safe_histogram(
    "voiceassist_voice_kb_sources_per_answer",
    "Number of KB sources attached to each answer in voice tools",
    labelnames=["tool_name"],
    buckets=[0, 1, 2, 3, 5, 10],
)

# Nextcloud Integration Metrics
nextcloud_files_synced_total = safe_counter(
    "voiceassist_nextcloud_files_synced_total", "Total number of Nextcloud files synced"
)

nextcloud_calendar_events_total = safe_gauge(
    "voiceassist_nextcloud_calendar_events_total", "Total number of calendar events"
)

nextcloud_sync_errors_total = safe_counter(
    "voiceassist_nextcloud_sync_errors_total",
    "Total number of Nextcloud sync errors",
    labelnames=["error_type"],
)

# API Usage Metrics
api_endpoints_usage = safe_counter(
    "voiceassist_api_endpoints_usage_total",
    "API endpoint usage count",
    labelnames=["endpoint", "method", "status_code"],
)

api_response_time_by_endpoint = safe_histogram(
    "voiceassist_api_response_time_by_endpoint_seconds",
    "API response time by endpoint",
    labelnames=["endpoint", "method"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Resource Utilization
openai_api_calls_total = safe_counter(
    "voiceassist_openai_api_calls_total",
    "Total OpenAI API calls",
    labelnames=["model", "purpose"],
)

openai_tokens_used_total = safe_counter(
    "voiceassist_openai_tokens_used_total",
    "Total OpenAI tokens consumed",
    labelnames=["model", "token_type"],  # token_type: prompt, completion
)

openai_api_cost_dollars = safe_counter("voiceassist_openai_api_cost_dollars_total", "Estimated OpenAI API cost in USD")

# System Health Business Metrics
system_uptime_seconds = safe_gauge("voiceassist_system_uptime_seconds", "System uptime in seconds")

feature_flag_checks_total = safe_counter(
    "voiceassist_feature_flag_checks_total",
    "Total feature flag checks",
    labelnames=["flag_name", "result"],
)

admin_actions_total = safe_counter(
    "voiceassist_admin_actions_total",
    "Total admin actions performed",
    labelnames=["action_type", "success"],
)

# Version info
version_info = safe_info("voiceassist_version", "VoiceAssist version information")

# Performance Metrics (Phase 10)
db_query_duration = safe_histogram(
    "voiceassist_db_query_duration_seconds",
    "Database query duration in seconds",
    labelnames=["query_type"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
)

db_slow_queries_total = safe_counter(
    "voiceassist_db_slow_queries_total",
    "Total number of slow database queries (>1s)",
    labelnames=["table", "operation"],
)

db_query_count = safe_counter(
    "voiceassist_db_query_count_total",
    "Total database queries executed",
    labelnames=["query_type"],
)

db_n_plus_one_warnings = safe_counter("voiceassist_db_n_plus_one_warnings_total", "N+1 query pattern warnings")

# Database Connection Pool Metrics
db_pool_size = safe_gauge("voiceassist_db_pool_size", "Database connection pool size")

db_pool_checked_out = safe_gauge("voiceassist_db_pool_checked_out", "Number of connections currently checked out")

db_pool_checked_in = safe_gauge("voiceassist_db_pool_checked_in", "Number of connections available in pool")

db_pool_overflow = safe_gauge("voiceassist_db_pool_overflow", "Number of overflow connections in use")

db_pool_utilization = safe_gauge(
    "voiceassist_db_pool_utilization_percent",
    "Database connection pool utilization percentage",
)

# Cache Performance Metrics
cache_hit_rate = safe_gauge(
    "voiceassist_cache_hit_rate_percent",
    "Cache hit rate percentage",
    labelnames=["cache_type"],
)

cache_operation_duration = safe_histogram(
    "voiceassist_cache_operation_duration_seconds",
    "Cache operation duration",
    labelnames=["operation", "cache_type"],
    buckets=[0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
)

cache_size = safe_gauge(
    "voiceassist_cache_size_items",
    "Number of items in cache",
    labelnames=["cache_type"],
)

cache_memory_usage = safe_gauge(
    "voiceassist_cache_memory_usage_bytes",
    "Cache memory usage in bytes",
    labelnames=["cache_type"],
)

cache_evictions_total = safe_counter(
    "voiceassist_cache_evictions_total",
    "Total number of cache evictions",
    labelnames=["cache_type", "reason"],
)

# Redis Connection Pool Metrics
redis_pool_max_connections = safe_gauge("voiceassist_redis_pool_max_connections", "Maximum Redis pool connections")

redis_pool_active_connections = safe_gauge(
    "voiceassist_redis_pool_active_connections", "Currently active Redis connections"
)

redis_pool_available_connections = safe_gauge(
    "voiceassist_redis_pool_available_connections", "Available Redis pool connections"
)

# Endpoint Performance Metrics
endpoint_query_count = safe_histogram(
    "voiceassist_endpoint_query_count",
    "Number of database queries per endpoint",
    labelnames=["endpoint"],
    buckets=[1, 2, 5, 10, 20, 50, 100],
)

endpoint_cache_operations = safe_histogram(
    "voiceassist_endpoint_cache_operations",
    "Number of cache operations per endpoint",
    labelnames=["endpoint"],
    buckets=[0, 1, 2, 5, 10, 20, 50],
)

endpoint_database_time = safe_histogram(
    "voiceassist_endpoint_database_time_seconds",
    "Time spent in database operations per endpoint",
    labelnames=["endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0],
)

endpoint_cache_time = safe_histogram(
    "voiceassist_endpoint_cache_time_seconds",
    "Time spent in cache operations per endpoint",
    labelnames=["endpoint"],
    buckets=[0.0001, 0.001, 0.01, 0.05, 0.1, 0.5, 1.0],
)

# Performance Percentiles
response_time_p50 = safe_gauge(
    "voiceassist_response_time_p50_seconds",
    "50th percentile response time",
    labelnames=["endpoint"],
)

response_time_p95 = safe_gauge(
    "voiceassist_response_time_p95_seconds",
    "95th percentile response time",
    labelnames=["endpoint"],
)

response_time_p99 = safe_gauge(
    "voiceassist_response_time_p99_seconds",
    "99th percentile response time",
    labelnames=["endpoint"],
)

# Resource Utilization
memory_usage_bytes = safe_gauge("voiceassist_memory_usage_bytes", "Current memory usage in bytes")

cpu_usage_percent = safe_gauge("voiceassist_cpu_usage_percent", "Current CPU usage percentage")

thread_count = safe_gauge("voiceassist_thread_count", "Number of active threads")
