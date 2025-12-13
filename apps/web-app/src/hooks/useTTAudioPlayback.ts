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

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
 * Network-adaptive prebuffer sizes.
 * Natural Conversation Flow: Phase 6 - Network-Adaptive Behavior
 *
 * - Excellent/Good: 2-3 chunks (~100-150ms buffer) - minimize latency
 * - Fair/Moderate: 4-5 chunks (~200-250ms buffer) - balance latency/smoothness
 * - Poor: 6-8 chunks (~300-400ms buffer) - prioritize smoothness
 * - Unknown: Fall back to default (3 chunks)
 */
const NETWORK_PREBUFFER_MAP: Record<
  "excellent" | "good" | "fair" | "poor" | "unknown",
  number
> = {
  excellent: 2,
  good: 3,
  fair: 5,
  poor: 7,
  unknown: DEFAULT_PREBUFFER_CHUNKS,
};

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
 * Set to 2.5 seconds to balance:
 * - Initial buffering when AudioContext is fresh (currentTime starts at 0)
 * - Network jitter where chunks arrive in bursts
 * - Variable TTS generation speed
 * - Prebuffering which can cause chunks to arrive in batches
 *
 * REDUCED from 5.0s to 2.5s to address audio source accumulation issue:
 * - 5.0s allowed 50+ audio sources to accumulate (170ms chunks = ~30 sources)
 * - 2.5s limits to ~15 active sources, reducing memory pressure
 * - Combined with queue management, provides smooth playback without resource issues
 *
 * At 170ms per chunk (24kHz ElevenLabs), 2.5s = ~15 chunks of lookahead,
 * which is enough to handle normal network jitter while keeping memory bounded.
 */
const MAX_SCHEDULE_LOOKAHEAD_S = 2.5;

/**
 * Maximum queue duration in milliseconds (Natural Conversation Flow: Phase 1).
 *
 * IMPORTANT:
 * Some TTS providers can generate audio faster than realtime. For long responses
 * (e.g., reading from the Knowledge Base), the client may temporarily buffer
 * substantial audio before it is played out. Trimming aggressively can cause
 * audible "missing middle segments" (beginning + end, but lost mid-response).
 *
 * We therefore keep a high safety bound and only trim as a last resort to
 * prevent unbounded memory growth if playback stalls.
 */
const MAX_QUEUE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * PCM characteristics for Thinker/Talker TTS audio.
 * Current pipeline uses pcm16 mono at 24kHz.
 */
const PCM16_SAMPLE_RATE_HZ = 24000;
const PCM16_BYTES_PER_SAMPLE = 2;
const PCM16_BYTES_PER_SECOND = PCM16_SAMPLE_RATE_HZ * PCM16_BYTES_PER_SAMPLE;
const MAX_QUEUE_BYTES = Math.round(
  (MAX_QUEUE_DURATION_MS / 1000) * PCM16_BYTES_PER_SECOND,
);

/**
 * Scheduling watchdog interval in milliseconds.
 * Natural Conversation Flow: Phase 1.3 - Periodic check for stuck schedules.
 */
const WATCHDOG_INTERVAL_MS = 500;

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
  /**
   * Called when queue overflow occurs (Natural Conversation Flow: Phase 1).
   * Provides details about the overflow for metrics/logging.
   */
  onQueueOverflow?: (details: {
    droppedChunks: number;
    queueDurationMs: number;
    source: "duration" | "lookahead" | "watchdog";
  }) => void;

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

  // Network-Adaptive Options (Natural Conversation Flow: Phase 6)
  /**
   * Enable network-adaptive prebuffering.
   * When enabled, prebuffer size is adjusted based on network quality.
   * Default: false (controlled by feature flag: backend.voice_adaptive_prebuffer)
   */
  enableAdaptivePrebuffer?: boolean;
  /**
   * Current network quality level.
   * Used to determine optimal prebuffer size when enableAdaptivePrebuffer is true.
   * Default: "unknown"
   */
  networkQuality?: "excellent" | "good" | "fair" | "poor" | "unknown";

  /**
   * Debug: Enable simplified playback mode.
   * When true, the scheduler aggressively clamps how far ahead audio is
   * scheduled to stay close to real time. This is intended for local
   * debugging of choppy audio and should not be enabled in production
   * by default.
   */
  simpleMode?: boolean;
}

/**
 * Type for audio chunk data - supports both base64 string and binary Uint8Array
 * Binary format is used when WebSocket binary audio is enabled (Phase 1 WS Reliability)
 */
export type AudioChunkData = string | Uint8Array;

/**
 * Historical audio metrics for E2E test validation.
 * Tracks cumulative state that persists across state updates.
 */
export interface AudioHistoryMetrics {
  /** Whether audio has EVER played in this session (not just currently playing) */
  wasEverPlaying: boolean;
  /** Total audio chunks received from backend */
  totalChunksReceived: number;
  /** Total chunks successfully scheduled for playback */
  totalChunksScheduled: number;
  /** Total chunks dropped due to barge-in */
  totalChunksDropped: number;
  /** Peak number of concurrent audio sources */
  peakActiveSourcesCount: number;
}

/**
 * Timestamped events for latency measurement.
 * All timestamps are from performance.now() for high precision.
 */
export interface AudioTimestamps {
  /** When last audio chunk was received */
  lastChunkReceived: number | null;
  /** When last audio was scheduled to AudioContext */
  lastChunkScheduled: number | null;
  /** When fadeOut() was called (barge-in start) */
  lastFadeStarted: number | null;
  /** When activeSourcesCount reached 0 after barge-in */
  lastAudioSilent: number | null;
  /** When playback first started in this stream */
  playbackStarted: number | null;
  /** When stream was reset */
  lastReset: number | null;
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

  // Pre-buffering state (WS Latency Optimization)
  /** Whether pre-buffering is currently active */
  isPrebuffering: boolean;
  /** Number of chunks currently in the pre-buffer */
  prebufferCount: number;
  /** Target pre-buffer size */
  prebufferTarget: number;

  // Queue overflow stats (Natural Conversation Flow: Phase 1)
  /** Current queue length in chunks */
  queueLength: number;
  /** Estimated queue duration in ms */
  queueDurationMs: number;
  /** Total overflow events since reset */
  overflowCount: number;

  // Historical metrics for E2E testing
  /** Cumulative audio history metrics */
  audioHistory: AudioHistoryMetrics;
  /** Timestamped events for latency measurement */
  timestamps: AudioTimestamps;

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
  /** Get debug state with ref values (for E2E testing) */
  getDebugState: () => {
    isPlayingRef: boolean;
    isProcessingRef: boolean;
    activeSourcesCount: number;
    streamEndedRef: boolean;
    bargeInActiveRef: boolean;
    queueLength: number;
    queueDurationMs: number;
  };
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
    onQueueOverflow,
    // Pre-buffering options (WS Latency Optimization)
    enablePrebuffering = false,
    prebufferChunks: prebufferChunksOption,
    prebufferTimeoutMs = MAX_PREBUFFER_WAIT_MS,
    // Audio Quality Enhancement options
    enableCrossfade = false,
    enhancedQuality = false,
    // Network-adaptive options (Natural Conversation Flow: Phase 6)
    enableAdaptivePrebuffer = false,
    networkQuality = "unknown",
    // Debug / lab mode: simplified scheduler
    simpleMode = false,
  } = options;

  // Determine effective prebuffer size based on:
  // 1. Explicit prebufferChunks option (highest priority)
  // 2. Network-adaptive prebuffer (if enabled)
  // 3. Enhanced quality mode
  // 4. Default
  const prebufferChunks = (() => {
    // Explicit option takes precedence
    if (prebufferChunksOption !== undefined) {
      return prebufferChunksOption;
    }
    // Network-adaptive prebuffering (Natural Conversation Flow: Phase 6)
    if (enableAdaptivePrebuffer) {
      const networkPrebuffer = NETWORK_PREBUFFER_MAP[networkQuality];
      voiceLog.debug(
        `[TTAudioPlayback] Network-adaptive prebuffer: quality=${networkQuality}, chunks=${networkPrebuffer}`,
      );
      return networkPrebuffer;
    }
    // Enhanced quality mode
    if (enhancedQuality) {
      return ENHANCED_PREBUFFER_CHUNKS;
    }
    // Default
    return DEFAULT_PREBUFFER_CHUNKS;
  })();

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

  // Queue overflow stats (Natural Conversation Flow: Phase 1)
  const [queueLength, setQueueLength] = useState(0);
  const [queueDurationMs, setQueueDurationMs] = useState(0);
  const [overflowCount, setOverflowCount] = useState(0);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  // Track queued audio size in bytes so we can estimate queue duration without
  // relying on a fixed per-chunk duration approximation.
  const queuedBytesRef = useRef(0);
  const isPlayingRef = useRef(false);
  const streamStartTimeRef = useRef<number | null>(null);
  const firstChunkTimeRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const streamEndedRef = useRef(false);
  const playbackCompletedRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // For gapless scheduled playback
  const nextScheduledTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isProcessingRef = useRef(false);
  // Monotonic chunk index per stream for detailed scheduling/end logging
  const streamChunkIndexRef = useRef(0);

  // Pre-buffering refs (WS Latency Optimization)
  const prebufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prebufferStartTimeRef = useRef<number | null>(null);
  const prebufferReadyRef = useRef(false);

  // Barge-in: When true, drop incoming audio chunks until reset() is called
  // This prevents stale audio from the cancelled response from playing
  const bargeInActiveRef = useRef(false);
  const bargeInStopLoggedRef = useRef(false);

  // Guard to prevent onPlaybackInterrupted from being called multiple times
  // during a single barge-in sequence (e.g., fadeOut calls it, then stop() calls it again)
  const interruptCallbackFiredRef = useRef(false);

  // E2E Test Harness: Historical metrics tracking
  // These refs track cumulative state that persists across React state updates
  const audioHistoryRef = useRef<AudioHistoryMetrics>({
    wasEverPlaying: false,
    totalChunksReceived: 0,
    totalChunksScheduled: 0,
    totalChunksDropped: 0,
    peakActiveSourcesCount: 0,
  });

  // E2E Test Harness: Timestamps for latency measurement
  // All timestamps use performance.now() for high precision
  const timestampsRef = useRef<AudioTimestamps>({
    lastChunkReceived: null,
    lastChunkScheduled: null,
    lastFadeStarted: null,
    lastAudioSilent: null,
    playbackStarted: null,
    lastReset: null,
  });

  // Scheduling watchdog ref (Natural Conversation Flow: Phase 1.3)
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Monotonic stream ID for debug/metrics – increments each time a
  // brand-new TTS stream starts (first chunk after reset()).
  const currentStreamIdRef = useRef<number>(0);

  const isAutomation =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { webdriver?: boolean }).webdriver;

  // Local trace for debugging audio scheduling; keep OFF by default.
  // This uses the same "double opt-in" pattern as other lab flags to avoid
  // sticky perf regressions from past debugging sessions.
  const playbackTraceEnabledRef = useRef<boolean>(
    import.meta.env.DEV &&
      typeof window !== "undefined" &&
      window.localStorage?.getItem("voiceassist_enable_tts_lab_mode") ===
        "true" &&
      window.localStorage?.getItem("voiceassist_tts_playback_trace") === "true",
  );

  /**
   * Estimate queue duration in milliseconds.
   * Uses queued PCM byte count for accuracy (pcm16 mono @ 24kHz).
   */
  const estimateQueueDurationMs = useCallback(() => {
    return (queuedBytesRef.current / PCM16_BYTES_PER_SECOND) * 1000;
  }, []);

  /**
   * Handle queue overflow by trimming old chunks.
   * Natural Conversation Flow: Phase 1.1 - Queue Duration Enforcement
   */
  const handleQueueOverflow = useCallback(
    (source: "duration" | "lookahead" | "watchdog") => {
      const currentLength = audioQueueRef.current.length;
      const currentDurationMs = estimateQueueDurationMs();

      if (currentLength <= prebufferChunks) {
        return; // Don't trim below prebuffer threshold
      }

      // Safety guard: if the queue becomes extremely large (e.g., due to a bug or
      // paused playback), trim as a last resort. To preserve continuity and avoid
      // "missing middle segments", drop *newest* chunks rather than dropping the
      // front of the queue while audio is mid-playback.
      if (queuedBytesRef.current <= MAX_QUEUE_BYTES) {
        return;
      }

      let droppedChunks = 0;
      let droppedBytes = 0;

      while (
        audioQueueRef.current.length > prebufferChunks &&
        queuedBytesRef.current - droppedBytes > MAX_QUEUE_BYTES
      ) {
        const dropped = audioQueueRef.current.pop();
        if (!dropped) break;
        droppedChunks += 1;
        droppedBytes += dropped.byteLength;
      }

      if (droppedChunks > 0) {
        queuedBytesRef.current = Math.max(
          0,
          queuedBytesRef.current - droppedBytes,
        );
        audioHistoryRef.current.totalChunksDropped += droppedChunks;

        voiceLog.warn(
          `[TTAudioPlayback] Queue overflow (${source}): dropped ${droppedChunks} chunks, ` +
            `duration was ${Math.round(currentDurationMs)}ms`,
        );

        setOverflowCount((prev) => prev + 1);
        setQueueLength(audioQueueRef.current.length);
        setQueueDurationMs(estimateQueueDurationMs());

        onQueueOverflow?.({
          droppedChunks,
          queueDurationMs: currentDurationMs,
          source,
        });
      }
    },
    [estimateQueueDurationMs, onQueueOverflow, prebufferChunks],
  );

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
    // E2E Debug: Track processAudioQueue entry
    if (playbackTraceEnabledRef.current) {
      console.log("[TTAudioPlayback] processAudioQueue ENTRY", {
        bargeInActive: bargeInActiveRef.current,
        isProcessing: isProcessingRef.current,
        queueLength: audioQueueRef.current.length,
        queuedMs: Math.round(estimateQueueDurationMs()),
        isPlaying: isPlayingRef.current,
      });
    }

    // Bail out immediately if a barge-in just occurred
    if (bargeInActiveRef.current) {
      if (playbackTraceEnabledRef.current) {
        console.log("[TTAudioPlayback] processAudioQueue EXIT: barge-in active");
      }
      audioQueueRef.current = [];
      queuedBytesRef.current = 0;
      isProcessingRef.current = false;
      nextScheduledTimeRef.current = 0;
      return;
    }

    voiceLog.debug("[TTAudioPlayback] processAudioQueue called", {
      isProcessing: isProcessingRef.current,
      queueLength: audioQueueRef.current.length,
      isPlaying: isPlayingRef.current,
    });

    if (isProcessingRef.current) {
      if (playbackTraceEnabledRef.current) {
        console.log(
          "[TTAudioPlayback] processAudioQueue EXIT: already processing",
        );
      }
      voiceLog.debug("[TTAudioPlayback] Already processing, skipping");
      return;
    }
    if (audioQueueRef.current.length === 0) {
      if (playbackTraceEnabledRef.current) {
        console.log("[TTAudioPlayback] processAudioQueue EXIT: queue empty");
      }
      voiceLog.debug("[TTAudioPlayback] Queue empty, skipping");
      return;
    }

    isProcessingRef.current = true;
    if (playbackTraceEnabledRef.current) {
      console.log("[TTAudioPlayback] processAudioQueue STARTING PROCESSING");
    }
    voiceLog.debug("[TTAudioPlayback] Starting to process queue");

    try {
      if (playbackTraceEnabledRef.current) {
        console.log("[TTAudioPlayback] Getting AudioContext...");
      }
      voiceLog.debug("[TTAudioPlayback] Getting AudioContext...");
      const audioContext = await getAudioContext();
      if (playbackTraceEnabledRef.current) {
        console.log("[TTAudioPlayback] AudioContext obtained", {
          state: audioContext.state,
          sampleRate: audioContext.sampleRate,
        });
      }
      voiceLog.debug("[TTAudioPlayback] AudioContext obtained", {
        state: audioContext.state,
        sampleRate: audioContext.sampleRate,
      });

      // Schedule as many chunks as possible per call (up to lookahead).
      // This keeps playback gapless while still bounding how far ahead we
      // schedule audio so barge-in can stop quickly.
      const lookaheadLimit = simpleMode ? 1.0 : MAX_SCHEDULE_LOOKAHEAD_S;
      let chunksProcessed = 0;

      while (
        audioQueueRef.current.length > 0 &&
        isPlayingRef.current &&
        !bargeInActiveRef.current
      ) {
        // If we already have enough scheduled audio ahead of "now", stop
        // scheduling and let playback catch up.
        const now = audioContext.currentTime;
        const scheduledAhead = nextScheduledTimeRef.current - now;
        if (scheduledAhead > lookaheadLimit) {
          break;
        }

        const audioData = audioQueueRef.current.shift()!;
        queuedBytesRef.current = Math.max(
          0,
          queuedBytesRef.current - audioData.byteLength,
        );
        chunksProcessed++;
        const streamChunkIndex = ++streamChunkIndexRef.current;
        voiceLog.debug(`[TTAudioPlayback] Processing chunk ${chunksProcessed}`, {
          byteLength: audioData.byteLength,
          queueRemaining: audioQueueRef.current.length,
          streamChunkIndex,
        });

        try {
          // Track time to first audio
          if (!firstChunkTimeRef.current && streamStartTimeRef.current) {
            firstChunkTimeRef.current = Date.now();
            const ttfa = firstChunkTimeRef.current - streamStartTimeRef.current;
            setTtfaMs(ttfa);
            playbackStartTimeRef.current = Date.now();
            // E2E Test Harness: Track playback start timestamp and mark as ever playing
            timestampsRef.current.playbackStarted = performance.now();
            audioHistoryRef.current.wasEverPlaying = true;
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
          // E2E Test Harness: Track peak active sources and scheduled chunks
          audioHistoryRef.current.totalChunksScheduled++;
          timestampsRef.current.lastChunkScheduled = performance.now();
          const currentActiveSources = activeSourcesRef.current.size;
          if (currentActiveSources > audioHistoryRef.current.peakActiveSourcesCount) {
            audioHistoryRef.current.peakActiveSourcesCount = currentActiveSources;
          }
          source.onended = () => {
            // Check if source is still in set before deleting
            // (it may have been cleared by stop() or fadeOut())
            const wasInSet = activeSourcesRef.current.has(source);
            if (wasInSet) {
              activeSourcesRef.current.delete(source);
            }

            const remainingCount = activeSourcesRef.current.size;
            // E2E Test Harness: Track when audio becomes silent (for barge-in latency)
            if (remainingCount === 0 && bargeInActiveRef.current) {
              timestampsRef.current.lastAudioSilent = performance.now();
            }
            // Only log when the source was tracked (reduces spam after barge-in)
            if (wasInSet) {
              voiceLog.debug(`[TTAudioPlayback] Source ended`, {
                streamChunkIndex,
                activeSourcesCount: remainingCount,
                streamEnded: streamEndedRef.current,
                queueLength: audioQueueRef.current.length,
              });
            }

            // If more audio is queued and we're not in a barge-in state,
            // schedule the next chunk now for strictly sequential playback.
            if (
              !bargeInActiveRef.current &&
              audioQueueRef.current.length > 0 &&
              isPlayingRef.current
            ) {
              voiceLog.debug(
                "[TTAudioPlayback] Source ended, scheduling next chunk",
              );
              // Schedule next chunk on the same AudioContext
              processAudioQueue();
            } else {
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
                if (bargeInActiveRef.current || playbackCompletedRef.current) {
                  return;
                }
                playbackCompletedRef.current = true;
                isPlayingRef.current = false;
                setPlaybackState("idle");
                if (playbackStartTimeRef.current) {
                  setTotalPlayedMs(Date.now() - playbackStartTimeRef.current);
                }
                onPlaybackEnd?.();
              }
            }
          };

          // Schedule playback back-to-back using nextScheduledTimeRef.
          // This avoids per-chunk gaps that happen when scheduling only in
          // source.onended() with a fixed buffer offset.
          const now = audioContext.currentTime;
          const bufferTime = 0.01; // 10ms buffer for scheduling safety
          const startTime = Math.max(
            nextScheduledTimeRef.current,
            now + bufferTime,
          );
          source.start(startTime);
          if (playbackTraceEnabledRef.current) {
            console.log(`[TTAudioPlayback] AUDIO SCHEDULED`, {
              startTime: startTime.toFixed(3),
              currentTime: now.toFixed(3),
              bufferDuration: audioBuffer.duration.toFixed(3),
              chunkIndex: chunksProcessed,
              streamChunkIndex,
            });
          }
          voiceLog.debug(`[TTAudioPlayback] Scheduled source to start`, {
            startTime: startTime.toFixed(3),
            currentTime: now.toFixed(3),
            bufferDuration: audioBuffer.duration.toFixed(3),
            streamChunkIndex,
          });

          // Update next scheduled time to end of this buffer
          nextScheduledTimeRef.current = startTime + audioBuffer.duration;

          if (playbackTraceEnabledRef.current) {
            console.log("[TTAudioPlayback] Setting playbackState to 'playing'");
          }
          setPlaybackState("playing");
        } catch (err) {
          console.error(
            "[TTAudioPlayback] Error decoding chunk:",
            err,
            "chunk details:",
            { chunkIndex },
          );
          voiceLog.error("[TTAudioPlayback] Error decoding chunk:", err);
          // Continue with next chunk
        }
      }
      voiceLog.debug(`[TTAudioPlayback] Finished processing loop`, {
        chunksProcessed,
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

    // NOTE: We no longer recursively process all queued chunks here.
    // Additional chunks are scheduled by source.onended or by a new
    // queueAudioChunk() call when audio is idle.
  }, [
    getAudioContext,
    onPlaybackStart,
    onPlaybackEnd,
    enableCrossfade,
    crossfadeSamples,
    prebufferChunks,
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
      const isBinary = audioData instanceof Uint8Array;
      const dataLength = isBinary ? audioData.byteLength : audioData.length;

      // E2E / debug: Track audio queue flow (OFF by default).
      if (
        (playbackTraceEnabledRef.current || isAutomation) &&
        typeof window !== "undefined"
      ) {
        const win = window as Window & {
          __tt_audio_debug?: Array<{
            timestamp: number;
            event: string;
            length: number;
            playbackState?: string;
            isPlaying?: boolean;
            bargeInActive?: boolean;
            queueLength?: number;
          }>;
        };
        if (!win.__tt_audio_debug) {
          win.__tt_audio_debug = [];
        }
        win.__tt_audio_debug.push({
          timestamp: Date.now(),
          event: bargeInActiveRef.current
            ? "queueAudioChunk_dropped_barge_in"
            : "queueAudioChunk_received",
          length: dataLength,
          bargeInActive: bargeInActiveRef.current,
          isPlaying: isPlayingRef.current,
          queueLength: audioQueueRef.current.length,
        });
        // Keep a small rolling buffer (avoid memory growth in long sessions).
        if (win.__tt_audio_debug.length > 500) {
          win.__tt_audio_debug.splice(0, win.__tt_audio_debug.length - 500);
        }
        if (playbackTraceEnabledRef.current) {
          console.log("[TTAudioPlayback] queueAudioChunk debug", {
            event: bargeInActiveRef.current ? "DROPPED" : "RECEIVED",
            dataLength,
            bargeInActive: bargeInActiveRef.current,
            isPlaying: isPlayingRef.current,
            queueLength: audioQueueRef.current.length,
          });
        }
      }

      // E2E Test Harness: Track chunk received timestamp
      timestampsRef.current.lastChunkReceived = performance.now();
      audioHistoryRef.current.totalChunksReceived++;

      // If barge-in is active, treat the next incoming audio as a NEW stream.
      // Backend `barge_in` handling already cancels the previous response, so
      // we don't need to keep dropping chunks here. Clearing the flag ensures
      // we don't accidentally drop audio for the next valid response.
      if (bargeInActiveRef.current) {
        voiceLog.debug(
          "[TTAudioPlayback] New audio received while barge-in active - clearing barge-in state for next response",
        );
        bargeInActiveRef.current = false;
        bargeInStopLoggedRef.current = false;
        interruptCallbackFiredRef.current = false;
      }

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
        // CRITICAL: Stop any active sources from a previous stream before starting new one
        // This prevents overlapping audio when a new response arrives while old audio is playing
        const previousActiveSources = activeSourcesRef.current.size;
        if (previousActiveSources > 0) {
          voiceLog.warn(
            `[TTAudioPlayback] NEW STREAM starting with ${previousActiveSources} active sources from previous stream - stopping them`,
          );
          for (const source of activeSourcesRef.current) {
            try {
              source.stop();
              source.disconnect();
            } catch {
              // Ignore errors from already-stopped sources
            }
          }
          activeSourcesRef.current.clear();
        }

        // Clear any queued audio from previous stream
        if (audioQueueRef.current.length > 0) {
          voiceLog.debug(
            `[TTAudioPlayback] Clearing ${audioQueueRef.current.length} queued chunks from previous stream`,
          );
          audioQueueRef.current = [];
          queuedBytesRef.current = 0;
        }

        // Increment stream ID for metrics/debug when a brand-new
        // stream starts (first chunk after reset()).
        currentStreamIdRef.current += 1;
        const streamId = currentStreamIdRef.current;

        // Ensure byte-based queue accounting starts fresh for the new stream.
        queuedBytesRef.current = 0;

        streamStartTimeRef.current = Date.now();
        streamEndedRef.current = false;
        playbackCompletedRef.current = false;
        // Reset interrupt callback guard for new stream
        interruptCallbackFiredRef.current = false;
        // Reset scheduling time for new stream to prevent stale future scheduling
        // This ensures audio plays immediately rather than minutes in the future
        nextScheduledTimeRef.current = 0;
        // Reset global chunk index for new stream
        streamChunkIndexRef.current = 0;
        // Reset barge-in state for new stream
        bargeInActiveRef.current = false;
        // Reset processing state
        isProcessingRef.current = false;
        voiceLog.debug("[TTAudioPlayback] Started new stream timing", {
          streamId,
        });

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
          // Binary Uint8Array - avoid copies when the view spans the full buffer.
          // (slice() allocates; on high-throughput streams that can cause choppy playback)
          if (
            audioData.byteOffset === 0 &&
            audioData.byteLength === audioData.buffer.byteLength
          ) {
            arrayBuffer = audioData.buffer as ArrayBuffer;
          } else {
            // slice returns ArrayBuffer | SharedArrayBuffer; we assert ArrayBuffer here.
            arrayBuffer = audioData.buffer.slice(
              audioData.byteOffset,
              audioData.byteOffset + audioData.byteLength,
            ) as ArrayBuffer;
          }
        } else {
          // Base64 string - decode
          arrayBuffer = base64ToArrayBuffer(audioData);
        }

        voiceLog.debug("[TTAudioPlayback] Converted to ArrayBuffer", {
          byteLength: arrayBuffer.byteLength,
        });
        if (playbackTraceEnabledRef.current) {
          console.log("[TTAudioPlayback] PUSHING chunk to queue", {
            byteLength: arrayBuffer.byteLength,
            queueLengthBefore: audioQueueRef.current.length,
          });
        }
        audioQueueRef.current.push(arrayBuffer);
        queuedBytesRef.current += arrayBuffer.byteLength;
        if (playbackTraceEnabledRef.current) {
          console.log("[TTAudioPlayback] PUSHED chunk to queue", {
            queueLengthAfter: audioQueueRef.current.length,
            queuedMs: Math.round(estimateQueueDurationMs()),
            enablePrebuffering,
            prebufferReady: prebufferReadyRef.current,
            isPlaying: isPlayingRef.current,
          });
        }

        // Update prebuffer count for UI feedback
        if (enablePrebuffering && !prebufferReadyRef.current) {
          setPrebufferCount(audioQueueRef.current.length);
        }

        // Check if we should start playback
        if (enablePrebuffering && !prebufferReadyRef.current) {
          if (playbackTraceEnabledRef.current) {
            console.log(
              "[TTAudioPlayback] PREBUFFERING MODE - waiting for threshold",
            );
          }
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
            if (playbackTraceEnabledRef.current) {
              console.log("[TTAudioPlayback] NORMAL MODE - starting playback", {
                isPlayingBefore: isPlayingRef.current,
                queueLength: audioQueueRef.current.length,
              });
            }
            voiceLog.debug(
              "[TTAudioPlayback] Starting playback (isPlaying was false)",
            );
            isPlayingRef.current = true;
            setPlaybackState("buffering");
            if (playbackTraceEnabledRef.current) {
              console.log("[TTAudioPlayback] Calling playNextChunk()");
            }
            playNextChunk();
          } else {
            if (playbackTraceEnabledRef.current) {
              console.log("[TTAudioPlayback] ALREADY PLAYING - chunk queued");
            }
            voiceLog.debug(
              "[TTAudioPlayback] Already playing, chunk queued for later processing",
            );
            // If playback is marked active but there are no scheduled sources,
            // kick the scheduler to avoid rare stall conditions (e.g. jittery
            // delivery where a chunk arrives after an onended check).
            if (
              activeSourcesRef.current.size === 0 &&
              !isProcessingRef.current
            ) {
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
    if (
      !bargeInActiveRef.current &&
      audioQueueRef.current.length === 0 &&
      activeSourcesRef.current.size === 0 &&
      !playbackCompletedRef.current
    ) {
      playbackCompletedRef.current = true;
      isPlayingRef.current = false;
      setPlaybackState("idle");
      if (playbackStartTimeRef.current) {
        const playedMs = Date.now() - playbackStartTimeRef.current;
        setTotalPlayedMs(playedMs);
        // Per-stream summary for debugging audio issues
        voiceLog.info("[TTAudioPlayback] Stream completed", {
          streamId: currentStreamIdRef.current,
          totalChunksReceived: audioHistoryRef.current.totalChunksReceived,
          totalChunksScheduled: audioHistoryRef.current.totalChunksScheduled,
          totalChunksDropped: audioHistoryRef.current.totalChunksDropped,
          peakActiveSources:
            audioHistoryRef.current.peakActiveSourcesCount,
          playedMs,
        });
      }
      onPlaybackEnd?.();
    }
  }, [onPlaybackEnd]);

  /**
   * Stop playback immediately (barge-in)
   */
  const stop = useCallback(() => {
    // CRITICAL FIX: Always stop audio sources even if bargeInActive is already true
    // This ensures audio stops completely even if there's a race condition or
    // the flag was set by a previous incomplete stop/fadeOut call.
    const wasAlreadyActive = bargeInActiveRef.current;

    // Set barge-in flag to drop any incoming audio chunks
    // This prevents stale audio from the cancelled response from playing
    bargeInActiveRef.current = true;

    const hasActiveAudio =
      isPlayingRef.current ||
      isProcessingRef.current ||
      audioQueueRef.current.length > 0 ||
      activeSourcesRef.current.size > 0;

    // If already active and no remaining audio, we're done
    if (wasAlreadyActive && !hasActiveAudio) {
      voiceLog.debug(
        "[TTAudioPlayback] Stop called with barge-in active and no remaining audio",
      );
      return;
    }

    // If no active audio at all, just ensure flag is set and return
    if (!hasActiveAudio) {
      voiceLog.debug(
        "[TTAudioPlayback] Stop called with no active audio, skipping",
      );
      return;
    }

    if (!bargeInStopLoggedRef.current) {
      voiceLog.debug("[TTAudioPlayback] Stopping playback (barge-in)");
      bargeInStopLoggedRef.current = true;
      // Track stop calls for E2E debugging (store in window for test inspection)
      if (typeof window !== "undefined") {
        const win = window as Window & { __audioStopStacks?: string[] };
        if (!win.__audioStopStacks) win.__audioStopStacks = [];
        win.__audioStopStacks.push(`${Date.now()}: barge-in stop`);
      }
    }

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
    queuedBytesRef.current = 0;

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

    // Only fire callback once per barge-in sequence
    // (prevents infinite loop when fadeOut calls this, then stop() is called again)
    if (!interruptCallbackFiredRef.current) {
      interruptCallbackFiredRef.current = true;
      onPlaybackInterrupted?.();
    }
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
      // CRITICAL FIX: Always stop audio sources even if bargeInActive is already true
      // The previous code would return early, leaving audio playing if the flag was
      // set by a previous incomplete barge-in or race condition.
      //
      // Now we track whether we've already fired callbacks to prevent infinite loops,
      // but we ALWAYS ensure audio sources are stopped.
      const wasAlreadyActive = bargeInActiveRef.current;

      // IMMEDIATELY set barge-in flag to drop any new incoming audio chunks
      // This prevents audio from being queued during the fade
      bargeInActiveRef.current = true;

      // If already active, still stop sources but skip callbacks and logging
      if (wasAlreadyActive) {
        const remainingSources = activeSourcesRef.current.size;
        const remainingQueue = audioQueueRef.current.length;
        voiceLog.debug(
          `[TTAudioPlayback] FadeOut called with barge-in already active, ensuring audio stops ` +
            `(${remainingSources} sources, ${remainingQueue} queued chunks)`,
        );
        console.log(
          `[BARGE-IN-DEBUG] FadeOut re-entry: stopping ${remainingSources} remaining sources, ` +
            `${remainingQueue} queued chunks`,
        );
        // Force-stop any remaining sources (the previous fadeOut may not have completed)
        for (const source of activeSourcesRef.current) {
          try {
            source.stop();
            source.disconnect();
          } catch {
            // Ignore errors from already-stopped sources
          }
        }
        activeSourcesRef.current.clear();
        audioQueueRef.current = [];
        queuedBytesRef.current = 0;
        isPlayingRef.current = false;
        isProcessingRef.current = false;
        nextScheduledTimeRef.current = 0;
        return;
      }

      // Log barge-in initiation with state details
      const activeSourceCount = activeSourcesRef.current.size;
      const queuedChunkCount = audioQueueRef.current.length;
      console.log(
        `[BARGE-IN-DEBUG] FadeOut starting: ${activeSourceCount} active sources, ` +
          `${queuedChunkCount} queued chunks, isPlaying=${isPlayingRef.current}`,
      );
      voiceLog.info(
        `[TTAudioPlayback] Barge-in fadeOut starting: ${activeSourceCount} sources, ` +
          `${queuedChunkCount} queued`,
      );

      // E2E Test Harness: Track when fade started (for barge-in latency measurement)
      timestampsRef.current.lastFadeStarted = performance.now();

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
      queuedBytesRef.current = 0;
      isPlayingRef.current = false;
      isProcessingRef.current = false;
      nextScheduledTimeRef.current = 0;

      // Cancel any scheduled gain changes and reset
      gainNode.gain.cancelScheduledValues(currentTime);
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, currentTime);
      gainNode.gain.linearRampToValueAtTime(0, fadeEndTime);

      // Notify of interruption (only once per barge-in sequence)
      if (!interruptCallbackFiredRef.current) {
        interruptCallbackFiredRef.current = true;
        onPlaybackInterrupted?.();
      }
      setPlaybackState("stopped");

      // Log completion with timing
      const fadeElapsed = performance.now() - timestampsRef.current.lastFadeStarted!;
      console.log(
        `[BARGE-IN-DEBUG] FadeOut complete: sources stopped in ${fadeElapsed.toFixed(1)}ms, ` +
          `gain ramping to 0 over ${durationMs}ms`,
      );
      voiceLog.info(
        `[TTAudioPlayback] Barge-in audio stopped in ${fadeElapsed.toFixed(1)}ms`,
      );

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

    // E2E Test Harness: Track reset timestamp
    timestampsRef.current.lastReset = performance.now();

    // Clear barge-in flag AFTER stop() - we're starting a new response
    // This allows new audio chunks to be queued for the new response
    bargeInActiveRef.current = false;
    bargeInStopLoggedRef.current = false;
    // NOTE: interruptCallbackFiredRef is NOT reset here - it's reset when the first
    // audio chunk of a new stream arrives in queueAudioChunk(). This prevents
    // infinite loops where reset() -> stop() -> callback -> re-render -> reset().

    streamStartTimeRef.current = null;
    firstChunkTimeRef.current = null;
    playbackStartTimeRef.current = null;
    streamEndedRef.current = false;
    playbackCompletedRef.current = false;
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

    // Reset queue overflow stats (Natural Conversation Flow: Phase 1)
    setQueueLength(0);
    setQueueDurationMs(0);
    setOverflowCount(0);
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
        queuedBytesRef.current = 0;
        cleanedResources.push(`audioQueue(${queueLength})`);
      }

      // 6. Clear watchdog interval
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
        cleanedResources.push("watchdog");
      }

      // 7. Reset refs
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

  // Scheduling watchdog (Natural Conversation Flow: Phase 1.3)
  // Periodically checks for stuck schedules and queue overflow
  useEffect(() => {
    watchdogIntervalRef.current = setInterval(() => {
      if (!isPlayingRef.current) return;

      // Update queue stats
      setQueueLength(audioQueueRef.current.length);
      setQueueDurationMs(estimateQueueDurationMs());

      // Check for queue overflow
      const currentDurationMs = estimateQueueDurationMs();
      if (currentDurationMs > MAX_QUEUE_DURATION_MS) {
        handleQueueOverflow("watchdog");
      }

      // Check for stuck schedule
      if (audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        const scheduledAhead = nextScheduledTimeRef.current - now;
        if (scheduledAhead > MAX_SCHEDULE_LOOKAHEAD_S * 2) {
          voiceLog.warn(
            `[TTAudioPlayback] Watchdog: schedule stuck ${scheduledAhead.toFixed(2)}s ahead, resetting`,
          );
          nextScheduledTimeRef.current = now + 0.01;
        }
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
    };
  }, [estimateQueueDurationMs, handleQueueOverflow]);

  // Debug state getter for E2E testing - reads directly from refs
  const getDebugState = useCallback(
    () => ({
      isPlayingRef: isPlayingRef.current,
      isProcessingRef: isProcessingRef.current,
      activeSourcesCount: activeSourcesRef.current.size,
      streamEndedRef: streamEndedRef.current,
      bargeInActiveRef: bargeInActiveRef.current,
      // Queue stats are maintained in React state and updated
      // by the watchdog; they are sufficient for debugging/tests.
      queueLength,
      queueDurationMs,
    }),
    [queueLength, queueDurationMs],
  );

  // Memoize return object to prevent unnecessary re-renders and useEffect cleanups
  // Without this, any useEffect depending on audioPlayback would cleanup on every render
  return useMemo(
    () => ({
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

      // Queue overflow stats (Natural Conversation Flow: Phase 1)
      queueLength,
      queueDurationMs,
      overflowCount,

      // E2E Test Harness: Historical metrics and timestamps
      // These are read from refs to provide accurate real-time values
      audioHistory: audioHistoryRef.current,
      timestamps: timestampsRef.current,

      // Actions
      queueAudioChunk,
      endStream,
      stop,
      fadeOut,
      setVolume,
      reset,
      warmup,
      getDebugState,
    }),
    [
      playbackState,
      volume,
      ttfaMs,
      totalPlayedMs,
      isPrebuffering,
      prebufferCount,
      prebufferChunks,
      queueLength,
      queueDurationMs,
      overflowCount,
      queueAudioChunk,
      endStream,
      stop,
      fadeOut,
      setVolume,
      reset,
      warmup,
      getDebugState,
    ],
  );
}

export default useTTAudioPlayback;
