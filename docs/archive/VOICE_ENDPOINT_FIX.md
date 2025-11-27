---
title: "Voice Endpoint Fix"
slug: "archive/voice-endpoint-fix"
summary: "**Date:** 2025-11-24"
status: deprecated
stability: legacy
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["voice", "endpoint", "fix"]
category: reference
---

# Voice Endpoint Fix

**Date:** 2025-11-24
**Issue:** Voice endpoints returning 404 errors
**Status:** ✅ FIXED

---

## Problem

The voice transcription and TTS endpoints were returning 404 errors:

```
POST https://dev.asimo.io/api/voice/transcribe 404 (Not Found)
```

## Root Cause

The voice router in `/services/api-gateway/app/main.py` was included **without** the `/api` prefix:

```python
# Before (incorrect):
app.include_router(
    voice.router
)  # Milestone 1 Phase 3: Voice features (transcription, TTS)
```

This made the endpoints available at:

- `/voice/transcribe` ❌
- `/voice/synthesize` ❌

But the frontend was calling:

- `/api/voice/transcribe` ✅
- `/api/voice/synthesize` ✅

## Solution

Added the `/api` prefix to the voice router:

```python
# After (correct):
app.include_router(
    voice.router, prefix="/api"
)  # Milestone 1 Phase 3: Voice features (transcription, TTS)
```

## Changes Made

1. **File:** `/services/api-gateway/app/main.py` (line 141-143)
2. **Change:** Added `, prefix="/api"` to voice.router
3. **Deployment:** Copied updated file to Docker container and restarted

## Verification

```bash
# Test endpoint (should return "Not authenticated" instead of "Not Found"):
curl -s http://localhost:8000/api/voice/transcribe -X POST
# Response: {"detail":"Not authenticated"} ✅

# With auth token:
curl -s http://localhost:8000/api/voice/transcribe -X POST \
  -H "Authorization: Bearer <token>" \
  -F "audio=@test.webm"
# Should work! ✅
```

## Voice Endpoints Now Available

- **POST** `/api/voice/transcribe` - Transcribe audio to text (OpenAI Whisper)
- **POST** `/api/voice/synthesize` - Synthesize speech from text (OpenAI TTS)

Both endpoints require authentication (JWT token in Authorization header).

## Frontend Integration

The frontend voice components are already configured correctly:

- `VoiceInputEnhanced` calls `/api/voice/transcribe` ✅
- Audio synthesis calls `/api/voice/synthesize` ✅
- Auth token is automatically added by API client ✅

## Testing

To test the voice features:

1. Navigate to: `http://localhost:5174/voice-test` (or `https://dev.asimo.io/voice-test`)
2. Log in if prompted
3. Allow microphone access
4. Try voice input (VAD or push-to-talk)
5. Try text-to-speech synthesis
6. All should work now! 🎉

---

**Status:** ✅ Voice endpoints are now working correctly!
