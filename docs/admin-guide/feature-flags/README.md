---
title: Feature Flags Overview
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, ai-agents]
category: feature-flags
owner: backend
summary: Comprehensive guide to VoiceAssist feature flag system
ai_summary: Feature flags enable runtime feature toggling without deployments. Use category.feature_name pattern (e.g., ui.dark_mode, backend.rag_strategy). Flags stored in PostgreSQL, cached in Redis (5min TTL).
---

# Feature Flags Overview

VoiceAssist uses a comprehensive feature flag system for runtime feature management, A/B testing, and gradual rollouts.

## Quick Reference

| Category      | Purpose              | Examples                                           |
| ------------- | -------------------- | -------------------------------------------------- |
| `ui`          | Frontend/UX features | `ui.dark_mode`, `ui.new_navigation`                |
| `backend`     | API/Server features  | `backend.rag_strategy`, `backend.rbac_enforcement` |
| `admin`       | Admin panel features | `admin.bulk_operations`, `admin.analytics`         |
| `integration` | External services    | `integration.nextcloud`, `integration.openai`      |
| `experiment`  | A/B tests            | `experiment.experimental_api`                      |
| `ops`         | Operational controls | `ops.maintenance_mode`, `ops.rate_limiting`        |

## Naming Convention

All flags follow the pattern: `<category>.<feature_name>`

```typescript
// Good examples
ui.dark_mode;
backend.rag_strategy;
ops.maintenance_mode;

// Bad examples
darkMode; // Missing category
ui - dark - mode; // Wrong separator
ff_ui_dark_mode; // Old deprecated pattern
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Application    │────▶│  Feature Flag    │────▶│  PostgreSQL  │
│                 │     │  Service         │     │  (persist)   │
└─────────────────┘     └──────────────────┘     └──────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │    Redis     │
                        │  (5min TTL)  │
                        └──────────────┘
```

## Related Documentation

- [Naming Conventions](./naming-conventions.md)
- [Lifecycle Management](./lifecycle.md)
- [Advanced Types](./advanced-types.md)
- [Multi-Environment](./multi-environment.md)
- [Admin Panel Guide](./admin-panel-guide.md)
- [Best Practices](./best-practices.md)

## API Endpoints

| Endpoint                                 | Method | Description         |
| ---------------------------------------- | ------ | ------------------- |
| `/api/admin/feature-flags`               | GET    | List all flags      |
| `/api/admin/feature-flags/{name}`        | GET    | Get specific flag   |
| `/api/admin/feature-flags`               | POST   | Create flag         |
| `/api/admin/feature-flags/{name}`        | PATCH  | Update flag         |
| `/api/admin/feature-flags/{name}`        | DELETE | Delete flag         |
| `/api/admin/feature-flags/{name}/toggle` | POST   | Toggle boolean flag |
