/**
 * Language Preferences Store
 *
 * Manages user language and accent preferences for multilingual
 * voice interaction. Persists settings locally and syncs with backend.
 *
 * Phase 7: Multilingual & Accent Support
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SupportedLanguage,
  LanguagePreferences,
  AccentProfile,
} from "../lib/multilingual/types";
import { LANGUAGE_REGISTRY } from "../lib/multilingual/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Language option for UI display
 */
export interface LanguageOption {
  code: SupportedLanguage;
  nativeName: string;
  englishName: string;
  direction: "ltr" | "rtl";
}

/**
 * Accent option for UI display
 */
export interface AccentOption {
  id: string;
  displayName: string;
  language: SupportedLanguage;
  region: string;
}

/**
 * Store state
 */
interface LanguagePreferencesState {
  // Core preferences
  primaryLanguage: SupportedLanguage;
  secondaryLanguages: SupportedLanguage[];
  accentProfileId: string | null;

  // Detection settings
  autoDetect: boolean;
  autoSwitch: boolean;
  switchConfidence: number;

  // TTS/STT preferences per language
  ttsVoices: Partial<Record<SupportedLanguage, string>>;
  sttModels: Partial<Record<SupportedLanguage, string>>;

  // UI language (for interface localization)
  uiLanguage: SupportedLanguage;

  // Active state (current session)
  currentLanguage: SupportedLanguage;
  currentAccentId: string | null;
  detectedLanguage: SupportedLanguage | null;
  detectionConfidence: number;

  // History
  recentLanguages: SupportedLanguage[];
  languageSwitchCount: number;

  // Backend sync
  backendPrefsId: string | null;
  lastSyncedAt: number | null;

  // Actions - Settings
  setPrimaryLanguage: (language: SupportedLanguage) => void;
  addSecondaryLanguage: (language: SupportedLanguage) => void;
  removeSecondaryLanguage: (language: SupportedLanguage) => void;
  setSecondaryLanguages: (languages: SupportedLanguage[]) => void;
  setAccentProfileId: (id: string | null) => void;

  // Actions - Detection
  setAutoDetect: (enabled: boolean) => void;
  setAutoSwitch: (enabled: boolean) => void;
  setSwitchConfidence: (confidence: number) => void;

  // Actions - Per-language preferences
  setTtsVoice: (language: SupportedLanguage, voiceId: string) => void;
  setSttModel: (language: SupportedLanguage, modelId: string) => void;
  clearTtsVoice: (language: SupportedLanguage) => void;
  clearSttModel: (language: SupportedLanguage) => void;

  // Actions - UI
  setUiLanguage: (language: SupportedLanguage) => void;

  // Actions - Session state
  setCurrentLanguage: (language: SupportedLanguage) => void;
  setCurrentAccentId: (id: string | null) => void;
  setDetectedLanguage: (
    language: SupportedLanguage | null,
    confidence: number,
  ) => void;

  // Actions - Bulk operations
  setPreferences: (prefs: Partial<LanguagePreferences>) => void;
  syncFromBackend: (prefs: BackendLanguagePreferences) => void;
  reset: () => void;
}

/**
 * Backend language preferences response shape
 */
export interface BackendLanguagePreferences {
  id: string;
  user_id: string;
  primary_language: SupportedLanguage;
  secondary_languages: SupportedLanguage[];
  accent_profile_id: string | null;
  auto_detect: boolean;
  auto_switch: boolean;
  switch_confidence: number;
  tts_voices: Record<string, string>;
  stt_models: Record<string, string>;
  ui_language: SupportedLanguage;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of recent languages to track
 */
const MAX_RECENT_LANGUAGES = 5;

/**
 * Maximum number of secondary languages
 */
const MAX_SECONDARY_LANGUAGES = 5;

/**
 * Default state values
 */
const defaultState = {
  // Core preferences
  primaryLanguage: "en" as SupportedLanguage,
  secondaryLanguages: [] as SupportedLanguage[],
  accentProfileId: null as string | null,

  // Detection settings
  autoDetect: true,
  autoSwitch: false,
  switchConfidence: 0.75,

  // TTS/STT preferences
  ttsVoices: {} as Partial<Record<SupportedLanguage, string>>,
  sttModels: {} as Partial<Record<SupportedLanguage, string>>,

  // UI language
  uiLanguage: "en" as SupportedLanguage,

  // Session state
  currentLanguage: "en" as SupportedLanguage,
  currentAccentId: null as string | null,
  detectedLanguage: null as SupportedLanguage | null,
  detectionConfidence: 0,

  // History
  recentLanguages: ["en"] as SupportedLanguage[],
  languageSwitchCount: 0,

  // Backend sync
  backendPrefsId: null as string | null,
  lastSyncedAt: null as number | null,
};

// ============================================================================
// Store
// ============================================================================

export const useLanguagePreferencesStore = create<LanguagePreferencesState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Settings Actions
      // ========================================

      setPrimaryLanguage: (language) => {
        set((state) => {
          // Also update current language
          const newRecentLanguages = updateRecentLanguages(
            state.recentLanguages,
            language,
          );
          return {
            primaryLanguage: language,
            currentLanguage: language,
            recentLanguages: newRecentLanguages,
          };
        });
      },

      addSecondaryLanguage: (language) => {
        set((state) => {
          // Don't add if it's the primary language
          if (language === state.primaryLanguage) {
            return state;
          }
          // Don't add duplicates
          if (state.secondaryLanguages.includes(language)) {
            return state;
          }
          // Limit secondary languages
          const newSecondary = [...state.secondaryLanguages, language].slice(
            0,
            MAX_SECONDARY_LANGUAGES,
          );
          return { secondaryLanguages: newSecondary };
        });
      },

      removeSecondaryLanguage: (language) => {
        set((state) => ({
          secondaryLanguages: state.secondaryLanguages.filter(
            (l) => l !== language,
          ),
        }));
      },

      setSecondaryLanguages: (languages) => {
        set((state) => ({
          secondaryLanguages: languages
            .filter((l) => l !== state.primaryLanguage)
            .slice(0, MAX_SECONDARY_LANGUAGES),
        }));
      },

      setAccentProfileId: (id) => {
        set({ accentProfileId: id, currentAccentId: id });
      },

      // ========================================
      // Detection Actions
      // ========================================

      setAutoDetect: (enabled) => {
        set({ autoDetect: enabled });
      },

      setAutoSwitch: (enabled) => {
        set({ autoSwitch: enabled });
      },

      setSwitchConfidence: (confidence) => {
        set({ switchConfidence: Math.max(0, Math.min(1, confidence)) });
      },

      // ========================================
      // Per-Language Preferences
      // ========================================

      setTtsVoice: (language, voiceId) => {
        set((state) => ({
          ttsVoices: { ...state.ttsVoices, [language]: voiceId },
        }));
      },

      setSttModel: (language, modelId) => {
        set((state) => ({
          sttModels: { ...state.sttModels, [language]: modelId },
        }));
      },

      clearTtsVoice: (language) => {
        set((state) => {
          const newVoices = { ...state.ttsVoices };
          delete newVoices[language];
          return { ttsVoices: newVoices };
        });
      },

      clearSttModel: (language) => {
        set((state) => {
          const newModels = { ...state.sttModels };
          delete newModels[language];
          return { sttModels: newModels };
        });
      },

      // ========================================
      // UI Actions
      // ========================================

      setUiLanguage: (language) => {
        set({ uiLanguage: language });
      },

      // ========================================
      // Session State Actions
      // ========================================

      setCurrentLanguage: (language) => {
        set((state) => {
          const newRecentLanguages = updateRecentLanguages(
            state.recentLanguages,
            language,
          );
          const switched = language !== state.currentLanguage;
          return {
            currentLanguage: language,
            recentLanguages: newRecentLanguages,
            languageSwitchCount: switched
              ? state.languageSwitchCount + 1
              : state.languageSwitchCount,
          };
        });
      },

      setCurrentAccentId: (id) => {
        set({ currentAccentId: id });
      },

      setDetectedLanguage: (language, confidence) => {
        set({
          detectedLanguage: language,
          detectionConfidence: confidence,
        });
      },

      // ========================================
      // Bulk Operations
      // ========================================

      setPreferences: (prefs) => {
        set((state) => {
          const updates: Partial<LanguagePreferencesState> = {};

          if (prefs.primaryLanguage !== undefined) {
            updates.primaryLanguage = prefs.primaryLanguage;
            updates.currentLanguage = prefs.primaryLanguage;
          }
          if (prefs.secondaryLanguages !== undefined) {
            updates.secondaryLanguages = prefs.secondaryLanguages.slice(
              0,
              MAX_SECONDARY_LANGUAGES,
            );
          }
          if (prefs.accentProfileId !== undefined) {
            updates.accentProfileId = prefs.accentProfileId;
            updates.currentAccentId = prefs.accentProfileId;
          }
          if (prefs.autoDetect !== undefined) {
            updates.autoDetect = prefs.autoDetect;
          }
          if (prefs.autoSwitch !== undefined) {
            updates.autoSwitch = prefs.autoSwitch;
          }
          if (prefs.ttsVoices !== undefined) {
            updates.ttsVoices = prefs.ttsVoices;
          }
          if (prefs.sttModels !== undefined) {
            updates.sttModels = prefs.sttModels;
          }

          return updates;
        });
      },

      syncFromBackend: (prefs) => {
        set({
          primaryLanguage: prefs.primary_language,
          secondaryLanguages: prefs.secondary_languages,
          accentProfileId: prefs.accent_profile_id,
          autoDetect: prefs.auto_detect,
          autoSwitch: prefs.auto_switch,
          switchConfidence: prefs.switch_confidence,
          ttsVoices: prefs.tts_voices as Partial<
            Record<SupportedLanguage, string>
          >,
          sttModels: prefs.stt_models as Partial<
            Record<SupportedLanguage, string>
          >,
          uiLanguage: prefs.ui_language,
          currentLanguage: prefs.primary_language,
          currentAccentId: prefs.accent_profile_id,
          backendPrefsId: prefs.id,
          lastSyncedAt: Date.now(),
        });
      },

      reset: () => {
        set({ ...defaultState });
      },
    }),
    {
      name: "voiceassist-language-preferences",
      partialize: (state) => ({
        // Persist settings
        primaryLanguage: state.primaryLanguage,
        secondaryLanguages: state.secondaryLanguages,
        accentProfileId: state.accentProfileId,
        autoDetect: state.autoDetect,
        autoSwitch: state.autoSwitch,
        switchConfidence: state.switchConfidence,
        ttsVoices: state.ttsVoices,
        sttModels: state.sttModels,
        uiLanguage: state.uiLanguage,
        // Persist history
        recentLanguages: state.recentLanguages,
        languageSwitchCount: state.languageSwitchCount,
        // Persist sync state
        backendPrefsId: state.backendPrefsId,
        lastSyncedAt: state.lastSyncedAt,
      }),
    },
  ),
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Update recent languages list
 */
function updateRecentLanguages(
  current: SupportedLanguage[],
  newLanguage: SupportedLanguage,
): SupportedLanguage[] {
  // Remove if exists
  const filtered = current.filter((l) => l !== newLanguage);
  // Add to front
  return [newLanguage, ...filtered].slice(0, MAX_RECENT_LANGUAGES);
}

// ============================================================================
// Selectors
// ============================================================================

/**
 * Get all available language options for UI
 */
export function getLanguageOptions(): LanguageOption[] {
  return Object.values(LANGUAGE_REGISTRY).map((info) => ({
    code: info.code,
    nativeName: info.nativeName,
    englishName: info.englishName,
    direction: info.direction,
  }));
}

/**
 * Get language info by code
 */
export function getLanguageInfo(code: SupportedLanguage) {
  return LANGUAGE_REGISTRY[code];
}

/**
 * Check if a language is RTL
 */
export function isRtlLanguage(code: SupportedLanguage): boolean {
  return LANGUAGE_REGISTRY[code]?.direction === "rtl";
}

/**
 * Get languages that support TTS
 */
export function getTtsLanguages(): SupportedLanguage[] {
  return Object.values(LANGUAGE_REGISTRY)
    .filter((info) => info.ttsSupported)
    .map((info) => info.code);
}

/**
 * Get languages that support STT
 */
export function getSttLanguages(): SupportedLanguage[] {
  return Object.values(LANGUAGE_REGISTRY)
    .filter((info) => info.sttSupported)
    .map((info) => info.code);
}
