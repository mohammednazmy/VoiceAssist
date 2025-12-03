/**
 * Tests for AudioPlayer component
 *
 * Tests the audio player that plays synthesized speech with controls.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioPlayer } from "../AudioPlayer";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Audio element
class MockAudio {
  private _src = "";
  private _currentTime = 0;
  private _duration = 0;
  private _paused = true;
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    // Simulate loadedmetadata after setting src
    setTimeout(() => {
      this._duration = 10; // 10 second audio
      this.dispatchEvent("loadedmetadata");
    }, 10);
  }

  get currentTime() {
    return this._currentTime;
  }
  set currentTime(value: number) {
    this._currentTime = value;
    this.dispatchEvent("timeupdate");
  }

  get duration() {
    return this._duration;
  }

  get paused() {
    return this._paused;
  }

  play = vi.fn().mockImplementation(() => {
    this._paused = false;
    this.dispatchEvent("play");
    return Promise.resolve();
  });

  pause = vi.fn().mockImplementation(() => {
    this._paused = true;
    this.dispatchEvent("pause");
  });

  addEventListener = vi
    .fn()
    .mockImplementation((event: string, cb: EventListener) => {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, new Set());
      }
      this.eventListeners.get(event)!.add(cb);
    });

  removeEventListener = vi
    .fn()
    .mockImplementation((event: string, cb: EventListener) => {
      this.eventListeners.get(event)?.delete(cb);
    });

  dispatchEvent(event: string) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => cb(new Event(event)));
    }
  }

  // Helper to simulate playback ending
  simulateEnded() {
    this._paused = true;
    this._currentTime = 0;
    this.dispatchEvent("ended");
  }
}

// Store original globals
const originalAudio = globalThis.Audio;
const originalURL = globalThis.URL;

let mockAudio: MockAudio;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });

  mockAudio = new MockAudio();

  // Mock Audio constructor
  (globalThis as unknown as { Audio: typeof Audio }).Audio = vi
    .fn()
    .mockImplementation(() => mockAudio);

  // Mock URL.createObjectURL and revokeObjectURL
  (
    globalThis.URL as unknown as { createObjectURL: typeof URL.createObjectURL }
  ).createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
  (
    globalThis.URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }
  ).revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.Audio = originalAudio;
  globalThis.URL = originalURL;
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockBlob(): Blob {
  return new Blob(["mock audio data"], { type: "audio/mpeg" });
}

// ============================================================================
// Test Suites
// ============================================================================

describe("AudioPlayer", () => {
  describe("Rendering", () => {
    it("should render nothing when audioBlob is null", () => {
      const { container } = render(<AudioPlayer audioBlob={null} />);

      expect(container.firstChild).toBeNull();
    });

    it("should render the player when audioBlob is provided", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("should create object URL from blob", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });
  });

  describe("Playback Controls", () => {
    it("should show play button when not playing", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("should toggle to pause button when playing", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      const playButton = screen.getByRole("button", { name: "Play" });
      fireEvent.click(playButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Pause" }),
        ).toBeInTheDocument();
      });
    });

    it("should call audio.play() when clicking play", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      fireEvent.click(screen.getByRole("button", { name: "Play" }));

      await waitFor(() => {
        expect(mockAudio.play).toHaveBeenCalled();
      });
    });

    it("should call audio.pause() when clicking pause", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      // Start playing
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Pause" }),
        ).toBeInTheDocument();
      });

      // Pause
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(mockAudio.pause).toHaveBeenCalled();
    });
  });

  describe("AutoPlay", () => {
    it("should auto-play when autoPlay is true", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} autoPlay />);

      // Wait for blob to be processed
      await vi.advanceTimersByTimeAsync(50);

      await waitFor(() => {
        expect(mockAudio.play).toHaveBeenCalled();
      });
    });

    it("should not auto-play when autoPlay is false", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} autoPlay={false} />);

      await vi.advanceTimersByTimeAsync(50);

      expect(mockAudio.play).not.toHaveBeenCalled();
    });
  });

  describe("Progress Slider", () => {
    it("should render progress slider", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-label", "Audio progress");
    });

    it("should update current time when seeking", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      // Wait for metadata
      await vi.advanceTimersByTimeAsync(50);

      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "5" } });

      expect(mockAudio.currentTime).toBe(5);
    });

    it("should display formatted time", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      // Wait for metadata to load (sets duration to 10)
      await vi.advanceTimersByTimeAsync(50);

      await waitFor(() => {
        // Should show 0:00 / 0:10 (10 seconds)
        expect(screen.getByText("0:00")).toBeInTheDocument();
        expect(screen.getByText("0:10")).toBeInTheDocument();
      });
    });
  });

  describe("Playback End Callback", () => {
    it("should call onPlaybackEnd when audio ends", async () => {
      const onPlaybackEnd = vi.fn();
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} onPlaybackEnd={onPlaybackEnd} />);

      // Wait for audio setup
      await vi.advanceTimersByTimeAsync(50);

      // Simulate audio ending
      mockAudio.simulateEnded();

      expect(onPlaybackEnd).toHaveBeenCalled();
    });
  });

  describe("Cleanup", () => {
    it("should revoke object URL on unmount", () => {
      const blob = createMockBlob();
      const { unmount } = render(<AudioPlayer audioBlob={blob} />);

      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("should pause audio on unmount", () => {
      const blob = createMockBlob();
      const { unmount } = render(<AudioPlayer audioBlob={blob} />);

      unmount();

      expect(mockAudio.pause).toHaveBeenCalled();
    });

    it("should revoke previous URL when blob changes", async () => {
      const blob1 = createMockBlob();
      const blob2 = createMockBlob();

      const { rerender } = render(<AudioPlayer audioBlob={blob1} />);

      // Wait for first blob to be set up
      await vi.advanceTimersByTimeAsync(50);

      // Change blob
      rerender(<AudioPlayer audioBlob={blob2} />);

      // Previous URL should be revoked
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("should clean up when audioBlob becomes null", async () => {
      const blob = createMockBlob();
      const { rerender } = render(<AudioPlayer audioBlob={blob} />);

      // Wait for setup
      await vi.advanceTimersByTimeAsync(50);

      // Set blob to null
      rerender(<AudioPlayer audioBlob={null} />);

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle play rejection gracefully", async () => {
      mockAudio.play = vi
        .fn()
        .mockRejectedValueOnce(new Error("Autoplay blocked"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      fireEvent.click(screen.getByRole("button", { name: "Play" }));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Playback failed:",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });

    it("should handle autoplay rejection gracefully", async () => {
      mockAudio.play = vi
        .fn()
        .mockRejectedValueOnce(new Error("Autoplay blocked"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} autoPlay />);

      await vi.advanceTimersByTimeAsync(50);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Autoplay failed:",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on play button", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label");
    });

    it("should have aria-label on progress slider", () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-label", "Audio progress");
    });

    it("should update button aria-label based on state", async () => {
      const blob = createMockBlob();
      render(<AudioPlayer audioBlob={blob} />);

      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Play");

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => {
        expect(screen.getByRole("button")).toHaveAttribute(
          "aria-label",
          "Pause",
        );
      });
    });
  });
});
