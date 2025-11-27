---
title: "Phase 00 Initialization"
slug: "phases/phase-00-initialization"
summary: "**Status:** Ready to Start"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["phase", "initialization"]
---

# Phase 0: Project Initialization & Architecture Setup

**Status:** Ready to Start
**Duration:** 4-6 hours
**Approach:** Docker Compose First

## Goal

Set up complete project structure, install Docker Desktop, create base docker-compose.yml, and initialize all documentation for enterprise microservices development.

## Prerequisites

- macOS 12+ with admin access
- 16GB+ RAM (32GB recommended)
- 50GB+ free disk space
- Internet connection
- OpenAI API key

## Related Documentation

**Read these specifications before starting:**

- 📘 **[ARCHITECTURE_V2.md](../ARCHITECTURE_V2.md)** - System architecture overview
- 📘 **[COMPOSE_FIRST_SUMMARY.md](../COMPOSE_FIRST_SUMMARY.md)** - Compose-first development strategy
- 📘 **[LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)** - Local development setup guide
- 📘 **[WEB_APP_SPECS.md](../WEB_APP_SPECS.md)** - Doctor-facing web app specifications
- 📘 **[ADMIN_PANEL_SPECS.md](../ADMIN_PANEL_SPECS.md)** - Admin panel specifications
- 📘 **[SEMANTIC_SEARCH_DESIGN.md](../SEMANTIC_SEARCH_DESIGN.md)** - Knowledge base & search design
- 📘 **[SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md)** - HIPAA & security requirements
- 📘 **[NEXTCLOUD_INTEGRATION.md](../NEXTCLOUD_INTEGRATION.md)** - Nextcloud integration guide

## Entry Checklist

- [ ] Running macOS 12+ (Monterey or newer)
- [ ] Have admin/sudo access
- [ ] Have OpenAI API key ready
- [ ] Have at least 50GB free disk space
- [ ] Have read DEVELOPMENT_PHASES_V2.md
- [ ] Have read ARCHITECTURE_V2.md
- [ ] Have reviewed specifications listed above

---

## Section A: Docker Compose Implementation

### Objectives

1. Create comprehensive directory structure for microservices
2. Install Docker Desktop for Mac
3. Create base docker-compose.yml skeleton
4. Set up local domain resolution (/etc/hosts)
5. Initialize git repository with proper .gitignore
6. Create all initial documentation
7. Set up CURRENT_PHASE.md tracking system
8. Verify development environment

### Deliverables

- Complete project directory structure
- Docker Desktop installed and running
- Base docker-compose.yml created
- /etc/hosts configured for local domains
- Git repository initialized
- Initial documentation created:
  - ARCHITECTURE_V2.md (updated)
  - SECURITY_COMPLIANCE.md
  - NEXTCLOUD_INTEGRATION.md
  - COMPOSE_TO_K8S_MIGRATION.md
- CURRENT_PHASE.md tracking file
- README.md updated
- Development environment verified

### Step-by-Step Tasks

#### Task 1: Check Prerequisites

```bash
# Verify macOS version
sw_vers
# Should show macOS 12.0 or higher

# Check available RAM
sysctl hw.memsize | awk '{print $2/1024/1024/1024 " GB"}'
# Should show 16GB or more

# Check disk space
df -h ~
# Should show at least 50GB available

# Check if you have admin access
sudo -v
# Should prompt for password and succeed
```

#### Task 2: Create Project Directory Structure

```bash
# Navigate to home directory
cd ~

# Verify VoiceAssist directory exists (from previous planning)
ls -la VoiceAssist/

# Create comprehensive microservices structure
cd ~/VoiceAssist

# Create service directories
mkdir -p services/{api-gateway,voice-proxy,medical-kb,admin-api,auth-service}
mkdir -p services/{file-indexer,calendar-email,guideline-scraper,medical-calculator,phi-detection}

# Create infrastructure directories
mkdir -p infrastructure/{docker,kubernetes,terraform,ansible}
mkdir -p infrastructure/docker/compose-files

# Create web app directories (React frontends)
mkdir -p web-apps/{client,admin,docs}
mkdir -p web-apps/client/{src,public}
mkdir -p web-apps/admin/{src,public}
mkdir -p web-apps/docs/{content,public}

# Create Nextcloud app directories
mkdir -p nextcloud-apps/{voiceassist-client,voiceassist-admin,voiceassist-docs}

# Create shared libraries
mkdir -p shared/{models,utils,config}

# Create test directories
mkdir -p tests/{unit,integration,e2e,load}

# Create data directories
mkdir -p data/{postgres,redis,qdrant,uploads,backups,logs}

# Create scripts directory
mkdir -p scripts/{dev,deploy,backup}

# Create docs/phases if not exists
mkdir -p docs/phases

# Verify structure
tree -L 2 ~/VoiceAssist
```

#### Task 3: Install Docker Desktop

```bash
# Check if Docker is already installed
docker --version 2>/dev/null

# If not installed:
# Download Docker Desktop for Mac from:
# https://www.docker.com/products/docker-desktop/

# Or install via Homebrew Cask
brew install --cask docker

# Launch Docker Desktop
open -a Docker

# Wait for Docker to start (whale icon in menu bar)
# This may take a minute

# Verify Docker is running
docker ps
# Should show empty list (no containers yet)

# Verify Docker Compose
docker compose version
# Should show version 2.x or higher

# Configure Docker Desktop resources
# Open Docker Desktop → Settings → Resources
# Recommended settings:
# - CPUs: 4-6
# - Memory: 8-12 GB
# - Swap: 2 GB
# - Disk: 60 GB

# Apply and Restart if you changed settings
```

#### Task 4: Create Base docker-compose.yml

```bash
cd ~/VoiceAssist
```

Create `docker-compose.yml`:

```yaml
version: "3.8"

# Networks
networks:
  voiceassist-network:
    driver: bridge

  database-network:
    driver: bridge
    internal: true # Database network is internal-only

# Volumes for data persistence
volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
  qdrant-data:
    driver: local
  nextcloud-data:
    driver: local
  keycloak-data:
    driver: local

services:
  # Services will be added in subsequent phases
  # This is the skeleton structure

  # Phase 1 will add:
  # - postgres
  # - redis
  # - qdrant

  # Phase 2 will add:
  # - nextcloud
  # - keycloak
  # - auth-service

  # Phase 3 will add:
  # - api-gateway
  # - voice-proxy
  # - medical-kb
  # - admin-api
  # - prometheus
  # - grafana

  # Phase 4 will add:
  # - Additional microservices

  # Placeholder service to test setup
  hello-world:
    image: hello-world
    networks:
      - voiceassist-network
```

Test the compose file:

```bash
# Validate compose file
docker compose config

# Run hello-world test
docker compose up hello-world

# Should see "Hello from Docker!" message

# Clean up
docker compose down
```

#### Task 5: Set Up Local Domains

Edit `/etc/hosts` to add local domain resolution:

```bash
# Backup current hosts file
sudo cp /etc/hosts /etc/hosts.backup

# Add VoiceAssist domains
sudo tee -a /etc/hosts <<EOF

# VoiceAssist Local Development
127.0.0.1 voiceassist.local
127.0.0.1 nextcloud.local
127.0.0.1 keycloak.local
127.0.0.1 api.voiceassist.local
127.0.0.1 voice.voiceassist.local
127.0.0.1 medical-kb.voiceassist.local
127.0.0.1 admin.voiceassist.local
127.0.0.1 docs.voiceassist.local
127.0.0.1 prometheus.voiceassist.local
127.0.0.1 grafana.voiceassist.local
EOF

# Verify
cat /etc/hosts | grep voiceassist

# Test resolution
ping -c 1 voiceassist.local
# Should resolve to 127.0.0.1
```

#### Task 6: Initialize Git Repository

```bash
cd ~/VoiceAssist

# Check if git is already initialized
git status 2>/dev/null

# If not initialized
git init

# Create comprehensive .gitignore
cat > .gitignore <<'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/
.venv
*.egg-info/
dist/
build/

# Environment files
.env
.env.local
.env.*.local
*.env

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Logs
*.log
logs/
*.log.*

# Data directories
data/postgres/*
data/redis/*
data/qdrant/*
data/uploads/*
data/backups/*
!data/.gitkeep

# Node
node_modules/
npm-debug.log
yarn-error.log
.next/
out/
build/
dist/

# Testing
.coverage
htmlcov/
.pytest_cache/
coverage/

# Docker
*.pid
*.seed
*.pid.lock

# Temporary files
tmp/
temp/
*.tmp

# OS
Thumbs.db
.Spotlight-V100
.Trashes

# Secrets
secrets/
*.key
*.pem
*.crt (except example certs)
*-key.json
credentials.json

# Backups
*.backup
*.bak
*.sql (except schema examples)

# Keep folder structure
!.gitkeep
EOF

# Create .gitkeep files in important empty directories
touch data/.gitkeep
touch data/postgres/.gitkeep
touch data/redis/.gitkeep
touch data/qdrant/.gitkeep
touch data/uploads/.gitkeep
touch data/backups/.gitkeep
touch logs/.gitkeep

# Stage all files
git add .

# Initial commit
git commit -m "Phase 0: Initial project structure and Docker Compose setup

- Created comprehensive microservices directory structure
- Installed Docker Desktop
- Created base docker-compose.yml
- Configured local domains in /etc/hosts
- Set up .gitignore
- Initialized git repository

Status: Phase 0 complete, ready for Phase 1"
```

#### Task 7: Create Initial Documentation

Create `.env.example`:

```bash
cat > .env.example <<'EOF'
# VoiceAssist Environment Configuration
# Copy this file to .env and fill in real values

#==============================================
# Environment
#==============================================
ENVIRONMENT=development
DEBUG=true

#==============================================
# Database
#==============================================
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=changeme_secure_password
POSTGRES_DB=voiceassist
DATABASE_URL=postgresql://voiceassist:changeme_secure_password@postgres:5432/voiceassist

#==============================================
# Redis
#==============================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=changeme_redis_password
REDIS_URL=redis://:changeme_redis_password@redis:6379

#==============================================
# Qdrant
#==============================================
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=medical_knowledge

#==============================================
# Nextcloud
#==============================================
NEXTCLOUD_URL=https://nextcloud.local
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=changeme_nextcloud_admin

#==============================================
# Keycloak
#==============================================
KEYCLOAK_URL=https://keycloak.local
KEYCLOAK_REALM=voiceassist
KEYCLOAK_CLIENT_ID=voiceassist-client
KEYCLOAK_CLIENT_SECRET=changeme_keycloak_secret

#==============================================
# OpenAI
#==============================================
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

#==============================================
# Security
#==============================================
SECRET_KEY=changeme_generate_with_openssl_rand_hex_32
JWT_SECRET=changeme_generate_with_openssl_rand_hex_32
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

#==============================================
# External Services
#==============================================
UPTODATE_API_KEY=your_uptodate_api_key_if_available
OPENEVIDENCE_API_KEY=your_openevidence_api_key

#==============================================
# Observability
#==============================================
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
GRAFANA_ADMIN_PASSWORD=changeme_grafana_admin

#==============================================
# Application Settings
#==============================================
MAX_UPLOAD_SIZE=104857600
LOG_LEVEL=INFO
ENABLE_CORS=true
ALLOWED_ORIGINS=https://voiceassist.local,https://nextcloud.local
EOF
```

Create actual .env file:

```bash
# Copy example
cp .env.example .env

# Generate secure secrets
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

# Update .env with generated secrets
sed -i '' "s/changeme_secure_password/$POSTGRES_PASSWORD/" .env
sed -i '' "s/changeme_redis_password/$REDIS_PASSWORD/" .env
sed -i '' "s/changeme_generate_with_openssl_rand_hex_32/$SECRET_KEY/" .env
# For JWT, we need to replace only the second occurrence
awk -v jwt="$JWT_SECRET" '/changeme_generate_with_openssl_rand_hex_32/{c++;if(c==2){sub(/changeme_generate_with_openssl_rand_hex_32/,jwt)}}1' .env > .env.tmp && mv .env.tmp .env

echo "✅ Generated secure passwords and secrets"
echo "⚠️  IMPORTANT: Edit .env and add your OpenAI API key!"
```

Update `README.md`:

````bash
cat > README.md <<'EOF'
# VoiceAssist V2 - Enterprise Medical AI Assistant

**Status:** Phase 0 Complete - Ready for Development
**Architecture:** Microservices with Docker Compose (migrating to Kubernetes later)
**Compliance:** HIPAA-compliant with zero-trust security

## Quick Start

```bash
# 1. Ensure Docker Desktop is running
docker ps

# 2. Copy environment file and add your OpenAI API key
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 3. Start services (after Phase 1)
docker compose up -d

# 4. Check status
docker compose ps

# 5. View logs
docker compose logs -f

# 6. Stop services
docker compose down
````

## Project Structure

```
VoiceAssist/
├── services/              # Microservices
│   ├── api-gateway/
│   ├── voice-proxy/
│   ├── medical-kb/
│   ├── admin-api/
│   ├── auth-service/
│   └── ...
├── web-apps/             # React frontends
│   ├── client/
│   ├── admin/
│   └── docs/
├── infrastructure/        # IaC and configs
│   ├── docker/
│   ├── kubernetes/
│   ├── terraform/
│   └── ansible/
├── docs/                 # Documentation
│   ├── phases/           # Phase documents
│   ├── ARCHITECTURE_V2.md
│   └── ...
├── docker-compose.yml    # Main compose file
├── .env                  # Environment variables (not in git)
└── CURRENT_PHASE.md      # Track development progress
```

## Development Workflow

### Check Current Phase

```bash
cat CURRENT_PHASE.md
```

### Start a Phase

```bash
# Read the phase document
cat docs/phases/PHASE_XX_NAME.md

# Implement the phase
# ... (follow phase instructions)

# Update progress
vim CURRENT_PHASE.md

# Commit when done
git add .
git commit -m "Phase X: Description"
```

### Access Services (once running)

- Nextcloud: https://nextcloud.local
- API Gateway: https://api.voiceassist.local
- Admin Panel: https://admin.voiceassist.local
- Grafana: https://grafana.voiceassist.local:3000
- Prometheus: https://prometheus.voiceassist.local:9090

## Documentation

- **Start Here:** `docs/START_HERE.md`
- **Architecture:** `docs/ARCHITECTURE_V2.md`
- **Development Phases:** `docs/DEVELOPMENT_PHASES_V2.md`
- **Security:** `docs/SECURITY_COMPLIANCE.md`
- **Current Phase:** `CURRENT_PHASE.md`
- **Enhancement Summary:** `docs/ENHANCEMENT_SUMMARY.md`

## Key Features

- 🎤 **Web-based voice assistant** with dynamic clarifications
- 🏥 **Advanced medical AI** (BioGPT, PubMedBERT, UpToDate, OpenEvidence)
- 🔐 **Zero-trust security** with HIPAA compliance
- 📚 **Medical knowledge base** with RAG
- 🔗 **Nextcloud integration** for SSO and file management
- 📊 **Full observability** (Prometheus, Grafana, Jaeger)
- 🐳 **Docker Compose** for development
- ☸️ **Kubernetes-ready** for production

## Development Status

**Current Phase:** Phase 0 (Complete)
**Next Phase:** Phase 1 - Core Infrastructure & Database Setup

See `CURRENT_PHASE.md` for detailed status.

## License

Personal/Internal Use
EOF

````

#### Task 8: Update CURRENT_PHASE.md

```bash
cat > CURRENT_PHASE.md <<'EOF'
# Current Development Phase

**Project:** VoiceAssist V2 - Enterprise Medical AI Assistant
**Architecture:** Microservices with Docker Compose (Compose-first, K8s-later)
**Current Phase:** Phase 0 - COMPLETE ✅
**Next Phase:** Phase 1 - Core Infrastructure & Database Setup
**Last Updated:** [UPDATE WITH CURRENT DATE]

---

## Phase 0: Project Initialization & Architecture Setup ✅

**Status:** Complete
**Duration:** 4-6 hours
**Completed:** [UPDATE WITH DATE]

### Objectives Completed
- [x] Created comprehensive microservices directory structure
- [x] Installed Docker Desktop
- [x] Created base docker-compose.yml
- [x] Configured local domains in /etc/hosts
- [x] Initialized git repository
- [x] Created initial documentation
- [x] Set up development environment

### Deliverables
✅ Complete project structure
✅ Docker Desktop installed and running
✅ Base docker-compose.yml created
✅ /etc/hosts configured
✅ Git repository initialized
✅ .env.example created
✅ README.md updated
✅ Development environment verified

### Key Files Created
- `docker-compose.yml` - Base compose configuration
- `.env.example` - Environment template
- `.gitignore` - Comprehensive ignore rules
- `README.md` - Project documentation
- All directory structure

---

## Next: Phase 1 - Core Infrastructure & Database Setup

**Goal:** Set up PostgreSQL, Redis, and Qdrant with Docker Compose

**Duration:** 6-8 hours

**Read:** `docs/phases/PHASE_01_INFRASTRUCTURE.md`

### Objectives
- [ ] Add PostgreSQL with pgvector to docker-compose.yml
- [ ] Add Redis to docker-compose.yml
- [ ] Add Qdrant to docker-compose.yml
- [ ] Create database init scripts
- [ ] Implement Alembic migrations
- [ ] Test database connectivity
- [ ] Configure data persistence

**When ready to start Phase 1:**
```bash
# Read the phase document
cat docs/phases/PHASE_01_INFRASTRUCTURE.md

# Update this file as you progress
vim CURRENT_PHASE.md
````

---

## Progress Notes

### Phase 0 Completion Notes

[Add any notes about Phase 0 here]

**Example:**

- Installed Docker Desktop version 4.25.0
- Configured with 8GB RAM, 4 CPUs
- All tests passed
- Ready to proceed to Phase 1

---

## Quick Reference

**Project Root:** `~/VoiceAssist`
**Compose File:** `docker-compose.yml`
**Environment:** `.env`
**Documentation:** `docs/`
**Phase Documents:** `docs/phases/`

**Commands:**

```bash
# Check Docker
docker ps

# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Check current phase
cat CURRENT_PHASE.md
```

EOF

````

### Testing & Verification

#### Test 1: Verify Docker Installation

```bash
# Check Docker is running
docker info | head -n 10

# Should show Docker version, containers, images, etc.

# Test Docker Compose
docker compose version
# Should show version 2.x

# Run test container
docker run --rm hello-world
# Should see "Hello from Docker!"
````

#### Test 2: Verify Directory Structure

```bash
# Check all key directories exist
cd ~/VoiceAssist
ls -la

# Verify services directory
ls -la services/

# Verify infrastructure directory
ls -la infrastructure/

# Verify web-apps directory
ls -la web-apps/

# Verify docs directory
ls -la docs/

# Check directory tree
tree -L 2 -d .
```

#### Test 3: Verify Local Domains

```bash
# Test DNS resolution
ping -c 1 voiceassist.local
ping -c 1 nextcloud.local
ping -c 1 api.voiceassist.local

# All should resolve to 127.0.0.1
```

#### Test 4: Verify Git Repository

```bash
# Check git status
git status

# Should show clean working tree or initial commit

# Check git log
git log --oneline

# Should show initial commit
```

#### Test 5: Verify Environment Configuration

```bash
# Check .env exists
ls -la .env

# Verify secrets are not default values
grep "changeme" .env && echo "⚠️  Found default passwords - please update!" || echo "✅ Secrets updated"

# Check OpenAI key is set
grep "OPENAI_API_KEY=sk-" .env && echo "✅ OpenAI key set" || echo "⚠️  OpenAI key not set - add it now!"
```

### Documentation Updates

Update these files:

1. **CURRENT_PHASE.md**
   - Mark Phase 0 as complete
   - Add completion date
   - Note next phase

2. **DEVELOPMENT_LOG.md** (create if doesn't exist)

```bash
cat > DEVELOPMENT_LOG.md <<'EOF'
# Development Log

## Phase 0: Project Initialization & Architecture Setup

**Started:** [DATE]
**Completed:** [DATE]
**Duration:** [HOURS]

### What Was Built
- Comprehensive microservices directory structure
- Docker Desktop installation and configuration
- Base docker-compose.yml with networks and volumes
- Local domain resolution (/etc/hosts)
- Git repository initialization
- Environment configuration (.env.example, .env)
- Initial documentation (README, CURRENT_PHASE, etc.)

### Docker Configuration
- Docker Desktop version: [VERSION]
- Resources: 8GB RAM, 4 CPUs
- Compose version: [VERSION]

### Local Domains Configured
- voiceassist.local
- nextcloud.local
- keycloak.local
- api.voiceassist.local
- voice.voiceassist.local
- medical-kb.voiceassist.local
- admin.voiceassist.local
- docs.voiceassist.local
- prometheus.voiceassist.local
- grafana.voiceassist.local

### Key Decisions
- Using Docker Compose for Phases 0-10
- Deferring Kubernetes to Phases 11-14
- Local domains via /etc/hosts (not DNS)
- Microservices architecture from day one

### Issues Encountered
[Note any issues and how they were resolved]

### Next Phase
Phase 1: Core Infrastructure & Database Setup
EOF
```

3. **Git Commit**

```bash
git add .
git commit -m "Phase 0 complete: Project initialization and Docker setup

Completed:
- Created microservices directory structure
- Installed Docker Desktop
- Created base docker-compose.yml
- Configured /etc/hosts for local domains
- Initialized git repository
- Created .env.example and .env
- Updated README.md
- Created CURRENT_PHASE.md
- Created DEVELOPMENT_LOG.md

Ready for Phase 1: Core Infrastructure & Database Setup"
```

### Exit Checklist

Before moving to Phase 1, verify:

- [ ] Docker Desktop installed and running
- [ ] `docker ps` command works
- [ ] `docker compose version` shows version 2.x
- [ ] Complete directory structure created
- [ ] `docker-compose.yml` exists and validates
- [ ] `/etc/hosts` contains VoiceAssist domains
- [ ] Local domains resolve to 127.0.0.1
- [ ] Git repository initialized
- [ ] `.gitignore` created
- [ ] `.env.example` created
- [ ] `.env` created with generated secrets
- [ ] OpenAI API key added to `.env`
- [ ] `README.md` updated
- [ ] `CURRENT_PHASE.md` created and marked Phase 0 complete
- [ ] `DEVELOPMENT_LOG.md` created
- [ ] Initial commit made to git
- [ ] No errors in any commands
- [ ] All tests passed

---

## Section B: Kubernetes Migration Notes

_This section documents how Phase 0 will translate to Kubernetes in Phases 11-14._

### Kubernetes Equivalent Concepts

**Docker Compose → Kubernetes:**

| Compose Concept       | Kubernetes Equivalent                      |
| --------------------- | ------------------------------------------ |
| services              | Deployments + Services                     |
| networks              | Network Policies                           |
| volumes               | PersistentVolumes + PersistentVolumeClaims |
| environment variables | ConfigMaps + Secrets                       |
| docker-compose.yml    | Multiple YAML manifests                    |
| depends_on            | InitContainers or readiness probes         |
| ports                 | Service type LoadBalancer/NodePort         |

### Directory Structure for Kubernetes

In Phase 11, add:

```
infrastructure/kubernetes/
├── base/
│   ├── namespaces.yaml
│   ├── network-policies.yaml
│   └── storage-classes.yaml
├── deployments/
│   ├── postgres-statefulset.yaml
│   ├── redis-deployment.yaml
│   ├── qdrant-statefulset.yaml
│   └── ... (all services)
├── services/
│   ├── postgres-service.yaml
│   ├── redis-service.yaml
│   └── ... (all services)
├── configmaps/
│   └── app-config.yaml
├── secrets/
│   └── app-secrets.yaml (encrypted)
└── ingress/
    └── ingress.yaml
```

### Migration Process (Phase 11)

1. **Convert Compose to K8s Manifests**
   - Use `kompose convert` as starting point
   - Manually refine for production
   - Add resource limits and requests
   - Add liveness/readiness probes

2. **Add Kubernetes-Specific Features**
   - HorizontalPodAutoscaler
   - PodDisruptionBudget
   - NetworkPolicies
   - ResourceQuotas

3. **Service Mesh Integration**
   - Install Linkerd
   - Inject sidecars
   - Configure mTLS
   - Set up traffic policies

### Local Kubernetes Testing

Options for local K8s testing:

- **K3s** (lightweight, recommended)
- **Minikube** (full-featured)
- **Docker Desktop K8s** (simplest)

### What Stays the Same

- Application code (no changes)
- Docker images (same images)
- Environment variables (same names)
- Service discovery (DNS-based)
- Database schemas
- API contracts

### What Changes

- Orchestration layer (Compose → K8s)
- Configuration method (env files → ConfigMaps/Secrets)
- Networking (Compose networks → K8s Services)
- Storage (Docker volumes → PersistentVolumes)
- Observability integration (Prometheus operator)
- Service-to-service auth (mTLS via service mesh)

### Estimated Migration Time

- Phase 11: Create K8s manifests (6-8 hours)
- Phase 12: Test locally with K3s (4-6 hours)
- Phase 13: Production prep (6-8 hours)
- Phase 14: Deploy to production (6-8 hours)

**Total:** ~22-30 hours for K8s migration

---

## Troubleshooting

### Docker Desktop Won't Start

```bash
# Check if another Docker instance is running
ps aux | grep -i docker

# Kill any conflicting processes
pkill -9 -f docker

# Reset Docker Desktop
# Open Docker Desktop → Troubleshoot → Reset to factory defaults

# Restart
open -a Docker
```

### Port Already in Use

```bash
# Find process using port
lsof -ti:8000

# Kill the process
kill -9 $(lsof -ti:8000)
```

### /etc/hosts Permission Denied

```bash
# Use sudo
sudo vim /etc/hosts

# Or use tee
echo "127.0.0.1 voiceassist.local" | sudo tee -a /etc/hosts
```

### Git Initialization Issues

```bash
# If git is not initialized
cd ~/VoiceAssist
git init

# If you get permission errors
sudo chown -R $(whoami) ~/VoiceAssist
```

### Docker Compose Validation Errors

```bash
# Check syntax
docker compose config

# Validate against schema
docker compose config --quiet

# If errors, check YAML indentation
```

---

## Exit Checklist

**Before moving to Phase 1, verify ALL of the following:**

### File Structure & Configuration

- [ ] Complete directory structure exists (verify with `tree -L 2 ~/VoiceAssist`)
- [ ] `docker-compose.yml` file exists and validates (`docker compose config --quiet`)
- [ ] `.env.example` file created with all required variables
- [ ] `.env` file created from example and contains your OpenAI API key
- [ ] `.gitignore` configured to exclude `.env`, data/, logs/
- [ ] Git repository initialized (`git log` shows initial commit)

### Docker Environment

- [ ] Docker Desktop installed and running (`docker ps` succeeds)
- [ ] Docker version >= 24.0 (`docker --version`)
- [ ] Docker Compose version >= 2.0 (`docker compose version`)
- [ ] Test container runs successfully (`docker run --rm hello-world`)
- [ ] At least 8GB RAM allocated to Docker (check Docker Desktop → Settings → Resources)
- [ ] At least 50GB disk space allocated

### Domain Configuration

- [ ] `/etc/hosts` contains entry: `127.0.0.1 nextcloud.local`
- [ ] `/etc/hosts` contains entry: `127.0.0.1 api.voiceassist.local`
- [ ] `/etc/hosts` contains entry: `127.0.0.1 admin.voiceassist.local`
- [ ] Can ping `nextcloud.local` successfully (`ping -c 1 nextcloud.local`)

### Documentation

- [ ] All specification documents reviewed (listed in "Related Documentation" section)
- [ ] `README.md` created with project overview
- [ ] `CURRENT_PHASE.md` created and shows Phase 0 complete
- [ ] All phase documents exist in `docs/phases/` directory

### Specifications Referenced

Per [WEB_APP_SPECS.md](../WEB_APP_SPECS.md):

- [ ] Understand Clinical UX workflows (Quick Consult, Case Workspace, etc.)
- [ ] Understand TypeScript interfaces for UI components

Per [ADMIN_PANEL_SPECS.md](../ADMIN_PANEL_SPECS.md):

- [ ] Understand admin dashboard requirements
- [ ] Understand knowledge base management interface

Per [SEMANTIC_SEARCH_DESIGN.md](../SEMANTIC_SEARCH_DESIGN.md):

- [ ] Understand document ingestion pipeline
- [ ] Understand vector search architecture

Per [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md):

- [ ] Understand HIPAA compliance requirements
- [ ] Understand PHI detection and routing rules

### Verification Tests

- [ ] Docker info shows system info without errors
- [ ] Can create and start a test container
- [ ] Git commands work (commit, status, log)
- [ ] Environment variables load correctly (`cat .env | wc -l` shows > 30 lines)

### Ready for Phase 1

- [ ] Reviewed Phase 1 objectives in `docs/phases/PHASE_01_INFRASTRUCTURE.md`
- [ ] Understand next deliverables (PostgreSQL, Redis, Qdrant setup)
- [ ] Have at least 6-8 hours available for Phase 1 execution

**Phase 0 Exit Criteria Summary:**
✅ Project structure complete
✅ Docker environment ready
✅ Git repository initialized
✅ Documentation reviewed
✅ Local domains configured
✅ Ready to add infrastructure services

---

## Next Phase

Once all exit criteria are met, proceed to:

**Phase 1: Core Infrastructure & Database Setup**

- Read: `docs/phases/PHASE_01_INFRASTRUCTURE.md`
- Duration: 6-8 hours
- Goal: Add PostgreSQL, Redis, and Qdrant to Compose
- Deliverables: Running database services accessible at `postgres:5432`, `redis:6379`, `qdrant:6333`
