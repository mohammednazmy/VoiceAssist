# VoiceFirstInputBar Component

**Phase 3 - Voice Mode v4.1**

A unified voice-first input bar that prioritizes voice interaction while providing text fallback. This component is the primary input interface for voice mode.

## Overview

```
+------------------------------------------------------------------+
| [PHI] | [Voice prompt / Text input area]         | [Mic] | [Kbd] |
+------------------------------------------------------------------+
        |                                          |
        v                                          v
   VAD-powered                              Push-to-talk
   auto-detection                           or always-on
```

## Features

- **Voice-First Design**: Prominent microphone button with visual feedback
- **VAD Preset Integration**: Respects sensitivity settings from voiceSettingsStore
- **RTL Support**: Full bidirectional layout with auto-detection
- **PHI Mode Indicator**: Visual indicator of current PHI routing status
- **Text Fallback**: Expandable text input for hybrid interaction
- **Keyboard Shortcuts**: Space to talk, Escape to cancel

## Usage

```tsx
import { VoiceFirstInputBar } from "@/components/voice/VoiceFirstInputBar";

function VoiceChat() {
  const handleSubmit = (input: string, isVoice: boolean) => {
    console.log(`Received ${isVoice ? "voice" : "text"} input:`, input);
  };

  return (
    <VoiceFirstInputBar
      onSubmit={handleSubmit}
      phiMode="hybrid"
      phiScore={0.45}
      placeholder="Press space or tap mic to speak..."
    />
  );
}
```

## Props

| Prop                  | Type                                        | Default            | Description                             |
| --------------------- | ------------------------------------------- | ------------------ | --------------------------------------- |
| `onSubmit`            | `(input: string, isVoice: boolean) => void` | required           | Callback when input is submitted        |
| `onRecordingStart`    | `() => void`                                | -                  | Called when recording begins            |
| `onRecordingStop`     | `() => void`                                | -                  | Called when recording ends              |
| `phiMode`             | `"local" \| "hybrid" \| "cloud"`            | `"cloud"`          | Current PHI routing mode                |
| `phiScore`            | `number`                                    | `0`                | PHI probability score (0-1)             |
| `isAssistantSpeaking` | `boolean`                                   | `false`            | Whether assistant is currently speaking |
| `disabled`            | `boolean`                                   | `false`            | Disable all input                       |
| `detectedLanguage`    | `string`                                    | -                  | Language code for RTL detection         |
| `placeholder`         | `string`                                    | `"Press space..."` | Placeholder text                        |
| `className`           | `string`                                    | -                  | Additional CSS classes                  |

## Keyboard Shortcuts

| Key               | Action               | Mode                          |
| ----------------- | -------------------- | ----------------------------- |
| `Space`           | Start recording      | Idle state, not in text input |
| `Space` (release) | Stop recording       | Push-to-talk mode             |
| `Escape`          | Cancel recording     | Recording state               |
| `Tab`             | Switch to text input | Focused on mic button         |
| `Enter`           | Submit text          | Text input mode               |

## VAD Preset Integration

The component reads VAD settings from `voiceSettingsStore`:

```tsx
// Settings automatically applied from store
const {
  vadPreset, // "sensitive" | "balanced" | "relaxed" | "accessibility" | "custom"
  vadCustomEnergyThresholdDb,
  vadCustomSilenceDurationMs,
  voiceModeType, // "always-on" | "push-to-talk"
  rtlEnabled,
  rtlAutoDetect,
} = useVoiceSettingsStore();
```

### VAD Preset Behavior

| Preset        | Energy Threshold | Silence Duration | Best For                 |
| ------------- | ---------------- | ---------------- | ------------------------ |
| Sensitive     | -45 dB           | 300 ms           | Quiet rooms, soft speech |
| Balanced      | -35 dB           | 500 ms           | General use (default)    |
| Relaxed       | -25 dB           | 800 ms           | Noisy environments       |
| Accessibility | -42 dB           | 1000 ms          | Speech impairments       |
| Custom        | User-defined     | User-defined     | Advanced users           |

## RTL Support

The component supports RTL languages with automatic layout mirroring:

```tsx
// RTL auto-detection for Arabic, Hebrew, Farsi, Urdu
const RTL_LANGUAGES = ["ar", "he", "fa", "ur", "yi", "ps", "sd"];

// Manual override
<VoiceFirstInputBar
  detectedLanguage="ar" // Triggers RTL layout
  // or via store settings:
  // rtlEnabled={true}
/>;
```

### RTL Layout Changes

- Mic button moves to left side
- Text flows right-to-left
- Energy visualizer bars reverse order
- PHI indicator repositions appropriately

## PHI Mode Indicator

The colored dot indicates current PHI routing:

| Color  | Mode   | Description                       |
| ------ | ------ | --------------------------------- |
| Green  | LOCAL  | On-device processing, most secure |
| Yellow | HYBRID | Cloud with PHI redaction          |
| Blue   | CLOUD  | Standard cloud processing         |

```tsx
<VoiceFirstInputBar
  phiMode="local" // Green indicator
  phiScore={0.85} // High PHI probability
/>
```

## States

```
idle → listening → processing → idle
  ↓                     ↑
text-input ─────────────┘
```

| State        | Visual                     | Behavior            |
| ------------ | -------------------------- | ------------------- |
| `idle`       | Placeholder text, blue mic | Ready for input     |
| `listening`  | Energy bars, red mic       | Recording audio     |
| `processing` | Spinner                    | Transcribing speech |
| `text-input` | Text field visible         | Text input mode     |
| `error`      | Red border, error message  | Error occurred      |

## Styling

The component uses Tailwind CSS with dark mode support:

```tsx
// Custom className for container
<VoiceFirstInputBar className="max-w-2xl mx-auto shadow-lg" />

// Dark mode automatically applied
// Uses dark: variants for all colors
```

## Integration with Voice Pipeline

```tsx
import { VoiceFirstInputBar } from "@/components/voice/VoiceFirstInputBar";
import { useVoicePipeline } from "@/hooks/useVoicePipeline";

function IntegratedVoiceChat() {
  const { sendMessage, isAssistantSpeaking, phiState } = useVoicePipeline();

  return (
    <VoiceFirstInputBar
      onSubmit={(input, isVoice) => sendMessage(input, { isVoice })}
      isAssistantSpeaking={isAssistantSpeaking}
      phiMode={phiState.mode}
      phiScore={phiState.score}
    />
  );
}
```

## Accessibility

- ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader announcements for state changes
- Focus management during mode switches

## Related Documentation

- [Adaptive VAD Presets](./adaptive-vad-presets.md)
- [RTL Support Guide](./rtl-support-guide.md)
- [PHI-Aware STT Routing](./phi-aware-stt-routing.md)
- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
