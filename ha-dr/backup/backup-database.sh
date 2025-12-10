#!/bin/bash
# shellcheck disable=SC2086,SC2015
# Automated PostgreSQL Backup with Encryption (Phase 12 - HA/DR)
# This script performs encrypted backups of the PostgreSQL database

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
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"

# Retention configuration
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="voiceassist_backup_${TIMESTAMP}.sql"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"

# Logging
LOG_FILE="${BACKUP_DIR}/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting database backup..."
log "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

# Perform database backup using pg_dump
log "Creating SQL dump..."
if ! pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -F plain \
    --no-owner \
    --no-acl \
    -f "${BACKUP_DIR}/${BACKUP_FILE}"; then
    log "ERROR: Database backup failed"
    exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Encrypt backup
log "Encrypting backup..."
if [ -n "$GPG_RECIPIENT" ]; then
    # Use GPG encryption with public key
    if ! gpg --recipient "$GPG_RECIPIENT" \
             --encrypt \
             --trust-model always \
             --output "${BACKUP_DIR}/${ENCRYPTED_FILE}" \
             "${BACKUP_DIR}/${BACKUP_FILE}"; then
        log "ERROR: GPG encryption failed"
        exit 1
    fi
    log "Backup encrypted using GPG (recipient: ${GPG_RECIPIENT})"
elif [ -n "$ENCRYPTION_KEY" ]; then
    # Use symmetric encryption with password
    if ! gpg --symmetric \
             --cipher-algo AES256 \
             --passphrase "$ENCRYPTION_KEY" \
             --batch \
             --yes \
             --output "${BACKUP_DIR}/${ENCRYPTED_FILE}" \
             "${BACKUP_DIR}/${BACKUP_FILE}"; then
        log "ERROR: Symmetric encryption failed"
        exit 1
    fi
    log "Backup encrypted using AES256"
else
    log "WARNING: No encryption configured. Backup is not encrypted."
    ENCRYPTED_FILE="$BACKUP_FILE"
fi

# Remove unencrypted backup
if [ "$ENCRYPTED_FILE" != "$BACKUP_FILE" ]; then
    rm "${BACKUP_DIR}/${BACKUP_FILE}"
    log "Unencrypted backup removed"
fi

ENCRYPTED_SIZE=$(du -h "${BACKUP_DIR}/${ENCRYPTED_FILE}" | cut -f1)
log "Encrypted backup: ${ENCRYPTED_FILE} (${ENCRYPTED_SIZE})"

# Calculate checksum
CHECKSUM=$(sha256sum "${BACKUP_DIR}/${ENCRYPTED_FILE}" | cut -d' ' -f1)
echo "$CHECKSUM  ${ENCRYPTED_FILE}" > "${BACKUP_DIR}/${ENCRYPTED_FILE}.sha256"
log "Checksum: ${CHECKSUM}"

# Cleanup old backups
log "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "voiceassist_backup_*.sql.gpg" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "voiceassist_backup_*.sql.gpg.sha256" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "voiceassist_backup_*.sql" -mtime +${RETENTION_DAYS} -delete

# Count remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "voiceassist_backup_*.sql.gpg" | wc -l)
log "Backup retention: ${BACKUP_COUNT} backups (${RETENTION_DAYS} days)"

# Create backup metadata
cat > "${BACKUP_DIR}/${ENCRYPTED_FILE}.metadata" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "database": "${DB_NAME}",
  "host": "${DB_HOST}",
  "port": ${DB_PORT},
  "backup_file": "${ENCRYPTED_FILE}",
  "backup_size": "${ENCRYPTED_SIZE}",
  "checksum": "${CHECKSUM}",
  "encryption": "$([ -n "$GPG_RECIPIENT" ] && echo "GPG" || ([ -n "$ENCRYPTION_KEY" ] && echo "AES256" || echo "none"))",
  "retention_days": ${RETENTION_DAYS}
}
EOF

log "Backup completed successfully: ${ENCRYPTED_FILE}"
log "----------------------------------------"

# Exit successfully
exit 0
