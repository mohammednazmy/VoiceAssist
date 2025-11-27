#!/bin/bash

################################################################################
# VoiceAssist Production Deployment for asimo.io
#
# This script deploys VoiceAssist to the asimo.io Ubuntu server with:
# - Docker Compose deployment
# - Apache reverse proxy configuration
# - SSL/TLS setup with Certbot
# - Full monitoring stack (Prometheus + Grafana + Jaeger + Loki)
# - Log rotation and system monitoring
# - Automated backups and health checks
#
# Usage: sudo ./deploy-to-asimo.sh [OPTIONS]
#
# Options:
#   --skip-ssl           Skip SSL certificate setup
#   --skip-monitoring    Skip monitoring stack deployment
#   --dry-run            Show what would be done without executing
#   --help               Show this help message
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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOYMENT_DIR="/opt/voiceassist"
DOMAIN="assist.asimo.io"
ADMIN_DOMAIN="admin.asimo.io"
MONITOR_DOMAIN="monitor.asimo.io"
ADMIN_EMAIL="admin@asimo.io"

# Default values
SKIP_SSL=false
SKIP_MONITORING=false
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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-ssl)
                SKIP_SSL=true
                shift
                ;;
            --skip-monitoring)
                SKIP_MONITORING=true
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
  --skip-ssl           Skip SSL certificate setup
  --skip-monitoring    Skip monitoring stack deployment
  --dry-run            Show what would be done without executing
  -h, --help           Show this help message

Example:
  sudo $0                    # Full deployment
  sudo $0 --skip-ssl         # Skip SSL setup

EOF
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_tools=()

    # Check for required tools
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v docker-compose >/dev/null 2>&1 || {
        command -v docker compose >/dev/null 2>&1 || missing_tools+=("docker-compose")
    }
    command -v apache2 >/dev/null 2>&1 || missing_tools+=("apache2")
    dpkg -s libapache2-mod-security2 >/dev/null 2>&1 || missing_tools+=("libapache2-mod-security2")
    command -v certbot >/dev/null 2>&1 || {
        if ! $SKIP_SSL; then
            missing_tools+=("certbot")
        fi
    }

    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Installing missing tools..."

        apt-get update
        for tool in "${missing_tools[@]}"; do
            case $tool in
                docker)
                    curl -fsSL https://get.docker.com -o get-docker.sh
                    sh get-docker.sh
                    rm get-docker.sh
                    ;;
                docker-compose)
                    apt-get install -y docker-compose-plugin
                    ;;
                apache2)
                    apt-get install -y apache2
                    ;;
                libapache2-mod-security2)
                    apt-get install -y libapache2-mod-security2
                    ;;
                certbot)
                    apt-get install -y certbot python3-certbot-apache
                    ;;
            esac
        done
    fi

    log_success "All prerequisites satisfied"
}

create_deployment_directory() {
    log_info "Creating deployment directory..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would create $DEPLOYMENT_DIR"
        return 0
    fi

    mkdir -p "$DEPLOYMENT_DIR"
    cd "$DEPLOYMENT_DIR"

    log_success "Deployment directory created: $DEPLOYMENT_DIR"
}

copy_project_files() {
    log_info "Copying project files to deployment directory..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would copy files from $PROJECT_ROOT to $DEPLOYMENT_DIR"
        return 0
    fi

    # Copy necessary files
    rsync -av --exclude '.git' \
              --exclude 'node_modules' \
              --exclude '__pycache__' \
              --exclude '*.pyc' \
              --exclude '.env' \
              --exclude 'venv' \
              --exclude '.pytest_cache' \
              --exclude 'htmlcov' \
              --exclude '.turbo' \
              "$PROJECT_ROOT/" "$DEPLOYMENT_DIR/"

    log_success "Project files copied successfully"
}

create_production_env() {
    log_info "Creating production environment configuration..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would create .env.production"
        return 0
    fi

    # Generate secure secrets
    SECRET_KEY=$(openssl rand -hex 32)
    JWT_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    REDIS_PASSWORD=$(openssl rand -hex 16)

    cat > "$DEPLOYMENT_DIR/.env.production" << EOF
# VoiceAssist Production Environment Configuration
# Generated: $(date)

#==============================================
# Environment
#==============================================
ENVIRONMENT=production
DEBUG=false

#==============================================
# Domain Configuration
#==============================================
DOMAIN=$DOMAIN
API_URL=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN,https://$ADMIN_DOMAIN,https://$MONITOR_DOMAIN

#==============================================
# Database
#==============================================
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=voiceassist
DATABASE_URL=postgresql://voiceassist:$POSTGRES_PASSWORD@postgres:5432/voiceassist

# Connection Pool Configuration
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=40
DB_POOL_RECYCLE=3600
DB_POOL_TIMEOUT=30

#==============================================
# Redis
#==============================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379

# Redis Connection Pool Configuration
REDIS_MAX_CONNECTIONS=50
REDIS_CONNECT_TIMEOUT=5
REDIS_HEALTH_CHECK_INTERVAL=30

#==============================================
# Qdrant
#==============================================
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=medical_knowledge

#==============================================
# Nextcloud Integration
#==============================================
NEXTCLOUD_URL=https://asimo.io
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=CHANGE_ME_MANUALLY
NEXTCLOUD_DB_PASSWORD=CHANGE_ME_MANUALLY

#==============================================
# OpenAI
#==============================================
OPENAI_API_KEY=CHANGE_ME_MANUALLY
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

#==============================================
# Security
#==============================================
SECRET_KEY=$SECRET_KEY
JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

#==============================================
# Application Settings
#==============================================
MAX_UPLOAD_SIZE=104857600
LOG_LEVEL=INFO
ENABLE_CORS=true

#==============================================
# Observability
#==============================================
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)
JAEGER_PORT=16686
LOKI_PORT=3100

EOF

    # Set secure permissions
    chmod 600 "$DEPLOYMENT_DIR/.env.production"

    log_success "Production environment configuration created"
    log_warning "IMPORTANT: Edit $DEPLOYMENT_DIR/.env.production and set OPENAI_API_KEY and Nextcloud credentials"
}

configure_apache_reverse_proxy() {
    log_info "Configuring Apache reverse proxy for $DOMAIN..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would configure Apache for $DOMAIN"
        return 0
    fi

    # Enable required Apache modules
    a2enmod proxy proxy_http proxy_wstunnel headers ssl rewrite security2

    # Create VirtualHost configuration
    cat > "/etc/apache2/sites-available/$DOMAIN.conf" << 'EOF'
<VirtualHost *:80>
    ServerName assist.asimo.io
    ServerAdmin admin@asimo.io

    # Redirect to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

    ErrorLog ${APACHE_LOG_DIR}/assist-error.log
    CustomLog ${APACHE_LOG_DIR}/assist-access.log combined
</VirtualHost>

<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName assist.asimo.io
    ServerAdmin admin@asimo.io

    # SSL Configuration (will be populated by Certbot)
    # SSLEngine on
    # SSLCertificateFile /etc/letsencrypt/live/assist.asimo.io/fullchain.pem
    # SSLCertificateKeyFile /etc/letsencrypt/live/assist.asimo.io/privkey.pem

    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # Proxy Configuration
    ProxyPreserveHost On
    ProxyRequests Off

    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:8000/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*)           http://localhost:8000/$1 [P,L]

    # Main API proxy
    ProxyPass / http://localhost:8000/
    ProxyPassReverse / http://localhost:8000/

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/assist-error.log
    CustomLog ${APACHE_LOG_DIR}/assist-access.log combined
</VirtualHost>
</IfModule>
EOF

    # Enable the site
    a2ensite "$DOMAIN.conf"

    # Test Apache configuration
    apache2ctl configtest

    # Reload Apache
    systemctl reload apache2

    log_success "Apache reverse proxy configured for $DOMAIN"
}

configure_admin_proxy() {
    log_info "Configuring Apache reverse proxy for $ADMIN_DOMAIN (Admin Panel)..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would configure Apache for $ADMIN_DOMAIN"
        return 0
    fi

    # Ensure required modules are enabled (including WAF)
    a2enmod proxy proxy_http proxy_wstunnel headers ssl rewrite security2

    # Enable blocking mode for ModSecurity
    if [ -f /etc/modsecurity/modsecurity.conf ]; then
        sed -i 's/^SecRuleEngine.*/SecRuleEngine On/' /etc/modsecurity/modsecurity.conf
    fi

    cat > "/etc/apache2/sites-available/$ADMIN_DOMAIN.conf" << 'EOF'
<VirtualHost *:80>
    ServerName admin.asimo.io
    ServerAdmin admin@asimo.io

    # Redirect all HTTP to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]

    ErrorLog ${APACHE_LOG_DIR}/admin-voiceassist-error.log
    CustomLog ${APACHE_LOG_DIR}/admin-voiceassist-access.log combined
</VirtualHost>

<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName admin.asimo.io
    ServerAdmin admin@asimo.io

    # SSL Configuration (managed by certbot)
    SSLEngine on

    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # CORS Headers
    Header always set Access-Control-Allow-Origin "https://admin.asimo.io"
    Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization"

    # Proxy Configuration
    ProxyPreserveHost On
    ProxyTimeout 300

    # WebSocket Support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://127.0.0.1:8200/admin/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*)           http://127.0.0.1:8200/admin/$1 [P,L]

    # Proxy to VoiceAssist Admin Panel (port 8200, /admin path)
    ProxyPass / http://127.0.0.1:8200/admin/
    ProxyPassReverse / http://127.0.0.1:8200/admin/

    # WAF + Rate Limiting for admin endpoints and WebSockets
    <IfModule security2_module>
        SecRuleEngine On
        SecRequestBodyAccess On
        SecResponseBodyAccess Off
        SecDefaultAction "phase:1,log,pass"
        SecDefaultAction "phase:2,log,pass"

        # Rate limit admin API routes (100 requests/min per IP)
        SecRule REQUEST_URI "^/api/admin" "id:1000001,phase:1,pass,nolog,initcol:ip=%{REMOTE_ADDR},setvar:ip.admin_req_counter=+1,expirevar:ip.admin_req_counter=60"
        SecRule IP:admin_req_counter "@gt 100" "id:1000002,phase:1,deny,status:429,log,msg:'Admin route rate limit exceeded'"

        # Rate limit WebSocket upgrade requests (60 upgrades/min per IP)
        SecRule REQUEST_HEADERS:Upgrade "(?i)websocket" "id:1000003,phase:1,pass,nolog,initcol:ip=%{REMOTE_ADDR},setvar:ip.admin_ws_counter=+1,expirevar:ip.admin_ws_counter=60"
        SecRule IP:admin_ws_counter "@gt 60" "id:1000004,phase:1,deny,status:429,log,msg:'Admin websocket rate limit exceeded'"
    </IfModule>

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/admin-voiceassist-error.log
    CustomLog ${APACHE_LOG_DIR}/admin-voiceassist-access.log combined
    LogFormat "%{X-Forwarded-For}i %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-Agent}i\"" proxy
    CustomLog ${APACHE_LOG_DIR}/admin-voiceassist-proxy.log proxy
</VirtualHost>
</IfModule>
EOF

    # Enable the site
    a2ensite "$ADMIN_DOMAIN.conf"

    # Test Apache configuration
    apache2ctl configtest

    # Reload Apache
    systemctl reload apache2

    log_success "Apache reverse proxy configured for $ADMIN_DOMAIN"
}

configure_monitoring_proxy() {
    log_info "Configuring Apache reverse proxy for $MONITOR_DOMAIN (Grafana)..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would configure Apache for $MONITOR_DOMAIN"
        return 0
    fi

    cat > "/etc/apache2/sites-available/$MONITOR_DOMAIN.conf" << 'EOF'
<VirtualHost *:80>
    ServerName monitor.asimo.io
    ServerAdmin admin@asimo.io

    # Redirect to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

    ErrorLog ${APACHE_LOG_DIR}/monitor-error.log
    CustomLog ${APACHE_LOG_DIR}/monitor-access.log combined
</VirtualHost>

<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName monitor.asimo.io
    ServerAdmin admin@asimo.io

    # SSL Configuration (will be populated by Certbot)
    # SSLEngine on
    # SSLCertificateFile /etc/letsencrypt/live/monitor.asimo.io/fullchain.pem
    # SSLCertificateKeyFile /etc/letsencrypt/live/monitor.asimo.io/privkey.pem

    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"

    # Grafana Proxy
    ProxyPreserveHost On
    ProxyRequests Off

    # WebSocket support for Grafana Live
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:3001/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*)           http://localhost:3001/$1 [P,L]

    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/monitor-error.log
    CustomLog ${APACHE_LOG_DIR}/monitor-access.log combined
</VirtualHost>
</IfModule>
EOF

    # Enable the site
    a2ensite "$MONITOR_DOMAIN.conf"

    # Test and reload Apache
    apache2ctl configtest
    systemctl reload apache2

    log_success "Apache reverse proxy configured for $MONITOR_DOMAIN"
}

setup_ssl_certificates() {
    if $SKIP_SSL; then
        log_warning "Skipping SSL setup (--skip-ssl)"
        return 0
    fi

    log_info "Setting up SSL certificates with Certbot..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would setup SSL for $DOMAIN and $MONITOR_DOMAIN"
        return 0
    fi

    # Setup SSL for main domain
    certbot --apache -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || {
        log_warning "SSL setup for $DOMAIN failed (may already exist)"
    }

    # Setup SSL for admin domain
    certbot --apache -d "$ADMIN_DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || {
        log_warning "SSL setup for $ADMIN_DOMAIN failed (may already exist)"
    }

    # Setup SSL for monitoring domain
    certbot --apache -d "$MONITOR_DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || {
        log_warning "SSL setup for $MONITOR_DOMAIN failed (may already exist)"
    }

    # Setup auto-renewal
    systemctl enable certbot.timer
    systemctl start certbot.timer

    log_success "SSL certificates configured"
}

deploy_backend_services() {
    log_info "Deploying VoiceAssist backend services..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would deploy services with docker-compose"
        return 0
    fi

    cd "$DEPLOYMENT_DIR"

    # Use production environment file
    ln -sf .env.production .env

    # Pull latest images
    docker compose pull

    # Deploy services
    docker compose -f docker-compose.yml up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10

    # Check service health
    docker compose ps

    log_success "Backend services deployed"
}

deploy_monitoring_stack() {
    if $SKIP_MONITORING; then
        log_warning "Skipping monitoring stack deployment (--skip-monitoring)"
        return 0
    fi

    log_info "Deploying full monitoring stack (Prometheus + Grafana + Jaeger + Loki)..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would deploy monitoring stack"
        return 0
    fi

    cd "$DEPLOYMENT_DIR"

    # Deploy monitoring services
    if [ -f "deployment/asimo-production/docker-compose.monitoring.yml" ]; then
        docker compose -f deployment/asimo-production/docker-compose.monitoring.yml up -d
    else
        log_warning "Monitoring compose file not found, creating basic setup..."
        # The monitoring setup will be handled in a separate step
    fi

    log_success "Monitoring stack deployed"
}

setup_log_rotation() {
    log_info "Configuring log rotation..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would configure log rotation"
        return 0
    fi

    # Create logrotate configuration
    cat > /etc/logrotate.d/voiceassist << 'EOF'
/var/log/apache2/assist-*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload apache2 > /dev/null 2>&1
    endscript
}

/var/log/apache2/admin-voiceassist-*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload apache2 > /dev/null 2>&1
    endscript
}

/var/log/apache2/monitor-*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload apache2 > /dev/null 2>&1
    endscript
}

/opt/voiceassist/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        docker compose -f /opt/voiceassist/docker-compose.yml restart > /dev/null 2>&1 || true
    endscript
}
EOF

    log_success "Log rotation configured"
}

create_systemd_services() {
    log_info "Creating systemd service for VoiceAssist..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would create systemd service"
        return 0
    fi

    cat > /etc/systemd/system/voiceassist.service << EOF
[Unit]
Description=VoiceAssist Medical AI Platform
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOYMENT_DIR
ExecStart=/usr/bin/docker compose -f $DEPLOYMENT_DIR/docker-compose.yml up -d
ExecStop=/usr/bin/docker compose -f $DEPLOYMENT_DIR/docker-compose.yml down
ExecReload=/usr/bin/docker compose -f $DEPLOYMENT_DIR/docker-compose.yml restart

[Install]
WantedBy=multi-user.target
EOF

    # Enable and start the service
    systemctl daemon-reload
    systemctl enable voiceassist.service

    log_success "Systemd service created"
}

setup_health_monitoring() {
    log_info "Setting up health monitoring and alerts..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would setup health monitoring"
        return 0
    fi

    # Create health check script
    cat > "$DEPLOYMENT_DIR/scripts/health-check.sh" << 'EOF'
#!/bin/bash

# VoiceAssist Health Check Script

DOMAIN="assist.asimo.io"
ADMIN_DOMAIN="admin.asimo.io"
ALERT_EMAIL="admin@asimo.io"

check_api() {
    if ! curl -sf "https://$DOMAIN/health" > /dev/null; then
        echo "API health check failed" | mail -s "VoiceAssist Alert: API Down" "$ALERT_EMAIL"
        return 1
    fi
    return 0
}

check_admin() {
    if ! curl -sf "https://$ADMIN_DOMAIN" > /dev/null; then
        echo "Admin panel health check failed" | mail -s "VoiceAssist Alert: Admin Panel Down" "$ALERT_EMAIL"
        return 1
    fi
    return 0
}

check_docker() {
    if ! docker compose -f /opt/voiceassist/docker-compose.yml ps | grep -q "Up"; then
        echo "Docker services health check failed" | mail -s "VoiceAssist Alert: Services Down" "$ALERT_EMAIL"
        return 1
    fi
    return 0
}

main() {
    check_api
    check_admin
    check_docker
}

main
EOF

    chmod +x "$DEPLOYMENT_DIR/scripts/health-check.sh"

    # Add to crontab (run every 5 minutes)
    (crontab -l 2>/dev/null || echo ""; echo "*/5 * * * * $DEPLOYMENT_DIR/scripts/health-check.sh") | crontab -

    log_success "Health monitoring configured"
}

run_smoke_tests() {
    log_info "Running smoke tests..."

    if $DRY_RUN; then
        log_info "[DRY RUN] Would run smoke tests"
        return 0
    fi

    # Basic connectivity tests
    local tests_passed=0
    local tests_failed=0

    # Test 1: API health endpoint
    if curl -sf "http://localhost:8000/health" > /dev/null; then
        log_success "✓ API health endpoint responding"
        ((tests_passed++))
    else
        log_error "✗ API health endpoint failed"
        ((tests_failed++))
    fi

    # Test 2: Database connectivity
    if docker compose exec -T postgres pg_isready -U voiceassist > /dev/null 2>&1; then
        log_success "✓ PostgreSQL database healthy"
        ((tests_passed++))
    else
        log_error "✗ PostgreSQL database check failed"
        ((tests_failed++))
    fi

    # Test 3: Redis connectivity
    if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "✓ Redis cache healthy"
        ((tests_passed++))
    else
        log_error "✗ Redis cache check failed"
        ((tests_failed++))
    fi

    # Test 4: Qdrant connectivity
    if curl -sf "http://localhost:6333/healthz" > /dev/null; then
        log_success "✓ Qdrant vector database healthy"
        ((tests_passed++))
    else
        log_error "✗ Qdrant vector database check failed"
        ((tests_failed++))
    fi

    # Test 5: Apache reverse proxy
    if apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
        log_success "✓ Apache configuration valid"
        ((tests_passed++))
    else
        log_error "✗ Apache configuration check failed"
        ((tests_failed++))
    fi

    # Summary
    log_info ""
    log_info "Smoke Tests Summary: $tests_passed passed, $tests_failed failed"

    if [ $tests_failed -gt 0 ]; then
        log_warning "Some smoke tests failed. Please review the output above."
        return 1
    else
        log_success "All smoke tests passed!"
        return 0
    fi
}

display_summary() {
    log_info ""
    log_info "=========================================="
    log_info "VoiceAssist Production Deployment Summary"
    log_info "=========================================="
    log_info "Main API:        https://$DOMAIN"
    log_info "Admin Panel:     https://$ADMIN_DOMAIN"
    log_info "Monitoring:      https://$MONITOR_DOMAIN"
    log_info "Deployment Dir:  $DEPLOYMENT_DIR"
    log_info "=========================================="
    log_info ""
    log_info "Service Endpoints:"
    log_info "  - API Gateway:   https://$DOMAIN"
    log_info "  - Health Check:  https://$DOMAIN/health"
    log_info "  - API Docs:      https://$DOMAIN/docs"
    log_info "  - Admin Panel:   https://$ADMIN_DOMAIN"
    log_info "  - Grafana:       https://$MONITOR_DOMAIN (default: admin/admin)"
    log_info "  - Prometheus:    http://localhost:9090"
    log_info "  - Jaeger:        http://localhost:16686"
    log_info ""
    log_info "Next Steps:"
    log_info "  1. Edit $DEPLOYMENT_DIR/.env.production"
    log_info "     - Set OPENAI_API_KEY"
    log_info "     - Set Nextcloud credentials"
    log_info "  2. Restart services: cd $DEPLOYMENT_DIR && docker compose restart"
    log_info "  3. Access Grafana and change default password"
    log_info "  4. Review logs: journalctl -u voiceassist -f"
    log_info "  5. Monitor health: $DEPLOYMENT_DIR/scripts/health-check.sh"
    log_info ""
    log_success "Production deployment complete!"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "=========================================="
    log_info "VoiceAssist Deployment to asimo.io"
    log_info "=========================================="
    log_info ""

    parse_arguments "$@"
    check_root
    check_prerequisites

    # Execute deployment steps
    create_deployment_directory
    copy_project_files
    create_production_env
    configure_apache_reverse_proxy
    configure_admin_proxy
    configure_monitoring_proxy
    setup_ssl_certificates
    deploy_backend_services
    deploy_monitoring_stack
    setup_log_rotation
    create_systemd_services
    setup_health_monitoring
    run_smoke_tests

    display_summary
}

# Run main function
main "$@"
