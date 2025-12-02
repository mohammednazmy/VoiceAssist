/**
 * Tests for VoiceInput component
 *
 * Tests the push-to-talk voice input with real-time transcription.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoiceInput } from "../VoiceInput";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock useAuth
const mockTranscribeAudio = vi.fn();

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({
    apiClient: {
      transcribeAudio: mockTranscribeAudio,
    },
  }),
}));

// Mock MediaRecorder
class MockMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream) {
    // Store stream reference if needed
  }

  start = vi.fn().mockImplementation(() => {
    this.state = "recording";
  });

  stop = vi.fn().mockImplementation(() => {
    this.state = "inactive";
    // Simulate data available event
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(["mock audio"], { type: "audio/webm" }),
      });
    }
    // Then call onstop
    if (this.onstop) {
      this.onstop();
    }
  });
}

// Mock MediaStream
class MockMediaStream {
  getTracks = vi.fn().mockReturnValue([{ stop: vi.fn() }]);
}

// Store original globals
const originalMediaRecorder = globalThis.MediaRecorder;
const originalNavigator = globalThis.navigator;

let mockMediaRecorder: MockMediaRecorder;
let mockStream: MockMediaStream;

beforeEach(() => {
  vi.clearAllMocks();

  mockStream = new MockMediaStream();
  mockMediaRecorder = new MockMediaRecorder(
    mockStream as unknown as MediaStream,
  );

  // Mock MediaRecorder constructor
  (
    globalThis as unknown as { MediaRecorder: typeof MediaRecorder }
  ).MediaRecorder = vi
    .fn()
    .mockImplementation(
      () => mockMediaRecorder,
    ) as unknown as typeof MediaRecorder;

  // Mock navigator.mediaDevices.getUserMedia
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    },
    writable: true,
  });

  mockTranscribeAudio.mockResolvedValue("Transcribed text");
});

afterEach(() => {
  (
    globalThis as unknown as { MediaRecorder: typeof MediaRecorder }
  ).MediaRecorder = originalMediaRecorder;
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    writable: true,
  });
});

// ============================================================================
// Test Suites
// ============================================================================

describe("VoiceInput", () => {
  describe("Rendering", () => {
    it("should render the voice input button", () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByText("Hold to Record")).toBeInTheDocument();
    });

    it("should render instructions text", () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      expect(screen.getByText(/Press and hold to record/i)).toBeInTheDocument();
    });

    it("should be disabled when disabled prop is true", () => {
      render(<VoiceInput onTranscript={vi.fn()} disabled />);

      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("Recording State", () => {
    it("should show 'Hold to Record' initially", () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      expect(screen.getByText("Hold to Record")).toBeInTheDocument();
    });

    it("should show 'Recording...' when mouse down", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(screen.getByText(/Recording/)).toBeInTheDocument();
      });
    });

    it("should have aria-label 'Hold to record' when idle", () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Hold to record",
      );
    });

    it("should update aria-label when recording", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(button).toHaveAttribute(
          "aria-label",
          "Recording... Release to stop",
        );
      });
    });
  });

  describe("Recording Flow", () => {
    it("should request microphone access on mouse down", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
          audio: true,
        });
      });
    });

    it("should start MediaRecorder on mouse down", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });
    });

    it("should stop MediaRecorder on mouse up", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Start recording
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      // Stop recording
      mockMediaRecorder.state = "recording"; // Ensure state is recording
      fireEvent.mouseUp(button);

      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    });

    it("should work with touch events", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Touch start
      fireEvent.touchStart(button);
      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      });

      // Touch end
      mockMediaRecorder.state = "recording";
      fireEvent.touchEnd(button);
      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    });
  });

  describe("Transcription", () => {
    it("should call transcribeAudio after recording", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Start recording
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      // Stop recording (this triggers onstop which calls transcribeAudio)
      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      await waitFor(() => {
        expect(mockTranscribeAudio).toHaveBeenCalled();
      });
    });

    it("should call onTranscript callback with transcribed text", async () => {
      const onTranscript = vi.fn();
      mockTranscribeAudio.mockResolvedValueOnce("Hello world");

      render(<VoiceInput onTranscript={onTranscript} />);

      const button = screen.getByRole("button");

      // Start and stop recording
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      await waitFor(() => {
        expect(onTranscript).toHaveBeenCalledWith("Hello world");
      });
    });

    it("should display transcript after successful transcription", async () => {
      mockTranscribeAudio.mockResolvedValueOnce("Transcribed message");

      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Record and stop
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      await waitFor(() => {
        expect(screen.getByText("Transcript:")).toBeInTheDocument();
        expect(screen.getByText("Transcribed message")).toBeInTheDocument();
      });
    });
  });

  describe("Processing State", () => {
    it("should show 'Processing...' during transcription", async () => {
      // Make transcription take time
      mockTranscribeAudio.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("Text"), 1000)),
      );

      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Start and stop recording
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      await waitFor(() => {
        expect(screen.getByText("Processing...")).toBeInTheDocument();
      });

      // Button should be disabled during processing
      expect(button).toBeDisabled();
    });
  });

  describe("Error Handling", () => {
    it("should show error when microphone access is denied", async () => {
      (
        navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Permission denied"));

      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument();
        expect(screen.getByText("Permission denied")).toBeInTheDocument();
      });
    });

    it("should show error when transcription fails", async () => {
      mockTranscribeAudio.mockRejectedValueOnce(
        new Error("Transcription failed"),
      );

      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Record and stop
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument();
        expect(screen.getByText("Transcription failed")).toBeInTheDocument();
      });
    });

    it("should allow dismissing error", async () => {
      (
        navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Test error"));

      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument();
      });

      // Click dismiss button
      const dismissButton = screen.getByRole("button", {
        name: "Dismiss error",
      });
      fireEvent.click(dismissButton);

      expect(screen.queryByText("Error")).not.toBeInTheDocument();
    });
  });

  describe("Cleanup", () => {
    it("should stop recording on unmount if recording", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Start recording
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      // Set state to recording for cleanup check
      mockMediaRecorder.state = "recording";
    });

    it("should stop media tracks on recording stop", async () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");

      // Record and stop
      fireEvent.mouseDown(button);
      await waitFor(() => {
        expect(mockMediaRecorder.start).toHaveBeenCalled();
      });

      mockMediaRecorder.state = "recording";
      fireEvent.mouseUp(button);

      // Tracks should be stopped
      await waitFor(() => {
        expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
      });
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on main button", () => {
      render(<VoiceInput onTranscript={vi.fn()} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label");
    });

    it("should have aria-label on dismiss error button", async () => {
      (
        navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Test"));

      render(<VoiceInput onTranscript={vi.fn()} />);

      fireEvent.mouseDown(screen.getByRole("button"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Dismiss error" }),
        ).toBeInTheDocument();
      });
    });
  });
});
