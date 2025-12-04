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
  // Conversational Voices (warm, natural tone)
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    gender: "male",
    premium: true,
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    name: "Charlotte",
    gender: "female",
    premium: true,
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    gender: "female",
    premium: true,
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    gender: "male",
    premium: true,
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    gender: "male",
    premium: true,
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    gender: "female",
    premium: true,
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    gender: "male",
    premium: true,
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    gender: "male",
    premium: true,
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
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

  // ============================================================================
  // Phase 7-10: Advanced Voice Barge-In Settings
  // ============================================================================

  // Phase 7: Multilingual settings
  accentProfileId: string | null; // Selected accent profile
  autoLanguageDetection: boolean; // Enable automatic language detection
  languageSwitchConfidence: number; // 0-1: Confidence threshold for auto-switch

  // Phase 8: Personalization/Calibration settings
  vadCalibrated: boolean; // Whether user has completed calibration
  lastCalibrationDate: number | null; // When calibration was completed
  personalizedVadThreshold: number | null; // Personalized VAD threshold from calibration
  enableBehaviorLearning: boolean; // Allow adaptive learning from barge-in patterns

  // Phase 9: Offline mode settings
  enableOfflineFallback: boolean; // Enable offline VAD when network unavailable
  preferOfflineVAD: boolean; // Prefer local VAD processing even when online
  ttsCacheEnabled: boolean; // Cache common TTS phrases for offline playback

  // Phase 10: Conversation management settings
  enableSentimentTracking: boolean; // Track user sentiment during conversation
  enableDiscourseAnalysis: boolean; // Enable discourse/topic tracking
  enableResponseRecommendations: boolean; // Get AI response behavior recommendations
  showSuggestedFollowUps: boolean; // Display suggested follow-up questions

  // Privacy settings
  storeTranscriptHistory: boolean; // Store transcript history locally
  shareAnonymousAnalytics: boolean; // Share anonymous usage data for improvement

  // ============================================================================
  // Voice Mode v4: Thinking Feedback Settings
  // ============================================================================
  thinkingToneEnabled: boolean; // Master toggle for thinking tones
  thinkingTonePreset: "gentle_beep" | "soft_chime" | "subtle_tick" | "none";
  thinkingToneVolume: number; // 0-100
  thinkingToneOnToolCalls: boolean; // Play during tool execution
  thinkingVisualEnabled: boolean; // Show visual indicator
  thinkingVisualStyle: "dots" | "pulse" | "spinner" | "progress";
  thinkingHapticEnabled: boolean; // Enable haptic feedback (mobile)
  thinkingHapticPattern: "gentle" | "rhythmic" | "none";

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

  // ============================================================================
  // Phase 7-10: Advanced Voice Barge-In Actions
  // ============================================================================

  // Phase 7: Multilingual actions
  setAccentProfileId: (id: string | null) => void;
  setAutoLanguageDetection: (enabled: boolean) => void;
  setLanguageSwitchConfidence: (confidence: number) => void;

  // Phase 8: Personalization/Calibration actions
  setVadCalibrated: (calibrated: boolean) => void;
  setLastCalibrationDate: (date: number | null) => void;
  setPersonalizedVadThreshold: (threshold: number | null) => void;
  setEnableBehaviorLearning: (enabled: boolean) => void;

  // Phase 9: Offline mode actions
  setEnableOfflineFallback: (enabled: boolean) => void;
  setPreferOfflineVAD: (enabled: boolean) => void;
  setTtsCacheEnabled: (enabled: boolean) => void;

  // Phase 10: Conversation management actions
  setEnableSentimentTracking: (enabled: boolean) => void;
  setEnableDiscourseAnalysis: (enabled: boolean) => void;
  setEnableResponseRecommendations: (enabled: boolean) => void;
  setShowSuggestedFollowUps: (enabled: boolean) => void;

  // Privacy actions
  setStoreTranscriptHistory: (enabled: boolean) => void;
  setShareAnonymousAnalytics: (enabled: boolean) => void;

  // Voice Mode v4: Thinking Feedback Actions
  setThinkingToneEnabled: (enabled: boolean) => void;
  setThinkingTonePreset: (
    preset: "gentle_beep" | "soft_chime" | "subtle_tick" | "none",
  ) => void;
  setThinkingToneVolume: (volume: number) => void;
  setThinkingToneOnToolCalls: (enabled: boolean) => void;
  setThinkingVisualEnabled: (enabled: boolean) => void;
  setThinkingVisualStyle: (
    style: "dots" | "pulse" | "spinner" | "progress",
  ) => void;
  setThinkingHapticEnabled: (enabled: boolean) => void;
  setThinkingHapticPattern: (pattern: "gentle" | "rhythmic" | "none") => void;
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

  // ============================================================================
  // Phase 7-10: Advanced Voice Barge-In Default Settings
  // ============================================================================

  // Phase 7: Multilingual defaults
  accentProfileId: null as string | null,
  autoLanguageDetection: true, // Enable auto-detection by default
  languageSwitchConfidence: 0.75, // 75% confidence required to switch

  // Phase 8: Personalization/Calibration defaults
  vadCalibrated: false,
  lastCalibrationDate: null as number | null,
  personalizedVadThreshold: null as number | null,
  enableBehaviorLearning: true, // Allow learning by default

  // Phase 9: Offline mode defaults
  enableOfflineFallback: true, // Enable fallback for reliability
  preferOfflineVAD: false, // Use network VAD when available
  ttsCacheEnabled: true, // Cache for better offline experience

  // Phase 10: Conversation management defaults
  enableSentimentTracking: true, // Track sentiment for better responses
  enableDiscourseAnalysis: true, // Enable topic tracking
  enableResponseRecommendations: true, // Get AI behavior recommendations
  showSuggestedFollowUps: true, // Show follow-up suggestions

  // Privacy defaults
  storeTranscriptHistory: true, // Store history for continuity
  shareAnonymousAnalytics: false, // Opt-out by default for privacy

  // ============================================================================
  // Voice Mode v4: Thinking Feedback Defaults
  // ============================================================================
  thinkingToneEnabled: true, // Enabled by default
  thinkingTonePreset: "gentle_beep" as const,
  thinkingToneVolume: 30, // Low volume by default
  thinkingToneOnToolCalls: true,
  thinkingVisualEnabled: true,
  thinkingVisualStyle: "dots" as const,
  thinkingHapticEnabled: true,
  thinkingHapticPattern: "gentle" as const,
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

      // ========================================================================
      // Phase 7-10: Advanced Voice Barge-In Actions
      // ========================================================================

      // Phase 7: Multilingual actions
      setAccentProfileId: (accentProfileId) => set({ accentProfileId }),

      setAutoLanguageDetection: (autoLanguageDetection) =>
        set({ autoLanguageDetection }),

      setLanguageSwitchConfidence: (languageSwitchConfidence) =>
        set({
          languageSwitchConfidence: clamp(languageSwitchConfidence, 0, 1),
        }),

      // Phase 8: Personalization/Calibration actions
      setVadCalibrated: (vadCalibrated) => set({ vadCalibrated }),

      setLastCalibrationDate: (lastCalibrationDate) =>
        set({ lastCalibrationDate }),

      setPersonalizedVadThreshold: (personalizedVadThreshold) =>
        set({
          personalizedVadThreshold:
            personalizedVadThreshold !== null
              ? clamp(personalizedVadThreshold, 0, 1)
              : null,
        }),

      setEnableBehaviorLearning: (enableBehaviorLearning) =>
        set({ enableBehaviorLearning }),

      // Phase 9: Offline mode actions
      setEnableOfflineFallback: (enableOfflineFallback) =>
        set({ enableOfflineFallback }),

      setPreferOfflineVAD: (preferOfflineVAD) => set({ preferOfflineVAD }),

      setTtsCacheEnabled: (ttsCacheEnabled) => set({ ttsCacheEnabled }),

      // Phase 10: Conversation management actions
      setEnableSentimentTracking: (enableSentimentTracking) =>
        set({ enableSentimentTracking }),

      setEnableDiscourseAnalysis: (enableDiscourseAnalysis) =>
        set({ enableDiscourseAnalysis }),

      setEnableResponseRecommendations: (enableResponseRecommendations) =>
        set({ enableResponseRecommendations }),

      setShowSuggestedFollowUps: (showSuggestedFollowUps) =>
        set({ showSuggestedFollowUps }),

      // Privacy actions
      setStoreTranscriptHistory: (storeTranscriptHistory) =>
        set({ storeTranscriptHistory }),

      setShareAnonymousAnalytics: (shareAnonymousAnalytics) =>
        set({ shareAnonymousAnalytics }),

      // Voice Mode v4: Thinking Feedback Actions
      setThinkingToneEnabled: (thinkingToneEnabled) =>
        set({ thinkingToneEnabled }),

      setThinkingTonePreset: (thinkingTonePreset) =>
        set({ thinkingTonePreset }),

      setThinkingToneVolume: (thinkingToneVolume) =>
        set({ thinkingToneVolume: clamp(thinkingToneVolume, 0, 100) }),

      setThinkingToneOnToolCalls: (thinkingToneOnToolCalls) =>
        set({ thinkingToneOnToolCalls }),

      setThinkingVisualEnabled: (thinkingVisualEnabled) =>
        set({ thinkingVisualEnabled }),

      setThinkingVisualStyle: (thinkingVisualStyle) =>
        set({ thinkingVisualStyle }),

      setThinkingHapticEnabled: (thinkingHapticEnabled) =>
        set({ thinkingHapticEnabled }),

      setThinkingHapticPattern: (thinkingHapticPattern) =>
        set({ thinkingHapticPattern }),

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

        // ======================================================================
        // Phase 7-10: Advanced Voice Barge-In Settings (Persisted)
        // ======================================================================

        // Phase 7: Multilingual
        accentProfileId: state.accentProfileId,
        autoLanguageDetection: state.autoLanguageDetection,
        languageSwitchConfidence: state.languageSwitchConfidence,

        // Phase 8: Personalization/Calibration
        vadCalibrated: state.vadCalibrated,
        lastCalibrationDate: state.lastCalibrationDate,
        personalizedVadThreshold: state.personalizedVadThreshold,
        enableBehaviorLearning: state.enableBehaviorLearning,

        // Phase 9: Offline mode
        enableOfflineFallback: state.enableOfflineFallback,
        preferOfflineVAD: state.preferOfflineVAD,
        ttsCacheEnabled: state.ttsCacheEnabled,

        // Phase 10: Conversation management
        enableSentimentTracking: state.enableSentimentTracking,
        enableDiscourseAnalysis: state.enableDiscourseAnalysis,
        enableResponseRecommendations: state.enableResponseRecommendations,
        showSuggestedFollowUps: state.showSuggestedFollowUps,

        // Privacy
        storeTranscriptHistory: state.storeTranscriptHistory,
        shareAnonymousAnalytics: state.shareAnonymousAnalytics,

        // Voice Mode v4: Thinking Feedback
        thinkingToneEnabled: state.thinkingToneEnabled,
        thinkingTonePreset: state.thinkingTonePreset,
        thinkingToneVolume: state.thinkingToneVolume,
        thinkingToneOnToolCalls: state.thinkingToneOnToolCalls,
        thinkingVisualEnabled: state.thinkingVisualEnabled,
        thinkingVisualStyle: state.thinkingVisualStyle,
        thinkingHapticEnabled: state.thinkingHapticEnabled,
        thinkingHapticPattern: state.thinkingHapticPattern,
      }),
    },
  ),
);
