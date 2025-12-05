---
title: Docs Site Debugging Guide
slug: debugging/docs-site
summary: >-
  Debug Next.js docs site, static export, Apache routing, and documentation
  issues.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-03"
audience:
  - human
  - agent
  - ai-agents
  - frontend
  - sre
tags:
  - debugging
  - runbook
  - docs-site
  - nextjs
  - apache
  - troubleshooting
relatedServices:
  - docs-site
category: debugging
component: "frontend/docs-site"
relatedPaths:
  - "apps/docs-site/src/app/layout.tsx"
  - "apps/docs-site/src/app/page.tsx"
  - "apps/docs-site/scripts/generate-agent-json.js"
version: 1.1.0
ai_summary: >-
  Last Updated: 2025-12-03 Component: apps/docs-site/ Live Site:
  https://assistdocs.asimo.io --- The docs site is a static Next.js export
  served by Apache: docs/.md → Next.js build → static HTML → Apache →
  assistdocs.asimo.io (apps/docs-site) (out/) (rewrite rules) Key points: - All
  pages are pre-r...
---

# Docs Site Debugging Guide

**Last Updated:** 2025-12-03
**Component:** `apps/docs-site/`
**Live Site:** https://assistdocs.asimo.io

---

## Architecture Overview

The docs site is a **static Next.js export** served by Apache:

```
docs/*.md → Next.js build → static HTML → Apache → assistdocs.asimo.io
           (apps/docs-site)  (out/)       (rewrite rules)
```

Key points:

- All pages are pre-rendered at build time
- No server-side rendering or API routes
- Apache rewrite rules handle clean URLs (no .html extension)
- JSON endpoints are static files generated at build

---

## Symptoms

### 404 Not Found

**Likely Causes:**

- File not generated during build
- Apache rewrite rules not working
- Route not in `generateStaticParams()`
- File permissions issue

**Steps to Investigate:**

1. Check if file exists in output:

```bash
# For route /ai/onboarding, check:
ls -la /var/www/assistdocs.asimo.io/ai/onboarding.html
```

2. Check Apache rewrite logs:

```bash
sudo tail -f /var/log/apache2/assistdocs-error.log
```

3. Test with explicit .html:

```bash
curl -I https://assistdocs.asimo.io/ai/onboarding.html
# vs
curl -I https://assistdocs.asimo.io/ai/onboarding
```

4. Verify Apache rewrite rules:

```bash
sudo cat /etc/apache2/sites-available/assistdocs.asimo.io-le-ssl.conf | grep -A5 "RewriteRule"
```

**Common Fixes:**

```bash
# Ensure rewrite module enabled
sudo a2enmod rewrite

# Required rewrite rules in Apache config:
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI}.html -f
RewriteRule ^(.*)$ $1.html [L]
```

**Relevant Code Paths:**

- `apps/docs-site/src/app/docs/[...slug]/page.tsx` - Dynamic route
- `apps/docs-site/src/lib/docs.ts` - `listAllDocPaths()` function
- Apache config: `/etc/apache2/sites-available/assistdocs.asimo.io-le-ssl.conf`

---

### Build Failures

**Likely Causes:**

- Invalid markdown frontmatter
- Missing dependency
- TypeScript errors
- Route not generating static params

**Steps to Investigate:**

1. Run build locally:

```bash
cd apps/docs-site
pnpm build
```

2. Check for TypeScript errors:

```bash
pnpm tsc --noEmit
```

3. Validate frontmatter:

```bash
pnpm validate:metadata
```

4. Check for missing `generateStaticParams`:

```
Error: Page "/docs/[...slug]" is missing "generateStaticParams()"
```

**Common Fixes:**

```typescript
// Every dynamic route needs generateStaticParams for static export
export function generateStaticParams() {
  const paths = listAllDocPaths();
  return paths.map((path) => ({
    slug: path.split("/"),
  }));
}
```

**Relevant Code Paths:**

- `apps/docs-site/next.config.ts` - `output: "export"`
- `apps/docs-site/src/lib/docs.ts` - Path generation

---

### Agent JSON Endpoints Not Working

**Symptoms:**

- `/agent/index.json` returns 404
- `/agent/docs.json` empty or outdated

**Steps to Investigate:**

1. Check files exist:

```bash
ls -la /var/www/assistdocs.asimo.io/agent/
# Should have index.json and docs.json
```

2. Regenerate agent JSON:

```bash
cd apps/docs-site
pnpm generate-agent-json
```

3. Verify public directory:

```bash
ls -la apps/docs-site/public/agent/
```

4. Re-run build:

```bash
pnpm --filter docs-site build
```

**Relevant Code Paths:**

- `apps/docs-site/scripts/generate-agent-json.js`
- `apps/docs-site/public/agent/` - Static JSON files
- `apps/docs-site/package.json` - prebuild script

---

### Search Not Working

**Symptoms:**

- Search modal shows no results
- `/search-index.json` not loading

**Steps to Investigate:**

1. Check search index exists:

```bash
ls -la /var/www/assistdocs.asimo.io/search-index.json
# Should be several MB
```

2. Verify JSON is valid:

```bash
jq . /var/www/assistdocs.asimo.io/search-index.json | head -20
```

3. Check generation:

```bash
cd apps/docs-site
pnpm generate-search-index
```

4. Test search index fetch:

```bash
curl -I https://assistdocs.asimo.io/search-index.json
```

**Relevant Code Paths:**

- `apps/docs-site/scripts/generate-search-index.js`
- `apps/docs-site/src/components/SearchModal.tsx`

---

### Markdown Not Rendering

**Symptoms:**

- Raw markdown shown instead of HTML
- Code blocks not highlighted
- Tables broken

**Steps to Investigate:**

1. Check MarkdownRenderer component:

```bash
# Look for errors in console about react-markdown
```

2. Verify dependencies:

```bash
cd apps/docs-site
pnpm list | grep -E "react-markdown|remark|syntax-highlight"
```

3. Check markdown content:

```bash
# Look for invalid syntax in the .md file
```

**Common Fixes:**

```typescript
// In MarkdownRenderer.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {content}
</ReactMarkdown>
```

**Relevant Code Paths:**

- `apps/docs-site/src/components/MarkdownRenderer.tsx`
- `apps/docs-site/package.json` - react-markdown dependency

---

### Metadata Not Showing

**Symptoms:**

- Doc page missing status badge
- Owner/audience not displayed
- Frontmatter not parsed

**Steps to Investigate:**

1. Check frontmatter format:

```yaml
---
title: My Document
slug: my-document
status: stable
lastUpdated: "2025-11-27" # Must be quoted string!
audience: ["human", "agent"]
---
```

2. Validate with script:

```bash
cd apps/docs-site
pnpm validate:metadata
```

3. Check parsing logic:

```bash
# Look for Date object handling
# gray-matter auto-parses dates which can cause issues
```

**Relevant Code Paths:**

- `apps/docs-site/src/lib/docs.ts` - `parseMetadata()`
- `apps/docs-site/src/components/DocPage.tsx` - Metadata display

---

### AI-Docs / Semantic Search Not Working

**Symptoms:**

- `docs_search` tool returns empty results
- AI agents can't find documentation via semantic search
- Qdrant collection missing or outdated

**Steps to Investigate:**

1. Check Qdrant is running:

```bash
curl http://localhost:6333/collections
# Should list 'platform_docs' collection
```

2. Verify collection exists and has documents:

```bash
curl http://localhost:6333/collections/platform_docs
# Check 'vectors_count' is > 0
```

3. Check embedding script output:

```bash
cd /home/asimo/VoiceAssist
python scripts/embed-docs.py --dry-run
# Shows which docs would be embedded
```

4. Re-index documentation:

```bash
# Force re-embed all docs
python scripts/embed-docs.py --force
```

5. Verify docs search tool is registered:

```bash
# Check tool registration (note: server/ is deprecated, but tool stub still exists there)
grep -r "docs_search" server/app/tools/
# Production implementation is via services/api-gateway
```

**Common Fixes:**

```bash
# 1. Ensure Qdrant is running
docker compose up -d qdrant

# 2. Re-embed documentation
python scripts/embed-docs.py --force

# 3. Restart API server to pick up changes
docker compose restart api-gateway

# 4. Verify tool is working
curl -X POST http://localhost:8000/api/tools/docs_search \
  -H "Content-Type: application/json" \
  -d '{"query": "voice pipeline"}'
```

**Relevant Code Paths:**

- `scripts/embed-docs.py` - Embedding script
- `services/api-gateway/app/tools/` - Production tool implementations
- `server/app/tools/docs_search_tool.py` - Legacy search tool (deprecated)
- `docker-compose.yml` - Qdrant service configuration

**Related Docs:**

- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md#ai-integration-ai-docs)
- [Agent API Reference](../ai/AGENT_API_REFERENCE.md#ai-docs-semantic-search)

---

## Build and Deploy Process

### Local Development

```bash
cd apps/docs-site
pnpm dev
# Open http://localhost:3000
```

### Build Static Export

```bash
cd apps/docs-site
pnpm build
# Output in out/ directory
```

### Deploy to Production

```bash
# 1. Build
pnpm --filter docs-site build

# 2. Copy to web root
sudo cp -r apps/docs-site/out/* /var/www/assistdocs.asimo.io/

# 3. Verify permissions
sudo chown -R www-data:www-data /var/www/assistdocs.asimo.io/

# 4. Test (docs site has no /health endpoint - use these instead)
curl -I https://assistdocs.asimo.io/                  # Homepage
curl https://assistdocs.asimo.io/agent/index.json    # AI agent discovery
curl https://assistdocs.asimo.io/search-index.json   # Search index
```

### Apache Configuration

Required config at `/etc/apache2/sites-available/assistdocs.asimo.io-le-ssl.conf`:

```apache
<VirtualHost *:443>
    ServerName assistdocs.asimo.io
    DocumentRoot /var/www/assistdocs.asimo.io

    <Directory /var/www/assistdocs.asimo.io>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html

        # Clean URLs - serve .html files without extension
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI}.html -f
        RewriteRule ^(.*)$ $1.html [L]
    </Directory>

    # SSL certificates
    SSLCertificateFile /etc/letsencrypt/live/assistdocs.asimo.io/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/assistdocs.asimo.io/privkey.pem
</VirtualHost>
```

---

## Validation Scripts

```bash
# Validate all frontmatter
pnpm validate:metadata

# Check internal links
pnpm check:links

# Generate agent JSON
pnpm generate:agent-json

# Full validation
pnpm validate:all
```

---

## Common Error Messages

| Error                                    | Cause                        | Fix                                |
| ---------------------------------------- | ---------------------------- | ---------------------------------- |
| `Page is missing generateStaticParams()` | Dynamic route without params | Add function returning all paths   |
| `Objects are not valid as React child`   | Date object in frontmatter   | Convert to string in parseMetadata |
| `MDX compilation error`                  | Invalid JSX in markdown      | Use react-markdown instead         |
| `ENOENT: no such file or directory`      | Doc file moved/deleted       | Update references                  |

---

## Related Documentation

- [Debugging Overview](./DEBUGGING_OVERVIEW.md)
- [Internal Docs System](../INTERNAL_DOCS_SYSTEM.md)
- [Agent API Reference](../ai/AGENT_API_REFERENCE.md)
