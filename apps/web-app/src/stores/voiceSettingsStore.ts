/**
 * Voice Mode Settings Store
 * Manages voice mode preferences with localStorage persistence
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Available OpenAI Realtime API voices
export const AVAILABLE_VOICES = [
  { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
  { id: "echo", name: "Echo", description: "Warm and conversational" },
  { id: "fable", name: "Fable", description: "Expressive and dynamic" },
  { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
  { id: "nova", name: "Nova", description: "Energetic and youthful" },
  { id: "shimmer", name: "Shimmer", description: "Soft and gentle" },
] as const;

export type VoiceId = (typeof AVAILABLE_VOICES)[number]["id"];

// Supported languages (can be extended in future)
export const AVAILABLE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
] as const;

export type LanguageCode = (typeof AVAILABLE_LANGUAGES)[number]["code"];

export interface VoiceSettings {
  // Voice configuration
  voice: VoiceId;
  language: LanguageCode;

  // VAD (Voice Activity Detection) sensitivity
  // 0 = very sensitive (detects faint speech)
  // 100 = less sensitive (requires loud/clear speech)
  vadSensitivity: number;

  // Auto-start voice mode when navigating to /chat?mode=voice
  autoStartOnOpen: boolean;

  // Show connection status and hints
  showStatusHints: boolean;
}

interface VoiceSettingsState extends VoiceSettings {
  // Actions
  setVoice: (voice: VoiceId) => void;
  setLanguage: (language: LanguageCode) => void;
  setVadSensitivity: (sensitivity: number) => void;
  setAutoStartOnOpen: (autoStart: boolean) => void;
  setShowStatusHints: (show: boolean) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  voice: "alloy",
  language: "en",
  vadSensitivity: 50, // Medium sensitivity (0-100 scale)
  autoStartOnOpen: false, // Manual start by default
  showStatusHints: true, // Show helpful hints
};

export const useVoiceSettingsStore = create<VoiceSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setVoice: (voice) =>
        set({
          voice,
        }),

      setLanguage: (language) =>
        set({
          language,
        }),

      setVadSensitivity: (vadSensitivity) =>
        set({
          vadSensitivity: Math.max(0, Math.min(100, vadSensitivity)),
        }),

      setAutoStartOnOpen: (autoStartOnOpen) =>
        set({
          autoStartOnOpen,
        }),

      setShowStatusHints: (showStatusHints) =>
        set({
          showStatusHints,
        }),

      reset: () =>
        set({
          ...DEFAULT_SETTINGS,
        }),
    }),
    {
      name: "voiceassist-voice-settings",
      // Persist all settings
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
