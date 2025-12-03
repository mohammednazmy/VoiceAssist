#!/bin/bash
# shellcheck disable=SC2181
# PostgreSQL Failover Testing Procedure (Phase 12 - HA/DR)
# Tests primary-to-replica failover and measures recovery time

set -e

# Configuration
PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary}"
REPLICA_HOST="${REPLICA_HOST:-postgres-replica}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-voiceassist}"
PGPASSWORD="${POSTGRES_PASSWORD:-voiceassist_password}"
export PGPASSWORD

# Test results
TEST_RESULTS="/tmp/failover_test_$(date +%Y%m%d_%H%M%S).log"
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_RESULTS"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$TEST_RESULTS"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}✗ $1${NC}" | tee -a "$TEST_RESULTS"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}" | tee -a "$TEST_RESULTS"
}

log "========================================"
log "VoiceAssist Failover Test Suite"
log "========================================"
log "Primary: ${PRIMARY_HOST}:${DB_PORT}"
log "Replica: ${REPLICA_HOST}:${DB_PORT}"
log "Test Results: $TEST_RESULTS"
log ""

# Test 1: Verify primary is online
log "Test 1: Verify Primary Database Status"
if docker exec voiceassist-postgres-primary psql -U "$DB_USER" -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Primary database is online"
else
    log_error "Primary database is not responding"
    exit 1
fi

# Test 2: Verify replica is online
log "Test 2: Verify Replica Database Status"
if docker exec voiceassist-postgres-replica psql -U "$DB_USER" -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Replica database is online"
else
    log_error "Replica database is not responding"
    exit 1
fi

# Test 3: Verify replication status
log "Test 3: Verify Replication Status"
REPLICATION_STATUS=$(docker exec voiceassist-postgres-primary psql -U "$DB_USER" -t \
    -c "SELECT state FROM pg_stat_replication;" | tr -d ' ' 2>/dev/null || echo "none")
if [ "$REPLICATION_STATUS" = "streaming" ]; then
    log_success "Replication is active (streaming)"
else
    log_warning "Replication status: $REPLICATION_STATUS (expected: streaming)"
fi

# Test 4: Check replication lag
log "Test 4: Measure Replication Lag"
LAG_SECONDS=$(docker exec voiceassist-postgres-replica psql -U "$DB_USER" -t \
    -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())), 0);" 2>/dev/null || echo "999")
LAG_SECONDS=$(echo "$LAG_SECONDS" | tr -d ' ')
log "Replication lag: ${LAG_SECONDS} seconds"

if (( $(echo "$LAG_SECONDS < 5" | bc -l 2>/dev/null || echo "0") )); then
    log_success "Replication lag is acceptable (< 5 seconds)"
else
    log_warning "Replication lag is high: ${LAG_SECONDS} seconds"
fi

# Test 5: Verify replica is in standby mode
log "Test 5: Verify Replica is in Standby Mode"
IS_IN_RECOVERY=$(docker exec voiceassist-postgres-replica psql -U "$DB_USER" -t \
    -c "SELECT pg_is_in_recovery();" | tr -d ' ' 2>/dev/null || echo "f")
if [ "$IS_IN_RECOVERY" = "t" ]; then
    log_success "Replica is in standby/recovery mode"
else
    log_error "Replica is not in standby mode"
fi

# Test 6: Create test data on primary
log "Test 6: Create Test Data on Primary"
TEST_VALUE="failover_test_$(date +%s)"
docker exec voiceassist-postgres-primary psql -U "$DB_USER" -d voiceassist \
    -c "CREATE TABLE IF NOT EXISTS failover_test (id SERIAL PRIMARY KEY, value TEXT, timestamp TIMESTAMP DEFAULT NOW());" > /dev/null 2>&1
docker exec voiceassist-postgres-primary psql -U "$DB_USER" -d voiceassist \
    -c "INSERT INTO failover_test (value) VALUES ('${TEST_VALUE}');" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    log_success "Test data created on primary"
else
    log_error "Failed to create test data on primary"
fi

# Test 7: Wait for replication
log "Test 7: Wait for Data Replication"
sleep 3
REPLICA_COUNT=$(docker exec voiceassist-postgres-replica psql -U "$DB_USER" -d voiceassist -t \
    -c "SELECT COUNT(*) FROM failover_test WHERE value = '${TEST_VALUE}';" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$REPLICA_COUNT" -gt 0 ]; then
    log_success "Test data replicated to replica"
else
    log_error "Test data not found on replica"
fi

# Test 8: Simulate primary failure (stop primary)
log "Test 8: Simulate Primary Failure"
log "Stopping primary database..."
START_TIME=$(date +%s)
docker-compose stop postgres-primary > /dev/null 2>&1 || docker stop voiceassist-postgres-primary > /dev/null 2>&1

# Verify primary is down
sleep 2
if docker exec voiceassist-postgres-primary psql -U "$DB_USER" -c "SELECT 1;" > /dev/null 2>&1; then
    log_error "Primary is still responding (should be down)"
else
    log_success "Primary database stopped"
fi

# Test 9: Promote replica to primary
log "Test 9: Promote Replica to Primary"
log "Executing pg_ctl promote..."
PROMOTE_START=$(date +%s)
docker exec voiceassist-postgres-replica pg_ctl promote -D /var/lib/postgresql/data > /dev/null 2>&1

# Wait for promotion to complete
log "Waiting for promotion to complete..."
sleep 5

# Verify replica is now primary
IS_IN_RECOVERY_AFTER=$(docker exec voiceassist-postgres-replica psql -U "$DB_USER" -t \
    -c "SELECT pg_is_in_recovery();" | tr -d ' ' 2>/dev/null || echo "t")
PROMOTE_END=$(date +%s)
PROMOTE_TIME=$((PROMOTE_END - PROMOTE_START))

if [ "$IS_IN_RECOVERY_AFTER" = "f" ]; then
    log_success "Replica promoted to primary (${PROMOTE_TIME}s)"
else
    log_error "Replica is still in standby mode"
fi

# Test 10: Verify new primary is writable
log "Test 10: Verify New Primary is Writable"
TEST_VALUE_AFTER="after_failover_$(date +%s)"
docker exec voiceassist-postgres-replica psql -U "$DB_USER" -d voiceassist \
    -c "INSERT INTO failover_test (value) VALUES ('${TEST_VALUE_AFTER}');" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    log_success "New primary accepts writes"
else
    log_error "New primary does not accept writes"
fi

# Test 11: Verify previous data is intact
log "Test 11: Verify Data Integrity After Failover"
COUNT_AFTER=$(docker exec voiceassist-postgres-replica psql -U "$DB_USER" -d voiceassist -t \
    -c "SELECT COUNT(*) FROM failover_test;" | tr -d ' ' 2>/dev/null || echo "0")
if [ "$COUNT_AFTER" -ge 2 ]; then
    log_success "Data integrity verified ($COUNT_AFTER records)"
else
    log_error "Data integrity check failed ($COUNT_AFTER records)"
fi

# Test 12: Measure total failover time
END_TIME=$(date +%s)
TOTAL_FAILOVER_TIME=$((END_TIME - START_TIME))
log "Total failover time: ${TOTAL_FAILOVER_TIME} seconds"

if [ "$TOTAL_FAILOVER_TIME" -lt 60 ]; then
    log_success "Failover completed within RTO (< 60 seconds)"
else
    log_warning "Failover exceeded target RTO: ${TOTAL_FAILOVER_TIME}s"
fi

# Test 13: Restart original primary as new replica (optional)
log "Test 13: Restart Original Primary (as potential new replica)"
log "Starting original primary..."
docker-compose start postgres-primary > /dev/null 2>&1 || docker start voiceassist-postgres-primary > /dev/null 2>&1
sleep 5

if docker exec voiceassist-postgres-primary psql -U "$DB_USER" -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Original primary restarted"
    log_warning "Original primary needs reconfiguration to become replica"
else
    log_warning "Original primary did not restart successfully"
fi

# Cleanup
log "Cleaning up test data..."
docker exec voiceassist-postgres-replica psql -U "$DB_USER" -d voiceassist \
    -c "DROP TABLE IF EXISTS failover_test;" > /dev/null 2>&1 || true

# Summary
log ""
log "========================================"
log "Failover Test Summary"
log "========================================"
log "Tests Passed: ${TESTS_PASSED}"
log "Tests Failed: ${TESTS_FAILED}"
log "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
log ""
log "Key Metrics:"
log "- Promotion Time: ${PROMOTE_TIME}s"
log "- Total Failover Time: ${TOTAL_FAILOVER_TIME}s"
log "- Replication Lag (before failover): ${LAG_SECONDS}s"
log ""
log "RTO Target: 30 minutes (1800 seconds)"
log "RPO Target: < 1 minute (60 seconds)"
log ""
if [ "$TOTAL_FAILOVER_TIME" -lt 1800 ]; then
    log_success "RTO target met: ${TOTAL_FAILOVER_TIME}s < 1800s"
else
    log_error "RTO target not met: ${TOTAL_FAILOVER_TIME}s >= 1800s"
fi

if (( $(echo "$LAG_SECONDS < 60" | bc -l 2>/dev/null || echo "0") )); then
    log_success "RPO target met: ${LAG_SECONDS}s < 60s"
else
    log_error "RPO target not met: ${LAG_SECONDS}s >= 60s"
fi

log ""
log "Test results saved to: $TEST_RESULTS"

if [ "$TESTS_FAILED" -eq 0 ]; then
    log_success "All tests passed! Failover system is operational."
    exit 0
else
    log_error "Some tests failed. Review the log for details."
    exit 1
fi
