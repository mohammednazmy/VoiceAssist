/**
 * Tests for ServiceStatus component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ServiceStatus } from "../ServiceStatus";
import {
  websocketService,
  ConnectionStatus,
} from "../../../services/websocket";

// Mock the websocket service
vi.mock("../../../services/websocket", () => ({
  websocketService: {
    getStatus: vi.fn(),
    subscribeStatus: vi.fn(),
    connect: vi.fn(),
    forceReconnect: vi.fn(),
  },
  ConnectionStatus: {
    connecting: "connecting",
    open: "open",
    reconnecting: "reconnecting",
    closed: "closed",
    error: "error",
  },
}));

describe("ServiceStatus", () => {
  let statusCallback: ((status: ConnectionStatus) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    statusCallback = null;

    // Default mock implementations
    vi.mocked(websocketService.getStatus).mockReturnValue("closed");
    vi.mocked(websocketService.subscribeStatus).mockImplementation(
      (callback) => {
        statusCallback = callback;
        return () => {
          statusCallback = null;
        };
      },
    );
    vi.mocked(websocketService.connect).mockImplementation(() => {});
    vi.mocked(websocketService.forceReconnect).mockImplementation(() => {});
  });

  afterEach(() => {
    statusCallback = null;
  });

  it("renders initial status from websocketService", () => {
    vi.mocked(websocketService.getStatus).mockReturnValue("open");
    render(<ServiceStatus />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("subscribes to status updates on mount", () => {
    render(<ServiceStatus />);
    expect(websocketService.subscribeStatus).toHaveBeenCalled();
  });

  it("calls connect on mount", () => {
    render(<ServiceStatus />);
    expect(websocketService.connect).toHaveBeenCalled();
  });

  describe("status display", () => {
    it("displays 'Live' for open status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("open");
      render(<ServiceStatus />);
      expect(screen.getByText("Live")).toBeInTheDocument();
    });

    it("displays 'Connecting' for connecting status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("connecting");
      render(<ServiceStatus />);
      expect(screen.getByText("Connecting")).toBeInTheDocument();
    });

    it("displays 'Reconnecting' for reconnecting status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("reconnecting");
      render(<ServiceStatus />);
      expect(screen.getByText("Reconnecting")).toBeInTheDocument();
    });

    it("displays 'Disconnected' for closed status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");
      render(<ServiceStatus />);
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("displays 'Error' for error status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("error");
      render(<ServiceStatus />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });
  });

  describe("status styling", () => {
    it("applies green styling for open status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("open");
      render(<ServiceStatus />);
      const statusBadge = screen.getByText("Live").closest("div");
      expect(statusBadge).toHaveClass("text-emerald-400");
    });

    it("applies amber styling for connecting status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("connecting");
      render(<ServiceStatus />);
      const statusBadge = screen.getByText("Connecting").closest("div");
      expect(statusBadge).toHaveClass("text-amber-400");
    });

    it("applies red styling for error status", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("error");
      render(<ServiceStatus />);
      const statusBadge = screen.getByText("Error").closest("div");
      expect(statusBadge).toHaveClass("text-red-400");
    });
  });

  describe("offline message", () => {
    it("does not show offline message when open", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("open");
      render(<ServiceStatus />);
      expect(screen.queryByText(/Admin event stream/)).not.toBeInTheDocument();
    });

    it("shows offline message when closed", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");
      render(<ServiceStatus />);
      expect(
        screen.getByText("Admin event stream offline"),
      ).toBeInTheDocument();
    });

    it("shows retrying message when reconnecting", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("reconnecting");
      render(<ServiceStatus />);
      expect(
        screen.getByText("Admin event stream retrying"),
      ).toBeInTheDocument();
    });
  });

  describe("retry button", () => {
    it("shows retry button when closed", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");
      render(<ServiceStatus />);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("shows retry button when error", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("error");
      render(<ServiceStatus />);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("does not show retry button when open", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("open");
      render(<ServiceStatus />);
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
    });

    it("does not show retry button when connecting", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("connecting");
      render(<ServiceStatus />);
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
    });

    it("calls forceReconnect when retry button clicked", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");
      render(<ServiceStatus />);
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(websocketService.forceReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("status updates", () => {
    it("updates display when status changes", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("connecting");
      render(<ServiceStatus />);
      expect(screen.getByText("Connecting")).toBeInTheDocument();

      // Simulate status change via callback
      act(() => {
        if (statusCallback) {
          statusCallback("open");
        }
      });

      expect(screen.getByText("Live")).toBeInTheDocument();
    });

    it("updates from closed to open", () => {
      vi.mocked(websocketService.getStatus).mockReturnValue("closed");
      render(<ServiceStatus />);
      expect(screen.getByText("Disconnected")).toBeInTheDocument();

      act(() => {
        if (statusCallback) {
          statusCallback("open");
        }
      });

      expect(screen.getByText("Live")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
    });
  });
});
