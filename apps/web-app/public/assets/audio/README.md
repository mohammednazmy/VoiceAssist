# Audio Assets for Voice Mode v4

## Thinking Tone Audio

The thinking tone audio feedback uses the **Web Audio API** to generate tones programmatically.
This provides several advantages:

1. **No file loading** - Instant playback with no network requests
2. **Consistent quality** - Pure sine wave tones at precise frequencies
3. **Small bundle size** - No audio files to download
4. **Easy customization** - Frequency, duration, and volume are configurable

### Preset Configurations

| Preset        | Frequency | Duration | Interval | Volume |
| ------------- | --------- | -------- | -------- | ------ |
| `gentle_beep` | 440 Hz    | 100ms    | 2000ms   | 0.3    |
| `soft_chime`  | 880 Hz    | 150ms    | 2500ms   | 0.25   |
| `subtle_tick` | 660 Hz    | 50ms     | 1500ms   | 0.2    |

### Fallback Audio Files

If Web Audio API is not available (rare), the system falls back to these audio files:

- `thinking_beep.mp3` - Gentle 440Hz tone
- `thinking_chime.mp3` - Soft 880Hz chime
- `thinking_tick.mp3` - Subtle 660Hz tick

**Note:** These fallback files are optional since Web Audio API is supported in all modern browsers.

### Implementation

See `/apps/web-app/src/components/voice/ThinkingTonePlayer.tsx` for the implementation.

```typescript
// Usage
import { useThinkingTone, ThinkingIndicator } from '@/components/voice/ThinkingTonePlayer';

// Hook usage
function MyComponent() {
  const isThinking = true;
  useThinkingTone(isThinking, 'gentle_beep');
}

// Component usage
<ThinkingIndicator isThinking={true} preset="gentle_beep" />
```
