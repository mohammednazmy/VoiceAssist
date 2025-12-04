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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useThinkerTalkerSession,
  type TTConnectionStatus,
  type PipelineState,
  type TTTranscript,
  type TTToolCall,
  type TTVoiceMetrics,
  type TTVoiceSettings,
  type TTEmotionResult,
  type TTBackchannelEvent,
} from "./useThinkerTalkerSession";
import { useTTAudioPlayback, type TTPlaybackState } from "./useTTAudioPlayback";
import { useBackchannelAudio } from "./useBackchannelAudio";
import { useBargeInPromptAudio } from "./useBargeInPromptAudio";
import {
  useUnifiedConversationStore,
  type MessageSource,
} from "../stores/unifiedConversationStore";
import { useAuthStore } from "../stores/authStore";
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
  /** Callback when user emotion is detected (Phase 1: Hume AI) */
  onEmotionDetected?: (emotion: TTEmotionResult) => void;
  /** Enable backchannel audio playback (Phase 2) */
  enableBackchannel?: boolean;
  /** Callback when backchannel plays (Phase 2) */
  onBackchannelPlay?: (phrase: string) => void;
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

  // Phase 1: Emotion Detection
  currentEmotion: TTEmotionResult | null;

  // Phase 2: Backchanneling
  backchannelPhrase: string | null;
  isBackchanneling: boolean;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  bargeIn: (playVoicePrompt?: boolean) => void;
  sendTextMessage: (text: string) => void;
  setVolume: (volume: number) => void;
  resetError: () => void;

  /**
   * Play a barge-in voice prompt using ElevenLabs TTS.
   * Uses the same voice as the main AI responses for consistency.
   * Pass to BargeInFeedback's onPlayVoicePrompt prop.
   */
  playBargeInPrompt: (text?: string) => Promise<void>;

  /** Whether barge-in prompts are ready (pre-cached) */
  isBargeInPromptReady: boolean;
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
    onEmotionDetected,
    enableBackchannel = true,
    onBackchannelPlay,
  } = options;

  // Phase 1: Emotion state
  const [currentEmotion, setCurrentEmotion] = useState<TTEmotionResult | null>(
    null,
  );

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

  // Get auth token for API calls
  const tokens = useAuthStore((state) => state.tokens);
  const getAccessToken = useCallback(
    () => tokens?.accessToken || null,
    [tokens],
  );

  // Track current response for streaming
  let currentResponseId: string | null = null;

  // Phase 2: Backchannel audio hook
  const backchannelAudio = useBackchannelAudio({
    volume: volume * 0.6, // Backchannels at 60% of main volume
    enabled: enableBackchannel,
    onPlayStart: (phrase) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel playing: "${phrase}"`);
      onBackchannelPlay?.(phrase);
    },
    onPlayEnd: (phrase) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel ended: "${phrase}"`);
    },
  });

  // Barge-in prompt audio hook - uses ElevenLabs TTS for consistent voice
  const bargeInPromptAudio = useBargeInPromptAudio({
    voiceId: voiceSettings?.voice_id,
    language:
      (voiceSettings?.language as
        | "en"
        | "ar"
        | "es"
        | "fr"
        | "de"
        | "zh"
        | "ja"
        | "ko"
        | "pt"
        | "ru"
        | "hi"
        | "tr") || "en",
    provider: "elevenlabs",
    autoPreload: true,
    volume: volume * 0.8, // Slightly lower than main voice
    getAccessToken,
  });

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
      }
      onAIResponse?.(delta, false);
    },

    // Handle complete response
    onResponseComplete: (content: string, _messageId: string) => {
      addMessage({
        role: "assistant",
        content,
        source: "voice" as MessageSource,
      });
      currentResponseId = null;
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

    // Phase 1: Handle emotion detection from Hume AI
    onEmotionDetected: (emotion: TTEmotionResult) => {
      voiceLog.debug(
        `[TTVoiceMode] Emotion detected: ${emotion.primary_emotion} ` +
          `(conf=${emotion.primary_confidence.toFixed(2)})`,
      );
      setCurrentEmotion(emotion);
      onEmotionDetected?.(emotion);
    },

    // Phase 2: Handle backchannel audio playback
    onBackchannel: (event: TTBackchannelEvent) => {
      voiceLog.debug(`[TTVoiceMode] Backchannel received: "${event.phrase}"`);
      backchannelAudio.playBackchannel(event);
    },
  });

  // Barge-in handler - combines session signal with audio stop
  // Optionally plays "I'm listening" prompt using ElevenLabs for consistent voice
  const bargeIn = useCallback(
    (playVoicePrompt = false) => {
      voiceLog.debug("[TTVoiceMode] Barge-in triggered");
      audioPlayback.stop();
      session.bargeIn();

      // Play barge-in prompt if requested (uses ElevenLabs TTS for consistent voice)
      if (playVoicePrompt && bargeInPromptAudio.isReady) {
        bargeInPromptAudio.playPrompt();
      }
    },
    [audioPlayback, session, bargeInPromptAudio],
  );

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

      // Phase 1: Emotion Detection
      currentEmotion,

      // Phase 2: Backchanneling
      backchannelPhrase: backchannelAudio.currentPhrase,
      isBackchanneling: backchannelAudio.isPlaying,

      // Actions
      connect,
      disconnect,
      bargeIn,
      sendTextMessage: session.sendMessage,
      setVolume: audioPlayback.setVolume,
      resetError: session.resetFatalError,

      // Barge-in prompt audio (uses ElevenLabs for consistent voice)
      playBargeInPrompt: bargeInPromptAudio.playPrompt,
      isBargeInPromptReady: bargeInPromptAudio.isReady,
    }),
    [
      session,
      audioPlayback,
      backchannelAudio,
      bargeInPromptAudio,
      currentEmotion,
      connect,
      disconnect,
      bargeIn,
    ],
  );
}

export default useThinkerTalkerVoiceMode;
