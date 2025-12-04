---
title: Multi-Environment Feature Flags
status: stable
lastUpdated: 2025-12-04
audience: [developers, devops, ai-agents]
category: feature-flags
owner: backend
summary: Managing feature flags across dev, staging, and production environments
ai_summary: Flags have per-environment states. Dev flags auto-enable, staging mirrors prod with overrides, prod requires explicit enablement. Use Redis namespaced keys (flags:dev:name, flags:prod:name).
---

# Multi-Environment Feature Flags

## Environment Overview

| Environment | Purpose             | Default State         |
| ----------- | ------------------- | --------------------- |
| `dev`       | Development/testing | Flags often enabled   |
| `staging`   | Pre-production QA   | Mirror production     |
| `prod`      | Production          | Conservative defaults |

## Redis Key Structure

Flags are namespaced by environment:

```
flags:<environment>:<flag_name>

# Examples
flags:dev:ui.dark_mode
flags:staging:ui.dark_mode
flags:prod:ui.dark_mode
```

## Environment Configuration

### Development

```typescript
// Auto-enable experimental features in dev
if (process.env.NODE_ENV === "development") {
  defaultEnabled: true;
}
```

### Staging

```typescript
// Mirror production with test overrides
const stagingOverrides = {
  "experiment.new_feature": true, // Test before prod
  "ops.debug_logging": true, // Extra logging
};
```

### Production

```typescript
// Conservative defaults, explicit enablement
const prodDefaults = {
  "backend.rbac_enforcement": true,
  "ops.rate_limiting": true,
  "experiment.new_feature": false, // Requires explicit rollout
};
```

## API Usage

### Get Flag for Environment

```bash
curl /api/admin/feature-flags/ui.dark_mode?env=staging
```

### Set Flag for Environment

```bash
curl -X PATCH /api/admin/feature-flags/ui.dark_mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "environment": "staging"}'
```

### Promote Flag to Production

```bash
# Copy staging state to production
curl -X POST /api/admin/feature-flags/ui.dark_mode/promote \
  -d '{"from": "staging", "to": "prod"}'
```

## Best Practices

1. **Test in dev first** - Always validate in development
2. **Stage mirrors prod** - Staging should have same state as prod
3. **Document overrides** - Record why staging differs from prod
4. **Gradual promotion** - Use percentage rollouts in prod
5. **Rollback plan** - Know how to quickly disable in prod
