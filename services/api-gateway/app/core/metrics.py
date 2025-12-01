"""Simple metrics stub to avoid duplicate registration errors."""

from prometheus_client import Counter, Gauge, Histogram, Info


# Create a simple wrapper that catches duplicate registration errors
class SafeMetric:
    def __init__(self, metric_class, *args, **kwargs):
        try:
            self.metric = metric_class(*args, **kwargs)
        except ValueError as e:
            if "Duplicated timeseries" in str(e):
                # Metric already exists, create a dummy
                self.metric = None
            else:
                raise


def _safe_counter(*args, **kwargs):
    try:
        return Counter(*args, **kwargs)
    except ValueError:
        # Return a dummy that does nothing
        class DummyMetric:
            def labels(self, *args, **kwargs):
                return self

            def inc(self, *args, **kwargs):
                pass

        return DummyMetric()


def _safe_histogram(*args, **kwargs):
    try:
        return Histogram(*args, **kwargs)
    except ValueError:

        class DummyMetric:
            def labels(self, *args, **kwargs):
                return self

            def observe(self, *args, **kwargs):
                pass

        return DummyMetric()


def _safe_gauge(*args, **kwargs):
    try:
        return Gauge(*args, **kwargs)
    except ValueError:

        class DummyMetric:
            def labels(self, *args, **kwargs):
                return self

            def set(self, *args, **kwargs):
                pass

            def inc(self, *args, **kwargs):
                pass

            def dec(self, *args, **kwargs):
                pass

        return DummyMetric()


# Application info
try:
    app_info = Info("voiceassist_app", "VoiceAssist application information")
    app_info.info({"version": "2.0.0", "phase": "7", "environment": "production"})
except ValueError:
    pass

# Cache Metrics
cache_hits_total = _safe_counter(
    "voiceassist_cache_hits_total",
    "Total cache hits",
    ["cache_layer", "cache_key_prefix"],
)
cache_misses_total = _safe_counter(
    "voiceassist_cache_misses_total",
    "Total cache misses",
    ["cache_layer", "cache_key_prefix"],
)
cache_latency_seconds = _safe_histogram(
    "voiceassist_cache_latency_seconds",
    "Cache operation latency",
    ["cache_layer", "operation"],
)
cache_size_bytes = _safe_gauge("voiceassist_cache_size_bytes", "Current cache size", ["cache_layer"])
cache_entries_total = _safe_gauge("voiceassist_cache_entries_total", "Total cache entries", ["cache_layer"])
cache_evictions_total = _safe_counter(
    "voiceassist_cache_evictions_total",
    "Total cache evictions",
    ["cache_layer", "reason"],
)

# RAG Query Metrics
rag_query_duration_seconds = _safe_histogram("voiceassist_rag_query_duration_seconds", "RAG query duration", ["stage"])
rag_search_results_total = _safe_histogram(
    "voiceassist_rag_search_results_total",
    "Search results count",
    buckets=[0, 1, 2, 3, 5, 10, 20],
)
rag_embedding_tokens_total = _safe_counter("voiceassist_rag_embedding_tokens_total", "Embedding tokens")
rag_llm_tokens_total = _safe_counter("voiceassist_rag_llm_tokens_total", "LLM tokens", ["type"])

# RBAC Metrics
rbac_checks_total = _safe_counter(
    "voiceassist_rbac_checks_total",
    "RBAC checks",
    ["result", "endpoint", "required_role"],
)

# API Metrics
http_requests_total = _safe_counter(
    "voiceassist_http_requests_total",
    "HTTP requests",
    ["method", "endpoint", "status_code"],
)
http_request_duration_seconds = _safe_histogram(
    "voiceassist_http_request_duration_seconds", "HTTP duration", ["method", "endpoint"]
)
websocket_connections_total = _safe_gauge("voiceassist_websocket_connections_total", "Active WebSocket connections")
websocket_messages_total = _safe_counter(
    "voiceassist_websocket_messages_total",
    "WebSocket messages",
    ["direction", "message_type"],
)
voice_relay_latency_seconds = _safe_histogram(
    "voiceassist_voice_relay_latency_seconds",
    "End-to-end latency for voice relay (transcript -> answer)",
    ["path"],
)
voice_proxy_ttfb_seconds = _safe_histogram(
    "voiceassist_voice_proxy_ttfb_seconds",
    "Time to first byte for voice proxy streaming",
)
voice_first_audio_latency_seconds = _safe_histogram(
    "voiceassist_voice_first_audio_latency_seconds",
    "Time from transcript reception to first audio chunk",
)

# Database Metrics
db_connections_total = _safe_gauge("voiceassist_db_connections_total", "DB connections", ["pool_name", "state"])
db_query_duration_seconds = _safe_histogram(
    "voiceassist_db_query_duration_seconds", "DB query duration", ["query_type"]
)
db_connection_errors_total = _safe_counter("voiceassist_db_connection_errors_total", "DB errors", ["error_type"])
db_pool_size = _safe_gauge("voiceassist_db_pool_size", "DB pool size")
db_pool_checked_out = _safe_gauge("voiceassist_db_pool_checked_out", "DB connections checked out")
db_pool_checked_in = _safe_gauge("voiceassist_db_pool_checked_in", "DB connections idle")
db_pool_overflow = _safe_gauge("voiceassist_db_pool_overflow", "DB pool overflow")
db_pool_utilization_percent = _safe_gauge("voiceassist_db_pool_utilization_percent", "DB pool utilization")
redis_pool_max_connections = _safe_gauge("voiceassist_redis_pool_max_connections", "Redis max connections")
redis_pool_in_use = _safe_gauge("voiceassist_redis_pool_in_use", "Redis connections in use")
redis_pool_available = _safe_gauge("voiceassist_redis_pool_available", "Redis connections available")

# External Service Metrics
external_api_requests_total = _safe_counter(
    "voiceassist_external_api_requests_total",
    "External API requests",
    ["service", "endpoint", "status_code"],
)
external_api_duration_seconds = _safe_histogram(
    "voiceassist_external_api_duration_seconds",
    "External API duration",
    ["service", "endpoint"],
)

# Document Processing Metrics
document_processing_jobs_total = _safe_counter(
    "voiceassist_document_processing_jobs_total", "Document processing jobs", ["status"]
)
document_processing_duration_seconds = _safe_histogram(
    "voiceassist_document_processing_duration_seconds",
    "Document processing duration",
    ["file_type"],
)
document_chunks_indexed_total = _safe_counter("voiceassist_document_chunks_indexed_total", "Document chunks indexed")

# Health Check Metrics
health_check_status = _safe_gauge("voiceassist_health_check_status", "Health check status", ["check_name"])
health_check_duration_seconds = _safe_histogram(
    "voiceassist_health_check_duration_seconds", "Health check duration", ["check_name"]
)

# Voice Mode Metrics (SLO-aligned)
# Histograms with buckets aligned to SLO thresholds
voice_connection_time_seconds = _safe_histogram(
    "voiceassist_voice_connection_time_seconds",
    "Voice WebSocket connection time",
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.0, 5.0],  # SLO: 500ms
)
voice_stt_latency_seconds = _safe_histogram(
    "voiceassist_voice_stt_latency_seconds",
    "Voice speech-to-text latency",
    buckets=[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 1.0],  # SLO: 300ms
)
voice_response_latency_seconds = _safe_histogram(
    "voiceassist_voice_response_latency_seconds",
    "Voice AI response latency",
    buckets=[0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0],  # SLO: 1000ms
)
voice_session_duration_seconds = _safe_histogram(
    "voiceassist_voice_session_duration_seconds",
    "Voice session total duration",
    buckets=[10, 30, 60, 120, 300, 600, 900, 1800],  # 10s to 30min
)
voice_sessions_total = _safe_counter(
    "voiceassist_voice_sessions_total",
    "Total voice sessions",
    ["status"],  # "completed", "failed", "abandoned"
)
voice_transcripts_total = _safe_counter(
    "voiceassist_voice_transcripts_total",
    "Total voice transcripts",
    ["direction"],  # "user", "ai"
)
voice_reconnects_total = _safe_counter(
    "voiceassist_voice_reconnects_total",
    "Total voice session reconnects",
)
voice_slo_violations_total = _safe_counter(
    "voiceassist_voice_slo_violations_total",
    "Total voice SLO violations",
    [
        "metric",
        "severity",
    ],  # metric: connection/stt/response, severity: warning/critical
)

# Voice Preferences & Style Metrics
voice_preferences_updates_total = _safe_counter(
    "voiceassist_voice_preferences_updates_total",
    "Total voice preferences updates",
    ["field"],  # Which field was updated
)
voice_style_detection_total = _safe_counter(
    "voiceassist_voice_style_detection_total",
    "Total voice style detections by style type",
    ["style"],  # calm, urgent, empathetic, instructional, conversational
)
voice_context_aware_adjustments_total = _safe_counter(
    "voiceassist_voice_context_aware_adjustments_total",
    "Total context-aware TTS parameter adjustments",
    ["style", "provider"],  # Style applied and TTS provider used
)
voice_tts_provider_usage_total = _safe_counter(
    "voiceassist_voice_tts_provider_usage_total",
    "TTS provider usage count",
    ["provider", "fallback"],  # Provider used and whether fallback occurred
)
voice_echo_suppression_total = _safe_counter(
    "voiceassist_voice_echo_suppression_total",
    "Total audio chunks suppressed due to echo detection",
)
voice_vad_trigger_latency_seconds = _safe_histogram(
    "voiceassist_voice_vad_trigger_latency_seconds",
    "Time from speech end to VAD trigger",
    buckets=[0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0],  # Target: 200ms
)
