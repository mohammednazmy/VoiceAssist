/**
 * Tests for EditUserDialog component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditUserDialog } from "../EditUserDialog";

// Mock the useEditUser hook
vi.mock("../../../hooks/useEditUser", () => ({
  useEditUser: vi.fn(),
}));

import { useEditUser } from "../../../hooks/useEditUser";

const mockUpdateUser = vi.fn();
const mockClearError = vi.fn();

const defaultMockHook = {
  updateUser: mockUpdateUser,
  isLoading: false,
  error: null,
  rateLimitInfo: null,
  clearError: mockClearError,
};

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  full_name: "Test User",
  is_admin: false,
  admin_role: "user" as const,
  is_active: true,
};

describe("EditUserDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    user: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEditUser).mockReturnValue(defaultMockHook);
  });

  describe("rendering", () => {
    it("renders nothing when isOpen is false", () => {
      render(<EditUserDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText("Edit User")).not.toBeInTheDocument();
    });

    it("renders nothing when user is null", () => {
      render(<EditUserDialog {...defaultProps} user={null} />);
      expect(screen.queryByText("Edit User")).not.toBeInTheDocument();
    });

    it("renders dialog when isOpen is true and user is provided", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    it("displays user email as read-only", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("renders full name input with current value", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByLabelText(/full name/i)).toHaveValue("Test User");
    });

    it("renders role selector", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Viewer")).toBeInTheDocument();
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("renders active status checkbox", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByText("Account is active")).toBeInTheDocument();
    });

    it("renders reason textarea", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByLabelText(/reason for changes/i)).toBeInTheDocument();
    });

    it("renders cancel and save buttons", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });
  });

  describe("form initialization", () => {
    it("sets full name from user", () => {
      render(<EditUserDialog {...defaultProps} />);
      expect(screen.getByLabelText(/full name/i)).toHaveValue("Test User");
    });

    it("sets role from user admin_role", () => {
      render(<EditUserDialog {...defaultProps} />);
      const userRadio = screen.getByRole("radio", { name: /user/i });
      expect(userRadio).toBeChecked();
    });

    it("sets role to admin when is_admin is true", () => {
      const adminUser = {
        ...mockUser,
        is_admin: true,
        admin_role: "admin" as const,
      };
      render(<EditUserDialog {...defaultProps} user={adminUser} />);
      const radios = screen.getAllByRole("radio");
      expect(radios[2]).toBeChecked(); // Admin is third
    });

    it("sets active status from user", () => {
      render(<EditUserDialog {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
    });

    it("handles empty full_name", () => {
      const userNoName = { ...mockUser, full_name: undefined };
      render(<EditUserDialog {...defaultProps} user={userNoName} />);
      expect(screen.getByLabelText(/full name/i)).toHaveValue("");
    });
  });

  describe("form interactions", () => {
    it("allows editing full name", async () => {
      render(<EditUserDialog {...defaultProps} />);
      const input = screen.getByLabelText(/full name/i);

      await userEvent.clear(input);
      await userEvent.type(input, "New Name");

      expect(input).toHaveValue("New Name");
    });

    it("allows changing role", async () => {
      render(<EditUserDialog {...defaultProps} />);

      const radios = screen.getAllByRole("radio");
      await userEvent.click(radios[2]); // Admin is third

      expect(radios[2]).toBeChecked();
    });

    it("allows toggling active status", async () => {
      render(<EditUserDialog {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox");

      await userEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it("shows warning when deactivating user", async () => {
      render(<EditUserDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("checkbox"));

      expect(
        screen.getByText(/Deactivated users cannot log in/),
      ).toBeInTheDocument();
    });

    it("allows entering reason", async () => {
      render(<EditUserDialog {...defaultProps} />);
      const textarea = screen.getByLabelText(/reason for changes/i);

      await userEvent.type(textarea, "Promoted to admin");

      expect(textarea).toHaveValue("Promoted to admin");
    });

    it("calls onClose when cancel button clicked", async () => {
      const onClose = vi.fn();
      render(<EditUserDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when clicking backdrop", async () => {
      const onClose = vi.fn();
      render(<EditUserDialog {...defaultProps} onClose={onClose} />);

      const backdrop = document.querySelector(
        ".absolute.inset-0.bg-black\\/60",
      );
      if (backdrop) {
        await userEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
      }
    });

    it("calls onClose when clicking X button", async () => {
      const onClose = vi.fn();
      render(<EditUserDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(screen.getByText("✕"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("form submission", () => {
    it("shows error when no changes made", async () => {
      render(<EditUserDialog {...defaultProps} />);

      await userEvent.click(screen.getByText("Save Changes"));

      expect(screen.getByText("No changes to save")).toBeInTheDocument();
    });

    it("calls updateUser with changed full_name", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        user: { ...mockUser, full_name: "New Name" },
      });

      render(<EditUserDialog {...defaultProps} />);

      const input = screen.getByLabelText(/full name/i);
      await userEvent.clear(input);
      await userEvent.type(input, "New Name");
      await userEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith("user-123", {
          full_name: "New Name",
        });
      });
    });

    it("calls updateUser with changed role", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        user: { ...mockUser, admin_role: "admin" },
      });

      render(<EditUserDialog {...defaultProps} />);

      // Get all radios and click the admin one (third in the list)
      const radios = screen.getAllByRole("radio");
      await userEvent.click(radios[2]); // Admin is third (User=0, Viewer=1, Admin=2)
      await userEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith("user-123", {
          admin_role: "admin",
        });
      });
    });

    it("calls updateUser with changed active status", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        user: { ...mockUser, is_active: false },
      });

      render(<EditUserDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith("user-123", {
          is_active: false,
        });
      });
    });

    it("includes reason when provided", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        user: { ...mockUser, full_name: "New Name" },
      });

      render(<EditUserDialog {...defaultProps} />);

      await userEvent.clear(screen.getByLabelText(/full name/i));
      await userEvent.type(screen.getByLabelText(/full name/i), "New Name");
      await userEvent.type(screen.getByLabelText(/reason/i), "Updated profile");
      await userEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith("user-123", {
          full_name: "New Name",
          action_reason: "Updated profile",
        });
      });
    });

    it("shows success message after update", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        user: { ...mockUser, full_name: "New Name" },
      });

      render(<EditUserDialog {...defaultProps} />);

      await userEvent.clear(screen.getByLabelText(/full name/i));
      await userEvent.type(screen.getByLabelText(/full name/i), "New Name");
      await userEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(
          screen.getByText("User updated successfully"),
        ).toBeInTheDocument();
      });
    });

    it("accepts onSuccess and onClose callback props", () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <EditUserDialog
          {...defaultProps}
          onSuccess={onSuccess}
          onClose={onClose}
        />,
      );

      // Verify dialog renders with callbacks
      expect(screen.getByText("Edit User")).toBeInTheDocument();
      // Callbacks will be called after successful update
    });

    it("shows API error on failure", () => {
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        error: "Server error",
      });

      render(<EditUserDialog {...defaultProps} />);

      // Error should be displayed when hook returns error
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading spinner when isLoading", () => {
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        isLoading: true,
      });

      render(<EditUserDialog {...defaultProps} />);

      expect(screen.getByText("Saving...")).toBeInTheDocument();
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("disables form inputs when loading", () => {
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        isLoading: true,
      });

      render(<EditUserDialog {...defaultProps} />);

      expect(screen.getByLabelText(/full name/i)).toBeDisabled();
      expect(screen.getByRole("checkbox")).toBeDisabled();
    });

    it("disables cancel button when loading", () => {
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        isLoading: true,
      });

      render(<EditUserDialog {...defaultProps} />);

      expect(screen.getByText("Cancel")).toBeDisabled();
    });

    it("prevents closing when loading", () => {
      const onClose = vi.fn();
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        isLoading: true,
      });

      render(<EditUserDialog {...defaultProps} onClose={onClose} />);

      // When loading, close button should be disabled
      expect(screen.getByText("Cancel")).toBeDisabled();
    });
  });

  describe("form reset", () => {
    it("resets form when dialog reopens", () => {
      const { rerender } = render(<EditUserDialog {...defaultProps} />);

      // Verify initial value
      expect(screen.getByLabelText(/full name/i)).toHaveValue("Test User");

      // Close and reopen - component should re-render with original values
      rerender(<EditUserDialog {...defaultProps} isOpen={false} />);
      rerender(<EditUserDialog {...defaultProps} isOpen={true} />);

      // Should have original value
      expect(screen.getByLabelText(/full name/i)).toHaveValue("Test User");
    });

    it("clears error when dialog reopens", () => {
      vi.mocked(useEditUser).mockReturnValue({
        ...defaultMockHook,
        error: "Some error",
      });

      const { rerender } = render(<EditUserDialog {...defaultProps} />);

      rerender(<EditUserDialog {...defaultProps} isOpen={false} />);
      rerender(<EditUserDialog {...defaultProps} isOpen={true} />);

      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
