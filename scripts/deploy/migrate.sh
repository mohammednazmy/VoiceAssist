#!/bin/bash

###############################################################################
# VoiceAssist Database Migration Script
#
# Runs Alembic database migrations
#
# Usage:
#   ./migrate.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -D, --direction DIR      Migration direction: up, down (default: up)
#   -s, --steps N           Number of migration steps (default: all for up, 1 for down)
#   -d, --dry-run           Perform dry-run (show migrations without applying)
#   -V, --verbose           Enable verbose output
#   -b, --backup            Create backup before migration
#   -h, --help              Show this help message
#
# Examples:
#   ./migrate.sh -e staging -D up
#   ./migrate.sh -e prod -D up --backup
#   ./migrate.sh -e dev -D down --steps 1
#   ./migrate.sh -e staging -D up --dry-run
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
LOG_DIR="${PROJECT_ROOT}/logs/migration"
LOG_FILE="${LOG_DIR}/migration_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
DIRECTION="up"
STEPS=""
DRY_RUN=false
VERBOSE=false
CREATE_BACKUP=false

AWS_REGION="${AWS_REGION:-us-east-1}"

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

get_database_credentials() {
    log_info "Retrieving database credentials..."

    local secret_name="voiceassist/${ENVIRONMENT}/database"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would retrieve credentials from: ${secret_name}"
        export DATABASE_URL="postgresql://user:pass@localhost:5432/voiceassist"
        return 0
    fi

    local secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "${secret_name}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null)

    if [[ -z "${secret_value}" ]]; then
        log_error "Failed to retrieve database credentials"
        return 1
    fi

    local db_host=$(echo "${secret_value}" | jq -r '.host')
    local db_port=$(echo "${secret_value}" | jq -r '.port // 5432')
    local db_name=$(echo "${secret_value}" | jq -r '.database')
    local db_user=$(echo "${secret_value}" | jq -r '.username')
    local db_pass=$(echo "${secret_value}" | jq -r '.password')

    export DATABASE_URL="postgresql://${db_user}:${db_pass}@${db_host}:${db_port}/${db_name}"

    log_verbose "Database URL configured (password hidden)"
    return 0
}

check_alembic_setup() {
    log_info "Checking Alembic setup..."

    local alembic_dir="${PROJECT_ROOT}/alembic"
    local alembic_ini="${PROJECT_ROOT}/alembic.ini"

    if [[ ! -d "${alembic_dir}" ]]; then
        log_error "Alembic directory not found: ${alembic_dir}"
        return 1
    fi

    if [[ ! -f "${alembic_ini}" ]]; then
        log_error "Alembic configuration not found: ${alembic_ini}"
        return 1
    fi

    log_success "Alembic setup verified"
    return 0
}

get_current_revision() {
    log_info "Getting current database revision..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would get current revision"
        echo "abc123"
        return 0
    fi

    cd "${PROJECT_ROOT}" || return 1

    local current_rev=$(alembic current 2>/dev/null | grep -oP '^\w+' | head -1)

    if [[ -z "${current_rev}" ]]; then
        log_warning "No current revision found (database may be empty)"
        echo "none"
        return 0
    fi

    echo "${current_rev}"
    return 0
}

show_pending_migrations() {
    log_info "Checking for pending migrations..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would show pending migrations"
        return 0
    fi

    cd "${PROJECT_ROOT}" || return 1

    local current_rev=$(alembic current 2>/dev/null | grep -oP '^\w+' | head -1)
    local head_rev=$(alembic heads 2>/dev/null | grep -oP '^\w+' | head -1)

    log_verbose "Current revision: ${current_rev:-none}"
    log_verbose "Head revision: ${head_rev}"

    if [[ "${current_rev}" == "${head_rev}" ]]; then
        log_info "Database is up to date, no pending migrations"
        return 0
    fi

    log_info "Pending migrations:"
    if [[ -z "${current_rev}" ]]; then
        alembic history --verbose 2>&1 | tee -a "${LOG_FILE}"
    else
        alembic history -r "${current_rev}:head" --verbose 2>&1 | tee -a "${LOG_FILE}"
    fi

    return 0
}

create_migration_backup() {
    if [[ "${CREATE_BACKUP}" != "true" ]]; then
        return 0
    fi

    log_info "Creating pre-migration backup..."

    local backup_script="${SCRIPT_DIR}/backup.sh"

    if [[ ! -f "${backup_script}" ]]; then
        log_warning "Backup script not found, skipping backup"
        return 0
    fi

    local backup_cmd="${backup_script} -e ${ENVIRONMENT} -v pre-migration-$(date +%Y%m%d_%H%M%S) --type db"
    [[ "${VERBOSE}" == "true" ]] && backup_cmd="${backup_cmd} -V"
    [[ "${DRY_RUN}" == "true" ]] && backup_cmd="${backup_cmd} -d"

    if bash ${backup_cmd}; then
        log_success "Pre-migration backup created"
        return 0
    else
        log_error "Failed to create pre-migration backup"
        return 1
    fi
}

run_migration_up() {
    log_info "Running database migrations (upgrade)..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would run: alembic upgrade head"
        show_pending_migrations
        log_success "Migration preview completed (dry-run)"
        return 0
    fi

    cd "${PROJECT_ROOT}" || return 1

    local migration_target="head"
    if [[ -n "${STEPS}" ]]; then
        migration_target="+${STEPS}"
    fi

    log_info "Upgrading to: ${migration_target}"

    if alembic upgrade "${migration_target}" 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Database migrations completed successfully"
        return 0
    else
        log_error "Database migrations failed"
        return 1
    fi
}

run_migration_down() {
    log_warning "Running database migration rollback (downgrade)..."

    local steps_to_rollback="${STEPS:-1}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback ${steps_to_rollback} step(s)"
        log_success "Migration rollback preview (dry-run)"
        return 0
    fi

    # Confirmation for production
    if [[ "${ENVIRONMENT}" == "prod" ]]; then
        log_warning "⚠️  WARNING: Rolling back production database migrations!"
        read -p "Type 'ROLLBACK' to confirm: " confirmation
        if [[ "${confirmation}" != "ROLLBACK" ]]; then
            log_error "Rollback cancelled"
            return 1
        fi
    fi

    cd "${PROJECT_ROOT}" || return 1

    local migration_target="-${steps_to_rollback}"

    log_warning "Downgrading by ${steps_to_rollback} step(s)..."

    if alembic downgrade "${migration_target}" 2>&1 | tee -a "${LOG_FILE}"; then
        log_success "Database rollback completed"
        return 0
    else
        log_error "Database rollback failed"
        return 1
    fi
}

verify_migration() {
    log_info "Verifying migration..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would verify migration"
        return 0
    fi

    cd "${PROJECT_ROOT}" || return 1

    # Check current revision
    local current_rev=$(alembic current 2>/dev/null)

    if [[ -z "${current_rev}" ]]; then
        log_error "Failed to verify current revision"
        return 1
    fi

    log_info "Current revision after migration:"
    echo "${current_rev}" | tee -a "${LOG_FILE}"

    # Basic database connectivity check
    if command -v psql &> /dev/null; then
        log_info "Testing database connectivity..."

        # Extract DB components from DATABASE_URL
        local db_conn_test=$(psql "${DATABASE_URL}" -c "SELECT version();" 2>&1)

        if [[ $? -eq 0 ]]; then
            log_success "Database connectivity verified"
        else
            log_warning "Database connectivity check had issues (migration may still be successful)"
        fi
    fi

    log_success "Migration verification completed"
    return 0
}

record_migration() {
    log_info "Recording migration information..."

    local migration_record="${LOG_DIR}/migrations.json"
    local current_rev=$(get_current_revision)

    local migration_data=$(cat <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "${ENVIRONMENT}",
    "direction": "${DIRECTION}",
    "steps": "${STEPS:-all}",
    "revision": "${current_rev}",
    "executed_by": "${USER}",
    "log_file": "${LOG_FILE}"
}
EOF
    )

    if [[ "${DRY_RUN}" == "false" ]]; then
        # Initialize file if it doesn't exist
        [[ ! -f "${migration_record}" ]] && echo "[]" > "${migration_record}"

        # Append migration record
        local temp_file=$(mktemp)
        jq ". += [${migration_data}]" "${migration_record}" > "${temp_file}" && mv "${temp_file}" "${migration_record}"

        log_success "Migration recorded"
    else
        log_info "[DRY-RUN] Would record migration"
    fi
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist Database Migration ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Direction: ${DIRECTION}"
    log_info "Steps: ${STEPS:-all}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "Log File: ${LOG_FILE}"
    log_info ""

    # Check Alembic setup
    if ! check_alembic_setup; then
        log_error "Alembic setup check failed"
        return 1
    fi

    # Get database credentials
    if ! get_database_credentials; then
        log_error "Failed to get database credentials"
        return 1
    fi

    # Show current state
    local current_rev=$(get_current_revision)
    log_info "Current database revision: ${current_rev}"

    # Create backup if requested
    if ! create_migration_backup; then
        log_error "Backup creation failed"
        return 1
    fi

    # Run migrations based on direction
    case "${DIRECTION}" in
        up)
            show_pending_migrations

            if ! run_migration_up; then
                log_error "Migration upgrade failed"
                return 1
            fi
            ;;
        down)
            if ! run_migration_down; then
                log_error "Migration downgrade failed"
                return 1
            fi
            ;;
        *)
            log_error "Invalid migration direction: ${DIRECTION}"
            return 1
            ;;
    esac

    # Verify migration
    if ! verify_migration; then
        log_warning "Migration verification had issues"
    fi

    # Record migration
    record_migration

    log_success "=== Migration Completed ==="
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
            -D|--direction)
                DIRECTION="$2"
                shift 2
                ;;
            -s|--steps)
                STEPS="$2"
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
            -b|--backup)
                CREATE_BACKUP=true
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

    if [[ "${DIRECTION}" != "up" ]] && [[ "${DIRECTION}" != "down" ]]; then
        log_error "Direction must be 'up' or 'down'"
        show_usage
    fi
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
