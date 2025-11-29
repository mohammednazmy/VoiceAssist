"""Admin Tools API endpoints (Sprint 6A - Tools Admin).

Provides admin endpoints for managing AI assistant tools:
- GET /api/admin/tools - List all registered tools with status
- GET /api/admin/tools/{tool_name} - Get tool details and config
- PATCH /api/admin/tools/{tool_name} - Update tool config (admin only)
- GET /api/admin/tools/logs - Tool invocation logs with filters
- GET /api/admin/tools/analytics - Tool usage analytics
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from app.api.admin_panel import log_audit_event
from app.core.api_envelope import success_response
from app.core.database import get_db, redis_client
from app.core.dependencies import ensure_admin_privileges, get_current_admin_or_viewer, get_current_admin_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/tools", tags=["admin", "tools"])

# Redis keys
REDIS_TOOLS_CONFIG_KEY = "voiceassist:tools:config"
REDIS_TOOLS_LOGS_KEY = "voiceassist:tools:logs"
REDIS_TOOLS_ANALYTICS_KEY = "voiceassist:tools:analytics"

# Tool categories
TOOL_CATEGORIES = ["calendar", "file", "medical", "calculation", "search", "email", "integration"]


# ============================================================================
# Pydantic Models
# ============================================================================


class ToolStatus(BaseModel):
    """Tool status information."""

    tool_name: str
    display_name: str
    description: str
    enabled: bool
    category: Literal["calendar", "file", "medical", "calculation", "search", "email", "integration"]
    total_calls_24h: int = 0
    success_rate: float = 0.0
    avg_duration_ms: float = 0.0
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    phi_enabled: bool = False
    requires_confirmation: bool = False


class ToolConfiguration(BaseModel):
    """Tool configuration."""

    tool_name: str
    enabled: bool = True
    timeout_seconds: int = 30
    rate_limit_per_user: int = 100
    rate_limit_window_seconds: int = 3600
    requires_confirmation: bool = False
    phi_enabled: bool = False
    custom_settings: Dict[str, Any] = Field(default_factory=dict)


class ToolConfigUpdate(BaseModel):
    """Update model for tool configuration."""

    enabled: Optional[bool] = None
    timeout_seconds: Optional[int] = Field(None, ge=1, le=300)
    rate_limit_per_user: Optional[int] = Field(None, ge=1, le=10000)
    rate_limit_window_seconds: Optional[int] = Field(None, ge=60, le=86400)
    requires_confirmation: Optional[bool] = None
    phi_enabled: Optional[bool] = None
    custom_settings: Optional[Dict[str, Any]] = None


class ToolInvocationLog(BaseModel):
    """Tool invocation log entry."""

    id: str
    tool_name: str
    user_email: str
    session_id: str
    call_id: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
    status: Literal["completed", "failed", "timeout", "cancelled"]
    duration_ms: int
    phi_detected: bool = False
    confirmation_required: bool = False
    user_confirmed: Optional[bool] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str


class ToolAnalyticsSummary(BaseModel):
    """Tool analytics summary."""

    tool_name: str
    total_calls: int
    success_count: int
    failure_count: int
    timeout_count: int
    cancelled_count: int
    avg_duration_ms: float
    p95_duration_ms: float
    phi_detected_count: int
    confirmation_required_count: int


# ============================================================================
# Tool Registry - Defines available tools
# ============================================================================

# Default tool definitions
DEFAULT_TOOLS: Dict[str, Dict[str, Any]] = {
    "calendar_create_event": {
        "display_name": "Create Calendar Event",
        "description": "Create a new event in the user's calendar",
        "category": "calendar",
        "enabled": True,
        "requires_confirmation": True,
        "phi_enabled": False,
        "timeout_seconds": 30,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "calendar_list_events": {
        "display_name": "List Calendar Events",
        "description": "List upcoming events from the user's calendar",
        "category": "calendar",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": False,
        "timeout_seconds": 15,
        "rate_limit_per_user": 100,
        "rate_limit_window_seconds": 3600,
    },
    "calendar_update_event": {
        "display_name": "Update Calendar Event",
        "description": "Update an existing calendar event",
        "category": "calendar",
        "enabled": True,
        "requires_confirmation": True,
        "phi_enabled": False,
        "timeout_seconds": 30,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "calendar_delete_event": {
        "display_name": "Delete Calendar Event",
        "description": "Delete an event from the calendar",
        "category": "calendar",
        "enabled": True,
        "requires_confirmation": True,
        "phi_enabled": False,
        "timeout_seconds": 15,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "file_search": {
        "display_name": "Search Files",
        "description": "Search for files in user's Nextcloud storage",
        "category": "file",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 30,
        "rate_limit_per_user": 100,
        "rate_limit_window_seconds": 3600,
    },
    "file_read": {
        "display_name": "Read File",
        "description": "Read content from a file in Nextcloud",
        "category": "file",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 60,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "file_upload": {
        "display_name": "Upload File",
        "description": "Upload a file to Nextcloud storage",
        "category": "file",
        "enabled": True,
        "requires_confirmation": True,
        "phi_enabled": True,
        "timeout_seconds": 120,
        "rate_limit_per_user": 20,
        "rate_limit_window_seconds": 3600,
    },
    "medical_search": {
        "display_name": "Medical Knowledge Search",
        "description": "Search the medical knowledge base for relevant information",
        "category": "medical",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 30,
        "rate_limit_per_user": 200,
        "rate_limit_window_seconds": 3600,
    },
    "medical_drug_lookup": {
        "display_name": "Drug Information Lookup",
        "description": "Look up drug information, interactions, and dosages",
        "category": "medical",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 30,
        "rate_limit_per_user": 100,
        "rate_limit_window_seconds": 3600,
    },
    "medical_calculator": {
        "display_name": "Medical Calculator",
        "description": "Calculate medical scores and formulas (BMI, GFR, etc.)",
        "category": "calculation",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 10,
        "rate_limit_per_user": 200,
        "rate_limit_window_seconds": 3600,
    },
    "pubmed_search": {
        "display_name": "PubMed Search",
        "description": "Search PubMed for medical literature",
        "category": "search",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": False,
        "timeout_seconds": 60,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "uptodate_search": {
        "display_name": "UpToDate Search",
        "description": "Search UpToDate clinical decision support",
        "category": "search",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": False,
        "timeout_seconds": 60,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "email_send": {
        "display_name": "Send Email",
        "description": "Send an email on behalf of the user",
        "category": "email",
        "enabled": True,
        "requires_confirmation": True,
        "phi_enabled": True,
        "timeout_seconds": 30,
        "rate_limit_per_user": 20,
        "rate_limit_window_seconds": 3600,
    },
    "email_draft": {
        "display_name": "Draft Email",
        "description": "Create a draft email for user review",
        "category": "email",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 30,
        "rate_limit_per_user": 50,
        "rate_limit_window_seconds": 3600,
    },
    "contact_search": {
        "display_name": "Search Contacts",
        "description": "Search user's contacts in CardDAV",
        "category": "integration",
        "enabled": True,
        "requires_confirmation": False,
        "phi_enabled": True,
        "timeout_seconds": 15,
        "rate_limit_per_user": 100,
        "rate_limit_window_seconds": 3600,
    },
}


# ============================================================================
# Helper Functions
# ============================================================================


def get_tool_config(tool_name: str) -> ToolConfiguration:
    """Get configuration for a specific tool."""
    try:
        config_data = redis_client.hget(REDIS_TOOLS_CONFIG_KEY, tool_name)
        if config_data:
            if isinstance(config_data, bytes):
                config_data = config_data.decode("utf-8")
            stored = json.loads(config_data)
            return ToolConfiguration(tool_name=tool_name, **stored)
    except Exception as e:
        logger.warning(f"Failed to get tool config from Redis: {e}")

    # Return default config if not in Redis
    if tool_name in DEFAULT_TOOLS:
        defaults = DEFAULT_TOOLS[tool_name]
        return ToolConfiguration(
            tool_name=tool_name,
            enabled=defaults.get("enabled", True),
            timeout_seconds=defaults.get("timeout_seconds", 30),
            rate_limit_per_user=defaults.get("rate_limit_per_user", 100),
            rate_limit_window_seconds=defaults.get("rate_limit_window_seconds", 3600),
            requires_confirmation=defaults.get("requires_confirmation", False),
            phi_enabled=defaults.get("phi_enabled", False),
            custom_settings={},
        )

    raise ValueError(f"Unknown tool: {tool_name}")


def save_tool_config(tool_name: str, config: ToolConfiguration) -> None:
    """Save tool configuration to Redis."""
    try:
        config_dict = config.model_dump(exclude={"tool_name"})
        redis_client.hset(REDIS_TOOLS_CONFIG_KEY, tool_name, json.dumps(config_dict))
    except Exception as e:
        logger.warning(f"Failed to save tool config to Redis: {e}")


def get_all_tools() -> List[Dict[str, Any]]:
    """Get all tools with their status and config."""
    tools = []
    for tool_name, defaults in DEFAULT_TOOLS.items():
        try:
            config = get_tool_config(tool_name)
            analytics = get_tool_analytics_24h(tool_name)

            tools.append(
                {
                    "tool_name": tool_name,
                    "display_name": defaults["display_name"],
                    "description": defaults["description"],
                    "category": defaults["category"],
                    "enabled": config.enabled,
                    "total_calls_24h": analytics.get("total_calls", 0),
                    "success_rate": analytics.get("success_rate", 0.0),
                    "avg_duration_ms": analytics.get("avg_duration_ms", 0.0),
                    "last_error": analytics.get("last_error"),
                    "last_error_at": analytics.get("last_error_at"),
                    "phi_enabled": config.phi_enabled,
                    "requires_confirmation": config.requires_confirmation,
                }
            )
        except Exception as e:
            logger.warning(f"Failed to get tool {tool_name}: {e}")
            tools.append(
                {
                    "tool_name": tool_name,
                    "display_name": defaults["display_name"],
                    "description": defaults["description"],
                    "category": defaults["category"],
                    "enabled": defaults.get("enabled", True),
                    "total_calls_24h": 0,
                    "success_rate": 0.0,
                    "avg_duration_ms": 0.0,
                    "last_error": None,
                    "last_error_at": None,
                    "phi_enabled": defaults.get("phi_enabled", False),
                    "requires_confirmation": defaults.get("requires_confirmation", False),
                }
            )

    return tools


def get_tool_analytics_24h(tool_name: str) -> Dict[str, Any]:
    """Get 24-hour analytics for a specific tool."""
    try:
        analytics_key = f"{REDIS_TOOLS_ANALYTICS_KEY}:{tool_name}"
        data = redis_client.get(analytics_key)
        if data:
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            return json.loads(data)
    except Exception as e:
        logger.warning(f"Failed to get tool analytics from Redis: {e}")

    return {
        "total_calls": 0,
        "success_count": 0,
        "failure_count": 0,
        "timeout_count": 0,
        "cancelled_count": 0,
        "success_rate": 0.0,
        "avg_duration_ms": 0.0,
        "p95_duration_ms": 0.0,
        "phi_detected_count": 0,
        "confirmation_required_count": 0,
        "last_error": None,
        "last_error_at": None,
    }


def get_tool_logs(
    tool_name: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Get tool invocation logs with filters."""
    try:
        # Get logs from Redis list (most recent first)
        logs_data = redis_client.lrange(REDIS_TOOLS_LOGS_KEY, 0, 999)  # Get up to 1000 logs
        logs = []

        for log_entry in logs_data:
            if isinstance(log_entry, bytes):
                log_entry = log_entry.decode("utf-8")
            log = json.loads(log_entry)

            # Apply filters
            if tool_name and log.get("tool_name") != tool_name:
                continue
            if status and log.get("status") != status:
                continue

            # Redact PHI from arguments
            if log.get("arguments"):
                log["arguments"] = _redact_phi_from_args(log["arguments"])

            logs.append(log)

        # Apply pagination
        return logs[offset : offset + limit]
    except Exception as e:
        logger.warning(f"Failed to get tool logs from Redis: {e}")
        return []


def _redact_phi_from_args(args: Dict[str, Any]) -> Dict[str, Any]:
    """Redact potential PHI from tool arguments."""
    phi_keys = ["patient", "name", "email", "phone", "ssn", "dob", "address", "medical_record", "mrn"]
    redacted = {}
    for key, value in args.items():
        if any(phi_key in key.lower() for phi_key in phi_keys):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = _redact_phi_from_args(value)
        elif isinstance(value, str) and len(value) > 100:
            redacted[key] = value[:50] + "...[TRUNCATED]"
        else:
            redacted[key] = value
    return redacted


def log_tool_invocation(
    tool_name: str,
    user_email: str,
    session_id: str,
    call_id: str,
    arguments: Dict[str, Any],
    status: str,
    duration_ms: int,
    phi_detected: bool = False,
    confirmation_required: bool = False,
    user_confirmed: Optional[bool] = None,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """Log a tool invocation to Redis."""
    try:
        log_entry = {
            "id": call_id,
            "tool_name": tool_name,
            "user_email": user_email,
            "session_id": session_id,
            "call_id": call_id,
            "arguments": arguments,
            "status": status,
            "duration_ms": duration_ms,
            "phi_detected": phi_detected,
            "confirmation_required": confirmation_required,
            "user_confirmed": user_confirmed,
            "error_code": error_code,
            "error_message": error_message,
            "created_at": datetime.now(timezone.utc).isoformat() + "Z",
        }

        # Add to logs list (prepend for most recent first)
        redis_client.lpush(REDIS_TOOLS_LOGS_KEY, json.dumps(log_entry))

        # Trim to keep only last 10000 entries
        redis_client.ltrim(REDIS_TOOLS_LOGS_KEY, 0, 9999)

        # Update analytics counters
        _update_tool_analytics(tool_name, status, duration_ms, phi_detected, confirmation_required, error_message)

    except Exception as e:
        logger.warning(f"Failed to log tool invocation: {e}")


def _update_tool_analytics(
    tool_name: str,
    status: str,
    duration_ms: int,
    phi_detected: bool,
    confirmation_required: bool,
    error_message: Optional[str] = None,
) -> None:
    """Update tool analytics counters in Redis."""
    try:
        analytics_key = f"{REDIS_TOOLS_ANALYTICS_KEY}:{tool_name}"
        analytics = get_tool_analytics_24h(tool_name)

        analytics["total_calls"] = analytics.get("total_calls", 0) + 1

        if status == "completed":
            analytics["success_count"] = analytics.get("success_count", 0) + 1
        elif status == "failed":
            analytics["failure_count"] = analytics.get("failure_count", 0) + 1
            analytics["last_error"] = error_message
            analytics["last_error_at"] = datetime.now(timezone.utc).isoformat() + "Z"
        elif status == "timeout":
            analytics["timeout_count"] = analytics.get("timeout_count", 0) + 1
        elif status == "cancelled":
            analytics["cancelled_count"] = analytics.get("cancelled_count", 0) + 1

        if phi_detected:
            analytics["phi_detected_count"] = analytics.get("phi_detected_count", 0) + 1

        if confirmation_required:
            analytics["confirmation_required_count"] = analytics.get("confirmation_required_count", 0) + 1

        # Update averages
        total = analytics["total_calls"]
        current_avg = analytics.get("avg_duration_ms", 0.0)
        analytics["avg_duration_ms"] = ((current_avg * (total - 1)) + duration_ms) / total

        # Calculate success rate
        if total > 0:
            analytics["success_rate"] = analytics.get("success_count", 0) / total

        # Store with 24h TTL
        redis_client.setex(analytics_key, 86400, json.dumps(analytics))

    except Exception as e:
        logger.warning(f"Failed to update tool analytics: {e}")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("")
async def list_tools(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    category: Optional[str] = Query(None, description="Filter by category"),
    enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
) -> Dict:
    """List all registered tools with status.

    Available to admin and viewer roles.
    """
    tools = get_all_tools()

    # Apply filters
    if category:
        tools = [t for t in tools if t["category"] == category]
    if enabled is not None:
        tools = [t for t in tools if t["enabled"] == enabled]

    # Sort by category then name
    tools.sort(key=lambda t: (t["category"], t["tool_name"]))

    # Calculate summary stats
    total_calls_24h = sum(t["total_calls_24h"] for t in tools)
    enabled_count = sum(1 for t in tools if t["enabled"])

    data = {
        "tools": tools,
        "total": len(tools),
        "enabled_count": enabled_count,
        "disabled_count": len(tools) - enabled_count,
        "total_calls_24h": total_calls_24h,
        "categories": list(set(t["category"] for t in tools)),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/logs")
async def get_tool_invocation_logs(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    tool_name: Optional[str] = Query(None, description="Filter by tool name"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict:
    """Get tool invocation logs with filters.

    Available to admin and viewer roles.
    PHI is redacted from arguments.
    """
    logs = get_tool_logs(tool_name=tool_name, status=status, limit=limit, offset=offset)

    data = {
        "logs": logs,
        "count": len(logs),
        "limit": limit,
        "offset": offset,
        "filters": {
            "tool_name": tool_name,
            "status": status,
        },
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/analytics")
async def get_tools_analytics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get aggregated tool usage analytics.

    Available to admin and viewer roles.
    """
    analytics_list = []

    for tool_name in DEFAULT_TOOLS.keys():
        analytics = get_tool_analytics_24h(tool_name)
        analytics_list.append(
            {
                "tool_name": tool_name,
                "display_name": DEFAULT_TOOLS[tool_name]["display_name"],
                "category": DEFAULT_TOOLS[tool_name]["category"],
                **analytics,
            }
        )

    # Sort by total calls descending
    analytics_list.sort(key=lambda x: x.get("total_calls", 0), reverse=True)

    # Calculate totals
    total_calls = sum(a.get("total_calls", 0) for a in analytics_list)
    total_success = sum(a.get("success_count", 0) for a in analytics_list)
    total_failures = sum(a.get("failure_count", 0) for a in analytics_list)
    total_phi = sum(a.get("phi_detected_count", 0) for a in analytics_list)

    # Category breakdown
    category_stats = {}
    for a in analytics_list:
        cat = a["category"]
        if cat not in category_stats:
            category_stats[cat] = {"calls": 0, "success": 0, "failures": 0}
        category_stats[cat]["calls"] += a.get("total_calls", 0)
        category_stats[cat]["success"] += a.get("success_count", 0)
        category_stats[cat]["failures"] += a.get("failure_count", 0)

    data = {
        "tools": analytics_list,
        "summary": {
            "total_calls": total_calls,
            "total_success": total_success,
            "total_failures": total_failures,
            "total_phi_detected": total_phi,
            "overall_success_rate": total_success / total_calls if total_calls > 0 else 0.0,
        },
        "by_category": category_stats,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.get("/{tool_name}")
async def get_tool_details(
    request: Request,
    tool_name: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    """Get details and configuration for a specific tool.

    Available to admin and viewer roles.
    """
    if tool_name not in DEFAULT_TOOLS:
        raise HTTPException(status_code=404, detail=f"Tool not found: {tool_name}")

    defaults = DEFAULT_TOOLS[tool_name]
    config = get_tool_config(tool_name)
    analytics = get_tool_analytics_24h(tool_name)

    data = {
        "tool_name": tool_name,
        "display_name": defaults["display_name"],
        "description": defaults["description"],
        "category": defaults["category"],
        "config": config.model_dump(),
        "analytics": analytics,
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


@router.patch("/{tool_name}")
async def update_tool_config(
    request: Request,
    tool_name: str,
    config_update: ToolConfigUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    """Update configuration for a specific tool.

    Only admin users can modify tool configuration.
    """
    ensure_admin_privileges(current_admin_user)

    if tool_name not in DEFAULT_TOOLS:
        raise HTTPException(status_code=404, detail=f"Tool not found: {tool_name}")

    # Get current config
    current_config = get_tool_config(tool_name)
    original_config = current_config.model_dump()

    # Apply updates
    update_data = config_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(current_config, field, value)

    # Save updated config
    save_tool_config(tool_name, current_config)

    # Log audit event
    log_audit_event(
        db=db,
        action="tools.config.update",
        user_id=str(current_admin_user.id),
        user_email=current_admin_user.email,
        resource_type="tool_config",
        resource_id=tool_name,
        success=True,
        details=json.dumps({"original": original_config, "updated": update_data}),
        request=request,
    )

    logger.info(
        f"Admin {current_admin_user.email} updated tool configuration for {tool_name}",
        extra={
            "admin_id": current_admin_user.id,
            "tool_name": tool_name,
            "changes": update_data,
        },
    )

    defaults = DEFAULT_TOOLS[tool_name]
    data = {
        "tool_name": tool_name,
        "display_name": defaults["display_name"],
        "description": defaults["description"],
        "category": defaults["category"],
        "config": current_config.model_dump(),
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }

    trace_id = getattr(request.state, "trace_id", None)
    return success_response(data, trace_id=trace_id)


# ============================================================================
# Database-backed Analytics Endpoints (using tool_invocation_logs table)
# ============================================================================


@router.get("/analytics/db")
async def get_db_analytics(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
) -> Dict:
    """Get comprehensive tool analytics from database logs.

    This endpoint queries the tool_invocation_logs table for
    historical analytics data with customizable time range.

    Available to admin and viewer roles.
    """
    from datetime import timedelta

    from app.core.database import get_async_db
    from app.services.tools import tool_analytics_service

    # Get async db session
    async for db_session in get_async_db():
        try:
            start_date = datetime.utcnow() - timedelta(days=days)
            end_date = datetime.utcnow()

            # Get summary statistics
            summary = await tool_analytics_service.get_tool_usage_summary(
                db_session=db_session,
                start_date=start_date,
                end_date=end_date,
            )

            # Get tool breakdown
            tool_breakdown = await tool_analytics_service.get_tool_breakdown(
                db_session=db_session,
                start_date=start_date,
                end_date=end_date,
            )

            # Get mode comparison
            mode_comparison = await tool_analytics_service.get_mode_comparison(
                db_session=db_session,
                start_date=start_date,
                end_date=end_date,
            )

            data = {
                "summary": summary,
                "by_tool": tool_breakdown,
                "by_mode": mode_comparison,
                "days_analyzed": days,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            }

            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
        finally:
            await db_session.close()


@router.get("/analytics/db/trend")
async def get_db_analytics_trend(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(30, ge=1, le=365, description="Number of days"),
    tool_name: Optional[str] = Query(None, description="Filter by tool name"),
) -> Dict:
    """Get daily trend data for tool usage.

    Available to admin and viewer roles.
    """
    from app.core.database import get_async_db
    from app.services.tools import tool_analytics_service

    async for db_session in get_async_db():
        try:
            trend = await tool_analytics_service.get_daily_trend(
                db_session=db_session,
                days=days,
                tool_name=tool_name,
            )

            data = {
                "trend": trend,
                "days": days,
                "tool_name": tool_name,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            }

            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
        finally:
            await db_session.close()


@router.get("/analytics/db/errors")
async def get_db_error_analysis(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(7, ge=1, le=30, description="Number of days"),
    limit: int = Query(20, ge=1, le=100, description="Max errors to return"),
) -> Dict:
    """Get error analysis from tool invocation logs.

    Available to admin and viewer roles.
    """
    from datetime import timedelta

    from app.core.database import get_async_db
    from app.services.tools import tool_analytics_service

    async for db_session in get_async_db():
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            errors = await tool_analytics_service.get_error_analysis(
                db_session=db_session,
                start_date=start_date,
                limit=limit,
            )

            data = {
                "errors": errors,
                "days": days,
                "limit": limit,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            }

            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
        finally:
            await db_session.close()


@router.get("/analytics/db/invocations")
async def get_db_recent_invocations(
    request: Request,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    limit: int = Query(50, ge=1, le=200, description="Max invocations to return"),
    tool_name: Optional[str] = Query(None, description="Filter by tool name"),
    status: Optional[str] = Query(None, description="Filter by status"),
) -> Dict:
    """Get recent tool invocations for monitoring.

    Available to admin and viewer roles.
    """
    from app.core.database import get_async_db
    from app.services.tools import tool_analytics_service

    async for db_session in get_async_db():
        try:
            invocations = await tool_analytics_service.get_recent_invocations(
                db_session=db_session,
                limit=limit,
                tool_name=tool_name,
                status=status,
            )

            data = {
                "invocations": invocations,
                "limit": limit,
                "filters": {"tool_name": tool_name, "status": status},
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            }

            trace_id = getattr(request.state, "trace_id", None)
            return success_response(data, trace_id=trace_id)
        finally:
            await db_session.close()


@router.get("/analytics/db/user/{user_id}")
async def get_db_user_tool_activity(
    request: Request,
    user_id: str,
    current_admin_user: User = Depends(get_current_admin_or_viewer),
    days: int = Query(30, ge=1, le=365, description="Number of days"),
) -> Dict:
    """Get tool usage activity for a specific user.

    Available to admin and viewer roles.
    """
    from datetime import timedelta

    from app.core.database import get_async_db
    from app.services.tools import tool_analytics_service

    async for db_session in get_async_db():
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            activity = await tool_analytics_service.get_user_activity(
                db_session=db_session,
                user_id=user_id,
                start_date=start_date,
            )

            trace_id = getattr(request.state, "trace_id", None)
            return success_response(activity, trace_id=trace_id)
        finally:
            await db_session.close()
