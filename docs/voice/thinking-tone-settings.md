---
title: Thinking Tone Settings
slug: thinking-tone-settings
status: stable
stability: production
owner: frontend
audience:
  - human
  - ai-agents
tags: [voice, ux, thinking-feedback, audio, haptic, v4]
summary: Configuration guide for thinking feedback during AI processing
lastUpdated: "2024-12-04"
---

# Thinking Tone Settings

Voice Mode v4.1 introduces multi-modal feedback during AI processing to keep users informed that the system is working.

## Overview

When the AI is processing a request (thinking), users can receive feedback through:

1. **Audio tones**: Subtle sounds generated via Web Audio API
2. **Visual indicators**: Animated UI elements
3. **Haptic feedback**: Vibration patterns on mobile devices

All feedback modalities are optional and user-configurable.

## Audio Feedback

### Tone Presets

| Preset        | Description                  | Duration | Frequency |
| ------------- | ---------------------------- | -------- | --------- |
| `gentle_beep` | Soft sine wave at A4 (440Hz) | 150ms    | Every 3s  |
| `soft_chime`  | Major chord (C5, E5, G5)     | 500ms    | Every 3s  |
| `subtle_tick` | Descending triangle wave     | 50ms     | Every 3s  |
| `none`        | No audio feedback            | -        | -         |

### Implementation

The `useThinkingTone` hook generates audio using the Web Audio API:

```typescript
import { useThinkingTone } from '@/hooks/useThinkingTone';

function VoicePanel({ isThinking }: { isThinking: boolean }) {
  // Hook handles audio playback automatically
  useThinkingTone(isThinking, {
    preset: 'gentle_beep',
    volume: 0.3,  // 0-1 normalized
    interval: 3000  // ms between tones
  });

  return <div>...</div>;
}
```

### TTS Conflict Prevention

Audio tones are automatically muted when TTS is playing to prevent audio overlap:

```typescript
const shouldPlayAudio = settings.thinkingToneEnabled && !isTTSPlaying && isThinking;

useThinkingTone(shouldPlayAudio, options);
```

This ensures a clean audio experience where thinking tones only play during silence, not over the AI's spoken responses. The `isTTSPlaying` state is managed by the voice state store and updated by the TTS playback hooks.

**Default Behavior**: Thinking tones are muted by default during any TTS playback. Users cannot override this behavior to prevent audio conflicts.

## Visual Feedback

### Visual Styles

| Style      | Description                     | Animation           |
| ---------- | ------------------------------- | ------------------- |
| `dots`     | Three bouncing dots             | Staggered bounce    |
| `pulse`    | Pulsing circle with ping effect | Scale + opacity     |
| `spinner`  | Rotating border spinner         | Continuous rotation |
| `progress` | Indeterminate progress bar      | Left-right sweep    |

### Component Usage

```tsx
import { ThinkingVisualIndicator } from "@/components/voice/ThinkingVisualIndicator";

<ThinkingVisualIndicator
  style="dots" // dots | pulse | spinner | progress
  size="md" // sm | md | lg
  color="#6366f1" // CSS color
/>;
```

### Unified Panel

The `ThinkingFeedbackPanel` combines audio, visual, and haptic feedback:

```tsx
import { ThinkingFeedbackPanel } from "@/components/voice/ThinkingFeedbackPanel";

<ThinkingFeedbackPanel
  isThinking={isProcessing}
  isTTSPlaying={isSpeaking} // Prevent audio overlap
  size="md"
  showLabel={true}
  label="Processing..."
/>;
```

## Haptic Feedback

### Vibration Patterns

| Pattern    | Description               | Vibration Array |
| ---------- | ------------------------- | --------------- |
| `gentle`   | Single soft pulse         | `[50]`          |
| `rhythmic` | Short-pause-short pattern | `[50, 100, 50]` |
| `none`     | No haptic feedback        | `[]`            |

### Mobile Detection

Haptic feedback is only available on mobile devices with vibration support:

```typescript
function useHapticSupport(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

function useIsMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(max-width: 768px)").matches;
}
```

### Implementation

```typescript
// Trigger haptic feedback
function triggerHaptic(pattern: "gentle" | "rhythmic" | "none") {
  const PATTERNS = {
    gentle: [50],
    rhythmic: [50, 100, 50],
    none: [],
  };

  if (pattern !== "none") {
    navigator.vibrate(PATTERNS[pattern]);
  }
}
```

## User Settings

### Settings State

All settings are persisted in `voiceSettingsStore`:

```typescript
interface ThinkingFeedbackSettings {
  thinkingToneEnabled: boolean; // Master toggle for audio
  thinkingTonePreset: "gentle_beep" | "soft_chime" | "subtle_tick" | "none";
  thinkingToneVolume: number; // 0-100
  thinkingToneOnToolCalls: boolean; // Play during tool execution
  thinkingVisualEnabled: boolean; // Show visual indicator
  thinkingVisualStyle: "dots" | "pulse" | "spinner" | "progress";
  thinkingHapticEnabled: boolean; // Enable haptic feedback
  thinkingHapticPattern: "gentle" | "rhythmic" | "none";
}
```

### Default Values

```typescript
const defaults = {
  thinkingToneEnabled: true,
  thinkingTonePreset: "gentle_beep",
  thinkingToneVolume: 30, // Low volume by default
  thinkingToneOnToolCalls: true,
  thinkingVisualEnabled: true,
  thinkingVisualStyle: "dots",
  thinkingHapticEnabled: true,
  thinkingHapticPattern: "gentle",
};
```

### Settings UI

The `ThinkingFeedbackSettings` component provides a user interface:

```tsx
import { ThinkingFeedbackSettings } from "@/components/voice/ThinkingFeedbackPanel";

<ThinkingFeedbackSettings className="p-4" />;
```

This renders:

- Audio toggle + preset selector + volume slider
- Visual toggle + style selector
- Haptic toggle + pattern selector (mobile only)

### Settings Panel Integration

The thinking feedback settings are integrated into the main Voice Settings panel (`settings-panel.js`). Users can access these controls via the gear icon in the voice mode interface.

The settings panel includes:

1. **Audio Section**: Master toggle, preset dropdown, volume slider (0-100)
2. **Visual Section**: Toggle and style selector
3. **Haptic Section** (mobile only): Toggle and pattern selector

All changes are persisted immediately to `voiceSettingsStore` and take effect without requiring a page refresh.

## Accessibility Considerations

### Screen Readers

Visual indicators include ARIA attributes:

```tsx
<div role="status" aria-live="polite" aria-label="Processing your request">
  <ThinkingVisualIndicator style="dots" />
  <span className="sr-only">Processing...</span>
</div>
```

### Reduced Motion

Respect user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-bounce,
  .animate-ping,
  .animate-spin {
    animation: none;
  }
}
```

### Audio Accessibility

- Default volume is low (30%)
- Users can disable audio entirely
- Visual/haptic alternatives available

## Integration Example

Complete integration in a voice mode component:

```tsx
function VoiceMode() {
  const { isThinking, isTTSPlaying } = useVoiceState();
  const settings = useVoiceSettingsStore();

  return (
    <div>
      {/* Main voice UI */}
      <VoicePanel />

      {/* Thinking feedback */}
      {isThinking && (
        <ThinkingFeedbackPanel
          isThinking={isThinking}
          isTTSPlaying={isTTSPlaying}
          className="absolute bottom-4 left-4"
        />
      )}

      {/* Settings panel */}
      <SettingsDrawer>
        <ThinkingFeedbackSettings />
      </SettingsDrawer>
    </div>
  );
}
```

## Feature Flag

Enable thinking feedback via feature flag:

```typescript
import { useFeatureFlag } from '@/hooks/useFeatureFlags';

function VoiceMode() {
  const showThinkingPanel = useFeatureFlag('voice_v4_thinking_feedback_panel');

  return (
    <div>
      {showThinkingPanel && isThinking && (
        <ThinkingFeedbackPanel isThinking={isThinking} />
      )}
    </div>
  );
}
```

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [Voice Settings Store](../frontend/voice-settings-store.md)
- [Latency Indicator Component](./latency-indicator.md)
