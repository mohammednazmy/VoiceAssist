#!/bin/bash
# Rebuild and restart services

set -e

SERVICE=${1:-"voiceassist-server"}

echo "🔨 Rebuilding $SERVICE..."
docker compose build $SERVICE

echo ""
echo "🔄 Restarting $SERVICE..."
docker compose up -d $SERVICE

echo ""
echo "⏳ Waiting for service to become healthy..."
sleep 5

echo ""
echo "✅ $SERVICE rebuilt and restarted!"
echo ""
echo "📋 To view logs: ./scripts/dev/logs.sh $SERVICE"
