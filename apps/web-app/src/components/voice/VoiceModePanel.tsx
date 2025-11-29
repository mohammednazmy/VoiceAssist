/**
 * Voice Mode Panel
 * Integrates OpenAI Realtime API for full-duplex voice conversations
 *
 * Features:
 * - Real-time bidirectional audio streaming
 * - Live transcript display
 * - Waveform visualization
 * - Connection status indicator
 * - Seamless integration with Chat UI
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtimeVoiceSession,
  type VoiceMetrics,
} from "../../hooks/useRealtimeVoiceSession";
import { useOfflineVoiceCapture } from "../../hooks/useOfflineVoiceCapture";
import { WaveformVisualizer } from "../../utils/waveform";
import { VoiceModeSettings } from "./VoiceModeSettings";
import { VoiceMetricsDisplay } from "./VoiceMetricsDisplay";
import { VoiceTranscriptPreview } from "./VoiceTranscriptPreview";
import { PendingRecordingsPanel } from "./PendingRecordingsPanel";
import {
  VoiceBargeInIndicator,
  type BargeInEvent,
} from "./VoiceBargeInIndicator";
import {
  useVoiceSettingsStore,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
} from "../../stores/voiceSettingsStore";
import { useAuth } from "../../hooks/useAuth";
import { useWebRTCClient } from "../../hooks/useWebRTCClient";

/**
 * Format duration in seconds to MM:SS display
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface VoiceModePanelProps {
  conversationId?: string;
  onClose?: () => void;
  onTranscriptReceived?: (text: string, isFinal: boolean) => void;
  /** Called when a final user transcript is ready to be added to chat */
  onUserMessage?: (content: string) => void;
  /** Called when a final assistant response is ready to be added to chat */
  onAssistantMessage?: (content: string) => void;
  /** Called when voice metrics are updated (for observability/export) */
  onMetricsUpdate?: (metrics: VoiceMetrics) => void;
}

export function VoiceModePanel({
  conversationId,
  onClose,
  onTranscriptReceived,
  onUserMessage,
  onAssistantMessage,
  onMetricsUpdate,
}: VoiceModePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<WaveformVisualizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Track currently playing Audio element for stopping on barge-in
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Track if we're currently processing a response to prevent overlaps
  const isProcessingResponseRef = useRef(false);
  // Response ID to track current response and ignore stale ones
  const currentResponseIdRef = useRef<number>(0);

  const [userTranscript, setUserTranscript] = useState("");
  const [aiTranscript, setAiTranscript] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showPendingRecordings, setShowPendingRecordings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [currentBargeInEvent, setCurrentBargeInEvent] =
    useState<BargeInEvent | null>(null);

  // Track pending final transcripts to add to chat
  const pendingAiMessageRef = useRef<string | null>(null);

  // Voice settings from store
  const { voice, language, showStatusHints } = useVoiceSettingsStore();
  const { apiClient, tokens } = useAuth();

  /**
   * Stop any currently playing audio (for barge-in)
   */
  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      // Revoke the object URL to free memory
      if (currentAudioRef.current.src.startsWith("blob:")) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
      console.log("[VoiceModePanel] Stopped current audio playback");
    }
    // Clear the audio queue as well
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    // Increment response ID to invalidate any pending responses
    currentResponseIdRef.current++;
    isProcessingResponseRef.current = false;
    setIsSynthesizing(false);
  }, []);

  const {
    state: webRTCState,
    vadState,
    noiseSuppressionEnabled,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    bargeIn: bargeInWebRTC,
  } = useWebRTCClient({
    sessionId: conversationId || "voice-webrtc",
    token: tokens?.accessToken,
  });

  /**
   * Combined barge-in: stop audio + cancel response + reconnect WebRTC + log event
   */
  const bargeIn = useCallback(() => {
    console.log("[VoiceModePanel] Barge-in triggered");

    // Capture interrupted content before stopping
    const interruptedContent = aiTranscript || pendingAiMessageRef.current;

    stopCurrentAudio();
    bargeInWebRTC();

    // Create and show barge-in event
    const bargeInEvent: BargeInEvent = {
      id: `barge-${Date.now()}`,
      timestamp: Date.now(),
      interruptedContent: interruptedContent || undefined,
      // Estimate completion based on whether we had partial content
      completionPercentage: interruptedContent
        ? Math.min(90, interruptedContent.length / 5)
        : undefined,
    };

    setCurrentBargeInEvent(bargeInEvent);

    // Log event to backend for analytics (fire-and-forget)
    if (apiClient) {
      apiClient
        .logVoiceEvent({
          conversation_id: conversationId || null,
          event_type: "barge_in",
          timestamp: bargeInEvent.timestamp,
          metadata: {
            interrupted_content: bargeInEvent.interruptedContent,
            completion_percentage: bargeInEvent.completionPercentage,
          },
        })
        .catch((err) => {
          console.warn("[VoiceModePanel] Failed to log barge-in event:", err);
        });
    }
  }, [
    stopCurrentAudio,
    bargeInWebRTC,
    aiTranscript,
    apiClient,
    conversationId,
  ]);

  // Initialize offline voice capture hook
  const {
    isRecording: isOfflineRecording,
    isOfflineMode,
    recordingDuration,
    pendingCount,
    startRecording: startOfflineRecording,
    stopRecording: stopOfflineRecording,
    cancelRecording: cancelOfflineRecording,
    syncPendingRecordings,
    getPendingRecordings,
    deleteRecording,
  } = useOfflineVoiceCapture({
    conversationId: conversationId || "default",
    apiClient: apiClient
      ? {
          transcribeAudio: async (audio: Blob, _filename?: string) => {
            // Use the API client to transcribe audio
            const result = await apiClient.transcribeAudio(audio);
            return result;
          },
        }
      : undefined,
    onRecordingComplete: (recording) => {
      console.log(
        `[VoiceModePanel] Offline recording complete: ${recording.id}`,
      );
    },
    onUploadComplete: (recording, transcribedText) => {
      console.log(
        `[VoiceModePanel] Recording uploaded: ${recording.id}, text: ${transcribedText}`,
      );
      // Add transcribed text to chat
      if (transcribedText.trim()) {
        onUserMessage?.(transcribedText);
      }
    },
    onError: (error) => {
      console.error("[VoiceModePanel] Offline recording error:", error);
    },
  });

  // Initialize Realtime voice session
  const {
    status,
    error,
    transcript,
    partialTranscript,
    isSpeaking,
    connect,
    disconnect,
    isConnected,
    isConnecting: _isConnecting,
    isMicPermissionDenied,
    resetFatalError,
    metrics,
  } = useRealtimeVoiceSession({
    conversation_id: conversationId,
    onTranscript: (transcriptData) => {
      // Update local transcript display (AI responses)
      if (transcriptData.text) {
        if (transcriptData.is_final) {
          // Final AI response - set full transcript and add to chat
          setAiTranscript(transcriptData.text);
          pendingAiMessageRef.current = transcriptData.text;
          // Fire callback to add AI message to chat timeline
          if (transcriptData.text.trim()) {
            onAssistantMessage?.(transcriptData.text);
          }
        } else {
          // Partial - just append to display
          setAiTranscript((prev) => prev + transcriptData.text);
        }
        onTranscriptReceived?.(transcriptData.text, transcriptData.is_final);
      }
    },
    onAudioChunk: (chunk) => {
      // Queue audio chunks for playback
      audioQueueRef.current.push(chunk.audio);
      if (!isPlayingRef.current) {
        playAudioQueue();
      }
    },
    onError: (err) => {
      console.error("[VoiceModePanel] Error:", err);
    },
    onConnectionChange: (newStatus) => {
      console.log("[VoiceModePanel] Status changed:", newStatus);
    },
    onMetricsUpdate: (metrics) => {
      // Log key metrics for observability (no secrets or PHI)
      if (metrics.connectionTimeMs !== null) {
        console.log(
          `[VoiceModePanel] voice_session_connect_ms=${metrics.connectionTimeMs}`,
        );
      }
      if (metrics.lastSttLatencyMs !== null) {
        console.log(
          `[VoiceModePanel] voice_stt_latency_ms=${metrics.lastSttLatencyMs}`,
        );
      }
      if (metrics.lastResponseLatencyMs !== null) {
        console.log(
          `[VoiceModePanel] voice_first_reply_ms=${metrics.lastResponseLatencyMs}`,
        );
      }
      if (metrics.sessionDurationMs !== null) {
        console.log(
          `[VoiceModePanel] voice_session_duration_ms=${metrics.sessionDurationMs}`,
        );
      }
      // Forward to parent for backend export
      onMetricsUpdate?.(metrics);
    },
    onRelayResult: async ({ answer }) => {
      // Backend RAG answer: show and synthesize audio
      if (answer) {
        // Prevent overlapping responses - only process if not already processing
        if (isProcessingResponseRef.current) {
          console.log(
            "[VoiceModePanel] Skipping response - already processing another",
          );
          return;
        }

        // Stop any currently playing audio first (before incrementing response ID)
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          if (currentAudioRef.current.src.startsWith("blob:")) {
            URL.revokeObjectURL(currentAudioRef.current.src);
          }
          currentAudioRef.current = null;
        }

        // Capture current response ID to check for staleness later
        const responseId = ++currentResponseIdRef.current;
        isProcessingResponseRef.current = true;

        setAiTranscript(answer);
        pendingAiMessageRef.current = answer;
        onAssistantMessage?.(answer);

        try {
          setIsSynthesizing(true);
          const audioBlob = await apiClient.synthesizeSpeech(answer, voice);

          // Check if this response is still current (not cancelled by barge-in)
          if (responseId !== currentResponseIdRef.current) {
            console.log(
              "[VoiceModePanel] Response cancelled - skipping playback",
            );
            URL.revokeObjectURL(URL.createObjectURL(audioBlob));
            return;
          }

          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          currentAudioRef.current = audio;

          // Clean up when audio ends
          audio.onended = () => {
            if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
              isProcessingResponseRef.current = false;
            }
            URL.revokeObjectURL(url);
          };

          audio.onerror = () => {
            if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
              isProcessingResponseRef.current = false;
            }
            URL.revokeObjectURL(url);
          };

          await audio.play().catch((err) => {
            console.error("[VoiceModePanel] Audio play failed:", err);
            isProcessingResponseRef.current = false;
          });
        } catch (err) {
          console.error("[VoiceModePanel] Failed to synthesize speech", err);
          isProcessingResponseRef.current = false;
        } finally {
          setIsSynthesizing(false);
        }
      }
    },
    onRelayPersist: ({ user_message_id, assistant_message_id }) => {
      console.debug(
        "[VoiceModePanel] Persisted voice exchange",
        user_message_id,
        assistant_message_id,
      );
    },
    onSpeechStarted: () => {
      // User started speaking - stop any playing audio (barge-in)
      console.log("[VoiceModePanel] Speech started - stopping audio");
      stopCurrentAudio();
    },
    autoConnect: false, // Manual connect
  });

  // Use refs to avoid dependency array issues causing repeated connect/disconnect
  const connectWebRTCRef = useRef(connectWebRTC);
  const disconnectWebRTCRef = useRef(disconnectWebRTC);
  connectWebRTCRef.current = connectWebRTC;
  disconnectWebRTCRef.current = disconnectWebRTC;

  useEffect(() => {
    if (isConnected) {
      void connectWebRTCRef.current();
    } else {
      disconnectWebRTCRef.current();
    }
  }, [isConnected]);

  /**
   * Play queued audio chunks
   */
  const playAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioContext = audioContextRef.current;

      // Process all queued audio chunks
      while (audioQueueRef.current.length > 0) {
        const audioData = audioQueueRef.current.shift();
        if (!audioData) continue;

        // Convert PCM16 to AudioBuffer
        const audioBuffer = audioContext.createBuffer(
          1, // mono
          audioData.byteLength / 2, // 16-bit = 2 bytes per sample
          24000,
        );

        const channelData = audioBuffer.getChannelData(0);
        const view = new Int16Array(audioData);

        // Convert Int16 to Float32 (-1.0 to 1.0)
        for (let i = 0; i < view.length; i++) {
          channelData[i] = view[i] / 32768.0;
        }

        // Play audio
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();

        // Wait for audio to finish
        await new Promise((resolve) => {
          source.onended = resolve;
        });
      }
    } catch (err) {
      console.error("[VoiceModePanel] Audio playback error:", err);
    } finally {
      isPlayingRef.current = false;
    }
  };

  /**
   * Initialize waveform visualization when canvas is available
   */
  useEffect(() => {
    if (canvasRef.current && !waveformRef.current) {
      waveformRef.current = new WaveformVisualizer(canvasRef.current, {
        width: 600,
        height: 80,
        color: "#3b82f6",
        backgroundColor: "#f8fafc",
        lineWidth: 2,
      });
    }

    return () => {
      if (waveformRef.current) {
        waveformRef.current.disconnect();
        waveformRef.current = null;
      }
    };
  }, []);

  // Ref to hold the latest disconnect function for cleanup
  const disconnectFnRef = useRef(disconnect);
  disconnectFnRef.current = disconnect;

  /**
   * Cleanup on unmount only
   */
  useEffect(() => {
    return () => {
      disconnectFnRef.current();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      audioQueueRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Update user transcript from the hook and add to chat
   * The hook's transcript state contains the user's speech transcription
   */
  useEffect(() => {
    if (transcript && transcript.trim()) {
      setUserTranscript(transcript);
      // Fire callback to add user message to chat timeline
      onUserMessage?.(transcript);
    }
  }, [transcript, onUserMessage]);

  /**
   * Handle connect - resets fatal errors first to allow retry
   */
  const handleConnect = async () => {
    try {
      // Reset any fatal error state before attempting to connect
      // This allows users to retry after fixing mic permissions
      resetFatalError();
      await connect();
    } catch (err) {
      // Error handling is done in the hook - it will set isMicPermissionDenied
      // and update the error state appropriately
      console.error("[VoiceModePanel] Failed to connect:", err);
    }
  };

  /**
   * Handle disconnect - clears local state
   */
  const handleDisconnect = () => {
    disconnect();
    setUserTranscript("");
    setAiTranscript("");
  };

  /**
   * Handle sync with loading state
   */
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncPendingRecordings();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className="bg-white border-2 border-primary-500 rounded-lg shadow-xl p-4 sm:p-6 space-y-3 sm:space-y-4"
      data-testid="voice-mode-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-primary-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
            {isConnected && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              Voice Mode{" "}
              <span className="text-xs font-normal text-neutral-500">
                (Beta)
              </span>
            </h3>
            <p className="text-xs text-neutral-500">
              {VOICE_OPTIONS.find((v) => v.value === voice)?.label} /{" "}
              {LANGUAGE_OPTIONS.find((l) => l.value === language)?.label}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Pending recordings indicator */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPendingRecordings(true)}
              className="relative flex items-center space-x-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full transition-colors"
              aria-label={`${pendingCount} pending recording${pendingCount > 1 ? "s" : ""} - click to manage`}
              data-testid="pending-recordings-badge"
              title="Click to manage pending recordings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
              <span>{pendingCount}</span>
            </button>
          )}

          {/* Offline mode indicator */}
          {isOfflineMode && (
            <span
              className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 rounded-full"
              data-testid="offline-mode-indicator"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-3 h-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
                />
              </svg>
              <span>Offline</span>
            </span>
          )}

          {/* Settings gear icon */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Voice settings"
            data-testid="voice-settings-button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close voice mode"
            data-testid="close-voice-mode"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 border px-3 py-2">
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${vadState === "speaking" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700"}`}
          data-testid="vad-indicator"
        >
          VAD: {vadState === "speaking" ? "Speaking" : "Silence"}
        </span>
        <span
          className="text-xs text-neutral-600"
          data-testid="noise-suppression"
        >
          Noise suppression {noiseSuppressionEnabled ? "enabled" : "disabled"}
        </span>
        <span className="text-xs text-neutral-600" data-testid="webrtc-state">
          WebRTC {webRTCState}
        </span>
        <button
          type="button"
          onClick={bargeIn}
          className="text-xs px-3 py-1 rounded-full bg-primary-50 text-primary-700 hover:bg-primary-100"
          aria-label="Interrupt playback and capture"
        >
          Barge-in
        </button>
      </div>

      {/* Connection Status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 p-3 bg-neutral-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isOfflineRecording
                ? "bg-red-500 animate-pulse"
                : isOfflineMode
                  ? "bg-orange-500"
                  : status === "connected"
                    ? "bg-green-500"
                    : status === "connecting"
                      ? "bg-yellow-500 animate-pulse"
                      : status === "reconnecting"
                        ? "bg-orange-500 animate-pulse"
                        : status === "error" ||
                            status === "failed" ||
                            status === "mic_permission_denied"
                          ? "bg-red-500"
                          : status === "expired"
                            ? "bg-amber-500"
                            : "bg-neutral-300"
            }`}
          />
          <span
            className="text-sm font-medium text-neutral-700"
            data-testid="connection-status"
          >
            {isOfflineRecording
              ? `Recording (${formatDuration(recordingDuration)})`
              : isOfflineMode
                ? "Offline Mode"
                : status === "connected"
                  ? "Connected"
                  : status === "connecting"
                    ? "Connecting..."
                    : status === "reconnecting"
                      ? "Reconnecting..."
                      : status === "error"
                        ? "Error"
                        : status === "failed"
                          ? "Connection Failed"
                          : status === "mic_permission_denied"
                            ? "Microphone Blocked"
                            : status === "expired"
                              ? "Session Expired"
                              : "Disconnected"}
          </span>
        </div>

        {/* Offline recording controls */}
        {isOfflineMode && !isConnected && (
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {isOfflineRecording ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const recording = await stopOfflineRecording();
                    if (recording) {
                      console.log(
                        `[VoiceModePanel] Stopped recording: ${recording.id}`,
                      );
                    }
                  }}
                  className="min-h-[44px] flex-1 sm:flex-none px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600 transition-colors"
                  data-testid="stop-offline-recording"
                >
                  Stop Recording
                </button>
                <button
                  type="button"
                  onClick={cancelOfflineRecording}
                  className="min-h-[44px] px-3 py-2 bg-neutral-300 text-neutral-700 text-sm font-medium rounded-md hover:bg-neutral-400 transition-colors"
                  data-testid="cancel-offline-recording"
                  aria-label="Cancel recording"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startOfflineRecording}
                className="min-h-[44px] px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600 transition-colors w-full sm:w-auto flex items-center justify-center space-x-2"
                data-testid="start-offline-recording"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
                <span>Record Offline</span>
              </button>
            )}
          </div>
        )}

        {/* Show Start button when disconnected, failed, expired, or error (but not connecting/reconnecting/mic_permission_denied) and NOT in offline mode */}
        {!isOfflineMode &&
          (status === "disconnected" ||
            status === "failed" ||
            status === "expired" ||
            status === "error") &&
          !isMicPermissionDenied && (
            <button
              type="button"
              onClick={handleConnect}
              className="min-h-[44px] px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-md hover:bg-primary-600 transition-colors w-full sm:w-auto"
              data-testid="start-voice-session"
            >
              {status === "failed" || status === "expired"
                ? "Reconnect"
                : status === "error"
                  ? "Try Again"
                  : "Start Voice Session"}
            </button>
          )}

        {/* Show End button when connected, connecting, or reconnecting */}
        {(isConnected ||
          status === "connecting" ||
          status === "reconnecting") && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="min-h-[44px] px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600 transition-colors w-full sm:w-auto"
            data-testid="end-voice-session"
          >
            End Session
          </button>
        )}
      </div>

      {/* Microphone Permission Denied - Focused Error Card */}
      {isMicPermissionDenied && (
        <div
          className="p-4 bg-red-50 border-2 border-red-300 rounded-lg"
          data-testid="mic-permission-error"
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-red-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-base font-semibold text-red-900">
                Microphone Access Blocked
              </h4>
              <p className="text-sm text-red-700 mt-1">
                Voice mode needs microphone access to work. Your browser or
                system settings are currently blocking it.
              </p>
              <div className="mt-3 p-3 bg-red-100/50 rounded-md">
                <p className="text-xs font-medium text-red-800 mb-2">
                  To fix this:
                </p>
                <ol className="text-xs text-red-700 space-y-1 list-decimal list-inside">
                  <li>
                    Click the lock/info icon in your browser&apos;s address bar
                  </li>
                  <li>Find &quot;Microphone&quot; in the permissions list</li>
                  <li>Change it to &quot;Allow&quot;</li>
                  <li>Click &quot;Re-check Microphone&quot; below</li>
                </ol>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConnect}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                  data-testid="recheck-mic-button"
                >
                  Re-check Microphone
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                  data-testid="use-text-only-button"
                >
                  Use text-only mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General Error Display (non-mic errors) */}
      {error && !isMicPermissionDenied && (
        <div
          className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2"
          data-testid="connection-error"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">Connection Error</p>
            <p className="text-sm text-red-700 mt-1">{error.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnect}
                className="min-h-[44px] px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
                data-testid="use-text-only-error-button"
              >
                Use text-only mode instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconnecting Status */}
      {status === "reconnecting" && (
        <div
          className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start space-x-2"
          data-testid="reconnecting-alert"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5 animate-spin"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-900">
              Reconnecting to Voice Session
            </p>
            <p className="text-sm text-orange-700 mt-1">
              Connection was interrupted. Attempting to reconnect
              automatically...
            </p>
          </div>
        </div>
      )}

      {/* Connection Failed Status */}
      {status === "failed" && !error && (
        <div
          className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2"
          data-testid="failed-alert"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              Connection Failed
            </p>
            <p className="text-sm text-red-700 mt-1">
              Unable to establish a voice connection after multiple attempts.
              Please check your internet connection and try again.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              className="mt-2 min-h-[44px] px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Session Expired Status */}
      {status === "expired" && !error && (
        <div
          className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2"
          data-testid="expired-alert"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              Session Expired
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Your voice session has expired. Click below to start a new session
              and continue your conversation.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              className="mt-2 min-h-[44px] px-3 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
            >
              Start New Session
            </button>
          </div>
        </div>
      )}

      {/* Offline Mode Info Card */}
      {isOfflineMode && !isConnected && !isOfflineRecording && (
        <div
          className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start space-x-2"
          data-testid="offline-mode-info"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-900">
              You&apos;re Currently Offline
            </p>
            <p className="text-sm text-orange-700 mt-1">
              Real-time voice isn&apos;t available, but you can record voice
              messages offline. They&apos;ll be transcribed automatically when
              you&apos;re back online.
            </p>
            {pendingCount > 0 && (
              <p className="text-xs text-orange-600 mt-2">
                {pendingCount} recording{pendingCount > 1 ? "s" : ""} waiting to
                sync
              </p>
            )}
          </div>
        </div>
      )}

      {/* Offline Recording in Progress */}
      {isOfflineRecording && (
        <div
          className="p-4 bg-red-50 border-2 border-red-300 rounded-lg"
          data-testid="offline-recording-status"
        >
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6 text-red-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold text-red-900">Recording...</p>
              <p className="text-2xl font-mono font-bold text-red-700">
                {formatDuration(recordingDuration)}
              </p>
            </div>
          </div>
          <p className="text-xs text-red-600 mt-3">
            Speak clearly. Your recording will be transcribed when you&apos;re
            back online.
          </p>
        </div>
      )}

      {/* Waveform Visualization */}
      {isConnected && (
        <div className="p-3 sm:p-4 bg-neutral-50 rounded-lg">
          <canvas
            ref={canvasRef}
            width={600}
            height={80}
            className="w-full h-16 sm:h-20 rounded"
            style={{ maxWidth: "100%", height: "auto" }}
          />
          {isSpeaking && !partialTranscript && (
            <div className="mt-2 flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-600">
                Speaking...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Live Transcript Preview (while speaking) */}
      {isConnected && (
        <VoiceTranscriptPreview
          partialTranscript={partialTranscript}
          isSpeaking={isSpeaking}
        />
      )}

      {/* Transcript Display */}
      {isConnected && (
        <div className="space-y-3">
          {/* User Transcript */}
          {userTranscript && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 mb-1">You:</p>
              <p className="text-sm text-blue-800">{userTranscript}</p>
            </div>
          )}

          {/* AI Transcript */}
          {aiTranscript && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs font-semibold text-purple-900 mb-1">
                AI Assistant:
              </p>
              <p className="text-sm text-purple-800">{aiTranscript}</p>
            </div>
          )}
        </div>
      )}

      {/* Voice Metrics Display */}
      <VoiceMetricsDisplay metrics={metrics} isConnected={isConnected} />

      {/* Instructions - only show when showStatusHints is enabled */}
      {!isConnected && !error && showStatusHints && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">
            How Voice Mode Works:
          </h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Click "Start Voice Session" to begin</li>
            <li>Speak naturally - the AI will detect when you're done</li>
            <li>The AI will respond with both voice and text</li>
            <li>Your conversation is saved to this chat</li>
            <li>Click "End Session" when you're finished</li>
          </ul>
        </div>
      )}

      {/* Voice Settings Modal */}
      <VoiceModeSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Pending Recordings Modal */}
      {showPendingRecordings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPendingRecordings(false);
            }
          }}
        >
          <PendingRecordingsPanel
            getPendingRecordings={getPendingRecordings}
            deleteRecording={deleteRecording}
            syncPendingRecordings={handleSync}
            isSyncing={isSyncing}
            isOffline={isOfflineMode}
            onClose={() => setShowPendingRecordings(false)}
          />
        </div>
      )}

      {/* Voice Barge-in Indicator */}
      <VoiceBargeInIndicator
        event={currentBargeInEvent}
        onDismiss={() => setCurrentBargeInEvent(null)}
        autoDismissMs={4000}
      />
    </div>
  );
}
