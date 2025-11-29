/**
 * Tests for AuditLogViewer component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLogViewer } from "../AuditLogViewer";

// Mock the useAuditLogs hook
vi.mock("../../../hooks/useAuditLogs", () => ({
  useAuditLogs: vi.fn(),
}));

import { useAuditLogs } from "../../../hooks/useAuditLogs";

const mockRefresh = vi.fn();
const mockSetOffset = vi.fn();
const mockSetActionFilter = vi.fn();
const mockExportLogs = vi.fn();

const mockLogs = [
  {
    id: "log-1",
    timestamp: "2024-01-15T12:00:00Z",
    action: "auth.login_success",
    user_id: "user-123",
    user_email: "admin@example.com",
    resource_type: "user",
    resource_id: "user-123",
    success: true,
    details: "Login from Chrome browser",
    ip_address: "192.168.1.1",
    request_id: "req-abc",
  },
  {
    id: "log-2",
    timestamp: "2024-01-15T11:55:00Z",
    action: "auth.2fa_enabled",
    user_id: "user-456",
    user_email: "user@example.com",
    resource_type: "user",
    resource_id: "user-456",
    success: true,
    details: "2FA enabled via authenticator app",
    ip_address: "192.168.1.2",
    request_id: "req-def",
  },
  {
    id: "log-3",
    timestamp: "2024-01-15T11:50:00Z",
    action: "auth.login_failed",
    user_id: null,
    user_email: null,
    resource_type: null,
    resource_id: null,
    success: false,
    details: "Invalid credentials",
    ip_address: "192.168.1.3",
    request_id: "req-ghi",
  },
];

const defaultMockHook = {
  logs: mockLogs,
  total: 100,
  loading: false,
  error: null,
  offset: 0,
  limit: 50,
  refresh: mockRefresh,
  setOffset: mockSetOffset,
  setActionFilter: mockSetActionFilter,
  actionFilter: null,
  exportLogs: mockExportLogs,
};

describe("AuditLogViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuditLogs).mockReturnValue(defaultMockHook);
  });

  describe("initial render", () => {
    it("renders the component with header", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Security Audit Log")).toBeInTheDocument();
      expect(screen.getByText("100 events")).toBeInTheDocument();
    });

    it("renders control buttons", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Export CSV")).toBeInTheDocument();
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });

    it("renders action filter dropdown", () => {
      render(<AuditLogViewer />);

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByText("All Actions")).toBeInTheDocument();
    });

    it("renders table headers", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Timestamp")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Resource")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("IP")).toBeInTheDocument();
    });
  });

  describe("log entries display", () => {
    it("renders log entries", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("admin@example.com")).toBeInTheDocument();
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    it("displays formatted action names", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Login Success")).toBeInTheDocument();
      expect(screen.getByText("2fa Enabled")).toBeInTheDocument();
      expect(screen.getByText("Login Failed")).toBeInTheDocument();
    });

    it("displays success and failed status badges", () => {
      render(<AuditLogViewer />);

      const successBadges = screen.getAllByText("Success");
      const failedBadges = screen.getAllByText("Failed");

      expect(successBadges.length).toBe(2);
      expect(failedBadges.length).toBe(1);
    });

    it("displays IP addresses", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
      expect(screen.getByText("192.168.1.2")).toBeInTheDocument();
      expect(screen.getByText("192.168.1.3")).toBeInTheDocument();
    });

    it("displays 'System' for entries without user email", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("expands row details when clicked", async () => {
      render(<AuditLogViewer />);

      // Details should not be visible initially
      expect(
        screen.queryByText("Login from Chrome browser"),
      ).not.toBeInTheDocument();

      // Click on the first row
      const rows = document.querySelectorAll("tbody tr");
      await userEvent.click(rows[0]);

      // Details should now be visible
      expect(screen.getByText("Login from Chrome browser")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading message when loading with no logs", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        loading: true,
        logs: [],
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Loading audit logs...")).toBeInTheDocument();
    });

    it("shows Loading... text on refresh button when loading", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty message when no logs exist", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        logs: [],
        total: 0,
      });

      render(<AuditLogViewer />);

      expect(
        screen.getByText("No audit log entries found"),
      ).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("displays error message when error is present", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        error: "Failed to load audit logs",
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Failed to load audit logs")).toBeInTheDocument();
    });
  });

  describe("filtering", () => {
    it("calls setActionFilter when filter is changed", async () => {
      render(<AuditLogViewer />);

      const filterSelect = screen.getByRole("combobox");
      await userEvent.selectOptions(filterSelect, "auth.login");

      expect(mockSetActionFilter).toHaveBeenCalledWith("auth.login");
      expect(mockSetOffset).toHaveBeenCalledWith(0);
    });

    it("calls setActionFilter with null when All Actions is selected", async () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        actionFilter: "auth.login",
      });

      render(<AuditLogViewer />);

      const filterSelect = screen.getByRole("combobox");
      await userEvent.selectOptions(filterSelect, "");

      expect(mockSetActionFilter).toHaveBeenCalledWith(null);
    });
  });

  describe("refresh functionality", () => {
    it("calls refresh when Refresh button is clicked", async () => {
      render(<AuditLogViewer />);

      await userEvent.click(screen.getByText("Refresh"));

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("disables refresh button when loading", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Loading...")).toBeDisabled();
    });
  });

  describe("export functionality", () => {
    it("calls exportLogs when Export CSV button is clicked", async () => {
      render(<AuditLogViewer />);

      await userEvent.click(screen.getByText("Export CSV"));

      expect(mockExportLogs).toHaveBeenCalledTimes(1);
    });
  });

  describe("pagination", () => {
    it("displays pagination info", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Showing 1 - 50 of 100")).toBeInTheDocument();
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    it("disables Previous button on first page", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Previous")).toBeDisabled();
    });

    it("enables Next button when there are more pages", () => {
      render(<AuditLogViewer />);

      expect(screen.getByText("Next")).not.toBeDisabled();
    });

    it("calls setOffset when Next button is clicked", async () => {
      render(<AuditLogViewer />);

      await userEvent.click(screen.getByText("Next"));

      expect(mockSetOffset).toHaveBeenCalledWith(50);
    });

    it("calls setOffset when Previous button is clicked", async () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        offset: 50,
      });

      render(<AuditLogViewer />);

      await userEvent.click(screen.getByText("Previous"));

      expect(mockSetOffset).toHaveBeenCalledWith(0);
    });

    it("disables Next button on last page", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        offset: 50,
        total: 100,
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Next")).toBeDisabled();
    });

    it("updates page info when on different page", () => {
      vi.mocked(useAuditLogs).mockReturnValue({
        ...defaultMockHook,
        offset: 50,
        total: 100,
      });

      render(<AuditLogViewer />);

      expect(screen.getByText("Showing 51 - 100 of 100")).toBeInTheDocument();
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    });
  });

  describe("action icons", () => {
    it("displays appropriate icons for different actions", () => {
      render(<AuditLogViewer />);

      // Check that icons are rendered (multiple entries may have same icon)
      expect(screen.getAllByText("🔑").length).toBeGreaterThanOrEqual(1); // login
      expect(screen.getAllByText("🔐").length).toBeGreaterThanOrEqual(1); // 2fa
    });
  });
});
