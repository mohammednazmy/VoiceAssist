/**
 * VoiceBargeInIndicator Unit Tests
 * Tests visibility, content display, auto-dismiss, and interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  VoiceBargeInIndicator,
  type BargeInEvent,
} from "../VoiceBargeInIndicator";

describe("VoiceBargeInIndicator", () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createEvent = (overrides?: Partial<BargeInEvent>): BargeInEvent => ({
    id: "test-barge-in-1",
    timestamp: Date.now(),
    ...overrides,
  });

  describe("visibility", () => {
    it("should not render when event is null", () => {
      render(<VoiceBargeInIndicator event={null} onDismiss={mockOnDismiss} />);

      expect(
        screen.queryByTestId("voice-barge-in-indicator"),
      ).not.toBeInTheDocument();
    });

    it("should render when event is provided", () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(
        screen.getByTestId("voice-barge-in-indicator"),
      ).toBeInTheDocument();
    });

    it("should show 'Response interrupted' text", () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(screen.getByText("Response interrupted")).toBeInTheDocument();
    });
  });

  describe("interrupted content", () => {
    it("should display interrupted content when provided", () => {
      const event = createEvent({
        interruptedContent: "This is the interrupted AI response",
      });
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(
        screen.getByTestId("interrupted-content-preview"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/"This is the interrupted AI response"/),
      ).toBeInTheDocument();
    });

    it("should not show content preview when interruptedContent is empty", () => {
      const event = createEvent({ interruptedContent: undefined });
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(
        screen.queryByTestId("interrupted-content-preview"),
      ).not.toBeInTheDocument();
    });

    it("should truncate long content", () => {
      const longContent = "A".repeat(150);
      const event = createEvent({ interruptedContent: longContent });
      render(
        <VoiceBargeInIndicator
          event={event}
          onDismiss={mockOnDismiss}
          maxPreviewLength={100}
        />,
      );

      const preview = screen.getByTestId("interrupted-content-preview");
      // Should end with ...
      expect(preview.textContent).toContain("...");
      // Should not contain the full content
      expect(preview.textContent?.length).toBeLessThan(longContent.length + 10);
    });
  });

  describe("completion percentage", () => {
    it("should show progress bar when completionPercentage is provided", () => {
      const event = createEvent({ completionPercentage: 45 });
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(screen.getByTestId("completion-progress")).toBeInTheDocument();
      expect(screen.getByText("45% complete")).toBeInTheDocument();
    });

    it("should not show progress bar when completionPercentage is undefined", () => {
      const event = createEvent({ completionPercentage: undefined });
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(
        screen.queryByTestId("completion-progress"),
      ).not.toBeInTheDocument();
    });

    it("should render progress bar with correct aria attributes", () => {
      const event = createEvent({ completionPercentage: 75 });
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      const progressBar = screen.getByTestId("completion-progress");
      expect(progressBar).toHaveAttribute("role", "progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "75");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });
  });

  describe("auto-dismiss", () => {
    it("should auto-dismiss after default timeout", async () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      expect(
        screen.getByTestId("voice-barge-in-indicator"),
      ).toBeInTheDocument();

      // Fast-forward past the default timeout (3000ms)
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // Fast-forward past animation (200ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it("should respect custom autoDismissMs", async () => {
      const event = createEvent();
      render(
        <VoiceBargeInIndicator
          event={event}
          onDismiss={mockOnDismiss}
          autoDismissMs={5000}
        />,
      );

      // Should still be visible after 3000ms
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(mockOnDismiss).not.toHaveBeenCalled();

      // Should dismiss after 5000ms + animation
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("manual dismiss", () => {
    it("should dismiss when dismiss button is clicked", async () => {
      vi.useRealTimers(); // Use real timers for user interaction
      const user = userEvent.setup();
      const event = createEvent();

      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      const dismissButton = screen.getByTestId("barge-in-dismiss");
      await user.click(dismissButton);

      await waitFor(() => {
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
      });
    });

    it("should have accessible dismiss button", () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      const dismissButton = screen.getByTestId("barge-in-dismiss");
      expect(dismissButton).toHaveAttribute(
        "aria-label",
        "Dismiss notification",
      );
    });
  });

  describe("accessibility", () => {
    it("should have role=status for screen readers", () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      const indicator = screen.getByTestId("voice-barge-in-indicator");
      expect(indicator).toHaveAttribute("role", "status");
    });

    it("should have aria-live=polite", () => {
      const event = createEvent();
      render(<VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />);

      const indicator = screen.getByTestId("voice-barge-in-indicator");
      expect(indicator).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("event changes", () => {
    it("should update when a new event is provided", () => {
      const event1 = createEvent({
        id: "event-1",
        interruptedContent: "First content",
      });
      const event2 = createEvent({
        id: "event-2",
        interruptedContent: "Second content",
      });

      const { rerender } = render(
        <VoiceBargeInIndicator event={event1} onDismiss={mockOnDismiss} />,
      );

      expect(screen.getByText(/"First content"/)).toBeInTheDocument();

      rerender(
        <VoiceBargeInIndicator event={event2} onDismiss={mockOnDismiss} />,
      );

      expect(screen.getByText(/"Second content"/)).toBeInTheDocument();
    });

    it("should hide when event becomes null", () => {
      vi.useRealTimers(); // Use real timers for this test
      const event = createEvent();

      const { rerender } = render(
        <VoiceBargeInIndicator event={event} onDismiss={mockOnDismiss} />,
      );

      expect(
        screen.getByTestId("voice-barge-in-indicator"),
      ).toBeInTheDocument();

      rerender(
        <VoiceBargeInIndicator event={null} onDismiss={mockOnDismiss} />,
      );

      // Synchronous - when event is null, component doesn't render
      expect(
        screen.queryByTestId("voice-barge-in-indicator"),
      ).not.toBeInTheDocument();
    });
  });
});
