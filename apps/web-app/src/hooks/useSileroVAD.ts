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
  /**
   * Master enable/disable for Silero VAD.
   * When false, VAD will not initialize and all operations become no-ops.
   * This is controlled by feature flag: backend.voice_silero_vad_enabled
   * Default: true
   */
  enabled?: boolean;

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

  // =========================================================================
  // Adaptive VAD Options (Phase 3)
  // =========================================================================

  /**
   * Enable adaptive VAD threshold based on ambient noise level.
   * When enabled, VAD monitors background noise and adjusts threshold dynamically.
   * Default: true
   */
  enableAdaptiveThreshold?: boolean;
  /**
   * Duration (ms) to measure ambient noise at startup for calibration.
   * Default: 1000
   */
  noiseCalibrationMs?: number;
  /**
   * How much to adjust threshold per unit of noise (0-0.3).
   * Higher = more aggressive adjustment.
   * Default: 0.1
   */
  noiseAdaptationFactor?: number;
  /**
   * Minimum threshold even in quiet environments (0.3-0.5).
   * Default: 0.3
   */
  minAdaptiveThreshold?: number;
  /**
   * Maximum threshold even in noisy environments (0.7-0.9).
   * Default: 0.8
   */
  maxAdaptiveThreshold?: number;
  /**
   * Enable streaming confidence payloads to backend (Phase 2).
   * Allows gating by feature flag to avoid unnecessary network chatter.
   * Default: true
   */
  enableConfidenceStreaming?: boolean;

  // =========================================================================
  // AEC Feedback Options (Phase 4.3)
  // =========================================================================

  /**
   * Additional threshold boost when AEC is not converged.
   * Applied when browser reports AEC is still learning the echo path.
   * Helps prevent echo-triggered speech detection during AEC convergence.
   * Default: 0.1
   * Natural Conversation Flow: Phase 4.3 - AEC Feedback Loop
   */
  aecNotConvergedBoost?: number;
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

  // =========================================================================
  // Phase 2: Confidence Sharing
  // =========================================================================

  /**
   * Current speech duration in milliseconds (updated during speech).
   * Useful for confidence sharing with backend.
   */
  speechDurationMs: number;

  /**
   * Get current VAD state for sharing with backend.
   * Returns an object suitable for sending via WebSocket.
   */
  getVADState: () => VADStateMessage;
  /**
   * Whether confidence streaming is currently enabled (feature-flag gated).
   */
  confidenceStreamingEnabled?: boolean;

  // =========================================================================
  // Phase 3: Adaptive VAD
  // =========================================================================

  /**
   * Whether noise calibration is in progress.
   */
  isCalibrating: boolean;

  /**
   * Whether noise calibration has completed.
   */
  isCalibrated: boolean;

  /**
   * Current estimated ambient noise level (0-1).
   * Updated continuously during silence periods.
   */
  noiseFloor: number;

  /**
   * Run noise calibration to measure ambient noise level.
   * This takes ~1 second and updates the threshold accordingly.
   */
  calibrateNoise: () => Promise<void>;

  /**
   * Current adaptive threshold (combines base threshold + noise adjustment).
   */
  adaptiveThreshold: number;

  // =========================================================================
  // Phase 4.3: AEC Feedback (Natural Conversation Flow)
  // =========================================================================

  /**
   * Whether AEC (Acoustic Echo Cancellation) is converged.
   * When false, VAD threshold is boosted to prevent echo triggers.
   */
  isAECConverged: boolean;

  /**
   * Set AEC convergence state (called from useAECFeedback hook).
   * When AEC is not converged, VAD threshold is boosted.
   */
  setAECConverged: (converged: boolean) => void;
}

/**
 * VAD state message for WebSocket sharing (Phase 2).
 */
export interface VADStateMessage {
  type: "vad.state";
  silero_confidence: number;
  is_speaking: boolean;
  speech_duration_ms: number;
  is_playback_active: boolean;
  effective_threshold: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSileroVAD(options: SileroVADOptions = {}): SileroVADReturn {
  const {
    // Master enable flag (feature flag: backend.voice_silero_vad_enabled)
    enabled = true,
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
    // Adaptive VAD options (Phase 3)
    enableAdaptiveThreshold = true,
    noiseCalibrationMs = 1000,
    noiseAdaptationFactor = 0.1,
    minAdaptiveThreshold = 0.3,
    maxAdaptiveThreshold = 0.8,
    enableConfidenceStreaming = true,
    // AEC Feedback options (Phase 4.3)
    aecNotConvergedBoost = 0.1,
  } = options;

  // If VAD is disabled via feature flag, return a disabled/no-op state
  // This allows the feature to be completely rolled back without code changes
  const disabledReturn = useMemo(
    (): SileroVADReturn => ({
      isListening: false,
      isSpeaking: false,
      isLoading: false,
      error: null,
      start: async () => {
        voiceLog.debug(
          "[SileroVAD] VAD disabled via feature flag - start() is no-op",
        );
      },
      pause: () => {},
      stop: () => {},
      isReady: false,
      setPlaybackActive: () => {},
      isPlaybackActive: false,
      effectiveThreshold: positiveSpeechThreshold,
      lastSpeechProbability: 0,
      speechDurationMs: 0,
      getVADState: () => ({
        type: "vad.state" as const,
        silero_confidence: 0,
        is_speaking: false,
        speech_duration_ms: 0,
        is_playback_active: false,
        effective_threshold: positiveSpeechThreshold,
      }),
      confidenceStreamingEnabled: false,
      isCalibrating: false,
      isCalibrated: false,
      noiseFloor: 0,
      calibrateNoise: async () => {},
      adaptiveThreshold: positiveSpeechThreshold,
      // Phase 4.3: AEC Feedback (Natural Conversation Flow)
      isAECConverged: true,
      setAECConverged: () => {},
    }),
    [positiveSpeechThreshold],
  );

  // Log when VAD is disabled
  useEffect(() => {
    if (!enabled) {
      voiceLog.info(
        "[SileroVAD] VAD disabled via feature flag (backend.voice_silero_vad_enabled = false)",
      );
    }
  }, [enabled]);

  // State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Echo-aware state (Phase 1)
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [lastSpeechProbability, setLastSpeechProbability] = useState(0);

  // Phase 2: Confidence sharing state
  const [speechDurationMs, setSpeechDurationMs] = useState(0);

  // Phase 3: Adaptive VAD state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [adaptiveThreshold, setAdaptiveThreshold] = useState(
    positiveSpeechThreshold,
  );

  // Phase 4.3: AEC Feedback state (Natural Conversation Flow)
  const [isAECConverged, setIsAECConverged] = useState(true);

  // Refs
  const vadRef = useRef<MicVAD | null>(null);
  const cleanupRef = useRef(false);
  const initializingRef = useRef(false); // Prevent concurrent initializations

  // Echo-aware refs (Phase 1)
  const isPlaybackActiveRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);

  // Phase 2: Confidence sharing refs
  const lastProbabilityRef = useRef(0);
  const confidenceStreamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Phase 3: Adaptive VAD refs
  const noiseSamplesRef = useRef<number[] | null>(null);
  const isCalibratingRef = useRef(false);
  const noiseCalibrationResolveRef = useRef<(() => void) | null>(null);
  const lastEngineThresholdRef = useRef(positiveSpeechThreshold);

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

  const negativeRatio = useMemo(() => {
    if (positiveSpeechThreshold <= 0) return 0.7;
    return Math.max(
      0.2,
      Math.min(1, negativeSpeechThreshold / positiveSpeechThreshold),
    );
  }, [negativeSpeechThreshold, positiveSpeechThreshold]);

  // Calculate effective threshold (adaptive + echo boost during playback)
  const baseAdaptiveThreshold = useMemo(() => {
    if (enableAdaptiveThreshold && isCalibrated) {
      return adaptiveThreshold;
    }
    return positiveSpeechThreshold;
  }, [
    enableAdaptiveThreshold,
    isCalibrated,
    adaptiveThreshold,
    positiveSpeechThreshold,
  ]);

  const effectiveThreshold = useMemo(() => {
    // Phase 1: Playback echo suppression boost
    const playbackBoost =
      isPlaybackActive && echoSuppressionMode === "threshold_boost"
        ? playbackThresholdBoost
        : 0;
    // Phase 4.3: AEC not converged boost (Natural Conversation Flow)
    const aecBoost = !isAECConverged ? aecNotConvergedBoost : 0;
    return Math.min(
      0.95,
      Math.max(0.05, baseAdaptiveThreshold + playbackBoost + aecBoost),
    );
  }, [
    baseAdaptiveThreshold,
    echoSuppressionMode,
    isPlaybackActive,
    playbackThresholdBoost,
    isAECConverged,
    aecNotConvergedBoost,
  ]);

  const effectiveNegativeThreshold = useMemo(() => {
    return Math.min(0.9, Math.max(0.05, effectiveThreshold * negativeRatio));
  }, [effectiveThreshold, negativeRatio]);

  // If adaptive threshold changes after calibration, reinitialize VAD to apply it.
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
          const thresholdForStart = Math.min(
            0.95,
            Math.max(
              0.05,
              (enableAdaptiveThreshold && isCalibrated
                ? adaptiveThreshold
                : positiveSpeechThreshold) +
                (isPlaybackActiveRef.current &&
                echoSuppressionMode === "threshold_boost"
                  ? playbackThresholdBoost
                  : 0),
            ),
          );

          // Ignore low-confidence starts (echo/noise) based on current threshold
          if (lastProbabilityRef.current < thresholdForStart) {
            voiceLog.debug(
              `[SileroVAD] Speech start below threshold (${lastProbabilityRef.current.toFixed(2)} < ${thresholdForStart.toFixed(2)}), ignoring`,
            );
            speechStartTimeRef.current = null;
            setIsSpeaking(false);
            onVADMisfireRef.current?.();
            return;
          }

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
          setSpeechDurationMs(0);

          // Phase 2: Start streaming confidence at 100ms intervals
          if (enableConfidenceStreaming) {
            if (confidenceStreamIntervalRef.current) {
              clearInterval(confidenceStreamIntervalRef.current);
            }
            confidenceStreamIntervalRef.current = setInterval(() => {
              const duration = speechStartTimeRef.current
                ? Date.now() - speechStartTimeRef.current
                : 0;
              setSpeechDurationMs(duration);
              // Call the probability callback with the last known probability
              onSpeechProbabilityRef.current?.(lastProbabilityRef.current);
            }, 100);
          }

          onSpeechStartRef.current?.();
        },

        onSpeechEnd: (audio: Float32Array) => {
          const duration = speechStartTimeRef.current
            ? Date.now() - speechStartTimeRef.current
            : 0;
          speechStartTimeRef.current = null;

          // Phase 2: Stop confidence streaming
          if (confidenceStreamIntervalRef.current) {
            clearInterval(confidenceStreamIntervalRef.current);
            confidenceStreamIntervalRef.current = null;
          }

          // During playback, enforce minimum speech duration to filter echo
          if (isPlaybackActiveRef.current) {
            if (duration < playbackMinSpeechMs) {
              voiceLog.debug(
                `[SileroVAD] Speech during playback too short (${duration}ms < ${playbackMinSpeechMs}ms), likely echo - ignoring`,
              );
              setIsSpeaking(false);
              setSpeechDurationMs(0);
              // Treat as misfire, not real speech
              onVADMisfireRef.current?.();
              return;
            }
            voiceLog.debug(
              `[SileroVAD] Valid speech during playback (${duration}ms), triggering barge-in`,
            );
          } else {
            voiceLog.debug(
              `[SileroVAD] Speech ended, audio length: ${audio.length}`,
            );
          }

          setIsSpeaking(false);
          setSpeechDurationMs(duration);
          onSpeechEndRef.current?.(audio);
        },

        onVADMisfire: () => {
          speechStartTimeRef.current = null;
          // Phase 2: Stop confidence streaming
          if (confidenceStreamIntervalRef.current) {
            clearInterval(confidenceStreamIntervalRef.current);
            confidenceStreamIntervalRef.current = null;
          }
          voiceLog.debug("[SileroVAD] VAD misfire (speech too short)");
          setIsSpeaking(false);
          setSpeechDurationMs(0);
          onVADMisfireRef.current?.();
        },

        // Phase 2: Track frame-level probabilities for confidence sharing
        // Phase 3: Collect noise samples during calibration
        onFrameProcessed: (probabilities) => {
          const speechProb = probabilities.isSpeech;
          lastProbabilityRef.current = speechProb;
          setLastSpeechProbability(speechProb);

          // Phase 3: Collect noise samples during calibration
          // Only sample low-probability frames (likely noise, not speech)
          if (
            isCalibratingRef.current &&
            noiseSamplesRef.current !== null &&
            speechProb < 0.3
          ) {
            noiseSamplesRef.current.push(speechProb);
          }
        },

        // Note: The VAD library processes frames internally and uses these thresholds.
        // We use the base threshold here; echo-aware filtering happens in callbacks above.
        positiveSpeechThreshold: effectiveThreshold,
        negativeSpeechThreshold: effectiveNegativeThreshold,
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
    effectiveThreshold,
    effectiveNegativeThreshold,
    minSpeechMs,
    redemptionMs,
    echoSuppressionMode,
    playbackThresholdBoost,
    playbackMinSpeechMs,
    enableAdaptiveThreshold,
    isCalibrated,
    adaptiveThreshold,
    positiveSpeechThreshold,
  ]);

  // Re-initialize the engine when adaptive thresholds change significantly
  useEffect(() => {
    if (!enableAdaptiveThreshold) {
      lastEngineThresholdRef.current = baseAdaptiveThreshold;
      return;
    }

    const delta = Math.abs(
      baseAdaptiveThreshold - lastEngineThresholdRef.current,
    );
    if (delta < 0.01) {
      return;
    }

    lastEngineThresholdRef.current = baseAdaptiveThreshold;

    // If VAD hasn't been created yet, just store the new threshold for first init.
    if (!vadRef.current) {
      return;
    }

    const wasListening = isListening;

    const reinitialize = async () => {
      try {
        vadRef.current?.pause();
        vadRef.current?.destroy();
      } catch (err) {
        voiceLog.warn("[SileroVAD] Failed to destroy VAD during reinit", err);
      }

      vadRef.current = null;
      setIsReady(false);
      setIsSpeaking(false);
      setIsListening(false);

      try {
        await initialize();
        if (wasListening && vadRef.current && !cleanupRef.current) {
          vadRef.current.start();
          setIsListening(true);
        }
        voiceLog.info(
          `[SileroVAD] Reinitialized with adaptive threshold ${baseAdaptiveThreshold.toFixed(3)}`,
        );
      } catch (err) {
        voiceLog.warn(
          "[SileroVAD] Reinitialization failed after calibration",
          err,
        );
      }
    };

    reinitialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseAdaptiveThreshold, enableAdaptiveThreshold, initialize, isListening]);

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

  /**
   * Phase 3: Calibrate noise level for adaptive threshold.
   *
   * Measures ambient noise for noiseCalibrationMs and calculates
   * an adaptive threshold that filters out background noise while
   * remaining sensitive to actual speech.
   */
  const calibrateNoise = useCallback(async (): Promise<void> => {
    if (!vadRef.current || !enableAdaptiveThreshold) {
      voiceLog.debug(
        "[SileroVAD] Skipping calibration (VAD not ready or adaptive disabled)",
      );
      return;
    }

    if (isCalibrating) {
      voiceLog.debug("[SileroVAD] Calibration already in progress");
      return;
    }

    voiceLog.info("[SileroVAD] Starting noise calibration...");
    setIsCalibrating(true);
    isCalibratingRef.current = true;
    noiseSamplesRef.current = [];

    return new Promise<void>((resolve) => {
      noiseCalibrationResolveRef.current = resolve;

      // Collect noise samples for the calibration duration
      setTimeout(() => {
        const samples = noiseSamplesRef.current;
        if (samples.length > 0) {
          // Calculate noise floor as average of lowest 50% of samples
          // This filters out any speech that occurred during calibration
          const sortedSamples = [...samples].sort((a, b) => a - b);
          const lowerHalf = sortedSamples.slice(
            0,
            Math.ceil(sortedSamples.length / 2),
          );
          const avgNoise =
            lowerHalf.reduce((sum, s) => sum + s, 0) / lowerHalf.length;

          setNoiseFloor(avgNoise);

          // Calculate adaptive threshold
          // Higher noise = higher threshold, but clamped to min/max
          const adjustedThreshold = Math.min(
            maxAdaptiveThreshold,
            Math.max(
              minAdaptiveThreshold,
              positiveSpeechThreshold + avgNoise * noiseAdaptationFactor,
            ),
          );

          setAdaptiveThreshold(adjustedThreshold);
          setIsCalibrated(true);

          voiceLog.info(
            `[SileroVAD] Calibration complete: noise floor=${avgNoise.toFixed(3)}, ` +
              `adaptive threshold=${adjustedThreshold.toFixed(3)} (samples=${samples.length})`,
          );
        } else {
          voiceLog.warn("[SileroVAD] Calibration failed: no samples collected");
          setAdaptiveThreshold(positiveSpeechThreshold);
        }

        setIsCalibrating(false);
        isCalibratingRef.current = false;
        noiseSamplesRef.current = null;
        noiseCalibrationResolveRef.current = null;
        resolve();
      }, noiseCalibrationMs);
    });
  }, [
    enableAdaptiveThreshold,
    isCalibrating,
    noiseCalibrationMs,
    noiseAdaptationFactor,
    positiveSpeechThreshold,
    minAdaptiveThreshold,
    maxAdaptiveThreshold,
  ]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  // Phase 2: Get current VAD state for WebSocket sharing
  const getVADState = useCallback((): VADStateMessage => {
    return {
      type: "vad.state",
      silero_confidence: lastProbabilityRef.current,
      is_speaking: isSpeaking,
      speech_duration_ms: speechDurationMs,
      is_playback_active: isPlaybackActive,
      effective_threshold: effectiveThreshold,
    };
  }, [isSpeaking, speechDurationMs, isPlaybackActive, effectiveThreshold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      // Phase 2: Clean up confidence streaming interval
      if (confidenceStreamIntervalRef.current) {
        clearInterval(confidenceStreamIntervalRef.current);
        confidenceStreamIntervalRef.current = null;
      }
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
    };
  }, []);

  // Memoize return value to prevent object reference changes on every render
  // This prevents useEffect dependencies from re-triggering unnecessarily
  const memoizedReturn = useMemo(
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

      // Phase 2: Confidence sharing
      speechDurationMs,
      getVADState,
      confidenceStreamingEnabled: enableConfidenceStreaming,

      // Phase 3: Adaptive VAD
      isCalibrating,
      isCalibrated,
      noiseFloor,
      calibrateNoise,
      adaptiveThreshold,

      // Phase 4.3: AEC Feedback (Natural Conversation Flow)
      isAECConverged,
      setAECConverged,
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
      speechDurationMs,
      getVADState,
      enableConfidenceStreaming,
      // Phase 3
      isCalibrating,
      isCalibrated,
      noiseFloor,
      calibrateNoise,
      adaptiveThreshold,
      // Phase 4.3
      isAECConverged,
      setAECConverged,
    ],
  );

  // If VAD is disabled via feature flag, return the disabled/no-op state
  // This allows complete disabling of VAD when backend.voice_silero_vad_enabled = false
  if (!enabled) {
    return disabledReturn;
  }

  return memoizedReturn;
}

export default useSileroVAD;
