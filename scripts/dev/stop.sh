#!/bin/bash
# Stop development environment

set -e

echo "🛑 Stopping VoiceAssist development environment..."
docker compose down

echo "✅ All services stopped"
