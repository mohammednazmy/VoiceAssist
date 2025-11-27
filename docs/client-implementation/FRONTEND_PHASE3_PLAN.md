---
title: "Frontend Phase3 Plan"
slug: "client-implementation/frontend-phase3-plan"
summary: "**Date:** 2025-11-25"
status: stable
stability: beta
owner: frontend
lastUpdated: "2025-11-27"
audience: ["frontend"]
tags: ["frontend", "phase3", "plan"]
---

# Frontend Phase 3 Plan - Web App UX & Voice Enhancements

**Date:** 2025-11-25
**Branch:** feature/frontend-phase3D-voice-transcript-preview
**Status:** Phase 3A-D Complete
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

**Status:** ✅ **Implemented** (feature/frontend-phase2-polish, PR #66)
**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, `VoiceMetricsDisplay.tsx`

**Description:**
Display voice metrics prominently in the VoiceModePanel so users can see connection health and latency.

**Features:**

- Show connection time, STT latency, response latency in real-time
- Color-coded indicators (green/yellow/red) for latency thresholds
- Expandable/collapsible metrics panel
- Time to first transcript display
- User/AI message counts and reconnect tracking
- Accessibility: sr-only legend text, aria-expanded, aria-controls

**Acceptance Criteria:**

- [x] Metrics visible during active voice session
- [x] Latency thresholds: <500ms green, 500-1000ms yellow, >1000ms red
- [x] Tests for VoiceMetricsDisplay component (25 tests)
- [x] Integration tests for VoiceModePanel metrics wiring (8 tests)
- [x] Accessible legend with screen reader support

---

#### 2. Mic Permission Error Handling UX

**Status:** ✅ **Implemented** (feature/frontend-phase2-polish, PR #66)
**Effort:** 0.5-1 day
**Files:** `VoiceModePanel.tsx`, `useRealtimeVoiceSession.ts`

**Description:**
Improve the user experience when microphone permission is denied or unavailable.

**Features:**

- Clear error message when mic permission denied
- Link to browser settings instructions
- Retry button after granting permission
- Graceful fallback ("Use text-only mode" button)
- State hygiene (micPermissionDenied reset on disconnect/reconnect)

**Acceptance Criteria:**

- [x] Permission denied shows helpful UI instead of error
- [x] User can recover without refreshing page
- [x] "Use text-only mode" fallback button available
- [x] Tests for permission error states (14 tests)

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

**Status:** ✅ **Implemented** (feature/frontend-phase3C-branches-citations)
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

- [x] Can create branch from any message
- [x] Visual feedback for branched messages
- [x] Branch preview before confirming
- [x] Tests for branch creation flow (16 tests)

---

#### 5. Voice Transcript Preview During Speech

**Status:** ✅ **Implemented** (feature/frontend-phase3D-voice-transcript-preview)
**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, `useRealtimeVoiceSession.ts`, new `VoiceTranscriptPreview.tsx`

**Description:**
Show real-time transcript preview as user speaks, before finalizing.

**Features:**

- Live partial transcript display (streaming text)
- Visual distinction between partial and final transcripts
- Auto-clear partial on new utterance
- Smooth animation for transcript updates

**Acceptance Criteria:**

- [x] Partial transcripts appear as user speaks
- [x] Clear visual distinction (e.g., italic/faded)
- [x] Smooth transitions to final transcript
- [x] Tests for component and hook (14 + 2 tests)

---

#### 6. Citation Sidebar Filters

**Status:** ✅ **Implemented** (feature/frontend-phase3C-branches-citations)
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

- [x] Can filter citations by type
- [x] Can search citation text
- [x] "Jump to" scrolls to citation in message
- [x] Tests for filter/search functionality (18 new tests in Phase 3C)

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

## Phase 3A Summary – Voice UX & Observability (Completed)

Phase 3A focused on voice mode polish and observability. This work was completed as part of the Phase 2 polish effort (PR #66).

### Implemented Features

1. **VoiceMetricsDisplay Component**
   - Collapsible metrics panel with real-time latency display
   - Color-coded indicators (green <500ms, yellow 500-1000ms, red >1000ms)
   - Displays: connection time, STT latency, response latency, time to first transcript
   - Shows user/AI message counts and reconnect count
   - Accessible legend with sr-only text for screen readers
   - Robust header that handles narrow viewport widths

2. **Mic Permission UX**
   - Contextual error messages for permission denied vs generic errors
   - Browser settings instructions for granting mic access
   - "Use text-only mode" fallback button
   - State properly resets on disconnect/reconnect
   - Retry button for non-permission connection errors

3. **Voice Metrics Logging**
   - Console logging for observability: `voice_session_connect_ms`, `voice_stt_latency_ms`, `voice_first_reply_ms`, `voice_session_duration_ms`
   - `onMetricsUpdate` callback for parent component integration

### Test Coverage

- `VoiceMetricsDisplay.test.tsx`: 25 tests (visibility, collapsible, metrics display, formatting, color coding, accessibility)
- `VoiceModePanel-metrics.test.tsx`: 8 tests (integration wiring)
- `VoiceModePanel-permissions.test.tsx`: 14 tests (permission handling, state, connection status)

### Upcoming (Phase 3D+)

- Voice transcript preview during speech
- Barge-in indicator
- Message action menu enhancements

---

## Phase 3B Summary – Keyboard-driven Voice UX & Responsive Layout (Completed)

Phase 3B focused on keyboard accessibility and responsive design for voice mode. This work was completed as PR #67.

### Implemented Features

1. **Keyboard-driven Voice Mode Control**
   - Global hotkey `Ctrl+Shift+V` to toggle voice mode
   - Push-to-talk mode (hold Space to talk)
   - Escape to disconnect voice session
   - Full keyboard navigation within voice panel

2. **Responsive Voice Panel Layout**
   - Stacked layout on narrow screens (< 640px)
   - Touch-friendly buttons meeting 44px minimum tap targets
   - Metrics legend wraps appropriately on mobile
   - Waveform scales to viewport width

### Test Coverage

- Multiple tests for keyboard interactions and responsive behavior

---

## Phase 3C Summary – Advanced Branching & Citations (Completed)

Phase 3C focused on conversation branching preview and citation filtering enhancements. This work was completed as part of feature/frontend-phase3C-branches-citations.

### Implemented Features

1. **BranchPreview Component**
   - Confirmation dialog before creating branch
   - Shows parent message preview with truncation
   - Displays message position (e.g., "message 2 of 4")
   - Shows count of messages that will be excluded from branch
   - Loading state with spinner during branch creation
   - Proper ARIA attributes for accessibility

2. **Visual Branch Indicator**
   - Messages that have branches show "Branched" badge
   - Badge styled differently for user vs assistant messages
   - Uses `branchedMessageIds` Set for efficient lookup

3. **Citation Sidebar Filters**
   - Type filter pills: All, Knowledge Base, PubMed/DOI, Guidelines
   - Message filter dropdown (when multiple messages have citations)
   - Filters combine with existing text search
   - Smart categorization based on source and sourceType

4. **Jump-to-Message Functionality**
   - "Jump to message #N" button on each citation
   - Smooth scroll to message with highlight effect
   - 2-second highlight ring animation
   - Uses `data-message-id` attribute for targeting

### Test Coverage

- `BranchPreview.test.tsx`: 16 tests (rendering, actions, creating state, edge cases, accessibility)
- `CitationSidebar-Phase8.test.tsx`: 18 new tests for Phase 3C features (type filters, message filters, jump-to, combined filters)

### Files Created/Modified

**New Files:**

- `src/components/chat/BranchPreview.tsx`
- `src/components/chat/__tests__/BranchPreview.test.tsx`

**Modified Files:**

- `src/pages/ChatPage.tsx` (branch preview state, onJumpToMessage callback)
- `src/components/chat/MessageList.tsx` (branchedMessageIds prop)
- `src/components/chat/MessageBubble.tsx` (hasBranch prop, visual indicator)
- `src/components/citations/CitationSidebar.tsx` (type/message filters, jump-to)
- `src/components/citations/__tests__/CitationSidebar-Phase8.test.tsx` (new tests)

---

## Phase 3D Summary – Voice Transcript Preview (Completed)

Phase 3D focused on implementing live speech-to-text preview while the user is speaking. This work was completed on branch feature/frontend-phase3D-voice-transcript-preview.

### Implemented Features

1. **Hook-level Partial Transcript Support**
   - Extended `useRealtimeVoiceSession` hook with `partialTranscript` state
   - Added handler for `conversation.item.input_audio_transcription.delta` events
   - Accumulates partial text as speech is recognized
   - Clears partial transcript on speech start and when final transcript arrives
   - Partial transcripts count toward "time to first transcript" metrics

2. **VoiceTranscriptPreview Component**
   - Shows "Listening" indicator with animated pulsing dot
   - Displays partial transcript text in italic blue styling
   - Blinking cursor indicates more text is expected
   - Only visible when speaking AND partial text exists
   - Accessible with `aria-live="polite"` and `aria-atomic="false"`
   - Decorative elements hidden from screen readers

3. **VoiceModePanel Integration**
   - VoiceTranscriptPreview appears after waveform, before final transcript
   - "Speaking..." indicator hidden when partial transcript is displayed
   - Smooth transition from partial to final transcript display

### Test Coverage

- `VoiceTranscriptPreview.test.tsx`: 14 tests (rendering, visual indicators, accessibility, content updates, edge cases)
- `useRealtimeVoiceSession.test.ts`: 2 additional tests (partialTranscript initialization, disconnect cleanup)

### Files Created/Modified

**New Files:**

- `src/components/voice/VoiceTranscriptPreview.tsx`
- `src/components/voice/__tests__/VoiceTranscriptPreview.test.tsx`

**Modified Files:**

- `src/hooks/useRealtimeVoiceSession.ts` (partialTranscript state, delta event handler)
- `src/hooks/__tests__/useRealtimeVoiceSession.test.ts` (2 new tests)
- `src/components/voice/VoiceModePanel.tsx` (VoiceTranscriptPreview integration)

---

## Additional P1 Backlog Items (Suggested)

#### Keyboard-driven Voice UX

**Effort:** 1-2 days
**Files:** `VoiceModePanel.tsx`, `MessageInput.tsx`

**Description:**
Add keyboard shortcuts for voice mode control.

**Features:**

- Global hotkey to toggle voice mode (e.g., `Ctrl+Shift+V`)
- Push-to-talk mode option (hold Space to talk)
- Keyboard navigation within voice panel
- Escape to disconnect

**Acceptance Criteria:**

- [ ] Can toggle voice mode with keyboard shortcut
- [ ] Push-to-talk mode available in settings
- [ ] Tests for keyboard interactions

---

#### Responsive Voice Panel & Metrics Layout

**Effort:** 1 day
**Files:** `VoiceModePanel.tsx`, `VoiceMetricsDisplay.tsx`

**Description:**
Ensure voice panel and metrics display work well on mobile and narrow viewports.

**Features:**

- Stacked layout on narrow screens
- Touch-friendly buttons (minimum 44px tap targets)
- Metrics legend collapses or wraps on mobile
- Waveform scales appropriately

**Acceptance Criteria:**

- [ ] Usable on 320px viewport width
- [ ] All interactive elements meet touch target guidelines
- [ ] Tests for responsive behavior (if feasible)

---

**Created:** 2025-11-25
**Last Updated:** 2025-11-26
**Author:** Claude (AI Assistant)
**Status:** Phase 3A-D Complete

🤖 Generated with [Claude Code](https://claude.com/claude-code)
