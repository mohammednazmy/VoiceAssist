/**
 * @deprecated This hook uses OpenAI Realtime API which has been replaced
 * by the Thinker/Talker pipeline for better latency and tool support.
 *
 * Use useThinkerTalkerSession instead.
 *
 * Original description:
 * useRealtimeVoiceSession Hook
 * Manages WebSocket connection to OpenAI Realtime API for voice mode
 *
 * Features:
 * - Establishes WebSocket connection with session configuration from backend
 * - Handles mic capture and audio streaming (PCM16 format)
 * - Manages connection lifecycle (connect, disconnect, reconnect)
 * - Surfaces real-time events (transcripts, audio, errors)
 * - Automatic cleanup on unmount
 *
 * Phase 11: Pre-warming optimizations
 * - prewarmSession(): Pre-fetch session config before user clicks "Start Voice"
 * - prewarmMicPermission(): Request mic permission early on page load
 * - prewarmWebSocket(): Pre-establish WebSocket on voice button hover
 * - Expected latency improvement: 200-400ms
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { captureVoiceError } from "../lib/sentry";
import { useAuth } from "./useAuth";
import { voiceLog } from "../lib/logger";

// Types for Realtime API events
export interface RealtimeAuthInfo {
  type: string; // "ephemeral_token"
  token: string; // HMAC-signed ephemeral token (NOT the raw OpenAI key)
  expires_at: number; // Unix timestamp
}

export interface RealtimeSessionConfig {
  url: string;
  model: string;
  session_id: string;
  expires_at: number;
  conversation_id?: string | null;
  auth: RealtimeAuthInfo; // Ephemeral token auth (secure, no raw API key)
  voice_config: {
    voice: string;
    language?: string | null;
    modalities: string[];
    input_audio_format: string;
    output_audio_format: string;
    input_audio_transcription: {
      model: string;
    };
    turn_detection: {
      type: string;
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
    };
  };
}

export interface RealtimeTranscript {
  text: string;
  is_final: boolean;
  timestamp: number;
}

export interface RealtimeAudioChunk {
  audio: ArrayBuffer;
  timestamp: number;
}

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
 * Check if an error is a microphone permission error (fatal, no retry)
 */
function isMicPermissionError(err: unknown): boolean {
  if (err instanceof DOMException) {
    // NotAllowedError: User denied permission or page not secure
    // SecurityError: Feature policy blocks microphone
    // NotFoundError: No microphone device available
    return (
      err.name === "NotAllowedError" ||
      err.name === "SecurityError" ||
      err.name === "NotFoundError"
    );
  }
  // Also check error message for permission-related text
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
 * Get a user-friendly error message for mic permission errors
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

export interface VoiceSettings {
  voice?: string; // "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
  language?: string; // "en" | "es" | "fr" | "de" | "it" | "pt"
  vadSensitivity?: number; // 0-100
}

/**
 * Voice pipeline metrics for performance monitoring
 */
export interface VoiceMetrics {
  /** Time from connect() call to connected status (ms) */
  connectionTimeMs: number | null;
  /** Time from connection to first transcript (ms) */
  timeToFirstTranscriptMs: number | null;
  /** Time from speech_stopped to transcript completion (ms) */
  lastSttLatencyMs: number | null;
  /** Time from user speech end to AI audio start (ms) */
  lastResponseLatencyMs: number | null;
  /** Total session duration (ms) */
  sessionDurationMs: number | null;
  /** Count of user transcripts received */
  userTranscriptCount: number;
  /** Count of AI audio responses received */
  aiResponseCount: number;
  /** Count of reconnection attempts */
  reconnectCount: number;
  /** Timestamp of session start */
  sessionStartedAt: number | null;
}

export interface UseRealtimeVoiceSessionOptions {
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
    citations: Record<string, any>[];
  }) => void;
  onRelayPersist?: (ids: {
    user_message_id: string;
    assistant_message_id: string;
  }) => void;
  /** Called when user starts speaking (for barge-in) - stop any playing audio */
  onSpeechStarted?: () => void;
  autoConnect?: boolean;
}

export function useRealtimeVoiceSession(
  options: UseRealtimeVoiceSessionOptions = {},
) {
  const { apiClient } = useAuth();

  // State
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [partialTranscript, setPartialTranscript] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionConfig, setSessionConfig] =
    useState<RealtimeSessionConfig | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Metrics state
  const [metrics, setMetrics] = useState<VoiceMetrics>({
    connectionTimeMs: null,
    timeToFirstTranscriptMs: null,
    lastSttLatencyMs: null,
    lastResponseLatencyMs: null,
    sessionDurationMs: null,
    userTranscriptCount: 0,
    aiResponseCount: 0,
    reconnectCount: 0,
    sessionStartedAt: null,
  });

  // Refs for cleanup and persistence
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<
    ScriptProcessorNode | AudioWorkletNode | null
  >(null);
  const playbackQueueRef = useRef<AudioBufferSourceNode | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sessionExpiryCheckRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const intentionalDisconnectRef = useRef(false);
  // Track fatal errors (mic permission denied) to prevent reconnection loops
  const fatalErrorRef = useRef(false);

  // Phase 11: Pre-warming refs for latency optimization
  const prewarmedConfigRef = useRef<RealtimeSessionConfig | null>(null);
  const prewarmedWsRef = useRef<WebSocket | null>(null);
  const prewarmingInProgressRef = useRef(false);
  const micPermissionGrantedRef = useRef(false);

  // Timing refs for metrics tracking
  const connectStartTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const speechStopTimeRef = useRef<number | null>(null);
  const hasReceivedFirstTranscriptRef = useRef(false);
  const lastFinalTranscriptRef = useRef<string | null>(null);
  // Track if there's an active response (for cancellation on barge-in)
  const activeResponseIdRef = useRef<string | null>(null);

  // Refs to break circular dependencies between callbacks
  // Used so scheduleReconnect and initializeWebSocket can reference
  // functions that are defined later in the hook.
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const disconnectRef = useRef<() => void>(() => {});
  const updateStatusRef = useRef<(status: ConnectionStatus) => void>(() => {});
  const handleRealtimeMessageRef = useRef<
    (message: Record<string, unknown>) => void
  >(() => {});
  // Ref to track current status for error reporting (Sentry)
  const statusRef = useRef<ConnectionStatus>(status);

  // Constants for reconnection (aggressive latency optimization)
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 300; // 300ms (reduced from 1s for faster reconnection)
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds

  /**
   * Calculate reconnection delay with exponential backoff
   */
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY,
    );
    return delay;
  }, []);

  /**
   * Schedule automatic reconnection with exponential backoff
   * Uses refs (updateStatusRef, connectRef) to avoid circular dependency
   */
  const scheduleReconnect = useCallback(() => {
    // Don't reconnect if user intentionally disconnected
    if (intentionalDisconnectRef.current) {
      voiceLog.debug("Skipping reconnect (intentional disconnect)");
      return;
    }

    // Don't reconnect on fatal errors (mic permission denied)
    if (fatalErrorRef.current) {
      voiceLog.debug(
        "Skipping reconnect (fatal error - mic permission denied)",
      );
      return;
    }

    // Don't reconnect if max attempts reached
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      voiceLog.error(" Max reconnect attempts reached");
      updateStatusRef.current("failed");
      return;
    }

    // Calculate delay for this attempt
    const delay = calculateReconnectDelay(reconnectAttempts);
    voiceLog.debug(
      `Scheduling reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    // Update status to reconnecting
    updateStatusRef.current("reconnecting");

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Schedule reconnection
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts((prev) => prev + 1);
      connectRef.current();
    }, delay);
  }, [reconnectAttempts, calculateReconnectDelay]);

  /**
   * Update metrics and notify via callback
   */
  const updateMetrics = useCallback(
    (updates: Partial<VoiceMetrics>) => {
      setMetrics((prev) => {
        const updated = { ...prev, ...updates };
        // Notify callback with updated metrics
        options.onMetricsUpdate?.(updated);
        return updated;
      });
    },
    [options],
  );

  /**
   * Update status and notify via callback
   */
  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      // Update ref immediately for synchronous checks
      statusRef.current = newStatus;
      setStatus(newStatus);
      options.onConnectionChange?.(newStatus);

      // Track connection time when status becomes "connected"
      if (newStatus === "connected" && connectStartTimeRef.current) {
        const connectionTime = Date.now() - connectStartTimeRef.current;
        sessionStartTimeRef.current = Date.now();
        updateMetrics({
          connectionTimeMs: connectionTime,
          sessionStartedAt: sessionStartTimeRef.current,
        });
        voiceLog.debug(
          `[RealtimeVoiceSession] Connection established in ${connectionTime}ms`,
        );
      }
    },
    [options, updateMetrics],
  );

  // Keep ref updated with latest updateStatus function
  updateStatusRef.current = updateStatus;

  // Keep a ref to current metrics for error reporting
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // Keep statusRef in sync for error reporting
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /**
   * Handle errors - log, update state, and report to Sentry
   */
  const handleError = useCallback(
    (err: Error) => {
      voiceLog.error(" Error:", err);
      setError(err);
      updateStatus("error");
      options.onError?.(err);

      // Report to Sentry with voice context
      captureVoiceError(err, {
        status: statusRef.current,
        conversationId: options.conversation_id,
        metrics: {
          connectionTimeMs: metricsRef.current.connectionTimeMs,
          lastSttLatencyMs: metricsRef.current.lastSttLatencyMs,
          lastResponseLatencyMs: metricsRef.current.lastResponseLatencyMs,
          sessionDurationMs: metricsRef.current.sessionDurationMs,
        },
        breadcrumb: "voice_error_handler",
      });
    },
    [options, updateStatus],
  );

  /**
   * Relay a final transcript to the backend for RAG + persistence.
   */
  const relayTranscript = useCallback(
    async (transcript: string) => {
      if (!transcript.trim() || !options.conversation_id) return;
      try {
        const payload = await apiClient.relayVoiceTranscript({
          conversation_id: options.conversation_id,
          transcript,
          clinical_context_id: options.clinical_context_id ?? null,
        });
        options.onRelayPersist?.({
          user_message_id: payload.user_message_id,
          assistant_message_id: payload.assistant_message_id,
        });
        options.onRelayResult?.({
          answer: payload.answer,
          citations: payload.citations,
        });
      } catch (err) {
        voiceLog.error("[RealtimeVoiceSession] Relay failed", err);
      }
    },
    [apiClient, options],
  );

  /**
   * Fetch session configuration from backend
   */
  const fetchSessionConfig =
    useCallback(async (): Promise<RealtimeSessionConfig> => {
      try {
        const { voiceSettings } = options;
        const config = await apiClient.createRealtimeSession({
          conversation_id: options.conversation_id || null,
          voice: voiceSettings?.voice || null,
          language: voiceSettings?.language || null,
          vad_sensitivity: voiceSettings?.vadSensitivity ?? null,
        });
        setSessionConfig(config);
        return config;
      } catch (err) {
        throw new Error(
          `Failed to fetch session config: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }, [apiClient, options.conversation_id, options.voiceSettings]);

  /**
   * Phase 11: Pre-warm session configuration
   * Call this on page load or voice button hover to pre-fetch session config.
   * Reduces connection latency by ~100-200ms.
   */
  const prewarmSession = useCallback(async () => {
    // Don't prewarm if already have a valid config or currently prewarming
    if (prewarmingInProgressRef.current) {
      voiceLog.debug("[RealtimeVoiceSession] Prewarm already in progress");
      return;
    }

    // Check if existing prewarmed config is still valid (not expired)
    if (prewarmedConfigRef.current) {
      const expiresAt = prewarmedConfigRef.current.expires_at * 1000;
      const timeUntilExpiry = expiresAt - Date.now();
      if (timeUntilExpiry > 60000) {
        // More than 60s left
        voiceLog.debug("[RealtimeVoiceSession] Using cached prewarmed config");
        return;
      }
    }

    prewarmingInProgressRef.current = true;
    voiceLog.debug("[RealtimeVoiceSession] Pre-warming session config...");

    try {
      const { voiceSettings } = options;
      const config = await apiClient.createRealtimeSession({
        conversation_id: options.conversation_id || null,
        voice: voiceSettings?.voice || null,
        language: voiceSettings?.language || null,
        vad_sensitivity: voiceSettings?.vadSensitivity ?? null,
      });

      prewarmedConfigRef.current = config;
      voiceLog.debug(
        `[RealtimeVoiceSession] Session pre-warmed, expires in ${Math.round((config.expires_at * 1000 - Date.now()) / 1000)}s`,
      );
    } catch (err) {
      voiceLog.warn(
        `[RealtimeVoiceSession] Prewarm failed (non-fatal): ${err instanceof Error ? err.message : "Unknown"}`,
      );
      // Don't throw - prewarm failures are non-fatal
    } finally {
      prewarmingInProgressRef.current = false;
    }
  }, [apiClient, options.conversation_id, options.voiceSettings]);

  /**
   * Phase 11: Pre-warm microphone permission
   * Call this early (e.g., on chat page load) to prompt user for mic access.
   * Subsequent getUserMedia calls will be instant if permission was granted.
   * Returns true if permission was granted, false otherwise.
   */
  const prewarmMicPermission = useCallback(async (): Promise<boolean> => {
    // Already granted in this session
    if (micPermissionGrantedRef.current) {
      return true;
    }

    voiceLog.debug("[RealtimeVoiceSession] Pre-requesting mic permission...");

    try {
      // Request minimal mic access just to trigger permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Immediately stop the stream - we just wanted the permission
      stream.getTracks().forEach((track) => track.stop());

      micPermissionGrantedRef.current = true;
      voiceLog.debug("[RealtimeVoiceSession] Mic permission pre-granted");
      return true;
    } catch (err) {
      voiceLog.debug(
        `[RealtimeVoiceSession] Mic permission denied/failed: ${err instanceof Error ? err.message : "Unknown"}`,
      );
      return false;
    }
  }, []);

  /**
   * Phase 11: Pre-warm WebSocket connection
   * Call this on voice button hover to establish WebSocket before user clicks.
   * The prewarmed connection will be reused by connect() if still open.
   * Expected latency improvement: 100-200ms
   */
  const prewarmWebSocket = useCallback(async () => {
    // Need session config first
    if (!prewarmedConfigRef.current) {
      voiceLog.debug(
        "[RealtimeVoiceSession] No prewarmed config, prewarming session first...",
      );
      await prewarmSession();
    }

    const config = prewarmedConfigRef.current;
    if (!config) {
      voiceLog.debug(
        "[RealtimeVoiceSession] Cannot prewarm WebSocket without config",
      );
      return;
    }

    // Check if config is expired or about to expire
    const timeUntilExpiry = config.expires_at * 1000 - Date.now();
    if (timeUntilExpiry < 30000) {
      voiceLog.debug(
        "[RealtimeVoiceSession] Prewarmed config expiring soon, refreshing...",
      );
      prewarmedConfigRef.current = null;
      await prewarmSession();
      return;
    }

    // Check if we already have an open prewarmed WebSocket
    if (
      prewarmedWsRef.current &&
      prewarmedWsRef.current.readyState === WebSocket.OPEN
    ) {
      voiceLog.debug("[RealtimeVoiceSession] Prewarmed WebSocket already open");
      return;
    }

    voiceLog.debug("[RealtimeVoiceSession] Pre-warming WebSocket...");

    try {
      const wsUrl = `${config.url}?model=${config.model}`;
      const ws = new WebSocket(wsUrl, [
        "realtime",
        `openai-beta.realtime-v1`,
        `openai-insecure-api-key.${config.auth.token}`,
      ]);

      // Set up minimal event handlers for prewarmed connection
      ws.onopen = () => {
        voiceLog.debug("[RealtimeVoiceSession] Prewarmed WebSocket connected");
        // Send session.update to configure the session
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: config.voice_config.modalities,
              instructions: "You are a helpful medical AI assistant.",
              voice: config.voice_config.voice,
              input_audio_format: config.voice_config.input_audio_format,
              output_audio_format: config.voice_config.output_audio_format,
              input_audio_transcription:
                config.voice_config.input_audio_transcription,
              turn_detection: config.voice_config.turn_detection,
            },
          }),
        );
      };

      ws.onerror = () => {
        voiceLog.debug(
          "[RealtimeVoiceSession] Prewarmed WebSocket error (will retry on connect)",
        );
        prewarmedWsRef.current = null;
      };

      ws.onclose = () => {
        voiceLog.debug("[RealtimeVoiceSession] Prewarmed WebSocket closed");
        prewarmedWsRef.current = null;
      };

      prewarmedWsRef.current = ws;
    } catch (err) {
      voiceLog.debug(
        `[RealtimeVoiceSession] Prewarm WebSocket failed: ${err instanceof Error ? err.message : "Unknown"}`,
      );
    }
  }, [prewarmSession]);

  /**
   * Initialize WebSocket connection
   */
  const initializeWebSocket = useCallback(
    (config: RealtimeSessionConfig): Promise<WebSocket> => {
      return new Promise((resolve, reject) => {
        // Use the ephemeral token from auth for authentication
        const wsUrl = `${config.url}?model=${config.model}`;
        const ws = new WebSocket(wsUrl, [
          "realtime",
          `openai-beta.realtime-v1`,
          `openai-insecure-api-key.${config.auth.token}`,
        ]);

        // WebSocket event handlers
        ws.onopen = () => {
          voiceLog.debug(" WebSocket connected");
          captureVoiceError(new Error("voice_ws_open"), {
            status: "connected",
            conversationId: options.conversation_id,
            breadcrumb: "Voice WS connected",
          });

          // Send session.update message with configuration
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                modalities: config.voice_config.modalities,
                instructions: "You are a helpful medical AI assistant.",
                voice: config.voice_config.voice,
                input_audio_format: config.voice_config.input_audio_format,
                output_audio_format: config.voice_config.output_audio_format,
                input_audio_transcription:
                  config.voice_config.input_audio_transcription,
                turn_detection: config.voice_config.turn_detection,
              },
            }),
          );

          updateStatus("connected");
          resolve(ws);
        };

        ws.onerror = (event) => {
          voiceLog.error(" WebSocket error:", event);
          const err = new Error("WebSocket connection failed");
          captureVoiceError(err, {
            status: "error",
            conversationId: options.conversation_id,
            breadcrumb: "Voice WS error",
          });
          reject(err);
        };

        ws.onclose = (event) => {
          voiceLog.debug(
            `[RealtimeVoiceSession] WebSocket closed: ${event.code} ${event.reason}`,
          );
          captureVoiceError(new Error("voice_ws_close"), {
            status: "disconnected",
            conversationId: options.conversation_id,
            breadcrumb: `Voice WS closed code=${event.code}`,
          });

          // Check if session expired
          if (sessionConfig && sessionConfig.expires_at * 1000 < Date.now()) {
            voiceLog.debug(" Session expired");
            updateStatus("expired");
            return;
          }

          // If not an intentional disconnect, schedule reconnection
          if (!intentionalDisconnectRef.current) {
            voiceLog.debug(
              "[RealtimeVoiceSession] Unexpected disconnect, will attempt reconnect",
            );
            scheduleReconnect();
          } else {
            updateStatus("disconnected");
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // Use ref to avoid circular dependency with handleRealtimeMessage
            handleRealtimeMessageRef.current(message);
          } catch (err) {
            voiceLog.error(
              "[RealtimeVoiceSession] Failed to parse message:",
              err,
            );
          }
        };

        // Set timeout for connection
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      });
    },
    [updateStatus, scheduleReconnect, sessionConfig],
  );

  /**
   * Handle incoming Realtime API messages
   */
  const handleRealtimeMessage = useCallback(
    (message: Record<string, any>) => {
      switch (message.type) {
        case "session.created":
          voiceLog.debug(
            "[RealtimeVoiceSession] Session created:",
            message.session,
          );
          break;

        case "session.updated":
          voiceLog.debug(" Session updated");
          break;

        case "conversation.item.created":
          voiceLog.debug(" Item created:", message.item);
          break;

        case "response.created":
          // Track active response for cancellation on barge-in
          activeResponseIdRef.current = message.response?.id || null;
          voiceLog.debug(
            `[RealtimeVoiceSession] Response started: ${activeResponseIdRef.current}`,
          );
          break;

        case "response.done":
          // Response completed - clear active response tracking
          activeResponseIdRef.current = null;
          voiceLog.debug("[RealtimeVoiceSession] Response completed");
          break;

        case "response.cancelled":
          // Response was cancelled (barge-in)
          activeResponseIdRef.current = null;
          voiceLog.debug(
            "[RealtimeVoiceSession] Response cancelled (barge-in)",
          );
          break;

        case "conversation.item.input_audio_transcription.delta": {
          // Partial/streaming user speech transcription
          const partialText = message.delta || "";
          if (partialText) {
            setPartialTranscript((prev) => prev + partialText);

            // Track time to first transcript (partial counts)
            const now = Date.now();
            if (
              !hasReceivedFirstTranscriptRef.current &&
              sessionStartTimeRef.current
            ) {
              const timeToFirst = now - sessionStartTimeRef.current;
              hasReceivedFirstTranscriptRef.current = true;
              updateMetrics({ timeToFirstTranscriptMs: timeToFirst });
              voiceLog.debug(
                `[RealtimeVoiceSession] Time to first transcript: ${timeToFirst}ms`,
              );
            }

            options.onTranscript?.({
              text: partialText,
              is_final: false,
              timestamp: now,
            });
          }
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          // User speech transcription (final)
          const userTranscript = message.transcript || "";
          setTranscript(userTranscript);
          // Clear partial transcript since we now have the final one
          setPartialTranscript("");
          lastFinalTranscriptRef.current = userTranscript;

          // Track STT latency (time from speech_stopped to transcript)
          const now = Date.now();
          const sttLatency = speechStopTimeRef.current
            ? now - speechStopTimeRef.current
            : null;

          // Track time to first transcript (if we haven't already from partials)
          let timeToFirst: number | null = null;
          if (
            !hasReceivedFirstTranscriptRef.current &&
            sessionStartTimeRef.current
          ) {
            timeToFirst = now - sessionStartTimeRef.current;
            hasReceivedFirstTranscriptRef.current = true;
          }

          updateMetrics({
            lastSttLatencyMs: sttLatency,
            ...(timeToFirst !== null && {
              timeToFirstTranscriptMs: timeToFirst,
            }),
            userTranscriptCount: metrics.userTranscriptCount + 1,
          });

          if (sttLatency !== null) {
            voiceLog.debug(` STT latency: ${sttLatency}ms`);
          }

          options.onTranscript?.({
            text: userTranscript,
            is_final: true,
            timestamp: now,
          });

          // Relay transcript for RAG + persistence (fire and forget)
          void relayTranscript(userTranscript);
          break;
        }

        case "response.audio.delta": {
          // AI audio response chunk (base64 PCM16)
          // We ignore upstream AI audio; we rely on backend relay + TTS to keep content consistent with RAG.
          break;
        }

        case "response.audio_transcript.delta":
        case "response.audio_transcript.done":
          // Ignore OpenAI-generated AI transcripts to avoid divergence from backend RAG response
          break;

        case "input_audio_buffer.speech_started":
          setIsSpeaking(true);
          // Clear partial transcript for new utterance
          setPartialTranscript("");

          // Barge-in: Cancel any active response when user starts speaking
          if (
            activeResponseIdRef.current &&
            wsRef.current?.readyState === WebSocket.OPEN
          ) {
            voiceLog.debug(
              `[RealtimeVoiceSession] Barge-in: cancelling response ${activeResponseIdRef.current}`,
            );
            wsRef.current.send(
              JSON.stringify({
                type: "response.cancel",
              }),
            );
            activeResponseIdRef.current = null;
          }

          // Notify parent to stop audio playback
          options.onSpeechStarted?.();
          break;

        case "input_audio_buffer.speech_stopped":
          setIsSpeaking(false);
          // Record timestamp for latency calculations
          speechStopTimeRef.current = Date.now();
          break;

        case "error": {
          const errorMessage = message.error?.message || "Realtime API error";
          const errorCode = message.error?.code;

          // Handle benign errors gracefully (don't treat as fatal)
          // "Cancellation failed" happens when we try to cancel a response that already completed
          // This is expected during rapid barge-in scenarios
          if (
            errorMessage.includes("Cancellation failed") ||
            errorMessage.includes("no active response") ||
            errorCode === "cancellation_failed"
          ) {
            voiceLog.debug(
              `[RealtimeVoiceSession] Ignoring benign error: ${errorMessage}`,
            );
            break;
          }

          handleError(new Error(errorMessage));
          break;
        }

        default:
          voiceLog.debug(
            "[RealtimeVoiceSession] Unhandled message type:",
            message.type,
          );
      }
    },
    [options, handleError, updateMetrics, metrics],
  );

  // Keep ref updated with latest handleRealtimeMessage function
  handleRealtimeMessageRef.current = handleRealtimeMessage;

  /**
   * Initialize microphone and audio streaming
   * @throws Error with isMicPermissionError=true for permission errors (fatal, no retry)
   */
  const initializeAudioStreaming = useCallback(async (ws: WebSocket) => {
    // Get microphone stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000, // 24kHz for Realtime API
          channelCount: 1,
        },
      });
    } catch (err) {
      // Check if this is a permission error (fatal - don't retry)
      if (isMicPermissionError(err)) {
        const friendlyMessage = getMicErrorMessage(err);
        voiceLog.error(
          `[RealtimeVoiceSession] Mic permission error (fatal): ${err instanceof DOMException ? err.name : "unknown"}`,
        );
        // Create an error that preserves the fatal status
        const micError = new Error(friendlyMessage);
        (micError as any).isFatal = true;
        (micError as any).originalError = err;
        throw micError;
      }
      // Other errors (network, device issues) - can retry
      throw new Error(
        `Failed to access microphone: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    mediaStreamRef.current = stream;

    try {
      // Create audio context with NATIVE sample rate (don't force 24kHz)
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // IMPORTANT: Resume AudioContext - browsers suspend it by default until user interaction
      if (audioContext.state === "suspended") {
        voiceLog.debug(
          "[RealtimeVoiceSession] Resuming suspended AudioContext...",
        );
        await audioContext.resume();
      }

      const nativeSampleRate = audioContext.sampleRate;
      const targetSampleRate = 24000; // OpenAI Realtime API expects 24kHz
      const resampleRatio = nativeSampleRate / targetSampleRate;

      // Log MediaStream track info for debugging
      const audioTracks = stream.getAudioTracks();
      const trackInfo = audioTracks.map((t) => ({
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        settings: t.getSettings(),
      }));
      voiceLog.debug(
        `[RealtimeVoiceSession] AudioContext state: ${audioContext.state}, nativeSampleRate: ${nativeSampleRate}Hz, resampleRatio: ${resampleRatio.toFixed(2)}`,
      );
      voiceLog.debug(`[RealtimeVoiceSession] Audio tracks:`, trackInfo);

      const source = audioContext.createMediaStreamSource(stream);
      const targetChunkSize = 128; // Output chunks of 128 samples at 24kHz
      let audioChunkCount = 0;

      // Helper to send audio chunk via WebSocket
      const sendAudioChunk = (pcm16Buffer: ArrayBuffer, dbLevel: number) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        audioChunkCount++;
        // Log occasionally to avoid console spam (every 500 chunks = ~2.7 seconds at 24kHz)
        if (audioChunkCount % 500 === 0 && isFinite(dbLevel)) {
          voiceLog.debug(
            `[RealtimeVoiceSession] Audio chunk #${audioChunkCount}, level: ${dbLevel.toFixed(1)} dB`,
          );
        }

        // Backpressure: drop if socket is backed up
        if (ws.bufferedAmount > 256 * 1024) {
          voiceLog.warn(
            "[RealtimeVoiceSession] Dropping audio chunk due to backpressure",
          );
          return;
        }

        // Base64 encode PCM16
        const uint8 = new Uint8Array(pcm16Buffer);
        const base64 = btoa(String.fromCharCode(...uint8));
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64,
          }),
        );
      };

      // Try AudioWorklet first (modern approach), fallback to ScriptProcessorNode
      let useAudioWorklet = false;
      if (audioContext.audioWorklet) {
        try {
          await audioContext.audioWorklet.addModule(
            "/audio-capture-processor.js",
          );

          const workletNode = new AudioWorkletNode(
            audioContext,
            "audio-capture-processor",
            {
              processorOptions: {
                resampleRatio,
                targetChunkSize,
              },
            },
          );

          // Handle messages from worklet
          workletNode.port.onmessage = (event) => {
            switch (event.data.type) {
              case "audio":
                sendAudioChunk(event.data.pcm16, event.data.dbLevel);
                break;

              case "audio_suppressed":
                // Phase 11.1: Audio was suppressed due to echo detection
                voiceLog.debug(
                  `[RealtimeVoiceSession] Audio suppressed (${event.data.reason}), correlation: ${event.data.correlation?.toFixed(2)}`,
                );
                break;

              case "echo_detected":
                // Phase 11.1: Echo detection report (periodic)
                voiceLog.debug(
                  `[RealtimeVoiceSession] Echo detected: correlation=${event.data.correlation?.toFixed(2)}, count=${event.data.count}`,
                );
                break;

              case "ready":
                voiceLog.debug(
                  "[RealtimeVoiceSession] AudioWorklet processor ready",
                );
                break;
            }
          };

          // Connect: source -> workletNode -> (no output needed, worklet sends via port)
          source.connect(workletNode);
          processorNodeRef.current = workletNode;
          useAudioWorklet = true;

          voiceLog.debug(
            " Audio streaming initialized (AudioWorklet with resampling)",
          );
        } catch (workletError) {
          voiceLog.warn(
            `[RealtimeVoiceSession] AudioWorklet failed, falling back to ScriptProcessorNode: ${workletError instanceof Error ? workletError.message : "Unknown error"}`,
          );
        }
      }

      // Fallback: Use ScriptProcessorNode (deprecated but widely supported)
      if (!useAudioWorklet) {
        const bufferSize = 2048;
        const scriptProcessor = audioContext.createScriptProcessor(
          bufferSize,
          1,
          1,
        );
        processorNodeRef.current = scriptProcessor;

        // Resampling buffer for converting from native rate to 24kHz
        let resampleBuffer: number[] = [];

        scriptProcessor.onaudioprocess = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputData = event.inputBuffer.getChannelData(0);

          // Add input samples to resample buffer
          for (let i = 0; i < inputData.length; i++) {
            resampleBuffer.push(inputData[i]);
          }

          // Output resampled chunks at 24kHz
          while (resampleBuffer.length >= resampleRatio * targetChunkSize) {
            const pcm16 = new Int16Array(targetChunkSize);
            for (let i = 0; i < targetChunkSize; i++) {
              const srcIndex = i * resampleRatio;
              const srcIndexFloor = Math.floor(srcIndex);
              const srcIndexCeil = Math.min(
                srcIndexFloor + 1,
                resampleBuffer.length - 1,
              );
              const frac = srcIndex - srcIndexFloor;

              // Linear interpolation
              const sample =
                resampleBuffer[srcIndexFloor] * (1 - frac) +
                resampleBuffer[srcIndexCeil] * frac;

              // Convert float [-1, 1] to PCM16
              const s = Math.max(-1, Math.min(1, sample));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }

            // Remove used samples from buffer
            const samplesUsed = Math.floor(targetChunkSize * resampleRatio);
            resampleBuffer = resampleBuffer.slice(samplesUsed);

            // Calculate audio level (RMS) from PCM16 data
            let sumSquares = 0;
            for (let i = 0; i < pcm16.length; i++) {
              sumSquares += pcm16[i] * pcm16[i];
            }
            const rms = Math.sqrt(sumSquares / pcm16.length);
            const dbLevel = 20 * Math.log10(rms / 32768);

            sendAudioChunk(pcm16.buffer, dbLevel);
          }
        };

        // Connect: source -> scriptProcessor -> silentGain (muted) -> destination
        // ScriptProcessorNode requires connection to destination to work, but we don't want
        // to output mic audio to speakers (causes feedback). Use a gain node set to 0.
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0; // Mute output to prevent feedback
        source.connect(scriptProcessor);
        scriptProcessor.connect(silentGain);
        silentGain.connect(audioContext.destination);

        voiceLog.debug(
          " Audio streaming initialized (ScriptProcessor fallback with resampling, output muted)",
        );
      }
    } catch (err) {
      // Clean up the stream if audio context setup fails
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        `Failed to initialize audio processing: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, []);

  /**
   * Connect to Realtime API
   */
  const connect = useCallback(async () => {
    // Use ref for synchronous status check to prevent race conditions
    if (
      statusRef.current === "connected" ||
      statusRef.current === "connecting"
    ) {
      voiceLog.warn(" Already connected or connecting");
      return;
    }

    // Don't attempt to connect if we have a fatal error (mic permission denied)
    if (fatalErrorRef.current) {
      voiceLog.warn(
        "[RealtimeVoiceSession] Cannot connect - fatal error (mic permission denied)",
      );
      return;
    }

    try {
      updateStatus("connecting");
      setError(null);

      // Record connection start time for metrics
      connectStartTimeRef.current = Date.now();
      hasReceivedFirstTranscriptRef.current = false;

      // Reset metrics for new session
      setMetrics({
        connectionTimeMs: null,
        timeToFirstTranscriptMs: null,
        lastSttLatencyMs: null,
        lastResponseLatencyMs: null,
        sessionDurationMs: null,
        userTranscriptCount: 0,
        aiResponseCount: 0,
        reconnectCount: reconnectAttempts,
        sessionStartedAt: null,
      });

      // Clear intentional disconnect flag when starting new connection
      intentionalDisconnectRef.current = false;

      // Step 1: Use prewarmed session config if available, otherwise fetch new
      let config: RealtimeSessionConfig;
      if (
        prewarmedConfigRef.current &&
        prewarmedConfigRef.current.expires_at * 1000 - Date.now() > 30000
      ) {
        // Use prewarmed config (saves ~100-200ms)
        config = prewarmedConfigRef.current;
        setSessionConfig(config);
        prewarmedConfigRef.current = null; // Clear after use
        voiceLog.debug(
          "[RealtimeVoiceSession] Using prewarmed session config (latency saved)",
        );
      } else {
        // Fetch fresh config
        config = await fetchSessionConfig();
      }

      // Check if session is expired
      if (config.expires_at * 1000 < Date.now()) {
        throw new Error("Session configuration expired");
      }

      // Step 2: Use prewarmed WebSocket if available, otherwise initialize new
      let ws: WebSocket;
      if (
        prewarmedWsRef.current &&
        prewarmedWsRef.current.readyState === WebSocket.OPEN
      ) {
        // Use prewarmed WebSocket (saves ~100-200ms)
        ws = prewarmedWsRef.current;
        prewarmedWsRef.current = null; // Clear after use

        // Set up message handler on the prewarmed WebSocket
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleRealtimeMessageRef.current(message);
          } catch (err) {
            voiceLog.error(
              "[RealtimeVoiceSession] Failed to parse message:",
              err,
            );
          }
        };

        // Set up close handler for reconnection
        ws.onclose = (event) => {
          voiceLog.debug(
            `[RealtimeVoiceSession] WebSocket closed: ${event.code} ${event.reason}`,
          );

          // Check if session expired
          if (sessionConfig && sessionConfig.expires_at * 1000 < Date.now()) {
            voiceLog.debug(" Session expired");
            updateStatusRef.current("expired");
            return;
          }

          // If not an intentional disconnect, schedule reconnection
          if (!intentionalDisconnectRef.current) {
            scheduleReconnect();
          } else {
            updateStatusRef.current("disconnected");
          }
        };

        updateStatus("connected");
        voiceLog.debug(
          "[RealtimeVoiceSession] Using prewarmed WebSocket (latency saved)",
        );
      } else {
        // Initialize fresh WebSocket
        ws = await initializeWebSocket(config);
      }
      wsRef.current = ws;

      // Step 3: Initialize audio streaming
      await initializeAudioStreaming(ws);

      // Reset reconnect attempts on successful connection
      setReconnectAttempts(0);

      voiceLog.debug(" Connected successfully");
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to connect");

      // Check if this is a fatal mic permission error
      if ((err as any)?.isFatal || isMicPermissionError(err)) {
        voiceLog.error(
          "[RealtimeVoiceSession] Fatal mic permission error - will not retry",
        );
        fatalErrorRef.current = true;
        setError(error);
        updateStatus("mic_permission_denied");
        options.onError?.(error);

        // Close WebSocket if it was opened
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        return;
      }

      handleError(error);

      // If connection failed and we're in reconnect mode, schedule next attempt
      // But NOT if we have a fatal error
      if (status === "reconnecting" && !fatalErrorRef.current) {
        scheduleReconnect();
      }
    }
  }, [
    status,
    updateStatus,
    fetchSessionConfig,
    initializeWebSocket,
    initializeAudioStreaming,
    handleError,
    scheduleReconnect,
    options,
  ]);

  // Keep ref updated with latest connect function
  connectRef.current = connect;

  /**
   * Reset fatal error state (allows retry after user grants mic permission)
   */
  const resetFatalError = useCallback(() => {
    if (fatalErrorRef.current) {
      voiceLog.debug(" Resetting fatal error state");
      fatalErrorRef.current = false;
      setError(null);
      updateStatus("disconnected");
    }
  }, [updateStatus]);

  /**
   * Disconnect from Realtime API
   */
  const disconnect = useCallback(() => {
    // Guard: if already disconnected and no resources to clean up, skip
    if (
      statusRef.current === "disconnected" &&
      !wsRef.current &&
      !mediaStreamRef.current &&
      !audioContextRef.current
    ) {
      return;
    }

    voiceLog.debug(" Disconnecting...");

    // Clean up prewarmed resources (Phase 11)
    if (prewarmedWsRef.current) {
      prewarmedWsRef.current.close();
      prewarmedWsRef.current = null;
    }
    prewarmedConfigRef.current = null;

    // Mark as intentional disconnect to prevent auto-reconnect
    intentionalDisconnectRef.current = true;

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Cleanup audio processor
    if (processorNodeRef.current) {
      // For AudioWorkletNode, send stop message to cleanly terminate the processor
      if (processorNodeRef.current instanceof AudioWorkletNode) {
        processorNodeRef.current.port.postMessage({ type: "stop" });
      }
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (playbackQueueRef.current) {
      playbackQueueRef.current.stop();
      playbackQueueRef.current.disconnect();
      playbackQueueRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear session expiry check
    if (sessionExpiryCheckRef.current) {
      clearTimeout(sessionExpiryCheckRef.current);
      sessionExpiryCheckRef.current = null;
    }

    // Reset reconnect attempts
    setReconnectAttempts(0);

    // Calculate and record session duration
    if (sessionStartTimeRef.current) {
      const sessionDuration = Date.now() - sessionStartTimeRef.current;
      updateMetrics({ sessionDurationMs: sessionDuration });
      voiceLog.debug(
        `[RealtimeVoiceSession] Session duration: ${sessionDuration}ms`,
      );
      sessionStartTimeRef.current = null;
    }

    // Reset timing refs
    connectStartTimeRef.current = null;
    speechStopTimeRef.current = null;
    hasReceivedFirstTranscriptRef.current = false;

    updateStatus("disconnected");
    setTranscript("");
    setPartialTranscript("");
    setIsSpeaking(false);
  }, [updateStatus, updateMetrics]);

  /**
   * Send text message (for turn-taking or text-only mode)
   */
  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      voiceLog.warn(" WebSocket not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: text,
            },
          ],
        },
      }),
    );

    // Trigger response
    wsRef.current.send(
      JSON.stringify({
        type: "response.create",
      }),
    );
  }, []);

  /**
   * Phase 11.1: Notify AudioWorklet of playback state for echo detection
   * Call this when TTS audio starts/stops playing to enable echo suppression.
   * @param isPlaying - true when TTS audio is playing, false when stopped
   */
  const setEchoReferencePlaybackState = useCallback((isPlaying: boolean) => {
    const processor = processorNodeRef.current;
    if (processor && processor instanceof AudioWorkletNode) {
      processor.port.postMessage({
        type: "playbackState",
        isPlaying,
      });
      voiceLog.debug(
        `[RealtimeVoiceSession] Echo reference playback state: ${isPlaying ? "playing" : "stopped"}`,
      );
    }
  }, []);

  // Track if session refresh is in progress to prevent duplicate refreshes
  const isRefreshingSessionRef = useRef(false);

  /**
   * Monitor session expiry and proactively refresh
   * Uses refs for callbacks to avoid dependency array issues
   */
  useEffect(() => {
    // Only monitor if we have a session config and are connected
    if (!sessionConfig || status !== "connected") {
      isRefreshingSessionRef.current = false;
      return;
    }

    const checkExpiry = () => {
      // Guard: don't run check if already refreshing
      if (isRefreshingSessionRef.current) {
        return;
      }

      const now = Date.now();
      const expiresAt = sessionConfig.expires_at * 1000;
      const timeUntilExpiry = expiresAt - now;

      // If already expired
      if (timeUntilExpiry <= 0) {
        voiceLog.debug(" Session expired");
        updateStatusRef.current("expired");
        disconnectRef.current();
        return;
      }

      // If within 60 seconds of expiry, proactively refresh
      if (timeUntilExpiry <= 60000) {
        voiceLog.debug(
          `[RealtimeVoiceSession] Session expiring soon (${Math.round(timeUntilExpiry / 1000)}s), refreshing...`,
        );
        // Mark as refreshing to prevent duplicate calls
        isRefreshingSessionRef.current = true;
        // Disconnect and reconnect to get new session
        disconnectRef.current();
        setTimeout(() => {
          isRefreshingSessionRef.current = false;
          connectRef.current();
        }, 100);
        return;
      }

      // Schedule next check
      // Check again halfway to the 60s threshold, or in 30s, whichever is sooner
      const nextCheckDelay = Math.min(30000, (timeUntilExpiry - 60000) / 2);
      sessionExpiryCheckRef.current = setTimeout(checkExpiry, nextCheckDelay);
    };

    // Start monitoring
    checkExpiry();

    // Cleanup on unmount or config change
    return () => {
      if (sessionExpiryCheckRef.current) {
        clearTimeout(sessionExpiryCheckRef.current);
        sessionExpiryCheckRef.current = null;
      }
    };
    // Use only stable dependencies - callbacks are accessed via refs
  }, [sessionConfig, status]);

  // Keep disconnectRef updated with the latest disconnect function
  disconnectRef.current = disconnect;

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (options.autoConnect) {
      connect();
    }

    // Cleanup on unmount only - use ref to avoid dependency on disconnect
    return () => {
      disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.autoConnect]);

  return {
    // State
    status,
    error,
    transcript,
    partialTranscript,
    isSpeaking,
    sessionConfig,
    metrics,

    // Actions
    connect,
    disconnect,
    sendMessage,
    resetFatalError,

    // Phase 11: Pre-warming actions for latency optimization
    // Call prewarmSession on page load to pre-fetch session config (~100-200ms saved)
    // Call prewarmMicPermission early to prompt user for mic access
    // Call prewarmWebSocket on voice button hover to establish WebSocket (~100-200ms saved)
    prewarmSession,
    prewarmMicPermission,
    prewarmWebSocket,

    // Phase 11.1: Echo cancellation support
    // Call setEchoReferencePlaybackState(true) when TTS starts, (false) when it stops
    // This enables correlation-based echo detection in the AudioWorklet
    setEchoReferencePlaybackState,

    // Derived state
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    isMicPermissionDenied: status === "mic_permission_denied",
    canSend:
      status === "connected" && wsRef.current?.readyState === WebSocket.OPEN,
  };
}
