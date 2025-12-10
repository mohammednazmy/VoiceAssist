/**
 * Streaming Audio Playback Hook
 *
 * Enables low-latency TTS audio playback by playing audio chunks as they arrive.
 * Uses the MediaSource API to append audio chunks progressively, allowing
 * playback to start before the full audio is downloaded.
 *
 * Phase 2: Streaming TTS Implementation
 * - Expected TTFA (Time To First Audio): 100-200ms with ElevenLabs
 * - Falls back to standard playback if streaming isn't supported
 */

import { useCallback, useRef, useState } from "react";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface StreamingAudioState {
  isStreaming: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  error: Error | null;
  ttfbMs: number | null; // Time to first byte from server
  ttfaMs: number | null; // Time to first audio playback
  bytesReceived: number;
  totalDuration: number;
}

export interface StreamingAudioOptions {
  /** Called when streaming starts */
  onStreamStart?: () => void;
  /** Called when first audio chunk starts playing */
  onFirstAudio?: (ttfaMs: number) => void;
  /** Called when playback ends */
  onEnd?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Volume (0-1) */
  volume?: number;
  /** Playback rate */
  playbackRate?: number;
}

export interface StreamingAudioReturn {
  state: StreamingAudioState;
  /** Play audio from a streaming Response */
  playStream: (response: Response) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Check if MediaSource streaming is supported */
  isSupported: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if MediaSource API is available and supports audio/mpeg
 */
function checkMediaSourceSupport(): boolean {
  if (typeof MediaSource === "undefined") {
    return false;
  }
  return MediaSource.isTypeSupported("audio/mpeg");
}

/**
 * Helper to wait for SourceBuffer to finish updating
 */
function waitForSourceBuffer(sourceBuffer: SourceBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!sourceBuffer.updating) {
      resolve();
      return;
    }

    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      resolve();
    };

    const onError = () => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      reject(new Error("SourceBuffer error"));
    };

    sourceBuffer.addEventListener("updateend", onUpdateEnd);
    sourceBuffer.addEventListener("error", onError);
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useStreamingAudio(
  options: StreamingAudioOptions = {},
): StreamingAudioReturn {
  const {
    onStreamStart,
    onFirstAudio,
    onEnd,
    onError,
    volume = 1,
    playbackRate = 1,
  } = options;

  // State
  const [state, setState] = useState<StreamingAudioState>({
    isStreaming: false,
    isPlaying: false,
    isBuffering: false,
    error: null,
    ttfbMs: null,
    ttfaMs: null,
    bytesReceived: 0,
    totalDuration: 0,
  });

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  // Check support
  const isSupported = checkMediaSourceSupport();

  /**
   * Stop current playback and clean up resources
   */
  const stop = useCallback(() => {
    voiceLog.debug("[StreamingAudio] Stopping playback");

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    // Clean up MediaSource
    if (mediaSourceRef.current) {
      if (mediaSourceRef.current.readyState === "open") {
        try {
          mediaSourceRef.current.endOfStream();
        } catch {
          // Ignore errors during cleanup
        }
      }
      mediaSourceRef.current = null;
    }

    sourceBufferRef.current = null;
    isStreamingRef.current = false;

    setState({
      isStreaming: false,
      isPlaying: false,
      isBuffering: false,
      error: null,
      ttfbMs: null,
      ttfaMs: null,
      bytesReceived: 0,
      totalDuration: 0,
    });
  }, []);

  /**
   * Play audio from a streaming Response
   * Uses MediaSource API for progressive playback
   */
  const playStream = useCallback(
    async (response: Response): Promise<void> => {
      // Stop any existing playback
      stop();

      if (!response.body) {
        const error = new Error("Response has no body");
        setState((s) => ({ ...s, error }));
        onError?.(error);
        return;
      }

      if (!isSupported) {
        voiceLog.warn(
          "[StreamingAudio] MediaSource not supported, falling back to blob",
        );
        // Fallback: collect all chunks into a blob and play
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = volume;
        audio.playbackRate = playbackRate;
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setState((s) => ({ ...s, isPlaying: false, isStreaming: false }));
          onEnd?.();
        };

        await audio.play();
        setState((s) => ({ ...s, isPlaying: true, isStreaming: true }));
        return;
      }

      const startTime = performance.now();
      let firstChunkTime: number | null = null;
      let firstAudioTime: number | null = null;
      let bytesReceived = 0;

      isStreamingRef.current = true;
      abortControllerRef.current = new AbortController();

      voiceLog.debug("[StreamingAudio] Starting streaming playback");
      setState((s) => ({
        ...s,
        isStreaming: true,
        isBuffering: true,
        error: null,
      }));
      onStreamStart?.();

      try {
        // Create MediaSource
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;

        // Create audio element
        const audio = new Audio();
        audio.volume = volume;
        audio.playbackRate = playbackRate;
        audio.src = URL.createObjectURL(mediaSource);
        audioRef.current = audio;

        // Wait for MediaSource to open
        await new Promise<void>((resolve, reject) => {
          mediaSource.addEventListener("sourceopen", () => resolve(), {
            once: true,
          });
          mediaSource.addEventListener(
            "error",
            () => reject(new Error("MediaSource error")),
            {
              once: true,
            },
          );
        });

        // Add SourceBuffer for MP3
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        sourceBufferRef.current = sourceBuffer;

        // Set up audio event handlers
        audio.onended = () => {
          voiceLog.debug("[StreamingAudio] Playback ended");
          setState((s) => ({
            ...s,
            isPlaying: false,
            isStreaming: false,
            totalDuration: audio.duration || 0,
          }));
          onEnd?.();
        };

        audio.onerror = () => {
          const error = new Error("Audio playback error");
          setState((s) => ({ ...s, error, isPlaying: false }));
          onError?.(error);
        };

        // Read the stream
        const reader = response.body.getReader();
        let hasStartedPlaying = false;

        while (isStreamingRef.current) {
          const { done, value } = await reader.read();

          if (done) {
            voiceLog.debug("[StreamingAudio] Stream complete");
            break;
          }

          // Track TTFB
          if (firstChunkTime === null) {
            firstChunkTime = performance.now();
            const ttfbMs = Math.round(firstChunkTime - startTime);
            voiceLog.debug(`[StreamingAudio] TTFB: ${ttfbMs}ms`);
            setState((s) => ({ ...s, ttfbMs }));
          }

          bytesReceived += value.length;

          // Wait for any pending updates
          await waitForSourceBuffer(sourceBuffer);

          // Append chunk to buffer
          if (mediaSource.readyState === "open") {
            sourceBuffer.appendBuffer(value);
            await waitForSourceBuffer(sourceBuffer);
          }

          // Start playback after buffering enough data (first chunk + ~100ms buffer)
          if (!hasStartedPlaying && sourceBuffer.buffered.length > 0) {
            const bufferedDuration = sourceBuffer.buffered.end(0);

            // Start playing once we have at least 0.1 seconds buffered
            if (bufferedDuration >= 0.1) {
              hasStartedPlaying = true;

              try {
                await audio.play();
                firstAudioTime = performance.now();
                const ttfaMs = Math.round(firstAudioTime - startTime);

                voiceLog.info(`[StreamingAudio] TTFA: ${ttfaMs}ms`);
                setState((s) => ({
                  ...s,
                  isPlaying: true,
                  isBuffering: false,
                  ttfaMs,
                  bytesReceived,
                }));
                onFirstAudio?.(ttfaMs);
              } catch (playError) {
                voiceLog.error(
                  "[StreamingAudio] Failed to start playback:",
                  playError,
                );
                // Continue buffering, might work later
              }
            }
          }

          setState((s) => ({ ...s, bytesReceived }));
        }

        // End the stream
        if (mediaSource.readyState === "open") {
          await waitForSourceBuffer(sourceBuffer);
          mediaSource.endOfStream();
        }

        // If playback hasn't started yet (very short audio), start it now
        if (!hasStartedPlaying && sourceBuffer.buffered.length > 0) {
          try {
            await audio.play();
            firstAudioTime = performance.now();
            const ttfaMs = Math.round(firstAudioTime - startTime);

            voiceLog.info(`[StreamingAudio] TTFA (late start): ${ttfaMs}ms`);
            setState((s) => ({
              ...s,
              isPlaying: true,
              isBuffering: false,
              ttfaMs,
            }));
            onFirstAudio?.(ttfaMs);
          } catch (playError) {
            voiceLog.error(
              "[StreamingAudio] Failed to start playback:",
              playError,
            );
            onError?.(
              playError instanceof Error
                ? playError
                : new Error(String(playError)),
            );
          }
        }

        voiceLog.debug(
          `[StreamingAudio] Streaming complete. Total bytes: ${bytesReceived}`,
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          voiceLog.debug("[StreamingAudio] Streaming aborted");
          return;
        }

        voiceLog.error("[StreamingAudio] Streaming error:", err);
        const error = err instanceof Error ? err : new Error(String(err));
        setState((s) => ({
          ...s,
          error,
          isStreaming: false,
          isPlaying: false,
        }));
        onError?.(error);
      }
    },
    [
      isSupported,
      volume,
      playbackRate,
      stop,
      onStreamStart,
      onFirstAudio,
      onEnd,
      onError,
    ],
  );

  return {
    state,
    playStream,
    stop,
    isSupported,
  };
}

export default useStreamingAudio;
