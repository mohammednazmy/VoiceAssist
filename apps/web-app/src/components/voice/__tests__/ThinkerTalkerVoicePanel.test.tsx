/**
 * Tests for ThinkerTalkerVoicePanel component
 *
 * Tests the main voice mode panel using the Thinker/Talker pipeline.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThinkerTalkerVoicePanel } from "../ThinkerTalkerVoicePanel";
import type { TTToolCall } from "../../../hooks/useThinkerTalkerSession";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock voice mode state
const mockVoiceMode = {
  connectionStatus: "disconnected" as const,
  pipelineState: "idle" as const,
  isConnected: false,
  isConnecting: false,
  isReady: false,
  isMicPermissionDenied: false,
  playbackState: "idle" as const,
  isPlaying: false,
  isSpeaking: false,
  isListening: false,
  partialTranscript: "",
  finalTranscript: "",
  currentToolCalls: [] as TTToolCall[],
  metrics: {
    connectionTimeMs: null as number | null,
    sttLatencyMs: null as number | null,
    totalLatencyMs: null as number | null,
    sessionDurationMs: null as number | null,
    userUtteranceCount: 0,
    aiResponseCount: 0,
    reconnectCount: 0,
    sessionStartedAt: null as number | null,
  },
  ttfaMs: null as number | null,
  error: null as Error | null,
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  bargeIn: vi.fn(),
  sendTextMessage: vi.fn(),
  setVolume: vi.fn(),
  resetError: vi.fn(),
};

vi.mock("../../../hooks/useThinkerTalkerVoiceMode", () => ({
  useThinkerTalkerVoiceMode: vi.fn(() => mockVoiceMode),
}));

// Mock voice settings store
vi.mock("../../../stores/voiceSettingsStore", () => ({
  useVoiceSettingsStore: () => ({
    elevenlabsVoiceId: "TxGEqnHWrfWFTfGW9XjX",
    language: "en",
  }),
}));

// Mock child components for isolation
vi.mock("../CompactVoiceBar", () => ({
  CompactVoiceBar: ({
    onConnect,
    onDisconnect,
    onBargeIn,
    onExpand,
    onClose,
    onOpenSettings,
    isConnected,
    isConnecting,
    isListening,
    isPlaying,
    partialTranscript,
  }: {
    onConnect: () => void;
    onDisconnect: () => void;
    onBargeIn: () => void;
    onExpand: () => void;
    onClose: () => void;
    onOpenSettings: () => void;
    isConnected: boolean;
    isConnecting: boolean;
    isListening: boolean;
    isPlaying: boolean;
    partialTranscript: string;
  }) => (
    <div data-testid="compact-voice-bar">
      <button data-testid="connect-btn" onClick={onConnect}>
        Connect
      </button>
      <button data-testid="disconnect-btn" onClick={onDisconnect}>
        Disconnect
      </button>
      <button data-testid="barge-in-btn" onClick={onBargeIn}>
        Barge In
      </button>
      <button data-testid="expand-btn" onClick={onExpand}>
        Expand
      </button>
      <button data-testid="close-btn" onClick={onClose}>
        Close
      </button>
      <button data-testid="settings-btn" onClick={onOpenSettings}>
        Settings
      </button>
      <span data-testid="connected-status">
        {isConnected ? "connected" : "disconnected"}
      </span>
      <span data-testid="transcript">{partialTranscript}</span>
    </div>
  ),
}));

vi.mock("../VoiceExpandedDrawer", () => ({
  VoiceExpandedDrawer: ({
    isOpen,
    onCollapse,
  }: {
    isOpen: boolean;
    onCollapse: () => void;
  }) =>
    isOpen ? (
      <div data-testid="expanded-drawer">
        <button data-testid="collapse-btn" onClick={onCollapse}>
          Collapse
        </button>
      </div>
    ) : null,
}));

vi.mock("../VoiceModeSettings", () => ({
  VoiceModeSettings: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button data-testid="close-settings-btn" onClick={onClose}>
          Close Settings
        </button>
      </div>
    ) : null,
}));

// ============================================================================
// Test Helpers
// ============================================================================

function resetMocks() {
  vi.clearAllMocks();
  mockVoiceMode.connectionStatus = "disconnected";
  mockVoiceMode.pipelineState = "idle";
  mockVoiceMode.isConnected = false;
  mockVoiceMode.isConnecting = false;
  mockVoiceMode.isListening = false;
  mockVoiceMode.isPlaying = false;
  mockVoiceMode.isMicPermissionDenied = false;
  mockVoiceMode.partialTranscript = "";
  mockVoiceMode.currentToolCalls = [];
  mockVoiceMode.error = null;
  mockVoiceMode.ttfaMs = null;
  mockVoiceMode.metrics = {
    connectionTimeMs: null,
    sttLatencyMs: null,
    totalLatencyMs: null,
    sessionDurationMs: null,
    userUtteranceCount: 0,
    aiResponseCount: 0,
    reconnectCount: 0,
    sessionStartedAt: null,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("ThinkerTalkerVoicePanel", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render the voice panel", () => {
      render(<ThinkerTalkerVoicePanel />);

      expect(
        screen.getByTestId("thinker-talker-voice-panel"),
      ).toBeInTheDocument();
    });

    it("should render CompactVoiceBar", () => {
      render(<ThinkerTalkerVoicePanel />);

      expect(screen.getByTestId("compact-voice-bar")).toBeInTheDocument();
    });

    it("should not show expanded drawer initially", () => {
      render(<ThinkerTalkerVoicePanel />);

      expect(screen.queryByTestId("expanded-drawer")).not.toBeInTheDocument();
    });

    it("should not show settings modal initially", () => {
      render(<ThinkerTalkerVoicePanel />);

      expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
    });
  });

  describe("Connection", () => {
    it("should call connect when connect button is clicked", async () => {
      render(<ThinkerTalkerVoicePanel />);

      fireEvent.click(screen.getByTestId("connect-btn"));

      expect(mockVoiceMode.connect).toHaveBeenCalled();
    });

    it("should pass isConnected to CompactVoiceBar", () => {
      mockVoiceMode.isConnected = true;
      render(<ThinkerTalkerVoicePanel />);

      expect(screen.getByTestId("connected-status")).toHaveTextContent(
        "connected",
      );
    });

    it("should call disconnect when disconnect button is clicked", () => {
      mockVoiceMode.isConnected = true;
      render(<ThinkerTalkerVoicePanel />);

      fireEvent.click(screen.getByTestId("disconnect-btn"));

      expect(mockVoiceMode.disconnect).toHaveBeenCalled();
    });
  });

  describe("Barge-In", () => {
    it("should call bargeIn when barge-in button is clicked", () => {
      mockVoiceMode.isConnected = true;
      mockVoiceMode.isPlaying = true;
      render(<ThinkerTalkerVoicePanel />);

      fireEvent.click(screen.getByTestId("barge-in-btn"));

      expect(mockVoiceMode.bargeIn).toHaveBeenCalled();
    });
  });

  describe("Expand/Collapse", () => {
    it("should show expanded drawer when expand button is clicked", () => {
      render(<ThinkerTalkerVoicePanel />);

      fireEvent.click(screen.getByTestId("expand-btn"));

      expect(screen.getByTestId("expanded-drawer")).toBeInTheDocument();
    });

    it("should hide expanded drawer when collapse button is clicked", () => {
      render(<ThinkerTalkerVoicePanel />);

      // Open drawer
      fireEvent.click(screen.getByTestId("expand-btn"));
      expect(screen.getByTestId("expanded-drawer")).toBeInTheDocument();

      // Close drawer
      fireEvent.click(screen.getByTestId("collapse-btn"));
      expect(screen.queryByTestId("expanded-drawer")).not.toBeInTheDocument();
    });
  });

  describe("Settings Modal", () => {
    it("should show settings modal when settings button is clicked", () => {
      render(<ThinkerTalkerVoicePanel />);

      fireEvent.click(screen.getByTestId("settings-btn"));

      expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    });

    it("should hide settings modal when close settings button is clicked", () => {
      render(<ThinkerTalkerVoicePanel />);

      // Open settings
      fireEvent.click(screen.getByTestId("settings-btn"));
      expect(screen.getByTestId("settings-modal")).toBeInTheDocument();

      // Close settings
      fireEvent.click(screen.getByTestId("close-settings-btn"));
      expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
    });
  });

  describe("Close Panel", () => {
    it("should call onClose when close button is clicked", () => {
      const onClose = vi.fn();
      render(<ThinkerTalkerVoicePanel onClose={onClose} />);

      fireEvent.click(screen.getByTestId("close-btn"));

      expect(onClose).toHaveBeenCalled();
    });

    it("should disconnect if connected when closing", () => {
      mockVoiceMode.isConnected = true;
      const onClose = vi.fn();
      render(<ThinkerTalkerVoicePanel onClose={onClose} />);

      fireEvent.click(screen.getByTestId("close-btn"));

      expect(mockVoiceMode.disconnect).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("should not disconnect if not connected when closing", () => {
      mockVoiceMode.isConnected = false;
      const onClose = vi.fn();
      render(<ThinkerTalkerVoicePanel onClose={onClose} />);

      fireEvent.click(screen.getByTestId("close-btn"));

      expect(mockVoiceMode.disconnect).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Callbacks", () => {
    it("should pass conversationId to voice mode hook", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");

      render(<ThinkerTalkerVoicePanel conversationId="test-conv-123" />);

      expect(useThinkerTalkerVoiceMode).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: "test-conv-123",
        }),
      );
    });

    it("should pass voice settings to hook", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");

      render(<ThinkerTalkerVoicePanel />);

      expect(useThinkerTalkerVoiceMode).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceSettings: expect.objectContaining({
            voice_id: "TxGEqnHWrfWFTfGW9XjX",
            language: "en",
            barge_in_enabled: true,
          }),
        }),
      );
    });

    it("should call onUserMessage for final transcripts", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");
      const mockImpl = vi.mocked(useThinkerTalkerVoiceMode);

      const onUserMessage = vi.fn();
      render(<ThinkerTalkerVoicePanel onUserMessage={onUserMessage} />);

      // Get the options passed to the hook
      const callArgs = mockImpl.mock.calls[0][0];

      // Simulate a final transcript
      callArgs?.onUserTranscript?.("Hello world", true);

      expect(onUserMessage).toHaveBeenCalledWith("Hello world");
    });

    it("should not call onUserMessage for partial transcripts", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");
      const mockImpl = vi.mocked(useThinkerTalkerVoiceMode);

      const onUserMessage = vi.fn();
      render(<ThinkerTalkerVoicePanel onUserMessage={onUserMessage} />);

      const callArgs = mockImpl.mock.calls[0][0];
      callArgs?.onUserTranscript?.("Hello wor", false);

      expect(onUserMessage).not.toHaveBeenCalled();
    });

    it("should call onAssistantMessage for final AI responses", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");
      const mockImpl = vi.mocked(useThinkerTalkerVoiceMode);

      const onAssistantMessage = vi.fn();
      render(
        <ThinkerTalkerVoicePanel onAssistantMessage={onAssistantMessage} />,
      );

      const callArgs = mockImpl.mock.calls[0][0];
      callArgs?.onAIResponse?.("AI response content", true);

      expect(onAssistantMessage).toHaveBeenCalledWith("AI response content");
    });

    it("should call onMetricsUpdate when metrics change", async () => {
      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");
      const mockImpl = vi.mocked(useThinkerTalkerVoiceMode);

      const onMetricsUpdate = vi.fn();
      render(<ThinkerTalkerVoicePanel onMetricsUpdate={onMetricsUpdate} />);

      const callArgs = mockImpl.mock.calls[0][0];
      const testMetrics = {
        connectionTimeMs: 100,
        sttLatencyMs: 50,
        totalLatencyMs: 200,
        sessionDurationMs: 5000,
        userUtteranceCount: 2,
        aiResponseCount: 2,
        reconnectCount: 0,
        sessionStartedAt: Date.now(),
      };
      callArgs?.onMetricsUpdate?.(testMetrics);

      expect(onMetricsUpdate).toHaveBeenCalledWith(testMetrics);
    });
  });

  describe("Transcript Display", () => {
    it("should pass partial transcript to CompactVoiceBar", () => {
      mockVoiceMode.partialTranscript = "Hello wor";
      render(<ThinkerTalkerVoicePanel />);

      expect(screen.getByTestId("transcript")).toHaveTextContent("Hello wor");
    });
  });

  describe("Metrics Mapping", () => {
    it("should map voice mode metrics to drawer format", () => {
      mockVoiceMode.metrics = {
        connectionTimeMs: 100,
        sttLatencyMs: 50,
        totalLatencyMs: 200,
        sessionDurationMs: 5000,
        userUtteranceCount: 3,
        aiResponseCount: 3,
        reconnectCount: 1,
        sessionStartedAt: 1234567890,
      };

      render(<ThinkerTalkerVoicePanel />);

      // Open drawer to check metrics are passed
      fireEvent.click(screen.getByTestId("expand-btn"));
      expect(screen.getByTestId("expanded-drawer")).toBeInTheDocument();
    });
  });

  describe("Tool Calls", () => {
    it("should log tool calls", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const { useThinkerTalkerVoiceMode } =
        await import("../../../hooks/useThinkerTalkerVoiceMode");
      const mockImpl = vi.mocked(useThinkerTalkerVoiceMode);

      render(<ThinkerTalkerVoicePanel />);

      const callArgs = mockImpl.mock.calls[0][0];
      callArgs?.onToolCall?.({
        id: "1",
        name: "kb_search",
        arguments: "{}",
        status: "running",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ThinkerTalkerVoicePanel] Tool call:",
        "kb_search",
      );

      consoleSpy.mockRestore();
    });
  });
});
