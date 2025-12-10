/**
 * VoiceActivityIndicator
 * Animated visualization showing voice activity for both user and AI
 *
 * Features:
 * - Green animated bars when user is speaking
 * - Blue animated bars when AI is responding
 * - Smooth transitions between states
 * - Responsive design
 */

import { useEffect, useRef, useCallback } from "react";

interface VoiceActivityIndicatorProps {
  /** Whether the user is currently speaking */
  isSpeaking: boolean;
  /** Whether the AI is currently synthesizing/playing audio */
  isSynthesizing: boolean;
  /** Whether connected to voice session */
  isConnected: boolean;
  /** Optional className for the container */
  className?: string;
}

const BAR_COUNT = 5;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 32;

export function VoiceActivityIndicator({
  isSpeaking,
  isSynthesizing,
  isConnected,
  className = "",
}: VoiceActivityIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const barHeightsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const targetHeightsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));

  // Determine active state and color
  const isActive = isSpeaking || isSynthesizing;
  const activeColor = isSpeaking ? "#22c55e" : "#3b82f6"; // green-500 : blue-500
  const inactiveColor = "#d1d5db"; // gray-300

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const barWidth = Math.min(8, (width - (BAR_COUNT - 1) * 6) / BAR_COUNT);
    const gap = 6;
    const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap;
    const startX = (width - totalWidth) / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update target heights based on active state
    if (isActive) {
      // Random target heights for animation
      for (let i = 0; i < BAR_COUNT; i++) {
        if (Math.random() > 0.7) {
          targetHeightsRef.current[i] =
            MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
        }
      }
    } else {
      // Return to minimum height when inactive
      targetHeightsRef.current = Array(BAR_COUNT).fill(MIN_HEIGHT);
    }

    // Smoothly interpolate bar heights
    for (let i = 0; i < BAR_COUNT; i++) {
      const diff = targetHeightsRef.current[i] - barHeightsRef.current[i];
      barHeightsRef.current[i] += diff * 0.2; // Easing factor
    }

    // Draw bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = startX + i * (barWidth + gap);
      const barHeight = barHeightsRef.current[i];
      const y = centerY - barHeight / 2;

      // Draw rounded bar
      const radius = barWidth / 2;
      ctx.fillStyle = isActive ? activeColor : inactiveColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, radius);
      ctx.fill();
    }

    // Continue animation loop
    animationRef.current = requestAnimationFrame(draw);
  }, [isActive, activeColor, inactiveColor]);

  // Start/stop animation based on connection status
  useEffect(() => {
    if (isConnected) {
      draw();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;

      // Draw idle state
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isConnected, draw]);

  if (!isConnected) {
    return null;
  }

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <canvas
        ref={canvasRef}
        width={120}
        height={48}
        className="w-[120px] h-12"
        aria-hidden="true"
      />
      <span
        className={`text-xs font-medium transition-colors duration-200 ${
          isSpeaking
            ? "text-green-600"
            : isSynthesizing
              ? "text-blue-600"
              : "text-neutral-400"
        }`}
      >
        {isSpeaking ? "Listening..." : isSynthesizing ? "Speaking..." : "Ready"}
      </span>
    </div>
  );
}
