/**
 * Intelligent Barge-In Hook
 *
 * Wraps useThinkerTalkerVoiceMode with intelligent barge-in features:
 * - State machine for barge-in flow
 * - Classification-based interruption handling
 * - Metrics tracking
 * - Keyboard shortcuts integration
 *
 * Natural Conversation Flow: Phase 1 - Frontend Integration
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThinkerTalkerVoiceMode } from "../useThinkerTalkerVoiceMode";
import { useVoiceKeyboardShortcuts } from "../useVoiceKeyboardShortcuts";
import { voiceLog } from "../../lib/logger";
import {
  BargeInConfig,
  BargeInEvent,
  BargeInMetrics,
  BargeInState,
  CalibrationResult,
  DEFAULT_BARGE_IN_CONFIG,
  SupportedLanguage,
  UseIntelligentBargeInReturn,
} from "./types";

// ============================================================================
// Options Interface
// ============================================================================

export interface UseIntelligentBargeInOptions {
  /** Conversation ID for context */
  conversationId?: string;
  /** Initial configuration overrides */
  config?: Partial<BargeInConfig>;
  /** Enable keyboard shortcuts (M=mute, Space=toggle, Esc=stop) */
  enableKeyboardShortcuts?: boolean;
  /** Callback when barge-in is detected */
  onBargeIn?: (event: BargeInEvent) => void;
  /** Callback when user transcript is finalized */
  onUserTranscript?: (transcript: string) => void;
  /** Callback when AI response is received */
  onAIResponse?: (response: string) => void;
  /** Callback when metrics update */
  onMetricsUpdate?: (metrics: BargeInMetrics) => void;
}

// ============================================================================
// State Machine Mapping
// ============================================================================

function mapPipelineStateToBargeInState(
  pipelineState: string,
  isConnecting: boolean,
  isSileroVADActive: boolean,
  isPlaying: boolean,
  isSpeaking: boolean,
): BargeInState {
  if (isConnecting) return "connecting";

  switch (pipelineState) {
    case "idle":
      return isSileroVADActive ? "listening" : "idle";
    case "listening":
      return isSileroVADActive ? "listening" : "idle";
    case "thinking":
      return "processing_llm";
    case "speaking":
      return isPlaying ? "ai_speaking" : "ai_responding";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useIntelligentBargeIn(
  options: UseIntelligentBargeInOptions = {},
): UseIntelligentBargeInReturn {
  const {
    conversationId,
    config: configOverrides = {},
    enableKeyboardShortcuts = true,
    onBargeIn,
    onUserTranscript,
    onAIResponse,
    onMetricsUpdate,
  } = options;

  // Merge configuration with defaults
  const [config, setConfig] = useState<BargeInConfig>({
    ...DEFAULT_BARGE_IN_CONFIG,
    ...configOverrides,
  });

  // Barge-in event history
  const [bargeInHistory, setBargeInHistory] = useState<BargeInEvent[]>([]);
  const [lastBargeInEvent, setLastBargeInEvent] = useState<BargeInEvent | null>(
    null,
  );

  // Metrics tracking
  const [metrics, setMetrics] = useState<BargeInMetrics>({
    vadLatencyMs: 0,
    classificationLatencyMs: 0,
    totalBargeIns: 0,
    backchannelCount: 0,
    softBargeCount: 0,
    hardBargeCount: 0,
    falsePositives: 0,
    sessionDuration: 0,
  });

  // Session start time for duration tracking
  const sessionStartRef = useRef<number | null>(null);

  // Use the underlying voice mode hook
  const voiceMode = useThinkerTalkerVoiceMode({
    conversation_id: conversationId,
    onUserTranscript: (transcript) => {
      onUserTranscript?.(transcript);
    },
    onAIResponse: (response) => {
      onAIResponse?.(response);
    },
    onMetricsUpdate: (m) => {
      // Update VAD latency from underlying metrics
      if (m.ttfaMs) {
        setMetrics((prev) => ({
          ...prev,
          vadLatencyMs: m.ttfaMs ?? prev.vadLatencyMs,
        }));
      }
      onMetricsUpdate?.(metrics);
    },
  });

  // Compute state from voice mode
  const state = useMemo<BargeInState>(() => {
    return mapPipelineStateToBargeInState(
      voiceMode.pipelineState,
      voiceMode.isConnecting,
      voiceMode.isSileroVADActive,
      voiceMode.isPlaying,
      voiceMode.isSpeaking,
    );
  }, [
    voiceMode.pipelineState,
    voiceMode.isConnecting,
    voiceMode.isSileroVADActive,
    voiceMode.isPlaying,
    voiceMode.isSpeaking,
  ]);

  // Derived state flags
  const isListening = state === "listening" || state === "speech_detected";
  const isSpeaking = state === "ai_speaking" || state === "ai_responding";
  const isProcessing = state === "processing_llm" || state === "processing_stt";
  const currentConfidence = voiceMode.sileroVADConfidence;

  // Detected language (placeholder - would come from STT service)
  const [detectedLanguage, setDetectedLanguage] =
    useState<SupportedLanguage | null>(null);

  // ============================================================================
  // Actions
  // ============================================================================

  const startListening = useCallback(async () => {
    voiceLog.debug("[IntelligentBargeIn] Starting listening");
    sessionStartRef.current = Date.now();
    await voiceMode.connect();
  }, [voiceMode]);

  const stopListening = useCallback(() => {
    voiceLog.debug("[IntelligentBargeIn] Stopping listening");
    if (sessionStartRef.current) {
      const duration = Date.now() - sessionStartRef.current;
      setMetrics((prev) => ({
        ...prev,
        sessionDuration: duration,
      }));
    }
    voiceMode.disconnect();
  }, [voiceMode]);

  const cancelBarge = useCallback(() => {
    voiceLog.debug("[IntelligentBargeIn] Cancelling barge-in");
    // If we detected a barge-in but want to cancel, just stop playback
    voiceMode.stopAI();
  }, [voiceMode]);

  const softPause = useCallback(() => {
    voiceLog.debug("[IntelligentBargeIn] Soft pause");
    // Soft pause: mute mic and wait
    voiceMode.toggleMute();
  }, [voiceMode]);

  const hardStop = useCallback(() => {
    voiceLog.debug("[IntelligentBargeIn] Hard stop");
    voiceMode.stopAI();
  }, [voiceMode]);

  const calibrate = useCallback(async (): Promise<CalibrationResult> => {
    voiceLog.debug("[IntelligentBargeIn] Starting calibration");
    // Placeholder calibration - would use Silero VAD calibration
    const result: CalibrationResult = {
      ambientNoiseLevel: 0.1,
      recommendedVadThreshold: 0.6,
      recommendedSilenceThreshold: 0.3,
      environmentType: "quiet",
      calibratedAt: Date.now(),
    };
    return result;
  }, []);

  const updateConfig = useCallback((updates: Partial<BargeInConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // ============================================================================
  // Keyboard Shortcuts Integration
  // ============================================================================

  useVoiceKeyboardShortcuts(
    {
      onToggle: () => {
        if (voiceMode.isConnected) {
          voiceMode.forceReply();
        } else {
          startListening();
        }
      },
      onCancel: () => {
        if (isSpeaking) {
          hardStop();
        } else {
          stopListening();
        }
      },
      onMute: () => {
        voiceMode.toggleMute();
      },
      onForceReply: () => {
        voiceMode.forceReply();
      },
    },
    {
      enabled: enableKeyboardShortcuts && voiceMode.isConnected,
    },
  );

  // ============================================================================
  // Barge-In Event Tracking
  // ============================================================================

  // Track barge-in events from the underlying voice mode
  useEffect(() => {
    // When AI is speaking and we detect speech, it's a potential barge-in
    if (state === "ai_speaking" && voiceMode.isSileroVADActive) {
      const speechDuration = voiceMode.sileroVADSpeechDurationMs;
      if (speechDuration > config.speechConfirmMs) {
        const event: BargeInEvent = {
          id: `barge-${Date.now()}`,
          type:
            speechDuration > config.hardBargeMinDuration
              ? "hard_barge"
              : "soft_barge",
          timestamp: Date.now(),
          interruptedContent: "",
          interruptedAtWord: 0,
          totalWords: 0,
          completionPercentage: 0,
          resumable: true,
          language: detectedLanguage || config.language,
        };

        setLastBargeInEvent(event);
        setBargeInHistory((prev) => [...prev.slice(-9), event]); // Keep last 10

        // Update metrics
        setMetrics((prev) => ({
          ...prev,
          totalBargeIns: prev.totalBargeIns + 1,
          [event.type === "hard_barge"
            ? "hardBargeCount"
            : event.type === "soft_barge"
              ? "softBargeCount"
              : "backchannelCount"]: prev.totalBargeIns + 1,
        }));

        onBargeIn?.(event);
      }
    }
  }, [
    state,
    voiceMode.isSileroVADActive,
    voiceMode.sileroVADSpeechDurationMs,
    config.speechConfirmMs,
    config.hardBargeMinDuration,
    config.language,
    detectedLanguage,
    onBargeIn,
  ]);

  // ============================================================================
  // Return Value
  // ============================================================================

  return useMemo(
    () => ({
      // State
      state,
      isListening,
      isSpeaking,
      isProcessing,
      currentConfidence,
      detectedLanguage,

      // Actions
      startListening,
      stopListening,
      cancelBarge,
      softPause,
      hardStop,
      calibrate,

      // Configuration
      config,
      updateConfig,

      // Events
      lastBargeInEvent,
      bargeInHistory,

      // Metrics
      metrics,
    }),
    [
      state,
      isListening,
      isSpeaking,
      isProcessing,
      currentConfidence,
      detectedLanguage,
      startListening,
      stopListening,
      cancelBarge,
      softPause,
      hardStop,
      calibrate,
      config,
      updateConfig,
      lastBargeInEvent,
      bargeInHistory,
      metrics,
    ],
  );
}

export default useIntelligentBargeIn;
