/**
 * Voice Mode Keyboard Shortcuts Hook
 * Enables keyboard control for voice recording
 *
 * Phase 9.3: Enhanced Voice Features
 */

import { useEffect, useCallback, useRef } from "react";

export interface VoiceKeyboardShortcutsConfig {
  /** Enable keyboard shortcuts */
  enabled?: boolean;
  /** Key to toggle recording (default: Space) */
  toggleKey?: string;
  /** Key to cancel recording (default: Escape) */
  cancelKey?: string;
  /** Require modifier key (e.g., Ctrl, Alt) */
  requireModifier?: "ctrl" | "alt" | "meta" | null;
  /** Prevent default behavior for shortcut keys */
  preventDefault?: boolean;
}

export interface VoiceKeyboardShortcutsCallbacks {
  /** Called when toggle key is pressed */
  onToggle?: () => void;
  /** Called when cancel key is pressed */
  onCancel?: () => void;
  /** Called when any shortcut is triggered */
  onShortcut?: (action: "toggle" | "cancel") => void;
}

const DEFAULT_CONFIG: VoiceKeyboardShortcutsConfig = {
  enabled: true,
  toggleKey: " ", // Space
  cancelKey: "Escape",
  requireModifier: null,
  preventDefault: true,
};

/**
 * Hook to manage keyboard shortcuts for voice control
 */
export function useVoiceKeyboardShortcuts(
  callbacks: VoiceKeyboardShortcutsCallbacks,
  config: VoiceKeyboardShortcutsConfig = {},
): {
  isActive: boolean;
  shortcuts: Array<{ key: string; description: string }>;
} {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const checkModifier = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!mergedConfig.requireModifier) return true;

      switch (mergedConfig.requireModifier) {
        case "ctrl":
          return event.ctrlKey;
        case "alt":
          return event.altKey;
        case "meta":
          return event.metaKey;
        default:
          return true;
      }
    },
    [mergedConfig.requireModifier],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!mergedConfig.enabled) return;

      // Don't trigger shortcuts if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputField) return;

      // Check modifier key requirement
      if (!checkModifier(event)) return;

      // Handle toggle key (Space)
      if (event.key === mergedConfig.toggleKey) {
        if (mergedConfig.preventDefault) {
          event.preventDefault();
        }
        callbacksRef.current.onToggle?.();
        callbacksRef.current.onShortcut?.("toggle");
        return;
      }

      // Handle cancel key (Escape)
      if (event.key === mergedConfig.cancelKey) {
        if (mergedConfig.preventDefault) {
          event.preventDefault();
        }
        callbacksRef.current.onCancel?.();
        callbacksRef.current.onShortcut?.("cancel");
        return;
      }
    },
    [
      mergedConfig.enabled,
      mergedConfig.toggleKey,
      mergedConfig.cancelKey,
      mergedConfig.preventDefault,
      checkModifier,
    ],
  );

  // Register keyboard event listeners
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mergedConfig.enabled, handleKeyDown]);

  // Build shortcuts description for UI
  const shortcuts = [];
  if (mergedConfig.enabled) {
    const modifierPrefix = mergedConfig.requireModifier
      ? `${mergedConfig.requireModifier.charAt(0).toUpperCase() + mergedConfig.requireModifier.slice(1)}+`
      : "";

    shortcuts.push({
      key: `${modifierPrefix}${mergedConfig.toggleKey === " " ? "Space" : mergedConfig.toggleKey}`,
      description: "Toggle recording",
    });

    shortcuts.push({
      key: `${modifierPrefix}${mergedConfig.cancelKey}`,
      description: "Cancel recording",
    });
  }

  return {
    isActive: mergedConfig.enabled ?? false,
    shortcuts,
  };
}
