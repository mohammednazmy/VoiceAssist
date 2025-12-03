---
title: "Voice Mode Settings Guide"
slug: "voice-mode-settings-guide"
summary: "This guide explains how to use and configure Voice Mode settings in VoiceAssist."
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-03"
audience: ["frontend"]
tags: ["voice", "mode", "settings", "guide", "preferences", "tts", "multilingual", "offline", "calibration"]
category: operations
---

# Voice Mode Settings Guide

This guide explains how to use and configure Voice Mode settings in VoiceAssist.

## Overview

Voice Mode provides real-time voice conversations with the AI assistant. Users can customize their voice experience through the settings panel, including voice selection, language preferences, TTS quality parameters, and behavior options.

**Voice Mode Overhaul (2025-11-29)**: Added backend persistence for voice preferences, context-aware voice style detection, and advanced TTS quality controls.

**Phase 7-10 Enhancements (2025-12-03)**: Added multilingual support with auto-detection, voice calibration, offline fallback with network monitoring, and conversation intelligence features.

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

---

## Phase 7: Language & Detection Settings

### Auto-Detect Language

When enabled, the system automatically detects the language being spoken and adjusts processing accordingly. This is useful for multilingual users who switch between languages naturally.

- **Default**: Enabled
- **Store Key**: `autoLanguageDetection`

### Language Switch Confidence (0-100%)

Controls how confident the system must be before switching to a detected language. Higher values prevent false-positive language switches.

- **Lower values (50-70%)**: More responsive language switching, but may switch accidentally on similar-sounding phrases
- **Medium values (70-85%)**: Balanced detection (recommended)
- **Higher values (85-100%)**: Very confident switching, stays in current language unless clearly different

- **Default**: 75%
- **Store Key**: `languageSwitchConfidence`

### Accent Profile

Select a regional accent profile to improve speech recognition accuracy for your specific accent or dialect.

- **Default**: None (auto-detect)
- **Available Profiles**: en-us-midwest, en-gb-london, en-au-sydney, ar-eg-cairo, ar-sa-riyadh, etc.
- **Store Key**: `accentProfileId`

---

## Phase 8: Voice Calibration Settings

Voice calibration optimizes the VAD (Voice Activity Detection) thresholds specifically for your voice and environment.

### Calibration Status

Shows whether voice calibration has been completed:

- **Not Calibrated**: Default state, using generic thresholds
- **Calibrated**: Personal thresholds active (shows last calibration date)

### Recalibrate Button

Launches the calibration wizard to:

1. Record ambient noise samples
2. Record your speaking voice at different volumes
3. Compute personalized VAD thresholds

Calibration takes approximately 30-60 seconds.

### Personalized VAD Threshold

After calibration, the system uses a custom threshold tuned to your voice:

- **Store Key**: `personalizedVadThreshold`
- **Range**: 0.0-1.0 (null if not calibrated)

### Adaptive Learning

When enabled, the system continuously learns from your voice patterns and subtly adjusts thresholds over time.

- **Default**: Enabled
- **Store Key**: `enableBehaviorLearning`

---

## Phase 9: Offline Mode Settings

Configure how the voice assistant behaves when network connectivity is poor or unavailable.

### Enable Offline Fallback

When enabled, the system automatically switches to offline VAD processing when:

- Network is offline
- Health check fails consecutively
- Network quality drops below threshold

- **Default**: Enabled
- **Store Key**: `enableOfflineFallback`

### Prefer Local VAD

Force the use of local (on-device) VAD processing even when network is available. Useful for:

- Privacy-conscious users who don't want audio sent to servers
- Environments with unreliable connectivity
- Lower latency at the cost of accuracy

- **Default**: Disabled
- **Store Key**: `preferOfflineVAD`

### TTS Audio Caching

When enabled, previously synthesized audio responses are cached locally for:

- Faster playback of repeated phrases
- Offline playback of cached responses
- Reduced bandwidth and API costs

- **Default**: Enabled
- **Store Key**: `ttsCacheEnabled`

### Network Quality Monitoring

The system continuously monitors network quality and categorizes it into five levels:

| Quality   | Latency    | Behavior                           |
| --------- | ---------- | ---------------------------------- |
| Excellent | < 100ms    | Full cloud processing              |
| Good      | < 200ms    | Full cloud processing              |
| Moderate  | < 500ms    | Cloud processing, may show warning |
| Poor      | ≥ 500ms    | Auto-fallback to offline VAD       |
| Offline   | No network | Full offline mode                  |

Network status is displayed in the voice panel header when quality is degraded.

---

## Phase 10: Conversation Intelligence Settings

These settings control advanced AI features that enhance conversation quality.

### Enable Sentiment Tracking

When enabled, the AI tracks emotional tone throughout the conversation and adapts its responses accordingly.

- **Default**: Enabled
- **Store Key**: `enableSentimentTracking`

### Enable Discourse Analysis

Tracks conversation structure (topic changes, question chains, clarifications) to provide more contextually aware responses.

- **Default**: Enabled
- **Store Key**: `enableDiscourseAnalysis`

### Enable Response Recommendations

The AI suggests relevant follow-up questions or actions based on conversation context.

- **Default**: Enabled
- **Store Key**: `enableResponseRecommendations`

### Show Suggested Follow-Ups

Display AI-suggested follow-up questions after responses. These appear as clickable chips below the assistant's message.

- **Default**: Enabled
- **Store Key**: `showSuggestedFollowUps`

---

## Privacy Settings

### Store Transcript History

When enabled, voice transcripts are stored in the conversation history. Disable for ephemeral voice sessions.

- **Default**: Enabled
- **Store Key**: `storeTranscriptHistory`

### Share Anonymous Analytics

Opt-in to share anonymized voice interaction metrics to help improve the service. **No transcript content or personal data is shared** - only timing metrics (latency, error rates).

- **Default**: Disabled
- **Store Key**: `shareAnonymousAnalytics`

---

## Persistence

Voice preferences are now stored in two locations for maximum reliability:

1. **Backend API** (Primary): Settings are synced to `/api/voice/preferences` and stored in the database. This enables cross-device settings sync when logged in.

2. **Local Storage** (Fallback): Settings are also cached locally under `voiceassist-voice-settings` for offline access and faster loading.

Changes are debounced (1 second) before being sent to the backend to reduce API calls while editing.

## Resetting to Defaults

Click "Reset to defaults" in the settings modal to restore all settings to their original values:

### Core Settings

- Voice: Alloy
- Language: English
- VAD Sensitivity: 50%
- Auto-start: Disabled
- Show hints: Enabled
- Context-aware style: Enabled
- Stability: 50%
- Clarity: 75%
- Expressiveness: 0%

### Phase 7 Defaults

- Auto Language Detection: Enabled
- Language Switch Confidence: 75%
- Accent Profile ID: null

### Phase 8 Defaults

- VAD Calibrated: false
- Last Calibration Date: null
- Personalized VAD Threshold: null
- Adaptive Learning: Enabled

### Phase 9 Defaults

- Offline Fallback: Enabled
- Prefer Local VAD: Disabled
- TTS Cache: Enabled

### Phase 10 Defaults

- Sentiment Tracking: Enabled
- Discourse Analysis: Enabled
- Response Recommendations: Enabled
- Show Suggested Follow-Ups: Enabled

### Privacy Defaults

- Store Transcript History: Enabled
- Share Anonymous Analytics: Disabled

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
- Calibration Dialog: `apps/web-app/src/components/voice/CalibrationDialog.tsx`

### Phase 9 Offline/Network Files

- Network Monitor: `apps/web-app/src/lib/offline/networkMonitor.ts`
- WebRTC VAD: `apps/web-app/src/lib/offline/webrtcVAD.ts`
- Offline Types: `apps/web-app/src/lib/offline/types.ts`
- Network Status Hook: `apps/web-app/src/hooks/useNetworkStatus.ts`
- Offline VAD Hook: `apps/web-app/src/hooks/useOfflineVAD.ts`

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

# Unit tests for voice settings store (core)
npx vitest run src/stores/__tests__/voiceSettingsStore.test.ts --reporter=dot

# Unit tests for voice settings store (Phase 7-10)
npx vitest run src/stores/__tests__/voiceSettingsStore-phase7-10.test.ts --reporter=dot

# Unit tests for network monitor
npx vitest run src/lib/offline/__tests__/networkMonitor.test.ts --reporter=dot

# Component tests for VoiceModeSettings
npx vitest run src/components/voice/__tests__/VoiceModeSettings.test.tsx --reporter=dot

# Integration tests for MessageInput voice settings
npx vitest run src/components/chat/__tests__/MessageInput-voice-settings.test.tsx --reporter=dot
```

### Test Coverage

The test suites cover:

**voiceSettingsStore.test.ts** (17 tests)

- Default values verification
- All setter functions (voice, language, sensitivity, toggles)
- VAD sensitivity clamping (0-100 range)
- Reset functionality
- LocalStorage persistence

**voiceSettingsStore-phase7-10.test.ts** (41 tests)

- Phase 7: Multilingual settings (accent profile, auto-detection, confidence)
- Phase 8: Calibration settings (VAD calibrated, dates, thresholds)
- Phase 9: Offline mode settings (fallback, prefer offline VAD, TTS cache)
- Phase 10: Conversation intelligence (sentiment, discourse, recommendations)
- Privacy settings (transcript history, anonymous analytics)
- Persistence tests for all Phase 7-10 settings
- Reset tests verifying all defaults

**networkMonitor.test.ts** (13 tests)

- Initial state detection (online/offline)
- Health check latency measurement
- Quality computation from latency thresholds
- Consecutive failure handling before marking unhealthy
- Subscription/unsubscription for status changes
- Custom configuration (latency thresholds, health check URL)
- Offline detection via navigator.onLine

**VoiceModeSettings.test.tsx** (25 tests)

- Modal visibility (isOpen prop)
- Current settings display
- Settings updates via UI interactions
- Reset with confirmation
- Close behavior (Done, X, backdrop)
- Accessibility (labels, ARIA attributes)

**MessageInput-voice-settings.test.tsx** (12 tests)

- Auto-open via store setting (autoStartOnOpen)
- Auto-open via prop (autoOpenRealtimeVoice)
- Combined settings behavior
- Voice/language display in panel header
- Status hints visibility toggle

**Total: 108+ tests** for voice settings and related functionality.

### Notes

- Tests mock `useRealtimeVoiceSession` and `WaveformVisualizer` to avoid browser API dependencies
- Run tests individually rather than the full suite to prevent memory issues
- All tests use Vitest + React Testing Library
- Phase 7-10 tests also mock `fetch` and `performance.now` for network monitoring
