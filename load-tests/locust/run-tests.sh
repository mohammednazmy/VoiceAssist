#!/bin/bash

################################################################################
# VoiceAssist Locust Load Test Runner
#
# Provides convenient commands to run different test scenarios with
# pre-configured settings for users, spawn rate, and duration.
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/../results/locust"
BASE_URL="${VOICEASSIST_BASE_URL:-http://localhost:8000}"
WS_URL="${VOICEASSIST_WS_URL:-ws://localhost:8000}"

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Helper functions
print_header() {
    echo -e "${BLUE}================================================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if Locust is installed
check_locust() {
    if ! command -v locust &> /dev/null; then
        print_error "Locust is not installed. Installing dependencies..."
        pip install -r requirements.txt
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    smoke           Run smoke test (10 users, 2m)
    load            Run load test (100 users, 10m)
    stress          Run stress test (500 users, 15m)
    spike           Run spike test (1000 users, 5m)
    soak            Run soak test (100 users, 60m)
    user-journey    Run user journey scenario
    admin-workflow  Run admin workflow scenario
    web             Start Locust web UI
    distributed     Start distributed Locust with Docker Compose
    help            Show this help message

Options:
    --host=URL      Target host URL (default: http://localhost:8000)
    --users=N       Number of users (overrides scenario default)
    --spawn-rate=N  Spawn rate (overrides scenario default)
    --run-time=T    Run time (overrides scenario default)
    --headless      Run in headless mode (no web UI)
    --tags=TAGS     Only run tasks with specified tags
    --exclude-tags  Exclude tasks with specified tags

Examples:
    # Run smoke test with web UI
    $0 smoke

    # Run load test in headless mode
    $0 load --headless

    # Run stress test with custom users
    $0 stress --users=1000 --spawn-rate=100

    # Run user journey scenario
    $0 user-journey

    # Start web UI for manual testing
    $0 web

    # Start distributed testing
    $0 distributed

Environment Variables:
    VOICEASSIST_BASE_URL    Target API URL (default: http://localhost:8000)
    VOICEASSIST_WS_URL      Target WebSocket URL (default: ws://localhost:8000)

EOF
}

# Run smoke test
run_smoke_test() {
    print_header "Running Smoke Test"
    echo "Target: ${BASE_URL}"
    echo "Users: 10, Spawn Rate: 2, Duration: 2m"
    echo ""

    locust -f locustfile.py \
        --host="${BASE_URL}" \
        --users=10 \
        --spawn-rate=2 \
        --run-time=2m \
        --headless \
        --html="${RESULTS_DIR}/smoke_test_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/smoke_test_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Smoke test completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run load test
run_load_test() {
    print_header "Running Load Test"
    echo "Target: ${BASE_URL}"
    echo "Users: 100, Spawn Rate: 10, Duration: 10m"
    echo ""

    locust -f locustfile.py \
        --host="${BASE_URL}" \
        --users=100 \
        --spawn-rate=10 \
        --run-time=10m \
        --headless \
        --html="${RESULTS_DIR}/load_test_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/load_test_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Load test completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run stress test
run_stress_test() {
    print_header "Running Stress Test"
    echo "Target: ${BASE_URL}"
    echo "Users: 500, Spawn Rate: 50, Duration: 15m"
    echo ""
    print_warning "This is a high-load test. Monitor system resources!"

    locust -f scenarios/stress_scenario.py \
        --host="${BASE_URL}" \
        --users=500 \
        --spawn-rate=50 \
        --run-time=15m \
        --headless \
        --html="${RESULTS_DIR}/stress_test_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/stress_test_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Stress test completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run spike test
run_spike_test() {
    print_header "Running Spike Test"
    echo "Target: ${BASE_URL}"
    echo "Users: 1000, Spawn Rate: 200, Duration: 5m"
    echo ""
    print_warning "This simulates a sudden traffic spike!"

    locust -f scenarios/spike_scenario.py \
        --host="${BASE_URL}" \
        --users=1000 \
        --spawn-rate=200 \
        --run-time=5m \
        --headless \
        --html="${RESULTS_DIR}/spike_test_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/spike_test_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Spike test completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run soak test
run_soak_test() {
    print_header "Running Soak Test (Endurance Test)"
    echo "Target: ${BASE_URL}"
    echo "Users: 100, Spawn Rate: 10, Duration: 60m"
    echo ""
    print_warning "This is a long-running test (1 hour). Monitor for memory leaks!"

    locust -f locustfile.py \
        --host="${BASE_URL}" \
        --users=100 \
        --spawn-rate=10 \
        --run-time=60m \
        --headless \
        --html="${RESULTS_DIR}/soak_test_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/soak_test_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Soak test completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run user journey scenario
run_user_journey() {
    print_header "Running User Journey Scenario"
    echo "Target: ${BASE_URL}"
    echo "Simulating complete user journey from registration to logout"
    echo ""

    locust -f scenarios/user_journey.py \
        --host="${BASE_URL}" \
        --users=10 \
        --spawn-rate=2 \
        --run-time=5m \
        --headless \
        --html="${RESULTS_DIR}/user_journey_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/user_journey_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "User journey scenario completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Run admin workflow scenario
run_admin_workflow() {
    print_header "Running Admin Workflow Scenario"
    echo "Target: ${BASE_URL}"
    echo "Simulating admin operations (document upload, management, monitoring)"
    echo ""

    locust -f scenarios/admin_workflow.py \
        --host="${BASE_URL}" \
        --users=5 \
        --spawn-rate=1 \
        --run-time=5m \
        --headless \
        --html="${RESULTS_DIR}/admin_workflow_$(date +%Y%m%d_%H%M%S).html" \
        --csv="${RESULTS_DIR}/admin_workflow_$(date +%Y%m%d_%H%M%S)" \
        "$@"

    print_success "Admin workflow scenario completed!"
    echo "Results saved to: ${RESULTS_DIR}"
}

# Start web UI
start_web_ui() {
    print_header "Starting Locust Web UI"
    echo "Target: ${BASE_URL}"
    echo ""
    print_success "Web UI will be available at: http://localhost:8089"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""

    locust -f locustfile.py \
        --host="${BASE_URL}" \
        "$@"
}

# Start distributed testing
start_distributed() {
    print_header "Starting Distributed Locust Testing"
    echo ""

    if ! command -v docker-compose &> /dev/null; then
        print_error "docker-compose is not installed"
        exit 1
    fi

    export VOICEASSIST_BASE_URL="${BASE_URL}"
    export VOICEASSIST_WS_URL="${WS_URL}"
    export LOCUST_WORKER_COUNT=4

    print_success "Starting Locust master and 4 workers..."
    docker-compose up -d

    echo ""
    print_success "Distributed Locust is running!"
    echo "Web UI: http://localhost:8089"
    echo ""
    echo "To view logs:"
    echo "  docker-compose logs -f locust-master"
    echo "  docker-compose logs -f locust-worker-1"
    echo ""
    echo "To scale workers:"
    echo "  docker-compose up -d --scale locust-worker=8"
    echo ""
    echo "To stop:"
    echo "  docker-compose down"
}

# Stop distributed testing
stop_distributed() {
    print_header "Stopping Distributed Locust Testing"
    docker-compose down
    print_success "Distributed Locust stopped!"
}

# Main command handler
main() {
    check_locust

    case "${1:-help}" in
        smoke)
            shift
            run_smoke_test "$@"
            ;;
        load)
            shift
            run_load_test "$@"
            ;;
        stress)
            shift
            run_stress_test "$@"
            ;;
        spike)
            shift
            run_spike_test "$@"
            ;;
        soak)
            shift
            run_soak_test "$@"
            ;;
        user-journey)
            shift
            run_user_journey "$@"
            ;;
        admin-workflow)
            shift
            run_admin_workflow "$@"
            ;;
        web)
            shift
            start_web_ui "$@"
            ;;
        distributed)
            shift
            start_distributed
            ;;
        stop-distributed)
            stop_distributed
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
