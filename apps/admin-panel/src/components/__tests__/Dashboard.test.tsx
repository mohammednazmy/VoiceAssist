/**
 * Tests for Dashboard component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { useAdminSummary } from "../../hooks/useAdminSummary";

// Mock the useAdminSummary hook
vi.mock("../../hooks/useAdminSummary", () => ({
  useAdminSummary: vi.fn(),
}));

const mockSummary = {
  total_users: 100,
  active_users: 50,
  admin_users: 5,
  timestamp: "2025-11-28T12:00:00.000Z",
};

const createMockHookReturn = (overrides = {}) => ({
  summary: mockSummary,
  loading: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
  silentRefresh: vi.fn().mockResolvedValue(undefined),
  lastFetched: new Date(),
  fetchCount: 1,
  isStale: false,
  ...overrides,
});

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the system overview heading", () => {
    vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

    render(<Dashboard />);
    expect(screen.getByText("System Overview")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

    render(<Dashboard />);
    expect(
      screen.getByText(/High-level status of the VoiceAssist deployment/),
    ).toBeInTheDocument();
  });

  it("renders the metric cards section", () => {
    vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

    render(<Dashboard />);
    // Check for the 3 metric cards (currently hardcoded values)
    expect(screen.getByText("Active sessions")).toBeInTheDocument();
    expect(screen.getByText("Tool errors (24h)")).toBeInTheDocument();
    expect(screen.getByText("Indexing jobs")).toBeInTheDocument();
  });

  it("displays hardcoded metric values", () => {
    vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

    render(<Dashboard />);
    // These are currently hardcoded in the Dashboard component
    expect(screen.getByText("12")).toBeInTheDocument(); // Active sessions
    expect(screen.getByText("3")).toBeInTheDocument(); // Tool errors
    expect(screen.getByText("5")).toBeInTheDocument(); // Indexing jobs
  });

  it("renders data source hints", () => {
    vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

    render(<Dashboard />);
    expect(
      screen.getByText("Aggregate from chat-service metrics"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("From Prometheus tool_errors_total"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("From KBIndexer state machine"),
    ).toBeInTheDocument();
  });

  describe("with loading state", () => {
    it("renders the dashboard structure while loading", () => {
      vi.mocked(useAdminSummary).mockReturnValue(
        createMockHookReturn({ summary: null, loading: true }),
      );

      render(<Dashboard />);
      // Dashboard should still render its structure
      expect(screen.getByText("System Overview")).toBeInTheDocument();
    });
  });

  describe("hook integration", () => {
    it("calls useAdminSummary hook", () => {
      vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

      render(<Dashboard />);
      expect(useAdminSummary).toHaveBeenCalled();
    });
  });

  describe("layout structure", () => {
    it("renders as a section element", () => {
      vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

      const { container } = render(<Dashboard />);
      expect(container.querySelector("section")).toBeInTheDocument();
    });

    it("has a 3-column grid for metrics", () => {
      vi.mocked(useAdminSummary).mockReturnValue(createMockHookReturn());

      const { container } = render(<Dashboard />);
      const grid = container.querySelector(".grid-cols-3");
      expect(grid).toBeInTheDocument();
    });
  });
});
