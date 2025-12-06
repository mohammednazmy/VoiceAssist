/**
 * StreamingTextDisplay - Phase 3 Voice Mode v4.1
 *
 * Displays streaming text with typewriter effect and RTL support.
 * Optimized for voice assistant responses with natural text flow.
 *
 * Features:
 * - Smooth character-by-character or chunk-based streaming
 * - RTL language auto-detection (Arabic, Hebrew, Farsi, Urdu)
 * - Bidirectional text handling (mixed LTR/RTL content)
 * - Visual cursor indicator
 * - Smooth scroll-to-bottom behavior
 * - Code block and markdown support
 * - Accessible with aria-live regions
 *
 * Reference: docs/voice/phase3-implementation-plan.md
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";

// RTL language detection patterns
const RTL_LANGUAGES = ["ar", "he", "fa", "ur", "yi", "ps", "sd"];
const RTL_CHAR_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

interface StreamingTextDisplayProps {
  /** Text content to display (can be partial/streaming) */
  text: string;
  /** Whether text is still streaming */
  isStreaming?: boolean;
  /** Language code for RTL detection override */
  languageCode?: string;
  /** Speed of typewriter effect (chars per second, 0 = instant) */
  typewriterSpeed?: number;
  /** Whether to show cursor while streaming */
  showCursor?: boolean;
  /** Callback when streaming completes */
  onStreamComplete?: () => void;
  /** Custom class name */
  className?: string;
  /** Test ID for testing */
  testId?: string;
}

type TextDirection = "ltr" | "rtl" | "auto";

interface TextSegment {
  text: string;
  direction: TextDirection;
  isCode: boolean;
}

/**
 * Detect text direction based on content
 */
function detectTextDirection(text: string): TextDirection {
  if (!text) return "ltr";

  // Count RTL and LTR characters
  let rtlCount = 0;
  let ltrCount = 0;

  for (const char of text) {
    if (RTL_CHAR_REGEX.test(char)) {
      rtlCount++;
    } else if (/[a-zA-Z]/.test(char)) {
      ltrCount++;
    }
  }

  // If more than 30% RTL, use RTL direction
  const total = rtlCount + ltrCount;
  if (total === 0) return "ltr";

  return rtlCount / total > 0.3 ? "rtl" : "ltr";
}

/**
 * Split text into segments with direction hints for bidirectional support
 */
function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const lines = text.split("\n");

  let inCodeBlock = false;
  let codeBuffer = "";

  for (const line of lines) {
    // Check for code block markers
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        segments.push({
          text: codeBuffer,
          direction: "ltr", // Code is always LTR
          isCode: true,
        });
        codeBuffer = "";
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer += (codeBuffer ? "\n" : "") + line;
    } else {
      // Regular text - detect direction per line
      const direction = detectTextDirection(line);
      segments.push({
        text: line,
        direction,
        isCode: false,
      });
    }
  }

  // Handle unclosed code block
  if (codeBuffer) {
    segments.push({
      text: codeBuffer,
      direction: "ltr",
      isCode: true,
    });
  }

  return segments;
}

export function StreamingTextDisplay({
  text,
  isStreaming = false,
  languageCode,
  typewriterSpeed = 60, // 60 chars/second
  showCursor = true,
  onStreamComplete,
  className,
  testId = "streaming-text-display",
}: StreamingTextDisplayProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousTextRef = useRef(text);

  // Get RTL settings from store
  const { rtlEnabled, rtlAutoDetect } = useVoiceSettingsStore();

  // Determine overall direction
  const overallDirection = useMemo((): TextDirection => {
    // Manual RTL override
    if (rtlEnabled) return "rtl";

    // Language code override
    if (
      languageCode &&
      RTL_LANGUAGES.includes(languageCode.slice(0, 2).toLowerCase())
    ) {
      return "rtl";
    }

    // Auto-detect from content
    if (rtlAutoDetect) {
      return detectTextDirection(text);
    }

    return "ltr";
  }, [text, rtlEnabled, rtlAutoDetect, languageCode]);

  // Segment text for bidirectional rendering
  const segments = useMemo(() => segmentText(text), [text]);

  // Displayed text with typewriter effect
  const displayedText = useMemo(() => {
    if (typewriterSpeed === 0 || !isStreaming) {
      return text;
    }
    return text.slice(0, displayedLength);
  }, [text, displayedLength, typewriterSpeed, isStreaming]);

  // Typewriter effect
  useEffect(() => {
    if (typewriterSpeed === 0 || !isStreaming) {
      setDisplayedLength(text.length);
      return;
    }

    // If text grew, animate the new characters
    if (text.length > previousTextRef.current.length) {
      // Start from where we left off
      const interval = setInterval(() => {
        setDisplayedLength((prev) => {
          if (prev >= text.length) {
            clearInterval(interval);
            return text.length;
          }
          return prev + 1;
        });
      }, 1000 / typewriterSpeed);

      return () => clearInterval(interval);
    } else if (text.length < previousTextRef.current.length) {
      // Text was reset/cleared
      setDisplayedLength(0);
    }

    previousTextRef.current = text;
  }, [text, typewriterSpeed, isStreaming]);

  // Scroll to bottom when content updates
  useEffect(() => {
    if (containerRef.current && isStreaming) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedText, isStreaming]);

  // Notify when streaming completes
  useEffect(() => {
    if (
      !isStreaming &&
      displayedLength >= text.length &&
      !hasCompletedOnce &&
      text.length > 0
    ) {
      setHasCompletedOnce(true);
      onStreamComplete?.();
    }
  }, [
    isStreaming,
    displayedLength,
    text.length,
    hasCompletedOnce,
    onStreamComplete,
  ]);

  // Reset completion flag when new text starts
  useEffect(() => {
    if (isStreaming) {
      setHasCompletedOnce(false);
    }
  }, [isStreaming]);

  // Render a single segment
  const renderSegment = useCallback((segment: TextSegment, index: number) => {
    if (segment.isCode) {
      return (
        <pre
          key={index}
          className={cn(
            "my-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg",
            "overflow-x-auto font-mono text-sm",
            "text-neutral-800 dark:text-neutral-200",
          )}
          dir="ltr"
        >
          <code>{segment.text}</code>
        </pre>
      );
    }

    return (
      <p
        key={index}
        className={cn(
          "leading-relaxed",
          segment.direction === "rtl" && "text-right",
        )}
        dir={segment.direction}
      >
        {segment.text}
      </p>
    );
  }, []);

  // If no text, show empty state
  if (!text && !isStreaming) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "streaming-text-display",
        "relative overflow-y-auto",
        "text-neutral-900 dark:text-neutral-100",
        className,
      )}
      dir={overallDirection}
      data-testid={testId}
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-busy={isStreaming}
    >
      {/* Displayed Text */}
      <div className="space-y-2">
        {segmentText(displayedText).map((segment, index) =>
          renderSegment(segment, index),
        )}
      </div>

      {/* Streaming Cursor */}
      {isStreaming && showCursor && (
        <span
          className={cn(
            "inline-block w-0.5 h-5 ml-0.5",
            "bg-blue-500 dark:bg-blue-400",
            "animate-pulse align-text-bottom",
            overallDirection === "rtl" && "mr-0.5 ml-0",
          )}
          aria-hidden="true"
        />
      )}

      {/* Streaming Indicator */}
      {isStreaming && (
        <div
          className={cn(
            "absolute bottom-2 px-2 py-1 rounded-full",
            "bg-blue-100 dark:bg-blue-900/40",
            "text-xs text-blue-600 dark:text-blue-400",
            "flex items-center gap-1",
            overallDirection === "rtl" ? "left-2" : "right-2",
          )}
        >
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          <span>Streaming</span>
        </div>
      )}
    </div>
  );
}

/**
 * StreamingTextLine - Single line variant for compact displays
 */
interface StreamingTextLineProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

export function StreamingTextLine({
  text,
  isStreaming = false,
  className,
}: StreamingTextLineProps) {
  const direction = detectTextDirection(text);

  return (
    <div
      className={cn(
        "streaming-text-line inline-flex items-baseline",
        className,
      )}
      dir={direction}
    >
      <span>{text}</span>
      {isStreaming && (
        <span
          className={cn(
            "inline-block w-0.5 h-4 ml-0.5",
            "bg-current opacity-70 animate-pulse",
            direction === "rtl" && "mr-0.5 ml-0",
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * Hook to manage streaming text state
 */
export function useStreamingText(initialText = "") {
  const [text, setText] = useState(initialText);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStreaming = useCallback(() => {
    setIsStreaming(true);
  }, []);

  const appendText = useCallback((chunk: string) => {
    setText((prev) => prev + chunk);
  }, []);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setText("");
    setIsStreaming(false);
  }, []);

  return {
    text,
    isStreaming,
    startStreaming,
    appendText,
    stopStreaming,
    reset,
    setText,
  };
}

export default StreamingTextDisplay;
