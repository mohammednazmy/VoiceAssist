/**
 * Feedback Preferences Store
 *
 * Zustand store for persisting user feedback preferences.
 * Syncs with localStorage and supports real-time updates.
 *
 * Phase 2: Instant Response & Feedback
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  FeedbackPreferences,
  HapticIntensity,
  VisualFeedbackStyle,
  AudioFeedbackType,
} from "../hooks/useIntelligentBargeIn/types";

// ============================================================================
// Default Preferences
// ============================================================================

export const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  // Visual
  visualFeedbackEnabled: true,
  visualFeedbackStyle: "pulse",

  // Haptic
  hapticFeedbackEnabled: true,
  hapticIntensity: "medium",

  // Audio
  audioFeedbackEnabled: false, // Off by default to avoid annoyance
  audioFeedbackType: "tone",
  audioFeedbackVolume: 0.3,

  // Voice prompts
  voicePromptAfterHardBarge: true,
  voicePromptText: undefined, // Use language-specific default
};

// ============================================================================
// Store Interface
// ============================================================================

interface FeedbackPreferencesState {
  /** Current feedback preferences */
  preferences: FeedbackPreferences;

  /** Whether preferences have been loaded from storage */
  isHydrated: boolean;

  // Visual feedback actions
  setVisualFeedbackEnabled: (enabled: boolean) => void;
  setVisualFeedbackStyle: (style: VisualFeedbackStyle) => void;

  // Haptic feedback actions
  setHapticFeedbackEnabled: (enabled: boolean) => void;
  setHapticIntensity: (intensity: HapticIntensity) => void;

  // Audio feedback actions
  setAudioFeedbackEnabled: (enabled: boolean) => void;
  setAudioFeedbackType: (type: AudioFeedbackType) => void;
  setAudioFeedbackVolume: (volume: number) => void;

  // Voice prompt actions
  setVoicePromptAfterHardBarge: (enabled: boolean) => void;
  setVoicePromptText: (text: string | undefined) => void;

  // Bulk actions
  updatePreferences: (partial: Partial<FeedbackPreferences>) => void;
  resetToDefaults: () => void;

  // Presets
  applyPreset: (preset: FeedbackPreset) => void;
}

// ============================================================================
// Presets
// ============================================================================

export type FeedbackPreset =
  | "silent"
  | "minimal"
  | "standard"
  | "full"
  | "accessibility";

const PRESETS: Record<FeedbackPreset, Partial<FeedbackPreferences>> = {
  // No feedback at all
  silent: {
    visualFeedbackEnabled: false,
    hapticFeedbackEnabled: false,
    audioFeedbackEnabled: false,
  },

  // Just a subtle visual indicator
  minimal: {
    visualFeedbackEnabled: true,
    visualFeedbackStyle: "minimal",
    hapticFeedbackEnabled: false,
    audioFeedbackEnabled: false,
  },

  // Visual + light haptic
  standard: {
    visualFeedbackEnabled: true,
    visualFeedbackStyle: "pulse",
    hapticFeedbackEnabled: true,
    hapticIntensity: "medium",
    audioFeedbackEnabled: false,
  },

  // All feedback enabled
  full: {
    visualFeedbackEnabled: true,
    visualFeedbackStyle: "pulse",
    hapticFeedbackEnabled: true,
    hapticIntensity: "strong",
    audioFeedbackEnabled: true,
    audioFeedbackType: "tone",
    voicePromptAfterHardBarge: true,
  },

  // Optimized for accessibility
  accessibility: {
    visualFeedbackEnabled: true,
    visualFeedbackStyle: "border",
    hapticFeedbackEnabled: true,
    hapticIntensity: "strong",
    audioFeedbackEnabled: true,
    audioFeedbackType: "voice",
    voicePromptAfterHardBarge: true,
  },
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useFeedbackPreferencesStore = create<FeedbackPreferencesState>()(
  persist(
    (set, get) => ({
      preferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
      isHydrated: false,

      // Visual feedback
      setVisualFeedbackEnabled: (enabled) =>
        set((state) => ({
          preferences: { ...state.preferences, visualFeedbackEnabled: enabled },
        })),

      setVisualFeedbackStyle: (style) =>
        set((state) => ({
          preferences: { ...state.preferences, visualFeedbackStyle: style },
        })),

      // Haptic feedback
      setHapticFeedbackEnabled: (enabled) =>
        set((state) => ({
          preferences: { ...state.preferences, hapticFeedbackEnabled: enabled },
        })),

      setHapticIntensity: (intensity) =>
        set((state) => ({
          preferences: { ...state.preferences, hapticIntensity: intensity },
        })),

      // Audio feedback
      setAudioFeedbackEnabled: (enabled) =>
        set((state) => ({
          preferences: { ...state.preferences, audioFeedbackEnabled: enabled },
        })),

      setAudioFeedbackType: (type) =>
        set((state) => ({
          preferences: { ...state.preferences, audioFeedbackType: type },
        })),

      setAudioFeedbackVolume: (volume) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            audioFeedbackVolume: Math.max(0, Math.min(1, volume)),
          },
        })),

      // Voice prompts
      setVoicePromptAfterHardBarge: (enabled) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            voicePromptAfterHardBarge: enabled,
          },
        })),

      setVoicePromptText: (text) =>
        set((state) => ({
          preferences: { ...state.preferences, voicePromptText: text },
        })),

      // Bulk update
      updatePreferences: (partial) =>
        set((state) => ({
          preferences: { ...state.preferences, ...partial },
        })),

      // Reset
      resetToDefaults: () =>
        set({
          preferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
        }),

      // Presets
      applyPreset: (preset) => {
        const presetConfig = PRESETS[preset];
        if (presetConfig) {
          set((state) => ({
            preferences: { ...state.preferences, ...presetConfig },
          }));
        }
      },
    }),
    {
      name: "voiceassist-feedback-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        preferences: state.preferences,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
        }
      },
    },
  ),
);

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * Get all feedback preferences
 */
export const useFeedbackPreferences = () =>
  useFeedbackPreferencesStore((state) => state.preferences);

/**
 * Get visual feedback settings
 */
export const useVisualFeedbackSettings = () =>
  useFeedbackPreferencesStore((state) => ({
    enabled: state.preferences.visualFeedbackEnabled,
    style: state.preferences.visualFeedbackStyle,
    setEnabled: state.setVisualFeedbackEnabled,
    setStyle: state.setVisualFeedbackStyle,
  }));

/**
 * Get haptic feedback settings
 */
export const useHapticFeedbackSettings = () =>
  useFeedbackPreferencesStore((state) => ({
    enabled: state.preferences.hapticFeedbackEnabled,
    intensity: state.preferences.hapticIntensity,
    setEnabled: state.setHapticFeedbackEnabled,
    setIntensity: state.setHapticIntensity,
  }));

/**
 * Get audio feedback settings
 */
export const useAudioFeedbackSettings = () =>
  useFeedbackPreferencesStore((state) => ({
    enabled: state.preferences.audioFeedbackEnabled,
    type: state.preferences.audioFeedbackType,
    volume: state.preferences.audioFeedbackVolume,
    setEnabled: state.setAudioFeedbackEnabled,
    setType: state.setAudioFeedbackType,
    setVolume: state.setAudioFeedbackVolume,
  }));

/**
 * Get voice prompt settings
 */
export const useVoicePromptSettings = () =>
  useFeedbackPreferencesStore((state) => ({
    enabledAfterHardBarge: state.preferences.voicePromptAfterHardBarge,
    customText: state.preferences.voicePromptText,
    setEnabledAfterHardBarge: state.setVoicePromptAfterHardBarge,
    setCustomText: state.setVoicePromptText,
  }));

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if any feedback is enabled
 */
export function isAnyFeedbackEnabled(
  preferences: FeedbackPreferences,
): boolean {
  return (
    preferences.visualFeedbackEnabled ||
    preferences.hapticFeedbackEnabled ||
    preferences.audioFeedbackEnabled
  );
}

/**
 * Get a human-readable description of current feedback settings
 */
export function describeFeedbackSettings(
  preferences: FeedbackPreferences,
): string {
  const parts: string[] = [];

  if (preferences.visualFeedbackEnabled) {
    parts.push(`Visual (${preferences.visualFeedbackStyle})`);
  }

  if (preferences.hapticFeedbackEnabled) {
    parts.push(`Haptic (${preferences.hapticIntensity})`);
  }

  if (preferences.audioFeedbackEnabled) {
    parts.push(`Audio (${preferences.audioFeedbackType})`);
  }

  if (parts.length === 0) {
    return "No feedback enabled";
  }

  return parts.join(", ");
}
