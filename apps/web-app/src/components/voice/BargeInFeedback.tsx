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
// Component
// ============================================================================

export function BargeInFeedback({
  isActive,
  type,
  confidence = 0,
  preferences,
  language = "en",
  onAnimationComplete,
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
          speakPrompt(preferences.voicePromptText || "I'm listening", language);
        }
      }
    }
  }, [preferences, type, language, triggerHaptic, onAnimationComplete]);

  // Trigger feedback when activated
  useEffect(() => {
    if (isActive) {
      triggerFeedback();
    }
  }, [isActive, triggerFeedback]);

  // Don't render if visual feedback is disabled
  if (!preferences.visualFeedbackEnabled || !showPulse) {
    return null;
  }

  // Render based on feedback style
  switch (preferences.visualFeedbackStyle) {
    case "pulse":
      return (
        <div
          key={animationKey}
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          aria-hidden="true"
        >
          <div
            className="pulse-feedback rounded-full"
            style={
              {
                "--pulse-color": pulseColor,
                "--confidence": confidence,
              } as React.CSSProperties
            }
          />
          <style>{`
            .pulse-feedback {
              width: 20px;
              height: 20px;
              background-color: var(--pulse-color);
              box-shadow: 0 0 60px 30px var(--pulse-color);
              animation: pulse-expand 0.3s ease-out forwards;
            }
            @keyframes pulse-expand {
              0% {
                width: 20px;
                height: 20px;
                opacity: 0.8;
              }
              100% {
                width: 200px;
                height: 200px;
                opacity: 0;
              }
            }
          `}</style>
        </div>
      );

    case "border":
      return (
        <div
          key={animationKey}
          className="fixed inset-0 pointer-events-none z-50"
          aria-hidden="true"
        >
          <div
            className="border-feedback absolute inset-2 rounded-lg"
            style={
              {
                "--border-color": pulseColor,
              } as React.CSSProperties
            }
          />
          <style>{`
            .border-feedback {
              border: 4px solid var(--border-color);
              animation: border-fade 0.3s ease-out forwards;
            }
            @keyframes border-fade {
              0% {
                opacity: 1;
              }
              100% {
                opacity: 0;
              }
            }
          `}</style>
        </div>
      );

    case "icon":
      return (
        <div
          key={animationKey}
          className="fixed top-4 right-4 pointer-events-none z-50"
          aria-hidden="true"
        >
          <div
            className="icon-feedback w-12 h-12 rounded-full flex items-center justify-center text-2xl"
            style={
              {
                "--icon-bg": pulseColor,
              } as React.CSSProperties
            }
          >
            {ICONS[type]}
          </div>
          <style>{`
            .icon-feedback {
              background-color: var(--icon-bg);
              animation: icon-pop 0.3s ease-out forwards;
            }
            @keyframes icon-pop {
              0% {
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.2);
                opacity: 1;
              }
              100% {
                transform: scale(1);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      );

    case "minimal":
      return (
        <div
          key={animationKey}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-50"
          aria-hidden="true"
        >
          <div
            className="minimal-feedback w-2 h-2 rounded-full"
            style={
              {
                "--dot-color": pulseColor,
              } as React.CSSProperties
            }
          />
          <style>{`
            .minimal-feedback {
              background-color: var(--dot-color);
              animation: minimal-fade 0.3s ease-out forwards;
            }
            @keyframes minimal-fade {
              0% {
                opacity: 1;
                transform: translateY(10px);
              }
              100% {
                opacity: 0;
                transform: translateY(-10px);
              }
            }
          `}</style>
        </div>
      );

    default:
      return null;
  }
}

// ============================================================================
// Export Types
// ============================================================================

export type { BargeInFeedbackProps };
