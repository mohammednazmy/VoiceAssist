/**
 * Audio Playback Hook
 *
 * Manages TTS audio playback for the unified chat/voice interface.
 * Supports:
 * - Manual playback controls (play/pause/stop)
 * - Auto-play in voice mode
 * - Playback queue for sequential messages
 * - Progress tracking
 * - Barge-in (stop on new user input)
 *
 * Phase 11: Pre-warming optimizations
 * - prewarmPlayback(): Pre-create audio element and warm up audio pipeline
 * - Expected latency improvement: 50-150ms on first playback
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useVoiceSettingsStore } from "../stores/voiceSettingsStore";
import {
  useUnifiedConversationStore,
  type PlaybackState,
} from "../stores/unifiedConversationStore";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface AudioItem {
  id: string;
  audioUrl: string;
  messageId?: string;
  duration?: number;
}

export interface AudioPlaybackOptions {
  autoPlayInVoiceMode?: boolean;
  onPlaybackStart?: (item: AudioItem) => void;
  onPlaybackEnd?: (item: AudioItem) => void;
  onPlaybackError?: (error: Error, item: AudioItem) => void;
}

export interface AudioPlaybackReturn {
  // State
  playbackState: PlaybackState;
  currentItem: AudioItem | null;
  currentTime: number;
  duration: number;
  progress: number;
  volume: number;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isPrewarmed: boolean;

  // Queue
  queue: AudioItem[];
  queueLength: number;

  // Actions
  play: (item?: AudioItem) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seek: (time: number) => void;
  enqueue: (item: AudioItem) => void;
  clearQueue: () => void;
  skipCurrent: () => void;

  // Auto-play
  enableAutoPlay: () => void;
  disableAutoPlay: () => void;

  // Phase 11: Pre-warming
  prewarmPlayback: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useAudioPlayback(
  options: AudioPlaybackOptions = {},
): AudioPlaybackReturn {
  const { onPlaybackStart, onPlaybackEnd, onPlaybackError } = options;

  // Store state
  const { voiceModeActive, playbackState, setPlaybackState, setIsSpeaking } =
    useUnifiedConversationStore();
  const { autoPlayInVoiceMode, playbackSpeed, setAutoPlayInVoiceMode } =
    useVoiceSettingsStore();

  // Local state
  const [currentItem, setCurrentItem] = useState<AudioItem | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [queue, setQueue] = useState<AudioItem[]>([]);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  // Phase 11: Pre-warming state
  const [isPrewarmed, setIsPrewarmed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Derived state
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isPlaying = playbackState === "playing";
  const isPaused = playbackState === "paused";
  const isStopped = playbackState === "idle";

  // Initialize audio element
  const getAudioElement = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
    return audioRef.current;
  }, []);

  // Clean up time update interval
  const cleanupTimeUpdate = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  // Start time tracking
  const startTimeTracking = useCallback(() => {
    cleanupTimeUpdate();
    timeUpdateIntervalRef.current = setInterval(() => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration || 0);
      }
    }, 100);
  }, [cleanupTimeUpdate]);

  // Play next item in queue
  const playNext = useCallback(() => {
    if (queue.length === 0) {
      voiceLog.debug("[AudioPlayback] Queue empty, stopping");
      setPlaybackState("idle");
      setCurrentItem(null);
      setIsSpeaking(false);
      return;
    }

    const nextItem = queue[0];
    setQueue((prev) => prev.slice(1));

    voiceLog.debug("[AudioPlayback] Playing next item:", nextItem.id);

    const audio = getAudioElement();
    audio.src = nextItem.audioUrl;
    audio.playbackRate = playbackSpeed;
    audio.volume = volume;

    setCurrentItem(nextItem);
    setPlaybackState("loading");

    audio
      .play()
      .then(() => {
        setPlaybackState("playing");
        setIsSpeaking(true);
        startTimeTracking();
        onPlaybackStart?.(nextItem);
      })
      .catch((err) => {
        voiceLog.error("[AudioPlayback] Play failed:", err);
        setPlaybackState("error");
        onPlaybackError?.(err, nextItem);
        // Try next item after error
        playNext();
      });
  }, [
    queue,
    getAudioElement,
    playbackSpeed,
    volume,
    setPlaybackState,
    setIsSpeaking,
    startTimeTracking,
    onPlaybackStart,
    onPlaybackError,
  ]);

  // Play specific item or start queue
  const play = useCallback(
    (item?: AudioItem) => {
      if (item) {
        voiceLog.debug("[AudioPlayback] Playing item:", item.id);

        const audio = getAudioElement();
        audio.src = item.audioUrl;
        audio.playbackRate = playbackSpeed;
        audio.volume = volume;

        setCurrentItem(item);
        setPlaybackState("loading");

        audio
          .play()
          .then(() => {
            setPlaybackState("playing");
            setIsSpeaking(true);
            startTimeTracking();
            onPlaybackStart?.(item);
          })
          .catch((err) => {
            voiceLog.error("[AudioPlayback] Play failed:", err);
            setPlaybackState("error");
            onPlaybackError?.(err, item);
          });
      } else {
        // Start playing from queue
        playNext();
      }
    },
    [
      getAudioElement,
      playbackSpeed,
      volume,
      setPlaybackState,
      setIsSpeaking,
      startTimeTracking,
      onPlaybackStart,
      onPlaybackError,
      playNext,
    ],
  );

  // Pause playback
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && playbackState === "playing") {
      voiceLog.debug("[AudioPlayback] Pausing");
      audio.pause();
      setPlaybackState("paused");
      cleanupTimeUpdate();
    }
  }, [playbackState, setPlaybackState, cleanupTimeUpdate]);

  // Resume playback
  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (audio && playbackState === "paused") {
      voiceLog.debug("[AudioPlayback] Resuming");
      audio
        .play()
        .then(() => {
          setPlaybackState("playing");
          startTimeTracking();
        })
        .catch((err) => {
          voiceLog.error("[AudioPlayback] Resume failed:", err);
          setPlaybackState("error");
        });
    }
  }, [playbackState, setPlaybackState, startTimeTracking]);

  // Stop playback
  const stop = useCallback(() => {
    const audio = audioRef.current;
    voiceLog.debug("[AudioPlayback] Stopping");

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    cleanupTimeUpdate();
    setPlaybackState("idle");
    setCurrentItem(null);
    setCurrentTime(0);
    setDuration(0);
    setIsSpeaking(false);

    if (currentItem) {
      onPlaybackEnd?.(currentItem);
    }
  }, [
    cleanupTimeUpdate,
    setPlaybackState,
    setIsSpeaking,
    currentItem,
    onPlaybackEnd,
  ]);

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, []);

  // Seek to time
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      const clampedTime = Math.max(0, Math.min(time, audio.duration));
      audio.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    }
  }, []);

  // Add item to queue
  const enqueue = useCallback(
    (item: AudioItem) => {
      voiceLog.debug("[AudioPlayback] Enqueueing item:", item.id);
      setQueue((prev) => [...prev, item]);

      // Auto-play if in voice mode and not currently playing
      if (voiceModeActive && autoPlayInVoiceMode && playbackState === "idle") {
        // Slight delay to batch multiple enqueues
        setTimeout(() => {
          play(item);
        }, 100);
      }
    },
    [voiceModeActive, autoPlayInVoiceMode, playbackState, play],
  );

  // Clear queue
  const clearQueue = useCallback(() => {
    voiceLog.debug("[AudioPlayback] Clearing queue");
    setQueue([]);
  }, []);

  // Skip current item
  const skipCurrent = useCallback(() => {
    voiceLog.debug("[AudioPlayback] Skipping current item");
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    cleanupTimeUpdate();

    if (currentItem) {
      onPlaybackEnd?.(currentItem);
    }

    // Play next in queue
    playNext();
  }, [cleanupTimeUpdate, currentItem, onPlaybackEnd, playNext]);

  // Auto-play controls
  const enableAutoPlay = useCallback(() => {
    setAutoPlayInVoiceMode(true);
  }, [setAutoPlayInVoiceMode]);

  const disableAutoPlay = useCallback(() => {
    setAutoPlayInVoiceMode(false);
  }, [setAutoPlayInVoiceMode]);

  /**
   * Phase 11: Pre-warm audio playback pipeline
   * Call this on page load or before first playback to reduce latency.
   * Creates audio element early and warms up AudioContext for faster playback start.
   * Expected latency improvement: 50-150ms on first playback.
   */
  const prewarmPlayback = useCallback(() => {
    if (isPrewarmed) {
      voiceLog.debug("[AudioPlayback] Already prewarmed");
      return;
    }

    voiceLog.debug("[AudioPlayback] Pre-warming audio playback...");

    try {
      // Step 1: Pre-create audio element
      const audio = getAudioElement();
      audio.preload = "auto";
      audio.volume = volume;

      // Step 2: Create and warm up AudioContext
      // Modern browsers require user interaction to start AudioContext,
      // but creating it early helps reduce latency once interaction happens
      if (!audioContextRef.current) {
        // Use AudioContext for potential future enhancements (effects, visualization)
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;

        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();

          // If context is suspended, it will resume on first user interaction
          if (audioContextRef.current.state === "suspended") {
            voiceLog.debug(
              "[AudioPlayback] AudioContext suspended, will resume on interaction",
            );
          }
        }
      }

      // Step 3: Attempt to resume AudioContext (may fail without user interaction)
      if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        audioContextRef.current.resume().catch(() => {
          // Expected to fail without user interaction, that's ok
          voiceLog.debug(
            "[AudioPlayback] AudioContext resume deferred until user interaction",
          );
        });
      }

      // Step 4: Load a silent audio data URL to warm up the audio pipeline
      // This triggers browser audio initialization without actual playback
      const silentWavUrl =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      const warmupAudio = new Audio(silentWavUrl);
      warmupAudio.volume = 0;
      warmupAudio.load();

      setIsPrewarmed(true);
      voiceLog.debug("[AudioPlayback] Pre-warming complete");
    } catch (err) {
      voiceLog.warn(
        `[AudioPlayback] Pre-warming failed (non-fatal): ${err instanceof Error ? err.message : "Unknown"}`,
      );
      // Pre-warming failure is non-fatal, playback will still work
    }
  }, [isPrewarmed, getAudioElement, volume]);

  // Handle audio ended event
  useEffect(() => {
    const audio = getAudioElement();

    const handleEnded = () => {
      voiceLog.debug("[AudioPlayback] Playback ended");
      cleanupTimeUpdate();

      if (currentItem) {
        onPlaybackEnd?.(currentItem);
      }

      // Play next in queue
      playNext();
    };

    const handleError = (event: Event) => {
      voiceLog.error("[AudioPlayback] Audio error:", event);
      setPlaybackState("error");
      if (currentItem) {
        onPlaybackError?.(new Error("Audio playback error"), currentItem);
      }
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [
    getAudioElement,
    cleanupTimeUpdate,
    currentItem,
    onPlaybackEnd,
    onPlaybackError,
    playNext,
    setPlaybackState,
  ]);

  // Update playback rate when speech rate changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Stop playback when voice mode deactivates
  useEffect(() => {
    if (!voiceModeActive && playbackState !== "idle") {
      stop();
      clearQueue();
    }
  }, [voiceModeActive, playbackState, stop, clearQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimeUpdate();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Phase 11: Clean up AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore close errors on cleanup
        });
        audioContextRef.current = null;
      }
    };
  }, [cleanupTimeUpdate]);

  return {
    // State
    playbackState,
    currentItem,
    currentTime,
    duration,
    progress,
    volume,
    isPlaying,
    isPaused,
    isStopped,
    isPrewarmed,

    // Queue
    queue,
    queueLength: queue.length,

    // Actions
    play,
    pause,
    resume,
    stop,
    setVolume,
    seek,
    enqueue,
    clearQueue,
    skipCurrent,

    // Auto-play
    enableAutoPlay,
    disableAutoPlay,

    // Phase 11: Pre-warming
    // Call prewarmPlayback() on page load to reduce first playback latency by ~50-150ms
    prewarmPlayback,
  };
}

export default useAudioPlayback;
