/**
 * Unified Voice Session Hook
 *
 * Provides the same interface as useRealtimeVoiceSession but uses the
 * Thinker/Talker pipeline for voice processing.
 *
 * This allows a drop-in replacement of the Realtime API with the T/T pipeline
 * while maintaining backward compatibility with existing components.
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useMemo, useCallback } from "react";
import { useThinkerTalkerVoiceMode } from "./useThinkerTalkerVoiceMode";
import type {
  TTConnectionStatus,
  TTVoiceMetrics,
  TTVoiceSettings,
} from "./useThinkerTalkerSession";

// ============================================================================
// Re-export Types with Aliases for Backward Compatibility
// ============================================================================

/**
 * Connection status - aliased from T/T types for backward compatibility
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "failed"
  | "expired"
  | "mic_permission_denied";

/**
 * Voice settings - maps to T/T voice settings
 */
export interface VoiceSettings {
  voice?: string; // Maps to voice_id in T/T
  language?: string;
  vadSensitivity?: number; // Not used in T/T (Deepgram handles VAD)
}

/**
 * Voice metrics - maps from T/T metrics
 */
export interface VoiceMetrics {
  connectionTimeMs: number | null;
  timeToFirstTranscriptMs: number | null;
  lastSttLatencyMs: number | null;
  lastResponseLatencyMs: number | null;
  sessionDurationMs: number | null;
  userTranscriptCount: number;
  aiResponseCount: number;
  reconnectCount: number;
  sessionStartedAt: number | null;
}

/**
 * Transcript from voice recognition
 */
export interface RealtimeTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

/**
 * Audio chunk for playback
 */
export interface RealtimeAudioChunk {
  audio: string; // base64
  format: string;
}

/**
 * Options for the voice session hook
 */
export interface UseVoiceSessionOptions {
  conversation_id?: string;
  clinical_context_id?: string;
  voiceSettings?: VoiceSettings;
  onTranscript?: (transcript: RealtimeTranscript) => void;
  onAudioChunk?: (chunk: RealtimeAudioChunk) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onMetricsUpdate?: (metrics: VoiceMetrics) => void;
  onRelayResult?: (payload: {
    answer: string;
    citations: Record<string, unknown>[];
  }) => void;
  onRelayPersist?: (ids: {
    user_message_id: string;
    assistant_message_id: string;
  }) => void;
  onSpeechStarted?: () => void;
  autoConnect?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map T/T connection status to legacy status
 */
function mapConnectionStatus(ttStatus: TTConnectionStatus): ConnectionStatus {
  switch (ttStatus) {
    case "disconnected":
      return "disconnected";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "ready":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "error";
    case "failed":
      return "failed";
    case "mic_permission_denied":
      return "mic_permission_denied";
    default:
      return "disconnected";
  }
}

/**
 * Map T/T metrics to legacy metrics format
 */
function mapMetrics(ttMetrics: TTVoiceMetrics): VoiceMetrics {
  return {
    connectionTimeMs: ttMetrics.connectionTimeMs,
    timeToFirstTranscriptMs: ttMetrics.sttLatencyMs, // Approximate mapping
    lastSttLatencyMs: ttMetrics.sttLatencyMs,
    lastResponseLatencyMs: ttMetrics.totalLatencyMs,
    sessionDurationMs: ttMetrics.sessionDurationMs,
    userTranscriptCount: ttMetrics.userUtteranceCount,
    aiResponseCount: ttMetrics.aiResponseCount,
    reconnectCount: ttMetrics.reconnectCount,
    sessionStartedAt: ttMetrics.sessionStartedAt,
  };
}

/**
 * Map legacy voice settings to T/T settings
 */
function mapVoiceSettings(
  settings?: VoiceSettings,
): TTVoiceSettings | undefined {
  if (!settings) return undefined;

  return {
    voice_id: settings.voice, // T/T uses voice_id for ElevenLabs
    language: settings.language,
    // vadSensitivity is ignored - Deepgram handles VAD
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Unified Voice Session Hook
 *
 * Drop-in replacement for useRealtimeVoiceSession using T/T pipeline.
 *
 * @example
 * ```tsx
 * const {
 *   status,
 *   transcript,
 *   partialTranscript,
 *   isSpeaking,
 *   metrics,
 *   connect,
 *   disconnect,
 *   sendMessage,
 * } = useVoiceSession({
 *   conversation_id: "conv-123",
 *   onError: (err) => console.error(err),
 * });
 * ```
 */
export function useVoiceSession(options: UseVoiceSessionOptions = {}) {
  const {
    conversation_id,
    voiceSettings,
    onTranscript,
    onError,
    onConnectionChange,
    onMetricsUpdate,
    onRelayResult,
    onSpeechStarted,
    autoConnect = false,
  } = options;

  // Use T/T voice mode with mapped options
  const ttVoiceMode = useThinkerTalkerVoiceMode({
    conversation_id,
    voiceSettings: mapVoiceSettings(voiceSettings),
    autoConnect,
    onUserTranscript: (text, isFinal) => {
      onTranscript?.({
        text,
        isFinal,
      });
    },
    onAIResponse: (text, isFinal) => {
      if (isFinal) {
        onRelayResult?.({
          answer: text,
          citations: [], // T/T doesn't provide citations here yet
        });
      }
    },
    onMetricsUpdate: (metrics) => {
      onMetricsUpdate?.(mapMetrics(metrics));
    },
  });

  // Handle connection status changes
  const mappedStatus = mapConnectionStatus(ttVoiceMode.connectionStatus);

  // Call onConnectionChange when status changes
  useMemo(() => {
    onConnectionChange?.(mappedStatus);
  }, [mappedStatus, onConnectionChange]);

  // Handle errors
  useMemo(() => {
    if (ttVoiceMode.error) {
      onError?.(ttVoiceMode.error);
    }
  }, [ttVoiceMode.error, onError]);

  // Handle speech started (for barge-in)
  useMemo(() => {
    if (ttVoiceMode.isListening && onSpeechStarted) {
      onSpeechStarted();
    }
  }, [ttVoiceMode.isListening, onSpeechStarted]);

  // Map metrics
  const metrics = useMemo(
    () => mapMetrics(ttVoiceMode.metrics),
    [ttVoiceMode.metrics],
  );

  // Wrap sendTextMessage for backward compatibility
  const sendMessage = useCallback(
    (text: string) => {
      ttVoiceMode.sendTextMessage(text);
    },
    [ttVoiceMode],
  );

  return {
    // State
    status: mappedStatus,
    error: ttVoiceMode.error,
    transcript: ttVoiceMode.finalTranscript,
    partialTranscript: ttVoiceMode.partialTranscript,
    isSpeaking: ttVoiceMode.isSpeaking || ttVoiceMode.isPlaying,
    metrics,

    // Actions
    connect: ttVoiceMode.connect,
    disconnect: ttVoiceMode.disconnect,
    sendMessage,
    bargeIn: ttVoiceMode.bargeIn,
    resetFatalError: ttVoiceMode.resetError,

    // Derived state
    isConnected: ttVoiceMode.isConnected,
    isConnecting: ttVoiceMode.isConnecting,
    isReady: ttVoiceMode.isReady,
    isMicPermissionDenied: ttVoiceMode.isMicPermissionDenied,

    // T/T specific (new features)
    pipelineState: ttVoiceMode.pipelineState,
    currentToolCalls: ttVoiceMode.currentToolCalls,
    isProcessing: ttVoiceMode.pipelineState === "processing",
    isListening: ttVoiceMode.isListening,
  };
}

// Re-export the T/T session hook for direct use
export { useThinkerTalkerSession } from "./useThinkerTalkerSession";

// Default export is the T/T-based hook
export default useVoiceSession;
