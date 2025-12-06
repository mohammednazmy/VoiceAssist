#!/bin/bash
# VoiceAssist API Gateway Entrypoint
# Handles WebSocket compression and other runtime configurations

set -e

# Build uvicorn command with optional flags
UVICORN_CMD="uvicorn app.main:app --host 0.0.0.0 --port 8000"

# Enable WebSocket compression if configured
# This is controlled by the WS_COMPRESSION_ENABLED environment variable
# which corresponds to the backend.voice_ws_compression feature flag
if [ "${WS_COMPRESSION_ENABLED}" = "true" ] || [ "${WS_COMPRESSION_ENABLED}" = "True" ] || [ "${WS_COMPRESSION_ENABLED}" = "1" ]; then
    echo "[Entrypoint] WebSocket compression (permessage-deflate) ENABLED"
    UVICORN_CMD="${UVICORN_CMD} --ws-per-message-deflate true"
else
    echo "[Entrypoint] WebSocket compression DISABLED (default)"
fi

# Add workers for production (optional, controlled by UVICORN_WORKERS env var)
if [ -n "${UVICORN_WORKERS}" ] && [ "${UVICORN_WORKERS}" -gt 1 ]; then
    echo "[Entrypoint] Running with ${UVICORN_WORKERS} workers"
    UVICORN_CMD="${UVICORN_CMD} --workers ${UVICORN_WORKERS}"
fi

# Log level (default: info)
UVICORN_LOG_LEVEL="${UVICORN_LOG_LEVEL:-info}"
UVICORN_CMD="${UVICORN_CMD} --log-level ${UVICORN_LOG_LEVEL}"

echo "[Entrypoint] Starting: ${UVICORN_CMD}"
exec ${UVICORN_CMD}
