---
title: Feature Flags Admin Panel Guide
status: stable
lastUpdated: 2025-12-04
audience: [admin, developers, ai-agents]
category: feature-flags
owner: frontend
summary: Using the Admin Panel to manage feature flags
ai_summary: Admin Panel at admin.asimo.io provides UI for flag management. Navigate to Settings > Feature Flags. Toggle, edit percentage, filter by category. Real-time updates via SSE. Requires admin JWT.
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

## Audit Trail

All flag changes are logged:

- Who made the change
- When it occurred
- Previous and new values
- Environment affected

View audit log: **Settings** > **Audit Logs** > Filter by "feature_flags"
