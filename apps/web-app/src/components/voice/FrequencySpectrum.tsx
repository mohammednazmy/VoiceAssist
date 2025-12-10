/**
 * Frequency Spectrum Visualizer Component
 * Displays real-time audio frequency analysis
 *
 * Phase 9.3: Enhanced Voice Features
 */

import { useEffect, useRef, useCallback } from "react";

interface FrequencySpectrumProps {
  /** Audio stream to visualize */
  stream: MediaStream | null;
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Bar color */
  barColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Number of frequency bars */
  barCount?: number;
  /** Gap between bars (px) */
  barGap?: number;
  /** Border radius for bars */
  barRadius?: number;
  /** Whether visualization is active */
  active?: boolean;
  /** Custom class name */
  className?: string;
}

export function FrequencySpectrum({
  stream,
  width = 300,
  height = 60,
  barColor = "#3b82f6",
  backgroundColor = "transparent",
  barCount = 32,
  barGap = 2,
  barRadius = 2,
  active = true,
  className = "",
}: FrequencySpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!canvas || !analyser || !dataArray || !active) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get frequency data
    analyser.getByteFrequencyData(dataArray);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate bar dimensions
    const totalGaps = (barCount - 1) * barGap;
    const barWidth = (canvas.width - totalGaps) / barCount;
    const frequencyBinCount = analyser.frequencyBinCount;
    const binSize = Math.floor(frequencyBinCount / barCount);

    // Draw frequency bars
    for (let i = 0; i < barCount; i++) {
      // Average frequency values for this bar
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += dataArray[i * binSize + j];
      }
      const average = sum / binSize;

      // Calculate bar height (normalized to 0-1, then scaled to canvas height)
      const normalizedHeight = average / 255;
      const barHeight = Math.max(
        normalizedHeight * canvas.height * 0.9,
        barRadius * 2,
      );

      const x = i * (barWidth + barGap);
      const y = canvas.height - barHeight;

      // Draw rounded bar
      ctx.beginPath();
      ctx.fillStyle = barColor;
      ctx.roundRect(x, y, barWidth, barHeight, barRadius);
      ctx.fill();
    }

    // Continue animation
    animationRef.current = requestAnimationFrame(draw);
  }, [active, backgroundColor, barColor, barCount, barGap, barRadius]);

  // Connect to stream and start visualization
  useEffect(() => {
    if (!stream || !active) return;

    const setupAudio = async () => {
      try {
        // Create audio context
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);

        // Create analyser
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; // Must be power of 2
        analyserRef.current.smoothingTimeConstant = 0.8;

        // Connect source to analyser
        source.connect(analyserRef.current);

        // Create data array
        const bufferLength = analyserRef.current.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(new ArrayBuffer(bufferLength));

        // Start drawing
        draw();
      } catch (err) {
        console.error("[FrequencySpectrum] Failed to setup audio:", err);
      }
    };

    setupAudio();

    return () => {
      // Cleanup
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      dataArrayRef.current = null;
    };
  }, [stream, active, draw]);

  // Draw inactive state when no stream
  useEffect(() => {
    if (stream && active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw placeholder bars
    const totalGaps = (barCount - 1) * barGap;
    const barWidth = (canvas.width - totalGaps) / barCount;
    const minHeight = barRadius * 2;

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + barGap);
      const y = canvas.height - minHeight;

      ctx.beginPath();
      ctx.fillStyle = `${barColor}33`; // 20% opacity
      ctx.roundRect(x, y, barWidth, minHeight, barRadius);
      ctx.fill();
    }
  }, [stream, active, backgroundColor, barColor, barCount, barGap, barRadius]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded ${className}`}
      style={{ width: "100%", height: "auto", maxWidth: width }}
      aria-label="Audio frequency spectrum visualization"
      role="img"
    />
  );
}
