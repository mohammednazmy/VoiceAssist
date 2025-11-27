---
title: "Phase 01 Local Environment"
slug: "phases/phase-01-local-environment"
summary: "> **WARNING: LEGACY V1 PHASE - NOT CANONICAL FOR V2**"
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["phase", "local", "environment"]
---

# Phase 1: Local Development Environment

> **WARNING: LEGACY V1 PHASE - NOT CANONICAL FOR V2**
> This describes the original V1 phase.
> For the current 15-phase V2 plan, see:
>
> - [DEVELOPMENT_PHASES_V2.md](../DEVELOPMENT_PHASES_V2.md)
> - [PHASE_00_INITIALIZATION.md](PHASE_00_INITIALIZATION.md)
> - [Implementation Status](../overview/IMPLEMENTATION_STATUS.md)
> - [PHASE_STATUS.md](../../PHASE_STATUS.md)
>
> **Note**: New V2 phase docs will be created later. Do not use this as an implementation guide for V2.

## Goal

Set up complete local development environment on MacBook Pro with all necessary services running and a basic FastAPI application with health check endpoint.

## Estimated Time

3-4 hours

## Prerequisites

- macOS 12+ installed
- Admin access to MacBook Pro
- OpenAI API key
- Internet connection

## Entry Checklist

Before starting this phase, verify:

- [ ] You have admin access (can run `sudo` commands)
- [ ] You have an OpenAI API key ready
- [ ] You have read `LOCAL_DEVELOPMENT.md`
- [ ] You have read `PROJECT_SUMMARY.md` and `ARCHITECTURE.md`

## Tasks

### Task 1: Install Homebrew (if not installed)

```bash
# Check if Homebrew is installed
which brew

# If not found, install it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Follow the instructions to add Homebrew to PATH
```

**Verify:**

```bash
brew --version
# Should show version number
```

### Task 2: Install System Dependencies

```bash
# Update Homebrew
brew update

# Install Python 3.11
brew install python@3.11

# Install Node.js
brew install node

# Install PostgreSQL
brew install postgresql@15

# Install Redis
brew install redis

# Install Git (if not installed)
brew install git

# Install Tesseract (for OCR)
brew install tesseract
```

**Verify each installation:**

```bash
python3.11 --version
node --version
npm --version
psql --version
redis-cli --version
git --version
tesseract --version
```

### Task 3: Install and Configure Docker Desktop

1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop/
2. Install the DMG file
3. Start Docker Desktop
4. Wait for Docker to fully start (whale icon in menu bar)

**Verify:**

```bash
docker --version
docker ps
```

### Task 4: Install and Configure Ollama

```bash
# Install Ollama
brew install ollama

# Start Ollama service in background
ollama serve > /tmp/ollama.log 2>&1 &

# Wait a few seconds for it to start
sleep 5

# Download Llama 3.1 8B model (for 16GB RAM)
ollama pull llama3.1:8b

# If you have 32GB+ RAM, you can use the 70B model instead:
# ollama pull llama3.1:70b
```

**Verify:**

```bash
ollama list
# Should show llama3.1:8b

ollama run llama3.1:8b "Say hello in one sentence"
# Should get a response
```

### Task 5: Set Up PostgreSQL

```bash
# Start PostgreSQL service
brew services start postgresql@15

# Wait for it to start
sleep 3

# Create database
createdb voiceassist

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
make install

# Enable pgvector extension
psql voiceassist -c "CREATE EXTENSION vector;"
```

**Verify:**

```bash
psql voiceassist -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
# Should show 'vector'

psql voiceassist -c "\dx"
# Should list vector extension
```

### Task 6: Set Up Redis

```bash
# Start Redis service
brew services start redis

# Test connection
redis-cli ping
# Should return: PONG
```

**Verify:**

```bash
redis-cli info server | grep redis_version
```

### Task 7: Set Up Qdrant (Vector Database)

```bash
# Create data directory
mkdir -p ~/voiceassist-data/qdrant

# Pull Qdrant image
docker pull qdrant/qdrant

# Run Qdrant container
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v ~/voiceassist-data/qdrant:/qdrant/storage \
  --restart unless-stopped \
  qdrant/qdrant
```

**Verify:**

```bash
# Wait a few seconds
sleep 5

# Test Qdrant API
curl http://localhost:6333
# Should return JSON with version info

# Check Docker container
docker ps | grep qdrant
# Should show running container
```

### Task 8: Create Project Structure

```bash
cd ~/VoiceAssist

# Create server directories
mkdir -p server/{app,tests,scripts,logs,data}
mkdir -p server/app/{api,core,models,services,utils}
mkdir -p server/app/api/{endpoints,deps}
mkdir -p server/app/services/{ai,medical,integrations}

# Create data directories
mkdir -p data/{pdfs,uploads,backups,indexes}

# Create web app directories (basic structure)
mkdir -p web-app/{src,public}
mkdir -p web-app/src/{components,pages,hooks,utils,styles,api}

# Create admin panel directories
mkdir -p admin-panel/{src,public}
mkdir -p admin-panel/src/{components,pages,hooks,utils,styles}

# Create docs site directories
mkdir -p docs-site/{content,components,public,styles}

# Create scripts directory
mkdir -p scripts
```

**Verify:**

```bash
tree -L 3 ~/VoiceAssist
# Should show all directories
```

### Task 9: Set Up Python Virtual Environment

```bash
cd ~/VoiceAssist/server

# Create virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel
```

**Verify:**

```bash
which python
# Should point to venv/bin/python

python --version
# Should show Python 3.11.x
```

### Task 10: Create requirements.txt

Create `~/VoiceAssist/server/requirements.txt`:

```txt
# FastAPI and server
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
websockets==12.0

# Pydantic
pydantic==2.5.0
pydantic-settings==2.1.0

# Database
sqlalchemy==2.0.23
alembic==1.12.1
psycopg2-binary==2.9.9

# Redis
redis==5.0.1
hiredis==2.2.3

# Vector Database
qdrant-client==1.7.0

# AI/ML
openai==1.3.0
ollama==0.1.4

# Authentication & Security
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.0

# HTTP Client
httpx==0.25.1

# PDF Processing
pypdf2==3.0.1
pdfplumber==0.10.3
pytesseract==0.3.10
pillow==10.1.0

# Document Processing
python-docx==1.1.0
markdown==3.5.1

# Task Queue
celery==5.3.4

# File handling
aiofiles==23.2.1

# Utilities
python-dateutil==2.8.2

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
httpx==0.25.1
```

Install dependencies:

```bash
cd ~/VoiceAssist/server
source venv/bin/activate
pip install -r requirements.txt
```

**Verify:**

```bash
pip list | grep fastapi
pip list | grep sqlalchemy
pip list | grep openai
```

### Task 11: Create Basic FastAPI Application

Create `~/VoiceAssist/server/app/__init__.py`:

```python
"""VoiceAssist Backend Application"""
__version__ = "0.1.0"
```

Create `~/VoiceAssist/server/app/core/__init__.py`:

```python
"""Core modules"""
```

Create `~/VoiceAssist/server/app/core/config.py`:

```python
"""Configuration management"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""

    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "VoiceAssist"
    VERSION: str = "0.1.0"

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Vector Database
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_NAME: str = "medical_knowledge"

    # Ollama
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"

    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4-turbo-preview"

    # Security
    SECRET_KEY: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # File Upload
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB
    UPLOAD_DIR: str = "data/uploads"

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
```

Create `~/VoiceAssist/server/app/main.py`:

```python
"""FastAPI application entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
import logging

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION
    }


@app.get(f"{settings.API_V1_STR}/status")
async def api_status():
    """API status endpoint"""
    return {
        "api": "operational",
        "version": settings.VERSION
    }


@app.on_event("startup")
async def startup_event():
    """Application startup"""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown"""
    logger.info("Shutting down application")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.LOG_LEVEL.lower()
    )
```

### Task 12: Create Environment Configuration

Create `~/VoiceAssist/server/.env.example`:

```bash
# Environment
ENVIRONMENT=development
DEBUG=True

# Database
DATABASE_URL=postgresql://$(whoami)@localhost/voiceassist

# Redis
REDIS_URL=redis://localhost:6379

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=medical_knowledge

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Security
SECRET_KEY=your-secret-key-generate-with-openssl-rand-hex-32
JWT_SECRET=your-jwt-secret-generate-with-openssl-rand-hex-32
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# File Upload
MAX_UPLOAD_SIZE=104857600
UPLOAD_DIR=data/uploads

# Logging
LOG_LEVEL=INFO
```

Create actual `.env` file:

```bash
cd ~/VoiceAssist/server

# Copy example
cp .env.example .env

# Generate secrets
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

# Update .env with real values
sed -i '' "s/your-secret-key-generate-with-openssl-rand-hex-32/$SECRET_KEY/" .env
sed -i '' "s/your-jwt-secret-generate-with-openssl-rand-hex-32/$JWT_SECRET/" .env

# Update DATABASE_URL with current user
CURRENT_USER=$(whoami)
sed -i '' "s/\$(whoami)/$CURRENT_USER/" .env

# Open .env to add OpenAI API key
echo "Please edit .env and add your OpenAI API key"
```

**Manual step:** Edit `~/VoiceAssist/server/.env` and add your actual OpenAI API key.

### Task 13: Create Service Start Script

Create `~/VoiceAssist/scripts/start-services.sh`:

```bash
#!/bin/bash

echo "🚀 Starting VoiceAssist Development Services..."
echo ""

# Start PostgreSQL
echo "Starting PostgreSQL..."
brew services list | grep postgresql | grep started > /dev/null
if [ $? -ne 0 ]; then
    brew services start postgresql@15
    echo "✅ PostgreSQL started"
else
    echo "✅ PostgreSQL already running"
fi

# Start Redis
echo "Starting Redis..."
brew services list | grep redis | grep started > /dev/null
if [ $? -ne 0 ]; then
    brew services start redis
    echo "✅ Redis started"
else
    echo "✅ Redis already running"
fi

# Start Ollama
echo "Starting Ollama..."
pgrep ollama > /dev/null
if [ $? -ne 0 ]; then
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 2
    echo "✅ Ollama started"
else
    echo "✅ Ollama already running"
fi

# Start Qdrant
echo "Starting Qdrant..."
docker ps | grep qdrant | grep Up > /dev/null
if [ $? -ne 0 ]; then
    docker start qdrant 2>/dev/null || docker run -d \
        --name qdrant \
        -p 6333:6333 \
        -v ~/voiceassist-data/qdrant:/qdrant/storage \
        --restart unless-stopped \
        qdrant/qdrant
    echo "✅ Qdrant started"
else
    echo "✅ Qdrant already running"
fi

echo ""
echo "📊 Service Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PostgreSQL: http://localhost:5432"
psql -h localhost -U $(whoami) -d voiceassist -c "SELECT version();" > /dev/null 2>&1 && echo "  Status: ✅ Connected" || echo "  Status: ❌ Not connected"

echo ""
echo "Redis: http://localhost:6379"
redis-cli ping > /dev/null 2>&1 && echo "  Status: ✅ Connected" || echo "  Status: ❌ Not connected"

echo ""
echo "Qdrant: http://localhost:6333"
curl -s http://localhost:6333 > /dev/null 2>&1 && echo "  Status: ✅ Connected" || echo "  Status: ❌ Not connected"

echo ""
echo "Ollama: http://localhost:11434"
curl -s http://localhost:11434/api/tags > /dev/null 2>&1 && echo "  Status: ✅ Connected" || echo "  Status: ❌ Not connected"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ All services are ready!"
echo ""
echo "Next steps:"
echo "  cd ~/VoiceAssist/server"
echo "  source venv/bin/activate"
echo "  python app/main.py"
```

Make it executable:

```bash
chmod +x ~/VoiceAssist/scripts/start-services.sh
```

### Task 14: Test the Setup

```bash
# Start all services
~/VoiceAssist/scripts/start-services.sh

# Start FastAPI application
cd ~/VoiceAssist/server
source venv/bin/activate
python app/main.py
```

In another terminal:

```bash
# Test root endpoint
curl http://localhost:8000/
# Should return JSON with name, version, environment

# Test health check
curl http://localhost:8000/health
# Should return healthy status

# Test API endpoint
curl http://localhost:8000/api/v1/status
# Should return operational status

# View OpenAPI docs
open http://localhost:8000/docs
# Should open browser with Swagger UI
```

### Task 15: Create .gitignore

Create `~/VoiceAssist/.gitignore`:

```
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

# Environment
.env
.env.local

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Data
data/uploads/*
data/pdfs/*
data/backups/*
data/indexes/*
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

# Database
*.db
*.sqlite

# Temporary
tmp/
temp/
```

### Task 16: Initialize Git Repository

```bash
cd ~/VoiceAssist
git init
git add .
git commit -m "Phase 1: Initial project setup with FastAPI backend and local services"
```

## Testing

### Test Checklist

- [ ] All services start without errors
- [ ] FastAPI app runs on port 8000
- [ ] Can access http://localhost:8000
- [ ] Can access http://localhost:8000/health
- [ ] Can access http://localhost:8000/docs (Swagger UI)
- [ ] PostgreSQL connection works
- [ ] Redis connection works
- [ ] Qdrant connection works
- [ ] Ollama responds to test query
- [ ] No errors in logs

### Manual Testing

```bash
# Test each service connection
cd ~/VoiceAssist/server
source venv/bin/activate
python << EOF
from app.core.config import settings
import psycopg2
import redis
from qdrant_client import QdrantClient
import requests

# Test PostgreSQL
try:
    conn = psycopg2.connect(settings.DATABASE_URL)
    print("✅ PostgreSQL connected")
    conn.close()
except Exception as e:
    print(f"❌ PostgreSQL error: {e}")

# Test Redis
try:
    r = redis.from_url(settings.REDIS_URL)
    r.ping()
    print("✅ Redis connected")
except Exception as e:
    print(f"❌ Redis error: {e}")

# Test Qdrant
try:
    client = QdrantClient(url=settings.QDRANT_URL)
    print("✅ Qdrant connected")
except Exception as e:
    print(f"❌ Qdrant error: {e}")

# Test Ollama
try:
    response = requests.get(f"{settings.OLLAMA_URL}/api/tags")
    if response.status_code == 200:
        print("✅ Ollama connected")
    else:
        print(f"❌ Ollama returned status {response.status_code}")
except Exception as e:
    print(f"❌ Ollama error: {e}")
EOF
```

## Documentation Updates

Update these files:

1. Create `~/VoiceAssist/PHASE_STATUS.md`:

```markdown
# Phase Completion Status

- [x] Phase 1: Local Development Environment - Completed [DATE]
- [ ] Phase 2: Database Schema & Models - Not Started
- [ ] Phase 3: Authentication System - Not Started
      ...
```

2. Update `~/VoiceAssist/README.md` if needed

3. Create `~/VoiceAssist/DEVELOPMENT_LOG.md`:

```markdown
# Development Log

## Phase 1: Local Development Environment

**Completed:** [DATE]

### What Was Built

- Installed all local services (PostgreSQL, Redis, Qdrant, Ollama)
- Created project structure
- Set up Python virtual environment
- Created basic FastAPI application
- Configured environment variables
- Created service start script

### Services Running

- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Qdrant: localhost:6333
- Ollama: localhost:11434
- FastAPI: localhost:8000

### Next Phase

Phase 2: Database Schema & Models
```

## Exit Checklist

Before moving to Phase 2, verify:

- [ ] All services are running
- [ ] FastAPI app starts without errors
- [ ] All endpoints return expected responses
- [ ] Can access Swagger docs at /docs
- [ ] Environment variables are configured
- [ ] .gitignore is in place
- [ ] Git repository initialized with first commit
- [ ] PHASE_STATUS.md created and updated
- [ ] DEVELOPMENT_LOG.md created
- [ ] No errors in any logs

## Troubleshooting

### PostgreSQL won't start

```bash
brew services restart postgresql@15
tail -f /opt/homebrew/var/log/postgresql@15.log
```

### Port 8000 already in use

```bash
lsof -ti:8000 | xargs kill -9
```

### Ollama not responding

```bash
pkill ollama
ollama serve > /tmp/ollama.log 2>&1 &
tail -f /tmp/ollama.log
```

### Qdrant container issues

```bash
docker rm -f qdrant
docker run -d --name qdrant -p 6333:6333 -v ~/voiceassist-data/qdrant:/qdrant/storage qdrant/qdrant
```

## Next Phase

Once all exit criteria are met, proceed to:
**Phase 2: Database Schema & Models** (`PHASE_02_DATABASE_SCHEMA.md`)
