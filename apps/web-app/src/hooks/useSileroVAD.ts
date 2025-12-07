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
 * - Echo-aware mode: raises threshold during AI playback to filter TTS echo
 * - Confidence tracking for hybrid decision-making with backend
 * - Provides onSpeechStart and onSpeechEnd callbacks
 *
 * Echo Cancellation Strategy:
 * Instead of completely pausing VAD during AI playback (which causes missed
 * barge-ins), we use an elevated threshold that requires stronger speech
 * signals. This allows real user speech to trigger barge-in while filtering
 * out the AI's own audio picked up by the microphone.
 *
 * Used for:
 * - Instant barge-in detection during AI speech
 * - Reliable voice activity indication
 * - Hybrid VAD with backend Deepgram
 *
 * @see https://github.com/ricky0123/vad
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MicVAD, type RealTimeVADOptions } from "@ricky0123/vad-web";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Echo suppression modes for handling AI playback.
 *
 * - "pause": Completely pause VAD during playback (original behavior)
 * - "threshold_boost": Keep VAD active but raise threshold (recommended)
 * - "none": No echo suppression (not recommended)
 */
export type EchoSuppressionMode = "pause" | "threshold_boost" | "none";

export interface SileroVADOptions {
  /** Called when speech starts (user begins talking) */
  onSpeechStart?: () => void;
  /** Called when speech ends, with audio data */
  onSpeechEnd?: (audio: Float32Array) => void;
  /** Called on VAD misfire (speech detected but too short) */
  onVADMisfire?: () => void;
  /**
   * Called with speech probability on each frame (for confidence sharing).
   * Only called when speech is detected (probability >= threshold).
   * Use this to send confidence levels to backend for hybrid VAD.
   */
  onSpeechProbability?: (probability: number) => void;
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
   * Minimum duration of speech (ms) before triggering onSpeechStart.
   * Helps filter out short noise bursts.
   * Default: 250
   */
  minSpeechMs?: number;
  /**
   * Time (ms) to wait after speech ends before triggering onSpeechEnd.
   * Prevents premature cutoff during natural pauses.
   * Default: 100
   */
  redemptionMs?: number;

  // =========================================================================
  // Echo Cancellation Options (Phase 1)
  // =========================================================================

  /**
   * Echo suppression mode during AI playback.
   * - "pause": Completely pause VAD (may miss barge-ins)
   * - "threshold_boost": Raise threshold to filter echo while allowing real speech
   * - "none": No suppression (may cause false triggers)
   * Default: "threshold_boost"
   */
  echoSuppressionMode?: EchoSuppressionMode;
  /**
   * Amount to boost the positive speech threshold during AI playback (0-0.5).
   * Applied when echoSuppressionMode is "threshold_boost".
   * Higher = more aggressive echo filtering, may miss quiet barge-ins.
   * Default: 0.2 (threshold becomes 0.5 + 0.2 = 0.7 during playback)
   */
  playbackThresholdBoost?: number;
  /**
   * Minimum speech duration (ms) required during playback to trigger barge-in.
   * Longer duration helps filter echo bursts from TTS.
   * Default: 200
   */
  playbackMinSpeechMs?: number;
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

  // =========================================================================
  // Echo-Aware Methods (Phase 1)
  // =========================================================================

  /**
   * Notify VAD that AI playback is starting/stopping.
   * When active, applies echo suppression based on echoSuppressionMode.
   */
  setPlaybackActive: (active: boolean) => void;
  /** Whether AI playback is currently active (echo suppression may be engaged) */
  isPlaybackActive: boolean;
  /**
   * Current effective speech threshold (may be boosted during playback).
   * Useful for UI display and debugging.
   */
  effectiveThreshold: number;
  /**
   * Last speech probability from VAD (0-1).
   * Useful for confidence sharing with backend.
   */
  lastSpeechProbability: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSileroVAD(options: SileroVADOptions = {}): SileroVADReturn {
  const {
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire,
    onSpeechProbability,
    autoStart = false,
    externalStream = null,
    positiveSpeechThreshold = 0.5,
    negativeSpeechThreshold = 0.35,
    minSpeechMs = 250,
    redemptionMs = 100,
    // Echo cancellation options (Phase 1)
    echoSuppressionMode = "threshold_boost",
    playbackThresholdBoost = 0.2,
    playbackMinSpeechMs = 200,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Echo-aware state (Phase 1)
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [lastSpeechProbability, setLastSpeechProbability] = useState(0);

  // Refs
  const vadRef = useRef<MicVAD | null>(null);
  const cleanupRef = useRef(false);
  const initializingRef = useRef(false); // Prevent concurrent initializations

  // Echo-aware refs (Phase 1)
  const isPlaybackActiveRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);

  // Keep callback refs updated to avoid stale closures
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onVADMisfireRef = useRef(onVADMisfire);
  const onSpeechProbabilityRef = useRef(onSpeechProbability);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
    onVADMisfireRef.current = onVADMisfire;
    onSpeechProbabilityRef.current = onSpeechProbability;
  }, [onSpeechStart, onSpeechEnd, onVADMisfire, onSpeechProbability]);

  // Calculate effective threshold (boosted during playback)
  const effectiveThreshold = useMemo(() => {
    if (isPlaybackActive && echoSuppressionMode === "threshold_boost") {
      return Math.min(0.95, positiveSpeechThreshold + playbackThresholdBoost);
    }
    return positiveSpeechThreshold;
  }, [
    isPlaybackActive,
    echoSuppressionMode,
    positiveSpeechThreshold,
    playbackThresholdBoost,
  ]);

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

        // Echo-aware speech detection (Phase 1)
        // These callbacks check playback state and apply appropriate filtering
        onSpeechStart: () => {
          speechStartTimeRef.current = Date.now();

          // During playback with threshold_boost mode, VAD is still active
          // but we track when speech started to enforce minimum duration
          if (
            isPlaybackActiveRef.current &&
            echoSuppressionMode === "threshold_boost"
          ) {
            voiceLog.debug(
              "[SileroVAD] Speech started during playback (echo-aware mode)",
            );
          } else {
            voiceLog.debug("[SileroVAD] Speech started");
          }

          setIsSpeaking(true);
          onSpeechStartRef.current?.();
        },

        onSpeechEnd: (audio: Float32Array) => {
          const speechDurationMs = speechStartTimeRef.current
            ? Date.now() - speechStartTimeRef.current
            : 0;
          speechStartTimeRef.current = null;

          // During playback, enforce minimum speech duration to filter echo
          if (isPlaybackActiveRef.current) {
            if (speechDurationMs < playbackMinSpeechMs) {
              voiceLog.debug(
                `[SileroVAD] Speech during playback too short (${speechDurationMs}ms < ${playbackMinSpeechMs}ms), likely echo - ignoring`,
              );
              setIsSpeaking(false);
              // Treat as misfire, not real speech
              onVADMisfireRef.current?.();
              return;
            }
            voiceLog.debug(
              `[SileroVAD] Valid speech during playback (${speechDurationMs}ms), triggering barge-in`,
            );
          } else {
            voiceLog.debug(
              `[SileroVAD] Speech ended, audio length: ${audio.length}`,
            );
          }

          setIsSpeaking(false);
          onSpeechEndRef.current?.(audio);
        },

        onVADMisfire: () => {
          speechStartTimeRef.current = null;
          voiceLog.debug("[SileroVAD] VAD misfire (speech too short)");
          setIsSpeaking(false);
          onVADMisfireRef.current?.();
        },

        // Note: The VAD library processes frames internally and uses these thresholds.
        // We use the base threshold here; echo-aware filtering happens in callbacks above.
        positiveSpeechThreshold,
        negativeSpeechThreshold,
        minSpeechMs,
        redemptionMs,
      };

      // If external stream is provided, use it via getStream callback
      if (externalStream) {
        vadOptions.getStream = async () => externalStream;
      }

      const vad = await MicVAD.new(vadOptions);
      vadRef.current = vad;
      setIsReady(true);
      setIsLoading(false);
      initializingRef.current = false;

      voiceLog.info("[SileroVAD] Initialized successfully", {
        echoSuppressionMode,
        playbackThresholdBoost,
        playbackMinSpeechMs,
      });
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
    minSpeechMs,
    redemptionMs,
    echoSuppressionMode,
    playbackThresholdBoost,
    playbackMinSpeechMs,
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

  /**
   * Set AI playback active state for echo suppression (Phase 1).
   *
   * When playback is active:
   * - "threshold_boost" mode: VAD stays active but requires stronger speech
   * - "pause" mode: VAD is paused entirely
   * - "none" mode: No change
   */
  const setPlaybackActiveHandler = useCallback(
    (active: boolean) => {
      isPlaybackActiveRef.current = active;
      setIsPlaybackActive(active);

      if (echoSuppressionMode === "pause") {
        // Original behavior: completely pause VAD during playback
        if (active) {
          voiceLog.debug(
            "[SileroVAD] Playback active - pausing VAD (pause mode)",
          );
          vadRef.current?.pause();
          setIsListening(false);
        } else {
          voiceLog.debug(
            "[SileroVAD] Playback ended - resuming VAD (pause mode)",
          );
          // Small delay to avoid picking up end of audio playback
          setTimeout(() => {
            if (!isPlaybackActiveRef.current && vadRef.current) {
              vadRef.current.start();
              setIsListening(true);
            }
          }, 100);
        }
      } else if (echoSuppressionMode === "threshold_boost") {
        // New behavior: keep VAD active with raised threshold
        voiceLog.debug(
          `[SileroVAD] Playback ${active ? "active" : "ended"} - echo-aware mode with boosted threshold`,
        );
        // VAD stays active, echo filtering happens in callbacks
      }
      // "none" mode: do nothing
    },
    [echoSuppressionMode],
  );

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

      // Echo-aware features (Phase 1)
      setPlaybackActive: setPlaybackActiveHandler,
      isPlaybackActive,
      effectiveThreshold,
      lastSpeechProbability,
    }),
    [
      isListening,
      isSpeaking,
      isLoading,
      error,
      start,
      pause,
      stop,
      isReady,
      setPlaybackActiveHandler,
      isPlaybackActive,
      effectiveThreshold,
      lastSpeechProbability,
    ],
  );
}

export default useSileroVAD;
