#!/bin/bash
# Comprehensive Backup/Restore Testing Procedure (Phase 12 - HA/DR)

set -e

# Configuration
TEST_DIR="${TEST_DIR:-/tmp/voiceassist-dr-test}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voiceassist}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-voiceassist}"
TEST_DB_NAME="voiceassist_restore_test"
DB_USER="${DB_USER:-voiceassist}"
PGPASSWORD="${POSTGRES_PASSWORD:-voiceassist_password}"
export PGPASSWORD

# Test results
TEST_RESULTS="${TEST_DIR}/test_results_$(date +%Y%m%d_%H%M%S).log"
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0:31m'
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

# Create test directory
mkdir -p "$TEST_DIR"

log "========================================"
log "VoiceAssist Backup/Restore Test Suite"
log "========================================"
log "Test Directory: $TEST_DIR"
log "Backup Directory: $BACKUP_DIR"
log "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
log "Test Results: $TEST_RESULTS"
log ""

# Test 1: Verify database connectivity
log "Test 1: Verify Database Connectivity"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Database connectivity verified"
else
    log_error "Cannot connect to database"
    exit 1
fi

# Test 2: Create test data
log "Test 2: Create Test Data"
TEST_USER_EMAIL="dr_test_$(date +%s)@example.com"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
INSERT INTO users (email, hashed_password, role, is_active)
VALUES ('${TEST_USER_EMAIL}', 'test_hash', 'user', true)
RETURNING id;
EOF

if [ $? -eq 0 ]; then
    log_success "Test data created successfully"
    TEST_DATA_CREATED=true
else
    log_error "Failed to create test data"
    TEST_DATA_CREATED=false
fi

# Test 3: Perform backup
log "Test 3: Perform Database Backup"
BACKUP_FILE="${TEST_DIR}/test_backup_$(date +%Y%m%d_%H%M%S).sql"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -F plain --no-owner --no-acl -f "$BACKUP_FILE" > /dev/null 2>&1; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_success "Backup created: $(basename $BACKUP_FILE) ($BACKUP_SIZE)"
else
    log_error "Backup creation failed"
fi

# Test 4: Verify backup file integrity
log "Test 4: Verify Backup File Integrity"
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
    if [ "$FILE_SIZE" -gt 1000 ]; then
        log_success "Backup file integrity verified (size: $FILE_SIZE bytes)"
    else
        log_error "Backup file too small (size: $FILE_SIZE bytes)"
    fi
else
    log_error "Backup file does not exist or is empty"
fi

# Test 5: Create checksum
log "Test 5: Create and Verify Checksum"
CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
echo "$CHECKSUM  $(basename $BACKUP_FILE)" > "${BACKUP_FILE}.sha256"
if sha256sum -c "${BACKUP_FILE}.sha256" > /dev/null 2>&1; then
    log_success "Checksum created and verified: ${CHECKSUM:0:16}..."
else
    log_error "Checksum verification failed"
fi

# Test 6: Encrypt backup
log "Test 6: Encrypt Backup"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"
if echo "test_passphrase" | gpg --symmetric \
    --cipher-algo AES256 \
    --passphrase-fd 0 \
    --batch --yes \
    --output "$ENCRYPTED_FILE" \
    "$BACKUP_FILE" 2>/dev/null; then
    ENCRYPTED_SIZE=$(du -h "$ENCRYPTED_FILE" | cut -f1)
    log_success "Backup encrypted: $(basename $ENCRYPTED_FILE) ($ENCRYPTED_SIZE)"
else
    log_error "Backup encryption failed"
fi

# Test 7: Decrypt backup
log "Test 7: Decrypt Backup"
DECRYPTED_FILE="${TEST_DIR}/decrypted_$(date +%Y%m%d_%H%M%S).sql"
if echo "test_passphrase" | gpg --decrypt \
    --passphrase-fd 0 \
    --batch --yes \
    --output "$DECRYPTED_FILE" \
    "$ENCRYPTED_FILE" 2>/dev/null; then
    log_success "Backup decrypted successfully"
else
    log_error "Backup decryption failed"
fi

# Test 8: Verify decrypted backup matches original
log "Test 8: Verify Decrypted Backup Integrity"
if diff "$BACKUP_FILE" "$DECRYPTED_FILE" > /dev/null; then
    log_success "Decrypted backup matches original"
else
    log_error "Decrypted backup does not match original"
fi

# Test 9: Create test restore database
log "Test 9: Create Test Restore Database"
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" --if-exists 2>/dev/null || true
if createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" 2>/dev/null; then
    log_success "Test restore database created"
else
    log_error "Failed to create test restore database"
fi

# Test 10: Restore backup to test database
log "Test 10: Restore Backup to Test Database"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" \
    -f "$DECRYPTED_FILE" > /dev/null 2>&1; then
    log_success "Backup restored to test database"
else
    log_error "Failed to restore backup to test database"
fi

# Test 11: Verify restored data
log "Test 11: Verify Restored Data"
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t \
    -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")
log "Tables restored: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
    log_success "Data restoration verified ($TABLE_COUNT tables)"
else
    log_error "No tables found in restored database"
fi

# Test 12: Verify test user in restored database
log "Test 12: Verify Test Data in Restored Database"
if [ "$TEST_DATA_CREATED" = true ]; then
    USER_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t \
        -c "SELECT COUNT(*) FROM users WHERE email = '${TEST_USER_EMAIL}';" 2>/dev/null || echo "0")
    if [ "$USER_EXISTS" -gt 0 ]; then
        log_success "Test data found in restored database"
    else
        log_error "Test data not found in restored database"
    fi
fi

# Test 13: Verify database constraints
log "Test 13: Verify Database Constraints"
CONSTRAINT_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t \
    -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = 'public';" 2>/dev/null || echo "0")
if [ "$CONSTRAINT_COUNT" -gt 0 ]; then
    log_success "Database constraints preserved ($CONSTRAINT_COUNT constraints)"
else
    log_warning "No constraints found in restored database"
fi

# Test 14: Verify database indexes
log "Test 14: Verify Database Indexes"
INDEX_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t \
    -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" 2>/dev/null || echo "0")
if [ "$INDEX_COUNT" -gt 0 ]; then
    log_success "Database indexes preserved ($INDEX_COUNT indexes)"
else
    log_warning "No indexes found in restored database"
fi

# Test 15: Measure restore time
log "Test 15: Measure Restore Performance"
START_TIME=$(date +%s)
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "${TEST_DB_NAME}_perf" --if-exists 2>/dev/null || true
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "${TEST_DB_NAME}_perf" 2>/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "${TEST_DB_NAME}_perf" \
    -f "$DECRYPTED_FILE" > /dev/null 2>&1
END_TIME=$(date +%s)
RESTORE_TIME=$((END_TIME - START_TIME))
log "Restore time: ${RESTORE_TIME} seconds"

if [ "$RESTORE_TIME" -lt 300 ]; then
    log_success "Restore completed within 5 minutes (${RESTORE_TIME}s)"
else
    log_warning "Restore took longer than 5 minutes (${RESTORE_TIME}s)"
fi

# Cleanup
log "Cleaning up test resources..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" --if-exists 2>/dev/null || true
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "${TEST_DB_NAME}_perf" --if-exists 2>/dev/null || true

if [ "$TEST_DATA_CREATED" = true ]; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "DELETE FROM users WHERE email = '${TEST_USER_EMAIL}';" > /dev/null 2>&1 || true
fi

# Summary
log ""
log "========================================"
log "Test Summary"
log "========================================"
log "Tests Passed: ${TESTS_PASSED}"
log "Tests Failed: ${TESTS_FAILED}"
log "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
log ""
log "Test results saved to: $TEST_RESULTS"

if [ "$TESTS_FAILED" -eq 0 ]; then
    log_success "All tests passed! Backup/restore system is operational."
    exit 0
else
    log_error "Some tests failed. Review the log for details."
    exit 1
fi
