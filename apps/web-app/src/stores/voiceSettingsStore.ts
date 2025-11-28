/**
 * Voice Settings Store
 * Manages user preferences for Voice Mode including voice selection,
 * language, VAD sensitivity, and behavior settings.
 *
 * Phase 9.3: Added audio device, playback speed, and keyboard shortcuts
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

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

/**
 * Voice mode interaction type for unified interface
 */
export type VoiceModeType = "always-on" | "push-to-talk";

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

export const PLAYBACK_SPEED_OPTIONS: {
  value: PlaybackSpeed;
  label: string;
}[] = [
  { value: 0.5, label: "0.5x (Slow)" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x (Normal)" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x (Fast)" },
];

interface VoiceSettingsState {
  // Settings
  voice: VoiceOption;
  language: LanguageOption;
  vadSensitivity: number; // 0-100
  autoStartOnOpen: boolean;
  showStatusHints: boolean;
  // Phase 9.3 additions
  selectedAudioDeviceId: string | null;
  playbackSpeed: PlaybackSpeed;
  keyboardShortcutsEnabled: boolean;
  showFrequencySpectrum: boolean;
  // Unified UI additions
  voiceModeType: VoiceModeType;
  autoPlayInVoiceMode: boolean;

  // Actions
  setVoice: (voice: VoiceOption) => void;
  setLanguage: (language: LanguageOption) => void;
  setVadSensitivity: (sensitivity: number) => void;
  setAutoStartOnOpen: (autoStart: boolean) => void;
  setShowStatusHints: (showHints: boolean) => void;
  // Phase 9.3 additions
  setSelectedAudioDeviceId: (deviceId: string | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;
  setShowFrequencySpectrum: (show: boolean) => void;
  // Unified UI additions
  setVoiceModeType: (type: VoiceModeType) => void;
  setAutoPlayInVoiceMode: (enabled: boolean) => void;
  reset: () => void;
}

const defaultSettings = {
  voice: "alloy" as VoiceOption,
  language: "en" as LanguageOption,
  vadSensitivity: 50,
  autoStartOnOpen: false,
  showStatusHints: true,
  // Phase 9.3 additions
  selectedAudioDeviceId: null as string | null,
  playbackSpeed: 1 as PlaybackSpeed,
  keyboardShortcutsEnabled: true,
  showFrequencySpectrum: false,
  // Unified UI additions
  voiceModeType: "push-to-talk" as VoiceModeType,
  autoPlayInVoiceMode: true,
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

      // Phase 9.3 additions
      setSelectedAudioDeviceId: (selectedAudioDeviceId) =>
        set({ selectedAudioDeviceId }),

      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

      setKeyboardShortcutsEnabled: (keyboardShortcutsEnabled) =>
        set({ keyboardShortcutsEnabled }),

      setShowFrequencySpectrum: (showFrequencySpectrum) =>
        set({ showFrequencySpectrum }),

      // Unified UI additions
      setVoiceModeType: (voiceModeType) => set({ voiceModeType }),

      setAutoPlayInVoiceMode: (autoPlayInVoiceMode) =>
        set({ autoPlayInVoiceMode }),

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
        // Phase 9.3 additions
        selectedAudioDeviceId: state.selectedAudioDeviceId,
        playbackSpeed: state.playbackSpeed,
        keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
        showFrequencySpectrum: state.showFrequencySpectrum,
        // Unified UI additions
        voiceModeType: state.voiceModeType,
        autoPlayInVoiceMode: state.autoPlayInVoiceMode,
      }),
    },
  ),
);
