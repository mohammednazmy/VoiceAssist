/**
 * useNeuralVAD Hook
 *
 * React hook for neural voice activity detection using Silero VAD.
 * Provides real-time speech detection with <30ms latency.
 *
 * Features:
 * - Neural network-based VAD (95%+ accuracy)
 * - Language-specific tuning
 * - Adaptive thresholds based on ambient noise
 * - Calibration support
 * - Automatic cleanup on unmount
 *
 * Phase 1: Neural VAD Integration
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  SileroVAD,
  type SileroVADConfig,
  type VADProcessResult,
  type CalibrationData,
} from "../lib/sileroVAD";
import type { SupportedLanguage } from "./useIntelligentBargeIn/types";

// ============================================================================
// Types
// ============================================================================

export interface UseNeuralVADOptions {
  /** Path to the VAD model (default: /silero_vad.onnx) */
  modelPath?: string;

  /** Primary language for VAD tuning */
  language?: SupportedLanguage;

  /** Enable adaptive threshold based on calibration */
  adaptiveThreshold?: boolean;

  /** Speech probability threshold (0-1) */
  speechThreshold?: number;

  /** Silence probability threshold (0-1) */
  silenceThreshold?: number;

  /** Minimum speech duration before triggering (ms) */
  minSpeechDurationMs?: number;

  /** Callback when speech starts */
  onSpeechStart?: (confidence: number, language?: SupportedLanguage) => void;

  /** Callback when speech ends */
  onSpeechEnd?: (duration: number) => void;

  /** Callback for each VAD result */
  onVADResult?: (result: VADProcessResult) => void;

  /** Callback when calibration completes */
  onCalibrationComplete?: (result: CalibrationData) => void;

  /** Auto-initialize on mount */
  autoInit?: boolean;

  /** Auto-start on initialization */
  autoStart?: boolean;
}

export interface UseNeuralVADReturn {
  /** Whether the VAD is initialized and ready */
  isReady: boolean;

  /** Whether currently processing audio */
  isActive: boolean;

  /** Whether speech is currently detected */
  isSpeaking: boolean;

  /** Whether calibration is in progress */
  isCalibrating: boolean;

  /** Current speech probability (0-1) */
  probability: number;

  /** Average processing latency (ms) */
  latencyMs: number;

  /** Calibration result if available */
  calibration: CalibrationData | null;

  /** Error if initialization or processing failed */
  error: Error | null;

  /** Initialize the VAD */
  initialize: () => Promise<void>;

  /** Start processing audio */
  start: (stream?: MediaStream) => Promise<void>;

  /** Stop processing audio */
  stop: () => void;

  /** Run calibration for adaptive thresholds */
  calibrate: () => Promise<CalibrationData>;

  /** Update VAD configuration */
  updateConfig: (config: Partial<SileroVADConfig>) => void;

  /** Set the language for VAD tuning */
  setLanguage: (language: SupportedLanguage) => void;

  /** Destroy the VAD instance */
  destroy: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for neural voice activity detection
 */
export function useNeuralVAD(
  options: UseNeuralVADOptions = {},
): UseNeuralVADReturn {
  const {
    modelPath = "/silero_vad.onnx",
    language = "en",
    adaptiveThreshold = true,
    speechThreshold = 0.5,
    silenceThreshold = 0.35,
    minSpeechDurationMs = 100,
    onSpeechStart,
    onSpeechEnd,
    onVADResult,
    onCalibrationComplete,
    autoInit = false,
    autoStart = false,
  } = options;

  // State
  const [isReady, setIsReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [probability, setProbability] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const vadRef = useRef<SileroVAD | null>(null);
  const mountedRef = useRef(true);

  // ============================================================================
  // Initialize VAD
  // ============================================================================

  const initialize = useCallback(async () => {
    if (vadRef.current?.isReady()) {
      console.log("[useNeuralVAD] Already initialized");
      return;
    }

    try {
      setError(null);

      // Create VAD instance with configuration
      const vad = new SileroVAD({
        modelPath,
        language,
        adaptiveThreshold,
        speechThreshold,
        silenceThreshold,
        minSpeechDuration: Math.floor(
          (minSpeechDurationMs * 16000) / 1000 / 512,
        ), // Convert ms to windows

        onSpeechStart: (confidence, detectedLang) => {
          if (!mountedRef.current) return;
          setIsSpeaking(true);
          onSpeechStart?.(confidence, detectedLang);
        },

        onSpeechEnd: (duration) => {
          if (!mountedRef.current) return;
          setIsSpeaking(false);
          onSpeechEnd?.(duration);
        },

        onVADResult: (result) => {
          if (!mountedRef.current) return;
          setProbability(result.probability);
          setLatencyMs(result.processingTime);
          onVADResult?.(result);
        },

        onCalibrationComplete: (result) => {
          if (!mountedRef.current) return;
          setCalibration(result);
          setIsCalibrating(false);
          onCalibrationComplete?.(result);
        },
      });

      vadRef.current = vad;

      // Initialize the VAD
      await vad.initialize();

      if (mountedRef.current) {
        setIsReady(true);
        console.log("[useNeuralVAD] Initialized successfully");
      }
    } catch (err) {
      console.error("[useNeuralVAD] Initialization failed:", err);
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err : new Error("Initialization failed"),
        );
        setIsReady(false);
      }
    }
  }, [
    modelPath,
    language,
    adaptiveThreshold,
    speechThreshold,
    silenceThreshold,
    minSpeechDurationMs,
    onSpeechStart,
    onSpeechEnd,
    onVADResult,
    onCalibrationComplete,
  ]);

  // ============================================================================
  // Start Processing
  // ============================================================================

  const start = useCallback(
    async (stream?: MediaStream) => {
      if (!vadRef.current) {
        throw new Error("VAD not initialized. Call initialize() first.");
      }

      if (isActive) {
        console.log("[useNeuralVAD] Already active");
        return;
      }

      try {
        await vadRef.current.start(stream);
        if (mountedRef.current) {
          setIsActive(true);
          console.log("[useNeuralVAD] Started processing");
        }
      } catch (err) {
        console.error("[useNeuralVAD] Failed to start:", err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error("Failed to start"));
        }
      }
    },
    [isActive],
  );

  // ============================================================================
  // Stop Processing
  // ============================================================================

  const stop = useCallback(() => {
    if (!vadRef.current) return;

    vadRef.current.stop();
    if (mountedRef.current) {
      setIsActive(false);
      setIsSpeaking(false);
      console.log("[useNeuralVAD] Stopped processing");
    }
  }, []);

  // ============================================================================
  // Calibration
  // ============================================================================

  const calibrate = useCallback(async (): Promise<CalibrationData> => {
    if (!vadRef.current) {
      throw new Error("VAD not initialized. Call initialize() first.");
    }

    if (!isActive) {
      throw new Error("VAD not active. Call start() first.");
    }

    setIsCalibrating(true);

    try {
      const result = await vadRef.current.calibrate();
      return result;
    } catch (err) {
      setIsCalibrating(false);
      throw err;
    }
  }, [isActive]);

  // ============================================================================
  // Configuration
  // ============================================================================

  const updateConfig = useCallback((config: Partial<SileroVADConfig>) => {
    vadRef.current?.updateConfig(config);
  }, []);

  const setLanguage = useCallback((newLanguage: SupportedLanguage) => {
    vadRef.current?.setLanguage(newLanguage);
  }, []);

  // ============================================================================
  // Destroy
  // ============================================================================

  const destroy = useCallback(async () => {
    if (vadRef.current) {
      await vadRef.current.destroy();
      vadRef.current = null;
    }

    if (mountedRef.current) {
      setIsReady(false);
      setIsActive(false);
      setIsSpeaking(false);
      setIsCalibrating(false);
      setProbability(0);
      setLatencyMs(0);
    }
  }, []);

  // ============================================================================
  // Lifecycle
  // ============================================================================

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit) {
      initialize().then(() => {
        if (autoStart && mountedRef.current) {
          start();
        }
      });
    }

    return () => {
      mountedRef.current = false;
      destroy();
    };
  }, []); // Only run on mount/unmount

  // ============================================================================
  // Return
  // ============================================================================

  return {
    isReady,
    isActive,
    isSpeaking,
    isCalibrating,
    probability,
    latencyMs,
    calibration,
    error,
    initialize,
    start,
    stop,
    calibrate,
    updateConfig,
    setLanguage,
    destroy,
  };
}

// ============================================================================
// Utility Types
// ============================================================================

export type { SileroVADConfig, VADProcessResult, CalibrationData };
