---
title: Voice Configuration
slug: voice/voice-configuration
summary: >-
  Centralized voice configuration system for consistent TTS voice selection
  across backend and frontend.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-05"
audience:
  - developers
  - backend
  - frontend
  - agent
  - ai-agents
tags:
  - voice
  - configuration
  - tts
  - elevenlabs
  - architecture
category: reference
ai_summary: >-
  The voice configuration system uses a single source of truth pattern to prevent
  voice ID inconsistencies between backend and frontend. All default voice settings
  are defined in voice_constants.py (backend) and voiceConstants.ts (frontend).
  To change the default voice, only these two files need to be modified.
---

# Voice Configuration

> **Backend:** `services/api-gateway/app/core/voice_constants.py`
> **Frontend:** `apps/web-app/src/lib/voiceConstants.ts`
> **Status:** Production Ready
> **Last Updated:** 2025-12-05

## Overview

The VoiceAssist platform uses a **centralized voice configuration** system to ensure consistent voice selection across all components. This prevents issues where different parts of the system use different default voices, which would result in inconsistent user experience (e.g., dual voices playing simultaneously).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SINGLE SOURCE OF TRUTH                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Backend: voice_constants.py          Frontend: voiceConstants.ts      │
│   ┌───────────────────────────┐       ┌───────────────────────────┐    │
│   │ DEFAULT_VOICE_ID = BRIAN  │       │ DEFAULT_VOICE_ID = BRIAN  │    │
│   │ DEFAULT_TTS_MODEL         │       │ VoiceInfo metadata        │    │
│   │ ElevenLabsVoice enum      │       │ ElevenLabsVoices enum     │    │
│   └─────────────┬─────────────┘       └─────────────┬─────────────┘    │
│                 │                                   │                   │
│                 ▼                                   ▼                   │
│   ┌─────────────────────────┐         ┌─────────────────────────┐      │
│   │ config.py               │         │ voiceSettingsStore.ts   │      │
│   │ elevenlabs_service.py   │         │ ThinkerTalkerVoicePanel │      │
│   │ voice_pipeline_service  │         │ useBargeInPromptAudio   │      │
│   └─────────────────────────┘         └─────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Backend Configuration

### voice_constants.py

The central configuration file for all voice-related constants:

```python
from app.core.voice_constants import (
    DEFAULT_VOICE_ID,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_OUTPUT_FORMAT,
    ElevenLabsVoice,
    get_openai_voice_for_elevenlabs,
)

# Current default voice
print(DEFAULT_VOICE_ID)  # "nPczCjzI2devNBz1zQrb" (Brian)

# Available voices
for voice in ElevenLabsVoice:
    print(f"{voice.name}: {voice.value}")
```

### Available Voices

| Voice ID               | Name                | Gender | Style               |
| ---------------------- | ------------------- | ------ | ------------------- |
| `nPczCjzI2devNBz1zQrb` | **Brian** (default) | Male   | Warm, natural       |
| `TxGEqnHWrfWFTfGW9XjX` | Josh                | Male   | Deep, authoritative |
| `21m00Tcm4TlvDq8ikWAM` | Rachel              | Female | Clear, professional |
| `pNInz6obpgDQGcFmaJgB` | Adam                | Male   | Deep, narrator      |
| `EXAVITQu4vr4xnSDxMaL` | Bella               | Female | Soft, storytelling  |
| `MF3mGyEYCl7XYWbV9V6O` | Elli                | Female | Young, friendly     |
| `yoZ06aMxZJJ28mfd3POQ` | Sam                 | Male   | Young, casual       |
| `XB0fDUnXU5powFXDhCwa` | Layla               | Female | Arabic              |

### Services Using voice_constants

1. **config.py** - Environment configuration defaults
2. **elevenlabs_service.py** - ElevenLabs TTS service
3. **voice_pipeline_service.py** - Voice pipeline configuration

## Frontend Configuration

### voiceConstants.ts

The frontend equivalent for voice configuration:

```typescript
import {
  DEFAULT_VOICE_ID,
  ElevenLabsVoices,
  VoiceInfo,
  getVoiceName,
  isValidVoiceId,
  getAvailableVoices,
} from "../lib/voiceConstants";

// Current default voice
console.log(DEFAULT_VOICE_ID); // "nPczCjzI2devNBz1zQrb" (Brian)

// Get voice name
console.log(getVoiceName(DEFAULT_VOICE_ID)); // "Brian"

// List all voices for a selector
const voices = getAvailableVoices();
voices.forEach((v) => console.log(`${v.name}: ${v.id}`));
```

### Components Using voiceConstants

1. **voiceSettingsStore.ts** - User voice preferences
2. **ThinkerTalkerVoicePanel.tsx** - Voice mode UI
3. **useBargeInPromptAudio.ts** - Barge-in prompt audio

## Changing the Default Voice

To change the default voice across the entire system, update **only these two files**:

### Step 1: Update Backend

Edit `services/api-gateway/app/core/voice_constants.py`:

```python
# Change from Brian to Josh
DEFAULT_VOICE_ID: str = ElevenLabsVoice.JOSH.value
DEFAULT_VOICE_NAME: str = "Josh"
```

### Step 2: Update Frontend

Edit `apps/web-app/src/lib/voiceConstants.ts`:

```typescript
// Change from Brian to Josh
export const DEFAULT_VOICE_ID = ElevenLabsVoices.JOSH;
export const DEFAULT_VOICE_NAME = "Josh";
```

### Step 3: Rebuild and Deploy

```bash
# Rebuild Docker container
docker compose build voiceassist-server
docker compose up -d voiceassist-server

# Rebuild frontend (if needed)
cd apps/web-app && pnpm build
```

## User Voice Selection

Users can override the default voice through the Voice Mode Settings:

1. Click the **Settings** button in Voice Mode
2. Select a voice from the **Voice** dropdown
3. The selected voice is stored in `voiceSettingsStore` (persisted in localStorage)
4. The frontend sends the selected `voice_id` to the backend with each request

The backend always uses the voice_id provided by the client. The default is only used when no voice_id is specified.

## Preventing Dual Voice Issues

The centralized configuration prevents several common issues:

### Problem: Multiple Default Voices

**Before:** Voice IDs were hardcoded in multiple files:

- `config.py` → Rachel
- `voice_pipeline_service.py` → Josh
- `elevenlabs_service.py` → Brian
- `ThinkerTalkerVoicePanel.tsx` → Josh

This caused dual voices when different components used different defaults.

**After:** All components import from the single source of truth:

- All backend services → `voice_constants.py`
- All frontend components → `voiceConstants.ts`

### Problem: Browser TTS Fallback

**Before:** When ElevenLabs failed, the system fell back to browser TTS (SpeechSynthesis), which used a completely different voice.

**After:** Browser TTS fallback has been removed. If ElevenLabs fails, the prompt is silently skipped rather than played in a different voice.

## Adding New Voices

### Backend

1. Add the voice to `ElevenLabsVoice` enum in `voice_constants.py`:

```python
class ElevenLabsVoice(str, Enum):
    # ... existing voices ...
    NEW_VOICE = "new-elevenlabs-voice-id"
```

2. Add voice info to `get_voice_info()`:

```python
cls.NEW_VOICE.value: {"name": "New Voice", "gender": "male", "style": "description"},
```

3. Add OpenAI fallback mapping:

```python
ELEVENLABS_TO_OPENAI_VOICE_MAP: Dict[str, str] = {
    # ... existing mappings ...
    ElevenLabsVoice.NEW_VOICE.value: "onyx",
}
```

### Frontend

1. Add the voice to `ElevenLabsVoices` in `voiceConstants.ts`:

```typescript
export const ElevenLabsVoices = {
  // ... existing voices ...
  NEW_VOICE: "new-elevenlabs-voice-id",
} as const;
```

2. Add voice info to `VoiceInfo`:

```typescript
[ElevenLabsVoices.NEW_VOICE]: { name: "New Voice", gender: "male", style: "description" },
```

## API Reference

### Backend: voice_constants.py

| Export                              | Type       | Description                             |
| ----------------------------------- | ---------- | --------------------------------------- |
| `DEFAULT_VOICE_ID`                  | `str`      | Default ElevenLabs voice ID             |
| `DEFAULT_VOICE_NAME`                | `str`      | Default voice display name              |
| `DEFAULT_TTS_MODEL`                 | `str`      | Default TTS model (`eleven_flash_v2_5`) |
| `DEFAULT_TTS_OUTPUT_FORMAT`         | `str`      | Audio format (`pcm_24000`)              |
| `DEFAULT_STABILITY`                 | `float`    | Voice stability (0.65)                  |
| `DEFAULT_SIMILARITY_BOOST`          | `float`    | Voice similarity (0.80)                 |
| `DEFAULT_STYLE`                     | `float`    | Voice style/emotion (0.15)              |
| `ElevenLabsVoice`                   | `Enum`     | Available voice IDs                     |
| `VoiceProvider`                     | `Enum`     | TTS providers (elevenlabs, openai)      |
| `get_openai_voice_for_elevenlabs()` | `function` | Get OpenAI fallback voice               |

### Frontend: voiceConstants.ts

| Export                 | Type       | Description                          |
| ---------------------- | ---------- | ------------------------------------ |
| `DEFAULT_VOICE_ID`     | `string`   | Default ElevenLabs voice ID          |
| `DEFAULT_VOICE_NAME`   | `string`   | Default voice display name           |
| `ElevenLabsVoices`     | `object`   | Voice ID constants                   |
| `VoiceInfo`            | `Record`   | Voice metadata (name, gender, style) |
| `getVoiceName()`       | `function` | Get display name from voice ID       |
| `isValidVoiceId()`     | `function` | Validate voice ID                    |
| `getAvailableVoices()` | `function` | Get all voices for selectors         |

## Troubleshooting

### Dual Voice Issue

If you hear two different voices:

1. Check that all backend services are using `voice_constants.py`
2. Check that all frontend components are using `voiceConstants.ts`
3. Verify the Docker container has been rebuilt with latest code
4. Clear browser localStorage to reset user preferences

### Voice Not Changing

If the voice doesn't change after updating settings:

1. Ensure the voice_id is being sent with the WebSocket connection
2. Check the `voiceSettingsStore` has the new voice_id
3. Verify the backend logs show the correct voice_id

### ElevenLabs API Errors

If ElevenLabs returns errors:

1. Check API key is configured: `ELEVENLABS_API_KEY`
2. Verify the voice_id is valid (use ElevenLabs dashboard)
3. Check rate limits and quota
