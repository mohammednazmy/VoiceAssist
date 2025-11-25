# Voice Mode Settings - User Guide

## Overview

Voice Mode Settings allow you to customize your voice interaction experience in VoiceAssist.

## Accessing Settings

1. Navigate to Voice Mode (click "Voice Mode" tile from home page)
2. Click the ⚙️ (gear) icon in the Voice Mode panel header
3. Settings modal will open

## Available Settings

### AI Voice
Choose from 6 different voice personalities:
- **Alloy** - Neutral and balanced (default)
- **Echo** - Warm and conversational
- **Fable** - Expressive and dynamic
- **Onyx** - Deep and authoritative
- **Nova** - Energetic and youthful
- **Shimmer** - Soft and gentle

### Language
Select your preferred language for voice interaction:
- English (default)
- Spanish, French, German, Italian, Portuguese

### Microphone Sensitivity
Adjust how easily the system detects your speech (0-100%):
- **Lower values (0-30%)**: Less sensitive, better for quiet environments
- **Medium (40-60%)**: Balanced detection (default: 50%)
- **Higher (70-100%)**: More sensitive, better for noisy environments

### Auto-start Voice Session
- **Enabled**: Voice session automatically starts when entering Voice Mode
- **Disabled**: Manual start required (default)

### Show Helpful Hints
- **Enabled**: Display usage tips and instructions (default)
- **Disabled**: Hide hints for a cleaner interface

## Settings Persistence

All settings are automatically saved to your browser's local storage and persist across:
- Page refreshes
- Browser sessions
- Different conversations

## Resetting Settings

Click "Reset to defaults" at the bottom of the settings modal to restore all settings to their original values.

## Current Configuration Display

The settings modal shows your active configuration in the "Current Configuration" section, making it easy to verify your settings at a glance.

## Known Limitations

1. **Voice and language settings are UI-only** - They are saved but not yet sent to the backend. Future updates will connect these settings to the actual voice API.
2. **VAD sensitivity is stored but not active** - The slider saves your preference but doesn't yet affect the voice detection threshold.

These limitations will be addressed in future updates when the settings store is integrated with the `useRealtimeVoiceSession` hook.

---

**Last Updated:** November 2025
**Version:** 1.0
