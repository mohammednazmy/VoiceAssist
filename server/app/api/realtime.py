"""Realtime / voice API stubs.

This module is a placeholder for the voice pipeline and OpenAI Realtime
integration described in ORCHESTRATION_DESIGN.md and WEB_APP_SPECS.md.
For now it exposes a simple WebSocket echo endpoint so the wiring can
be validated without depending on actual audio streaming.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.websocket("/ws/echo")
async def websocket_echo(ws: WebSocket):
    """Simple echo WebSocket.

    Frontends can connect here during early development to validate
    connectivity and WebSocket handling. Later phases will replace
    this with a bridge to the OpenAI Realtime API and/or local voice
    processing.
    """
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            await ws.send_text(f"ECHO: {msg}")
    except WebSocketDisconnect:
        return
