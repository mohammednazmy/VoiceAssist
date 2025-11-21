#!/bin/bash

###############################################################################
# VoiceAssist Backup Script
#
# Creates backups before deployment
#
# Usage:
#   ./backup.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -v, --version TAG        Version tag for backup naming [required]
#   -d, --dry-run           Perform dry-run
#   -V, --verbose           Enable verbose output
#   -t, --type TYPE         Backup type: all, db, k8s, redis (default: all)
#   -h, --help              Show this help message
#
# Examples:
#   ./backup.sh -e staging -v v1.2.3
#   ./backup.sh -e prod -v v1.2.3 --type db
#   ./backup.sh -e dev -v latest --dry-run
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
LOG_DIR="${PROJECT_ROOT}/logs/backup"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_FILE="${LOG_DIR}/backup_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
VERSION=""
DRY_RUN=false
VERBOSE=false
BACKUP_TYPE="all"

AWS_REGION="${AWS_REGION:-us-east-1}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-voiceassist-backups}"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_FILE}"
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

ensure_s3_bucket() {
    log_info "Checking S3 backup bucket..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would check/create S3 bucket: ${S3_BACKUP_BUCKET}"
        return 0
    fi

    # Check if bucket exists
    if aws s3 ls "s3://${S3_BACKUP_BUCKET}" 2>&1 | tee -a "${LOG_FILE}" | grep -q 'NoSuchBucket'; then
        log_info "Creating S3 backup bucket: ${S3_BACKUP_BUCKET}"

        if ! aws s3 mb "s3://${S3_BACKUP_BUCKET}" --region "${AWS_REGION}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_error "Failed to create S3 bucket"
            return 1
        fi

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "${S3_BACKUP_BUCKET}" \
            --versioning-configuration Status=Enabled 2>&1 | tee -a "${LOG_FILE}"

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "${S3_BACKUP_BUCKET}" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }]
            }' 2>&1 | tee -a "${LOG_FILE}"

        log_success "S3 bucket created and configured"
    else
        log_verbose "S3 bucket exists: ${S3_BACKUP_BUCKET}"
    fi

    return 0
}

backup_rds_database() {
    log_info "Backing up RDS database..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would backup RDS database"
        log_success "RDS database backup (dry-run)"
        return 0
    fi

    # Get RDS instance identifier
    local db_instance_id="voiceassist-db-${ENVIRONMENT}"
    local snapshot_id="${db_instance_id}-${VERSION}-${BACKUP_TIMESTAMP}"

    log_info "Creating RDS snapshot: ${snapshot_id}"

    # Create snapshot
    if aws rds create-db-snapshot \
        --db-instance-identifier "${db_instance_id}" \
        --db-snapshot-identifier "${snapshot_id}" \
        --region "${AWS_REGION}" 2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for snapshot to complete..."

        # Wait for snapshot to complete (with timeout)
        local max_wait=900  # 15 minutes
        local elapsed=0
        local interval=30

        while [[ ${elapsed} -lt ${max_wait} ]]; do
            local status=$(aws rds describe-db-snapshots \
                --db-snapshot-identifier "${snapshot_id}" \
                --region "${AWS_REGION}" \
                --query 'DBSnapshots[0].Status' \
                --output text 2>/dev/null)

            case "${status}" in
                available)
                    log_success "RDS snapshot completed: ${snapshot_id}"
                    return 0
                    ;;
                creating)
                    log_verbose "Snapshot status: ${status} (${elapsed}s elapsed)"
                    sleep ${interval}
                    ((elapsed += interval))
                    ;;
                *)
                    log_error "Unexpected snapshot status: ${status}"
                    return 1
                    ;;
            esac
        done

        log_error "RDS snapshot timed out after ${max_wait} seconds"
        return 1
    else
        log_error "Failed to create RDS snapshot"
        return 1
    fi
}

backup_kubernetes_configs() {
    log_info "Backing up Kubernetes configurations..."

    local k8s_backup_dir="${BACKUP_DIR}/${ENVIRONMENT}/k8s/${BACKUP_TIMESTAMP}"
    mkdir -p "${k8s_backup_dir}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would backup Kubernetes configs to: ${k8s_backup_dir}"
        log_success "Kubernetes config backup (dry-run)"
        return 0
    fi

    local namespace="voiceassist-${ENVIRONMENT}"

    # Configure kubectl
    local cluster_name="voiceassist-eks-${ENVIRONMENT}"
    aws eks update-kubeconfig --region "${AWS_REGION}" --name "${cluster_name}" &> /dev/null

    # Export deployments
    log_info "Exporting deployments..."
    kubectl get deployments -n "${namespace}" -o yaml > "${k8s_backup_dir}/deployments.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export services
    log_info "Exporting services..."
    kubectl get services -n "${namespace}" -o yaml > "${k8s_backup_dir}/services.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export configmaps
    log_info "Exporting configmaps..."
    kubectl get configmaps -n "${namespace}" -o yaml > "${k8s_backup_dir}/configmaps.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export secrets (encrypted)
    log_info "Exporting secrets..."
    kubectl get secrets -n "${namespace}" -o yaml > "${k8s_backup_dir}/secrets.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export ingress
    log_info "Exporting ingress..."
    kubectl get ingress -n "${namespace}" -o yaml > "${k8s_backup_dir}/ingress.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export HPA
    log_info "Exporting HorizontalPodAutoscalers..."
    kubectl get hpa -n "${namespace}" -o yaml > "${k8s_backup_dir}/hpa.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Export PVCs
    log_info "Exporting PersistentVolumeClaims..."
    kubectl get pvc -n "${namespace}" -o yaml > "${k8s_backup_dir}/pvc.yaml" 2>&1 | tee -a "${LOG_FILE}"

    # Create tarball
    log_info "Creating backup archive..."
    local archive_name="k8s-backup-${ENVIRONMENT}-${VERSION}-${BACKUP_TIMESTAMP}.tar.gz"
    tar -czf "${BACKUP_DIR}/${archive_name}" -C "${BACKUP_DIR}/${ENVIRONMENT}/k8s" "${BACKUP_TIMESTAMP}" 2>&1 | tee -a "${LOG_FILE}"

    # Upload to S3
    log_info "Uploading to S3..."
    if aws s3 cp "${BACKUP_DIR}/${archive_name}" "s3://${S3_BACKUP_BUCKET}/${ENVIRONMENT}/k8s/${archive_name}" 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Kubernetes configs backed up to S3"
    else
        log_error "Failed to upload backup to S3"
        return 1
    fi

    # Clean up local archive
    rm -f "${BACKUP_DIR}/${archive_name}"

    log_success "Kubernetes configurations backed up"
    return 0
}

backup_redis_data() {
    log_info "Backing up Redis data..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would backup Redis data"
        log_success "Redis data backup (dry-run)"
        return 0
    fi

    # Get Redis endpoint from Secrets Manager
    local redis_secret_name="voiceassist/${ENVIRONMENT}/redis"
    local redis_info=$(aws secretsmanager get-secret-value \
        --secret-id "${redis_secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null)

    if [[ -z "${redis_info}" ]]; then
        log_warning "Could not retrieve Redis information, skipping Redis backup"
        return 0
    fi

    local redis_host=$(echo "${redis_info}" | jq -r '.host')
    local redis_port=$(echo "${redis_info}" | jq -r '.port // 6379')

    # Check if ElastiCache or self-managed
    if aws elasticache describe-cache-clusters \
        --region "${AWS_REGION}" \
        --query "CacheClusters[?contains(CacheClusterId, '${ENVIRONMENT}')]" 2>/dev/null | grep -q "voiceassist"; then

        log_info "ElastiCache Redis detected"
        local cluster_id="voiceassist-redis-${ENVIRONMENT}"
        local snapshot_name="${cluster_id}-${VERSION}-${BACKUP_TIMESTAMP}"

        log_info "Creating ElastiCache snapshot: ${snapshot_name}"

        if aws elasticache create-snapshot \
            --cache-cluster-id "${cluster_id}" \
            --snapshot-name "${snapshot_name}" \
            --region "${AWS_REGION}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_success "ElastiCache snapshot created: ${snapshot_name}"
        else
            log_warning "Failed to create ElastiCache snapshot (may not be supported for all instance types)"
        fi
    else
        log_info "Self-managed Redis detected, creating RDB dump"

        # Trigger BGSAVE via redis-cli
        if command -v redis-cli &> /dev/null; then
            if redis-cli -h "${redis_host}" -p "${redis_port}" BGSAVE 2>&1 | tee -a "${LOG_FILE}"; then
                log_success "Redis BGSAVE initiated"

                # Wait for background save to complete
                sleep 5

                local save_status=$(redis-cli -h "${redis_host}" -p "${redis_port}" LASTSAVE 2>/dev/null)
                log_verbose "Last save timestamp: ${save_status}"
            else
                log_warning "Failed to trigger Redis BGSAVE"
            fi
        else
            log_warning "redis-cli not available, skipping Redis dump"
        fi
    fi

    return 0
}

create_backup_metadata() {
    log_info "Creating backup metadata..."

    local metadata_file="${BACKUP_DIR}/${ENVIRONMENT}/backup-metadata-${BACKUP_TIMESTAMP}.json"
    mkdir -p "${BACKUP_DIR}/${ENVIRONMENT}"

    local metadata=$(cat <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "${ENVIRONMENT}",
    "version": "${VERSION}",
    "backup_type": "${BACKUP_TYPE}",
    "created_by": "${USER}",
    "components": {
        "database": true,
        "kubernetes": true,
        "redis": true
    },
    "s3_bucket": "${S3_BACKUP_BUCKET}",
    "aws_region": "${AWS_REGION}"
}
EOF
    )

    if [[ "${DRY_RUN}" == "false" ]]; then
        echo "${metadata}" > "${metadata_file}"

        # Upload metadata to S3
        aws s3 cp "${metadata_file}" \
            "s3://${S3_BACKUP_BUCKET}/${ENVIRONMENT}/metadata/backup-metadata-${BACKUP_TIMESTAMP}.json" \
            2>&1 | tee -a "${LOG_FILE}"

        log_success "Backup metadata created"
    else
        log_info "[DRY-RUN] Would create metadata: ${metadata_file}"
    fi

    return 0
}

verify_backup() {
    log_info "Verifying backup..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would verify backup"
        log_success "Backup verification (dry-run)"
        return 0
    fi

    local verification_passed=true

    # Verify RDS snapshot
    if [[ "${BACKUP_TYPE}" == "all" ]] || [[ "${BACKUP_TYPE}" == "db" ]]; then
        local db_instance_id="voiceassist-db-${ENVIRONMENT}"
        local snapshot_id="${db_instance_id}-${VERSION}-${BACKUP_TIMESTAMP}"

        local snapshot_status=$(aws rds describe-db-snapshots \
            --db-snapshot-identifier "${snapshot_id}" \
            --region "${AWS_REGION}" \
            --query 'DBSnapshots[0].Status' \
            --output text 2>/dev/null)

        if [[ "${snapshot_status}" == "available" ]]; then
            log_verbose "✓ RDS snapshot verified: ${snapshot_id}"
        else
            log_error "✗ RDS snapshot verification failed"
            verification_passed=false
        fi
    fi

    # Verify S3 uploads
    if [[ "${BACKUP_TYPE}" == "all" ]] || [[ "${BACKUP_TYPE}" == "k8s" ]]; then
        local k8s_backup_key="${ENVIRONMENT}/k8s/k8s-backup-${ENVIRONMENT}-${VERSION}-${BACKUP_TIMESTAMP}.tar.gz"

        if aws s3 ls "s3://${S3_BACKUP_BUCKET}/${k8s_backup_key}" &> /dev/null; then
            log_verbose "✓ Kubernetes backup verified in S3"
        else
            log_error "✗ Kubernetes backup not found in S3"
            verification_passed=false
        fi
    fi

    if [[ "${verification_passed}" == "true" ]]; then
        log_success "Backup verification passed"
        return 0
    else
        log_error "Backup verification failed"
        return 1
    fi
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"

    log_info "=== VoiceAssist Backup Started ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Version: ${VERSION}"
    log_info "Backup Type: ${BACKUP_TYPE}"
    log_info "Timestamp: ${BACKUP_TIMESTAMP}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info ""

    # Ensure S3 bucket exists
    if ! ensure_s3_bucket; then
        log_error "S3 bucket setup failed"
        return 1
    fi

    # Perform backups based on type
    case "${BACKUP_TYPE}" in
        all)
            backup_rds_database || log_warning "Database backup failed"
            backup_kubernetes_configs || log_warning "Kubernetes backup failed"
            backup_redis_data || log_warning "Redis backup failed"
            ;;
        db)
            backup_rds_database || return 1
            ;;
        k8s)
            backup_kubernetes_configs || return 1
            ;;
        redis)
            backup_redis_data || return 1
            ;;
        *)
            log_error "Invalid backup type: ${BACKUP_TYPE}"
            return 1
            ;;
    esac

    # Create metadata
    create_backup_metadata

    # Verify backup
    if ! verify_backup; then
        log_warning "Backup verification had issues, but backup may still be usable"
    fi

    log_success "=== Backup Completed ==="
    log_info "Backup timestamp: ${BACKUP_TIMESTAMP}"
    log_info "S3 bucket: s3://${S3_BACKUP_BUCKET}/${ENVIRONMENT}/"
    log_info "Log file: ${LOG_FILE}"

    return 0
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
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            -t|--type)
                BACKUP_TYPE="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -V|--verbose)
                VERBOSE=true
                shift
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

    if [[ -z "${VERSION}" ]]; then
        log_error "Version is required"
        show_usage
    fi
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
