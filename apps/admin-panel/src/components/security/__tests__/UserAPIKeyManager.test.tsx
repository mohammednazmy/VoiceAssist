/**
 * Tests for UserAPIKeyManager component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserAPIKeyManager } from "../UserAPIKeyManager";

// Mock the useUserAPIKeys hook
vi.mock("../../../hooks/useUserAPIKeys", () => ({
  useUserAPIKeys: vi.fn(),
}));

import { useUserAPIKeys } from "../../../hooks/useUserAPIKeys";

const mockRefreshKeys = vi.fn();
const mockCreateKey = vi.fn();
const mockRevokeKey = vi.fn();

const mockKeys = [
  {
    id: "key-1",
    name: "Production API Key",
    key_prefix: "vak_prod_",
    created_at: "2024-01-10T12:00:00Z",
    last_used_at: "2024-01-15T09:30:00Z",
    expires_at: null,
    is_revoked: false,
  },
  {
    id: "key-2",
    name: "Development Key",
    key_prefix: "vak_dev_",
    created_at: "2024-01-05T08:00:00Z",
    last_used_at: null,
    expires_at: "2024-12-31T23:59:59Z",
    is_revoked: false,
  },
  {
    id: "key-3",
    name: "Old Revoked Key",
    key_prefix: "vak_old_",
    created_at: "2023-06-01T00:00:00Z",
    last_used_at: "2023-12-01T12:00:00Z",
    expires_at: null,
    is_revoked: true,
  },
];

const defaultMockHook = {
  keys: mockKeys,
  loading: false,
  error: null,
  lastUpdated: new Date("2024-01-15T12:00:00Z"),
  refreshKeys: mockRefreshKeys,
  createKey: mockCreateKey,
  revokeKey: mockRevokeKey,
};

describe("UserAPIKeyManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserAPIKeys).mockReturnValue(defaultMockHook);
    // Mock window.confirm
    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  describe("initial render", () => {
    it("renders the component with header", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("API Keys")).toBeInTheDocument();
      expect(
        screen.getByText("Manage keys for programmatic API access"),
      ).toBeInTheDocument();
    });

    it("renders control buttons", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("Refresh")).toBeInTheDocument();
      expect(screen.getByText("+ New Key")).toBeInTheDocument();
    });

    it("displays last updated time", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton when loading with no keys", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
        keys: [],
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("shows Refreshing... on button when loading with existing keys", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("Refreshing...")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no keys exist", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        keys: [],
        lastUpdated: null,
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("No API Keys")).toBeInTheDocument();
      expect(screen.getByText("Create Your First Key")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("displays error message when error is present", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        error: "Failed to load API keys",
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("Failed to load API keys")).toBeInTheDocument();
    });
  });

  describe("key display", () => {
    it("renders active keys section", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("Active Keys (2)")).toBeInTheDocument();
      expect(screen.getByText("Production API Key")).toBeInTheDocument();
      expect(screen.getByText("Development Key")).toBeInTheDocument();
    });

    it("renders revoked keys section", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("Revoked Keys (1)")).toBeInTheDocument();
      expect(screen.getByText("Old Revoked Key")).toBeInTheDocument();
    });

    it("displays key prefix", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("vak_prod_...")).toBeInTheDocument();
      expect(screen.getByText("vak_dev_...")).toBeInTheDocument();
    });

    it("shows Revoked badge on revoked keys", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("Revoked")).toBeInTheDocument();
    });

    it("shows Revoke button for active keys", () => {
      render(<UserAPIKeyManager />);

      const revokeButtons = screen.getAllByText("Revoke");
      expect(revokeButtons.length).toBe(2); // Two active keys
    });

    it("hides Revoke button for revoked keys", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        keys: [mockKeys[2]], // Only the revoked key
      });

      render(<UserAPIKeyManager />);

      // Revoked keys shouldn't have a Revoke button
      expect(screen.queryByText("Revoke")).not.toBeInTheDocument();
    });

    it("displays usage example when active keys exist", () => {
      render(<UserAPIKeyManager />);

      expect(screen.getByText("Usage")).toBeInTheDocument();
      expect(screen.getByText(/X-API-Key/)).toBeInTheDocument();
    });
  });

  describe("refresh functionality", () => {
    it("calls refreshKeys when Refresh button is clicked", async () => {
      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("Refresh"));

      expect(mockRefreshKeys).toHaveBeenCalledTimes(1);
    });

    it("disables refresh button when loading", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        loading: true,
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("Refreshing...")).toBeDisabled();
    });
  });

  describe("create key flow", () => {
    it("shows create form when + New Key button is clicked", async () => {
      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      expect(screen.getByText("Create New API Key")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/Development, Production/),
      ).toBeInTheDocument();
    });

    it("hides + New Key button when form is shown", async () => {
      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      expect(screen.queryByText("+ New Key")).not.toBeInTheDocument();
    });

    it("hides create form when Cancel is clicked", async () => {
      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));
      expect(screen.getByText("Create New API Key")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Cancel"));

      expect(screen.queryByText("Create New API Key")).not.toBeInTheDocument();
    });

    it("disables Create Key button when name is empty", async () => {
      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      expect(screen.getByText("Create Key")).toBeDisabled();
    });

    it("calls createKey when form is submitted", async () => {
      const mockCreatedKey = {
        id: "key-4",
        name: "New Test Key",
        key_prefix: "vak_test_",
        key: "vak_test_abcdef123456789",
        created_at: "2024-01-16T10:00:00Z",
        last_used_at: null,
        expires_at: null,
        is_revoked: false,
      };
      mockCreateKey.mockResolvedValueOnce(mockCreatedKey);

      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      const nameInput = screen.getByPlaceholderText(/Development, Production/);
      await userEvent.type(nameInput, "New Test Key");

      await userEvent.click(screen.getByText("Create Key"));

      await waitFor(() => {
        expect(mockCreateKey).toHaveBeenCalledWith("New Test Key", undefined);
      });
    });

    it("calls createKey with expiration when selected", async () => {
      const mockCreatedKey = {
        id: "key-4",
        name: "Expiring Key",
        key_prefix: "vak_exp_",
        key: "vak_exp_abcdef123456789",
        created_at: "2024-01-16T10:00:00Z",
        last_used_at: null,
        expires_at: "2024-04-16T10:00:00Z",
        is_revoked: false,
      };
      mockCreateKey.mockResolvedValueOnce(mockCreatedKey);

      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      const nameInput = screen.getByPlaceholderText(/Development, Production/);
      await userEvent.type(nameInput, "Expiring Key");

      const expirationSelect = screen.getByRole("combobox");
      await userEvent.selectOptions(expirationSelect, "90");

      await userEvent.click(screen.getByText("Create Key"));

      await waitFor(() => {
        expect(mockCreateKey).toHaveBeenCalledWith("Expiring Key", 90);
      });
    });

    it("shows created key with copy button after successful creation", async () => {
      const mockCreatedKey = {
        id: "key-4",
        name: "New Test Key",
        key_prefix: "vak_test_",
        key: "vak_test_abcdef123456789",
        created_at: "2024-01-16T10:00:00Z",
        last_used_at: null,
        expires_at: null,
        is_revoked: false,
      };
      mockCreateKey.mockResolvedValueOnce(mockCreatedKey);

      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      const nameInput = screen.getByPlaceholderText(/Development, Production/);
      await userEvent.type(nameInput, "New Test Key");

      await userEvent.click(screen.getByText("Create Key"));

      await waitFor(() => {
        expect(screen.getByText("API Key Created")).toBeInTheDocument();
      });

      expect(screen.getByText("vak_test_abcdef123456789")).toBeInTheDocument();
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText(/Save this key now/)).toBeInTheDocument();
    });

    it("shows error when creation fails", async () => {
      mockCreateKey.mockRejectedValueOnce(new Error("Rate limit exceeded"));

      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      const nameInput = screen.getByPlaceholderText(/Development, Production/);
      await userEvent.type(nameInput, "Test Key");

      await userEvent.click(screen.getByText("Create Key"));

      await waitFor(() => {
        expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
      });
    });
  });

  describe("revoke key flow", () => {
    it("calls revokeKey when Revoke button is clicked and confirmed", async () => {
      render(<UserAPIKeyManager />);

      const revokeButtons = screen.getAllByText("Revoke");
      await userEvent.click(revokeButtons[0]);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockRevokeKey).toHaveBeenCalledWith("key-1");
    });

    it("does not call revokeKey when confirmation is cancelled", async () => {
      vi.spyOn(window, "confirm").mockImplementationOnce(() => false);

      render(<UserAPIKeyManager />);

      const revokeButtons = screen.getAllByText("Revoke");
      await userEvent.click(revokeButtons[0]);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockRevokeKey).not.toHaveBeenCalled();
    });

    it("shows Revoking... while revoke is in progress", async () => {
      let resolveRevoke: () => void;
      const revokePromise = new Promise<void>((resolve) => {
        resolveRevoke = resolve;
      });
      mockRevokeKey.mockReturnValueOnce(revokePromise);

      render(<UserAPIKeyManager />);

      const revokeButtons = screen.getAllByText("Revoke");
      await userEvent.click(revokeButtons[0]);

      expect(screen.getByText("Revoking...")).toBeInTheDocument();

      resolveRevoke!();
      await waitFor(() => {
        expect(screen.queryByText("Revoking...")).not.toBeInTheDocument();
      });
    });
  });

  describe("expired keys", () => {
    it("shows Expired badge on expired keys", () => {
      vi.mocked(useUserAPIKeys).mockReturnValue({
        ...defaultMockHook,
        keys: [
          {
            id: "key-expired",
            name: "Expired Key",
            key_prefix: "vak_exp_",
            created_at: "2023-01-01T00:00:00Z",
            last_used_at: null,
            expires_at: "2023-06-01T00:00:00Z", // Past date
            is_revoked: false,
          },
        ],
      });

      render(<UserAPIKeyManager />);

      expect(screen.getByText("Expired")).toBeInTheDocument();
    });
  });

  describe("copy functionality", () => {
    it("copies key to clipboard when Copy button is clicked", async () => {
      const mockCreatedKey = {
        id: "key-4",
        name: "Test Key",
        key_prefix: "vak_test_",
        key: "vak_test_secret_key_123",
        created_at: "2024-01-16T10:00:00Z",
        last_used_at: null,
        expires_at: null,
        is_revoked: false,
      };
      mockCreateKey.mockResolvedValueOnce(mockCreatedKey);

      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      render(<UserAPIKeyManager />);

      await userEvent.click(screen.getByText("+ New Key"));

      const nameInput = screen.getByPlaceholderText(/Development, Production/);
      await userEvent.type(nameInput, "Test Key");

      await userEvent.click(screen.getByText("Create Key"));

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Copy"));

      expect(mockWriteText).toHaveBeenCalledWith("vak_test_secret_key_123");

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });
  });
});
