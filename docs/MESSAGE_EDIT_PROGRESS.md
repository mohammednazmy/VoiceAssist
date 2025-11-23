# Message Editing & Regeneration - Implementation Progress

**Date:** 2025-11-23
**Status:** Phases 1-2 Complete, Phase 3-5 Pending
**Next Session:** Wire up components and complete testing

---

## ✅ Completed (This Session)

### Phase 1: Enhanced MessageBubble Component

**File:** `apps/web-app/src/components/chat/MessageBubble.tsx`

**Changes:**

- ✅ Added editing state management (`isEditing`, `editedContent`, `isSaving`)
- ✅ Integrated MessageActionMenu component with action callbacks
- ✅ Implemented inline edit UI with textarea
- ✅ Save/cancel handlers with async error handling
- ✅ Keyboard shortcuts: Ctrl/Cmd+Enter (save), Escape (cancel)
- ✅ Updated MessageBubbleProps interface:
  - `onEditSave?: (messageId: string, newContent: string) => Promise<void>`
  - `onRegenerate?: (messageId: string) => Promise<void>`
  - `onDelete?: (messageId: string) => Promise<void>`
- ✅ Added `group` class for hover-based action menu visibility

### Phase 2: Updated useChatSession Hook

**File:** `apps/web-app/src/hooks/useChatSession.ts`

**Changes:**

- ✅ Imported `useAuth` hook to access apiClient
- ✅ Added `editingMessageId` state tracking
- ✅ Implemented `editMessage(messageId, newContent)`:
  - Calls apiClient.editMessage
  - Updates local message state
  - Clears editing state on success
- ✅ Implemented `regenerateMessage(messageId)`:
  - Finds assistant message and previous user message
  - Removes old assistant response
  - Re-sends user message via WebSocket
- ✅ Implemented `deleteMessage(messageId)`:
  - Confirms with user before deletion
  - Calls apiClient.deleteMessage
  - Updates local state
- ✅ Updated UseChatSessionReturn interface with new functions
- ✅ All functions properly memoized with useCallback

### Additional Fixes

- ✅ Fixed lint errors in `useConversations.ts` (removed unused `index` parameters)
- ✅ Updated Vitest config to inline ESM modules

---

## 📋 Remaining Work

### Phase 3: Wire Up Components ⏳

**Files to Modify:**

- `apps/web-app/src/pages/ChatPage.tsx`
- `apps/web-app/src/components/chat/MessageList.tsx`

**Tasks:**

1. Update ChatPage to destructure new functions from useChatSession:

   ```typescript
   const {
     messages,
     connectionStatus,
     isTyping,
     editingMessageId,
     sendMessage,
     editMessage, // NEW
     regenerateMessage, // NEW
     deleteMessage, // NEW
     reconnect,
   } = useChatSession({
     conversationId: activeConversationId || "",
     onError: handleError,
     initialMessages,
   });
   ```

2. Pass functions to MessageList as props

3. Update MessageList to forward props to MessageBubble:
   ```typescript
   <MessageBubble
     message={message}
     isStreaming={isStreaming && index === messages.length - 1}
     onEditSave={onEditSave}
     onRegenerate={onRegenerate}
     onDelete={onDelete}
   />
   ```

### Phase 4: Comprehensive Tests ⏳

**Files to Create:**

#### 4.1 MessageActionMenu Tests

**File:** `apps/web-app/src/components/chat/__tests__/MessageActionMenu.test.tsx`

**Test Cases (6 minimum):**

1. Renders menu button
2. Shows edit option for user messages only
3. Shows regenerate option for assistant messages only
4. Does not render for system messages
5. Calls onEdit when edit is clicked
6. Closes menu after action

#### 4.2 useChatSession Editing Tests

**File:** `apps/web-app/src/hooks/__tests__/useChatSession-editing.test.ts`

**Test Cases (4 minimum):**

1. Should edit a message successfully
2. Should delete a message successfully
3. Should regenerate assistant message
4. Should handle edit errors gracefully

#### 4.3 MessageBubble Editing Tests

**File:** `apps/web-app/src/components/chat/__tests__/MessageBubble-editing.test.tsx`

**Test Cases (6 minimum):**

1. Shows edit button on hover for user messages
2. Enters edit mode when edit is clicked
3. Saves edited message when save is clicked
4. Cancels edit when cancel is clicked
5. Saves on Ctrl+Enter keyboard shortcut
6. Cancels on Escape keyboard shortcut

### Phase 5: Polish & Accessibility ⏳

**Tasks:**

1. Add loading states during save operations
2. Add error toast notifications (integrate with toast system)
3. Test keyboard navigation through action menu
4. Test with screen reader (NVDA/JAWS)
5. Verify ARIA attributes are correct
6. Update component documentation with examples
7. Update `FRONTEND_PHASE1_PHASE2_SUMMARY.md`

---

## ⚠️ Known Issues

### Test Environment

**Issue:** 4 test failures related to ES module imports
**Error:** `require() of ES Module ... react-syntax-highlighter ... not supported`

**Current Status:** Vitest config updated with inline deps, but tests still failing

**Possible Solutions:**

1. Add more modules to `deps.inline` array
2. Mock react-syntax-highlighter in test setup
3. Use dynamic imports for syntax highlighter
4. Investigate Vitest worker memory issues (OOM error observed)

**Impact:** Does not affect production code, only test execution

---

## 📝 Implementation Notes

### API Integration

- Edit/delete operations call REST API via apiClient
- Regenerate operation uses existing WebSocket streaming
- All operations update local state optimistically after server response

### State Management

- Editing state managed in MessageBubble component (local)
- Message updates flow through useChatSession hook
- WebSocket connection maintained throughout editing

### User Experience

- Inline editing with textarea (no modal)
- Keyboard shortcuts for power users
- Confirmation dialog for destructive actions (delete)
- Save button disabled during async operations
- Original content restored on cancel

---

## 🚀 Next Session Plan

1. **Fix Test Environment** (30 min)
   - Investigate and resolve ESM import issues
   - Ensure all existing tests pass
   - Run `pnpm test` to verify baseline

2. **Phase 3: Wire Up Components** (60 min)
   - Update ChatPage.tsx
   - Update MessageList.tsx
   - Manual testing in browser

3. **Phase 4: Write Tests** (90 min)
   - MessageActionMenu tests (6 tests)
   - useChatSession editing tests (4 tests)
   - MessageBubble editing tests (6 tests)
   - Run full suite and fix failures

4. **Phase 5: Polish** (45 min)
   - Loading states and error handling
   - Accessibility audit
   - Documentation updates

5. **Final Verification** (30 min)
   - `make test` (backend)
   - `pnpm lint` (should pass with warnings only)
   - `pnpm test` (all tests green)
   - Manual E2E testing

6. **Commit & Push** (15 min)
   - Clear commit message
   - Update CHANGELOG if applicable
   - Push to origin/main

**Estimated Total:** 4-5 hours

---

## 📚 Reference Documents

- Full specification: `docs/REMAINING_MESSAGE_EDIT_WORK.md`
- Feature specs: `docs/client-implementation/WEB_APP_FEATURE_SPECS.md`
- Phase summary: `docs/client-implementation/FRONTEND_PHASE1_PHASE2_SUMMARY.md`

---

**Last Updated:** 2025-11-23
**Next Update:** After Phase 3 completion
