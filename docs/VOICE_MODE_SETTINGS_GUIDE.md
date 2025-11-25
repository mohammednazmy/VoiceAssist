# Voice Mode Settings Guide

This guide explains how to use and configure Voice Mode settings in VoiceAssist.

## Overview

Voice Mode provides real-time voice conversations with the AI assistant. Users can customize their voice experience through the settings panel, including voice selection, language preferences, and behavior options.

## Accessing Settings

1. Open Voice Mode by clicking the voice button in the chat interface
2. Click the gear icon in the Voice Mode panel header
3. The settings modal will appear

## Available Settings

### Voice Selection

Choose from 6 different AI voices:

- **Alloy** - Neutral, balanced voice (default)
- **Echo** - Warm, friendly voice
- **Fable** - Expressive, narrative voice
- **Onyx** - Deep, authoritative voice
- **Nova** - Energetic, bright voice
- **Shimmer** - Soft, calming voice

### Language

Select your preferred conversation language:

- English (default)
- Spanish
- French
- German
- Italian
- Portuguese

### Voice Detection Sensitivity (0-100%)

Controls how sensitive the voice activity detection is:

- **Lower values (0-30%)**: Less sensitive, requires louder/clearer speech
- **Medium values (40-60%)**: Balanced detection (recommended)
- **Higher values (70-100%)**: More sensitive, may pick up background noise

### Auto-start Voice Mode

When enabled, Voice Mode will automatically open when you start a new chat or navigate to the chat page. This is useful for voice-first interactions.

### Show Status Hints

When enabled, displays helpful tips and instructions in the Voice Mode panel. Disable if you're familiar with the interface and want a cleaner view.

## Persistence

All voice settings are automatically saved to your browser's local storage under the key `voiceassist-voice-settings`. Settings persist across sessions and page reloads.

## Resetting to Defaults

Click "Reset to defaults" in the settings modal to restore all settings to their original values:

- Voice: Alloy
- Language: English
- VAD Sensitivity: 50%
- Auto-start: Disabled
- Show hints: Enabled

## Technical Details

### Store Location

Settings are managed by a Zustand store:

```
apps/web-app/src/stores/voiceSettingsStore.ts
```

### Component Location

The settings UI component:

```
apps/web-app/src/components/voice/VoiceModeSettings.tsx
```

### Integration Points

- `VoiceModePanel.tsx` - Displays settings button and uses store values
- `MessageInput.tsx` - Reads `autoStartOnOpen` for auto-open behavior

### Advanced: Voice Mode Pipeline

Settings are not just UI preferences - they propagate into real-time voice sessions:

- **Voice/Language**: Sent to `/api/voice/realtime-session` and used by OpenAI Realtime API
- **VAD Sensitivity**: Mapped to server-side VAD threshold (0→insensitive, 100→sensitive)

For comprehensive pipeline documentation including backend integration, WebSocket connections, and metrics, see [VOICE_MODE_PIPELINE.md](./VOICE_MODE_PIPELINE.md).

---

## Development: Running Tests

Run the voice settings test suites individually to avoid memory issues:

```bash
cd apps/web-app

# Unit tests for voice settings store
npx vitest run src/stores/__tests__/voiceSettingsStore.test.ts --reporter=dot

# Component tests for VoiceModeSettings
npx vitest run src/components/voice/__tests__/VoiceModeSettings.test.tsx --reporter=dot

# Integration tests for MessageInput voice settings
npx vitest run src/components/chat/__tests__/MessageInput-voice-settings.test.tsx --reporter=dot
```

### Test Coverage

The test suites cover:

**voiceSettingsStore.test.ts**

- Default values verification
- All setter functions (voice, language, sensitivity, toggles)
- VAD sensitivity clamping (0-100 range)
- Reset functionality
- LocalStorage persistence

**VoiceModeSettings.test.tsx**

- Modal visibility (isOpen prop)
- Current settings display
- Settings updates via UI interactions
- Reset with confirmation
- Close behavior (Done, X, backdrop)
- Accessibility (labels, ARIA attributes)

**MessageInput-voice-settings.test.tsx**

- Auto-open via store setting (autoStartOnOpen)
- Auto-open via prop (autoOpenRealtimeVoice)
- Combined settings behavior
- Voice/language display in panel header
- Status hints visibility toggle

### Notes

- Tests mock `useRealtimeVoiceSession` and `WaveformVisualizer` to avoid browser API dependencies
- Run tests individually rather than the full suite to prevent memory issues
- All tests use Vitest + React Testing Library
