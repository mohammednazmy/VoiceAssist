#!/bin/bash
# shellcheck disable=SC2002
# Verify Backup Integrity (Phase 12 - HA/DR)
# This script performs a test restore to verify backup can be restored successfully

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voiceassist}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
TEST_DB_NAME="voiceassist_backup_test"
DB_USER="${DB_USER:-voiceassist}"
PGPASSWORD="${POSTGRES_PASSWORD:-voiceassist_password}"
export PGPASSWORD

# Encryption configuration
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# Logging
LOG_FILE="${BACKUP_DIR}/verify.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting backup verification..."

# Find most recent backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "voiceassist_backup_*.sql.gpg" -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

if [ -z "$LATEST_BACKUP" ]; then
    log "ERROR: No backup files found in ${BACKUP_DIR}"
    exit 1
fi

log "Testing backup: $(basename "$LATEST_BACKUP")"

# Verify checksum
CHECKSUM_FILE="${LATEST_BACKUP}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    log "Verifying checksum..."
    if ! sha256sum -c "$CHECKSUM_FILE"; then
        log "ERROR: Checksum verification failed"
        exit 1
    fi
    log "✓ Checksum verified"
else
    log "WARNING: No checksum file found"
fi

# Decrypt backup to temporary file
log "Decrypting backup..."
DECRYPTED_FILE=$(mktemp /tmp/voiceassist_verify_XXXXXX.sql)

if [ -n "$ENCRYPTION_KEY" ]; then
    if ! gpg --decrypt \
             --passphrase "$ENCRYPTION_KEY" \
             --batch \
             --yes \
             --output "$DECRYPTED_FILE" \
             "$LATEST_BACKUP" 2>> "$LOG_FILE"; then
        log "ERROR: Decryption failed"
        rm -f "$DECRYPTED_FILE"
        exit 1
    fi
    log "✓ Backup decrypted successfully"
else
    log "ERROR: No encryption key provided (BACKUP_ENCRYPTION_KEY not set)"
    rm -f "$DECRYPTED_FILE"
    exit 1
fi

# Drop test database if it exists
log "Preparing test database..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" --if-exists 2>> "$LOG_FILE" || true

# Create test database
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME"
log "✓ Test database created"

# Restore to test database
log "Restoring backup to test database..."
if ! psql -h "$DB_HOST" \
          -p "$DB_PORT" \
          -U "$DB_USER" \
          -d "$TEST_DB_NAME" \
          -f "$DECRYPTED_FILE" \
          2>&1 | tee -a "$LOG_FILE" | grep -q "ERROR"; then
    log "✓ Backup restored successfully to test database"
else
    log "ERROR: Restore to test database failed"
    rm -f "$DECRYPTED_FILE"
    dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" --if-exists
    exit 1
fi

# Verify restored data
log "Verifying restored data..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
log "Tables restored: ${TABLE_COUNT}"

USER_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
log "User records: ${USER_COUNT}"

# Cleanup
rm -f "$DECRYPTED_FILE"
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" --if-exists
log "✓ Test database cleaned up"

# Read backup metadata
METADATA_FILE="${LATEST_BACKUP}.metadata"
if [ -f "$METADATA_FILE" ]; then
    log "Backup metadata:"
    cat "$METADATA_FILE" | tee -a "$LOG_FILE"
fi

log "✓ Backup verification completed successfully"
log "Backup is valid and can be restored"
log "----------------------------------------"
exit 0
