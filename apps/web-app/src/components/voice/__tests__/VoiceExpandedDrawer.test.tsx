/**
 * Tests for VoiceExpandedDrawer component
 *
 * Tests the expandable drawer for detailed voice mode metrics and tool calls.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VoiceExpandedDrawer } from "../VoiceExpandedDrawer";
import type { TTToolCall } from "../../../hooks/useThinkerTalkerSession";

// ============================================================================
// Test Helpers
// ============================================================================

const defaultMetrics = {
  connectionTimeMs: 150,
  timeToFirstTranscriptMs: 200,
  lastSttLatencyMs: 100,
  lastResponseLatencyMs: 500,
  sessionDurationMs: 60000,
  userTranscriptCount: 3,
  aiResponseCount: 3,
  reconnectCount: 0,
  sessionStartedAt: Date.now() - 60000,
};

const defaultProps = {
  isOpen: true,
  onCollapse: vi.fn(),
  metrics: defaultMetrics,
  isConnected: true,
  toolCalls: [] as TTToolCall[],
  error: null,
  onDismissError: vi.fn(),
  ttfaMs: null,
};

function renderDrawer(props = {}) {
  return render(<VoiceExpandedDrawer {...defaultProps} {...props} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("VoiceExpandedDrawer", () => {
  describe("Visibility", () => {
    it("should render when isOpen is true", () => {
      renderDrawer({ isOpen: true });

      expect(screen.getByTestId("voice-expanded-drawer")).toBeInTheDocument();
    });

    it("should not render when isOpen is false", () => {
      renderDrawer({ isOpen: false });

      expect(
        screen.queryByTestId("voice-expanded-drawer"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Header", () => {
    it("should display 'Voice Mode Details' title", () => {
      renderDrawer();

      expect(screen.getByText("Voice Mode Details")).toBeInTheDocument();
    });

    it("should show Connected badge when connected", () => {
      renderDrawer({ isConnected: true });

      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("should not show Connected badge when disconnected", () => {
      renderDrawer({ isConnected: false });

      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });

    it("should call onCollapse when collapse button is clicked", () => {
      const onCollapse = vi.fn();
      renderDrawer({ onCollapse });

      fireEvent.click(screen.getByTestId("collapse-drawer-btn"));

      expect(onCollapse).toHaveBeenCalled();
    });

    it("should have aria-label on collapse button", () => {
      renderDrawer();

      expect(screen.getByTestId("collapse-drawer-btn")).toHaveAttribute(
        "aria-label",
        "Collapse drawer",
      );
    });
  });

  describe("Metrics Display", () => {
    it("should display connection time", () => {
      renderDrawer({ metrics: { ...defaultMetrics, connectionTimeMs: 150 } });

      expect(screen.getByText("150ms")).toBeInTheDocument();
    });

    it("should display STT latency", () => {
      renderDrawer({ metrics: { ...defaultMetrics, lastSttLatencyMs: 100 } });

      expect(screen.getByText("100ms")).toBeInTheDocument();
    });

    it("should display total response latency", () => {
      renderDrawer({
        metrics: { ...defaultMetrics, lastResponseLatencyMs: 500 },
      });

      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    it("should display TTFA when available", () => {
      renderDrawer({ ttfaMs: 180 });

      expect(screen.getByText("TTFA")).toBeInTheDocument();
      expect(screen.getByText("180ms")).toBeInTheDocument();
    });

    it("should display session duration when TTFA not available", () => {
      renderDrawer({
        ttfaMs: null,
        metrics: { ...defaultMetrics, sessionDurationMs: 120000 },
      });

      expect(screen.getByText("Session")).toBeInTheDocument();
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });

    it("should display user message count", () => {
      renderDrawer({ metrics: { ...defaultMetrics, userTranscriptCount: 5 } });

      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("user messages")).toBeInTheDocument();
    });

    it("should display AI response count", () => {
      renderDrawer({ metrics: { ...defaultMetrics, aiResponseCount: 4 } });

      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("AI responses")).toBeInTheDocument();
    });

    it("should display reconnect count when present", () => {
      renderDrawer({ metrics: { ...defaultMetrics, reconnectCount: 2 } });

      expect(screen.getByText("2 reconnects")).toBeInTheDocument();
    });

    it("should format times over 1000ms as seconds", () => {
      renderDrawer({
        metrics: { ...defaultMetrics, lastResponseLatencyMs: 1500 },
      });

      expect(screen.getByText("1.5s")).toBeInTheDocument();
    });

    it("should show dash for null metrics", () => {
      renderDrawer({
        metrics: {
          ...defaultMetrics,
          connectionTimeMs: null,
          lastSttLatencyMs: null,
          lastResponseLatencyMs: null,
        },
      });

      // Multiple dashes should be present
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("Error Display", () => {
    it("should display error when present", () => {
      renderDrawer({ error: { message: "Connection failed" } });

      expect(screen.getByTestId("drawer-error")).toBeInTheDocument();
      expect(screen.getByText("Connection failed")).toBeInTheDocument();
    });

    it("should show 'Microphone Access Denied' for mic permission error", () => {
      renderDrawer({
        error: { message: "Permission denied", code: "mic_permission_denied" },
      });

      expect(screen.getByText("Microphone Access Denied")).toBeInTheDocument();
    });

    it("should show 'Voice Error' for generic errors", () => {
      renderDrawer({ error: { message: "Something went wrong" } });

      expect(screen.getByText("Voice Error")).toBeInTheDocument();
    });

    it("should call onDismissError when dismiss button is clicked", () => {
      const onDismissError = vi.fn();
      renderDrawer({
        error: { message: "Test error" },
        onDismissError,
      });

      fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));

      expect(onDismissError).toHaveBeenCalled();
    });

    it("should not show dismiss button when onDismissError is not provided", () => {
      renderDrawer({
        error: { message: "Test error" },
        onDismissError: undefined,
      });

      expect(
        screen.queryByRole("button", { name: "Dismiss error" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Tool Calls Display", () => {
    it("should show tool calls when present", () => {
      const toolCalls: TTToolCall[] = [
        { id: "1", name: "kb_search", arguments: {}, status: "running" },
      ];
      renderDrawer({ toolCalls });

      expect(screen.getByTestId("tool-call-display")).toBeInTheDocument();
    });

    it("should show empty state when no tool calls", () => {
      renderDrawer({ toolCalls: [], error: null });

      expect(screen.getByText("No active tool calls")).toBeInTheDocument();
    });

    it("should not show empty state when error is present", () => {
      renderDrawer({
        toolCalls: [],
        error: { message: "Test error" },
      });

      expect(
        screen.queryByText("No active tool calls"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Latency Color Coding", () => {
    it("should apply green color for latency under 500ms", () => {
      renderDrawer({ metrics: { ...defaultMetrics, connectionTimeMs: 100 } });

      const metricsSection = screen.getByTestId("compact-metrics");
      expect(metricsSection).toContainHTML("text-green-600");
    });

    it("should apply yellow color for latency between 500-1000ms", () => {
      renderDrawer({ metrics: { ...defaultMetrics, connectionTimeMs: 700 } });

      const metricsSection = screen.getByTestId("compact-metrics");
      expect(metricsSection).toContainHTML("text-yellow-600");
    });

    it("should apply red color for latency over 1000ms", () => {
      renderDrawer({ metrics: { ...defaultMetrics, connectionTimeMs: 1500 } });

      const metricsSection = screen.getByTestId("compact-metrics");
      expect(metricsSection).toContainHTML("text-red-600");
    });
  });
});
