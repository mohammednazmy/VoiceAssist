---
title: "Voice Mode Settings Guide"
slug: "voice-mode-settings-guide"
summary: "This guide explains how to use and configure Voice Mode settings in VoiceAssist."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-29"
audience: ["frontend"]
tags: ["voice", "mode", "settings", "guide", "preferences", "tts"]
category: operations
---

# Voice Mode Settings Guide

This guide explains how to use and configure Voice Mode settings in VoiceAssist.

## Overview

Voice Mode provides real-time voice conversations with the AI assistant. Users can customize their voice experience through the settings panel, including voice selection, language preferences, TTS quality parameters, and behavior options.

**Voice Mode Overhaul (2025-11-29)**: Added backend persistence for voice preferences, context-aware voice style detection, and advanced TTS quality controls.

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

### Context-Aware Voice Style (New)

When enabled, the AI automatically adjusts its voice tone based on the content being spoken:

- **Calm**: Default for medical explanations (stable, measured pace)
- **Urgent**: For medical warnings/emergencies (dynamic, faster)
- **Empathetic**: For sensitive health topics (warm, slower)
- **Instructional**: For step-by-step guidance (clear, deliberate)
- **Conversational**: For general chat (natural, varied)

The system detects keywords and patterns to select the appropriate style, then blends it with your base preferences (60% your settings, 40% style preset).

### Advanced Voice Quality (New)

Expand this section to fine-tune TTS output parameters:

- **Voice Stability (0-100%)**: Lower = more expressive/varied, Higher = more consistent
- **Voice Clarity (0-100%)**: Higher values produce clearer, more consistent voice
- **Expressiveness (0-100%)**: Higher values add more emotion and style variation

These settings primarily affect ElevenLabs TTS but also influence context-aware style blending for OpenAI TTS.

## Persistence

Voice preferences are now stored in two locations for maximum reliability:

1. **Backend API** (Primary): Settings are synced to `/api/voice/preferences` and stored in the database. This enables cross-device settings sync when logged in.

2. **Local Storage** (Fallback): Settings are also cached locally under `voiceassist-voice-settings` for offline access and faster loading.

Changes are debounced (1 second) before being sent to the backend to reduce API calls while editing.

## Resetting to Defaults

Click "Reset to defaults" in the settings modal to restore all settings to their original values:

- Voice: Alloy
- Language: English
- VAD Sensitivity: 50%
- Auto-start: Disabled
- Show hints: Enabled
- Context-aware style: Enabled
- Stability: 50%
- Clarity: 75%
- Expressiveness: 0%

Reset also syncs to the backend via `POST /api/voice/preferences/reset`.

## Voice Preferences API (New)

The following API endpoints manage voice preferences:

| Endpoint                       | Method | Description                         |
| ------------------------------ | ------ | ----------------------------------- |
| `/api/voice/preferences`       | GET    | Get user's voice preferences        |
| `/api/voice/preferences`       | PUT    | Update preferences (partial update) |
| `/api/voice/preferences/reset` | POST   | Reset to defaults                   |
| `/api/voice/style-presets`     | GET    | Get available style presets         |

### Response Headers

TTS synthesis requests now include additional headers:

- `X-TTS-Provider`: Which provider was used (`openai` or `elevenlabs`)
- `X-TTS-Fallback`: Whether fallback was used (`true`/`false`)
- `X-TTS-Style`: Detected style if context-aware is enabled

## Technical Details

### Store Location

Settings are managed by a Zustand store with persistence:

```
apps/web-app/src/stores/voiceSettingsStore.ts
```

### Component Locations

- Settings UI: `apps/web-app/src/components/voice/VoiceModeSettings.tsx`
- Enhanced Settings: `apps/web-app/src/components/voice/VoiceSettingsEnhanced.tsx`

### Backend Files (New)

- Model: `services/api-gateway/app/models/user_voice_preferences.py`
- Style Detector: `services/api-gateway/app/services/voice_style_detector.py`
- API Endpoints: `services/api-gateway/app/api/voice.py` (preferences section)
- Schemas: `services/api-gateway/app/api/voice_schemas/schemas.py`

### Frontend Sync Hook (New)

```
apps/web-app/src/hooks/useVoicePreferencesSync.ts
```

Handles loading/saving preferences to backend with debouncing.

### Integration Points

- `VoiceModePanel.tsx` - Displays settings button and uses store values
- `MessageInput.tsx` - Reads `autoStartOnOpen` for auto-open behavior
- `useVoicePreferencesSync.ts` - Backend sync on auth and setting changes

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
