"""API envelope and error helpers for VoiceAssist V2.

This module implements the standard response envelope described in
server/README.md and DATA_MODEL.md, and is intended to be the single
place where APIEnvelope / APIError live for the FastAPI app.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

# Stable error codes (must match server/README.md table)
ERROR_STATUS_CODES: Dict[str, int] = {
    "AUTH_FAILED": 401,
    "AUTH_REQUIRED": 401,
    "FORBIDDEN": 403,
    "VALIDATION_ERROR": 422,
    "RATE_LIMITED": 429,
    "PHI_DETECTED": 200,   # successful response with warning
    "PHI_REDACTED": 200,   # successful response with warning
    "KB_TIMEOUT": 504,
    "TOOL_ERROR": 503,
    "LLM_ERROR": 503,
    "INTERNAL_ERROR": 500,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
}


class APIError(BaseModel):
    """Standard error payload used across all endpoints."""

    code: str = Field(..., description="Stable, machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured error details for debugging/UX",
    )


class APIEnvelope(BaseModel):
    """Standard response envelope.

    Every HTTP API returns this shape so that clients can rely on a
    consistent contract around errors and tracing.
    """

    success: bool = Field(..., description="Indicates whether the call succeeded")
    data: Optional[Any] = Field(
        default=None,
        description="Endpoint-specific payload when success is true",
    )
    error: Optional[APIError] = Field(
        default=None,
        description="Error information when success is false",
    )
    trace_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Trace identifier for correlating logs and metrics",
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC timestamp when the response envelope was created",
    )


def success_response(data: Any, trace_id: Optional[str] = None) -> APIEnvelope:
    """Build a success envelope.

    The `data` payload should be any Pydantic model or JSON-serialisable
    structure that represents the endpoint response.
    """
    return APIEnvelope(
        success=True,
        data=data,
        error=None,
        trace_id=trace_id or str(uuid4()),
        timestamp=datetime.utcnow(),
    )


def error_response(
    code: str,
    message: str,
    *,
    details: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
) -> APIEnvelope:
    """Build an error envelope.

    Use one of the standard error codes whenever possible so that
    clients can handle errors consistently.
    """
    return APIEnvelope(
        success=False,
        data=None,
        error=APIError(code=code, message=message, details=details),
        trace_id=trace_id or str(uuid4()),
        timestamp=datetime.utcnow(),
    )


def add_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app.

    - HTTPException → mapped into APIEnvelope with best-effort code
    - Unhandled Exception → INTERNAL_ERROR
    """

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        trace_id = getattr(request.state, "trace_id", str(uuid4()))

        # If the detail is a dict with a code, treat it as our structured shape.
        code = "INTERNAL_ERROR"
        message: str = "HTTP error"
        details: Optional[Dict[str, Any]] = None

        if isinstance(exc.detail, dict):
            code = exc.detail.get("code", code)
            message = exc.detail.get("message", exc.detail.get("code", message))
            details = exc.detail.get("details")
        elif isinstance(exc.detail, str):
            message = exc.detail

        env = error_response(code=code, message=message, details=details, trace_id=trace_id)
        status = ERROR_STATUS_CODES.get(code, exc.status_code)
        return JSONResponse(status_code=status, content=env.model_dump())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        trace_id = getattr(request.state, "trace_id", str(uuid4()))
        env = error_response(
            code="INTERNAL_ERROR",
            message="Unexpected server error",
            details={"exception_type": type(exc).__name__},
            trace_id=trace_id,
        )
        return JSONResponse(status_code=500, content=env.model_dump())
