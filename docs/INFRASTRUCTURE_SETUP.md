---
title: "Infrastructure Setup"
slug: "infrastructure-setup"
summary: "This guide covers infrastructure setup for VoiceAssist V2 across two deployment strategies:"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["devops", "sre"]
tags: ["infrastructure", "setup"]
---

# Infrastructure Setup Guide

## Overview

This guide covers infrastructure setup for VoiceAssist V2 across two deployment strategies:

- **Phases 0-10**: Docker Compose on Ubuntu Server (production-ready)
- **Phases 11-14**: Kubernetes on Ubuntu Server (high availability)

Both strategies deploy **two separate stacks**:

- **Nextcloud stack**: Identity, files, calendar, email
- **VoiceAssist stack**: Microservices architecture

## Table of Contents

1. [Ubuntu Server Setup](#ubuntu-server-setup)
2. [Docker Compose Production Deployment](#docker-compose-production-deployment)
3. [Kubernetes Production Deployment](#kubernetes-production-deployment)
4. [Network Configuration](#network-configuration)
5. [SSL/TLS Setup](#ssltls-setup)
6. [Security Hardening](#security-hardening)
7. [Monitoring & Observability](#monitoring--observability)
8. [Backup & Disaster Recovery](#backup--disaster-recovery)
9. [Maintenance Procedures](#maintenance-procedures)

---

## Ubuntu Server Setup

### Server Requirements

**Minimum for Docker Compose (Phases 0-10):**

- Ubuntu 22.04 LTS or 24.04 LTS
- 16GB RAM
- 4 vCPUs
- 200GB SSD storage
- 1 Gbps network
- Static IP address

**Recommended for Kubernetes (Phases 11-14):**

- Ubuntu 22.04 LTS or 24.04 LTS
- 32GB RAM (or 3+ nodes with 16GB each)
- 8 vCPUs (or distributed across nodes)
- 500GB SSD storage
- 10 Gbps network
- Static IP addresses for each node

### Initial Server Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git vim ufw fail2ban \
  ca-certificates gnupg lsb-release

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Set hostname
sudo hostnamectl set-hostname voiceassist-prod

# Configure timezone
sudo timedatectl set-timezone America/New_York  # Adjust as needed

# Create deployment user
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh

# Copy SSH key (from your MacBook)
# On Mac: cat ~/.ssh/id_rsa.pub | ssh root@server 'cat >> /home/deploy/.ssh/authorized_keys'
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh

# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### Install Docker & Docker Compose

```bash
# Add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add deploy user to docker group
sudo usermod -aG docker deploy
newgrp docker

# Verify installation
docker --version
docker compose version

# Configure Docker daemon
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "storage-driver": "overlay2"
}
EOF

sudo systemctl restart docker
sudo systemctl enable docker
```

### Create Directory Structure

```bash
# Create deployment directories
sudo mkdir -p /opt/nextcloud-prod
sudo mkdir -p /opt/voiceassist-prod
sudo mkdir -p /opt/backups
sudo mkdir -p /var/log/voiceassist

# Set ownership
sudo chown -R deploy:deploy /opt/nextcloud-prod
sudo chown -R deploy:deploy /opt/voiceassist-prod
sudo chown -R deploy:deploy /opt/backups
sudo chown -R deploy:deploy /var/log/voiceassist

# Create data directories
sudo mkdir -p /data/nextcloud/{db,data}
sudo mkdir -p /data/voiceassist/{postgres,redis,qdrant}
sudo chown -R deploy:deploy /data
```

---

## Docker Compose Production Deployment

### Architecture Overview

```
Ubuntu Production Server
├── /opt/nextcloud-prod/              # Nextcloud Stack
│   ├── docker-compose.yml
│   ├── .env
│   ├── nginx/                        # Nginx config
│   └── ssl/                          # SSL certificates
│   Running at: https://nextcloud.yourdomain.com
│
└── /opt/voiceassist-prod/            # VoiceAssist Stack
    ├── docker-compose.yml
    ├── .env
    ├── services/                     # Microservices code
    ├── infrastructure/               # Prometheus, Grafana, etc.
    ├── nginx/                        # Nginx config
    └── ssl/                          # SSL certificates
    Running at: https://voiceassist.yourdomain.com
```

### Deploy Nextcloud Stack

#### 1. Copy Files to Server

```bash
# On your MacBook
cd ~/Nextcloud-Dev

# Copy to production server
rsync -avz --exclude 'data' --exclude 'db' \
  ./ deploy@voiceassist-prod:/opt/nextcloud-prod/

# SSH to server
ssh deploy@voiceassist-prod
```

#### 2. Configure Production Environment

```bash
cd /opt/nextcloud-prod

# Create production .env
cat > .env <<'EOF'
# PostgreSQL
POSTGRES_DB=nextcloud
POSTGRES_USER=nextcloud
POSTGRES_PASSWORD=<generate-strong-password>

# Nextcloud
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=<generate-strong-password>
NEXTCLOUD_TRUSTED_DOMAINS=nextcloud.yourdomain.com
OVERWRITEPROTOCOL=https
OVERWRITEHOST=nextcloud.yourdomain.com

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_SECURE=ssl
SMTP_PORT=465
SMTP_NAME=noreply@yourdomain.com
SMTP_PASSWORD=<your-smtp-password>
MAIL_FROM_ADDRESS=noreply
MAIL_DOMAIN=yourdomain.com
EOF

chmod 600 .env
```

#### 3. Create Production docker-compose.yml

```bash
cat > docker-compose.yml <<'EOF'
version: '3.8'

networks:
  nextcloud-network:
  traefik-network:
    external: true

volumes:
  nextcloud-db:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/nextcloud/db
  nextcloud-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/nextcloud/data

services:
  nextcloud-db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - nextcloud-db:/var/lib/postgresql/data
    networks:
      - nextcloud-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 30s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1'

  nextcloud:
    image: nextcloud:latest
    restart: unless-stopped
    environment:
      - POSTGRES_HOST=nextcloud-db
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - NEXTCLOUD_ADMIN_USER=${NEXTCLOUD_ADMIN_USER}
      - NEXTCLOUD_ADMIN_PASSWORD=${NEXTCLOUD_ADMIN_PASSWORD}
      - NEXTCLOUD_TRUSTED_DOMAINS=${NEXTCLOUD_TRUSTED_DOMAINS}
      - OVERWRITEPROTOCOL=${OVERWRITEPROTOCOL}
      - OVERWRITEHOST=${OVERWRITEHOST}
      - SMTP_HOST=${SMTP_HOST:-}
      - SMTP_SECURE=${SMTP_SECURE:-}
      - SMTP_PORT=${SMTP_PORT:-}
      - SMTP_NAME=${SMTP_NAME:-}
      - SMTP_PASSWORD=${SMTP_PASSWORD:-}
      - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-}
      - MAIL_DOMAIN=${MAIL_DOMAIN:-}
    volumes:
      - nextcloud-data:/var/www/html
    depends_on:
      nextcloud-db:
        condition: service_healthy
    networks:
      - nextcloud-network
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nextcloud.rule=Host(`nextcloud.yourdomain.com`)"
      - "traefik.http.routers.nextcloud.entrypoints=websecure"
      - "traefik.http.routers.nextcloud.tls.certresolver=letsencrypt"
      - "traefik.http.services.nextcloud.loadbalancer.server.port=80"
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2'
EOF
```

#### 4. Start Nextcloud Stack

```bash
cd /opt/nextcloud-prod
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f nextcloud
```

### Deploy VoiceAssist Stack

#### 1. Copy Files to Server

```bash
# On your MacBook
cd ~/VoiceAssist

# Build Docker images locally
docker compose build

# Save images to tar
docker save $(docker compose config | grep 'image:' | awk '{print $2}' | grep voiceassist) | gzip > voiceassist-images.tar.gz

# Copy to server
rsync -avz --exclude 'data' --exclude 'node_modules' \
  ./ deploy@voiceassist-prod:/opt/voiceassist-prod/

scp voiceassist-images.tar.gz deploy@voiceassist-prod:/opt/voiceassist-prod/

# SSH to server
ssh deploy@voiceassist-prod
cd /opt/voiceassist-prod

# Load images
docker load < voiceassist-images.tar.gz
rm voiceassist-images.tar.gz
```

#### 2. Configure Production Environment

```bash
cd /opt/voiceassist-prod

# Copy example and edit
cp .env.example .env
vim .env
```

**Production .env:**

```bash
# Environment
ENVIRONMENT=production
LOG_LEVEL=INFO
DEBUG=false

# Nextcloud Integration
NEXTCLOUD_BASE_URL=https://nextcloud.yourdomain.com
NEXTCLOUD_OIDC_ISSUER=https://nextcloud.yourdomain.com
NEXTCLOUD_CLIENT_ID=<from-nextcloud-oidc-config>
NEXTCLOUD_CLIENT_SECRET=<from-nextcloud-oidc-config>
NEXTCLOUD_REDIRECT_URI=https://voiceassist.yourdomain.com/auth/callback
NEXTCLOUD_WEBDAV_URL=https://nextcloud.yourdomain.com/remote.php/dav
NEXTCLOUD_CALDAV_URL=https://nextcloud.yourdomain.com/remote.php/dav/calendars
NEXTCLOUD_CARDDAV_URL=https://nextcloud.yourdomain.com/remote.php/dav/addressbooks

# Database
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=voiceassist
DATABASE_URL=postgresql://voiceassist:<password>@postgres:5432/voiceassist

# Redis
REDIS_PASSWORD=<generate-strong-password>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# Qdrant
QDRANT_API_KEY=<generate-strong-password>
QDRANT_URL=http://qdrant:6333

# OpenAI
OPENAI_API_KEY=sk-your-production-key

# API Keys (UpToDate, OpenEvidence)
UPTODATE_API_KEY=<your-key>
UPTODATE_API_SECRET=<your-secret>
OPENEVIDENCE_API_KEY=<your-key>

# JWT
JWT_SECRET=<generate-strong-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRATION=3600

# Monitoring
PROMETHEUS_RETENTION_TIME=30d
GRAFANA_ADMIN_PASSWORD=<generate-strong-password>

# Email (for alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=<your-smtp-password>
ALERT_EMAIL=admin@yourdomain.com
```

#### 3. Update docker-compose.yml for Production

Add resource limits, restart policies, and Traefik labels to the VoiceAssist docker-compose.yml. See phase documents for complete configuration.

#### 4. Start VoiceAssist Stack

```bash
cd /opt/voiceassist-prod
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Deploy Traefik (Reverse Proxy)

Create a separate Traefik stack for SSL termination:

```bash
sudo mkdir -p /opt/traefik
cd /opt/traefik

# Create docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: '3.8'

networks:
  traefik-network:
    name: traefik-network
    driver: bridge

volumes:
  traefik-certs:

services:
  traefik:
    image: traefik:v2.10
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certs:/letsencrypt
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.yourdomain.com`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.service=api@internal"
EOF

# Create traefik.yml
cat > traefik.yml <<'EOF'
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: traefik-network

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@yourdomain.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
EOF

# Start Traefik
docker compose up -d
```

---

## Kubernetes Production Deployment

### Kubernetes Cluster Setup

#### Option 1: K3s (Lightweight, recommended for single node)

```bash
# Install K3s
curl -sfL https://get.k3s.io | sh -

# Verify installation
sudo k3s kubectl get nodes

# Copy kubeconfig
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# Install kubectl
sudo snap install kubectl --classic

# Verify
kubectl get nodes
```

#### Option 2: Kubeadm (Multi-node cluster)

```bash
# On all nodes: Install container runtime (containerd)
sudo apt install -y containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo systemctl restart containerd

# On all nodes: Install kubeadm, kubelet, kubectl
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# On master node: Initialize cluster
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# Configure kubectl
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Install CNI (Calico)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.0/manifests/calico.yaml

# On worker nodes: Join cluster (use token from kubeadm init output)
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

### Deploy to Kubernetes

See [COMPOSE_TO_K8S_MIGRATION.md](./COMPOSE_TO_K8S_MIGRATION.md) for detailed migration from Docker Compose to Kubernetes.

**High-level steps:**

1. Create namespaces for nextcloud and voiceassist
2. Convert docker-compose.yml to Kubernetes manifests (Deployments, Services, ConfigMaps, Secrets)
3. Set up persistent storage (PersistentVolumeClaims)
4. Configure Ingress with cert-manager for SSL
5. Deploy observability stack (Prometheus, Grafana, Jaeger, Loki)
6. Configure HorizontalPodAutoscaler for scaling
7. Set up Network Policies for security

---

## Network Configuration

### DNS Configuration

```
# A Records
nextcloud.yourdomain.com    → <server-ip>
voiceassist.yourdomain.com  → <server-ip>
traefik.yourdomain.com      → <server-ip>
grafana.yourdomain.com      → <server-ip>
prometheus.yourdomain.com   → <server-ip>
```

### Firewall Rules

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (change port if using non-standard)
sudo ufw allow 22/tcp

# Kubernetes (if using K8s)
sudo ufw allow 6443/tcp  # API server
sudo ufw allow 2379:2380/tcp  # etcd
sudo ufw allow 10250/tcp  # kubelet

# Enable firewall
sudo ufw enable
```

---

## SSL/TLS Setup

### Automatic SSL with Traefik + Let's Encrypt

Traefik automatically obtains and renews SSL certificates. Configuration already included in Traefik docker-compose.yml above.

### Manual SSL Setup (Alternative)

```bash
# Install certbot
sudo apt install -y certbot

# Obtain certificates
sudo certbot certonly --standalone -d nextcloud.yourdomain.com
sudo certbot certonly --standalone -d voiceassist.yourdomain.com

# Certificates stored in:
# /etc/letsencrypt/live/nextcloud.yourdomain.com/
# /etc/letsencrypt/live/voiceassist.yourdomain.com/

# Auto-renewal (already configured by certbot)
sudo systemctl status certbot.timer
```

---

## Security Hardening

### 1. Enable Fail2Ban

```bash
sudo apt install -y fail2ban

# Configure for SSH
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo vim /etc/fail2ban/jail.local

# Enable SSH jail
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600

sudo systemctl restart fail2ban
```

### 2. Disable Password Authentication

```bash
sudo vim /etc/ssh/sshd_config

# Set:
PasswordAuthentication no
PubkeyAuthentication yes

sudo systemctl restart ssh
```

### 3. Enable Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 4. Configure AppArmor

```bash
# Check AppArmor status
sudo aa-status

# Enable AppArmor profiles for Docker
sudo apt install -y apparmor-profiles apparmor-utils
```

### 5. Network Policies (Kubernetes)

See phase documents for detailed NetworkPolicy configurations that enforce zero-trust networking.

---

## Monitoring & Observability

### Access Monitoring Services

After deployment:

- **Grafana**: https://grafana.yourdomain.com (admin / <GRAFANA_ADMIN_PASSWORD>)
- **Prometheus**: https://prometheus.yourdomain.com
- **Jaeger**: https://jaeger.yourdomain.com
- **Traefik Dashboard**: https://traefik.yourdomain.com

### Configure Alerting

Edit `/opt/voiceassist-prod/infrastructure/prometheus/alerts.yml`:

```yaml
groups:
  - name: voiceassist_alerts
    interval: 30s
    rules:
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"

      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
```

---

## Backup & Disaster Recovery

### Automated Backup Script

```bash
sudo mkdir -p /opt/scripts
sudo vim /opt/scripts/backup.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup Nextcloud database
docker exec nextcloud-prod-nextcloud-db-1 pg_dump -U nextcloud nextcloud | gzip > "$BACKUP_DIR/nextcloud_db_$DATE.sql.gz"

# Backup Nextcloud data
tar czf "$BACKUP_DIR/nextcloud_data_$DATE.tar.gz" /data/nextcloud/data

# Backup VoiceAssist database
docker exec voiceassist-prod-postgres-1 pg_dump -U voiceassist voiceassist | gzip > "$BACKUP_DIR/voiceassist_db_$DATE.sql.gz"

# Backup Qdrant data
tar czf "$BACKUP_DIR/qdrant_data_$DATE.tar.gz" /data/voiceassist/qdrant

# Backup Redis data
docker exec voiceassist-prod-redis-1 redis-cli --rdb /data/dump.rdb
docker cp voiceassist-prod-redis-1:/data/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Delete backups older than 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 sync "$BACKUP_DIR" s3://your-bucket/voiceassist-backups/

echo "Backup completed: $DATE"
```

```bash
sudo chmod +x /opt/scripts/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/scripts/backup.sh") | crontab -
```

### Restore Procedure

```bash
# Restore Nextcloud DB
gunzip < /opt/backups/nextcloud_db_20241119.sql.gz | docker exec -i nextcloud-prod-nextcloud-db-1 psql -U nextcloud -d nextcloud

# Restore Nextcloud data
cd /data/nextcloud
sudo rm -rf data
sudo tar xzf /opt/backups/nextcloud_data_20241119.tar.gz
sudo chown -R 33:33 data  # www-data user in container

# Restore VoiceAssist DB
gunzip < /opt/backups/voiceassist_db_20241119.sql.gz | docker exec -i voiceassist-prod-postgres-1 psql -U voiceassist -d voiceassist

# Restart services
cd /opt/nextcloud-prod && docker compose restart
cd /opt/voiceassist-prod && docker compose restart
```

---

## Maintenance Procedures

### Update Docker Images

```bash
# Pull latest images
cd /opt/nextcloud-prod
docker compose pull

cd /opt/voiceassist-prod
docker compose pull

# Recreate containers
docker compose up -d

# Remove old images
docker image prune -af
```

### View Logs

```bash
# Nextcloud logs
cd /opt/nextcloud-prod
docker compose logs -f nextcloud

# VoiceAssist logs
cd /opt/voiceassist-prod
docker compose logs -f api-gateway

# All services
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100
```

### Database Maintenance

```bash
# Vacuum PostgreSQL (Nextcloud)
docker exec nextcloud-prod-nextcloud-db-1 vacuumdb -U nextcloud -d nextcloud --analyze

# Vacuum PostgreSQL (VoiceAssist)
docker exec voiceassist-prod-postgres-1 vacuumdb -U voiceassist -d voiceassist --analyze

# Redis info
docker exec voiceassist-prod-redis-1 redis-cli info
```

### Disk Space Management

```bash
# Check disk usage
df -h

# Docker disk usage
docker system df

# Clean up unused Docker resources
docker system prune -af --volumes

# Check specific directory sizes
du -sh /data/*
du -sh /opt/*
du -sh /opt/backups/*
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker compose ps

# View logs
docker compose logs <service-name>

# Check resource usage
docker stats

# Check for port conflicts
sudo netstat -tulpn | grep <port>
```

### Database Connection Issues

```bash
# Test database connectivity
docker exec voiceassist-prod-postgres-1 pg_isready -U voiceassist

# Check database logs
docker logs voiceassist-prod-postgres-1

# Restart database
docker compose restart postgres
```

### SSL Certificate Issues

```bash
# Check certificate expiration
echo | openssl s_client -servername voiceassist.yourdomain.com -connect voiceassist.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Force certificate renewal (Traefik)
docker exec traefik cat /letsencrypt/acme.json

# Restart Traefik
cd /opt/traefik
docker compose restart
```

### Performance Issues

```bash
# Check system resources
htop
free -h
df -h

# Check Docker stats
docker stats

# Review Grafana dashboards
# https://grafana.yourdomain.com

# Check slow queries (PostgreSQL)
docker exec voiceassist-prod-postgres-1 psql -U voiceassist -d voiceassist -c "SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;"
```

---

## Migration Between Environments

### From Docker Compose to Kubernetes

See [COMPOSE_TO_K8S_MIGRATION.md](./COMPOSE_TO_K8S_MIGRATION.md) for comprehensive guide.

### From Development to Production

```bash
# On MacBook: Export images
cd ~/VoiceAssist
docker compose build
docker save $(docker compose images -q) | gzip > voiceassist-prod.tar.gz

# Copy to server
scp voiceassist-prod.tar.gz deploy@server:/opt/voiceassist-prod/

# On server: Load and start
cd /opt/voiceassist-prod
docker load < voiceassist-prod.tar.gz
docker compose up -d
```

---

## Next Steps

1. **Phase 0-10**: Use Docker Compose deployment instructions above
2. **Phase 11-12**: Migrate to Kubernetes using migration guide
3. **Phase 13-14**: Production hardening and final deployment
4. **Post-Deployment**: Set up monitoring, backups, and maintenance procedures

## References

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Nextcloud Admin Manual](https://docs.nextcloud.com/server/latest/admin_manual/)
- [COMPOSE_TO_K8S_MIGRATION.md](./COMPOSE_TO_K8S_MIGRATION.md)
- [SECURITY_COMPLIANCE.md](./SECURITY_COMPLIANCE.md)
