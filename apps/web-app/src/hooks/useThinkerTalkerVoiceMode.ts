/**
 * Thinker/Talker Voice Mode Hook
 *
 * Unified hook that combines T/T session management with audio playback.
 * This is the main entry point for voice mode using the Thinker/Talker pipeline.
 *
 * Provides:
 * - WebSocket connection to T/T pipeline
 * - Microphone capture and streaming
 * - Streaming audio playback
 * - Barge-in handling
 * - Integration with conversation store
 * - Metrics tracking
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  useThinkerTalkerSession,
  type TTConnectionStatus,
  type PipelineState,
  type TTTranscript,
  type TTToolCall,
  type TTVoiceMetrics,
  type TTVoiceSettings,
} from "./useThinkerTalkerSession";
import { useTTAudioPlayback, type TTPlaybackState } from "./useTTAudioPlayback";
import {
  useUnifiedConversationStore,
  type MessageSource,
} from "../stores/unifiedConversationStore";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface TTVoiceModeOptions {
  /** Conversation ID for context */
  conversation_id?: string;
  /** Voice settings */
  voiceSettings?: TTVoiceSettings;
  /** Volume for playback (0-1) */
  volume?: number;
  /** Auto-connect when hook mounts */
  autoConnect?: boolean;
  /** Callback when user transcript is received */
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  /** Callback when AI response is received */
  onAIResponse?: (text: string, isFinal: boolean) => void;
  /** Callback when a tool is called */
  onToolCall?: (toolCall: TTToolCall) => void;
  /** Callback when metrics are updated */
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
}

export interface TTVoiceModeReturn {
  // Connection State
  connectionStatus: TTConnectionStatus;
  pipelineState: PipelineState;
  isConnected: boolean;
  isConnecting: boolean;
  isReady: boolean;
  isMicPermissionDenied: boolean;

  // Audio State
  playbackState: TTPlaybackState;
  isPlaying: boolean;
  isSpeaking: boolean;
  isListening: boolean;

  // Transcription
  partialTranscript: string;
  finalTranscript: string;

  // Tool Calls
  currentToolCalls: TTToolCall[];

  // Metrics
  metrics: TTVoiceMetrics;
  ttfaMs: number | null;

  // Error
  error: Error | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  bargeIn: () => void;
  sendTextMessage: (text: string) => void;
  setVolume: (volume: number) => void;
  resetError: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useThinkerTalkerVoiceMode(
  options: TTVoiceModeOptions = {},
): TTVoiceModeReturn {
  const {
    conversation_id,
    voiceSettings,
    volume = 1,
    autoConnect = false,
    onUserTranscript,
    onAIResponse,
    onToolCall,
    onMetricsUpdate,
  } = options;

  // Get store actions
  const {
    setVoiceConnectionStatus,
    setVoiceState,
    setPartialTranscript,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    addMessage,
  } = useUnifiedConversationStore();

  // Track current response for streaming
  let currentResponseId: string | null = null;
  let currentResponseContent = "";

  // Audio playback hook
  const audioPlayback = useTTAudioPlayback({
    volume,
    onPlaybackStart: () => {
      voiceLog.debug("[TTVoiceMode] Playback started");
      startSpeaking();
    },
    onPlaybackEnd: () => {
      voiceLog.debug("[TTVoiceMode] Playback ended");
      stopSpeaking();
    },
    onPlaybackInterrupted: () => {
      voiceLog.debug("[TTVoiceMode] Playback interrupted (barge-in)");
      stopSpeaking();
    },
    onError: (err) => {
      voiceLog.error("[TTVoiceMode] Audio playback error:", err);
    },
  });

  // T/T session hook
  const session = useThinkerTalkerSession({
    conversation_id,
    voiceSettings,
    autoConnect,

    // Handle transcripts
    onTranscript: (transcript: TTTranscript) => {
      if (transcript.is_final) {
        // Final transcript - add to conversation
        addMessage({
          role: "user",
          content: transcript.text,
          source: "voice" as MessageSource,
        });
        setPartialTranscript("");
        onUserTranscript?.(transcript.text, true);
      } else {
        // Partial transcript
        setPartialTranscript(transcript.text);
        onUserTranscript?.(transcript.text, false);
      }
    },

    // Handle streaming response
    onResponseDelta: (delta: string, messageId: string) => {
      if (messageId !== currentResponseId) {
        // New response - just track it, don't reset audio here
        // Audio reset already happens in onPipelineStateChange("processing")
        // Resetting here causes race conditions with arriving audio chunks
        voiceLog.debug(`[TTVoiceMode] New response started: ${messageId}`);
        currentResponseId = messageId;
        currentResponseContent = "";
      }
      currentResponseContent += delta;
      onAIResponse?.(delta, false);
    },

    // Handle complete response
    onResponseComplete: (content: string, messageId: string) => {
      addMessage({
        role: "assistant",
        content,
        source: "voice" as MessageSource,
      });
      currentResponseId = null;
      currentResponseContent = "";
      onAIResponse?.(content, true);
    },

    // Handle audio chunks
    onAudioChunk: (audioBase64: string) => {
      console.log("[TTVoiceMode] onAudioChunk called", {
        audioLength: audioBase64.length,
      });
      audioPlayback.queueAudioChunk(audioBase64);
    },

    // Handle tool calls
    onToolCall: (toolCall: TTToolCall) => {
      onToolCall?.(toolCall);
    },

    // Handle connection changes
    onConnectionChange: (status: TTConnectionStatus) => {
      voiceLog.debug(`[TTVoiceMode] Connection status: ${status}`);

      // Map T/T status to store status
      if (status === "connected" || status === "ready") {
        setVoiceConnectionStatus("connected");
      } else if (status === "connecting") {
        setVoiceConnectionStatus("connecting");
      } else if (status === "reconnecting") {
        setVoiceConnectionStatus("reconnecting");
      } else if (
        status === "error" ||
        status === "failed" ||
        status === "mic_permission_denied"
      ) {
        setVoiceConnectionStatus("error");
      } else {
        setVoiceConnectionStatus("disconnected");
      }
    },

    // Handle pipeline state changes
    onPipelineStateChange: (state: PipelineState) => {
      voiceLog.debug(`[TTVoiceMode] Pipeline state: ${state}`);

      switch (state) {
        case "listening":
          setVoiceState("listening");
          startListening();
          break;
        case "processing":
          setVoiceState("processing");
          stopListening();
          // Reset audio when starting to process new utterance
          // This prevents audio overlap from stale responses
          audioPlayback.reset();
          break;
        case "speaking":
          setVoiceState("responding");
          break;
        case "cancelled":
        case "idle":
          setVoiceState("idle");
          break;
      }
    },

    // Handle speech events for barge-in
    onSpeechStarted: () => {
      voiceLog.debug("[TTVoiceMode] User speech detected");
      startListening();
    },

    onStopPlayback: () => {
      // Stop audio playback on barge-in
      audioPlayback.stop();
    },

    // Handle metrics
    onMetricsUpdate: (metrics: TTVoiceMetrics) => {
      onMetricsUpdate?.(metrics);
    },
  });

  // Barge-in handler - combines session signal with audio stop
  const bargeIn = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Barge-in triggered");
    audioPlayback.stop();
    session.bargeIn();
  }, [audioPlayback, session]);

  // Enhanced disconnect that stops audio
  const disconnect = useCallback(() => {
    voiceLog.debug("[TTVoiceMode] Disconnecting");
    audioPlayback.reset();
    session.disconnect();
  }, [audioPlayback, session]);

  // Enhanced connect that pre-warms audio
  const connect = useCallback(async () => {
    voiceLog.debug("[TTVoiceMode] Connecting with audio pre-warm");
    // Pre-warm AudioContext before connecting to reduce latency
    await audioPlayback.warmup();
    return session.connect();
  }, [audioPlayback, session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioPlayback.reset();
    };
  }, []);

  // Memoized return value
  return useMemo(
    () => ({
      // Connection State
      connectionStatus: session.status,
      pipelineState: session.pipelineState,
      isConnected: session.isConnected,
      isConnecting: session.isConnecting,
      isReady: session.isReady,
      isMicPermissionDenied: session.isMicPermissionDenied,

      // Audio State
      playbackState: audioPlayback.playbackState,
      isPlaying: audioPlayback.isPlaying,
      isSpeaking: session.isSpeaking,
      isListening: session.isListening,

      // Transcription
      partialTranscript: session.partialTranscript,
      finalTranscript: session.transcript,

      // Tool Calls
      currentToolCalls: session.currentToolCalls,

      // Metrics
      metrics: session.metrics,
      ttfaMs: audioPlayback.ttfaMs,

      // Error
      error: session.error,

      // Actions
      connect,
      disconnect,
      bargeIn,
      sendTextMessage: session.sendMessage,
      setVolume: audioPlayback.setVolume,
      resetError: session.resetFatalError,
    }),
    [session, audioPlayback, connect, disconnect, bargeIn],
  );
}

export default useThinkerTalkerVoiceMode;
