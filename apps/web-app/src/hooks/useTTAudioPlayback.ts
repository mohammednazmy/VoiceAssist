/**
 * Thinker/Talker Audio Playback Hook
 *
 * Handles streaming audio playback for the T/T voice pipeline.
 * Receives base64-encoded audio chunks from the WebSocket and plays
 * them as soon as they arrive for minimal latency.
 *
 * Features:
 * - Web Audio API for low-latency playback
 * - Audio queue for smooth streaming
 * - Barge-in support (stop playback immediately)
 * - Auto-resume after interruption
 * - Playback state tracking
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export type TTPlaybackState = "idle" | "buffering" | "playing" | "stopped";

export interface TTAudioPlaybackOptions {
  /** Volume (0-1) */
  volume?: number;
  /** Called when playback starts */
  onPlaybackStart?: () => void;
  /** Called when all audio finishes playing */
  onPlaybackEnd?: () => void;
  /** Called when playback is interrupted (barge-in) */
  onPlaybackInterrupted?: () => void;
  /** Called on playback error */
  onError?: (error: Error) => void;
}

export interface TTAudioPlaybackReturn {
  // State
  playbackState: TTPlaybackState;
  isPlaying: boolean;
  volume: number;
  /** Time to first audio in current stream (ms) */
  ttfaMs: number | null;
  /** Total audio duration played (ms) */
  totalPlayedMs: number;

  // Actions
  /** Queue a base64 audio chunk for playback */
  queueAudioChunk: (audioBase64: string) => void;
  /** Signal end of audio stream (flush queue) */
  endStream: () => void;
  /** Stop playback immediately (barge-in) */
  stop: () => void;
  /** Set volume (0-1) */
  setVolume: (volume: number) => void;
  /** Reset state for new stream */
  reset: () => void;
  /** Pre-warm AudioContext to reduce first-audio latency */
  warmup: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decode base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Add WAV header to raw PCM data for proper browser decoding
 * This allows the browser to handle sample rate conversion correctly
 * Note: Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createWavFromPcm(
  pcmData: ArrayBuffer,
  sampleRate: number = 24000,
): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const headerSize = 44;

  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wavBuffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const pcmBytes = new Uint8Array(pcmData);
  const wavBytes = new Uint8Array(wavBuffer);
  wavBytes.set(pcmBytes, headerSize);

  return wavBuffer;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useTTAudioPlayback(
  options: TTAudioPlaybackOptions = {},
): TTAudioPlaybackReturn {
  const { onPlaybackStart, onPlaybackEnd, onPlaybackInterrupted, onError } =
    options;

  // State
  const [playbackState, setPlaybackState] = useState<TTPlaybackState>("idle");
  const [volume, setVolumeState] = useState(options.volume ?? 1);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);
  const [totalPlayedMs, setTotalPlayedMs] = useState(0);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamStartTimeRef = useRef<number | null>(null);
  const firstChunkTimeRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const streamEndedRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // For gapless scheduled playback
  const nextScheduledTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isProcessingRef = useRef(false);

  /**
   * Get or create AudioContext
   */
  const getAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioContextRef.current) {
      // Don't specify sample rate - let browser use native rate for best quality
      // Browser will resample from 24kHz PCM automatically
      audioContextRef.current = new AudioContext();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = volume;
      gainNodeRef.current.connect(audioContextRef.current.destination);
      voiceLog.debug(
        `[TTAudioPlayback] AudioContext created with sample rate: ${audioContextRef.current.sampleRate}`,
      );
    }

    // Resume if suspended (browser policy)
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, [volume]);

  /**
   * Process and schedule audio chunks for gapless playback
   */
  const processAudioQueue = useCallback(async () => {
    console.log("[TTAudioPlayback] processAudioQueue called", {
      isProcessing: isProcessingRef.current,
      queueLength: audioQueueRef.current.length,
      isPlaying: isPlayingRef.current,
    });

    if (isProcessingRef.current) {
      console.log("[TTAudioPlayback] Already processing, skipping");
      return;
    }
    if (audioQueueRef.current.length === 0) {
      console.log("[TTAudioPlayback] Queue empty, skipping");
      return;
    }

    isProcessingRef.current = true;
    console.log("[TTAudioPlayback] Starting to process queue");

    try {
      console.log("[TTAudioPlayback] Getting AudioContext...");
      const audioContext = await getAudioContext();
      console.log("[TTAudioPlayback] AudioContext obtained", {
        state: audioContext.state,
        sampleRate: audioContext.sampleRate,
      });

      // Process all available chunks
      let chunkIndex = 0;
      while (audioQueueRef.current.length > 0 && isPlayingRef.current) {
        const audioData = audioQueueRef.current.shift()!;
        chunkIndex++;
        console.log(`[TTAudioPlayback] Processing chunk ${chunkIndex}`, {
          byteLength: audioData.byteLength,
          queueRemaining: audioQueueRef.current.length,
        });

        try {
          // Track time to first audio
          if (!firstChunkTimeRef.current && streamStartTimeRef.current) {
            firstChunkTimeRef.current = Date.now();
            const ttfa = firstChunkTimeRef.current - streamStartTimeRef.current;
            setTtfaMs(ttfa);
            playbackStartTimeRef.current = Date.now();
            console.log(`[TTAudioPlayback] TTFA: ${ttfa}ms`);
            voiceLog.debug(`[TTAudioPlayback] TTFA: ${ttfa}ms`);
            onPlaybackStart?.();
          }

          // Convert PCM16 to Float32 for Web Audio API
          // PCM data is 16-bit signed little-endian at 24kHz from ElevenLabs
          const pcm16 = new Int16Array(audioData);
          const float32 = new Float32Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768; // Normalize to -1 to 1
          }
          console.log(`[TTAudioPlayback] Converted to Float32`, {
            pcm16Length: pcm16.length,
            float32Length: float32.length,
            sampleValues: [float32[0], float32[100], float32[1000]],
          });

          // Create AudioBuffer at source sample rate
          // Browser will resample to output rate automatically
          const audioBuffer = audioContext.createBuffer(
            1,
            float32.length,
            24000,
          );
          audioBuffer.getChannelData(0).set(float32);
          console.log(`[TTAudioPlayback] Created AudioBuffer`, {
            duration: audioBuffer.duration,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate,
          });

          // Create and connect source
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(gainNodeRef.current!);
          console.log(`[TTAudioPlayback] Created and connected source`, {
            gainValue: gainNodeRef.current?.gain.value,
          });

          // Track active sources for cleanup
          activeSourcesRef.current.add(source);
          source.onended = () => {
            console.log(`[TTAudioPlayback] Source ended`, {
              activeSourcesCount: activeSourcesRef.current.size - 1,
              streamEnded: streamEndedRef.current,
              queueLength: audioQueueRef.current.length,
            });
            activeSourcesRef.current.delete(source);
            // Check if all sources finished and stream ended
            if (
              activeSourcesRef.current.size === 0 &&
              streamEndedRef.current &&
              audioQueueRef.current.length === 0
            ) {
              console.log("[TTAudioPlayback] All audio finished");
              voiceLog.debug("[TTAudioPlayback] All audio finished");
              isPlayingRef.current = false;
              setPlaybackState("idle");
              if (playbackStartTimeRef.current) {
                setTotalPlayedMs(Date.now() - playbackStartTimeRef.current);
              }
              onPlaybackEnd?.();
            }
          };

          // Schedule for gapless playback
          // Add a small buffer (10ms) to prevent scheduling in the past
          const now = audioContext.currentTime;
          const bufferTime = 0.01; // 10ms buffer for scheduling safety

          if (nextScheduledTimeRef.current < now + bufferTime) {
            // We're behind or just starting - schedule slightly in the future
            nextScheduledTimeRef.current = now + bufferTime;
          }

          // Start at the scheduled time
          const startTime = nextScheduledTimeRef.current;
          source.start(startTime);
          console.log(`[TTAudioPlayback] Scheduled source to start`, {
            startTime: startTime.toFixed(3),
            currentTime: now.toFixed(3),
            bufferDuration: audioBuffer.duration.toFixed(3),
          });

          // Update next scheduled time to end of this buffer
          nextScheduledTimeRef.current = startTime + audioBuffer.duration;

          setPlaybackState("playing");
        } catch (err) {
          console.error("[TTAudioPlayback] Error decoding chunk:", err);
          voiceLog.error("[TTAudioPlayback] Error decoding chunk:", err);
          // Continue with next chunk
        }
      }
      console.log(`[TTAudioPlayback] Finished processing loop`, {
        chunksProcessed: chunkIndex,
        queueRemaining: audioQueueRef.current.length,
      });
    } catch (err) {
      console.error("[TTAudioPlayback] Error in processAudioQueue:", err);
    } finally {
      isProcessingRef.current = false;
      console.log(
        "[TTAudioPlayback] Processing complete, isProcessing reset to false",
      );
    }

    // If more chunks arrived while processing, process them too
    if (audioQueueRef.current.length > 0 && isPlayingRef.current) {
      console.log("[TTAudioPlayback] More chunks arrived, processing again");
      processAudioQueue();
    }
  }, [getAudioContext, onPlaybackStart, onPlaybackEnd]);

  /**
   * Legacy function name for compatibility
   */
  const playNextChunk = useCallback(() => {
    processAudioQueue();
  }, [processAudioQueue]);

  /**
   * Queue a base64 audio chunk for playback
   */
  const queueAudioChunk = useCallback(
    (audioBase64: string) => {
      console.log("[TTAudioPlayback] queueAudioChunk called", {
        base64Length: audioBase64.length,
        isPlaying: isPlayingRef.current,
        queueLength: audioQueueRef.current.length,
        streamStarted: !!streamStartTimeRef.current,
      });

      // Start timing on first chunk
      if (!streamStartTimeRef.current) {
        streamStartTimeRef.current = Date.now();
        streamEndedRef.current = false;
        console.log("[TTAudioPlayback] Started new stream timing");
      }

      try {
        const audioData = base64ToArrayBuffer(audioBase64);
        console.log("[TTAudioPlayback] Decoded base64 to ArrayBuffer", {
          byteLength: audioData.byteLength,
        });
        audioQueueRef.current.push(audioData);

        // Start playback if not already playing
        if (!isPlayingRef.current) {
          console.log(
            "[TTAudioPlayback] Starting playback (isPlaying was false)",
          );
          isPlayingRef.current = true;
          setPlaybackState("buffering");
          playNextChunk();
        } else {
          console.log(
            "[TTAudioPlayback] Already playing, chunk queued for later processing",
          );
          // Ensure processing continues if it stopped
          if (!isProcessingRef.current && audioQueueRef.current.length > 0) {
            console.log(
              "[TTAudioPlayback] Triggering processAudioQueue since not processing",
            );
            playNextChunk();
          }
        }
      } catch (err) {
        console.error("[TTAudioPlayback] Error decoding audio:", err);
        voiceLog.error("[TTAudioPlayback] Error decoding audio:", err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [playNextChunk, onError],
  );

  /**
   * Signal end of audio stream
   */
  const endStream = useCallback(() => {
    voiceLog.debug("[TTAudioPlayback] Stream ended signal received");
    streamEndedRef.current = true;
  }, []);

  /**
   * Stop playback immediately (barge-in)
   */
  const stop = useCallback(() => {
    voiceLog.debug("[TTAudioPlayback] Stopping playback (barge-in)");

    // Stop all active audio sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors from already-stopped source
      }
    }
    activeSourcesRef.current.clear();

    // Stop current audio source (legacy)
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // Ignore errors from already-stopped source
      }
      currentSourceRef.current = null;
    }

    // Clear queue
    audioQueueRef.current = [];

    // Reset state
    isPlayingRef.current = false;
    isProcessingRef.current = false;
    streamEndedRef.current = true;
    nextScheduledTimeRef.current = 0;
    setPlaybackState("stopped");

    // Calculate total played time
    if (playbackStartTimeRef.current) {
      const totalPlayed = Date.now() - playbackStartTimeRef.current;
      setTotalPlayedMs(totalPlayed);
    }

    onPlaybackInterrupted?.();
  }, [onPlaybackInterrupted]);

  /**
   * Set volume
   */
  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  /**
   * Reset state for new stream
   */
  const reset = useCallback(() => {
    stop();
    streamStartTimeRef.current = null;
    firstChunkTimeRef.current = null;
    playbackStartTimeRef.current = null;
    streamEndedRef.current = false;
    nextScheduledTimeRef.current = 0;
    isProcessingRef.current = false;
    setTtfaMs(null);
    setTotalPlayedMs(0);
    setPlaybackState("idle");
  }, [stop]);

  /**
   * Pre-warm AudioContext to reduce latency on first audio chunk.
   * Call this when the user initiates voice mode, before audio arrives.
   */
  const warmup = useCallback(async () => {
    voiceLog.debug("[TTAudioPlayback] Pre-warming AudioContext");
    try {
      await getAudioContext();
      voiceLog.debug("[TTAudioPlayback] AudioContext pre-warmed successfully");
    } catch (err) {
      voiceLog.warn("[TTAudioPlayback] AudioContext pre-warm failed:", err);
    }
  }, [getAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const cleanedResources: string[] = [];

      // 1. Stop all active audio sources
      const activeCount = activeSourcesRef.current.size;
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Already stopped
        }
      }
      activeSourcesRef.current.clear();
      if (activeCount > 0) {
        cleanedResources.push(`activeSources(${activeCount})`);
      }

      // 2. Stop legacy current source
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch {
          // Already stopped
        }
        currentSourceRef.current = null;
        cleanedResources.push("currentSource");
      }

      // 3. Disconnect gain node
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
        } catch {
          // Already disconnected
        }
        gainNodeRef.current = null;
        cleanedResources.push("gainNode");
      }

      // 4. Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore close errors
        });
        audioContextRef.current = null;
        cleanedResources.push("audioContext");
      }

      // 5. Clear queue
      if (audioQueueRef.current.length > 0) {
        const queueLength = audioQueueRef.current.length;
        audioQueueRef.current = [];
        cleanedResources.push(`audioQueue(${queueLength})`);
      }

      // 6. Reset refs
      isPlayingRef.current = false;
      isProcessingRef.current = false;
      streamEndedRef.current = false;
      nextScheduledTimeRef.current = 0;

      if (cleanedResources.length > 0) {
        voiceLog.debug(
          `[TTAudioPlayback] Cleanup complete: ${cleanedResources.join(", ")}`,
        );
      }
    };
  }, []);

  // Update gain when volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  return {
    // State
    playbackState,
    isPlaying: playbackState === "playing" || playbackState === "buffering",
    volume,
    ttfaMs,
    totalPlayedMs,

    // Actions
    queueAudioChunk,
    endStream,
    stop,
    setVolume,
    reset,
    warmup,
  };
}

export default useTTAudioPlayback;
