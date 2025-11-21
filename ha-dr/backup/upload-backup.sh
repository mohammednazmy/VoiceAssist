#!/bin/bash
# Upload Encrypted Backups to Off-Site Storage (Phase 12 - HA/DR)
# Supports AWS S3, Nextcloud WebDAV, and local directory

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voiceassist}"
STORAGE_TYPE="${BACKUP_STORAGE_TYPE:-s3}"  # s3, nextcloud, local
LOG_FILE="${BACKUP_DIR}/upload.log"

# S3 Configuration
S3_BUCKET="${S3_BUCKET:-}"
S3_REGION="${S3_REGION:-us-east-1}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"

# Nextcloud Configuration
NEXTCLOUD_URL="${NEXTCLOUD_URL:-http://nextcloud:8080}"
NEXTCLOUD_USER="${NEXTCLOUD_USER:-admin}"
NEXTCLOUD_PASSWORD="${NEXTCLOUD_PASSWORD:-}"
NEXTCLOUD_PATH="${NEXTCLOUD_PATH:-/backups/voiceassist}"

# Local Configuration (for testing or NFS mounts)
LOCAL_BACKUP_PATH="${LOCAL_BACKUP_PATH:-/mnt/backups/voiceassist}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

upload_to_s3() {
    local file="$1"
    local filename=$(basename "$file")

    log "Uploading to S3: s3://${S3_BUCKET}/${filename}"

    if command -v aws &> /dev/null; then
        # Use AWS CLI
        if ! aws s3 cp "$file" "s3://${S3_BUCKET}/${filename}" \
            --region "$S3_REGION" \
            --storage-class STANDARD_IA; then
            log "ERROR: S3 upload failed using AWS CLI"
            return 1
        fi
    elif command -v s3cmd &> /dev/null; then
        # Use s3cmd as fallback
        if ! s3cmd put "$file" "s3://${S3_BUCKET}/${filename}"; then
            log "ERROR: S3 upload failed using s3cmd"
            return 1
        fi
    else
        log "ERROR: Neither aws-cli nor s3cmd found. Cannot upload to S3."
        return 1
    fi

    log "Successfully uploaded to S3"
    return 0
}

upload_to_nextcloud() {
    local file="$1"
    local filename=$(basename "$file")
    local webdav_url="${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${NEXTCLOUD_PATH}/${filename}"

    log "Uploading to Nextcloud: ${NEXTCLOUD_PATH}/${filename}"

    # Create directory if it doesn't exist
    curl -s -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}" \
         -X MKCOL \
         "${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${NEXTCLOUD_PATH}" \
         || true

    # Upload file
    if ! curl -u "${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}" \
              -T "$file" \
              "$webdav_url"; then
        log "ERROR: Nextcloud upload failed"
        return 1
    fi

    log "Successfully uploaded to Nextcloud"
    return 0
}

upload_to_local() {
    local file="$1"
    local filename=$(basename "$file")

    log "Copying to local path: ${LOCAL_BACKUP_PATH}/${filename}"

    # Create directory if it doesn't exist
    mkdir -p "$LOCAL_BACKUP_PATH"

    # Copy file
    if ! cp "$file" "${LOCAL_BACKUP_PATH}/${filename}"; then
        log "ERROR: Local copy failed"
        return 1
    fi

    log "Successfully copied to local path"
    return 0
}

# Main upload logic
log "Starting backup upload..."
log "Storage type: ${STORAGE_TYPE}"

# Find most recent backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "voiceassist_backup_*.sql.gpg" -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

if [ -z "$LATEST_BACKUP" ]; then
    log "ERROR: No backup files found in ${BACKUP_DIR}"
    exit 1
fi

log "Latest backup: $(basename "$LATEST_BACKUP")"

# Upload backup based on storage type
case "$STORAGE_TYPE" in
    s3)
        upload_to_s3 "$LATEST_BACKUP"
        # Also upload checksum and metadata
        upload_to_s3 "${LATEST_BACKUP}.sha256" || true
        upload_to_s3 "${LATEST_BACKUP}.metadata" || true
        ;;
    nextcloud)
        upload_to_nextcloud "$LATEST_BACKUP"
        # Also upload checksum and metadata
        upload_to_nextcloud "${LATEST_BACKUP}.sha256" || true
        upload_to_nextcloud "${LATEST_BACKUP}.metadata" || true
        ;;
    local)
        upload_to_local "$LATEST_BACKUP"
        # Also copy checksum and metadata
        upload_to_local "${LATEST_BACKUP}.sha256" || true
        upload_to_local "${LATEST_BACKUP}.metadata" || true
        ;;
    *)
        log "ERROR: Unknown storage type: ${STORAGE_TYPE}"
        log "Supported types: s3, nextcloud, local"
        exit 1
        ;;
esac

log "Backup upload completed successfully"
log "----------------------------------------"
exit 0
