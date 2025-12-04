---
title: Feature Flag Lifecycle
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, ai-agents]
category: feature-flags
owner: backend
summary: Complete lifecycle of feature flags from creation to cleanup
---

# Feature Flag Lifecycle

## Overview

Every feature flag goes through these phases:

```
Create -> Test -> Promote -> Stabilize -> Deprecate -> Remove
```

## Phases

### 1. Create

**When:** Starting development of a new feature

```typescript
// packages/types/src/featureFlags.ts
export const UI_FLAGS = {
  new_voice_panel: {
    type: 'boolean',
    default: false,
    description: 'New voice panel UI with waveform visualization',
    owner: 'frontend',
    created: '2025-12-01',
    jira: 'VA-1234'
  }
} as const;

// Access as: ui.new_voice_panel
```

**Requirements:**
- Add to `packages/types/src/featureFlags.ts`
- Include `description`, `owner`, `created`, `jira` ticket
- Default to `false` (off)
- Document in admin-guide/feature-flags/

### 2. Test (Development)

**When:** Feature is code-complete, needs testing

- Enable flag in **development** environment
- Run automated tests with flag on/off
- Manual QA verification
- Update flag status to `testing`

```typescript
// ui.new_voice_panel
new_voice_panel: {
  ...
  status: 'testing',
  testedBy: 'qa-team',
  testDate: '2025-12-05'
}
```

### 3. Promote (Staging)

**When:** Testing passes, ready for broader validation

- Enable flag in **staging** environment
- Run E2E tests
- Stakeholder review
- Performance validation

```typescript
// ui.new_voice_panel
new_voice_panel: {
  ...
  status: 'staging',
  promotedDate: '2025-12-08'
}
```

### 4. Stabilize (Production Rollout)

**When:** Staging validation complete

**Rollout strategies:**

| Strategy | Use Case | Example |
|----------|----------|---------|
| Immediate | Low risk, simple changes | `enabled: true` |
| Percentage | Gradual rollout | `percentage: 10 -> 50 -> 100` |
| User segments | Targeted rollout | `segments: ['beta-users']` |

```typescript
// Gradual rollout for ui.new_voice_panel
new_voice_panel: {
  type: 'percentage',
  percentage: 25, // 25% of users
  status: 'rolling-out'
}
```

### 5. Deprecate

**When:** Flag at 100%, feature stable for 2+ sprints

- Mark flag as `deprecated`
- Add `deprecationDate`
- Begin code removal timeline

```typescript
// ui.new_voice_panel
new_voice_panel: {
  ...
  status: 'deprecated',
  deprecationDate: '2025-12-20',
  removeBy: '2026-01-15'
}
```

### 6. Remove

**When:** After deprecation period (minimum 2 sprints)

1. Remove flag checks from code
2. Remove from `featureFlags.ts`
3. Clean up Redis state
4. Update documentation

## Status Values

| Status | Description |
|--------|-------------|
| `draft` | In development, not testable |
| `testing` | In dev/test environments |
| `staging` | In staging environment |
| `active` | Live in production |
| `deprecated` | Marked for removal |
| `disabled` | Turned off (emergency) |

## Versioning

When iterating on a feature:

```typescript
// Version 1 - deprecated (ui.voice_panel)
voice_panel: { status: 'deprecated', removeBy: '2026-01-01' }

// Version 2 - active (ui.voice_panel_v2)
voice_panel_v2: { status: 'active' }
```

## Cleanup Automation

Monthly cleanup job identifies:
- Flags deprecated > 30 days
- Flags at 100% rollout > 14 days
- Flags with no code references

```bash
npm run flags:audit
```

## Tracking

All lifecycle changes are logged to:
- Redis: `flags:changelog:<flag_name>`
- Activity JSON: `/agent/activity.json`
- Admin Panel: Settings > Feature Flags > History
