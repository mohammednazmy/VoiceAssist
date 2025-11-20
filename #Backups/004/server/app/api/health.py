"""Health and readiness endpoints for VoiceAssist V2."""
from __future__ import annotations

from fastapi import APIRouter
from app.core.api_envelope import APIEnvelope, success_response

router = APIRouter(tags=["health"])


@router.get("/health", response_model=APIEnvelope)
async def health() -> APIEnvelope:
    """Liveness probe.

    Kubernetes / Docker Compose can use this to decide if the container
    is alive; it should be very cheap to compute.
    """
    return success_response({"status": "healthy"})


@router.get("/ready", response_model=APIEnvelope)
async def ready() -> APIEnvelope:
    """Readiness probe.

    In later phases this should check database, Redis, Qdrant, and
    external dependencies. For now, it simply returns ready=True.
    """
    return success_response({"status": "ready"})
