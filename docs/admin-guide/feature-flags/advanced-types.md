---
title: Advanced Feature Flag Types
slug: admin-guide/feature-flags/advanced-types
status: stable
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: feature-flags
owner: backend
summary: Boolean, percentage, variant, and scheduled feature flag types
ai_summary: Four flag types available - boolean (on/off), percentage (gradual rollout 0-100%), variant (A/B/C testing), scheduled (time-based activation). Use percentage for safe rollouts, variant for A/B tests.
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/services/feature_flag_service.py"
  - "packages/types/src/featureFlags.ts"
---

# Advanced Feature Flag Types

## Flag Types Overview

| Type         | Use Case              | Example                            |
| ------------ | --------------------- | ---------------------------------- | ----------- | ------------ |
| `boolean`    | Simple on/off toggles | `ops.maintenance_mode`             |
| `percentage` | Gradual rollouts      | `experiment.new_ui` at 25%         |
| `variant`    | A/B/C testing         | `experiment.pricing: 'control'     | 'variant_a' | 'variant_b'` |
| `scheduled`  | Time-based activation | `ops.holiday_mode` starting Dec 20 |

## Boolean Flags

Simple on/off toggles for feature enablement.

```typescript
backend: {
  cache_enabled: {
    name: 'backend.cache_enabled',
    type: 'boolean',
    defaultEnabled: true,
    description: 'Enable multi-level caching'
  }
}
```

**Usage:**

```typescript
if (await featureGate("backend.cache_enabled")) {
  return cachedResult;
}
```

## Percentage Flags

Gradual rollout to a percentage of users.

```typescript
experiment: {
  new_voice_ui: {
    name: 'experiment.new_voice_ui',
    type: 'percentage',
    percentage: 25,
    description: 'New voice interface - 25% rollout'
  }
}
```

**Usage:**

```typescript
// Automatically evaluates based on user ID hash
if (await featureGate('experiment.new_voice_ui', { userId })) {
  return <NewVoiceUI />;
}
```

## Variant Flags

Multi-variant testing for A/B/C experiments.

```typescript
experiment: {
  pricing_display: {
    name: 'experiment.pricing_display',
    type: 'variant',
    variants: ['control', 'variant_a', 'variant_b'],
    weights: [50, 25, 25],  // Distribution percentages
    description: 'Pricing page A/B/C test'
  }
}
```

**Usage:**

```typescript
const variant = await getFeatureVariant('experiment.pricing_display', { userId });
switch (variant) {
  case 'variant_a': return <PricingA />;
  case 'variant_b': return <PricingB />;
  default: return <PricingControl />;
}
```

## Scheduled Flags

Time-based activation with start/end dates.

```typescript
ops: {
  holiday_theme: {
    name: 'ops.holiday_theme',
    type: 'scheduled',
    schedule: {
      start: '2025-12-20T00:00:00Z',
      end: '2026-01-02T23:59:59Z'
    },
    description: 'Holiday theme activation'
  }
}
```

**Usage:**

```typescript
// Automatically checks current time against schedule
if (await featureGate("ops.holiday_theme")) {
  applyHolidayTheme();
}
```
