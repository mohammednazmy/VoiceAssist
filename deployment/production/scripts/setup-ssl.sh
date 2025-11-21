#!/bin/bash

################################################################################
# SSL/TLS Setup Script with Let's Encrypt
#
# This script automates SSL certificate generation and renewal using Let's Encrypt
# with automatic nginx configuration for HTTPS.
#
# Usage: ./setup-ssl.sh --domain <domain> --email <email>
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Variables
DOMAIN=""
EMAIL=""
STAGING=false
FORCE_RENEW=false

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain) DOMAIN="$2"; shift 2 ;;
            --email) EMAIL="$2"; shift 2 ;;
            --staging) STAGING=true; shift ;;
            --force-renew) FORCE_RENEW=true; shift ;;
            -h|--help)
                cat << EOF
Usage: $0 --domain <domain> --email <email> [OPTIONS]

Required:
  --domain <domain>    Domain name for SSL certificate
  --email <email>      Email for Let's Encrypt notifications

Optional:
  --staging            Use Let's Encrypt staging server (for testing)
  --force-renew        Force certificate renewal
  -h, --help           Show this help message

EOF
                exit 0
                ;;
            *) log_error "Unknown option: $1"; exit 1 ;;
        esac
    done
    
    if [[ -z "$DOMAIN" ]] || [[ -z "$EMAIL" ]]; then
        log_error "Missing required arguments"
        exit 1
    fi
}

install_certbot() {
    log_info "Installing Certbot..."
    
    if command -v certbot &> /dev/null; then
        log_info "Certbot already installed"
        return 0
    fi
    
    # Install certbot
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
    
    log_success "Certbot installed successfully"
}

create_nginx_config() {
    log_info "Creating nginx configuration..."
    
    cat > /etc/nginx/sites-available/voiceassist << EOF
# VoiceAssist Production Nginx Configuration

# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other requests to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    
    # SSL certificates (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API Gateway proxy
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # WebSocket support
    location /api/realtime/ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    
    # Monitoring endpoints
    location /grafana/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    location /prometheus/ {
        proxy_pass http://localhost:9090/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    location /jaeger/ {
        proxy_pass http://localhost:16686/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:8000/health;
    }
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/voiceassist /etc/nginx/sites-enabled/
    
    # Test nginx config
    nginx -t
    
    log_success "Nginx configuration created"
}

obtain_certificate() {
    log_info "Obtaining SSL certificate from Let's Encrypt..."
    
    # Create webroot directory
    mkdir -p /var/www/certbot
    
    # Build certbot command
    local certbot_cmd="certbot certonly --webroot -w /var/www/certbot"
    certbot_cmd="$certbot_cmd -d $DOMAIN"
    certbot_cmd="$certbot_cmd --email $EMAIL"
    certbot_cmd="$certbot_cmd --agree-tos"
    certbot_cmd="$certbot_cmd --non-interactive"
    
    if $STAGING; then
        certbot_cmd="$certbot_cmd --staging"
        log_warning "Using staging server (test certificates)"
    fi
    
    if $FORCE_RENEW; then
        certbot_cmd="$certbot_cmd --force-renewal"
    fi
    
    # Run certbot
    if $certbot_cmd; then
        log_success "SSL certificate obtained successfully"
    else
        log_error "Failed to obtain SSL certificate"
        log_info "Troubleshooting:"
        log_info "  1. Ensure domain DNS points to this server"
        log_info "  2. Check firewall allows port 80"
        log_info "  3. Verify nginx is running"
        exit 1
    fi
}

setup_auto_renewal() {
    log_info "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /opt/voiceassist/renew-ssl.sh << 'EOF'
#!/bin/bash
# Automatic SSL certificate renewal script

certbot renew --quiet --deploy-hook "systemctl reload nginx"

# Log renewal
if [ $? -eq 0 ]; then
    echo "$(date): SSL certificates renewed successfully" >> /var/log/voiceassist-ssl-renewal.log
else
    echo "$(date): SSL certificate renewal failed" >> /var/log/voiceassist-ssl-renewal.log
fi
EOF
    
    chmod +x /opt/voiceassist/renew-ssl.sh
    
    # Create cron job (runs twice daily as recommended by Let's Encrypt)
    local cron_job="0 0,12 * * * /opt/voiceassist/renew-ssl.sh"
    
    # Add to crontab if not already present
    (crontab -l 2>/dev/null | grep -v "renew-ssl.sh"; echo "$cron_job") | crontab -
    
    log_success "Auto-renewal configured (runs twice daily)"
}

reload_nginx() {
    log_info "Reloading nginx with new SSL configuration..."
    
    systemctl reload nginx
    
    log_success "Nginx reloaded successfully"
}

verify_ssl() {
    log_info "Verifying SSL configuration..."
    
    # Wait for nginx to fully reload
    sleep 2
    
    # Test HTTPS connection
    if curl -sSf "https://$DOMAIN/health" > /dev/null 2>&1; then
        log_success "SSL is working correctly"
    else
        log_warning "SSL verification failed - check nginx and certificate"
    fi
    
    # Display certificate info
    log_info "Certificate details:"
    echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates
}

display_summary() {
    log_info ""
    log_info "=========================================="
    log_info "SSL/TLS Setup Complete"
    log_info "=========================================="
    log_info "Domain:          $DOMAIN"
    log_info "Certificate:     /etc/letsencrypt/live/$DOMAIN/"
    log_info "Auto-renewal:    Enabled (twice daily)"
    log_info "=========================================="
    log_info ""
    log_info "Test your SSL configuration:"
    log_info "  https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
    log_info ""
    log_success "SSL/TLS configured successfully!"
}

main() {
    log_info "=========================================="
    log_info "SSL/TLS Setup with Let's Encrypt"
    log_info "=========================================="
    log_info ""
    
    parse_arguments "$@"
    install_certbot
    create_nginx_config
    obtain_certificate
    setup_auto_renewal
    reload_nginx
    verify_ssl
    display_summary
}

main "$@"
