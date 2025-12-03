/**
 * @deprecated This component uses OpenAI Realtime API which has been replaced
 * by the Thinker/Talker pipeline for better latency and tool support.
 *
 * Use ThinkerTalkerVoicePanel instead.
 *
 * Original description:
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
import { VoiceModeSettings } from "./VoiceModeSettings";
import { VoiceMetricsDisplay } from "./VoiceMetricsDisplay";
import { VoiceTranscriptPreview } from "./VoiceTranscriptPreview";
import { PendingRecordingsPanel } from "./PendingRecordingsPanel";
import {
  VoiceBargeInIndicator,
  type BargeInEvent,
} from "./VoiceBargeInIndicator";
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator";
import { VoiceActivityIndicator } from "./VoiceActivityIndicator";
import { VoiceMicControl, type VoiceStatus } from "./VoiceMicControl";
import {
  useVoiceSettingsStore,
  VOICE_OPTIONS,
} from "../../stores/voiceSettingsStore";
import { useAuth } from "../../hooks/useAuth";
import { useWebRTCClient } from "../../hooks/useWebRTCClient";
import { useStreamingAudio } from "../../hooks/useStreamingAudio";

// Note: LANGUAGE_OPTIONS is defined in voiceSettingsStore but not currently used in this component

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
  const {
    voice,
    language,
    showStatusHints,
    ttsProvider,
    elevenlabsVoiceId,
    stability,
    similarityBoost,
    style,
  } = useVoiceSettingsStore();
  const { apiClient, tokens } = useAuth();

  // Initialize streaming audio hook for low-latency TTS
  const {
    playStream,
    stop: stopStreamingAudio,
    state: streamingState,
  } = useStreamingAudio({
    onFirstAudio: (ttfaMs) => {
      console.log(`[VoiceModePanel] Streaming TTFA: ${ttfaMs}ms`);
    },
    onEnd: () => {
      console.log("[VoiceModePanel] Streaming playback ended");
      isProcessingResponseRef.current = false;
    },
    onError: (error) => {
      console.error("[VoiceModePanel] Streaming playback error:", error);
      isProcessingResponseRef.current = false;
    },
  });

  /**
   * Stop any currently playing audio (for barge-in)
   */
  const stopCurrentAudio = useCallback(() => {
    // Stop standard Audio element playback
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
    // Stop streaming audio playback
    stopStreamingAudio();
    // Clear the audio queue as well
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    // Increment response ID to invalidate any pending responses
    currentResponseIdRef.current++;
    isProcessingResponseRef.current = false;
    setIsSynthesizing(false);
  }, [stopStreamingAudio]);

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
        stopCurrentAudio();

        // Capture current response ID to check for staleness later
        const responseId = ++currentResponseIdRef.current;
        isProcessingResponseRef.current = true;

        setAiTranscript(answer);
        pendingAiMessageRef.current = answer;
        onAssistantMessage?.(answer);

        try {
          setIsSynthesizing(true);

          // Use streaming for ElevenLabs (lower latency), blob for OpenAI
          const useStreaming = ttsProvider === "elevenlabs";
          const effectiveVoice =
            ttsProvider === "elevenlabs"
              ? elevenlabsVoiceId || "Rachel"
              : voice;

          if (useStreaming) {
            // Streaming playback for ElevenLabs - lower TTFA
            console.log("[VoiceModePanel] Using streaming TTS (ElevenLabs)");
            const response = await apiClient.synthesizeSpeechStream(answer, {
              voiceId: effectiveVoice,
              provider: ttsProvider,
              stability,
              similarityBoost,
              style,
              language,
            });

            // Check if this response is still current (not cancelled by barge-in)
            if (responseId !== currentResponseIdRef.current) {
              console.log(
                "[VoiceModePanel] Response cancelled - skipping streaming playback",
              );
              return;
            }

            // Play using streaming audio hook (isProcessingResponseRef is managed by onEnd/onError callbacks)
            await playStream(response);
          } else {
            // Standard blob playback for OpenAI
            console.log("[VoiceModePanel] Using standard TTS (OpenAI HD)");
            const audioBlob = await apiClient.synthesizeSpeech(
              answer,
              effectiveVoice,
            );

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
          }
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
      {/* Header - Simplified with connection status indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-neutral-900">Voice Mode</h3>
          <ConnectionStatusIndicator
            status={status}
            isOfflineMode={isOfflineMode}
            isOfflineRecording={isOfflineRecording}
            reconnectAttempts={metrics.reconnectCount}
          />
        </div>

        <div className="flex items-center space-x-2">
          {/* Pending recordings badge */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPendingRecordings(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full transition-colors"
              aria-label={`${pendingCount} pending recording${pendingCount > 1 ? "s" : ""}`}
              data-testid="pending-recordings-badge"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
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

          {/* Voice/Language info */}
          <span className="hidden sm:inline text-xs text-neutral-500">
            {VOICE_OPTIONS.find((v) => v.value === voice)?.label}
          </span>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Voice settings"
            data-testid="voice-settings-button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
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

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Close voice mode"
            data-testid="close-voice-mode"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
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

      {/* Central Microphone Control */}
      <VoiceMicControl
        status={status as VoiceStatus}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        isMicPermissionDenied={isMicPermissionDenied}
        isOfflineMode={isOfflineMode}
        isOfflineRecording={isOfflineRecording}
        recordingDuration={recordingDuration}
        isSynthesizing={isSynthesizing}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onBargeIn={bargeIn}
        onStartOfflineRecording={startOfflineRecording}
        onStopOfflineRecording={() => {
          stopOfflineRecording().then((recording) => {
            if (recording)
              console.log(
                `[VoiceModePanel] Stopped recording: ${recording.id}`,
              );
          });
        }}
        onCancelOfflineRecording={cancelOfflineRecording}
      />

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

      {/* Voice Activity Visualization */}
      <VoiceActivityIndicator
        isSpeaking={isSpeaking}
        isSynthesizing={isSynthesizing}
        isConnected={isConnected}
        className="py-2"
      />

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
        <div className="p-3 bg-blue-50/70 border border-blue-200/50 rounded-lg text-center">
          <p className="text-sm text-blue-700">
            Tap the microphone to start a voice conversation
          </p>
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
