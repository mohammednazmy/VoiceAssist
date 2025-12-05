---
title: Feature Flag Naming Conventions
status: stable
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: feature-flags
owner: backend
summary: Standards for naming feature flags in VoiceAssist
ai_summary: Use category.feature_name pattern. Categories are ui, backend, admin, integration, experiment, ops. Use snake_case for feature names. Never use hyphens or the deprecated ff_ prefix.
component: "backend/api-gateway"
relatedPaths:
  - "packages/types/src/featureFlags.ts"
  - "services/api-gateway/app/core/flag_definitions.py"
---

# Feature Flag Naming Conventions

## Pattern

All feature flags MUST follow this pattern:

```
<category>.<feature_name>
```

- **Category:** One of `ui`, `backend`, `admin`, `integration`, `experiment`, `ops`
- **Name:** snake_case identifier, descriptive of the feature

## Categories

### `ui` - Frontend Changes

For visual/UX features affecting the web app or admin panel.

```typescript
// Good
ui.dark_mode;
ui.new_voice_settings;
ui.compact_chat_layout;

// Bad
darkMode; // Missing category
ui.DarkMode; // Wrong case
ui - dark - mode; // Wrong separator
```

### `backend` - API/Server Features

For backend functionality, API changes, or server-side processing.

```typescript
// Good
backend.streaming_responses;
backend.rag_strategy;
backend.cache_enabled;
backend.rbac_enforcement;
```

### `experiment` - A/B Tests

For experiments and A/B tests that need metrics tracking.

```typescript
// Good
experiment.onboarding_flow_v2;
experiment.pricing_display;
experiment.voice_synthesis;
```

### `ops` - Operational Controls

For operational toggles (maintenance, rate limiting, circuit breakers).

```typescript
// Good
ops.maintenance_mode;
ops.rate_limiting_enabled;
ops.circuit_breaker_rag;
ops.debug_logging;
```

## Naming Rules

1. **Use lowercase only** - `ui.dark_mode` not `ui.Dark_Mode`
2. **Use dots to separate category** - `ui.new_layout` not `ui_new_layout`
3. **Use underscores within feature name** - `backend.cache_strategy` not `backend.cache-strategy`
4. **Be descriptive** - `ui.compact_message_list` not `ui.cml`
5. **Include version when iterating** - `ui.voice_settings_v2`
6. **No abbreviations** unless widely known (`backend.rag_strategy` is OK)

## Migration from Old Pattern

If you encounter the old `ff_category_name` pattern:

```typescript
// Temporary during migration
const enabled = useFeatureFlag("ui.dark_mode_v2") ?? useFeatureFlag("darkMode"); // legacy fallback
```

1. Create new flag with correct name
2. Update code to read both (fallback to old)
3. Migrate state
4. Remove old flag after deprecation period
