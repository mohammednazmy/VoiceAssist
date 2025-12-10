#!/bin/bash
# shellcheck disable=SC2034,SC2086,SC2155

# VoiceAssist Autoscaling Test Script
# Generates load to test HPA scaling behavior
# Usage: ./test-autoscaling.sh [environment] [component]
#   environment: dev, staging, prod (default: dev)
#   component: api, worker, all (default: all)

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-dev}"
COMPONENT="${2:-all}"
NAMESPACE="voiceassist-${ENVIRONMENT}"
TEST_DURATION=600  # 10 minutes
COOL_DOWN=300      # 5 minutes

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

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found"
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check namespace exists
    if ! kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        log_error "Namespace ${NAMESPACE} not found"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

get_pod_count() {
    local app_label=$1
    kubectl get pods -n "${NAMESPACE}" -l "app=${app_label}" \
        --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l
}

get_hpa_status() {
    local hpa_name=$1
    kubectl get hpa "${hpa_name}" -n "${NAMESPACE}" \
        -o custom-columns=CURRENT_REPLICAS:.status.currentReplicas,DESIRED_REPLICAS:.status.desiredReplicas,CPU:.status.currentMetrics[0].resource.current.averageUtilization \
        --no-headers 2>/dev/null || echo "N/A N/A N/A"
}

monitor_scaling() {
    local app_label=$1
    local hpa_name=$2
    local duration=$3

    log_info "Monitoring ${app_label} scaling for ${duration} seconds..."

    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local initial_pods=$(get_pod_count "${app_label}")
    local max_pods=${initial_pods}

    echo ""
    printf "%-20s %-10s %-10s %-10s %-15s\n" "Timestamp" "Pods" "Current" "Desired" "CPU%"
    printf "%-20s %-10s %-10s %-10s %-15s\n" "--------------------" "----------" "----------" "----------" "---------------"

    while [[ $(date +%s) -lt ${end_time} ]]; do
        local current_pods=$(get_pod_count "${app_label}")
        local hpa_status=$(get_hpa_status "${hpa_name}")
        read -r current_replicas desired_replicas cpu_percent <<< "${hpa_status}"

        if [[ ${current_pods} -gt ${max_pods} ]]; then
            max_pods=${current_pods}
        fi

        printf "%-20s %-10s %-10s %-10s %-15s\n" \
            "$(timestamp)" \
            "${current_pods}" \
            "${current_replicas}" \
            "${desired_replicas}" \
            "${cpu_percent}"

        sleep 5
    done

    echo ""
    log_success "Monitoring complete for ${app_label}"
    log_info "Initial pods: ${initial_pods}, Max pods: ${max_pods}"

    return ${max_pods}
}

test_api_gateway_scaling() {
    log_info "==========================================="
    log_info "Testing API Gateway Autoscaling"
    log_info "==========================================="

    local service_url="http://voiceassist-server.${NAMESPACE}.svc.cluster.local:8000"
    local initial_pods=$(get_pod_count "voiceassist-server")

    log_info "Initial pod count: ${initial_pods}"
    log_info "Target service: ${service_url}"

    # Create load generator pod
    log_info "Creating load generator pod..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: api-load-generator
  namespace: ${NAMESPACE}
  labels:
    app: load-generator
    component: test
spec:
  restartPolicy: Never
  containers:
  - name: load-generator
    image: williamyeh/hey:latest
    command: ["/bin/sh"]
    args:
      - -c
      - |
        echo "Starting load test at \$(date)"
        echo "Target: ${service_url}/health"
        echo "Duration: ${TEST_DURATION} seconds"
        echo "Concurrent connections: 100"
        echo "Requests per second: 50"
        echo ""
        hey -z ${TEST_DURATION}s -c 100 -q 50 ${service_url}/health
        echo ""
        echo "Load test completed at \$(date)"
  terminationGracePeriodSeconds: 0
EOF

    # Wait for pod to start
    log_info "Waiting for load generator to start..."
    kubectl wait --for=condition=ready --timeout=60s pod/api-load-generator -n "${NAMESPACE}" || {
        log_error "Load generator failed to start"
        kubectl logs api-load-generator -n "${NAMESPACE}" || true
        return 1
    }

    log_success "Load generator started"

    # Monitor scaling in background
    monitor_scaling "voiceassist-server" "voiceassist-server-hpa" ${TEST_DURATION} &
    local monitor_pid=$!

    # Wait for load test to complete
    log_info "Waiting for load test to complete..."
    kubectl wait --for=condition=complete --timeout=$((TEST_DURATION + 60))s pod/api-load-generator -n "${NAMESPACE}" || {
        log_warning "Load test did not complete in expected time"
    }

    # Get load test results
    log_info "Load test results:"
    kubectl logs api-load-generator -n "${NAMESPACE}" | tail -n 20

    # Wait for monitoring to complete
    wait ${monitor_pid}

    # Clean up
    kubectl delete pod api-load-generator -n "${NAMESPACE}" --grace-period=0 --force 2>/dev/null || true

    # Cool down period
    log_info "Cooling down for ${COOL_DOWN} seconds to observe scale-down..."
    monitor_scaling "voiceassist-server" "voiceassist-server-hpa" ${COOL_DOWN}

    log_success "API Gateway scaling test completed"
}

test_worker_scaling() {
    log_info "==========================================="
    log_info "Testing Worker Autoscaling"
    log_info "==========================================="

    local redis_service="voiceassist-redis.${NAMESPACE}.svc.cluster.local"
    local initial_pods=$(get_pod_count "voiceassist-worker")

    log_info "Initial pod count: ${initial_pods}"
    log_info "Redis service: ${redis_service}"

    # Create job generator pod
    log_info "Creating job generator pod..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: worker-job-generator
  namespace: ${NAMESPACE}
  labels:
    app: job-generator
    component: test
spec:
  restartPolicy: Never
  containers:
  - name: job-generator
    image: redis:alpine
    command: ["/bin/sh"]
    args:
      - -c
      - |
        echo "Starting job generation at \$(date)"
        echo "Target: ${redis_service}"
        echo "Duration: ${TEST_DURATION} seconds"
        echo ""

        end_time=\$((SECONDS + ${TEST_DURATION}))
        job_count=0

        while [ \$SECONDS -lt \$end_time ]; do
          # Generate multiple jobs
          for i in {1..10}; do
            echo "job_\${job_count}_\${i}" | redis-cli -h ${redis_service} lpush celery 2>&1
          done
          job_count=\$((job_count + 10))

          if [ \$((job_count % 100)) -eq 0 ]; then
            queue_length=\$(redis-cli -h ${redis_service} llen celery 2>&1)
            echo "\$(date): Generated \${job_count} jobs, queue length: \${queue_length}"
          fi

          sleep 1
        done

        final_queue_length=\$(redis-cli -h ${redis_service} llen celery 2>&1)
        echo ""
        echo "Job generation completed at \$(date)"
        echo "Total jobs generated: \${job_count}"
        echo "Final queue length: \${final_queue_length}"
  terminationGracePeriodSeconds: 0
EOF

    # Wait for pod to start
    log_info "Waiting for job generator to start..."
    kubectl wait --for=condition=ready --timeout=60s pod/worker-job-generator -n "${NAMESPACE}" || {
        log_error "Job generator failed to start"
        kubectl logs worker-job-generator -n "${NAMESPACE}" || true
        return 1
    }

    log_success "Job generator started"

    # Monitor scaling in background
    monitor_scaling "voiceassist-worker" "voiceassist-worker-hpa" ${TEST_DURATION} &
    local monitor_pid=$!

    # Stream job generator logs
    kubectl logs -f worker-job-generator -n "${NAMESPACE}" &
    local log_pid=$!

    # Wait for job generation to complete
    log_info "Waiting for job generation to complete..."
    kubectl wait --for=condition=complete --timeout=$((TEST_DURATION + 60))s pod/worker-job-generator -n "${NAMESPACE}" || {
        log_warning "Job generation did not complete in expected time"
    }

    # Stop log streaming
    kill ${log_pid} 2>/dev/null || true

    # Wait for monitoring to complete
    wait ${monitor_pid}

    # Check final queue length
    log_info "Checking final queue status..."
    kubectl run --rm -it queue-check --image=redis:alpine --restart=Never -n "${NAMESPACE}" -- \
        redis-cli -h ${redis_service} llen celery || true

    # Clean up
    kubectl delete pod worker-job-generator -n "${NAMESPACE}" --grace-period=0 --force 2>/dev/null || true

    # Cool down period
    log_info "Cooling down for ${COOL_DOWN} seconds to observe scale-down..."
    monitor_scaling "voiceassist-worker" "voiceassist-worker-hpa" ${COOL_DOWN}

    log_success "Worker scaling test completed"
}

generate_report() {
    log_info "==========================================="
    log_info "Autoscaling Test Report"
    log_info "==========================================="
    echo ""

    log_info "Environment: ${ENVIRONMENT}"
    log_info "Namespace: ${NAMESPACE}"
    log_info "Test Duration: ${TEST_DURATION}s"
    log_info "Cool Down: ${COOL_DOWN}s"
    echo ""

    log_info "Current HPA Status:"
    kubectl get hpa -n "${NAMESPACE}" -o wide || true
    echo ""

    log_info "Current Pod Status:"
    kubectl get pods -n "${NAMESPACE}" -l 'app in (voiceassist-server,voiceassist-worker)' || true
    echo ""

    log_info "Current Resource Usage:"
    kubectl top pods -n "${NAMESPACE}" -l 'app in (voiceassist-server,voiceassist-worker)' || true
    echo ""

    log_success "Test report generated"
}

cleanup() {
    log_info "Cleaning up test resources..."

    kubectl delete pod api-load-generator -n "${NAMESPACE}" --grace-period=0 --force 2>/dev/null || true
    kubectl delete pod worker-job-generator -n "${NAMESPACE}" --grace-period=0 --force 2>/dev/null || true
    kubectl delete pod queue-check -n "${NAMESPACE}" --grace-period=0 --force 2>/dev/null || true

    log_success "Cleanup completed"
}

# Trap cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    log_info "VoiceAssist Autoscaling Test Script"
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Component: ${COMPONENT}"
    echo ""

    check_prerequisites

    case "${COMPONENT}" in
        api)
            test_api_gateway_scaling
            ;;
        worker)
            test_worker_scaling
            ;;
        all)
            test_api_gateway_scaling
            echo ""
            echo ""
            test_worker_scaling
            ;;
        *)
            log_error "Unknown component: ${COMPONENT}"
            echo "Valid components: api, worker, all"
            exit 1
            ;;
    esac

    echo ""
    generate_report

    log_success "All tests completed successfully!"
}

# Handle script arguments
if [[ "${1:-}" == "help" ]] || [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [environment] [component]"
    echo ""
    echo "Arguments:"
    echo "  environment  - dev, staging, prod (default: dev)"
    echo "  component    - api, worker, all (default: all)"
    echo ""
    echo "Examples:"
    echo "  $0               # Test all components in dev"
    echo "  $0 staging api   # Test API Gateway in staging"
    echo "  $0 prod worker   # Test Worker in production"
    echo ""
    exit 0
fi

main
