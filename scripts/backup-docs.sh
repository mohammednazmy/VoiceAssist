#!/bin/bash
#
# VoiceAssist Documentation Backup Script
#
# Creates timestamped backups of:
# - Auto-generated documentation (feature flags, agent JSON)
# - Critical configuration files
# - Documentation source files
#
# Usage:
#   ./scripts/backup-docs.sh                 # Create backup
#   ./scripts/backup-docs.sh --restore DATE  # Restore from DATE backup
#   ./scripts/backup-docs.sh --list          # List available backups
#   ./scripts/backup-docs.sh --cleanup       # Remove backups older than 30 days
#
# Configuration (via environment variables):
#   BACKUP_DIR     - Base backup directory (default: /var/backups/voiceassist-docs)
#   RETENTION_DAYS - Days to keep backups (default: 30)
#

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voiceassist-docs}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show usage
usage() {
    cat << EOF
VoiceAssist Documentation Backup Script

Usage:
  $0                      Create a new backup
  $0 --restore DATE       Restore from backup (DATE format: YYYYMMDD)
  $0 --list               List available backups
  $0 --cleanup            Remove backups older than $RETENTION_DAYS days
  $0 --help               Show this help message

Environment Variables:
  BACKUP_DIR              Backup directory (default: $BACKUP_DIR)
  RETENTION_DAYS          Days to keep backups (default: $RETENTION_DAYS)

Examples:
  $0                      # Create backup
  $0 --restore 20251204   # Restore from Dec 4, 2025 backup
  $0 --list               # List all backups
EOF
}

# Create backup
create_backup() {
    log_info "Creating documentation backup..."
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Project root: $PROJECT_ROOT"

    # Create backup directory structure
    BACKUP_PATH="$BACKUP_DIR/$DATE"
    mkdir -p "$BACKUP_PATH/generated"
    mkdir -p "$BACKUP_PATH/agent"
    mkdir -p "$BACKUP_PATH/feature-flags"
    mkdir -p "$BACKUP_PATH/docs-source"

    # Backup auto-generated feature flag docs
    if [ -f "$PROJECT_ROOT/apps/docs-site/src/pages/reference/feature-flags.mdx" ]; then
        cp "$PROJECT_ROOT/apps/docs-site/src/pages/reference/feature-flags.mdx" \
           "$BACKUP_PATH/generated/"
        log_info "Backed up feature-flags.mdx"
    fi

    # Backup agent JSON files
    if [ -d "$PROJECT_ROOT/apps/docs-site/public/agent" ]; then
        cp -r "$PROJECT_ROOT/apps/docs-site/public/agent/"*.json \
              "$BACKUP_PATH/agent/" 2>/dev/null || true
        log_info "Backed up agent JSON files"
    fi

    # Backup feature flag TypeScript definitions
    if [ -f "$PROJECT_ROOT/packages/types/src/featureFlags.ts" ]; then
        cp "$PROJECT_ROOT/packages/types/src/featureFlags.ts" \
           "$BACKUP_PATH/feature-flags/"
        log_info "Backed up featureFlags.ts"
    fi

    # Backup feature flag documentation
    if [ -d "$PROJECT_ROOT/docs/admin-guide/feature-flags" ]; then
        cp -r "$PROJECT_ROOT/docs/admin-guide/feature-flags/"* \
              "$BACKUP_PATH/feature-flags/" 2>/dev/null || true
        log_info "Backed up feature flag documentation"
    fi

    # Backup critical source docs
    CRITICAL_DOCS=(
        "docs/STYLE_GUIDE.md"
        "docs/overview/IMPLEMENTATION_STATUS.md"
        ".github/workflows/docs-validation.yml"
        ".github/workflows/sync-flag-docs.yml"
    )

    for doc in "${CRITICAL_DOCS[@]}"; do
        if [ -f "$PROJECT_ROOT/$doc" ]; then
            # Preserve directory structure
            DOC_DIR=$(dirname "$doc")
            mkdir -p "$BACKUP_PATH/docs-source/$DOC_DIR"
            cp "$PROJECT_ROOT/$doc" "$BACKUP_PATH/docs-source/$doc"
        fi
    done
    log_info "Backed up critical source documents"

    # Create compressed archive
    ARCHIVE="$BACKUP_DIR/docs-backup-$TIMESTAMP.tar.gz"
    tar -czvf "$ARCHIVE" -C "$BACKUP_DIR" "$DATE" > /dev/null 2>&1
    log_info "Created archive: $ARCHIVE"

    # Calculate sizes
    ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
    log_info "Backup complete! Archive size: $ARCHIVE_SIZE"

    # Cleanup daily directory (keep only archive)
    rm -rf "$BACKUP_PATH"

    echo ""
    log_info "Backup saved to: $ARCHIVE"
}

# List backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"
    echo ""

    if [ ! -d "$BACKUP_DIR" ]; then
        log_warn "Backup directory does not exist"
        return
    fi

    ls -lht "$BACKUP_DIR"/docs-backup-*.tar.gz 2>/dev/null | head -20 || \
        log_warn "No backups found"
}

# Restore from backup
restore_backup() {
    local RESTORE_DATE="$1"

    if [ -z "$RESTORE_DATE" ]; then
        log_error "Please specify a date (YYYYMMDD)"
        exit 1
    fi

    # Find matching backup
    BACKUP_FILE=$(ls "$BACKUP_DIR"/docs-backup-${RESTORE_DATE}*.tar.gz 2>/dev/null | head -1)

    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        log_error "No backup found for date: $RESTORE_DATE"
        log_info "Available backups:"
        list_backups
        exit 1
    fi

    log_info "Restoring from: $BACKUP_FILE"

    # Create temp directory for extraction
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

    # Find extracted directory
    EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "20*" | head -1)

    if [ -z "$EXTRACTED_DIR" ]; then
        log_error "Could not find extracted backup directory"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Restore files
    log_info "Restoring files..."

    # Restore agent JSON
    if [ -d "$EXTRACTED_DIR/agent" ]; then
        mkdir -p "$PROJECT_ROOT/apps/docs-site/public/agent"
        cp "$EXTRACTED_DIR/agent/"*.json \
           "$PROJECT_ROOT/apps/docs-site/public/agent/" 2>/dev/null || true
        log_info "Restored agent JSON files"
    fi

    # Restore feature flag docs
    if [ -d "$EXTRACTED_DIR/feature-flags" ]; then
        mkdir -p "$PROJECT_ROOT/docs/admin-guide/feature-flags"
        cp -r "$EXTRACTED_DIR/feature-flags/"* \
              "$PROJECT_ROOT/docs/admin-guide/feature-flags/" 2>/dev/null || true
        log_info "Restored feature flag documentation"
    fi

    # Cleanup
    rm -rf "$TEMP_DIR"

    log_info "Restore complete!"
    log_warn "Review changes and commit if appropriate"
}

# Cleanup old backups
cleanup_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    if [ ! -d "$BACKUP_DIR" ]; then
        log_warn "Backup directory does not exist"
        return
    fi

    # Find and remove old backups
    DELETED=$(find "$BACKUP_DIR" -name "docs-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete -print)

    if [ -n "$DELETED" ]; then
        echo "$DELETED" | while read file; do
            log_info "Deleted: $file"
        done
    else
        log_info "No old backups to clean up"
    fi
}

# Main
case "${1:-}" in
    --help|-h)
        usage
        ;;
    --list|-l)
        list_backups
        ;;
    --restore|-r)
        restore_backup "$2"
        ;;
    --cleanup|-c)
        cleanup_backups
        ;;
    "")
        create_backup
        ;;
    *)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
esac
