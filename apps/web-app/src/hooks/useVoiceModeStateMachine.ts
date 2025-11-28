/**
 * Voice Mode State Machine Hook
 *
 * Provides a clean state machine interface for the unified voice UI.
 * Wraps useRealtimeVoiceSession with unified-interface-specific state transitions.
 *
 * States:
 * - idle: Voice mode not active
 * - connecting: Establishing WebSocket connection
 * - listening: Actively listening for speech
 * - processing: Speech detected, processing transcript
 * - responding: AI is generating/speaking response
 * - error: Error occurred, can retry
 */

import { useCallback, useEffect, useRef } from "react";
import {
  useRealtimeVoiceSession,
  type ConnectionStatus,
  type VoiceSettings,
  type RealtimeTranscript,
} from "./useRealtimeVoiceSession";
import {
  useUnifiedConversationStore,
  type VoiceState,
} from "../stores/unifiedConversationStore";
import { useVoiceSettingsStore } from "../stores/voiceSettingsStore";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface VoiceModeStateMachineOptions {
  conversationId: string | null;
  clinicalContextId?: string;
  onTranscriptComplete?: (transcript: string) => void;
  onError?: (error: Error) => void;
}

export interface VoiceModeStateMachineReturn {
  // State
  voiceState: VoiceState;
  isActive: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isResponding: boolean;
  hasError: boolean;
  error: Error | null;
  partialTranscript: string;
  finalTranscript: string;

  // Actions
  activate: () => Promise<void>;
  deactivate: () => void;
  retryConnection: () => Promise<void>;

  // Metrics
  metrics: {
    connectionTimeMs: number | null;
    sttLatencyMs: number | null;
    responseLatencyMs: number | null;
  };
}

// ============================================================================
// State Mapping
// ============================================================================

/**
 * Map connection status + speaking state to unified VoiceState
 */
function mapToVoiceState(
  connectionStatus: ConnectionStatus,
  isSpeaking: boolean,
  isResponding: boolean,
): VoiceState {
  switch (connectionStatus) {
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "connected":
      if (isResponding) return "responding";
      if (isSpeaking) return "processing";
      return "listening";
    case "error":
    case "failed":
    case "expired":
    case "mic_permission_denied":
      return "error";
    case "disconnected":
    default:
      return "idle";
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useVoiceModeStateMachine(
  options: VoiceModeStateMachineOptions,
): VoiceModeStateMachineReturn {
  const { conversationId, clinicalContextId, onTranscriptComplete, onError } =
    options;

  // Store state
  const {
    voiceModeActive,
    voiceState,
    setVoiceState,
    setIsListening,
    setIsSpeaking,
    setPartialTranscript,
    activateVoiceMode,
    deactivateVoiceMode,
  } = useUnifiedConversationStore();

  // Voice settings
  const { voice, language, vadSensitivity } = useVoiceSettingsStore();

  // Track responding state locally (when AI is speaking back)
  const isRespondingRef = useRef(false);
  const finalTranscriptRef = useRef("");

  // Build voice settings from store
  const voiceSettings: VoiceSettings = {
    voice: voice || undefined,
    language: language || undefined,
    vadSensitivity: vadSensitivity ?? undefined,
  };

  // Handle transcript events
  const handleTranscript = useCallback(
    (transcript: RealtimeTranscript) => {
      if (transcript.is_final) {
        finalTranscriptRef.current = transcript.text;
        setPartialTranscript("");
        onTranscriptComplete?.(transcript.text);
      } else {
        setPartialTranscript(transcript.text);
      }
    },
    [setPartialTranscript, onTranscriptComplete],
  );

  // Handle connection changes
  const handleConnectionChange = useCallback(
    (status: ConnectionStatus) => {
      voiceLog.debug(`[VoiceStateMachine] Connection status: ${status}`);

      const newState = mapToVoiceState(status, false, isRespondingRef.current);
      setVoiceState(newState);

      // Update listening state
      setIsListening(status === "connected");
    },
    [setVoiceState, setIsListening],
  );

  // Handle errors
  const handleError = useCallback(
    (error: Error) => {
      voiceLog.error("[VoiceStateMachine] Error:", error);
      setVoiceState("error");
      onError?.(error);
    },
    [setVoiceState, onError],
  );

  // Handle speech events (for barge-in / playback control)
  const handleSpeechStarted = useCallback(() => {
    // User started speaking - stop any AI audio playback
    isRespondingRef.current = false;
    setIsSpeaking(true);
  }, [setIsSpeaking]);

  // Use the realtime voice session hook
  const {
    status,
    error,
    transcript,
    partialTranscript,
    isSpeaking,
    metrics,
    connect,
    disconnect,
    resetFatalError,
    isConnected,
    isMicPermissionDenied,
  } = useRealtimeVoiceSession({
    conversation_id: conversationId || undefined,
    clinical_context_id: clinicalContextId,
    voiceSettings,
    onTranscript: handleTranscript,
    onConnectionChange: handleConnectionChange,
    onError: handleError,
    onSpeechStarted: handleSpeechStarted,
    autoConnect: false, // We control connection manually
  });

  // Sync speaking state from realtime hook to store
  useEffect(() => {
    setIsSpeaking(isSpeaking);
    // Update voice state based on speaking
    if (isConnected) {
      setVoiceState(isSpeaking ? "processing" : "listening");
    }
  }, [isSpeaking, isConnected, setIsSpeaking, setVoiceState]);

  // Activate voice mode
  const activate = useCallback(async () => {
    voiceLog.debug("[VoiceStateMachine] Activating voice mode");
    activateVoiceMode();
    setVoiceState("connecting");

    try {
      await connect();
    } catch (err) {
      voiceLog.error("[VoiceStateMachine] Failed to activate:", err);
      setVoiceState("error");
    }
  }, [activateVoiceMode, setVoiceState, connect]);

  // Deactivate voice mode
  const deactivate = useCallback(() => {
    voiceLog.debug("[VoiceStateMachine] Deactivating voice mode");
    disconnect();
    deactivateVoiceMode();
    setVoiceState("idle");
    setPartialTranscript("");
    finalTranscriptRef.current = "";
    isRespondingRef.current = false;
  }, [disconnect, deactivateVoiceMode, setVoiceState, setPartialTranscript]);

  // Retry connection after error
  const retryConnection = useCallback(async () => {
    voiceLog.debug("[VoiceStateMachine] Retrying connection");

    // Reset fatal error if mic permission was denied (user might have granted it)
    if (isMicPermissionDenied) {
      resetFatalError();
    }

    await activate();
  }, [isMicPermissionDenied, resetFatalError, activate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceModeActive) {
        disconnect();
      }
    };
  }, [voiceModeActive, disconnect]);

  return {
    // State
    voiceState,
    isActive: voiceModeActive,
    isListening: voiceState === "listening",
    isProcessing: voiceState === "processing",
    isResponding: voiceState === "responding",
    hasError: voiceState === "error",
    error,
    partialTranscript,
    finalTranscript: finalTranscriptRef.current,

    // Actions
    activate,
    deactivate,
    retryConnection,

    // Metrics
    metrics: {
      connectionTimeMs: metrics.connectionTimeMs,
      sttLatencyMs: metrics.lastSttLatencyMs,
      responseLatencyMs: metrics.lastResponseLatencyMs,
    },
  };
}

export default useVoiceModeStateMachine;
