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
  | "shimmer"
  | string; // Allow ElevenLabs voice IDs

export type TTSProvider = "openai" | "elevenlabs";

export type LanguageOption = "en" | "es" | "fr" | "de" | "it" | "pt";

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

/**
 * Voice quality presets for latency vs naturalness trade-off
 * - speed: Fastest response (~100-150ms TTFA), may sound slightly choppy
 * - balanced: Good balance (~200-250ms TTFA), natural after first chunk (default)
 * - natural: Most natural sounding (~300-400ms TTFA), full sentences always
 */
export type QualityPreset = "speed" | "balanced" | "natural";

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

/**
 * Quality preset options for voice mode
 */
export const QUALITY_PRESET_OPTIONS: {
  value: QualityPreset;
  label: string;
  description: string;
}[] = [
  {
    value: "speed",
    label: "Speed",
    description: "Fastest response time, best for quick interactions",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Good balance of speed and natural speech (recommended)",
  },
  {
    value: "natural",
    label: "Natural",
    description: "Most natural sounding speech, slightly slower response",
  },
];

/**
 * ElevenLabs voice options for T/T voice mode
 */
export interface ElevenLabsVoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  premium: boolean;
}

export const ELEVENLABS_VOICE_OPTIONS: ElevenLabsVoiceOption[] = [
  // Premium Voices (Recommended)
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", premium: true },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", premium: true },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    gender: "female",
    premium: true,
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    premium: true,
  },
  // Standard Voices
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    gender: "male",
    premium: false,
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    gender: "female",
    premium: false,
  },
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
  // Adaptive VAD settings (Phase 11)
  silenceDurationMs: number | null; // 200-800ms, null = adaptive
  adaptiveVad: boolean; // Enable adaptive VAD based on speech patterns
  lastLearnedSilenceMs: number | null; // Last value learned from backend
  // Phase 11: TTS Provider selection
  ttsProvider: TTSProvider; // "openai" | "elevenlabs"
  elevenlabsVoiceId: string | null; // Selected ElevenLabs voice ID
  // Voice Mode Overhaul: Advanced TTS settings
  stability: number; // 0-1: ElevenLabs voice stability
  similarityBoost: number; // 0-1: ElevenLabs voice similarity
  style: number; // 0-1: ElevenLabs style/emotion
  speakerBoost: boolean; // ElevenLabs clarity enhancement
  contextAwareStyle: boolean; // Auto-adjust TTS based on content
  // Backend sync state
  backendPrefsId: string | null; // ID from backend for updates
  lastSyncedAt: number | null; // Timestamp of last backend sync
  // Voice quality preset (Phase: Talker Enhancement)
  qualityPreset: QualityPreset; // Controls latency vs naturalness trade-off

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
  // Adaptive VAD actions
  setSilenceDurationMs: (ms: number | null) => void;
  setAdaptiveVad: (enabled: boolean) => void;
  setLastLearnedSilenceMs: (ms: number | null) => void;
  // Phase 11: TTS Provider actions
  setTtsProvider: (provider: TTSProvider) => void;
  setElevenlabsVoiceId: (voiceId: string | null) => void;
  // Voice Mode Overhaul: Advanced TTS actions
  setStability: (stability: number) => void;
  setSimilarityBoost: (similarity: number) => void;
  setStyle: (style: number) => void;
  setSpeakerBoost: (enabled: boolean) => void;
  setContextAwareStyle: (enabled: boolean) => void;
  setBackendPrefsId: (id: string | null) => void;
  setLastSyncedAt: (timestamp: number | null) => void;
  // Voice quality preset action (Phase: Talker Enhancement)
  setQualityPreset: (preset: QualityPreset) => void;
  // Bulk update from backend
  syncFromBackend: (prefs: BackendVoicePreferences) => void;
  reset: () => void;
}

// Backend voice preferences response shape
export interface BackendVoicePreferences {
  id: string;
  user_id: string;
  tts_provider: TTSProvider;
  openai_voice_id: string;
  elevenlabs_voice_id: string | null;
  speech_rate: number;
  stability: number;
  similarity_boost: number;
  style: number;
  speaker_boost: boolean;
  auto_play: boolean;
  context_aware_style: boolean;
  preferred_language: string;
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
  // Adaptive VAD settings (Phase 11)
  silenceDurationMs: null as number | null, // null = use adaptive
  adaptiveVad: true, // Enable adaptive VAD by default
  lastLearnedSilenceMs: null as number | null,
  // Phase 11: TTS Provider settings
  ttsProvider: "elevenlabs" as TTSProvider, // Default to ElevenLabs for natural voice
  elevenlabsVoiceId: "TxGEqnHWrfWFTfGW9XjX" as string | null, // Josh (premium male voice)
  // Voice Mode Overhaul: Advanced TTS settings (tuned for naturalness)
  stability: 0.65, // Balanced stability for natural variation
  similarityBoost: 0.8, // High clarity and voice identity
  style: 0.15, // Subtle expressiveness without being theatrical
  speakerBoost: true, // ElevenLabs clarity
  contextAwareStyle: true, // Auto-adjust based on content
  // Backend sync state
  backendPrefsId: null as string | null,
  lastSyncedAt: null as number | null,
  // Voice quality preset (Phase: Talker Enhancement)
  qualityPreset: "balanced" as QualityPreset, // Default: balanced for speed + naturalness
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

      // Adaptive VAD actions (Phase 11)
      setSilenceDurationMs: (silenceDurationMs) =>
        set({
          silenceDurationMs:
            silenceDurationMs !== null
              ? clamp(silenceDurationMs, 200, 800)
              : null,
        }),

      setAdaptiveVad: (adaptiveVad) => set({ adaptiveVad }),

      setLastLearnedSilenceMs: (lastLearnedSilenceMs) =>
        set({ lastLearnedSilenceMs }),

      // Phase 11: TTS Provider actions
      setTtsProvider: (ttsProvider) => set({ ttsProvider }),

      setElevenlabsVoiceId: (elevenlabsVoiceId) => set({ elevenlabsVoiceId }),

      // Voice Mode Overhaul: Advanced TTS actions
      setStability: (stability) => set({ stability: clamp(stability, 0, 1) }),

      setSimilarityBoost: (similarityBoost) =>
        set({ similarityBoost: clamp(similarityBoost, 0, 1) }),

      setStyle: (style) => set({ style: clamp(style, 0, 1) }),

      setSpeakerBoost: (speakerBoost) => set({ speakerBoost }),

      setContextAwareStyle: (contextAwareStyle) => set({ contextAwareStyle }),

      setBackendPrefsId: (backendPrefsId) => set({ backendPrefsId }),

      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),

      // Voice quality preset action (Phase: Talker Enhancement)
      setQualityPreset: (qualityPreset) => set({ qualityPreset }),

      // Bulk update from backend preferences
      syncFromBackend: (prefs) =>
        set({
          ttsProvider: prefs.tts_provider,
          voice: prefs.openai_voice_id as VoiceOption,
          elevenlabsVoiceId: prefs.elevenlabs_voice_id,
          playbackSpeed: prefs.speech_rate as PlaybackSpeed,
          stability: prefs.stability,
          similarityBoost: prefs.similarity_boost,
          style: prefs.style,
          speakerBoost: prefs.speaker_boost,
          autoPlayInVoiceMode: prefs.auto_play,
          contextAwareStyle: prefs.context_aware_style,
          language: prefs.preferred_language as LanguageOption,
          backendPrefsId: prefs.id,
          lastSyncedAt: Date.now(),
        }),

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
        // Adaptive VAD settings (Phase 11)
        silenceDurationMs: state.silenceDurationMs,
        adaptiveVad: state.adaptiveVad,
        lastLearnedSilenceMs: state.lastLearnedSilenceMs,
        // Phase 11: TTS Provider settings
        ttsProvider: state.ttsProvider,
        elevenlabsVoiceId: state.elevenlabsVoiceId,
        // Voice Mode Overhaul: Advanced TTS settings
        stability: state.stability,
        similarityBoost: state.similarityBoost,
        style: state.style,
        speakerBoost: state.speakerBoost,
        contextAwareStyle: state.contextAwareStyle,
        backendPrefsId: state.backendPrefsId,
        lastSyncedAt: state.lastSyncedAt,
        // Voice quality preset (Phase: Talker Enhancement)
        qualityPreset: state.qualityPreset,
      }),
    },
  ),
);
