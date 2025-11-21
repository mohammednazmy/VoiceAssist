#!/bin/bash

###############################################################################
# VoiceAssist Pre-Deployment Checks
#
# Validates environment before deployment
#
# Usage:
#   ./pre-deploy-checks.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -d, --dry-run           Perform dry-run
#   -V, --verbose           Enable verbose output
#   -h, --help              Show this help message
#
# Examples:
#   ./pre-deploy-checks.sh -e staging
#   ./pre-deploy-checks.sh --environment prod --verbose
#
###############################################################################

set -o pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Script directory and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/checks"
LOG_FILE="${LOG_DIR}/pre-deploy-checks_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
DRY_RUN=false
VERBOSE=false

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

# Check results
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_FILE}"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_FILE}"
    ((CHECKS_WARNING++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_FILE}"
    ((CHECKS_FAILED++))
}

log_verbose() {
    if [[ "${VERBOSE}" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $*" | tee -a "${LOG_FILE}"
    fi
}

show_usage() {
    sed -n '/^###/,/^###/p' "$0" | sed '1d;$d' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_command() {
    local cmd=$1
    if command -v "${cmd}" &> /dev/null; then
        log_success "✓ ${cmd} is installed"
        return 0
    else
        log_error "✗ ${cmd} is not installed"
        return 1
    fi
}

###############################################################################
# Pre-Deployment Checks
###############################################################################

check_aws_credentials() {
    log_info "Checking AWS credentials..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check AWS credentials"
        log_success "✓ AWS credentials check"
        return 0
    fi

    # Check if AWS CLI is configured
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "✗ AWS credentials are not configured or invalid"
        log_error "Please run 'aws configure' or set AWS environment variables"
        return 1
    fi

    # Get account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    local aws_user=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)

    log_verbose "AWS Account ID: ${AWS_ACCOUNT_ID}"
    log_verbose "AWS User/Role: ${aws_user}"

    log_success "✓ AWS credentials are valid"
    return 0
}

check_eks_access() {
    log_info "Checking EKS cluster access..."

    local cluster_name="voiceassist-eks-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check EKS access for ${cluster_name}"
        log_success "✓ EKS cluster access check"
        return 0
    fi

    # Check if cluster exists
    if ! aws eks describe-cluster --name "${cluster_name}" --region "${AWS_REGION}" &> /dev/null; then
        log_error "✗ EKS cluster '${cluster_name}' not found or not accessible"
        return 1
    fi

    # Update kubeconfig
    if ! aws eks update-kubeconfig --region "${AWS_REGION}" --name "${cluster_name}" &> /dev/null; then
        log_error "✗ Failed to update kubeconfig for cluster '${cluster_name}'"
        return 1
    fi

    # Test kubectl access
    if ! kubectl cluster-info &> /dev/null; then
        log_error "✗ Cannot connect to EKS cluster"
        return 1
    fi

    log_success "✓ EKS cluster '${cluster_name}' is accessible"
    return 0
}

check_database_connectivity() {
    log_info "Checking database connectivity..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check database connectivity"
        log_success "✓ Database connectivity check"
        return 0
    fi

    # Get database endpoint from AWS Secrets Manager
    local db_secret_name="voiceassist/${ENVIRONMENT}/database"
    local db_endpoint=$(aws secretsmanager get-secret-value \
        --secret-id "${db_secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null | jq -r '.host' 2>/dev/null)

    if [[ -z "${db_endpoint}" ]] || [[ "${db_endpoint}" == "null" ]]; then
        log_warning "⚠ Could not retrieve database endpoint from Secrets Manager"
        log_warning "Skipping database connectivity check"
        return 0
    fi

    log_verbose "Database endpoint: ${db_endpoint}"

    # Simple connectivity check using netcat or telnet
    local db_port=5432
    if command -v nc &> /dev/null; then
        if nc -z -w5 "${db_endpoint}" "${db_port}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "✓ Database is reachable"
            return 0
        else
            log_error "✗ Cannot connect to database at ${db_endpoint}:${db_port}"
            return 1
        fi
    else
        log_warning "⚠ netcat not available, skipping database connectivity check"
        return 0
    fi
}

check_secrets_manager() {
    log_info "Checking AWS Secrets Manager secrets..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check Secrets Manager"
        log_success "✓ Secrets Manager check"
        return 0
    fi

    local required_secrets=(
        "voiceassist/${ENVIRONMENT}/database"
        "voiceassist/${ENVIRONMENT}/redis"
        "voiceassist/${ENVIRONMENT}/jwt-secret"
        "voiceassist/${ENVIRONMENT}/openai-api-key"
    )

    local missing_secrets=()

    for secret in "${required_secrets[@]}"; do
        log_verbose "Checking secret: ${secret}"

        if aws secretsmanager describe-secret \
            --secret-id "${secret}" \
            --region "${AWS_REGION}" &> /dev/null; then
            log_verbose "  ✓ ${secret} exists"
        else
            log_verbose "  ✗ ${secret} missing"
            missing_secrets+=("${secret}")
        fi
    done

    if [[ ${#missing_secrets[@]} -gt 0 ]]; then
        log_error "✗ Missing secrets in Secrets Manager:"
        for secret in "${missing_secrets[@]}"; do
            log_error "  - ${secret}"
        done
        return 1
    fi

    log_success "✓ All required secrets exist in Secrets Manager"
    return 0
}

check_ecr_repositories() {
    log_info "Checking ECR repositories..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check ECR repositories"
        log_success "✓ ECR repositories check"
        return 0
    fi

    local required_repos=(
        "voiceassist-backend"
        "voiceassist-worker"
        "voiceassist-frontend"
    )

    local missing_repos=()

    for repo in "${required_repos[@]}"; do
        log_verbose "Checking repository: ${repo}"

        if aws ecr describe-repositories \
            --repository-names "${repo}" \
            --region "${AWS_REGION}" &> /dev/null; then
            log_verbose "  ✓ ${repo} exists"
        else
            log_verbose "  ✗ ${repo} missing"
            missing_repos+=("${repo}")
        fi
    done

    if [[ ${#missing_repos[@]} -gt 0 ]]; then
        log_error "✗ Missing ECR repositories:"
        for repo in "${missing_repos[@]}"; do
            log_error "  - ${repo}"
        done
        return 1
    fi

    log_success "✓ All required ECR repositories exist"
    return 0
}

check_disk_space() {
    log_info "Checking disk space..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check disk space"
        log_success "✓ Disk space check"
        return 0
    fi

    local available_space=$(df -h . | awk 'NR==2 {print $4}')
    local available_space_gb=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')

    log_verbose "Available disk space: ${available_space}"

    if [[ ${available_space_gb} -lt 5 ]]; then
        log_error "✗ Insufficient disk space: ${available_space} (minimum 5GB required)"
        return 1
    fi

    log_success "✓ Sufficient disk space available: ${available_space}"
    return 0
}

check_docker_running() {
    log_info "Checking Docker daemon..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check Docker"
        log_success "✓ Docker daemon check"
        return 0
    fi

    if ! docker info &> /dev/null; then
        log_error "✗ Docker daemon is not running"
        return 1
    fi

    log_success "✓ Docker daemon is running"
    return 0
}

check_kubernetes_resources() {
    log_info "Checking Kubernetes cluster resources..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check Kubernetes resources"
        log_success "✓ Kubernetes resources check"
        return 0
    fi

    local namespace="voiceassist-${ENVIRONMENT}"

    # Check if namespace exists
    if ! kubectl get namespace "${namespace}" &> /dev/null; then
        log_warning "⚠ Namespace '${namespace}' does not exist (will be created)"
    else
        log_verbose "Namespace '${namespace}' exists"
    fi

    # Check node status
    local node_count=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    local ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready")

    log_verbose "Cluster nodes: ${node_count}, Ready: ${ready_nodes}"

    if [[ ${ready_nodes} -eq 0 ]]; then
        log_error "✗ No ready nodes in cluster"
        return 1
    fi

    # Check for resource pressure
    local nodes_with_pressure=$(kubectl get nodes -o json 2>/dev/null | \
        jq -r '.items[] | select(.status.conditions[] | select(.type=="MemoryPressure" or .type=="DiskPressure") | .status=="True") | .metadata.name' | \
        wc -l)

    if [[ ${nodes_with_pressure} -gt 0 ]]; then
        log_warning "⚠ ${nodes_with_pressure} node(s) experiencing resource pressure"
    fi

    log_success "✓ Kubernetes cluster has ${ready_nodes} ready node(s)"
    return 0
}

check_redis_connectivity() {
    log_info "Checking Redis connectivity..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check Redis connectivity"
        log_success "✓ Redis connectivity check"
        return 0
    fi

    # Get Redis endpoint from AWS Secrets Manager
    local redis_secret_name="voiceassist/${ENVIRONMENT}/redis"
    local redis_endpoint=$(aws secretsmanager get-secret-value \
        --secret-id "${redis_secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null | jq -r '.host' 2>/dev/null)

    if [[ -z "${redis_endpoint}" ]] || [[ "${redis_endpoint}" == "null" ]]; then
        log_warning "⚠ Could not retrieve Redis endpoint from Secrets Manager"
        log_warning "Skipping Redis connectivity check"
        return 0
    fi

    log_verbose "Redis endpoint: ${redis_endpoint}"

    # Simple connectivity check
    local redis_port=6379
    if command -v nc &> /dev/null; then
        if nc -z -w5 "${redis_endpoint}" "${redis_port}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "✓ Redis is reachable"
            return 0
        else
            log_error "✗ Cannot connect to Redis at ${redis_endpoint}:${redis_port}"
            return 1
        fi
    else
        log_warning "⚠ netcat not available, skipping Redis connectivity check"
        return 0
    fi
}

check_environment_config() {
    log_info "Checking environment configuration..."

    # Validate environment value
    case "${ENVIRONMENT}" in
        dev|staging|prod)
            log_verbose "Environment '${ENVIRONMENT}' is valid"
            ;;
        *)
            log_error "✗ Invalid environment: ${ENVIRONMENT}"
            return 1
            ;;
    esac

    # Check for environment-specific config files
    local k8s_manifests_dir="${PROJECT_ROOT}/infrastructure/k8s/overlays/${ENVIRONMENT}"

    if [[ ! -d "${k8s_manifests_dir}" ]]; then
        log_warning "⚠ Kubernetes manifests directory not found: ${k8s_manifests_dir}"
    else
        log_verbose "Kubernetes manifests found for ${ENVIRONMENT}"
    fi

    log_success "✓ Environment configuration is valid"
    return 0
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Pre-Deployment Checks ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "Log File: ${LOG_FILE}"
    log_info ""

    # Run all checks
    check_command "aws"
    check_command "kubectl"
    check_command "docker"
    check_command "jq"
    echo ""

    check_environment_config
    check_aws_credentials
    check_eks_access
    check_ecr_repositories
    check_secrets_manager
    check_database_connectivity
    check_redis_connectivity
    check_docker_running
    check_kubernetes_resources
    check_disk_space

    # Summary
    echo ""
    log_info "=== Check Summary ==="
    log_info "Passed: ${CHECKS_PASSED}"
    log_info "Warnings: ${CHECKS_WARNING}"
    log_info "Failed: ${CHECKS_FAILED}"

    if [[ ${CHECKS_FAILED} -gt 0 ]]; then
        log_error "=== Pre-Deployment Checks FAILED ==="
        log_error "Please resolve the issues above before deploying"
        return 1
    elif [[ ${CHECKS_WARNING} -gt 0 ]]; then
        log_warning "=== Pre-Deployment Checks PASSED with warnings ==="
        log_warning "Review warnings before proceeding"
        return 0
    else
        log_success "=== All Pre-Deployment Checks PASSED ==="
        return 0
    fi
}

###############################################################################
# Parse Arguments
###############################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -V|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_usage
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                ;;
        esac
    done

    if [[ -z "${ENVIRONMENT}" ]]; then
        log_error "Environment is required"
        show_usage
    fi
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
