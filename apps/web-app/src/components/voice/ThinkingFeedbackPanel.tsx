/**
 * ThinkingFeedbackPanel Component
 * Unified thinking feedback with audio, visual, and haptic options.
 *
 * Part of Voice Mode Enhancement Plan v4.1
 * Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#thinking-tone-ux-improvements
 */

import React, { useEffect, useCallback } from "react";
import { useVoiceSettingsStore } from "@/stores/voiceSettingsStore";
import { useThinkingTone } from "@/hooks/useThinkingTone";
import { ThinkingVisualIndicator } from "./ThinkingVisualIndicator";

interface ThinkingFeedbackPanelProps {
  isThinking: boolean;
  className?: string;
  showLabel?: boolean;
  label?: string;
  isTTSPlaying?: boolean; // Don't clash with TTS audio
  size?: "sm" | "md" | "lg";
  /**
   * Source of thinking feedback (Issue 1: Unified thinking tones).
   * When "backend", frontend audio is disabled to prevent dual tones.
   * Visual and haptic feedback still work regardless of source.
   */
  thinkingSource?: "backend" | "frontend";
}

// Haptic patterns for mobile devices
const HAPTIC_PATTERNS: Record<"gentle" | "rhythmic" | "none", number[]> = {
  gentle: [50], // Single gentle pulse
  rhythmic: [50, 100, 50], // Rhythmic pattern
  none: [],
};

/**
 * Check if device supports haptic feedback
 */
function useHapticSupport(): boolean {
  const [supported, setSupported] = React.useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "vibrate" in navigator);
  }, []);

  return supported;
}

/**
 * Check if we're on a mobile device
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        ) || window.matchMedia("(max-width: 768px)").matches,
      );
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

/**
 * ThinkingFeedbackPanel
 *
 * Provides unified thinking feedback through multiple modalities:
 * - Audio: Configurable tones (gentle beep, soft chime, subtle tick)
 * - Visual: Animated indicators (dots, pulse, spinner, progress)
 * - Haptic: Vibration patterns for mobile devices
 *
 * Respects user preferences and avoids conflicts with TTS playback.
 */
export function ThinkingFeedbackPanel({
  isThinking,
  className = "",
  showLabel = false,
  label = "Thinking...",
  isTTSPlaying = false,
  size = "md",
  thinkingSource = "frontend",
}: ThinkingFeedbackPanelProps) {
  const settings = useVoiceSettingsStore();
  const isMobile = useIsMobile();
  const hapticSupported = useHapticSupport();

  // Determine if frontend audio should play:
  // - User has enabled thinking tones
  // - Not clashing with TTS playback
  // - Currently thinking
  // - Backend is NOT handling thinking feedback (Issue 1: Unified thinking tones)
  const shouldPlayAudio =
    settings.thinkingToneEnabled &&
    !isTTSPlaying &&
    isThinking &&
    thinkingSource !== "backend";

  // Audio feedback using the hook (disabled when backend is handling it)
  useThinkingTone(shouldPlayAudio, {
    preset: settings.thinkingTonePreset,
    volume: settings.thinkingToneVolume / 100, // Normalize to 0-1
  });

  // Haptic feedback for mobile devices
  const triggerHaptic = useCallback(() => {
    if (
      !hapticSupported ||
      !settings.thinkingHapticEnabled ||
      settings.thinkingHapticPattern === "none"
    ) {
      return;
    }

    const pattern = HAPTIC_PATTERNS[settings.thinkingHapticPattern];
    if (pattern.length > 0) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        console.warn("Haptic feedback failed:", error);
      }
    }
  }, [
    hapticSupported,
    settings.thinkingHapticEnabled,
    settings.thinkingHapticPattern,
  ]);

  // Trigger haptic feedback periodically while thinking
  useEffect(() => {
    if (!isThinking || !isMobile || !settings.thinkingHapticEnabled) {
      return;
    }

    // Initial haptic
    triggerHaptic();

    // Periodic haptics every 2 seconds
    const interval = setInterval(triggerHaptic, 2000);

    return () => {
      clearInterval(interval);
      // Stop any ongoing vibration
      if (hapticSupported) {
        try {
          navigator.vibrate(0);
        } catch {
          // Ignore errors
        }
      }
    };
  }, [
    isThinking,
    isMobile,
    settings.thinkingHapticEnabled,
    triggerHaptic,
    hapticSupported,
  ]);

  // Don't render visual if disabled or not thinking
  if (!settings.thinkingVisualEnabled || !isThinking) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <ThinkingVisualIndicator
        style={settings.thinkingVisualStyle}
        size={size}
        color="currentColor"
      />

      {showLabel && (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * ThinkingFeedbackSettings - Settings panel for thinking feedback
 */
interface ThinkingFeedbackSettingsProps {
  className?: string;
}

export function ThinkingFeedbackSettings({
  className = "",
}: ThinkingFeedbackSettingsProps) {
  const settings = useVoiceSettingsStore();
  const isMobile = useIsMobile();

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        Thinking Feedback
      </h3>

      {/* Audio Settings */}
      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            Play sound while thinking
          </span>
          <input
            type="checkbox"
            checked={settings.thinkingToneEnabled}
            onChange={(e) => settings.setThinkingToneEnabled(e.target.checked)}
            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {settings.thinkingToneEnabled && (
          <>
            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                Sound style
              </label>
              <select
                value={settings.thinkingTonePreset}
                onChange={(e) =>
                  settings.setThinkingTonePreset(
                    e.target.value as typeof settings.thinkingTonePreset,
                  )
                }
                className="w-full rounded-md border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              >
                <option value="gentle_beep">Gentle beep</option>
                <option value="soft_chime">Soft chime</option>
                <option value="subtle_tick">Subtle tick</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                Volume: {settings.thinkingToneVolume}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.thinkingToneVolume}
                onChange={(e) =>
                  settings.setThinkingToneVolume(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      {/* Visual Settings */}
      <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
        <label className="flex items-center justify-between">
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            Show visual indicator
          </span>
          <input
            type="checkbox"
            checked={settings.thinkingVisualEnabled}
            onChange={(e) =>
              settings.setThinkingVisualEnabled(e.target.checked)
            }
            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {settings.thinkingVisualEnabled && (
          <div>
            <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              Visual style
            </label>
            <select
              value={settings.thinkingVisualStyle}
              onChange={(e) =>
                settings.setThinkingVisualStyle(
                  e.target.value as typeof settings.thinkingVisualStyle,
                )
              }
              className="w-full rounded-md border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
            >
              <option value="dots">Animated dots</option>
              <option value="pulse">Pulsing circle</option>
              <option value="spinner">Spinner</option>
              <option value="progress">Progress bar</option>
            </select>
          </div>
        )}
      </div>

      {/* Haptic Settings (mobile only) */}
      {isMobile && (
        <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <label className="flex items-center justify-between">
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Vibrate while thinking
            </span>
            <input
              type="checkbox"
              checked={settings.thinkingHapticEnabled}
              onChange={(e) =>
                settings.setThinkingHapticEnabled(e.target.checked)
              }
              className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          {settings.thinkingHapticEnabled && (
            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                Vibration pattern
              </label>
              <select
                value={settings.thinkingHapticPattern}
                onChange={(e) =>
                  settings.setThinkingHapticPattern(
                    e.target.value as typeof settings.thinkingHapticPattern,
                  )
                }
                className="w-full rounded-md border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              >
                <option value="gentle">Gentle pulse</option>
                <option value="rhythmic">Rhythmic</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ThinkingFeedbackPanel;
