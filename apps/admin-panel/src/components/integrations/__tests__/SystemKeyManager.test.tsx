/**
 * Tests for SystemKeyManager component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemKeyManager } from "../SystemKeyManager";

// Mock the useSystemKeys hook
vi.mock("../../../hooks/useSystemKeys", () => ({
  useSystemKeys: vi.fn(),
}));

// Mock the AuthContext
vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useSystemKeys } from "../../../hooks/useSystemKeys";
import { useAuth } from "../../../contexts/AuthContext";

const mockRefreshKeys = vi.fn();
const mockUpdateKey = vi.fn();
const mockClearOverride = vi.fn();
const mockValidateKey = vi.fn();

const mockKeys = [
  {
    integration_id: "openai",
    key_name: "OPENAI_API_KEY",
    is_configured: true,
    source: "environment" as const,
    masked_value: "sk-...abc123",
    is_override: false,
    validation_status: "valid" as const,
    last_validated_at: "2024-01-15T12:00:00Z",
    updated_at: null,
  },
  {
    integration_id: "elevenlabs",
    key_name: "ELEVENLABS_API_KEY",
    is_configured: true,
    source: "database" as const,
    masked_value: "el-...xyz789",
    is_override: true,
    validation_status: "unknown" as const,
    last_validated_at: null,
    updated_at: "2024-01-14T10:00:00Z",
  },
  {
    integration_id: "pubmed",
    key_name: "PUBMED_API_KEY",
    is_configured: false,
    source: "not_configured" as const,
    masked_value: null,
    is_override: false,
    validation_status: null,
    last_validated_at: null,
    updated_at: null,
  },
];

const mockSummary = {
  total: 3,
  configured: 2,
  from_env: 1,
  from_db: 1,
  not_configured: 1,
};

const defaultMockHook = {
  keys: mockKeys,
  summary: mockSummary,
  loading: false,
  error: null,
  lastUpdated: new Date("2024-01-15T12:00:00Z"),
  refreshKeys: mockRefreshKeys,
  updateKey: mockUpdateKey,
  clearOverride: mockClearOverride,
  validateKey: mockValidateKey,
};

const defaultMockAuth = {
  isAdmin: true,
  isAuthenticated: true,
  user: { id: "user-1", email: "admin@example.com" },
};

describe("SystemKeyManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSystemKeys).mockReturnValue(defaultMockHook);
    vi.mocked(useAuth).mockReturnValue(defaultMockAuth);
    // Mock window.confirm
    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  describe("initial render", () => {
    it("renders the component with header", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("System API Keys")).toBeInTheDocument();
      expect(
        screen.getByText(/Manage external service credentials/),
      ).toBeInTheDocument();
    });

    it("displays summary stats", () => {
      render(<SystemKeyManager />);

      // The configured text includes surrounding elements, use regex
      expect(screen.getByText(/2\/3 configured/)).toBeInTheDocument();
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("Configured")).toBeInTheDocument();
      expect(screen.getByText("DB Overrides")).toBeInTheDocument();
      // "Not Set" appears both in summary and as badge - just check it exists
      expect(screen.getAllByText("Not Set").length).toBeGreaterThanOrEqual(1);
    });

    it("displays summary values", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("3")).toBeInTheDocument(); // Total
      // Check for configured value specifically (we need to find it in context)
      const configuredLabel = screen.getByText("Configured");
      expect(configuredLabel.previousSibling).toHaveTextContent("2");
    });

    it("renders refresh button", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });

    it("displays last updated time", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton when loading with no keys", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
        keys: [],
        summary: null,
      });

      render(<SystemKeyManager />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("shows Refreshing... on button when loading with existing keys", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<SystemKeyManager />);

      expect(screen.getByText("Refreshing...")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("displays error message when error is present", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        error: "Failed to load system keys",
      });

      render(<SystemKeyManager />);

      expect(
        screen.getByText("Failed to load system keys"),
      ).toBeInTheDocument();
    });
  });

  describe("key cards display", () => {
    it("renders key cards for all integrations", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("ElevenLabs")).toBeInTheDocument();
      expect(screen.getByText("PubMed")).toBeInTheDocument();
    });

    it("displays integration descriptions", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("GPT models and embeddings")).toBeInTheDocument();
      expect(screen.getByText("Text-to-speech")).toBeInTheDocument();
      expect(screen.getByText("Medical literature")).toBeInTheDocument();
    });

    it("displays masked key values", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("sk-...abc123")).toBeInTheDocument();
      expect(screen.getByText("el-...xyz789")).toBeInTheDocument();
    });

    it("shows .env badge for environment source", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText(".env")).toBeInTheDocument();
    });

    it("shows DB Override badge for database source", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("DB Override")).toBeInTheDocument();
    });

    it("shows Not Set badge for unconfigured keys", () => {
      render(<SystemKeyManager />);

      // "Not Set" appears in summary and as badge on unconfigured key card
      const notSetElements = screen.getAllByText("Not Set");
      expect(notSetElements.length).toBeGreaterThanOrEqual(2); // At least in summary + badge
    });

    it("shows checkmark for valid keys", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("✓")).toBeInTheDocument();
    });
  });

  describe("refresh functionality", () => {
    it("calls refreshKeys when Refresh button is clicked", async () => {
      render(<SystemKeyManager />);

      await userEvent.click(screen.getByText("Refresh"));

      expect(mockRefreshKeys).toHaveBeenCalledTimes(1);
    });

    it("disables refresh button when loading", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<SystemKeyManager />);

      expect(screen.getByText("Refreshing...")).toBeDisabled();
    });
  });

  describe("admin actions", () => {
    it("shows Update button for configured keys when admin", () => {
      render(<SystemKeyManager />);

      expect(screen.getAllByText("Update").length).toBeGreaterThanOrEqual(1);
    });

    it("shows Set Key button for unconfigured keys when admin", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("Set Key")).toBeInTheDocument();
    });

    it("shows Test button for configured keys when admin", () => {
      render(<SystemKeyManager />);

      expect(screen.getAllByText("Test").length).toBeGreaterThanOrEqual(1);
    });

    it("shows Clear Override button for DB override keys when admin", () => {
      render(<SystemKeyManager />);

      expect(screen.getByText("Clear Override")).toBeInTheDocument();
    });

    it("hides action buttons when not admin", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultMockAuth,
        isAdmin: false,
      });

      render(<SystemKeyManager />);

      expect(screen.queryByText("Update")).not.toBeInTheDocument();
      expect(screen.queryByText("Set Key")).not.toBeInTheDocument();
      expect(screen.queryByText("Test")).not.toBeInTheDocument();
      expect(screen.queryByText("Clear Override")).not.toBeInTheDocument();
    });
  });

  describe("update key flow", () => {
    it("shows edit form when Update button is clicked", async () => {
      render(<SystemKeyManager />);

      const updateButtons = screen.getAllByText("Update");
      await userEvent.click(updateButtons[0]);

      expect(
        screen.getByPlaceholderText("Enter new API key..."),
      ).toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("hides edit form when Cancel is clicked", async () => {
      render(<SystemKeyManager />);

      const updateButtons = screen.getAllByText("Update");
      await userEvent.click(updateButtons[0]);

      expect(
        screen.getByPlaceholderText("Enter new API key..."),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Cancel"));

      expect(
        screen.queryByPlaceholderText("Enter new API key..."),
      ).not.toBeInTheDocument();
    });

    it("calls updateKey when form is submitted", async () => {
      mockUpdateKey.mockResolvedValueOnce(undefined);

      render(<SystemKeyManager />);

      const updateButtons = screen.getAllByText("Update");
      await userEvent.click(updateButtons[0]);

      const input = screen.getByPlaceholderText("Enter new API key...");
      await userEvent.type(input, "sk-new-api-key-12345");

      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockUpdateKey).toHaveBeenCalledWith(
          "openai",
          "sk-new-api-key-12345",
        );
      });
    });

    it("disables Save button when input is empty", async () => {
      render(<SystemKeyManager />);

      const updateButtons = screen.getAllByText("Update");
      await userEvent.click(updateButtons[0]);

      expect(screen.getByText("Save")).toBeDisabled();
    });

    it("shows error when update fails", async () => {
      mockUpdateKey.mockRejectedValueOnce(new Error("Invalid API key format"));

      render(<SystemKeyManager />);

      const updateButtons = screen.getAllByText("Update");
      await userEvent.click(updateButtons[0]);

      const input = screen.getByPlaceholderText("Enter new API key...");
      await userEvent.type(input, "invalid-key");

      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(screen.getByText("Invalid API key format")).toBeInTheDocument();
      });
    });
  });

  describe("validate key flow", () => {
    it("calls validateKey when Test button is clicked", async () => {
      mockValidateKey.mockResolvedValueOnce({
        success: true,
        message: "API key is valid",
        latency_ms: 150,
      });

      render(<SystemKeyManager />);

      const testButtons = screen.getAllByText("Test");
      await userEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(mockValidateKey).toHaveBeenCalledWith("openai");
      });
    });

    it("shows validation success result", async () => {
      mockValidateKey.mockResolvedValueOnce({
        success: true,
        message: "API key is valid",
        latency_ms: 150,
      });

      render(<SystemKeyManager />);

      const testButtons = screen.getAllByText("Test");
      await userEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("API key is valid")).toBeInTheDocument();
        expect(screen.getByText("(150ms)")).toBeInTheDocument();
      });
    });

    it("shows validation failure result", async () => {
      mockValidateKey.mockResolvedValueOnce({
        success: false,
        message: "Invalid API key",
        latency_ms: 200,
      });

      render(<SystemKeyManager />);

      const testButtons = screen.getAllByText("Test");
      await userEvent.click(testButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Invalid API key")).toBeInTheDocument();
      });
    });

    it("shows Testing... while validation is in progress", async () => {
      let resolveValidate: (value: unknown) => void;
      const validatePromise = new Promise((resolve) => {
        resolveValidate = resolve;
      });
      mockValidateKey.mockReturnValueOnce(validatePromise);

      render(<SystemKeyManager />);

      const testButtons = screen.getAllByText("Test");
      await userEvent.click(testButtons[0]);

      expect(screen.getByText("Testing...")).toBeInTheDocument();

      resolveValidate!({
        success: true,
        message: "Valid",
        latency_ms: 100,
      });

      await waitFor(() => {
        expect(screen.queryByText("Testing...")).not.toBeInTheDocument();
      });
    });
  });

  describe("clear override flow", () => {
    it("calls clearOverride when Clear Override button is clicked and confirmed", async () => {
      mockClearOverride.mockResolvedValueOnce(undefined);

      render(<SystemKeyManager />);

      await userEvent.click(screen.getByText("Clear Override"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockClearOverride).toHaveBeenCalledWith("elevenlabs");
    });

    it("does not call clearOverride when confirmation is cancelled", async () => {
      vi.spyOn(window, "confirm").mockImplementationOnce(() => false);

      render(<SystemKeyManager />);

      await userEvent.click(screen.getByText("Clear Override"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockClearOverride).not.toHaveBeenCalled();
    });
  });

  describe("unknown integrations", () => {
    it("handles unknown integration IDs gracefully", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        keys: [
          {
            integration_id: "custom_service",
            key_name: "CUSTOM_SERVICE_KEY",
            is_configured: true,
            source: "environment" as const,
            masked_value: "xxx-...yyy",
            is_override: false,
            validation_status: "unknown" as const,
            last_validated_at: null,
            updated_at: null,
          },
        ],
        summary: {
          total: 1,
          configured: 1,
          from_env: 1,
          from_db: 0,
          not_configured: 0,
        },
      });

      render(<SystemKeyManager />);

      // Should format unknown ID nicely
      expect(screen.getByText("Custom Service")).toBeInTheDocument();
      expect(screen.getByText("External service")).toBeInTheDocument();
      expect(screen.getByText("🔗")).toBeInTheDocument();
    });
  });

  describe("validation status indicators", () => {
    it("shows X mark for invalid keys", () => {
      vi.mocked(useSystemKeys).mockReturnValue({
        ...defaultMockHook,
        keys: [
          {
            ...mockKeys[0],
            validation_status: "invalid" as const,
          },
        ],
      });

      render(<SystemKeyManager />);

      expect(screen.getByText("✗")).toBeInTheDocument();
    });
  });
});
