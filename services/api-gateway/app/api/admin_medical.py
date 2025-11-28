"""Admin Medical AI API endpoints (Sprint 4 - Enhanced Analytics).

Provides admin endpoints for:
- AI model usage metrics and cost tracking
- Search analytics and statistics
- Model routing configuration
- Embedding database stats
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.api_envelope import success_response
from app.core.database import get_db, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/medical", tags=["admin", "medical"])

# Redis keys for metrics caching
REDIS_MODEL_METRICS_KEY = "voiceassist:admin:model_metrics"
REDIS_SEARCH_STATS_KEY = "voiceassist:admin:search_stats"
METRICS_CACHE_TTL = 300  # 5 minutes


# ============================================================================
# Pydantic Models
# ============================================================================


class ModelInfo(BaseModel):
    """Model information."""

    id: str
    name: str
    provider: str  # "openai", "anthropic", "local"
    type: str  # "chat", "embedding", "tts", "stt"
    enabled: bool
    is_primary: bool
    supports_phi: bool  # Whether it can handle PHI (local models only)
    context_window: int
    cost_per_1k_input: float
    cost_per_1k_output: float


class ModelUsageMetrics(BaseModel):
    """Model usage metrics."""

    total_requests_24h: int
    total_tokens_input_24h: int
    total_tokens_output_24h: int
    estimated_cost_24h: float
    avg_latency_ms: float
    p95_latency_ms: float
    error_rate: float
    cloud_requests: int
    local_requests: int
    cloud_percentage: float


class ModelBreakdown(BaseModel):
    """Per-model breakdown."""

    model_id: str
    model_name: str
    provider: str
    requests: int
    tokens_input: int
    tokens_output: int
    estimated_cost: float
    avg_latency_ms: float


class SearchStats(BaseModel):
    """Search analytics statistics."""

    total_searches_24h: int
    avg_latency_ms: float
    p95_latency_ms: float
    cache_hit_rate: float
    top_queries: List[Dict[str, Any]]
    search_types: Dict[str, int]  # semantic, keyword, hybrid
    no_results_rate: float


class EmbeddingStats(BaseModel):
    """Embedding database statistics."""

    total_documents: int
    total_chunks: int
    total_embeddings: int
    embedding_dimensions: int
    index_size_mb: float
    last_indexed_at: Optional[str]


class RoutingConfig(BaseModel):
    """Model routing configuration."""

    phi_detection_enabled: bool
    phi_route_to_local: bool
    default_chat_model: str
    default_embedding_model: str
    fallback_enabled: bool
    fallback_model: Optional[str]


class RoutingConfigUpdate(BaseModel):
    """Update model for routing configuration."""

    phi_detection_enabled: Optional[bool] = None
    phi_route_to_local: Optional[bool] = None
    default_chat_model: Optional[str] = None
    default_embedding_model: Optional[str] = None
    fallback_enabled: Optional[bool] = None
    fallback_model: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


def _get_model_metrics_from_redis() -> Dict[str, Any]:
    """Fetch model usage metrics from Redis counters."""
    try:
        # Get metrics from Redis - these would be populated by the actual LLM client
        metrics_key = "voiceassist:metrics:model_usage"
        cached = redis_client.get(metrics_key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Failed to get model metrics from Redis: {e}")

    # Return mock/default metrics if Redis fails
    return {
        "total_requests_24h": 0,
        "total_tokens_input_24h": 0,
        "total_tokens_output_24h": 0,
        "cloud_requests": 0,
        "local_requests": 0,
        "latencies_ms": [],
        "errors": 0,
        "by_model": {},
    }


def _calculate_cost(tokens_input: int, tokens_output: int, model: str) -> float:
    """Calculate estimated cost based on token usage."""
    # Cost per 1K tokens (approximate pricing)
    pricing = {
        "gpt-4": {"input": 0.03, "output": 0.06},
        "gpt-4-turbo": {"input": 0.01, "output": 0.03},
        "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
        "claude-3-opus": {"input": 0.015, "output": 0.075},
        "claude-3-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
        "text-embedding-3-small": {"input": 0.00002, "output": 0},
        "text-embedding-3-large": {"input": 0.00013, "output": 0},
        "local": {"input": 0, "output": 0},  # Local models have no API cost
    }

    model_pricing = pricing.get(model, pricing.get("gpt-4-turbo"))
    input_cost = (tokens_input / 1000) * model_pricing["input"]
    output_cost = (tokens_output / 1000) * model_pricing["output"]
    return round(input_cost + output_cost, 4)


def _get_search_stats_from_redis() -> Dict[str, Any]:
    """Fetch search statistics from Redis."""
    try:
        stats_key = "voiceassist:metrics:search_stats"
        cached = redis_client.get(stats_key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Failed to get search stats from Redis: {e}")

    return {
        "total_searches_24h": 0,
        "latencies_ms": [],
        "cache_hits": 0,
        "cache_misses": 0,
        "search_types": {"semantic": 0, "keyword": 0, "hybrid": 0},
        "no_results": 0,
        "top_queries": [],
    }


# ============================================================================
# Model Management Endpoints
# ============================================================================


@router.get("/models")
async def list_available_models(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """List all available AI models with their configuration."""

    # Define available models (in production, this would come from configuration)
    models = [
        ModelInfo(
            id="gpt-4-turbo",
            name="GPT-4 Turbo",
            provider="openai",
            type="chat",
            enabled=True,
            is_primary=True,
            supports_phi=False,
            context_window=128000,
            cost_per_1k_input=0.01,
            cost_per_1k_output=0.03,
        ),
        ModelInfo(
            id="gpt-3.5-turbo",
            name="GPT-3.5 Turbo",
            provider="openai",
            type="chat",
            enabled=True,
            is_primary=False,
            supports_phi=False,
            context_window=16385,
            cost_per_1k_input=0.0005,
            cost_per_1k_output=0.0015,
        ),
        ModelInfo(
            id="claude-3-sonnet",
            name="Claude 3 Sonnet",
            provider="anthropic",
            type="chat",
            enabled=True,
            is_primary=False,
            supports_phi=False,
            context_window=200000,
            cost_per_1k_input=0.003,
            cost_per_1k_output=0.015,
        ),
        ModelInfo(
            id="text-embedding-3-large",
            name="Text Embedding 3 Large",
            provider="openai",
            type="embedding",
            enabled=True,
            is_primary=True,
            supports_phi=False,
            context_window=8191,
            cost_per_1k_input=0.00013,
            cost_per_1k_output=0,
        ),
        ModelInfo(
            id="local-llama",
            name="Local Llama 3.1",
            provider="local",
            type="chat",
            enabled=True,
            is_primary=False,
            supports_phi=True,
            context_window=8192,
            cost_per_1k_input=0,
            cost_per_1k_output=0,
        ),
    ]

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            "models": [m.model_dump() for m in models],
            "total": len(models),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.get("/models/{model_id}")
async def get_model_details(
    request: Request,
    model_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get detailed information about a specific model."""

    # In production, fetch from configuration store
    # For now, return a structured response
    trace_id = getattr(request.state, "trace_id", None)

    model_details = {
        "id": model_id,
        "name": model_id.replace("-", " ").title(),
        "provider": "openai" if "gpt" in model_id else "anthropic" if "claude" in model_id else "local",
        "type": "embedding" if "embedding" in model_id else "chat",
        "enabled": True,
        "configuration": {
            "temperature": 0.7,
            "max_tokens": 4096,
            "top_p": 1.0,
        },
        "usage_24h": {
            "requests": 1250,
            "tokens_input": 450000,
            "tokens_output": 125000,
            "estimated_cost": _calculate_cost(450000, 125000, model_id),
        },
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    return success_response(data=model_details, trace_id=trace_id)


# ============================================================================
# Metrics Endpoints
# ============================================================================


@router.get("/metrics")
async def get_model_usage_metrics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(1, ge=1, le=30),
) -> Dict:
    """Get AI model usage metrics and cost tracking."""

    # Try to get from cache first
    cache_key = f"{REDIS_MODEL_METRICS_KEY}:{days}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data=json.loads(cached), trace_id=trace_id)
    except Exception:
        pass

    # Get raw metrics from Redis counters
    raw_metrics = _get_model_metrics_from_redis()

    total_requests = raw_metrics.get("total_requests_24h", 0)
    total_tokens_in = raw_metrics.get("total_tokens_input_24h", 0)
    total_tokens_out = raw_metrics.get("total_tokens_output_24h", 0)
    cloud_requests = raw_metrics.get("cloud_requests", 0)
    local_requests = raw_metrics.get("local_requests", 0)
    latencies = raw_metrics.get("latencies_ms", [])
    errors = raw_metrics.get("errors", 0)

    # Calculate aggregate metrics
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    sorted_latencies = sorted(latencies)
    p95_latency = sorted_latencies[int(len(sorted_latencies) * 0.95)] if latencies else 0
    error_rate = (errors / total_requests * 100) if total_requests > 0 else 0
    cloud_percentage = (cloud_requests / total_requests * 100) if total_requests > 0 else 0

    # Calculate estimated cost
    estimated_cost = _calculate_cost(total_tokens_in, total_tokens_out, "gpt-4-turbo")

    metrics = ModelUsageMetrics(
        total_requests_24h=total_requests,
        total_tokens_input_24h=total_tokens_in,
        total_tokens_output_24h=total_tokens_out,
        estimated_cost_24h=estimated_cost,
        avg_latency_ms=round(avg_latency, 2),
        p95_latency_ms=round(p95_latency, 2),
        error_rate=round(error_rate, 2),
        cloud_requests=cloud_requests,
        local_requests=local_requests,
        cloud_percentage=round(cloud_percentage, 1),
    )

    # Build per-model breakdown
    by_model = raw_metrics.get("by_model", {})
    model_breakdown = []
    for model_id, model_data in by_model.items():
        model_breakdown.append(
            ModelBreakdown(
                model_id=model_id,
                model_name=model_id.replace("-", " ").title(),
                provider="openai" if "gpt" in model_id else "anthropic" if "claude" in model_id else "local",
                requests=model_data.get("requests", 0),
                tokens_input=model_data.get("tokens_input", 0),
                tokens_output=model_data.get("tokens_output", 0),
                estimated_cost=_calculate_cost(
                    model_data.get("tokens_input", 0), model_data.get("tokens_output", 0), model_id
                ),
                avg_latency_ms=model_data.get("avg_latency_ms", 0),
            ).model_dump()
        )

    response_data = {
        **metrics.model_dump(),
        "model_breakdown": model_breakdown,
        "period_days": days,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    # Cache the response
    try:
        redis_client.setex(cache_key, METRICS_CACHE_TTL, json.dumps(response_data))
    except Exception:
        pass

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data=response_data, trace_id=trace_id)


@router.get("/search/stats")
async def get_search_statistics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(1, ge=1, le=30),
) -> Dict:
    """Get search analytics and statistics."""

    # Try cache first
    cache_key = f"{REDIS_SEARCH_STATS_KEY}:{days}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data=json.loads(cached), trace_id=trace_id)
    except Exception:
        pass

    # Get raw stats
    raw_stats = _get_search_stats_from_redis()

    total_searches = raw_stats.get("total_searches_24h", 0)
    latencies = raw_stats.get("latencies_ms", [])
    cache_hits = raw_stats.get("cache_hits", 0)
    cache_misses = raw_stats.get("cache_misses", 0)
    no_results = raw_stats.get("no_results", 0)

    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    sorted_latencies = sorted(latencies)
    p95_latency = sorted_latencies[int(len(sorted_latencies) * 0.95)] if latencies else 0
    total_cache_requests = cache_hits + cache_misses
    cache_hit_rate = (cache_hits / total_cache_requests * 100) if total_cache_requests > 0 else 0
    no_results_rate = (no_results / total_searches * 100) if total_searches > 0 else 0

    stats = SearchStats(
        total_searches_24h=total_searches,
        avg_latency_ms=round(avg_latency, 2),
        p95_latency_ms=round(p95_latency, 2),
        cache_hit_rate=round(cache_hit_rate, 1),
        top_queries=raw_stats.get("top_queries", [])[:10],
        search_types=raw_stats.get("search_types", {"semantic": 0, "keyword": 0, "hybrid": 0}),
        no_results_rate=round(no_results_rate, 1),
    )

    response_data = {
        **stats.model_dump(),
        "period_days": days,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    # Cache response
    try:
        redis_client.setex(cache_key, METRICS_CACHE_TTL, json.dumps(response_data))
    except Exception:
        pass

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data=response_data, trace_id=trace_id)


@router.get("/embeddings/stats")
async def get_embedding_statistics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get embedding database statistics."""

    # In production, this would query the actual vector database
    # For now, return structured mock data
    stats = EmbeddingStats(
        total_documents=1250,
        total_chunks=45000,
        total_embeddings=45000,
        embedding_dimensions=3072,  # text-embedding-3-large dimensions
        index_size_mb=524.5,
        last_indexed_at=datetime.now(timezone.utc).isoformat() + "Z",
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            **stats.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


# ============================================================================
# Routing Configuration Endpoints
# ============================================================================


@router.get("/routing")
async def get_routing_config(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get current model routing configuration."""

    # In production, fetch from config store
    config = RoutingConfig(
        phi_detection_enabled=True,
        phi_route_to_local=True,
        default_chat_model="gpt-4-turbo",
        default_embedding_model="text-embedding-3-large",
        fallback_enabled=True,
        fallback_model="gpt-3.5-turbo",
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            **config.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.patch("/routing")
async def update_routing_config(
    request: Request,
    config_update: RoutingConfigUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Update model routing configuration."""
    ensure_admin_privileges(current_admin_user)

    # Validate PHI detection cannot be disabled in production
    # This is a HIPAA compliance requirement
    if config_update.phi_detection_enabled is False:
        raise HTTPException(status_code=400, detail="PHI detection cannot be disabled (HIPAA requirement)")

    # In production, persist to config store and emit audit log
    # For now, return the updated config
    update_data = config_update.model_dump(exclude_unset=True)

    logger.info(
        "routing_config_updated",
        extra={
            "admin_user_id": str(current_admin_user.id),
            "updates": update_data,
        },
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            "message": "Routing configuration updated successfully",
            "updates": update_data,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )
