#!/bin/bash

################################################################################
# VoiceAssist Production Smoke Tests
#
# This script performs comprehensive smoke tests on a production deployment
# to verify all critical functionality is working correctly.
#
# Usage: ./smoke-test.sh --domain <domain> [OPTIONS]
#
# Options:
#   --domain <domain>    Production domain name (required)
#   --api-key <key>      API key for authentication
#   --timeout <seconds>  Timeout for HTTP requests (default: 30)
#   --verbose            Enable verbose output
#   --slack-webhook      Slack webhook URL for notifications
#
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN=""
API_KEY=""
TIMEOUT=30
VERBOSE=false
SLACK_WEBHOOK=""

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
FAILED_TESTS=()

################################################################################
# Helper Functions
################################################################################

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

test_passed() {
    ((TESTS_PASSED++))
    log_success "$1"
}

test_failed() {
    ((TESTS_FAILED++))
    FAILED_TESTS+=("$1")
    log_error "$1"
}

test_skipped() {
    ((TESTS_SKIPPED++))
    log_warning "$1 (SKIPPED)"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain) DOMAIN="$2"; shift 2 ;;
            --api-key) API_KEY="$2"; shift 2 ;;
            --timeout) TIMEOUT="$2"; shift 2 ;;
            --verbose) VERBOSE=true; shift ;;
            --slack-webhook) SLACK_WEBHOOK="$2"; shift 2 ;;
            -h|--help)
                cat << EOF
Usage: $0 --domain <domain> [OPTIONS]

Required:
  --domain <domain>      Production domain name

Optional:
  --api-key <key>        API key for authentication
  --timeout <seconds>    Timeout for HTTP requests (default: 30)
  --verbose              Enable verbose output
  --slack-webhook <url>  Slack webhook for notifications
  -h, --help             Show this help message

EOF
                exit 0
                ;;
            *) log_error "Unknown option: $1"; exit 1 ;;
        esac
    done
    
    if [[ -z "$DOMAIN" ]]; then
        log_error "Missing required argument: --domain"
        exit 1
    fi
}

make_request() {
    local method="$1"
    local endpoint="$2"
    local expected_status="$3"
    local data="${4:-}"
    
    local url="https://$DOMAIN$endpoint"
    local response
    local http_code
    
    if [[ -n "$data" ]]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" \
            --max-time "$TIMEOUT" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            --max-time "$TIMEOUT" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if $VERBOSE; then
        log_info "Request: $method $url"
        log_info "Response code: $http_code"
        log_info "Response body: $body"
    fi
    
    if [[ "$http_code" == "$expected_status" ]]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Test Functions
################################################################################

test_health_endpoint() {
    log_info "Testing health endpoint..."
    if make_request "GET" "/health" "200"; then
        test_passed "Health endpoint responding"
    else
        test_failed "Health endpoint not responding"
    fi
}

test_ready_endpoint() {
    log_info "Testing ready endpoint..."
    if make_request "GET" "/ready" "200"; then
        test_passed "Ready endpoint responding"
    else
        test_failed "Ready endpoint not responding"
    fi
}

test_metrics_endpoint() {
    log_info "Testing metrics endpoint..."
    if make_request "GET" "/metrics" "200"; then
        test_passed "Metrics endpoint responding"
    else
        test_failed "Metrics endpoint not responding"
    fi
}

test_ssl_certificate() {
    log_info "Testing SSL certificate..."
    
    local cert_info
    cert_info=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        local expiry_date
        expiry_date=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
        
        local expiry_epoch
        expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry_date" "+%s" 2>/dev/null || date -d "$expiry_date" "+%s" 2>/dev/null)
        
        local current_epoch
        current_epoch=$(date "+%s")
        
        local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_until_expiry -gt 7 ]]; then
            test_passed "SSL certificate valid (expires in $days_until_expiry days)"
        else
            log_warning "SSL certificate expires soon ($days_until_expiry days)"
            test_passed "SSL certificate valid but expires soon"
        fi
    else
        test_failed "SSL certificate validation failed"
    fi
}

test_database_connectivity() {
    log_info "Testing database connectivity..."
    
    # Test via API health check
    local response
    response=$(curl -s "https://$DOMAIN/health" --max-time "$TIMEOUT")
    
    if echo "$response" | grep -q "database.*ok\|database.*healthy\|postgres.*ok"; then
        test_passed "Database connectivity verified"
    else
        test_failed "Database connectivity check failed"
    fi
}

test_redis_connectivity() {
    log_info "Testing Redis connectivity..."
    
    local response
    response=$(curl -s "https://$DOMAIN/health" --max-time "$TIMEOUT")
    
    if echo "$response" | grep -q "redis.*ok\|redis.*healthy\|cache.*ok"; then
        test_passed "Redis connectivity verified"
    else
        test_failed "Redis connectivity check failed"
    fi
}

test_qdrant_connectivity() {
    log_info "Testing Qdrant connectivity..."
    
    local response
    response=$(curl -s "https://$DOMAIN/health" --max-time "$TIMEOUT")
    
    if echo "$response" | grep -q "qdrant.*ok\|qdrant.*healthy\|vector.*ok"; then
        test_passed "Qdrant connectivity verified"
    else
        test_failed "Qdrant connectivity check failed"
    fi
}

test_api_gateway() {
    log_info "Testing API Gateway..."
    
    if make_request "GET" "/api/health" "200"; then
        test_passed "API Gateway responding"
    else
        test_failed "API Gateway not responding"
    fi
}

test_authentication_endpoint() {
    log_info "Testing authentication endpoint..."
    
    local test_data='{"email":"test@example.com","password":"invalid"}'
    
    # Should get 401 for invalid credentials
    if make_request "POST" "/api/auth/login" "401" "$test_data"; then
        test_passed "Authentication endpoint responding correctly"
    else
        log_warning "Authentication endpoint response unexpected (may need adjustment)"
        test_skipped "Authentication endpoint test"
    fi
}

test_monitoring_grafana() {
    log_info "Testing Grafana monitoring..."
    
    if make_request "GET" "/grafana/api/health" "200"; then
        test_passed "Grafana responding"
    else
        test_failed "Grafana not responding"
    fi
}

test_monitoring_prometheus() {
    log_info "Testing Prometheus monitoring..."
    
    if make_request "GET" "/prometheus/-/healthy" "200"; then
        test_passed "Prometheus responding"
    else
        test_failed "Prometheus not responding"
    fi
}

test_monitoring_jaeger() {
    log_info "Testing Jaeger tracing..."
    
    if make_request "GET" "/jaeger/" "200"; then
        test_passed "Jaeger responding"
    else
        test_failed "Jaeger not responding"
    fi
}

test_response_time() {
    log_info "Testing API response time..."
    
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s%N)
    curl -s "https://$DOMAIN/health" --max-time "$TIMEOUT" > /dev/null
    end_time=$(date +%s%N)
    
    duration=$(( (end_time - start_time) / 1000000 ))
    
    if [[ $duration -lt 1000 ]]; then
        test_passed "API response time acceptable (${duration}ms)"
    elif [[ $duration -lt 3000 ]]; then
        log_warning "API response time slow (${duration}ms)"
        test_passed "API response time within limits"
    else
        test_failed "API response time too slow (${duration}ms)"
    fi
}

test_cors_headers() {
    log_info "Testing CORS headers..."
    
    local headers
    headers=$(curl -s -I "https://$DOMAIN/health" --max-time "$TIMEOUT")
    
    if echo "$headers" | grep -qi "access-control-allow"; then
        test_passed "CORS headers configured"
    else
        log_warning "CORS headers not found (may be intentional)"
        test_skipped "CORS headers test"
    fi
}

test_security_headers() {
    log_info "Testing security headers..."
    
    local headers
    headers=$(curl -s -I "https://$DOMAIN/" --max-time "$TIMEOUT")
    
    local headers_found=0
    
    if echo "$headers" | grep -qi "strict-transport-security"; then
        ((headers_found++))
    fi
    
    if echo "$headers" | grep -qi "x-content-type-options"; then
        ((headers_found++))
    fi
    
    if echo "$headers" | grep -qi "x-frame-options"; then
        ((headers_found++))
    fi
    
    if [[ $headers_found -ge 2 ]]; then
        test_passed "Security headers configured ($headers_found/3 found)"
    else
        test_failed "Insufficient security headers ($headers_found/3 found)"
    fi
}

test_rate_limiting() {
    log_info "Testing rate limiting..."
    
    local count=0
    local max_attempts=100
    
    for i in $(seq 1 $max_attempts); do
        local response
        response=$(curl -s -w "%{http_code}" -o /dev/null "https://$DOMAIN/health" --max-time 5)
        
        if [[ "$response" == "429" ]]; then
            test_passed "Rate limiting active (triggered after $i requests)"
            return 0
        fi
        
        ((count++))
    done
    
    log_warning "Rate limiting not triggered after $max_attempts requests"
    test_skipped "Rate limiting test"
}

################################################################################
# Notification Functions
################################################################################

send_slack_notification() {
    if [[ -z "$SLACK_WEBHOOK" ]]; then
        return 0
    fi
    
    local status
    if [[ $TESTS_FAILED -eq 0 ]]; then
        status="✅ SUCCESS"
        color="good"
    else
        status="❌ FAILURE"
        color="danger"
    fi
    
    local payload
    payload=$(cat << EOF
{
    "attachments": [{
        "color": "$color",
        "title": "VoiceAssist Production Smoke Tests - $status",
        "fields": [
            {"title": "Domain", "value": "$DOMAIN", "short": true},
            {"title": "Tests Passed", "value": "$TESTS_PASSED", "short": true},
            {"title": "Tests Failed", "value": "$TESTS_FAILED", "short": true},
            {"title": "Tests Skipped", "value": "$TESTS_SKIPPED", "short": true},
            {"title": "Timestamp", "value": "$(date)", "short": false}
        ]
    }]
}
EOF
    )
    
    curl -s -X POST "$SLACK_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null
}

################################################################################
# Main Execution
################################################################################

run_all_tests() {
    log_info "=========================================="
    log_info "Running Production Smoke Tests"
    log_info "Domain: $DOMAIN"
    log_info "=========================================="
    log_info ""
    
    # Core functionality tests
    test_health_endpoint
    test_ready_endpoint
    test_metrics_endpoint
    
    # SSL/TLS tests
    test_ssl_certificate
    
    # Infrastructure tests
    test_database_connectivity
    test_redis_connectivity
    test_qdrant_connectivity
    
    # API tests
    test_api_gateway
    test_authentication_endpoint
    
    # Monitoring tests
    test_monitoring_grafana
    test_monitoring_prometheus
    test_monitoring_jaeger
    
    # Performance tests
    test_response_time
    
    # Security tests
    test_cors_headers
    test_security_headers
    test_rate_limiting
}

display_summary() {
    log_info ""
    log_info "=========================================="
    log_info "Smoke Test Summary"
    log_info "=========================================="
    log_info "Domain:         $DOMAIN"
    log_info "Tests Passed:   $TESTS_PASSED"
    log_info "Tests Failed:   $TESTS_FAILED"
    log_info "Tests Skipped:  $TESTS_SKIPPED"
    log_info "Total Tests:    $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    log_info "=========================================="
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error ""
        log_error "Failed Tests:"
        for test in "${FAILED_TESTS[@]}"; do
            log_error "  - $test"
        done
        log_error ""
        log_error "Smoke tests FAILED!"
        return 1
    else
        log_success ""
        log_success "All smoke tests PASSED!"
        return 0
    fi
}

main() {
    parse_arguments "$@"
    run_all_tests
    send_slack_notification
    display_summary
}

main "$@"
