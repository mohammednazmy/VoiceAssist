"""Admin Voice API endpoints (Sprint 1 - Voice Monitor + Phase 11.1).

Provides voice/realtime session monitoring and management for the Admin Panel.

Endpoints:
Session Management:
- GET /api/admin/voice/sessions - List active WebSocket voice sessions
- GET /api/admin/voice/sessions/{id} - Get session details
- POST /api/admin/voice/sessions/{id}/disconnect - Force disconnect session

Metrics & Analytics:
- GET /api/admin/voice/metrics - Voice metrics summary
- GET /api/admin/voice/health - Voice service health
- GET /api/admin/voice/analytics - Usage analytics by period
- GET /api/admin/voice/analytics/latency - Latency histograms
- GET /api/admin/voice/analytics/costs - Cost breakdown by provider

Configuration:
- GET /api/admin/voice/config - Get voice configuration
- PATCH /api/admin/voice/config - Update voice configuration (admin only)
- GET /api/admin/voice/providers - List available TTS/STT providers
- GET /api/admin/voice/voices - List voices for selected provider
- POST /api/admin/voice/test-provider - Test provider connectivity

Feature Flags:
- GET /api/admin/voice/feature-flags - List voice feature flags
- PATCH /api/admin/voice/feature-flags/{name} - Update feature flag
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

# Import audit logging helper from admin_panel
from app.api.admin_panel import log_audit_event
from app.core.api_envelope import success_response
from app.core.config import settings
from app.core.database import get_db, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from app.services.realtime_voice_service import realtime_voice_service
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Import ElevenLabs service for provider testing
try:
    from app.services.elevenlabs_service import elevenlabs_service
except ImportError:
    elevenlabs_service = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/voice", tags=["admin", "voice"])

# Redis keys for voice session tracking
REDIS_VOICE_SESSIONS_KEY = "voiceassist:voice:sessions"
REDIS_VOICE_CONFIG_KEY = "voiceassist:voice:admin_config"
REDIS_VOICE_METRICS_KEY = "voiceassist:voice:metrics_24h"
REDIS_VOICE_ANALYTICS_KEY = "voiceassist:voice:analytics"
REDIS_VOICE_LATENCY_KEY = "voiceassist:voice:latency_histogram"
REDIS_VOICE_COSTS_KEY = "voiceassist:voice:costs"

# Voice feature flag names (prefixed for organization)
VOICE_FEATURE_FLAGS = [
    "voice.echo_detection_enabled",
    "voice.adaptive_vad_enabled",
    "voice.elevenlabs_enabled",
    "voice.streaming_tts_enabled",
    "voice.barge_in_enabled",
    "voice.realtime_api_enabled",
]


# ============================================================================
# Pydantic Models
# ============================================================================


class VoiceSessionInfo(BaseModel):
    """Response model for voice session information."""

    session_id: str
    user_id: str
    user_email: Optional[str] = None
    connected_at: str
    session_type: Literal["text", "voice", "realtime"]
    client_info: Dict = Field(default_factory=dict)
    messages_count: int = 0
    last_activity: Optional[str] = None


class VoiceSessionDetail(VoiceSessionInfo):
    """Detailed voice session information."""

    conversation_id: Optional[str] = None
    voice: Optional[str] = None
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    audio_format: Optional[str] = None


class VoiceMetrics(BaseModel):
    """Voice service metrics summary."""

    active_sessions: int = 0
    total_sessions_24h: int = 0
    avg_session_duration_sec: float = 0.0
    stt_latency_p95_ms: float = 0.0
    tts_latency_p95_ms: float = 0.0
    error_rate_24h: float = 0.0
    connections_by_type: Dict[str, int] = Field(default_factory=dict)


class VoiceHealthStatus(BaseModel):
    """Voice service health status."""

    status: Literal["healthy", "degraded", "unhealthy"]
    realtime_api_enabled: bool
    openai_api_configured: bool
    redis_connected: bool
    active_connections: int
    details: Dict = Field(default_factory=dict)


class VoiceConfig(BaseModel):
    """Voice configuration."""

    default_voice: str = "alloy"
    default_language: str = "en"
    vad_enabled: bool = True
    vad_threshold: float = 0.5
    max_session_duration_sec: int = 3600
    stt_provider: str = "openai"
    tts_provider: str = "openai"
    realtime_enabled: bool = False


class VoiceConfigUpdate(BaseModel):
    """Request model for updating voice configuration."""

    default_voice: Optional[str] = None
    default_language: Optional[str] = None
    vad_enabled: Optional[bool] = None
    vad_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    max_session_duration_sec: Optional[int] = Field(None, ge=60, le=7200)


class DisconnectResponse(BaseModel):
    """Response for session disconnect."""

    success: bool
    session_id: str
    message: str


# Phase 11.1: Additional models for analytics, providers, and feature flags


class VoiceAnalytics(BaseModel):
    """Voice usage analytics."""

    period: str  # "24h", "7d", "30d"
    total_sessions: int = 0
    unique_users: int = 0
    total_duration_seconds: float = 0.0
    avg_session_duration_seconds: float = 0.0
    messages_processed: int = 0
    errors: int = 0
    error_rate: float = 0.0
    by_provider: Dict[str, int] = Field(default_factory=dict)
    by_voice: Dict[str, int] = Field(default_factory=dict)
    peak_concurrent: int = 0


class LatencyHistogram(BaseModel):
    """Latency distribution data."""

    metric: str  # "stt" or "tts"
    period: str
    buckets: List[Dict[str, Any]] = Field(default_factory=list)
    p50_ms: float = 0.0
    p95_ms: float = 0.0
    p99_ms: float = 0.0
    avg_ms: float = 0.0
    min_ms: float = 0.0
    max_ms: float = 0.0
    sample_count: int = 0


class CostBreakdown(BaseModel):
    """Cost breakdown by provider."""

    period: str
    total_cost_usd: Decimal = Decimal("0.00")
    by_provider: Dict[str, Decimal] = Field(default_factory=dict)
    by_voice: Dict[str, Decimal] = Field(default_factory=dict)
    tts_characters: int = 0
    stt_minutes: float = 0.0
    realtime_minutes: float = 0.0


class ProviderInfo(BaseModel):
    """TTS/STT provider information."""

    id: str
    name: str
    type: Literal["tts", "stt", "both"]
    enabled: bool
    configured: bool
    features: List[str] = Field(default_factory=list)
    models: List[Dict[str, str]] = Field(default_factory=list)


class VoiceInfo(BaseModel):
    """Voice information."""

    voice_id: str
    name: str
    provider: str
    category: Optional[str] = None
    preview_url: Optional[str] = None
    description: Optional[str] = None
    labels: Dict[str, str] = Field(default_factory=dict)
    supported_languages: List[str] = Field(default_factory=list)


class ProviderTestRequest(BaseModel):
    """Request to test a provider."""

    provider: Literal["openai", "elevenlabs"]
    voice_id: Optional[str] = None
    test_text: str = "Hello, this is a test of the voice synthesis system."


class ProviderTestResult(BaseModel):
    """Result of provider connectivity test."""

    provider: str
    success: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    audio_size_bytes: Optional[int] = None


class VoiceFeatureFlag(BaseModel):
    """Voice-specific feature flag."""

    name: str
    description: str
    enabled: bool
    rollout_percentage: int = 100
    updated_at: Optional[str] = None


class VoiceFeatureFlagUpdate(BaseModel):
    """Request to update a voice feature flag."""

    enabled: Optional[bool] = None
    rollout_percentage: Optional[int] = Field(None, ge=0, le=100)


# ============================================================================
# Voice Session Tracking Helpers
# ============================================================================


def register_voice_session(
    session_id: str,
    user_id: str,
    user_email: str,
    session_type: str = "voice",
    conversation_id: Optional[str] = None,
    voice: Optional[str] = None,
    language: Optional[str] = None,
) -> None:
    """Register a new voice session in Redis."""
    try:
        session_data = json.dumps(
            {
                "user_id": user_id,
                "user_email": user_email,
                "type": session_type,
                "conversation_id": conversation_id,
                "voice": voice,
                "language": language,
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "last_activity": datetime.now(timezone.utc).isoformat(),
                "messages_count": 0,
            }
        )
        redis_client.hset(REDIS_VOICE_SESSIONS_KEY, session_id, session_data)
        # Set expiry on the hash (auto-cleanup stale sessions after 24h)
        redis_client.expire(REDIS_VOICE_SESSIONS_KEY, 86400)
    except Exception as e:
        logger.warning(f"Failed to register voice session in Redis: {e}")


def unregister_voice_session(session_id: str) -> None:
    """Unregister a voice session from Redis."""
    try:
        redis_client.hdel(REDIS_VOICE_SESSIONS_KEY, session_id)
    except Exception as e:
        logger.warning(f"Failed to unregister voice session from Redis: {e}")


def get_all_voice_sessions() -> Dict[str, dict]:
    """Get all active voice sessions from Redis."""
    try:
        sessions = redis_client.hgetall(REDIS_VOICE_SESSIONS_KEY)
        result = {}
        for sid, data in sessions.items():
            # Handle both bytes and str from Redis
            if isinstance(sid, bytes):
                sid = sid.decode("utf-8")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            result[sid] = json.loads(data) if isinstance(data, str) else data
        return result
    except Exception as e:
        logger.warning(f"Failed to get voice sessions from Redis: {e}")
        return {}


def get_voice_session(session_id: str) -> Optional[dict]:
    """Get a specific voice session from Redis."""
    try:
        data = redis_client.hget(REDIS_VOICE_SESSIONS_KEY, session_id)
        if data:
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            return json.loads(data) if isinstance(data, str) else data
        return None
    except Exception as e:
        logger.warning(f"Failed to get voice session from Redis: {e}")
        return None


def update_voice_session_activity(session_id: str) -> None:
    """Update last activity timestamp for a voice session."""
    try:
        session = get_voice_session(session_id)
        if session:
            session["last_activity"] = datetime.now(timezone.utc).isoformat()
            session["messages_count"] = session.get("messages_count", 0) + 1
            redis_client.hset(REDIS_VOICE_SESSIONS_KEY, session_id, json.dumps(session))
    except Exception as e:
        logger.warning(f"Failed to update voice session activity: {e}")


def get_voice_config() -> VoiceConfig:
    """Get voice configuration from Redis or return defaults."""
    try:
        config_data = redis_client.get(REDIS_VOICE_CONFIG_KEY)
        if config_data:
            if isinstance(config_data, bytes):
                config_data = config_data.decode("utf-8")
            return VoiceConfig(**json.loads(config_data))
    except Exception as e:
        logger.warning(f"Failed to get voice config from Redis: {e}")

    # Return default config with settings values (handle None values)
    return VoiceConfig(
        default_voice=getattr(settings, "TTS_VOICE", None) or "alloy",
        default_language="en",
        vad_enabled=True,
        vad_threshold=0.5,
        max_session_duration_sec=3600,
        stt_provider=getattr(settings, "STT_PROVIDER", None) or "openai",
        tts_provider=getattr(settings, "TTS_PROVIDER", None) or "openai",
        realtime_enabled=getattr(settings, "REALTIME_ENABLED", False),
    )


def save_voice_config(config: VoiceConfig) -> None:
    """Save voice configuration to Redis."""
    try:
        redis_client.set(REDIS_VOICE_CONFIG_KEY, json.dumps(config.model_dump()))
    except Exception as e:
        logger.warning(f"Failed to save voice config to Redis: {e}")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/sessions")
async def list_voice_sessions(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    session_type: Optional[str] = Query(None, description="Filter by session type"),
    limit: int = Query(50, ge=1, le=200),
) -> Dict:
    """List active voice/realtime WebSocket sessions.

    Available to admin and viewer roles.
    """
    sessions = get_all_voice_sessions()

    # Filter by type if specified
    if session_type:
        sessions = {sid: info for sid, info in sessions.items() if info.get("type") == session_type}

    # Convert to list format
    session_list: List[dict] = []
    for sid, info in list(sessions.items())[:limit]:
        session_list.append(
            {
                "session_id": sid,
                "user_id": info.get("user_id", ""),
                "user_email": info.get("user_email"),
                "connected_at": info.get("connected_at", ""),
                "session_type": info.get("type", "voice"),
                "client_info": info.get("client_info", {}),
                "messages_count": info.get("messages_count", 0),
                "last_activity": info.get("last_activity"),
            }
        )

    # Sort by connected_at descending
    session_list.sort(key=lambda x: x.get("connected_at", ""), reverse=True)

    data = {
        "sessions": session_list,
        "total": len(sessions),
        "filtered": len(session_list),
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/sessions/{session_id}")
async def get_session_details(
    request: Request,
    session_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get details for a specific voice session.

    Available to admin and viewer roles.
    """
    session = get_voice_session(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Calculate duration if connected_at exists
    duration_seconds = None
    connected_at = session.get("connected_at")
    if connected_at:
        try:
            connected_dt = datetime.fromisoformat(connected_at.replace("Z", "+00:00"))
            duration_seconds = (datetime.now(timezone.utc) - connected_dt).total_seconds()
        except Exception:
            pass

    data = {
        "session_id": session_id,
        "user_id": session.get("user_id", ""),
        "user_email": session.get("user_email"),
        "connected_at": connected_at,
        "session_type": session.get("type", "voice"),
        "conversation_id": session.get("conversation_id"),
        "voice": session.get("voice"),
        "language": session.get("language"),
        "client_info": session.get("client_info", {}),
        "messages_count": session.get("messages_count", 0),
        "last_activity": session.get("last_activity"),
        "duration_seconds": duration_seconds,
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.post("/sessions/{session_id}/disconnect")
async def force_disconnect_session(
    request: Request,
    session_id: str,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Force disconnect a voice session (admin only).

    This removes the session from tracking. The actual WebSocket
    disconnection should be handled by the realtime service.
    """
    ensure_admin_privileges(current_admin_user)

    session = get_voice_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Remove from Redis
    unregister_voice_session(session_id)

    # Log audit event
    log_audit_event(
        db=db,
        action="voice.session.disconnect",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="voice_session",
        resource_id=session_id,
        success=True,
        details=json.dumps(
            {
                "target_user_id": session.get("user_id"),
                "target_user_email": session.get("user_email"),
                "session_type": session.get("type"),
            }
        ),
        request=request,
    )

    logger.info(
        f"Admin {current_admin_user.email} force disconnected voice session {session_id}",
        extra={
            "admin_id": current_admin_user.id,
            "session_id": session_id,
            "target_user_id": session.get("user_id"),
        },
    )

    data = {
        "success": True,
        "session_id": session_id,
        "message": "Session disconnected successfully",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/metrics")
async def get_voice_metrics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get voice service metrics summary.

    Available to admin and viewer roles.
    """
    sessions = get_all_voice_sessions()

    # Count by type
    connections_by_type: Dict[str, int] = {"voice": 0, "realtime": 0, "text": 0}
    total_duration_sec = 0.0
    active_with_duration = 0

    for info in sessions.values():
        conn_type = info.get("type", "voice")
        if conn_type in connections_by_type:
            connections_by_type[conn_type] += 1
        else:
            connections_by_type[conn_type] = 1

        # Calculate duration for average
        connected_at = info.get("connected_at")
        if connected_at:
            try:
                connected_dt = datetime.fromisoformat(connected_at.replace("Z", "+00:00"))
                duration = (datetime.now(timezone.utc) - connected_dt).total_seconds()
                total_duration_sec += duration
                active_with_duration += 1
            except Exception:
                pass

    avg_duration = total_duration_sec / active_with_duration if active_with_duration > 0 else 0.0

    # Try to get cached 24h metrics from Redis
    total_sessions_24h = 0
    error_rate_24h = 0.0
    stt_latency_p95 = 0.0
    tts_latency_p95 = 0.0

    try:
        metrics_data = redis_client.get(REDIS_VOICE_METRICS_KEY)
        if metrics_data:
            if isinstance(metrics_data, bytes):
                metrics_data = metrics_data.decode("utf-8")
            cached_metrics = json.loads(metrics_data)
            total_sessions_24h = cached_metrics.get("total_sessions_24h", 0)
            error_rate_24h = cached_metrics.get("error_rate_24h", 0.0)
            stt_latency_p95 = cached_metrics.get("stt_latency_p95_ms", 0.0)
            tts_latency_p95 = cached_metrics.get("tts_latency_p95_ms", 0.0)
    except Exception:
        pass

    data = {
        "active_sessions": len(sessions),
        "total_sessions_24h": total_sessions_24h,
        "avg_session_duration_sec": round(avg_duration, 2),
        "stt_latency_p95_ms": stt_latency_p95,
        "tts_latency_p95_ms": tts_latency_p95,
        "error_rate_24h": error_rate_24h,
        "connections_by_type": connections_by_type,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/health")
async def get_voice_health(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get voice service health status.

    Available to admin and viewer roles.
    """
    # Check various voice service components
    realtime_enabled = realtime_voice_service.is_enabled()
    openai_configured = bool(getattr(settings, "OPENAI_API_KEY", None))

    # Check Redis connectivity
    redis_ok = False
    try:
        redis_client.ping()
        redis_ok = True
    except Exception:
        pass

    # Get active connections count
    sessions = get_all_voice_sessions()
    active_count = len(sessions)

    # Determine overall status
    if not redis_ok:
        status = "unhealthy"
    elif not openai_configured:
        status = "degraded"
    else:
        status = "healthy"

    data = {
        "status": status,
        "realtime_api_enabled": realtime_enabled,
        "openai_api_configured": openai_configured,
        "redis_connected": redis_ok,
        "active_connections": active_count,
        "details": {
            "realtime_model": getattr(settings, "REALTIME_MODEL", "gpt-4o-realtime-preview"),
            "stt_provider": getattr(settings, "STT_PROVIDER", "openai"),
            "tts_provider": getattr(settings, "TTS_PROVIDER", "openai"),
            "tts_voice": getattr(settings, "TTS_VOICE", "alloy"),
        },
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/config")
async def get_voice_config_endpoint(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get voice configuration.

    Available to admin and viewer roles.
    """
    config = get_voice_config()

    data = config.model_dump()
    data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.patch("/config")
async def update_voice_config_endpoint(
    request: Request,
    config_update: VoiceConfigUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Update voice configuration (admin only).

    Only admin users can modify voice configuration.
    """
    ensure_admin_privileges(current_admin_user)

    # Get current config
    current_config = get_voice_config()
    original_config = current_config.model_dump()

    # Apply updates
    update_data = config_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_config, field, value)

    # Save updated config
    save_voice_config(current_config)

    # Log audit event
    log_audit_event(
        db=db,
        action="voice.config.update",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="voice_config",
        resource_id="global",
        success=True,
        details=json.dumps({"original": original_config, "updated": update_data}),
        request=request,
    )

    logger.info(
        f"Admin {current_admin_user.email} updated voice configuration",
        extra={
            "admin_id": current_admin_user.id,
            "changes": update_data,
        },
    )

    data = current_config.model_dump()
    data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Phase 11.1: Analytics Endpoints
# ============================================================================


@router.get("/analytics")
async def get_voice_analytics(
    request: Request,
    period: str = Query("24h", description="Time period: 24h, 7d, or 30d"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get voice usage analytics for the specified period.

    Available to admin and viewer roles.
    """
    valid_periods = ["24h", "7d", "30d"]
    if period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period. Must be one of: {', '.join(valid_periods)}",
        )

    # Get analytics from Redis cache
    analytics_key = f"{REDIS_VOICE_ANALYTICS_KEY}:{period}"
    try:
        cached_data = redis_client.get(analytics_key)
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode("utf-8")
            data = json.loads(cached_data)
            data["period"] = period
            data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
    except Exception as e:
        logger.warning(f"Failed to get analytics from cache: {e}")

    # Return default/empty analytics if no cache
    data = VoiceAnalytics(period=period).model_dump()
    data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/analytics/latency")
async def get_voice_latency_histogram(
    request: Request,
    metric: str = Query("stt", description="Metric type: stt or tts"),
    period: str = Query("24h", description="Time period: 24h, 7d, or 30d"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get latency histogram for STT or TTS.

    Available to admin and viewer roles.
    """
    valid_metrics = ["stt", "tts"]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric. Must be one of: {', '.join(valid_metrics)}",
        )

    # Get latency data from Redis
    latency_key = f"{REDIS_VOICE_LATENCY_KEY}:{metric}:{period}"
    try:
        cached_data = redis_client.get(latency_key)
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode("utf-8")
            data = json.loads(cached_data)
            data["metric"] = metric
            data["period"] = period
            data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
    except Exception as e:
        logger.warning(f"Failed to get latency data from cache: {e}")

    # Return default histogram
    data = LatencyHistogram(metric=metric, period=period).model_dump()
    data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/analytics/costs")
async def get_voice_cost_breakdown(
    request: Request,
    period: str = Query("30d", description="Time period: 24h, 7d, or 30d"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get cost breakdown by provider.

    Available to admin and viewer roles.
    """
    # Get cost data from Redis
    costs_key = f"{REDIS_VOICE_COSTS_KEY}:{period}"
    try:
        cached_data = redis_client.get(costs_key)
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode("utf-8")
            data = json.loads(cached_data)
            data["period"] = period
            data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
    except Exception as e:
        logger.warning(f"Failed to get cost data from cache: {e}")

    # Return default cost breakdown
    data = {
        "period": period,
        "total_cost_usd": "0.00",
        "by_provider": {"openai": "0.00", "elevenlabs": "0.00"},
        "by_voice": {},
        "tts_characters": 0,
        "stt_minutes": 0.0,
        "realtime_minutes": 0.0,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Phase 11.1: Provider & Voice Endpoints
# ============================================================================


@router.get("/providers")
async def get_voice_providers(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get list of available TTS/STT providers.

    Available to admin and viewer roles.
    """
    providers = []

    # OpenAI provider
    openai_configured = bool(getattr(settings, "OPENAI_API_KEY", None))
    providers.append(
        {
            "id": "openai",
            "name": "OpenAI",
            "type": "both",
            "enabled": True,
            "configured": openai_configured,
            "features": ["tts", "stt", "realtime", "streaming"],
            "models": [
                {"id": "tts-1", "name": "TTS-1 (Fast)"},
                {"id": "tts-1-hd", "name": "TTS-1 HD (Quality)"},
                {"id": "gpt-4o-realtime-preview", "name": "GPT-4o Realtime"},
            ],
        }
    )

    # ElevenLabs provider
    elevenlabs_configured = bool(getattr(settings, "ELEVENLABS_API_KEY", None))
    elevenlabs_enabled = elevenlabs_service is not None and elevenlabs_service.is_enabled()
    providers.append(
        {
            "id": "elevenlabs",
            "name": "ElevenLabs",
            "type": "tts",
            "enabled": elevenlabs_enabled,
            "configured": elevenlabs_configured,
            "features": ["tts", "streaming", "emotion_control", "multilingual"],
            "models": [
                {
                    "id": "eleven_multilingual_v2",
                    "name": "Multilingual v2 (Best Quality)",
                },
                {"id": "eleven_turbo_v2", "name": "Turbo v2 (Fast, English)"},
                {"id": "eleven_monolingual_v1", "name": "Monolingual v1 (Legacy)"},
            ],
        }
    )

    data = {
        "providers": providers,
        "default_tts_provider": getattr(settings, "TTS_PROVIDER", "openai"),
        "default_stt_provider": getattr(settings, "STT_PROVIDER", "openai"),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/voices")
async def get_available_voices(
    request: Request,
    provider: Optional[str] = Query(None, description="Filter by provider: openai or elevenlabs"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get list of available voices for the specified provider.

    Available to admin and viewer roles.
    """
    voices = []

    # OpenAI voices
    if provider is None or provider == "openai":
        openai_voices = [
            {
                "voice_id": "alloy",
                "name": "Alloy",
                "provider": "openai",
                "category": "neural",
            },
            {
                "voice_id": "echo",
                "name": "Echo",
                "provider": "openai",
                "category": "neural",
            },
            {
                "voice_id": "fable",
                "name": "Fable",
                "provider": "openai",
                "category": "neural",
            },
            {
                "voice_id": "onyx",
                "name": "Onyx",
                "provider": "openai",
                "category": "neural",
            },
            {
                "voice_id": "nova",
                "name": "Nova",
                "provider": "openai",
                "category": "neural",
            },
            {
                "voice_id": "shimmer",
                "name": "Shimmer",
                "provider": "openai",
                "category": "neural",
            },
        ]
        voices.extend(openai_voices)

    # ElevenLabs voices
    if (provider is None or provider == "elevenlabs") and elevenlabs_service:
        try:
            elevenlabs_voices = await elevenlabs_service.get_voices()
            for v in elevenlabs_voices:
                voices.append(
                    {
                        "voice_id": v.voice_id,
                        "name": v.name,
                        "provider": "elevenlabs",
                        "category": v.category,
                        "preview_url": v.preview_url,
                        "description": v.description,
                        "labels": v.labels,
                    }
                )
        except Exception as e:
            logger.warning(f"Failed to fetch ElevenLabs voices: {e}")

    # Get default voice
    config = get_voice_config()
    default_voice_id = config.default_voice

    data = {
        "voices": voices,
        "total": len(voices),
        "default_voice_id": default_voice_id,
        "default_provider": config.tts_provider,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.post("/test-provider")
async def test_voice_provider(
    request: Request,
    test_request: ProviderTestRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Test connectivity to a TTS provider.

    Admin only. Generates test audio to verify provider is working.
    """
    ensure_admin_privileges(current_admin_user)

    import time

    start_time = time.time()
    result = {
        "provider": test_request.provider,
        "success": False,
        "latency_ms": None,
        "error": None,
        "audio_size_bytes": None,
    }

    try:
        if test_request.provider == "openai":
            # Test OpenAI TTS
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "tts-1",
                        "input": test_request.test_text,
                        "voice": test_request.voice_id or "alloy",
                    },
                    timeout=30.0,
                )
                if response.status_code == 200:
                    result["success"] = True
                    result["audio_size_bytes"] = len(response.content)
                else:
                    result["error"] = f"HTTP {response.status_code}: {response.text}"

        elif test_request.provider == "elevenlabs":
            if not elevenlabs_service or not elevenlabs_service.is_enabled():
                result["error"] = "ElevenLabs is not configured"
            else:
                synthesis_result = await elevenlabs_service.synthesize(
                    text=test_request.test_text,
                    voice_id=test_request.voice_id,
                )
                result["success"] = True
                result["audio_size_bytes"] = len(synthesis_result.audio_data)

    except Exception as e:
        result["error"] = str(e)

    result["latency_ms"] = round((time.time() - start_time) * 1000, 2)

    # Log audit event
    log_audit_event(
        db=db,
        action="voice.provider.test",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="voice_provider",
        resource_id=test_request.provider,
        success=result["success"],
        details=json.dumps(
            {
                "provider": test_request.provider,
                "voice_id": test_request.voice_id,
                "latency_ms": result["latency_ms"],
                "error": result["error"],
            }
        ),
        request=request,
    )

    data = result
    data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Phase 11.1: Feature Flags Endpoints
# ============================================================================


# Default voice feature flag definitions
VOICE_FEATURE_FLAG_DEFINITIONS = {
    "voice.echo_detection_enabled": {
        "description": "Enable local echo detection in AudioWorklet to suppress speaker feedback",
        "default": True,
    },
    "voice.adaptive_vad_enabled": {
        "description": "Automatically adjust silence detection based on user speech patterns",
        "default": True,
    },
    "voice.elevenlabs_enabled": {
        "description": "Enable ElevenLabs as an alternative TTS provider",
        "default": True,
    },
    "voice.streaming_tts_enabled": {
        "description": "Stream audio chunks for lower latency playback",
        "default": True,
    },
    "voice.barge_in_enabled": {
        "description": "Allow users to interrupt AI responses by speaking",
        "default": True,
    },
    "voice.realtime_api_enabled": {
        "description": "Enable OpenAI Realtime API for voice conversations",
        "default": True,
    },
}


@router.get("/feature-flags")
async def get_voice_feature_flags(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get voice-specific feature flags.

    Available to admin and viewer roles.
    """
    flags = []

    for flag_name in VOICE_FEATURE_FLAGS:
        # Try to get from database
        flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()

        if flag:
            flags.append(
                {
                    "name": flag.name,
                    "description": flag.description,
                    "enabled": flag.enabled,
                    "rollout_percentage": flag.rollout_percentage or 100,
                    "updated_at": (flag.updated_at.isoformat() if flag.updated_at else None),
                }
            )
        else:
            # Return default if not in database
            definition = VOICE_FEATURE_FLAG_DEFINITIONS.get(flag_name, {})
            flags.append(
                {
                    "name": flag_name,
                    "description": definition.get("description", "No description"),
                    "enabled": definition.get("default", False),
                    "rollout_percentage": 100,
                    "updated_at": None,
                }
            )

    data = {
        "flags": flags,
        "total": len(flags),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Thinker-Talker Pipeline Endpoints
# ============================================================================


class TTSessionInfo(BaseModel):
    """Thinker-Talker session information."""

    session_id: str
    user_id: str
    user_email: Optional[str] = None
    state: str
    conversation_id: Optional[str] = None
    message_count: int = 0
    tool_calls_count: int = 0
    created_at: str
    last_activity: Optional[str] = None


class TTContextInfo(BaseModel):
    """Cached conversation context information."""

    conversation_id: str
    user_id: str
    message_count: int
    last_activity: str
    expires_at: Optional[str] = None


class QualityPresetInfo(BaseModel):
    """TTS quality preset configuration."""

    name: str
    model: str
    bitrate: Optional[str] = None
    sample_rate: Optional[int] = None
    description: Optional[str] = None
    enabled: bool = True


class TTAnalytics(BaseModel):
    """Thinker-Talker analytics data."""

    period: str
    total_sessions: int = 0
    unique_users: int = 0
    tool_calls_by_name: Dict[str, int] = Field(default_factory=dict)
    avg_response_latency_ms: float = 0.0
    avg_tool_latency_ms: float = 0.0
    success_rate: float = 100.0


# Redis keys for TT tracking
REDIS_TT_SESSIONS_KEY = "voiceassist:tt:sessions"
REDIS_TT_CONTEXTS_KEY = "voiceassist:tt:contexts"
REDIS_TT_ANALYTICS_KEY = "voiceassist:tt:analytics"


@router.get("/tt-sessions")
async def get_tt_sessions(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(50, ge=1, le=200),
) -> Dict:
    """Get active Thinker-Talker pipeline sessions.

    Shows sessions using the new TT voice pipeline (not legacy Realtime API).
    """
    sessions = []

    try:
        # Get TT sessions from Redis
        tt_sessions = redis_client.hgetall(REDIS_TT_SESSIONS_KEY)
        for sid, data in tt_sessions.items():
            if isinstance(sid, bytes):
                sid = sid.decode("utf-8")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            session_data = json.loads(data) if isinstance(data, str) else data
            sessions.append(
                {
                    "session_id": sid,
                    "user_id": session_data.get("user_id", ""),
                    "user_email": session_data.get("user_email"),
                    "state": session_data.get("state", "unknown"),
                    "conversation_id": session_data.get("conversation_id"),
                    "message_count": session_data.get("message_count", 0),
                    "tool_calls_count": session_data.get("tool_calls_count", 0),
                    "created_at": session_data.get("created_at", ""),
                    "last_activity": session_data.get("last_activity"),
                }
            )
    except Exception as e:
        logger.warning(f"Failed to get TT sessions from Redis: {e}")

    # Sort by created_at descending and limit
    sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    sessions = sessions[:limit]

    data = {
        "sessions": sessions,
        "total": len(sessions),
        "pipeline": "thinker-talker",
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/contexts")
async def get_tt_contexts(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(50, ge=1, le=200),
) -> Dict:
    """Get cached conversation contexts from ThinkerService.

    Shows active conversation contexts that are cached for voice mode.
    """
    contexts = []

    try:
        # Get context info from Redis
        ctx_data = redis_client.hgetall(REDIS_TT_CONTEXTS_KEY)
        for conv_id, data in ctx_data.items():
            if isinstance(conv_id, bytes):
                conv_id = conv_id.decode("utf-8")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            context_data = json.loads(data) if isinstance(data, str) else data
            contexts.append(
                {
                    "conversation_id": conv_id,
                    "user_id": context_data.get("user_id", ""),
                    "message_count": context_data.get("message_count", 0),
                    "last_activity": context_data.get("last_activity", ""),
                    "expires_at": context_data.get("expires_at"),
                }
            )
    except Exception as e:
        logger.warning(f"Failed to get TT contexts from Redis: {e}")

    # Sort by last_activity descending
    contexts.sort(key=lambda x: x.get("last_activity", ""), reverse=True)
    contexts = contexts[:limit]

    data = {
        "contexts": contexts,
        "total": len(contexts),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.post("/contexts/cleanup")
async def cleanup_tt_contexts(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
    max_age_minutes: int = Query(60, ge=5, le=1440),
) -> Dict:
    """Cleanup expired conversation contexts.

    Admin only. Removes contexts that haven't been accessed recently.
    """
    ensure_admin_privileges(current_admin_user)

    cleaned = 0
    cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)

    try:
        ctx_data = redis_client.hgetall(REDIS_TT_CONTEXTS_KEY)
        for conv_id, data in ctx_data.items():
            if isinstance(conv_id, bytes):
                conv_id = conv_id.decode("utf-8")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            context_data = json.loads(data) if isinstance(data, str) else data

            last_activity = context_data.get("last_activity")
            if last_activity:
                try:
                    last_dt = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                    if last_dt < cutoff_time:
                        redis_client.hdel(REDIS_TT_CONTEXTS_KEY, conv_id)
                        cleaned += 1
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Failed to cleanup TT contexts: {e}")

    # Log audit event
    log_audit_event(
        db=db,
        action="voice.tt.cleanup",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="tt_contexts",
        resource_id="all",
        success=True,
        details=json.dumps({"max_age_minutes": max_age_minutes, "cleaned_count": cleaned}),
        request=request,
    )

    data = {
        "cleaned": cleaned,
        "max_age_minutes": max_age_minutes,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/quality-presets")
async def get_quality_presets(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get TTS quality presets configuration.

    Shows available quality presets for the Talker service.
    """
    # Default quality presets (would be loaded from config in production)
    presets = [
        {
            "name": "standard",
            "model": "tts-1",
            "bitrate": "128k",
            "sample_rate": 24000,
            "description": "Fast synthesis, good quality",
            "enabled": True,
        },
        {
            "name": "high_quality",
            "model": "tts-1-hd",
            "bitrate": "192k",
            "sample_rate": 48000,
            "description": "Higher quality, slower synthesis",
            "enabled": True,
        },
        {
            "name": "realtime",
            "model": "gpt-4o-realtime-preview",
            "bitrate": None,
            "sample_rate": 24000,
            "description": "Real-time streaming, lowest latency",
            "enabled": realtime_voice_service.is_enabled(),
        },
    ]

    data = {
        "presets": presets,
        "default_preset": "standard",
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/analytics/tools")
async def get_tt_tool_analytics(
    request: Request,
    period: str = Query("24h", description="Time period: 24h, 7d, or 30d"),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get tool call analytics for the Thinker-Talker pipeline.

    Shows which tools are being called most frequently in voice mode.
    """
    valid_periods = ["24h", "7d", "30d"]
    if period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period. Must be one of: {', '.join(valid_periods)}",
        )

    # Get analytics from Redis cache
    analytics_key = f"{REDIS_TT_ANALYTICS_KEY}:tools:{period}"
    try:
        cached_data = redis_client.get(analytics_key)
        if cached_data:
            if isinstance(cached_data, bytes):
                cached_data = cached_data.decode("utf-8")
            data = json.loads(cached_data)
            data["period"] = period
            data["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
    except Exception as e:
        logger.warning(f"Failed to get TT tool analytics from cache: {e}")

    # Return default analytics
    data = {
        "period": period,
        "total_tool_calls": 0,
        "tool_calls_by_name": {},
        "avg_tool_latency_ms": 0.0,
        "success_rate": 100.0,
        "top_tools": [],
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.patch("/feature-flags/{flag_name:path}")
async def update_voice_feature_flag(
    request: Request,
    flag_name: str = Path(..., description="Feature flag name"),
    update: VoiceFeatureFlagUpdate = ...,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Update a voice feature flag.

    Admin only.
    """
    ensure_admin_privileges(current_admin_user)

    # Validate flag name
    if flag_name not in VOICE_FEATURE_FLAGS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown voice feature flag: {flag_name}",
        )

    # Get or create flag
    flag = db.query(FeatureFlag).filter(FeatureFlag.name == flag_name).first()
    definition = VOICE_FEATURE_FLAG_DEFINITIONS.get(flag_name, {})

    if not flag:
        # Create new flag
        flag = FeatureFlag(
            name=flag_name,
            description=definition.get("description", "No description"),
            flag_type="boolean",
            enabled=definition.get("default", False),
            rollout_percentage=100,
        )
        db.add(flag)

    # Store original values for audit
    original_values = {
        "enabled": flag.enabled,
        "rollout_percentage": flag.rollout_percentage,
    }

    # Apply updates
    if update.enabled is not None:
        flag.enabled = update.enabled
    if update.rollout_percentage is not None:
        flag.rollout_percentage = update.rollout_percentage

    flag.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(flag)

    # Log audit event
    log_audit_event(
        db=db,
        action="voice.feature_flag.update",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="voice_feature_flag",
        resource_id=flag_name,
        success=True,
        details=json.dumps(
            {
                "original": original_values,
                "updated": update.model_dump(exclude_unset=True),
            }
        ),
        request=request,
    )

    logger.info(
        f"Admin {current_admin_user.email} updated voice feature flag {flag_name}",
        extra={
            "admin_id": current_admin_user.id,
            "flag_name": flag_name,
            "changes": update.model_dump(exclude_unset=True),
        },
    )

    data = {
        "name": flag.name,
        "description": flag.description,
        "enabled": flag.enabled,
        "rollout_percentage": flag.rollout_percentage,
        "updated_at": flag.updated_at.isoformat() if flag.updated_at else None,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)
