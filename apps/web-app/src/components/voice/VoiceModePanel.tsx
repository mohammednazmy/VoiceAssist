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

import { useEffect, useRef, useState } from "react";
import {
  useRealtimeVoiceSession,
  type VoiceMetrics,
} from "../../hooks/useRealtimeVoiceSession";
import { WaveformVisualizer } from "../../utils/waveform";
import { VoiceModeSettings } from "./VoiceModeSettings";
import { VoiceMetricsDisplay } from "./VoiceMetricsDisplay";
import {
  useVoiceSettingsStore,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
} from "../../stores/voiceSettingsStore";

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

  const [userTranscript, setUserTranscript] = useState("");
  const [aiTranscript, setAiTranscript] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  // Track pending final transcripts to add to chat
  const pendingUserMessageRef = useRef<string | null>(null);
  const pendingAiMessageRef = useRef<string | null>(null);

  // Voice settings from store
  const { voice, language, showStatusHints } = useVoiceSettingsStore();

  // Initialize Realtime voice session
  const {
    status,
    error,
    transcript,
    isSpeaking,
    connect,
    disconnect,
    isConnected,
    isConnecting,
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
    autoConnect: false, // Manual connect
  });

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

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      audioQueueRef.current = [];
    };
  }, [disconnect]);

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

  const handleConnect = async () => {
    try {
      setMicPermissionDenied(false);
      await connect();
    } catch (err) {
      console.error("[VoiceModePanel] Failed to connect:", err);
      // Check if error is related to microphone permissions
      if (err instanceof Error) {
        if (
          err.message.includes("Permission denied") ||
          err.message.includes("NotAllowedError") ||
          err.message.includes("getUserMedia")
        ) {
          setMicPermissionDenied(true);
        }
      }
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setUserTranscript("");
    setAiTranscript("");
    setMicPermissionDenied(false);
  };

  return (
    <div
      className="bg-white border-2 border-primary-500 rounded-lg shadow-xl p-6 space-y-4"
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

      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-green-500"
                : status === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : status === "reconnecting"
                    ? "bg-orange-500 animate-pulse"
                    : status === "error" || status === "failed"
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
            {status === "connected"
              ? "Connected"
              : status === "connecting"
                ? "Connecting..."
                : status === "reconnecting"
                  ? "Reconnecting..."
                  : status === "error"
                    ? "Error"
                    : status === "failed"
                      ? "Connection Failed"
                      : status === "expired"
                        ? "Session Expired"
                        : "Disconnected"}
          </span>
        </div>

        {/* Show Start button when disconnected, failed, expired, or error (but not connecting/reconnecting) */}
        {(status === "disconnected" ||
          status === "failed" ||
          status === "expired" ||
          status === "error") && (
          <button
            type="button"
            onClick={handleConnect}
            className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-md hover:bg-primary-600 transition-colors"
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
            className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600 transition-colors"
            data-testid="end-voice-session"
          >
            End Session
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
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
              {micPermissionDenied
                ? "Microphone Access Denied"
                : "Connection Error"}
            </p>
            <p className="text-sm text-red-700 mt-1">
              {micPermissionDenied
                ? "Please allow microphone access in your browser settings to use voice mode. You may need to click the microphone icon in your browser's address bar."
                : error.message}
            </p>
            {!micPermissionDenied && (
              <button
                type="button"
                onClick={handleConnect}
                className="mt-2 px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Microphone Permission Denied Warning */}
      {micPermissionDenied && !error && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">
              Microphone Permission Required
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Voice mode needs access to your microphone. Please allow access
              when prompted, or check your browser settings.
            </p>
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
              className="mt-2 px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
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
              className="mt-2 px-3 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
            >
              Start New Session
            </button>
          </div>
        </div>
      )}

      {/* Waveform Visualization */}
      {isConnected && (
        <div className="p-4 bg-neutral-50 rounded-lg">
          <canvas
            ref={canvasRef}
            width={600}
            height={80}
            className="w-full h-20 rounded"
            style={{ maxWidth: "100%", height: "auto" }}
          />
          {isSpeaking && (
            <div className="mt-2 flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-600">
                Speaking...
              </span>
            </div>
          )}
        </div>
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
    </div>
  );
}
