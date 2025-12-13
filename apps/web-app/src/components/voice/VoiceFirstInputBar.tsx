/**
 * VoiceFirstInputBar - Phase 3 Voice Mode v4.1
 *
 * A unified voice-first input bar that prioritizes voice interaction
 * while providing text fallback. Respects VAD presets and RTL settings.
 *
 * Features:
 * - Voice-first design with prominent mic button
 * - Text input fallback (expandable)
 * - VAD preset integration (sensitive/balanced/relaxed/accessibility/custom)
 * - RTL layout support with auto-detection
 * - PHI mode indicator integration
 * - Always-on and push-to-talk modes
 * - Keyboard shortcuts (Space to talk, Escape to cancel)
 *
 * Reference: docs/voice/phase3-implementation-plan.md
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  useVoiceSettingsStore,
  VAD_PRESET_OPTIONS,
} from "../../stores/voiceSettingsStore";
import { cn } from "../../lib/utils";

// RTL language codes for auto-detection
const RTL_LANGUAGES = ["ar", "he", "fa", "ur", "yi", "ps", "sd"];

interface VoiceFirstInputBarProps {
  /** Callback when voice/text input is submitted */
  onSubmit: (input: string, isVoice: boolean) => void;
  /** Callback when recording starts */
  onRecordingStart?: () => void;
  /** Callback when recording stops */
  onRecordingStop?: () => void;
  /** Current PHI mode for indicator */
  phiMode?: "local" | "hybrid" | "cloud";
  /** PHI score (0-1) for visual indicator */
  phiScore?: number;
  /** Whether the assistant is currently speaking */
  isAssistantSpeaking?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Detected language code for RTL */
  detectedLanguage?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Custom class name */
  className?: string;
}

type InputState = "idle" | "listening" | "processing" | "text-input" | "error";

interface VADParameters {
  energyThresholdDb: number;
  silenceDurationMs: number;
}

export function VoiceFirstInputBar({
  onSubmit,
  onRecordingStart,
  onRecordingStop,
  phiMode = "cloud",
  phiScore = 0,
  isAssistantSpeaking = false,
  disabled = false,
  detectedLanguage,
  placeholder = "Press space or tap mic to speak...",
  className,
}: VoiceFirstInputBarProps) {
  const [inputState, setInputState] = useState<InputState>("idle");
  const [textValue, setTextValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [energy, setEnergy] = useState(0);

  const textInputRef = useRef<HTMLInputElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  // Get settings from store
  const {
    voiceModeType,
    vadPreset,
    vadCustomEnergyThresholdDb,
    vadCustomSilenceDurationMs,
    rtlEnabled,
    rtlAutoDetect,
    keyboardShortcutsEnabled,
  } = useVoiceSettingsStore();

  // Compute RTL direction
  const isRtl = useMemo(() => {
    if (rtlEnabled) return true;
    if (rtlAutoDetect && detectedLanguage) {
      return RTL_LANGUAGES.includes(detectedLanguage.toLowerCase().slice(0, 2));
    }
    return false;
  }, [rtlEnabled, rtlAutoDetect, detectedLanguage]);

  // Get VAD parameters from preset
  const vadParams = useMemo((): VADParameters => {
    if (vadPreset === "custom") {
      return {
        energyThresholdDb: vadCustomEnergyThresholdDb,
        silenceDurationMs: vadCustomSilenceDurationMs,
      };
    }
    const preset = VAD_PRESET_OPTIONS.find((p) => p.value === vadPreset);
    return {
      energyThresholdDb: preset?.energyThresholdDb ?? -35,
      silenceDurationMs: preset?.silenceDurationMs ?? 500,
    };
  }, [vadPreset, vadCustomEnergyThresholdDb, vadCustomSilenceDurationMs]);

  // PHI indicator color and icon
  const phiIndicator = useMemo(() => {
    const colors = {
      local: "bg-green-500",
      hybrid: "bg-yellow-500",
      cloud: "bg-blue-500",
    };
    const icons = {
      local: "shield",
      hybrid: "lock",
      cloud: "cloud",
    };
    return {
      color: colors[phiMode],
      icon: icons[phiMode],
      isSecure: phiMode === "local" || phiMode === "hybrid",
    };
  }, [phiMode]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!keyboardShortcutsEnabled || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space to start talking (when not in text input)
      if (
        e.code === "Space" &&
        inputState === "idle" &&
        document.activeElement !== textInputRef.current
      ) {
        e.preventDefault();
        handleStartRecording();
      }

      // Escape to cancel recording
      if (e.code === "Escape" && inputState === "listening") {
        e.preventDefault();
        handleCancelRecording();
      }

      // Tab to switch to text input
      if (e.code === "Tab" && inputState === "idle") {
        // Allow default tab behavior, but if focused on mic, switch to text mode
        if (document.activeElement === micButtonRef.current) {
          e.preventDefault();
          setInputState("text-input");
          setTimeout(() => textInputRef.current?.focus(), 0);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release space to stop (push-to-talk mode)
      if (
        e.code === "Space" &&
        inputState === "listening" &&
        voiceModeType === "push-to-talk"
      ) {
        handleStopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [inputState, voiceModeType, keyboardShortcutsEnabled, disabled]);

  const handleStartRecording = useCallback(() => {
    if (disabled || isAssistantSpeaking) return;

    setInputState("listening");
    setErrorMessage(null);
    onRecordingStart?.();

    // Simulate energy updates (in real implementation, this comes from VAD)
    const energyInterval = setInterval(() => {
      setEnergy(Math.random() * 0.8 + 0.2);
    }, 100);

    // Store interval ID for cleanup
    (
      window as unknown as { __energyInterval: NodeJS.Timeout }
    ).__energyInterval = energyInterval;
  }, [disabled, isAssistantSpeaking, onRecordingStart]);

  const handleStopRecording = useCallback(() => {
    setInputState("processing");
    setEnergy(0);
    onRecordingStop?.();

    // Clear energy interval
    const energyInterval = (
      window as unknown as { __energyInterval?: NodeJS.Timeout }
    ).__energyInterval;
    if (energyInterval) {
      clearInterval(energyInterval);
    }

    // Simulate processing (in real implementation, this waits for transcription)
    setTimeout(() => {
      // Simulated transcript for demo
      const demoTranscript = "This is a simulated voice transcript";
      onSubmit(demoTranscript, true);
      setInputState("idle");
    }, 1000);
  }, [onRecordingStop, onSubmit]);

  const handleCancelRecording = useCallback(() => {
    setInputState("idle");
    setEnergy(0);
    onRecordingStop?.();

    const energyInterval = (
      window as unknown as { __energyInterval?: NodeJS.Timeout }
    ).__energyInterval;
    if (energyInterval) {
      clearInterval(energyInterval);
    }
  }, [onRecordingStop]);

  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (textValue.trim()) {
        onSubmit(textValue.trim(), false);
        setTextValue("");
        setInputState("idle");
      }
    },
    [textValue, onSubmit],
  );

  const handleTextInputFocus = useCallback(() => {
    if (inputState === "idle") {
      setInputState("text-input");
    }
  }, [inputState]);

  const handleTextInputBlur = useCallback(() => {
    if (inputState === "text-input" && !textValue) {
      setInputState("idle");
    }
  }, [inputState, textValue]);

  // Mic button click/touch handlers
  const handleMicInteraction = useCallback(() => {
    if (inputState === "idle") {
      handleStartRecording();
    } else if (inputState === "listening") {
      if (voiceModeType === "always-on") {
        handleStopRecording();
      }
    }
  }, [inputState, voiceModeType, handleStartRecording, handleStopRecording]);

  return (
    <div
      className={cn(
        "voice-first-input-bar",
        "flex items-center gap-3 p-3 bg-white dark:bg-neutral-900",
        "border border-neutral-200 dark:border-neutral-700 rounded-2xl",
        "shadow-sm transition-all duration-200",
        inputState === "listening" && "ring-2 ring-blue-500 ring-opacity-50",
        inputState === "error" && "ring-2 ring-red-500 ring-opacity-50",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      dir={isRtl ? "rtl" : "ltr"}
      data-testid="voice-first-input-bar"
    >
      {/* PHI Mode Indicator */}
      <div
        className={cn(
          "flex-shrink-0 w-2 h-2 rounded-full transition-colors",
          phiIndicator.color,
        )}
        title={`PHI Mode: ${phiMode} (score: ${Math.round(phiScore * 100)}%)`}
        aria-label={`PHI security mode: ${phiMode}`}
      />

      {/* Main Input Area */}
      <div className="flex-1 flex items-center gap-2">
        {inputState === "text-input" ? (
          /* Text Input Mode */
          <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
            <input
              ref={textInputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={handleTextInputBlur}
              placeholder="Type your message..."
              className={cn(
                "flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800",
                "border border-neutral-200 dark:border-neutral-600 rounded-lg",
                "text-sm text-neutral-900 dark:text-neutral-100",
                "focus:outline-none focus:ring-2 focus:ring-blue-500",
                isRtl && "text-right",
              )}
              dir={isRtl ? "rtl" : "ltr"}
              autoFocus
            />
            <button
              type="submit"
              disabled={!textValue.trim()}
              className={cn(
                "px-4 py-2 bg-blue-500 text-white rounded-lg",
                "text-sm font-medium",
                "hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors",
              )}
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setInputState("idle");
                setTextValue("");
              }}
              className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              aria-label="Cancel text input"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
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
          </form>
        ) : inputState === "listening" ? (
          /* Listening Mode */
          <div className="flex-1 flex items-center gap-3">
            {/* Energy Visualizer */}
            <div className="flex-1 flex items-center gap-1 h-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 bg-blue-500 rounded-full transition-all duration-75",
                    isRtl && "order-last",
                  )}
                  style={{
                    height: `${Math.max(4, energy * 100 * Math.sin((i / 12) * Math.PI) * (0.5 + Math.random() * 0.5))}%`,
                    opacity: 0.6 + energy * 0.4,
                  }}
                />
              ))}
            </div>

            {/* Listening Status */}
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>Listening...</span>
            </div>

            {/* Stop/Cancel Buttons */}
            {voiceModeType === "always-on" && (
              <button
                type="button"
                onClick={handleStopRecording}
                className={cn(
                  "px-3 py-1.5 bg-blue-500 text-white rounded-lg",
                  "text-sm font-medium hover:bg-blue-600",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500",
                )}
              >
                Done
              </button>
            )}
            <button
              type="button"
              onClick={handleCancelRecording}
              className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
              aria-label="Cancel recording"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
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
          </div>
        ) : inputState === "processing" ? (
          /* Processing Mode */
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <svg
              className="w-5 h-5 animate-spin text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing speech...</span>
          </div>
        ) : (
          /* Idle Mode - Voice-First Prompt */
          <div
            className={cn(
              "flex-1 flex items-center gap-2",
              "text-neutral-500 dark:text-neutral-400 text-sm cursor-pointer",
            )}
            onClick={handleTextInputFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextInputFocus();
            }}
            role="button"
            tabIndex={0}
          >
            <span className={cn(isRtl && "order-last")}>{placeholder}</span>
          </div>
        )}
      </div>

      {/* Microphone Button */}
      <button
        ref={micButtonRef}
        type="button"
        disabled={disabled || inputState === "processing"}
        onClick={handleMicInteraction}
        onMouseDown={
          voiceModeType === "push-to-talk" && inputState === "idle"
            ? handleStartRecording
            : undefined
        }
        onMouseUp={
          voiceModeType === "push-to-talk" && inputState === "listening"
            ? handleStopRecording
            : undefined
        }
        onTouchStart={
          voiceModeType === "push-to-talk" && inputState === "idle"
            ? handleStartRecording
            : undefined
        }
        onTouchEnd={
          voiceModeType === "push-to-talk" && inputState === "listening"
            ? handleStopRecording
            : undefined
        }
        className={cn(
          "flex-shrink-0 p-3 rounded-full transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          inputState === "listening"
            ? "bg-red-500 text-white hover:bg-red-600 scale-110"
            : inputState === "processing"
              ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-wait"
              : "bg-blue-500 text-white hover:bg-blue-600 active:scale-95",
        )}
        aria-label={
          inputState === "listening"
            ? voiceModeType === "push-to-talk"
              ? "Release to stop recording"
              : "Tap to stop recording"
            : inputState === "processing"
              ? "Processing..."
              : voiceModeType === "push-to-talk"
                ? "Hold to record"
                : "Tap to start recording"
        }
      >
        {inputState === "listening" ? (
          /* Recording Icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
            className="w-6 h-6 animate-pulse"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        ) : inputState === "processing" ? (
          /* Processing Icon */
          <svg
            className="w-6 h-6 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          /* Mic Icon */
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
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>

      {/* Text Input Toggle (visible in idle mode) */}
      {inputState === "idle" && (
        <button
          type="button"
          onClick={handleTextInputFocus}
          className={cn(
            "flex-shrink-0 p-2 text-neutral-400 hover:text-neutral-600",
            "dark:hover:text-neutral-300 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg",
          )}
          aria-label="Switch to text input"
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
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
        </button>
      )}

      {/* VAD Preset Indicator (small badge) */}
      <div
        className={cn(
          "absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-xs",
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
          "border border-neutral-200 dark:border-neutral-700",
          "opacity-0 group-hover:opacity-100 transition-opacity",
        )}
        title={`VAD: ${vadPreset} (${vadParams.energyThresholdDb}dB, ${vadParams.silenceDurationMs}ms)`}
      >
        {VAD_PRESET_OPTIONS.find((p) => p.value === vadPreset)?.icon}
      </div>

      {/* Error Display */}
      {errorMessage && (
        <div
          className={cn(
            "absolute top-full left-0 right-0 mt-2 p-2",
            "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
            "rounded-lg text-sm text-red-600 dark:text-red-400",
          )}
        >
          {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceFirstInputBar;
