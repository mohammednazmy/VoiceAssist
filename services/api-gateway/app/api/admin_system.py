"""Admin System API endpoints (Sprint 4 - System Management).

Provides admin endpoints for:
- System resource monitoring (disk, memory, CPU)
- Backup status and controls
- Maintenance mode management
- System configuration
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.api_envelope import success_response
from app.core.database import get_db, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/system", tags=["admin", "system"])

# Redis keys
REDIS_MAINTENANCE_KEY = "voiceassist:system:maintenance_mode"
REDIS_BACKUP_STATUS_KEY = "voiceassist:system:backup_status"
REDIS_RESOURCE_CACHE_KEY = "voiceassist:admin:resources"
RESOURCE_CACHE_TTL = 30  # 30 seconds


# ============================================================================
# Pydantic Models
# ============================================================================


class ResourceMetrics(BaseModel):
    """System resource metrics."""

    disk_total_gb: float
    disk_used_gb: float
    disk_free_gb: float
    disk_usage_percent: float
    memory_total_gb: float
    memory_used_gb: float
    memory_free_gb: float
    memory_usage_percent: float
    cpu_count: int
    cpu_usage_percent: float
    load_average_1m: float
    load_average_5m: float
    load_average_15m: float


class BackupStatus(BaseModel):
    """Backup status information."""

    last_backup_at: Optional[str]
    last_backup_result: str  # "success", "failed", "in_progress", "unknown"
    backup_destination: str
    schedule: str
    retention_days: int
    next_scheduled_at: Optional[str]
    backup_size_mb: Optional[float]


class BackupHistoryEntry(BaseModel):
    """Backup history entry."""

    id: str
    started_at: str
    completed_at: Optional[str]
    status: str  # "success", "failed", "in_progress"
    size_bytes: Optional[int]
    backup_type: str  # "full", "incremental"
    error_message: Optional[str]


class MaintenanceStatus(BaseModel):
    """Maintenance mode status."""

    enabled: bool
    started_at: Optional[str]
    started_by: Optional[str]
    message: Optional[str]
    estimated_end: Optional[str]


class MaintenanceRequest(BaseModel):
    """Request to enable maintenance mode."""

    message: Optional[str] = "System is under maintenance"
    estimated_duration_minutes: Optional[int] = 30


class SystemHealthStatus(BaseModel):
    """Overall system health status."""

    status: str  # "healthy", "degraded", "unhealthy"
    uptime_seconds: int
    services: Dict[str, str]  # service_name -> status
    last_checked_at: str


# ============================================================================
# Helper Functions
# ============================================================================


def _get_disk_usage(path: str = "/") -> Dict[str, float]:
    """Get disk usage statistics."""
    try:
        usage = shutil.disk_usage(path)
        total_gb = usage.total / (1024**3)
        used_gb = usage.used / (1024**3)
        free_gb = usage.free / (1024**3)
        percent = (usage.used / usage.total) * 100
        return {
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "free_gb": round(free_gb, 2),
            "percent": round(percent, 1),
        }
    except Exception as e:
        logger.warning(f"Failed to get disk usage: {e}")
        return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0}


def _get_memory_usage() -> Dict[str, float]:
    """Get memory usage statistics."""
    try:
        # Read from /proc/meminfo on Linux
        with open("/proc/meminfo", "r") as f:
            meminfo = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(":")
                    value = int(parts[1])  # in KB
                    meminfo[key] = value

        total_kb = meminfo.get("MemTotal", 0)
        free_kb = meminfo.get("MemFree", 0)
        available_kb = meminfo.get("MemAvailable", free_kb)
        _buffers_kb = meminfo.get("Buffers", 0)  # noqa: F841
        _cached_kb = meminfo.get("Cached", 0)  # noqa: F841

        # Used = Total - Available (more accurate than Total - Free)
        used_kb = total_kb - available_kb

        total_gb = total_kb / (1024**2)
        used_gb = used_kb / (1024**2)
        free_gb = available_kb / (1024**2)
        percent = (used_kb / total_kb) * 100 if total_kb > 0 else 0

        return {
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "free_gb": round(free_gb, 2),
            "percent": round(percent, 1),
        }
    except Exception as e:
        logger.warning(f"Failed to get memory usage: {e}")
        return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0}


def _get_cpu_usage() -> Dict[str, Any]:
    """Get CPU usage statistics."""
    try:
        cpu_count = os.cpu_count() or 1

        # Get load average
        load_avg = os.getloadavg()

        # Estimate CPU usage from 1-minute load average
        cpu_percent = min((load_avg[0] / cpu_count) * 100, 100)

        return {
            "count": cpu_count,
            "percent": round(cpu_percent, 1),
            "load_1m": round(load_avg[0], 2),
            "load_5m": round(load_avg[1], 2),
            "load_15m": round(load_avg[2], 2),
        }
    except Exception as e:
        logger.warning(f"Failed to get CPU usage: {e}")
        return {"count": 1, "percent": 0, "load_1m": 0, "load_5m": 0, "load_15m": 0}


def _get_backup_status_from_redis() -> Dict[str, Any]:
    """Get backup status from Redis."""
    try:
        cached = redis_client.get(REDIS_BACKUP_STATUS_KEY)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Failed to get backup status from Redis: {e}")

    # Return default status
    return {
        "last_backup_at": None,
        "last_backup_result": "unknown",
        "backup_destination": "local",
        "schedule": "Daily at 2:00 AM UTC",
        "retention_days": 30,
        "next_scheduled_at": None,
        "backup_size_mb": None,
    }


def _get_uptime_seconds() -> int:
    """Get system uptime in seconds."""
    try:
        with open("/proc/uptime", "r") as f:
            uptime = float(f.readline().split()[0])
            return int(uptime)
    except Exception:
        return 0


# ============================================================================
# Resource Monitoring Endpoints
# ============================================================================


@router.get("/resources")
async def get_system_resources(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get system resource metrics (disk, memory, CPU)."""

    # Try cache first
    try:
        cached = redis_client.get(REDIS_RESOURCE_CACHE_KEY)
        if cached:
            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data=json.loads(cached), trace_id=trace_id)
    except Exception:
        pass

    # Get fresh metrics
    disk = _get_disk_usage()
    memory = _get_memory_usage()
    cpu = _get_cpu_usage()

    metrics = ResourceMetrics(
        disk_total_gb=disk["total_gb"],
        disk_used_gb=disk["used_gb"],
        disk_free_gb=disk["free_gb"],
        disk_usage_percent=disk["percent"],
        memory_total_gb=memory["total_gb"],
        memory_used_gb=memory["used_gb"],
        memory_free_gb=memory["free_gb"],
        memory_usage_percent=memory["percent"],
        cpu_count=cpu["count"],
        cpu_usage_percent=cpu["percent"],
        load_average_1m=cpu["load_1m"],
        load_average_5m=cpu["load_5m"],
        load_average_15m=cpu["load_15m"],
    )

    response_data = {
        **metrics.model_dump(),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    # Cache for 30 seconds
    try:
        redis_client.setex(REDIS_RESOURCE_CACHE_KEY, RESOURCE_CACHE_TTL, json.dumps(response_data))
    except Exception:
        pass

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data=response_data, trace_id=trace_id)


@router.get("/health")
async def get_system_health(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get overall system health status."""

    # Check various services
    services = {}

    # Check Redis
    try:
        redis_client.ping()
        services["redis"] = "healthy"
    except Exception:
        services["redis"] = "unhealthy"

    # Check database (basic connectivity)
    try:
        from app.core.database import engine

        with engine.connect() as conn:
            conn.execute("SELECT 1")
        services["database"] = "healthy"
    except Exception:
        services["database"] = "unhealthy"

    # Determine overall status
    unhealthy_count = sum(1 for s in services.values() if s == "unhealthy")
    if unhealthy_count == 0:
        overall_status = "healthy"
    elif unhealthy_count < len(services):
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    health = SystemHealthStatus(
        status=overall_status,
        uptime_seconds=_get_uptime_seconds(),
        services=services,
        last_checked_at=datetime.now(timezone.utc).isoformat() + "Z",
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data=health.model_dump(), trace_id=trace_id)


# ============================================================================
# Backup Management Endpoints
# ============================================================================


@router.get("/backup/status")
async def get_backup_status(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get current backup configuration and status."""

    status_data = _get_backup_status_from_redis()
    status = BackupStatus(**status_data)

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            **status.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.get("/backup/history")
async def get_backup_history(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(10, ge=1, le=50),
) -> Dict:
    """Get backup history."""

    # In production, this would query actual backup logs
    # For now, return mock data structure
    history: List[Dict[str, Any]] = []

    # Generate some example history entries
    now = datetime.now(timezone.utc)
    for i in range(min(limit, 5)):
        backup_time = now - timedelta(days=i)
        history.append(
            BackupHistoryEntry(
                id=f"backup-{backup_time.strftime('%Y%m%d')}",
                started_at=backup_time.replace(hour=2, minute=0).isoformat() + "Z",
                completed_at=backup_time.replace(hour=2, minute=15).isoformat() + "Z",
                status="success",
                size_bytes=524288000 + (i * 10485760),  # ~500MB + variance
                backup_type="full" if i % 7 == 0 else "incremental",
                error_message=None,
            ).model_dump()
        )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            "history": history,
            "total": len(history),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.post("/backup/trigger")
async def trigger_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
    backup_type: str = Query("full", regex="^(full|incremental)$"),
) -> Dict:
    """Trigger a manual backup (admin only)."""
    ensure_admin_privileges(current_admin_user)

    # Update backup status to in_progress
    backup_id = f"backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    status = {
        "last_backup_at": datetime.now(timezone.utc).isoformat() + "Z",
        "last_backup_result": "in_progress",
        "backup_id": backup_id,
        "backup_type": backup_type,
        "triggered_by": current_admin_user.email,
    }

    try:
        redis_client.setex(REDIS_BACKUP_STATUS_KEY, 86400, json.dumps(status))
    except Exception as e:
        logger.warning(f"Failed to update backup status: {e}")

    logger.info(
        "backup_triggered",
        extra={
            "admin_user_id": str(current_admin_user.id),
            "backup_id": backup_id,
            "backup_type": backup_type,
        },
    )

    # In production, this would trigger the actual backup process
    # For now, return success with the backup ID

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            "message": "Backup triggered successfully",
            "backup_id": backup_id,
            "backup_type": backup_type,
            "status": "in_progress",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


# ============================================================================
# Maintenance Mode Endpoints
# ============================================================================


@router.get("/maintenance")
async def get_maintenance_status(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get current maintenance mode status."""

    try:
        cached = redis_client.get(REDIS_MAINTENANCE_KEY)
        if cached:
            status_data = json.loads(cached)
            status = MaintenanceStatus(**status_data)
        else:
            status = MaintenanceStatus(
                enabled=False,
                started_at=None,
                started_by=None,
                message=None,
                estimated_end=None,
            )
    except Exception:
        status = MaintenanceStatus(
            enabled=False,
            started_at=None,
            started_by=None,
            message=None,
            estimated_end=None,
        )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            **status.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.post("/maintenance/enable")
async def enable_maintenance_mode(
    request: Request,
    maintenance_request: MaintenanceRequest,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Enable maintenance mode (admin only)."""
    ensure_admin_privileges(current_admin_user)

    now = datetime.now(timezone.utc)
    estimated_end = None
    if maintenance_request.estimated_duration_minutes:
        estimated_end = (now + timedelta(minutes=maintenance_request.estimated_duration_minutes)).isoformat() + "Z"

    status = MaintenanceStatus(
        enabled=True,
        started_at=now.isoformat() + "Z",
        started_by=current_admin_user.email,
        message=maintenance_request.message,
        estimated_end=estimated_end,
    )

    try:
        # Store maintenance status in Redis
        redis_client.set(REDIS_MAINTENANCE_KEY, json.dumps(status.model_dump()))
    except Exception as e:
        logger.error(f"Failed to enable maintenance mode: {e}")
        raise HTTPException(status_code=500, detail="Failed to enable maintenance mode")

    logger.warning(
        "maintenance_mode_enabled",
        extra={
            "admin_user_id": str(current_admin_user.id),
            "admin_email": current_admin_user.email,
            "maintenance_message": maintenance_request.message,
            "estimated_duration_minutes": maintenance_request.estimated_duration_minutes,
        },
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            **status.model_dump(),
            "action": "enabled",
            "timestamp": now.isoformat() + "Z",
        },
        trace_id=trace_id,
    )


@router.post("/maintenance/disable")
async def disable_maintenance_mode(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Disable maintenance mode (admin only)."""
    ensure_admin_privileges(current_admin_user)

    try:
        redis_client.delete(REDIS_MAINTENANCE_KEY)
    except Exception as e:
        logger.error(f"Failed to disable maintenance mode: {e}")
        raise HTTPException(status_code=500, detail="Failed to disable maintenance mode")

    logger.info(
        "maintenance_mode_disabled",
        extra={
            "admin_user_id": str(current_admin_user.id),
            "admin_email": current_admin_user.email,
        },
    )

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(
        data={
            "enabled": False,
            "action": "disabled",
            "disabled_by": current_admin_user.email,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        },
        trace_id=trace_id,
    )
