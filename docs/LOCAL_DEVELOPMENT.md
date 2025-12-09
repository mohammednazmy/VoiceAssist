---
title: Local Development
slug: local-development
summary: >-
  VoiceAssist V2 uses a **Compose-first development approach** with two separate
  Docker Compose stacks:
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - local
  - development
category: reference
component: "infra/development"
relatedPaths:
  - "docker-compose.yml"
  - "Makefile"
  - "package.json"
  - "pnpm-workspace.yaml"
ai_summary: >-
  VoiceAssist V2 uses a Compose-first development approach with two separate
  Docker Compose stacks: - Nextcloud stack (~/Nextcloud-Dev/) - Identity, files,
  calendar, email - VoiceAssist stack (~/VoiceAssist/) - Microservices
  architecture This allows for rapid iteration, testing, and debugging befor...
---

# Local Development Guide (MacBook Pro)

## Overview

VoiceAssist V2 uses a **Compose-first development approach** with two separate Docker Compose stacks:

- **Nextcloud stack** (~/Nextcloud-Dev/) - Identity, files, calendar, email
- **VoiceAssist stack** (~/VoiceAssist/) - Microservices architecture

This allows for rapid iteration, testing, and debugging before deploying to Kubernetes.

## Development Philosophy

- **Compose-First**: Docker Compose for all development and initial production
- **Local-First**: Develop and test everything on Mac
- **Separate Stacks**: Nextcloud and VoiceAssist run independently
- **API Integration**: Stacks communicate via HTTP APIs (OIDC, WebDAV, CalDAV)
- **Kubernetes-Later**: Migrate to K8s when scaling requires
- **Ubuntu-Last**: Deploy to production when ready

## Local Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MacBook Pro (Development)                          │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Nextcloud Stack (~/Nextcloud-Dev/)                              ││
│  │ http://localhost:8080                                           ││
│  │                                                                  ││
│  │  ┌────────────┐     ┌──────────────┐                           ││
│  │  │ Nextcloud  │────▶│ PostgreSQL   │                           ││
│  │  │ (Identity) │     │ (Nextcloud)  │                           ││
│  │  └────────────┘     └──────────────┘                           ││
│  │  - OIDC Provider                                                ││
│  │  - File Storage (WebDAV)                                        ││
│  │  - Calendar (CalDAV)                                            ││
│  │  - Email/Contacts                                               ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                │                                      │
│                                │ HTTP APIs                            │
│                                │ (OIDC, WebDAV, CalDAV)               │
│                                ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ VoiceAssist Stack (~/VoiceAssist/)                              ││
│  │ http://localhost:8000                                           ││
│  │                                                                  ││
│  │  ┌────────────┐     ┌──────────────┐     ┌─────────────┐      ││
│  │  │ API        │────▶│ PostgreSQL   │     │ Redis       │      ││
│  │  │ Gateway    │     │ (VoiceAssist)│     │ (Sessions)  │      ││
│  │  └─────┬──────┘     └──────────────┘     └─────────────┘      ││
│  │        │                                                        ││
│  │        ├───────┬───────┬───────┬───────┬───────┐              ││
│  │        │       │       │       │       │       │              ││
│  │  ┌─────▼──┐ ┌─▼────┐ ┌▼────┐ ┌▼────┐ ┌▼────┐ │              ││
│  │  │ Voice  │ │Medical│ │Auth │ │File │ │Cal/ │ ...            ││
│  │  │ Proxy  │ │  KB   │ │ Svc │ │Index│ │Email│                ││
│  │  └────────┘ └───────┘ └─────┘ └─────┘ └─────┘                ││
│  │  - WebRTC Voice Pipeline                                       ││
│  │  - Medical AI (RAG)                                            ││
│  │  - Microservices                                               ││
│  │  - Observability (Prometheus, Grafana, Jaeger, Loki)          ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Prerequisites for MacBook Pro

### System Requirements

- macOS 12 (Monterey) or newer
- 16GB RAM minimum (32GB recommended for full stack)
- 100GB free disk space (Docker images + volumes)
- Admin access

### Required Software

1. **Docker Desktop** (4.25+)
   - Includes Docker Compose V2
   - Resource limits: 8GB RAM, 4 CPUs minimum
2. **Git** (for version control)
3. **Make** (optional, for convenience commands)
4. **Text Editor** (VS Code recommended)

### Installation

```bash
# Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop/

# Verify Docker installation
docker --version
docker compose version

# Install Make (if not already installed)
xcode-select --install

# Install Git (if not already installed)
brew install git

# Clone repository (if not already done)
git clone <your-repo-url> ~/VoiceAssist
cd ~/VoiceAssist
```

## Ports and Services

Local development uses the following ports:

| Port     | Service                | URL                   | Description                                |
| -------- | ---------------------- | --------------------- | ------------------------------------------ |
| **8000** | FastAPI Main API       | http://localhost:8000 | Backend API Gateway                        |
| **5173** | Web App Dev Server     | http://localhost:5173 | Doctor-facing web interface                |
| **5174** | Admin Panel Dev Server | http://localhost:5174 | System administration panel                |
| **8080** | Nextcloud              | http://localhost:8080 | Identity, files, calendar (separate stack) |
| **5432** | PostgreSQL             | localhost:5432        | Primary database                           |
| **6379** | Redis                  | localhost:6379        | Cache and sessions                         |
| **6333** | Qdrant                 | http://localhost:6333 | Vector database                            |
| **8081** | Nextcloud Dev (alt)    | http://localhost:8081 | Alternative Nextcloud port                 |
| **9090** | Prometheus             | http://localhost:9090 | Metrics collection                         |
| **3000** | Grafana                | http://localhost:3000 | Monitoring dashboards                      |

## Initial Setup (One-Time)

### 1. Set Up Nextcloud Dev Stack

```bash
# Create Nextcloud development directory
mkdir -p ~/Nextcloud-Dev
cd ~/Nextcloud-Dev

# Create docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: '3.8'

networks:
  nextcloud-network:

volumes:
  nextcloud-db:
  nextcloud-data:

services:
  nextcloud-db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: nextcloud_dev_password
    volumes:
      - nextcloud-db:/var/lib/postgresql/data
    networks:
      - nextcloud-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nextcloud"]
      interval: 10s
      timeout: 5s
      retries: 5

  nextcloud:
    image: nextcloud:latest
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - POSTGRES_HOST=nextcloud-db
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=nextcloud_dev_password
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=admin_dev_password
      - NEXTCLOUD_TRUSTED_DOMAINS=localhost nextcloud.local
      - OVERWRITEPROTOCOL=http
    volumes:
      - nextcloud-data:/var/www/html
    depends_on:
      nextcloud-db:
        condition: service_healthy
    networks:
      - nextcloud-network
EOF

# Start Nextcloud stack
docker compose up -d

# Wait for Nextcloud to be ready (2-3 minutes)
echo "Waiting for Nextcloud to start..."
sleep 120

# Check status
docker compose ps
```

### 2. Configure Nextcloud for OIDC

```bash
# Access Nextcloud at http://localhost:8080
# Login: admin / admin_dev_password

# Install required apps via web UI:
# 1. Go to Apps → Search "OpenID Connect"
# 2. Install "OpenID Connect Login"
# 3. Go to Settings → OpenID Connect

# Or install via CLI:
docker compose exec nextcloud php occ app:install user_oidc
docker compose exec nextcloud php occ app:enable user_oidc
```

**Manual Configuration Steps:**

1. Open http://localhost:8080 in browser
2. Login as admin
3. Go to Settings → Security → OpenID Connect
4. Click "Add OpenID Provider"
5. Configure:
   - **Identifier**: `voiceassist`
   - **Client ID**: `voiceassist-client` (generate random: `openssl rand -hex 16`)
   - **Client Secret**: (generate random: `openssl rand -hex 32`)
   - **Discovery Endpoint**: Leave blank (we'll use Nextcloud as provider)
6. Save the Client ID and Client Secret for VoiceAssist configuration

See [NEXTCLOUD_INTEGRATION.md](./NEXTCLOUD_INTEGRATION.md) for detailed configuration.

### 3. Configure /etc/hosts

```bash
# Add entries for local development
sudo vim /etc/hosts

# Add these lines:
127.0.0.1 nextcloud.local
127.0.0.1 voiceassist.local
```

### 4. Set Up VoiceAssist Stack

```bash
cd ~/VoiceAssist

# Copy example environment file
cp .env.example .env

# Edit .env with Nextcloud configuration
vim .env
```

**Update these variables in .env:**

```bash
# Nextcloud Integration
NEXTCLOUD_BASE_URL=http://localhost:8080
NEXTCLOUD_OIDC_ISSUER=http://localhost:8080
NEXTCLOUD_CLIENT_ID=<from-nextcloud-oidc-setup>
NEXTCLOUD_CLIENT_SECRET=<from-nextcloud-oidc-setup>
NEXTCLOUD_REDIRECT_URI=http://localhost:8000/auth/callback
NEXTCLOUD_WEBDAV_URL=http://localhost:8080/remote.php/dav
NEXTCLOUD_CALDAV_URL=http://localhost:8080/remote.php/dav/calendars
NEXTCLOUD_CARDDAV_URL=http://localhost:8080/remote.php/dav/addressbooks

# Database
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=voiceassist
DATABASE_URL=postgresql://voiceassist:<password>@postgres:5432/voiceassist

# Redis
REDIS_PASSWORD=<generate-strong-password>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Environment
ENVIRONMENT=development
LOG_LEVEL=DEBUG
```

### 5. Initialize VoiceAssist Stack

**Note:** The docker-compose.yml will be created during Phase 0. For now, ensure the directory structure is ready:

```bash
cd ~/VoiceAssist

# Create directory structure
mkdir -p services/{api-gateway,voice-proxy,auth-service,medical-kb,file-indexer,calendar-email,guideline-scraper,medical-calculator,phi-detection,admin-api}
mkdir -p infrastructure/docker/{prometheus,grafana,loki,jaeger}
mkdir -p data/{postgres,redis,qdrant}
mkdir -p logs
mkdir -p tests
```

## Daily Development Workflow

### Starting Both Stacks

Create a convenience script: `~/VoiceAssist/scripts/dev-start.sh`

```bash
#!/bin/bash

echo "Starting VoiceAssist Development Environment..."
echo ""

# Start Nextcloud stack
echo "1. Starting Nextcloud stack..."
cd ~/Nextcloud-Dev
docker compose up -d

echo "   ✓ Nextcloud: http://localhost:8080"
echo ""

# Wait a moment for Nextcloud to be ready
sleep 5

# Start VoiceAssist stack
echo "2. Starting VoiceAssist stack..."
cd ~/VoiceAssist
docker compose up -d

echo "   ✓ VoiceAssist: http://localhost:8000"
echo ""

echo "Development environment ready!"
echo ""
echo "Access:"
echo "  - Nextcloud:    http://localhost:8080"
echo "  - VoiceAssist:  http://localhost:8000"
echo "  - Prometheus:   http://localhost:9090"
echo "  - Grafana:      http://localhost:3000"
echo "  - Jaeger UI:    http://localhost:16686"
echo ""
echo "Logs:"
echo "  cd ~/VoiceAssist && docker compose logs -f"
```

```bash
chmod +x ~/VoiceAssist/scripts/dev-start.sh
```

### Stopping Both Stacks

Create a convenience script: `~/VoiceAssist/scripts/dev-stop.sh`

```bash
#!/bin/bash

echo "Stopping VoiceAssist Development Environment..."
echo ""

# Stop VoiceAssist stack
echo "1. Stopping VoiceAssist stack..."
cd ~/VoiceAssist
docker compose down

# Stop Nextcloud stack
echo "2. Stopping Nextcloud stack..."
cd ~/Nextcloud-Dev
docker compose down

echo ""
echo "Development environment stopped."
```

```bash
chmod +x ~/VoiceAssist/scripts/dev-stop.sh
```

### Viewing Logs

```bash
# All VoiceAssist services
cd ~/VoiceAssist
docker compose logs -f

# Specific service
docker compose logs -f api-gateway
docker compose logs -f voice-proxy

# Nextcloud logs
cd ~/Nextcloud-Dev
docker compose logs -f nextcloud

# Last 100 lines from all services
cd ~/VoiceAssist
docker compose logs --tail=100
```

### Rebuilding Services

```bash
# Rebuild specific service after code changes
cd ~/VoiceAssist
docker compose build api-gateway
docker compose up -d api-gateway

# Rebuild all services
docker compose build
docker compose up -d

# Force rebuild (no cache)
docker compose build --no-cache
docker compose up -d
```

### Running Service Tests

```bash
# Run tests for a specific service
cd ~/VoiceAssist/services/api-gateway
docker compose run --rm api-gateway pytest

# Run all tests
cd ~/VoiceAssist
docker compose run --rm api-gateway pytest /app/tests
```

## Development Ports

### Nextcloud Stack (Port 8080)

| Service       | Port | URL                       | Purpose                          |
| ------------- | ---- | ------------------------- | -------------------------------- |
| Nextcloud Web | 8080 | http://localhost:8080     | Identity, Files, Calendar, Email |
| Nextcloud DB  | 5433 | localhost:5433 (internal) | PostgreSQL for Nextcloud         |

### VoiceAssist Stack (Port 8000+)

| Service            | Port  | URL                       | Purpose                 |
| ------------------ | ----- | ------------------------- | ----------------------- |
| API Gateway        | 8000  | http://localhost:8000     | Main entry point        |
| Voice Proxy        | 8001  | http://localhost:8001     | WebRTC voice            |
| Auth Service       | 8002  | http://localhost:8002     | Authentication          |
| Medical KB         | 8003  | http://localhost:8003     | RAG system              |
| File Indexer       | 8004  | http://localhost:8004     | Document indexing       |
| Calendar/Email     | 8005  | http://localhost:8005     | Calendar/email ops      |
| Guideline Scraper  | 8006  | http://localhost:8006     | Guideline ingestion     |
| Medical Calculator | 8007  | http://localhost:8007     | Medical calculations    |
| PHI Detection      | 8008  | http://localhost:8008     | PHI detection/redaction |
| Admin API          | 8009  | http://localhost:8009     | Admin operations        |
| PostgreSQL         | 5432  | localhost:5432 (internal) | Main database           |
| Redis              | 6379  | localhost:6379 (internal) | Cache/sessions          |
| Qdrant             | 6333  | http://localhost:6333     | Vector database         |
| Prometheus         | 9090  | http://localhost:9090     | Metrics                 |
| Grafana            | 3000  | http://localhost:3000     | Dashboards              |
| Jaeger UI          | 16686 | http://localhost:16686    | Tracing UI              |
| Loki               | 3100  | http://localhost:3100     | Log aggregation         |

## Database Management

### Accessing PostgreSQL

```bash
# VoiceAssist database
cd ~/VoiceAssist
docker compose exec postgres psql -U voiceassist -d voiceassist

# Nextcloud database
cd ~/Nextcloud-Dev
docker compose exec nextcloud-db psql -U nextcloud -d nextcloud
```

### Running Migrations

```bash
# VoiceAssist migrations (Alembic)
cd ~/VoiceAssist
docker compose exec api-gateway alembic upgrade head

# Create new migration
docker compose exec api-gateway alembic revision --autogenerate -m "description"
```

### Database Backup

```bash
# Backup VoiceAssist DB
cd ~/VoiceAssist
docker compose exec postgres pg_dump -U voiceassist voiceassist > backups/voiceassist_$(date +%Y%m%d).sql

# Backup Nextcloud DB
cd ~/Nextcloud-Dev
docker compose exec nextcloud-db pg_dump -U nextcloud nextcloud > backups/nextcloud_$(date +%Y%m%d).sql
```

### Database Restore

```bash
# Restore VoiceAssist DB
cd ~/VoiceAssist
cat backups/voiceassist_20241119.sql | docker compose exec -T postgres psql -U voiceassist -d voiceassist

# Restore Nextcloud DB
cd ~/Nextcloud-Dev
cat backups/nextcloud_20241119.sql | docker compose exec -T nextcloud-db psql -U nextcloud -d nextcloud
```

## Testing Integration

### Test Nextcloud Connectivity

```bash
# Test OIDC discovery
curl http://localhost:8080/.well-known/openid-configuration

# Test WebDAV
curl -u admin:admin_dev_password \
  -X PROPFIND \
  http://localhost:8080/remote.php/dav/files/admin/

# Test CalDAV
curl -u admin:admin_dev_password \
  -X PROPFIND \
  http://localhost:8080/remote.php/dav/calendars/admin/
```

### Test VoiceAssist Services

```bash
# Health checks
curl http://localhost:8000/health
curl http://localhost:8001/health

# Test authentication flow
curl http://localhost:8000/auth/login
# Should redirect to Nextcloud OIDC

# Test metrics endpoint
curl http://localhost:9090/api/v1/query?query=up
```

## Troubleshooting

### Nextcloud Stack Issues

```bash
# Check Nextcloud status
cd ~/Nextcloud-Dev
docker compose ps

# View Nextcloud logs
docker compose logs -f nextcloud

# Restart Nextcloud
docker compose restart nextcloud

# Reset Nextcloud (WARNING: deletes data)
docker compose down -v
docker compose up -d
```

### VoiceAssist Stack Issues

```bash
# Check service status
cd ~/VoiceAssist
docker compose ps

# View specific service logs
docker compose logs -f api-gateway

# Restart specific service
docker compose restart api-gateway

# Rebuild and restart
docker compose build api-gateway
docker compose up -d api-gateway

# Reset everything (WARNING: deletes data)
docker compose down -v
docker compose up -d
```

### Port Conflicts

```bash
# Check what's using a port
lsof -ti:8080
lsof -ti:8000

# Kill process using port
kill -9 $(lsof -ti:8080)

# Change port in docker-compose.yml if needed
```

### Docker Desktop Issues

```bash
# Check Docker status
docker info

# Restart Docker Desktop
# Use Docker Desktop menu → Restart

# Check disk space
docker system df

# Clean up unused resources
docker system prune -a --volumes
```

### Integration Issues

**OIDC not working:**

1. Verify NEXTCLOUD_CLIENT_ID and NEXTCLOUD_CLIENT_SECRET in .env
2. Check Nextcloud OIDC app is enabled
3. Verify NEXTCLOUD_REDIRECT_URI matches in both systems
4. Check logs: `docker compose logs -f auth-service`

**WebDAV not accessible:**

1. Verify user credentials
2. Check NEXTCLOUD_WEBDAV_URL is correct
3. Test with curl: `curl -u admin:password http://localhost:8080/remote.php/dav/`

**CalDAV issues:**

1. Verify calendar exists in Nextcloud
2. Check NEXTCLOUD_CALDAV_URL
3. Test calendar access through Nextcloud web UI first

### Performance Issues

```bash
# Check Docker resource usage
docker stats

# Increase Docker Desktop resources:
# Docker Desktop → Settings → Resources
# Recommended: 8GB RAM, 4 CPUs

# Check container resource limits
cd ~/VoiceAssist
docker compose config | grep -A 5 "resources:"
```

## Development Best Practices

### 1. Always Start Nextcloud First

Nextcloud must be running before VoiceAssist services that depend on OIDC.

```bash
# Good workflow:
~/VoiceAssist/scripts/dev-start.sh

# Or manually:
cd ~/Nextcloud-Dev && docker compose up -d
sleep 10
cd ~/VoiceAssist && docker compose up -d
```

### 2. Use Docker Compose Profiles

Define profiles in docker-compose.yml to start subsets of services:

```bash
# Start only core services
docker compose --profile core up -d

# Start with observability
docker compose --profile core --profile observability up -d
```

### 3. Watch Logs in Separate Terminal

```bash
# Terminal 1: Watch all logs
cd ~/VoiceAssist
docker compose logs -f

# Terminal 2: Development work
cd ~/VoiceAssist/services/api-gateway
vim app/main.py
docker compose build api-gateway
docker compose restart api-gateway
```

### 4. Use Health Checks

```bash
# Check all services are healthy
cd ~/VoiceAssist
docker compose ps

# Wait for all services to be healthy
./scripts/wait-for-healthy.sh
```

### 5. Hot Reload During Development

Mount source code as volumes for hot reload (defined in docker-compose.yml):

```yaml
services:
  api-gateway:
    build: ./services/api-gateway
    volumes:
      - ./services/api-gateway:/app # Hot reload
    environment:
      - RELOAD=true # FastAPI --reload
```

### 6. Test Before Committing

```bash
# Run tests
cd ~/VoiceAssist
docker compose run --rm api-gateway pytest

# Run linting
docker compose run --rm api-gateway black .
docker compose run --rm api-gateway ruff check .

# Build all services to catch errors
docker compose build
```

### 7. Regular Backups

```bash
# Backup databases weekly
~/VoiceAssist/scripts/backup-dev.sh
```

## IDE Setup Recommendations

### VS Code

**Extensions:**

- Docker
- Python
- Pylance
- ESLint
- Prettier
- Remote - Containers (optional: develop inside containers)

**Settings (.vscode/settings.json):**

```json
{
  "python.defaultInterpreterPath": "/usr/local/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": false,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "[python]": {
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  }
}
```

**Tasks (.vscode/tasks.json):**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Dev Environment",
      "type": "shell",
      "command": "${workspaceFolder}/scripts/dev-start.sh",
      "problemMatcher": []
    },
    {
      "label": "Stop Dev Environment",
      "type": "shell",
      "command": "${workspaceFolder}/scripts/dev-stop.sh",
      "problemMatcher": []
    },
    {
      "label": "View Logs",
      "type": "shell",
      "command": "cd ${workspaceFolder} && docker compose logs -f",
      "problemMatcher": []
    }
  ]
}
```

## Moving to Kubernetes (Phases 11-14)

When ready to migrate to Kubernetes:

1. **Phase 11**: Create Kubernetes manifests from docker-compose.yml
2. **Phase 12**: Test locally with K3s/Minikube
3. **Phase 13**: Deploy to production K8s cluster
4. **Phase 14**: Production hardening and monitoring

See [COMPOSE_TO_K8S_MIGRATION.md](./COMPOSE_TO_K8S_MIGRATION.md) for detailed migration guide.

## Moving to Ubuntu Production

When ready to deploy to production server:

1. Export Docker images: `docker save <images> | gzip > images.tar.gz`
2. Copy to Ubuntu: `scp images.tar.gz user@ubuntu:~/`
3. Load on Ubuntu: `docker load < images.tar.gz`
4. Copy docker-compose.yml and .env
5. Start: `docker compose up -d`

See [INFRASTRUCTURE_SETUP.md](./INFRASTRUCTURE_SETUP.md) for production deployment.

## Getting Help

- **Documentation**: `~/VoiceAssist/docs/`
- **Phase Instructions**: `~/VoiceAssist/docs/phases/`
- **Integration Guide**: `~/VoiceAssist/docs/NEXTCLOUD_INTEGRATION.md`
- **Current Status**: `~/VoiceAssist/CURRENT_PHASE.md`
- **Commit History**: `git log --oneline`

## Next Steps

1. ✅ Set up Nextcloud dev stack (~/Nextcloud-Dev/)
2. ✅ Configure Nextcloud OIDC
3. ✅ Set up VoiceAssist directory (~/VoiceAssist/)
4. ✅ Configure .env with Nextcloud integration
5. 🔄 Begin Phase 0: Project Initialization
6. 🔄 Follow phase documents sequentially

---

**Remember**: Keep Nextcloud and VoiceAssist as separate stacks. They integrate via HTTP APIs, not shared Docker Compose projects.
