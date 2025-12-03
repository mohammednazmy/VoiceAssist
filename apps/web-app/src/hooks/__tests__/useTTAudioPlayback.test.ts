/**
 * Tests for useTTAudioPlayback hook
 *
 * Tests audio playback functionality for the Thinker/Talker voice pipeline.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTTAudioPlayback } from "../useTTAudioPlayback";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock voiceLog
vi.mock("../../lib/logger", () => ({
  voiceLog: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Create mock AudioContext
class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  private started = false;
  private stopped = false;

  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
  start = vi.fn().mockImplementation(() => {
    this.started = true;
    // Simulate audio ending after a short delay
    setTimeout(() => {
      if (!this.stopped && this.onended) {
        this.onended();
      }
    }, 50);
  });
  stop = vi.fn().mockImplementation(() => {
    this.stopped = true;
  });
}

class MockGainNode {
  gain = { value: 1 };
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockAudioBuffer {
  numberOfChannels = 1;
  length: number;
  sampleRate: number;
  duration: number;
  private channelData: Float32Array;

  constructor(options: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
  }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channelData = new Float32Array(options.length);
  }

  getChannelData = vi.fn().mockImplementation(() => this.channelData);
  copyFromChannel = vi.fn();
  copyToChannel = vi.fn();
}

class MockAudioContext {
  state: "suspended" | "running" | "closed" = "running";
  sampleRate = 48000;
  currentTime = 0;
  destination = {};

  createBufferSource = vi
    .fn()
    .mockImplementation(() => new MockAudioBufferSourceNode());
  createGain = vi.fn().mockImplementation(() => new MockGainNode());
  createBuffer = vi
    .fn()
    .mockImplementation(
      (channels: number, length: number, sampleRate: number) =>
        new MockAudioBuffer({ numberOfChannels: channels, length, sampleRate }),
    );
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
}

// Store original globals
const originalAudioContext = globalThis.AudioContext;
const originalAtob = globalThis.atob;

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });

  // Mock AudioContext globally
  (
    globalThis as unknown as { AudioContext: typeof MockAudioContext }
  ).AudioContext = MockAudioContext as unknown as typeof AudioContext;

  // Mock atob for base64 decoding
  globalThis.atob = vi.fn().mockImplementation((_str: string) => {
    // Return mock binary data
    return String.fromCharCode(
      ...new Array(1000).fill(0).map((_, i) => i % 256),
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.AudioContext = originalAudioContext;
  globalThis.atob = originalAtob;
});

// ============================================================================
// Test Suites
// ============================================================================

describe("useTTAudioPlayback", () => {
  describe("Initial State", () => {
    it("should initialize with idle state", () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      expect(result.current.playbackState).toBe("idle");
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.volume).toBe(1);
      expect(result.current.ttfaMs).toBeNull();
      expect(result.current.totalPlayedMs).toBe(0);
    });

    it("should accept initial volume option", () => {
      const { result } = renderHook(() => useTTAudioPlayback({ volume: 0.5 }));

      expect(result.current.volume).toBe(0.5);
    });
  });

  describe("Volume Control", () => {
    it("should update volume", () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.setVolume(0.7);
      });

      expect(result.current.volume).toBe(0.7);
    });

    it("should clamp volume to 0-1 range", () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.setVolume(1.5);
      });
      expect(result.current.volume).toBe(1);

      act(() => {
        result.current.setVolume(-0.5);
      });
      expect(result.current.volume).toBe(0);
    });
  });

  describe("Audio Queueing", () => {
    it("should transition to buffering when first chunk is queued", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ="); // "Hello World" in base64
      });

      await waitFor(() => {
        expect(result.current.playbackState).toBe("buffering");
      });
    });

    it("should transition to playing after processing", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      // Advance timers to allow processing
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await waitFor(() => {
        expect(result.current.playbackState).toBe("playing");
      });
    });

    it("should call onPlaybackStart callback on first chunk", async () => {
      const onPlaybackStart = vi.fn();
      const { result } = renderHook(() =>
        useTTAudioPlayback({ onPlaybackStart }),
      );

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await waitFor(() => {
        expect(onPlaybackStart).toHaveBeenCalled();
      });
    });

    it("should track time to first audio (TTFA)", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await waitFor(() => {
        expect(result.current.ttfaMs).not.toBeNull();
        expect(typeof result.current.ttfaMs).toBe("number");
      });
    });
  });

  describe("Stop (Barge-in)", () => {
    it("should stop playback immediately", async () => {
      const onPlaybackInterrupted = vi.fn();
      const { result } = renderHook(() =>
        useTTAudioPlayback({ onPlaybackInterrupted }),
      );

      // Start playback
      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Stop playback
      act(() => {
        result.current.stop();
      });

      expect(result.current.playbackState).toBe("stopped");
      expect(result.current.isPlaying).toBe(false);
      expect(onPlaybackInterrupted).toHaveBeenCalled();
    });

    it("should clear audio queue on stop", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      // Queue multiple chunks
      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      // Stop should clear everything
      act(() => {
        result.current.stop();
      });

      expect(result.current.playbackState).toBe("stopped");
    });
  });

  describe("Stream End", () => {
    it("should handle endStream signal", async () => {
      const onPlaybackEnd = vi.fn();
      const { result } = renderHook(() =>
        useTTAudioPlayback({ onPlaybackEnd }),
      );

      // Start playback
      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Signal end of stream
      act(() => {
        result.current.endStream();
      });

      // Wait for audio to finish
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      await waitFor(
        () => {
          expect(result.current.playbackState).toBe("idle");
        },
        { timeout: 1000 },
      );
    });
  });

  describe("Reset", () => {
    it("should reset all state", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      // Start playback
      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.playbackState).toBe("idle");
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.ttfaMs).toBeNull();
      expect(result.current.totalPlayedMs).toBe(0);
    });
  });

  describe("Warmup", () => {
    it("should pre-warm AudioContext", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      await act(async () => {
        await result.current.warmup();
      });

      // Warmup should create AudioContext without errors
      expect(result.current.playbackState).toBe("idle");
    });
  });

  describe("Error Handling", () => {
    it("should call onError for decoding failures", async () => {
      const onError = vi.fn();

      // Make atob throw an error
      globalThis.atob = vi.fn().mockImplementation(() => {
        throw new Error("Invalid base64");
      });

      const { result } = renderHook(() => useTTAudioPlayback({ onError }));

      act(() => {
        result.current.queueAudioChunk("invalid-base64!!!");
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe("Cleanup", () => {
    it("should cleanup resources on unmount", async () => {
      const { result, unmount } = renderHook(() => useTTAudioPlayback());

      // Start playback
      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Unmount should cleanup without errors
      unmount();

      // No assertions needed - just verify no errors thrown
    });
  });

  describe("isPlaying computed property", () => {
    it("should return true when buffering", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      // During buffering
      expect(result.current.isPlaying).toBe(true);
    });

    it("should return true when playing", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await waitFor(() => {
        expect(result.current.playbackState).toBe("playing");
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it("should return false when idle", () => {
      const { result } = renderHook(() => useTTAudioPlayback());
      expect(result.current.isPlaying).toBe(false);
    });

    it("should return false when stopped", async () => {
      const { result } = renderHook(() => useTTAudioPlayback());

      act(() => {
        result.current.queueAudioChunk("SGVsbG8gV29ybGQ=");
      });

      act(() => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
    });
  });
});
