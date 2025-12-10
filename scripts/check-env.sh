#!/bin/bash
# Environment Variable Validation Script
# Checks that all required environment variables are present for VoiceAssist

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a variable is set
check_var() {
    local var_name="$1"
    local var_value="${!var_name}"
    local is_optional="$2"

    if [ -z "$var_value" ]; then
        if [ "$is_optional" = "optional" ]; then
            echo -e "${YELLOW}⚠  $var_name${NC} - Optional (not set)"
            return 0
        else
            echo -e "${RED}✗ $var_name${NC} - MISSING (required)"
            return 1
        fi
    else
        echo -e "${GREEN}✓ $var_name${NC} - Set"
        return 0
    fi
}

# Load .env file if it exists
if [ -f .env ]; then
    echo "Loading .env file..."
    set -a
    source .env
    set +a
else
    echo -e "${YELLOW}Warning: .env file not found. Some checks may fail.${NC}"
    echo "Copy .env.example to .env and configure: cp .env.example .env"
    echo ""
fi

echo "======================================"
echo "Environment Variable Validation"
echo "======================================"
echo ""

# Track overall status
MISSING_VARS=0

# Core Environment
echo "Core Environment:"
check_var "ENVIRONMENT" || ((MISSING_VARS++))
check_var "DEBUG" "optional"
echo ""

# Database Configuration
echo "Database:"
check_var "POSTGRES_HOST" || ((MISSING_VARS++))
check_var "POSTGRES_PORT" || ((MISSING_VARS++))
check_var "POSTGRES_USER" || ((MISSING_VARS++))
check_var "POSTGRES_PASSWORD" || ((MISSING_VARS++))
check_var "POSTGRES_DB" || ((MISSING_VARS++))
check_var "DATABASE_URL" || ((MISSING_VARS++))
echo ""

# Redis
echo "Redis:"
check_var "REDIS_HOST" || ((MISSING_VARS++))
check_var "REDIS_PORT" || ((MISSING_VARS++))
check_var "REDIS_PASSWORD" || ((MISSING_VARS++))
echo ""

# Qdrant
echo "Qdrant:"
check_var "QDRANT_HOST" || ((MISSING_VARS++))
check_var "QDRANT_PORT" || ((MISSING_VARS++))
echo ""

# Security/JWT
echo "Security:"
check_var "SECRET_KEY" || ((MISSING_VARS++))
check_var "JWT_SECRET" || ((MISSING_VARS++))
check_var "JWT_ALGORITHM" "optional"
check_var "ACCESS_TOKEN_EXPIRE_MINUTES" "optional"
check_var "REFRESH_TOKEN_EXPIRE_DAYS" "optional"
echo ""

# OpenAI API
echo "OpenAI:"
check_var "OPENAI_API_KEY" || ((MISSING_VARS++))
check_var "OPENAI_API_BASE" "optional"
check_var "OPENAI_MODEL" "optional"
echo ""

# Nextcloud Integration
echo "Nextcloud:"
check_var "NEXTCLOUD_URL" "optional"
check_var "NEXTCLOUD_ADMIN_USER" "optional"
check_var "NEXTCLOUD_ADMIN_PASSWORD" || ((MISSING_VARS++))
echo ""

# Email (optional)
echo "Email (optional):"
check_var "SMTP_HOST" "optional"
check_var "SMTP_PORT" "optional"
check_var "SMTP_USERNAME" "optional"
check_var "SMTP_PASSWORD" "optional"
check_var "EMAIL_FROM" "optional"
echo ""

# Summary
echo "======================================"
if [ $MISSING_VARS -eq 0 ]; then
    echo -e "${GREEN}✓ All required environment variables are set!${NC}"
    echo "======================================"
    exit 0
else
    echo -e "${RED}✗ $MISSING_VARS required variable(s) missing${NC}"
    echo ""
    echo "To fix:"
    echo "  1. Copy .env.example to .env: cp .env.example .env"
    echo "  2. Edit .env and fill in the missing values"
    echo "  3. Run this script again: bash scripts/check-env.sh"
    echo "======================================"
    exit 1
fi
