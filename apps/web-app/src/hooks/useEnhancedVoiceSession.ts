/**
 * useEnhancedVoiceSession Hook
 *
 * Provides enhanced voice session capabilities by integrating WebSocket
 * Advanced Features with the existing Thinker/Talker voice pipeline.
 *
 * Features (when enabled via feature flags):
 * - WebRTC fallback for lower latency (20-50ms improvement)
 * - Adaptive bitrate based on network conditions
 * - AEC feedback loop for intelligent VAD sensitivity
 * - Barge-in gating based on AEC convergence state
 *
 * Phase: WebSocket Advanced Features
 *
 * @example
 * ```tsx
 * const {
 *   // Standard voice session properties
 *   status,
 *   transcript,
 *   connect,
 *   disconnect,
 *   // Enhanced features
 *   transportType,
 *   qualityLevel,
 *   aecState,
 *   isBargeInAllowed,
 * } = useEnhancedVoiceSession({
 *   conversation_id: "conv-123",
 * });
 * ```
 */

import { useEffect, useCallback, useRef, useMemo } from "react";
import { useFeatureFlag } from "./useExperiment";
import { WS_ADVANCED_FLAGS } from "../lib/featureFlags";
import {
  useThinkerTalkerSession,
  type UseThinkerTalkerSessionOptions,
} from "./useThinkerTalkerSession";
import {
  AECMonitor,
  createAECMonitor,
  type AECState,
  type AECMetrics,
} from "../lib/voice/AECMonitor";
import {
  AdaptiveBitrateController,
  createAdaptiveBitrateController,
  type AudioQualityLevel,
  type AudioQualityProfile,
} from "../lib/voice/AdaptiveBitrateController";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Enhanced voice session options
 */
export interface UseEnhancedVoiceSessionOptions extends UseThinkerTalkerSessionOptions {
  /** Override feature flag checks (for testing) */
  forceEnableWebRTC?: boolean;
  forceEnableAdaptiveBitrate?: boolean;
  forceEnableAECFeedback?: boolean;
}

/**
 * Enhanced features state
 */
export interface EnhancedFeaturesState {
  /** Current transport type (always 'websocket' for now, 'webrtc' when enabled) */
  transportType: "websocket" | "webrtc";
  /** Current audio quality level */
  qualityLevel: AudioQualityLevel;
  /** Current quality profile */
  qualityProfile: AudioQualityProfile | null;
  /** AEC convergence state */
  aecState: AECState;
  /** AEC metrics */
  aecMetrics: AECMetrics | null;
  /** Whether barge-in is currently allowed based on AEC state */
  isBargeInAllowed: boolean;
  /** VAD sensitivity multiplier based on AEC state */
  vadSensitivityMultiplier: number;
  /** Whether enhanced features are active */
  enhancedFeaturesActive: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useEnhancedVoiceSession(
  options: UseEnhancedVoiceSessionOptions = {},
) {
  const {
    forceEnableWebRTC,
    forceEnableAdaptiveBitrate,
    forceEnableAECFeedback,
    ...thinkerTalkerOptions
  } = options;

  // Check feature flags
  const { isEnabled: webrtcEnabled } = useFeatureFlag(
    WS_ADVANCED_FLAGS.WEBRTC_FALLBACK,
  );
  const { isEnabled: webrtcPrefer } = useFeatureFlag(
    WS_ADVANCED_FLAGS.WEBRTC_PREFER,
  );
  const { isEnabled: adaptiveBitrateEnabled } = useFeatureFlag(
    WS_ADVANCED_FLAGS.ADAPTIVE_BITRATE,
  );
  const { isEnabled: adaptiveAggressive } = useFeatureFlag(
    WS_ADVANCED_FLAGS.ADAPTIVE_BITRATE_AGGRESSIVE,
  );
  const { isEnabled: aecFeedbackEnabled } = useFeatureFlag(
    WS_ADVANCED_FLAGS.AEC_FEEDBACK,
  );
  const { isEnabled: aecBargeGateEnabled } = useFeatureFlag(
    WS_ADVANCED_FLAGS.AEC_BARGE_GATE,
  );

  // Apply overrides for testing
  const useWebRTC = forceEnableWebRTC ?? webrtcEnabled;
  const useAdaptiveBitrate =
    forceEnableAdaptiveBitrate ?? adaptiveBitrateEnabled;
  const useAECFeedback = forceEnableAECFeedback ?? aecFeedbackEnabled;

  // Refs for enhanced features
  const aecMonitorRef = useRef<AECMonitor | null>(null);
  const bitrateControllerRef = useRef<AdaptiveBitrateController | null>(null);
  const enhancedStateRef = useRef<EnhancedFeaturesState>({
    transportType: "websocket",
    qualityLevel: "high",
    qualityProfile: null,
    aecState: "idle",
    aecMetrics: null,
    isBargeInAllowed: true,
    vadSensitivityMultiplier: 1.0,
    enhancedFeaturesActive: false,
  });

  // Use the base Thinker/Talker session
  const ttSession = useThinkerTalkerSession({
    ...thinkerTalkerOptions,
    // Pass through AEC-aware callbacks
    onSpeechStarted: () => {
      // Check if barge-in should be gated based on AEC state
      if (aecBargeGateEnabled && aecMonitorRef.current) {
        const shouldAllow = aecMonitorRef.current.shouldAllowBargeIn();
        if (!shouldAllow) {
          voiceLog.debug("[EnhancedVoiceSession] Barge-in blocked by AEC gate");
          return;
        }
      }
      options.onSpeechStarted?.();
    },
  });

  // Initialize AEC monitor when feedback is enabled
  useEffect(() => {
    if (!useAECFeedback) {
      if (aecMonitorRef.current) {
        aecMonitorRef.current.dispose();
        aecMonitorRef.current = null;
      }
      return;
    }

    const monitor = createAECMonitor({
      enabled: true,
      reportIntervalMs: 500,
      echoThresholdDb: -45,
      debug: false,
    });

    aecMonitorRef.current = monitor;
    enhancedStateRef.current.enhancedFeaturesActive = true;

    // Set up event handlers
    monitor.onAll((event) => {
      enhancedStateRef.current.aecState = event.metrics.aecState;
      enhancedStateRef.current.aecMetrics = event.metrics;
      enhancedStateRef.current.isBargeInAllowed = monitor.shouldAllowBargeIn();
      enhancedStateRef.current.vadSensitivityMultiplier =
        monitor.getVADSensitivityMultiplier();
    });

    voiceLog.info("[EnhancedVoiceSession] AEC monitor initialized");

    return () => {
      monitor.dispose();
      aecMonitorRef.current = null;
    };
  }, [useAECFeedback]);

  // Initialize adaptive bitrate controller when enabled
  useEffect(() => {
    if (!useAdaptiveBitrate) {
      if (bitrateControllerRef.current) {
        bitrateControllerRef.current.stop();
        bitrateControllerRef.current = null;
      }
      return;
    }

    const controller = createAdaptiveBitrateController({
      enabled: true,
      aggressive: adaptiveAggressive,
      hysteresisCount: adaptiveAggressive ? 1 : 3,
    });

    bitrateControllerRef.current = controller;

    // Set up quality change handler
    controller.onQualityChange((event) => {
      enhancedStateRef.current.qualityLevel = event.newLevel;
      enhancedStateRef.current.qualityProfile = event.newProfile;

      voiceLog.info(
        `[EnhancedVoiceSession] Quality changed: ${event.previousLevel} -> ${event.newLevel} (${event.reason})`,
      );
    });

    // Start monitoring
    controller.start();

    voiceLog.info("[EnhancedVoiceSession] Adaptive bitrate initialized");

    return () => {
      controller.stop();
      bitrateControllerRef.current = null;
    };
  }, [useAdaptiveBitrate, adaptiveAggressive]);

  // Notify AEC monitor when TTS playback starts/stops
  const notifyOutputStarted = useCallback(() => {
    aecMonitorRef.current?.notifyOutputStarted();
  }, []);

  const notifyOutputStopped = useCallback(() => {
    aecMonitorRef.current?.notifyOutputStopped();
  }, []);

  // Get current VAD sensitivity multiplier
  const getVADSensitivityMultiplier = useCallback(() => {
    return aecMonitorRef.current?.getVADSensitivityMultiplier() ?? 1.0;
  }, []);

  // Check if barge-in is allowed
  const isBargeInAllowed = useCallback(() => {
    if (!aecBargeGateEnabled || !aecMonitorRef.current) {
      return true;
    }
    return aecMonitorRef.current.shouldAllowBargeIn();
  }, [aecBargeGateEnabled]);

  // Get current enhanced features state
  const getEnhancedState = useCallback((): EnhancedFeaturesState => {
    return { ...enhancedStateRef.current };
  }, []);

  // Compute derived state
  const enhancedFeaturesActive = useMemo(
    () => useWebRTC || useAdaptiveBitrate || useAECFeedback,
    [useWebRTC, useAdaptiveBitrate, useAECFeedback],
  );

  // Feature flags status
  const featureFlags = useMemo(
    () => ({
      webrtcFallback: webrtcEnabled,
      webrtcPrefer: webrtcPrefer,
      adaptiveBitrate: adaptiveBitrateEnabled,
      adaptiveAggressive: adaptiveAggressive,
      aecFeedback: aecFeedbackEnabled,
      aecBargeGate: aecBargeGateEnabled,
    }),
    [
      webrtcEnabled,
      webrtcPrefer,
      adaptiveBitrateEnabled,
      adaptiveAggressive,
      aecFeedbackEnabled,
      aecBargeGateEnabled,
    ],
  );

  return {
    // Pass through all base session properties
    ...ttSession,

    // Enhanced features state
    enhancedFeaturesActive,
    transportType: enhancedStateRef.current.transportType,
    qualityLevel: enhancedStateRef.current.qualityLevel,
    qualityProfile: enhancedStateRef.current.qualityProfile,
    aecState: enhancedStateRef.current.aecState,
    aecMetrics: enhancedStateRef.current.aecMetrics,

    // Enhanced features methods
    notifyOutputStarted,
    notifyOutputStopped,
    getVADSensitivityMultiplier,
    isBargeInAllowed,
    getEnhancedState,

    // Feature flags status
    featureFlags,

    // Direct access to controllers (for advanced use)
    aecMonitor: aecMonitorRef.current,
    bitrateController: bitrateControllerRef.current,
  };
}

export default useEnhancedVoiceSession;
