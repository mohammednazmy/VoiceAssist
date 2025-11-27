---
title: Documentation Metadata Standard
slug: docs/metadata-standard
summary: Defines the YAML frontmatter schema used across all VoiceAssist documentation for consistency and machine-readability.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human", "agent", "docs"]
tags: ["documentation", "metadata", "standards", "frontmatter"]
category: reference
relatedServices: ["docs-site"]
version: "1.0.0"
---

# Documentation Metadata Standard

This document defines the standard YAML frontmatter schema for all VoiceAssist documentation. Following this standard ensures consistent metadata across docs and enables machine-readable indexing for AI agents and search systems.

## Schema Definition

Every markdown document should include a YAML frontmatter block at the top:

```yaml
---
title: "Document Title"
slug: "category/document-name"
summary: "One-line description of what this document covers."
status: "stable"
stability: "production"
owner: "backend"
lastUpdated: "2025-11-27"
audience: ["human", "agent", "backend"]
tags: ["tag1", "tag2"]
relatedServices: ["api-gateway", "web-app"]
version: "1.0.0"
---
```

## Field Definitions

### Required Fields

| Field         | Type   | Description                                            |
| ------------- | ------ | ------------------------------------------------------ |
| `title`       | string | Human-readable document title                          |
| `slug`        | string | URL-friendly identifier (e.g., `architecture/backend`) |
| `status`      | enum   | Document maturity level                                |
| `lastUpdated` | string | ISO date (YYYY-MM-DD) of last significant update       |

### Recommended Fields

| Field       | Type   | Description                                            |
| ----------- | ------ | ------------------------------------------------------ |
| `summary`   | string | One-line description (< 160 chars for SEO)             |
| `stability` | enum   | Deployment/reliability level of the documented feature |
| `owner`     | enum   | Team or area responsible for this document             |
| `audience`  | array  | Who should read this document                          |
| `tags`      | array  | Searchable keywords                                    |

### Optional Fields

| Field             | Type    | Description                             |
| ----------------- | ------- | --------------------------------------- |
| `relatedServices` | array   | Services/components this doc relates to |
| `version`         | string  | Semantic version of the document        |
| `deprecated`      | boolean | If true, this doc is deprecated         |
| `replacedBy`      | string  | Slug of replacement doc (if deprecated) |

---

## Allowed Values

### `status`

| Value          | Description                                 | Use When                            |
| -------------- | ------------------------------------------- | ----------------------------------- |
| `draft`        | Work in progress, may be incomplete         | New docs still being written        |
| `experimental` | Testing new ideas, may change significantly | Experimental features or approaches |
| `stable`       | Reliable and complete                       | Production-ready documentation      |
| `deprecated`   | No longer recommended, will be removed      | Superseded or obsolete content      |

### `stability`

| Value          | Description                                | Use When                        |
| -------------- | ------------------------------------------ | ------------------------------- |
| `production`   | Battle-tested, used in production          | Mature, deployed features       |
| `beta`         | Functional but may have rough edges        | Features in beta testing        |
| `experimental` | Proof of concept, expect breaking changes  | R&D or experimental features    |
| `legacy`       | Old approach, maintained for compatibility | Deprecated but still functional |

### `owner`

| Value      | Responsible For                     |
| ---------- | ----------------------------------- |
| `backend`  | API Gateway, services, data layer   |
| `frontend` | Web app, admin panel, docs site     |
| `infra`    | Infrastructure, Terraform, Ansible  |
| `sre`      | Operations, monitoring, HA/DR       |
| `docs`     | Documentation itself                |
| `product`  | Product specifications, user guides |
| `security` | Security, compliance, HIPAA         |
| `mixed`    | Cross-functional ownership          |

### `audience`

| Value      | Description                                  |
| ---------- | -------------------------------------------- |
| `human`    | Human readers (developers, operators, users) |
| `agent`    | AI coding assistants (Claude, GPT, Copilot)  |
| `backend`  | Backend developers                           |
| `frontend` | Frontend developers                          |
| `devops`   | DevOps/SRE engineers                         |
| `admin`    | System administrators                        |
| `user`     | End users of VoiceAssist                     |

---

## Examples

### Architecture Document

```yaml
---
title: Unified Architecture Documentation
slug: architecture/unified
summary: Complete system architecture covering all components, data flows, and integration points.
status: stable
stability: production
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human", "agent", "backend", "frontend", "devops"]
tags: ["architecture", "system-design", "overview"]
relatedServices: ["api-gateway", "web-app", "admin-panel"]
version: "2.0.0"
---
```

### API Reference Document

```yaml
---
title: REST API Reference
slug: api-reference/rest-api
summary: Complete REST API documentation with request/response examples.
status: stable
stability: production
owner: backend
lastUpdated: "2025-11-27"
audience: ["human", "agent", "backend", "frontend"]
tags: ["api", "rest", "reference", "endpoints"]
relatedServices: ["api-gateway"]
version: "2.0.0"
---
```

### Operational Runbook

```yaml
---
title: Incident Response Runbook
slug: operations/runbooks/incident-response
summary: Step-by-step procedures for handling production incidents.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["human", "devops", "admin"]
tags: ["operations", "runbook", "incident", "on-call"]
relatedServices: ["api-gateway", "monitoring"]
version: "1.0.0"
---
```

### Deprecated Document

```yaml
---
title: Legacy Server Documentation
slug: server/legacy
summary: Documentation for the deprecated server/ directory.
status: deprecated
stability: legacy
owner: backend
lastUpdated: "2025-11-27"
audience: ["human", "agent"]
tags: ["legacy", "deprecated"]
relatedServices: []
version: "1.0.0"
deprecated: true
replacedBy: "architecture/backend"
---
```

---

## Migration Guide

When updating existing documents:

1. **Rename fields:**
   - `last_updated` → `lastUpdated`
   - `description` → `summary`

2. **Map old status values:**
   - `production` → `status: stable`, `stability: production`
   - `in-development` → `status: draft`, `stability: beta`
   - `deprecated` → `status: deprecated`, `stability: legacy`

3. **Add missing required fields:**
   - Always add `slug` (derive from file path)
   - Always add `status` and `lastUpdated`

4. **Add recommended fields:**
   - Add `owner` based on content area
   - Add `audience` (most docs should include `["human", "agent"]`)
   - Add relevant `tags`

---

## Validation

The docs-site validates frontmatter at build time. Invalid or missing required fields will generate warnings. Use the validation script:

```bash
pnpm docs:validate
```

This checks:

- Presence of required fields
- Valid enum values for `status`, `stability`, `owner`
- ISO date format for `lastUpdated`
- Array types for `audience`, `tags`, `relatedServices`

---

## Version History

| Version | Date       | Changes                     |
| ------- | ---------- | --------------------------- |
| 1.0.0   | 2025-11-27 | Initial standard definition |
