#!/bin/bash
# View logs for a specific service or all services

SERVICE=${1:-""}

if [ -z "$SERVICE" ]; then
    echo "📋 Showing logs for all services (Ctrl+C to exit)..."
    docker compose logs -f
else
    echo "📋 Showing logs for $SERVICE (Ctrl+C to exit)..."
    docker compose logs -f "$SERVICE"
fi
