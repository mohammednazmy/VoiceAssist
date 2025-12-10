#!/bin/bash
# shellcheck disable=SC2181,SC2086,SC2155

# VoiceAssist HPA Setup Script
# Installs and configures Horizontal Pod Autoscaling for VoiceAssist
# Usage: ./setup-hpa.sh [environment]
#   environment: dev, staging, prod (default: dev)

set -e  # Exit on error
set -u  # Exit on undefined variable

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-dev}"
NAMESPACE="voiceassist-${ENVIRONMENT}"
TIMEOUT=300  # 5 minutes

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl first."
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi

    # Check kustomize (optional, kubectl has built-in support)
    if command -v kustomize &> /dev/null; then
        log_info "kustomize found: $(kustomize version --short 2>/dev/null || echo 'unknown')"
    else
        log_warning "kustomize not found, using kubectl apply -k"
    fi

    log_success "Prerequisites check passed"
}

validate_environment() {
    log_info "Validating environment: ${ENVIRONMENT}"

    if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod)$ ]]; then
        log_error "Invalid environment: ${ENVIRONMENT}. Must be dev, staging, or prod."
        exit 1
    fi

    # Check if overlay exists
    if [[ ! -d "${SCRIPT_DIR}/overlays/${ENVIRONMENT}" ]]; then
        log_error "Overlay directory not found: ${SCRIPT_DIR}/overlays/${ENVIRONMENT}"
        exit 1
    fi

    log_success "Environment validated: ${ENVIRONMENT}"
}

create_namespace() {
    log_info "Creating namespace: ${NAMESPACE}"

    if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        log_warning "Namespace ${NAMESPACE} already exists"
    else
        kubectl create namespace "${NAMESPACE}"
        log_success "Namespace created: ${NAMESPACE}"
    fi

    # Label namespace
    kubectl label namespace "${NAMESPACE}" \
        environment="${ENVIRONMENT}" \
        app.kubernetes.io/name=voiceassist \
        --overwrite
}

install_metrics_server() {
    log_info "Checking Metrics Server installation..."

    if kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        log_warning "Metrics Server already installed"
        return 0
    fi

    log_info "Installing Metrics Server..."
    kubectl apply -f "${SCRIPT_DIR}/metrics-server.yaml"

    log_info "Waiting for Metrics Server to be ready..."
    if kubectl wait --for=condition=available --timeout="${TIMEOUT}s" \
        deployment/metrics-server -n kube-system; then
        log_success "Metrics Server installed and ready"
    else
        log_error "Metrics Server failed to become ready within ${TIMEOUT}s"
        return 1
    fi

    # Verify metrics are available
    sleep 10  # Wait a bit for metrics to be collected
    if kubectl top nodes &> /dev/null; then
        log_success "Metrics Server is working correctly"
    else
        log_warning "Metrics Server installed but metrics not yet available"
        log_warning "This may take a few minutes. You can check with: kubectl top nodes"
    fi
}

apply_hpa_configuration() {
    log_info "Applying HPA configuration for ${ENVIRONMENT}..."

    # Use kustomize overlay for environment-specific config
    if [[ "${ENVIRONMENT}" == "dev" ]]; then
        # For dev, we might want to skip custom metrics
        kubectl apply -k "${SCRIPT_DIR}/overlays/dev/"
    else
        kubectl apply -k "${SCRIPT_DIR}/overlays/${ENVIRONMENT}/"
    fi

    log_success "HPA configuration applied"
}

verify_hpa_status() {
    log_info "Verifying HPA status..."

    # Wait a bit for HPA to initialize
    sleep 5

    # Check API Gateway HPA
    log_info "Checking API Gateway HPA..."
    if kubectl get hpa voiceassist-server-hpa -n "${NAMESPACE}" &> /dev/null; then
        kubectl get hpa voiceassist-server-hpa -n "${NAMESPACE}"

        # Check if metrics are available
        local metrics=$(kubectl get hpa voiceassist-server-hpa -n "${NAMESPACE}" \
            -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}')

        if [[ -n "${metrics}" ]]; then
            log_success "API Gateway HPA is operational (CPU: ${metrics}%)"
        else
            log_warning "API Gateway HPA created but metrics not yet available"
        fi
    else
        log_error "API Gateway HPA not found"
    fi

    # Check Worker HPA
    log_info "Checking Worker HPA..."
    if kubectl get hpa voiceassist-worker-hpa -n "${NAMESPACE}" &> /dev/null; then
        kubectl get hpa voiceassist-worker-hpa -n "${NAMESPACE}"

        local metrics=$(kubectl get hpa voiceassist-worker-hpa -n "${NAMESPACE}" \
            -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}')

        if [[ -n "${metrics}" ]]; then
            log_success "Worker HPA is operational (CPU: ${metrics}%)"
        else
            log_warning "Worker HPA created but metrics not yet available"
        fi
    else
        log_error "Worker HPA not found"
    fi
}

verify_vpa_status() {
    log_info "Verifying VPA status (if installed)..."

    # Check if VPA is installed
    if ! kubectl api-resources | grep -q verticalpodautoscalers; then
        log_warning "VPA not installed in cluster. Skipping VPA verification."
        log_info "To install VPA, visit: https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler"
        return 0
    fi

    # Check VPAs
    if kubectl get vpa -n "${NAMESPACE}" &> /dev/null; then
        log_success "VPA resources found:"
        kubectl get vpa -n "${NAMESPACE}"
    else
        log_warning "No VPA resources found in namespace ${NAMESPACE}"
    fi
}

verify_pdb_status() {
    log_info "Verifying PodDisruptionBudget status..."

    if kubectl get pdb -n "${NAMESPACE}" &> /dev/null; then
        log_success "PodDisruptionBudgets found:"
        kubectl get pdb -n "${NAMESPACE}" -o wide
    else
        log_warning "No PodDisruptionBudgets found in namespace ${NAMESPACE}"
    fi
}

display_summary() {
    log_info "============================================"
    log_success "HPA Setup Complete for ${ENVIRONMENT}!"
    log_info "============================================"
    echo ""
    log_info "Namespace: ${NAMESPACE}"
    echo ""
    log_info "Next Steps:"
    echo "  1. Monitor HPA status:"
    echo "     kubectl get hpa -n ${NAMESPACE} --watch"
    echo ""
    echo "  2. Check pod resource usage:"
    echo "     kubectl top pods -n ${NAMESPACE}"
    echo ""
    echo "  3. View HPA details:"
    echo "     kubectl describe hpa voiceassist-server-hpa -n ${NAMESPACE}"
    echo ""
    echo "  4. Test autoscaling:"
    echo "     ./test-autoscaling.sh ${ENVIRONMENT}"
    echo ""
    echo "  5. View VPA recommendations (if installed):"
    echo "     kubectl describe vpa voiceassist-server-vpa -n ${NAMESPACE}"
    echo ""
    log_info "Documentation: ${SCRIPT_DIR}/README.md"
    echo ""
}

rollback() {
    log_warning "Rolling back HPA configuration..."

    # Delete HPAs
    kubectl delete hpa --all -n "${NAMESPACE}" 2>/dev/null || true

    # Delete VPAs (if they exist)
    kubectl delete vpa --all -n "${NAMESPACE}" 2>/dev/null || true

    # Delete PDBs
    kubectl delete pdb --all -n "${NAMESPACE}" 2>/dev/null || true

    log_success "Rollback completed"
}

# Main execution
main() {
    log_info "VoiceAssist HPA Setup Script"
    log_info "Environment: ${ENVIRONMENT}"
    echo ""

    # Run setup steps
    check_prerequisites
    validate_environment
    create_namespace
    install_metrics_server
    apply_hpa_configuration

    # Wait for resources to be created
    sleep 5

    # Verify installation
    verify_hpa_status
    verify_vpa_status
    verify_pdb_status

    # Display summary
    echo ""
    display_summary
}

# Handle script arguments
case "${1:-install}" in
    install|dev|staging|prod)
        main
        ;;
    rollback)
        ENVIRONMENT="${2:-dev}"
        NAMESPACE="voiceassist-${ENVIRONMENT}"
        rollback
        ;;
    verify)
        ENVIRONMENT="${2:-dev}"
        NAMESPACE="voiceassist-${ENVIRONMENT}"
        verify_hpa_status
        verify_vpa_status
        verify_pdb_status
        ;;
    help|--help|-h)
        echo "Usage: $0 [command] [environment]"
        echo ""
        echo "Commands:"
        echo "  install [env]   - Install HPA (default: dev)"
        echo "  rollback [env]  - Remove HPA configuration"
        echo "  verify [env]    - Verify HPA status"
        echo "  help            - Show this help message"
        echo ""
        echo "Environments:"
        echo "  dev      - Development environment"
        echo "  staging  - Staging environment"
        echo "  prod     - Production environment"
        echo ""
        echo "Examples:"
        echo "  $0 install prod"
        echo "  $0 verify staging"
        echo "  $0 rollback dev"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
