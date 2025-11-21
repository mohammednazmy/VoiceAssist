#!/bin/bash
# Run E2E tests for VoiceAssist (Phase 7 - P2.2)

set -e

echo "=================================================="
echo "VoiceAssist E2E Test Runner"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if services are running
echo "Checking service health..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${RED}ERROR: VoiceAssist server is not running!${NC}"
    echo "Please start services with: docker compose up -d"
    exit 1
fi
echo -e "${GREEN}✓ VoiceAssist server is running${NC}"
echo ""

# Set test database URL
export TEST_DATABASE_URL="postgresql://voiceassist:changeme_secure_password@localhost:5432/voiceassist_test"

# Create test database if it doesn't exist
echo "Setting up test database..."
PGPASSWORD=changeme_secure_password psql -h localhost -U voiceassist -d postgres -c "CREATE DATABASE voiceassist_test;" 2>/dev/null || echo "Test database already exists"
echo -e "${GREEN}✓ Test database ready${NC}"
echo ""

# Parse command line arguments
TEST_TYPE="${1:-all}"
VERBOSE="${2:-}"

# Run tests based on type
case $TEST_TYPE in
    "all")
        echo "Running all E2E tests..."
        pytest -c pytest.e2e.ini tests/e2e/ $VERBOSE
        ;;
    "journey")
        echo "Running user journey tests..."
        pytest -c pytest.e2e.ini tests/e2e/test_complete_user_journey.py $VERBOSE
        ;;
    "resilience")
        echo "Running service resilience tests..."
        pytest -c pytest.e2e.ini tests/e2e/test_service_resilience.py $VERBOSE
        ;;
    "performance")
        echo "Running performance tests..."
        pytest -c pytest.e2e.ini tests/e2e/test_performance_characteristics.py $VERBOSE
        ;;
    "quick")
        echo "Running quick smoke tests..."
        pytest -c pytest.e2e.ini tests/e2e/test_complete_user_journey.py::TestCompleteUserJourney::test_full_user_journey $VERBOSE
        ;;
    *)
        echo -e "${RED}Unknown test type: $TEST_TYPE${NC}"
        echo ""
        echo "Usage: ./run_e2e_tests.sh [test_type] [pytest_options]"
        echo ""
        echo "Test types:"
        echo "  all          - Run all E2E tests (default)"
        echo "  journey      - Run complete user journey tests"
        echo "  resilience   - Run service failure and recovery tests"
        echo "  performance  - Run performance benchmark tests"
        echo "  quick        - Run quick smoke test"
        echo ""
        echo "Pytest options:"
        echo "  -v           - Verbose output"
        echo "  -s           - Show print statements"
        echo "  -x           - Stop on first failure"
        echo "  --pdb        - Drop into debugger on failure"
        echo ""
        exit 1
        ;;
esac

TEST_EXIT_CODE=$?

echo ""
echo "=================================================="
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
else
    echo -e "${RED}✗ Some tests failed${NC}"
fi
echo "=================================================="

exit $TEST_EXIT_CODE
