"""FastAPI application entrypoint for VoiceAssist V2.

Uvicorn/Gunicorn should point at `server.app.main:app`.
"""
from __future__ import annotations

from fastapi import FastAPI

from app.core.api_envelope import add_exception_handlers
from app.core.middleware import add_core_middleware
from app.api import health as health_api
from app.api import chat as chat_api
from app.api import admin as admin_api
from app.api import realtime as realtime_api


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="VoiceAssist V2",
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Core plumbing
    add_core_middleware(app)
    add_exception_handlers(app)

    # Routers
    app.include_router(health_api.router)
    app.include_router(chat_api.router)
    app.include_router(admin_api.router)
    app.include_router(realtime_api.router)

    return app


app = create_app()
