#!/bin/bash
# Wait for all services to become healthy

set -e

MAX_WAIT=120  # 2 minutes
INTERVAL=5
ELAPSED=0

echo "Waiting for services to become healthy..."

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check if all services are healthy
    UNHEALTHY=$(docker compose ps --format json | jq -r 'select(.Health != "healthy") | .Name' 2>/dev/null || echo "checking")

    if [ -z "$UNHEALTHY" ] || [ "$UNHEALTHY" = "checking" ]; then
        # Check actual service count
        TOTAL=$(docker compose ps --format json | jq -s 'length' 2>/dev/null || echo "0")
        HEALTHY=$(docker compose ps --format json | jq -r 'select(.Health == "healthy") | .Name' | wc -l | tr -d ' ')

        if [ "$TOTAL" -gt 0 ] && [ "$HEALTHY" -eq "$TOTAL" ]; then
            echo "✅ All services are healthy!"
            exit 0
        fi
    fi

    echo "  ⏳ Waiting... ($ELAPSED seconds elapsed)"
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo "❌ Timeout waiting for services to become healthy"
echo "Current service status:"
docker compose ps
exit 1
