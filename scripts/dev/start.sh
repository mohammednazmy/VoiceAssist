#!/bin/bash
# Development environment startup script

set -e

echo "🚀 Starting VoiceAssist development environment..."
echo ""

# Start all services
echo "📦 Starting Docker Compose services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to become healthy..."
./scripts/dev/wait-for-health.sh

echo ""
echo "🔄 Running database migrations..."
docker compose exec voiceassist-server alembic upgrade head

echo ""
echo "✅ Development environment ready!"
echo ""
echo "📊 Service URLs:"
echo "  - API Gateway:    http://localhost:8000"
echo "  - API Docs:       http://localhost:8000/docs"
echo "  - Health Check:   http://localhost:8000/health"
echo "  - Detailed Health: http://localhost:8000/health/detailed"
echo "  - Metrics:        http://localhost:8000/metrics"
echo ""
echo "🔍 To view logs: ./scripts/dev/logs.sh [service-name]"
echo "🛑 To stop: ./scripts/dev/stop.sh"
