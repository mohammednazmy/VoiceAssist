#!/bin/bash

###############################################################################
# VoiceAssist AWS Resources Setup Script
#
# Initializes required AWS resources for VoiceAssist deployment
#
# Usage:
#   ./setup-aws-resources.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Target environment (dev/staging/prod) [required]
#   -d, --dry-run           Perform dry-run
#   -V, --verbose           Enable verbose output
#   -h, --help              Show this help message
#
# Examples:
#   ./setup-aws-resources.sh -e dev
#   ./setup-aws-resources.sh -e prod --verbose
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
LOG_DIR="${PROJECT_ROOT}/logs/init"
LOG_FILE="${LOG_DIR}/aws-setup_$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=""
DRY_RUN=false
VERBOSE=false

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=""

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

get_aws_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
        log_error "Failed to get AWS account ID"
        return 1
    fi
    log_verbose "AWS Account ID: ${AWS_ACCOUNT_ID}"
    return 0
}

###############################################################################
# ECR Repositories
###############################################################################

create_ecr_repositories() {
    log_info "Creating ECR repositories..."

    local repos=("voiceassist-backend" "voiceassist-worker" "voiceassist-frontend")

    for repo in "${repos[@]}"; do
        log_info "Checking repository: ${repo}"

        if [[ "${DRY_RUN}" == "true" ]]; then
            log_info "[DRY-RUN] Would create repository: ${repo}"
            continue
        fi

        # Check if repository exists
        if aws ecr describe-repositories \
            --repository-names "${repo}" \
            --region "${AWS_REGION}" &> /dev/null; then
            log_verbose "Repository ${repo} already exists"
            continue
        fi

        # Create repository
        log_info "Creating repository: ${repo}"

        if aws ecr create-repository \
            --repository-name "${repo}" \
            --region "${AWS_REGION}" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            --tags "Key=Environment,Value=${ENVIRONMENT}" "Key=Project,Value=VoiceAssist" \
            2>&1 | tee -a "${LOG_FILE}"; then

            # Set lifecycle policy to clean up old images
            local lifecycle_policy='{
                "rules": [{
                    "rulePriority": 1,
                    "description": "Keep last 30 images",
                    "selection": {
                        "tagStatus": "any",
                        "countType": "imageCountMoreThan",
                        "countNumber": 30
                    },
                    "action": {
                        "type": "expire"
                    }
                }]
            }'

            aws ecr put-lifecycle-policy \
                --repository-name "${repo}" \
                --region "${AWS_REGION}" \
                --lifecycle-policy-text "${lifecycle_policy}" \
                2>&1 | tee -a "${LOG_FILE}"

            log_success "Repository ${repo} created"
        else
            log_error "Failed to create repository ${repo}"
            return 1
        fi
    done

    log_success "ECR repositories configured"
    return 0
}

###############################################################################
# S3 Buckets
###############################################################################

create_terraform_state_bucket() {
    log_info "Creating S3 bucket for Terraform state..."

    local bucket_name="voiceassist-terraform-state-${AWS_ACCOUNT_ID}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would create bucket: ${bucket_name}"
        return 0
    fi

    # Check if bucket exists
    if aws s3 ls "s3://${bucket_name}" 2>&1 | grep -q 'NoSuchBucket'; then
        log_info "Creating Terraform state bucket: ${bucket_name}"

        # Create bucket
        if ! aws s3 mb "s3://${bucket_name}" --region "${AWS_REGION}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_error "Failed to create S3 bucket"
            return 1
        fi

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "${bucket_name}" \
            --versioning-configuration Status=Enabled \
            2>&1 | tee -a "${LOG_FILE}"

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "${bucket_name}" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    },
                    "BucketKeyEnabled": true
                }]
            }' 2>&1 | tee -a "${LOG_FILE}"

        # Block public access
        aws s3api put-public-access-block \
            --bucket "${bucket_name}" \
            --public-access-block-configuration \
                "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
            2>&1 | tee -a "${LOG_FILE}"

        # Add lifecycle policy
        local lifecycle_policy='{
            "Rules": [{
                "Id": "DeleteOldVersions",
                "Status": "Enabled",
                "NoncurrentVersionExpiration": {
                    "NoncurrentDays": 90
                }
            }]
        }'

        aws s3api put-bucket-lifecycle-configuration \
            --bucket "${bucket_name}" \
            --lifecycle-configuration "${lifecycle_policy}" \
            2>&1 | tee -a "${LOG_FILE}"

        log_success "Terraform state bucket created: ${bucket_name}"
    else
        log_verbose "Terraform state bucket already exists"
    fi

    return 0
}

create_backup_bucket() {
    log_info "Creating S3 bucket for backups..."

    local bucket_name="voiceassist-backups-${AWS_ACCOUNT_ID}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would create bucket: ${bucket_name}"
        return 0
    fi

    # Check if bucket exists
    if aws s3 ls "s3://${bucket_name}" 2>&1 | grep -q 'NoSuchBucket'; then
        log_info "Creating backup bucket: ${bucket_name}"

        # Create bucket
        if ! aws s3 mb "s3://${bucket_name}" --region "${AWS_REGION}" 2>&1 | tee -a "${LOG_FILE}"; then
            log_error "Failed to create S3 bucket"
            return 1
        fi

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "${bucket_name}" \
            --versioning-configuration Status=Enabled \
            2>&1 | tee -a "${LOG_FILE}"

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "${bucket_name}" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    },
                    "BucketKeyEnabled": true
                }]
            }' 2>&1 | tee -a "${LOG_FILE}"

        # Block public access
        aws s3api put-public-access-block \
            --bucket "${bucket_name}" \
            --public-access-block-configuration \
                "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
            2>&1 | tee -a "${LOG_FILE}"

        # Add lifecycle policy for old backups
        local lifecycle_policy='{
            "Rules": [{
                "Id": "TransitionOldBackups",
                "Status": "Enabled",
                "Transitions": [{
                    "Days": 30,
                    "StorageClass": "STANDARD_IA"
                }, {
                    "Days": 90,
                    "StorageClass": "GLACIER"
                }],
                "Expiration": {
                    "Days": 365
                }
            }]
        }'

        aws s3api put-bucket-lifecycle-configuration \
            --bucket "${bucket_name}" \
            --lifecycle-configuration "${lifecycle_policy}" \
            2>&1 | tee -a "${LOG_FILE}"

        log_success "Backup bucket created: ${bucket_name}"
    else
        log_verbose "Backup bucket already exists"
    fi

    return 0
}

###############################################################################
# DynamoDB Table for Terraform Locks
###############################################################################

create_terraform_lock_table() {
    log_info "Creating DynamoDB table for Terraform locks..."

    local table_name="voiceassist-terraform-locks"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would create table: ${table_name}"
        return 0
    fi

    # Check if table exists
    if aws dynamodb describe-table \
        --table-name "${table_name}" \
        --region "${AWS_REGION}" &> /dev/null; then
        log_verbose "DynamoDB table already exists"
        return 0
    fi

    log_info "Creating DynamoDB table: ${table_name}"

    if aws dynamodb create-table \
        --table-name "${table_name}" \
        --region "${AWS_REGION}" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --tags "Key=Environment,Value=${ENVIRONMENT}" "Key=Project,Value=VoiceAssist" \
        2>&1 | tee -a "${LOG_FILE}"; then

        log_info "Waiting for table to become active..."
        aws dynamodb wait table-exists \
            --table-name "${table_name}" \
            --region "${AWS_REGION}"

        log_success "DynamoDB table created: ${table_name}"
    else
        log_error "Failed to create DynamoDB table"
        return 1
    fi

    return 0
}

###############################################################################
# AWS Secrets Manager
###############################################################################

create_secrets_structure() {
    log_info "Creating AWS Secrets Manager secrets structure..."

    local secrets=(
        "voiceassist/${ENVIRONMENT}/database:Database credentials"
        "voiceassist/${ENVIRONMENT}/redis:Redis credentials"
        "voiceassist/${ENVIRONMENT}/jwt-secret:JWT signing secret"
        "voiceassist/${ENVIRONMENT}/openai-api-key:OpenAI API key"
        "voiceassist/${ENVIRONMENT}/smtp:SMTP credentials"
    )

    for secret_info in "${secrets[@]}"; do
        local secret_name="${secret_info%%:*}"
        local secret_desc="${secret_info##*:}"

        log_info "Checking secret: ${secret_name}"

        if [[ "${DRY_RUN}" == "true" ]]; then
            log_info "[DRY-RUN] Would create secret: ${secret_name}"
            continue
        fi

        # Check if secret exists
        if aws secretsmanager describe-secret \
            --secret-id "${secret_name}" \
            --region "${AWS_REGION}" &> /dev/null; then
            log_verbose "Secret ${secret_name} already exists"
            continue
        fi

        # Create secret with placeholder value
        log_info "Creating secret: ${secret_name}"

        local placeholder_value='{"placeholder": "CHANGE_ME"}'

        if aws secretsmanager create-secret \
            --name "${secret_name}" \
            --description "${secret_desc}" \
            --secret-string "${placeholder_value}" \
            --region "${AWS_REGION}" \
            --tags "Key=Environment,Value=${ENVIRONMENT}" "Key=Project,Value=VoiceAssist" \
            2>&1 | tee -a "${LOG_FILE}"; then
            log_success "Secret created: ${secret_name}"
            log_warning "⚠ Remember to update secret value with actual credentials"
        else
            log_error "Failed to create secret ${secret_name}"
            return 1
        fi
    done

    log_success "Secrets structure created"
    return 0
}

###############################################################################
# IAM Roles and Policies
###############################################################################

create_iam_roles() {
    log_info "Creating IAM roles and policies..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would create IAM roles"
        return 0
    fi

    # EKS Cluster Role
    local cluster_role_name="voiceassist-eks-cluster-role"

    if ! aws iam get-role --role-name "${cluster_role_name}" &> /dev/null; then
        log_info "Creating EKS cluster role..."

        local trust_policy='{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {
                    "Service": "eks.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }]
        }'

        aws iam create-role \
            --role-name "${cluster_role_name}" \
            --assume-role-policy-document "${trust_policy}" \
            --tags "Key=Environment,Value=${ENVIRONMENT}" "Key=Project,Value=VoiceAssist" \
            2>&1 | tee -a "${LOG_FILE}"

        aws iam attach-role-policy \
            --role-name "${cluster_role_name}" \
            --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy \
            2>&1 | tee -a "${LOG_FILE}"

        log_success "EKS cluster role created"
    else
        log_verbose "EKS cluster role already exists"
    fi

    # EKS Node Group Role
    local node_role_name="voiceassist-eks-node-role"

    if ! aws iam get-role --role-name "${node_role_name}" &> /dev/null; then
        log_info "Creating EKS node group role..."

        local node_trust_policy='{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {
                    "Service": "ec2.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }]
        }'

        aws iam create-role \
            --role-name "${node_role_name}" \
            --assume-role-policy-document "${node_trust_policy}" \
            --tags "Key=Environment,Value=${ENVIRONMENT}" "Key=Project,Value=VoiceAssist" \
            2>&1 | tee -a "${LOG_FILE}"

        # Attach required policies
        local node_policies=(
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
        )

        for policy in "${node_policies[@]}"; do
            aws iam attach-role-policy \
                --role-name "${node_role_name}" \
                --policy-arn "${policy}" \
                2>&1 | tee -a "${LOG_FILE}"
        done

        log_success "EKS node group role created"
    else
        log_verbose "EKS node group role already exists"
    fi

    log_success "IAM roles configured"
    return 0
}

###############################################################################
# Main Function
###############################################################################

main() {
    mkdir -p "${LOG_DIR}"

    log_info "=== VoiceAssist AWS Resources Setup ==="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Region: ${AWS_REGION}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info ""

    # Get AWS account ID
    if ! get_aws_account_id; then
        log_error "Failed to get AWS account ID"
        return 1
    fi

    log_info "AWS Account: ${AWS_ACCOUNT_ID}"
    log_info ""

    # Create resources
    create_ecr_repositories || log_error "ECR setup failed"
    create_terraform_state_bucket || log_error "Terraform state bucket setup failed"
    create_backup_bucket || log_error "Backup bucket setup failed"
    create_terraform_lock_table || log_error "DynamoDB table setup failed"
    create_secrets_structure || log_error "Secrets setup failed"
    create_iam_roles || log_error "IAM roles setup failed"

    log_success "=== AWS Resources Setup Completed ==="
    log_info "Log file: ${LOG_FILE}"
    log_info ""
    log_warning "⚠ Remember to update AWS Secrets Manager with actual credential values"
    log_warning "⚠ Review IAM policies and adjust as needed for your security requirements"

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
}

###############################################################################
# Script Entry Point
###############################################################################

parse_args "$@"
main
exit $?
