#!/bin/bash

################################################################################
# VoiceAssist Production Deployment Script
# 
# This script automates the complete production deployment of VoiceAssist
# to an Ubuntu server including:
# - Infrastructure provisioning (Terraform)
# - Server configuration (Ansible)
# - SSL/TLS setup (Let's Encrypt)
# - Service deployment
# - Monitoring setup
# - Production validation
#
# Usage: ./deploy-production.sh [OPTIONS]
#
# Options:
#   --server <IP>        Production server IP address (required)
#   --domain <domain>    Production domain name (required)
#   --email <email>      Admin email for Let's Encrypt (required)
#   --skip-terraform     Skip Terraform provisioning
#   --skip-ansible       Skip Ansible configuration
#   --skip-ssl           Skip SSL setup
#   --dry-run            Show what would be done without executing
#
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEPLOYMENT_DIR="$PROJECT_ROOT/deployment/production"

# Default values
SERVER_IP=""
DOMAIN=""
ADMIN_EMAIL=""
SKIP_TERRAFORM=false
SKIP_ANSIBLE=false
SKIP_SSL=false
DRY_RUN=false

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing_tools+=("docker-compose")
    command -v terraform >/dev/null 2>&1 || missing_tools+=("terraform")
    command -v ansible >/dev/null 2>&1 || missing_tools+=("ansible")
    command -v ssh >/dev/null 2>&1 || missing_tools+=("ssh")
    command -v git >/dev/null 2>&1 || missing_tools+=("git")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Please install missing tools and try again"
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --server)
                SERVER_IP="$2"
                shift 2
                ;;
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --email)
                ADMIN_EMAIL="$2"
                shift 2
                ;;
            --skip-terraform)
                SKIP_TERRAFORM=true
                shift
                ;;
            --skip-ansible)
                SKIP_ANSIBLE=true
                shift
                ;;
            --skip-ssl)
                SKIP_SSL=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                cat << EOF
Usage: $0 [OPTIONS]

Options:
  --server <IP>        Production server IP address (required)
  --domain <domain>    Production domain name (required)
  --email <email>      Admin email for Let's Encrypt (required)
  --skip-terraform     Skip Terraform provisioning
  --skip-ansible       Skip Ansible configuration
  --skip-ssl           Skip SSL setup
  --dry-run            Show what would be done without executing
  -h, --help           Show this help message

Example:
  $0 --server 192.168.1.100 --domain voiceassist.example.com --email admin@example.com

EOF
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate required arguments
    if [[ -z "$SERVER_IP" ]] || [[ -z "$DOMAIN" ]] || [[ -z "$ADMIN_EMAIL" ]]; then
        log_error "Missing required arguments"
        log_info "Usage: $0 --server <IP> --domain <domain> --email <email>"
        exit 1
    fi
}

test_server_connectivity() {
    log_info "Testing connectivity to production server ($SERVER_IP)..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would test SSH connection to $SERVER_IP"
        return 0
    fi
    
    if ssh -o ConnectTimeout=10 -o BatchMode=yes "root@$SERVER_IP" exit 2>/dev/null; then
        log_success "Server is reachable via SSH"
    else
        log_error "Cannot connect to server via SSH"
        log_info "Ensure SSH key is configured: ssh-copy-id root@$SERVER_IP"
        exit 1
    fi
}

copy_project_to_server() {
    log_info "Copying project files to production server..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would copy project to $SERVER_IP:/opt/voiceassist"
        return 0
    fi
    
    # Create remote directory
    ssh "root@$SERVER_IP" "mkdir -p /opt/voiceassist"
    
    # Copy project files (excluding dev files)
    rsync -avz --progress \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude '.env' \
        --exclude 'venv' \
        --exclude '.pytest_cache' \
        --exclude 'htmlcov' \
        "$PROJECT_ROOT/" "root@$SERVER_IP:/opt/voiceassist/"
    
    log_success "Project files copied successfully"
}

provision_infrastructure() {
    if $SKIP_TERRAFORM; then
        log_warning "Skipping Terraform provisioning (--skip-terraform)"
        return 0
    fi
    
    log_info "Provisioning infrastructure with Terraform..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would run: terraform init && terraform apply"
        return 0
    fi
    
    cd "$PROJECT_ROOT/infrastructure/terraform"
    
    # Initialize Terraform
    terraform init
    
    # Create terraform.tfvars with production values
    cat > terraform.tfvars << EOF
environment = "production"
project_name = "voiceassist"
region = "us-east-1"

# Network
vpc_cidr = "10.0.0.0/16"

# Compute
instance_type = "t3.medium"
min_nodes = 2
max_nodes = 10

# Database
db_instance_class = "db.t3.medium"
db_allocated_storage = 100

# Redis
redis_node_type = "cache.t3.medium"

# Domain
domain_name = "$DOMAIN"

# Tags
tags = {
  Environment = "production"
  Project = "voiceassist"
  ManagedBy = "terraform"
}
EOF
    
    # Plan and apply
    terraform plan -out=tfplan
    terraform apply tfplan
    
    log_success "Infrastructure provisioned successfully"
    cd "$PROJECT_ROOT"
}

configure_server() {
    if $SKIP_ANSIBLE; then
        log_warning "Skipping Ansible configuration (--skip-ansible)"
        return 0
    fi
    
    log_info "Configuring server with Ansible..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would run Ansible playbook"
        return 0
    fi
    
    cd "$PROJECT_ROOT/infrastructure/ansible"
    
    # Create inventory
    cat > inventory/production.yml << EOF
all:
  hosts:
    voiceassist-prod:
      ansible_host: $SERVER_IP
      ansible_user: root
      ansible_python_interpreter: /usr/bin/python3
  vars:
    environment: production
    domain_name: $DOMAIN
    admin_email: $ADMIN_EMAIL
EOF
    
    # Run playbook
    ansible-playbook -i inventory/production.yml playbooks/site.yml
    
    log_success "Server configured successfully"
    cd "$PROJECT_ROOT"
}

setup_ssl() {
    if $SKIP_SSL; then
        log_warning "Skipping SSL setup (--skip-ssl)"
        return 0
    fi
    
    log_info "Setting up SSL certificates with Let's Encrypt..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would setup Let's Encrypt SSL for $DOMAIN"
        return 0
    fi
    
    # Copy SSL setup script to server
    scp "$DEPLOYMENT_DIR/scripts/setup-ssl.sh" "root@$SERVER_IP:/opt/voiceassist/"
    
    # Run SSL setup on server
    ssh "root@$SERVER_IP" "cd /opt/voiceassist && bash setup-ssl.sh --domain $DOMAIN --email $ADMIN_EMAIL"
    
    log_success "SSL certificates configured successfully"
}

deploy_services() {
    log_info "Deploying VoiceAssist services..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would deploy services with docker-compose"
        return 0
    fi
    
    # Create production .env file on server
    ssh "root@$SERVER_IP" "cd /opt/voiceassist && cat > .env" << EOF
# Production Environment Configuration
ENVIRONMENT=production
LOG_LEVEL=INFO

# Domain
DOMAIN=$DOMAIN
API_URL=https://$DOMAIN

# Database
DATABASE_URL=postgresql://voiceassist:CHANGE_ME@postgres:5432/voiceassist

# Redis
REDIS_URL=redis://redis:6379/0

# Qdrant
QDRANT_URL=http://qdrant:6333

# OpenAI
OPENAI_API_KEY=CHANGE_ME

# Security
SECRET_KEY=CHANGE_ME
JWT_SECRET_KEY=CHANGE_ME

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME

# Monitoring
PROMETHEUS_ENABLED=true
JAEGER_ENABLED=true
LOKI_ENABLED=true

# Nextcloud
NEXTCLOUD_URL=https://nextcloud.$DOMAIN
NEXTCLOUD_USERNAME=admin
NEXTCLOUD_PASSWORD=CHANGE_ME
EOF
    
    # Deploy with docker-compose
    ssh "root@$SERVER_IP" << 'EOFSSH'
        cd /opt/voiceassist
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
        docker-compose ps
EOFSSH
    
    log_success "Services deployed successfully"
}

setup_monitoring() {
    log_info "Setting up production monitoring..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would setup monitoring stack"
        return 0
    fi
    
    # Deploy monitoring stack
    ssh "root@$SERVER_IP" << 'EOFSSH'
        cd /opt/voiceassist
        docker-compose -f infrastructure/observability/docker-compose.monitoring.yml up -d
        
        # Wait for Grafana to be ready
        echo "Waiting for Grafana to be ready..."
        timeout 60 bash -c 'until curl -s http://localhost:3001/api/health > /dev/null; do sleep 2; done'
        
        # Import dashboards
        echo "Importing Grafana dashboards..."
        for dashboard in infrastructure/observability/grafana/dashboards/*.json; do
            curl -X POST http://admin:admin@localhost:3001/api/dashboards/db \
                -H "Content-Type: application/json" \
                -d @"$dashboard"
        done
EOFSSH
    
    log_success "Monitoring configured successfully"
}

run_smoke_tests() {
    log_info "Running production smoke tests..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would run smoke tests"
        return 0
    fi
    
    # Copy smoke test script to server
    scp "$DEPLOYMENT_DIR/smoke-tests/smoke-test.sh" "root@$SERVER_IP:/opt/voiceassist/"
    
    # Run smoke tests
    if ssh "root@$SERVER_IP" "cd /opt/voiceassist && bash smoke-test.sh --domain $DOMAIN"; then
        log_success "All smoke tests passed"
    else
        log_error "Some smoke tests failed"
        log_warning "Check logs for details"
        return 1
    fi
}

display_summary() {
    log_info ""
    log_info "=========================================="
    log_info "Production Deployment Summary"
    log_info "=========================================="
    log_info "Server IP:       $SERVER_IP"
    log_info "Domain:          $DOMAIN"
    log_info "Admin Email:     $ADMIN_EMAIL"
    log_info "=========================================="
    log_info ""
    log_info "Access URLs:"
    log_info "  - API Gateway:   https://$DOMAIN"
    log_info "  - Grafana:       https://$DOMAIN:3001"
    log_info "  - Prometheus:    https://$DOMAIN:9090"
    log_info "  - Jaeger:        https://$DOMAIN:16686"
    log_info ""
    log_info "Next Steps:"
    log_info "  1. Update DNS A record: $DOMAIN → $SERVER_IP"
    log_info "  2. Update production secrets in /opt/voiceassist/.env"
    log_info "  3. Review monitoring dashboards"
    log_info "  4. Run full test suite"
    log_info "  5. Configure backup schedule"
    log_info ""
    log_success "Production deployment complete!"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "=========================================="
    log_info "VoiceAssist Production Deployment"
    log_info "=========================================="
    log_info ""
    
    parse_arguments "$@"
    check_prerequisites
    test_server_connectivity
    
    # Execute deployment steps
    copy_project_to_server
    provision_infrastructure
    configure_server
    setup_ssl
    deploy_services
    setup_monitoring
    run_smoke_tests
    
    display_summary
}

# Run main function
main "$@"
