#!/bin/bash

###############################################################################
# VoiceAssist Kubernetes Scaling Script
#
# Scales deployments and HPA configurations
#
# Usage:
#   ./scale.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -d, --deployment NAME    Deployment name to scale (optional, default: all)
#   -r, --replicas N         Number of replicas (required for manual scaling)
#   -m, --min N              HPA minimum replicas
#   -M, --max N              HPA maximum replicas
#   -D, --dry-run           Perform dry-run
#   -V, --verbose           Enable verbose output
#   -h, --help              Show this help message
#
# Examples:
#   ./scale.sh -e staging -d voiceassist-backend -r 5
#   ./scale.sh -e prod -m 3 -M 10
#   ./scale.sh -e dev -d voiceassist-worker -r 2 --dry-run
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
LOG_DIR="${PROJECT_ROOT}/logs/scaling"
LOG_FILE="${LOG_DIR}/scale_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
DEPLOYMENT_NAME=""
REPLICAS=""
HPA_MIN=""
HPA_MAX=""
DRY_RUN=false
VERBOSE=false

AWS_REGION="${AWS_REGION:-us-east-1}"

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

configure_kubectl() {
    local cluster_name="voiceassist-eks-${ENVIRONMENT}"

    log_info "Configuring kubectl for cluster: ${cluster_name}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would configure kubectl"
        return 0
    fi

    if ! aws eks update-kubeconfig --region "${AWS_REGION}" --name "${cluster_name}" 2>&1 | tee -a "${LOG_FILE}"; then
        log_error "Failed to configure kubectl"
        return 1
    fi

    log_success "kubectl configured"
    return 0
}

get_current_replicas() {
    local deployment=$1
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        echo "3"
        return 0
    fi

    local current=$(kubectl get deployment "${deployment}" \
        -n "${namespace}" \
        -o jsonpath='{.spec.replicas}' 2>/dev/null)

    echo "${current:-0}"
}

scale_deployment() {
    local deployment=$1
    local replicas=$2
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Scaling ${deployment} to ${replicas} replicas..."

    local current_replicas=$(get_current_replicas "${deployment}")
    log_verbose "Current replicas: ${current_replicas}"

    if [[ "${current_replicas}" == "${replicas}" ]]; then
        log_info "${deployment} is already at ${replicas} replicas"
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would scale ${deployment} from ${current_replicas} to ${replicas}"
        return 0
    fi

    # Check if HPA is managing this deployment
    if kubectl get hpa -n "${namespace}" 2>/dev/null | grep -q "${deployment}"; then
        log_warning "HPA is managing ${deployment}. Manual scaling will be overridden."
        log_warning "Consider updating HPA configuration instead."

        read -p "Continue with manual scaling anyway? (yes/no): " confirmation
        if [[ "${confirmation}" != "yes" ]]; then
            log_info "Scaling cancelled"
            return 1
        fi
    fi

    # Scale the deployment
    if kubectl scale deployment "${deployment}" \
        --replicas="${replicas}" \
        -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for scaling to complete..."

        # Wait for deployment to be ready
        if kubectl rollout status deployment/"${deployment}" \
            -n "${namespace}" \
            --timeout=5m 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "${deployment} scaled successfully to ${replicas} replicas"
            return 0
        else
            log_error "Deployment scaling timed out"
            return 1
        fi
    else
        log_error "Failed to scale ${deployment}"
        return 1
    fi
}

scale_all_deployments() {
    local replicas=$1
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Scaling all deployments to ${replicas} replicas..."

    local deployments=("voiceassist-backend" "voiceassist-worker" "voiceassist-frontend")
    local failures=0

    for deployment in "${deployments[@]}"; do
        if ! scale_deployment "${deployment}" "${replicas}"; then
            log_error "Failed to scale ${deployment}"
            ((failures++))
        fi
    done

    if [[ ${failures} -gt 0 ]]; then
        log_error "Failed to scale ${failures} deployment(s)"
        return 1
    fi

    log_success "All deployments scaled successfully"
    return 0
}

update_hpa() {
    local deployment=$1
    local min_replicas=$2
    local max_replicas=$3
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Updating HPA for ${deployment}..."
    log_info "Min replicas: ${min_replicas}, Max replicas: ${max_replicas}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would update HPA for ${deployment}"
        return 0
    fi

    # Check if HPA exists
    local hpa_name="${deployment}"
    if ! kubectl get hpa "${hpa_name}" -n "${namespace}" &> /dev/null; then
        log_warning "HPA ${hpa_name} does not exist"
        log_info "Creating new HPA..."

        cat <<EOF | kubectl apply -f - 2>&1 | tee -a "${LOG_FILE}"
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${hpa_name}
  namespace: ${namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${deployment}
  minReplicas: ${min_replicas}
  maxReplicas: ${max_replicas}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF

        log_success "HPA created for ${deployment}"
        return 0
    fi

    # Update existing HPA
    kubectl patch hpa "${hpa_name}" -n "${namespace}" --type='json' -p="[
        {\"op\": \"replace\", \"path\": \"/spec/minReplicas\", \"value\": ${min_replicas}},
        {\"op\": \"replace\", \"path\": \"/spec/maxReplicas\", \"value\": ${max_replicas}}
    ]" 2>&1 | tee -a "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "HPA updated for ${deployment}"
        return 0
    else
        log_error "Failed to update HPA"
        return 1
    fi
}

update_all_hpa() {
    local min_replicas=$1
    local max_replicas=$2

    log_info "Updating HPA for all deployments..."

    local deployments=("voiceassist-backend" "voiceassist-worker" "voiceassist-frontend")
    local failures=0

    for deployment in "${deployments[@]}"; do
        if ! update_hpa "${deployment}" "${min_replicas}" "${max_replicas}"; then
            log_error "Failed to update HPA for ${deployment}"
            ((failures++))
        fi
    done

    if [[ ${failures} -gt 0 ]]; then
        log_error "Failed to update ${failures} HPA(s)"
        return 1
    fi

    log_success "All HPAs updated successfully"
    return 0
}

show_current_state() {
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        return 0
    fi

    log_info "Current Deployment State:"
    echo "" | tee -a "${LOG_FILE}"
    kubectl get deployments -n "${namespace}" -o wide 2>&1 | tee -a "${LOG_FILE}"

    echo "" | tee -a "${LOG_FILE}"
    log_info "Current HPA State:"
    kubectl get hpa -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"

    echo "" | tee -a "${LOG_FILE}"
    log_info "Pod Status:"
    kubectl get pods -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"
}

verify_scaling() {
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would verify scaling"
        return 0
    fi

    log_info "Verifying scaling completion..."

    # Wait a moment for pods to stabilize
    sleep 5

    # Check pod status
    local not_ready=$(kubectl get pods -n "${namespace}" -o json 2>/dev/null | \
        jq -r '[.items[] | select(.status.conditions[] | select(.type == "Ready" and .status != "True"))] | length')

    if [[ ${not_ready} -gt 0 ]]; then
        log_warning "${not_ready} pod(s) are not ready yet"
        return 1
    fi

    log_success "All pods are ready after scaling"
    return 0
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Kubernetes Scaling ==="
    log_info "Environment: ${ENVIRONMENT}"
    [[ -n "${DEPLOYMENT_NAME}" ]] && log_info "Deployment: ${DEPLOYMENT_NAME}"
    [[ -n "${REPLICAS}" ]] && log_info "Replicas: ${REPLICAS}"
    [[ -n "${HPA_MIN}" ]] && log_info "HPA Min: ${HPA_MIN}"
    [[ -n "${HPA_MAX}" ]] && log_info "HPA Max: ${HPA_MAX}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info ""

    # Configure kubectl
    if ! configure_kubectl; then
        log_error "kubectl configuration failed"
        return 1
    fi

    # Show current state
    show_current_state

    echo "" | tee -a "${LOG_FILE}"
    log_info "Applying scaling changes..."

    # Perform scaling operations
    if [[ -n "${REPLICAS}" ]]; then
        # Manual scaling
        if [[ -n "${DEPLOYMENT_NAME}" ]]; then
            if ! scale_deployment "${DEPLOYMENT_NAME}" "${REPLICAS}"; then
                log_error "Scaling failed"
                return 1
            fi
        else
            if ! scale_all_deployments "${REPLICAS}"; then
                log_error "Scaling failed"
                return 1
            fi
        fi
    fi

    if [[ -n "${HPA_MIN}" ]] && [[ -n "${HPA_MAX}" ]]; then
        # HPA configuration
        if [[ -n "${DEPLOYMENT_NAME}" ]]; then
            if ! update_hpa "${DEPLOYMENT_NAME}" "${HPA_MIN}" "${HPA_MAX}"; then
                log_error "HPA update failed"
                return 1
            fi
        else
            if ! update_all_hpa "${HPA_MIN}" "${HPA_MAX}"; then
                log_error "HPA update failed"
                return 1
            fi
        fi
    fi

    # Verify scaling
    if ! verify_scaling; then
        log_warning "Scaling verification had issues"
    fi

    # Show final state
    echo "" | tee -a "${LOG_FILE}"
    log_info "Final State:"
    show_current_state

    log_success "=== Scaling Completed ==="
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
            -d|--deployment)
                DEPLOYMENT_NAME="$2"
                shift 2
                ;;
            -r|--replicas)
                REPLICAS="$2"
                shift 2
                ;;
            -m|--min)
                HPA_MIN="$2"
                shift 2
                ;;
            -M|--max)
                HPA_MAX="$2"
                shift 2
                ;;
            -D|--dry-run)
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

    # Validate that at least one scaling option is provided
    if [[ -z "${REPLICAS}" ]] && [[ -z "${HPA_MIN}" ]] && [[ -z "${HPA_MAX}" ]]; then
        log_error "At least one scaling option is required (--replicas, --min, --max)"
        show_usage
    fi

    # Validate HPA options
    if [[ -n "${HPA_MIN}" ]] && [[ -z "${HPA_MAX}" ]]; then
        log_error "Both --min and --max must be specified for HPA updates"
        show_usage
    fi

    if [[ -n "${HPA_MAX}" ]] && [[ -z "${HPA_MIN}" ]]; then
        log_error "Both --min and --max must be specified for HPA updates"
        show_usage
    fi
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
