/**
 * Voice Mic Control Component
 *
 * Extracted from VoiceModePanel.tsx to improve modularity.
 * Renders the main microphone button with:
 * - Connection state visualization (rings, animations)
 * - Status text
 * - Action buttons (barge-in, end session, cancel recording)
 */

import { useCallback } from "react";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface VoiceMicControlProps {
  // Connection state
  status: VoiceStatus;
  isConnected: boolean;
  isSpeaking: boolean;
  isMicPermissionDenied: boolean;

  // Offline mode
  isOfflineMode: boolean;
  isOfflineRecording: boolean;
  recordingDuration: number;

  // Synthesis state
  isSynthesizing: boolean;

  // Actions
  onConnect: () => void;
  onDisconnect: () => void;
  onBargeIn: () => void;
  onStartOfflineRecording: () => void;
  onStopOfflineRecording: () => void;
  onCancelOfflineRecording: () => void;
}

/**
 * Format duration in seconds to MM:SS display
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceMicControl({
  status,
  isConnected,
  isSpeaking,
  isMicPermissionDenied,
  isOfflineMode,
  isOfflineRecording,
  recordingDuration,
  isSynthesizing,
  onConnect,
  onDisconnect,
  onBargeIn,
  onStartOfflineRecording,
  onStopOfflineRecording,
  onCancelOfflineRecording,
}: VoiceMicControlProps) {
  /**
   * Handle main button click
   */
  const handleMainButtonClick = useCallback(() => {
    if (isConnected || status === "connecting" || status === "reconnecting") {
      onDisconnect();
    } else if (isOfflineMode) {
      if (isOfflineRecording) {
        onStopOfflineRecording();
      } else {
        onStartOfflineRecording();
      }
    } else if (!isMicPermissionDenied) {
      onConnect();
    }
  }, [
    isConnected,
    status,
    isOfflineMode,
    isOfflineRecording,
    isMicPermissionDenied,
    onConnect,
    onDisconnect,
    onStartOfflineRecording,
    onStopOfflineRecording,
  ]);

  /**
   * Get button class based on state
   */
  const getButtonClass = () => {
    if (isConnected) {
      return "bg-green-500 hover:bg-green-600 text-white";
    }
    if (isOfflineRecording) {
      return "bg-red-500 hover:bg-red-600 text-white animate-pulse";
    }
    if (status === "connecting" || status === "reconnecting") {
      return "bg-yellow-500 text-white cursor-wait";
    }
    if (isMicPermissionDenied) {
      return "bg-red-100 text-red-400 cursor-not-allowed";
    }
    if (isOfflineMode) {
      return "bg-orange-500 hover:bg-orange-600 text-white";
    }
    return "bg-primary-500 hover:bg-primary-600 text-white";
  };

  /**
   * Get button aria-label
   */
  const getAriaLabel = () => {
    if (isConnected) return "End voice session";
    if (isOfflineRecording) return "Stop recording";
    if (status === "connecting") return "Connecting...";
    if (isOfflineMode) return "Start offline recording";
    return "Start voice session";
  };

  /**
   * Get status text
   */
  const getStatusText = () => {
    if (isConnected) {
      return isSpeaking ? "Listening..." : "Speak now";
    }
    if (isOfflineRecording) {
      return `Recording ${formatDuration(recordingDuration)}`;
    }
    if (status === "connecting") return "Connecting...";
    if (status === "reconnecting") return "Reconnecting...";
    if (isOfflineMode) return "Tap to record offline";
    return "Tap to start";
  };

  return (
    <div className="flex flex-col items-center py-4">
      {/* Main Mic Button with Ring Animation */}
      <div className="relative">
        {/* Outer ring animation when speaking */}
        {isConnected && isSpeaking && (
          <div className="absolute inset-0 -m-3">
            <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-50" />
            <div className="absolute inset-0 rounded-full border-2 border-green-300 animate-pulse" />
          </div>
        )}

        {/* Connected ring */}
        {isConnected && !isSpeaking && (
          <div className="absolute inset-0 -m-2 rounded-full border-2 border-green-400 opacity-60" />
        )}

        {/* Main button */}
        <button
          type="button"
          onClick={handleMainButtonClick}
          disabled={isMicPermissionDenied}
          className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${getButtonClass()}`}
          aria-label={getAriaLabel()}
          data-testid="main-mic-button"
        >
          {/* Mic icon */}
          <svg
            className={`w-8 h-8 sm:w-10 sm:h-10 ${status === "connecting" || status === "reconnecting" ? "animate-pulse" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </div>

      {/* Status text below button */}
      <p
        className="mt-3 text-sm font-medium text-neutral-600"
        data-testid="mic-status-text"
      >
        {getStatusText()}
      </p>

      {/* Action buttons row */}
      <div className="flex items-center gap-3 mt-3">
        {/* Barge-in button (only when connected and synthesizing) */}
        {isConnected && isSynthesizing && (
          <button
            type="button"
            onClick={onBargeIn}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-full transition-colors"
            aria-label="Interrupt AI response"
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
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            Interrupt
          </button>
        )}

        {/* End session button (only when connected) */}
        {isConnected && (
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
            aria-label="End voice session"
            data-testid="end-session-small"
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
                d="M5.636 5.636a9 9 0 1012.728 12.728M5.636 5.636L18.364 18.364M5.636 5.636L18.364 18.364"
              />
            </svg>
            End
          </button>
        )}

        {/* Cancel offline recording */}
        {isOfflineRecording && (
          <button
            type="button"
            onClick={onCancelOfflineRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors"
            aria-label="Cancel recording"
            data-testid="cancel-offline-recording"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default VoiceMicControl;
