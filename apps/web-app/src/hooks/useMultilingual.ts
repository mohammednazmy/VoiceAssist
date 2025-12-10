/**
 * useMultilingual Hook
 *
 * React hook for voice language detection and accent management.
 * Integrates the multilingual module with React components.
 *
 * Phase 7: Multilingual & Accent Support
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MultilingualManager,
  createMultilingualManager,
  type MultilingualManagerConfig,
} from "../lib/multilingual";
import type {
  SupportedLanguage,
  LanguageDetectionResult,
  AccentDetectionResult,
  AccentProfile,
  MultilingualEvent,
} from "../lib/multilingual/types";
import { useLanguagePreferencesStore } from "../stores/languagePreferencesStore";

// ============================================================================
// Types
// ============================================================================

export interface UseMultilingualOptions {
  /** Enable automatic language detection */
  autoDetect?: boolean;

  /** Enable automatic language switching */
  autoSwitch?: boolean;

  /** Minimum confidence to switch language */
  switchConfidence?: number;

  /** Enable accent detection */
  enableAccentDetection?: boolean;

  /** Callback when language is detected */
  onLanguageDetected?: (result: LanguageDetectionResult) => void;

  /** Callback when language changes */
  onLanguageChanged?: (from: SupportedLanguage, to: SupportedLanguage) => void;

  /** Callback when accent is detected */
  onAccentDetected?: (result: AccentDetectionResult) => void;
}

export interface UseMultilingualReturn {
  // State
  currentLanguage: SupportedLanguage;
  currentAccent: AccentProfile | null;
  detectedLanguage: SupportedLanguage | null;
  detectionConfidence: number;
  isRtl: boolean;

  // Detection
  detectLanguage: (
    transcript: string,
    prosodicFeatures?: {
      avgPitch: number;
      pitchVariance: number;
      speakingRate: number;
      pauseDuration: number;
    },
  ) => {
    language: LanguageDetectionResult;
    accent: AccentDetectionResult | null;
  };

  // Actions
  setLanguage: (language: SupportedLanguage) => void;
  setAccent: (accentId: string) => void;
  enableAutoSwitch: (enabled: boolean) => void;

  // Preferences
  availableLanguages: SupportedLanguage[];
  availableAccents: AccentProfile[];
  getLanguageInfo: (language: SupportedLanguage) => {
    nativeName: string;
    englishName: string;
    direction: "ltr" | "rtl";
  };

  // VAD/Prosodic adjustments
  vadAdjustments: {
    speechThresholdDelta: number;
    minSpeechDurationDelta: number;
    silenceThresholdDelta: number;
  };
  prosodicAdjustments: {
    pitchRangeMultiplier: number;
    speakingRateMultiplier: number;
  };
  backchannelAdditions: string[];

  // Stats
  stats: {
    totalDetections: number;
    languageSwitches: number;
    accentDetections: number;
  };

  // Reset
  reset: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMultilingual(
  options: UseMultilingualOptions = {},
): UseMultilingualReturn {
  const {
    autoDetect = true,
    autoSwitch: _autoSwitch = false,
    switchConfidence: _switchConfidence = 0.75,
    enableAccentDetection = true,
    onLanguageDetected,
    onLanguageChanged,
    onAccentDetected,
  } = options;

  // Store integration
  const store = useLanguagePreferencesStore();

  // Manager instance
  const managerRef = useRef<MultilingualManager | null>(null);

  // Local state for React re-renders
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(
    store.primaryLanguage,
  );
  const [currentAccent, setCurrentAccent] = useState<AccentProfile | null>(
    null,
  );
  const [detectedLanguage, setDetectedLanguage] =
    useState<SupportedLanguage | null>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [stats, setStats] = useState({
    totalDetections: 0,
    languageSwitches: 0,
    accentDetections: 0,
  });

  // Initialize manager
  useEffect(() => {
    const config: Partial<MultilingualManagerConfig> = {
      autoDetect,
      autoSwitch: store.autoSwitch,
      switchConfidence: store.switchConfidence,
      enableAccentDetection,
      defaultLanguage: store.primaryLanguage,
    };

    managerRef.current = createMultilingualManager(config);

    // Set initial accent if stored
    if (store.accentProfileId) {
      managerRef.current.switchAccent(store.accentProfileId);
      setCurrentAccent(managerRef.current.getCurrentAccent());
    }

    // Subscribe to events
    const unsubscribe = managerRef.current.onEvent((event) => {
      handleEvent(event);
    });

    return () => {
      unsubscribe();
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  // Sync with store changes
  useEffect(() => {
    if (!managerRef.current) return;

    if (store.primaryLanguage !== currentLanguage) {
      managerRef.current.switchLanguage(store.primaryLanguage);
      setCurrentLanguage(store.primaryLanguage);
    }

    if (store.accentProfileId !== currentAccent?.id) {
      if (store.accentProfileId) {
        managerRef.current.switchAccent(store.accentProfileId);
        setCurrentAccent(managerRef.current.getCurrentAccent());
      }
    }

    managerRef.current.updateConfig({
      autoSwitch: store.autoSwitch,
      switchConfidence: store.switchConfidence,
    });
  }, [
    store.primaryLanguage,
    store.accentProfileId,
    store.autoSwitch,
    store.switchConfidence,
  ]);

  // Handle multilingual events
  const handleEvent = useCallback(
    (event: MultilingualEvent) => {
      switch (event.type) {
        case "language_detected":
          setDetectedLanguage(event.result.detectedLanguage);
          setDetectionConfidence(event.result.confidence);
          onLanguageDetected?.(event.result);
          break;

        case "language_changed":
          setCurrentLanguage(event.to);
          store.setCurrentLanguage(event.to);
          onLanguageChanged?.(event.from, event.to);
          break;

        case "accent_detected":
          onAccentDetected?.(event.result);
          break;

        case "accent_changed":
          if (managerRef.current) {
            setCurrentAccent(managerRef.current.getCurrentAccent());
          }
          break;

        case "preferences_updated":
          // Sync with store
          store.setPreferences(event.preferences);
          break;
      }

      // Update stats
      if (managerRef.current) {
        const newStats = managerRef.current.getStats();
        setStats({
          totalDetections: newStats.totalDetections,
          languageSwitches: newStats.languageSwitches,
          accentDetections: newStats.accentDetections,
        });
      }
    },
    [onLanguageDetected, onLanguageChanged, onAccentDetected, store],
  );

  // Detect language from transcript
  const detectLanguage = useCallback(
    (
      transcript: string,
      prosodicFeatures?: {
        avgPitch: number;
        pitchVariance: number;
        speakingRate: number;
        pauseDuration: number;
      },
    ) => {
      if (!managerRef.current) {
        return {
          language: {
            detectedLanguage: currentLanguage,
            confidence: 0,
            alternativeLanguages: [],
            method: "user_preference" as const,
          },
          accent: null,
        };
      }

      return managerRef.current.processTranscript(transcript, prosodicFeatures);
    },
    [currentLanguage],
  );

  // Set language manually
  const setLanguage = useCallback(
    (language: SupportedLanguage) => {
      if (managerRef.current) {
        managerRef.current.switchLanguage(language);
      }
      store.setPrimaryLanguage(language);
    },
    [store],
  );

  // Set accent manually
  const setAccent = useCallback(
    (accentId: string) => {
      if (managerRef.current) {
        managerRef.current.switchAccent(accentId);
        setCurrentAccent(managerRef.current.getCurrentAccent());
      }
      store.setAccentProfileId(accentId);
    },
    [store],
  );

  // Enable/disable auto-switch
  const enableAutoSwitch = useCallback(
    (enabled: boolean) => {
      if (managerRef.current) {
        managerRef.current.updateConfig({ autoSwitch: enabled });
      }
      store.setAutoSwitch(enabled);
    },
    [store],
  );

  // Get available languages
  const availableLanguages = useMemo(() => {
    return managerRef.current?.getSupportedLanguages() ?? [];
  }, [managerRef.current]);

  // Get available accents for current language
  const availableAccents = useMemo(() => {
    return managerRef.current?.getAvailableAccents() ?? [];
  }, [currentLanguage, managerRef.current]);

  // Get language info
  const getLanguageInfo = useCallback(
    (language: SupportedLanguage) => {
      const info = managerRef.current?.getLanguageInfo(language);
      return {
        nativeName: info?.nativeName ?? language,
        englishName: info?.englishName ?? language,
        direction: info?.direction ?? ("ltr" as const),
      };
    },
    [managerRef.current],
  );

  // Get VAD adjustments
  const vadAdjustments = useMemo(() => {
    return (
      managerRef.current?.getVadAdjustments() ?? {
        speechThresholdDelta: 0,
        minSpeechDurationDelta: 0,
        silenceThresholdDelta: 0,
      }
    );
  }, [currentAccent]);

  // Get prosodic adjustments
  const prosodicAdjustments = useMemo(() => {
    return (
      managerRef.current?.getProsodicAdjustments() ?? {
        pitchRangeMultiplier: 1.0,
        speakingRateMultiplier: 1.0,
      }
    );
  }, [currentAccent]);

  // Get backchannel additions
  const backchannelAdditions = useMemo(() => {
    return managerRef.current?.getBackchannelAdditions() ?? [];
  }, [currentAccent]);

  // Check if current language is RTL
  const isRtl = useMemo(() => {
    return managerRef.current?.getTextDirection(currentLanguage) === "rtl";
  }, [currentLanguage]);

  // Reset
  const reset = useCallback(() => {
    managerRef.current?.reset();
    setDetectedLanguage(null);
    setDetectionConfidence(0);
    setStats({
      totalDetections: 0,
      languageSwitches: 0,
      accentDetections: 0,
    });
  }, []);

  return {
    // State
    currentLanguage,
    currentAccent,
    detectedLanguage,
    detectionConfidence,
    isRtl,

    // Detection
    detectLanguage,

    // Actions
    setLanguage,
    setAccent,
    enableAutoSwitch,

    // Preferences
    availableLanguages,
    availableAccents,
    getLanguageInfo,

    // Adjustments
    vadAdjustments,
    prosodicAdjustments,
    backchannelAdditions,

    // Stats
    stats,

    // Reset
    reset,
  };
}
