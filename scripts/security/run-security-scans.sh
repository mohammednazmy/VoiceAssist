#!/bin/bash
# VoiceAssist V2 - Security Scanning Script
# Phase 9: Infrastructure as Code
#
# Runs all security scans locally before committing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}VoiceAssist V2 Security Scanner${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Track results
FAILED_SCANS=()
PASSED_SCANS=()

# Function to run a scan
run_scan() {
    local scan_name=$1
    local scan_command=$2

    echo -e "${YELLOW}Running: $scan_name${NC}"

    if eval "$scan_command"; then
        echo -e "${GREEN}✓ $scan_name passed${NC}\n"
        PASSED_SCANS+=("$scan_name")
    else
        echo -e "${RED}✗ $scan_name failed${NC}\n"
        FAILED_SCANS+=("$scan_name")
    fi
}

# Check if tools are installed
check_tool() {
    local tool=$1
    local install_cmd=$2

    if ! command -v "$tool" &> /dev/null; then
        echo -e "${YELLOW}$tool not found. Install with: $install_cmd${NC}"
        return 1
    fi
    return 0
}

# 1. Bandit - Python security linter
if check_tool bandit "pip install bandit"; then
    run_scan "Bandit (Python Security)" \
        "bandit -r services/api-gateway/app -f json -o bandit-report.json && cat bandit-report.json | python -m json.tool | head -50"
fi

# 2. Safety - Python dependency checker
if check_tool safety "pip install safety"; then
    run_scan "Safety (Dependency Vulnerabilities)" \
        "cd services/api-gateway && safety check --json --policy-file ../../.safety-policy.yml"
fi

# 3. Gitleaks - Secret scanner
if check_tool gitleaks "brew install gitleaks"; then
    run_scan "Gitleaks (Secret Detection)" \
        "gitleaks detect --config .gitleaks.toml --report-path gitleaks-report.json --verbose"
fi

# 4. Trivy - Container and IaC scanner
if check_tool trivy "brew install trivy"; then
    # Scan Dockerfile
    run_scan "Trivy (Dockerfile Scan)" \
        "trivy config services/api-gateway/Dockerfile --severity HIGH,CRITICAL --exit-code 1"

    # Scan Infrastructure as Code
    if [ -d "infrastructure/terraform" ]; then
        run_scan "Trivy (Terraform Scan)" \
            "trivy config infrastructure/terraform --severity HIGH,CRITICAL --exit-code 1"
    fi
fi

# 5. Checkov - Infrastructure as Code scanner
if check_tool checkov "pip install checkov"; then
    if [ -d "infrastructure/terraform" ]; then
        run_scan "Checkov (IaC Security)" \
            "checkov -d infrastructure/terraform --framework terraform --quiet --compact"
    fi
fi

# 6. Semgrep - Static analysis
if check_tool semgrep "pip install semgrep"; then
    run_scan "Semgrep (Static Analysis)" \
        "semgrep --config=auto services/api-gateway/app --json --output semgrep-report.json"
fi

# 7. Mypy - Type checking (security aspect)
if check_tool mypy "pip install mypy"; then
    run_scan "Mypy (Type Safety)" \
        "cd services/api-gateway && mypy app --ignore-missing-imports --no-strict-optional"
fi

# 8. Pylint - Code quality and security
if check_tool pylint "pip install pylint"; then
    run_scan "Pylint (Code Quality)" \
        "cd services/api-gateway && pylint app --disable=all --enable=E,F --exit-zero"
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Security Scan Summary${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "${GREEN}Passed: ${#PASSED_SCANS[@]}${NC}"
for scan in "${PASSED_SCANS[@]}"; do
    echo -e "  ${GREEN}✓${NC} $scan"
done

echo -e "\n${RED}Failed: ${#FAILED_SCANS[@]}${NC}"
for scan in "${FAILED_SCANS[@]}"; do
    echo -e "  ${RED}✗${NC} $scan"
done

# Reports
echo -e "\n${BLUE}Reports generated:${NC}"
[ -f "bandit-report.json" ] && echo -e "  - bandit-report.json"
[ -f "gitleaks-report.json" ] && echo -e "  - gitleaks-report.json"
[ -f "trivy-report.json" ] && echo -e "  - trivy-report.json"
[ -f "semgrep-report.json" ] && echo -e "  - semgrep-report.json"

# Exit code
if [ ${#FAILED_SCANS[@]} -gt 0 ]; then
    echo -e "\n${RED}Security scans failed. Please review and fix issues.${NC}"
    exit 1
else
    echo -e "\n${GREEN}All security scans passed!${NC}"
    exit 0
fi
