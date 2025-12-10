/**
 * useGracefulTruncation Hook
 *
 * Tracks AI response playback and calculates optimal truncation
 * points when barge-in occurs. Enables graceful interruption handling.
 *
 * Phase 5: Turn Overlap Handling
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

import { useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

export type TruncationType = "sentence" | "phrase" | "word" | "mid_word" | "immediate";

export interface TruncationInfo {
  /** Type of truncation that occurred */
  truncationType: TruncationType;
  /** Text that was spoken before interruption */
  spokenText: string;
  /** Text that wasn't spoken due to interruption */
  unspokenText: string;
  /** Whether truncation was at a clean break point */
  wasGraceful: boolean;
  /** Audio fade-out duration in ms */
  audioFadeMs: number;
  /** Position in original text where truncation occurred */
  truncationPosition: number;
}

export interface GracefulTruncationOptions {
  /** Duration of audio fade-out in ms (default: 50) */
  fadeOutDurationMs?: number;
  /** Whether to track what text was spoken (default: true) */
  trackSpokenText?: boolean;
  /** Callback when truncation occurs */
  onTruncation?: (info: TruncationInfo) => void;
  /** Characters per second for speech rate estimation (default: 15) */
  charsPerSecond?: number;
}

export interface TruncationPoint {
  position: number;
  type: TruncationType;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useGracefulTruncation(options: GracefulTruncationOptions = {}) {
  const {
    fadeOutDurationMs = 50,
    trackSpokenText = true,
    onTruncation,
    charsPerSecond = 15,
  } = options;

  // Track what we've spoken so far
  const spokenTextRef = useRef<string>("");
  const fullResponseRef = useRef<string>("");
  const audioStartTimeRef = useRef<number>(0);
  const lastTruncationRef = useRef<TruncationInfo | null>(null);

  /**
   * Start tracking a new AI response.
   */
  const startTracking = useCallback((fullResponse: string) => {
    fullResponseRef.current = fullResponse;
    spokenTextRef.current = "";
    audioStartTimeRef.current = Date.now();
    lastTruncationRef.current = null;
  }, []);

  /**
   * Update spoken text progress (call as audio plays).
   */
  const updateProgress = useCallback(
    (spokenText: string) => {
      if (trackSpokenText) {
        spokenTextRef.current = spokenText;
      }
    },
    [trackSpokenText]
  );

  /**
   * Update progress by character count.
   */
  const updateProgressByChars = useCallback(
    (charactersSpoken: number) => {
      if (trackSpokenText && fullResponseRef.current) {
        spokenTextRef.current = fullResponseRef.current.substring(
          0,
          Math.min(charactersSpoken, fullResponseRef.current.length)
        );
      }
    },
    [trackSpokenText]
  );

  /**
   * Estimate spoken characters based on audio duration.
   */
  const estimateSpokenChars = useCallback(
    (audioDurationMs: number): number => {
      return Math.floor((audioDurationMs / 1000) * charsPerSecond);
    },
    [charsPerSecond]
  );

  /**
   * Calculate truncation when barge-in occurs.
   */
  const calculateTruncation = useCallback((): TruncationInfo => {
    const fullResponse = fullResponseRef.current;
    const audioDuration = Date.now() - audioStartTimeRef.current;
    const estimatedChars = estimateSpokenChars(audioDuration);

    // Use tracked text if available, otherwise estimate
    const spokenChars = spokenTextRef.current
      ? spokenTextRef.current.length
      : estimatedChars;

    // Find best truncation point
    const truncationPoint = findBestTruncationPoint(fullResponse, spokenChars);

    const info: TruncationInfo = {
      truncationType: truncationPoint.type,
      spokenText: fullResponse.substring(0, truncationPoint.position),
      unspokenText: fullResponse.substring(truncationPoint.position),
      wasGraceful: ["sentence", "phrase"].includes(truncationPoint.type),
      audioFadeMs: fadeOutDurationMs,
      truncationPosition: truncationPoint.position,
    };

    lastTruncationRef.current = info;
    onTruncation?.(info);

    return info;
  }, [estimateSpokenChars, fadeOutDurationMs, onTruncation]);

  /**
   * Get the last truncation result.
   */
  const getLastTruncation = useCallback((): TruncationInfo | null => {
    return lastTruncationRef.current;
  }, []);

  /**
   * Check if continuation should be offered based on last truncation.
   */
  const shouldOfferContinuation = useCallback((): boolean => {
    const lastTruncation = lastTruncationRef.current;
    if (!lastTruncation) return false;

    // Don't offer for very short unspoken portions
    if (lastTruncation.unspokenText.length < 20) return false;

    // Don't offer if truncation was at sentence boundary with little remaining
    if (
      lastTruncation.truncationType === "sentence" &&
      lastTruncation.unspokenText.length < 100
    ) {
      return false;
    }

    return true;
  }, []);

  /**
   * Generate acknowledgment prefix based on how interruption occurred.
   */
  const generateAcknowledgment = useCallback(
    (userUtterance: string): string => {
      const lastTruncation = lastTruncationRef.current;
      const userLower = userUtterance.toLowerCase().trim();

      // User asked us to stop
      const stopWords = ["stop", "wait", "hold on", "pause", "hang on"];
      if (stopWords.some((word) => userLower.includes(word))) {
        return "Okay, I'll stop. ";
      }

      // User asked a new question
      if (userUtterance.includes("?")) {
        return "Sure, ";
      }

      // User wants to add something
      if (["actually", "also", "and", "but", "however"].some((w) => userLower.startsWith(w))) {
        return "Right, ";
      }

      // User is correcting something
      if (["no", "not", "wrong", "incorrect"].some((w) => userLower.startsWith(w))) {
        return "I see, ";
      }

      // Generic acknowledgment based on truncation type
      if (lastTruncation?.wasGraceful) {
        return ""; // Clean break, no acknowledgment needed
      }

      return "Got it. ";
    },
    []
  );

  /**
   * Reset tracking state.
   */
  const reset = useCallback(() => {
    spokenTextRef.current = "";
    fullResponseRef.current = "";
    audioStartTimeRef.current = 0;
    lastTruncationRef.current = null;
  }, []);

  /**
   * Get current spoken text.
   */
  const getCurrentSpokenText = useCallback((): string => {
    return spokenTextRef.current;
  }, []);

  /**
   * Get full response being tracked.
   */
  const getFullResponse = useCallback((): string => {
    return fullResponseRef.current;
  }, []);

  /**
   * Get elapsed time since tracking started.
   */
  const getElapsedTime = useCallback((): number => {
    if (audioStartTimeRef.current === 0) return 0;
    return Date.now() - audioStartTimeRef.current;
  }, []);

  return {
    // Core tracking
    startTracking,
    updateProgress,
    updateProgressByChars,
    calculateTruncation,
    reset,

    // Getters
    getCurrentSpokenText,
    getFullResponse,
    getElapsedTime,
    getLastTruncation,

    // Helpers
    estimateSpokenChars,
    shouldOfferContinuation,
    generateAcknowledgment,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Find the best truncation point in text.
 */
export function findBestTruncationPoint(
  text: string,
  approximatePosition: number
): TruncationPoint {
  const pos = Math.min(approximatePosition, text.length);

  if (pos <= 0) {
    return { position: 0, type: "immediate" };
  }

  // Look for sentence boundary (within 50 chars back)
  const sentencePoint = findBoundary(text, pos, 50, ".!?");
  if (sentencePoint !== null) {
    return { position: sentencePoint + 1, type: "sentence" };
  }

  // Look for phrase boundary (within 30 chars back)
  const phrasePoint = findBoundary(text, pos, 30, ",;:");
  if (phrasePoint !== null) {
    return { position: phrasePoint + 1, type: "phrase" };
  }

  // Look for word boundary (within 15 chars back)
  const wordPoint = findBoundary(text, pos, 15, " ");
  if (wordPoint !== null) {
    return { position: wordPoint, type: "word" };
  }

  // Mid-word truncation
  return { position: pos, type: "mid_word" };
}

/**
 * Find a boundary character within lookback range.
 */
function findBoundary(
  text: string,
  position: number,
  lookback: number,
  boundaryChars: string
): number | null {
  const searchStart = Math.max(0, position - lookback);

  for (let i = position - 1; i >= searchStart; i--) {
    if (boundaryChars.includes(text[i])) {
      // For sentence boundaries, check it's not an abbreviation
      if (boundaryChars === ".!?" && i + 1 < text.length) {
        const nextChar = text[i + 1];
        if (nextChar && nextChar.toLowerCase() === nextChar && nextChar !== " ") {
          continue; // Likely abbreviation, keep looking
        }
      }
      return i;
    }
  }

  return null;
}

/**
 * Get a natural continuation prompt for the AI.
 */
export function getContinuationPrompt(truncationInfo: TruncationInfo): string {
  if (!truncationInfo.unspokenText) {
    return "";
  }

  const spokenSuffix =
    truncationInfo.spokenText.length > 100
      ? truncationInfo.spokenText.slice(-100)
      : truncationInfo.spokenText;

  const unspokenPrefix =
    truncationInfo.unspokenText.length > 200
      ? truncationInfo.unspokenText.slice(0, 200) + "..."
      : truncationInfo.unspokenText;

  return (
    `Continue from where you were interrupted. ` +
    `You had said: "${spokenSuffix}" ` +
    `and were about to say: "${unspokenPrefix}"`
  );
}

// =============================================================================
// Export Types
// =============================================================================

export type UseGracefulTruncationReturn = ReturnType<typeof useGracefulTruncation>;
