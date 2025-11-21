#!/bin/bash

###############################################################################
# VoiceAssist Kubernetes Cluster Bootstrap Script
#
# Installs and configures essential Kubernetes components
#
# Usage:
#   ./bootstrap-k8s.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -d, --dry-run           Perform dry-run
#   -V, --verbose           Enable verbose output
#   -s, --skip COMPONENT    Skip component installation (comma-separated)
#   -h, --help              Show this help message
#
# Examples:
#   ./bootstrap-k8s.sh -e dev
#   ./bootstrap-k8s.sh -e prod --verbose
#   ./bootstrap-k8s.sh -e staging --skip metrics-server,cert-manager
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
LOG_DIR="${PROJECT_ROOT}/logs/init"
LOG_FILE="${LOG_DIR}/k8s-bootstrap_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
DRY_RUN=false
VERBOSE=false
SKIP_COMPONENTS=""

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

should_skip_component() {
    local component=$1
    [[ ",${SKIP_COMPONENTS}," == *",${component},"* ]]
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

check_helm() {
    log_info "Checking Helm installation..."

    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed"
        log_error "Please install Helm: https://helm.sh/docs/intro/install/"
        return 1
    fi

    local helm_version=$(helm version --short)
    log_verbose "Helm version: ${helm_version}"

    log_success "Helm is available"
    return 0
}

###############################################################################
# Namespaces
###############################################################################

create_namespaces() {
    log_info "Creating namespaces..."

    local namespaces=(
        "voiceassist-${ENVIRONMENT}"
        "monitoring"
        "ingress-nginx"
        "cert-manager"
    )

    for ns in "${namespaces[@]}"; do
        log_verbose "Creating namespace: ${ns}"

        if [[ "${DRY_RUN}" == "true" ]]; then
            log_info "[DRY-RUN] Would create namespace: ${ns}"
            continue
        fi

        if kubectl get namespace "${ns}" &> /dev/null; then
            log_verbose "Namespace ${ns} already exists"
            continue
        fi

        if kubectl create namespace "${ns}" 2>&1 | tee -a "${LOG_FILE}"; then
            kubectl label namespace "${ns}" environment="${ENVIRONMENT}" project="voiceassist" 2>&1 | tee -a "${LOG_FILE}"
            log_verbose "Namespace ${ns} created"
        else
            log_error "Failed to create namespace ${ns}"
            return 1
        fi
    done

    log_success "Namespaces created"
    return 0
}

###############################################################################
# Metrics Server
###############################################################################

install_metrics_server() {
    if should_skip_component "metrics-server"; then
        log_info "Skipping metrics-server installation"
        return 0
    fi

    log_info "Installing metrics-server..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would install metrics-server"
        return 0
    fi

    # Check if already installed
    if kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        log_verbose "metrics-server already installed"
        return 0
    fi

    # Install metrics-server using kubectl
    if kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml 2>&1 | tee -a "${LOG_FILE}"; then
        log_info "Waiting for metrics-server to be ready..."
        sleep 10

        if kubectl wait --for=condition=available --timeout=60s deployment/metrics-server -n kube-system 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "metrics-server installed successfully"
            return 0
        else
            log_warning "metrics-server installation may not be complete"
            return 0
        fi
    else
        log_error "Failed to install metrics-server"
        return 1
    fi
}

###############################################################################
# Ingress NGINX
###############################################################################

install_ingress_nginx() {
    if should_skip_component "ingress-nginx"; then
        log_info "Skipping ingress-nginx installation"
        return 0
    fi

    log_info "Installing ingress-nginx..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would install ingress-nginx"
        return 0
    fi

    # Add Helm repo
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>&1 | tee -a "${LOG_FILE}"
    helm repo update 2>&1 | tee -a "${LOG_FILE}"

    # Check if already installed
    if helm list -n ingress-nginx 2>/dev/null | grep -q ingress-nginx; then
        log_verbose "ingress-nginx already installed"
        return 0
    fi

    # Install ingress-nginx
    log_info "Installing ingress-nginx with Helm..."

    if helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.podAnnotations."prometheus\.io/scrape"=true \
        --set controller.podAnnotations."prometheus\.io/port"=10254 \
        2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for ingress-nginx to be ready..."
        sleep 20

        if kubectl wait --namespace ingress-nginx \
            --for=condition=ready pod \
            --selector=app.kubernetes.io/component=controller \
            --timeout=120s 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "ingress-nginx installed successfully"

            # Get LoadBalancer URL
            local lb_url=$(kubectl get svc ingress-nginx-controller -n ingress-nginx \
                -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
            [[ -n "${lb_url}" ]] && log_info "Ingress LoadBalancer URL: ${lb_url}"

            return 0
        else
            log_warning "ingress-nginx may not be fully ready yet"
            return 0
        fi
    else
        log_error "Failed to install ingress-nginx"
        return 1
    fi
}

###############################################################################
# cert-manager
###############################################################################

install_cert_manager() {
    if should_skip_component "cert-manager"; then
        log_info "Skipping cert-manager installation"
        return 0
    fi

    log_info "Installing cert-manager..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would install cert-manager"
        return 0
    fi

    # Add Helm repo
    helm repo add jetstack https://charts.jetstack.io 2>&1 | tee -a "${LOG_FILE}"
    helm repo update 2>&1 | tee -a "${LOG_FILE}"

    # Check if already installed
    if helm list -n cert-manager 2>/dev/null | grep -q cert-manager; then
        log_verbose "cert-manager already installed"
        return 0
    fi

    # Install CRDs
    log_info "Installing cert-manager CRDs..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml 2>&1 | tee -a "${LOG_FILE}"

    # Install cert-manager
    log_info "Installing cert-manager with Helm..."

    if helm install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.13.0 \
        2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for cert-manager to be ready..."
        sleep 15

        if kubectl wait --namespace cert-manager \
            --for=condition=ready pod \
            --selector=app.kubernetes.io/instance=cert-manager \
            --timeout=120s 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "cert-manager installed successfully"
            return 0
        else
            log_warning "cert-manager may not be fully ready yet"
            return 0
        fi
    else
        log_error "Failed to install cert-manager"
        return 1
    fi
}

###############################################################################
# Prometheus Operator (kube-prometheus-stack)
###############################################################################

install_prometheus_operator() {
    if should_skip_component "prometheus"; then
        log_info "Skipping Prometheus operator installation"
        return 0
    fi

    log_info "Installing Prometheus operator..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would install Prometheus operator"
        return 0
    fi

    # Add Helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>&1 | tee -a "${LOG_FILE}"
    helm repo update 2>&1 | tee -a "${LOG_FILE}"

    # Check if already installed
    if helm list -n monitoring 2>/dev/null | grep -q kube-prometheus-stack; then
        log_verbose "Prometheus operator already installed"
        return 0
    fi

    # Create values file for production-ready setup
    local values_file=$(mktemp)
    cat > "${values_file}" <<EOF
prometheus:
  prometheusSpec:
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi

grafana:
  enabled: true
  adminPassword: $(openssl rand -base64 12)
  persistence:
    enabled: true
    size: 10Gi

alertmanager:
  enabled: true
  alertmanagerSpec:
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi
EOF

    log_info "Installing kube-prometheus-stack with Helm..."

    if helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --values "${values_file}" \
        2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for Prometheus operator to be ready..."
        sleep 30

        log_success "Prometheus operator installed successfully"
        log_info "Grafana dashboard will be available via port-forward or ingress"

        rm -f "${values_file}"
        return 0
    else
        log_error "Failed to install Prometheus operator"
        rm -f "${values_file}"
        return 1
    fi
}

###############################################################################
# RBAC Policies
###############################################################################

apply_rbac_policies() {
    log_info "Applying RBAC policies..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would apply RBAC policies"
        return 0
    fi

    local namespace="voiceassist-${ENVIRONMENT}"

    # Create ServiceAccount for application
    cat <<EOF | kubectl apply -f - 2>&1 | tee -a "${LOG_FILE}"
apiVersion: v1
kind: ServiceAccount
metadata:
  name: voiceassist-app
  namespace: ${namespace}
  labels:
    app: voiceassist
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: voiceassist-app-role
  namespace: ${namespace}
spec:
  rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: voiceassist-app-rolebinding
  namespace: ${namespace}
subjects:
- kind: ServiceAccount
  name: voiceassist-app
  namespace: ${namespace}
roleRef:
  kind: Role
  name: voiceassist-app-role
  apiGroup: rbac.authorization.k8s.io
EOF

    if [[ $? -eq 0 ]]; then
        log_success "RBAC policies applied"
        return 0
    else
        log_error "Failed to apply RBAC policies"
        return 1
    fi
}

###############################################################################
# Network Policies (optional)
###############################################################################

apply_network_policies() {
    if [[ "${ENVIRONMENT}" != "prod" ]]; then
        log_info "Skipping network policies for non-production environment"
        return 0
    fi

    log_info "Applying network policies..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would apply network policies"
        return 0
    fi

    local namespace="voiceassist-${ENVIRONMENT}"

    # Basic network policy to restrict pod-to-pod communication
    cat <<EOF | kubectl apply -f - 2>&1 | tee -a "${LOG_FILE}"
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: voiceassist-netpol
  namespace: ${namespace}
spec:
  podSelector:
    matchLabels:
      app: voiceassist
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - podSelector:
        matchLabels:
          app: voiceassist
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: voiceassist
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 80
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Network policies applied"
        return 0
    else
        log_warning "Failed to apply network policies"
        return 0
    fi
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Kubernetes Bootstrap ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Region: ${AWS_REGION}"
    log_info "Dry Run: ${DRY_RUN}"
    [[ -n "${SKIP_COMPONENTS}" ]] && log_info "Skipping: ${SKIP_COMPONENTS}"
    log_info ""

    # Configure kubectl
    if ! configure_kubectl; then
        log_error "kubectl configuration failed"
        return 1
    fi

    # Check Helm
    if ! check_helm; then
        log_error "Helm check failed"
        return 1
    fi

    # Bootstrap components
    log_info "Installing Kubernetes components..."
    echo ""

    create_namespaces || log_error "Namespace creation failed"
    install_metrics_server || log_warning "Metrics server installation had issues"
    install_ingress_nginx || log_warning "Ingress NGINX installation had issues"
    install_cert_manager || log_warning "cert-manager installation had issues"
    install_prometheus_operator || log_warning "Prometheus operator installation had issues"
    apply_rbac_policies || log_warning "RBAC policies had issues"
    apply_network_policies || log_warning "Network policies had issues"

    log_success "=== Kubernetes Bootstrap Completed ==="
    log_info "Log file: ${LOG_FILE}"
    log_info ""
    log_info "Next steps:"
    log_info "1. Configure DNS for ingress LoadBalancer"
    log_info "2. Set up SSL certificates with cert-manager"
    log_info "3. Deploy your application using deploy scripts"
    log_info "4. Access Grafana dashboard for monitoring"

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
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -V|--verbose)
                VERBOSE=true
                shift
                ;;
            -s|--skip)
                SKIP_COMPONENTS="$2"
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
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
