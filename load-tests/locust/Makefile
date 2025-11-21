# Makefile for VoiceAssist Locust Load Testing

.PHONY: help install test clean smoke load stress spike soak web distributed stop-distributed

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)VoiceAssist Locust Load Testing$(NC)"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "Environment variables:"
	@echo "  VOICEASSIST_BASE_URL  Target API URL (default: http://localhost:8000)"
	@echo "  VOICEASSIST_WS_URL    Target WebSocket URL (default: ws://localhost:8000)"

install: ## Install dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	pip install -r requirements.txt
	@echo "$(GREEN)✓ Dependencies installed!$(NC)"

test: smoke ## Run smoke test (alias for 'smoke')

smoke: ## Run smoke test (10 users, 2m)
	@echo "$(BLUE)Running smoke test...$(NC)"
	./run-tests.sh smoke

load: ## Run load test (100 users, 10m)
	@echo "$(BLUE)Running load test...$(NC)"
	./run-tests.sh load

stress: ## Run stress test (500 users, 15m)
	@echo "$(YELLOW)Running stress test (high load!)...$(NC)"
	./run-tests.sh stress

spike: ## Run spike test (1000 users, 5m)
	@echo "$(YELLOW)Running spike test (sudden traffic spike!)...$(NC)"
	./run-tests.sh spike

soak: ## Run soak test (100 users, 60m)
	@echo "$(YELLOW)Running soak test (1 hour endurance test!)...$(NC)"
	./run-tests.sh soak

user-journey: ## Run user journey scenario
	@echo "$(BLUE)Running user journey scenario...$(NC)"
	./run-tests.sh user-journey

admin-workflow: ## Run admin workflow scenario
	@echo "$(BLUE)Running admin workflow scenario...$(NC)"
	./run-tests.sh admin-workflow

web: ## Start Locust web UI
	@echo "$(BLUE)Starting Locust web UI...$(NC)"
	@echo "$(GREEN)Access at: http://localhost:8089$(NC)"
	./run-tests.sh web

distributed: ## Start distributed Locust (Docker)
	@echo "$(BLUE)Starting distributed Locust...$(NC)"
	./run-tests.sh distributed

stop-distributed: ## Stop distributed Locust
	@echo "$(BLUE)Stopping distributed Locust...$(NC)"
	./run-tests.sh stop-distributed

clean: ## Clean results and cache
	@echo "$(BLUE)Cleaning results and cache...$(NC)"
	rm -rf ../results/locust/*
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	@echo "$(GREEN)✓ Cleaned!$(NC)"

check: ## Check if VoiceAssist is running
	@echo "$(BLUE)Checking VoiceAssist services...$(NC)"
	@curl -sf http://localhost:8000/health > /dev/null && \
		echo "$(GREEN)✓ VoiceAssist is running!$(NC)" || \
		echo "$(YELLOW)⚠ VoiceAssist is not running. Start with: docker-compose up -d$(NC)"

lint: ## Lint Python code
	@echo "$(BLUE)Linting Python code...$(NC)"
	flake8 . --exclude=__pycache__,venv,.venv --max-line-length=100 --ignore=E501,W503 || true
	@echo "$(GREEN)✓ Linting complete!$(NC)"

format: ## Format Python code with black
	@echo "$(BLUE)Formatting Python code...$(NC)"
	black . --exclude "(\.venv|venv|__pycache__|\.git)" --line-length=100
	@echo "$(GREEN)✓ Formatting complete!$(NC)"

validate: ## Validate configuration
	@echo "$(BLUE)Validating configuration...$(NC)"
	python -c "from config import config; print('✓ Configuration valid')"
	@echo "$(GREEN)✓ Configuration is valid!$(NC)"

results: ## Open results directory
	@echo "$(BLUE)Opening results directory...$(NC)"
	@ls -lh ../results/locust/ || echo "No results yet. Run a test first!"

latest-report: ## Open latest HTML report
	@echo "$(BLUE)Opening latest test report...$(NC)"
	@latest=$$(ls -t ../results/locust/*.html 2>/dev/null | head -1); \
	if [ -n "$$latest" ]; then \
		open "$$latest" || xdg-open "$$latest" || echo "Report: $$latest"; \
	else \
		echo "$(YELLOW)No reports found. Run a test first!$(NC)"; \
	fi

logs: ## Show distributed Locust logs
	@echo "$(BLUE)Showing Locust logs...$(NC)"
	docker-compose logs -f locust-master

.DEFAULT_GOAL := help
