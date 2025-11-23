# VoiceAssist Development Setup Guide

This guide walks you through setting up your local development environment for VoiceAssist.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Development Tooling](#development-tooling)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [CI/CD](#cicd)

---

## Prerequisites

### Required Software

- **Git** 2.30+
- **Docker** 24.0+ and Docker Compose 2.20+
- **Python** 3.11+ (for backend development)
- **Node.js** 18+ (for frontend development)
- **pnpm** 8+ (package manager for frontend monorepo)

### Recommended Tools

- **Visual Studio Code** or **PyCharm** for IDE
- **Postman** or **Insomnia** for API testing
- **pgAdmin** or **DBeaver** for database management

---

## Backend Setup

### 1. Clone the Repository

```bash
git clone git@github.com:mohammednazmy/VoiceAssist.git
cd VoiceAssist
```

### 2. Set Up Python Virtual Environment

```bash
cd services/api-gateway
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

```bash
# From repo root
cp .env.example .env
```

Edit `.env` and configure the following required variables:

```bash
# Core
ENVIRONMENT=development
DEBUG=true

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=voiceassist
POSTGRES_PASSWORD=<your-password>
POSTGRES_DB=voiceassist_db
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/voiceassist_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-password>

# Qdrant (vector database)
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Security
SECRET_KEY=<generate-with-openssl-rand-hex-32>
JWT_SECRET=<generate-with-openssl-rand-hex-32>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# OpenAI
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-4-turbo-preview

# Nextcloud (optional for development)
NEXTCLOUD_URL=http://localhost:8080
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=<your-password>
```

### 5. Validate Environment

```bash
# From repo root
make check-env
```

This command validates that all required environment variables are set.

### 6. Start Infrastructure Services

```bash
# From repo root
docker compose up -d postgres redis qdrant
```

### 7. Run Database Migrations

```bash
cd services/api-gateway
source venv/bin/activate
alembic upgrade head
```

---

## Frontend Setup

### 1. Install pnpm

If you don't have pnpm installed:

```bash
npm install -g pnpm
```

Or see [pnpm installation docs](https://pnpm.io/installation) for alternative methods.

### 2. Install Frontend Dependencies

```bash
# From repo root
pnpm install
```

This installs dependencies for all packages in the monorepo (apps and shared packages).

### 3. Build Shared Packages

```bash
pnpm build
```

This builds all shared packages that other apps depend on.

### 4. Start Development Server

```bash
# Start all apps in dev mode
pnpm dev

# Or start specific apps
cd apps/web-app
pnpm dev

cd apps/admin-panel
pnpm dev
```

### Frontend Project Structure

```
VoiceAssist/
├── apps/
│   ├── admin-panel/       # Admin dashboard (React + Vite)
│   └── web-app/           # Main web application (React + Vite)
├── packages/
│   ├── api-client/        # API client library
│   ├── config/            # Shared configuration
│   ├── design-tokens/     # Design system tokens
│   ├── types/             # TypeScript types
│   ├── ui/                # Shared UI components
│   └── utils/             # Shared utilities
└── pnpm-workspace.yaml    # pnpm workspace config
```

---

## Development Tooling

### Makefile Targets

The repo includes a Makefile with common development tasks:

```bash
# Environment
make check-env          # Validate environment variables
make install            # Install all dependencies

# Development
make dev                # Start all services with Docker Compose
make stop               # Stop all Docker Compose services
make logs               # View Docker Compose logs

# Testing
make test               # Run all backend tests
make test-unit          # Run backend unit tests only
make test-frontend      # Run frontend tests

# Quality Checks
make lint               # Run Python and frontend linters
make type-check         # Run Python and TypeScript type checking
make bandit             # Run Bandit security scanner
make security           # Run all security scans
make pre-commit         # Run pre-commit hooks on all files

# Cleanup
make clean              # Remove build artifacts and caches
```

### Pre-commit Hooks

We use pre-commit hooks to enforce code quality standards.

#### Install pre-commit

```bash
cd services/api-gateway
source venv/bin/activate
pip install pre-commit
```

#### Setup hooks

```bash
# From repo root
pre-commit install
```

This installs git hooks that run automatically before each commit.

#### Manual Run

```bash
# Run on all files
pre-commit run --all-files

# Run on staged files only
pre-commit run
```

### What Pre-commit Checks

- **Black** - Python code formatting
- **isort** - Python import sorting
- **flake8** - Python linting
- **mypy** - Python type checking (optional)
- **Bandit** - Python security scanning
- **Prettier** - Frontend code formatting
- **ESLint** - TypeScript/JavaScript linting
- **shellcheck** - Shell script linting
- **hadolint** - Dockerfile linting

---

## Running the Application

### Full Stack (Recommended)

```bash
# Start all services (backend + frontend + infrastructure)
docker compose up -d

# View logs
docker compose logs -f api-gateway
```

Access the application:

- **Web App**: http://localhost:5173
- **Admin Panel**: http://localhost:5174
- **API Gateway**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Backend Only

```bash
cd services/api-gateway
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Only

```bash
# Start specific frontend app
cd apps/web-app
pnpm dev

# Or
cd apps/admin-panel
pnpm dev
```

---

## Testing

### Backend Tests

```bash
# From repo root
make test              # All tests
make test-unit         # Unit tests only

# Or directly with pytest
cd services/api-gateway
source venv/bin/activate
pytest                 # All tests
pytest tests/unit/     # Unit tests
pytest tests/e2e/      # E2E tests
pytest -v -k "test_auth"  # Specific tests
```

### Frontend Tests

```bash
# From repo root
pnpm test

# Or in specific package
cd apps/web-app
pnpm test
```

### Test Coverage

```bash
# Backend coverage
cd services/api-gateway
source venv/bin/activate
pytest --cov=app --cov-report=html

# View coverage report
open htmlcov/index.html
```

---

## Linting and Type Checking

### Backend

```bash
# From repo root
make lint              # Flake8 + Black + isort
make type-check        # mypy type checking

# Or manually
cd services/api-gateway
source venv/bin/activate
black app/
isort app/
flake8 app/
mypy app/
```

### Frontend

```bash
# From repo root
pnpm lint              # ESLint
pnpm type-check        # TypeScript compiler

# Or in specific package
cd apps/web-app
pnpm lint
pnpm type-check
```

---

## Security Scanning

### Bandit (Python Security)

```bash
# From repo root
make bandit

# Or directly
cd services/api-gateway
source venv/bin/activate
bandit -c ../../.bandit -r app/
```

### Safety (Python Dependencies)

```bash
cd services/api-gateway
source venv/bin/activate
pip install safety
safety check
```

### npm audit (Frontend Dependencies)

```bash
pnpm audit
```

---

## CI/CD

### GitHub Actions Workflows

The project uses GitHub Actions for CI/CD:

- **Backend CI** (`.github/workflows/ci.yml`)
  - Runs on changes to `services/`, `tests/`, backend configs
  - Linting, type checking, unit tests, E2E tests
  - Security scanning with Bandit

- **Frontend CI** (`.github/workflows/frontend-ci.yml`)
  - Runs on changes to `apps/`, `packages/`, frontend configs
  - Linting, type checking, tests
  - Build verification

- **Security Scan** (`.github/workflows/security-scan.yml`)
  - Scheduled security scans
  - Dependency vulnerability checks

### Required Checks Before PR

Before opening a pull request, ensure:

```bash
# 1. Environment is valid
make check-env

# 2. All tests pass
make test
pnpm test

# 3. Linting passes
make lint
pnpm lint

# 4. Type checking passes
make type-check
pnpm type-check

# 5. Pre-commit hooks pass
pre-commit run --all-files

# 6. Security scans pass
make bandit
```

---

## Troubleshooting

### Backend Issues

**Problem**: `ModuleNotFoundError: No module named 'app'`

**Solution**: Ensure you're in the correct directory and virtual environment:

```bash
cd services/api-gateway
source venv/bin/activate
export PYTHONPATH=/path/to/VoiceAssist/services/api-gateway:$PYTHONPATH
```

**Problem**: Database connection errors

**Solution**: Ensure infrastructure services are running:

```bash
docker compose ps
docker compose up -d postgres redis qdrant
```

### Frontend Issues

**Problem**: `pnpm: command not found`

**Solution**: Install pnpm globally:

```bash
npm install -g pnpm
```

**Problem**: Build errors with shared packages

**Solution**: Build packages in dependency order:

```bash
pnpm build
```

**Problem**: Port already in use

**Solution**: Change port in vite.config.ts or kill the process:

```bash
lsof -ti:5173 | xargs kill -9
```

### Pre-commit Issues

**Problem**: Pre-commit hooks failing

**Solution**: Update hooks and run manually:

```bash
pre-commit autoupdate
pre-commit run --all-files
```

---

## Additional Resources

- [Contributing Guide](../CONTRIBUTING.md)
- [Architecture Documentation](./ARCHITECTURE_V2.md)
- [API Documentation](http://localhost:8000/docs) (when running)
- [Frontend Roadmap](./client-implementation/)
- [HIPAA Compliance Matrix](./HIPAA_COMPLIANCE_MATRIX.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

---

## Getting Help

- **Issues**: https://github.com/mohammednazmy/VoiceAssist/issues
- **Discussions**: https://github.com/mohammednazmy/VoiceAssist/discussions
- **Internal Docs**: See `docs/` directory for detailed technical documentation
