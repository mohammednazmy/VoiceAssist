---
title: Feature Flags Admin Panel Guide
status: stable
lastUpdated: 2025-12-04
audience: [admin, ai-agents]
category: feature-flags
owner: frontend
summary: Using admin.asimo.io to manage feature flags
---

# Feature Flags Admin Panel Guide

## Accessing the Admin Panel

1. Navigate to [admin.asimo.io](https://admin.asimo.io)
2. Log in with admin credentials
3. Select **Settings > Feature Flags** from the sidebar

## Dashboard Overview

```
┌─────────────────────────────────────────────────────────┐
│  Feature Flags                           [+ New Flag]   │
├─────────────────────────────────────────────────────────┤
│  Environment: [Development] [Staging] [Production]      │
│                                                         │
│  Filter: [All ▼] [Active ▼]  Search: [____________]     │
├─────────────────────────────────────────────────────────┤
│  ☐  FLAG NAME              TYPE      STATUS    ACTIONS  │
├─────────────────────────────────────────────────────────┤
│  ☐  ui.new_voice_panel     boolean   Active    [⚙]     │
│  ☐  backend.rag_v2         boolean   Active    [⚙]     │
│  ☐  experiment.chat        percentage 25%      [⚙]     │
│  ☐  ops.maintenance        scheduled Pending   [⚙]     │
└─────────────────────────────────────────────────────────┘
```

## Managing Flags

### Toggle a Flag

1. Find the flag in the list
2. Click the toggle switch
3. Confirm the change (production only)

### View Flag Details

Click the flag name to see:
- Description
- Type and configuration
- Current value per environment
- Change history
- Code references

### Edit Flag Configuration

Click the gear icon [⚙] to:
- Update description
- Modify percentage (for percentage flags)
- Edit schedule (for scheduled flags)
- Configure variants (for variant flags)

## Creating New Flags

1. Click **[+ New Flag]**
2. Fill in the form:

```
┌─────────────────────────────────────┐
│  Create Feature Flag                │
├─────────────────────────────────────┤
│  Category: [ui ▼]                   │
│  Name: [____________]               │
│  (Full name: ui.feature_name)       │
│                                     │
│  Type: [Boolean ▼]                  │
│                                     │
│  Description:                       │
│  [______________________________]   │
│                                     │
│  Default Value: [Off ▼]             │
│                                     │
│  Owner: [@____________]             │
│  JIRA Ticket: [____________]        │
│                                     │
│  [Cancel]              [Create]     │
└─────────────────────────────────────┘
```

3. Click **Create**
4. Flag is created in development environment

## Flag Analytics

View usage metrics for each flag:

- **Evaluation count**: How often the flag is checked
- **True/False ratio**: Percentage of enabled vs disabled
- **Error rate**: Failed evaluations
- **Performance**: Latency impact

```
┌─────────────────────────────────────┐
│  ui.new_voice_panel Analytics       │
├─────────────────────────────────────┤
│  Evaluations (24h): 12,456          │
│  True: 62%  False: 38%              │
│  Avg latency: 0.3ms                 │
│  Errors: 0                          │
├─────────────────────────────────────┤
│  [Chart: Evaluations over time]     │
└─────────────────────────────────────┘
```

## Bulk Operations

### Select Multiple Flags

1. Check boxes next to flags
2. Use bulk action menu:
   - Enable all
   - Disable all
   - Export configuration
   - Delete (development only)

### Export/Import

**Export:**
```bash
Settings > Feature Flags > Export > JSON
```

**Import:**
```bash
Settings > Feature Flags > Import > Select JSON file
```

## Search and Filter

### Search

- Type in search box to filter by name
- Searches description too

### Filters

| Filter | Options |
|--------|---------|
| Category | ui, backend, experiment, ops |
| Type | boolean, percentage, variant, scheduled |
| Status | active, deprecated, disabled |
| Owner | team/person filter |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `n` | New flag |
| `e` | Edit selected flag |
| `d` | View details |
| `Esc` | Close modal |

## Permissions

| Role | Capabilities |
|------|--------------|
| Viewer | View flags and analytics |
| Editor | Create, edit flags in dev/staging |
| Admin | All operations, including production |

## Troubleshooting

### Flag not updating

1. Check environment selector
2. Clear browser cache
3. Check SSE connection status
4. View browser console for errors

### Can't create flag

1. Verify naming convention (`<category>.<feature_name>`)
2. Check for duplicate names
3. Ensure you have Editor permissions

### Analytics not showing

1. Flag must have evaluations
2. Check time range filter
3. Verify analytics service is running
