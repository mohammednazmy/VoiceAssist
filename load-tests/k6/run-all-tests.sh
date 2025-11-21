#!/bin/bash

# VoiceAssist K6 Load Tests - Run All Tests
# This script runs all k6 load tests sequentially and generates a summary report

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:8000}"
RESULTS_DIR="../results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${RESULTS_DIR}/test-run-${TIMESTAMP}.txt"

# Test files
TESTS=(
    "01-smoke-test.js"
    "02-load-test.js"
    "03-stress-test.js"
    "04-spike-test.js"
    "05-endurance-test.js"
    "06-api-scenarios.js"
    "07-websocket-test.js"
)

# Test names
TEST_NAMES=(
    "Smoke Test"
    "Load Test"
    "Stress Test"
    "Spike Test"
    "Endurance Test"
    "API Scenarios"
    "WebSocket Test"
)

# Test durations (approximate in minutes)
TEST_DURATIONS=(
    "1"
    "9"
    "22"
    "8"
    "30"
    "10"
    "5"
)

# Track results
PASSED_TESTS=()
FAILED_TESTS=()

# Create results directory if it doesn't exist
mkdir -p "${RESULTS_DIR}"

# Banner
echo -e "${BLUE}"
echo "============================================================"
echo "  VoiceAssist K6 Load Tests - Full Suite"
echo "============================================================"
echo -e "${NC}"
echo "Base URL: ${BASE_URL}"
echo "WebSocket URL: ${WS_URL}"
echo "Results Directory: ${RESULTS_DIR}"
echo "Report File: ${REPORT_FILE}"
echo ""
echo "Tests to run: ${#TESTS[@]}"
echo "Total estimated time: ~85 minutes"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}ERROR: k6 is not installed${NC}"
    echo "Please install k6: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

echo -e "${GREEN}k6 is installed: $(k6 version)${NC}"
echo ""

# Confirm before running
read -p "Do you want to proceed with all tests? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Start report
{
    echo "VoiceAssist K6 Load Tests - Full Suite Report"
    echo "=============================================="
    echo "Timestamp: $(date)"
    echo "Base URL: ${BASE_URL}"
    echo "WebSocket URL: ${WS_URL}"
    echo ""
} > "${REPORT_FILE}"

# Function to run a test
run_test() {
    local test_file=$1
    local test_name=$2
    local test_duration=$3
    local test_num=$4

    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}Test ${test_num}/${#TESTS[@]}: ${test_name}${NC}"
    echo -e "${BLUE}Duration: ~${test_duration} minutes${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    # Add to report
    {
        echo "================================================"
        echo "Test ${test_num}/${#TESTS[@]}: ${test_name}"
        echo "File: ${test_file}"
        echo "Started: $(date)"
        echo "================================================"
        echo ""
    } >> "${REPORT_FILE}"

    # Run the test
    local start_time=$(date +%s)

    if k6 run --env BASE_URL="${BASE_URL}" --env WS_URL="${WS_URL}" "${test_file}"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "${GREEN}✓ ${test_name} PASSED${NC} (${duration}s)"
        PASSED_TESTS+=("${test_name}")

        {
            echo "Result: PASSED"
            echo "Actual Duration: ${duration}s"
            echo ""
        } >> "${REPORT_FILE}"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "${RED}✗ ${test_name} FAILED${NC} (${duration}s)"
        FAILED_TESTS+=("${test_name}")

        {
            echo "Result: FAILED"
            echo "Actual Duration: ${duration}s"
            echo ""
        } >> "${REPORT_FILE}"

        # Ask if should continue
        read -p "Test failed. Continue with remaining tests? (Y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Aborted after failure."
            exit 1
        fi
    fi

    # Wait between tests
    if [ ${test_num} -lt ${#TESTS[@]} ]; then
        echo ""
        echo -e "${YELLOW}Waiting 30 seconds before next test...${NC}"
        sleep 30
    fi
}

# Run all tests
overall_start=$(date +%s)

for i in "${!TESTS[@]}"; do
    run_test "${TESTS[$i]}" "${TEST_NAMES[$i]}" "${TEST_DURATIONS[$i]}" $((i + 1))
done

overall_end=$(date +%s)
overall_duration=$((overall_end - overall_start))
overall_minutes=$((overall_duration / 60))

# Final summary
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  Test Suite Complete${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "Total Duration: ${overall_minutes} minutes (${overall_duration}s)"
echo ""
echo -e "${GREEN}Passed Tests: ${#PASSED_TESTS[@]}${NC}"
for test in "${PASSED_TESTS[@]}"; do
    echo -e "  ${GREEN}✓${NC} ${test}"
done
echo ""

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed Tests: ${#FAILED_TESTS[@]}${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} ${test}"
    done
    echo ""
fi

# Success rate
total_tests=${#TESTS[@]}
passed_tests=${#PASSED_TESTS[@]}
success_rate=$((passed_tests * 100 / total_tests))

echo "Success Rate: ${success_rate}%"
echo ""

# Add final summary to report
{
    echo ""
    echo "=============================================="
    echo "Final Summary"
    echo "=============================================="
    echo "Completed: $(date)"
    echo "Total Duration: ${overall_minutes} minutes (${overall_duration}s)"
    echo ""
    echo "Passed Tests: ${#PASSED_TESTS[@]}"
    for test in "${PASSED_TESTS[@]}"; do
        echo "  ✓ ${test}"
    done
    echo ""
    echo "Failed Tests: ${#FAILED_TESTS[@]}"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  ✗ ${test}"
    done
    echo ""
    echo "Success Rate: ${success_rate}%"
    echo ""
} >> "${REPORT_FILE}"

echo "Full report saved to: ${REPORT_FILE}"
echo ""

# View results
echo -e "${YELLOW}View detailed results:${NC}"
echo "  cat ${RESULTS_DIR}/*-summary.json | jq ."
echo ""
echo -e "${YELLOW}View recommendations:${NC}"
echo "  cat ${RESULTS_DIR}/*-summary.json | jq '.recommendations'"
echo ""

# Exit with appropriate code
if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
