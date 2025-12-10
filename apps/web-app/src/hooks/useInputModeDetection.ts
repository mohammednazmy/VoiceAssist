/**
 * Input Mode Detection Hook
 *
 * Provides automatic detection for switching between text and voice input modes.
 * Monitors user interactions and suggests/auto-switches modes based on:
 * - Keyboard activity (suggests text mode)
 * - Audio input detection (suggests voice mode)
 * - Device capabilities
 * - User preferences
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useUnifiedConversationStore,
  type InputMode,
} from "../stores/unifiedConversationStore";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface InputModeDetectionOptions {
  /**
   * Whether to enable automatic mode switching
   * @default true
   */
  autoSwitch?: boolean;

  /**
   * Delay before auto-switching modes (ms)
   * @default 2000
   */
  autoSwitchDelay?: number;

  /**
   * Minimum typing speed to trigger text mode (chars/second)
   * @default 2
   */
  typingThreshold?: number;

  /**
   * Whether to detect audio input for voice mode
   * @default true
   */
  detectAudio?: boolean;

  /**
   * Callback when mode switch is suggested
   */
  onModeSuggestion?: (suggested: InputMode, reason: string) => void;
}

export interface InputModeDetectionReturn {
  // State
  suggestedMode: InputMode | null;
  suggestionReason: string | null;
  hasKeyboardActivity: boolean;
  hasAudioActivity: boolean;
  hasMicrophoneAccess: boolean | null;

  // Actions
  acceptSuggestion: () => void;
  dismissSuggestion: () => void;
  resetDetection: () => void;
  checkMicrophoneAccess: () => Promise<boolean>;

  // Manual overrides
  forceTextMode: () => void;
  forceVoiceMode: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useInputModeDetection(
  options: InputModeDetectionOptions = {},
): InputModeDetectionReturn {
  const {
    autoSwitch = true,
    autoSwitchDelay = 2000,
    typingThreshold = 2,
    detectAudio = true,
    onModeSuggestion,
  } = options;

  // Store state
  const { inputMode, setInputMode } = useUnifiedConversationStore();

  // Local state
  const [suggestedMode, setSuggestedMode] = useState<InputMode | null>(null);
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [hasKeyboardActivity, setHasKeyboardActivity] = useState(false);
  const [hasAudioActivity, setHasAudioActivity] = useState(false);
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState<
    boolean | null
  >(null);

  // Refs for tracking
  const keyPressTimestamps = useRef<number[]>([]);
  const lastActivityRef = useRef<number>(0);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Clear suggestion timeout
  const clearSuggestionTimeout = useCallback(() => {
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
      suggestionTimeoutRef.current = null;
    }
  }, []);

  // Make suggestion
  const makeSuggestion = useCallback(
    (mode: InputMode, reason: string) => {
      if (mode === inputMode) return; // Already in this mode

      voiceLog.debug(`[InputModeDetection] Suggesting ${mode}: ${reason}`);
      setSuggestedMode(mode);
      setSuggestionReason(reason);
      onModeSuggestion?.(mode, reason);

      // Auto-switch after delay if enabled
      if (autoSwitch) {
        clearSuggestionTimeout();
        suggestionTimeoutRef.current = setTimeout(() => {
          voiceLog.debug(`[InputModeDetection] Auto-switching to ${mode}`);
          setInputMode(mode);
          setSuggestedMode(null);
          setSuggestionReason(null);
        }, autoSwitchDelay);
      }
    },
    [
      inputMode,
      autoSwitch,
      autoSwitchDelay,
      setInputMode,
      onModeSuggestion,
      clearSuggestionTimeout,
    ],
  );

  // Accept suggestion
  const acceptSuggestion = useCallback(() => {
    if (suggestedMode) {
      voiceLog.debug(
        `[InputModeDetection] Accepting suggestion: ${suggestedMode}`,
      );
      setInputMode(suggestedMode);
      setSuggestedMode(null);
      setSuggestionReason(null);
      clearSuggestionTimeout();
    }
  }, [suggestedMode, setInputMode, clearSuggestionTimeout]);

  // Dismiss suggestion
  const dismissSuggestion = useCallback(() => {
    voiceLog.debug("[InputModeDetection] Dismissing suggestion");
    setSuggestedMode(null);
    setSuggestionReason(null);
    clearSuggestionTimeout();
  }, [clearSuggestionTimeout]);

  // Reset detection
  const resetDetection = useCallback(() => {
    keyPressTimestamps.current = [];
    setHasKeyboardActivity(false);
    setHasAudioActivity(false);
    dismissSuggestion();
  }, [dismissSuggestion]);

  // Check microphone access
  const checkMicrophoneAccess = useCallback(async (): Promise<boolean> => {
    try {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      const hasAccess = result.state === "granted";
      setHasMicrophoneAccess(hasAccess);
      return hasAccess;
    } catch {
      // Permissions API not supported, try getUserMedia
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        setHasMicrophoneAccess(true);
        return true;
      } catch {
        setHasMicrophoneAccess(false);
        return false;
      }
    }
  }, []);

  // Force text mode
  const forceTextMode = useCallback(() => {
    voiceLog.debug("[InputModeDetection] Forcing text mode");
    setInputMode("text");
    dismissSuggestion();
  }, [setInputMode, dismissSuggestion]);

  // Force voice mode
  const forceVoiceMode = useCallback(() => {
    voiceLog.debug("[InputModeDetection] Forcing voice mode");
    setInputMode("voice");
    dismissSuggestion();
  }, [setInputMode, dismissSuggestion]);

  // Track keyboard activity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys and non-printable keys
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return;

      const now = Date.now();
      lastActivityRef.current = now;

      // Add timestamp
      keyPressTimestamps.current.push(now);

      // Keep only last 5 seconds of timestamps
      const fiveSecondsAgo = now - 5000;
      keyPressTimestamps.current = keyPressTimestamps.current.filter(
        (t) => t > fiveSecondsAgo,
      );

      // Calculate typing speed (chars per second)
      const timeRange = now - keyPressTimestamps.current[0];
      const typingSpeed =
        timeRange > 0
          ? (keyPressTimestamps.current.length / timeRange) * 1000
          : 0;

      setHasKeyboardActivity(true);

      // Suggest text mode if typing speed exceeds threshold and currently in voice mode
      if (typingSpeed >= typingThreshold && inputMode === "voice") {
        makeSuggestion(
          "text",
          `Active typing detected (${typingSpeed.toFixed(1)} chars/sec)`,
        );
      }
    };

    // Reset keyboard activity after inactivity
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleActivity);

    // Periodic check for inactivity
    const inactivityCheck = setInterval(() => {
      const inactiveFor = Date.now() - lastActivityRef.current;
      if (inactiveFor > 10000) {
        // 10 seconds of inactivity
        setHasKeyboardActivity(false);
        keyPressTimestamps.current = [];
      }
    }, 5000);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleActivity);
      clearInterval(inactivityCheck);
    };
  }, [inputMode, typingThreshold, makeSuggestion]);

  // Monitor audio input for voice detection
  useEffect(() => {
    if (!detectAudio || inputMode !== "text") return;

    let mounted = true;

    const startAudioMonitoring = async () => {
      try {
        // Check if we already have access
        const hasAccess = await checkMicrophoneAccess();
        if (!hasAccess || !mounted) return;

        // Get audio stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        audioStreamRef.current = stream;

        // Set up audio analysis
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let speechCount = 0;
        const SPEECH_THRESHOLD = 30; // RMS threshold for speech
        const SPEECH_FRAMES_REQUIRED = 10; // Frames needed to trigger suggestion

        // Monitor loop
        const monitorAudio = () => {
          if (!mounted || !analyserRef.current) return;

          analyser.getByteFrequencyData(dataArray);

          // Calculate RMS
          const rms = Math.sqrt(
            dataArray.reduce((sum, val) => sum + val * val, 0) /
              dataArray.length,
          );

          if (rms > SPEECH_THRESHOLD) {
            speechCount++;
            setHasAudioActivity(true);

            if (speechCount >= SPEECH_FRAMES_REQUIRED && inputMode === "text") {
              makeSuggestion("voice", "Speech detected");
              speechCount = 0; // Reset to avoid repeated suggestions
            }
          } else {
            speechCount = Math.max(0, speechCount - 1); // Decay
            if (speechCount === 0) {
              setHasAudioActivity(false);
            }
          }

          rafIdRef.current = requestAnimationFrame(monitorAudio);
        };

        monitorAudio();
      } catch (err) {
        voiceLog.debug(
          "[InputModeDetection] Audio monitoring not available:",
          err,
        );
      }
    };

    // Delay starting audio monitoring to avoid permission prompt on page load
    const timeoutId = setTimeout(startAudioMonitoring, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [detectAudio, inputMode, checkMicrophoneAccess, makeSuggestion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSuggestionTimeout();
    };
  }, [clearSuggestionTimeout]);

  return {
    // State
    suggestedMode,
    suggestionReason,
    hasKeyboardActivity,
    hasAudioActivity,
    hasMicrophoneAccess,

    // Actions
    acceptSuggestion,
    dismissSuggestion,
    resetDetection,
    checkMicrophoneAccess,

    // Manual overrides
    forceTextMode,
    forceVoiceMode,
  };
}

export default useInputModeDetection;
