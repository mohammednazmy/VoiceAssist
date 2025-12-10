/**
 * useHapticFeedback Hook
 *
 * Provides haptic feedback for mobile devices during voice interactions.
 * Supports different vibration patterns for various barge-in events.
 *
 * Phase 2: Instant Response & Feedback
 */

import { useCallback, useEffect, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Intensity level for haptic feedback
 */
export type HapticIntensity = "light" | "medium" | "strong";

/**
 * Types of haptic events
 */
export type HapticType =
  | "bargeInDetected"
  | "bargeInConfirmed"
  | "backchannel"
  | "softBarge"
  | "hardBarge"
  | "speechStart"
  | "speechEnd"
  | "error"
  | "calibrationStart"
  | "calibrationComplete"
  | "toolCallStart"
  | "toolCallComplete";

/**
 * Return type for the hook
 */
export interface UseHapticFeedbackReturn {
  /** Whether the device supports haptic feedback */
  isSupported: boolean;

  /** Trigger a haptic feedback pattern */
  triggerHaptic: (type: HapticType, intensity?: HapticIntensity) => void;

  /** Stop any ongoing haptic feedback */
  stopHaptic: () => void;

  /** Trigger a custom vibration pattern */
  vibratePattern: (pattern: number | number[]) => boolean;
}

// ============================================================================
// Haptic Patterns
// ============================================================================

/**
 * Predefined vibration patterns for each event type and intensity
 * Patterns are arrays of [vibrate, pause, vibrate, ...] durations in ms
 */
const HAPTIC_PATTERNS: Record<HapticType, Record<HapticIntensity, number[]>> = {
  // Quick double-tap when speech is first detected
  bargeInDetected: {
    light: [10, 20, 10],
    medium: [15, 30, 15],
    strong: [25, 40, 25],
  },

  // Single strong pulse when barge-in is confirmed
  bargeInConfirmed: {
    light: [25],
    medium: [40],
    strong: [60],
  },

  // Very subtle tap for backchannel acknowledgment
  backchannel: {
    light: [3],
    medium: [5],
    strong: [10],
  },

  // Soft double-tap for pause request
  softBarge: {
    light: [15, 30, 15],
    medium: [25, 50, 25],
    strong: [40, 70, 40],
  },

  // Strong double pulse for hard interruption
  hardBarge: {
    light: [30, 20, 30],
    medium: [50, 30, 50],
    strong: [80, 40, 80],
  },

  // Single light tap when user starts speaking
  speechStart: {
    light: [5],
    medium: [10],
    strong: [15],
  },

  // Single light tap when user stops speaking
  speechEnd: {
    light: [5],
    medium: [8],
    strong: [12],
  },

  // Error pattern - multiple quick vibrations
  error: {
    light: [50, 30, 50, 30, 50],
    medium: [100, 50, 100, 50, 100],
    strong: [150, 70, 150, 70, 150],
  },

  // Calibration start - ascending pattern
  calibrationStart: {
    light: [10, 50, 15, 50, 20],
    medium: [15, 50, 25, 50, 35],
    strong: [25, 50, 40, 50, 55],
  },

  // Calibration complete - success pattern
  calibrationComplete: {
    light: [20, 100, 20],
    medium: [30, 100, 30],
    strong: [50, 100, 50],
  },

  // Tool call start - gentle notification
  toolCallStart: {
    light: [8, 40, 8],
    medium: [12, 50, 12],
    strong: [20, 60, 20],
  },

  // Tool call complete - confirmation
  toolCallComplete: {
    light: [15, 30, 10],
    medium: [25, 40, 15],
    strong: [40, 50, 25],
  },
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for haptic feedback on mobile devices
 *
 * @returns Object with haptic feedback functions
 */
export function useHapticFeedback(): UseHapticFeedbackReturn {
  const isSupported = useRef(false);

  // Check for vibration API support on mount
  useEffect(() => {
    isSupported.current =
      typeof navigator !== "undefined" && "vibrate" in navigator;
  }, []);

  /**
   * Trigger a vibration pattern
   */
  const vibratePattern = useCallback((pattern: number | number[]): boolean => {
    if (!isSupported.current) return false;

    try {
      navigator.vibrate(pattern);
      return true;
    } catch (error) {
      console.warn("[useHapticFeedback] Vibration failed:", error);
      return false;
    }
  }, []);

  /**
   * Trigger a predefined haptic pattern
   */
  const triggerHaptic = useCallback(
    (type: HapticType, intensity: HapticIntensity = "medium") => {
      const pattern = HAPTIC_PATTERNS[type]?.[intensity];
      if (pattern) {
        vibratePattern(pattern);
      }
    },
    [vibratePattern],
  );

  /**
   * Stop any ongoing haptic feedback
   */
  const stopHaptic = useCallback(() => {
    if (isSupported.current) {
      try {
        navigator.vibrate(0);
      } catch (error) {
        console.warn("[useHapticFeedback] Stop vibration failed:", error);
      }
    }
  }, []);

  return {
    isSupported: isSupported.current,
    triggerHaptic,
    stopHaptic,
    vibratePattern,
  };
}
