/**
 * useRealtimeVoiceSession Hook
 * Manages WebSocket connection to OpenAI Realtime API for voice mode
 *
 * Features:
 * - Establishes WebSocket connection with session configuration from backend
 * - Handles mic capture and audio streaming (PCM16 format)
 * - Manages connection lifecycle (connect, disconnect, reconnect)
 * - Surfaces real-time events (transcripts, audio, errors)
 * - Automatic cleanup on unmount
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
  voiceSettings?: VoiceSettings;
  onTranscript?: (transcript: RealtimeTranscript) => void;
  onAudioChunk?: (chunk: RealtimeAudioChunk) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onMetricsUpdate?: (metrics: VoiceMetrics) => void;
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
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sessionExpiryCheckRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const intentionalDisconnectRef = useRef(false);
  // Track fatal errors (mic permission denied) to prevent reconnection loops
  const fatalErrorRef = useRef(false);

  // Timing refs for metrics tracking
  const connectStartTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const speechStopTimeRef = useRef<number | null>(null);
  const hasReceivedFirstTranscriptRef = useRef(false);

  // Refs to break circular dependencies between callbacks
  // Used so scheduleReconnect and initializeWebSocket can reference
  // functions that are defined later in the hook.
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const updateStatusRef = useRef<(status: ConnectionStatus) => void>(() => {});
  const handleRealtimeMessageRef = useRef<(message: any) => void>(() => {});
  // Ref to track current status for error reporting (Sentry)
  const statusRef = useRef<ConnectionStatus>(status);

  // Constants for reconnection
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000; // 1 second
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
      });
    },
    [options, updateStatus],
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
          reject(new Error("WebSocket connection failed"));
        };

        ws.onclose = (event) => {
          voiceLog.debug(
            `[RealtimeVoiceSession] WebSocket closed: ${event.code} ${event.reason}`,
          );

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
    (message: any) => {
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
          break;
        }

        case "response.audio.delta": {
          // AI audio response chunk (base64 PCM16)
          const audioData = message.delta;
          if (audioData) {
            const now = Date.now();

            // Track response latency (first audio delta after speech stopped)
            if (speechStopTimeRef.current) {
              const responseLatency = now - speechStopTimeRef.current;
              updateMetrics({
                lastResponseLatencyMs: responseLatency,
                aiResponseCount: metrics.aiResponseCount + 1,
              });
              voiceLog.debug(
                `[RealtimeVoiceSession] Response latency: ${responseLatency}ms`,
              );
              // Clear to avoid double-counting for subsequent audio chunks
              speechStopTimeRef.current = null;
            }

            const buffer = Uint8Array.from(atob(audioData), (c) =>
              c.charCodeAt(0),
            ).buffer;
            options.onAudioChunk?.({
              audio: buffer,
              timestamp: now,
            });
          }
          break;
        }

        case "response.audio_transcript.delta":
          // AI speech transcript (partial)
          const aiTranscript = message.delta || "";
          setTranscript((prev) => prev + aiTranscript);
          options.onTranscript?.({
            text: aiTranscript,
            is_final: false,
            timestamp: Date.now(),
          });
          break;

        case "response.audio_transcript.done":
          // AI speech transcript (final)
          const finalTranscript = message.transcript || "";
          setTranscript(finalTranscript);
          options.onTranscript?.({
            text: finalTranscript,
            is_final: true,
            timestamp: Date.now(),
          });
          break;

        case "input_audio_buffer.speech_started":
          setIsSpeaking(true);
          // Clear partial transcript for new utterance
          setPartialTranscript("");
          break;

        case "input_audio_buffer.speech_stopped":
          setIsSpeaking(false);
          // Record timestamp for latency calculations
          speechStopTimeRef.current = Date.now();
          break;

        case "error":
          handleError(
            new Error(message.error?.message || "Realtime API error"),
          );
          break;

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
      // Create audio context and processor
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      // Process audio data and send to WebSocket
      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send audio chunk to Realtime API
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: btoa(
              String.fromCharCode.apply(
                null,
                Array.from(new Uint8Array(pcm16.buffer)),
              ),
            ),
          }),
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      voiceLog.debug(" Audio streaming initialized");
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
    if (status === "connected" || status === "connecting") {
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

      // Step 1: Fetch session config from backend
      const config = await fetchSessionConfig();

      // Check if session is expired
      if (config.expires_at * 1000 < Date.now()) {
        throw new Error("Session configuration expired");
      }

      // Step 2: Initialize WebSocket
      const ws = await initializeWebSocket(config);
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
    voiceLog.debug(" Disconnecting...");

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

    // Cleanup audio context
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
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
   * Monitor session expiry and proactively refresh
   */
  useEffect(() => {
    // Only monitor if we have a session config and are connected
    if (!sessionConfig || status !== "connected") {
      return;
    }

    const checkExpiry = () => {
      const now = Date.now();
      const expiresAt = sessionConfig.expires_at * 1000;
      const timeUntilExpiry = expiresAt - now;

      // If already expired
      if (timeUntilExpiry <= 0) {
        voiceLog.debug(" Session expired");
        updateStatus("expired");
        disconnect();
        return;
      }

      // If within 60 seconds of expiry, proactively refresh
      if (timeUntilExpiry <= 60000) {
        voiceLog.debug(
          `[RealtimeVoiceSession] Session expiring soon (${Math.round(timeUntilExpiry / 1000)}s), refreshing...`,
        );
        // Disconnect and reconnect to get new session
        disconnect();
        setTimeout(() => {
          connect();
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
  }, [sessionConfig, status, updateStatus, disconnect, connect]);

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (options.autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [options.autoConnect, connect, disconnect]);

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

    // Derived state
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    isMicPermissionDenied: status === "mic_permission_denied",
    canSend:
      status === "connected" && wsRef.current?.readyState === WebSocket.OPEN,
  };
}
