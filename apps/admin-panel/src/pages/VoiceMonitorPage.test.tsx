/**
 * Tests for VoiceMonitorPage - Active sessions, disconnect
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { VoiceMonitorPage } from "./VoiceMonitorPage";

// Mock hooks
vi.mock("../hooks/useVoiceMonitor", () => ({
  useVoiceMonitor: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useVoiceMonitor } from "../hooks/useVoiceMonitor";
import { useAuth } from "../contexts/AuthContext";

const mockSessions = [
  {
    session_id: "session-123-abc",
    user_id: "user-1",
    user_email: "user1@example.com",
    session_type: "voice",
    connected_at: "2024-01-15T12:00:00Z",
    last_activity: "2024-01-15T12:30:00Z",
    messages_count: 15,
  },
  {
    session_id: "session-456-def",
    user_id: "user-2",
    user_email: "user2@example.com",
    session_type: "realtime",
    connected_at: "2024-01-15T11:00:00Z",
    last_activity: "2024-01-15T12:25:00Z",
    messages_count: 8,
  },
];

const mockMetrics = {
  active_sessions: 2,
  total_sessions_24h: 45,
  avg_session_duration_sec: 325,
  error_rate_24h: 0.02,
  stt_latency_p95_ms: 150,
  tts_latency_p95_ms: 200,
  connections_by_type: {
    voice: 1,
    realtime: 1,
  },
};

const mockHealth = {
  status: "healthy",
  realtime_api_enabled: true,
  openai_api_configured: true,
  redis_connected: true,
};

const mockConfig = {
  realtime_enabled: true,
  default_voice: "alloy",
  default_language: "en-US",
  stt_provider: "openai",
  tts_provider: "openai",
  vad_enabled: true,
  vad_threshold: 0.5,
  max_session_duration_sec: 1800,
};

const mockTTSessions = [
  {
    session_id: "tt-session-1",
    user_id: "user-1",
    user_email: "user1@example.com",
    state: "speaking" as const,
    thinker_model: "gpt-4",
    talker_voice: "alloy",
    messages_processed: 10,
    avg_response_time_ms: 250,
  },
];

const mockTTContexts = [
  {
    context_id: "ctx-123456789012",
    user_id: "user-1",
    message_count: 20,
    token_count: 4500,
    expires_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(), // 30 min from now
  },
];

const mockQualityPresets = [
  {
    name: "standard",
    description: "Standard quality voice",
    tts_model: "tts-1",
    voice_id: "alloy",
    speed: 1.0,
    is_default: true,
  },
  {
    name: "hd",
    description: "High definition voice",
    tts_model: "tts-1-hd",
    voice_id: "nova",
    speed: 1.0,
    is_default: false,
  },
];

const mockTTAnalytics = {
  total_tool_calls_24h: 250,
  avg_tool_latency_ms: 120,
  tool_success_rate: 0.97,
  kb_calls_24h: 150,
  kb_avg_latency_ms: 85,
  tools_by_frequency: {
    kb_search: 80,
    kb_read: 50,
    web_search: 20,
  },
};

const defaultVoiceMonitorReturn = {
  sessions: mockSessions,
  metrics: mockMetrics,
  health: mockHealth,
  config: mockConfig,
  ttSessions: mockTTSessions,
  ttContexts: mockTTContexts,
  qualityPresets: mockQualityPresets,
  ttAnalytics: mockTTAnalytics,
  loading: false,
  error: null,
  lastUpdated: new Date(),
  refreshAll: vi.fn(),
  refreshTTPipeline: vi.fn(),
  disconnectSession: vi.fn().mockResolvedValue(true),
  cleanupContexts: vi.fn().mockResolvedValue(3),
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

describe("VoiceMonitorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVoiceMonitor).mockReturnValue(defaultVoiceMonitorReturn);
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
  });

  describe("rendering", () => {
    it("should render page title", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Voice Monitor")).toBeInTheDocument();
      expect(
        screen.getByText("Monitor voice sessions and realtime connections"),
      ).toBeInTheDocument();
    });

    it("should render health status badge", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("should render tab navigation", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("TT Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    it("should render refresh button", () => {
      render(<VoiceMonitorPage />);

      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading state when loading without data", () => {
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        loading: true,
        metrics: null,
      });

      render(<VoiceMonitorPage />);

      // Should show skeleton loading
      const loadingElements = document.querySelectorAll(".animate-pulse");
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("should show error message when error occurs", () => {
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        error: "Failed to load voice data",
      });

      render(<VoiceMonitorPage />);

      expect(screen.getByText("Failed to load voice data")).toBeInTheDocument();
    });
  });

  describe("overview tab - metrics", () => {
    it("should display active sessions count", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Active Sessions")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("should display sessions in last 24h", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Sessions (24h)")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();
    });

    it("should display average duration", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Avg Duration")).toBeInTheDocument();
      expect(screen.getByText("5m 25s")).toBeInTheDocument();
    });

    it("should display error rate", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Error Rate")).toBeInTheDocument();
      expect(screen.getByText("2.0%")).toBeInTheDocument();
    });
  });

  describe("overview tab - service health", () => {
    it("should display service health cards", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("Service Health")).toBeInTheDocument();
      expect(screen.getByText("Realtime API")).toBeInTheDocument();
      expect(screen.getByText("OpenAI API")).toBeInTheDocument();
      expect(screen.getByText("Redis")).toBeInTheDocument();
      expect(screen.getByText("Voice Config")).toBeInTheDocument();
    });
  });

  describe("overview tab - active sessions table", () => {
    it("should display sessions in table", () => {
      render(<VoiceMonitorPage />);

      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
      expect(screen.getByText("user2@example.com")).toBeInTheDocument();
    });

    it("should display session types", () => {
      render(<VoiceMonitorPage />);

      const activeSessionsPanel = screen.getByText(/Active Sessions \(/)
        .parentElement?.parentElement?.parentElement as HTMLElement;
      expect(activeSessionsPanel).toBeTruthy();
      const rows = within(activeSessionsPanel).getAllByRole("row");

      expect(rows[1]).toHaveTextContent("voice");
      expect(rows[2]).toHaveTextContent("realtime");
    });

    it("should display disconnect buttons for admin", () => {
      render(<VoiceMonitorPage />);

      const disconnectButtons = screen.getAllByRole("button", {
        name: /disconnect/i,
      });
      expect(disconnectButtons.length).toBe(2);
    });

    it("should not display disconnect buttons for non-admin", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<VoiceMonitorPage />);

      const disconnectButtons = screen.queryAllByRole("button", {
        name: /disconnect/i,
      });
      expect(disconnectButtons.length).toBe(0);
    });
  });

  describe("disconnect functionality", () => {
    it("should show confirmation dialog when disconnect is clicked", () => {
      render(<VoiceMonitorPage />);

      const disconnectButtons = screen.getAllByRole("button", {
        name: /disconnect/i,
      });
      fireEvent.click(disconnectButtons[0]);

      expect(screen.getByText("Disconnect Session")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to disconnect/i),
      ).toBeInTheDocument();
    });

    it("should call disconnectSession when confirmed", async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(true);
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        disconnectSession: mockDisconnect,
      });

      render(<VoiceMonitorPage />);

      const disconnectButtons = screen.getAllByRole("button", {
        name: /disconnect/i,
      });
      fireEvent.click(disconnectButtons[0]);

      // Click confirm in dialog
      const dialog = screen.getByRole("dialog");
      const confirmButton = within(dialog).getByRole("button", {
        name: "Disconnect",
      });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalledWith("session-123-abc");
      });
    });

    it("should close dialog when cancelled", async () => {
      render(<VoiceMonitorPage />);

      const disconnectButtons = screen.getAllByRole("button", {
        name: /disconnect/i,
      });
      fireEvent.click(disconnectButtons[0]);

      expect(screen.getByText("Disconnect Session")).toBeInTheDocument();

      // Find and click cancel button
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(
          screen.queryByText("Disconnect Session"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("overview tab - empty sessions", () => {
    it("should show empty state when no sessions", () => {
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        sessions: [],
      });

      render(<VoiceMonitorPage />);

      expect(screen.getByText("No active voice sessions")).toBeInTheDocument();
    });
  });

  describe("TT Pipeline tab", () => {
    it("should switch to TT Pipeline tab", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        expect(screen.getByText(/Thinker-Talker Sessions/)).toBeInTheDocument();
      });
    });

    it("should display TT sessions", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        const ttPanel = screen.getByText(/Thinker-Talker Sessions/)
          .parentElement?.parentElement?.parentElement;
        expect(ttPanel).toBeTruthy();
        if (ttPanel) {
          const table = within(ttPanel).getByRole("table");
          expect(within(table).getByText("gpt-4")).toBeInTheDocument();
          expect(within(table).getByText("alloy")).toBeInTheDocument();
        }
      });
    });

    it("should display conversation contexts", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        expect(screen.getByText(/Conversation Contexts/)).toBeInTheDocument();
      });
    });

    it("should display quality presets", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        expect(screen.getByText("Quality Presets")).toBeInTheDocument();
        expect(screen.getByText("standard")).toBeInTheDocument();
        expect(screen.getByText("hd")).toBeInTheDocument();
      });
    });

    it("should show cleanup button for admin", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cleanup expired/i }),
        ).toBeInTheDocument();
      });
    });

    it("should call cleanupContexts when clicked", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(5);
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        cleanupContexts: mockCleanup,
      });

      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("TT Pipeline"));

      await waitFor(() => {
        const cleanupButton = screen.getByRole("button", {
          name: /cleanup expired/i,
        });
        fireEvent.click(cleanupButton);
      });

      await waitFor(() => {
        expect(mockCleanup).toHaveBeenCalled();
      });
    });
  });

  describe("Analytics tab", () => {
    it("should switch to Analytics tab", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("Analytics"));

      await waitFor(() => {
        expect(screen.getByText("Tool Calls (24h)")).toBeInTheDocument();
      });
    });

    it("should display tool analytics", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("Analytics"));

      await waitFor(() => {
        const toolCallsCard =
          screen.getByText("Tool Calls (24h)").parentElement?.parentElement;
        expect(toolCallsCard).toBeTruthy();
        if (toolCallsCard) {
          expect(within(toolCallsCard).getByText("250")).toBeInTheDocument();
        }

        const avgLatencyCard =
          screen.getByText("Avg Tool Latency").parentElement?.parentElement;
        expect(avgLatencyCard).toBeTruthy();
        if (avgLatencyCard) {
          expect(
            within(avgLatencyCard).getAllByText("120 ms")[0],
          ).toBeInTheDocument();
        }

        expect(screen.getByText("Tool Success Rate")).toBeInTheDocument();
        expect(screen.getAllByText("97.0%").length).toBeGreaterThan(0);
      });
    });

    it("should display KB performance", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("Analytics"));

      await waitFor(() => {
        const kbHeader = screen.getByText("KB Performance");
        const kbPanel = kbHeader.parentElement?.parentElement?.parentElement;
        expect(kbPanel).toBeTruthy();
        if (kbPanel) {
          expect(within(kbPanel).getByText("Calls (24h)")).toBeInTheDocument();
          expect(within(kbPanel).getByText("150")).toBeInTheDocument();
          expect(within(kbPanel).getByText("85 ms")).toBeInTheDocument();
        }
      });
    });

    it("should display tools by frequency", async () => {
      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByText("Analytics"));

      await waitFor(() => {
        expect(screen.getByText("Tools by Frequency")).toBeInTheDocument();
        expect(screen.getByText("kb_search")).toBeInTheDocument();
        expect(screen.getByText("kb_read")).toBeInTheDocument();
        expect(screen.getByText("web_search")).toBeInTheDocument();
      });
    });
  });

  describe("refresh functionality", () => {
    it("should call refreshAll when refresh is clicked", () => {
      const mockRefresh = vi.fn();
      vi.mocked(useVoiceMonitor).mockReturnValue({
        ...defaultVoiceMonitorReturn,
        refreshAll: mockRefresh,
      });

      render(<VoiceMonitorPage />);

      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
