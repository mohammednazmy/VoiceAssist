# Unified Chat/Voice UI Implementation

**Last Updated**: 2025-11-28
**Status**: Complete (Phases 1-4)
**Feature Flag**: `unified_chat_voice_ui`

---

## Overview

The Unified Chat/Voice UI merges the previously separate Chat and Voice Mode interfaces into a single, cohesive experience. Users can seamlessly switch between text and voice input without leaving the conversation.

### Key Benefits

- **Seamless Mode Switching**: Toggle between text and voice without page navigation
- **Persistent Context**: Conversation state maintained across input mode changes
- **Mobile-First Design**: Responsive layout with collapsible panels
- **Improved Accessibility**: Full keyboard navigation and ARIA support
- **Better Performance**: Lazy-loaded components and optimized state management

---

## Architecture

### Component Structure

```
src/components/unified-chat/
├── UnifiedChatContainer.tsx    # Main container with 3-panel layout
├── UnifiedHeader.tsx           # Header with title editing, actions
├── UnifiedInputArea.tsx        # Combined text/voice input
├── CollapsibleSidebar.tsx      # Left panel: conversation list
├── CollapsibleContextPane.tsx  # Right panel: citations, clinical, branches
└── __tests__/                  # Component test suites
    ├── UnifiedHeader.test.tsx
    ├── UnifiedInputArea.test.tsx
    ├── CollapsibleSidebar.test.tsx
    └── CollapsibleContextPane.test.tsx
```

### Supporting Hooks

```
src/hooks/
├── useIsMobile.ts              # Mobile viewport detection
├── useVoiceModeStateMachine.ts # Voice mode state management
├── useConnectionManager.ts     # WebSocket connection handling
├── useInputModeDetection.ts    # Auto-detect input type
└── useAudioPlayback.ts         # Audio output management
```

### State Management

```
src/stores/
├── unifiedConversationStore.ts # Unified conversation state (Zustand)
└── voiceSettingsStore.ts       # Voice preferences (persisted)
```

---

## Three-Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                         UnifiedHeader                            │
│  [≡] Conversation Title (editable)         [Export][Share][⚙️]  │
├────────────┬────────────────────────────────────┬───────────────┤
│            │                                    │               │
│ Collapsible│         Main Chat Area            │  Collapsible  │
│  Sidebar   │                                    │  Context      │
│            │    ┌──────────────────────┐       │    Pane       │
│ • Pinned   │    │ Message List         │       │               │
│ • Recent   │    │ (scrollable)         │       │ • Citations   │
│ • Search   │    └──────────────────────┘       │ • Clinical    │
│            │                                    │ • Branches    │
│            │    ┌──────────────────────┐       │               │
│            │    │ UnifiedInputArea     │       │               │
│            │    │ [Mode][Input][Send]  │       │               │
│            │    └──────────────────────┘       │               │
│            │                                    │               │
├────────────┴────────────────────────────────────┴───────────────┤
│                        (Mobile: panels slide in as overlays)     │
└─────────────────────────────────────────────────────────────────┘
```

### Desktop Behavior

- **Sidebar**: 64px collapsed, 256px expanded
- **Context Pane**: 48px collapsed, 320px expanded
- **Main Area**: Fills remaining space (flex-1)

### Mobile Behavior

- **Sidebar**: Full-screen overlay sliding from left
- **Context Pane**: Full-screen overlay sliding from right
- **Header**: Hamburger menu for sidebar, info button for context
- **Transitions**: 200ms duration with backdrop fade

---

## Input Mode Toggle

The UnifiedInputArea provides seamless switching between text and voice modes:

### Text Mode

- Auto-resizing textarea
- Enter to send, Shift+Enter for newline
- Character count display
- Attachment button (future)

### Voice Mode

- **Always-On**: Continuous listening with silence detection
- **Push-to-Talk**: Hold spacebar to speak
- Visual feedback for voice states:
  - `idle`: Microphone icon
  - `listening`: Pulsing microphone (blue)
  - `processing`: Spinner
  - `responding`: Speaker icon (green)
  - `error`: Muted microphone (red)

### State Machine

```
┌─────────┐     activate     ┌────────────┐
│  idle   │ ───────────────> │ connecting │
└─────────┘                  └─────┬──────┘
     ▲                             │ connected
     │                             ▼
     │                       ┌────────────┐
     │  deactivate           │  listening │ <───┐
     │ <─────────────────────┴─────┬──────┘     │
     │                             │ speech     │
     │                             ▼            │
     │                       ┌────────────┐     │
     │                       │ processing │     │
     │                       └─────┬──────┘     │
     │                             │ complete   │
     │                             ▼            │
     │                       ┌────────────┐     │
     │                       │ responding │ ────┘
     │                       └────────────┘
     │                             │
     │       error                 │ error
     └─────────────────────────────┘
```

---

## Feature Flag

The unified interface is gated behind the `unified_chat_voice_ui` feature flag:

```typescript
// src/lib/featureFlags.ts
export function isUnifiedChatVoiceUIEnabled(): boolean {
  // Check user preference, environment, or A/B test
  return localStorage.getItem("ff_unified_chat_voice_ui") === "true" || import.meta.env.VITE_UNIFIED_UI === "true";
}
```

### Enabling the Feature

1. **Environment Variable**: Set `VITE_UNIFIED_UI=true` in `.env`
2. **Local Storage**: Set `ff_unified_chat_voice_ui` to `"true"`
3. **URL Parameter**: `?unified=true` (for testing)

---

## Performance Optimizations

### Lazy Loading

Dialogs are lazy-loaded to reduce initial bundle size:

```typescript
const KeyboardShortcutsDialog = lazy(() =>
  import('../KeyboardShortcutsDialog').then(m => ({ default: m.KeyboardShortcutsDialog }))
);
const ExportDialog = lazy(() =>
  import('../export/ExportDialog').then(m => ({ default: m.ExportDialog }))
);
const ShareDialog = lazy(() =>
  import('../sharing/ShareDialog').then(m => ({ default: m.ShareDialog }))
);

// Wrapped in Suspense with conditional rendering
<Suspense fallback={null}>
  {isShortcutsDialogOpen && <KeyboardShortcutsDialog ... />}
  {isExportDialogOpen && <ExportDialog ... />}
  {isShareDialogOpen && <ShareDialog ... />}
</Suspense>
```

### Memoization

- `mappedMessages` uses `useMemo` to avoid re-mapping on every render
- Event handlers use `useCallback` to maintain referential equality
- Component props are carefully structured to minimize re-renders

### State Management

The `unifiedConversationStore` uses Zustand with:

- Selective subscriptions via selectors
- Persist middleware for settings
- DevTools integration in development

---

## Accessibility

### Keyboard Navigation

| Shortcut | Action                    |
| -------- | ------------------------- |
| `Ctrl+K` | Open command palette      |
| `Ctrl+/` | Toggle keyboard shortcuts |
| `Ctrl+N` | New conversation          |
| `Ctrl+E` | Export conversation       |
| `Ctrl+B` | Toggle sidebar            |
| `Ctrl+I` | Toggle context pane       |
| `Space`  | Push-to-talk (voice mode) |
| `Escape` | Close overlays            |

### ARIA Support

- Sidebar: `<nav aria-label="Conversation history">`
- Context Pane: `<aside aria-label="Context and references">`
- Tabs: Full `tablist`/`tab`/`tabpanel` pattern
- Live regions for voice status announcements
- Focus management for modal overlays

---

## Testing

### Test Coverage (72 tests)

| Component                | Tests | Coverage                                  |
| ------------------------ | ----- | ----------------------------------------- |
| `CollapsibleSidebar`     | 12    | Open/closed states, pinning, navigation   |
| `CollapsibleContextPane` | 18    | Tabs, citations, clinical, branches       |
| `UnifiedHeader`          | 21    | Title editing, actions, connection status |
| `UnifiedInputArea`       | 15    | Text/voice modes, submission, shortcuts   |
| `useIsMobile`            | 6     | Viewport detection, listeners             |

### Running Tests

```bash
# Run unified-chat tests
npm test -- --run src/components/unified-chat

# Run with coverage
npm test -- --coverage src/components/unified-chat
```

---

## Migration Path

### From Legacy Chat

The legacy `ChatPage` continues to work and will be maintained until:

1. Unified UI reaches feature parity
2. A/B testing confirms user preference
3. Stakeholder approval for deprecation

### Gradual Rollout

1. **Phase 1**: Internal testing (feature flag)
2. **Phase 2**: Beta users (opt-in)
3. **Phase 3**: 10% rollout
4. **Phase 4**: 50% rollout
5. **Phase 5**: Full rollout, legacy deprecation

---

## Files Changed

### New Files

```
apps/web-app/src/
├── components/unified-chat/
│   ├── UnifiedChatContainer.tsx
│   ├── UnifiedHeader.tsx
│   ├── UnifiedInputArea.tsx
│   ├── CollapsibleSidebar.tsx
│   ├── CollapsibleContextPane.tsx
│   └── __tests__/
│       ├── CollapsibleSidebar.test.tsx
│       ├── CollapsibleContextPane.test.tsx
│       ├── UnifiedHeader.test.tsx
│       └── UnifiedInputArea.test.tsx
├── hooks/
│   ├── useIsMobile.ts
│   ├── useVoiceModeStateMachine.ts
│   ├── useConnectionManager.ts
│   ├── useInputModeDetection.ts
│   ├── useAudioPlayback.ts
│   └── __tests__/useIsMobile.test.ts
├── stores/
│   └── unifiedConversationStore.ts
├── lib/
│   └── featureFlags.ts
└── test/
    └── featureFlagHelpers.ts
```

### Modified Files

```
apps/web-app/src/
├── pages/ChatPage.tsx              # Feature flag integration
├── stores/voiceSettingsStore.ts    # Added voice mode type
└── components/chat/MessageBubble.tsx  # Minor fixes
```

---

## Related Documentation

- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md)
- [Voice Mode Pipeline](./VOICE_MODE_PIPELINE.md)
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md)
- [Accessibility Audit](./ACCESSIBILITY_AUDIT.md)

---

## Changelog

### 2025-11-28 - Phase 4 Complete

- Added 72 unit tests for all unified-chat components
- Implemented lazy loading for dialogs
- Added CSS transitions for mobile overlays
- Cleaned up unused imports
- Fixed DOM nesting validation warning

### 2025-11-28 - Phase 3 Complete

- Created CollapsibleContextPane with tabs
- Added citations aggregation and search
- Implemented clinical context tab
- Added branches/history tab

### 2025-11-28 - Phase 2 Complete

- Created UnifiedInputArea with mode toggle
- Implemented voice mode state machine
- Added push-to-talk and always-on modes
- Integrated keyboard shortcuts

### 2025-11-28 - Phase 1 Complete

- Created UnifiedChatContainer with 3-panel layout
- Implemented CollapsibleSidebar
- Created UnifiedHeader with title editing
- Added mobile-responsive design
