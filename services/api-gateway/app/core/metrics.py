"""Simple metrics stub to avoid duplicate registration errors."""

from prometheus_client import Counter, Gauge, Histogram, Info

from app.core.logging import get_logger

logger = get_logger(__name__)


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


def record_instrumented_api_call(
    analytics_service,
    db,
    endpoint: str,
    duration_ms: float,
    success: bool,
    user_id,
    organization_id,
    endpoint_category: str,
) -> None:
    """
    Small helper to record a tenant-aware API call and Prometheus metric.

    This wraps AnalyticsService.record_api_call and centralizes the
    organization-aware Prometheus labeling to reduce boilerplate.
    """
    try:
        analytics_service.record_api_call(
            db=db,
            endpoint=endpoint,
            duration_ms=duration_ms,
            success=success,
            user_id=user_id,
            organization_id=organization_id,
            endpoint_category=endpoint_category,
        )
    except Exception as exc:  # pragma: no cover
        # Analytics must never break main request handling
        logger.warning("instrumented_api_call_failed", extra={"endpoint": endpoint, "error": str(exc)})


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

# Voice Error Tracking Metrics (Phase 3 - Observability)
voice_errors_total = _safe_counter(
    "voiceassist_voice_errors_total",
    "Total voice errors by category and code",
    ["category", "code", "provider", "recoverable"],
)
voice_error_recovery_total = _safe_counter(
    "voiceassist_voice_error_recovery_total",
    "Successful error recovery attempts",
    [
        "category",
        "recovery_method",
    ],  # recovery_method: retry, failover, reconnect, reset
)
voice_provider_failures_total = _safe_counter(
    "voiceassist_voice_provider_failures_total",
    "External voice provider failures",
    ["provider", "operation", "status_code"],
)

# Voice Pipeline Stage Latency Metrics (for detailed tracing)
voice_pipeline_stage_latency_seconds = _safe_histogram(
    "voiceassist_voice_pipeline_stage_latency_seconds",
    "Per-stage latency in voice pipeline",
    ["stage"],  # Stages: audio_receive, vad_process, stt_transcribe, llm_process, tts_synthesize, audio_send
    buckets=[0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0],
)

# TTFA - Time To First Audio (end-to-end from user speech to first audio byte)
voice_ttfa_seconds = _safe_histogram(
    "voiceassist_voice_ttfa_seconds",
    "Time to first audio byte (speech end to first audio chunk)",
    buckets=[0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0],  # SLO: 200ms
)

# Active voice session gauge
voice_active_sessions = _safe_gauge(
    "voiceassist_voice_active_sessions",
    "Current number of active voice sessions",
)

# Barge-in metrics
voice_barge_in_total = _safe_counter(
    "voiceassist_voice_barge_in_total",
    "Total barge-in interruptions",
    ["outcome"],  # outcome: successful, ignored, error
)

# ====================================================================
# Barge-In Classification & SLO Metrics (Phase 7.2 - Natural Conversation Flow)
# ====================================================================

# Barge-in classification breakdown
voice_barge_in_classification_total = _safe_counter(
    "voiceassist_voice_barge_in_classification_total",
    "Barge-in events by classification type",
    ["classification", "language"],  # classification: backchannel, soft_barge, hard_barge, unclear
)

# Barge-in mute latency (SLO: P95 <50ms, P99 <100ms)
voice_barge_in_mute_latency_seconds = _safe_histogram(
    "voiceassist_voice_barge_in_mute_latency_seconds",
    "Time from speech onset to audio muted (barge-in latency)",
    ["source"],  # source: frontend, backend, hybrid
    buckets=[0.01, 0.02, 0.03, 0.04, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3],  # 10ms-300ms
)

# Barge-in classification latency
voice_barge_in_classification_latency_seconds = _safe_histogram(
    "voiceassist_voice_barge_in_classification_latency_seconds",
    "Time to classify barge-in type after detection",
    buckets=[0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5],  # 10ms-500ms
)

# False positive/misfire tracking (SLO: <2% misfire rate)
voice_barge_in_misfires_total = _safe_counter(
    "voiceassist_voice_barge_in_misfires_total",
    "False positive barge-in triggers (echo, noise, etc.)",
    ["cause"],  # cause: echo, noise, no_transcript, timeout
)

# Backchannel detection accuracy
voice_backchannel_total = _safe_counter(
    "voiceassist_voice_backchannel_total",
    "Backchannel phrases detected",
    ["language", "phrase_type"],  # phrase_type: matched, fuzzy_matched
)

# Soft barge tracking
voice_soft_barge_total = _safe_counter(
    "voiceassist_voice_soft_barge_total",
    "Soft barge events (AI paused)",
    ["outcome"],  # outcome: resumed, converted_to_hard, timeout
)

# Hard barge tracking with context
voice_hard_barge_total = _safe_counter(
    "voiceassist_voice_hard_barge_total",
    "Hard barge events (AI stopped)",
    ["interrupted_at"],  # interrupted_at: early (<25%), mid (25-75%), late (>75%)
)

# Continuation detection metrics
voice_continuation_detected_total = _safe_counter(
    "voiceassist_voice_continuation_detected_total",
    "Continuation detection triggers",
    ["confidence_level"],  # confidence_level: low (<0.5), medium (0.5-0.8), high (>0.8)
)

# Utterance aggregation metrics
voice_utterance_aggregation_total = _safe_counter(
    "voiceassist_voice_utterance_aggregation_total",
    "Multi-segment utterance aggregations",
    ["segment_count"],  # segment_count: 2, 3, 4+
)

# Queue overflow tracking (SLO: <0.5% of turns)
voice_queue_overflow_total = _safe_counter(
    "voiceassist_voice_queue_overflow_total",
    "Audio queue overflow events",
    ["type"],  # type: trim, reset, dropped
)

# Queue depth gauge
voice_queue_depth_chunks = _safe_gauge(
    "voiceassist_voice_queue_depth_chunks",
    "Current audio queue depth in chunks",
)

voice_queue_duration_ms = _safe_gauge(
    "voiceassist_voice_queue_duration_ms",
    "Current audio queue duration in milliseconds",
)

# VAD disagreement metrics
voice_vad_disagreement_total = _safe_counter(
    "voiceassist_voice_vad_disagreement_total",
    "VAD disagreement events (frontend vs backend)",
    ["resolution"],  # resolution: frontend_wins, backend_wins, both_agreed, timeout
)

voice_vad_disagreement_resolution_latency_seconds = _safe_histogram(
    "voiceassist_voice_vad_disagreement_resolution_latency_seconds",
    "Time to resolve VAD disagreement (SLO: <200ms)",
    buckets=[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0],
)

# Hybrid VAD fusion metrics
voice_hybrid_vad_decision_total = _safe_counter(
    "voiceassist_voice_hybrid_vad_decision_total",
    "Hybrid VAD fusion decisions",
    ["source", "silero_fresh", "deepgram_fresh"],  # source: silero_only, deepgram_only, hybrid
)

# High-noise push-to-talk recommendations
voice_high_noise_push_to_talk_total = _safe_counter(
    "voiceassist_voice_high_noise_push_to_talk_total",
    "High-noise push-to-talk recommendations emitted by the voice pipeline",
    ["reason"],  # reason: "high_noise"
)

# Perceived response latency (SLO: P95 <250ms)
voice_perceived_latency_seconds = _safe_histogram(
    "voiceassist_voice_perceived_latency_seconds",
    "User-perceived response latency (speech end to first audio)",
    buckets=[0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0],
)

# Transcript truncation metrics
voice_transcript_truncation_total = _safe_counter(
    "voiceassist_voice_transcript_truncation_total",
    "Transcript truncation events on barge-in",
    ["accuracy"],  # accuracy: word_boundary, mid_word, estimated
)

# Audio chunk metrics
voice_audio_chunks_total = _safe_counter(
    "voiceassist_voice_audio_chunks_total",
    "Total audio chunks processed",
    ["direction", "status"],  # direction: input/output, status: success/dropped/error
)
voice_audio_chunk_size_bytes = _safe_histogram(
    "voiceassist_voice_audio_chunk_size_bytes",
    "Size of audio chunks in bytes",
    ["direction"],
    buckets=[100, 500, 1000, 2000, 4000, 8000, 16000, 32000],
)

# ====================================================================
# Feature Flags SSE Metrics (Phase 3 - Real-time Propagation)
# ====================================================================

# Active SSE connections
sse_connections_active = _safe_gauge(
    "voiceassist_sse_connections_active",
    "Number of active SSE connections for feature flags",
)

# Total SSE connections (connect/disconnect)
sse_connections_total = _safe_counter(
    "voiceassist_sse_connections_total",
    "Total SSE connections by action",
    ["action"],  # "connect", "disconnect"
)

# SSE reconnection attempts
sse_reconnects_total = _safe_counter(
    "voiceassist_sse_reconnects_total",
    "Total SSE reconnection attempts",
    ["with_last_event_id"],  # "true", "false"
)

# Events replayed on reconnect
sse_events_replayed_total = _safe_counter(
    "voiceassist_sse_events_replayed_total",
    "Total events replayed on SSE reconnection",
)

# Events dropped (client queue full, etc.)
sse_events_dropped_total = _safe_counter(
    "voiceassist_sse_events_dropped_total",
    "Total SSE events dropped",
    ["reason"],  # "queue_full", "client_disconnected", "error"
)

# Flag updates broadcast
sse_flag_updates_broadcast_total = _safe_counter(
    "voiceassist_sse_flag_updates_broadcast_total",
    "Total flag updates broadcast via SSE",
    ["event_type"],  # "flag_update", "flags_bulk_update"
)

# Clients notified per broadcast
sse_clients_notified = _safe_histogram(
    "voiceassist_sse_clients_notified",
    "Number of clients notified per broadcast",
    buckets=[0, 1, 2, 5, 10, 25, 50, 100, 250, 500],
)

# Version lag (difference between server and client versions)
sse_version_lag = _safe_histogram(
    "voiceassist_sse_version_lag",
    "Version lag on reconnection (server - client last event ID)",
    buckets=[0, 1, 5, 10, 25, 50, 100, 500, 1000],
)

# Feature flag evaluations
flag_evaluations_total = _safe_counter(
    "voiceassist_flag_evaluations_total",
    "Total feature flag evaluations",
    ["flag_name", "result"],  # result: "enabled", "disabled", "not_found"
)

# Variant assignments
flag_variant_assignments_total = _safe_counter(
    "voiceassist_flag_variant_assignments_total",
    "Total variant assignments for multivariate flags",
    [
        "flag_name",
        "variant_id",
        "assignment_method",
    ],  # method: "bucket", "targeting_rule", "default"
)

# Hash bucket cache stats
flag_bucket_cache_hits_total = _safe_counter(
    "voiceassist_flag_bucket_cache_hits_total",
    "Hash bucket cache hits",
    ["cache_level"],  # "request", "redis"
)

flag_bucket_cache_misses_total = _safe_counter(
    "voiceassist_flag_bucket_cache_misses_total",
    "Hash bucket cache misses",
)

# Per-flag update rate (Phase 3 refinements)
sse_flag_update_rate = _safe_counter(
    "voiceassist_sse_flag_update_rate_total",
    "Per-flag update events broadcast",
    ["flag_name"],  # Track update frequency per flag
)

# SSE event delivery latency (time from update to client notification)
sse_event_delivery_latency_seconds = _safe_histogram(
    "voiceassist_sse_event_delivery_latency_seconds",
    "SSE event delivery latency (update to client notification)",
    ["event_type"],  # "flag_update", "flags_bulk_update", "heartbeat"
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# Version drift between server and client (for monitoring stale clients)
sse_client_version_drift = _safe_gauge(
    "voiceassist_sse_client_version_drift",
    "Maximum version drift between server and connected clients",
)

# SSE connection duration
sse_connection_duration_seconds = _safe_histogram(
    "voiceassist_sse_connection_duration_seconds",
    "Duration of SSE connections",
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
)

# SSE event queue depth per client (for backpressure monitoring)
sse_client_queue_depth = _safe_histogram(
    "voiceassist_sse_client_queue_depth",
    "SSE client event queue depth",
    buckets=[0, 1, 5, 10, 25, 50, 100],
)

# History replay stats
sse_history_incomplete_total = _safe_counter(
    "voiceassist_sse_history_incomplete_total",
    "Times history was incomplete requiring bulk refresh",
)

# Scheduled changes metrics
flag_scheduled_changes_total = _safe_counter(
    "voiceassist_flag_scheduled_changes_total",
    "Scheduled variant changes processed",
    ["status"],  # "applied", "cancelled", "skipped", "error"
)

flag_scheduled_changes_pending = _safe_gauge(
    "voiceassist_flag_scheduled_changes_pending",
    "Number of pending scheduled changes",
)

# Cache invalidation metrics
flag_cache_invalidations_total = _safe_counter(
    "voiceassist_flag_cache_invalidations_total",
    "Flag cache invalidation events",
    ["scope"],  # "flag", "user", "all"
)

# ====================================================================
# User Flag Override Metrics (Phase 4)
# ====================================================================

# Total override operations (create, update, delete)
flag_user_overrides_total = _safe_counter(
    "voiceassist_flag_user_overrides_total",
    "Total user flag override operations",
    ["flag_name", "action"],  # action: "create", "update", "delete"
)

# Active overrides gauge (current count of non-expired overrides)
flag_user_overrides_active_total = _safe_gauge(
    "voiceassist_flag_user_overrides_active_total",
    "Number of active (non-expired) user flag overrides",
    ["flag_name"],
)

# Expired overrides processed during cleanup
flag_user_overrides_expired_total = _safe_counter(
    "voiceassist_flag_user_overrides_expired_total",
    "Total expired user flag overrides cleaned up",
    ["flag_name"],
)

# Bulk operations
flag_user_overrides_bulk_total = _safe_counter(
    "voiceassist_flag_user_overrides_bulk_total",
    "Total bulk override operations",
    ["action"],  # action: "create", "delete"
)

# Override resolution source tracking
flag_override_resolutions_total = _safe_counter(
    "voiceassist_flag_override_resolutions_total",
    "Total flag resolutions by source",
    ["flag_name", "source"],  # source: "override", "segmentation", "scheduled", "default"
)

# ====================================================================
# Analytics Dashboard Metrics (Phase 4 - Multi-Tenancy Analytics)
# ====================================================================

# Real-time metrics collection
analytics_metrics_recorded_total = _safe_counter(
    "voiceassist_analytics_metrics_recorded_total",
    "Total analytics metrics recorded",
    ["metric_type", "organization_id"],  # metric_type: conversations, tokens, api_calls, errors
)

# Aggregation job metrics
analytics_aggregation_jobs_total = _safe_counter(
    "voiceassist_analytics_aggregation_jobs_total",
    "Total analytics aggregation jobs",
    ["status", "job_type"],  # status: success, failure; job_type: hourly, daily
)

analytics_aggregation_duration_seconds = _safe_histogram(
    "voiceassist_analytics_aggregation_duration_seconds",
    "Duration of analytics aggregation jobs",
    ["job_type"],  # hourly, daily
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300],
)

analytics_records_aggregated_total = _safe_counter(
    "voiceassist_analytics_records_aggregated_total",
    "Total records processed during aggregation",
    ["job_type", "metric_type"],
)

# Cost tracking metrics
analytics_cost_cents = _safe_counter(
    "voiceassist_analytics_cost_cents_total",
    "Total cost tracked in cents (hundredths of USD)",
    ["service", "organization_id"],  # service: openai_gpt4, openai_whisper, openai_tts, etc.
)

analytics_tokens_used_total = _safe_counter(
    "voiceassist_analytics_tokens_used_total",
    "Total tokens used by service",
    ["service", "token_type", "organization_id"],  # token_type: input, output
)

# Query analytics
analytics_query_duration_seconds = _safe_histogram(
    "voiceassist_analytics_query_duration_seconds",
    "Duration of analytics dashboard queries",
    ["query_type"],  # summary, timeseries, breakdown, export
    buckets=[0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

# Active analytics dashboards
analytics_active_dashboards = _safe_gauge(
    "voiceassist_analytics_active_dashboards",
    "Number of active analytics dashboard sessions",
)

# ====================================================================
# Organization & Multi-Tenancy Metrics (Phase 4)
# ====================================================================

# Organization operations
organization_operations_total = _safe_counter(
    "voiceassist_organization_operations_total",
    "Total organization operations",
    ["operation", "status"],  # operation: create, update, delete, suspend; status: success, failure
)

# Active organizations
organization_active_total = _safe_gauge(
    "voiceassist_organization_active_total",
    "Number of active organizations",
    ["plan"],  # plan: starter, professional, enterprise
)

# Members per organization
organization_members_total = _safe_gauge(
    "voiceassist_organization_members_total",
    "Total members across all organizations",
    ["role"],  # role: owner, admin, member, viewer
)

organization_member_operations_total = _safe_counter(
    "voiceassist_organization_member_operations_total",
    "Total organization member operations",
    ["operation", "status"],  # operation: invite, accept, remove, update_role
)

# Quota tracking
organization_quota_usage_percent = _safe_gauge(
    "voiceassist_organization_quota_usage_percent",
    "Organization quota usage percentage",
    ["organization_id", "quota_type"],  # quota_type: users, storage, api_calls, documents
)

organization_quota_exceeded_total = _safe_counter(
    "voiceassist_organization_quota_exceeded_total",
    "Total quota exceeded events",
    ["organization_id", "quota_type"],
)

# Tenant isolation checks
organization_tenant_isolation_checks_total = _safe_counter(
    "voiceassist_organization_tenant_isolation_checks_total",
    "Total tenant isolation checks performed",
    ["result"],  # result: allowed, denied, error
)

# Billing events
organization_billing_events_total = _safe_counter(
    "voiceassist_organization_billing_events_total",
    "Total billing events",
    ["event_type", "plan"],  # event_type: subscription, upgrade, downgrade, payment, invoice
)

# API usage by organization
organization_api_calls_total = _safe_counter(
    "voiceassist_organization_api_calls_total",
    "Total API calls by organization",
    ["organization_id", "endpoint_category"],  # endpoint_category: voice, knowledge, chat, admin
)

# ====================================================================
# Learning & Flashcard Metrics (Phase 4)
# ====================================================================

# Deck operations
learning_deck_operations_total = _safe_counter(
    "voiceassist_learning_deck_operations_total",
    "Total learning deck operations",
    ["operation", "status"],  # operation: create, update, delete, clone; status: success, failure
)

learning_decks_total = _safe_gauge(
    "voiceassist_learning_decks_total",
    "Total number of learning decks",
    ["organization_id"],
)

# Card operations
learning_card_operations_total = _safe_counter(
    "voiceassist_learning_card_operations_total",
    "Total flashcard operations",
    ["operation", "status"],  # operation: create, update, delete, import, export
)

learning_cards_total = _safe_gauge(
    "voiceassist_learning_cards_total",
    "Total number of flashcards",
    ["status"],  # status: new, learning, review, mastered, suspended
)

# Spaced repetition metrics
learning_review_sessions_total = _safe_counter(
    "voiceassist_learning_review_sessions_total",
    "Total spaced repetition review sessions",
    ["user_id"],
)

learning_reviews_total = _safe_counter(
    "voiceassist_learning_reviews_total",
    "Total individual card reviews",
    ["rating", "organization_id"],  # rating: again, hard, good, easy
)

learning_review_duration_seconds = _safe_histogram(
    "voiceassist_learning_review_duration_seconds",
    "Duration of individual card reviews",
    buckets=[1, 2, 5, 10, 20, 30, 60, 120, 300],
)

# Card state transitions
learning_card_state_transitions_total = _safe_counter(
    "voiceassist_learning_card_state_transitions_total",
    "Total card state transitions",
    ["from_state", "to_state"],  # states: new, learning, review, mastered, suspended, relearning
)

# Mastery metrics
learning_cards_mastered_total = _safe_counter(
    "voiceassist_learning_cards_mastered_total",
    "Total cards that reached mastery",
    ["organization_id"],
)

learning_average_ease_factor = _safe_gauge(
    "voiceassist_learning_average_ease_factor",
    "Average ease factor across all cards",
    ["organization_id"],
)

# Voice-based learning
learning_voice_reviews_total = _safe_counter(
    "voiceassist_learning_voice_reviews_total",
    "Total voice-based card reviews",
    ["result"],  # result: correct, incorrect, skipped
)

# Import/Export operations
learning_import_operations_total = _safe_counter(
    "voiceassist_learning_import_operations_total",
    "Total deck/card import operations",
    ["format", "status"],  # format: anki, csv, json; status: success, partial, failure
)

learning_cards_imported_total = _safe_counter(
    "voiceassist_learning_cards_imported_total",
    "Total cards imported",
    ["format"],
)

# ====================================================================
# Enhanced PDF Processing Metrics (Phase 4 - GPT-4 Vision)
# ====================================================================

# Document processing stages
pdf_processing_stage_duration_seconds = _safe_histogram(
    "voiceassist_pdf_processing_stage_duration_seconds",
    "Duration of each PDF processing stage",
    ["stage"],  # stage: pdfplumber_extract, image_render, gpt4_vision_analyze, merge, store
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
)

pdf_processing_jobs_total = _safe_counter(
    "voiceassist_pdf_processing_jobs_total",
    "Total PDF processing jobs",
    ["status"],  # status: pending, extracting, analyzing, complete, failed
)

pdf_processing_progress_percent = _safe_gauge(
    "voiceassist_pdf_processing_progress_percent",
    "Current PDF processing progress",
    ["document_id"],
)

# Page-level metrics
pdf_pages_processed_total = _safe_counter(
    "voiceassist_pdf_pages_processed_total",
    "Total PDF pages processed",
    ["stage"],  # stage: rendered, analyzed, indexed
)

pdf_page_analysis_duration_seconds = _safe_histogram(
    "voiceassist_pdf_page_analysis_duration_seconds",
    "Duration of GPT-4 Vision page analysis",
    buckets=[0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30],
)

# GPT-4 Vision specific metrics
gpt4_vision_requests_total = _safe_counter(
    "voiceassist_gpt4_vision_requests_total",
    "Total GPT-4 Vision API requests",
    ["status", "resolution"],  # status: success, failure; resolution: high, low
)

gpt4_vision_tokens_used_total = _safe_counter(
    "voiceassist_gpt4_vision_tokens_used_total",
    "Total tokens used by GPT-4 Vision",
    ["token_type"],  # token_type: input, output
)

gpt4_vision_cost_cents = _safe_counter(
    "voiceassist_gpt4_vision_cost_cents_total",
    "Total GPT-4 Vision cost in cents",
)

gpt4_vision_latency_seconds = _safe_histogram(
    "voiceassist_gpt4_vision_latency_seconds",
    "GPT-4 Vision API latency",
    buckets=[0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60],
)

# Content extraction metrics
pdf_tables_extracted_total = _safe_counter(
    "voiceassist_pdf_tables_extracted_total",
    "Total tables extracted from PDFs",
)

pdf_figures_extracted_total = _safe_counter(
    "voiceassist_pdf_figures_extracted_total",
    "Total figures detected in PDFs",
)

pdf_content_blocks_total = _safe_counter(
    "voiceassist_pdf_content_blocks_total",
    "Total content blocks extracted",
    ["block_type"],  # block_type: text, heading, table, figure
)

# OCR correction metrics
pdf_ocr_corrections_total = _safe_counter(
    "voiceassist_pdf_ocr_corrections_total",
    "Total OCR corrections made by GPT-4 Vision",
)

# Page image storage
pdf_page_images_stored_total = _safe_counter(
    "voiceassist_pdf_page_images_stored_total",
    "Total PDF page images stored",
)

pdf_page_images_storage_bytes = _safe_gauge(
    "voiceassist_pdf_page_images_storage_bytes",
    "Total storage used by PDF page images",
)

# Admin content editing
pdf_content_edits_total = _safe_counter(
    "voiceassist_pdf_content_edits_total",
    "Total admin content edits",
    ["edit_type"],  # edit_type: text, table, figure, narration
)

pdf_page_regeneration_total = _safe_counter(
    "voiceassist_pdf_page_regeneration_total",
    "Total page re-analysis requests",
)

# Voice narration generation
pdf_voice_narration_generated_total = _safe_counter(
    "voiceassist_pdf_voice_narration_generated_total",
    "Total voice narrations generated for pages",
)

# ====================================================================
# Scheduled Job Metrics (Phase 5 - Background Schedulers)
# ====================================================================

# Cron job execution
cron_job_executions_total = _safe_counter(
    "voiceassist_cron_job_executions_total",
    "Total cron job executions",
    ["job_name", "status"],  # status: success, failure, timeout
)

cron_job_duration_seconds = _safe_histogram(
    "voiceassist_cron_job_duration_seconds",
    "Duration of cron job executions",
    ["job_name"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
)

cron_job_last_run_timestamp = _safe_gauge(
    "voiceassist_cron_job_last_run_timestamp",
    "Unix timestamp of last cron job run",
    ["job_name"],
)

# Data cleanup metrics
cleanup_records_deleted_total = _safe_counter(
    "voiceassist_cleanup_records_deleted_total",
    "Total records deleted by cleanup jobs",
    ["table", "reason"],  # reason: expired, stale, orphaned
)

cleanup_storage_freed_bytes = _safe_counter(
    "voiceassist_cleanup_storage_freed_bytes_total",
    "Total storage freed by cleanup jobs",
    ["storage_type"],  # storage_type: database, redis, files
)
