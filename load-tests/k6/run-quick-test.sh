#!/bin/bash

# VoiceAssist K6 Quick Test Runner
# Runs smoke test and load test for quick validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:8000}"
RESULTS_DIR="../results"

# Create results directory
mkdir -p "${RESULTS_DIR}"

echo -e "${BLUE}"
echo "============================================================"
echo "  VoiceAssist K6 Quick Test"
echo "============================================================"
echo -e "${NC}"
echo "Base URL: ${BASE_URL}"
echo "Duration: ~10 minutes (smoke + load test)"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}ERROR: k6 is not installed${NC}"
    echo "Install with: brew install k6  (macOS)"
    exit 1
fi

echo -e "${GREEN}k6 version: $(k6 version)${NC}"
echo ""

# Test 1: Smoke Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Running: Smoke Test (1 minute)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if k6 run --env BASE_URL="${BASE_URL}" --env WS_URL="${WS_URL}" 01-smoke-test.js; then
    echo ""
    echo -e "${GREEN}✓ Smoke Test PASSED${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Smoke Test FAILED${NC}"
    echo "Fix issues before proceeding to load test."
    exit 1
fi

# Wait before next test
echo -e "${YELLOW}Waiting 10 seconds before load test...${NC}"
sleep 10

# Test 2: Load Test
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Running: Load Test (9 minutes)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if k6 run --env BASE_URL="${BASE_URL}" --env WS_URL="${WS_URL}" 02-load-test.js; then
    echo ""
    echo -e "${GREEN}✓ Load Test PASSED${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Load Test FAILED${NC}"
    exit 1
fi

# Summary
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}  Quick Test Complete - All Tests Passed!${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "View results:"
echo "  cat ${RESULTS_DIR}/smoke-test-summary.json | jq ."
echo "  cat ${RESULTS_DIR}/load-test-summary.json | jq ."
echo ""
echo "Next steps:"
echo "  - Run stress test: k6 run 03-stress-test.js"
echo "  - Run full suite: ./run-all-tests.sh"
echo "  - Monitor Grafana: http://localhost:3000"
echo ""
