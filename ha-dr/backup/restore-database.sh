#!/bin/bash
# Restore PostgreSQL Database from Encrypted Backup (Phase 12 - HA/DR)

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voiceassist}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-voiceassist}"
DB_USER="${DB_USER:-voiceassist}"
PGPASSWORD="${POSTGRES_PASSWORD:-voiceassist_password}"
export PGPASSWORD

# Encryption configuration
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# Logging
LOG_FILE="${BACKUP_DIR}/restore.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

usage() {
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Restore PostgreSQL database from encrypted backup"
    echo ""
    echo "Arguments:"
    echo "  backup-file    Path to encrypted backup file (.sql.gpg)"
    echo ""
    echo "Environment Variables:"
    echo "  DB_HOST               Database host (default: localhost)"
    echo "  DB_PORT               Database port (default: 5432)"
    echo "  DB_NAME               Database name (default: voiceassist)"
    echo "  DB_USER               Database user (default: voiceassist)"
    echo "  POSTGRES_PASSWORD     Database password"
    echo "  BACKUP_ENCRYPTION_KEY Encryption passphrase"
    echo "  BACKUP_DIR            Backup directory (default: /var/backups/voiceassist)"
    echo ""
    echo "Examples:"
    echo "  $0 voiceassist_backup_20250121_120000.sql.gpg"
    echo "  $0 /path/to/backup.sql.gpg"
    exit 1
}

# Check arguments
if [ $# -eq 0 ]; then
    usage
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    # Try looking in backup directory
    if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    else
        log "ERROR: Backup file not found: ${BACKUP_FILE}"
        exit 1
    fi
fi

log "Starting database restore..."
log "Backup file: ${BACKUP_FILE}"
log "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    log "Verifying backup checksum..."
    if ! sha256sum -c "$CHECKSUM_FILE"; then
        log "ERROR: Checksum verification failed. Backup may be corrupted."
        exit 1
    fi
    log "Checksum verified successfully"
else
    log "WARNING: No checksum file found. Cannot verify backup integrity."
fi

# Decrypt backup
log "Decrypting backup..."
DECRYPTED_FILE=$(mktemp /tmp/voiceassist_restore_XXXXXX.sql)

if [[ "$BACKUP_FILE" == *.gpg ]]; then
    if [ -n "$ENCRYPTION_KEY" ]; then
        # Use symmetric decryption
        if ! gpg --decrypt \
                 --passphrase "$ENCRYPTION_KEY" \
                 --batch \
                 --yes \
                 --output "$DECRYPTED_FILE" \
                 "$BACKUP_FILE"; then
            log "ERROR: Decryption failed"
            rm -f "$DECRYPTED_FILE"
            exit 1
        fi
        log "Backup decrypted successfully"
    else
        # Try GPG with default key
        if ! gpg --decrypt \
                 --output "$DECRYPTED_FILE" \
                 "$BACKUP_FILE"; then
            log "ERROR: Decryption failed (no encryption key provided)"
            rm -f "$DECRYPTED_FILE"
            exit 1
        fi
        log "Backup decrypted using GPG key"
    fi
else
    # Unencrypted backup
    log "WARNING: Backup is not encrypted"
    cp "$BACKUP_FILE" "$DECRYPTED_FILE"
fi

# Confirmation prompt
log "WARNING: This will DROP and recreate the database: ${DB_NAME}"
log "All existing data will be LOST!"
echo -n "Do you want to continue? (yes/no): "
read -r CONFIRMATION

if [ "$CONFIRMATION" != "yes" ]; then
    log "Restore cancelled by user"
    rm -f "$DECRYPTED_FILE"
    exit 0
fi

# Drop existing database connections
log "Terminating existing connections..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
EOF

# Drop and recreate database
log "Dropping existing database..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" --if-exists

log "Creating new database..."
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

# Restore database
log "Restoring database from backup..."
if ! psql -h "$DB_HOST" \
          -p "$DB_PORT" \
          -U "$DB_USER" \
          -d "$DB_NAME" \
          -f "$DECRYPTED_FILE" \
          2>&1 | tee -a "$LOG_FILE"; then
    log "ERROR: Database restore failed"
    rm -f "$DECRYPTED_FILE"
    exit 1
fi

# Clean up
rm -f "$DECRYPTED_FILE"
log "Temporary file cleaned up"

# Verify restore
log "Verifying restore..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
log "Tables restored: ${TABLE_COUNT}"

log "Database restore completed successfully"
log "----------------------------------------"
exit 0
