/**
 * Tests for VoiceMetricsDisplay component
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VoiceMetricsDisplay } from "../VoiceMetricsDisplay";
import type { VoiceMetrics } from "../../../hooks/useRealtimeVoiceSession";

const createMockMetrics = (
  overrides: Partial<VoiceMetrics> = {},
): VoiceMetrics => ({
  connectionTimeMs: null,
  timeToFirstTranscriptMs: null,
  lastSttLatencyMs: null,
  lastResponseLatencyMs: null,
  sessionDurationMs: null,
  userTranscriptCount: 0,
  aiResponseCount: 0,
  reconnectCount: 0,
  sessionStartedAt: null,
  ...overrides,
});

describe("VoiceMetricsDisplay", () => {
  describe("accessibility", () => {
    it("should have aria-expanded attribute on header button", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics()}
          isConnected={true}
        />,
      );

      const button = screen.getByRole("button", { name: /voice metrics/i });
      expect(button).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("should have aria-controls pointing to content", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics()}
          isConnected={true}
        />,
      );

      const button = screen.getByRole("button", { name: /voice metrics/i });
      expect(button).toHaveAttribute("aria-controls", "voice-metrics-content");
    });

    it("should have sr-only text for latency legend items", () => {
      const metrics = createMockMetrics({ connectionTimeMs: 100 });
      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      // Check for screen-reader-only text in legend
      expect(screen.getByText("Good latency:")).toHaveClass("sr-only");
      expect(screen.getByText("Acceptable latency:")).toHaveClass("sr-only");
      expect(screen.getByText("Poor latency:")).toHaveClass("sr-only");
    });

    it("should have aria-label on collapsed preview latency", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 250 });
      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      // Find the preview latency in collapsed state
      const previewElement = screen.getByText("250ms");
      expect(previewElement).toHaveAttribute(
        "aria-label",
        "Response latency: 250ms",
      );
    });
  });

  describe("visibility", () => {
    it("should not render when disconnected and no metrics", () => {
      const { container } = render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics()}
          isConnected={false}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("should render when connected", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics()}
          isConnected={true}
        />,
      );

      expect(screen.getByTestId("voice-metrics-display")).toBeInTheDocument();
    });

    it("should render when disconnected but has metrics", () => {
      const metrics = createMockMetrics({
        connectionTimeMs: 500,
        lastResponseLatencyMs: 300,
      });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={false} />);

      expect(screen.getByTestId("voice-metrics-display")).toBeInTheDocument();
    });
  });

  describe("collapsible behavior", () => {
    it("should be collapsed by default", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics()}
          isConnected={true}
        />,
      );

      expect(
        screen.queryByTestId("metric-connection-time"),
      ).not.toBeInTheDocument();
    });

    it("should expand when clicked", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics({ connectionTimeMs: 250 })}
          isConnected={true}
        />,
      );

      // Click to expand
      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-connection-time")).toBeInTheDocument();
    });

    it("should collapse when clicked again", () => {
      render(
        <VoiceMetricsDisplay
          metrics={createMockMetrics({ connectionTimeMs: 250 })}
          isConnected={true}
        />,
      );

      // Expand
      fireEvent.click(screen.getByText("Voice Metrics"));
      expect(screen.getByTestId("metric-connection-time")).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText("Voice Metrics"));
      expect(
        screen.queryByTestId("metric-connection-time"),
      ).not.toBeInTheDocument();
    });
  });

  describe("metrics display", () => {
    it("should display connection time", () => {
      const metrics = createMockMetrics({ connectionTimeMs: 350 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-connection-time")).toHaveTextContent(
        "350ms",
      );
    });

    it("should display STT latency", () => {
      const metrics = createMockMetrics({ lastSttLatencyMs: 200 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-stt-latency")).toHaveTextContent(
        "200ms",
      );
    });

    it("should display response latency", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 450 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-response-latency")).toHaveTextContent(
        "450ms",
      );
    });

    it("should display session duration in mm:ss format", () => {
      const metrics = createMockMetrics({ sessionDurationMs: 125000 }); // 2:05

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-session-duration")).toHaveTextContent(
        "2:05",
      );
    });

    it("should display time to first transcript", () => {
      const metrics = createMockMetrics({ timeToFirstTranscriptMs: 850 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-first-transcript")).toHaveTextContent(
        "850ms",
      );
    });

    it("should not display time to first transcript when null", () => {
      const metrics = createMockMetrics({ timeToFirstTranscriptMs: null });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(
        screen.queryByTestId("metric-first-transcript"),
      ).not.toBeInTheDocument();
    });

    it("should display message counts", () => {
      const metrics = createMockMetrics({
        userTranscriptCount: 5,
        aiResponseCount: 4,
      });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("user messages")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("AI responses")).toBeInTheDocument();
    });

    it("should display reconnect count when > 0", () => {
      const metrics = createMockMetrics({ reconnectCount: 2 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByText("2 reconnects")).toBeInTheDocument();
    });

    it("should not display reconnect count when 0", () => {
      const metrics = createMockMetrics({ reconnectCount: 0 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.queryByText(/reconnect/)).not.toBeInTheDocument();
    });
  });

  describe("latency formatting", () => {
    it("should display dash for null values", () => {
      const metrics = createMockMetrics({
        connectionTimeMs: null,
        lastSttLatencyMs: null,
      });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-connection-time")).toHaveTextContent(
        "—",
      );
      expect(screen.getByTestId("metric-stt-latency")).toHaveTextContent("—");
    });

    it("should format latency > 1000ms as seconds", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 1500 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      expect(screen.getByTestId("metric-response-latency")).toHaveTextContent(
        "1.5s",
      );
    });
  });

  describe("latency color coding", () => {
    it("should show green color for latency < 500ms", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 300 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      const latencyElement = screen.getByTestId("metric-response-latency");
      expect(latencyElement).toHaveClass("text-green-600");
    });

    it("should show yellow color for latency 500-1000ms", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 750 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      const latencyElement = screen.getByTestId("metric-response-latency");
      expect(latencyElement).toHaveClass("text-yellow-600");
    });

    it("should show red color for latency > 1000ms", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 1500 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      fireEvent.click(screen.getByText("Voice Metrics"));

      const latencyElement = screen.getByTestId("metric-response-latency");
      expect(latencyElement).toHaveClass("text-red-600");
    });
  });

  describe("collapsed preview", () => {
    it("should show response latency in collapsed header when available", () => {
      const metrics = createMockMetrics({ lastResponseLatencyMs: 250 });

      render(<VoiceMetricsDisplay metrics={metrics} isConnected={true} />);

      // Before expanding, should show preview
      expect(screen.getByText("250ms")).toBeInTheDocument();
    });
  });
});
