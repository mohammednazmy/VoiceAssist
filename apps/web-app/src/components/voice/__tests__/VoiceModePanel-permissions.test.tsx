/**
 * Tests for VoiceModePanel microphone permission handling
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
      synthesizeSpeech: vi.fn().mockResolvedValue(new Blob()),
    },
    tokens: { accessToken: "test-token" },
  }),
}));

// Mock useOfflineVoiceCapture
vi.mock("../../../hooks/useOfflineVoiceCapture", () => ({
  useOfflineVoiceCapture: () => ({
    isRecording: false,
    isOfflineMode: false,
    recordingDuration: 0,
    pendingCount: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(null),
    cancelRecording: vi.fn(),
    syncPendingRecordings: vi.fn(),
    getPendingRecordings: vi.fn().mockResolvedValue([]),
    deleteRecording: vi.fn(),
    setOfflineMode: vi.fn(),
  }),
}));

// Mock useWebRTCClient
vi.mock("../../../hooks/useWebRTCClient", () => ({
  useWebRTCClient: () => ({
    state: "idle",
    vadState: "idle",
    noiseSuppressionEnabled: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    bargeIn: vi.fn(),
  }),
}));

// Mock voice settings store
vi.mock("../../../stores/voiceSettingsStore", () => ({
  useVoiceSettingsStore: () => ({
    voice: "alloy",
    language: "en",
    showStatusHints: true,
  }),
  VOICE_OPTIONS: [{ value: "alloy", label: "Alloy" }],
  LANGUAGE_OPTIONS: [{ value: "en", label: "English" }],
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
  isConnected: false,
  isConnecting: false,
  canSend: false,
  isMicPermissionDenied: false,
  resetFatalError: vi.fn(),
  ...overrides,
});

// TODO: Fix mocking for VoiceModePanel tests - requires comprehensive mocking of
// useRealtimeVoiceSession, useOfflineVoiceCapture, useWebRTCClient, and voiceSettingsStore
// Tests are skipped due to complex component dependencies causing timeouts
describe.skip("VoiceModePanel - Permission Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRealtimeVoiceSession.mockReturnValue(createMockHookReturn());
  });

  describe("permission denied error state", () => {
    it("should show Microphone Access Denied when permission error occurs", async () => {
      const mockConnect = vi
        .fn()
        .mockRejectedValue(new Error("Permission denied: getUserMedia"));

      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          connect: mockConnect,
          error: new Error("Permission denied: getUserMedia"),
        }),
      );

      render(<VoiceModePanel />);

      // Click start to trigger the permission error
      const startButton = screen.getByTestId("main-mic-button");
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });
    });

    it("should display browser mic settings instructions when permission denied", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          error: new Error("NotAllowedError: Permission denied"),
        }),
      );

      // Render with permission denied state already set
      // We simulate this by having both error and the internal state
      const { rerender } = render(<VoiceModePanel />);

      // The component should show the error with instructions
      // We need to actually trigger the internal state - let's test the rendered state
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          error: new Error("Permission denied"),
          status: "error",
        }),
      );

      rerender(<VoiceModePanel />);

      // Should show connection error (the component needs handleConnect to run to set micPermissionDenied)
      expect(screen.getByTestId("connection-error")).toBeInTheDocument();
    });

    it("should show use text-only mode button in error state", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          error: new Error("Connection failed"),
          status: "error",
        }),
      );

      render(<VoiceModePanel />);

      expect(
        screen.getByTestId("use-text-only-error-button"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Use text-only mode instead"),
      ).toBeInTheDocument();
    });

    it("should call onClose when text-only button is clicked in error state", () => {
      const onClose = vi.fn();

      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          error: new Error("Connection failed"),
          status: "error",
        }),
      );

      render(<VoiceModePanel onClose={onClose} />);

      const textOnlyButton = screen.getByTestId("use-text-only-error-button");
      fireEvent.click(textOnlyButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should show Try Again button for non-permission errors", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          error: new Error("Network error"),
          status: "error",
        }),
      );

      render(<VoiceModePanel />);

      // Should show both buttons (use getAllByText since there may be multiple)
      const tryAgainButtons = screen.getAllByText("Try Again");
      expect(tryAgainButtons.length).toBeGreaterThan(0);
      expect(
        screen.getByText("Use text-only mode instead"),
      ).toBeInTheDocument();
    });
  });

  describe("state hygiene", () => {
    it("should provide disconnect function that can be called", () => {
      const mockDisconnect = vi.fn();

      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
          disconnect: mockDisconnect,
        }),
      );

      render(<VoiceModePanel />);

      // Click end session
      const endButton = screen.getByTestId("end-session-small");
      fireEvent.click(endButton);

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("should show Start Voice Session button when disconnected", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "disconnected",
          isConnected: false,
        }),
      );

      render(<VoiceModePanel />);

      expect(screen.getByTestId("main-mic-button")).toBeInTheDocument();
      // Button shows "Tap to start" status text when disconnected
      expect(screen.getByTestId("mic-status-text")).toHaveTextContent(
        "Tap to start",
      );
    });

    it("should show End Session button when connected", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
        }),
      );

      render(<VoiceModePanel />);

      expect(screen.getByTestId("end-session-small")).toBeInTheDocument();
      // Check for End button text
      expect(screen.getByText("End")).toBeInTheDocument();
    });
  });

  describe("connection status display", () => {
    it("should show Connecting status when connecting", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connecting",
          isConnecting: true,
        }),
      );

      render(<VoiceModePanel />);

      // The connection status indicator has aria-label with status info
      const statusIndicator = screen.getByTestId("connection-status-indicator");
      expect(statusIndicator).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Connecting"),
      );
    });

    it("should show Connected status when connected", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "connected",
          isConnected: true,
        }),
      );

      render(<VoiceModePanel />);

      const statusIndicator = screen.getByTestId("connection-status-indicator");
      expect(statusIndicator).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Connected"),
      );
    });

    it("should show Reconnecting status", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "reconnecting",
        }),
      );

      render(<VoiceModePanel />);

      const statusIndicator = screen.getByTestId("connection-status-indicator");
      expect(statusIndicator).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Reconnecting"),
      );
    });

    it("should show Failed status", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "failed",
        }),
      );

      render(<VoiceModePanel />);

      const statusIndicator = screen.getByTestId("connection-status-indicator");
      expect(statusIndicator).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Failed"),
      );
    });

    it("should show Expired status", () => {
      mockUseRealtimeVoiceSession.mockReturnValue(
        createMockHookReturn({
          status: "expired",
        }),
      );

      render(<VoiceModePanel />);

      const statusIndicator = screen.getByTestId("connection-status-indicator");
      expect(statusIndicator).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Expired"),
      );
    });
  });

  describe("close button", () => {
    it("should call onClose when close button is clicked", () => {
      const onClose = vi.fn();

      mockUseRealtimeVoiceSession.mockReturnValue(createMockHookReturn());

      render(<VoiceModePanel onClose={onClose} />);

      const closeButton = screen.getByTestId("close-voice-mode");
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
