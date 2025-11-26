# Frontend Phase 3 Plan - Web App UX & Voice Enhancements

**Date:** 2025-11-25
**Branch:** TBD (to be created from main after Phase 2 merge)
**Status:** Planning
**Scope:** Web App (apps/web-app) frontend-focused improvements

---

## Goals for Phase 3

Phase 3 focuses on **Voice/Realtime UX polish**, **advanced chat controls**, and **evidence/context UX enhancements**. The primary objective is to elevate the user experience from functional to polished and professional.

### Success Criteria

1. Voice mode feels seamless with clear status indicators and metrics visibility
2. Message actions (edit, regenerate, branch) are discoverable and intuitive
3. Citations and clinical context are easily accessible and useful
4. All new features have comprehensive test coverage

---

## Current Implementation Status (Phase 2 Complete)

### Voice Mode (Existing)

- ✅ `useRealtimeVoiceSession` hook with OpenAI Realtime API integration
- ✅ `VoiceModePanel` with waveform visualization
- ✅ `VoiceModeSettings` for voice/language selection
- ✅ Voice metrics tracking (connection time, STT latency, response latency)
- ⚠️ Metrics are tracked but not prominently displayed in UI
- ⚠️ Mic permission handling could be more graceful

### Chat Interface (Existing)

- ✅ `MessageBubble` with markdown, code blocks, citations
- ✅ `MessageActionMenu` with edit, regenerate, delete, copy, branch
- ✅ Message editing with save/cancel
- ✅ Copy-to-clipboard with toast feedback
- ⚠️ Branch UI exists but is sidebar-based, not inline
- ⚠️ Edit/regenerate UX could be more discoverable

### Citations & Context (Existing)

- ✅ `CitationDisplay` with expandable details and copy
- ✅ `CitationSidebar` for browsing all citations
- ✅ `ClinicalContextSidebar` and `ClinicalContextPanel`
- ⚠️ Citation filtering could be enhanced
- ⚠️ Clinical context presets not implemented

---

## Phase 3 Backlog (Prioritized)

### P0 - Must Have (Critical Path)

#### 1. Voice Metrics Dashboard in Voice Panel

**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, new `VoiceMetricsDisplay.tsx`

**Description:**
Display voice metrics prominently in the VoiceModePanel so users can see connection health and latency.

**Features:**

- Show connection time, STT latency, response latency in real-time
- Color-coded indicators (green/yellow/red) for latency thresholds
- Expandable/collapsible metrics panel
- Export metrics for debugging

**Acceptance Criteria:**

- [ ] Metrics visible during active voice session
- [ ] Latency thresholds: <500ms green, 500-1000ms yellow, >1000ms red
- [ ] Tests for VoiceMetricsDisplay component

---

#### 2. Mic Permission Error Handling UX

**Effort:** 0.5-1 day
**Files:** `VoiceModePanel.tsx`, `useRealtimeVoiceSession.ts`

**Description:**
Improve the user experience when microphone permission is denied or unavailable.

**Features:**

- Clear error message when mic permission denied
- Link to browser settings instructions
- Retry button after granting permission
- Graceful fallback (show text-only mode option)

**Acceptance Criteria:**

- [ ] Permission denied shows helpful UI instead of error
- [ ] User can recover without refreshing page
- [ ] Tests for permission error states

---

#### 3. Enhanced Message Action Menu UX

**Effort:** 1-2 days
**Files:** `MessageActionMenu.tsx`, `MessageBubble.tsx`

**Description:**
Make message actions more discoverable and polish the interaction patterns.

**Features:**

- Show action icons on hover (not hidden in dropdown)
- Add tooltips with keyboard shortcuts
- Confirmation dialogs for destructive actions (delete)
- Optimistic UI updates for edit/regenerate
- Loading states during async operations

**Acceptance Criteria:**

- [ ] Actions visible on hover without opening menu
- [ ] Delete requires confirmation
- [ ] Loading spinners during async ops
- [ ] Tests for all action states

---

### P1 - Important (Near-term)

#### 4. Inline Branch Creation UI

**Effort:** 2-3 days
**Files:** `MessageBubble.tsx`, `useBranching.ts`, new `BranchPreview.tsx`

**Description:**
Allow users to "fork" a conversation from any message with inline preview.

**Features:**

- "Branch from here" action in message menu
- Inline preview showing where branch will start
- Navigate to new branch or stay in current
- Visual indicator for messages that have branches

**Acceptance Criteria:**

- [ ] Can create branch from any message
- [ ] Visual feedback for branched messages
- [ ] Branch preview before confirming
- [ ] Tests for branch creation flow

---

#### 5. Voice Transcript Preview During Speech

**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, `useRealtimeVoiceSession.ts`

**Description:**
Show real-time transcript preview as user speaks, before finalizing.

**Features:**

- Live partial transcript display (streaming text)
- Visual distinction between partial and final transcripts
- Auto-clear partial on new utterance
- Smooth animation for transcript updates

**Acceptance Criteria:**

- [ ] Partial transcripts appear as user speaks
- [ ] Clear visual distinction (e.g., italic/faded)
- [ ] Smooth transitions to final transcript

---

#### 6. Citation Sidebar Filters

**Effort:** 1-2 days
**Files:** `CitationSidebar.tsx`

**Description:**
Add filtering and search capabilities to the citation sidebar.

**Features:**

- Filter by source type (KB, PubMed, guidelines)
- Filter by message (show citations for selected message)
- Search citations by text
- Sort by relevance/date
- "Jump to source" in message

**Acceptance Criteria:**

- [ ] Can filter citations by type
- [ ] Can search citation text
- [ ] "Jump to" scrolls to citation in message
- [ ] Tests for filter/search functionality

---

### P2 - Nice to Have (Future)

#### 7. Clinical Context Presets

**Effort:** 2-3 days
**Files:** `ClinicalContextPanel.tsx`, new `ClinicalContextPresets.tsx`

**Description:**
Allow users to save and load clinical context presets for common scenarios.

**Features:**

- Save current context as named preset
- Load preset to populate fields
- Built-in presets for common scenarios (pediatric, cardiac, etc.)
- Export/import presets

**Acceptance Criteria:**

- [ ] Can save custom presets
- [ ] Can load presets
- [ ] Built-in presets available
- [ ] Tests for preset save/load

---

#### 8. Voice Interruption (Barge-in) Indicator

**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, `useRealtimeVoiceSession.ts`

**Description:**
Visual feedback when user interrupts AI response with new speech.

**Features:**

- Visual indicator when barge-in detected
- Show which part of AI response was interrupted
- Smooth transition from AI speaking to user speaking

**Acceptance Criteria:**

- [ ] Barge-in visually indicated
- [ ] AI audio stops gracefully
- [ ] Tests for barge-in detection

---

#### 9. Message Regeneration Options

**Effort:** 1-2 days
**Files:** `MessageBubble.tsx`, new `RegenerateOptionsDialog.tsx`

**Description:**
Allow users to customize regeneration with options (temperature, length, etc.).

**Features:**

- "Regenerate with options" menu item
- Temperature slider (more creative vs more focused)
- Length preference (shorter/longer)
- Keep or clear clinical context

**Acceptance Criteria:**

- [ ] Can regenerate with options
- [ ] Options affect response
- [ ] Tests for regeneration options

---

#### 10. E2E Tests with Playwright

**Effort:** 3-5 days
**Files:** New `e2e/` directory

**Description:**
Set up Playwright for critical user flow E2E testing.

**Features:**

- Login → chat → send message flow
- Voice mode activation and basic interaction
- Citation display and expansion
- Conversation management (rename, archive, delete)

**Acceptance Criteria:**

- [ ] Playwright configured and running
- [ ] 5+ critical path E2E tests passing
- [ ] CI integration for E2E tests

---

## Dependencies on Backend

Most Phase 3 items are frontend-only. Potential backend dependencies:

| Feature              | Backend Dependency                            |
| -------------------- | --------------------------------------------- |
| Voice metrics        | None (already tracked client-side)            |
| Mic permission       | None (browser API)                            |
| Message actions      | Existing APIs sufficient                      |
| Branching            | `POST /api/conversations/:id/branch` (exists) |
| Transcript preview   | WebSocket events (already sent)               |
| Citation filters     | None (client-side filtering)                  |
| Clinical presets     | May need `POST /api/clinical-context/presets` |
| Barge-in             | OpenAI Realtime API (already supported)       |
| Regeneration options | May need API params for temp/length           |

---

## Estimated Timeline

| Priority  | Items                                               | Estimated Effort |
| --------- | --------------------------------------------------- | ---------------- |
| P0        | Voice Metrics, Mic UX, Message Actions              | 3-5 days         |
| P1        | Inline Branch, Transcript Preview, Citation Filters | 4-7 days         |
| P2        | Presets, Barge-in, Regeneration, E2E                | 7-12 days        |
| **Total** | 10 items                                            | **14-24 days**   |

---

## Testing Strategy

### Unit Tests

- All new components tested with Vitest + React Testing Library
- Mock voice session hook for VoiceMetricsDisplay tests
- Test filter/search logic in CitationSidebar

### Integration Tests

- Message action flows (edit → save → verify)
- Branch creation flow
- Citation filter interactions

### E2E Tests (P2)

- Critical path flows with Playwright
- Voice mode activation (if possible with mocked audio)

---

## Files to Create/Modify

### New Files

- `src/components/voice/VoiceMetricsDisplay.tsx`
- `src/components/chat/BranchPreview.tsx`
- `src/components/chat/RegenerateOptionsDialog.tsx`
- `src/components/clinical/ClinicalContextPresets.tsx`
- `e2e/` directory with Playwright tests

### Modified Files

- `src/components/voice/VoiceModePanel.tsx` (metrics, transcript preview)
- `src/components/chat/MessageActionMenu.tsx` (UX enhancements)
- `src/components/chat/MessageBubble.tsx` (action visibility)
- `src/components/citations/CitationSidebar.tsx` (filters)
- `src/hooks/useRealtimeVoiceSession.ts` (mic error handling)

---

## Open Questions

1. **Clinical context presets API:** Should presets be stored server-side per user, or just in localStorage?
2. **Regeneration options:** Does the backend support temperature/length params for regeneration?
3. **E2E voice testing:** Can we mock audio APIs in Playwright, or should voice E2E be manual?

---

**Created:** 2025-11-25
**Author:** Claude (AI Assistant)
**Status:** Ready for review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
