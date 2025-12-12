/**
 * Tests for SecurityPage - PHI rules, 2FA, API keys
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SecurityPage } from "./SecurityPage";

// Mock hooks
vi.mock("../hooks/usePHI", () => ({
  usePHI: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// Mock @voiceassist/ui
vi.mock("@voiceassist/ui", () => ({
  HelpButton: () => <button data-testid="help-button">Help</button>,
}));

// Mock child components
vi.mock("../components/security/TwoFactorSettings", () => ({
  TwoFactorSettings: () => (
    <div data-testid="two-factor-settings">Two Factor Settings</div>
  ),
}));

vi.mock("../components/security/AuditLogViewer", () => ({
  AuditLogViewer: () => (
    <div data-testid="audit-log-viewer">Audit Log Viewer</div>
  ),
}));

vi.mock("../components/security/UserAPIKeyManager", () => ({
  UserAPIKeyManager: () => (
    <div data-testid="api-key-manager">API Key Manager</div>
  ),
}));

import { usePHI } from "../hooks/usePHI";
import { useAuth } from "../contexts/AuthContext";

const mockRules = [
  {
    id: "rule-ssn",
    name: "SSN Detection",
    description: "Detects Social Security Numbers",
    phi_type: "ssn" as const,
    status: "enabled" as const,
    priority: 1,
    is_builtin: true,
    detection_count: 500,
  },
  {
    id: "rule-phone",
    name: "Phone Number Detection",
    description: "Detects phone numbers",
    phi_type: "phone" as const,
    status: "disabled" as const,
    priority: 2,
    is_builtin: false,
    detection_count: 150,
  },
];

const mockStats = {
  total_detections: 1250,
  detections_today: 45,
  detections_this_week: 280,
  routing_stats: {
    routed_local: 800,
    redacted_cloud: 450,
    blocked: 0,
  },
  by_type: { ssn: 500, phone: 150 },
  by_day: [{ date: "2024-01-15", count: 45, by_type: { ssn: 25, phone: 20 } }],
};

const mockRouting = {
  mode: "hybrid" as const,
  confidence_threshold: 0.85,
  redact_before_cloud: true,
  audit_all_phi: true,
  local_llm_enabled: true,
  local_llm_url: "http://localhost:11434",
};

const mockHealth = {
  overall: "healthy" as const,
  components: {
    detector: "healthy",
    redis_config: "healthy",
    local_llm: "healthy",
    audit_logging: "healthy",
  },
  routing_mode: "hybrid" as const,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockEvents = [
  {
    id: "event-1",
    timestamp: "2024-01-15T12:00:00Z",
    phi_types: ["ssn", "phone"],
    confidence: 0.95,
    action_taken: "routed_local",
  },
];

const defaultPHIReturn = {
  rules: mockRules,
  rulesInfo: { total: 2, enabled: 1 },
  stats: mockStats,
  routing: mockRouting,
  health: mockHealth,
  events: mockEvents,
  loading: false,
  error: null,
  lastUpdated: new Date(),
  refreshAll: vi.fn(),
  updateRule: vi.fn().mockResolvedValue(true),
  testPHI: vi.fn().mockResolvedValue({
    contains_phi: true,
    phi_types: ["ssn"],
    confidence: 0.95,
    redacted_text: "SSN: [REDACTED]",
  }),
  redactPHI: vi.fn().mockResolvedValue({
    redacted_text: "SSN: [REDACTED]",
    redaction_count: 1,
  }),
  updateRouting: vi.fn().mockResolvedValue(true),
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

describe("SecurityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePHI).mockReturnValue(defaultPHIReturn);
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
  });

  describe("rendering", () => {
    it("should render page title", () => {
      render(<SecurityPage />);

      expect(screen.getByText("Security & PHI")).toBeInTheDocument();
    });

    it("should render health status badge", () => {
      render(<SecurityPage />);

      expect(screen.getByText(/healthy/i)).toBeInTheDocument();
    });

    it("should render refresh button", () => {
      render(<SecurityPage />);

      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument();
    });

    it("should render TwoFactorSettings component", () => {
      render(<SecurityPage />);

      expect(screen.getByTestId("two-factor-settings")).toBeInTheDocument();
    });

    it("should render UserAPIKeyManager component", () => {
      render(<SecurityPage />);

      expect(screen.getByTestId("api-key-manager")).toBeInTheDocument();
    });

    it("should render AuditLogViewer component", () => {
      render(<SecurityPage />);

      expect(screen.getByTestId("audit-log-viewer")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading skeleton when loading", () => {
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        loading: true,
        health: null,
      });

      render(<SecurityPage />);

      expect(screen.getByText("Security & PHI")).toBeInTheDocument();
      // Should show skeleton loading cards
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("should show error message when error occurs", () => {
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        error: "Failed to load PHI data",
      });

      render(<SecurityPage />);

      expect(screen.getByText("Failed to load PHI data")).toBeInTheDocument();
    });
  });

  describe("stats display", () => {
    it("should display total detections", () => {
      render(<SecurityPage />);

      expect(screen.getByText("1250")).toBeInTheDocument();
      expect(screen.getByText("Total Detections")).toBeInTheDocument();
    });

    it("should display today's detections", () => {
      render(<SecurityPage />);

      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText("Today")).toBeInTheDocument();
    });

    it("should display this week's detections", () => {
      render(<SecurityPage />);

      expect(screen.getByText("280")).toBeInTheDocument();
      expect(screen.getByText("This Week")).toBeInTheDocument();
    });

    it("should display routing stats", () => {
      render(<SecurityPage />);

      // Check that routing stats are displayed
      expect(screen.getByText("800")).toBeInTheDocument();
      expect(screen.getByText("450")).toBeInTheDocument();
    });

    it("should display redacted count", () => {
      render(<SecurityPage />);

      expect(screen.getByText("450")).toBeInTheDocument();
      expect(screen.getByText("Redacted")).toBeInTheDocument();
    });
  });

  describe("PHI rules", () => {
    it("should display PHI detection rules", () => {
      render(<SecurityPage />);

      expect(screen.getByText("PHI Detection Rules")).toBeInTheDocument();
      expect(screen.getByText("SSN Detection")).toBeInTheDocument();
      expect(screen.getByText("Phone Number Detection")).toBeInTheDocument();
    });

    it("should display rule status badges", () => {
      render(<SecurityPage />);

      expect(screen.getByText("enabled")).toBeInTheDocument();
      expect(screen.getByText("disabled")).toBeInTheDocument();
    });

    it("should show rule count info", () => {
      render(<SecurityPage />);

      expect(screen.getByText("1 of 2 rules enabled")).toBeInTheDocument();
    });

    it("should toggle rule when switch is clicked", async () => {
      const mockUpdateRule = vi.fn().mockResolvedValue(true);
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        updateRule: mockUpdateRule,
      });

      render(<SecurityPage />);

      // Find toggle buttons (the toggle switches)
      const toggleButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) =>
            btn.className.includes("rounded-full") &&
            btn.className.includes("w-10"),
        );

      fireEvent.click(toggleButtons[0]);

      await waitFor(() => {
        expect(mockUpdateRule).toHaveBeenCalledWith("rule-ssn", "disabled");
      });
    });
  });

  describe("PHI test panel", () => {
    it("should render test panel", () => {
      render(<SecurityPage />);

      expect(screen.getByText("PHI Detection Test")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/enter text to test for phi/i),
      ).toBeInTheDocument();
    });

    it("should have detect and redact buttons", () => {
      render(<SecurityPage />);

      expect(
        screen.getByRole("button", { name: /detect phi/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /redact phi/i }),
      ).toBeInTheDocument();
    });

    it("should call testPHI when detect button clicked", async () => {
      const mockTestPHI = vi.fn().mockResolvedValue({
        contains_phi: true,
        phi_types: ["ssn"],
        confidence: 0.95,
        redacted_text: "SSN: [REDACTED]",
      });

      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        testPHI: mockTestPHI,
      });

      render(<SecurityPage />);

      const textarea = screen.getByPlaceholderText(/enter text to test/i);
      fireEvent.change(textarea, { target: { value: "SSN: 123-45-6789" } });

      fireEvent.click(screen.getByRole("button", { name: /detect phi/i }));

      await waitFor(() => {
        expect(mockTestPHI).toHaveBeenCalledWith("SSN: 123-45-6789");
      });
    });

    it("should display test results", async () => {
      const mockTestPHI = vi.fn().mockResolvedValue({
        contains_phi: true,
        phi_types: ["ssn"],
        confidence: 0.95,
        redacted_text: "SSN: [REDACTED]",
      });

      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        testPHI: mockTestPHI,
      });

      render(<SecurityPage />);

      const textarea = screen.getByPlaceholderText(/enter text to test/i);
      fireEvent.change(textarea, { target: { value: "SSN: 123-45-6789" } });
      fireEvent.click(screen.getByRole("button", { name: /detect phi/i }));

      await waitFor(() => {
        expect(screen.getByText("PHI Detected")).toBeInTheDocument();
        expect(screen.getByText("Confidence: 95%")).toBeInTheDocument();
      });
    });
  });

  describe("routing configuration", () => {
    it("should display routing configuration section", () => {
      render(<SecurityPage />);

      expect(screen.getByText("PHI Routing Configuration")).toBeInTheDocument();
    });

    it("should display current routing mode", () => {
      render(<SecurityPage />);

      // "Hybrid" should be the selected mode
      const hybridButton = screen.getByRole("button", { name: /hybrid/i });
      expect(hybridButton.className).toContain("bg-blue");
    });

    it("should display routing settings", () => {
      render(<SecurityPage />);

      expect(screen.getByText("Confidence Threshold:")).toBeInTheDocument();
      expect(screen.getByText("85%")).toBeInTheDocument();
      expect(screen.getByText("Redact Before Cloud:")).toBeInTheDocument();
      expect(screen.getByText("Audit All PHI:")).toBeInTheDocument();
    });

    it("should update routing mode when button clicked", async () => {
      const mockUpdateRouting = vi.fn().mockResolvedValue(true);
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        updateRouting: mockUpdateRouting,
      });

      render(<SecurityPage />);

      fireEvent.click(screen.getByRole("button", { name: /local only/i }));

      await waitFor(() => {
        expect(mockUpdateRouting).toHaveBeenCalledWith({ mode: "local_only" });
      });
    });
  });

  describe("recent events", () => {
    it("should display recent PHI detection events", () => {
      render(<SecurityPage />);

      expect(
        screen.getByText("Recent PHI Detection Events"),
      ).toBeInTheDocument();
    });

    it("should show event details in table", async () => {
      render(<SecurityPage />);

      // Event action should be displayed (formatPHIType converts routed_local to "Routed Local")
      await waitFor(() => {
        // Look for the confidence percentage in the events table
        const confidenceElements = screen.getAllByText("95%");
        expect(confidenceElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe("refresh functionality", () => {
    it("should call refreshAll when refresh button clicked", () => {
      const mockRefresh = vi.fn();
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        refreshAll: mockRefresh,
      });

      render(<SecurityPage />);

      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(mockRefresh).toHaveBeenCalled();
    });

    it("should show refreshing state", () => {
      vi.mocked(usePHI).mockReturnValue({
        ...defaultPHIReturn,
        loading: true,
      });

      render(<SecurityPage />);

      expect(screen.getByText("Refreshing...")).toBeInTheDocument();
    });
  });

  describe("non-admin restrictions", () => {
    it("should disable rule toggles for non-admins", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<SecurityPage />);

      // Toggle buttons should not be rendered for non-admins
      const toggleButtons = screen
        .queryAllByRole("button")
        .filter(
          (btn) =>
            btn.className.includes("rounded-full") &&
            btn.className.includes("w-10"),
        );

      expect(toggleButtons.length).toBe(0);
    });

    it("should disable routing mode buttons for non-admins", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<SecurityPage />);

      const localOnlyButton = screen.getByRole("button", {
        name: /local only/i,
      });
      expect(localOnlyButton).toBeDisabled();
    });
  });
});
