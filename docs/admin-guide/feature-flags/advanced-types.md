---
title: Feature Flag Advanced Types
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, ai-agents]
category: feature-flags
owner: backend
summary: Boolean, percentage, variant, and scheduled feature flag types
---

# Feature Flag Advanced Types

## Overview

VoiceAssist supports four feature flag types, each suited for different use cases.

## Boolean Flags

Simple on/off toggles. The most common type.

```typescript
// ui.dark_mode
dark_mode: {
  type: 'boolean',
  default: false,
  description: 'Enable dark mode UI'
}
```

**Use cases:**

- Feature toggles
- Kill switches
- Beta feature access

## Percentage Flags

Gradual rollout to a percentage of users.

```typescript
// experiment.new_chat
new_chat: {
  type: 'percentage',
  percentage: 25, // 25% of users
  description: 'New chat interface rollout'
}
```

**Configuration:**

- `percentage`: 0-100
- Hashing uses `userId` for consistent assignment
- Same user always gets same result

**Rollout strategy:**

```
1% -> 5% -> 10% -> 25% -> 50% -> 100%
```

## Variant Flags (Multivariate)

A/B/C testing with multiple variants and configurable weights.

### Basic Configuration

```typescript
// experiment.pricing
pricing: {
  type: 'multivariate',
  variants: [
    { id: 'control', name: 'Control', value: { tier: 'standard' }, weight: 50 },
    { id: 'treatment_a', name: 'Treatment A', value: { tier: 'premium' }, weight: 30 },
    { id: 'treatment_b', name: 'Treatment B', value: { tier: 'freemium' }, weight: 20 },
  ],
  description: 'Pricing tier experiment'
}
```

### Variant Properties

| Property      | Type   | Required | Description                              |
| ------------- | ------ | -------- | ---------------------------------------- |
| `id`          | string | Yes      | Unique variant identifier                |
| `name`        | string | Yes      | Human-readable name                      |
| `value`       | any    | Yes      | Value returned when variant selected     |
| `weight`      | number | Yes      | Distribution weight (normalized to 100%) |
| `description` | string | No       | Optional description                     |

### Weight Normalization

Weights are automatically normalized to sum to 100%:

- `[45, 45]` → `[50, 50]`
- `[10, 20, 30]` → `[16.67, 33.33, 50]`
- `[0, 0, 0]` → Equal distribution (`[33.33, 33.33, 33.33]`)
- Negative weights are treated as 0

### Usage

```typescript
const variant = useFeatureFlag("experiment.pricing");
// Returns: { tier: 'standard' } | { tier: 'premium' } | { tier: 'freemium' }

// Or get variant ID
const variantId = useFeatureFlag("experiment.pricing", { returnVariantId: true });
// Returns: 'control' | 'treatment_a' | 'treatment_b'
```

### Consistent Assignment

Same user always gets same variant for a given flag (hash-based):

- Uses SHA-256 hashing with `userId + flagName + salt`
- Can override with custom `rollout_salt` for re-randomization

## Targeting Rules

User segmentation for precise flag targeting.

### Rule Structure

```typescript
targeting_rules: {
  rules: [
    {
      id: 'admin-override',
      name: 'Admin Override',
      priority: 1,  // Lower = higher priority
      conditions: [
        { attribute: 'user_role', operator: 'equals', value: 'admin' }
      ],
      variant: 'treatment_a',  // For multivariate flags
      enabled: true            // For boolean flags
    }
  ],
  defaultVariant: 'control',
  defaultEnabled: false
}
```

### Supported Operators

| Operator      | Description                    | Example                                    |
| ------------- | ------------------------------ | ------------------------------------------ |
| `equals`      | Exact match (case-insensitive) | `user_role equals "admin"`                 |
| `not_equals`  | Not equal                      | `user_plan not_equals "free"`              |
| `in`          | In list                        | `user_role in ["admin", "staff"]`          |
| `not_in`      | Not in list                    | `user_country not_in ["CN", "RU"]`         |
| `contains`    | String contains                | `user_email contains "@company.com"`       |
| `starts_with` | String starts with             | `user_id starts_with "test_"`              |
| `ends_with`   | String ends with               | `user_email ends_with ".gov"`              |
| `regex`       | Regular expression             | `user_email regex "^[a-z]+@company\.com$"` |
| `gt`          | Greater than (numeric)         | `team_size gt 10`                          |
| `gte`         | Greater than or equal          | `api_calls gte 1000`                       |
| `lt`          | Less than                      | `error_rate lt 0.05`                       |
| `lte`         | Less than or equal             | `latency_ms lte 200`                       |
| `semver_gt`   | Semver greater than            | `app_version semver_gt "2.0.0"`            |
| `semver_gte`  | Semver greater or equal        | `app_version semver_gte "1.5.0"`           |
| `semver_lt`   | Semver less than               | `app_version semver_lt "3.0.0"`            |
| `semver_lte`  | Semver less or equal           | `app_version semver_lte "2.5.0"`           |

### User Context Attributes

| Attribute       | Description                       |
| --------------- | --------------------------------- |
| `user_id`       | Unique user identifier            |
| `user_email`    | User's email address              |
| `user_role`     | User role (admin, staff, patient) |
| `user_plan`     | Subscription plan                 |
| `user_country`  | ISO country code                  |
| `user_language` | Language code                     |
| `app_version`   | Application version               |
| `platform`      | Platform (web, ios, android)      |
| `custom.*`      | Custom attributes                 |

### Rule Priority

Rules are evaluated in priority order (lower number = higher priority):

```typescript
rules: [
  { id: 'rule-1', priority: 1, ... },  // Evaluated first
  { id: 'rule-2', priority: 2, ... },  // Evaluated second
  { id: 'rule-3', priority: 10, ... }, // Evaluated last
]
```

First matching rule wins. If no rules match, default values are used

## Scheduled Flags

Time-based activation and deactivation.

```typescript
// ops.holiday_banner
holiday_banner: {
  type: 'scheduled',
  schedule: {
    start: '2025-12-20T00:00:00Z',
    end: '2025-12-26T23:59:59Z'
  },
  description: 'Holiday banner display'
}
```

**Use cases:**

- Seasonal features
- Timed promotions
- Maintenance windows
- Feature launches

## Type Selection Guide

| Scenario              | Recommended Type           |
| --------------------- | -------------------------- |
| Simple feature toggle | `boolean`                  |
| Gradual rollout       | `percentage`               |
| A/B testing           | `variant`                  |
| Time-based feature    | `scheduled`                |
| Emergency kill switch | `boolean`                  |
| Regional rollout      | `percentage` with segments |

## Combining Types

Flags can combine behaviors:

```typescript
// experiment.voice_v2
voice_v2: {
  type: 'percentage',
  percentage: 50,
  schedule: {
    start: '2025-12-01T00:00:00Z'
  },
  segments: ['beta-users', 'internal']
}
```

This flag:

1. Only active after Dec 1, 2025
2. Targets beta users and internal users first
3. Rolls out to 50% of remaining users
