/**
 * Voice Settings Store
 * Manages user preferences for Voice Mode including voice selection,
 * language, VAD sensitivity, and behavior settings.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VoiceOption =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

export type LanguageOption = "en" | "es" | "fr" | "de" | "it" | "pt";

export const VOICE_OPTIONS: { value: VoiceOption; label: string }[] = [
  { value: "alloy", label: "Alloy" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "onyx", label: "Onyx" },
  { value: "nova", label: "Nova" },
  { value: "shimmer", label: "Shimmer" },
];

export const LANGUAGE_OPTIONS: { value: LanguageOption; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
];

interface VoiceSettingsState {
  // Settings
  voice: VoiceOption;
  language: LanguageOption;
  vadSensitivity: number; // 0-100
  autoStartOnOpen: boolean;
  showStatusHints: boolean;

  // Actions
  setVoice: (voice: VoiceOption) => void;
  setLanguage: (language: LanguageOption) => void;
  setVadSensitivity: (sensitivity: number) => void;
  setAutoStartOnOpen: (autoStart: boolean) => void;
  setShowStatusHints: (showHints: boolean) => void;
  reset: () => void;
}

const defaultSettings = {
  voice: "alloy" as VoiceOption,
  language: "en" as LanguageOption,
  vadSensitivity: 50,
  autoStartOnOpen: false,
  showStatusHints: true,
};

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const useVoiceSettingsStore = create<VoiceSettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setVoice: (voice) => set({ voice }),

      setLanguage: (language) => set({ language }),

      setVadSensitivity: (sensitivity) =>
        set({ vadSensitivity: clamp(sensitivity, 0, 100) }),

      setAutoStartOnOpen: (autoStartOnOpen) => set({ autoStartOnOpen }),

      setShowStatusHints: (showStatusHints) => set({ showStatusHints }),

      reset: () => set({ ...defaultSettings }),
    }),
    {
      name: "voiceassist-voice-settings",
      partialize: (state) => ({
        voice: state.voice,
        language: state.language,
        vadSensitivity: state.vadSensitivity,
        autoStartOnOpen: state.autoStartOnOpen,
        showStatusHints: state.showStatusHints,
      }),
    },
  ),
);
