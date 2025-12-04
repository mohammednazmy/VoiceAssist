# StreamingTextDisplay Component

**Phase 3 - Voice Mode v4.1**

A text display component optimized for streaming AI responses with RTL support and typewriter effects.

## Overview

The StreamingTextDisplay component renders text character-by-character as it streams from the AI, providing visual feedback that the assistant is actively responding. It handles bidirectional text, code blocks, and mixed-language content.

````
+------------------------------------------+
| The assistant is responding...           |
| Hello! I can help you with that.|        | ← Blinking cursor
|                                          |
| ```python                                |
| def hello():                             |
|     print("Hello, World!")               |
| ```                                [●]   | ← Streaming indicator
+------------------------------------------+
````

## Features

- **Typewriter Effect**: Smooth character-by-character rendering
- **RTL Auto-Detection**: Detects Arabic, Hebrew, Farsi, Urdu content
- **Bidirectional Support**: Handles mixed LTR/RTL text per paragraph
- **Code Block Rendering**: Syntax-highlighted code sections
- **Streaming Indicator**: Visual badge showing streaming status
- **Cursor Animation**: Blinking cursor at insertion point
- **Auto-Scroll**: Keeps latest content in view

## Usage

### Basic Usage

```tsx
import { StreamingTextDisplay } from "@/components/voice/StreamingTextDisplay";

function ResponsePanel() {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  return (
    <StreamingTextDisplay
      text={text}
      isStreaming={isStreaming}
      onStreamComplete={() => console.log("Stream finished")}
    />
  );
}
```

### With useStreamingText Hook

```tsx
import { StreamingTextDisplay, useStreamingText } from "@/components/voice/StreamingTextDisplay";

function AIResponse() {
  const { text, isStreaming, startStreaming, appendText, stopStreaming, reset } = useStreamingText();

  useEffect(() => {
    // Simulate streaming from API
    startStreaming();

    const chunks = ["Hello", " there!", " How", " can", " I", " help?"];
    let i = 0;

    const interval = setInterval(() => {
      if (i < chunks.length) {
        appendText(chunks[i]);
        i++;
      } else {
        stopStreaming();
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return <StreamingTextDisplay text={text} isStreaming={isStreaming} />;
}
```

## Props

| Prop               | Type         | Default                    | Description                          |
| ------------------ | ------------ | -------------------------- | ------------------------------------ |
| `text`             | `string`     | required                   | Text content to display              |
| `isStreaming`      | `boolean`    | `false`                    | Whether text is still streaming      |
| `languageCode`     | `string`     | -                          | Override RTL detection               |
| `typewriterSpeed`  | `number`     | `60`                       | Characters per second (0 = instant)  |
| `showCursor`       | `boolean`    | `true`                     | Show blinking cursor while streaming |
| `onStreamComplete` | `() => void` | -                          | Callback when streaming finishes     |
| `className`        | `string`     | -                          | Additional CSS classes               |
| `testId`           | `string`     | `"streaming-text-display"` | Test ID attribute                    |

## RTL Support

### Automatic Detection

The component detects RTL content using Unicode character ranges:

```tsx
// RTL character detection regex
const RTL_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F...]/;

// Detects these language scripts:
// - Hebrew (0590-05FF)
// - Arabic (0600-06FF, 0750-077F, 08A0-08FF)
// - Arabic Presentation Forms (FB50-FDFF, FE70-FEFF)
```

### Per-Paragraph Direction

Each paragraph is analyzed independently for optimal bidirectional display:

```tsx
// Mixed content example
const text = `
English paragraph here.

مرحبا بك في المساعد الصوتي  // Arabic - RTL
This paragraph follows.
`;

// Each line gets appropriate dir="ltr" or dir="rtl"
```

### Manual Override

```tsx
// Force RTL for entire component
<StreamingTextDisplay
  text={text}
  languageCode="ar" // Forces RTL layout
/>;

// Or via store settings
const { rtlEnabled, rtlAutoDetect } = useVoiceSettingsStore();
```

## Code Block Handling

Code blocks are always rendered LTR regardless of surrounding text direction:

```tsx
const text = `
Here's an example:

\`\`\`python
def greet(name):
    return f"Hello, {name}!"
\`\`\`

The function returns a greeting.
`;

// Code block rendered with:
// - dir="ltr" (always)
// - Monospace font
// - Background highlight
// - Horizontal scroll for long lines
```

## Typewriter Effect

### Speed Control

```tsx
// Fast typing (120 chars/sec)
<StreamingTextDisplay text={text} typewriterSpeed={120} />

// Slow typing (30 chars/sec)
<StreamingTextDisplay text={text} typewriterSpeed={30} />

// Instant (no animation)
<StreamingTextDisplay text={text} typewriterSpeed={0} />
```

### Effect Behavior

- New characters animate in at specified speed
- Deleted/replaced text updates instantly
- Animation pauses when streaming stops
- Cursor disappears when not streaming

## useStreamingText Hook

The component exports a convenience hook for managing streaming state:

```tsx
const {
  text, // Current text content
  isStreaming, // Streaming status
  startStreaming, // Begin streaming
  appendText, // Add text chunk
  stopStreaming, // End streaming
  reset, // Clear all text
  setText, // Direct text setter
} = useStreamingText(initialText);
```

### Hook Usage Example

```tsx
function useAIStream(sessionId: string) {
  const streaming = useStreamingText();

  useEffect(() => {
    const ws = new WebSocket(`/voice/${sessionId}/stream`);

    ws.onopen = () => streaming.startStreaming();
    ws.onmessage = (e) => streaming.appendText(e.data);
    ws.onclose = () => streaming.stopStreaming();

    return () => ws.close();
  }, [sessionId]);

  return streaming;
}
```

## StreamingTextLine Component

A compact single-line variant for inline displays:

```tsx
import { StreamingTextLine } from "@/components/voice/StreamingTextDisplay";

function StatusLine() {
  return (
    <div className="flex items-center gap-2">
      <span>Status:</span>
      <StreamingTextLine text="Processing your request..." isStreaming={true} />
    </div>
  );
}
```

## Accessibility

- `role="region"` for screen reader context
- `aria-live="polite"` for streaming updates
- `aria-atomic="false"` for incremental reading
- `aria-busy` indicates streaming status

```tsx
<div role="region" aria-live="polite" aria-atomic="false" aria-busy={isStreaming}>
  {/* Streaming content */}
</div>
```

## Styling

### Default Styles

```css
.streaming-text-display {
  /* Container */
  position: relative;
  overflow-y: auto;

  /* Text */
  color: neutral-900 / neutral-100 (dark);

  /* Code blocks */
  .pre {
    background: neutral-100 / neutral-800 (dark);
    border-radius: 0.5rem;
    padding: 0.75rem;
    font-family: monospace;
  }
}
```

### Custom Styling

```tsx
<StreamingTextDisplay text={text} className="max-h-96 prose prose-sm dark:prose-invert" />
```

## Performance Considerations

- Text is segmented for efficient re-rendering
- Cursor animation uses CSS, not JS
- Auto-scroll debounced for smooth experience
- Large texts truncated with "..." indicator

## Integration Example

```tsx
import { StreamingTextDisplay } from "@/components/voice/StreamingTextDisplay";
import { useVoiceResponse } from "@/hooks/useVoiceResponse";

function VoiceResponsePanel() {
  const { responseText, isGenerating, detectedLanguage } = useVoiceResponse();

  return (
    <div className="p-4 bg-white dark:bg-neutral-900 rounded-lg">
      <StreamingTextDisplay
        text={responseText}
        isStreaming={isGenerating}
        languageCode={detectedLanguage}
        typewriterSpeed={80}
        showCursor={true}
        className="min-h-[100px] max-h-[400px]"
        onStreamComplete={() => {
          // Play completion sound, etc.
        }}
      />
    </div>
  );
}
```

## Related Documentation

- [VoiceFirstInputBar](./voice-first-input-bar.md)
- [RTL Support Guide](./rtl-support-guide.md)
- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
