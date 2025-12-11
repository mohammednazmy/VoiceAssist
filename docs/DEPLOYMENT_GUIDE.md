---
title: Deployment Guide
slug: deployment-guide
summary: "**Last Updated:** 2025-11-21"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - devops
  - sre
  - ai-agents
tags:
  - deployment
  - guide
category: deployment
component: "infra/deployment"
relatedPaths:
  - "docker-compose.yml"
  - "Makefile"
  - "services/api-gateway/Dockerfile"
  - ".env.example"
ai_summary: >-
  Version: 1.0 Last Updated: 2025-11-21 Phase: 13 - Production Ready --- 1.
  Prerequisites 2. Local Development Setup 3. Production Deployment 4.
  Configuration 5. Security Hardening 6. High Availability 7. Monitoring &
  Observability 8. Backup & Recovery 9. Troubleshooting --- Minimum
  (Development):...
---

# VoiceAssist Deployment Guide

**Version:** 1.0
**Last Updated:** 2025-11-21
**Phase:** 13 - Production Ready

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Configuration](#configuration)
5. [Security Hardening](#security-hardening)
6. [High Availability](#high-availability)
7. [Monitoring & Observability](#monitoring--observability)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware Requirements

**Minimum (Development):**

- CPU: 4 cores
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 10 Mbps

**Recommended (Production):**

- CPU: 8+ cores
- RAM: 32+ GB
- Storage: 200+ GB SSD (RAID 10)
- Network: 100+ Mbps

### Software Requirements

```bash
# Core dependencies
- Docker 24.0+
- Docker Compose 2.20+
- Git 2.40+
- PostgreSQL 16 (or via Docker)
- Python 3.11+

# Optional but recommended
- kubectl 1.28+ (for Kubernetes)
- Terraform 1.5+ (for infrastructure)
- Ansible 2.15+ (for configuration management)
```

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/mohammednazmy/VoiceAssist.git
cd VoiceAssist
```

### 2. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Required Environment Variables:**

```bash
# Database
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=voiceassist

# Security
SECRET_KEY=your_secret_key_here
ENCRYPTION_KEY=your_encryption_key_here

# APIs
OPENAI_API_KEY=your_openai_key

# Nextcloud Integration
NEXTCLOUD_BASE_URL=https://localhost:8080
NEXTCLOUD_CLIENT_ID=voiceassist
NEXTCLOUD_CLIENT_SECRET=your_nextcloud_secret
```

### 3. Start Services

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f voiceassist-server
```

### 4. Initialize Database

```bash
# Run migrations
docker compose exec voiceassist-server alembic upgrade head

# Create admin user (if needed)
docker compose exec voiceassist-server python scripts/create_admin.py
```

### 5. Access Services

- **API Gateway:** https://localhost:8000
- **Admin Panel:** https://localhost:3000
- **Grafana:** https://localhost:3001
- **Prometheus:** https://localhost:9090

---

## Production Deployment

### Option 1: Docker Compose (Single Server)

**Best for:** Small to medium deployments (< 100 users)

```bash
# 1. Prepare production server
ssh user@production-server

# 2. Install dependencies
sudo apt update && sudo apt install -y docker.io docker-compose git

# 3. Clone repository
git clone https://github.com/mohammednazmy/VoiceAssist.git
cd VoiceAssist

# 4. Configure production environment
cp .env.example .env.production
nano .env.production

# 5. Deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 6. Setup SSL (Let's Encrypt)
./scripts/setup-ssl.sh
```

### Option 2: Kubernetes (Cluster)

**Best for:** Large deployments (100+ users), high availability

```bash
# 1. Prepare Kubernetes cluster
# (Use managed service like EKS, GKE, or self-hosted K3s)

# 2. Apply configurations
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f infrastructure/kubernetes/configmaps/
kubectl apply -f infrastructure/kubernetes/secrets/
kubectl apply -f infrastructure/kubernetes/deployments/
kubectl apply -f infrastructure/kubernetes/services/
kubectl apply -f infrastructure/kubernetes/ingress/

# 3. Verify deployment
kubectl get pods -n voiceassist
kubectl get services -n voiceassist

# 4. Access via ingress
# Configure DNS to point to ingress controller
```

### Option 3: Cloud Deployment (AWS/GCP/Azure)

```bash
# Using Terraform for infrastructure provisioning

cd infrastructure/terraform

# 1. Initialize Terraform
terraform init

# 2. Plan deployment
terraform plan -var-file="production.tfvars"

# 3. Apply configuration
terraform apply -var-file="production.tfvars"

# 4. Configure services with Ansible
cd ../ansible
ansible-playbook -i inventory/production playbooks/deploy-voiceassist.yml
```

---

## Configuration

### Database Configuration

**PostgreSQL (Production):**

```ini
# postgresql.conf
max_connections = 200
shared_buffers = 8GB
effective_cache_size = 24GB
maintenance_work_mem = 2GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 20MB
min_wal_size = 1GB
max_wal_size = 4GB
```

### Redis Configuration

```ini
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly yes
```

### Application Configuration

```yaml
# config/production.yaml
app:
  name: VoiceAssist
  environment: production
  debug: false
  log_level: INFO

security:
  jwt_secret_key: ${SECRET_KEY}
  jwt_algorithm: HS256
  access_token_expire_minutes: 30
  refresh_token_expire_days: 30

database:
  url: ${DATABASE_URL}
  pool_size: 20
  max_overflow: 10
  pool_timeout: 30

redis:
  url: ${REDIS_URL}
  max_connections: 50

qdrant:
  host: ${QDRANT_HOST}
  port: 6333
  collection_name: medical_knowledge

observability:
  prometheus_enabled: true
  jaeger_enabled: true
  log_level: INFO
```

---

## Security Hardening

### 1. Network Security

```bash
# Configure firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Install fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 2. SSL/TLS Configuration

```bash
# Using Certbot for Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d voiceassist.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### 3. Secrets Management

```bash
# Using Kubernetes secrets
kubectl create secret generic voiceassist-secrets \
  --from-literal=database-password='your-db-password' \
  --from-literal=secret-key='your-secret-key' \
  --namespace voiceassist

# Using Docker secrets
echo "your-db-password" | docker secret create db_password -
```

### 4. Access Control

- Implement RBAC for all services
- Use network policies in Kubernetes
- Enable audit logging
- Configure rate limiting
- Implement IP whitelisting for admin endpoints

---

## High Availability

### PostgreSQL Replication

```bash
# Setup streaming replication
cd ha-dr/postgresql
docker compose -f docker-compose.replication.yml up -d

# Verify replication
docker exec voiceassist-postgres-primary psql -U voiceassist \
  -c "SELECT * FROM pg_stat_replication;"
```

### Load Balancing

```nginx
# Nginx load balancer configuration
upstream voiceassist_backend {
    least_conn;
    server backend1.example.com:8000 weight=1 max_fails=3 fail_timeout=30s;
    server backend2.example.com:8000 weight=1 max_fails=3 fail_timeout=30s;
    server backend3.example.com:8000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name voiceassist.example.com;

    ssl_certificate /etc/ssl/certs/voiceassist.crt;
    ssl_certificate_key /etc/ssl/private/voiceassist.key;

    location / {
        proxy_pass http://voiceassist_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Monitoring & Observability

### Grafana Dashboards

```bash
# Access Grafana
https://grafana.yourdomain.com

# Import dashboards
- VoiceAssist Overview (dashboard ID: 1001)
- API Performance (dashboard ID: 1002)
- Database Metrics (dashboard ID: 1003)
- System Resources (dashboard ID: 1004)
```

### Alerts Configuration

```yaml
# prometheus/alerts.yml
groups:
  - name: voiceassist_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        annotations:
          summary: "PostgreSQL database is down"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        annotations:
          summary: "Memory usage above 90%"
```

---

## Backup & Recovery

### Automated Backups

```bash
# Setup automated daily backups
cd ha-dr/backup
./setup-cron.sh

# Manual backup
./backup-database.sh

# Verify backup
./verify-backup.sh /path/to/backup.sql.gpg
```

### Disaster Recovery

```bash
# Restore from backup
cd ha-dr/backup
./restore-database.sh /path/to/backup.sql.gpg

# Test failover
cd ha-dr/testing
./test-failover.sh
```

**RTO/RPO Targets:**

- Database failover: RTO 30 min, RPO < 1 min
- Full restore: RTO 4 hours, RPO 24 hours

See `docs/RTO_RPO_DOCUMENTATION.md` for details.

---

## Troubleshooting

### Common Issues

**1. Database connection failed**

```bash
# Check PostgreSQL status
docker compose ps postgres

# Check connection
docker compose exec voiceassist-server python -c "from sqlalchemy import create_engine; engine = create_engine('postgresql://voiceassist:password@postgres:5432/voiceassist'); conn = engine.connect(); print('Connected!')"
```

**2. Redis cache issues**

```bash
# Clear Redis cache
docker compose exec redis redis-cli FLUSHALL

# Check Redis connectivity
docker compose exec redis redis-cli PING
```

**3. API returning 502/504**

```bash
# Check logs
docker compose logs voiceassist-server

# Restart service
docker compose restart voiceassist-server

# Check resource usage
docker stats
```

**4. High memory usage**

```bash
# Identify memory-intensive containers
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"

# Restart services
docker compose restart
```

### Log Access

```bash
# Application logs
docker compose logs -f voiceassist-server

# Database logs
docker compose logs -f postgres

# All services
docker compose logs -f

# With timestamp
docker compose logs -f --timestamps

# Last 100 lines
docker compose logs --tail=100
```

### Health Checks

```bash
# Check all services
curl https://voiceassist.yourdomain.com/health

# Check specific components
curl https://voiceassist.yourdomain.com/health/database
curl https://voiceassist.yourdomain.com/health/redis
curl https://voiceassist.yourdomain.com/health/qdrant
```

---

## Support

**Documentation:** https://github.com/mohammednazmy/VoiceAssist/tree/main/docs
**Issues:** https://github.com/mohammednazmy/VoiceAssist/issues
**Phase 13 Completion:** All deployment features tested and production-ready

---

**Last Updated:** 2025-11-21
**Phase:** 13 - Final Testing & Documentation Complete
