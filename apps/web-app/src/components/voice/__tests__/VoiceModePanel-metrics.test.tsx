/**
 * Integration tests for VoiceModePanel metrics display
 * Tests that VoiceMetricsDisplay is properly wired to VoiceModePanel
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceModePanel } from "../VoiceModePanel";
import type { VoiceMetrics } from "../../../hooks/useRealtimeVoiceSession";

// Mock the useRealtimeVoiceSession hook
vi.mock("../../../hooks/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: vi.fn(),
}));

// Mock the useAuth hook
vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({
    apiClient: {
      createRealtimeSession: vi.fn(),
    },
  }),
}));

// Mock the waveform utility with a proper class mock
vi.mock("../../../utils/waveform", () => ({
  WaveformVisualizer: class MockWaveformVisualizer {
    disconnect = vi.fn();
    constructor() {}
  },
}));

// Import the mocked hook after mocking
import { useRealtimeVoiceSession } from "../../../hooks/useRealtimeVoiceSession";

const mockUseRealtimeVoiceSession = vi.mocked(useRealtimeVoiceSession);

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

const createMockHookReturn = (
  overrides: Partial<ReturnType<typeof useRealtimeVoiceSession>> = {},
) => ({
  status: "disconnected" as const,
  error: null,
  transcript: "",
  partialTranscript: "",
  isSpeaking: false,
  sessionConfig: null,
  metrics: createMockMetrics(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  sendMessage: vi.fn(),
  resetFatalError: vi.fn(),
  prewarmSession: vi.fn().mockResolvedValue(undefined),
  isConnected: false,
  isConnecting: false,
  isMicPermissionDenied: false,
  canSend: false,
  ...overrides,
});

describe("VoiceModePanel - Metrics Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRealtimeVoiceSession.mockReturnValue(createMockHookReturn());
  });

  describe("metrics display", () => {
    it("should render VoiceMetricsDisplay when connected with metrics", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: createMockMetrics({
            connectionTimeMs: 450,
            lastResponseLatencyMs: 250,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // VoiceMetricsDisplay should be rendered
      expect(screen.getByTestId("voice-metrics-display")).toBeInTheDocument();
    });

    it("should show response latency in metrics panel", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: createMockMetrics({
            lastResponseLatencyMs: 250,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // Click to expand metrics
      fireEvent.click(screen.getByText("Voice Metrics"));

      // Check that the latency is displayed
      expect(screen.getByTestId("metric-response-latency")).toHaveTextContent(
        "250ms",
      );
    });

    it("should show all metrics when expanded", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: createMockMetrics({
            connectionTimeMs: 450,
            lastSttLatencyMs: 180,
            lastResponseLatencyMs: 320,
            userTranscriptCount: 3,
            aiResponseCount: 2,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // Expand metrics panel
      fireEvent.click(screen.getByText("Voice Metrics"));

      // Verify all metrics are displayed
      expect(screen.getByTestId("metric-connection-time")).toHaveTextContent(
        "450ms",
      );
      expect(screen.getByTestId("metric-stt-latency")).toHaveTextContent(
        "180ms",
      );
      expect(screen.getByTestId("metric-response-latency")).toHaveTextContent(
        "320ms",
      );
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("user messages")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("AI responses")).toBeInTheDocument();
    });

    it("should show time to first transcript when available", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: createMockMetrics({
            timeToFirstTranscriptMs: 1200,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // Expand metrics panel
      fireEvent.click(screen.getByText("Voice Metrics"));

      // Verify time to first transcript is displayed
      expect(screen.getByTestId("metric-first-transcript")).toHaveTextContent(
        "1.2s",
      );
    });

    it("should display latency preview in collapsed header", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: createMockMetrics({
            lastResponseLatencyMs: 375,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // Should show preview in collapsed state
      expect(screen.getByText("375ms")).toBeInTheDocument();
    });

    it("should not render metrics display when disconnected with no metrics", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "disconnected",
          isConnected: false,
          metrics: createMockMetrics(),
        }),
      );

      render(<VoiceModePanel />);

      // VoiceMetricsDisplay should not be rendered (no metrics to show)
      expect(
        screen.queryByTestId("voice-metrics-display"),
      ).not.toBeInTheDocument();
    });

    it("should still show metrics after disconnection if metrics were collected", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "disconnected",
          isConnected: false,
          metrics: createMockMetrics({
            connectionTimeMs: 400,
            sessionDurationMs: 30000,
          }),
        }),
      );

      render(<VoiceModePanel />);

      // VoiceMetricsDisplay should still be rendered with historical data
      expect(screen.getByTestId("voice-metrics-display")).toBeInTheDocument();

      // Expand and verify
      fireEvent.click(screen.getByText("Voice Metrics"));
      expect(screen.getByTestId("metric-session-duration")).toHaveTextContent(
        "0:30",
      );
    });
  });

  describe("metrics callback", () => {
    it("should call onMetricsUpdate prop when metrics change", () => {
      const onMetricsUpdate = vi.fn();
      const testMetrics = createMockMetrics({
        connectionTimeMs: 500,
        lastResponseLatencyMs: 300,
      });

      // Capture the onMetricsUpdate callback passed to the hook
      let capturedOnMetricsUpdate:
        | ((metrics: VoiceMetrics) => void)
        | undefined;
      mockUseRealtimeVoiceSession.mockImplementation((options) => {
        capturedOnMetricsUpdate = options?.onMetricsUpdate;
        return createMockHookReturn({
          status: "connected",
          isConnected: true,
          metrics: testMetrics,
        });
      });

      render(<VoiceModePanel onMetricsUpdate={onMetricsUpdate} />);

      // Simulate the hook calling onMetricsUpdate
      if (capturedOnMetricsUpdate) {
        capturedOnMetricsUpdate(testMetrics);
      }

      expect(onMetricsUpdate).toHaveBeenCalledWith(testMetrics);
    });
  });
});
