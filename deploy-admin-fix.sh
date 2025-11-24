#!/bin/bash
# Admin Panel HTTPS Fix Deployment Script
# This script deploys the admin panel with the corrected HTTPS configuration

set -e  # Exit on error

echo "==================================="
echo "Admin Panel HTTPS Fix Deployment"
echo "==================================="
echo ""

# Navigate to VoiceAssist directory
echo "📂 Navigating to VoiceAssist directory..."
cd ~/VoiceAssist

# Show current branch
echo "📌 Current branch:"
git branch | grep "*"
echo ""

# Pull latest changes
echo "⬇️  Pulling latest changes..."
git fetch origin
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "Already up to date"
echo ""

# Navigate to admin panel
echo "📂 Navigating to admin panel..."
cd apps/admin-panel

# Verify .env.production has HTTPS configuration
echo "🔍 Verifying .env.production configuration..."
cat .env.production
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Build with production config
echo "🔨 Building admin panel (production mode)..."
npm run build
echo ""

# Verify build output
echo "✅ Build completed. Output files:"
ls -lh dist/
echo ""

# Backup current deployment
echo "💾 Creating backup of current deployment..."
sudo cp -r /var/www/admin.asimo.io /var/www/admin.asimo.io.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || echo "No previous deployment to backup"
echo ""

# Deploy new build
echo "🚀 Deploying new build to /var/www/admin.asimo.io/..."
sudo cp -r dist/* /var/www/admin.asimo.io/
sudo chown -R www-data:www-data /var/www/admin.asimo.io
echo ""

# Verify deployment
echo "✅ Deployment complete! Verifying files..."
sudo ls -lh /var/www/admin.asimo.io/
echo ""

# Check for HTTPS URLs in deployed JS
echo "🔍 Verifying HTTPS configuration in deployed files..."
if sudo grep -q "https://admin.asimo.io" /var/www/admin.asimo.io/assets/index-*.js; then
    echo "✅ HTTPS configuration confirmed in deployed files"
else
    echo "⚠️  Warning: Could not verify HTTPS URLs in deployed files"
fi
echo ""

echo "==================================="
echo "✅ Deployment Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Clear your browser cache (Ctrl+Shift+R)"
echo "2. Visit https://admin.asimo.io"
echo "3. Check browser DevTools Network tab to verify HTTPS requests"
echo "4. The 'Mixed Content' error should be resolved"
echo ""
echo "If you see a 401 error, make sure to log in with admin credentials."
echo ""
