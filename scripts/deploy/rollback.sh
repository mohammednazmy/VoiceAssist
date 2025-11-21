#!/bin/bash

###############################################################################
# VoiceAssist Rollback Script
#
# Rollback deployment to previous version
#
# Usage:
#   ./rollback.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -v, --version TAG        Version to rollback to (optional, auto-detects last)
#   -d, --dry-run           Perform dry-run without actual rollback
#   -V, --verbose           Enable verbose output
#   -m, --skip-migrations   Skip database migration rollback
#   -h, --help              Show this help message
#
# Examples:
#   ./rollback.sh -e staging
#   ./rollback.sh --environment prod --version v1.2.2
#   ./rollback.sh -e dev --dry-run --verbose
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
LOG_DIR="${PROJECT_ROOT}/logs/rollback"
LOG_FILE="${LOG_DIR}/rollback_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
ROLLBACK_VERSION=""
DRY_RUN=false
VERBOSE=false
SKIP_MIGRATIONS=false

AWS_REGION="${AWS_REGION:-us-east-1}"
EKS_CLUSTER_NAME_PREFIX="voiceassist-eks"

###############################################################################
# Helper Functions
###############################################################################

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
    local required_commands=("kubectl" "aws" "jq")

    log_info "Checking required dependencies..."

    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            missing_deps+=("${cmd}")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        return 1
    fi

    log_success "All dependencies are available"
    return 0
}

configure_kubectl() {
    local cluster_name="${EKS_CLUSTER_NAME_PREFIX}-${ENVIRONMENT}"

    log_info "Configuring kubectl for cluster: ${cluster_name}"

    if [[ "${DRY_RUN}" == "false" ]]; then
        if ! aws eks update-kubeconfig --region "${AWS_REGION}" --name "${cluster_name}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_error "Failed to configure kubectl"
            return 1
        fi
    fi

    log_success "kubectl configured"
    return 0
}

get_current_version() {
    log_info "Getting current deployment version..."

    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "false" ]]; then
        # Get version from deployment annotation
        local version=$(kubectl get deployment voiceassist-backend \
            -n "${namespace}" \
            -o jsonpath='{.metadata.annotations.version}' 2>/dev/null)

        if [[ -z "${version}" ]]; then
            # Try getting from image tag
            version=$(kubectl get deployment voiceassist-backend \
                -n "${namespace}" \
                -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | \
                grep -oP ':\K[^:]+$')
        fi

        echo "${version}"
    else
        log_info "[DRY-RUN] Would get current version"
        echo "v1.2.3"
    fi
}

get_previous_successful_version() {
    log_info "Finding previous successful deployment..."

    local deployments_file="${PROJECT_ROOT}/logs/deploy/deployments.json"

    if [[ ! -f "${deployments_file}" ]]; then
        log_error "Deployments record file not found: ${deployments_file}"
        return 1
    fi

    # Get the last successful deployment for this environment
    local previous_version=$(jq -r \
        --arg env "${ENVIRONMENT}" \
        '[.[] | select(.environment == $env and .status == "SUCCESS")] | .[-2].version' \
        "${deployments_file}" 2>/dev/null)

    if [[ -z "${previous_version}" ]] || [[ "${previous_version}" == "null" ]]; then
        log_error "No previous successful deployment found"
        return 1
    fi

    echo "${previous_version}"
    return 0
}

confirm_rollback() {
    local current_version=$1
    local target_version=$2

    log_warning "=== ROLLBACK CONFIRMATION ==="
    log_warning "Environment: ${ENVIRONMENT}"
    log_warning "Current Version: ${current_version}"
    log_warning "Target Version: ${target_version}"
    log_warning ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Skipping confirmation"
        return 0
    fi

    if [[ "${ENVIRONMENT}" == "prod" ]]; then
        read -p "This is a PRODUCTION rollback. Type 'ROLLBACK' to confirm: " confirmation
        if [[ "${confirmation}" != "ROLLBACK" ]]; then
            log_error "Rollback cancelled by user"
            return 1
        fi
    else
        read -p "Proceed with rollback? (yes/no): " confirmation
        if [[ "${confirmation}" != "yes" ]]; then
            log_error "Rollback cancelled by user"
            return 1
        fi
    fi

    return 0
}

rollback_kubernetes_deployment() {
    local target_version=$1
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Rolling back Kubernetes deployments to ${target_version}..."

    local deployments=("voiceassist-backend" "voiceassist-worker" "voiceassist-frontend")

    for deployment in "${deployments[@]}"; do
        log_info "Rolling back ${deployment}..."

        if [[ "${DRY_RUN}" == "false" ]]; then
            # Try rollout undo first
            if kubectl rollout undo deployment/"${deployment}" -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"; then
                log_info "Waiting for ${deployment} rollout to complete..."

                if ! kubectl rollout status deployment/"${deployment}" \
                    -n "${namespace}" \
                    --timeout=5m 2>&1 | tee -a "${LOG_FILE}"; then
                    log_error "Rollout status check failed for ${deployment}"
                    return 1
                fi

                log_success "${deployment} rolled back successfully"
            else
                log_error "Failed to rollback ${deployment}"
                return 1
            fi
        else
            log_info "[DRY-RUN] Would rollback ${deployment} to ${target_version}"
        fi
    done

    log_success "All Kubernetes deployments rolled back successfully"
    return 0
}

rollback_database_migrations() {
    if [[ "${SKIP_MIGRATIONS}" == "true" ]]; then
        log_warning "Skipping database migration rollback as requested"
        return 0
    fi

    log_info "Rolling back database migrations..."

    local migrate_script="${SCRIPT_DIR}/migrate.sh"

    if [[ ! -f "${migrate_script}" ]]; then
        log_warning "Migration script not found: ${migrate_script}"
        log_warning "Skipping database rollback"
        return 0
    fi

    local migrate_cmd="${migrate_script} -e ${ENVIRONMENT} --direction down"
    [[ "${VERBOSE}" == "true" ]] && migrate_cmd="${migrate_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && migrate_cmd="${migrate_cmd} -d"

    if bash ${migrate_cmd}; then
        log_success "Database migrations rolled back successfully"
        return 0
    else
        log_error "Database migration rollback failed"
        return 1
    fi
}

verify_rollback() {
    log_info "Verifying rollback..."

    local health_check_script="${SCRIPT_DIR}/../monitoring/health-check.sh"

    if [[ ! -f "${health_check_script}" ]]; then
        log_warning "Health check script not found"
        return 0
    fi

    # Wait for services to stabilize
    if [[ "${DRY_RUN}" == "false" ]]; then
        log_info "Waiting 30 seconds for services to stabilize..."
        sleep 30
    fi

    local health_cmd="${health_check_script} -e ${ENVIRONMENT}"
    [[ "${VERBOSE}" == "true" ]] && health_cmd="${health_cmd} -V"

    if bash ${health_cmd}; then
        log_success "Rollback verification passed"
        return 0
    else
        log_error "Rollback verification failed"
        return 1
    fi
}

send_alert_notification() {
    local status=$1
    local message=$2
    local current_version=$3
    local target_version=$4

    log_info "Sending rollback alert..."

    # Build notification message
    local notification_text="⚠️ VoiceAssist Rollback Alert
Environment: ${ENVIRONMENT}
From Version: ${current_version}
To Version: ${target_version}
Status: ${status}
Message: ${message}
Timestamp: $(date '+%Y-%m-%d %H:%M:%S')
Initiated by: ${USER}"

    # Send to Slack if webhook is configured
    if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
        local color="warning"
        [[ "${status}" == "SUCCESS" ]] && color="good"
        [[ "${status}" == "FAILED" ]] && color="danger"

        local payload=$(cat <<EOF
{
    "attachments": [{
        "color": "${color}",
        "title": "⚠️ VoiceAssist Rollback - ${status}",
        "fields": [
            {"title": "Environment", "value": "${ENVIRONMENT}", "short": true},
            {"title": "Initiated By", "value": "${USER}", "short": true},
            {"title": "From Version", "value": "${current_version}", "short": true},
            {"title": "To Version", "value": "${target_version}", "short": true},
            {"title": "Message", "value": "${message}", "short": false}
        ],
        "footer": "VoiceAssist Rollback Alert",
        "ts": $(date +%s)
    }]
}
EOF
        )

        if [[ "${DRY_RUN}" == "false" ]]; then
            curl -X POST -H 'Content-type: application/json' --data "${payload}" "${SLACK_WEBHOOK_URL}" 2>&1 | tee -a "${LOG_FILE}"
        else
            log_info "[DRY-RUN] Would send Slack alert"
        fi
    fi

    log_verbose "Alert notification sent"
}

record_rollback() {
    local status=$1
    local current_version=$2
    local target_version=$3

    log_info "Recording rollback information..."

    local rollback_record="${LOG_DIR}/rollbacks.json"
    local rollback_data=$(cat <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "${ENVIRONMENT}",
    "from_version": "${current_version}",
    "to_version": "${target_version}",
    "status": "${status}",
    "initiated_by": "${USER}",
    "log_file": "${LOG_FILE}"
}
EOF
    )

    if [[ "${DRY_RUN}" == "false" ]]; then
        # Initialize file if it doesn't exist
        [[ ! -f "${rollback_record}" ]] && echo "[]" > "${rollback_record}"

        # Append rollback record
        local temp_file=$(mktemp)
        jq ". += [${rollback_data}]" "${rollback_record}" > "${temp_file}" && mv "${temp_file}" "${rollback_record}"

        log_success "Rollback recorded"
    else
        log_info "[DRY-RUN] Would record rollback"
    fi
}

###############################################################################
# Main Rollback Flow
###############################################################################

main() {
    # Create log directory
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Rollback Started ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "Log File: ${LOG_FILE}"

    # Check dependencies
    if ! check_dependencies; then
        log_error "Dependency check failed"
        return 1
    fi

    # Configure kubectl
    if ! configure_kubectl; then
        log_error "kubectl configuration failed"
        return 1
    fi

    # Get current version
    local current_version
    current_version=$(get_current_version)
    if [[ -z "${current_version}" ]]; then
        log_error "Failed to get current version"
        return 1
    fi
    log_info "Current version: ${current_version}"

    # Determine target version
    if [[ -z "${ROLLBACK_VERSION}" ]]; then
        log_info "No target version specified, finding previous successful deployment..."
        ROLLBACK_VERSION=$(get_previous_successful_version)
        if [[ $? -ne 0 ]] || [[ -z "${ROLLBACK_VERSION}" ]]; then
            log_error "Failed to determine rollback version"
            return 1
        fi
    fi
    log_info "Target version: ${ROLLBACK_VERSION}"

    # Confirm rollback
    if ! confirm_rollback "${current_version}" "${ROLLBACK_VERSION}"; then
        log_error "Rollback cancelled"
        return 1
    fi

    # Send initial alert
    send_alert_notification "IN_PROGRESS" "Rollback initiated" "${current_version}" "${ROLLBACK_VERSION}"

    # Rollback Kubernetes deployments
    if ! rollback_kubernetes_deployment "${ROLLBACK_VERSION}"; then
        log_error "Kubernetes rollback failed"
        send_alert_notification "FAILED" "Kubernetes rollback failed" "${current_version}" "${ROLLBACK_VERSION}"
        record_rollback "FAILED" "${current_version}" "${ROLLBACK_VERSION}"
        return 1
    fi

    # Rollback database migrations
    if ! rollback_database_migrations; then
        log_warning "Database migration rollback failed"
        send_alert_notification "PARTIAL" "Kubernetes rollback succeeded, but database rollback failed" "${current_version}" "${ROLLBACK_VERSION}"
        record_rollback "PARTIAL" "${current_version}" "${ROLLBACK_VERSION}"
        return 1
    fi

    # Verify rollback
    if ! verify_rollback; then
        log_warning "Rollback verification failed"
        send_alert_notification "WARNING" "Rollback completed but verification failed" "${current_version}" "${ROLLBACK_VERSION}"
        record_rollback "WARNING" "${current_version}" "${ROLLBACK_VERSION}"
        return 1
    fi

    # Record successful rollback
    record_rollback "SUCCESS" "${current_version}" "${ROLLBACK_VERSION}"

    # Send success notification
    send_alert_notification "SUCCESS" "Rollback completed successfully" "${current_version}" "${ROLLBACK_VERSION}"

    log_success "=== Rollback Completed Successfully ==="
    log_info "Rolled back from ${current_version} to ${ROLLBACK_VERSION}"
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
                ROLLBACK_VERSION="$2"
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
            -m|--skip-migrations)
                SKIP_MIGRATIONS=true
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
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
