#!/bin/bash
# Export OpenAPI spec from running FastAPI app
#
# Usage:
#   ./scripts/export_openapi.sh [output_file]
#
# Default output: ./openapi.json
# Requires the API server to be running (or starts it temporarily)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="${1:-$PROJECT_DIR/openapi.json}"

# Check if server is running
API_URL="${API_URL:-http://localhost:5000}"

echo "Fetching OpenAPI spec from $API_URL/openapi.json..."

# Try to fetch the OpenAPI spec
if curl -sf "$API_URL/openapi.json" -o "$OUTPUT_FILE"; then
    echo "OpenAPI spec exported to: $OUTPUT_FILE"
    echo "Size: $(wc -c < "$OUTPUT_FILE") bytes"
else
    echo "Error: Could not fetch OpenAPI spec from $API_URL"
    echo "Make sure the API server is running."
    echo ""
    echo "To start the server:"
    echo "  cd $PROJECT_DIR && venv/bin/uvicorn app.main:app --reload"
    exit 1
fi

# Validate JSON
if command -v python3 &> /dev/null; then
    if python3 -c "import json; json.load(open('$OUTPUT_FILE'))" 2>/dev/null; then
        echo "JSON validation: OK"
    else
        echo "Warning: Output file is not valid JSON"
        exit 1
    fi
fi

echo "Done!"
