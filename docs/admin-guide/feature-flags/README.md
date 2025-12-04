---
title: Feature Flags Overview
status: stable
lastUpdated: 2025-12-04
audience: [admin, developers, ai-agents]
category: feature-flags
owner: backend
summary: Comprehensive guide to VoiceAssist feature flag system
---

# Feature Flags Overview

This guide covers the VoiceAssist feature flag system, which enables controlled rollout of new features, A/B testing, and operational control across all platform components.

## Quick Start

### For Administrators

1. Access the Admin Panel at [admin.asimo.io](https://admin.asimo.io)
2. Navigate to **Settings > Feature Flags**
3. Toggle flags on/off per environment (dev, staging, production)

### For Developers

```typescript
import { useFeatureFlag } from "@voiceassist/feature-flags";

// Simple boolean flag
const showNewUI = useFeatureFlag("ui.new_voice_settings");

// Percentage rollout
const experimentEnabled = useFeatureFlag("experiment.voice_v2", {
  userId: currentUser.id,
});
```

## Naming Convention

All feature flags follow the pattern: `<category>.<feature_name>`

| Category      | Purpose                  | Example                       |
| ------------- | ------------------------ | ----------------------------- |
| `ui`          | Frontend/visual changes  | `ui.dark_mode_v2`             |
| `backend`     | API/backend features     | `backend.streaming_responses` |
| `admin`       | Admin panel features     | `admin.bulk_operations`       |
| `integration` | Third-party integrations | `integration.elevenlabs_tts`  |
| `experiment`  | A/B tests                | `experiment.onboarding_flow`  |
| `ops`         | Operational controls     | `ops.rate_limiting_enabled`   |

> **Note:** The TypeScript definition uses dot notation (e.g., `backend.rag_strategy`).
> See [Naming Conventions](./naming-conventions.md) for full details.

## Flag Types

| Type         | Description               | Example                    |
| ------------ | ------------------------- | -------------------------- |
| `boolean`    | Simple on/off toggle      | `ui.show_beta_badge`       |
| `percentage` | Gradual rollout (0-100%)  | `experiment.new_chat_ui`   |
| `variant`    | Multiple variants (A/B/C) | `experiment.pricing_tiers` |
| `scheduled`  | Time-based activation     | `ops.holiday_mode`         |

## Documentation Structure

- **[Naming Conventions](./naming-conventions.md)** - Flag naming standards
- **[Lifecycle](./lifecycle.md)** - Flag lifecycle: create > test > promote > deprecate
- **[Advanced Types](./advanced-types.md)** - Boolean, percentage, variant, scheduled flags
- **[Multi-Environment](./multi-environment.md)** - Dev, staging, production management
- **[Admin Panel Guide](./admin-panel-guide.md)** - Using admin.asimo.io to manage flags
- **[CLI Reference](./cli-reference.md)** - Command-line tools, curl commands, automation scripts
- **[Best Practices](./best-practices.md)** - When to use flags, cleanup strategies

## Source of Truth

The authoritative flag definitions are in:

```
packages/types/src/featureFlags.ts
```

Flag states are stored in Redis and synced via SSE at `/api/feature-flags/stream`.

## Related Documentation

- [System Settings vs Feature Flags](../system-settings-vs-flags.md)
- [Backend Implementation Details](../../FEATURE_FLAGS.md) - Database schema, Python API, Redis caching
- [Feature Flags API Reference](/reference/feature-flags-api.md)
- [Admin Panel Specs](/overview/ADMIN_PANEL_SPECS.md)
