/**
 * Thinker/Talker Audio Playback Hook
 *
 * Handles streaming audio playback for the T/T voice pipeline.
 * Receives audio chunks from the WebSocket and plays them with
 * optional pre-buffering for smooth playback.
 *
 * Features:
 * - Web Audio API for low-latency playback
 * - Audio queue for smooth streaming
 * - Pre-buffering support (configurable via feature flag)
 * - Barge-in support (stop playback immediately)
 * - Auto-resume after interruption
 * - Playback state tracking
 *
 * WebSocket Reliability Enhancement (Phase 1):
 * - Supports both base64-encoded strings and binary Uint8Array
 * - Binary audio support reduces bandwidth by ~25%
 *
 * WebSocket Latency Optimization:
 * - Pre-buffering: Buffers chunks before playback to prevent jitter
 * - Configurable buffer size via prebufferChunks option
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default number of audio chunks to buffer before starting playback.
 * At ~50ms per chunk (24kHz, typical ElevenLabs chunk size), 3 chunks = ~150ms buffer.
 * This provides a balance between latency and smoothness.
 */
const DEFAULT_PREBUFFER_CHUNKS = 3;

/**
 * Enhanced pre-buffer size for CRISP quality preset.
 * 5 chunks = ~250ms buffer, provides more headroom against network jitter.
 */
const ENHANCED_PREBUFFER_CHUNKS = 5;

/**
 * Maximum buffer size before we start playing anyway.
 * Prevents infinite buffering if stream is very slow.
 */
const MAX_PREBUFFER_WAIT_MS = 500;

/**
 * Maximum scheduling lookahead in seconds.
 * Don't schedule audio more than this far in the future.
 * Prevents massive source accumulation when chunks arrive faster than playback.
 *
 * Set to 3 seconds to allow for initial buffering when AudioContext is fresh
 * (currentTime starts at 0 and advances slowly). This prevents the scheduling
 * loop from getting stuck waiting for currentTime to catch up.
 */
const MAX_SCHEDULE_LOOKAHEAD_S = 3.0; // 3 second max lookahead

/**
 * Crossfade duration in samples for smooth chunk transitions.
 * At 24kHz, 120 samples = 5ms crossfade (eliminates pops/clicks)
 */
const CROSSFADE_SAMPLES = 120;

/**
 * Crossfade duration in samples for enhanced mode.
 * At 24kHz, 240 samples = 10ms crossfade (smoother transitions)
 */
const ENHANCED_CROSSFADE_SAMPLES = 240;

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

  // Pre-buffering options (WS Latency Optimization)
  /**
   * Enable pre-buffering before playback starts.
   * When enabled, audio chunks are buffered until prebufferChunks
   * threshold is reached before playback begins.
   * Default: false (disabled, controlled by feature flag)
   */
  enablePrebuffering?: boolean;
  /**
   * Number of audio chunks to buffer before starting playback.
   * Only used when enablePrebuffering is true.
   * Default: 3 chunks (~150ms at typical chunk sizes)
   */
  prebufferChunks?: number;
  /**
   * Maximum time to wait for prebuffer to fill (ms).
   * If prebuffer doesn't fill within this time, playback starts anyway.
   * Default: 500ms
   */
  prebufferTimeoutMs?: number;

  // Audio Quality Enhancement Options
  /**
   * Enable crossfade between audio chunks for seamless playback.
   * Applies a fade-in/fade-out at chunk boundaries to eliminate pops/clicks.
   * Default: false (disabled, controlled by feature flag)
   */
  enableCrossfade?: boolean;
  /**
   * Use enhanced settings for higher audio quality.
   * When enabled:
   * - Uses 5-chunk prebuffer instead of 3 (~250ms vs ~150ms)
   * - Uses 10ms crossfade instead of 5ms
   * Designed for CRISP quality preset.
   * Default: false
   */
  enhancedQuality?: boolean;
}

/**
 * Type for audio chunk data - supports both base64 string and binary Uint8Array
 * Binary format is used when WebSocket binary audio is enabled (Phase 1 WS Reliability)
 */
export type AudioChunkData = string | Uint8Array;

export interface TTAudioPlaybackReturn {
  // State
  playbackState: TTPlaybackState;
  isPlaying: boolean;
  volume: number;
  /** Time to first audio in current stream (ms) */
  ttfaMs: number | null;
  /** Total audio duration played (ms) */
  totalPlayedMs: number;

  // Pre-buffering state (WS Latency Optimization)
  /** Whether pre-buffering is currently active */
  isPrebuffering: boolean;
  /** Number of chunks currently in the pre-buffer */
  prebufferCount: number;
  /** Target pre-buffer size */
  prebufferTarget: number;

  // Actions
  /**
   * Queue an audio chunk for playback.
   * Accepts either base64 string or binary Uint8Array (for WS binary audio).
   */
  queueAudioChunk: (audioData: AudioChunkData) => void;
  /** Signal end of audio stream (flush queue) */
  endStream: () => void;
  /** Stop playback immediately (barge-in) */
  stop: () => void;
  /**
   * Fade out audio quickly for instant barge-in.
   * Natural Conversation Flow: Uses rapid fade (default 50ms) instead of hard stop
   * for smoother user experience. After fade completes, calls stop().
   * @param durationMs - Fade duration in milliseconds (default: 50)
   */
  fadeOut: (durationMs?: number) => void;
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

/**
 * Apply crossfade to audio samples for smooth chunk transitions.
 * Modifies the Float32Array in-place with fade-in at start and fade-out at end.
 *
 * @param samples - Audio samples to modify (Float32Array)
 * @param crossfadeSamples - Number of samples for fade duration
 */
function applyCrossfade(samples: Float32Array, crossfadeSamples: number): void {
  const length = samples.length;
  if (length < crossfadeSamples * 2) {
    // Audio too short for crossfade, skip
    return;
  }

  // Apply fade-in at the start
  for (let i = 0; i < crossfadeSamples; i++) {
    const fadeIn = i / crossfadeSamples;
    samples[i] *= fadeIn;
  }

  // Apply fade-out at the end
  for (let i = 0; i < crossfadeSamples; i++) {
    const fadeOut = 1 - i / crossfadeSamples;
    samples[length - 1 - i] *= fadeOut;
  }
}

export function useTTAudioPlayback(
  options: TTAudioPlaybackOptions = {},
): TTAudioPlaybackReturn {
  const {
    onPlaybackStart,
    onPlaybackEnd,
    onPlaybackInterrupted,
    onError,
    // Pre-buffering options (WS Latency Optimization)
    enablePrebuffering = false,
    prebufferChunks: prebufferChunksOption,
    prebufferTimeoutMs = MAX_PREBUFFER_WAIT_MS,
    // Audio Quality Enhancement options
    enableCrossfade = false,
    enhancedQuality = false,
  } = options;

  // Determine effective prebuffer size based on enhanced quality mode
  const prebufferChunks =
    prebufferChunksOption ??
    (enhancedQuality ? ENHANCED_PREBUFFER_CHUNKS : DEFAULT_PREBUFFER_CHUNKS);

  // Determine crossfade samples based on enhanced quality mode
  const crossfadeSamples = enhancedQuality
    ? ENHANCED_CROSSFADE_SAMPLES
    : CROSSFADE_SAMPLES;

  // State
  const [playbackState, setPlaybackState] = useState<TTPlaybackState>("idle");
  const [volume, setVolumeState] = useState(options.volume ?? 1);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);
  const [totalPlayedMs, setTotalPlayedMs] = useState(0);

  // Pre-buffering state (WS Latency Optimization)
  const [isPrebuffering, setIsPrebuffering] = useState(false);
  const [prebufferCount, setPrebufferCount] = useState(0);

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

  // Pre-buffering refs (WS Latency Optimization)
  const prebufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prebufferStartTimeRef = useRef<number | null>(null);
  const prebufferReadyRef = useRef(false);

  // Barge-in: When true, drop incoming audio chunks until reset() is called
  // This prevents stale audio from the cancelled response from playing
  const bargeInActiveRef = useRef(false);

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
    voiceLog.debug("[TTAudioPlayback] processAudioQueue called", {
      isProcessing: isProcessingRef.current,
      queueLength: audioQueueRef.current.length,
      isPlaying: isPlayingRef.current,
    });

    if (isProcessingRef.current) {
      voiceLog.debug("[TTAudioPlayback] Already processing, skipping");
      return;
    }
    if (audioQueueRef.current.length === 0) {
      voiceLog.debug("[TTAudioPlayback] Queue empty, skipping");
      return;
    }

    isProcessingRef.current = true;
    voiceLog.debug("[TTAudioPlayback] Starting to process queue");

    try {
      voiceLog.debug("[TTAudioPlayback] Getting AudioContext...");
      const audioContext = await getAudioContext();
      voiceLog.debug("[TTAudioPlayback] AudioContext obtained", {
        state: audioContext.state,
        sampleRate: audioContext.sampleRate,
      });

      // Process all available chunks
      let chunkIndex = 0;
      while (audioQueueRef.current.length > 0 && isPlayingRef.current) {
        // Check if we're too far ahead in scheduling
        // If so, break out and let playback catch up before scheduling more
        const now = audioContext.currentTime;
        const scheduledAhead = nextScheduledTimeRef.current - now;
        if (scheduledAhead > MAX_SCHEDULE_LOOKAHEAD_S) {
          voiceLog.debug(
            `[TTAudioPlayback] Pausing scheduling - ${scheduledAhead.toFixed(2)}s ahead, waiting for playback to catch up`,
          );
          // Schedule a retry after some of the audio has played
          setTimeout(() => {
            if (isPlayingRef.current && audioQueueRef.current.length > 0) {
              processAudioQueue();
            }
          }, 200); // Check again in 200ms
          break;
        }

        const audioData = audioQueueRef.current.shift()!;
        chunkIndex++;
        voiceLog.debug(`[TTAudioPlayback] Processing chunk ${chunkIndex}`, {
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
            voiceLog.debug(`[TTAudioPlayback] TTFA: ${ttfa}ms`);
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

          // Apply crossfade for seamless chunk transitions (Audio Quality Enhancement)
          if (enableCrossfade) {
            applyCrossfade(float32, crossfadeSamples);
          }

          voiceLog.debug(`[TTAudioPlayback] Converted to Float32`, {
            pcm16Length: pcm16.length,
            float32Length: float32.length,
            crossfadeApplied: enableCrossfade,
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
          voiceLog.debug(`[TTAudioPlayback] Created AudioBuffer`, {
            duration: audioBuffer.duration,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate,
          });

          // Create and connect source
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(gainNodeRef.current!);
          voiceLog.debug(`[TTAudioPlayback] Created and connected source`, {
            gainValue: gainNodeRef.current?.gain.value,
          });

          // Track active sources for cleanup
          activeSourcesRef.current.add(source);
          source.onended = () => {
            // Check if source is still in set before deleting
            // (it may have been cleared by stop() or fadeOut())
            const wasInSet = activeSourcesRef.current.has(source);
            if (wasInSet) {
              activeSourcesRef.current.delete(source);
            }

            const remainingCount = activeSourcesRef.current.size;
            // Only log when the source was tracked (reduces spam after barge-in)
            if (wasInSet) {
              voiceLog.debug(`[TTAudioPlayback] Source ended`, {
                activeSourcesCount: remainingCount,
                streamEnded: streamEndedRef.current,
                queueLength: audioQueueRef.current.length,
              });
            }

            // Check if all sources finished and stream ended
            // Only trigger onPlaybackEnd if this source was naturally ending
            // (not if it was stopped by barge-in which clears the set)
            if (
              wasInSet &&
              remainingCount === 0 &&
              streamEndedRef.current &&
              audioQueueRef.current.length === 0
            ) {
              voiceLog.debug("[TTAudioPlayback] All audio finished");
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
          voiceLog.debug(`[TTAudioPlayback] Scheduled source to start`, {
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
      voiceLog.debug(`[TTAudioPlayback] Finished processing loop`, {
        chunksProcessed: chunkIndex,
        queueRemaining: audioQueueRef.current.length,
      });
    } catch (err) {
      console.error("[TTAudioPlayback] Error in processAudioQueue:", err);
    } finally {
      isProcessingRef.current = false;
      voiceLog.debug(
        "[TTAudioPlayback] Processing complete, isProcessing reset to false",
      );
    }

    // If more chunks arrived while processing, process them too
    if (audioQueueRef.current.length > 0 && isPlayingRef.current) {
      voiceLog.debug("[TTAudioPlayback] More chunks arrived, processing again");
      processAudioQueue();
    }
  }, [
    getAudioContext,
    onPlaybackStart,
    onPlaybackEnd,
    enableCrossfade,
    crossfadeSamples,
  ]);

  /**
   * Legacy function name for compatibility
   */
  const playNextChunk = useCallback(() => {
    processAudioQueue();
  }, [processAudioQueue]);

  /**
   * Start playback after pre-buffering is complete.
   * Called when prebuffer threshold is reached or timeout fires.
   */
  const startPlaybackFromPrebuffer = useCallback(() => {
    if (prebufferTimeoutRef.current) {
      clearTimeout(prebufferTimeoutRef.current);
      prebufferTimeoutRef.current = null;
    }

    prebufferReadyRef.current = true;
    setIsPrebuffering(false);

    const prebufferDuration = prebufferStartTimeRef.current
      ? Date.now() - prebufferStartTimeRef.current
      : 0;

    voiceLog.debug(
      `[TTAudioPlayback] Pre-buffer complete: ${audioQueueRef.current.length} chunks in ${prebufferDuration}ms`,
    );

    // Start playback
    if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
      isPlayingRef.current = true;
      setPlaybackState("buffering");
      playNextChunk();
    }
  }, [playNextChunk]);

  /**
   * Queue an audio chunk for playback.
   * Supports both base64 string and binary Uint8Array (for WS binary audio).
   * When pre-buffering is enabled, waits for threshold before starting playback.
   */
  const queueAudioChunk = useCallback(
    (audioData: AudioChunkData) => {
      // Drop audio chunks if barge-in is active
      // This prevents stale audio from cancelled responses from playing
      if (bargeInActiveRef.current) {
        voiceLog.debug(
          "[TTAudioPlayback] Dropping audio chunk - barge-in active",
        );
        return;
      }

      const isBinary = audioData instanceof Uint8Array;
      voiceLog.debug("[TTAudioPlayback] queueAudioChunk called", {
        dataType: isBinary ? "binary" : "base64",
        dataLength: isBinary ? audioData.byteLength : audioData.length,
        isPlaying: isPlayingRef.current,
        queueLength: audioQueueRef.current.length,
        streamStarted: !!streamStartTimeRef.current,
        enablePrebuffering,
        isPrebuffering: !prebufferReadyRef.current && enablePrebuffering,
      });

      // Start timing on first chunk
      if (!streamStartTimeRef.current) {
        streamStartTimeRef.current = Date.now();
        streamEndedRef.current = false;
        // Reset scheduling time for new stream to prevent stale future scheduling
        // This ensures audio plays immediately rather than minutes in the future
        nextScheduledTimeRef.current = 0;
        voiceLog.debug("[TTAudioPlayback] Started new stream timing");

        // Initialize pre-buffering if enabled
        if (enablePrebuffering) {
          prebufferStartTimeRef.current = Date.now();
          prebufferReadyRef.current = false;
          setIsPrebuffering(true);

          // Set timeout to start playback even if prebuffer doesn't fill
          prebufferTimeoutRef.current = setTimeout(() => {
            if (!prebufferReadyRef.current) {
              voiceLog.debug(
                `[TTAudioPlayback] Pre-buffer timeout (${prebufferTimeoutMs}ms), starting with ${audioQueueRef.current.length} chunks`,
              );
              startPlaybackFromPrebuffer();
            }
          }, prebufferTimeoutMs);
        }
      }

      try {
        // Convert to ArrayBuffer based on input type
        let arrayBuffer: ArrayBuffer;
        if (isBinary) {
          // Binary Uint8Array - use buffer directly
          arrayBuffer = audioData.buffer.slice(
            audioData.byteOffset,
            audioData.byteOffset + audioData.byteLength,
          );
        } else {
          // Base64 string - decode
          arrayBuffer = base64ToArrayBuffer(audioData);
        }

        voiceLog.debug("[TTAudioPlayback] Converted to ArrayBuffer", {
          byteLength: arrayBuffer.byteLength,
        });
        audioQueueRef.current.push(arrayBuffer);

        // Update prebuffer count for UI feedback
        if (enablePrebuffering && !prebufferReadyRef.current) {
          setPrebufferCount(audioQueueRef.current.length);
        }

        // Check if we should start playback
        if (enablePrebuffering && !prebufferReadyRef.current) {
          // Pre-buffering mode: wait for threshold
          if (audioQueueRef.current.length >= prebufferChunks) {
            voiceLog.debug(
              `[TTAudioPlayback] Pre-buffer threshold reached (${prebufferChunks} chunks)`,
            );
            startPlaybackFromPrebuffer();
          } else {
            voiceLog.debug(
              `[TTAudioPlayback] Pre-buffering: ${audioQueueRef.current.length}/${prebufferChunks} chunks`,
            );
          }
        } else {
          // Normal mode or prebuffer already ready: start immediately
          if (!isPlayingRef.current) {
            voiceLog.debug(
              "[TTAudioPlayback] Starting playback (isPlaying was false)",
            );
            isPlayingRef.current = true;
            setPlaybackState("buffering");
            playNextChunk();
          } else {
            voiceLog.debug(
              "[TTAudioPlayback] Already playing, chunk queued for later processing",
            );
            // Ensure processing continues if it stopped
            if (!isProcessingRef.current && audioQueueRef.current.length > 0) {
              voiceLog.debug(
                "[TTAudioPlayback] Triggering processAudioQueue since not processing",
              );
              playNextChunk();
            }
          }
        }
      } catch (err) {
        console.error("[TTAudioPlayback] Error processing audio:", err);
        voiceLog.error("[TTAudioPlayback] Error processing audio:", err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [
      playNextChunk,
      onError,
      enablePrebuffering,
      prebufferChunks,
      prebufferTimeoutMs,
      startPlaybackFromPrebuffer,
    ],
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

    // Set barge-in flag to drop any incoming audio chunks
    // This prevents stale audio from the cancelled response from playing
    bargeInActiveRef.current = true;

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
   * Fade out audio quickly for instant barge-in (Natural Conversation Flow).
   * Uses Web Audio API's linearRampToValueAtTime for smooth, precise fade.
   * After fade completes, calls stop() to clean up resources.
   *
   * @param durationMs - Fade duration in milliseconds (default: 50ms for instant barge-in)
   */
  const fadeOut = useCallback(
    (durationMs: number = 50) => {
      // IMMEDIATELY set barge-in flag to drop any new incoming audio chunks
      // This prevents audio from being queued during the fade
      bargeInActiveRef.current = true;

      if (!gainNodeRef.current || !audioContextRef.current) {
        // No active audio context, just stop immediately
        stop();
        return;
      }

      voiceLog.debug(
        `[TTAudioPlayback] Fading out audio (${durationMs}ms) for instant barge-in`,
      );

      const audioContext = audioContextRef.current;
      const gainNode = gainNodeRef.current;
      const currentTime = audioContext.currentTime;
      const fadeEndTime = currentTime + durationMs / 1000;

      // IMMEDIATELY stop all scheduled audio sources to prevent new chunks from playing
      // This stops any audio that was scheduled to play but hasn't started yet
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Ignore errors from already-stopped sources
        }
      }
      activeSourcesRef.current.clear();

      // Clear the queue immediately - no more audio will be processed
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      isProcessingRef.current = false;
      nextScheduledTimeRef.current = 0;

      // Cancel any scheduled gain changes and reset
      gainNode.gain.cancelScheduledValues(currentTime);
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, currentTime);
      gainNode.gain.linearRampToValueAtTime(0, fadeEndTime);

      // Notify of interruption
      onPlaybackInterrupted?.();
      setPlaybackState("stopped");

      // Restore gain value for next playback after a brief delay
      setTimeout(() => {
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = volume;
        }
      }, durationMs);

      // Finalize cleanup using the normal stop() path after the fade completes
      setTimeout(() => {
        stop();
      }, durationMs);
    },
    [volume, onPlaybackInterrupted, stop],
  );

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

    // Clear barge-in flag AFTER stop() - we're starting a new response
    // This allows new audio chunks to be queued for the new response
    bargeInActiveRef.current = false;

    streamStartTimeRef.current = null;
    firstChunkTimeRef.current = null;
    playbackStartTimeRef.current = null;
    streamEndedRef.current = false;
    nextScheduledTimeRef.current = 0;
    isProcessingRef.current = false;
    setTtfaMs(null);
    setTotalPlayedMs(0);
    setPlaybackState("idle");

    // Reset pre-buffering state (WS Latency Optimization)
    if (prebufferTimeoutRef.current) {
      clearTimeout(prebufferTimeoutRef.current);
      prebufferTimeoutRef.current = null;
    }
    prebufferStartTimeRef.current = null;
    prebufferReadyRef.current = false;
    setIsPrebuffering(false);
    setPrebufferCount(0);
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
      const activeSources = Array.from(activeSourcesRef.current);
      activeSourcesRef.current = new Set();
      const currentSource = currentSourceRef.current;
      const gainNode = gainNodeRef.current;
      const audioContext = audioContextRef.current;

      // 1. Stop all active audio sources
      const activeCount = activeSources.length;
      for (const source of activeSources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Already stopped
        }
      }
      if (activeCount > 0) {
        cleanedResources.push(`activeSources(${activeCount})`);
      }

      // 2. Stop legacy current source
      if (currentSource) {
        try {
          currentSource.stop();
          currentSource.disconnect();
        } catch {
          // Already stopped
        }
        currentSourceRef.current = null;
        cleanedResources.push("currentSource");
      }

      // 3. Disconnect gain node
      if (gainNode) {
        try {
          gainNode.disconnect();
        } catch {
          // Already disconnected
        }
        gainNodeRef.current = null;
        cleanedResources.push("gainNode");
      }

      // 4. Close AudioContext
      if (audioContext) {
        audioContext.close().catch(() => {
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

    // Pre-buffering state (WS Latency Optimization)
    isPrebuffering,
    prebufferCount,
    prebufferTarget: prebufferChunks,

    // Actions
    queueAudioChunk,
    endStream,
    stop,
    fadeOut,
    setVolume,
    reset,
    warmup,
  };
}

export default useTTAudioPlayback;
