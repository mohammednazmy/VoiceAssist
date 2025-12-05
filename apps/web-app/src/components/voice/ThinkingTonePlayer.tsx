/**
 * Thinking Tone Player Component for Voice Mode v4
 *
 * Provides configurable audio feedback during LLM processing states.
 * Users don't know when the system is "thinking" - this component
 * plays periodic audio cues to indicate processing is ongoing.
 *
 * Phase 2 Deliverable: Feedback > Thinking Tones
 *
 * @example
 * ```tsx
 * // Use the hook
 * function MyComponent() {
 *   const { isThinking } = useVoiceState();
 *   useThinkingTone(isThinking);
 *   return <ThinkingIndicator isThinking={isThinking} />;
 * }
 *
 * // Or use the component directly
 * <ThinkingTonePlayer isPlaying={isProcessing} preset="gentle_beep" />
 * ```
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Thinking tone preset configuration
 */
export interface TonePreset {
  /** Audio file path */
  src: string;
  /** Interval between tones in milliseconds */
  interval: number;
  /** Volume (0-1) */
  volume: number;
  /** Initial delay before first tone */
  initialDelay?: number;
  /** Whether to use Web Audio API oscillator instead of audio file */
  useOscillator?: boolean;
  /** Oscillator frequency (Hz) if using oscillator */
  frequency?: number;
  /** Tone duration (ms) if using oscillator */
  duration?: number;
}

/**
 * Available tone presets
 */
export type TonePresetName =
  | "gentle_beep"
  | "soft_chime"
  | "subtle_tick"
  | "none";

/**
 * Tone preset configurations
 */
export const TONE_PRESETS: Record<
  Exclude<TonePresetName, "none">,
  TonePreset
> = {
  gentle_beep: {
    src: "/assets/audio/thinking_beep.mp3",
    interval: 2000,
    volume: 0.3,
    initialDelay: 500,
    useOscillator: true,
    frequency: 440,
    duration: 100,
  },
  soft_chime: {
    src: "/assets/audio/thinking_chime.mp3",
    interval: 2500,
    volume: 0.25,
    initialDelay: 600,
    useOscillator: true,
    frequency: 880,
    duration: 150,
  },
  subtle_tick: {
    src: "/assets/audio/thinking_tick.mp3",
    interval: 1500,
    volume: 0.2,
    initialDelay: 400,
    useOscillator: true,
    frequency: 660,
    duration: 50,
  },
};

/**
 * Props for ThinkingTonePlayer component
 */
export interface ThinkingTonePlayerProps {
  /** Whether to play the tone */
  isPlaying: boolean;
  /** Preset to use */
  preset?: TonePresetName;
  /** Custom volume override (0-1) */
  volume?: number;
  /** Callback when tone plays */
  onTonePlay?: () => void;
}

/**
 * Audio context singleton for Web Audio API
 */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
  }
  return audioContext;
}

/**
 * Play an oscillator tone using Web Audio API
 */
function playOscillatorTone(
  frequency: number,
  duration: number,
  volume: number,
): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Envelope: quick attack, quick release for a "beep" sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);

    // Cleanup
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  } catch (error) {
    console.warn("Failed to play oscillator tone:", error);
  }
}

/**
 * Hook to play thinking tones
 *
 * @param enabled - Whether tones are enabled
 * @param preset - Preset name or 'none'
 * @param volumeOverride - Optional volume override
 */
export function useThinkingTone(
  enabled: boolean,
  preset: TonePresetName = "gentle_beep",
  volumeOverride?: number,
): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (initialTimeoutRef.current) {
      clearTimeout(initialTimeoutRef.current);
      initialTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Cleanup and exit if disabled or preset is 'none'
    if (!enabled || preset === "none") {
      cleanup();
      return;
    }

    const config = TONE_PRESETS[preset];
    if (!config) {
      cleanup();
      return;
    }

    const volume = volumeOverride ?? config.volume;

    // Function to play the tone
    const playTone = () => {
      if (config.useOscillator && config.frequency && config.duration) {
        playOscillatorTone(config.frequency, config.duration, volume);
      } else {
        // Fallback to audio file
        if (!audioRef.current) {
          audioRef.current = new Audio(config.src);
        }
        audioRef.current.volume = volume;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Ignore autoplay errors
        });
      }
    };

    // Start initial tone after delay
    const initialDelay = config.initialDelay ?? 500;
    initialTimeoutRef.current = setTimeout(() => {
      playTone();

      // Start interval for subsequent tones
      intervalRef.current = setInterval(playTone, config.interval);
    }, initialDelay);

    return cleanup;
  }, [enabled, preset, volumeOverride, cleanup]);
}

/**
 * ThinkingTonePlayer Component
 *
 * Plays audio tones during thinking/processing states.
 * Can be used as a standalone component or via the useThinkingTone hook.
 */
export function ThinkingTonePlayer({
  isPlaying,
  preset = "gentle_beep",
  volume,
  onTonePlay,
}: ThinkingTonePlayerProps): null {
  const lastPlayRef = useRef<number>(0);

  // Track tone plays for callback
  useEffect(() => {
    if (!isPlaying || preset === "none" || !onTonePlay) return;

    const config = TONE_PRESETS[preset];
    if (!config) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastPlayRef.current >= config.interval) {
        lastPlayRef.current = now;
        onTonePlay();
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [isPlaying, preset, onTonePlay]);

  // Use the hook
  useThinkingTone(isPlaying, preset, volume);

  // This component doesn't render anything
  return null;
}

/**
 * Props for ThinkingIndicator component
 */
export interface ThinkingIndicatorProps {
  /** Whether the system is thinking */
  isThinking: boolean;
  /** Text to display */
  text?: string;
  /** Tone preset (default: 'gentle_beep') */
  preset?: TonePresetName;
  /** Custom class name */
  className?: string;
  /** Whether to show the visual indicator */
  showVisual?: boolean;
  /** Whether to play audio tones */
  playAudio?: boolean;
}

/**
 * Thinking Indicator Component
 *
 * Visual indicator with optional audio feedback for thinking states.
 */
export function ThinkingIndicator({
  isThinking,
  text = "Thinking...",
  preset = "gentle_beep",
  className = "",
  showVisual = true,
  playAudio = true,
}: ThinkingIndicatorProps): React.ReactElement | null {
  // Play tones if enabled
  useThinkingTone(isThinking && playAudio, preset);

  if (!isThinking || !showVisual) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center gap-2 text-sm text-neutral-500 ${className}`}
      >
        {/* Animated dots */}
        <div className="flex gap-1" aria-hidden="true">
          <motion.span
            className="w-2 h-2 bg-primary-500 rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: 0,
              ease: "easeInOut",
            }}
          />
          <motion.span
            className="w-2 h-2 bg-primary-500 rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: 0.15,
              ease: "easeInOut",
            }}
          />
          <motion.span
            className="w-2 h-2 bg-primary-500 rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: 0.3,
              ease: "easeInOut",
            }}
          />
        </div>
        <span role="status" aria-live="polite">
          {text}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Tool Call Indicator Props
 */
export interface ToolCallIndicatorProps {
  /** Name of the tool being called */
  toolName: string;
  /** Whether the tool is currently executing */
  isExecuting: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Tool Call Indicator Component
 *
 * Shows when a specific tool is being called during LLM processing.
 */
export function ToolCallIndicator({
  toolName,
  isExecuting,
  className = "",
}: ToolCallIndicatorProps): React.ReactElement | null {
  // Play subtle tick when tool call starts
  useThinkingTone(isExecuting, "subtle_tick");

  if (!isExecuting) {
    return null;
  }

  // Format tool name for display
  const displayName = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700
                  text-sm rounded-full border border-amber-200 ${className}`}
    >
      <motion.div
        className="w-2 h-2 bg-amber-500 rounded-full"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span>Running: {displayName}</span>
    </motion.div>
  );
}

/**
 * Thinking Feedback Settings Props
 */
export interface ThinkingFeedbackSettingsProps {
  /** Current preset */
  value: TonePresetName;
  /** Callback when preset changes */
  onChange: (preset: TonePresetName) => void;
  /** Current volume */
  volume?: number;
  /** Callback when volume changes */
  onVolumeChange?: (volume: number) => void;
}

/**
 * Thinking Feedback Settings Component
 *
 * UI for configuring thinking tone preferences.
 */
export function ThinkingFeedbackSettings({
  value,
  onChange,
  volume = 0.3,
  onVolumeChange,
}: ThinkingFeedbackSettingsProps): React.ReactElement {
  const [testPlaying, setTestPlaying] = useState(false);

  const handlePresetChange = (preset: TonePresetName) => {
    onChange(preset);

    // Play a test tone
    if (preset !== "none") {
      setTestPlaying(true);
      setTimeout(() => setTestPlaying(false), 300);
    }
  };

  // Play test tone
  useThinkingTone(
    testPlaying,
    value !== "none" ? value : "gentle_beep",
    volume,
  );

  const presetOptions = [
    {
      value: "none" as const,
      label: "None (silent)",
      description: "No audio feedback",
    },
    {
      value: "gentle_beep" as const,
      label: "Gentle beep",
      description: "Soft 440Hz tone every 2s",
    },
    {
      value: "soft_chime" as const,
      label: "Soft chime",
      description: "Higher pitch chime every 2.5s",
    },
    {
      value: "subtle_tick" as const,
      label: "Subtle tick",
      description: "Quick tick every 1.5s",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700">
          Audio feedback while thinking
        </label>
        <div className="grid grid-cols-2 gap-2">
          {presetOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handlePresetChange(option.value)}
              className={`
                p-3 rounded-lg border text-left transition-all
                ${
                  value === option.value
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }
              `}
            >
              <span className="block text-sm font-medium text-neutral-900">
                {option.label}
              </span>
              <span className="block text-xs text-neutral-500 mt-0.5">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {value !== "none" && onVolumeChange && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700">
            Volume: {Math.round(volume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Quiet</span>
            <span>Loud</span>
          </div>
        </div>
      )}

      {/* Test button */}
      {value !== "none" && (
        <button
          onClick={() => {
            setTestPlaying(true);
            setTimeout(() => setTestPlaying(false), 300);
          }}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Test sound
        </button>
      )}
    </div>
  );
}

export default ThinkingTonePlayer;
