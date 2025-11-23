# Conversation Branching and Keyboard Shortcuts Implementation Plan

**Date:** 2025-11-23
**Status:** In Progress
**Epic:** Advanced Chat Features

---

## 🎯 Overview

This document tracks the implementation of two major features:
1. **Conversation Branching** - Allow users to fork conversations at any message
2. **Enhanced Keyboard Shortcuts** - Global shortcuts with help dialog

---

## ✅ Completed Work

### Backend (Database & Models)

- [x] **Message Model Updates** (`services/api-gateway/app/models/message.py`)
  - Added `parent_message_id` column (UUID, nullable, indexed)
  - Added `branch_id` column (String(100), nullable, indexed)
  - Added self-referential foreign key for parent_message_id

- [x] **Alembic Migration** (`services/api-gateway/alembic/versions/006_add_branching_support.py`)
  - Migration ID: 006
  - Revises: 005
  - Adds columns to messages table with proper constraints and indexes
  - Includes upgrade() and downgrade() methods

---

## 🚧 Remaining Backend Work

### 1. API Endpoints

#### Update Existing Endpoints

**File:** `services/api-gateway/app/api/realtime.py` (or similar)

Update message response schemas to include:
```python
{
    "id": "uuid",
    "session_id": "uuid",
    "content": "...",
    "role": "user|assistant|system",
    "parent_message_id": "uuid|null",  # NEW
    "branch_id": "string|null",         # NEW
    "created_at": "datetime",
    ...
}
```

#### New Branch Endpoint

**Endpoint:** `POST /api/conversations/{conversation_id}/branches`

**Request Body:**
```json
{
    "parent_message_id": "uuid",
    "initial_message": "string" (optional)
}
```

**Response:**
```json
{
    "branch_id": "string",
    "conversation_id": "uuid",
    "parent_message_id": "uuid",
    "created_at": "datetime"
}
```

**Logic:**
1. Validate parent message exists and belongs to conversation
2. Generate unique branch_id (e.g., `branch-{timestamp}-{short-uuid}`)
3. If initial_message provided, create first message in branch
4. Return branch details

### 2. Message Creation Update

Update message creation endpoint to accept optional `branch_id`:

**File:** `services/api-gateway/app/api/realtime.py`

```python
async def create_message(
    session_id: UUID,
    content: str,
    role: str,
    branch_id: Optional[str] = None,  # NEW
    parent_message_id: Optional[UUID] = None,  # NEW
    ...
):
    message = Message(
        session_id=session_id,
        content=content,
        role=role,
        branch_id=branch_id or "main",  # Default to "main" branch
        parent_message_id=parent_message_id,
        ...
    )
    ...
```

### 3. Branch Queries

Add helper methods for branch management:

```python
def get_branch_messages(session_id: UUID, branch_id: str) -> List[Message]:
    """Get all messages in a specific branch, maintaining conversation order"""
    # Start from first message, follow parent_message_id chain
    ...

def get_branch_tree(session_id: UUID) -> Dict:
    """Get complete branch structure for visualization"""
    ...

def get_available_branches(session_id: UUID) -> List[Dict]:
    """Get list of all branches with metadata"""
    ...
```

### 4. Tests

**File:** `services/api-gateway/tests/test_branches.py` (NEW)

```python
def test_create_branch():
    # Test creating a new branch from a message
    ...

def test_get_branch_messages():
    # Test retrieving messages in correct order
    ...

def test_branch_isolation():
    # Ensure branches don't interfere with each other
    ...

def test_invalid_parent_message():
    # Test error handling for invalid parent
    ...
```

---

## 🚧 Frontend Work

### 1. Type Updates

**File:** `packages/types/src/index.ts`

```typescript
export interface Message {
  id: string;
  conversationId?: string;
  role: "user" | "assistant" | "system";
  content: string;

  // NEW: Branching support
  parentId?: string;
  branchId?: string;

  delta?: string;
  citations?: Citation[];
  attachments?: string[];
  timestamp: number;
  metadata?: MessageMetadata;
}

// NEW: Branch interface
export interface Branch {
  id: string;
  conversationId: string;
  parentMessageId: string;
  createdAt: string;
  messageCount: number;
}
```

### 2. API Client Updates

**File:** `packages/api-client/src/index.ts`

```typescript
// Add to VoiceAssistApiClient class

async createBranch(
  conversationId: string,
  parentMessageId: string,
  initialMessage?: string
): Promise<Branch> {
  const response = await this.client.post<ApiResponse<Branch>>(
    `/conversations/${conversationId}/branches`,
    { parent_message_id: parentMessageId, initial_message: initialMessage }
  );
  return response.data.data!;
}

async getBranchMessages(
  conversationId: string,
  branchId: string
): Promise<Message[]> {
  const response = await this.client.get<ApiResponse<Message[]>>(
    `/conversations/${conversationId}/branches/${branchId}/messages`
  );
  return response.data.data!;
}

async listBranches(conversationId: string): Promise<Branch[]> {
  const response = await this.client.get<ApiResponse<Branch[]>>(
    `/conversations/${conversationId}/branches`
  );
  return response.data.data!;
}
```

### 3. Branch Management Hook

**File:** `apps/web-app/src/hooks/useBranching.ts` (NEW)

```typescript
/**
 * useBranching Hook
 * Manages conversation branching state and operations
 */

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Branch } from '@voiceassist/types';

export function useBranching(conversationId: string) {
  const { apiClient } = useAuth();
  const [currentBranchId, setCurrentBranchId] = useState<string>('main');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const createBranch = useCallback(async (parentMessageId: string) => {
    setIsLoading(true);
    try {
      const branch = await apiClient.createBranch(conversationId, parentMessageId);
      setBranches(prev => [...prev, branch]);
      setCurrentBranchId(branch.id);
      return branch;
    } catch (error) {
      console.error('Failed to create branch:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, apiClient]);

  const switchBranch = useCallback((branchId: string) => {
    setCurrentBranchId(branchId);
  }, []);

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const branchList = await apiClient.listBranches(conversationId);
      setBranches(branchList);
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, apiClient]);

  return {
    currentBranchId,
    branches,
    isLoading,
    createBranch,
    switchBranch,
    loadBranches,
  };
}
```

### 4. UI Components

#### Branch Button (MessageBubble)

**File:** `apps/web-app/src/components/chat/MessageBubble.tsx`

Add to MessageActionMenu:
```typescript
{!isSystem && (
  <button
    onClick={() => onBranch?.(message.id)}
    className="..."
    aria-label="Create branch from this message"
  >
    <BranchIcon className="w-4 h-4" />
  </button>
)}
```

#### Branch Sidebar

**File:** `apps/web-app/src/components/chat/BranchSidebar.tsx` (NEW)

```typescript
import { useBranching } from '@/hooks/useBranching';

export function BranchSidebar({ conversationId }: { conversationId: string }) {
  const { branches, currentBranchId, switchBranch, isLoading } = useBranching(conversationId);

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4">
      <h3 className="font-semibold mb-4">Conversation Branches</h3>
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-2">
          {branches.map(branch => (
            <li key={branch.id}>
              <button
                onClick={() => switchBranch(branch.id)}
                className={`
                  w-full text-left px-3 py-2 rounded
                  ${branch.id === currentBranchId ? 'bg-blue-100' : 'hover:bg-gray-100'}
                `}
              >
                <div className="font-medium">{branch.id}</div>
                <div className="text-sm text-gray-500">
                  {branch.messageCount} messages
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 5. Keyboard Shortcuts Enhancement

**File:** `apps/web-app/src/hooks/useKeyboardShortcuts.ts`

Already exists - enhance with:
- Cmd/Ctrl + K → Open conversation search
- Cmd/Ctrl + B → Toggle branch sidebar
- Cmd/Ctrl + Shift + B → Create branch at current message

#### Keyboard Shortcuts Dialog

**File:** `apps/web-app/src/components/KeyboardShortcutsDialog.tsx` (NEW)

```typescript
import { KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

export function KeyboardShortcutsDialog({ isOpen, onClose }: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {KEYBOARD_SHORTCUTS.map(shortcut => (
            <div key={shortcut.key} className="flex justify-between">
              <span>{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-gray-100 rounded">
                {shortcut.metaKey ? '⌘' : shortcut.ctrlKey ? 'Ctrl' : ''} {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 📋 Testing Checklist

### Backend Tests
- [ ] Create branch endpoint returns valid branch_id
- [ ] Messages created in branch have correct branch_id
- [ ] Querying branch messages returns only that branch's messages
- [ ] Parent message validation works correctly
- [ ] Migration applies and rolls back cleanly

### Frontend Tests
- [ ] Branch button appears on messages
- [ ] Creating branch updates UI state
- [ ] Switching branches loads correct messages
- [ ] Keyboard shortcuts trigger expected actions
- [ ] Shortcuts dialog displays all shortcuts
- [ ] Branch sidebar shows all branches
- [ ] Branch persistence across page refresh

---

## 🚀 Deployment Steps

1. **Apply Migration:**
   ```bash
   cd services/api-gateway
   source venv/bin/activate
   alembic upgrade head
   ```

2. **Verify Migration:**
   ```bash
   psql $DATABASE_URL -c "\d messages"
   # Should show parent_message_id and branch_id columns
   ```

3. **Run Backend Tests:**
   ```bash
   make test
   ```

4. **Build Frontend:**
   ```bash
   pnpm build
   ```

5. **Run Frontend Tests:**
   ```bash
   pnpm test
   ```

6. **Deploy to Production:**
   - Backend: Docker compose up with new image
   - Frontend: Deploy build artifacts
   - Run smoke tests

---

## 📝 Notes & Considerations

### Branch ID Format
- Use format: `branch-{timestamp}-{shortUUID}`
- Main conversation uses branch_id="main"
- Ensures uniqueness and sortability

### Performance
- Index on `branch_id` for fast filtering
- Index on `parent_message_id` for tree traversal
- Consider caching branch structure for large conversations

### UI/UX
- Visual indicator showing current branch
- Breadcrumb showing branch lineage
- Confirmation before switching branches with unsaved changes
- Color-code different branches for easy identification

### Future Enhancements
- Branch merging
- Branch naming/descriptions
- Branch comparison view
- Export branch to new conversation
- Branch permissions/sharing

---

## 🐛 Known Issues

1. **Migration requires manual application** - Alembic autogenerate needs database connection
2. **WebSocket timing in tests** - Known issue documented in KNOWN_ISSUES.md
3. **ESM import issues with react-syntax-highlighter** - Affects 5 test suites

---

**Status:** Backend data model complete, Migration created
**Next Step:** Implement backend API endpoints, then frontend integration
