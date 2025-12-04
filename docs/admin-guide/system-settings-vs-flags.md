---
title: System Settings vs Feature Flags
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, ai-agents]
category: reference
owner: backend
summary: Understanding when to use configuration settings vs feature flags
ai_summary: Use system settings for permanent config (API_TIMEOUT, DATABASE_URL). Use feature flags for temporary toggles (new features, A/B tests, gradual rollouts). Settings need deployment to change; flags change at runtime.
---

# System Settings vs Feature Flags

## Overview

VoiceAssist uses two mechanisms for runtime configuration:

- **System Settings**: Permanent configuration values
- **Feature Flags**: Temporary toggles for features in development/testing

## When to Use Each

### Use System Settings For

| Scenario              | Example                 |
| --------------------- | ----------------------- |
| Configuration values  | `API_TIMEOUT=30000`     |
| Resource limits       | `MAX_UPLOAD_SIZE=10MB`  |
| Integration endpoints | `OPENAI_API_URL=...`    |
| Default behaviors     | `DEFAULT_LANGUAGE=en`   |
| Permanent toggles     | `ENABLE_ANALYTICS=true` |

### Use Feature Flags For

| Scenario                    | Example                      |
| --------------------------- | ---------------------------- |
| New features in development | `ui.new_voice_panel`         |
| A/B experiments             | `experiment.pricing_v2`      |
| Gradual rollouts            | `backend.rag_v2` at 25%      |
| Kill switches               | `ops.disable_heavy_features` |
| Time-limited features       | `ops.holiday_mode`           |

## Key Differences

| Aspect   | System Settings       | Feature Flags                    |
| -------- | --------------------- | -------------------------------- |
| Lifespan | Permanent             | Temporary (remove after rollout) |
| Changes  | Require deployment    | Runtime, no deployment           |
| Audience | All users             | Can target segments              |
| Rollback | Redeploy              | Instant toggle                   |
| Storage  | Environment variables | Redis                            |
| UI       | Config files          | Admin Panel                      |

## Decision Tree

```
Is this configuration permanent?
├── Yes → System Setting
└── No → Is it a feature toggle?
    ├── Yes → Feature Flag
    └── No → Is it user-specific?
        ├── Yes → User Preferences
        └── No → System Setting
```

## Examples

### System Settings (Correct)

```bash
# .env
DATABASE_URL=postgres://...
REDIS_URL=redis://...
OPENAI_API_KEY=sk-...
MAX_CONVERSATION_LENGTH=100
DEFAULT_TTS_VOICE=alloy
```

### Feature Flags (Correct)

```typescript
// Using category.feature_name pattern
ui: {
  new_chat_layout: {
    name: 'ui.new_chat_layout',
    type: 'boolean',
    defaultEnabled: false,
    description: 'New chat layout with sidebar'
  }
},

experiment: {
  voice_v2: {
    name: 'experiment.voice_v2',
    type: 'percentage',
    percentage: 25,
    description: 'Testing new voice synthesis'
  }
}
```

### Anti-Patterns

```typescript
// BAD: Using feature flag for permanent config
backend.api_timeout: { default: 30000 } // Should be env var

// BAD: Using env var for temporary feature
ENABLE_NEW_CHAT=true // Should be feature flag

// BAD: Feature flag that will never be removed
ui.enable_dark_mode: {} // If always on, remove flag

// BAD: Old naming convention
ff_ui_dark_mode // Should be: ui.dark_mode
```

## Migration

### Feature Flag → System Setting

When a flag reaches 100% and is stable:

1. Remove flag checks from code
2. If the feature needs configuration, add system setting
3. Remove from `featureFlags.ts`
4. Clean up Redis state

### System Setting → Feature Flag

When you need gradual rollout of a setting change:

1. Create feature flag
2. Add code to check flag before using setting
3. Gradually roll out
4. Once at 100%, update system setting
5. Remove flag

## Related Documentation

- [Feature Flags Overview](./feature-flags/README.md)
- [Feature Flag Lifecycle](./feature-flags/lifecycle.md)
- [Configuration Reference](/reference/configuration.md)
