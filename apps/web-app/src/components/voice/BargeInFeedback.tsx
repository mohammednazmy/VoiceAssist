/**
 * BargeInFeedback Component
 *
 * Provides configurable visual feedback for barge-in events.
 * Supports multiple feedback styles: pulse, border, icon, and minimal.
 * Integrates with haptic and audio feedback systems.
 *
 * Phase 2: Instant Response & Feedback
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useHapticFeedback,
  type HapticType,
} from "../../hooks/useHapticFeedback";
import {
  playAudioFeedback,
  speakPrompt,
  type FeedbackType as AudioFeedbackType,
} from "../../lib/audioFeedback";
import type {
  FeedbackPreferences,
  SupportedLanguage,
} from "../../hooks/useIntelligentBargeIn/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Types of barge-in feedback events
 */
export type BargeInFeedbackType =
  | "detected"
  | "confirmed"
  | "backchannel"
  | "soft"
  | "hard";

interface BargeInFeedbackProps {
  /** Whether feedback should be shown */
  isActive: boolean;

  /** Type of barge-in event */
  type: BargeInFeedbackType;

  /** Confidence level (0-1) for detected events */
  confidence?: number;

  /** User feedback preferences */
  preferences: FeedbackPreferences;

  /** Language for voice prompts */
  language?: SupportedLanguage;

  /** Callback when animation completes */
  onAnimationComplete?: () => void;

  /**
   * Optional callback to play voice prompts using ElevenLabs TTS.
   * If provided, this will be used instead of browser speech synthesis
   * to ensure consistent voice across the app.
   */
  onPlayVoicePrompt?: (text?: string) => Promise<void>;
}

// ============================================================================
// Color Mappings
// ============================================================================

const PULSE_COLORS: Record<BargeInFeedbackType, string> = {
  detected: "rgba(59, 130, 246, 0.5)", // Blue
  confirmed: "rgba(34, 197, 94, 0.5)", // Green
  backchannel: "rgba(168, 162, 158, 0.3)", // Gray
  soft: "rgba(251, 191, 36, 0.5)", // Yellow
  hard: "rgba(239, 68, 68, 0.5)", // Red
};

const HAPTIC_MAP: Record<BargeInFeedbackType, HapticType> = {
  detected: "bargeInDetected",
  confirmed: "bargeInConfirmed",
  backchannel: "backchannel",
  soft: "softBarge",
  hard: "hardBarge",
};

const AUDIO_MAP: Record<BargeInFeedbackType, AudioFeedbackType> = {
  detected: "detected",
  confirmed: "confirmed",
  backchannel: "backchannel",
  soft: "soft",
  hard: "hard",
};

const ICONS: Record<BargeInFeedbackType, string> = {
  detected: "🎤",
  confirmed: "✓",
  backchannel: "👂",
  soft: "⏸",
  hard: "✋",
};

// ============================================================================
// Animation Variants
// ============================================================================

const pulseVariants = {
  initial: {
    width: 20,
    height: 20,
    opacity: 0.8,
  },
  animate: {
    width: 200,
    height: 200,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.05 },
  },
};

const borderVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.1 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

const iconVariants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: [0, 1.2, 1],
    opacity: [0, 1, 1],
    transition: {
      duration: 0.3,
      times: [0, 0.5, 1],
    },
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

const minimalVariants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15 },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.15 },
  },
};

// ============================================================================
// Component
// ============================================================================

export function BargeInFeedback({
  isActive,
  type,
  confidence: _confidence = 0,
  preferences,
  language = "en",
  onAnimationComplete,
  onPlayVoicePrompt,
}: BargeInFeedbackProps) {
  const [showPulse, setShowPulse] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const { triggerHaptic } = useHapticFeedback();

  const pulseColor = useMemo(() => PULSE_COLORS[type], [type]);

  // Handle feedback triggers
  const triggerFeedback = useCallback(() => {
    // Visual feedback
    if (preferences.visualFeedbackEnabled) {
      setShowPulse(true);
      setAnimationKey((k) => k + 1);

      // Auto-hide after animation
      setTimeout(() => {
        setShowPulse(false);
        onAnimationComplete?.();
      }, 300);
    }

    // Haptic feedback
    if (preferences.hapticFeedbackEnabled) {
      triggerHaptic(HAPTIC_MAP[type], preferences.hapticIntensity);
    }

    // Audio feedback
    if (preferences.audioFeedbackEnabled) {
      if (preferences.audioFeedbackType === "tone") {
        playAudioFeedback(AUDIO_MAP[type]);
      } else if (preferences.audioFeedbackType === "voice" && type === "hard") {
        if (preferences.voicePromptAfterHardBarge) {
          const promptText = preferences.voicePromptText || "I'm listening";
          // Use ElevenLabs TTS if callback provided, otherwise fall back to browser TTS
          if (onPlayVoicePrompt) {
            onPlayVoicePrompt(promptText).catch(() => {
              // Fallback to browser TTS if ElevenLabs fails
              speakPrompt(promptText, language);
            });
          } else {
            speakPrompt(promptText, language);
          }
        }
      }
    }
  }, [
    preferences,
    type,
    language,
    triggerHaptic,
    onAnimationComplete,
    onPlayVoicePrompt,
  ]);

  // Trigger feedback when activated
  useEffect(() => {
    if (isActive) {
      triggerFeedback();
    }
  }, [isActive, triggerFeedback]);

  // Don't render if visual feedback is disabled
  if (!preferences.visualFeedbackEnabled) {
    return null;
  }

  // Render based on feedback style
  const renderFeedback = () => {
    switch (preferences.visualFeedbackStyle) {
      case "pulse":
        return (
          <motion.div
            key={animationKey}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
            aria-hidden="true"
          >
            <motion.div
              className="rounded-full"
              style={{
                backgroundColor: pulseColor,
                boxShadow: `0 0 60px 30px ${pulseColor}`,
              }}
              variants={pulseVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            />
          </motion.div>
        );

      case "border":
        return (
          <motion.div
            key={animationKey}
            className="fixed inset-0 pointer-events-none z-50"
            aria-hidden="true"
          >
            <motion.div
              className="absolute inset-2 rounded-lg"
              style={{
                border: `4px solid ${pulseColor}`,
              }}
              variants={borderVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            />
          </motion.div>
        );

      case "icon":
        return (
          <motion.div
            key={animationKey}
            className="fixed top-4 right-4 pointer-events-none z-50"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-hidden="true"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
              style={{ backgroundColor: pulseColor }}
            >
              {ICONS[type]}
            </div>
          </motion.div>
        );

      case "minimal":
        return (
          <motion.div
            key={animationKey}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-50"
            variants={minimalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-hidden="true"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: pulseColor }}
            />
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {showPulse && renderFeedback()}
    </AnimatePresence>
  );
}

// ============================================================================
// Additional Feedback Components
// ============================================================================

/**
 * Confidence indicator that shows VAD confidence level
 */
interface ConfidenceIndicatorProps {
  confidence: number;
  isVisible: boolean;
}

export function ConfidenceIndicator({
  confidence,
  isVisible,
}: ConfidenceIndicatorProps) {
  const barColor = useMemo(() => {
    if (confidence > 0.8) return "bg-green-500";
    if (confidence > 0.5) return "bg-yellow-500";
    return "bg-red-500";
  }, [confidence]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-4 left-4 w-24 pointer-events-none z-50"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="text-xs text-gray-400 mb-1">Voice</div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${confidence * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Speaking indicator that shows when the AI is speaking
 */
interface SpeakingIndicatorProps {
  isSpeaking: boolean;
  canInterrupt: boolean;
}

export function SpeakingIndicator({
  isSpeaking,
  canInterrupt,
}: SpeakingIndicatorProps) {
  return (
    <AnimatePresence>
      {isSpeaking && (
        <motion.div
          className="fixed top-4 left-4 pointer-events-none z-50"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2 bg-gray-800/80 backdrop-blur-sm px-3 py-1.5 rounded-full">
            {/* Animated speaking dots */}
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                  animate={{
                    y: [0, -4, 0],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-300">
              {canInterrupt ? "Speak to interrupt" : "Speaking..."}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Listening indicator that shows when the system is listening for speech
 */
interface ListeningIndicatorProps {
  isListening: boolean;
  probability: number;
}

export function ListeningIndicator({
  isListening,
  probability,
}: ListeningIndicatorProps) {
  const ringOpacity = useMemo(
    () => Math.min(1, 0.3 + probability * 0.7),
    [probability],
  );

  return (
    <AnimatePresence>
      {isListening && (
        <motion.div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-40"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative">
            {/* Outer ring - pulses based on probability */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-blue-400"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [ringOpacity, ringOpacity * 0.5, ringOpacity],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ width: 48, height: 48 }}
            />
            {/* Inner circle */}
            <motion.div
              className="w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center"
              animate={{
                backgroundColor:
                  probability > 0.5
                    ? "rgba(59, 130, 246, 0.5)"
                    : "rgba(59, 130, 246, 0.3)",
              }}
            >
              <motion.div
                className="w-6 h-6 rounded-full bg-blue-500"
                animate={{
                  scale: 0.8 + probability * 0.4,
                }}
                transition={{ duration: 0.1 }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  BargeInFeedbackProps,
  ConfidenceIndicatorProps,
  SpeakingIndicatorProps,
  ListeningIndicatorProps,
};
