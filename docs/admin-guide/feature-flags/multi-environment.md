---
title: Multi-Environment Feature Flag Management
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, devops, ai-agents]
category: feature-flags
owner: backend
summary: Managing feature flags across development, staging, and production environments
---

# Multi-Environment Feature Flag Management

## Environments

VoiceAssist uses three deployment environments:

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `localhost:3000` | Local development |
| Staging | `staging.dev.asimo.io` | QA and testing |
| Production | `dev.asimo.io` | Live users |

## Environment-Specific Configuration

### Flag State Storage

```
Redis Keys:
- flags:dev:<flag_name>     # Development
- flags:staging:<flag_name> # Staging
- flags:prod:<flag_name>    # Production
```

### Configuration Override Priority

1. Environment variable (`FF_<FLAG_NAME>=true`)
2. Redis state for current environment
3. Default from `featureFlags.ts`

## Promotion Workflow

### Development → Staging

```bash
# Via CLI
npm run flags:promote ui.new_feature --from=dev --to=staging

# Via Admin Panel
1. Go to admin.asimo.io > Feature Flags
2. Select flag
3. Click "Promote to Staging"
```

### Staging → Production

```bash
# Via CLI (requires confirmation)
npm run flags:promote ui.new_feature --from=staging --to=prod

# Via Admin Panel
1. Go to admin.asimo.io > Feature Flags
2. Select flag
3. Click "Promote to Production"
4. Confirm in modal
```

## Environment Isolation

### Development

- All flags accessible
- Can override any flag locally
- Changes don't affect other developers

```bash
# Local override via .env.local
FF_UI_NEW_FEATURE=true
FF_EXPERIMENT_VOICE_V2=false

# These map to flags: ui.new_feature and experiment.voice_v2
```

### Staging

- Mirrors production structure
- Safe to test production workflows
- Integration testing environment

### Production

- Requires elevated permissions
- Changes logged and auditable
- Automatic rollback on error spike

## Real-Time Sync

Flags sync across environments via SSE:

```
/api/feature-flags/stream?env=staging
```

When a flag changes:
1. Redis updated
2. SSE broadcast to connected clients
3. Clients update local cache
4. UI reflects new state (no refresh needed)

## Admin Panel Features

### Environment Switcher

```
┌─────────────────────────────────────┐
│  Environment: [Dev ▼] [Staging] [Prod]  │
│                                     │
│  ui.new_voice_panel                 │
│  ├── Dev:     ✓ Enabled             │
│  ├── Staging: ✓ Enabled             │
│  └── Prod:    ✗ Disabled            │
└─────────────────────────────────────┘
```

### Bulk Operations

- Enable/disable flags per environment
- Copy configuration between environments
- Export/import flag states

## Best Practices

### Testing Workflow

1. Enable flag in **development**
2. Test locally, fix issues
3. Promote to **staging**
4. Run E2E tests
5. Stakeholder review
6. Promote to **production** (gradual rollout)

### Emergency Procedures

Production issue with flagged feature:

1. Navigate to Admin Panel
2. Disable flag in Production
3. Create incident ticket
4. Debug in Development/Staging

```bash
# Emergency CLI disable
npm run flags:disable ui.problem_feature --env=prod --reason="Incident #123"
```

### Audit Trail

All changes logged:
```json
{
  "flag": "ui.new_feature",
  "action": "enable",
  "environment": "production",
  "user": "admin@asimo.io",
  "timestamp": "2025-12-04T10:30:00Z",
  "reason": "Rollout approved by PM"
}
```

View logs:
- Admin Panel > Feature Flags > History
- `/api/flags/audit?flag=ui.new_feature`
