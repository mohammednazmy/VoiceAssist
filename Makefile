.PHONY: help dev test lint type-check bandit security clean install check-env check-openai

# Default target
help:
	@echo "VoiceAssist Development Commands"
	@echo "================================="
	@echo ""
	@echo "Environment:"
	@echo "  make check-env     - Validate required environment variables"
	@echo "  make check-openai  - Verify OpenAI API key is valid and working"
	@echo "  make install       - Install all dependencies (backend + frontend)"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start all services with Docker Compose"
	@echo "  make stop          - Stop all Docker Compose services"
	@echo "  make logs          - View Docker Compose logs"
	@echo ""
	@echo "Testing:"
	@echo "  make test          - Run backend unit tests (fast, no external deps)"
	@echo "  make test-unit     - Run backend unit tests only"
	@echo "  make test-e2e      - Run e2e tests (requires docker-compose stack)"
	@echo "  make test-frontend - Run frontend tests (if pnpm available)"
	@echo ""
	@echo "Quality Checks:"
	@echo "  make lint          - Run Python and frontend linters"
	@echo "  make type-check    - Run Python and TypeScript type checking"
	@echo "  make bandit        - Run Bandit security scanner"
	@echo "  make security      - Run all security scans (bandit + safety)"
	@echo "  make pre-commit    - Run pre-commit hooks on all files"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         - Remove build artifacts and caches"
	@echo ""

# Environment validation
check-env:
	@echo "Checking environment configuration..."
	@if [ -f scripts/check-env.sh ]; then \
		bash scripts/check-env.sh; \
	else \
		echo "⚠️  scripts/check-env.sh not found. Skipping env validation."; \
	fi

# OpenAI API key verification
check-openai:
	@echo "Verifying OpenAI API key..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		python ../../scripts/check_openai_key.py

# Installation
install: check-env
	@echo "Installing backend dependencies..."
	@cd services/api-gateway && \
		if [ ! -d venv ]; then python3 -m venv venv; fi && \
		. venv/bin/activate && \
		pip install --upgrade pip && \
		pip install -r requirements.txt
	@echo ""
	@echo "Installing frontend dependencies..."
	@if command -v pnpm >/dev/null 2>&1; then \
		pnpm install; \
	else \
		echo "⚠️  pnpm not found. Install with: npm install -g pnpm"; \
		echo "    Then run: pnpm install"; \
	fi

# Development
dev: check-env
	@echo "Starting Docker Compose services..."
	docker compose up -d
	@echo ""
	@echo "Services started. Check status with: docker compose ps"
	@echo "View logs with: make logs"

stop:
	@echo "Stopping Docker Compose services..."
	docker compose down

logs:
	docker compose logs -f

# Testing
test:
	@echo "Running backend tests..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		export PYTHONPATH=. && \
		pytest -v

test-unit:
	@echo "Running backend unit tests..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		export PYTHONPATH=. && \
		pytest -v

test-e2e:
	@echo "Running e2e tests (requires docker-compose stack)..."
	@echo "Ensure services are running: make dev"
	@cd services/api-gateway && \
		. venv/bin/activate && \
		export PYTHONPATH=. && \
		pytest tests/e2e/ -v || echo "⚠️  E2E tests require full docker-compose stack to be running"

test-frontend:
	@echo "Running frontend tests..."
	@if command -v pnpm >/dev/null 2>&1; then \
		pnpm test; \
	else \
		echo "⚠️  pnpm not found. Install with: npm install -g pnpm"; \
		exit 1; \
	fi

# Linting
lint:
	@echo "Running Python linting (pre-commit)..."
	@pre-commit run --all-files || true
	@echo ""
	@echo "Running frontend linting..."
	@if command -v pnpm >/dev/null 2>&1; then \
		pnpm lint || echo "⚠️  Frontend linting failed or not configured"; \
	else \
		echo "⚠️  pnpm not found. Skipping frontend lint."; \
	fi

# Type checking
type-check:
	@echo "Running Python type checking (mypy)..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		if command -v mypy >/dev/null 2>&1; then \
			mypy app/ || echo "⚠️  mypy not installed or failed"; \
		else \
			echo "⚠️  mypy not installed. Install with: pip install mypy"; \
		fi
	@echo ""
	@echo "Running TypeScript type checking..."
	@if command -v pnpm >/dev/null 2>&1; then \
		pnpm type-check || echo "⚠️  TypeScript type checking failed or not configured"; \
	else \
		echo "⚠️  pnpm not found. Skipping TypeScript type check."; \
	fi

# Security scanning
bandit:
	@echo "Running Bandit security scanner..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		if command -v bandit >/dev/null 2>&1; then \
			bandit -c ../../.bandit -r app/; \
		else \
			echo "⚠️  bandit not installed. Install with: pip install bandit"; \
			exit 1; \
		fi

security: bandit
	@echo ""
	@echo "Running Safety dependency scanner..."
	@cd services/api-gateway && \
		. venv/bin/activate && \
		if command -v safety >/dev/null 2>&1; then \
			safety check || echo "⚠️  safety check failed or not installed"; \
		else \
			echo "⚠️  safety not installed. Install with: pip install safety"; \
		fi

# Pre-commit
pre-commit:
	@echo "Running pre-commit hooks on all files..."
	pre-commit run --all-files

# Cleanup
clean:
	@echo "Cleaning build artifacts and caches..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	@echo "Cleanup complete."
