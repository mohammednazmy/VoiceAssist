/**
 * Voice Mode Accessibility Hook for Voice Mode v4
 *
 * Phase 3 Deliverable: Accessibility > WCAG 2.1 AA compliance
 *
 * Provides:
 * - Screen reader announcements for voice state changes
 * - Keyboard navigation support
 * - Reduced motion preferences
 * - Focus management
 * - Haptic feedback (mobile)
 *
 * @example
 * ```tsx
 * const {
 *   announce,
 *   announceVoiceState,
 *   focusOnInput,
 *   prefersReducedMotion,
 *   supportsHaptics,
 *   triggerHaptic,
 * } = useVoiceAccessibility();
 *
 * // Announce voice state change
 * announceVoiceState('listening');
 *
 * // Announce custom message
 * announce('Message sent successfully', 'polite');
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice states for announcements
 */
export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error"
  | "connecting"
  | "disconnected";

/**
 * ARIA live region politeness
 */
export type AnnounceMode = "polite" | "assertive" | "off";

/**
 * Haptic feedback patterns
 */
export type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "selection";

/**
 * Voice state announcement messages
 */
const VOICE_STATE_MESSAGES: Record<VoiceState, string> = {
  idle: "Voice mode is ready",
  listening: "Listening for your voice",
  processing: "Processing your speech",
  thinking: "Generating response",
  speaking: "Speaking response",
  error: "An error occurred with voice mode",
  connecting: "Connecting to voice service",
  disconnected: "Voice service disconnected",
};

/**
 * Haptic patterns for Vibration API
 */
const HAPTIC_PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [20],
  heavy: [30],
  success: [10, 50, 10],
  warning: [20, 30, 20],
  error: [30, 50, 30, 50, 30],
  selection: [5],
};

/**
 * Options for useVoiceAccessibility hook
 */
export interface VoiceAccessibilityOptions {
  /** Enable haptic feedback */
  enableHaptics?: boolean;
  /** Enable screen reader announcements */
  enableAnnouncements?: boolean;
  /** Default announcement mode */
  defaultAnnounceMode?: AnnounceMode;
  /** Delay between announcements to prevent overlap (ms) */
  announceDebounceMs?: number;
}

/**
 * Return type for useVoiceAccessibility hook
 */
export interface VoiceAccessibilityReturn {
  /** Announce a message to screen readers */
  announce: (message: string, mode?: AnnounceMode) => void;
  /** Announce voice state change */
  announceVoiceState: (state: VoiceState, customMessage?: string) => void;
  /** Announce error with details */
  announceError: (error: string) => void;
  /** Focus management */
  focusOnInput: () => void;
  focusOnVoiceButton: () => void;
  trapFocus: (containerRef: React.RefObject<HTMLElement>) => () => void;
  /** Motion preferences */
  prefersReducedMotion: boolean;
  /** Haptic support */
  supportsHaptics: boolean;
  triggerHaptic: (pattern: HapticPattern) => void;
  /** Keyboard shortcuts */
  registerShortcut: (
    key: string,
    callback: () => void,
    description: string,
  ) => () => void;
  getRegisteredShortcuts: () => Array<{ key: string; description: string }>;
  /** Live region ref for custom announcements */
  liveRegionRef: React.RefObject<HTMLDivElement>;
}

/**
 * Voice Mode Accessibility Hook
 *
 * Provides comprehensive accessibility support for voice mode features.
 */
export function useVoiceAccessibility(
  options: VoiceAccessibilityOptions = {},
): VoiceAccessibilityReturn {
  const {
    enableHaptics = true,
    enableAnnouncements = true,
    defaultAnnounceMode = "polite",
    announceDebounceMs = 500,
  } = options;

  // Refs
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLElement | null>(null);
  const voiceButtonRef = useRef<HTMLElement | null>(null);
  const lastAnnounceTime = useRef<number>(0);

  // State
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [supportsHaptics, setSupportsHaptics] = useState(false);
  const [shortcuts, setShortcuts] = useState<
    Map<string, { callback: () => void; description: string }>
  >(new Map());

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Check haptic support
  useEffect(() => {
    setSupportsHaptics(
      typeof navigator !== "undefined" &&
        "vibrate" in navigator &&
        enableHaptics,
    );
  }, [enableHaptics]);

  // Create live region on mount
  useEffect(() => {
    if (!enableAnnouncements) return;

    // Check if live region already exists
    let existingRegion = document.getElementById(
      "voice-accessibility-live-region",
    );

    if (!existingRegion) {
      // Create a visually hidden live region
      const region = document.createElement("div");
      region.id = "voice-accessibility-live-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      region.setAttribute("role", "status");
      region.className = "sr-only";
      region.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(region);
      existingRegion = region;
    }

    if (liveRegionRef.current === null) {
      (liveRegionRef as any).current = existingRegion;
    }

    return () => {
      // Don't remove on cleanup - other components may use it
    };
  }, [enableAnnouncements]);

  /**
   * Announce a message to screen readers
   */
  const announce = useCallback(
    (message: string, mode: AnnounceMode = defaultAnnounceMode) => {
      if (!enableAnnouncements || mode === "off") return;

      // Debounce rapid announcements
      const now = Date.now();
      if (now - lastAnnounceTime.current < announceDebounceMs) {
        return;
      }
      lastAnnounceTime.current = now;

      const region = document.getElementById("voice-accessibility-live-region");
      if (region) {
        region.setAttribute("aria-live", mode);
        // Clear and set to trigger announcement
        region.textContent = "";
        requestAnimationFrame(() => {
          region.textContent = message;
        });
      }
    },
    [enableAnnouncements, defaultAnnounceMode, announceDebounceMs],
  );

  /**
   * Announce voice state change
   */
  const announceVoiceState = useCallback(
    (state: VoiceState, customMessage?: string) => {
      const message = customMessage || VOICE_STATE_MESSAGES[state];
      const mode: AnnounceMode = state === "error" ? "assertive" : "polite";
      announce(message, mode);
    },
    [announce],
  );

  /**
   * Announce error with assertive mode
   */
  const announceError = useCallback(
    (error: string) => {
      announce(`Error: ${error}`, "assertive");
    },
    [announce],
  );

  /**
   * Focus on input element
   */
  const focusOnInput = useCallback(() => {
    const input = document.querySelector<HTMLElement>(
      '[data-testid="chat-input"], [data-testid="voice-input"], textarea[placeholder*="message"], input[type="text"]',
    );
    if (input) {
      input.focus();
      inputRef.current = input;
    }
  }, []);

  /**
   * Focus on voice button
   */
  const focusOnVoiceButton = useCallback(() => {
    const button = document.querySelector<HTMLElement>(
      '[data-testid="voice-button"], [aria-label*="voice"], button[aria-label*="microphone"]',
    );
    if (button) {
      button.focus();
      voiceButtonRef.current = button;
    }
  }, []);

  /**
   * Trap focus within a container (for modals, dialogs)
   */
  const trapFocus = useCallback(
    (containerRef: React.RefObject<HTMLElement>) => {
      const container = containerRef.current;
      if (!container) return () => {};

      const focusableSelector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const focusableElements =
        container.querySelectorAll<HTMLElement>(focusableSelector);
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;

        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable?.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable?.focus();
          }
        }
      };

      container.addEventListener("keydown", handleKeyDown);
      firstFocusable?.focus();

      return () => {
        container.removeEventListener("keydown", handleKeyDown);
      };
    },
    [],
  );

  /**
   * Trigger haptic feedback
   */
  const triggerHaptic = useCallback(
    (pattern: HapticPattern) => {
      if (!supportsHaptics || !enableHaptics) return;

      try {
        const vibrationPattern = HAPTIC_PATTERNS[pattern];
        navigator.vibrate(vibrationPattern);
      } catch (error) {
        // Ignore haptic errors
      }
    },
    [supportsHaptics, enableHaptics],
  );

  /**
   * Register a keyboard shortcut
   */
  const registerShortcut = useCallback(
    (key: string, callback: () => void, description: string) => {
      const normalizedKey = key.toLowerCase();

      setShortcuts((prev) => {
        const next = new Map(prev);
        next.set(normalizedKey, { callback, description });
        return next;
      });

      // Return cleanup function
      return () => {
        setShortcuts((prev) => {
          const next = new Map(prev);
          next.delete(normalizedKey);
          return next;
        });
      };
    },
    [],
  );

  /**
   * Get all registered shortcuts
   */
  const getRegisteredShortcuts = useCallback(() => {
    return Array.from(shortcuts.entries()).map(([key, { description }]) => ({
      key,
      description,
    }));
  }, [shortcuts]);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Build key string
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("cmd");
      if (e.shiftKey) parts.push("shift");
      if (e.altKey) parts.push("alt");
      parts.push(e.key.toLowerCase());

      const keyString = parts.join("+");

      const shortcut = shortcuts.get(keyString);
      if (shortcut) {
        e.preventDefault();
        shortcut.callback();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);

  return {
    announce,
    announceVoiceState,
    announceError,
    focusOnInput,
    focusOnVoiceButton,
    trapFocus,
    prefersReducedMotion,
    supportsHaptics,
    triggerHaptic,
    registerShortcut,
    getRegisteredShortcuts,
    liveRegionRef,
  };
}

/**
 * Context provider for voice accessibility
 */
export { useVoiceAccessibility as default };
