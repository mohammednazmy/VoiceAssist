#!/bin/bash
# Run Chaos Engineering Tests (Phase 7 - P3.5)
#
# Usage: ./scripts/run-chaos-tests.sh [experiment-name]
# Example: ./scripts/run-chaos-tests.sh database-failure
#
# If no experiment specified, runs all experiments.

set -e

CHAOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/chaos"
EXPERIMENTS_DIR="$CHAOS_DIR/experiments"
REPORTS_DIR="$CHAOS_DIR/reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Check if chaos toolkit is installed
if ! command -v chaos &> /dev/null; then
    echo -e "${YELLOW}Chaos Toolkit not found. Installing...${NC}"
    pip install -r "$CHAOS_DIR/chaos-requirements.txt"
fi

# Function to run a single experiment
run_experiment() {
    local experiment_file=$1
    local experiment_name=$(basename "$experiment_file" .yaml)
    local report_file="$REPORTS_DIR/${experiment_name}-$(date +%Y%m%d-%H%M%S).json"

    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Running: $experiment_name${NC}"
    echo -e "${YELLOW}========================================${NC}\n"

    if chaos run "$experiment_file" --journal-path="$report_file"; then
        echo -e "\n${GREEN}✓ $experiment_name PASSED${NC}"
        return 0
    else
        echo -e "\n${RED}✗ $experiment_name FAILED${NC}"
        echo -e "${RED}Report saved to: $report_file${NC}"
        return 1
    fi
}

# Main execution
if [ -n "$1" ]; then
    # Run specific experiment
    EXPERIMENT_FILE="$EXPERIMENTS_DIR/$1.yaml"

    if [ ! -f "$EXPERIMENT_FILE" ]; then
        echo -e "${RED}Error: Experiment not found: $EXPERIMENT_FILE${NC}"
        echo "Available experiments:"
        ls "$EXPERIMENTS_DIR"/*.yaml | xargs -n 1 basename | sed 's/.yaml//'
        exit 1
    fi

    run_experiment "$EXPERIMENT_FILE"
else
    # Run all experiments
    echo -e "${GREEN}Running all chaos experiments...${NC}"

    failed_count=0
    passed_count=0

    for experiment_file in "$EXPERIMENTS_DIR"/*.yaml; do
        if run_experiment "$experiment_file"; then
            ((passed_count++))
        else
            ((failed_count++))
        fi
    done

    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Chaos Engineering Test Summary${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${GREEN}Passed: $passed_count${NC}"
    echo -e "${RED}Failed: $failed_count${NC}"
    echo -e "\nReports saved to: $REPORTS_DIR"

    if [ $failed_count -gt 0 ]; then
        exit 1
    fi
fi

echo -e "\n${GREEN}All chaos experiments completed successfully!${NC}"
