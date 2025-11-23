"""Business Metrics Collection (Phase 7 - P3.3).

Tracks business KPIs for VoiceAssist V2.

TEMPORARY FIX: All metrics are disabled to prevent duplication errors during startup.
This allows migrations to run. Will be re-enabled with proper fix later.
"""
from __future__ import annotations

# Dummy implementations to prevent import errors
class DummyMetric:
    """Dummy metric that does nothing."""
    def inc(self, *args, **kwargs): pass
    def dec(self, *args, **kwargs): pass
    def set(self, *args, **kwargs): pass
    def observe(self, *args, **kwargs): pass
    def labels(self, *args, **kwargs): return self
    def info(self, *args, **kwargs): pass

# User Activity Metrics
user_registrations_total = DummyMetric()
user_logins_total = DummyMetric()
active_users_daily = DummyMetric()
active_users_monthly = DummyMetric()
user_session_duration = DummyMetric()

# RAG Query Metrics
rag_queries_total = DummyMetric()
rag_query_satisfaction = DummyMetric()
rag_citations_per_query = DummyMetric()

# Knowledge Base Metrics
kb_documents_total = DummyMetric()
kb_chunks_total = DummyMetric()
kb_document_uploads_total = DummyMetric()
kb_indexing_duration = DummyMetric()

# Nextcloud Integration Metrics
nextcloud_files_synced_total = DummyMetric()
nextcloud_calendar_events_total = DummyMetric()
nextcloud_sync_errors_total = DummyMetric()

# API Usage Metrics
api_endpoints_usage = DummyMetric()
api_response_time_by_endpoint = DummyMetric()

# Resource Utilization
openai_api_calls_total = DummyMetric()
openai_tokens_used_total = DummyMetric()
openai_api_cost_dollars = DummyMetric()

# System Health Business Metrics
system_uptime_seconds = DummyMetric()
feature_flag_checks_total = DummyMetric()
admin_actions_total = DummyMetric()

# Version info
version_info = DummyMetric()

# Performance Metrics (Phase 10)
db_query_duration = DummyMetric()
db_slow_queries_total = DummyMetric()
db_query_count = DummyMetric()
db_n_plus_one_warnings = DummyMetric()

# Database Connection Pool Metrics
db_pool_size = DummyMetric()
db_pool_checked_out = DummyMetric()
db_pool_checked_in = DummyMetric()
db_pool_overflow = DummyMetric()
db_pool_utilization = DummyMetric()

# Cache Performance Metrics
cache_hit_rate = DummyMetric()
cache_operation_duration = DummyMetric()
cache_size = DummyMetric()
cache_memory_usage = DummyMetric()
cache_evictions_total = DummyMetric()

# Redis Connection Pool Metrics
redis_pool_max_connections = DummyMetric()
redis_pool_active_connections = DummyMetric()
redis_pool_available_connections = DummyMetric()

# Endpoint Performance Metrics
endpoint_query_count = DummyMetric()
endpoint_cache_operations = DummyMetric()
endpoint_database_time = DummyMetric()
endpoint_cache_time = DummyMetric()

# Performance Percentiles
response_time_p50 = DummyMetric()
response_time_p95 = DummyMetric()
response_time_p99 = DummyMetric()

# Resource Utilization
memory_usage_bytes = DummyMetric()
cpu_usage_percent = DummyMetric()
thread_count = DummyMetric()

# Query Optimization Metrics
queries_with_indexes_used = DummyMetric()
queries_with_full_table_scan = DummyMetric()
query_result_size = DummyMetric()
