/**
 * Unit tests for ThinkingTonePlayer Component
 *
 * Phase 3: Testing - Voice Mode v4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import {
  ThinkingIndicator,
  ToolCallIndicator,
  ThinkingFeedbackSettings,
  TONE_PRESETS,
  useThinkingTone,
} from "../ThinkingTonePlayer";

// Mock Audio Context
const mockOscillator = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as any,
  type: "sine",
  frequency: { setValueAtTime: vi.fn() },
};

const mockGainNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
};

const mockAudioContext = {
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGainNode),
  destination: {},
  currentTime: 0,
  state: "running",
  resume: vi.fn(),
};

// Mock global AudioContext
vi.stubGlobal(
  "AudioContext",
  vi.fn(() => mockAudioContext),
);
vi.stubGlobal(
  "webkitAudioContext",
  vi.fn(() => mockAudioContext),
);

describe("ThinkingTonePlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("TONE_PRESETS", () => {
    it("should have all required presets", () => {
      expect(TONE_PRESETS).toHaveProperty("gentle_beep");
      expect(TONE_PRESETS).toHaveProperty("soft_chime");
      expect(TONE_PRESETS).toHaveProperty("subtle_tick");
    });

    it("should have valid configurations for each preset", () => {
      Object.values(TONE_PRESETS).forEach((preset) => {
        expect(preset).toHaveProperty("src");
        expect(preset).toHaveProperty("interval");
        expect(preset).toHaveProperty("volume");
        expect(preset.volume).toBeGreaterThan(0);
        expect(preset.volume).toBeLessThanOrEqual(1);
        expect(preset.interval).toBeGreaterThan(0);
      });
    });

    it("gentle_beep should have correct frequency", () => {
      expect(TONE_PRESETS.gentle_beep.frequency).toBe(440);
    });

    it("soft_chime should have higher frequency", () => {
      expect(TONE_PRESETS.soft_chime.frequency).toBe(880);
    });
  });

  describe("ThinkingIndicator", () => {
    it("should render when isThinking is true", () => {
      render(<ThinkingIndicator isThinking={true} />);
      expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });

    it("should not render when isThinking is false", () => {
      render(<ThinkingIndicator isThinking={false} />);
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    });

    it("should display custom text", () => {
      render(<ThinkingIndicator isThinking={true} text="Processing..." />);
      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });

    it("should have correct accessibility attributes", () => {
      render(<ThinkingIndicator isThinking={true} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      render(<ThinkingIndicator isThinking={true} className="custom-class" />);
      const element = screen.getByText("Thinking...").parentElement;
      expect(element).toHaveClass("custom-class");
    });

    it("should not render visual indicator when showVisual is false", () => {
      render(<ThinkingIndicator isThinking={true} showVisual={false} />);
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    });
  });

  describe("ToolCallIndicator", () => {
    it("should render when isExecuting is true", () => {
      render(
        <ToolCallIndicator toolName="search_documents" isExecuting={true} />,
      );
      expect(screen.getByText(/Running: Search Documents/)).toBeInTheDocument();
    });

    it("should not render when isExecuting is false", () => {
      render(
        <ToolCallIndicator toolName="search_documents" isExecuting={false} />,
      );
      expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
    });

    it("should format tool name correctly", () => {
      render(<ToolCallIndicator toolName="kb_read_pages" isExecuting={true} />);
      expect(screen.getByText(/Kb Read Pages/)).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const { container } = render(
        <ToolCallIndicator
          toolName="test"
          isExecuting={true}
          className="custom-tool-class"
        />,
      );
      expect(container.firstChild).toHaveClass("custom-tool-class");
    });
  });

  describe("ThinkingFeedbackSettings", () => {
    it("should render all preset options", () => {
      const onChange = vi.fn();
      render(
        <ThinkingFeedbackSettings value="gentle_beep" onChange={onChange} />,
      );

      expect(screen.getByText("None (silent)")).toBeInTheDocument();
      expect(screen.getByText("Gentle beep")).toBeInTheDocument();
      expect(screen.getByText("Soft chime")).toBeInTheDocument();
      expect(screen.getByText("Subtle tick")).toBeInTheDocument();
    });

    it("should call onChange when preset is selected", async () => {
      const onChange = vi.fn();
      render(
        <ThinkingFeedbackSettings value="gentle_beep" onChange={onChange} />,
      );

      const softChimeButton = screen.getByText("Soft chime").closest("button");
      await act(async () => {
        softChimeButton?.click();
      });

      expect(onChange).toHaveBeenCalledWith("soft_chime");
    });

    it("should show volume slider when preset is not none", () => {
      const onChange = vi.fn();
      const onVolumeChange = vi.fn();
      render(
        <ThinkingFeedbackSettings
          value="gentle_beep"
          onChange={onChange}
          volume={0.3}
          onVolumeChange={onVolumeChange}
        />,
      );

      expect(screen.getByText(/Volume: 30%/)).toBeInTheDocument();
    });

    it("should hide volume slider when preset is none", () => {
      const onChange = vi.fn();
      const onVolumeChange = vi.fn();
      render(
        <ThinkingFeedbackSettings
          value="none"
          onChange={onChange}
          volume={0.3}
          onVolumeChange={onVolumeChange}
        />,
      );

      expect(screen.queryByText(/Volume/)).not.toBeInTheDocument();
    });

    it("should show test button when preset is not none", () => {
      const onChange = vi.fn();
      render(
        <ThinkingFeedbackSettings value="gentle_beep" onChange={onChange} />,
      );

      expect(screen.getByText("Test sound")).toBeInTheDocument();
    });
  });

  describe("useThinkingTone hook", () => {
    function TestComponent({
      enabled,
      preset = "gentle_beep",
    }: {
      enabled: boolean;
      preset?: "gentle_beep" | "soft_chime" | "subtle_tick" | "none";
    }) {
      useThinkingTone(enabled, preset);
      return <div data-testid="test-component">Test</div>;
    }

    it("should not play tone when disabled", () => {
      render(<TestComponent enabled={false} />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Should not create oscillator when disabled
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it("should not play tone when preset is none", () => {
      render(<TestComponent enabled={true} preset="none" />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it("should start playing after initial delay when enabled", async () => {
      render(<TestComponent enabled={true} preset="gentle_beep" />);

      // Before initial delay
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();

      // After initial delay (500ms for gentle_beep)
      act(() => {
        vi.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      });
    });

    it("should play subsequent tones at configured interval", async () => {
      render(<TestComponent enabled={true} preset="gentle_beep" />);

      // Skip initial delay
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Clear the initial call count
      mockAudioContext.createOscillator.mockClear();

      // Wait for interval (2000ms for gentle_beep)
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      });
    });

    it("should stop playing when disabled", async () => {
      const { rerender } = render(
        <TestComponent enabled={true} preset="gentle_beep" />,
      );

      // Start playing
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Disable
      rerender(<TestComponent enabled={false} preset="gentle_beep" />);
      mockAudioContext.createOscillator.mockClear();

      // Should not play anymore
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it("should clean up on unmount", () => {
      const { unmount } = render(
        <TestComponent enabled={true} preset="gentle_beep" />,
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      unmount();

      // Clear call count
      mockAudioContext.createOscillator.mockClear();

      // Should not play after unmount
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });
  });
});
