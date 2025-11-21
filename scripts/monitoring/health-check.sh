#!/bin/bash

###############################################################################
# VoiceAssist Health Check Script
#
# Performs comprehensive health checks on deployed application
#
# Usage:
#   ./health-check.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -V, --verbose           Enable verbose output
#   -t, --timeout SEC       Health check timeout in seconds (default: 30)
#   -h, --help              Show this help message
#
# Examples:
#   ./health-check.sh -e staging
#   ./health-check.sh -e prod --verbose
#   ./health-check.sh -e dev --timeout 60
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
LOG_DIR="${PROJECT_ROOT}/logs/health-check"
LOG_FILE="${LOG_DIR}/health-check_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
VERBOSE=false
TIMEOUT=30

AWS_REGION="${AWS_REGION:-us-east-1}"

# Check counters
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

configure_kubectl() {
    local cluster_name="voiceassist-eks-${ENVIRONMENT}"

    log_verbose "Configuring kubectl for cluster: ${cluster_name}"

    if ! aws eks update-kubeconfig --region "${AWS_REGION}" --name "${cluster_name}" &> /dev/null; then
        log_error "Failed to configure kubectl"
        return 1
    fi

    return 0
}

get_service_url() {
    local service=$1
    local namespace="voiceassist-${ENVIRONMENT}"

    # Try to get URL from ingress
    local ingress_host=$(kubectl get ingress -n "${namespace}" \
        -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null)

    if [[ -n "${ingress_host}" ]]; then
        echo "https://${ingress_host}"
        return 0
    fi

    # Fallback to LoadBalancer service
    local lb_hostname=$(kubectl get service "${service}" -n "${namespace}" \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)

    if [[ -n "${lb_hostname}" ]]; then
        echo "http://${lb_hostname}"
        return 0
    fi

    # If no external access, use port-forward
    log_verbose "No external URL found, health check may need port-forwarding"
    echo ""
    return 1
}

check_health_endpoint() {
    log_info "Checking /health endpoint..."

    local service_url=$(get_service_url "voiceassist-backend")

    if [[ -z "${service_url}" ]]; then
        log_warning "⚠ Could not determine service URL"
        return 0
    fi

    local health_url="${service_url}/health"
    log_verbose "Health URL: ${health_url}"

    local response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "${TIMEOUT}" \
        "${health_url}" 2>/dev/null)

    if [[ "${response}" == "200" ]]; then
        log_success "✓ Health endpoint responding (HTTP 200)"
        return 0
    elif [[ "${response}" == "000" ]]; then
        log_error "✗ Health endpoint not reachable (connection failed)"
        return 1
    else
        log_error "✗ Health endpoint returned HTTP ${response}"
        return 1
    fi
}

check_readiness_endpoint() {
    log_info "Checking /ready endpoint..."

    local service_url=$(get_service_url "voiceassist-backend")

    if [[ -z "${service_url}" ]]; then
        log_warning "⚠ Could not determine service URL"
        return 0
    fi

    local ready_url="${service_url}/ready"
    log_verbose "Readiness URL: ${ready_url}"

    local response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "${TIMEOUT}" \
        "${ready_url}" 2>/dev/null)

    if [[ "${response}" == "200" ]]; then
        log_success "✓ Readiness endpoint responding (HTTP 200)"
        return 0
    elif [[ "${response}" == "000" ]]; then
        log_error "✗ Readiness endpoint not reachable"
        return 1
    else
        log_error "✗ Readiness endpoint returned HTTP ${response}"
        return 1
    fi
}

check_database_connectivity() {
    log_info "Checking database connectivity..."

    # Get database endpoint from Secrets Manager
    local secret_name="voiceassist/${ENVIRONMENT}/database"
    local db_info=$(aws secretsmanager get-secret-value \
        --secret-id "${secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null)

    if [[ -z "${db_info}" ]]; then
        log_warning "⚠ Could not retrieve database information"
        return 0
    fi

    local db_host=$(echo "${db_info}" | jq -r '.host')
    local db_port=$(echo "${db_info}" | jq -r '.port // 5432')

    log_verbose "Database: ${db_host}:${db_port}"

    if command -v nc &> /dev/null; then
        if timeout 5 nc -z "${db_host}" "${db_port}" &> /dev/null; then
            log_success "✓ Database is reachable"
            return 0
        else
            log_error "✗ Cannot connect to database"
            return 1
        fi
    else
        log_warning "⚠ netcat not available for database check"
        return 0
    fi
}

check_redis_connectivity() {
    log_info "Checking Redis connectivity..."

    # Get Redis endpoint from Secrets Manager
    local secret_name="voiceassist/${ENVIRONMENT}/redis"
    local redis_info=$(aws secretsmanager get-secret-value \
        --secret-id "${secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null)

    if [[ -z "${redis_info}" ]]; then
        log_warning "⚠ Could not retrieve Redis information"
        return 0
    fi

    local redis_host=$(echo "${redis_info}" | jq -r '.host')
    local redis_port=$(echo "${redis_info}" | jq -r '.port // 6379')

    log_verbose "Redis: ${redis_host}:${redis_port}"

    if command -v nc &> /dev/null; then
        if timeout 5 nc -z "${redis_host}" "${redis_port}" &> /dev/null; then
            log_success "✓ Redis is reachable"
            return 0
        else
            log_error "✗ Cannot connect to Redis"
            return 1
        fi
    else
        log_warning "⚠ netcat not available for Redis check"
        return 0
    fi
}

check_pods_health() {
    log_info "Checking Kubernetes pod health..."

    local namespace="voiceassist-${ENVIRONMENT}"

    local pod_status=$(kubectl get pods -n "${namespace}" -o json 2>/dev/null)

    if [[ -z "${pod_status}" ]]; then
        log_error "✗ Failed to get pod status"
        return 1
    fi

    local total_pods=$(echo "${pod_status}" | jq -r '.items | length')
    local running_pods=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.phase == "Running")] | length')
    local ready_pods=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.conditions[] | select(.type == "Ready" and .status == "True"))] | length')

    log_verbose "Pods: ${running_pods}/${total_pods} Running, ${ready_pods}/${total_pods} Ready"

    # Check for failed pods
    local failed_pods=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.phase == "Failed")] | length')
    if [[ ${failed_pods} -gt 0 ]]; then
        log_error "✗ ${failed_pods} pod(s) in Failed state"
        return 1
    fi

    # Check for crash looping pods
    local crash_loop=$(echo "${pod_status}" | jq -r '[.items[] | select(.status.containerStatuses[]? | .restartCount > 5)] | length')
    if [[ ${crash_loop} -gt 0 ]]; then
        log_warning "⚠ ${crash_loop} pod(s) with high restart count"
    fi

    if [[ ${ready_pods} -eq ${total_pods} ]] && [[ ${total_pods} -gt 0 ]]; then
        log_success "✓ All ${total_pods} pod(s) are healthy and ready"
        return 0
    elif [[ ${ready_pods} -gt 0 ]]; then
        log_warning "⚠ Only ${ready_pods}/${total_pods} pod(s) are ready"
        return 1
    else
        log_error "✗ No pods are ready"
        return 1
    fi
}

check_deployments_health() {
    log_info "Checking deployment health..."

    local namespace="voiceassist-${ENVIRONMENT}"

    local deployments=$(kubectl get deployments -n "${namespace}" -o json 2>/dev/null)

    if [[ -z "${deployments}" ]]; then
        log_error "✗ Failed to get deployment status"
        return 1
    fi

    local total_deployments=$(echo "${deployments}" | jq -r '.items | length')
    local ready_deployments=$(echo "${deployments}" | jq -r '[.items[] | select(.status.conditions[] | select(.type == "Available" and .status == "True"))] | length')

    log_verbose "Deployments: ${ready_deployments}/${total_deployments} Available"

    if [[ ${ready_deployments} -eq ${total_deployments} ]] && [[ ${total_deployments} -gt 0 ]]; then
        log_success "✓ All ${total_deployments} deployment(s) are available"
        return 0
    else
        log_error "✗ Only ${ready_deployments}/${total_deployments} deployment(s) are available"
        return 1
    fi
}

check_services() {
    log_info "Checking services..."

    local namespace="voiceassist-${ENVIRONMENT}"

    local services=$(kubectl get services -n "${namespace}" --no-headers 2>/dev/null | wc -l)

    if [[ ${services} -gt 0 ]]; then
        log_success "✓ ${services} service(s) configured"
        return 0
    else
        log_error "✗ No services found"
        return 1
    fi
}

check_ingress() {
    log_info "Checking ingress..."

    local namespace="voiceassist-${ENVIRONMENT}"

    local ingress_count=$(kubectl get ingress -n "${namespace}" --no-headers 2>/dev/null | wc -l)

    if [[ ${ingress_count} -gt 0 ]]; then
        local ingress_host=$(kubectl get ingress -n "${namespace}" \
            -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null)

        log_success "✓ Ingress configured (host: ${ingress_host})"
        return 0
    else
        log_warning "⚠ No ingress configured"
        return 0
    fi
}

check_prometheus_metrics() {
    log_info "Checking Prometheus metrics..."

    # This is a basic check - in production you'd query Prometheus API
    local namespace="voiceassist-${ENVIRONMENT}"

    # Check if Prometheus ServiceMonitor exists
    if kubectl get servicemonitor -n "${namespace}" &> /dev/null; then
        log_success "✓ Prometheus metrics collection configured"
        return 0
    else
        log_warning "⚠ Prometheus ServiceMonitor not found"
        return 0
    fi
}

check_hpa() {
    log_info "Checking HorizontalPodAutoscaler..."

    local namespace="voiceassist-${ENVIRONMENT}"

    local hpa_count=$(kubectl get hpa -n "${namespace}" --no-headers 2>/dev/null | wc -l)

    if [[ ${hpa_count} -gt 0 ]]; then
        log_success "✓ ${hpa_count} HPA(s) configured"

        if [[ "${VERBOSE}" == "true" ]]; then
            kubectl get hpa -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"
        fi

        return 0
    else
        log_warning "⚠ No HPA configured"
        return 0
    fi
}

show_resource_usage() {
    if [[ "${VERBOSE}" != "true" ]]; then
        return 0
    fi

    local namespace="voiceassist-${ENVIRONMENT}"

    log_info "Resource Usage:"
    echo "" | tee -a "${LOG_FILE}"

    # Show pod resource usage (requires metrics-server)
    if kubectl top pods -n "${namespace}" &> /dev/null; then
        kubectl top pods -n "${namespace}" 2>&1 | tee -a "${LOG_FILE}"
    else
        log_verbose "metrics-server not available for resource usage"
    fi

    echo "" | tee -a "${LOG_FILE}"
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Health Check ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    log_info ""

    # Configure kubectl
    if ! configure_kubectl; then
        log_error "kubectl configuration failed"
        return 1
    fi

    # Run all health checks
    check_deployments_health
    check_pods_health
    check_services
    check_ingress
    check_health_endpoint
    check_readiness_endpoint
    check_database_connectivity
    check_redis_connectivity
    check_hpa
    check_prometheus_metrics

    # Show resource usage in verbose mode
    show_resource_usage

    # Summary
    echo "" | tee -a "${LOG_FILE}"
    log_info "=== Health Check Summary ==="
    log_info "Passed: ${CHECKS_PASSED}"
    log_info "Warnings: ${CHECKS_WARNING}"
    log_info "Failed: ${CHECKS_FAILED}"
    log_info "Log file: ${LOG_FILE}"

    if [[ ${CHECKS_FAILED} -gt 0 ]]; then
        log_error "=== Health Check FAILED ==="
        return 1
    elif [[ ${CHECKS_WARNING} -gt 0 ]]; then
        log_warning "=== Health Check PASSED with warnings ==="
        return 0
    else
        log_success "=== All Health Checks PASSED ==="
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
            -V|--verbose)
                VERBOSE=true
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
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
