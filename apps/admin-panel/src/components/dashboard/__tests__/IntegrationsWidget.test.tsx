/**
 * Tests for IntegrationsWidget component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntegrationsWidget } from "../IntegrationsWidget";
import { useIntegrations } from "../../../hooks/useIntegrations";

// Mock the useIntegrations hook
vi.mock("../../../hooks/useIntegrations", () => ({
  useIntegrations: vi.fn(),
}));

const mockHealth = {
  overall_status: "healthy" as const,
  connected: 5,
  degraded: 1,
  errors: 0,
  not_configured: 2,
  total_integrations: 8,
  checked_at: new Date().toISOString(),
};

// Helper to create a complete mock return value
const createMockReturn = (overrides: Partial<ReturnType<typeof useIntegrations>> = {}) => ({
  integrations: [],
  health: null,
  loading: false,
  error: null,
  lastUpdated: null,
  refreshAll: vi.fn(),
  getIntegrationDetail: vi.fn(),
  testIntegration: vi.fn(),
  ...overrides,
});

const renderWithRouter = (component: React.ReactNode) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe("IntegrationsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("renders loading skeleton when loading and no health data", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        loading: true,
      }));

      const { container } = renderWithRouter(<IntegrationsWidget />);
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("renders loading skeleton with placeholder cards", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        loading: true,
      }));

      const { container } = renderWithRouter(<IntegrationsWidget />);
      // Should have 4 placeholder cards
      const placeholders = container.querySelectorAll(".grid > div");
      expect(placeholders.length).toBe(4);
    });
  });

  describe("error state", () => {
    it("renders error message when error occurs", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        error: "Failed to fetch",
      }));

      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText("Error loading")).toBeInTheDocument();
    });

    it("renders integrations title in error state", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        error: "Failed to fetch",
      }));

      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText(/Integrations/)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("returns null when no health data and not loading", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn());

      const { container } = renderWithRouter(<IntegrationsWidget />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("healthy state", () => {
    beforeEach(() => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: mockHealth,
      }));
    });

    it("renders integrations title", () => {
      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText(/Integrations/)).toBeInTheDocument();
    });

    it("renders overall status badge", () => {
      renderWithRouter(<IntegrationsWidget />);
      // The badge contains "● Healthy" for healthy status
      expect(screen.getByText(/● Healthy/)).toBeInTheDocument();
    });

    it("renders connected count", () => {
      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("renders degraded count", () => {
      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("Degraded")).toBeInTheDocument();
    });

    it("renders errors count", () => {
      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("Errors")).toBeInTheDocument();
    });

    it("renders not configured count", () => {
      renderWithRouter(<IntegrationsWidget />);
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Not Set")).toBeInTheDocument();
    });

    it("renders link to integrations page", () => {
      renderWithRouter(<IntegrationsWidget />);
      const link = screen.getByRole("link", {
        name: /View all 8 integrations/,
      });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/integrations");
    });
  });

  describe("status badge styling", () => {
    it("applies green styling for healthy status", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: { ...mockHealth, overall_status: "healthy" },
      }));

      renderWithRouter(<IntegrationsWidget />);
      // The badge contains "● Healthy" for healthy status
      const badge = screen.getByText(/● Healthy/).closest("span");
      expect(badge).toHaveClass("text-green-400");
    });

    it("applies yellow styling for degraded status", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: { ...mockHealth, overall_status: "degraded" },
      }));

      renderWithRouter(<IntegrationsWidget />);
      // Use a more specific selector to find the status badge (not the count label)
      // The status badge is inside the header flex container
      const headerBadge = screen
        .getAllByText("Degraded")
        .find((el) => el.closest("span")?.classList.contains("border"));
      expect(headerBadge?.closest("span")).toHaveClass("text-yellow-400");
    });

    it("applies red styling for unhealthy status", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: { ...mockHealth, overall_status: "unhealthy" },
      }));

      renderWithRouter(<IntegrationsWidget />);
      const badge = screen.getByText("Unhealthy").closest("span");
      expect(badge).toHaveClass("text-red-400");
    });

    it("applies red styling for critical status", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: { ...mockHealth, overall_status: "critical" },
      }));

      renderWithRouter(<IntegrationsWidget />);
      const badge = screen.getByText("Critical").closest("span");
      expect(badge).toHaveClass("text-red-400");
    });

    it("applies default styling for unknown status", () => {
      // Cast to any to test unknown status handling
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        health: { ...mockHealth, overall_status: "unknown" as "healthy" },
      }));

      renderWithRouter(<IntegrationsWidget />);
      const badge = screen.getByText("Unknown").closest("span");
      expect(badge).toHaveClass("text-slate-400");
    });
  });

  describe("hook configuration", () => {
    it("calls useIntegrations with auto-refresh enabled", () => {
      vi.mocked(useIntegrations).mockReturnValue(createMockReturn({
        loading: true,
      }));

      renderWithRouter(<IntegrationsWidget />);
      expect(useIntegrations).toHaveBeenCalledWith({
        autoRefresh: true,
        refreshIntervalMs: 60000,
      });
    });
  });
});
