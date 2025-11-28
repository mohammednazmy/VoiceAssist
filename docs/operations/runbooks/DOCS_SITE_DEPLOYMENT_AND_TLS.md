---
title: Docs Site Deployment and TLS Runbook
slug: operations/runbooks/docs-site-deployment-tls
summary: Step-by-step guide for building, deploying, and managing TLS for assistdocs.asimo.io.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["human", "agent", "sre", "devops"]
tags: ["deployment", "runbook", "docs-site", "tls", "apache", "certbot"]
relatedServices: ["docs-site"]
category: operations
version: "1.0.0"
---

# Docs Site Deployment and TLS Runbook

**Last Updated:** 2025-11-27
**URL:** https://assistdocs.asimo.io
**Document Root:** `/var/www/assistdocs.asimo.io`

---

## Quick Deployment Checklist

```bash
# 1. Navigate to repo
cd ~/VoiceAssist

# 2. Pull latest changes
git pull origin main

# 3. Install dependencies (if needed)
pnpm install

# 4. Navigate to docs-site
cd apps/docs-site

# 5. Validate metadata and links
pnpm validate:metadata
pnpm check:links

# 6. Generate agent JSON (if docs changed)
node scripts/generate-agent-json.mjs

# 7. Build the static site
pnpm build

# 8. Deploy to Apache document root
sudo rm -rf /var/www/assistdocs.asimo.io/*
sudo cp -r out/* /var/www/assistdocs.asimo.io/

# 9. Verify deployment
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/agent/index.json
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/agent/docs.json
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/search-index.json
```

---

## Architecture Overview

### Build Process

```
docs/*.md                    → Next.js static export
apps/docs-site/              → Build artifacts in out/
scripts/generate-agent-json  → public/agent/*.json
                             → search-index.json
```

### Deployment Architecture

```
┌──────────────────────────────────────────────────┐
│ Apache2 (mod_ssl, mod_rewrite)                   │
│   - assistdocs.asimo.io-le-ssl.conf              │
│   - DocumentRoot: /var/www/assistdocs.asimo.io   │
│   - RewriteEngine for clean URLs                 │
└──────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│ Static Files                                      │
│   - /*.html (Next.js pages)                      │
│   - /agent/*.json (AI agent endpoints)           │
│   - /search-index.json (Fuse.js)                 │
│   - /sitemap.xml                                 │
└──────────────────────────────────────────────────┘
```

---

## Step 1: Prepare for Deployment

### 1.1 Sync Repository

```bash
cd ~/VoiceAssist
git pull origin main
git status  # Verify clean state
```

### 1.2 Install Dependencies

```bash
# Root level (pnpm workspace)
pnpm install

# Verify docs-site dependencies
cd apps/docs-site
ls node_modules/.bin/next  # Should exist
```

---

## Step 2: Validate Documentation

### 2.1 Metadata Validation

```bash
cd ~/VoiceAssist/apps/docs-site
pnpm validate:metadata
```

**Expected Output:** No errors about missing or invalid frontmatter.

### 2.2 Link Validation

```bash
pnpm check:links
```

**Expected Output:** All internal links resolve correctly.

### 2.3 Fix Common Issues

**Missing frontmatter:**

```yaml
---
title: "Document Title"
slug: "path/to-document"
summary: "Brief description"
status: stable
stability: production
owner: team
lastUpdated: "YYYY-MM-DD"
audience: ["human", "agent"]
tags: ["tag1", "tag2"]
category: category-name
---
```

**Broken links:** Update markdown links to use relative paths from docs/ directory.

---

## Step 3: Generate Agent JSON

The agent JSON files provide machine-readable access to documentation.

### 3.1 Run Generation Script

```bash
cd ~/VoiceAssist/apps/docs-site
node scripts/generate-agent-json.mjs
```

### 3.2 Verify Output

```bash
# Check index.json
cat public/agent/index.json | jq '.name'
# Should output: "VoiceAssist Documentation"

# Check docs.json count
cat public/agent/docs.json | jq 'length'
# Should output document count (e.g., 220+)

# Check search index
ls -la public/search-index.json
```

---

## Step 4: Build Static Site

### 4.1 Run Build

```bash
cd ~/VoiceAssist/apps/docs-site
pnpm build
```

**Expected Output:**

- `✓ Compiled successfully`
- `Export successful`
- Files in `out/` directory

### 4.2 Verify Build Output

```bash
ls out/
# Should contain: index.html, ai/, docs/, agent/, search-index.json, sitemap.xml

ls out/agent/
# Should contain: index.json, docs.json, schema.json
```

---

## Step 5: Deploy to Apache

### 5.1 Clear Old Files

```bash
sudo rm -rf /var/www/assistdocs.asimo.io/*
```

### 5.2 Copy New Build

```bash
sudo cp -r ~/VoiceAssist/apps/docs-site/out/* /var/www/assistdocs.asimo.io/
```

### 5.3 Set Permissions

```bash
sudo chown -R www-data:www-data /var/www/assistdocs.asimo.io
sudo chmod -R 755 /var/www/assistdocs.asimo.io
```

### 5.4 Reload Apache (if config changed)

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## Step 6: Verify Deployment

### 6.1 Check HTTP Status

```bash
# Main page
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/

# AI agent endpoints
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/agent/index.json
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/agent/docs.json
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/search-index.json

# Clean URLs (should return 200, not 404)
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/ai/onboarding
curl -s -o /dev/null -w "%{http_code}" https://assistdocs.asimo.io/ai/status
```

**Expected:** All should return `200`.

### 6.2 Check Content

```bash
# Verify agent JSON content
curl -s https://assistdocs.asimo.io/agent/index.json | jq '.endpoints'

# Verify sitemap
curl -s https://assistdocs.asimo.io/sitemap.xml | head -20
```

---

## TLS Certificate Management

### Current Certificate Status

```bash
sudo certbot certificates | grep -A 5 "assistdocs.asimo.io"
```

**Current Certificate:**

- **Domain:** assistdocs.asimo.io
- **Issuer:** Let's Encrypt
- **Key Type:** ECDSA
- **Certificate Path:** `/etc/letsencrypt/live/assistdocs.asimo.io/fullchain.pem`
- **Private Key Path:** `/etc/letsencrypt/live/assistdocs.asimo.io/privkey.pem`
- **Expiry:** 2026-02-19 (auto-renewed)

### Automatic Renewal

Certbot automatically renews certificates via systemd timer.

```bash
# Check timer status
sudo systemctl status certbot.timer

# View renewal schedule
sudo systemctl list-timers | grep certbot

# Test renewal (dry run)
sudo certbot renew --dry-run
```

### Manual Renewal (if needed)

```bash
# Renew specific certificate
sudo certbot renew --cert-name assistdocs.asimo.io

# Force renewal
sudo certbot renew --cert-name assistdocs.asimo.io --force-renewal

# Reload Apache after renewal
sudo systemctl reload apache2
```

### New Certificate (if domain changes)

```bash
sudo certbot --apache -d assistdocs.asimo.io
```

---

## Apache Configuration

### Configuration File

**Location:** `/etc/apache2/sites-available/assistdocs.asimo.io-le-ssl.conf`

### Key Configuration

```apache
<VirtualHost *:443>
    ServerName assistdocs.asimo.io
    DocumentRoot /var/www/assistdocs.asimo.io

    <Directory /var/www/assistdocs.asimo.io>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html

        # Clean URLs for Next.js static export
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI}.html -f
        RewriteRule ^(.*)$ $1.html [L]
    </Directory>

    # SSL (managed by Certbot)
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/assistdocs.asimo.io/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/assistdocs.asimo.io/privkey.pem
</VirtualHost>
```

### Test Configuration

```bash
sudo apache2ctl configtest
```

### Reload After Changes

```bash
sudo systemctl reload apache2
```

---

## Troubleshooting

### 404 for Clean URLs

**Symptom:** `/ai/onboarding` returns 404 but `/ai/onboarding.html` works.

**Cause:** RewriteEngine rules not applied.

**Fix:**

1. Ensure `mod_rewrite` is enabled: `sudo a2enmod rewrite`
2. Verify rules are inside `<Directory>` block
3. Reload Apache: `sudo systemctl reload apache2`

### Build Fails

**Symptom:** `pnpm build` fails with errors.

**Checks:**

```bash
# Check for TypeScript errors
pnpm tsc --noEmit

# Check for missing dependencies
pnpm install

# Clear cache
rm -rf .next out
pnpm build
```

### Agent JSON Not Updated

**Symptom:** `/agent/docs.json` shows old documents.

**Fix:**

```bash
# Regenerate agent JSON
node scripts/generate-agent-json.mjs

# Rebuild and redeploy
pnpm build
sudo cp -r out/* /var/www/assistdocs.asimo.io/
```

### TLS Certificate Expired

**Symptom:** Browser shows certificate error.

**Fix:**

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --cert-name assistdocs.asimo.io --force-renewal

# Reload Apache
sudo systemctl reload apache2
```

---

## Related Documentation

- [Debugging Docs Site](../../debugging/DEBUGGING_DOCS_SITE.md)
- [Implementation Status](../../overview/IMPLEMENTATION_STATUS.md)
- [Internal Docs System](../../INTERNAL_DOCS_SYSTEM.md)
