"""Admin Voice API endpoints (Sprint 1 - Voice Monitor).

Provides voice/realtime session monitoring and management for the Admin Panel.

Endpoints:
- GET /api/admin/voice/sessions - List active WebSocket voice sessions
- GET /api/admin/voice/sessions/{id} - Get session details
- POST /api/admin/voice/sessions/{id}/disconnect - Force disconnect session
- GET /api/admin/voice/metrics - Voice metrics summary
- GET /api/admin/voice/health - Voice service health
- GET /api/admin/voice/config - Get voice configuration
- PATCH /api/admin/voice/config - Update voice configuration (admin only)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

# Import audit logging helper from admin_panel
from app.api.admin_panel import log_audit_event
from app.core.api_envelope import success_response
from app.core.config import settings
from app.core.database import get_db, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.user import User
from app.services.realtime_voice_service import realtime_voice_service
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/voice", tags=["admin", "voice"])

# Redis keys for voice session tracking
REDIS_VOICE_SESSIONS_KEY = "voiceassist:voice:sessions"
REDIS_VOICE_CONFIG_KEY = "voiceassist:voice:admin_config"
REDIS_VOICE_METRICS_KEY = "voiceassist:voice:metrics_24h"


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

    # Return default config with settings values
    return VoiceConfig(
        default_voice=getattr(settings, "TTS_VOICE", "alloy"),
        default_language="en",
        vad_enabled=True,
        vad_threshold=0.5,
        max_session_duration_sec=3600,
        stt_provider=getattr(settings, "STT_PROVIDER", "openai"),
        tts_provider=getattr(settings, "TTS_PROVIDER", "openai"),
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
