#!/bin/bash

###############################################################################
# VoiceAssist Deployment Script
#
# Main deployment orchestrator for VoiceAssist application
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -v, --version TAG        Version tag to deploy [required]
#   -d, --dry-run           Perform dry-run without actual deployment
#   -V, --verbose           Enable verbose output
#   -s, --skip-tests        Skip smoke tests after deployment
#   -h, --help              Show this help message
#
# Examples:
#   ./deploy.sh -e staging -v v1.2.3
#   ./deploy.sh --environment prod --version v1.2.3 --verbose
#   ./deploy.sh -e dev -v latest --dry-run
#
###############################################################################

set -o pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Script directory and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/deploy"
LOG_FILE="${LOG_DIR}/deploy_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
VERSION=""
DRY_RUN=false
VERBOSE=false
SKIP_TESTS=false

# Deployment configuration
declare -A ECR_REPOS=(
    ["backend"]="voiceassist-backend"
    ["worker"]="voiceassist-worker"
    ["frontend"]="voiceassist-frontend"
)

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
EKS_CLUSTER_NAME_PREFIX="voiceassist-eks"

###############################################################################
# Helper Functions
###############################################################################

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_FILE}"
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

check_dependencies() {
    local missing_deps=()
    local required_commands=("kubectl" "docker" "aws" "jq")

    log_info "Checking required dependencies..."

    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            missing_deps+=("${cmd}")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install missing dependencies and try again"
        return 1
    fi

    log_success "All dependencies are available"
    return 0
}

validate_environment() {
    case "${ENVIRONMENT}" in
        dev|staging|prod)
            log_success "Environment '${ENVIRONMENT}' is valid"
            return 0
            ;;
        *)
            log_error "Invalid environment: ${ENVIRONMENT}"
            log_error "Must be one of: dev, staging, prod"
            return 1
            ;;
    esac
}

get_aws_account_id() {
    if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
        log_info "Retrieving AWS account ID..."
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

        if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
            log_error "Failed to retrieve AWS account ID"
            return 1
        fi

        log_verbose "AWS Account ID: ${AWS_ACCOUNT_ID}"
    fi

    export AWS_ACCOUNT_ID
    return 0
}

run_pre_deployment_checks() {
    log_info "Running pre-deployment checks..."

    local pre_check_script="${SCRIPT_DIR}/pre-deploy-checks.sh"

    if [[ ! -f "${pre_check_script}" ]]; then
        log_error "Pre-deployment check script not found: ${pre_check_script}"
        return 1
    fi

    local check_cmd="${pre_check_script} -e ${ENVIRONMENT}"
    [[ "${VERBOSE}" == "true" ]] && check_cmd="${check_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && check_cmd="${check_cmd} -d"

    if bash "${check_cmd}"; then
        log_success "Pre-deployment checks passed"
        return 0
    else
        log_error "Pre-deployment checks failed"
        return 1
    fi
}

create_backup() {
    log_info "Creating backup before deployment..."

    local backup_script="${SCRIPT_DIR}/backup.sh"

    if [[ ! -f "${backup_script}" ]]; then
        log_warning "Backup script not found: ${backup_script}"
        log_warning "Skipping backup creation"
        return 0
    fi

    local backup_cmd="${backup_script} -e ${ENVIRONMENT} -v ${VERSION}"
    [[ "${VERBOSE}" == "true" ]] && backup_cmd="${backup_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && backup_cmd="${backup_cmd} -d"

    if bash ${backup_cmd}; then
        log_success "Backup created successfully"
        return 0
    else
        log_error "Backup creation failed"
        return 1
    fi
}

build_and_push_images() {
    log_info "Building and pushing Docker images..."

    local ecr_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

    # Login to ECR
    log_info "Logging in to ECR..."
    if [[ "${DRY_RUN}" == "false" ]]; then
        if ! aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ecr_registry}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_error "Failed to login to ECR"
            return 1
        fi
    fi

    # Build and push each image
    for service in "${!ECR_REPOS[@]}"; do
        local repo_name="${ECR_REPOS[$service]}"
        local image_tag="${ecr_registry}/${repo_name}:${VERSION}"

        log_info "Building ${service} image..."
        log_verbose "Image tag: ${image_tag}"

        if [[ "${DRY_RUN}" == "false" ]]; then
            # Determine Dockerfile path
            local dockerfile="${PROJECT_ROOT}/docker/Dockerfile.${service}"
            [[ ! -f "${dockerfile}" ]] && dockerfile="${PROJECT_ROOT}/Dockerfile"

            if [[ ! -f "${dockerfile}" ]]; then
                log_error "Dockerfile not found for ${service}"
                return 1
            fi

            # Build image
            if ! docker build -t "${image_tag}" -f "${dockerfile}" "${PROJECT_ROOT}" 2>&1 | tee -a "${LOG_FILE}"; then
                log_error "Failed to build ${service} image"
                return 1
            fi

            # Push image
            log_info "Pushing ${service} image to ECR..."
            if ! docker push "${image_tag}" 2>&1 | tee -a "${LOG_FILE}"; then
                log_error "Failed to push ${service} image"
                return 1
            fi

            log_success "${service} image built and pushed successfully"
        else
            log_info "[DRY-RUN] Would build and push: ${image_tag}"
        fi
    done

    log_success "All images built and pushed successfully"
    return 0
}

run_database_migrations() {
    log_info "Running database migrations..."

    local migrate_script="${SCRIPT_DIR}/migrate.sh"

    if [[ ! -f "${migrate_script}" ]]; then
        log_warning "Migration script not found: ${migrate_script}"
        log_warning "Skipping migrations"
        return 0
    fi

    local migrate_cmd="${migrate_script} -e ${ENVIRONMENT} --direction up"
    [[ "${VERBOSE}" == "true" ]] && migrate_cmd="${migrate_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && migrate_cmd="${migrate_cmd} -d"

    if bash ${migrate_cmd}; then
        log_success "Database migrations completed successfully"
        return 0
    else
        log_error "Database migrations failed"
        return 1
    fi
}

deploy_to_kubernetes() {
    log_info "Deploying to Kubernetes..."

    local k8s_deploy_script="${SCRIPT_DIR}/../k8s/deploy-to-k8s.sh"

    if [[ ! -f "${k8s_deploy_script}" ]]; then
        log_error "Kubernetes deployment script not found: ${k8s_deploy_script}"
        return 1
    fi

    local deploy_cmd="${k8s_deploy_script} -e ${ENVIRONMENT} -v ${VERSION}"
    [[ "${VERBOSE}" == "true" ]] && deploy_cmd="${deploy_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && deploy_cmd="${deploy_cmd} -d"

    if bash ${deploy_cmd}; then
        log_success "Kubernetes deployment completed successfully"
        return 0
    else
        log_error "Kubernetes deployment failed"
        return 1
    fi
}

run_smoke_tests() {
    if [[ "${SKIP_TESTS}" == "true" ]]; then
        log_warning "Skipping smoke tests as requested"
        return 0
    fi

    log_info "Running smoke tests..."

    local health_check_script="${SCRIPT_DIR}/../monitoring/health-check.sh"

    if [[ ! -f "${health_check_script}" ]]; then
        log_warning "Health check script not found: ${health_check_script}"
        log_warning "Skipping smoke tests"
        return 0
    fi

    # Wait a bit for services to stabilize
    if [[ "${DRY_RUN}" == "false" ]]; then
        log_info "Waiting 30 seconds for services to stabilize..."
        sleep 30
    fi

    local health_cmd="${health_check_script} -e ${ENVIRONMENT}"
    [[ "${VERBOSE}" == "true" ]] && health_cmd="${health_cmd} -V"

    if bash ${health_cmd}; then
        log_success "Smoke tests passed"
        return 0
    else
        log_error "Smoke tests failed"
        return 1
    fi
}

send_notification() {
    local status=$1
    local message=$2

    log_info "Sending deployment notification..."

    # Build notification message
    local notification_text="VoiceAssist Deployment
Environment: ${ENVIRONMENT}
Version: ${VERSION}
Status: ${status}
Message: ${message}
Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"

    # Send to Slack if webhook is configured
    if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
        local color="good"
        [[ "${status}" != "SUCCESS" ]] && color="danger"

        local payload=$(cat <<EOF
{
    "attachments": [{
        "color": "${color}",
        "title": "VoiceAssist Deployment - ${status}",
        "fields": [
            {"title": "Environment", "value": "${ENVIRONMENT}", "short": true},
            {"title": "Version", "value": "${VERSION}", "short": true},
            {"title": "Message", "value": "${message}", "short": false}
        ],
        "footer": "VoiceAssist Deployment",
        "ts": $(date +%s)
    }]
}
EOF
        )

        if [[ "${DRY_RUN}" == "false" ]]; then
            curl -X POST -H 'Content-type: application/json' --data "${payload}" "${SLACK_WEBHOOK_URL}" 2>&1 | tee -a "${LOG_FILE}"
        else
            log_info "[DRY-RUN] Would send Slack notification"
        fi
    fi

    log_verbose "Notification sent"
}

record_deployment() {
    local status=$1

    log_info "Recording deployment information..."

    local deployment_record="${LOG_DIR}/deployments.json"
    local deployment_data=$(cat <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "${ENVIRONMENT}",
    "version": "${VERSION}",
    "status": "${status}",
    "deployed_by": "${USER}",
    "log_file": "${LOG_FILE}"
}
EOF
    )

    if [[ "${DRY_RUN}" == "false" ]]; then
        # Initialize file if it doesn't exist
        [[ ! -f "${deployment_record}" ]] && echo "[]" > "${deployment_record}"

        # Append deployment record
        local temp_file=$(mktemp)
        jq ". += [${deployment_data}]" "${deployment_record}" > "${temp_file}" && mv "${temp_file}" "${deployment_record}"

        log_success "Deployment recorded"
    else
        log_info "[DRY-RUN] Would record deployment"
    fi
}

cleanup() {
    log_info "Cleaning up..."

    # Remove temporary files if any
    # Add cleanup logic here

    log_verbose "Cleanup completed"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    # Create log directory
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Deployment Started ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Version: ${VERSION}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "Log File: ${LOG_FILE}"

    # Check dependencies
    if ! check_dependencies; then
        log_error "Dependency check failed"
        return 1
    fi

    # Validate environment
    if ! validate_environment; then
        log_error "Environment validation failed"
        return 1
    fi

    # Get AWS account ID
    if ! get_aws_account_id; then
        log_error "Failed to get AWS account ID"
        return 1
    fi

    # Run pre-deployment checks
    if ! run_pre_deployment_checks; then
        log_error "Pre-deployment checks failed"
        send_notification "FAILED" "Pre-deployment checks failed"
        return 1
    fi

    # Create backup
    if ! create_backup; then
        log_error "Backup creation failed"
        send_notification "FAILED" "Backup creation failed"
        return 1
    fi

    # Build and push Docker images
    if ! build_and_push_images; then
        log_error "Image build/push failed"
        send_notification "FAILED" "Docker image build/push failed"
        return 1
    fi

    # Deploy to Kubernetes
    if ! deploy_to_kubernetes; then
        log_error "Kubernetes deployment failed"
        send_notification "FAILED" "Kubernetes deployment failed"
        return 1
    fi

    # Run database migrations
    if ! run_database_migrations; then
        log_error "Database migrations failed"
        send_notification "FAILED" "Database migrations failed"
        return 1
    fi

    # Run smoke tests
    if ! run_smoke_tests; then
        log_warning "Smoke tests failed - deployment may need attention"
        send_notification "WARNING" "Deployment completed but smoke tests failed"
        record_deployment "WARNING"
        return 1
    fi

    # Record successful deployment
    record_deployment "SUCCESS"

    # Send success notification
    send_notification "SUCCESS" "Deployment completed successfully"

    log_success "=== Deployment Completed Successfully ==="
    log_info "Version ${VERSION} deployed to ${ENVIRONMENT}"
    log_info "Log file: ${LOG_FILE}"

    return 0
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
            -v|--version)
                VERSION="$2"
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
            -s|--skip-tests)
                SKIP_TESTS=true
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

    # Validate required arguments
    if [[ -z "${ENVIRONMENT}" ]]; then
        log_error "Environment is required"
        show_usage
    fi

    if [[ -z "${VERSION}" ]]; then
        log_error "Version is required"
        show_usage
    fi
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit_code=$?

cleanup

exit ${exit_code}
