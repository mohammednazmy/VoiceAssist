"""Tool execution engine stub.

This module is the runtime counterpart of the design in
OBSERVABILITY.md and TOOLS_AND_INTEGRATIONS.md. It provides a single
entrypoint `execute_tool` that orchestrates validation and dispatch
to the concrete tool handlers registered in app.tools.registry.
"""
from __future__ import annotations

from typing import Any, Dict
import logging
import time

from pydantic import BaseModel

try:
    from prometheus_client import Counter, Histogram, Gauge
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

from app.tools.base import ToolResult
from app.tools.registry import (
    get_tool_definition,
    get_tool_model,
    get_tool_handler,
)

logger = logging.getLogger(__name__)

# Prometheus Metrics (as specified in docs/OBSERVABILITY.md)
if METRICS_AVAILABLE:
    tool_calls_total = Counter(
        'voiceassist_tool_calls_total',
        'Total tool invocations',
        ['tool_name', 'status']
    )

    tool_execution_duration = Histogram(
        'voiceassist_tool_execution_duration_seconds',
        'Tool execution duration',
        ['tool_name'],
        buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
    )

    tool_errors = Counter(
        'voiceassist_tool_errors_total',
        'Tool execution errors',
        ['tool_name', 'error_code']
    )

    tool_timeouts = Counter(
        'voiceassist_tool_timeouts_total',
        'Tool execution timeouts',
        ['tool_name']
    )

    tool_active_calls = Gauge(
        'voiceassist_tool_active_calls',
        'Currently executing tool calls',
        ['tool_name']
    )


class ToolExecutionError(Exception):
    """Base exception for tool execution problems."""


class ToolNotFoundError(ToolExecutionError):
    """Raised when a tool name is unknown."""


class ToolValidationError(ToolExecutionError):
    """Raised when tool arguments fail validation."""


async def execute_tool(
    tool_name: str,
    args: Dict[str, Any],
    *,
    user_id: int,
    trace_id: str,
) -> ToolResult:
    """Execute a tool by name.

    This function performs:
    - lookup of tool definition, model, and handler
    - Pydantic-based argument validation
    - handler invocation with (args_model, user_id)
    - Prometheus metrics tracking (see OBSERVABILITY.md)

    Future phases should extend this to include:
    - PHI detection (using app.services.phi_detector)
    - per-tool rate limiting
    - user confirmation flow for high-risk tools
    - detailed error mapping to API error codes
    """
    start_time = time.time()
    status = "failed"  # Default to failed

    # Increment active calls gauge
    if METRICS_AVAILABLE:
        tool_active_calls.labels(tool_name=tool_name).inc()

    try:
        logger.debug("execute_tool(%s) trace_id=%s args=%r", tool_name, trace_id, args)

        try:
            definition = get_tool_definition(tool_name)
        except KeyError:
            if METRICS_AVAILABLE:
                tool_errors.labels(tool_name=tool_name, error_code="TOOL_NOT_FOUND").inc()
            logger.warning("Unknown tool '%s' trace_id=%s", tool_name, trace_id)
            raise ToolNotFoundError(f"Tool '{tool_name}' not found")

        model_cls: type[BaseModel] = get_tool_model(tool_name)
        handler = get_tool_handler(tool_name)

        try:
            args_model = model_cls(**args)
        except Exception as exc:  # Pydantic validation error
            if METRICS_AVAILABLE:
                tool_errors.labels(tool_name=tool_name, error_code="VALIDATION_ERROR").inc()
            logger.warning(
                "Validation failed for tool '%s' trace_id=%s exc=%s",
                tool_name,
                trace_id,
                exc,
            )
            raise ToolValidationError(str(exc)) from exc

        # Handlers are currently synchronous (see server/app/tools/*_tool.py).
        # If/when they become IO-bound, wrap in a thread pool or make them async.
        result: ToolResult = handler(args_model, user_id)
        status = "completed"

        logger.debug("Tool '%s' completed trace_id=%s result=%r", tool_name, trace_id, result)
        return result

    except (ToolNotFoundError, ToolValidationError):
        # Already logged and counted
        raise

    except Exception as exc:
        # Unexpected error
        if METRICS_AVAILABLE:
            tool_errors.labels(tool_name=tool_name, error_code="UNKNOWN_ERROR").inc()
        logger.error(
            "Unexpected error in tool '%s' trace_id=%s exc=%s",
            tool_name,
            trace_id,
            exc,
            exc_info=True,
        )
        raise ToolExecutionError(f"Tool execution failed: {exc}") from exc

    finally:
        # Record metrics
        duration = time.time() - start_time

        if METRICS_AVAILABLE:
            tool_execution_duration.labels(tool_name=tool_name).observe(duration)
            tool_calls_total.labels(tool_name=tool_name, status=status).inc()
            tool_active_calls.labels(tool_name=tool_name).dec()

        # Structured logging
        logger.info(
            "Tool execution completed",
            extra={
                "tool_name": tool_name,
                "status": status,
                "duration_ms": int(duration * 1000),
                "trace_id": trace_id,
                "user_id": user_id,
            }
        )
