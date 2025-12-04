---
title: RTL Support Guide
slug: rtl-support-guide
status: stable
stability: production
owner: frontend
audience:
  - human
  - ai-agents
tags: [voice, i18n, rtl, arabic, urdu, hebrew, accessibility, v4]
summary: Guide to right-to-left language support in Voice Mode
lastUpdated: "2024-12-04"
---

# RTL Support Guide

Voice Mode v4.1 introduces comprehensive right-to-left (RTL) language support for Arabic, Urdu, and Hebrew in the chat interface.

## Overview

RTL support includes:

- **Text direction**: Automatic `dir="rtl"` for RTL content
- **Layout mirroring**: Chat bubbles, icons, and controls flip appropriately
- **Mixed content handling**: Proper rendering of RTL text with embedded LTR (numbers, English terms)
- **Input support**: RTL text input with proper cursor behavior
- **TTS integration**: RTL language detection for voice output

## Supported Languages

| Language | Code | Script            | Direction |
| -------- | ---- | ----------------- | --------- |
| Arabic   | ar   | Arabic            | RTL       |
| Urdu     | ur   | Arabic (Nastaliq) | RTL       |
| Hebrew   | he   | Hebrew            | RTL       |
| Persian  | fa   | Arabic            | RTL       |
| Pashto   | ps   | Arabic            | RTL       |

## CSS Implementation

### Base RTL Styles

```css
/* RTL container */
[dir="rtl"] {
  direction: rtl;
  text-align: right;
}

/* Chat message layout flip */
[dir="rtl"] .chat-message {
  flex-direction: row-reverse;
}

[dir="rtl"] .chat-message.user {
  margin-left: 0;
  margin-right: auto;
}

[dir="rtl"] .chat-message.assistant {
  margin-right: 0;
  margin-left: auto;
}

/* Icon flipping */
[dir="rtl"] .icon-arrow-left {
  transform: scaleX(-1);
}

[dir="rtl"] .icon-chevron-right {
  transform: scaleX(-1);
}

/* Input field */
[dir="rtl"] .text-input {
  text-align: right;
  padding-right: 1rem;
  padding-left: 2.5rem; /* Space for send button */
}

/* Scrollbar position */
[dir="rtl"] .chat-container {
  direction: rtl;
}

[dir="rtl"] .chat-container::-webkit-scrollbar {
  left: 0;
  right: auto;
}
```

### Tailwind RTL Utilities

```css
/* RTL-aware spacing */
.rtl\:mr-4 {
  margin-right: 1rem;
}

.rtl\:ml-0 {
  margin-left: 0;
}

.rtl\:text-right {
  text-align: right;
}

.rtl\:flex-row-reverse {
  flex-direction: row-reverse;
}
```

### Usage with Tailwind

```tsx
<div className="flex flex-row rtl:flex-row-reverse items-center gap-2">
  <Avatar />
  <span className="ml-2 rtl:ml-0 rtl:mr-2">{message.content}</span>
</div>
```

## Component Implementation

### ChatMessage Component

```tsx
import { useRTL } from "@/hooks/useRTL";

interface ChatMessageProps {
  message: Message;
  language?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, language }) => {
  const { isRTL, dir } = useRTL(language || message.detectedLanguage);

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isRTL && "flex-row-reverse",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
      dir={dir}
    >
      <Avatar role={message.role} className={cn(isRTL && "order-last")} />

      <div
        className={cn(
          "chat-bubble max-w-[80%] p-3 rounded-lg",
          message.role === "user" ? "bg-primary text-white" : "bg-gray-100",
          isRTL && "text-right",
        )}
      >
        <p dir={dir}>{message.content}</p>

        {message.sources && <SourceList sources={message.sources} dir={dir} />}
      </div>
    </div>
  );
};
```

### useRTL Hook

```tsx
import { useMemo } from "react";

const RTL_LANGUAGES = new Set(["ar", "ur", "he", "fa", "ps"]);

interface RTLInfo {
  isRTL: boolean;
  dir: "rtl" | "ltr";
  textAlign: "right" | "left";
}

export function useRTL(languageCode?: string): RTLInfo {
  return useMemo(() => {
    const isRTL = languageCode ? RTL_LANGUAGES.has(languageCode) : false;

    return {
      isRTL,
      dir: isRTL ? "rtl" : "ltr",
      textAlign: isRTL ? "right" : "left",
    };
  }, [languageCode]);
}
```

### RTLProvider Context

```tsx
import { createContext, useContext, ReactNode } from "react";

interface RTLContextValue {
  isRTL: boolean;
  setLanguage: (lang: string) => void;
}

const RTLContext = createContext<RTLContextValue>({
  isRTL: false,
  setLanguage: () => {},
});

export const RTLProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState("en");
  const isRTL = RTL_LANGUAGES.has(language);

  return (
    <RTLContext.Provider value={{ isRTL, setLanguage }}>
      <div dir={isRTL ? "rtl" : "ltr"}>{children}</div>
    </RTLContext.Provider>
  );
};

export const useRTLContext = () => useContext(RTLContext);
```

## Mixed Content Handling

### Bidirectional Text

For messages containing both RTL and LTR content:

```tsx
// Use Unicode bidi isolation
const formatMixedContent = (text: string, isRTL: boolean) => {
  // Wrap LTR content (numbers, English) in isolate marks
  if (isRTL) {
    return text.replace(
      /(\d+|[A-Za-z]+)/g,
      "\u2066$1\u2069", // Left-to-right isolate
    );
  }
  return text;
};

// Example: "المريض عمره 45 سنة" renders correctly
<p dir="rtl">{formatMixedContent(message.content, true)}</p>;
```

### Medical Terms in RTL

Medical terms often remain in English/Latin script:

```tsx
// Highlight medical terms while preserving RTL flow
const formatMedicalTerms = (text: string, isRTL: boolean) => {
  const termPattern = /(metformin|diabetes|hypertension)/gi;

  return text.split(termPattern).map((part, i) =>
    termPattern.test(part) ? (
      <span key={i} className="medical-term font-medium" dir="ltr">
        {part}
      </span>
    ) : (
      part
    ),
  );
};
```

## Voice Mode RTL

### Language Detection

```python
from app.services.language_detector import detect_language

async def detect_and_set_direction(text: str) -> dict:
    """Detect language and determine text direction."""
    detection = await detect_language(text)

    is_rtl = detection.language in {"ar", "ur", "he", "fa", "ps"}

    return {
        "language": detection.language,
        "is_rtl": is_rtl,
        "direction": "rtl" if is_rtl else "ltr",
        "confidence": detection.confidence
    }
```

### RTL in Voice Responses

WebSocket events include RTL information:

```typescript
// Server sends direction with response
socket.on("voice:response", (event: VoiceResponseEvent) => {
  // event.direction = "rtl" | "ltr"
  // event.language = "ar"

  setMessageDirection(event.direction);
  displayMessage(event.text, event.direction);
});
```

## Input Handling

### RTL Text Input

```tsx
const VoiceInput: React.FC = () => {
  const [inputDir, setInputDir] = useState<"ltr" | "rtl">("ltr");

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;

    // Detect RTL from first strong character
    const firstChar = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/);
    if (firstChar) {
      setInputDir("rtl");
    } else if (text.match(/[A-Za-z]/)) {
      setInputDir("ltr");
    }
  };

  return (
    <input
      type="text"
      dir={inputDir}
      onChange={handleInput}
      className={cn("w-full p-3", inputDir === "rtl" && "text-right")}
      placeholder={inputDir === "rtl" ? "اكتب هنا..." : "Type here..."}
    />
  );
};
```

### IME Support

Ensure proper Input Method Editor support for Arabic keyboards:

```tsx
// Handle composition events for Arabic input
const handleCompositionEnd = (e: React.CompositionEvent) => {
  // Arabic IME composition complete
  const text = e.data;
  processInput(text);
};

<input onCompositionEnd={handleCompositionEnd} />;
```

## Accessibility

### Screen Reader Support

```tsx
<div
  role="log"
  aria-live="polite"
  dir={isRTL ? "rtl" : "ltr"}
  lang={language}
  aria-label={isRTL ? "سجل المحادثة" : "Conversation log"}
>
  {messages.map((msg) => (
    <ChatMessage key={msg.id} message={msg} />
  ))}
</div>
```

### Keyboard Navigation

```tsx
// RTL-aware keyboard navigation
const handleKeyDown = (e: KeyboardEvent) => {
  if (isRTL) {
    // Flip arrow key behavior for RTL
    if (e.key === "ArrowLeft") {
      navigateNext();
    } else if (e.key === "ArrowRight") {
      navigatePrev();
    }
  } else {
    // Standard LTR behavior
    if (e.key === "ArrowRight") {
      navigateNext();
    } else if (e.key === "ArrowLeft") {
      navigatePrev();
    }
  }
};
```

## Testing

### Visual Regression Tests

```typescript
describe("RTL Layout", () => {
  it("renders Arabic message correctly", async () => {
    render(<ChatMessage message={arabicMessage} language="ar" />);

    const bubble = screen.getByRole("article");
    expect(bubble).toHaveAttribute("dir", "rtl");
    expect(bubble).toHaveClass("text-right");

    // Visual regression check
    await expect(page).toMatchSnapshot();
  });

  it("handles mixed RTL/LTR content", async () => {
    const mixedMessage = {
      content: "تناول metformin مرتين يوميا",
      language: "ar",
    };

    render(<ChatMessage message={mixedMessage} language="ar" />);

    // Medical term should be LTR isolated
    const term = screen.getByText("metformin");
    expect(term).toHaveAttribute("dir", "ltr");
  });
});
```

### Playwright E2E Tests

```typescript
test("Arabic conversation flow", async ({ page }) => {
  await page.goto("/chat");

  // Switch to Arabic
  await page.click('[data-testid="language-selector"]');
  await page.click('[data-testid="lang-ar"]');

  // Verify RTL layout
  const container = page.locator(".chat-container");
  await expect(container).toHaveAttribute("dir", "rtl");

  // Type in Arabic
  await page.fill('[data-testid="chat-input"]', "ما هو الضغط الطبيعي؟");
  await page.click('[data-testid="send-button"]');

  // Verify message direction
  const message = page.locator(".chat-message.user");
  await expect(message).toHaveClass(/text-right/);
});
```

## Feature Flag

```typescript
// Check if RTL support is enabled
import { useFeatureFlag } from "@/hooks/useFeatureFlags";

const ChatContainer = () => {
  const rtlEnabled = useFeatureFlag("ui.voice_v4_rtl_ui");
  const { isRTL } = useRTL(currentLanguage);

  return (
    <div dir={rtlEnabled && isRTL ? "rtl" : "ltr"}>
      {/* Chat content */}
    </div>
  );
};
```

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [Multilingual RAG Architecture](./multilingual-rag-architecture.md)
- [Lexicon Service Guide](./lexicon-service-guide.md)
