"""Business Metrics Collection (Phase 7 - P3.3).

Tracks business KPIs for VoiceAssist V2.
"""
from __future__ import annotations

from prometheus_client import Counter, Histogram, Gauge, Info

# User Activity Metrics
user_registrations_total = Counter(
    "voiceassist_user_registrations_total",
    "Total number of user registrations"
)

user_logins_total = Counter(
    "voiceassist_user_logins_total",
    "Total number of successful user logins"
)

active_users_daily = Gauge(
    "voiceassist_active_users_daily",
    "Number of unique users active today"
)

active_users_monthly = Gauge(
    "voiceassist_active_users_monthly",
    "Number of unique users active this month"
)

user_session_duration = Histogram(
    "voiceassist_user_session_duration_seconds",
    "User session duration in seconds",
    buckets=[60, 300, 600, 1800, 3600, 7200, 14400]  # 1m to 4h
)

# RAG Query Metrics
rag_queries_total = Counter(
    "voiceassist_rag_queries_total",
    "Total number of RAG queries",
    ["success", "has_citations"]
)

rag_query_satisfaction = Histogram(
    "voiceassist_rag_query_satisfaction_score",
    "User satisfaction scores for RAG queries (0-5)",
    buckets=[0, 1, 2, 3, 4, 5]
)

rag_citations_per_query = Histogram(
    "voiceassist_rag_citations_per_query",
    "Number of citations returned per query",
    buckets=[0, 1, 2, 3, 5, 10, 20]
)

# Knowledge Base Metrics
kb_documents_total = Gauge(
    "voiceassist_kb_documents_total",
    "Total number of documents in knowledge base"
)

kb_chunks_total = Gauge(
    "voiceassist_kb_chunks_total",
    "Total number of indexed chunks"
)

kb_document_uploads_total = Counter(
    "voiceassist_kb_document_uploads_total",
    "Total number of document uploads",
    ["source_type", "file_type"]
)

kb_indexing_duration = Histogram(
    "voiceassist_kb_indexing_duration_seconds",
    "Document indexing duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300]
)

# Nextcloud Integration Metrics
nextcloud_files_synced_total = Counter(
    "voiceassist_nextcloud_files_synced_total",
    "Total number of Nextcloud files synced"
)

nextcloud_calendar_events_total = Gauge(
    "voiceassist_nextcloud_calendar_events_total",
    "Total number of calendar events"
)

nextcloud_sync_errors_total = Counter(
    "voiceassist_nextcloud_sync_errors_total",
    "Total number of Nextcloud sync errors",
    ["error_type"]
)

# API Usage Metrics
api_endpoints_usage = Counter(
    "voiceassist_api_endpoints_usage_total",
    "API endpoint usage count",
    ["endpoint", "method", "status_code"]
)

api_response_time_by_endpoint = Histogram(
    "voiceassist_api_response_time_by_endpoint_seconds",
    "API response time by endpoint",
    ["endpoint", "method"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

# Resource Utilization
openai_api_calls_total = Counter(
    "voiceassist_openai_api_calls_total",
    "Total OpenAI API calls",
    ["model", "purpose"]
)

openai_tokens_used_total = Counter(
    "voiceassist_openai_tokens_used_total",
    "Total OpenAI tokens consumed",
    ["model", "token_type"]  # token_type: prompt, completion
)

openai_api_cost_dollars = Counter(
    "voiceassist_openai_api_cost_dollars_total",
    "Estimated OpenAI API cost in USD"
)

# System Health Business Metrics
system_uptime_seconds = Gauge(
    "voiceassist_system_uptime_seconds",
    "System uptime in seconds"
)

feature_flag_checks_total = Counter(
    "voiceassist_feature_flag_checks_total",
    "Total feature flag checks",
    ["flag_name", "result"]
)

admin_actions_total = Counter(
    "voiceassist_admin_actions_total",
    "Total admin actions performed",
    ["action_type", "success"]
)

# Version info
version_info = Info(
    "voiceassist_version",
    "VoiceAssist version information"
)

# ===== Performance Metrics (Phase 10) =====

# Database Query Performance
db_query_duration = Histogram(
    "voiceassist_db_query_duration_seconds",
    "Database query execution time in seconds",
    ["query_type", "endpoint"],
    buckets=[0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

db_slow_queries_total = Counter(
    "voiceassist_db_slow_queries_total",
    "Total number of slow database queries (>100ms)",
    ["query_type", "endpoint"]
)

db_query_count = Counter(
    "voiceassist_db_query_count_total",
    "Total number of database queries executed",
    ["query_type", "endpoint"]
)

db_n_plus_one_warnings = Counter(
    "voiceassist_db_n_plus_one_warnings_total",
    "Total number of potential N+1 query pattern warnings"
)

# Database Connection Pool Metrics
db_pool_size = Gauge(
    "voiceassist_db_pool_size",
    "Database connection pool size"
)

db_pool_checked_out = Gauge(
    "voiceassist_db_pool_checked_out",
    "Number of database connections currently checked out"
)

db_pool_checked_in = Gauge(
    "voiceassist_db_pool_checked_in",
    "Number of database connections currently checked in"
)

db_pool_overflow = Gauge(
    "voiceassist_db_pool_overflow",
    "Number of database connections in overflow"
)

db_pool_utilization = Gauge(
    "voiceassist_db_pool_utilization_percent",
    "Database connection pool utilization percentage"
)

# Cache Performance Metrics
cache_hit_rate = Gauge(
    "voiceassist_cache_hit_rate_percent",
    "Cache hit rate percentage",
    ["cache_type", "namespace"]  # cache_type: l1, l2; namespace: user, rag, feature_flag
)

cache_operation_duration = Histogram(
    "voiceassist_cache_operation_duration_seconds",
    "Cache operation duration in seconds",
    ["cache_type", "operation"],  # operation: get, set, delete
    buckets=[0.0001, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

cache_size = Gauge(
    "voiceassist_cache_size_entries",
    "Number of entries in cache",
    ["cache_type", "namespace"]
)

cache_memory_usage = Gauge(
    "voiceassist_cache_memory_usage_bytes",
    "Cache memory usage in bytes",
    ["cache_type"]
)

cache_evictions_total = Counter(
    "voiceassist_cache_evictions_total",
    "Total number of cache evictions",
    ["cache_type", "reason"]  # reason: ttl, memory, manual
)

# Redis Connection Pool Metrics
redis_pool_max_connections = Gauge(
    "voiceassist_redis_pool_max_connections",
    "Maximum number of Redis connections in pool"
)

redis_pool_active_connections = Gauge(
    "voiceassist_redis_pool_active_connections",
    "Number of active Redis connections"
)

redis_pool_available_connections = Gauge(
    "voiceassist_redis_pool_available_connections",
    "Number of available Redis connections"
)

# Endpoint Performance Metrics
endpoint_query_count = Counter(
    "voiceassist_endpoint_query_count_total",
    "Total number of database queries per endpoint",
    ["endpoint", "method"]
)

endpoint_cache_operations = Counter(
    "voiceassist_endpoint_cache_operations_total",
    "Total number of cache operations per endpoint",
    ["endpoint", "method", "operation"]
)

endpoint_database_time = Histogram(
    "voiceassist_endpoint_database_time_seconds",
    "Total database time per endpoint request",
    ["endpoint", "method"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

endpoint_cache_time = Histogram(
    "voiceassist_endpoint_cache_time_seconds",
    "Total cache operation time per endpoint request",
    ["endpoint", "method"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

# Performance Percentiles
response_time_p50 = Gauge(
    "voiceassist_response_time_p50_seconds",
    "50th percentile (median) response time",
    ["endpoint"]
)

response_time_p95 = Gauge(
    "voiceassist_response_time_p95_seconds",
    "95th percentile response time",
    ["endpoint"]
)

response_time_p99 = Gauge(
    "voiceassist_response_time_p99_seconds",
    "99th percentile response time",
    ["endpoint"]
)

# Resource Utilization
memory_usage_bytes = Gauge(
    "voiceassist_memory_usage_bytes",
    "Process memory usage in bytes"
)

cpu_usage_percent = Gauge(
    "voiceassist_cpu_usage_percent",
    "Process CPU usage percentage"
)

thread_count = Gauge(
    "voiceassist_thread_count",
    "Number of active threads"
)

# Query Optimization Metrics
queries_with_indexes_used = Counter(
    "voiceassist_queries_with_indexes_used_total",
    "Number of queries that used database indexes",
    ["table_name", "index_name"]
)

queries_with_full_table_scan = Counter(
    "voiceassist_queries_with_full_table_scan_total",
    "Number of queries that performed full table scans",
    ["table_name"]
)

query_result_size = Histogram(
    "voiceassist_query_result_size_rows",
    "Number of rows returned by queries",
    ["query_type", "table_name"],
    buckets=[1, 10, 50, 100, 500, 1000, 5000, 10000]
)
