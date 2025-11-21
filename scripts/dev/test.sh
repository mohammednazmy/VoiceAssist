#!/bin/bash
# Run tests in the FastAPI container

set -e

echo "🧪 Running tests..."
docker compose exec voiceassist-server pytest -v --tb=short

echo ""
echo "✅ Tests completed!"
