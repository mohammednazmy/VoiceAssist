/**
 * Tests for LogViewer component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { LogViewer, LogEntry } from "../LogViewer";
import { fetchAPI } from "../../../lib/api";
import {
  websocketService,
  ConnectionStatus,
  WebSocketEvent,
} from "../../../services/websocket";

// Mock fetchAPI
vi.mock("../../../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

// Mock websocket service
vi.mock("../../../services/websocket", () => ({
  websocketService: {
    getStatus: vi.fn(),
    subscribeStatus: vi.fn(),
    subscribeMessages: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

const mockLogs: LogEntry[] = [
  {
    id: "log-1",
    timestamp: new Date().toISOString(),
    level: "error",
    message: "Database connection failed",
    service: "api",
  },
  {
    id: "log-2",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    level: "warn",
    message: "High memory usage detected",
    service: "worker",
  },
  {
    id: "log-3",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    level: "info",
    message: "Request processed successfully",
    service: "api",
  },
  {
    id: "log-4",
    timestamp: new Date(Date.now() - 180000).toISOString(),
    level: "debug",
    message: "Processing request payload",
    service: "api",
  },
];

describe("LogViewer", () => {
  let statusCallback: ((status: ConnectionStatus) => void) | null = null;
  let messageCallback: ((event: WebSocketEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    statusCallback = null;
    messageCallback = null;

    // Default mock implementations
    vi.mocked(fetchAPI).mockResolvedValue({ logs: mockLogs });
    vi.mocked(websocketService.getStatus).mockReturnValue("closed");
    vi.mocked(websocketService.subscribeStatus).mockImplementation(
      (callback) => {
        statusCallback = callback;
        return () => {
          statusCallback = null;
        };
      },
    );
    vi.mocked(websocketService.subscribeMessages).mockImplementation(
      (callback) => {
        messageCallback = callback;
        return () => {
          messageCallback = null;
        };
      },
    );
  });

  afterEach(() => {
    statusCallback = null;
    messageCallback = null;
  });

  describe("rendering", () => {
    it("renders heading", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Logs")).toBeInTheDocument();
      });
    });

    it("renders connection status", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText(/WebSocket status:/)).toBeInTheDocument();
      });
    });

    it("renders refresh button", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Refresh" }),
        ).toBeInTheDocument();
      });
    });

    it("renders filter controls", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search logs")).toBeInTheDocument();
      });
    });

    it("renders table headers", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Timestamp")).toBeInTheDocument();
        expect(screen.getByText("Level")).toBeInTheDocument();
        expect(screen.getByText("Service")).toBeInTheDocument();
        expect(screen.getByText("Message")).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("shows loading message while fetching", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      render(<LogViewer />);

      expect(screen.getByText("Loading logs…")).toBeInTheDocument();
    });
  });

  describe("log display", () => {
    it("displays log entries after loading", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("High memory usage detected"),
        ).toBeInTheDocument();
      });
    });

    it("displays log levels with styling", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("error")).toBeInTheDocument();
        expect(screen.getByText("warn")).toBeInTheDocument();
        expect(screen.getByText("info")).toBeInTheDocument();
        expect(screen.getByText("debug")).toBeInTheDocument();
      });
    });

    it("displays service names", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        const apiServices = screen.getAllByText("api");
        expect(apiServices.length).toBeGreaterThan(0);
        expect(screen.getByText("worker")).toBeInTheDocument();
      });
    });

    it("shows dash for missing service", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        logs: [{ ...mockLogs[0], service: undefined }],
      });

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("-")).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("shows message when no logs match filters", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ logs: [] });

      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("No logs match the selected filters."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("shows error message on API failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("API Error")).toBeInTheDocument();
      });
    });

    it("shows fallback error message for unknown errors", async () => {
      vi.mocked(fetchAPI).mockRejectedValue("unknown");

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Unable to load logs")).toBeInTheDocument();
      });
    });
  });

  describe("connection status", () => {
    it("shows Idle when not connected", async () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Idle")).toBeInTheDocument();
      });
    });

    it("shows Streaming when connected", async () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("open");

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Streaming")).toBeInTheDocument();
      });
    });

    it("updates status when WebSocket status changes", async () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");

      render(<LogViewer />);

      await waitFor(() => {
        expect(screen.getByText("Idle")).toBeInTheDocument();
      });

      // Simulate status change
      act(() => {
        if (statusCallback) {
          statusCallback("open");
        }
      });

      expect(screen.getByText("Streaming")).toBeInTheDocument();
    });
  });

  describe("refresh functionality", () => {
    it("refetches logs when refresh clicked", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("filtering", () => {
    it("fetches with timeframe parameter", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("range=1h"),
        );
      });
    });

    it("refetches when timeframe changes", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByRole("button", { name: "6h" }));

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("range=6h"),
        );
      });
    });

    it("filters by level locally", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
      });

      // Change level filter to error
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "error" },
      });

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
        expect(
          screen.queryByText("High memory usage detected"),
        ).not.toBeInTheDocument();
      });
    });

    it("filters by search text locally", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
      });

      // Search for "memory"
      fireEvent.change(screen.getByPlaceholderText("Search logs"), {
        target: { value: "memory" },
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Database connection failed"),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText("High memory usage detected"),
        ).toBeInTheDocument();
      });
    });

    it("filters by service locally", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
      });

      // Filter by worker service
      fireEvent.change(screen.getByPlaceholderText(/Service/), {
        target: { value: "worker" },
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Database connection failed"),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText("High memory usage detected"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("WebSocket lifecycle", () => {
    it("connects to WebSocket on mount", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(websocketService.connect).toHaveBeenCalled();
      });
    });

    it("subscribes to status updates", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(websocketService.subscribeStatus).toHaveBeenCalled();
      });
    });

    it("subscribes to messages", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(websocketService.subscribeMessages).toHaveBeenCalled();
      });
    });

    it("disconnects on unmount", async () => {
      const { unmount } = render(<LogViewer />);

      await waitFor(() => {
        expect(websocketService.connect).toHaveBeenCalled();
      });

      unmount();

      expect(websocketService.disconnect).toHaveBeenCalled();
    });
  });

  describe("real-time updates", () => {
    it("adds new log from WebSocket event", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(
          screen.getByText("Database connection failed"),
        ).toBeInTheDocument();
      });

      // Simulate incoming log event
      const newLog: LogEntry = {
        id: "log-new",
        timestamp: new Date().toISOString(),
        level: "error",
        message: "New real-time error",
        service: "realtime",
      };

      act(() => {
        if (messageCallback) {
          messageCallback({
            type: "log",
            payload: newLog,
          } as WebSocketEvent);
        }
      });

      expect(screen.getByText("New real-time error")).toBeInTheDocument();
    });

    it("adds new log for logs:new event type", async () => {
      render(<LogViewer />);

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });

      const newLog: LogEntry = {
        id: "log-streamed",
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Streamed log message",
        service: "stream",
      };

      act(() => {
        if (messageCallback) {
          messageCallback({
            type: "logs:new",
            payload: newLog,
          } as WebSocketEvent);
        }
      });

      expect(screen.getByText("Streamed log message")).toBeInTheDocument();
    });
  });

  describe("level badge styling", () => {
    it("applies error styling to error level", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        logs: [mockLogs[0]], // error log
      });

      render(<LogViewer />);

      await waitFor(() => {
        const errorBadge = screen.getByText("error");
        expect(errorBadge).toHaveClass("text-red-300");
      });
    });

    it("applies warn styling to warn level", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        logs: [mockLogs[1]], // warn log
      });

      render(<LogViewer />);

      await waitFor(() => {
        const warnBadge = screen.getByText("warn");
        expect(warnBadge).toHaveClass("text-amber-200");
      });
    });

    it("applies info styling to info level", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        logs: [mockLogs[2]], // info log
      });

      render(<LogViewer />);

      await waitFor(() => {
        const infoBadge = screen.getByText("info");
        expect(infoBadge).toHaveClass("text-blue-200");
      });
    });

    it("applies debug styling to debug level", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        logs: [mockLogs[3]], // debug log
      });

      render(<LogViewer />);

      await waitFor(() => {
        const debugBadge = screen.getByText("debug");
        expect(debugBadge).toHaveClass("text-slate-200");
      });
    });
  });
});
