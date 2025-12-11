---
title: Phase8 Folders Testing Guide
slug: phase8-folders-testing-guide
summary: "**Date**: 2024-11-24"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - phase8
  - folders
  - testing
  - guide
category: testing
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/components/folders"
ai_summary: >-
  Date: 2024-11-24 Feature: Conversation Folders Organization Environment:
  localhost:5173 This guide provides comprehensive manual testing steps for the
  new Folders feature in Phase 8, which allows users to organize their
  conversations into hierarchical folder structures. - ✅ Database table:
  conversa...
---

# Phase 8 Folders Feature - Manual Testing Guide

**Date**: 2024-11-24
**Feature**: Conversation Folders Organization
**Environment**: localhost:5173

## Overview

This guide provides comprehensive manual testing steps for the new Folders feature in Phase 8, which allows users to organize their conversations into hierarchical folder structures.

## What Was Implemented

### Backend (Already Complete)

- ✅ Database table: `conversation_folders` with hierarchical support (parent_folder_id)
- ✅ Sessions table: `folder_id` foreign key column
- ✅ 7 API endpoints: create, list, get tree, get, update, delete, move folder
- ✅ Folder operations tested via backend integration tests

### Frontend (Newly Implemented)

- ✅ **foldersApi.ts**: Complete TypeScript API client for folder operations
- ✅ **FolderSidebar.tsx**: Standalone folder management component (370+ lines)
- ✅ **ConversationsSidebar.tsx**: Integrated folder tree view and filtering
- ✅ **useConversations hook**: Extended to support `folderId` in updateConversation
- ✅ "Move to Folder" menu option in conversation context menu
- ✅ Folder picker submenu for selecting destination folder
- ✅ Folder tree navigation with expand/collapse
- ✅ Visual feedback for selected folder

## Test Environment Setup

### Prerequisites

1. Backend running at `localhost:5173:8000`
2. Frontend deployed to `localhost:5173` (or local dev server)
3. Valid user account with authentication tokens
4. Browser with DevTools available (Chrome/Firefox recommended)

### Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5173:8000
- **API Documentation**: http://localhost:5173:8000/docs

## Manual Test Cases

### Test Case 1: Verify Folder Tree Display

**Objective**: Confirm folder tree renders correctly in ConversationsSidebar

**Steps**:

1. Log in to the application
2. Navigate to the Chat page
3. Locate the ConversationsSidebar (left panel)
4. Look for "Hide Folders" / "Show Folders" toggle button
5. Click the toggle to show folders

**Expected Results**:

- ✅ Folder section appears below Archive toggle
- ✅ "All Conversations" root option visible with 📂 icon
- ✅ Folder tree displays if folders exist
- ✅ Empty state message if no folders created yet

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 2: Create Root-Level Folder

**Objective**: Create a new folder at the root level

**Steps**:

1. In ConversationsSidebar, ensure folders section is visible
2. Right-click or look for "+ New Folder" button (via FolderSidebar component)
3. If using standalone FolderSidebar: Enter folder name "Work"
4. If integrated: Use FolderDialog to create folder
5. Submit the form

**Expected Results**:

- ✅ New folder "Work" appears in folder tree
- ✅ Folder has default 📁 icon
- ✅ API call: `POST /api/folders` succeeds (check Network tab)
- ✅ Response includes folder ID, user_id, created_at timestamp

**API Verification**:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5173:8000/api/folders/tree
```

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 3: Create Nested Subfolder

**Objective**: Create a subfolder inside an existing folder

**Steps**:

1. Locate the "Work" folder created in Test Case 2
2. Click the ➕ button next to "Work" folder
3. Enter subfolder name "Projects"
4. Confirm creation

**Expected Results**:

- ✅ "Projects" appears as child of "Work"
- ✅ "Work" folder shows expand/collapse arrow (▶/▼)
- ✅ Indentation shows hierarchy (16px per level)
- ✅ API call: `POST /api/folders` with `parent_folder_id` set

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 4: Expand/Collapse Folder Tree

**Objective**: Verify folder tree navigation controls work

**Steps**:

1. Locate folder with children (e.g., "Work" → "Projects")
2. Click the ▶ arrow to expand
3. Verify children appear
4. Click the ▼ arrow to collapse
5. Verify children are hidden

**Expected Results**:

- ✅ Arrow toggles between ▶ (collapsed) and ▼ (expanded)
- ✅ Children appear/disappear smoothly
- ✅ State persists while navigating (expandedFolderIds Set maintained)
- ✅ Multiple folders can be expanded simultaneously

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 5: Select Folder to Filter Conversations

**Objective**: Clicking a folder filters conversation list

**Steps**:

1. Create test conversations (at least 3)
2. Create folder "Personal"
3. Move one conversation to "Personal" folder (see Test Case 6)
4. Click "All Conversations" option
5. Verify all conversations display
6. Click "Personal" folder
7. Verify only conversation in "Personal" displays

**Expected Results**:

- ✅ Clicking folder highlights it with `bg-primary-50` background
- ✅ Conversation list filters to show only conversations with matching folderId
- ✅ "All Conversations" shows all unorganized conversations
- ✅ filteredConversations useMemo updates correctly
- ✅ Empty state shows if folder has no conversations

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 6: Move Conversation to Folder

**Objective**: Use "Move to Folder" menu to relocate a conversation

**Steps**:

1. Create or select an existing conversation
2. Hover over the conversation in the sidebar
3. Click the three-dot menu (⋮) button
4. Verify menu options appear:
   - Archive/Unarchive
   - Export as Markdown
   - Export as Text
   - **Move to Folder** (new)
   - Delete
5. Click "Move to Folder"
6. Verify folder picker submenu appears
7. Select "Work" folder from the list
8. Confirm selection

**Expected Results**:

- ✅ "Move to Folder" option visible with 📁 icon
- ✅ Folder picker submenu opens (z-index 20, positioned right-4 top-12)
- ✅ Submenu shows "Root (No Folder)" option + all folders
- ✅ Clicking folder triggers API call: `PUT /api/sessions/{id}` with `folderId`
- ✅ Conversation updates locally (useConversations state)
- ✅ Toast notification: "Conversation moved to folder"
- ✅ Conversation appears under selected folder when filtered

**API Verification**:

```bash
# Check conversation folder_id updated
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5173:8000/api/sessions/{session_id}
```

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 7: Move Conversation Back to Root

**Objective**: Move a conversation back to no folder

**Steps**:

1. Select conversation currently in a folder (e.g., "Work")
2. Open three-dot menu → "Move to Folder"
3. Select "Root (No Folder)" from picker
4. Confirm

**Expected Results**:

- ✅ API call: `PUT /api/sessions/{id}` with `folderId: null`
- ✅ Conversation no longer appears when "Work" folder selected
- ✅ Conversation appears when "All Conversations" selected
- ✅ Toast notification: "Conversation moved to root level"

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 8: Rename Folder

**Objective**: Edit an existing folder name

**Note**: This test uses the standalone FolderSidebar component if integrated, or assumes rename functionality via FolderDialog

**Steps**:

1. Locate "Work" folder
2. Click ✏️ edit button (if visible in ConversationsSidebar)
3. OR: Use FolderDialog to rename folder
4. Change name to "Work & Projects"
5. Press Enter or click Save

**Expected Results**:

- ✅ Inline edit activates (if using FolderSidebar patterns)
- ✅ API call: `PUT /api/folders/{folder_id}` with new name
- ✅ Folder name updates in UI immediately
- ✅ ESC key cancels edit (if inline editing)

**API Verification**:

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Work & Projects"}' \
  http://localhost:5173:8000/api/folders/{folder_id}
```

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 9: Delete Folder

**Objective**: Delete a folder and verify conversations are orphaned

**Steps**:

1. Create folder "Temp"
2. Move a conversation into "Temp"
3. Attempt to delete "Temp" folder
4. Confirm deletion in dialog
5. Verify conversation moved to root level

**Expected Results**:

- ✅ Confirmation dialog: "Are you sure? All conversations in this folder will be moved to the root level."
- ✅ API call: `DELETE /api/folders/{folder_id}`
- ✅ Folder removed from UI
- ✅ Conversations in folder now have `folderId: null`
- ✅ Conversations appear under "All Conversations"

**Database Verification**:

```sql
-- Check ON DELETE SET NULL behavior
SELECT id, title, folder_id FROM sessions WHERE user_id = 'USER_ID';
```

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 10: Folder Tree with Deep Nesting

**Objective**: Verify UI handles multiple levels of nesting

**Steps**:

1. Create folder hierarchy:
   - "Projects" (root)
     - "Client A"
       - "Q4 2024"
         - "December"
2. Expand all levels
3. Verify indentation increases by 16px per level
4. Move conversation to "December"
5. Filter by "December" folder
6. Verify conversation appears

**Expected Results**:

- ✅ Each level indents correctly (paddingLeft: ${16 + level \* 16}px)
- ✅ Expand/collapse works at each level
- ✅ Conversations can be assigned to deeply nested folders
- ✅ Filtering works correctly at any depth

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 11: Toggle Folder Visibility

**Objective**: Hide and show folder tree section

**Steps**:

1. Click "Hide Folders" button
2. Verify folder tree section disappears
3. Verify conversations list still visible
4. Click "Show Folders" button
5. Verify folder tree reappears
6. Verify selected folder state preserved

**Expected Results**:

- ✅ Toggle button text changes: "Show Folders" ↔ "Hide Folders"
- ✅ Folder section mounts/unmounts (showFolders state)
- ✅ selectedFolderId state persists (conversations still filtered)
- ✅ No layout shift issues
- ✅ More vertical space for conversations when hidden

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 12: Error Handling - Network Failure

**Objective**: Verify graceful degradation when API calls fail

**Steps**:

1. Open DevTools → Network tab
2. Enable "Offline" mode or block requests to `/api/folders/*`
3. Attempt to create a folder
4. Attempt to move a conversation to a folder
5. Re-enable network
6. Retry operations

**Expected Results**:

- ✅ Error toast appears: "Failed to create folder" or "Failed to move conversation"
- ✅ Console logs error details (not exposed to user)
- ✅ UI remains stable (no crash or blank screen)
- ✅ Operations succeed after network restored
- ✅ State remains consistent (no phantom folders)

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 13: Keyboard Navigation & Accessibility

**Objective**: Verify accessibility features work correctly

**Steps**:

1. Use Tab key to navigate through folder tree
2. Press Enter to select a folder
3. Use Enter/Escape for inline editing (if supported)
4. Verify ARIA labels present on buttons
5. Test with screen reader (optional)

**Expected Results**:

- ✅ All interactive elements focusable via Tab
- ✅ Visual focus indicators visible
- ✅ aria-label attributes present:
  - "New conversation" button
  - "Conversation options" menu button
  - Expand/Collapse buttons: "Expand" / "Collapse"
- ✅ Keyboard shortcuts work (Enter, Escape in edit mode)

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 14: Performance - Large Folder Tree

**Objective**: Verify UI performance with many folders

**Steps**:

1. Create 20+ folders with various nesting levels
2. Create 50+ conversations
3. Move conversations to various folders
4. Expand all folders
5. Toggle folder selection rapidly
6. Monitor DevTools Performance tab

**Expected Results**:

- ✅ Folder tree renders within 100ms
- ✅ Filtering conversations updates within 50ms (useMemo optimization)
- ✅ No janky animations or stuttering
- ✅ Scroll performance smooth (max-h-64 overflow-y-auto works)

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

### Test Case 15: Cross-Component Integration

**Objective**: Verify folders work correctly with other Phase 8 features

**Steps**:

1. Create conversation with attachments
2. Add citations to conversation
3. Move conversation to folder "Archive"
4. Filter by "Archive" folder
5. Open conversation in ChatPage
6. Verify attachments and citations still work
7. Export conversation as Markdown
8. Verify folder context preserved

**Expected Results**:

- ✅ Attachments remain accessible after folder move
- ✅ Citations display correctly
- ✅ Export includes full conversation history
- ✅ No data loss or corruption
- ✅ folder_id persists in database

**Pass/Fail**: \***\*\_\_\_\*\***
**Notes**: **\*\*\*\***\*\*\*\***\*\*\*\***\_\_\_**\*\*\*\***\*\*\*\***\*\*\*\***

---

## API Endpoint Testing

### Direct API Tests (cURL Commands)

#### 1. Get Folder Tree

```bash
TOKEN="your_access_token_here"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5173:8000/api/folders/tree | jq .
```

**Expected Response**:

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Work",
    "color": null,
    "icon": "📁",
    "parent_folder_id": null,
    "created_at": "2024-11-24T...",
    "children": [
      {
        "id": "uuid",
        "name": "Projects",
        "parent_folder_id": "parent_uuid",
        "children": []
      }
    ]
  }
]
```

#### 2. Create Folder

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Personal","icon":"🏠"}' \
  http://localhost:5173:8000/api/folders | jq .
```

#### 3. Update Conversation Folder

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folder_id":"folder_uuid"}' \
  http://localhost:5173:8000/api/sessions/{session_id} | jq .
```

#### 4. Delete Folder

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:5173:8000/api/folders/{folder_id}
```

---

## Database Verification

### Check Folder Structure

```sql
-- Connect to PostgreSQL
psql -h localhost -U voiceassist -d voiceassist_v2

-- View all folders for user
SELECT
  id,
  name,
  parent_folder_id,
  icon,
  created_at
FROM conversation_folders
WHERE user_id = 'USER_UUID'
ORDER BY created_at;

-- View folder hierarchy (recursive CTE)
WITH RECURSIVE folder_tree AS (
  -- Root folders
  SELECT id, name, parent_folder_id, 0 AS level
  FROM conversation_folders
  WHERE parent_folder_id IS NULL AND user_id = 'USER_UUID'

  UNION ALL

  -- Child folders
  SELECT f.id, f.name, f.parent_folder_id, ft.level + 1
  FROM conversation_folders f
  INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
)
SELECT
  REPEAT('  ', level) || name AS hierarchy,
  id,
  parent_folder_id,
  level
FROM folder_tree
ORDER BY level, name;

-- Verify conversations in folders
SELECT
  s.id AS session_id,
  s.title AS conversation_title,
  s.folder_id,
  f.name AS folder_name
FROM sessions s
LEFT JOIN conversation_folders f ON s.folder_id = f.id
WHERE s.user_id = 'USER_UUID'
ORDER BY f.name NULLS FIRST, s.updated_at DESC;

-- Check orphaned conversations after folder delete
SELECT COUNT(*)
FROM sessions
WHERE folder_id IS NULL AND user_id = 'USER_UUID';
```

---

## Known Issues & Limitations

### Current Implementation Notes

1. **Folder icons**: Default to 📁 if not specified (icon field optional)
2. **Folder colors**: Supported in database but not yet in UI
3. **Drag-and-drop**: Not implemented (use "Move to Folder" menu)
4. **Folder rename**: May require FolderDialog if inline editing not integrated
5. **Bulk operations**: Move multiple conversations at once - not yet supported

### Browser Compatibility

- ✅ Chrome/Edge (tested)
- ✅ Firefox (tested)
- ⚠️ Safari (test required)
- ⚠️ Mobile browsers (test required)

---

## Regression Testing Checklist

Ensure existing features still work after folder integration:

- [ ] Conversation create/update/delete still works
- [ ] Archive/Unarchive conversations
- [ ] Search conversations (with/without folder filter)
- [ ] Export as Markdown/Text
- [ ] Attachments upload/download
- [ ] Citations display
- [ ] Clinical context sidebar
- [ ] Message streaming in ChatPage
- [ ] Authentication flow
- [ ] Profile page

---

## Test Results Summary

**Date Tested**: \***\*\_\_\_\*\***
**Tester Name**: \***\*\_\_\_\*\***
**Environment**: \***\*\_\_\_\*\***

### Overall Results

- Total Test Cases: 15
- Passed: **\_**
- Failed: **\_**
- Skipped: **\_**

### Critical Issues Found

1. ***
2. ***
3. ***

### Non-Critical Issues

1. ***
2. ***

### Recommendations

---

---

---

---

## Deployment Checklist

Before deploying to production:

- [ ] All 15 test cases pass
- [ ] API endpoints return correct status codes
- [ ] Database migrations applied (migration 013)
- [ ] Foreign key constraints verified (ON DELETE SET NULL)
- [ ] Frontend build completes without errors
- [ ] No console errors in browser
- [ ] Performance acceptable (< 100ms folder tree render)
- [ ] Regression tests pass
- [ ] Documentation updated

---

## Contact & Support

**Feature Owner**: VoiceAssist Development Team
**Documentation**: `/home/asimo/VoiceAssist/docs/phase8-folders-testing-guide.md`
**Issue Tracking**: GitHub Issues (if applicable)

---

**End of Testing Guide**
