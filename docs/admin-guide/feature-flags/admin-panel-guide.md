---
title: Feature Flags Admin Panel Guide
status: stable
lastUpdated: 2025-12-04
audience: [admin, developers, ai-agents]
category: feature-flags
owner: frontend
summary: Using the Admin Panel to manage feature flags and scheduled variant changes
ai_summary: Admin Panel at admin.asimo.io provides UI for flag management. Navigate to Settings > Feature Flags. Toggle, edit percentage, filter by category. Real-time updates via SSE. Scheduled Changes tab for time-based variant weight modifications with timezone support. RBAC enforced (admin for write, viewer for read). Prometheus metrics track scheduled changes. Requires admin JWT.
---

# Feature Flags Admin Panel Guide

## Accessing Feature Flags

1. Navigate to [admin.asimo.io](https://admin.asimo.io)
2. Login with admin credentials
3. Go to **Settings** > **Feature Flags**

## Interface Overview

```
┌─────────────────────────────────────────────────────────┐
│ Feature Flags                           [+ New Flag]    │
├─────────────────────────────────────────────────────────┤
│ Filter: [All Categories ▼] [Search...          ]       │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐│
│ │ ui.dark_mode                              [Toggle]  ││
│ │ Enable dark mode theme                              ││
│ │ Type: boolean | Status: Active | Updated: Dec 04   ││
│ └─────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────┐│
│ │ backend.rag_strategy                      [Edit]    ││
│ │ RAG retrieval strategy selection                    ││
│ │ Type: string | Value: "hybrid" | Updated: Dec 03   ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Common Operations

### Toggle a Boolean Flag

1. Find the flag in the list
2. Click the toggle switch
3. Confirm the change
4. Change takes effect immediately

### Edit a Percentage Flag

1. Click **Edit** on the flag
2. Adjust the percentage slider (0-100%)
3. Click **Save**
4. New percentage applies to next evaluation

### Create a New Flag

1. Click **+ New Flag**
2. Select category from dropdown
3. Enter flag name (snake_case)
4. Choose type (boolean/percentage/variant/scheduled)
5. Set default value
6. Add description
7. Click **Create**

### Filter and Search

- **Category filter**: Show only `ui`, `backend`, etc.
- **Search**: Filter by name or description
- **Status filter**: Active, deprecated, disabled

## Real-Time Updates

The Admin Panel uses Server-Sent Events (SSE) for real-time flag updates:

- Changes by other admins appear immediately
- No page refresh needed
- Connection status shown in header

## Scheduled Variant Changes

The Scheduled Changes feature allows you to schedule variant weight modifications for a future time. This is useful for:

- Gradual rollouts scheduled for specific times
- Feature releases coordinated with marketing campaigns
- A/B test phase transitions
- Time-zone aware deployments

### Accessing Scheduled Changes

1. Navigate to **Settings** > **Feature Flags**
2. Click the **Scheduled Changes** tab (or click the 📅 badge on a flag with pending changes)

### Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Feature Flags                                               │
├─────────────────────────────────────────────────────────────┤
│ [Feature Flags] [Scheduled Changes (3)]                     │
├─────────────────────────────────────────────────────────────┤
│ Pending Scheduled Changes                    [+ New Change] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ui.new_feature_rollout                                  ││
│ │ Increase variant_a to 50%                               ││
│ │ Scheduled: Dec 10, 2025 09:00 (America/New_York)       ││
│ │ [Preview] [Edit] [Cancel]                              ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Creating a Scheduled Change

1. Click **+ New Change** or **Schedule** on a flag
2. Select the target flag (if not pre-selected)
3. Set the scheduled date and time
4. Choose the timezone (IANA identifier, e.g., "America/New_York")
5. Configure variant weight changes:
   ```
   control:   30%  →  20%
   variant_a: 70%  →  80%
   ```
6. Add an optional description
7. Click **Schedule Change**

### Previewing Changes

Before a scheduled change is applied, you can preview its effect:

1. Click **Preview** on a scheduled change
2. View the before/after comparison:
   - Current variant weights
   - New variant weights after change
   - Affected user percentage

### Managing Scheduled Changes

#### Edit a Pending Change

1. Click **Edit** on the scheduled change
2. Modify time, timezone, or variant weights
3. Click **Save Changes**

#### Cancel a Scheduled Change

1. Click **Cancel** on the scheduled change
2. Confirm the cancellation
3. The change is marked as cancelled (kept for audit)

#### Delete a Scheduled Change

1. Click the delete icon (requires admin role)
2. Confirm permanent deletion
3. The change is removed from the system

### Timezone Handling

- All times are stored in UTC internally
- Display time uses the selected timezone
- DST transitions are handled automatically
- Common timezones: UTC, America/New_York, America/Los_Angeles, Europe/London

### Pending Changes Indicator

Flags with pending scheduled changes show a badge:

- 📅 badge appears next to the flag name
- Badge count shows number of pending changes
- Click the badge to jump to Scheduled Changes tab

### RBAC Permissions

| Action                  | Admin | Viewer |
| ----------------------- | ----- | ------ |
| List scheduled changes  | ✅    | ✅     |
| Preview changes         | ✅    | ✅     |
| Create scheduled change | ✅    | ❌     |
| Update scheduled change | ✅    | ❌     |
| Cancel scheduled change | ✅    | ❌     |
| Delete scheduled change | ✅    | ❌     |

### Monitoring

Prometheus metrics for scheduled changes:

- `voiceassist_flag_scheduled_changes_total{status}` - Counter for applied/cancelled/skipped changes
- `voiceassist_flag_scheduled_changes_pending` - Gauge for pending changes count

## Audit Trail

All flag changes are logged:

- Who made the change
- When it occurred
- Previous and new values
- Environment affected

View audit log: **Settings** > **Audit Logs** > Filter by "feature_flags"
