/**
 * EmotionIndicator Component
 *
 * Displays the user's detected emotional state from Hume AI.
 * Shows primary emotion with a subtle visual indicator.
 *
 * Phase: Voice Mode Intelligence Enhancement - Phase 1
 */

import React, { useState, useEffect, useCallback } from "react";
import type { TTEmotionResult } from "../../hooks/useThinkerTalkerSession";

// Emotion to emoji mapping
const EMOTION_EMOJI: Record<string, string> = {
  joy: "😊",
  sadness: "😢",
  anger: "😠",
  fear: "😨",
  surprise: "😲",
  disgust: "😖",
  contempt: "😒",
  neutral: "😐",
  confusion: "😕",
  interest: "🤔",
  excitement: "🤩",
  anxiety: "😰",
  calm: "😌",
  frustration: "😤",
};

// Emotion to color mapping (for background tint)
const EMOTION_COLORS: Record<string, string> = {
  joy: "bg-yellow-100 border-yellow-300",
  sadness: "bg-blue-100 border-blue-300",
  anger: "bg-red-100 border-red-300",
  fear: "bg-purple-100 border-purple-300",
  surprise: "bg-orange-100 border-orange-300",
  disgust: "bg-green-100 border-green-300",
  contempt: "bg-gray-100 border-gray-300",
  neutral: "bg-gray-50 border-gray-200",
  confusion: "bg-indigo-100 border-indigo-300",
  interest: "bg-cyan-100 border-cyan-300",
  excitement: "bg-pink-100 border-pink-300",
  anxiety: "bg-amber-100 border-amber-300",
  calm: "bg-teal-100 border-teal-300",
  frustration: "bg-rose-100 border-rose-300",
};

interface EmotionIndicatorProps {
  /** Current emotion result from backend */
  emotion: TTEmotionResult | null;
  /** Whether to show detailed info */
  showDetails?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class names */
  className?: string;
}

export const EmotionIndicator: React.FC<EmotionIndicatorProps> = ({
  emotion,
  showDetails = false,
  size = "md",
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // Animate in when emotion changes
  useEffect(() => {
    if (emotion && emotion.primary_confidence > 0.3) {
      setIsVisible(true);
      setFadeOut(false);

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => setIsVisible(false), 300);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [emotion]);

  if (!emotion || !isVisible) {
    return null;
  }

  const emotionKey = emotion.primary_emotion.toLowerCase();
  const emoji = EMOTION_EMOJI[emotionKey] || "😐";
  const colorClass = EMOTION_COLORS[emotionKey] || EMOTION_COLORS.neutral;

  // Size classes
  const sizeClasses = {
    sm: "text-sm px-2 py-1",
    md: "text-base px-3 py-1.5",
    lg: "text-lg px-4 py-2",
  };

  // Confidence indicator width
  const confidenceWidth = Math.round(emotion.primary_confidence * 100);

  // Valence color (negative=red, neutral=gray, positive=green)
  const valenceColor =
    emotion.valence > 0.2
      ? "bg-green-400"
      : emotion.valence < -0.2
        ? "bg-red-400"
        : "bg-gray-400";

  return (
    <div
      className={`
        inline-flex items-center gap-2 rounded-full border
        transition-all duration-300 ease-in-out
        ${colorClass}
        ${sizeClasses[size]}
        ${fadeOut ? "opacity-0 scale-95" : "opacity-100 scale-100"}
        ${className}
      `}
      title={`Detected emotion: ${emotion.primary_emotion} (${Math.round(emotion.primary_confidence * 100)}%)`}
    >
      {/* Emoji */}
      <span className="select-none">{emoji}</span>

      {/* Emotion label */}
      <span className="font-medium capitalize text-gray-700">
        {emotion.primary_emotion}
      </span>

      {/* Confidence bar (only in detailed mode) */}
      {showDetails && (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-gray-500 rounded-full transition-all duration-300"
              style={{ width: `${confidenceWidth}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{confidenceWidth}%</span>
        </div>
      )}

      {/* Valence indicator (only in detailed mode) */}
      {showDetails && (
        <div
          className={`w-2 h-2 rounded-full ${valenceColor}`}
          title={`Valence: ${emotion.valence.toFixed(2)}`}
        />
      )}
    </div>
  );
};

/**
 * Hook to manage emotion state with decay
 */
export const useEmotionState = () => {
  const [currentEmotion, setCurrentEmotion] = useState<TTEmotionResult | null>(
    null,
  );
  const [emotionHistory, setEmotionHistory] = useState<TTEmotionResult[]>([]);

  const handleEmotionDetected = useCallback((emotion: TTEmotionResult) => {
    setCurrentEmotion(emotion);
    setEmotionHistory((prev) => [...prev.slice(-9), emotion]); // Keep last 10
  }, []);

  const clearEmotion = useCallback(() => {
    setCurrentEmotion(null);
  }, []);

  // Calculate dominant emotion trend
  const emotionTrend = React.useMemo(() => {
    if (emotionHistory.length < 3) return null;

    const recentEmotions = emotionHistory.slice(-5);
    const emotionCounts: Record<string, number> = {};

    recentEmotions.forEach((e) => {
      emotionCounts[e.primary_emotion] =
        (emotionCounts[e.primary_emotion] || 0) + 1;
    });

    const dominant = Object.entries(emotionCounts).sort(
      ([, a], [, b]) => b - a,
    )[0];

    return dominant ? dominant[0] : null;
  }, [emotionHistory]);

  return {
    currentEmotion,
    emotionHistory,
    emotionTrend,
    handleEmotionDetected,
    clearEmotion,
  };
};

export default EmotionIndicator;
