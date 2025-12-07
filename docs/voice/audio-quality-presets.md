# Audio Quality Presets

**Status:** Implemented
**Phase:** Audio Quality Enhancement
**Feature Flags:**

- `backend.voice_crisp_quality_preset`
- `backend.voice_high_quality_tts_model`
- `backend.voice_audio_crossfade`
- `backend.voice_enhanced_prebuffering`
- `backend.voice_default_quality_preset`

---

## Overview

Audio Quality Presets provide configurable settings for Voice Mode's text-to-speech output quality. Users can choose between different presets that balance response latency against audio clarity and naturalness.

## Available Presets

| Preset       | TTFA\*     | Choppiness        | Best For                     |
| ------------ | ---------- | ----------------- | ---------------------------- |
| **SPEED**    | ~100-150ms | May be noticeable | Fast responses, good network |
| **BALANCED** | ~200-250ms | Minimal           | General use (default)        |
| **NATURAL**  | ~300-400ms | None              | Extended listening           |
| **CRISP**    | ~350-450ms | None              | Highest audio quality        |

\*TTFA = Time to First Audio

---

## CRISP Quality Preset

The CRISP preset is optimized for the highest audio quality with zero choppiness. It trades slightly higher latency for crystal-clear speech output.

### Key Features

1. **Larger Text Chunks**
   - First chunk: 50-150 characters (vs 20-50 for BALANCED)
   - Subsequent chunks: 80-300 characters (vs 40-200 for BALANCED)
   - Prevents choppy opening audio from tiny fragments

2. **Optimized TTS Parameters**
   - Stability: 0.80 (higher = more consistent voice, fewer artifacts)
   - Similarity Boost: 0.90 (maximum voice clarity)
   - Style Exaggeration: 0.05 (minimal = cleaner output)

3. **Enhanced SSML Pauses**
   - Sentence pauses: 350ms
   - Clause pauses: 220ms
   - Question pauses: 380ms
   - Clear topic transitions with 650ms paragraph pauses

4. **Larger Audio Chunks**
   - 16KB audio chunks (vs 8KB for BALANCED)
   - Fewer gaps between playback segments

---

## Frontend Audio Enhancements

### Crossfade Between Chunks

When enabled (`enableCrossfade: true`), applies a smooth fade-in/fade-out at audio chunk boundaries:

- Standard mode: 5ms crossfade (120 samples at 24kHz)
- Enhanced mode: 10ms crossfade (240 samples at 24kHz)

Benefits:

- Eliminates pops and clicks at chunk boundaries
- Creates seamless audio stream
- Improves perceived audio quality

### Enhanced Pre-buffering

When enabled (`enhancedQuality: true`), increases the audio buffer before playback starts:

- Standard mode: 3 chunks (~150ms buffer)
- Enhanced mode: 5 chunks (~250ms buffer)

Benefits:

- More headroom against network jitter
- Smoother playback on unstable connections
- Recommended for CRISP preset

---

## Implementation

### Backend (TalkerService)

```python
from app.services.tts.quality_presets import QualityPreset, get_preset_config

# Apply CRISP preset to voice config
voice_config = VoiceConfig().apply_preset(QualityPreset.CRISP)
```

### Frontend (useTTAudioPlayback)

```typescript
const audioPlayback = useTTAudioPlayback({
  enablePrebuffering: true,
  enableCrossfade: true,
  enhancedQuality: true, // Uses CRISP-optimized settings
});
```

---

## Feature Flags

### `backend.voice_crisp_quality_preset`

- **Type:** Boolean
- **Default:** false
- **Description:** Enable CRISP quality preset for highest audio quality

### `backend.voice_high_quality_tts_model`

- **Type:** Boolean
- **Default:** false
- **Description:** Use eleven_turbo_v2_5 instead of eleven_flash_v2_5

### `backend.voice_audio_crossfade`

- **Type:** Boolean
- **Default:** false
- **Description:** Enable crossfade between audio chunks

### `backend.voice_enhanced_prebuffering`

- **Type:** Boolean
- **Default:** false
- **Description:** Increase pre-buffer from 3 to 5 chunks

### `backend.voice_default_quality_preset`

- **Type:** String
- **Default:** "balanced"
- **Allowed Values:** speed, balanced, natural, crisp
- **Description:** Default quality preset for voice mode

---

## Usage Recommendations

| Use Case             | Recommended Preset | Why                               |
| -------------------- | ------------------ | --------------------------------- |
| Quick Q&A            | SPEED              | Minimal latency for short answers |
| General conversation | BALANCED           | Good compromise (default)         |
| Learning/studying    | NATURAL            | Full sentences, natural prosody   |
| Extended listening   | CRISP              | Highest quality for long sessions |
| Poor network         | CRISP + Enhanced   | Maximum buffering                 |

---

## Metrics & Monitoring

Key metrics to track when using audio quality presets:

1. **Time to First Audio (TTFA)**
   - CRISP target: 350-450ms
   - Monitor via `ttfaMs` in frontend

2. **Audio Gaps**
   - Should be zero with CRISP + crossfade
   - Monitor via user feedback

3. **Buffer Underruns**
   - Track pre-buffer timeout triggers
   - Should decrease with enhanced prebuffering

---

## Related Documentation

- [Voice Configuration](./voice-configuration.md)
- [WebSocket Latency Optimization](./websocket-latency-optimization.md)
- [Thinker/Talker Pipeline](../THINKER_TALKER_PIPELINE.md)
