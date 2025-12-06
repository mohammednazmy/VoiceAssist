---
title: Feature Flag Lifecycle
slug: admin-guide/feature-flags/lifecycle
status: stable
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: feature-flags
owner: backend
summary: Managing feature flags from creation to retirement
ai_summary: Flags go through 4 stages - creation (disabled), testing (dev/staging), rollout (gradual %), retirement (cleanup). Always start disabled, test in non-prod, use percentage rollouts, clean up after 100% stable.
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/services/feature_flag_service.py"
  - "packages/types/src/featureFlags.ts"
---

# Feature Flag Lifecycle

## Stages Overview

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Creation │───▶│ Testing  │───▶│ Rollout  │───▶│ Retire   │
│ (OFF)    │    │ (Dev)    │    │ (Gradual)│    │ (Cleanup)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Stage 1: Creation

1. Create flag with `enabled: false`
2. Add to `featureFlags.ts` definition
3. Implement feature behind flag check

```typescript
// packages/types/src/featureFlags.ts
ui: {
  new_feature: {
    name: 'ui.new_feature',
    type: 'boolean',
    defaultEnabled: false,
    description: 'New feature description'
  }
}
```

## Stage 2: Testing

1. Enable in development environment
2. Test all code paths (enabled/disabled)
3. Enable in staging for QA
4. Monitor for errors/performance issues

```bash
# Enable for dev only
curl -X PATCH /api/admin/feature-flags/ui.new_feature \
  -d '{"enabled": true, "environment": "dev"}'
```

## Stage 3: Rollout

1. Start with 10% of users
2. Monitor metrics and errors
3. Gradually increase (25%, 50%, 75%, 100%)
4. Have rollback plan ready

```typescript
// Percentage rollout
experiment: {
  new_feature: {
    name: 'experiment.new_feature',
    type: 'percentage',
    percentage: 10,  // Start at 10%
    description: 'Gradual rollout'
  }
}
```

## Stage 4: Retirement

When feature is stable at 100%:

1. Remove flag checks from code
2. Delete flag from definitions
3. Clean up Redis state
4. Update documentation

```bash
# Delete flag
curl -X DELETE /api/admin/feature-flags/experiment.new_feature
```

## Best Practices

- **Never skip stages** - Always test before production
- **Document decisions** - Record why flags were created/retired
- **Set expiration dates** - Flags shouldn't live forever
- **Review quarterly** - Clean up stale flags
