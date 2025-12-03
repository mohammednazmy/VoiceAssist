"""Admin Integrations API endpoints.

Provides administrative endpoints for managing external integrations:
- List all integrations with status
- Get integration details and configuration
- Update integration configuration
- Test integration connectivity
- Get integration metrics

RBAC:
- admin: Full access (read/write/test)
- viewer: Read-only access (list/details/metrics)
"""

import json
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import httpx
import redis
from app.api.admin_panel import log_audit_event
from app.core.api_envelope import success_response
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_admin_user
from app.core.logging import get_logger
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin/integrations", tags=["admin-integrations"])

# Redis client for caching integration status
try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

REDIS_INTEGRATION_METRICS_KEY = "admin:integration:metrics"


class IntegrationStatus(str, Enum):
    """Integration connection status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    DEGRADED = "degraded"
    NOT_CONFIGURED = "not_configured"


class IntegrationType(str, Enum):
    """Types of integrations."""

    DATABASE = "database"
    CACHE = "cache"
    VECTOR_DB = "vector_db"
    STORAGE = "storage"
    LLM = "llm"
    TTS = "tts"
    STT = "stt"
    REALTIME = "realtime"
    OAUTH = "oauth"
    MONITORING = "monitoring"
    EXTERNAL_API = "external_api"


class IntegrationSummary(BaseModel):
    """Summary of an integration for listing."""

    id: str
    name: str
    type: IntegrationType
    status: IntegrationStatus
    provider: str
    last_checked: Optional[str] = None
    error_message: Optional[str] = None


class IntegrationConfig(BaseModel):
    """Non-sensitive configuration for an integration."""

    host: Optional[str] = None
    port: Optional[int] = None
    enabled: Optional[bool] = None
    timeout_sec: Optional[int] = None
    model: Optional[str] = None
    endpoint: Optional[str] = None
    extra: Optional[dict] = None


class IntegrationDetail(BaseModel):
    """Detailed information about an integration."""

    id: str
    name: str
    type: IntegrationType
    status: IntegrationStatus
    provider: str
    description: str
    config: IntegrationConfig
    has_api_key: bool = False
    last_checked: Optional[str] = None
    error_message: Optional[str] = None
    metrics: Optional[dict] = None


class IntegrationConfigUpdate(BaseModel):
    """Request to update integration configuration."""

    enabled: Optional[bool] = None
    timeout_sec: Optional[int] = Field(None, ge=1, le=300)
    model: Optional[str] = None
    endpoint: Optional[str] = None
    extra: Optional[dict] = None


class TestResult(BaseModel):
    """Result of testing an integration."""

    success: bool
    latency_ms: float
    message: str
    details: Optional[dict] = None


class IntegrationMetrics(BaseModel):
    """Metrics for an integration."""

    integration_id: str
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    last_error: Optional[str] = None
    last_error_time: Optional[str] = None


# Integration definitions
INTEGRATIONS = {
    "postgres": {
        "name": "PostgreSQL Database",
        "type": IntegrationType.DATABASE,
        "provider": "PostgreSQL",
        "description": "Primary relational database for user data, sessions, and conversations.",
    },
    "redis": {
        "name": "Redis Cache",
        "type": IntegrationType.CACHE,
        "provider": "Redis",
        "description": "In-memory cache for sessions, rate limiting, and real-time data.",
    },
    "qdrant": {
        "name": "Qdrant Vector Database",
        "type": IntegrationType.VECTOR_DB,
        "provider": "Qdrant",
        "description": "Vector database for semantic search and knowledge base embeddings.",
    },
    "nextcloud": {
        "name": "Nextcloud Storage",
        "type": IntegrationType.STORAGE,
        "provider": "Nextcloud",
        "description": "File storage integration for document management.",
    },
    "openai": {
        "name": "OpenAI API",
        "type": IntegrationType.LLM,
        "provider": "OpenAI",
        "description": "Primary LLM provider for chat completions and embeddings.",
    },
    "openai_realtime": {
        "name": "OpenAI Realtime API",
        "type": IntegrationType.REALTIME,
        "provider": "OpenAI",
        "description": "WebSocket-based real-time voice conversation API.",
    },
    "openai_tts": {
        "name": "OpenAI TTS",
        "type": IntegrationType.TTS,
        "provider": "OpenAI",
        "description": "Text-to-speech synthesis using OpenAI voices.",
    },
    "openai_stt": {
        "name": "OpenAI Whisper STT",
        "type": IntegrationType.STT,
        "provider": "OpenAI",
        "description": "Speech-to-text transcription using Whisper.",
    },
    "elevenlabs": {
        "name": "ElevenLabs TTS",
        "type": IntegrationType.TTS,
        "provider": "ElevenLabs",
        "description": "High-quality neural text-to-speech synthesis.",
    },
    "deepgram": {
        "name": "Deepgram STT",
        "type": IntegrationType.STT,
        "provider": "Deepgram",
        "description": "Fast, accurate speech-to-text transcription.",
    },
    "google_oauth": {
        "name": "Google OAuth",
        "type": IntegrationType.OAUTH,
        "provider": "Google",
        "description": "Google authentication for user sign-in.",
    },
    "microsoft_oauth": {
        "name": "Microsoft OAuth",
        "type": IntegrationType.OAUTH,
        "provider": "Microsoft",
        "description": "Microsoft/Azure AD authentication for user sign-in.",
    },
    "sentry": {
        "name": "Sentry Error Tracking",
        "type": IntegrationType.MONITORING,
        "provider": "Sentry",
        "description": "Error tracking and performance monitoring.",
    },
    "opentelemetry": {
        "name": "OpenTelemetry Tracing",
        "type": IntegrationType.MONITORING,
        "provider": "OpenTelemetry",
        "description": "Distributed tracing for request flow analysis.",
    },
    "openevidence": {
        "name": "OpenEvidence API",
        "type": IntegrationType.EXTERNAL_API,
        "provider": "OpenEvidence",
        "description": "Medical evidence synthesis API.",
    },
    "pubmed": {
        "name": "PubMed API",
        "type": IntegrationType.EXTERNAL_API,
        "provider": "NCBI",
        "description": "Medical literature database API.",
    },
}


def get_integration_status(
    integration_id: str,
) -> tuple[IntegrationStatus, Optional[str]]:
    """Get the current status of an integration."""
    if integration_id == "postgres":
        try:
            from app.core.database import engine

            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return IntegrationStatus.CONNECTED, None
        except Exception as e:
            return IntegrationStatus.ERROR, str(e)

    elif integration_id == "redis":
        try:
            if redis_client and redis_client.ping():
                return IntegrationStatus.CONNECTED, None
            return IntegrationStatus.DISCONNECTED, "Redis ping failed"
        except Exception as e:
            return IntegrationStatus.ERROR, str(e)

    elif integration_id == "qdrant":
        if not settings.QDRANT_ENABLED:
            return IntegrationStatus.NOT_CONFIGURED, "Qdrant is disabled"
        try:
            resp = httpx.get(f"{settings.QDRANT_URL}/collections", timeout=5.0)
            if resp.status_code == 200:
                return IntegrationStatus.CONNECTED, None
            return IntegrationStatus.ERROR, f"HTTP {resp.status_code}"
        except Exception as e:
            return IntegrationStatus.ERROR, str(e)

    elif integration_id == "nextcloud":
        try:
            resp = httpx.get(
                f"{settings.NEXTCLOUD_URL}/status.php",
                timeout=5.0,
                follow_redirects=True,
            )
            if resp.status_code == 200:
                return IntegrationStatus.CONNECTED, None
            return IntegrationStatus.ERROR, f"HTTP {resp.status_code}"
        except Exception as e:
            return IntegrationStatus.ERROR, str(e)

    elif integration_id == "openai":
        if not settings.OPENAI_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None  # Assume configured = connected

    elif integration_id == "openai_realtime":
        if not settings.REALTIME_ENABLED:
            return IntegrationStatus.NOT_CONFIGURED, "Realtime API disabled"
        if not settings.OPENAI_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id in ("openai_tts", "openai_stt"):
        if not settings.OPENAI_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "elevenlabs":
        if not settings.ELEVENLABS_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "deepgram":
        if not settings.DEEPGRAM_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "google_oauth":
        if not settings.GOOGLE_CLIENT_ID:
            return IntegrationStatus.NOT_CONFIGURED, "Client ID not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "microsoft_oauth":
        if not settings.MICROSOFT_CLIENT_ID:
            return IntegrationStatus.NOT_CONFIGURED, "Client ID not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "sentry":
        if not settings.SENTRY_DSN:
            return IntegrationStatus.NOT_CONFIGURED, "DSN not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "opentelemetry":
        if not settings.TRACING_ENABLED:
            return IntegrationStatus.NOT_CONFIGURED, "Tracing disabled"
        if not settings.OTLP_ENDPOINT and not settings.JAEGER_HOST:
            return IntegrationStatus.NOT_CONFIGURED, "No endpoint configured"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "openevidence":
        if not settings.OPENEVIDENCE_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    elif integration_id == "pubmed":
        if not settings.PUBMED_API_KEY:
            return IntegrationStatus.NOT_CONFIGURED, "API key not set"
        return IntegrationStatus.CONNECTED, None

    return IntegrationStatus.NOT_CONFIGURED, "Unknown integration"


def get_integration_config(integration_id: str) -> IntegrationConfig:
    """Get non-sensitive configuration for an integration."""
    if integration_id == "postgres":
        return IntegrationConfig(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            extra={"database": settings.POSTGRES_DB},
        )
    elif integration_id == "redis":
        return IntegrationConfig(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
        )
    elif integration_id == "qdrant":
        return IntegrationConfig(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            enabled=settings.QDRANT_ENABLED,
        )
    elif integration_id == "nextcloud":
        return IntegrationConfig(
            endpoint=settings.NEXTCLOUD_URL,
        )
    elif integration_id == "openai":
        return IntegrationConfig(
            timeout_sec=settings.OPENAI_TIMEOUT_SEC,
            model=settings.MODEL_SELECTION_DEFAULT,
        )
    elif integration_id == "openai_realtime":
        return IntegrationConfig(
            enabled=settings.REALTIME_ENABLED,
            model=settings.REALTIME_MODEL,
            endpoint=settings.REALTIME_BASE_URL,
            extra={"token_expiry_sec": settings.REALTIME_TOKEN_EXPIRY_SEC},
        )
    elif integration_id == "openai_tts":
        return IntegrationConfig(
            model="tts-1",
            extra={"voice": settings.TTS_VOICE or "alloy"},
        )
    elif integration_id == "openai_stt":
        return IntegrationConfig(
            model="whisper-1",
        )
    elif integration_id == "elevenlabs":
        return IntegrationConfig(
            endpoint=settings.TTS_ENDPOINT,
        )
    elif integration_id == "deepgram":
        return IntegrationConfig(
            endpoint=settings.STT_ENDPOINT,
        )
    elif integration_id == "google_oauth":
        return IntegrationConfig(
            extra={"redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI},
        )
    elif integration_id == "microsoft_oauth":
        return IntegrationConfig(
            extra={"redirect_uri": settings.MICROSOFT_OAUTH_REDIRECT_URI},
        )
    elif integration_id == "sentry":
        return IntegrationConfig(
            extra={
                "traces_sample_rate": settings.SENTRY_TRACES_SAMPLE_RATE,
                "profiles_sample_rate": settings.SENTRY_PROFILES_SAMPLE_RATE,
            },
        )
    elif integration_id == "opentelemetry":
        return IntegrationConfig(
            enabled=settings.TRACING_ENABLED,
            endpoint=settings.OTLP_ENDPOINT,
            extra={"jaeger_host": settings.JAEGER_HOST},
        )
    elif integration_id == "openevidence":
        return IntegrationConfig(
            endpoint=settings.OPENEVIDENCE_BASE_URL,
            extra={"sync_minutes": settings.OPENEVIDENCE_SYNC_MINUTES},
        )
    elif integration_id == "pubmed":
        return IntegrationConfig(
            extra={"sync_minutes": settings.PUBMED_SYNC_MINUTES},
        )
    return IntegrationConfig()


def has_api_key(integration_id: str) -> bool:
    """Check if an integration has an API key configured."""
    key_map = {
        "openai": settings.OPENAI_API_KEY,
        "openai_realtime": settings.OPENAI_API_KEY,
        "openai_tts": settings.OPENAI_API_KEY,
        "openai_stt": settings.OPENAI_API_KEY,
        "elevenlabs": settings.ELEVENLABS_API_KEY,
        "deepgram": settings.DEEPGRAM_API_KEY,
        "google_oauth": settings.GOOGLE_CLIENT_SECRET,
        "microsoft_oauth": settings.MICROSOFT_CLIENT_SECRET,
        "openevidence": settings.OPENEVIDENCE_API_KEY,
        "pubmed": settings.PUBMED_API_KEY,
    }
    return bool(key_map.get(integration_id))


# Endpoints


@router.get("/")
async def list_integrations(
    admin_user: User = Depends(get_current_admin_user),
) -> dict:
    """List all integrations with their current status.

    Available to both admin and viewer roles.
    """
    now = datetime.now(timezone.utc).isoformat()
    result = []

    for int_id, info in INTEGRATIONS.items():
        int_status, error = get_integration_status(int_id)
        result.append(
            IntegrationSummary(
                id=int_id,
                name=info["name"],
                type=info["type"],
                status=int_status,
                provider=info["provider"],
                last_checked=now,
                error_message=error,
            ).model_dump()
        )

    return success_response(result)


@router.get("/health")
async def get_integrations_health(
    admin_user: User = Depends(get_current_admin_user),
) -> dict:
    """Get overall health summary of all integrations.

    Available to both admin and viewer roles.
    """
    total = len(INTEGRATIONS)
    connected = 0
    degraded = 0
    errors = 0
    not_configured = 0

    for int_id in INTEGRATIONS:
        int_status, _ = get_integration_status(int_id)
        if int_status == IntegrationStatus.CONNECTED:
            connected += 1
        elif int_status == IntegrationStatus.DEGRADED:
            degraded += 1
        elif int_status == IntegrationStatus.ERROR:
            errors += 1
        elif int_status == IntegrationStatus.NOT_CONFIGURED:
            not_configured += 1

    overall = "healthy"
    if errors > 0:
        overall = "unhealthy"
    elif degraded > 0:
        overall = "degraded"
    elif connected == 0:
        overall = "critical"

    return success_response(
        {
            "overall_status": overall,
            "total_integrations": total,
            "connected": connected,
            "degraded": degraded,
            "errors": errors,
            "not_configured": not_configured,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    )


@router.get("/metrics/summary")
async def get_integration_metrics(
    admin_user: User = Depends(get_current_admin_user),
) -> dict:
    """Get metrics for all integrations.

    Available to both admin and viewer roles.

    Note: This returns mock data in the current implementation.
    Real metrics would come from Prometheus/metrics collection.
    """
    # In a real implementation, this would query Prometheus or
    # read from Redis counters. For now, return placeholder metrics.
    result = []
    for int_id in INTEGRATIONS:
        metrics_key = f"admin:integration:{int_id}:metrics"
        metrics_data = {}

        if redis_client:
            try:
                data = redis_client.get(metrics_key)
                if data:
                    metrics_data = json.loads(data)
            except Exception:
                pass

        result.append(
            IntegrationMetrics(
                integration_id=int_id,
                total_requests=metrics_data.get("total_requests", 0),
                successful_requests=metrics_data.get("successful_requests", 0),
                failed_requests=metrics_data.get("failed_requests", 0),
                avg_latency_ms=metrics_data.get("avg_latency_ms", 0.0),
                p99_latency_ms=metrics_data.get("p99_latency_ms", 0.0),
                last_error=metrics_data.get("last_error"),
                last_error_time=metrics_data.get("last_error_time"),
            ).model_dump()
        )

    return success_response(result)


@router.get("/{integration_id}")
async def get_integration(
    integration_id: str,
    admin_user: User = Depends(get_current_admin_user),
) -> dict:
    """Get detailed information about a specific integration.

    Available to both admin and viewer roles.
    """
    if integration_id not in INTEGRATIONS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{integration_id}' not found",
        )

    info = INTEGRATIONS[integration_id]
    int_status, error = get_integration_status(integration_id)
    config = get_integration_config(integration_id)

    return success_response(
        IntegrationDetail(
            id=integration_id,
            name=info["name"],
            type=info["type"],
            status=int_status,
            provider=info["provider"],
            description=info["description"],
            config=config,
            has_api_key=has_api_key(integration_id),
            last_checked=datetime.now(timezone.utc).isoformat(),
            error_message=error,
        ).model_dump()
    )


@router.patch("/{integration_id}/config")
async def update_integration_config(
    integration_id: str,
    config_update: IntegrationConfigUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    """Update configuration for an integration.

    Admin role required.

    Note: This endpoint updates runtime configuration stored in Redis.
    Persistent configuration changes require environment variable updates.
    """
    if admin_user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for configuration updates",
        )

    if integration_id not in INTEGRATIONS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{integration_id}' not found",
        )

    # Store runtime config override in Redis
    config_key = f"admin:integration:{integration_id}:config"
    if redis_client:
        existing = redis_client.get(config_key)
        existing_config = json.loads(existing) if existing else {}
        update_data = config_update.model_dump(exclude_none=True)
        existing_config.update(update_data)
        redis_client.set(config_key, json.dumps(existing_config))

    # Log audit event
    log_audit_event(
        db,
        action="integration_config_update",
        user_id=str(admin_user.id),
        user_email=admin_user.email,
        resource_type="integration",
        resource_id=integration_id,
        success=True,
        details=json.dumps({"updates": config_update.model_dump(exclude_none=True)}),
    )

    return await get_integration(integration_id, admin_user)


@router.post("/{integration_id}/test")
async def test_integration(
    integration_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    """Test connectivity for an integration.

    Admin role required.
    """
    if admin_user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for integration testing",
        )

    if integration_id not in INTEGRATIONS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{integration_id}' not found",
        )

    start_time = time.time()
    success = False
    message = ""
    details = {}

    try:
        if integration_id == "postgres":
            from app.core.database import engine

            with engine.connect() as conn:
                result = conn.execute(text("SELECT version()"))
                row = result.fetchone()
                details["version"] = row[0] if row else "unknown"
            success = True
            message = "PostgreSQL connection successful"

        elif integration_id == "redis":
            if redis_client:
                info = redis_client.info()
                details["redis_version"] = info.get("redis_version")
                details["connected_clients"] = info.get("connected_clients")
                success = True
                message = "Redis connection successful"
            else:
                message = "Redis client not initialized"

        elif integration_id == "qdrant":
            resp = httpx.get(f"{settings.QDRANT_URL}/collections", timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                details["collections_count"] = len(data.get("result", {}).get("collections", []))
                success = True
                message = "Qdrant connection successful"
            else:
                message = f"Qdrant returned HTTP {resp.status_code}"

        elif integration_id == "nextcloud":
            resp = httpx.get(
                f"{settings.NEXTCLOUD_URL}/status.php",
                timeout=10.0,
                follow_redirects=True,
            )
            if resp.status_code == 200:
                data = resp.json()
                details["version"] = data.get("version")
                details["installed"] = data.get("installed")
                success = True
                message = "Nextcloud connection successful"
            else:
                message = f"Nextcloud returned HTTP {resp.status_code}"

        elif integration_id == "openai":
            if not settings.OPENAI_API_KEY:
                message = "OpenAI API key not configured"
            else:
                # Test with a minimal API call (models list)
                resp = httpx.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    success = True
                    message = "OpenAI API connection successful"
                else:
                    message = f"OpenAI returned HTTP {resp.status_code}"

        elif integration_id in ("openai_realtime", "openai_tts", "openai_stt"):
            # These share the OpenAI API key
            if not settings.OPENAI_API_KEY:
                message = "OpenAI API key not configured"
            else:
                success = True
                message = f"{INTEGRATIONS[integration_id]['name']} is configured"

        elif integration_id == "elevenlabs":
            if not settings.ELEVENLABS_API_KEY:
                message = "ElevenLabs API key not configured"
            else:
                resp = httpx.get(
                    "https://api.elevenlabs.io/v1/user",
                    headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    success = True
                    message = "ElevenLabs API connection successful"
                else:
                    message = f"ElevenLabs returned HTTP {resp.status_code}"

        elif integration_id == "deepgram":
            if not settings.DEEPGRAM_API_KEY:
                message = "Deepgram API key not configured"
            else:
                # Test with projects endpoint
                resp = httpx.get(
                    "https://api.deepgram.com/v1/projects",
                    headers={"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    success = True
                    message = "Deepgram API connection successful"
                else:
                    message = f"Deepgram returned HTTP {resp.status_code}"

        elif integration_id in ("google_oauth", "microsoft_oauth"):
            # OAuth configs can't be easily tested without user interaction
            if integration_id == "google_oauth" and settings.GOOGLE_CLIENT_ID:
                success = True
                message = "Google OAuth is configured"
            elif integration_id == "microsoft_oauth" and settings.MICROSOFT_CLIENT_ID:
                success = True
                message = "Microsoft OAuth is configured"
            else:
                message = "OAuth client ID not configured"

        elif integration_id == "sentry":
            if settings.SENTRY_DSN:
                success = True
                message = "Sentry DSN is configured"
            else:
                message = "Sentry DSN not configured"

        elif integration_id == "opentelemetry":
            if settings.TRACING_ENABLED and (settings.OTLP_ENDPOINT or settings.JAEGER_HOST):
                success = True
                message = "OpenTelemetry is configured"
            else:
                message = "OpenTelemetry not configured or disabled"

        elif integration_id == "openevidence":
            if not settings.OPENEVIDENCE_API_KEY:
                message = "OpenEvidence API key not configured"
            else:
                success = True
                message = "OpenEvidence is configured"

        elif integration_id == "pubmed":
            # PubMed can work without API key (with rate limits)
            resp = httpx.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?retmode=json",
                timeout=10.0,
            )
            if resp.status_code == 200:
                success = True
                message = "PubMed API connection successful"
            else:
                message = f"PubMed returned HTTP {resp.status_code}"

        else:
            message = f"Test not implemented for {integration_id}"

    except Exception as e:
        message = f"Test failed: {str(e)}"
        details["error"] = str(e)

    latency_ms = (time.time() - start_time) * 1000

    # Log audit event
    log_audit_event(
        db,
        action="integration_test",
        user_id=str(admin_user.id),
        user_email=admin_user.email,
        resource_type="integration",
        resource_id=integration_id,
        success=success,
        details=json.dumps({"latency_ms": latency_ms, "message": message}),
    )

    return success_response(
        TestResult(
            success=success,
            latency_ms=round(latency_ms, 2),
            message=message,
            details=details if details else None,
        ).model_dump()
    )


# =============================================================================
# System API Key Management Endpoints
# =============================================================================


class SystemKeyInfo(BaseModel):
    """Information about a system API key."""

    integration_id: str
    key_name: str
    is_configured: bool
    source: str  # "database", "environment", "not_configured"
    masked_value: Optional[str] = None
    is_override: bool = False
    validation_status: Optional[str] = None
    last_validated_at: Optional[str] = None
    updated_at: Optional[str] = None


class SystemKeyUpdate(BaseModel):
    """Request to update a system API key."""

    value: str = Field(..., min_length=1, description="The API key value")


class SystemKeySummary(BaseModel):
    """Summary of all system API keys."""

    total: int
    configured: int
    overridden: int
    keys: list[SystemKeyInfo]


@router.get("/api-keys/summary", response_model=dict)
async def get_system_keys_summary(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Get summary of all system API keys.

    Returns configuration status for all known integrations.
    Requires admin role.
    """
    from app.services.system_key_service import system_key_service

    keys = system_key_service.list_all_keys(db)

    configured = sum(1 for k in keys if k["is_configured"])
    overridden = sum(1 for k in keys if k["is_override"])

    return success_response(
        SystemKeySummary(
            total=len(keys),
            configured=configured,
            overridden=overridden,
            keys=[SystemKeyInfo(**k) for k in keys],
        ).model_dump()
    )


@router.get("/{integration_id}/api-key", response_model=dict)
async def get_system_key_info(
    integration_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Get information about a system API key.

    Returns configuration status without exposing the actual value.
    Requires admin role.
    """
    from app.services.system_key_service import system_key_service

    info = system_key_service.get_key_info(db, integration_id)
    return success_response(SystemKeyInfo(**info).model_dump())


@router.put("/{integration_id}/api-key", response_model=dict)
async def set_system_key(
    integration_id: str,
    update: SystemKeyUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Set or update a system API key.

    Creates a database override for the environment variable.
    The key is encrypted before storage.
    Requires admin role.
    """
    from app.services.system_key_service import system_key_service

    # Only allow actual admin role (not viewer)
    if admin_user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can modify API keys",
        )

    try:
        system_key_service.set_key(
            db=db,
            integration_id=integration_id,
            value=update.value,
            user_id=admin_user.id,
        )

        # Log audit event
        log_audit_event(
            db,
            action="system_key_updated",
            user_id=str(admin_user.id),
            user_email=admin_user.email,
            resource_type="system_api_key",
            resource_id=integration_id,
            success=True,
            details=json.dumps({"source": "database"}),
        )

        info = system_key_service.get_key_info(db, integration_id)
        return success_response(
            {
                "message": f"API key for {integration_id} updated successfully",
                "key": SystemKeyInfo(**info).model_dump(),
            }
        )

    except Exception as e:
        logger.error(f"Failed to set system key for {integration_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update API key",
        )


@router.delete("/{integration_id}/api-key", response_model=dict)
async def clear_system_key_override(
    integration_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Clear the database override for a system API key.

    Reverts to using the environment variable value.
    Requires admin role.
    """
    from app.services.system_key_service import system_key_service

    # Only allow actual admin role (not viewer)
    if admin_user.admin_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can modify API keys",
        )

    cleared = system_key_service.clear_override(db, integration_id)

    if cleared:
        # Log audit event
        log_audit_event(
            db,
            action="system_key_override_cleared",
            user_id=str(admin_user.id),
            user_email=admin_user.email,
            resource_type="system_api_key",
            resource_id=integration_id,
            success=True,
            details=json.dumps({"reverted_to": "environment"}),
        )

    info = system_key_service.get_key_info(db, integration_id)
    return success_response(
        {
            "message": f"Override cleared for {integration_id}, now using environment value",
            "key": SystemKeyInfo(**info).model_dump(),
        }
    )


@router.post("/{integration_id}/api-key/validate", response_model=dict)
async def validate_system_key(
    integration_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Validate a system API key by testing the connection.

    Updates the validation status in the database.
    Requires admin role.
    """
    from app.services.system_key_service import system_key_service

    # Get the current key value
    key_value = system_key_service.get_key(db, integration_id)

    if not key_value:
        system_key_service.update_validation_status(db, integration_id, "not_configured")
        return success_response(
            {
                "valid": False,
                "status": "not_configured",
                "message": f"No API key configured for {integration_id}",
            }
        )

    # Validate based on integration type
    valid = False
    message = "Validation not implemented"

    try:
        if integration_id == "openai":
            # Test OpenAI API
            resp = httpx.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key_value}"},
                timeout=10.0,
            )
            valid = resp.status_code == 200
            message = "OpenAI API key is valid" if valid else f"OpenAI returned HTTP {resp.status_code}"

        elif integration_id == "elevenlabs":
            # Test ElevenLabs API
            resp = httpx.get(
                "https://api.elevenlabs.io/v1/user",
                headers={"xi-api-key": key_value},
                timeout=10.0,
            )
            valid = resp.status_code == 200
            message = "ElevenLabs API key is valid" if valid else f"ElevenLabs returned HTTP {resp.status_code}"

        elif integration_id == "deepgram":
            # Test Deepgram API
            resp = httpx.get(
                "https://api.deepgram.com/v1/projects",
                headers={"Authorization": f"Token {key_value}"},
                timeout=10.0,
            )
            valid = resp.status_code == 200
            message = "Deepgram API key is valid" if valid else f"Deepgram returned HTTP {resp.status_code}"

        elif integration_id == "pubmed":
            # PubMed key validation (enhanced rate limits with key)
            resp = httpx.get(
                f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?retmode=json&api_key={key_value}",
                timeout=10.0,
            )
            valid = resp.status_code == 200
            message = "PubMed API key is valid" if valid else f"PubMed returned HTTP {resp.status_code}"

        else:
            # For other integrations, just mark as "assumed valid" since we can't test
            valid = True
            message = f"Key for {integration_id} assumed valid (no validation endpoint)"

    except Exception as e:
        message = f"Validation failed: {str(e)}"

    # Update status
    status_value = "valid" if valid else "invalid"
    system_key_service.update_validation_status(db, integration_id, status_value)

    # Log audit event
    log_audit_event(
        db,
        action="system_key_validated",
        user_id=str(admin_user.id),
        user_email=admin_user.email,
        resource_type="system_api_key",
        resource_id=integration_id,
        success=valid,
        details=json.dumps({"status": status_value, "message": message}),
    )

    return success_response(
        {
            "valid": valid,
            "status": status_value,
            "message": message,
        }
    )
