/**
 * useThinkerTalkerSession Hook
 *
 * Manages WebSocket connection to the Thinker/Talker voice pipeline.
 * Replaces OpenAI Realtime API with our local STT → LLM → TTS pipeline.
 *
 * Benefits over Realtime API:
 * - Unified conversation context with chat mode
 * - Full tool/RAG support in voice
 * - Custom TTS (ElevenLabs) with better voice quality
 * - Lower cost per interaction
 *
 * Pipeline:
 * 1. Deepgram streaming STT (with Whisper fallback)
 * 2. GPT-4o Thinker with tool calling
 * 3. ElevenLabs streaming TTS
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 * Enhanced: Phases 7-10 (Multilingual, Personalization, Offline, Conversation Management)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { captureVoiceError } from "../lib/sentry";
import { useAuth } from "./useAuth";
import { voiceLog } from "../lib/logger";

// Phase 7-10: Advanced voice barge-in hooks
import { useMultilingual } from "./useMultilingual";
import { usePersonalization } from "./usePersonalization";
import {
  useOfflineVADWithFallback,
  type UseOfflineVADWithFallbackReturn,
} from "./useOfflineVAD";
import { useConversationManager } from "./useConversationManager";
import type { BargeInType as ConversationBargeInType } from "../lib/conversationManager/types";

// ============================================================================
// Types
// ============================================================================

/**
 * T/T Pipeline session configuration from backend
 */
export interface TTSessionConfig {
  session_id: string;
  pipeline_mode: "thinker_talker";
  websocket_url: string;
  voice_config: {
    voice_id: string;
    tts_model: string;
    stt_language: string;
    barge_in_enabled: boolean;
  };
}

/**
 * Connection status for T/T session
 */
export type TTConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"
  | "error"
  | "failed"
  | "mic_permission_denied";

/**
 * Pipeline state as reported by backend
 */
export type PipelineState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "cancelled";

/**
 * Transcript from STT
 */
export interface TTTranscript {
  text: string;
  is_final: boolean;
  timestamp: number;
  message_id?: string;
}

/**
 * Tool call in progress
 */
export interface TTToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}

/**
 * Voice metrics for performance monitoring
 */
export interface TTVoiceMetrics {
  /** Time from connect() call to ready status (ms) */
  connectionTimeMs: number | null;
  /** Time from speech end to first transcript (ms) */
  sttLatencyMs: number | null;
  /** Time from transcript to first LLM token (ms) */
  llmFirstTokenMs: number | null;
  /** Time from first LLM token to first TTS audio (ms) */
  ttsFirstAudioMs: number | null;
  /** Total time from speech end to first audio (ms) */
  totalLatencyMs: number | null;
  /** Session duration (ms) */
  sessionDurationMs: number | null;
  /** Count of user utterances */
  userUtteranceCount: number;
  /** Count of AI responses */
  aiResponseCount: number;
  /** Count of tool calls */
  toolCallCount: number;
  /** Count of barge-ins */
  bargeInCount: number;
  /** Reconnection count */
  reconnectCount: number;
  /** Session start timestamp */
  sessionStartedAt: number | null;
}

/**
 * Voice settings for T/T session
 */
export interface TTVoiceSettings {
  voice_id?: string; // ElevenLabs voice ID
  language?: string; // STT language code
  barge_in_enabled?: boolean;
  tts_model?: string;
}

/**
 * Hook options
 */
export interface UseThinkerTalkerSessionOptions {
  conversation_id?: string;
  voiceSettings?: TTVoiceSettings;
  onTranscript?: (transcript: TTTranscript) => void;
  onResponseDelta?: (delta: string, messageId: string) => void;
  onResponseComplete?: (content: string, messageId: string) => void;
  onAudioChunk?: (audioBase64: string) => void;
  onToolCall?: (toolCall: TTToolCall) => void;
  onToolResult?: (toolCall: TTToolCall) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: TTConnectionStatus) => void;
  onPipelineStateChange?: (state: PipelineState) => void;
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
  /** Called when user starts speaking (for barge-in) */
  onSpeechStarted?: () => void;
  /** Called when AI audio playback should stop */
  onStopPlayback?: () => void;
  autoConnect?: boolean;

  // Phase 7-10: Advanced options
  /** Enable multilingual detection and switching */
  enableMultilingual?: boolean;
  /** Enable adaptive personalization */
  enablePersonalization?: boolean;
  /** Enable offline VAD fallback */
  enableOfflineVAD?: boolean;
  /** Enable conversation management (sentiment, discourse) */
  enableConversationManagement?: boolean;
  /** Personalization sync endpoint */
  personalizationSyncEndpoint?: string;
  /** Callback when language is detected */
  onLanguageDetected?: (language: string, confidence: number) => void;
  /** Callback when sentiment changes */
  onSentimentChange?: (sentiment: string, confidence: number) => void;
  /** Callback when calibration completes */
  onCalibrationComplete?: (result: unknown) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a microphone permission error (fatal, no retry)
 */
function isMicPermissionError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.name === "NotAllowedError" ||
      err.name === "SecurityError" ||
      err.name === "NotFoundError"
    );
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("permission") ||
      msg.includes("not allowed") ||
      msg.includes("blocked") ||
      msg.includes("denied")
    );
  }
  return false;
}

/**
 * Get user-friendly error message for mic permission errors
 */
function getMicErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Microphone access denied. Please allow microphone access in your browser settings and reload the page.";
      case "SecurityError":
        return "Microphone blocked by browser policy. This site may need to be accessed via HTTPS.";
      case "NotFoundError":
        return "No microphone found. Please connect a microphone and try again.";
      default:
        return `Microphone error: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : "Unknown microphone error";
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useThinkerTalkerSession(
  options: UseThinkerTalkerSessionOptions = {},
) {
  const { tokens } = useAuth();

  // Extract Phase 7-10 options
  const {
    enableMultilingual = true,
    enablePersonalization = true,
    enableOfflineVAD = true,
    enableConversationManagement = true,
    personalizationSyncEndpoint,
    onLanguageDetected,
    onSentimentChange,
    onCalibrationComplete,
  } = options;

  // Phase 7: Multilingual support
  const multilingual = useMultilingual({
    autoDetect: enableMultilingual,
    autoSwitch: false, // User controls language switching
    enableAccentDetection: true,
    onLanguageDetected: (result) => {
      onLanguageDetected?.(result.detectedLanguage, result.confidence);
    },
  });

  // Phase 8: Personalization
  const personalization = usePersonalization({
    syncEndpoint: personalizationSyncEndpoint,
    autoAdapt: enablePersonalization,
    onCalibrationComplete: (result) => {
      onCalibrationComplete?.(result);
    },
  });

  // Phase 9: Offline VAD fallback
  // Note: networkVADAvailable is updated via effect when status changes
  const [networkVADAvailable, setNetworkVADAvailable] = useState(false);
  const offlineVAD = useOfflineVADWithFallback({
    enabled: enableOfflineVAD,
    networkVADAvailable,
    onSpeechStart: () => {
      voiceLog.debug("[ThinkerTalker] Offline VAD: speech started");
    },
    onSpeechEnd: () => {
      voiceLog.debug("[ThinkerTalker] Offline VAD: speech ended");
    },
    onFallbackToOffline: () => {
      voiceLog.debug("[ThinkerTalker] Falling back to offline VAD");
    },
    onReturnToNetwork: () => {
      voiceLog.debug("[ThinkerTalker] Returning to network VAD");
    },
  });

  // Phase 10: Conversation management
  const conversationManager = useConversationManager({
    enableSentimentTracking: enableConversationManagement,
    enableDiscourseAnalysis: enableConversationManagement,
    onSentimentChange: (sentiment) => {
      onSentimentChange?.(sentiment.sentiment, sentiment.confidence);
    },
  });

  // State
  const [status, setStatus] = useState<TTConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [partialTranscript, setPartialTranscript] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [currentToolCalls, setCurrentToolCalls] = useState<TTToolCall[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Metrics state
  const [metrics, setMetrics] = useState<TTVoiceMetrics>({
    connectionTimeMs: null,
    sttLatencyMs: null,
    llmFirstTokenMs: null,
    ttsFirstAudioMs: null,
    totalLatencyMs: null,
    sessionDurationMs: null,
    userUtteranceCount: 0,
    aiResponseCount: 0,
    toolCallCount: 0,
    bargeInCount: 0,
    reconnectCount: 0,
    sessionStartedAt: null,
  });

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<
    ScriptProcessorNode | AudioWorkletNode | null
  >(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const intentionalDisconnectRef = useRef(false);
  const fatalErrorRef = useRef(false);

  // Timing refs for latency tracking
  const connectStartTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const speechEndTimeRef = useRef<number | null>(null);
  const firstTranscriptTimeRef = useRef<number | null>(null);
  const firstLLMTokenTimeRef = useRef<number | null>(null);

  // Refs for callback functions (avoid circular dependencies)
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const disconnectRef = useRef<() => void>(() => {});
  const updateStatusRef = useRef<(status: TTConnectionStatus) => void>(
    () => {},
  );
  const handleMessageRef = useRef<(message: Record<string, unknown>) => void>(
    () => {},
  );
  const statusRef = useRef<TTConnectionStatus>(status);

  // Constants for reconnection
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 300;
  const MAX_RECONNECT_DELAY = 30000;

  // Constants for heartbeat
  const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds between pings
  const HEARTBEAT_TIMEOUT_MS = 5000; // 5 seconds to receive pong

  // Heartbeat refs
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastPongTimeRef = useRef<number>(Date.now());
  const pendingPingTimeRef = useRef<number | null>(null);

  /**
   * Calculate reconnection delay with exponential backoff
   */
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    return Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY,
    );
  }, []);

  /**
   * Schedule automatic reconnection
   */
  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current || fatalErrorRef.current) {
      return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      voiceLog.error("[ThinkerTalker] Max reconnect attempts reached");
      updateStatusRef.current("failed");
      return;
    }

    const delay = calculateReconnectDelay(reconnectAttempts);
    voiceLog.debug(
      `[ThinkerTalker] Scheduling reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    updateStatusRef.current("reconnecting");

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts((prev) => prev + 1);
      connectRef.current();
    }, delay);
  }, [reconnectAttempts, calculateReconnectDelay]);

  /**
   * Start heartbeat ping/pong to detect zombie connections
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      return; // Already running
    }

    voiceLog.debug("[ThinkerTalker] Starting heartbeat");
    lastPongTimeRef.current = Date.now();

    heartbeatIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // Check if we received pong from previous ping
      const timeSinceLastPong = Date.now() - lastPongTimeRef.current;

      if (timeSinceLastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        voiceLog.warn(
          `[ThinkerTalker] Heartbeat timeout - no pong for ${timeSinceLastPong}ms, closing zombie connection`,
        );
        // Close with custom code to indicate heartbeat failure
        wsRef.current.close(4000, "Heartbeat timeout");
        return;
      }

      // Send ping
      const pingTime = Date.now();
      pendingPingTimeRef.current = pingTime;
      wsRef.current.send(
        JSON.stringify({
          type: "ping",
          ts: pingTime,
        }),
      );
      voiceLog.debug("[ThinkerTalker] Heartbeat ping sent");
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  /**
   * Stop heartbeat
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      pendingPingTimeRef.current = null;
      voiceLog.debug("[ThinkerTalker] Heartbeat stopped");
    }
  }, []);

  /**
   * Update metrics and notify callback
   */
  const updateMetrics = useCallback(
    (updates: Partial<TTVoiceMetrics>) => {
      setMetrics((prev) => {
        const updated = { ...prev, ...updates };
        options.onMetricsUpdate?.(updated);
        return updated;
      });
    },
    [options],
  );

  /**
   * Update status and notify callback
   */
  const updateStatus = useCallback(
    (newStatus: TTConnectionStatus) => {
      statusRef.current = newStatus;
      setStatus(newStatus);
      options.onConnectionChange?.(newStatus);

      if (newStatus === "ready" && connectStartTimeRef.current) {
        const connectionTime = Date.now() - connectStartTimeRef.current;
        sessionStartTimeRef.current = Date.now();
        updateMetrics({
          connectionTimeMs: connectionTime,
          sessionStartedAt: sessionStartTimeRef.current,
        });
        voiceLog.debug(
          `[ThinkerTalker] Connection ready in ${connectionTime}ms`,
        );
      }
    },
    [options, updateMetrics],
  );

  // Keep ref updated
  updateStatusRef.current = updateStatus;

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Update network VAD availability when status changes
  useEffect(() => {
    setNetworkVADAvailable(status === "connected" || status === "ready");
  }, [status]);

  /**
   * Handle errors
   */
  const handleError = useCallback(
    (err: Error) => {
      voiceLog.error("[ThinkerTalker] Error:", err);
      setError(err);
      updateStatus("error");
      options.onError?.(err);

      captureVoiceError(err, {
        status: statusRef.current,
        conversationId: options.conversation_id,
        breadcrumb: "thinker_talker_error",
      });
    },
    [options, updateStatus],
  );

  /**
   * Handle incoming WebSocket messages from T/T pipeline
   */
  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      const msgType = message.type as string;

      switch (msgType) {
        case "session.ready":
          voiceLog.debug("[ThinkerTalker] Session ready");
          updateStatus("ready");
          // Start heartbeat monitoring for zombie connection detection
          startHeartbeat();
          break;

        case "transcript.delta": {
          // Partial transcript from STT
          const text = message.text as string;
          if (text) {
            setPartialTranscript((prev) => prev + text);
            options.onTranscript?.({
              text,
              is_final: false,
              timestamp: Date.now(),
            });
          }
          break;
        }

        case "transcript.complete": {
          // Final transcript from STT
          const text = message.text as string;
          const messageId = message.message_id as string | undefined;

          setTranscript(text);
          setPartialTranscript("");

          // Track STT latency
          const now = Date.now();
          const duration = speechEndTimeRef.current
            ? now - speechEndTimeRef.current
            : 0;
          if (speechEndTimeRef.current) {
            const sttLatency = now - speechEndTimeRef.current;
            firstTranscriptTimeRef.current = now;
            updateMetrics({
              sttLatencyMs: sttLatency,
              userUtteranceCount: metrics.userUtteranceCount + 1,
            });
            voiceLog.debug(`[ThinkerTalker] STT latency: ${sttLatency}ms`);
          }

          // Phase 7: Detect language from transcript
          if (enableMultilingual && text) {
            multilingual.detectLanguage(text);
          }

          // Phase 10: Process utterance for sentiment/discourse
          if (enableConversationManagement && text) {
            conversationManager.processUtterance(text, duration);
          }

          options.onTranscript?.({
            text,
            is_final: true,
            timestamp: now,
            message_id: messageId,
          });
          break;
        }

        case "response.delta": {
          // Streaming LLM response token
          const delta = message.delta as string;
          const messageId = message.message_id as string;

          // Track time to first LLM token
          if (!firstLLMTokenTimeRef.current && firstTranscriptTimeRef.current) {
            firstLLMTokenTimeRef.current = Date.now();
            const llmLatency =
              firstLLMTokenTimeRef.current - firstTranscriptTimeRef.current;
            updateMetrics({ llmFirstTokenMs: llmLatency });
            voiceLog.debug(`[ThinkerTalker] LLM first token: ${llmLatency}ms`);
          }

          options.onResponseDelta?.(delta, messageId);
          break;
        }

        case "response.complete": {
          // Complete LLM response
          // Backend sends "text", not "content"
          const content = (message.text || message.content || "") as string;
          const messageId = message.message_id as string;

          updateMetrics({ aiResponseCount: metrics.aiResponseCount + 1 });
          options.onResponseComplete?.(content, messageId);
          break;
        }

        case "audio.output": {
          // TTS audio chunk (base64)
          const audioBase64 = message.audio as string;
          const isFinal = message.is_final as boolean;

          console.log("[ThinkerTalkerSession] audio.output received", {
            hasAudio: !!audioBase64,
            audioLength: audioBase64?.length || 0,
            isFinal,
            hasOnAudioChunk: !!options.onAudioChunk,
          });

          // Track time to first audio
          if (speechEndTimeRef.current && !metrics.ttsFirstAudioMs) {
            const totalLatency = Date.now() - speechEndTimeRef.current;
            const ttsLatency = firstLLMTokenTimeRef.current
              ? Date.now() - firstLLMTokenTimeRef.current
              : null;
            updateMetrics({
              ttsFirstAudioMs: ttsLatency,
              totalLatencyMs: totalLatency,
            });
            console.log(
              `[ThinkerTalkerSession] Total latency: ${totalLatency}ms`,
            );
            voiceLog.debug(`[ThinkerTalker] Total latency: ${totalLatency}ms`);
          }

          if (audioBase64) {
            console.log("[ThinkerTalkerSession] Calling onAudioChunk callback");
            options.onAudioChunk?.(audioBase64);
          } else {
            console.log(
              "[ThinkerTalkerSession] No audio data in chunk (is_final marker?)",
            );
          }
          break;
        }

        case "tool.call": {
          // Tool being called
          const toolCall: TTToolCall = {
            id: (message.tool_id || message.tool_call_id) as string,
            name: (message.tool_name || message.name) as string,
            arguments: (message.arguments || {}) as Record<string, unknown>,
            status: "running",
          };

          setCurrentToolCalls((prev) => [...prev, toolCall]);
          updateMetrics({ toolCallCount: metrics.toolCallCount + 1 });
          options.onToolCall?.(toolCall);
          break;
        }

        case "tool.result": {
          // Tool result received
          const toolCallId = message.tool_call_id as string;
          const result = message.result;

          setCurrentToolCalls((prev) =>
            prev.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, status: "completed", result }
                : tc,
            ),
          );

          const updatedToolCall = currentToolCalls.find(
            (tc) => tc.id === toolCallId,
          );
          if (updatedToolCall) {
            options.onToolResult?.({
              ...updatedToolCall,
              status: "completed",
              result,
            });
          }
          break;
        }

        case "voice.state": {
          // Pipeline state update
          const state = message.state as PipelineState;
          setPipelineState(state);
          options.onPipelineStateChange?.(state);

          if (state === "listening") {
            setIsSpeaking(false);
          } else if (state === "speaking") {
            setIsSpeaking(true);
          }
          break;
        }

        case "input_audio_buffer.speech_started": {
          setIsSpeaking(true);
          setPartialTranscript("");

          // Phase 8: Record barge-in event
          const vadConfidence = (message.vad_confidence as number) || 0.8;
          if (enablePersonalization) {
            personalization.recordBargeIn(
              "hard_barge", // Will be determined by duration
              0, // Duration not known yet
              vadConfidence,
              { aiWasSpeaking: pipelineState === "speaking" },
            );
          }

          // Notify for barge-in handling
          options.onSpeechStarted?.();
          options.onStopPlayback?.();
          break;
        }

        case "input_audio_buffer.speech_stopped":
          setIsSpeaking(false);
          speechEndTimeRef.current = Date.now();
          // Reset timing refs for next utterance
          firstTranscriptTimeRef.current = null;
          firstLLMTokenTimeRef.current = null;
          break;

        case "heartbeat":
        case "pong": {
          // Track pong response for heartbeat monitoring
          lastPongTimeRef.current = Date.now();

          // Calculate RTT if we have a pending ping
          if (pendingPingTimeRef.current) {
            const rtt = Date.now() - pendingPingTimeRef.current;
            pendingPingTimeRef.current = null;
            voiceLog.debug(`[ThinkerTalker] Pong received, RTT: ${rtt}ms`);

            // Warn on high RTT (>500ms)
            if (rtt > 500) {
              voiceLog.warn(
                `[ThinkerTalker] High connection latency detected: ${rtt}ms`,
              );
            }
          }
          break;
        }

        case "error": {
          const errorCode = message.code as string;
          const errorMessage = message.message as string;
          const recoverable = message.recoverable as boolean;

          const err = new Error(`${errorCode}: ${errorMessage}`);
          if (recoverable) {
            voiceLog.warn("[ThinkerTalker] Recoverable error:", errorMessage);
            // Don't update status for recoverable errors
          } else {
            handleError(err);
          }
          break;
        }

        default:
          voiceLog.debug("[ThinkerTalker] Unhandled message type:", msgType);
      }
    },
    [
      options,
      updateStatus,
      updateMetrics,
      handleError,
      metrics,
      currentToolCalls,
      startHeartbeat,
      enableMultilingual,
      multilingual,
      enablePersonalization,
      personalization,
      enableConversationManagement,
      conversationManager,
      pipelineState,
    ],
  );

  // Keep ref updated
  handleMessageRef.current = handleMessage;

  /**
   * Initialize WebSocket connection to T/T pipeline
   */
  const initializeWebSocket = useCallback(
    (conversationId?: string): Promise<WebSocket> => {
      return new Promise((resolve, reject) => {
        // Check for auth token
        const accessToken = tokens?.accessToken;
        if (!accessToken) {
          reject(
            new Error("Not authenticated - please log in to use voice mode"),
          );
          return;
        }

        // Build WebSocket URL with auth token
        const apiBase = import.meta.env.VITE_API_URL || "";
        const wsProtocol = apiBase.startsWith("https") ? "wss" : "ws";
        const wsHost = apiBase.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProtocol}://${wsHost}/api/voice/pipeline-ws?token=${encodeURIComponent(accessToken)}`;

        voiceLog.debug(
          `[ThinkerTalker] Connecting to WebSocket (token present)`,
        );

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          voiceLog.debug("[ThinkerTalker] WebSocket connected");

          // Send session initialization message
          const initMessage = {
            type: "session.init",
            conversation_id: conversationId || null,
            voice_settings: options.voiceSettings || {},
          };
          ws.send(JSON.stringify(initMessage));

          updateStatus("connected");
          resolve(ws);
        };

        ws.onerror = (event) => {
          voiceLog.error("[ThinkerTalker] WebSocket error:", event);
          reject(new Error("WebSocket connection failed"));
        };

        ws.onclose = (event) => {
          voiceLog.debug(
            `[ThinkerTalker] WebSocket closed: ${event.code} ${event.reason}`,
          );

          if (!intentionalDisconnectRef.current) {
            scheduleReconnect();
          } else {
            updateStatus("disconnected");
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleMessageRef.current(message);
          } catch (err) {
            voiceLog.error("[ThinkerTalker] Failed to parse message:", err);
          }
        };

        // Connection timeout
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      });
    },
    [tokens, options.voiceSettings, updateStatus, scheduleReconnect],
  );

  /**
   * Initialize microphone and audio streaming
   */
  const initializeAudioStreaming = useCallback(async (ws: WebSocket) => {
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // 16kHz for STT
          channelCount: 1,
        },
      });
    } catch (err) {
      if (isMicPermissionError(err)) {
        const friendlyMessage = getMicErrorMessage(err);
        const micError = new Error(friendlyMessage);
        (micError as Error & { isFatal: boolean }).isFatal = true;
        throw micError;
      }
      throw new Error(
        `Failed to access microphone: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    mediaStreamRef.current = stream;

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const bufferSize = 2048;
      const scriptProcessor = audioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );
      processorNodeRef.current = scriptProcessor;

      let audioChunkCount = 0;

      scriptProcessor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Convert float32 to PCM16
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Base64 encode
        const uint8 = new Uint8Array(pcm16.buffer);
        const base64 = btoa(String.fromCharCode(...uint8));

        // Send audio chunk
        ws.send(
          JSON.stringify({
            type: "audio.input",
            audio: base64,
          }),
        );

        audioChunkCount++;
        if (audioChunkCount % 500 === 0) {
          voiceLog.debug(`[ThinkerTalker] Audio chunk #${audioChunkCount}`);
        }
      };

      // Connect nodes
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(scriptProcessor);
      scriptProcessor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      voiceLog.debug("[ThinkerTalker] Audio streaming initialized");
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        `Failed to initialize audio processing: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, []);

  /**
   * Connect to T/T pipeline
   */
  const connect = useCallback(async () => {
    if (
      statusRef.current === "connected" ||
      statusRef.current === "connecting"
    ) {
      voiceLog.warn("[ThinkerTalker] Already connected or connecting");
      return;
    }

    if (fatalErrorRef.current) {
      voiceLog.warn("[ThinkerTalker] Cannot connect - fatal error");
      return;
    }

    try {
      updateStatus("connecting");
      setError(null);
      connectStartTimeRef.current = Date.now();
      intentionalDisconnectRef.current = false;

      // Reset metrics
      setMetrics({
        connectionTimeMs: null,
        sttLatencyMs: null,
        llmFirstTokenMs: null,
        ttsFirstAudioMs: null,
        totalLatencyMs: null,
        sessionDurationMs: null,
        userUtteranceCount: 0,
        aiResponseCount: 0,
        toolCallCount: 0,
        bargeInCount: 0,
        reconnectCount: reconnectAttempts,
        sessionStartedAt: null,
      });

      // Initialize WebSocket
      const ws = await initializeWebSocket(options.conversation_id);
      wsRef.current = ws;

      // Initialize audio streaming
      await initializeAudioStreaming(ws);

      // Reset reconnect attempts on success
      setReconnectAttempts(0);

      voiceLog.debug("[ThinkerTalker] Connected successfully");
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to connect");

      if (
        (err as Error & { isFatal?: boolean })?.isFatal ||
        isMicPermissionError(err)
      ) {
        fatalErrorRef.current = true;
        setError(error);
        updateStatus("mic_permission_denied");
        options.onError?.(error);

        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        return;
      }

      handleError(error);

      if (status === "reconnecting") {
        scheduleReconnect();
      }
    }
  }, [
    updateStatus,
    initializeWebSocket,
    initializeAudioStreaming,
    handleError,
    scheduleReconnect,
    options,
    reconnectAttempts,
    status,
  ]);

  // Keep ref updated
  connectRef.current = connect;

  /**
   * Disconnect from T/T pipeline
   */
  const disconnect = useCallback(() => {
    if (
      statusRef.current === "disconnected" &&
      !wsRef.current &&
      !mediaStreamRef.current &&
      !audioContextRef.current
    ) {
      return;
    }

    voiceLog.debug("[ThinkerTalker] Disconnecting...");
    intentionalDisconnectRef.current = true;

    // Track cleaned resources for debugging
    const cleanedResources: string[] = [];

    // 1. Stop heartbeat first
    stopHeartbeat();
    cleanedResources.push("heartbeat");

    // 2. Close WebSocket - remove handlers first to prevent callbacks
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Intentional disconnect");
      }
      wsRef.current = null;
      cleanedResources.push("websocket");
    }

    // 3. Stop microphone tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
      cleanedResources.push("mediaStream");
    }

    // 4. Cleanup audio processor
    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      processorNodeRef.current = null;
      cleanedResources.push("audioProcessor");
    }

    // 5. Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore errors on close
      });
      audioContextRef.current = null;
      cleanedResources.push("audioContext");
    }

    // 6. Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
      cleanedResources.push("reconnectTimeout");
    }

    voiceLog.debug(
      `[ThinkerTalker] Cleanup complete: ${cleanedResources.join(", ")}`,
    );

    // Calculate session duration
    if (sessionStartTimeRef.current) {
      const sessionDuration = Date.now() - sessionStartTimeRef.current;
      updateMetrics({ sessionDurationMs: sessionDuration });
      sessionStartTimeRef.current = null;
    }

    // Reset timing refs
    connectStartTimeRef.current = null;
    speechEndTimeRef.current = null;
    firstTranscriptTimeRef.current = null;
    firstLLMTokenTimeRef.current = null;

    setReconnectAttempts(0);
    updateStatus("disconnected");
    setTranscript("");
    setPartialTranscript("");
    setIsSpeaking(false);
    setPipelineState("idle");
    setCurrentToolCalls([]);
  }, [updateStatus, updateMetrics, stopHeartbeat]);

  // Keep ref updated
  disconnectRef.current = disconnect;

  /**
   * Send barge-in signal to interrupt AI response
   */
  const bargeIn = useCallback(
    (bargeInType: ConversationBargeInType = "hard_barge") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return { shouldInterrupt: false };
      }

      // Phase 10: Check with conversation manager if barge-in should be allowed
      if (enableConversationManagement) {
        const result = conversationManager.handleBargeIn({
          id: `bi_${Date.now()}`,
          type: bargeInType,
          timestamp: Date.now(),
          duration: 0, // Duration not known at this point
          vadConfidence: personalization.vadSensitivity || 0.5,
          aiWasSpeaking: pipelineState === "speaking",
        });

        if (!result.shouldInterrupt) {
          voiceLog.debug(
            "[ThinkerTalker] Barge-in blocked by conversation manager:",
            result.message,
          );
          return result;
        }
      }

      voiceLog.debug("[ThinkerTalker] Sending barge-in signal");
      wsRef.current.send(JSON.stringify({ type: "barge_in" }));
      updateMetrics({ bargeInCount: metrics.bargeInCount + 1 });
      return { shouldInterrupt: true };
    },
    [
      updateMetrics,
      metrics.bargeInCount,
      enableConversationManagement,
      conversationManager,
      pipelineState,
      personalization.vadSensitivity,
    ],
  );

  /**
   * Send text message (fallback mode)
   */
  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      voiceLog.warn("[ThinkerTalker] WebSocket not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content: text,
      }),
    );
  }, []);

  /**
   * Reset fatal error state
   */
  const resetFatalError = useCallback(() => {
    if (fatalErrorRef.current) {
      voiceLog.debug("[ThinkerTalker] Resetting fatal error state");
      fatalErrorRef.current = false;
      setError(null);
      updateStatus("disconnected");
    }
  }, [updateStatus]);

  /**
   * Commit audio buffer (manual end of speech)
   */
  const commitAudio = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({ type: "audio.input.complete" }));
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (options.autoConnect) {
      connect();
    }

    return () => {
      disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.autoConnect]);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is now hidden
        voiceLog.debug("[ThinkerTalker] Tab hidden, pausing heartbeat");
        stopHeartbeat();
      } else {
        // Tab is now visible
        voiceLog.debug("[ThinkerTalker] Tab visible, checking connection");

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Connection still open - send immediate ping to verify
          voiceLog.debug("[ThinkerTalker] Sending verification ping");
          wsRef.current.send(
            JSON.stringify({
              type: "ping",
              ts: Date.now(),
            }),
          );
          // Resume heartbeat
          startHeartbeat();
        } else if (
          statusRef.current === "connected" ||
          statusRef.current === "ready"
        ) {
          // Was connected but WebSocket is no longer open - connection died while hidden
          voiceLog.warn(
            "[ThinkerTalker] Connection lost while tab was hidden, triggering reconnect",
          );
          // Don't set intentional disconnect - allow reconnection
          intentionalDisconnectRef.current = false;
          scheduleReconnect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startHeartbeat, stopHeartbeat, scheduleReconnect]);

  return {
    // State
    status,
    error,
    transcript,
    partialTranscript,
    isSpeaking,
    pipelineState,
    currentToolCalls,
    metrics,

    // Actions
    connect,
    disconnect,
    bargeIn,
    sendMessage,
    commitAudio,
    resetFatalError,

    // Derived state
    isConnected: status === "connected" || status === "ready",
    isConnecting: status === "connecting",
    isReady: status === "ready",
    isMicPermissionDenied: status === "mic_permission_denied",
    canSend:
      (status === "connected" || status === "ready") &&
      wsRef.current?.readyState === WebSocket.OPEN,
    isProcessing: pipelineState === "processing",
    isListening: pipelineState === "listening",

    // Phase 7: Multilingual
    multilingual: {
      currentLanguage: multilingual.currentLanguage,
      currentAccent: multilingual.currentAccent,
      detectedLanguage: multilingual.detectedLanguage,
      detectionConfidence: multilingual.detectionConfidence,
      isRtl: multilingual.isRtl,
      setLanguage: multilingual.setLanguage,
      setAccent: multilingual.setAccent,
      availableLanguages: multilingual.availableLanguages,
      availableAccents: multilingual.availableAccents,
      vadAdjustments: multilingual.vadAdjustments,
    },

    // Phase 8: Personalization
    personalization: {
      isCalibrated: personalization.isCalibrated,
      isCalibrating: personalization.isCalibrating,
      vadSensitivity: personalization.vadSensitivity,
      behaviorStats: personalization.behaviorStats,
      runCalibration: personalization.runCalibration,
      cancelCalibration: personalization.cancelCalibration,
      setVadSensitivity: personalization.setVadSensitivity,
      getRecommendedVadThreshold: personalization.getRecommendedVadThreshold,
    },

    // Phase 9: Offline VAD
    offlineVAD: {
      isListening: offlineVAD.isListening,
      isSpeaking: offlineVAD.isSpeaking,
      isUsingOfflineVAD: offlineVAD.isUsingOfflineVAD,
      currentEnergy: offlineVAD.currentEnergy,
      startListening: offlineVAD.startListening,
      stopListening: offlineVAD.stopListening,
      forceOffline: offlineVAD.forceOffline,
      forceNetwork: offlineVAD.forceNetwork,
      reset: offlineVAD.reset,
    },

    // Phase 10: Conversation Management
    conversationManager: {
      sentiment: conversationManager.sentiment,
      discourse: conversationManager.discourse,
      recommendations: conversationManager.recommendations,
      suggestedFollowUps: conversationManager.suggestedFollowUps,
      activeToolCalls: conversationManager.activeToolCalls,
      registerToolCall: conversationManager.registerToolCall,
      updateToolCallStatus: conversationManager.updateToolCallStatus,
    },
  };
}

export default useThinkerTalkerSession;
