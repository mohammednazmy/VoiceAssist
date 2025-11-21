#!/bin/bash

###############################################################################
# VoiceAssist Kubernetes Deployment Script
#
# Deploys application to Kubernetes cluster
#
# Usage:
#   ./deploy-to-k8s.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -v, --version TAG        Version tag to deploy [required]
#   -d, --dry-run           Perform dry-run (kubectl apply --dry-run)
#   -V, --verbose           Enable verbose output
#   -w, --wait-timeout SEC  Rollout wait timeout in seconds (default: 300)
#   -h, --help              Show this help message
#
# Examples:
#   ./deploy-to-k8s.sh -e staging -v v1.2.3
#   ./deploy-to-k8s.sh -e prod -v v1.2.3 --verbose
#   ./deploy-to-k8s.sh -e dev -v latest --dry-run
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
LOG_DIR="${PROJECT_ROOT}/logs/k8s-deploy"
LOG_FILE="${LOG_DIR}/k8s-deploy_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
VERSION=""
DRY_RUN=false
VERBOSE=false
WAIT_TIMEOUT=300

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
K8S_MANIFESTS_DIR="${PROJECT_ROOT}/infrastructure/k8s"

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

    # Test connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi

    log_success "kubectl configured successfully"
    return 0
}

create_namespace() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Ensuring namespace exists: ${namespace}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would create namespace: ${namespace}"
        return 0
    fi

    if kubectl get namespace "${namespace}" &> /dev/null; then
        log_verbose "Namespace ${namespace} already exists"
        return 0
    fi

    log_info "Creating namespace: ${namespace}"

    cat <<EOF | kubectl apply -f - 2>&1 | tee -a "${LOG_FILE}"
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    environment: ${ENVIRONMENT}
    app: voiceassist
EOF

    log_success "Namespace created"
    return 0
}

apply_configmaps() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying ConfigMaps..."

    local configmap_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/configmap.yaml"

    if [[ ! -f "${configmap_file}" ]]; then
        log_warning "ConfigMap file not found: ${configmap_file}"
        return 0
    fi

    local kubectl_cmd="kubectl apply -f ${configmap_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "ConfigMaps applied"
        return 0
    else
        log_error "Failed to apply ConfigMaps"
        return 1
    fi
}

apply_secrets() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying Secrets..."

    # Note: In production, secrets should be managed by external secrets operator
    # or AWS Secrets Manager integration
    local secrets_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/secrets.yaml"

    if [[ ! -f "${secrets_file}" ]]; then
        log_warning "Secrets file not found: ${secrets_file}"
        log_warning "Ensure secrets are managed externally or create the file"
        return 0
    fi

    local kubectl_cmd="kubectl apply -f ${secrets_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Secrets applied"
        return 0
    else
        log_error "Failed to apply Secrets"
        return 1
    fi
}

update_deployment_images() {
    log_info "Updating deployment manifests with version ${VERSION}..."

    local ecr_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    local deployment_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/deployment.yaml"

    if [[ ! -f "${deployment_file}" ]]; then
        log_error "Deployment file not found: ${deployment_file}"
        return 1
    fi

    # Create temporary file with updated image tags
    local temp_file=$(mktemp)
    cp "${deployment_file}" "${temp_file}"

    # Update image tags (simple sed replacement)
    sed -i.bak "s|image: ${ecr_registry}/voiceassist-backend:.*|image: ${ecr_registry}/voiceassist-backend:${VERSION}|g" "${temp_file}"
    sed -i.bak "s|image: ${ecr_registry}/voiceassist-worker:.*|image: ${ecr_registry}/voiceassist-worker:${VERSION}|g" "${temp_file}"
    sed -i.bak "s|image: ${ecr_registry}/voiceassist-frontend:.*|image: ${ecr_registry}/voiceassist-frontend:${VERSION}|g" "${temp_file}"

    log_verbose "Deployment manifest updated with version ${VERSION}"

    echo "${temp_file}"
    return 0
}

apply_deployments() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying Deployments..."

    # Update deployment file with correct image versions
    local temp_deployment_file=$(update_deployment_images)

    if [[ ! -f "${temp_deployment_file}" ]]; then
        log_error "Failed to prepare deployment file"
        return 1
    fi

    local kubectl_cmd="kubectl apply -f ${temp_deployment_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Deployments applied"

        # Add deployment annotation with version
        if [[ "${DRY_RUN}" == "false" ]]; then
            kubectl annotate deployment voiceassist-backend \
                -n "${namespace}" \
                version="${VERSION}" \
                --overwrite 2>&1 | tee -a "${LOG_FILE}"
        fi

        rm -f "${temp_deployment_file}" "${temp_deployment_file}.bak"
        return 0
    else
        log_error "Failed to apply Deployments"
        rm -f "${temp_deployment_file}" "${temp_deployment_file}.bak"
        return 1
    fi
}

apply_services() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying Services..."

    local service_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/service.yaml"

    if [[ ! -f "${service_file}" ]]; then
        log_warning "Service file not found: ${service_file}"
        return 0
    fi

    local kubectl_cmd="kubectl apply -f ${service_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Services applied"
        return 0
    else
        log_error "Failed to apply Services"
        return 1
    fi
}

apply_ingress() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying Ingress..."

    local ingress_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/ingress.yaml"

    if [[ ! -f "${ingress_file}" ]]; then
        log_warning "Ingress file not found: ${ingress_file}"
        return 0
    fi

    local kubectl_cmd="kubectl apply -f ${ingress_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Ingress applied"
        return 0
    else
        log_error "Failed to apply Ingress"
        return 1
    fi
}

apply_hpa() {
    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Applying HorizontalPodAutoscaler..."

    local hpa_file="${K8S_MANIFESTS_DIR}/overlays/${ENVIRONMENT}/hpa.yaml"

    if [[ ! -f "${hpa_file}" ]]; then
        log_warning "HPA file not found: ${hpa_file}"
        return 0
    fi

    local kubectl_cmd="kubectl apply -f ${hpa_file} -n ${namespace}"
    [[ "${DRY_RUN}" == "true" ]] && kubectl_cmd="${kubectl_cmd} --dry-run=client"

    if ${kubectl_cmd} 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "HPA applied"
        return 0
    else
        log_error "Failed to apply HPA"
        return 1
    fi
}

wait_for_rollout() {
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would wait for rollout completion"
        return 0
    fi

    log_info "Waiting for deployments to complete (timeout: ${WAIT_TIMEOUT}s)..."

    local deployments=("voiceassist-backend" "voiceassist-worker" "voiceassist-frontend")

    for deployment in "${deployments[@]}"; do
        log_info "Waiting for ${deployment} rollout..."

        if kubectl rollout status deployment/"${deployment}" \
            -n "${namespace}" \
            --timeout="${WAIT_TIMEOUT}s" 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "${deployment} rollout completed"
        else
            log_error "${deployment} rollout failed or timed out"
            return 1
        fi
    done

    log_success "All deployments rolled out successfully"
    return 0
}

check_pod_health() {
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check pod health"
        return 0
    fi

    log_info "Checking pod health..."

    # Get pod status
    local pod_status=$(kubectl get pods -n "${namespace}" -o json 2>/dev/null)

    if [[ -z "${pod_status}" ]]; then
        log_error "Failed to get pod status"
        return 1
    fi

    # Count pods by status
    local total_pods=$(echo "${pod_status}" | jq -r '.items | length')
    local running_pods=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.phase == "Running")] | length')
    local ready_pods=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.conditions[] | select(.type == "Ready" and .status == "True"))] | length')

    log_info "Pod Status: ${running_pods}/${total_pods} Running, ${ready_pods}/${total_pods} Ready"

    # Display pod details in verbose mode
    if [[ "${VERBOSE}" == "true" ]]; then
        log_verbose "Pod Details:"
        kubectl get pods -n "${namespace}" -o wide 2>&1 | tee -a "${LOG_FILE}"
    fi

    if [[ ${ready_pods} -eq ${total_pods} ]] && [[ ${total_pods} -gt 0 ]]; then
        log_success "All pods are healthy"
        return 0
    else
        log_warning "Not all pods are ready yet"
        return 1
    fi
}

show_deployment_info() {
    local namespace="voiceassist-${ENVIRONMENT}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        return 0
    fi

    log_info "Deployment Information:"

    echo "" | tee -a "${LOG_FILE}"
    echo "=== Deployments ===" | tee -a "${LOG_FILE}"
    kubectl get deployments -n "${namespace}" -o wide 2>&1 | tee -a "${LOG_FILE}"

    echo "" | tee -a "${LOG_FILE}"
    echo "=== Services ===" | tee -a "${LOG_FILE}"
    kubectl get services -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"

    echo "" | tee -a "${LOG_FILE}"
    echo "=== Ingress ===" | tee -a "${LOG_FILE}"
    kubectl get ingress -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"

    echo "" | tee -a "${LOG_FILE}"
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Kubernetes Deployment ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Version: ${VERSION}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "Log File: ${LOG_FILE}"
    log_info ""

    # Get AWS account ID
    if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
        if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
            log_error "Failed to get AWS account ID"
            return 1
        fi
    fi

    # Configure kubectl
    if ! configure_kubectl; then
        log_error "kubectl configuration failed"
        return 1
    fi

    # Create namespace
    if ! create_namespace; then
        log_error "Namespace creation failed"
        return 1
    fi

    # Apply Kubernetes resources in order
    log_info "Applying Kubernetes resources..."

    apply_configmaps || log_warning "ConfigMaps application had issues"
    apply_secrets || log_warning "Secrets application had issues"

    if ! apply_services; then
        log_error "Services application failed"
        return 1
    fi

    if ! apply_deployments; then
        log_error "Deployments application failed"
        return 1
    fi

    apply_ingress || log_warning "Ingress application had issues"
    apply_hpa || log_warning "HPA application had issues"

    # Wait for rollout to complete
    if ! wait_for_rollout; then
        log_error "Rollout did not complete successfully"
        return 1
    fi

    # Check pod health
    sleep 5  # Give pods a moment to stabilize
    if ! check_pod_health; then
        log_warning "Some pods are not yet healthy"
    fi

    # Show deployment info
    show_deployment_info

    log_success "=== Kubernetes Deployment Completed ==="
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
            -w|--wait-timeout)
                WAIT_TIMEOUT="$2"
                shift 2
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
exit $?
