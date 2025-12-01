/**
 * Unified Input Area
 *
 * Merged text/voice input component with mode toggle.
 * Supports automatic input detection, push-to-talk, and always-on voice modes.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Keyboard,
  Mic,
  MicOff,
  Send,
  Paperclip,
  Settings,
  Loader2,
  Volume2,
  Square,
  AlertCircle,
} from "lucide-react";
import {
  useUnifiedConversationStore,
  type MessageSource,
} from "../../stores/unifiedConversationStore";
import {
  useVoiceSettingsStore,
  type VoiceModeType,
} from "../../stores/voiceSettingsStore";
import { useVoiceModeStateMachine } from "../../hooks/useVoiceModeStateMachine";

// ============================================================================
// Types
// ============================================================================

interface UnifiedInputAreaProps {
  conversationId: string | null;
  onSendMessage: (content: string, source: MessageSource) => void;
  disabled?: boolean;
  /** Callback to toggle voice panel visibility */
  onToggleVoicePanel?: () => void;
  /** Whether the voice panel is currently open */
  isVoicePanelOpen?: boolean;
}

type InputMode = "text" | "voice";

// ============================================================================
// Component
// ============================================================================

export function UnifiedInputArea({
  conversationId,
  onSendMessage,
  disabled = false,
  onToggleVoicePanel,
  isVoicePanelOpen = false,
}: UnifiedInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textContent, setTextContent] = useState("");

  // Unified store state
  const {
    inputMode,
    voiceModeActive,
    voiceModeType,
    voiceState,
    isListening,
    isSpeaking,
    partialTranscript,
    setInputMode,
    activateVoiceMode,
    deactivateVoiceMode,
    startListening,
    stopListening,
  } = useUnifiedConversationStore();

  // Voice settings
  const {
    voiceModeType: settingsVoiceModeType,
    setVoiceModeType: setSettingsVoiceModeType,
  } = useVoiceSettingsStore();

  // Voice mode state machine
  const {
    voiceState: machineVoiceState,
    isActive: _machineIsActive, // eslint-disable-line @typescript-eslint/no-unused-vars
    isListening: machineIsListening,
    isProcessing,
    isResponding,
    hasError: voiceHasError,
    error: voiceError,
    partialTranscript: machinePartialTranscript,
    finalTranscript,
    activate: activateVoice,
    deactivate: deactivateVoice,
    retryConnection,
  } = useVoiceModeStateMachine({
    conversationId,
    onTranscriptComplete: (transcript) => {
      if (transcript.trim()) {
        onSendMessage(transcript, "voice");
      }
    },
    onError: (error) => {
      console.error("[UnifiedInputArea] Voice error:", error);
    },
  });

  // -------------------------------------------------------------------------
  // Text Input Handlers
  // -------------------------------------------------------------------------

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextContent(e.target.value);
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    },
    [],
  );

  const handleTextSubmit = useCallback(() => {
    if (!textContent.trim() || disabled) return;

    onSendMessage(textContent.trim(), "text");
    setTextContent("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [textContent, disabled, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTextSubmit();
      }

      // Space to toggle voice in push-to-talk mode (when text is empty)
      if (
        e.key === " " &&
        !textContent &&
        voiceModeActive &&
        settingsVoiceModeType === "push-to-talk"
      ) {
        e.preventDefault();
        if (!isListening) {
          startListening();
        }
      }
    },
    [
      handleTextSubmit,
      textContent,
      voiceModeActive,
      settingsVoiceModeType,
      isListening,
      startListening,
    ],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      // Release space in push-to-talk mode
      if (
        e.key === " " &&
        voiceModeActive &&
        settingsVoiceModeType === "push-to-talk" &&
        isListening
      ) {
        stopListening();
      }
    },
    [voiceModeActive, settingsVoiceModeType, isListening, stopListening],
  );

  // -------------------------------------------------------------------------
  // Voice Mode Handlers
  // -------------------------------------------------------------------------

  const handleModeToggle = useCallback(async () => {
    // If external voice panel control is provided, use it
    if (onToggleVoicePanel) {
      onToggleVoicePanel();
      return;
    }

    // Otherwise use internal voice mode
    if (voiceModeActive) {
      deactivateVoice();
      deactivateVoiceMode();
      setInputMode("text");
    } else {
      activateVoiceMode();
      setInputMode("voice");
      // Activate voice state machine
      await activateVoice();
    }
  }, [
    voiceModeActive,
    activateVoice,
    deactivateVoice,
    activateVoiceMode,
    deactivateVoiceMode,
    setInputMode,
    onToggleVoicePanel,
  ]);

  const handleVoiceModeTypeToggle = useCallback(() => {
    const newType: VoiceModeType =
      settingsVoiceModeType === "always-on" ? "push-to-talk" : "always-on";
    setSettingsVoiceModeType(newType);
  }, [settingsVoiceModeType, setSettingsVoiceModeType]);

  const handlePushToTalkStart = useCallback(() => {
    if (voiceModeActive && settingsVoiceModeType === "push-to-talk") {
      startListening();
    }
  }, [voiceModeActive, settingsVoiceModeType, startListening]);

  const handlePushToTalkEnd = useCallback(() => {
    if (
      voiceModeActive &&
      settingsVoiceModeType === "push-to-talk" &&
      isListening
    ) {
      stopListening();
    }
  }, [voiceModeActive, settingsVoiceModeType, isListening, stopListening]);

  // -------------------------------------------------------------------------
  // Render Helpers
  // -------------------------------------------------------------------------

  // Check if voice is active (either external panel or internal mode)
  const isVoiceActive = isVoicePanelOpen || voiceModeActive;

  const getModeToggleIcon = () => {
    if (isVoiceActive) {
      // When using external voice panel, just show mic icon
      if (isVoicePanelOpen) {
        return <Mic className="w-5 h-5" />;
      }
      // Internal voice mode - show state-based icon
      switch (voiceState) {
        case "listening":
          return <Mic className="w-5 h-5 animate-pulse" />;
        case "processing":
          return <Loader2 className="w-5 h-5 animate-spin" />;
        case "responding":
          return <Volume2 className="w-5 h-5" />;
        case "error":
          return <MicOff className="w-5 h-5" />;
        default:
          return <Mic className="w-5 h-5" />;
      }
    }
    return <Mic className="w-5 h-5" />;
  };

  const getModeToggleLabel = () => {
    if (isVoiceActive) {
      // When using external voice panel, just show "Voice"
      if (isVoicePanelOpen) {
        return "Voice";
      }
      // Internal voice mode - show state-based label
      switch (voiceState) {
        case "connecting":
          return "Connecting...";
        case "listening":
          return "Listening...";
        case "processing":
          return "Processing...";
        case "responding":
          return "Speaking...";
        case "error":
          return "Error";
        default:
          return "Voice";
      }
    }
    return "Voice";
  };

  const getModeToggleColor = () => {
    if (!isVoiceActive)
      return "bg-neutral-100 text-neutral-600 hover:bg-neutral-200";

    // When using external voice panel, show active color
    if (isVoicePanelOpen) {
      return "bg-primary-100 text-primary-700 hover:bg-primary-200";
    }

    // Internal voice mode - show state-based color
    switch (voiceState) {
      case "listening":
        return "bg-primary-500 text-white";
      case "processing":
        return "bg-primary-400 text-white";
      case "responding":
        return "bg-secondary-500 text-white";
      case "error":
        return "bg-error-500 text-white";
      default:
        return "bg-primary-100 text-primary-700 hover:bg-primary-200";
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="border-t border-neutral-200 bg-white">
      {/* Main Input Row */}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Mode Toggle Button */}
        <button
          onClick={handleModeToggle}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg font-medium transition-colors ${getModeToggleColor()}`}
          aria-label={isVoiceActive ? "Close voice mode" : "Open voice mode"}
          title={
            isVoiceActive
              ? "Click to close voice mode"
              : "Click to open voice mode"
          }
        >
          {getModeToggleIcon()}
          <span className="text-sm hidden sm:inline">
            {getModeToggleLabel()}
          </span>
        </button>

        {/* Dynamic Input Area */}
        <div className="flex-1 min-w-0">
          {/* When using external voice panel, show text input. Otherwise show internal voice UI */}
          {voiceModeActive && !isVoicePanelOpen ? (
            <VoiceInputArea
              voiceState={machineVoiceState || voiceState}
              voiceModeType={settingsVoiceModeType}
              isListening={machineIsListening || isListening}
              isSpeaking={isSpeaking}
              partialTranscript={machinePartialTranscript || partialTranscript}
              hasError={voiceHasError}
              errorMessage={voiceError?.message}
              onPushToTalkStart={handlePushToTalkStart}
              onPushToTalkEnd={handlePushToTalkEnd}
              onRetry={retryConnection}
              disabled={disabled}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={textContent}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={disabled}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-neutral-50 disabled:text-neutral-400"
              rows={1}
              style={{ maxHeight: "200px" }}
            />
          )}
        </div>

        {/* Send / Action Button */}
        {voiceModeActive ? (
          <button
            onClick={deactivateVoiceMode}
            className="p-2.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
            aria-label="End voice mode"
            title="End voice mode"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleTextSubmit}
            disabled={disabled || !textContent.trim()}
            className="p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors"
            aria-label="Send message"
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Secondary Actions Row */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="flex items-center gap-2">
          {/* Voice Mode Type Toggle (only when voice mode active) */}
          {voiceModeActive && (
            <button
              onClick={handleVoiceModeTypeToggle}
              className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  settingsVoiceModeType === "always-on"
                    ? "bg-green-500"
                    : "bg-neutral-400"
                }`}
              />
              <span>
                {settingsVoiceModeType === "always-on"
                  ? "Always-on"
                  : "Push-to-talk"}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Attachment Button */}
          <button
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Character count (text mode only) */}
          {!voiceModeActive && textContent.length > 0 && (
            <span className="text-xs text-neutral-400">
              {textContent.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Voice Input Area Sub-component
// ============================================================================

interface VoiceInputAreaProps {
  voiceState: string;
  voiceModeType: VoiceModeType;
  isListening: boolean;
  isSpeaking: boolean;
  partialTranscript: string;
  hasError?: boolean;
  errorMessage?: string;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onRetry?: () => void;
  disabled: boolean;
}

function VoiceInputArea({
  voiceState,
  voiceModeType,
  isListening,
  isSpeaking,
  partialTranscript,
  hasError,
  errorMessage,
  onPushToTalkStart,
  onPushToTalkEnd,
  onRetry,
  disabled,
}: VoiceInputAreaProps) {
  const getStatusText = () => {
    if (hasError) {
      return errorMessage || "Connection error. Click to retry.";
    }

    switch (voiceState) {
      case "connecting":
        return "Connecting to voice service...";
      case "listening":
        return voiceModeType === "push-to-talk"
          ? "Recording..."
          : "Listening... Speak now";
      case "processing":
        return "Processing your speech...";
      case "responding":
        return "AI is responding...";
      case "error":
        return errorMessage || "Connection error. Click to retry.";
      default:
        return voiceModeType === "push-to-talk"
          ? "Hold Space or click the mic to record"
          : "Ready to listen";
    }
  };

  return (
    <div className="relative">
      {/* Waveform / Status Area */}
      <div
        className={`flex items-center justify-center px-4 py-4 rounded-lg border transition-colors ${
          isListening
            ? "bg-primary-50 border-primary-200"
            : isSpeaking
              ? "bg-secondary-50 border-secondary-200"
              : "bg-neutral-50 border-neutral-200"
        }`}
      >
        {/* Waveform Visualization (placeholder) */}
        {(isListening || isSpeaking) && (
          <div className="flex items-center gap-1 mr-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all ${
                  isListening ? "bg-primary-500" : "bg-secondary-500"
                }`}
                style={{
                  height: `${12 + Math.random() * 20}px`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Status Text */}
        <div className="flex-1 text-center">
          <p className="text-sm text-neutral-600">{getStatusText()}</p>

          {/* Partial Transcript */}
          {partialTranscript && (
            <p className="mt-1 text-sm font-medium text-neutral-900 italic">
              "{partialTranscript}"
            </p>
          )}
        </div>

        {/* Error Retry Button */}
        {hasError && onRetry && (
          <button
            onClick={onRetry}
            className="ml-4 px-4 py-2 bg-error-100 text-error-700 rounded-lg hover:bg-error-200 transition-colors flex items-center gap-2"
            aria-label="Retry connection"
          >
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Retry</span>
          </button>
        )}

        {/* Push-to-Talk Button (PTT mode only) */}
        {!hasError &&
          voiceModeType === "push-to-talk" &&
          voiceState !== "connecting" && (
            <button
              onMouseDown={onPushToTalkStart}
              onMouseUp={onPushToTalkEnd}
              onMouseLeave={onPushToTalkEnd}
              onTouchStart={onPushToTalkStart}
              onTouchEnd={onPushToTalkEnd}
              disabled={disabled}
              className={`ml-4 p-3 rounded-full transition-colors ${
                isListening
                  ? "bg-error-500 text-white"
                  : "bg-primary-500 text-white hover:bg-primary-600"
              }`}
              aria-label={
                isListening ? "Recording... Release to stop" : "Hold to record"
              }
            >
              <Mic
                className={`w-6 h-6 ${isListening ? "animate-pulse" : ""}`}
              />
            </button>
          )}
      </div>
    </div>
  );
}

export default UnifiedInputArea;
