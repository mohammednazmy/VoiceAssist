/**
 * usePersonalization Hook
 *
 * React hook for adaptive personalization of voice barge-in.
 * Manages calibration, behavior tracking, and preference updates.
 *
 * Phase 8: Adaptive Personalization
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PersonalizationManager,
  createPersonalizationManager,
} from "../lib/personalization";
import type {
  PersonalizationState,
  PersonalizationConfig,
  PersonalizationEvent,
  CalibrationResult,
  CalibrationProgress,
  UserBargeInPreferences,
  BargeInType,
  BehaviorStats,
} from "../lib/personalization/types";
import { useAuthStore } from "../stores/authStore";

// ============================================================================
// Types
// ============================================================================

export interface UsePersonalizationOptions {
  /** Backend sync endpoint */
  syncEndpoint?: string;

  /** Enable automatic threshold adaptation */
  autoAdapt?: boolean;

  /** Callback when calibration completes */
  onCalibrationComplete?: (result: CalibrationResult) => void;

  /** Callback when calibration progress updates */
  onCalibrationProgress?: (progress: CalibrationProgress) => void;

  /** Callback when preferences change */
  onPreferencesChange?: (preferences: UserBargeInPreferences) => void;

  /** Callback when thresholds are adapted */
  onThresholdAdapted?: (oldValue: number, newValue: number) => void;
}

export interface UsePersonalizationReturn {
  // State
  state: PersonalizationState;
  isInitialized: boolean;
  isCalibrated: boolean;
  isCalibrating: boolean;
  isLearning: boolean;

  // Preferences
  preferences: UserBargeInPreferences | null;
  vadSensitivity: number;

  // Stats
  behaviorStats: BehaviorStats;
  detectedPatterns: ReturnType<PersonalizationManager["getDetectedPatterns"]>;
  preferredBackchannels: string[];

  // Calibration
  runCalibration: () => Promise<CalibrationResult>;
  cancelCalibration: () => void;

  // Behavior Recording
  recordBargeIn: (
    type: BargeInType,
    duration: number,
    vadConfidence: number,
    options?: {
      transcript?: string;
      wasCorrect?: boolean;
      aiWasSpeaking?: boolean;
    },
  ) => void;
  markBargeInCorrectness: (eventId: string, wasCorrect: boolean) => void;

  // Preference Updates
  setVadSensitivity: (sensitivity: number) => void;
  setPreferredLanguage: (language: string) => void;
  addCustomBackchannel: (phrase: string) => void;
  removeCustomBackchannel: (phrase: string) => void;
  setLearningEnabled: (enabled: boolean) => void;

  // Recommendations
  getRecommendedVadThreshold: () => number;

  // Reset
  reset: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePersonalization(
  options: UsePersonalizationOptions = {},
): UsePersonalizationReturn {
  const {
    syncEndpoint,
    autoAdapt = true,
    onCalibrationComplete,
    onCalibrationProgress,
    onPreferencesChange,
    onThresholdAdapted,
  } = options;

  // Get user ID from auth store
  const { user } = useAuthStore();
  const userId = user?.id || "anonymous";

  // Manager instance
  const managerRef = useRef<PersonalizationManager | null>(null);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [state, setState] = useState<PersonalizationState>({
    calibrated: false,
    calibrationResult: null,
    preferences: null,
    behaviorStats: {
      totalBargeIns: 0,
      backchannelCount: 0,
      softBargeCount: 0,
      hardBargeCount: 0,
      falsePositiveRate: 0,
      averageBargeInDuration: 0,
      preferredBackchannelPhrases: new Map(),
      sessionCount: 0,
      averageSessionDuration: 0,
      hourlyPatterns: new Array(24).fill(0),
      estimatedWpm: 150,
      speakingPace: "normal",
    },
    isLearning: autoAdapt,
    lastUpdate: Date.now(),
  });

  // Initialize manager
  useEffect(() => {
    const config: Partial<PersonalizationConfig> = {
      autoAdapt,
      syncWithBackend: !!syncEndpoint,
    };

    managerRef.current = createPersonalizationManager(userId, config);

    // Subscribe to events
    const unsubscribe = managerRef.current.onEvent((event) => {
      handleEvent(event);
    });

    // Initialize
    managerRef.current.initialize(syncEndpoint).then(() => {
      // Check if component is still mounted (managerRef.current not null)
      if (managerRef.current) {
        setIsInitialized(true);
        setState(managerRef.current.getState());
      }
    });

    return () => {
      unsubscribe();
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, [userId]);

  // Handle events
  const handleEvent = useCallback(
    (event: PersonalizationEvent) => {
      switch (event.type) {
        case "calibration_started":
          setIsCalibrating(true);
          break;

        case "calibration_progress":
          onCalibrationProgress?.(event.progress);
          break;

        case "calibration_complete":
          setIsCalibrating(false);
          onCalibrationComplete?.(event.result);
          break;

        case "calibration_error":
          setIsCalibrating(false);
          break;

        case "preferences_updated":
          onPreferencesChange?.(event.preferences);
          break;

        case "threshold_adapted":
          onThresholdAdapted?.(event.oldValue, event.newValue);
          break;

        case "barge_in_recorded":
        case "learning_enabled":
          // Update state
          break;
      }

      // Refresh state
      if (managerRef.current) {
        setState(managerRef.current.getState());
      }
    },
    [
      onCalibrationComplete,
      onCalibrationProgress,
      onPreferencesChange,
      onThresholdAdapted,
    ],
  );

  // Run calibration
  const runCalibration = useCallback(async () => {
    if (!managerRef.current) {
      throw new Error("Personalization not initialized");
    }
    return managerRef.current.runCalibration();
  }, []);

  // Cancel calibration
  const cancelCalibration = useCallback(() => {
    managerRef.current?.cancelCalibration();
    setIsCalibrating(false);
  }, []);

  // Record barge-in
  const recordBargeIn = useCallback(
    (
      type: BargeInType,
      duration: number,
      vadConfidence: number,
      options?: {
        transcript?: string;
        wasCorrect?: boolean;
        aiWasSpeaking?: boolean;
      },
    ) => {
      managerRef.current?.recordBargeIn(type, duration, vadConfidence, options);
    },
    [],
  );

  // Mark barge-in correctness
  const markBargeInCorrectness = useCallback(
    (eventId: string, wasCorrect: boolean) => {
      managerRef.current?.markBargeInCorrectness(eventId, wasCorrect);
    },
    [],
  );

  // Set VAD sensitivity
  const setVadSensitivity = useCallback((sensitivity: number) => {
    managerRef.current?.setVadSensitivity(sensitivity);
  }, []);

  // Set preferred language
  const setPreferredLanguage = useCallback((language: string) => {
    managerRef.current?.setPreferredLanguage(language);
  }, []);

  // Add custom backchannel
  const addCustomBackchannel = useCallback((phrase: string) => {
    managerRef.current?.addCustomBackchannel(phrase);
  }, []);

  // Remove custom backchannel
  const removeCustomBackchannel = useCallback((phrase: string) => {
    managerRef.current?.removeCustomBackchannel(phrase);
  }, []);

  // Set learning enabled
  const setLearningEnabled = useCallback((enabled: boolean) => {
    managerRef.current?.setLearningEnabled(enabled);
  }, []);

  // Get recommended VAD threshold
  const getRecommendedVadThreshold = useCallback(() => {
    return managerRef.current?.getRecommendedVadThreshold() ?? 0.5;
  }, []);

  // Reset
  const reset = useCallback(() => {
    managerRef.current?.reset();
    if (managerRef.current) {
      setState(managerRef.current.getState());
    }
  }, []);

  // Computed values
  const vadSensitivity = useMemo(
    () => state.preferences?.vadSensitivity ?? 0.5,
    [state.preferences],
  );

  const detectedPatterns = useMemo(
    () => managerRef.current?.getDetectedPatterns() ?? [],
    [state.behaviorStats],
  );

  const preferredBackchannels = useMemo(
    () => managerRef.current?.getUserPreferredBackchannels() ?? [],
    [state.behaviorStats, state.preferences],
  );

  return {
    // State
    state,
    isInitialized,
    isCalibrated: state.calibrated,
    isCalibrating,
    isLearning: state.isLearning,

    // Preferences
    preferences: state.preferences,
    vadSensitivity,

    // Stats
    behaviorStats: state.behaviorStats,
    detectedPatterns,
    preferredBackchannels,

    // Calibration
    runCalibration,
    cancelCalibration,

    // Behavior Recording
    recordBargeIn,
    markBargeInCorrectness,

    // Preference Updates
    setVadSensitivity,
    setPreferredLanguage,
    addCustomBackchannel,
    removeCustomBackchannel,
    setLearningEnabled,

    // Recommendations
    getRecommendedVadThreshold,

    // Reset
    reset,
  };
}
