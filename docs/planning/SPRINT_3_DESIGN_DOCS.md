---
title: Sprint 3 Design Documents
slug: sprint-3-design-docs
summary: Design specifications for documentation versioning, CODEOWNERS, and i18n/RTL support
ai_summary: Sprint 3 covers three features - documentation versioning (git tags + version selector), CODEOWNERS for cross-team ownership, and i18n structure for multi-language support with RTL. Estimated 3-4 weeks total implementation.
status: draft
owner: docs
lastUpdated: "2025-12-04"
audience: ["developers", "docs", "ai-agents"]
category: planning
tags: ["versioning", "codeowners", "i18n", "sprint-3"]
---

# Sprint 3 Design Documents

This document outlines the design specifications for Sprint 3 features:

1. **Documentation Versioning System**
2. **CODEOWNERS for Cross-Team Ownership**
3. **i18n/RTL Multi-Language Structure**

---

## 1. Documentation Versioning System

### Overview

Implement version-tagged documentation to support multiple product versions simultaneously. Users can switch between documentation versions (e.g., v1.x, v2.x, latest).

### Requirements

- Support semantic versioning (major.minor.patch)
- Git-tag-based version snapshots
- UI version selector in docs site header
- Maintain "latest" as default with version-specific URLs
- SEO-friendly canonical URLs

### Technical Design

#### Version Storage

```
docs/
├── versions.json          # Version manifest
├── v1/                    # Version 1.x docs (if needed)
│   └── ...
└── ...                    # Current (latest) docs
```

**versions.json Schema:**

```json
{
  "current": "2.0.0",
  "versions": [
    {
      "version": "2.0.0",
      "label": "v2.0 (Latest)",
      "path": "/",
      "isLatest": true,
      "releaseDate": "2025-12-01"
    },
    {
      "version": "1.5.0",
      "label": "v1.5 (Maintenance)",
      "path": "/v1/",
      "isLatest": false,
      "releaseDate": "2025-10-15",
      "deprecationDate": "2026-06-01"
    }
  ],
  "defaultVersion": "2.0.0"
}
```

#### URL Structure

```
# Latest version (default)
https://assistdocs.asimo.io/feature-flags/README

# Specific version
https://assistdocs.asimo.io/v1/feature-flags/README

# Canonical URL in version pages
<link rel="canonical" href="https://assistdocs.asimo.io/feature-flags/README" />
```

#### Version Selector Component

```typescript
// apps/docs-site/src/components/VersionSelector.tsx
interface VersionSelectorProps {
  currentVersion: string;
  versions: Version[];
  currentPath: string;
}

function VersionSelector({ currentVersion, versions, currentPath }: VersionSelectorProps) {
  return (
    <select
      value={currentVersion}
      onChange={(e) => navigateToVersion(e.target.value, currentPath)}
      aria-label="Select documentation version"
    >
      {versions.map(v => (
        <option key={v.version} value={v.version}>
          {v.label}
        </option>
      ))}
    </select>
  );
}
```

#### Build Process

```bash
# scripts/build-versioned-docs.sh
#!/bin/bash

# 1. Build latest docs
pnpm --filter docs-site build

# 2. Copy to version folder
mkdir -p dist/v${VERSION}
cp -r dist/* dist/v${VERSION}/

# 3. Generate version manifest
node scripts/generate-versions-manifest.js
```

### Implementation Tasks

- [ ] Create versions.json schema and initial manifest
- [ ] Implement VersionSelector component
- [ ] Update routing to support versioned URLs
- [ ] Add version badge to docs header
- [ ] Create build script for version snapshots
- [ ] Update CI/CD to trigger version builds on tag
- [ ] Add redirects for deprecated versions

---

## 2. CODEOWNERS for Cross-Team Ownership

### Overview

Define clear ownership of documentation sections using GitHub CODEOWNERS format. This enables automatic review assignments and accountability.

### CODEOWNERS File

```
# .github/CODEOWNERS - Documentation ownership

# Default owners for everything in docs/
docs/ @voiceassist/docs-team

# Feature-specific ownership
docs/admin-guide/feature-flags/ @voiceassist/backend-team
docs/voice/ @voiceassist/voice-team
docs/api/ @voiceassist/backend-team
docs/security/ @voiceassist/security-team
docs/deployment/ @voiceassist/devops-team
docs/testing/ @voiceassist/qa-team

# Admin panel docs
docs/admin/ @voiceassist/frontend-team
apps/admin-panel/ @voiceassist/frontend-team

# AI and RAG documentation
docs/ai/ @voiceassist/ai-team

# Architecture decisions require multiple reviewers
docs/architecture/ @voiceassist/backend-team @voiceassist/frontend-team

# Operations and runbooks
docs/operations/ @voiceassist/sre-team
docs/debugging/ @voiceassist/sre-team

# Planning docs need product review
docs/planning/ @voiceassist/product-team @voiceassist/docs-team

# Scripts ownership
scripts/ @voiceassist/devops-team

# Agent JSON generation
scripts/generate-all-agent-json.js @voiceassist/docs-team @voiceassist/ai-team
```

### Ownership Metadata in Frontmatter

Extend frontmatter to include ownership info:

```yaml
---
title: Feature Flags Overview
owner: backend # Team responsible for content
maintainers: # Individual maintainers (optional)
  - "@username1"
  - "@username2"
reviewers: # Required reviewers for changes
  - "@voiceassist/backend-team"
last_review: "2025-11-15"
next_review: "2026-02-15"
---
```

### Ownership Dashboard

Add to `/agent/health.json`:

```json
{
  "ownership": {
    "by_owner": {
      "backend": { "count": 45, "coverage": 100 },
      "frontend": { "count": 23, "coverage": 95 },
      "docs": { "count": 120, "coverage": 100 },
      "unassigned": { "count": 15, "coverage": 0 }
    },
    "needs_review": [{ "path": "api/openapi-spec.md", "last_review": "2025-06-01" }]
  }
}
```

### Implementation Tasks

- [ ] Create .github/CODEOWNERS file
- [ ] Add `maintainers` and `reviewers` to frontmatter schema
- [ ] Update frontmatter validation script
- [ ] Add ownership metrics to health.json
- [ ] Create ownership audit report script
- [ ] Document ownership process in CONTRIBUTING.md

---

## 3. i18n/RTL Multi-Language Structure

### Overview

Prepare documentation structure for future multi-language support, including RTL (Right-to-Left) languages like Arabic.

### Directory Structure

```
docs/
├── en/                    # English (default, source of truth)
│   ├── admin-guide/
│   ├── api/
│   └── ...
├── ar/                    # Arabic (RTL)
│   ├── admin-guide/
│   └── ...
├── tr/                    # Turkish
│   └── ...
└── i18n.config.json       # i18n configuration
```

### i18n Configuration

**i18n.config.json:**

```json
{
  "defaultLocale": "en",
  "locales": [
    {
      "code": "en",
      "name": "English",
      "dir": "ltr",
      "isDefault": true,
      "completeness": 100
    },
    {
      "code": "ar",
      "name": "العربية",
      "dir": "rtl",
      "isDefault": false,
      "completeness": 0,
      "status": "planned"
    },
    {
      "code": "tr",
      "name": "Türkçe",
      "dir": "ltr",
      "isDefault": false,
      "completeness": 0,
      "status": "planned"
    }
  ],
  "fallbackLocale": "en",
  "routes": {
    "prefix": true,
    "defaultLocalePrefix": false
  }
}
```

### URL Structure

```
# Default locale (English) - no prefix
https://assistdocs.asimo.io/feature-flags/README

# Arabic version
https://assistdocs.asimo.io/ar/feature-flags/README

# Turkish version
https://assistdocs.asimo.io/tr/feature-flags/README
```

### RTL Support

#### CSS Variables

```css
/* apps/docs-site/src/styles/rtl.css */
:root {
  --text-direction: ltr;
  --flex-direction: row;
  --margin-start: margin-left;
  --margin-end: margin-right;
}

[dir="rtl"] {
  --text-direction: rtl;
  --flex-direction: row-reverse;
  --margin-start: margin-right;
  --margin-end: margin-left;
}

/* Logical properties for RTL support */
.sidebar {
  margin-inline-start: 1rem;
  padding-inline-end: 1rem;
}
```

#### Layout Component

```typescript
// apps/docs-site/src/components/LocaleProvider.tsx
interface LocaleProviderProps {
  locale: string;
  dir: 'ltr' | 'rtl';
  children: React.ReactNode;
}

function LocaleProvider({ locale, dir, children }: LocaleProviderProps) {
  return (
    <html lang={locale} dir={dir}>
      <body className={dir === 'rtl' ? 'rtl-mode' : ''}>
        {children}
      </body>
    </html>
  );
}
```

### Translation Workflow

1. **Source Content**: All content written in English first
2. **Translation Keys**: Extract translatable strings
3. **Machine Translation**: Use AI-assisted translation for draft
4. **Human Review**: Native speakers review translations
5. **Sync Check**: Automated checks for missing translations

#### Translation Status Frontmatter

```yaml
---
title: Feature Flags Overview
i18n:
  source_locale: en
  translations:
    ar:
      status: pending
      translator: null
      last_sync: null
    tr:
      status: pending
      translator: null
      last_sync: null
---
```

### Implementation Tasks

- [ ] Create i18n.config.json schema
- [ ] Set up locale-based routing
- [ ] Implement LocaleProvider component
- [ ] Add RTL CSS utilities
- [ ] Create language selector component
- [ ] Build translation status dashboard
- [ ] Document translation workflow in CONTRIBUTING.md
- [ ] Add i18n completeness to health.json

---

## Implementation Timeline

### Phase 1: Foundation (Week 1)

- CODEOWNERS file creation
- Ownership metadata in frontmatter
- Update validation scripts

### Phase 2: Versioning (Week 2)

- Version manifest schema
- VersionSelector component
- Versioned URL routing

### Phase 3: i18n Preparation (Week 3-4)

- i18n config and directory structure
- RTL CSS support
- LocaleProvider component
- Language selector UI

---

## Success Metrics

| Feature    | Metric                            | Target    |
| ---------- | --------------------------------- | --------- |
| Versioning | Version switch time               | < 1s      |
| CODEOWNERS | Coverage                          | 100%      |
| i18n       | RTL rendering accuracy            | 100%      |
| i18n       | Translation completeness tracking | Automated |

---

## Related Documentation

- [Feature Flags Overview](../admin-guide/feature-flags/README.md)
- [Documentation Guide for AI Agents](../admin-guide/for-ai-agents.md)
- [NEXT_PHASE_IMPROVEMENTS.md](../NEXT_PHASE_IMPROVEMENTS.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-04
**Status**: Draft - Ready for Review
