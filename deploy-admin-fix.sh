#!/bin/bash

# Admin Panel Deployment Script
# Fixes HTTPS mixed content issues and deploys updated admin panel

set -e  # Exit on any error

echo "========================================="
echo "Admin Panel Deployment Script"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -d "apps/admin-panel" ]; then
    echo -e "${RED}Error: Must run from VoiceAssist root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Navigating to admin panel directory...${NC}"
cd apps/admin-panel

ENV_FILE=${ENV_FILE:-../deployment/production/configs/admin-panel.env}

if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Step 1a: Loading environment from $ENV_FILE...${NC}"
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
else
    echo -e "${RED}Warning: Environment file $ENV_FILE not found. Using current shell variables.${NC}"
fi

echo -e "${YELLOW}Step 2: Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}Step 3: Building admin panel with production config...${NC}"
NODE_ENV=production npm run build

echo -e "${YELLOW}Step 4: Deploying to Apache directory...${NC}"
sudo rsync -av --delete dist/ /var/www/admin.asimo.io/

echo -e "${YELLOW}Step 5: Setting correct permissions...${NC}"
sudo chown -R www-data:www-data /var/www/admin.asimo.io/

echo -e "${YELLOW}Step 6: Verifying deployment...${NC}"
ls -lh /var/www/admin.asimo.io/

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "The admin panel has been deployed to: /var/www/admin.asimo.io/"
echo "Access it at: https://admin.asimo.io"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC} Please do a hard refresh in your browser:"
echo "  - Windows/Linux: Ctrl + Shift + R"
echo "  - Mac: Cmd + Shift + R"
echo ""
echo "This will clear the cached JavaScript and load the new HTTPS-enabled version."
echo ""
