/**
 * Silero VAD Hook
 *
 * Provides local voice activity detection using Silero VAD model.
 * This runs entirely in the browser using ONNX Runtime Web, providing
 * accurate speech detection without requiring backend calls.
 *
 * Features:
 * - Neural network-based VAD (much more accurate than RMS threshold)
 * - Low latency (~10-30ms)
 * - Filters out background noise and TTS echo
 * - Provides onSpeechStart and onSpeechEnd callbacks
 *
 * Used for:
 * - Instant barge-in detection during AI speech
 * - Reliable voice activity indication
 *
 * @see https://github.com/ricky0123/vad
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MicVAD, type RealTimeVADOptions } from "@ricky0123/vad-web";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface SileroVADOptions {
  /** Called when speech starts (user begins talking) */
  onSpeechStart?: () => void;
  /** Called when speech ends, with audio data */
  onSpeechEnd?: (audio: Float32Array) => void;
  /** Called on VAD misfire (speech detected but too short) */
  onVADMisfire?: () => void;
  /** Whether to start VAD automatically when initialized */
  autoStart?: boolean;
  /** Whether to use the external microphone stream (for sharing with other audio processing) */
  externalStream?: MediaStream | null;
  /**
   * Probability threshold for speech detection (0-1).
   * Higher = less sensitive, fewer false positives.
   * Default: 0.5
   */
  positiveSpeechThreshold?: number;
  /**
   * Probability threshold for speech end detection (0-1).
   * Lower = speech ends faster after user stops talking.
   * Default: 0.35
   */
  negativeSpeechThreshold?: number;
  /**
   * Minimum duration of speech before triggering onSpeechStart (in ms).
   * Helps filter out short noise bursts.
   * Default: 250
   */
  minSpeechFrames?: number;
  /**
   * Number of frames to wait after speech ends before triggering onSpeechEnd.
   * Prevents premature cutoff during natural pauses.
   * Default: 6 (about 96ms at 16kHz)
   */
  redemptionFrames?: number;
}

export interface SileroVADReturn {
  /** Whether VAD is currently active */
  isListening: boolean;
  /** Whether speech is currently detected */
  isSpeaking: boolean;
  /** Whether VAD is loading/initializing */
  isLoading: boolean;
  /** Any error that occurred during VAD operation */
  error: Error | null;
  /** Start the VAD (begins listening to microphone) */
  start: () => Promise<void>;
  /** Pause the VAD (stops listening but keeps initialized) */
  pause: () => void;
  /** Stop and cleanup the VAD */
  stop: () => void;
  /** Whether VAD is ready to use */
  isReady: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSileroVAD(options: SileroVADOptions = {}): SileroVADReturn {
  const {
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire,
    autoStart = false,
    externalStream = null,
    positiveSpeechThreshold = 0.5,
    negativeSpeechThreshold = 0.35,
    minSpeechFrames = 250,
    redemptionFrames = 6,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const vadRef = useRef<MicVAD | null>(null);
  const cleanupRef = useRef(false);
  const initializingRef = useRef(false); // Prevent concurrent initializations

  // Keep callback refs updated to avoid stale closures
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onVADMisfireRef = useRef(onVADMisfire);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
    onVADMisfireRef.current = onVADMisfire;
  }, [onSpeechStart, onSpeechEnd, onVADMisfire]);

  /**
   * Initialize the VAD
   */
  const initialize = useCallback(async (): Promise<MicVAD> => {
    // Prevent concurrent or duplicate initializations
    if (initializingRef.current) {
      voiceLog.debug("[SileroVAD] Already initializing, skipping...");
      // Wait for existing initialization to complete
      while (initializingRef.current && !vadRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (vadRef.current) return vadRef.current;
    }

    if (vadRef.current) {
      voiceLog.debug("[SileroVAD] Already initialized");
      return vadRef.current;
    }

    initializingRef.current = true;
    voiceLog.debug("[SileroVAD] Initializing...");
    setIsLoading(true);
    setError(null);

    try {
      const vadOptions: Partial<RealTimeVADOptions> = {
        // CDN paths for ONNX Runtime and VAD model files
        // Required for bundler environments (Vite, webpack, etc.)
        onnxWASMBasePath:
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
        baseAssetPath:
          "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
        onSpeechStart: () => {
          voiceLog.debug("[SileroVAD] Speech started");
          setIsSpeaking(true);
          onSpeechStartRef.current?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          voiceLog.debug(
            `[SileroVAD] Speech ended, audio length: ${audio.length}`,
          );
          setIsSpeaking(false);
          onSpeechEndRef.current?.(audio);
        },
        onVADMisfire: () => {
          voiceLog.debug("[SileroVAD] VAD misfire (speech too short)");
          setIsSpeaking(false);
          onVADMisfireRef.current?.();
        },
        positiveSpeechThreshold,
        negativeSpeechThreshold,
        minSpeechFrames,
        redemptionFrames,
      };

      // If external stream is provided, use it
      if (externalStream) {
        vadOptions.stream = externalStream;
      }

      const vad = await MicVAD.new(vadOptions);
      vadRef.current = vad;
      setIsReady(true);
      setIsLoading(false);
      initializingRef.current = false;

      voiceLog.info("[SileroVAD] Initialized successfully");
      return vad;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to initialize VAD");
      voiceLog.error("[SileroVAD] Initialization failed:", error);
      setError(error);
      setIsLoading(false);
      initializingRef.current = false;
      throw error;
    }
  }, [
    externalStream,
    positiveSpeechThreshold,
    negativeSpeechThreshold,
    minSpeechFrames,
    redemptionFrames,
  ]);

  /**
   * Start the VAD (begins listening)
   */
  const start = useCallback(async () => {
    try {
      if (!vadRef.current) {
        await initialize();
      }

      if (vadRef.current && !cleanupRef.current) {
        vadRef.current.start();
        setIsListening(true);
        voiceLog.debug("[SileroVAD] Started listening");
      }
    } catch (err) {
      voiceLog.error("[SileroVAD] Failed to start:", err);
    }
  }, [initialize]);

  /**
   * Pause the VAD (stops listening but keeps initialized)
   */
  const pause = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause();
      setIsListening(false);
      setIsSpeaking(false);
      voiceLog.debug("[SileroVAD] Paused");
    }
  }, []);

  /**
   * Stop the VAD (pause without destroying).
   * The VAD can be restarted with start().
   * Destroying only happens on component unmount.
   */
  const stop = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause();
      setIsListening(false);
      setIsSpeaking(false);
      // Keep isReady true - VAD is initialized but paused
      voiceLog.debug("[SileroVAD] Stopped (paused, not destroyed)");
    }
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
    };
  }, []);

  // Memoize return value to prevent object reference changes on every render
  // This prevents useEffect dependencies from re-triggering unnecessarily
  return useMemo(
    () => ({
      isListening,
      isSpeaking,
      isLoading,
      error,
      start,
      pause,
      stop,
      isReady,
    }),
    [isListening, isSpeaking, isLoading, error, start, pause, stop, isReady],
  );
}

export default useSileroVAD;
