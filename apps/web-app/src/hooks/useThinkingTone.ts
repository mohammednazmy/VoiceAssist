/**
 * useThinkingTone Hook
 * Provides audio feedback for thinking/processing states.
 *
 * Part of Voice Mode Enhancement Plan v4.1
 * Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#thinking-tone-ux-improvements
 */

import { useCallback, useEffect, useRef } from "react";

export type ThinkingTonePreset =
  | "gentle_beep"
  | "soft_chime"
  | "subtle_tick"
  | "none";

interface UseThinkingToneOptions {
  preset: ThinkingTonePreset;
  volume: number; // 0-1 normalized
  interval?: number; // ms between tones (default: 3000)
}

// Audio context singleton for better performance
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    )();
  }
  return audioContext;
}

// Tone generators for different presets
const TONE_GENERATORS: Record<
  ThinkingTonePreset,
  (ctx: AudioContext, volume: number) => void
> = {
  gentle_beep: (ctx, volume) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, ctx.currentTime); // A4

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      volume * 0.15,
      ctx.currentTime + 0.01,
    );
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  },

  soft_chime: (ctx, volume) => {
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (major chord)

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

      const startTime = ctx.currentTime + i * 0.05;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume * 0.1, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.5);
    });
  },

  subtle_tick: (ctx, volume) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      200,
      ctx.currentTime + 0.05,
    );

    gainNode.gain.setValueAtTime(volume * 0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.05);
  },

  none: () => {
    // No-op for disabled tones
  },
};

/**
 * Hook for playing thinking tone feedback.
 *
 * @param isActive - Whether thinking feedback is active
 * @param options - Configuration options
 */
export function useThinkingTone(
  isActive: boolean,
  options: UseThinkingToneOptions,
): void {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasPlayedRef = useRef(false);

  const playTone = useCallback(() => {
    if (options.preset === "none" || options.volume <= 0) return;

    try {
      const ctx = getAudioContext();

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const generator = TONE_GENERATORS[options.preset];
      generator(ctx, options.volume);
    } catch (error) {
      console.warn("Failed to play thinking tone:", error);
    }
  }, [options.preset, options.volume]);

  useEffect(() => {
    if (isActive) {
      // Play immediately on activation
      if (!hasPlayedRef.current) {
        playTone();
        hasPlayedRef.current = true;
      }

      // Set up interval for repeated tones
      const interval = options.interval ?? 3000;
      intervalRef.current = setInterval(playTone, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Reset when deactivated
      hasPlayedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isActive, playTone, options.interval]);
}

/**
 * Utility to play a single thinking tone on demand.
 */
export function playThinkingTone(
  preset: ThinkingTonePreset,
  volume: number,
): void {
  if (preset === "none" || volume <= 0) return;

  try {
    const ctx = getAudioContext();

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const generator = TONE_GENERATORS[preset];
    generator(ctx, volume);
  } catch (error) {
    console.warn("Failed to play thinking tone:", error);
  }
}

/**
 * Check if audio feedback is available (Web Audio API support).
 */
export function isAudioFeedbackAvailable(): boolean {
  return !!(
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext
  );
}
