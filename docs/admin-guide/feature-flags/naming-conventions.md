---
title: Feature Flag Naming Conventions
status: stable
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: feature-flags
owner: backend
summary: Standards for naming feature flags in VoiceAssist
---

# Feature Flag Naming Conventions

## Pattern

All feature flags MUST follow this pattern:

```
<category>.<feature_name>
```

- **Category:** One of `ui`, `backend`, `admin`, `integration`, `experiment`, `ops`
- **Name:** snake_case identifier, descriptive of the feature

> **Note:** The TypeScript definition uses dot notation (e.g., `backend.rag_strategy`).
> Internal references may use the key form (e.g., `rag_strategy` within `BACKEND_FLAGS`).

## Categories

### `ui` - Frontend Changes

For visual/UX features affecting the web app or admin panel.

```typescript
// Good
ui.dark_mode_v2
ui.new_voice_settings
ui.compact_chat_layout
ui.show_beta_badge

// Bad
darkMode           // Missing category
ui.DarkMode        // Wrong case (should be snake_case)
ui-dark-mode       // Wrong separator (use dots)
```

### `backend` - API/Server Features

For backend functionality, API changes, or server-side processing.

```typescript
// Good
backend.streaming_responses
backend.rag_strategy
backend.cache_enabled
backend.rbac_enforcement

// Bad
api.streaming         // Use 'backend' not 'api'
backend-streaming     // Use dots not hyphens
```

### `experiment` - A/B Tests

For experiments and A/B tests that need metrics tracking.

```typescript
// Good
experiment.onboarding_flow_v2
experiment.pricing_display
experiment.voice_synthesis

// Bad
test.onboarding       // Use 'experiment' not 'test'
experiment.test       // Name should describe the feature
```

### `ops` - Operational Controls

For operational toggles (maintenance, rate limiting, circuit breakers).

```typescript
// Good
ops.maintenance_mode
ops.rate_limiting_enabled
ops.circuit_breaker_rag
ops.debug_logging

// Bad
ops.on                // Name must be descriptive
maintenance           // Missing category
```

## Naming Rules

1. **Use lowercase only** - `ui.dark_mode` not `ui.Dark_Mode`
2. **Use dots to separate category** - `ui.new_layout` not `ui_new_layout`
3. **Use underscores within feature name** - `backend.cache_strategy` not `backend.cache-strategy`
4. **Be descriptive** - `ui.compact_message_list` not `ui.cml`
5. **Include version when iterating** - `ui.voice_settings_v2`
6. **No abbreviations** unless widely known (`backend.rag_strategy` is OK)

## CI Validation

The docs-validation workflow enforces these conventions:

```yaml
# .github/workflows/docs-validation.yml
- name: Validate Feature Flag References
  run: |
    INVALID=$(grep -rEn "ff_[a-z]+_" . --include="*.ts" --include="*.md" | \
      grep -vE "ff_(ui|backend|experiment|ops)_[a-z_]+" || true)
    if [ -n "$INVALID" ]; then
      echo "Invalid flag names found:"
      echo "$INVALID"
      exit 1
    fi
```

## Migration Guide

If renaming an existing flag:

1. Create new flag with correct name
2. Update code to read both (fallback to old)
3. Migrate Redis state
4. Remove old flag after deprecation period (2 sprints)

```typescript
// Temporary during migration from old to new naming
const enabled = useFeatureFlag('ui.dark_mode_v2')
  ?? useFeatureFlag('darkMode'); // legacy fallback
```
