"""Core middleware utilities (tracing, logging) for VoiceAssist V2."""
from __future__ import annotations

from typing import Callable, Awaitable
from uuid import uuid4

from fastapi import FastAPI, Request


async def tracing_middleware(request: Request, call_next: Callable[[Request], Awaitable]):
    """Attach a trace_id to the request and response.

    - Reads X-Trace-ID header if present, otherwise generates a new UUID.
    - Stores trace_id on request.state.
    - Mirrors trace_id back in the X-Trace-ID response header.

    This should be referenced by OBSERVABILITY.md and server/README.md.
    """
    trace_id = request.headers.get("X-Trace-ID") or str(uuid4())
    request.state.trace_id = trace_id

    response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    return response


def add_core_middleware(app: FastAPI) -> None:
    """Register core middleware on the FastAPI app."""
    app.middleware("http")(tracing_middleware)
